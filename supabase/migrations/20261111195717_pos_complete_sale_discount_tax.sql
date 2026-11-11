create or replace function private.complete_pos_sale(
  p_business_id uuid,
  p_register_id uuid,
  p_lines jsonb,
  p_method text,
  p_tendered numeric default null,
  p_notes text default null,
  p_customer_id uuid default null,
  p_discount numeric default 0
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_store uuid;
  v_warehouse uuid;
  v_session_id uuid;
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
  select session.id into v_session_id
  from public.register_sessions as session
  where session.register_id = p_register_id and session.business_id = p_business_id and session.status = 'open'
  for update;
  if v_session_id is null then
    raise exception 'Open the register before selling';
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
  select count(*) + 1 into v_count from public.orders as sale where sale.business_id = p_business_id;
  v_number := coalesce(v_prefix, 'ORD') || '-' || lpad(v_count::text, 4, '0');
  select count(*) + 1 into v_count from public.bills as bill where bill.business_id = p_business_id;
  v_bill_number := coalesce(v_invoice_prefix, 'INV') || '-' || lpad(v_count::text, 4, '0');
  insert into public.orders (
    business_id, location_id, customer_id, register_id, register_session_id, number, status, source, notes, created_by
  ) values (
    p_business_id, v_store, p_customer_id, p_register_id, v_session_id, v_number, 'completed', 'pos',
    nullif(trim(coalesce(p_notes, '')), ''), auth.uid()
  ) returning id into v_order;
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
  p_discount numeric default 0
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  return private.complete_pos_sale(p_business_id, p_register_id, p_lines, p_method, p_tendered, p_notes, p_customer_id, p_discount);
end;
$fn$;

revoke all on function private.complete_pos_sale(uuid, uuid, jsonb, text, numeric, text, uuid, numeric) from public, anon;
grant execute on function private.complete_pos_sale(uuid, uuid, jsonb, text, numeric, text, uuid, numeric) to authenticated;
revoke all on function public.complete_pos_sale(uuid, uuid, jsonb, text, numeric, text, uuid, numeric) from public, anon;
grant execute on function public.complete_pos_sale(uuid, uuid, jsonb, text, numeric, text, uuid, numeric) to authenticated, service_role;