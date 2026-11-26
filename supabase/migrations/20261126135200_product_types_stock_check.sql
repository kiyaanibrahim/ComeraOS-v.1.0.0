-- Aggregate cart and bundle component demand before locking stock.

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
  v_currency text;
  v_merged jsonb := '{}'::jsonb;
  v_receipt jsonb := '[]'::jsonb;
  v_line jsonb;
  v_product_id uuid;
  v_qty numeric(14, 3);
  v_entry record;
  v_product public.products%rowtype;
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
  v_tax numeric(14, 2) := 0;
  v_total numeric(14, 2) := 0;
  v_line_total numeric(14, 2);
  v_line_id uuid;
  v_unit_cost numeric(14, 2);
  v_line_tax_rate numeric(6, 3);
  v_line_share numeric(14, 2);
  v_discount_left numeric(14, 2);
  v_allocated numeric(14, 2);
  v_taxable numeric(14, 2);
  v_method text := lower(trim(coalesce(p_method, '')));
  v_tendered numeric(14, 2);
  v_change numeric(14, 2) := 0;
  v_component record;
  v_need numeric(14, 3);
  v_deductions jsonb := '[]'::jsonb;
  v_deduction record;
  v_lines_meta jsonb := '[]'::jsonb;
  v_meta record;
  v_idx integer := 0;
  v_line_count integer;
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
    select product.* into v_product
    from public.products as product
    where product.id = v_entry.product_id::uuid and product.business_id = p_business_id and product.status = 'active';
    if not found then
      raise exception 'Product is not active in this business';
    end if;
    if v_product.product_type = 'variable' then
      raise exception 'Choose a variant for %', v_product.name;
    end if;
    if v_product.product_type = 'bundle' then
      if not exists (
        select 1 from public.bundle_components as component
        where component.bundle_id = v_product.id and component.business_id = p_business_id
      ) then
        raise exception 'Bundle % has no components', v_product.name;
      end if;
      for v_component in
        select component.component_id, component.quantity, product.name, product.track_inventory, product.cost
        from public.bundle_components as component
        join public.products as product
          on product.id = component.component_id and product.business_id = component.business_id
        where component.bundle_id = v_product.id and component.business_id = p_business_id
        order by component.component_id
      loop
        v_need := v_component.quantity * v_entry.quantity;
        v_deductions := v_deductions || jsonb_build_array(jsonb_build_object(
          'product_id', v_component.component_id,
          'quantity', v_need,
          'track_inventory', v_component.track_inventory,
          'label', v_component.name
        ));
      end loop;
    else
      v_deductions := v_deductions || jsonb_build_array(jsonb_build_object(
        'product_id', v_entry.product_id::uuid,
        'quantity', v_entry.quantity,
        'track_inventory', v_product.track_inventory,
        'label', v_product.name
      ));
    end if;
  end loop;

  for v_deduction in
    select
      (item.value->>'product_id')::uuid as product_id,
      sum((item.value->>'quantity')::numeric) as quantity,
      max(item.value->>'label') as label
    from jsonb_array_elements(v_deductions) as item(value)
    group by (item.value->>'product_id')::uuid
    order by (item.value->>'product_id')::uuid
  loop
    select balance.quantity into v_on_hand
    from public.inventory_balances as balance
    where balance.business_id = p_business_id
      and balance.product_id = v_deduction.product_id
      and balance.location_id = v_warehouse
    for update;
    if v_on_hand is null or v_on_hand < v_deduction.quantity then
      raise exception 'Not enough stock for %', coalesce(v_deduction.label, 'product');
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
    select product.* into v_product
    from public.products as product
    where product.id = v_entry.product_id::uuid and product.business_id = p_business_id;
    v_line_total := round(v_entry.quantity * v_product.price, 2);
    v_subtotal := v_subtotal + v_line_total;
    if v_product.product_type = 'bundle' then
      select coalesce(sum(round(component.quantity * coalesce(product.cost, 0), 2)), 0)
      into v_unit_cost
      from public.bundle_components as component
      join public.products as product
        on product.id = component.component_id and product.business_id = component.business_id
      where component.bundle_id = v_product.id and component.business_id = p_business_id;
    else
      v_unit_cost := coalesce(v_product.cost, 0);
    end if;
    if v_product.tax_mode = 'exempt' then
      v_line_tax_rate := 0;
    elsif v_product.tax_mode = 'custom' then
      v_line_tax_rate := coalesce(v_product.tax_rate, 0);
    else
      v_line_tax_rate := coalesce(v_tax_rate, 0);
    end if;
    v_receipt := v_receipt || jsonb_build_array(jsonb_build_object('name', v_product.name, 'quantity', v_entry.quantity, 'price', v_product.price));
    insert into public.order_lines (business_id, order_id, product_id, description, quantity, unit_price, unit_cost, line_total)
    values (p_business_id, v_order, v_product.id, v_product.name, v_entry.quantity, v_product.price, v_unit_cost, v_line_total)
    returning id into v_line_id;
    insert into public.bill_lines (business_id, bill_id, description, quantity, unit_price, line_total)
    values (p_business_id, v_bill, v_product.name, v_entry.quantity, v_product.price, v_line_total);
    v_lines_meta := v_lines_meta || jsonb_build_array(jsonb_build_object(
      'line_id', v_line_id,
      'line_total', v_line_total,
      'tax_rate', v_line_tax_rate
    ));
    if v_product.product_type = 'bundle' then
      insert into public.order_line_components (business_id, order_line_id, component_id, quantity, unit_cost)
      select p_business_id, v_line_id, component.component_id, component.quantity, coalesce(product.cost, 0)
      from public.bundle_components as component
      join public.products as product
        on product.id = component.component_id and product.business_id = component.business_id
      where component.bundle_id = v_product.id and component.business_id = p_business_id;
    end if;
  end loop;

  for v_deduction in
    select
      (item.value->>'product_id')::uuid as product_id,
      sum((item.value->>'quantity')::numeric) as quantity,
      bool_or((item.value->>'track_inventory')::boolean) as track_inventory
    from jsonb_array_elements(v_deductions) as item(value)
    group by (item.value->>'product_id')::uuid
    order by (item.value->>'product_id')::uuid
  loop
    perform private.deduct_product_stock(
      p_business_id,
      v_deduction.product_id,
      v_warehouse,
      v_deduction.quantity,
      v_deduction.track_inventory,
      v_number
    );
  end loop;

  v_discount := least(round(coalesce(p_discount, 0), 2), v_subtotal);
  v_discount_left := v_discount;
  v_tax := 0;
  select jsonb_array_length(v_lines_meta) into v_line_count;
  for v_meta in
    select
      (item.value->>'line_id')::uuid as line_id,
      (item.value->>'line_total')::numeric as line_total,
      (item.value->>'tax_rate')::numeric as tax_rate,
      ordinality
    from jsonb_array_elements(v_lines_meta) with ordinality as item(value, ordinality)
    order by ordinality
  loop
    v_idx := v_idx + 1;
    if v_subtotal > 0 then
      if v_idx = v_line_count then
        v_allocated := v_discount_left;
      else
        v_allocated := least(v_discount_left, round(v_discount * v_meta.line_total / v_subtotal, 2));
        v_discount_left := v_discount_left - v_allocated;
      end if;
    else
      v_allocated := 0;
    end if;
    v_taxable := round(v_meta.line_total - v_allocated, 2);
    v_tax := v_tax + round(v_taxable * coalesce(v_meta.tax_rate, 0) / 100, 2);
  end loop;
  v_tax := round(v_tax, 2);
  v_total := round(v_subtotal - v_discount + v_tax, 2);
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
