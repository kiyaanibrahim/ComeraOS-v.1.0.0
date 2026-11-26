-- Idempotent journal posting. One source event posts once.

create or replace function private.account_by_code(p_business_id uuid, p_code text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select account.id into v_id
  from public.accounts as account
  where account.business_id = p_business_id
    and account.code = p_code;
  if v_id is null then
    perform private.seed_finance_accounts(p_business_id);
    select account.id into v_id
    from public.accounts as account
    where account.business_id = p_business_id
      and account.code = p_code;
  end if;
  if v_id is null then
    raise exception 'Account % is missing for this business', p_code;
  end if;
  return v_id;
end;
$$;

revoke all on function private.account_by_code(uuid, text) from public, anon;

create or replace function private.post_journal(
  p_business_id uuid,
  p_entry_date date,
  p_memo text,
  p_source_type text,
  p_source_id uuid,
  p_event text,
  p_lines jsonb,
  p_location_id uuid default null,
  p_register_id uuid default null,
  p_register_session_id uuid default null,
  p_reverses_entry_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing uuid;
  v_entry uuid;
  v_line jsonb;
  v_account uuid;
  v_debit numeric(14, 2);
  v_credit numeric(14, 2);
  v_sum_debit numeric(14, 2) := 0;
  v_sum_credit numeric(14, 2) := 0;
begin
  if p_source_type is not null and p_source_id is not null and p_event is not null then
    select entry.id into v_existing
    from public.journal_entries as entry
    where entry.business_id = p_business_id
      and entry.source_type = p_source_type
      and entry.source_id = p_source_id
      and entry.event = p_event;
    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Journal lines are required';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_debit := round(coalesce((v_line->>'debit')::numeric, 0), 2);
    v_credit := round(coalesce((v_line->>'credit')::numeric, 0), 2);
    if v_debit < 0 or v_credit < 0 then
      raise exception 'Debit and credit must be non-negative';
    end if;
    if (v_debit = 0 and v_credit = 0) or (v_debit > 0 and v_credit > 0) then
      raise exception 'Each journal line needs a debit or a credit';
    end if;
    v_sum_debit := v_sum_debit + v_debit;
    v_sum_credit := v_sum_credit + v_credit;
  end loop;

  if v_sum_debit <> v_sum_credit then
    raise exception 'Journal is out of balance (% vs %)', v_sum_debit, v_sum_credit;
  end if;
  if v_sum_debit = 0 then
    return null;
  end if;

  insert into public.journal_entries (
    business_id, entry_date, memo, posted, created_by,
    source_type, source_id, event, reverses_entry_id,
    location_id, register_id, register_session_id
  ) values (
    p_business_id, coalesce(p_entry_date, current_date), nullif(btrim(coalesce(p_memo, '')), ''), true, auth.uid(),
    p_source_type, p_source_id, p_event, p_reverses_entry_id,
    p_location_id, p_register_id, p_register_session_id
  ) returning id into v_entry;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_account := coalesce(
      (v_line->>'account_id')::uuid,
      case when v_line ? 'account_code' then private.account_by_code(p_business_id, v_line->>'account_code') else null end
    );
    if v_account is null then
      raise exception 'Journal line is missing an account';
    end if;
    v_debit := round(coalesce((v_line->>'debit')::numeric, 0), 2);
    v_credit := round(coalesce((v_line->>'credit')::numeric, 0), 2);
    if v_debit = 0 and v_credit = 0 then
      continue;
    end if;
    insert into public.journal_lines (business_id, entry_id, account_id, debit, credit)
    values (p_business_id, v_entry, v_account, v_debit, v_credit);
  end loop;

  return v_entry;
exception
  when unique_violation then
    select entry.id into v_existing
    from public.journal_entries as entry
    where entry.business_id = p_business_id
      and entry.source_type = p_source_type
      and entry.source_id = p_source_id
      and entry.event = p_event;
    return v_existing;
end;
$$;

revoke all on function private.post_journal(uuid, date, text, text, uuid, text, jsonb, uuid, uuid, uuid, uuid) from public, anon;

create or replace function private.cash_account_code(p_method text)
returns text
language sql
immutable
as $$
  select case when lower(coalesce(p_method, 'cash')) in ('card', 'bank_transfer', 'bank') then '1010' else '1000' end;
$$;

create or replace function private.post_completed_sale(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_lines jsonb := '[]'::jsonb;
  v_cogs numeric(14, 2) := 0;
  v_net numeric(14, 2);
  v_cash_code text;
begin
  select sale.* into v_order from public.orders as sale where sale.id = p_order_id;
  if not found or v_order.status <> 'completed' then
    return null;
  end if;

  select payment.* into v_payment
  from public.payments as payment
  where payment.order_id = p_order_id
    and payment.business_id = v_order.business_id
    and payment.status = 'succeeded'
  order by payment.created_at
  limit 1;

  if not found then
    return null;
  end if;

  select coalesce(sum(round(line.quantity * coalesce(product.cost, 0), 2)), 0)
  into v_cogs
  from public.order_lines as line
  left join public.products as product
    on product.id = line.product_id
   and product.business_id = line.business_id
  where line.order_id = p_order_id
    and line.business_id = v_order.business_id;

  v_net := round(coalesce(v_order.total, 0) - coalesce(v_order.tax, 0), 2);
  v_cash_code := private.cash_account_code(v_payment.method);

  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', v_cash_code, 'debit', v_order.total, 'credit', 0),
    jsonb_build_object('account_code', '4000', 'debit', 0, 'credit', greatest(v_net, 0))
  );
  if coalesce(v_order.tax, 0) > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', '2200', 'debit', 0, 'credit', v_order.tax)
    );
  end if;
  if v_cogs > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', '5100', 'debit', v_cogs, 'credit', 0),
      jsonb_build_object('account_code', '1200', 'debit', 0, 'credit', v_cogs)
    );
  end if;

  return private.post_journal(
    v_order.business_id,
    v_order.created_at::date,
    'Sale ' || v_order.number,
    'order',
    v_order.id,
    'sale_paid',
    v_lines,
    v_order.location_id,
    v_order.register_id,
    v_order.register_session_id
  );
end;
$$;

revoke all on function private.post_completed_sale(uuid) from public, anon;

create or replace function private.post_issued_bill(p_bill_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill public.bills%rowtype;
  v_order public.orders%rowtype;
  v_lines jsonb;
  v_net numeric(14, 2);
begin
  select bill.* into v_bill from public.bills as bill where bill.id = p_bill_id;
  if not found or v_bill.status <> 'issued' then
    return null;
  end if;

  if exists (
    select 1 from public.payments as payment
    where payment.bill_id = p_bill_id
      and payment.status = 'succeeded'
  ) then
    return null;
  end if;

  select sale.* into v_order from public.orders as sale where sale.id = v_bill.order_id;
  v_net := round(coalesce(v_bill.total, 0) - coalesce(v_bill.tax, 0), 2);
  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', '1100', 'debit', v_bill.total, 'credit', 0),
    jsonb_build_object('account_code', '4000', 'debit', 0, 'credit', greatest(v_net, 0))
  );
  if coalesce(v_bill.tax, 0) > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', '2200', 'debit', 0, 'credit', v_bill.tax)
    );
  end if;

  return private.post_journal(
    v_bill.business_id,
    coalesce(v_bill.issued_at::date, current_date),
    'Invoice ' || v_bill.number,
    'bill',
    v_bill.id,
    'sale_issued',
    v_lines,
    case when found then v_order.location_id else null end,
    case when found then v_order.register_id else null end,
    case when found then v_order.register_session_id else null end
  );
end;
$$;

revoke all on function private.post_issued_bill(uuid) from public, anon;

create or replace function private.post_customer_payment(p_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_bill public.bills%rowtype;
  v_cash_code text;
begin
  select payment.* into v_payment from public.payments as payment where payment.id = p_payment_id;
  if not found or v_payment.status <> 'succeeded' then
    return null;
  end if;

  -- POS completed sales are posted by post_completed_sale.
  if v_payment.order_id is not null and exists (
    select 1 from public.orders as sale
    where sale.id = v_payment.order_id and sale.status = 'completed'
  ) then
    return private.post_completed_sale(v_payment.order_id);
  end if;

  if v_payment.bill_id is null then
    return null;
  end if;

  select bill.* into v_bill from public.bills as bill where bill.id = v_payment.bill_id;
  if not found then
    return null;
  end if;

  v_cash_code := private.cash_account_code(v_payment.method);
  return private.post_journal(
    v_payment.business_id,
    v_payment.created_at::date,
    'Payment ' || coalesce(v_payment.external_ref, v_payment.id::text),
    'payment',
    v_payment.id,
    'customer_receipt',
    jsonb_build_array(
      jsonb_build_object('account_code', v_cash_code, 'debit', v_payment.amount, 'credit', 0),
      jsonb_build_object('account_code', '1100', 'debit', 0, 'credit', v_payment.amount)
    ),
    null,
    null,
    v_payment.register_session_id
  );
end;
$$;

revoke all on function private.post_customer_payment(uuid) from public, anon;

create or replace function private.post_sale_return(p_return_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_return public.sale_returns%rowtype;
  v_order public.orders%rowtype;
  v_method text;
  v_cogs numeric(14, 2) := 0;
  v_tax numeric(14, 2) := 0;
  v_net numeric(14, 2);
  v_cash_code text;
  v_lines jsonb;
begin
  select ret.* into v_return from public.sale_returns as ret where ret.id = p_return_id;
  if not found then
    return null;
  end if;

  select sale.* into v_order from public.orders as sale where sale.id = v_return.order_id;
  select payment.method into v_method
  from public.payments as payment
  where payment.order_id = v_return.order_id
    and payment.status in ('succeeded', 'refunded')
  order by payment.created_at
  limit 1;

  select coalesce(sum(round(line.quantity * coalesce(product.cost, 0), 2)), 0),
         coalesce(sum(round(line.line_total * coalesce(v_order.tax, 0) / nullif(v_order.subtotal, 0), 2)), 0)
  into v_cogs, v_tax
  from public.sale_return_lines as line
  left join public.products as product
    on product.id = line.product_id
   and product.business_id = line.business_id
  where line.return_id = p_return_id;

  v_net := round(coalesce(v_return.amount, 0) - coalesce(v_tax, 0), 2);
  v_cash_code := private.cash_account_code(v_method);
  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', '4000', 'debit', greatest(v_net, 0), 'credit', 0),
    jsonb_build_object('account_code', v_cash_code, 'debit', 0, 'credit', v_return.amount)
  );
  if v_tax > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', '2200', 'debit', v_tax, 'credit', 0)
    );
  end if;
  if v_cogs > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', '1200', 'debit', v_cogs, 'credit', 0),
      jsonb_build_object('account_code', '5100', 'debit', 0, 'credit', v_cogs)
    );
  end if;

  return private.post_journal(
    v_return.business_id,
    v_return.created_at::date,
    'Return ' || coalesce(v_return.number, v_return.id::text),
    'sale_return',
    v_return.id,
    'sale_refund',
    v_lines,
    case when found then v_order.location_id else null end,
    case when found then v_order.register_id else null end,
    case when found then v_order.register_session_id else null end
  );
end;
$$;

revoke all on function private.post_sale_return(uuid) from public, anon;

create or replace function private.post_shipment_receipt(p_shipment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shipment public.shipments%rowtype;
  v_inventory numeric(14, 2) := 0;
  v_assets numeric(14, 2) := 0;
  v_input_tax numeric(14, 2) := 0;
  v_payable numeric(14, 2) := 0;
  v_lines jsonb := '[]'::jsonb;
  v_line record;
  v_asset_id uuid;
begin
  select shipment.* into v_shipment from public.shipments as shipment where shipment.id = p_shipment_id;
  if not found or v_shipment.status <> 'delivered' or v_shipment.direction <> 'inbound' then
    return null;
  end if;

  for v_line in
    select
      line.id,
      line.product_id,
      line.description,
      line.quantity_received,
      line.unit_landing_cost,
      line.line_landing_total,
      line.capitalize,
      product.name as product_name
    from public.shipment_lines as line
    left join public.products as product
      on product.id = line.product_id
     and product.business_id = line.business_id
    where line.shipment_id = p_shipment_id
      and line.business_id = v_shipment.business_id
      and line.quantity_received > 0
  loop
    if v_line.capitalize then
      v_assets := v_assets + round(coalesce(nullif(v_line.line_landing_total, 0), v_line.quantity_received * v_line.unit_landing_cost), 2);
      insert into public.fixed_assets (
        business_id, name, category, acquisition_cost, acquired_on, location_id,
        shipment_id, shipment_line_id, created_by
      ) values (
        v_shipment.business_id,
        coalesce(v_line.product_name, v_line.description, 'Fixed asset'),
        'equipment',
        round(coalesce(nullif(v_line.line_landing_total, 0), v_line.quantity_received * v_line.unit_landing_cost), 2),
        current_date,
        v_shipment.location_id,
        p_shipment_id,
        v_line.id,
        auth.uid()
      )
      on conflict do nothing
      returning id into v_asset_id;
    else
      v_inventory := v_inventory + round(coalesce(nullif(v_line.line_landing_total, 0), v_line.quantity_received * v_line.unit_landing_cost), 2);
    end if;
  end loop;

  select coalesce(sum(charge.amount), 0)
  into v_input_tax
  from public.shipment_charges as charge
  where charge.shipment_id = p_shipment_id
    and charge.business_id = v_shipment.business_id
    and charge.kind = 'tax';

  v_payable := round(coalesce(v_shipment.landing_total, v_inventory + v_assets), 2);
  if v_payable <= 0 then
    v_payable := round(v_inventory + v_assets + v_input_tax, 2);
  end if;

  if v_inventory > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', '1200', 'debit', v_inventory, 'credit', 0)
    );
  end if;
  if v_assets > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', '1500', 'debit', v_assets, 'credit', 0)
    );
  end if;
  if v_input_tax > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', '1300', 'debit', v_input_tax, 'credit', 0)
    );
  end if;
  if v_payable > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', '2000', 'debit', 0, 'credit', v_payable)
    );
  end if;

  -- Balance residual into AP if tax was already inside landing_total.
  if v_inventory + v_assets + v_input_tax <> v_payable and jsonb_array_length(v_lines) > 0 then
    v_lines := jsonb_build_array();
    if v_inventory > 0 then
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_code', '1200', 'debit', v_inventory, 'credit', 0));
    end if;
    if v_assets > 0 then
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_code', '1500', 'debit', v_assets, 'credit', 0));
    end if;
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', '2000', 'debit', 0, 'credit', round(v_inventory + v_assets, 2))
    );
  end if;

  return private.post_journal(
    v_shipment.business_id,
    coalesce(v_shipment.updated_at::date, current_date),
    'Receipt ' || coalesce(v_shipment.reference, v_shipment.id::text),
    'shipment',
    v_shipment.id,
    'receipt',
    v_lines,
    v_shipment.location_id
  );
end;
$$;

revoke all on function private.post_shipment_receipt(uuid) from public, anon;

create or replace function private.post_inventory_adjustment(
  p_business_id uuid,
  p_movement_id uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_move public.inventory_movements%rowtype;
  v_cost numeric(14, 2);
  v_amount numeric(14, 2);
  v_lines jsonb;
begin
  select move.* into v_move from public.inventory_movements as move where move.id = p_movement_id;
  if not found or v_move.business_id <> p_business_id then
    return null;
  end if;
  if v_move.reason not in ('adjustment', 'stock_adjustment') then
    return null;
  end if;

  select coalesce(product.cost, 0) into v_cost
  from public.products as product
  where product.id = v_move.product_id and product.business_id = p_business_id;

  v_amount := round(abs(v_move.quantity) * v_cost, 2);
  if v_amount = 0 then
    return null;
  end if;

  if v_move.quantity > 0 then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', '1200', 'debit', v_amount, 'credit', 0),
      jsonb_build_object('account_code', '5500', 'debit', 0, 'credit', v_amount)
    );
  else
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', '5500', 'debit', v_amount, 'credit', 0),
      jsonb_build_object('account_code', '1200', 'debit', 0, 'credit', v_amount)
    );
  end if;

  return private.post_journal(
    p_business_id,
    v_move.created_at::date,
    'Stock adjustment',
    'inventory_movement',
    v_move.id,
    'adjustment',
    v_lines,
    v_move.location_id
  );
end;
$$;

revoke all on function private.post_inventory_adjustment(uuid, uuid) from public, anon;

-- Triggers: one source event → one journal.
create or replace function private.trg_finance_payment_ai()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'succeeded' then
    perform private.post_customer_payment(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists payments_finance_post on public.payments;
create trigger payments_finance_post
  after insert on public.payments
  for each row execute function private.trg_finance_payment_ai();

create or replace function private.trg_finance_bill_ai()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'issued' then
    perform private.post_issued_bill(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists bills_finance_post on public.bills;
create trigger bills_finance_post
  after insert on public.bills
  for each row execute function private.trg_finance_bill_ai();

create or replace function private.trg_finance_sale_return_ai()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.post_sale_return(new.id);
  return new;
end;
$$;

drop trigger if exists sale_returns_finance_post on public.sale_returns;
create trigger sale_returns_finance_post
  after insert on public.sale_returns
  for each row execute function private.trg_finance_sale_return_ai();

create or replace function private.trg_finance_shipment_au()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    perform private.post_shipment_receipt(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists shipments_finance_post on public.shipments;
create trigger shipments_finance_post
  after update of status on public.shipments
  for each row execute function private.trg_finance_shipment_au();

create or replace function private.trg_finance_inventory_ai()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reason in ('adjustment', 'stock_adjustment') then
    perform private.post_inventory_adjustment(new.business_id, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_movements_finance_post on public.inventory_movements;
create trigger inventory_movements_finance_post
  after insert on public.inventory_movements
  for each row execute function private.trg_finance_inventory_ai();

-- Backfill existing activity once.
do $$
declare
  r record;
begin
  for r in
    select sale.id
    from public.orders as sale
    where sale.status = 'completed'
  loop
    perform private.post_completed_sale(r.id);
  end loop;

  for r in
    select bill.id
    from public.bills as bill
    where bill.status = 'issued'
  loop
    perform private.post_issued_bill(r.id);
  end loop;

  for r in
    select ret.id from public.sale_returns as ret
  loop
    perform private.post_sale_return(r.id);
  end loop;

  for r in
    select shipment.id
    from public.shipments as shipment
    where shipment.status = 'delivered'
      and shipment.direction = 'inbound'
  loop
    perform private.post_shipment_receipt(r.id);
  end loop;
end $$;
