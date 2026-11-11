drop function if exists public.complete_pos_sale(uuid, uuid, jsonb);
drop function if exists private.complete_pos_sale(uuid, uuid, jsonb);

create or replace function private.complete_pos_sale(
  p_business_id uuid,
  p_register_id uuid,
  p_lines jsonb,
  p_method text,
  p_tendered numeric default null,
  p_notes text default null
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
  v_line jsonb;
  v_product_id uuid;
  v_qty numeric(14, 3);
  v_entry record;
  v_product_name text;
  v_product_price numeric(14, 2);
  v_track boolean;
  v_on_hand numeric(14, 3);
  v_order uuid;
  v_payment uuid;
  v_number text;
  v_prefix text;
  v_count integer;
  v_subtotal numeric(14, 2) := 0;
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

  if v_method not in ('cash', 'card', 'bank_transfer') then
    raise exception 'Choose cash, card, or bank transfer';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add a product to the sale';
  end if;

  select register.location_id, register.warehouse_id
  into v_store, v_warehouse
  from public.registers as register
  where register.id = p_register_id
    and register.business_id = p_business_id
    and register.status = 'active';

  if not found then
    raise exception 'Choose an active register in this business';
  end if;

  select session.id
  into v_session_id
  from public.register_sessions as session
  where session.register_id = p_register_id
    and session.business_id = p_business_id
    and session.status = 'open'
  for update;

  if v_session_id is null then
    raise exception 'Open the register before selling';
  end if;

  select business.currency
  into v_currency
  from public.businesses as business
  where business.id = p_business_id;

  for v_line in
    select element.value
    from jsonb_array_elements(p_lines) as element(value)
  loop
    v_product_id := (v_line->>'product_id')::uuid;
    v_qty := (v_line->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Quantity must be greater than zero';
    end if;
    v_merged := jsonb_set(
      v_merged,
      array[v_product_id::text],
      to_jsonb(coalesce((v_merged->>v_product_id::text)::numeric, 0) + v_qty)
    );
  end loop;

  perform 1 from public.businesses as business where business.id = p_business_id for update;

  for v_entry in
    select item.key as product_id, (item.value)::text::numeric as quantity
    from jsonb_each(v_merged) as item(key, value)
    order by item.key
  loop
    select product.name, product.price, product.track_inventory
    into v_product_name, v_product_price, v_track
    from public.products as product
    where product.id = v_entry.product_id::uuid
      and product.business_id = p_business_id
      and product.status = 'active';

    if not found then
      raise exception 'Product is not active in this business';
    end if;

    select balance.quantity
    into v_on_hand
    from public.inventory_balances as balance
    where balance.business_id = p_business_id
      and balance.product_id = v_entry.product_id::uuid
      and balance.location_id = v_warehouse
    for update;

    if v_on_hand is null or v_on_hand < v_entry.quantity then
      raise exception 'Not enough stock for %', coalesce(v_product_name, 'product');
    end if;
  end loop;

  select settings.order_prefix
  into v_prefix
  from public.business_settings as settings
  where settings.business_id = p_business_id;

  select count(*) + 1
  into v_count
  from public.orders as sale
  where sale.business_id = p_business_id;

  v_number := coalesce(v_prefix, 'ORD') || '-' || lpad(v_count::text, 4, '0');

  insert into public.orders (
    business_id, location_id, register_id, register_session_id, number, status, source, notes, created_by
  ) values (
    p_business_id, v_store, p_register_id, v_session_id, v_number, 'completed', 'pos', nullif(trim(coalesce(p_notes, '')), ''), auth.uid()
  ) returning id into v_order;

  for v_entry in
    select item.key as product_id, (item.value)::text::numeric as quantity
    from jsonb_each(v_merged) as item(key, value)
    order by item.key
  loop
    select product.name, product.price, product.track_inventory
    into v_product_name, v_product_price, v_track
    from public.products as product
    where product.id = v_entry.product_id::uuid
      and product.business_id = p_business_id;

    v_line_total := round(v_entry.quantity * v_product_price, 2);
    v_subtotal := v_subtotal + v_line_total;

    insert into public.order_lines (
      business_id, order_id, product_id, description, quantity, unit_price, line_total
    ) values (
      p_business_id, v_order, v_entry.product_id::uuid, v_product_name,
      v_entry.quantity, v_product_price, v_line_total
    );

    update public.inventory_balances as balance
    set quantity = balance.quantity - v_entry.quantity
    where balance.business_id = p_business_id
      and balance.product_id = v_entry.product_id::uuid
      and balance.location_id = v_warehouse;

    if v_track then
      v_left := v_entry.quantity;
      for v_batch in
        select batch.id, batch.quantity
        from public.batches as batch
        where batch.business_id = p_business_id
          and batch.product_id = v_entry.product_id::uuid
          and batch.location_id = v_warehouse
          and batch.quantity > 0
        order by batch.created_at, batch.id
        for update
      loop
        exit when v_left <= 0;
        v_take := least(v_batch.quantity, v_left);
        update public.batches as batch
        set quantity = batch.quantity - v_take
        where batch.id = v_batch.id;

        insert into public.inventory_movements (
          business_id, product_id, location_id, batch_id, quantity, reason, reference, created_by
        ) values (
          p_business_id, v_entry.product_id::uuid, v_warehouse, v_batch.id,
          -v_take, 'pos_sale', v_number, auth.uid()
        );
        v_left := v_left - v_take;
      end loop;

      if v_left > 0 then
        insert into public.inventory_movements (
          business_id, product_id, location_id, quantity, reason, reference, created_by
        ) values (
          p_business_id, v_entry.product_id::uuid, v_warehouse,
          -v_left, 'pos_sale', v_number, auth.uid()
        );
      end if;
    else
      insert into public.inventory_movements (
        business_id, product_id, location_id, quantity, reason, reference, created_by
      ) values (
        p_business_id, v_entry.product_id::uuid, v_warehouse,
        -v_entry.quantity, 'pos_sale', v_number, auth.uid()
      );
    end if;
  end loop;

  update public.orders as sale
  set subtotal = v_subtotal,
      total = v_subtotal
  where sale.id = v_order;

  if v_method = 'cash' then
    v_tendered := coalesce(p_tendered, v_subtotal);
    if v_tendered < v_subtotal then
      raise exception 'Cash received is less than the total';
    end if;
    v_change := round(v_tendered - v_subtotal, 2);
  else
    v_tendered := v_subtotal;
    v_change := 0;
  end if;

  insert into public.payments (
    business_id, order_id, amount, currency, status, method, provider,
    register_session_id, tendered, change_amount, external_ref
  ) values (
    p_business_id, v_order, v_subtotal, coalesce(v_currency, 'USD'), 'succeeded', v_method, v_method,
    v_session_id, v_tendered, v_change, 'PAY-' || v_number
  ) returning id into v_payment;

  insert into public.audit_events (business_id, actor_id, action, entity, entity_id, payload)
  values (
    p_business_id,
    auth.uid(),
    'pos.sale',
    'orders',
    v_order,
    jsonb_build_object(
      'number', v_number,
      'total', v_subtotal,
      'method', v_method,
      'register_id', p_register_id,
      'register_session_id', v_session_id,
      'warehouse_id', v_warehouse,
      'payment_id', v_payment,
      'tendered', v_tendered,
      'change', v_change
    )
  );

  return jsonb_build_object(
    'id', v_order,
    'number', v_number,
    'total', v_subtotal,
    'method', v_method,
    'tendered', v_tendered,
    'change', v_change,
    'register_id', p_register_id,
    'register_session_id', v_session_id,
    'location_id', v_store,
    'warehouse_id', v_warehouse
  );
end;
$fn$;

create or replace function public.open_register_session(
  p_business_id uuid,
  p_register_id uuid,
  p_opening_cash numeric,
  p_opening_count jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  return private.open_register_session(p_business_id, p_register_id, p_opening_cash, p_opening_count);
end;
$fn$;

create or replace function public.close_register_session(
  p_business_id uuid,
  p_session_id uuid,
  p_counted_cash numeric,
  p_closing_count jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  return private.close_register_session(p_business_id, p_session_id, p_counted_cash, p_closing_count);
end;
$fn$;

create or replace function public.complete_pos_sale(
  p_business_id uuid,
  p_register_id uuid,
  p_lines jsonb,
  p_method text,
  p_tendered numeric default null,
  p_notes text default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  return private.complete_pos_sale(p_business_id, p_register_id, p_lines, p_method, p_tendered, p_notes);
end;
$fn$;

revoke all on function private.open_register_session(uuid, uuid, numeric, jsonb) from public, anon;
grant execute on function private.open_register_session(uuid, uuid, numeric, jsonb) to authenticated;
revoke all on function public.open_register_session(uuid, uuid, numeric, jsonb) from public, anon;
grant execute on function public.open_register_session(uuid, uuid, numeric, jsonb) to authenticated, service_role;

revoke all on function private.close_register_session(uuid, uuid, numeric, jsonb) from public, anon;
grant execute on function private.close_register_session(uuid, uuid, numeric, jsonb) to authenticated;
revoke all on function public.close_register_session(uuid, uuid, numeric, jsonb) from public, anon;
grant execute on function public.close_register_session(uuid, uuid, numeric, jsonb) to authenticated, service_role;

revoke all on function private.complete_pos_sale(uuid, uuid, jsonb, text, numeric, text) from public, anon;
grant execute on function private.complete_pos_sale(uuid, uuid, jsonb, text, numeric, text) to authenticated;
revoke all on function public.complete_pos_sale(uuid, uuid, jsonb, text, numeric, text) from public, anon;
grant execute on function public.complete_pos_sale(uuid, uuid, jsonb, text, numeric, text) to authenticated, service_role;
