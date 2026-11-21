-- One open session per register stays with the person who opened it.

alter table public.register_sessions
  add column if not exists session_number integer,
  add column if not exists closed_by uuid,
  add column if not exists force_closed boolean not null default false;

with numbered as (
  select id, row_number() over (partition by business_id order by opened_at, id) as n
  from public.register_sessions
  where session_number is null
)
update public.register_sessions as session
set session_number = numbered.n
from numbered
where session.id = numbered.id
  and session.session_number is null;

create unique index if not exists register_sessions_business_number_idx
  on public.register_sessions (business_id, session_number);

do $table$
begin
  create table public.register_cash_moves (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id),
  register_session_id uuid not null,
  kind text not null check (kind in ('in', 'out')),
  amount numeric(14, 2) not null check (amount > 0),
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (id, business_id),
  foreign key (register_session_id, business_id)
    references public.register_sessions (id, business_id)
);
exception
  when duplicate_table then null;
end
$table$;

create index if not exists register_cash_moves_business_id_idx
  on public.register_cash_moves (business_id);
create index if not exists register_cash_moves_session_idx
  on public.register_cash_moves (register_session_id);

do $guard$
begin
  if not exists (
    select 1
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'register_cash_moves'
      and relation.relrowsecurity
  ) then
    perform private.apply_business_access('public.register_cash_moves'::regclass, 'staff');
  end if;
end
$guard$;

create or replace function private.open_register_session(
  p_business_id uuid,
  p_register_id uuid,
  p_opening_cash numeric,
  p_opening_count jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_session public.register_sessions%rowtype;
  v_cash numeric(14, 2) := coalesce(p_opening_cash, 0);
  v_number integer;
begin
  if not (private.is_business_member(p_business_id) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;
  if v_cash < 0 then
    raise exception 'Opening cash cannot be negative';
  end if;
  if not exists (
    select 1 from public.registers as register
    where register.id = p_register_id
      and register.business_id = p_business_id
      and register.status = 'active'
  ) then
    raise exception 'Choose an active register';
  end if;

  select session.* into v_session
  from public.register_sessions as session
  where session.register_id = p_register_id
    and session.business_id = p_business_id
    and session.status = 'open'
  limit 1;

  if found then
    if v_session.opened_by is distinct from auth.uid() then
      raise exception 'This register is already open';
    end if;
    return jsonb_build_object(
      'id', v_session.id,
      'register_id', v_session.register_id,
      'opening_cash', v_session.opening_cash,
      'opened_at', v_session.opened_at,
      'status', v_session.status,
      'session_number', v_session.session_number,
      'resumed', true
    );
  end if;

  perform 1 from public.businesses as business where business.id = p_business_id for update;
  select coalesce(max(session.session_number), 0) + 1 into v_number
  from public.register_sessions as session
  where session.business_id = p_business_id;

  insert into public.register_sessions (
    business_id, register_id, opened_by, opening_cash, opening_count, status, session_number
  ) values (
    p_business_id, p_register_id, auth.uid(), v_cash, coalesce(p_opening_count, '{}'::jsonb), 'open', v_number
  )
  returning * into v_session;

  insert into public.audit_events (business_id, actor_id, action, entity, entity_id, payload)
  values (
    p_business_id, auth.uid(), 'pos.register.open', 'register_sessions', v_session.id,
    jsonb_build_object('register_id', p_register_id, 'opening_cash', v_cash, 'session_number', v_number)
  );

  return jsonb_build_object(
    'id', v_session.id,
    'register_id', v_session.register_id,
    'opening_cash', v_session.opening_cash,
    'opened_at', v_session.opened_at,
    'status', v_session.status,
    'session_number', v_session.session_number,
    'resumed', false
  );
end;
$fn$;

create or replace function private.close_register_session(
  p_business_id uuid,
  p_session_id uuid,
  p_counted_cash numeric,
  p_closing_count jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_session public.register_sessions%rowtype;
  v_cash_sales numeric(14, 2) := 0;
  v_card_sales numeric(14, 2) := 0;
  v_bank_sales numeric(14, 2) := 0;
  v_sale_count integer := 0;
  v_moves numeric(14, 2) := 0;
  v_expected numeric(14, 2);
  v_counted numeric(14, 2) := coalesce(p_counted_cash, 0);
  v_diff numeric(14, 2);
begin
  if not (private.is_business_member(p_business_id) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;
  if v_counted < 0 then
    raise exception 'Counted cash cannot be negative';
  end if;

  select session.* into v_session
  from public.register_sessions as session
  where session.id = p_session_id and session.business_id = p_business_id
  for update;
  if not found then
    raise exception 'Register session not found';
  end if;
  if v_session.status <> 'open' then
    raise exception 'This register session is already closed';
  end if;
  if v_session.opened_by is distinct from auth.uid()
     and not (private.is_business_admin(p_business_id) or private.is_platform_operator()) then
    raise exception 'Only the person who opened this register can close it';
  end if;

  select
    coalesce(sum(payment.amount) filter (where payment.method = 'cash'), 0),
    coalesce(sum(payment.amount) filter (where payment.method = 'card'), 0),
    coalesce(sum(payment.amount) filter (where payment.method = 'bank_transfer'), 0),
    count(*)::integer
  into v_cash_sales, v_card_sales, v_bank_sales, v_sale_count
  from public.payments as payment
  where payment.business_id = p_business_id
    and payment.register_session_id = p_session_id
    and payment.status = 'succeeded';

  select coalesce(sum(case when move.kind = 'in' then move.amount else -move.amount end), 0)
  into v_moves
  from public.register_cash_moves as move
  where move.business_id = p_business_id and move.register_session_id = p_session_id;

  v_expected := round(v_session.opening_cash + v_cash_sales + v_moves, 2);
  v_diff := round(v_counted - v_expected, 2);

  update public.register_sessions as session
  set status = 'closed',
      closed_at = now(),
      closed_by = auth.uid(),
      force_closed = false,
      closing_cash = v_counted,
      closing_count = coalesce(p_closing_count, '{}'::jsonb),
      expected_cash = v_expected,
      counted_cash = v_counted,
      cash_difference = v_diff
  where session.id = v_session.id
  returning * into v_session;

  insert into public.audit_events (business_id, actor_id, action, entity, entity_id, payload)
  values (
    p_business_id, auth.uid(), 'pos.register.close', 'register_sessions', v_session.id,
    jsonb_build_object(
      'opening_cash', v_session.opening_cash,
      'cash_sales', v_cash_sales,
      'card_sales', v_card_sales,
      'bank_transfer_sales', v_bank_sales,
      'cash_moves', v_moves,
      'sale_count', v_sale_count,
      'expected_cash', v_expected,
      'counted_cash', v_counted,
      'cash_difference', v_diff
    )
  );

  return jsonb_build_object(
    'id', v_session.id,
    'status', v_session.status,
    'opening_cash', v_session.opening_cash,
    'cash_sales', v_cash_sales,
    'card_sales', v_card_sales,
    'bank_transfer_sales', v_bank_sales,
    'sale_count', v_sale_count,
    'expected_cash', v_expected,
    'counted_cash', v_counted,
    'cash_difference', v_diff,
    'closed_at', v_session.closed_at
  );
end;
$fn$;

create or replace function private.force_close_register_session(
  p_business_id uuid,
  p_session_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_session public.register_sessions%rowtype;
begin
  if not (private.is_business_member(p_business_id) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;
  select session.* into v_session
  from public.register_sessions as session
  where session.id = p_session_id and session.business_id = p_business_id
  for update;
  if not found then
    raise exception 'Register session not found';
  end if;
  if v_session.status <> 'open' then
    raise exception 'This register session is already closed';
  end if;
  if v_session.opened_by is distinct from auth.uid()
     and not (private.is_business_admin(p_business_id) or private.is_platform_operator()) then
    raise exception 'Only the person who opened this register can force close it';
  end if;
  update public.register_sessions as session
  set status = 'closed',
      closed_at = now(),
      closed_by = auth.uid(),
      force_closed = true
  where session.id = v_session.id
  returning * into v_session;
  insert into public.audit_events (business_id, actor_id, action, entity, entity_id, payload)
  values (
    p_business_id, auth.uid(), 'pos.register.force_close', 'register_sessions', v_session.id,
    jsonb_build_object('force_closed', true)
  );
  return jsonb_build_object('id', v_session.id, 'status', v_session.status, 'force_closed', true, 'closed_at', v_session.closed_at);
end;
$fn$;

create or replace function public.force_close_register_session(p_business_id uuid, p_session_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  return private.force_close_register_session(p_business_id, p_session_id);
end;
$fn$;

revoke all on function private.force_close_register_session(uuid, uuid) from public, anon;
grant execute on function private.force_close_register_session(uuid, uuid) to authenticated;
revoke all on function public.force_close_register_session(uuid, uuid) from public, anon;
grant execute on function public.force_close_register_session(uuid, uuid) to authenticated, service_role;

create or replace function private.complete_pos_sale(
  p_business_id uuid,
  p_register_id uuid,
  p_lines jsonb,
  p_method text,
  p_tendered numeric default null,
  p_notes text default null,
  p_customer_id uuid default null,
  p_discount numeric default 0,
  p_draft_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_store uuid;
  v_warehouse uuid;
  v_session_id uuid;
  v_opened_by uuid;
  v_currency text;
  v_merged jsonb := '{}'::jsonb;
  v_receipt jsonb := '[]'::jsonb;
  v_line jsonb;
  v_product_id uuid;
  v_qty numeric(14, 3);
  v_entry record;
  v_product_name text;
  v_product_price numeric(14, 2);
  v_track boolean;
  v_on_hand numeric(14, 3);
  v_order uuid;
  v_bill uuid;
  v_payment uuid;
  v_number text;
  v_bill_number text;
  v_prefix text;
  v_invoice_prefix text;
  v_tax_rate numeric(6, 3) := 0;
  v_count integer;
  v_subtotal numeric(14, 2) := 0;
  v_discount numeric(14, 2) := 0;
  v_taxable numeric(14, 2) := 0;
  v_tax numeric(14, 2) := 0;
  v_total numeric(14, 2) := 0;
  v_line_total numeric(14, 2);
  v_left numeric(14, 3);
  v_take numeric(14, 3);
  v_batch record;
  v_method text := lower(trim(coalesce(p_method, '')));
  v_tendered numeric(14, 2);
  v_change numeric(14, 2) := 0;
begin
  if not (private.is_business_member(p_business_id) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;
  if coalesce(p_discount, 0) < 0 then
    raise exception 'Discount cannot be negative';
  end if;
  if p_customer_id is not null and not exists (
    select 1 from public.customers as customer
    where customer.id = p_customer_id and customer.business_id = p_business_id and customer.status = 'active'
  ) then
    raise exception 'Choose an active customer from this business';
  end if;
  if v_method not in ('cash', 'card', 'bank_transfer') then
    raise exception 'Choose cash, card, or bank transfer';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add a product to the sale';
  end if;
  select register.location_id, register.warehouse_id into v_store, v_warehouse
  from public.registers as register
  where register.id = p_register_id and register.business_id = p_business_id and register.status = 'active';
  if not found then
    raise exception 'Choose an active register in this business';
  end if;
  select session.id, session.opened_by into v_session_id, v_opened_by
  from public.register_sessions as session
  where session.register_id = p_register_id and session.business_id = p_business_id and session.status = 'open'
  for update;
  if v_session_id is null then
    raise exception 'Open the register before selling';
  end if;
  if v_opened_by is distinct from auth.uid() then
    raise exception 'This register is open on another login';
  end if;
  select business.currency into v_currency from public.businesses as business where business.id = p_business_id;
  for v_line in select element.value from jsonb_array_elements(p_lines) as element(value)
  loop
    v_product_id := (v_line->>'product_id')::uuid;
    v_qty := (v_line->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Quantity must be greater than zero';
    end if;
    v_merged := jsonb_set(v_merged, array[v_product_id::text], to_jsonb(coalesce((v_merged->>v_product_id::text)::numeric, 0) + v_qty));
  end loop;
  perform 1 from public.businesses as business where business.id = p_business_id for update;
  for v_entry in
    select item.key as product_id, (item.value)::text::numeric as quantity
    from jsonb_each(v_merged) as item(key, value)
    order by item.key
  loop
    select product.name, product.price, product.track_inventory into v_product_name, v_product_price, v_track
    from public.products as product
    where product.id = v_entry.product_id::uuid and product.business_id = p_business_id and product.status = 'active';
    if not found then
      raise exception 'Product is not active in this business';
    end if;
    select balance.quantity into v_on_hand
    from public.inventory_balances as balance
    where balance.business_id = p_business_id and balance.product_id = v_entry.product_id::uuid and balance.location_id = v_warehouse
    for update;
    if v_on_hand is null or v_on_hand < v_entry.quantity then
      raise exception 'Not enough stock for %', coalesce(v_product_name, 'product');
    end if;
  end loop;
  select settings.order_prefix, settings.invoice_prefix, settings.tax_rate into v_prefix, v_invoice_prefix, v_tax_rate
  from public.business_settings as settings where settings.business_id = p_business_id;
  select count(*) + 1 into v_count from public.bills as bill where bill.business_id = p_business_id;
  v_bill_number := coalesce(v_invoice_prefix, 'INV') || '-' || lpad(v_count::text, 4, '0');

  if p_draft_id is not null then
    select sale.id, sale.number into v_order, v_number
    from public.orders as sale
    where sale.id = p_draft_id
      and sale.business_id = p_business_id
      and sale.register_id = p_register_id
      and sale.source = 'pos'
      and sale.status = 'draft'
    for update;
    if not found then
      raise exception 'This draft is no longer open';
    end if;
    if exists (
      select 1 from public.bills as bill
      where bill.order_id = v_order and bill.business_id = p_business_id
    ) then
      raise exception 'This draft is no longer open';
    end if;
    update public.orders as sale
    set location_id = v_store,
        customer_id = p_customer_id,
        register_session_id = v_session_id,
        notes = nullif(trim(coalesce(p_notes, '')), ''),
        status = 'completed'
    where sale.id = v_order;
    delete from public.order_lines as line
    where line.order_id = v_order and line.business_id = p_business_id;
  else
    select count(*) + 1 into v_count from public.orders as sale where sale.business_id = p_business_id;
    v_number := coalesce(v_prefix, 'ORD') || '-' || lpad(v_count::text, 4, '0');
    insert into public.orders (
      business_id, location_id, customer_id, register_id, register_session_id, number, status, source, notes, created_by
    ) values (
      p_business_id, v_store, p_customer_id, p_register_id, v_session_id, v_number, 'completed', 'pos',
      nullif(trim(coalesce(p_notes, '')), ''), auth.uid()
    ) returning id into v_order;
  end if;

  insert into public.bills (business_id, order_id, customer_id, number, status, issued_at)
  values (p_business_id, v_order, p_customer_id, v_bill_number, 'paid', now())
  returning id into v_bill;
  for v_entry in
    select item.key as product_id, (item.value)::text::numeric as quantity
    from jsonb_each(v_merged) as item(key, value)
    order by item.key
  loop
    select product.name, product.price, product.track_inventory into v_product_name, v_product_price, v_track
    from public.products as product
    where product.id = v_entry.product_id::uuid and product.business_id = p_business_id;
    v_line_total := round(v_entry.quantity * v_product_price, 2);
    v_subtotal := v_subtotal + v_line_total;
    v_receipt := v_receipt || jsonb_build_array(jsonb_build_object('name', v_product_name, 'quantity', v_entry.quantity, 'price', v_product_price));
    insert into public.order_lines (business_id, order_id, product_id, description, quantity, unit_price, line_total)
    values (p_business_id, v_order, v_entry.product_id::uuid, v_product_name, v_entry.quantity, v_product_price, v_line_total);
    insert into public.bill_lines (business_id, bill_id, description, quantity, unit_price, line_total)
    values (p_business_id, v_bill, v_product_name, v_entry.quantity, v_product_price, v_line_total);
    update public.inventory_balances as balance
    set quantity = balance.quantity - v_entry.quantity
    where balance.business_id = p_business_id and balance.product_id = v_entry.product_id::uuid and balance.location_id = v_warehouse;
    if v_track then
      v_left := v_entry.quantity;
      for v_batch in
        select batch.id, batch.quantity from public.batches as batch
        where batch.business_id = p_business_id and batch.product_id = v_entry.product_id::uuid and batch.location_id = v_warehouse and batch.quantity > 0
        order by batch.created_at, batch.id
        for update
      loop
        exit when v_left <= 0;
        v_take := least(v_batch.quantity, v_left);
        update public.batches as batch set quantity = batch.quantity - v_take where batch.id = v_batch.id;
        insert into public.inventory_movements (business_id, product_id, location_id, batch_id, quantity, reason, reference, created_by)
        values (p_business_id, v_entry.product_id::uuid, v_warehouse, v_batch.id, -v_take, 'pos_sale', v_number, auth.uid());
        v_left := v_left - v_take;
      end loop;
      if v_left > 0 then
        insert into public.inventory_movements (business_id, product_id, location_id, quantity, reason, reference, created_by)
        values (p_business_id, v_entry.product_id::uuid, v_warehouse, -v_left, 'pos_sale', v_number, auth.uid());
      end if;
    else
      insert into public.inventory_movements (business_id, product_id, location_id, quantity, reason, reference, created_by)
      values (p_business_id, v_entry.product_id::uuid, v_warehouse, -v_entry.quantity, 'pos_sale', v_number, auth.uid());
    end if;
  end loop;
  v_discount := least(round(coalesce(p_discount, 0), 2), v_subtotal);
  v_taxable := round(v_subtotal - v_discount, 2);
  v_tax := round(v_taxable * coalesce(v_tax_rate, 0) / 100, 2);
  v_total := round(v_taxable + v_tax, 2);
  update public.orders as sale set subtotal = v_subtotal, discount = v_discount, tax = v_tax, total = v_total where sale.id = v_order;
  update public.bills as bill set subtotal = v_subtotal, discount = v_discount, tax = v_tax, total = v_total where bill.id = v_bill;
  if v_method = 'cash' then
    v_tendered := coalesce(p_tendered, v_total);
    if v_tendered < v_total then
      raise exception 'Cash received is less than the total';
    end if;
    v_change := round(v_tendered - v_total, 2);
  else
    v_tendered := v_total;
    v_change := 0;
  end if;
  insert into public.payments (
    business_id, order_id, bill_id, amount, currency, status, method, provider, register_session_id, tendered, change_amount, external_ref
  ) values (
    p_business_id, v_order, v_bill, v_total, coalesce(v_currency, 'USD'), 'succeeded', v_method, v_method,
    v_session_id, v_tendered, v_change, 'PAY-' || v_number
  ) returning id into v_payment;
  insert into public.audit_events (business_id, actor_id, action, entity, entity_id, payload)
  values (
    p_business_id, auth.uid(), 'pos.sale', 'orders', v_order,
    jsonb_build_object('number', v_number, 'bill_number', v_bill_number, 'subtotal', v_subtotal, 'discount', v_discount, 'tax', v_tax, 'total', v_total, 'method', v_method, 'customer_id', p_customer_id, 'register_session_id', v_session_id)
  );
  return jsonb_build_object('id', v_order, 'number', v_number, 'bill_id', v_bill, 'bill_number', v_bill_number, 'lines', v_receipt, 'subtotal', v_subtotal, 'discount', v_discount, 'tax', v_tax, 'tax_rate', coalesce(v_tax_rate, 0), 'total', v_total, 'method', v_method, 'customer_id', p_customer_id, 'tendered', v_tendered, 'change', v_change);
end;
$fn$;

create or replace function public.complete_pos_sale(
  p_business_id uuid,
  p_register_id uuid,
  p_lines jsonb,
  p_method text,
  p_tendered numeric default null,
  p_notes text default null,
  p_customer_id uuid default null,
  p_discount numeric default 0,
  p_draft_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  return private.complete_pos_sale(
    p_business_id, p_register_id, p_lines, p_method, p_tendered, p_notes, p_customer_id, p_discount, p_draft_id
  );
end;
$fn$;

revoke all on function private.complete_pos_sale(uuid, uuid, jsonb, text, numeric, text, uuid, numeric, uuid) from public, anon;
grant execute on function private.complete_pos_sale(uuid, uuid, jsonb, text, numeric, text, uuid, numeric, uuid) to authenticated;
revoke all on function public.complete_pos_sale(uuid, uuid, jsonb, text, numeric, text, uuid, numeric, uuid) from public, anon;
grant execute on function public.complete_pos_sale(uuid, uuid, jsonb, text, numeric, text, uuid, numeric, uuid) to authenticated, service_role;

create or replace function private.pos_sale_requires_holder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.source = 'pos' and new.status = 'completed' and new.register_session_id is not null then
    if not exists (
      select 1
      from public.register_sessions as session
      where session.id = new.register_session_id
        and session.business_id = new.business_id
        and session.opened_by = (select auth.uid())
    ) then
      raise exception 'This register is open on another login';
    end if;
  end if;
  return new;
end;
$fn$;

drop trigger if exists pos_sale_requires_holder on public.orders;
create trigger pos_sale_requires_holder
  before insert or update on public.orders
  for each row
  execute function private.pos_sale_requires_holder();