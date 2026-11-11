create or replace function private.return_pos_sale(
  p_business_id uuid,
  p_bill_id uuid,
  p_lines jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_bill public.bills%rowtype;
  v_order public.orders%rowtype;
  v_session_status text;
  v_warehouse uuid;
  v_method text;
  v_line jsonb;
  v_order_line record;
  v_qty numeric(14, 3);
  v_already numeric(14, 3);
  v_returned_subtotal numeric(14, 2) := 0;
  v_refund numeric(14, 2);
  v_return uuid;
  v_number text;
begin
  if not (private.is_business_member(p_business_id) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Choose a line to return';
  end if;
  select bill.* into v_bill from public.bills as bill
  where bill.id = p_bill_id and bill.business_id = p_business_id
  for update;
  if not found or v_bill.status = 'void' or v_bill.order_id is null then
    raise exception 'This bill cannot be returned';
  end if;
  select sale.* into v_order from public.orders as sale
  where sale.id = v_bill.order_id and sale.business_id = p_business_id
  for update;
  if not found or v_order.status <> 'completed' then
    raise exception 'This bill cannot be returned';
  end if;
  select session.status into v_session_status from public.register_sessions as session
  where session.id = v_order.register_session_id and session.business_id = p_business_id;
  if v_session_status = 'open' then
    raise exception 'Void this sale from the open session';
  end if;
  select register.warehouse_id into v_warehouse from public.registers as register
  where register.id = v_order.register_id and register.business_id = p_business_id;
  select payment.method into v_method from public.payments as payment
  where payment.order_id = v_order.id and payment.business_id = p_business_id and payment.status = 'succeeded'
  order by payment.created_at limit 1;
  v_method := coalesce(v_method, 'cash');
  v_number := 'RET-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  insert into public.sale_returns (business_id, bill_id, order_id, number, method, amount, created_by)
  values (p_business_id, v_bill.id, v_order.id, v_number, v_method, 0, auth.uid())
  returning id into v_return;
  for v_line in select element.value from jsonb_array_elements(p_lines) as element(value)
  loop
    v_qty := (v_line->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Return quantity must be greater than zero';
    end if;
    select line.* into v_order_line from public.order_lines as line
    where line.id = (v_line->>'order_line_id')::uuid and line.order_id = v_order.id and line.business_id = p_business_id
    for update;
    if not found then
      raise exception 'That line is not on this bill';
    end if;
    select coalesce(sum(returned.quantity), 0) into v_already
    from public.sale_return_lines as returned
    where returned.order_line_id = v_order_line.id and returned.business_id = p_business_id and returned.return_id <> v_return;
    if v_already + v_qty > v_order_line.quantity then
      raise exception 'Return quantity is higher than the quantity sold';
    end if;
    v_returned_subtotal := v_returned_subtotal + round(v_qty * v_order_line.unit_price, 2);
    insert into public.sale_return_lines (
      business_id, return_id, order_line_id, product_id, description, quantity, unit_price, line_total
    ) values (
      p_business_id, v_return, v_order_line.id, v_order_line.product_id, v_order_line.description,
      v_qty, v_order_line.unit_price, round(v_qty * v_order_line.unit_price, 2)
    );
    perform private.restock_pos(p_business_id, v_order_line.product_id, v_warehouse, v_qty, 'pos_return', v_number);
  end loop;
  if v_order.subtotal > 0 then
    v_refund := round(v_returned_subtotal * v_order.total / v_order.subtotal, 2);
  else
    v_refund := v_returned_subtotal;
  end if;
  update public.sale_returns set amount = v_refund where id = v_return;
  insert into public.payments (business_id, order_id, bill_id, amount, currency, status, method, provider, external_ref)
  select p_business_id, v_order.id, v_bill.id, v_refund, business.currency, 'refunded', v_method, v_method, v_number
  from public.businesses as business where business.id = p_business_id;
  insert into public.audit_events (business_id, actor_id, action, entity, entity_id, payload)
  values (p_business_id, auth.uid(), 'pos.return', 'bills', v_bill.id, jsonb_build_object('number', v_number, 'amount', v_refund, 'method', v_method));
  return jsonb_build_object('id', v_return, 'number', v_number, 'amount', v_refund, 'method', v_method);
end;
$fn$;

create or replace function public.return_pos_sale(p_business_id uuid, p_bill_id uuid, p_lines jsonb) returns jsonb
language plpgsql security invoker set search_path = ''
as $fn$
begin
  return private.return_pos_sale(p_business_id, p_bill_id, p_lines);
end;
$fn$;

revoke all on function private.return_pos_sale(uuid, uuid, jsonb) from public, anon;
grant execute on function private.return_pos_sale(uuid, uuid, jsonb) to authenticated;
revoke all on function public.return_pos_sale(uuid, uuid, jsonb) from public, anon;
grant execute on function public.return_pos_sale(uuid, uuid, jsonb) to authenticated, service_role;