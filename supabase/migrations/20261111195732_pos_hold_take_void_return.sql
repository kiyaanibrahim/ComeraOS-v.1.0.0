create or replace function private.hold_pos_cart(
  p_business_id uuid,
  p_register_id uuid,
  p_lines jsonb,
  p_customer_id uuid default null,
  p_notes text default null,
  p_discount numeric default 0
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_order uuid;
  v_line jsonb;
  v_product_id uuid;
  v_qty numeric(14, 3);
  v_name text;
  v_price numeric(14, 2);
  v_subtotal numeric(14, 2) := 0;
begin
  if not (private.is_business_member(p_business_id) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add a product before holding the cart';
  end if;
  if not exists (
    select 1 from public.register_sessions as session
    where session.register_id = p_register_id and session.business_id = p_business_id and session.status = 'open'
  ) then
    raise exception 'Open the register before holding a cart';
  end if;
  delete from public.orders as held
  where held.business_id = p_business_id and held.register_id = p_register_id and held.status = 'held';
  insert into public.orders (business_id, register_id, customer_id, number, status, source, notes, discount, created_by)
  values (
    p_business_id, p_register_id, p_customer_id,
    'HOLD-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
    'held', 'pos', nullif(trim(coalesce(p_notes, '')), ''), round(coalesce(p_discount, 0), 2), auth.uid()
  ) returning id into v_order;
  for v_line in select element.value from jsonb_array_elements(p_lines) as element(value)
  loop
    v_product_id := (v_line->>'product_id')::uuid;
    v_qty := (v_line->>'quantity')::numeric;
    select product.name, product.price into v_name, v_price
    from public.products as product
    where product.id = v_product_id and product.business_id = p_business_id and product.status = 'active';
    if not found then
      raise exception 'Product is not active in this business';
    end if;
    v_subtotal := v_subtotal + round(v_qty * v_price, 2);
    insert into public.order_lines (business_id, order_id, product_id, description, quantity, unit_price, line_total)
    values (p_business_id, v_order, v_product_id, v_name, v_qty, v_price, round(v_qty * v_price, 2));
  end loop;
  update public.orders set subtotal = v_subtotal, total = v_subtotal where id = v_order;
  return jsonb_build_object('id', v_order);
end;
$fn$;

create or replace function public.hold_pos_cart(
  p_business_id uuid, p_register_id uuid, p_lines jsonb,
  p_customer_id uuid default null, p_notes text default null, p_discount numeric default 0
) returns jsonb
language plpgsql security invoker set search_path = ''
as $fn$
begin
  return private.hold_pos_cart(p_business_id, p_register_id, p_lines, p_customer_id, p_notes, p_discount);
end;
$fn$;

create or replace function private.take_pos_hold(p_business_id uuid, p_register_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_order public.orders%rowtype;
  v_lines jsonb;
begin
  if not (private.is_business_member(p_business_id) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;
  select sale.* into v_order from public.orders as sale
  where sale.business_id = p_business_id and sale.register_id = p_register_id and sale.status = 'held'
  for update;
  if not found then
    return null;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('product_id', line.product_id, 'name', line.description, 'quantity', line.quantity, 'price', line.unit_price)), '[]'::jsonb)
  into v_lines
  from public.order_lines as line
  where line.order_id = v_order.id and line.business_id = p_business_id;
  delete from public.orders where id = v_order.id;
  return jsonb_build_object('customer_id', v_order.customer_id, 'notes', v_order.notes, 'discount', v_order.discount, 'lines', v_lines);
end;
$fn$;

create or replace function public.take_pos_hold(p_business_id uuid, p_register_id uuid) returns jsonb
language plpgsql security invoker set search_path = ''
as $fn$
begin
  return private.take_pos_hold(p_business_id, p_register_id);
end;
$fn$;

create or replace function private.void_pos_sale(p_business_id uuid, p_order_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_order public.orders%rowtype;
  v_session_status text;
  v_warehouse uuid;
  v_line record;
begin
  if not (private.is_business_member(p_business_id) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;
  select sale.* into v_order from public.orders as sale
  where sale.id = p_order_id and sale.business_id = p_business_id
  for update;
  if not found or v_order.source <> 'pos' or v_order.status <> 'completed' then
    raise exception 'This sale cannot be voided';
  end if;
  select session.status into v_session_status from public.register_sessions as session
  where session.id = v_order.register_session_id and session.business_id = p_business_id;
  if v_session_status is distinct from 'open' then
    raise exception 'This session is closed. Return the bill instead';
  end if;
  select register.warehouse_id into v_warehouse from public.registers as register
  where register.id = v_order.register_id and register.business_id = p_business_id;
  for v_line in
    select line.product_id, line.quantity from public.order_lines as line
    where line.order_id = v_order.id and line.business_id = p_business_id
  loop
    perform private.restock_pos(p_business_id, v_line.product_id, v_warehouse, v_line.quantity, 'pos_void', v_order.number);
  end loop;
  update public.orders set status = 'void' where id = v_order.id;
  update public.bills set status = 'void' where order_id = v_order.id and business_id = p_business_id;
  update public.payments set status = 'void' where order_id = v_order.id and business_id = p_business_id and status = 'succeeded';
  insert into public.audit_events (business_id, actor_id, action, entity, entity_id, payload)
  values (p_business_id, auth.uid(), 'pos.void', 'orders', v_order.id, jsonb_build_object('number', v_order.number));
  return jsonb_build_object('id', v_order.id, 'number', v_order.number, 'status', 'void');
end;
$fn$;

create or replace function public.void_pos_sale(p_business_id uuid, p_order_id uuid) returns jsonb
language plpgsql security invoker set search_path = ''
as $fn$
begin
  return private.void_pos_sale(p_business_id, p_order_id);
end;
$fn$;

revoke all on function private.hold_pos_cart(uuid, uuid, jsonb, uuid, text, numeric) from public, anon;
grant execute on function private.hold_pos_cart(uuid, uuid, jsonb, uuid, text, numeric) to authenticated;
revoke all on function public.hold_pos_cart(uuid, uuid, jsonb, uuid, text, numeric) from public, anon;
grant execute on function public.hold_pos_cart(uuid, uuid, jsonb, uuid, text, numeric) to authenticated, service_role;
revoke all on function private.take_pos_hold(uuid, uuid) from public, anon;
grant execute on function private.take_pos_hold(uuid, uuid) to authenticated;
revoke all on function public.take_pos_hold(uuid, uuid) from public, anon;
grant execute on function public.take_pos_hold(uuid, uuid) to authenticated, service_role;
revoke all on function private.void_pos_sale(uuid, uuid) from public, anon;
grant execute on function private.void_pos_sale(uuid, uuid) to authenticated;
revoke all on function public.void_pos_sale(uuid, uuid) from public, anon;
grant execute on function public.void_pos_sale(uuid, uuid) to authenticated, service_role;