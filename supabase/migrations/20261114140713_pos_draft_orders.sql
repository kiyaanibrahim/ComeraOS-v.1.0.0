-- A register can keep several draft counter orders. Charge completes one of them.

update public.orders
set status = 'draft'
where source = 'pos' and status = 'held';

drop index if exists public.orders_one_held_register_idx;

create or replace function private.discard_pos_draft(
  p_business_id uuid,
  p_order_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_id uuid;
begin
  if not (private.is_business_member(p_business_id) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;

  select sale.id into v_id
  from public.orders as sale
  where sale.id = p_order_id
    and sale.business_id = p_business_id
    and sale.source = 'pos'
    and sale.status = 'draft'
    and not exists (
      select 1 from public.bills as bill
      where bill.order_id = sale.id and bill.business_id = p_business_id
    )
  for update;

  if v_id is null then
    raise exception 'This draft is no longer open';
  end if;

  delete from public.orders where id = v_id;
end;
$fn$;

create or replace function public.discard_pos_draft(p_business_id uuid, p_order_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  perform private.discard_pos_draft(p_business_id, p_order_id);
end;
$fn$;

create or replace function private.save_pos_draft(
  p_business_id uuid,
  p_register_id uuid,
  p_order_id uuid default null,
  p_lines jsonb default '[]'::jsonb,
  p_customer_id uuid default null,
  p_notes text default null,
  p_discount numeric default 0
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_store uuid;
  v_session_id uuid;
  v_order uuid;
  v_number text;
  v_prefix text;
  v_tax_rate numeric(6, 3) := 0;
  v_count integer;
  v_line jsonb;
  v_product_id uuid;
  v_qty numeric(14, 3);
  v_name text;
  v_price numeric(14, 2);
  v_line_total numeric(14, 2);
  v_subtotal numeric(14, 2) := 0;
  v_discount numeric(14, 2) := 0;
  v_tax numeric(14, 2) := 0;
  v_total numeric(14, 2) := 0;
begin
  if not (private.is_business_member(p_business_id) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;
  if coalesce(p_discount, 0) < 0 then
    raise exception 'Discount cannot be negative';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    if p_order_id is not null then
      perform private.discard_pos_draft(p_business_id, p_order_id);
    end if;
    return null;
  end if;

  if p_customer_id is not null and not exists (
    select 1 from public.customers as customer
    where customer.id = p_customer_id
      and customer.business_id = p_business_id
      and customer.status = 'active'
  ) then
    raise exception 'Choose an active customer from this business';
  end if;

  select register.location_id into v_store
  from public.registers as register
  where register.id = p_register_id
    and register.business_id = p_business_id
    and register.status = 'active';
  if not found then
    raise exception 'Choose an active register in this business';
  end if;

  select session.id into v_session_id
  from public.register_sessions as session
  where session.register_id = p_register_id
    and session.business_id = p_business_id
    and session.status = 'open';
  if v_session_id is null then
    raise exception 'Open the register before selling';
  end if;

  if p_order_id is not null then
    select sale.id, sale.number into v_order, v_number
    from public.orders as sale
    where sale.id = p_order_id
      and sale.business_id = p_business_id
      and sale.register_id = p_register_id
      and sale.source = 'pos'
      and sale.status = 'draft'
    for update;
    if not found then
      raise exception 'This draft is no longer open';
    end if;
  end if;

  for v_line in select element.value from jsonb_array_elements(p_lines) as element(value)
  loop
    v_product_id := (v_line->>'product_id')::uuid;
    v_qty := (v_line->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Quantity must be greater than zero';
    end if;
    select product.name, product.price into v_name, v_price
    from public.products as product
    where product.id = v_product_id
      and product.business_id = p_business_id
      and product.status = 'active';
    if not found then
      raise exception 'Product is not active in this business';
    end if;
    v_line_total := round(v_qty * v_price, 2);
    v_subtotal := v_subtotal + v_line_total;
  end loop;

  select settings.order_prefix, settings.tax_rate into v_prefix, v_tax_rate
  from public.business_settings as settings
  where settings.business_id = p_business_id;

  v_discount := least(round(coalesce(p_discount, 0), 2), v_subtotal);
  v_tax := round((v_subtotal - v_discount) * coalesce(v_tax_rate, 0) / 100, 2);
  v_total := round(v_subtotal - v_discount + v_tax, 2);

  if v_order is null then
    select count(*) + 1 into v_count from public.orders as sale where sale.business_id = p_business_id;
    v_number := coalesce(v_prefix, 'ORD') || '-' || lpad(v_count::text, 4, '0');
    insert into public.orders (
      business_id, location_id, register_id, register_session_id, customer_id,
      number, status, source, notes, discount, subtotal, tax, total, created_by
    ) values (
      p_business_id, v_store, p_register_id, v_session_id, p_customer_id,
      v_number, 'draft', 'pos', nullif(trim(coalesce(p_notes, '')), ''),
      v_discount, v_subtotal, v_tax, v_total, auth.uid()
    ) returning id into v_order;
  else
    update public.orders as sale
    set location_id = v_store,
        register_session_id = v_session_id,
        customer_id = p_customer_id,
        notes = nullif(trim(coalesce(p_notes, '')), ''),
        discount = v_discount,
        subtotal = v_subtotal,
        tax = v_tax,
        total = v_total
    where sale.id = v_order;
    delete from public.order_lines as line
    where line.order_id = v_order and line.business_id = p_business_id;
  end if;

  for v_line in select element.value from jsonb_array_elements(p_lines) as element(value)
  loop
    v_product_id := (v_line->>'product_id')::uuid;
    v_qty := (v_line->>'quantity')::numeric;
    select product.name, product.price into v_name, v_price
    from public.products as product
    where product.id = v_product_id and product.business_id = p_business_id and product.status = 'active';
    v_line_total := round(v_qty * v_price, 2);
    insert into public.order_lines (
      business_id, order_id, product_id, description, quantity, unit_price, line_total
    ) values (
      p_business_id, v_order, v_product_id, v_name, v_qty, v_price, v_line_total
    );
  end loop;

  return jsonb_build_object(
    'id', v_order,
    'number', v_number,
    'customer_id', p_customer_id,
    'notes', nullif(trim(coalesce(p_notes, '')), ''),
    'subtotal', v_subtotal,
    'discount', v_discount,
    'tax', v_tax,
    'total', v_total
  );
end;
$fn$;

create or replace function public.save_pos_draft(
  p_business_id uuid,
  p_register_id uuid,
  p_order_id uuid default null,
  p_lines jsonb default '[]'::jsonb,
  p_customer_id uuid default null,
  p_notes text default null,
  p_discount numeric default 0
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  return private.save_pos_draft(
    p_business_id, p_register_id, p_order_id, p_lines, p_customer_id, p_notes, p_discount
  );
end;
$fn$;

revoke all on function private.discard_pos_draft(uuid, uuid) from public, anon;
grant execute on function private.discard_pos_draft(uuid, uuid) to authenticated;
revoke all on function public.discard_pos_draft(uuid, uuid) from public, anon;
grant execute on function public.discard_pos_draft(uuid, uuid) to authenticated, service_role;

revoke all on function private.save_pos_draft(uuid, uuid, uuid, jsonb, uuid, text, numeric) from public, anon;
grant execute on function private.save_pos_draft(uuid, uuid, uuid, jsonb, uuid, text, numeric) to authenticated;
revoke all on function public.save_pos_draft(uuid, uuid, uuid, jsonb, uuid, text, numeric) from public, anon;
grant execute on function public.save_pos_draft(uuid, uuid, uuid, jsonb, uuid, text, numeric) to authenticated, service_role;