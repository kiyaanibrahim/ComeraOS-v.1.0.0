create or replace function private.complete_pos_sale(
  p_colony_id uuid,
  p_location_id uuid,
  p_lines jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
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
  v_number text;
  v_prefix text;
  v_count integer;
  v_subtotal numeric(14, 2) := 0;
  v_line_total numeric(14, 2);
  v_left numeric(14, 3);
  v_take numeric(14, 3);
  v_batch record;
begin
  if not (private.is_colony_member(p_colony_id) or private.is_platform_operator()) then
    raise exception 'You are not a member of this colony';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add a product to the sale';
  end if;
  if not exists (
    select 1 from public.locations as location
    where location.id = p_location_id and location.colony_id = p_colony_id
  ) then
    raise exception 'Choose a selling location in this colony';
  end if;

  for v_line in
    select element.value from jsonb_array_elements(p_lines) as element(value)
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

  perform 1 from public.colonies as colony where colony.id = p_colony_id for update;

  for v_entry in
    select item.key as product_id, (item.value)::text::numeric as quantity
    from jsonb_each(v_merged) as item(key, value)
    order by item.key
  loop
    select product.name, product.price, product.track_inventory
    into v_product_name, v_product_price, v_track
    from public.products as product
    where product.id = v_entry.product_id::uuid
      and product.colony_id = p_colony_id
      and product.status = 'active';
    if not found then
      raise exception 'Product is not active in this colony';
    end if;
    select balance.quantity into v_on_hand
    from public.inventory_balances as balance
    where balance.colony_id = p_colony_id
      and balance.product_id = v_entry.product_id::uuid
      and balance.location_id = p_location_id
    for update;
    if v_on_hand is null or v_on_hand < v_entry.quantity then
      raise exception 'Not enough stock for %', coalesce(v_product_name, 'product');
    end if;
  end loop;

  select settings.order_prefix into v_prefix
  from public.colony_settings as settings
  where settings.colony_id = p_colony_id;

  select count(*) + 1 into v_count
  from public.orders as sale
  where sale.colony_id = p_colony_id;

  v_number := coalesce(v_prefix, 'ORD') || '-' || lpad(v_count::text, 4, '0');

  insert into public.orders (colony_id, location_id, number, status, source, created_by)
  values (p_colony_id, p_location_id, v_number, 'completed', 'pos', auth.uid())
  returning id into v_order;

  for v_entry in
    select item.key as product_id, (item.value)::text::numeric as quantity
    from jsonb_each(v_merged) as item(key, value)
    order by item.key
  loop
    select product.name, product.price, product.track_inventory
    into v_product_name, v_product_price, v_track
    from public.products as product
    where product.id = v_entry.product_id::uuid and product.colony_id = p_colony_id;

    v_line_total := round(v_entry.quantity * v_product_price, 2);
    v_subtotal := v_subtotal + v_line_total;

    insert into public.order_lines (
      colony_id, order_id, product_id, description, quantity, unit_price, line_total
    ) values (
      p_colony_id, v_order, v_entry.product_id::uuid, v_product_name,
      v_entry.quantity, v_product_price, v_line_total
    );

    update public.inventory_balances as balance
    set quantity = balance.quantity - v_entry.quantity
    where balance.colony_id = p_colony_id
      and balance.product_id = v_entry.product_id::uuid
      and balance.location_id = p_location_id;

    if v_track then
      v_left := v_entry.quantity;
      for v_batch in
        select batch.id, batch.quantity
        from public.batches as batch
        where batch.colony_id = p_colony_id
          and batch.product_id = v_entry.product_id::uuid
          and batch.location_id = p_location_id
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
          colony_id, product_id, location_id, batch_id, quantity, reason, reference, created_by
        ) values (
          p_colony_id, v_entry.product_id::uuid, p_location_id, v_batch.id,
          -v_take, 'pos_sale', v_number, auth.uid()
        );
        v_left := v_left - v_take;
      end loop;
      if v_left > 0 then
        insert into public.inventory_movements (
          colony_id, product_id, location_id, quantity, reason, reference, created_by
        ) values (
          p_colony_id, v_entry.product_id::uuid, p_location_id,
          -v_left, 'pos_sale', v_number, auth.uid()
        );
      end if;
    else
      insert into public.inventory_movements (
        colony_id, product_id, location_id, quantity, reason, reference, created_by
      ) values (
        p_colony_id, v_entry.product_id::uuid, p_location_id,
        -v_entry.quantity, 'pos_sale', v_number, auth.uid()
      );
    end if;
  end loop;

  update public.orders as sale
  set subtotal = v_subtotal, total = v_subtotal
  where sale.id = v_order;

  insert into public.audit_events (colony_id, actor_id, action, entity, entity_id, payload)
  values (
    p_colony_id, auth.uid(), 'pos.sale', 'orders', v_order,
    jsonb_build_object('number', v_number, 'total', v_subtotal)
  );

  return jsonb_build_object('id', v_order, 'number', v_number, 'total', v_subtotal);
end;
$fn$;

create or replace function public.create_inbound_shipment(
  p_colony_id uuid,
  p_location_id uuid,
  p_lines jsonb,
  p_supplier_id uuid default null,
  p_carrier text default null,
  p_tracking_number text default null,
  p_expected_on date default null,
  p_allocation_method text default 'value',
  p_charges jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  return private.create_inbound_shipment(
    p_colony_id, p_location_id, p_lines, p_supplier_id, p_carrier,
    p_tracking_number, p_expected_on, p_allocation_method, p_charges
  );
end;
$fn$;

create or replace function public.receive_shipment(
  p_shipment_id uuid,
  p_lines jsonb default null
) returns void
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  perform private.receive_shipment(p_shipment_id, p_lines);
end;
$fn$;

create or replace function public.set_shipment_status(
  p_shipment_id uuid,
  p_status text,
  p_note text default null
) returns void
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  perform private.set_shipment_status(p_shipment_id, p_status, p_note);
end;
$fn$;

create or replace function public.complete_pos_sale(
  p_colony_id uuid,
  p_location_id uuid,
  p_lines jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  return private.complete_pos_sale(p_colony_id, p_location_id, p_lines);
end;
$fn$;

revoke all on function private.guard_shipment_status() from public, anon, authenticated;
grant execute on function private.guard_shipment_status() to authenticated;
revoke all on function private.recalculate_shipment(uuid) from public, anon, authenticated;
revoke all on function private.create_inbound_shipment(uuid, uuid, jsonb, uuid, text, text, date, text, jsonb) from public, anon, authenticated;
revoke all on function private.receive_shipment(uuid, jsonb) from public, anon, authenticated;
revoke all on function private.set_shipment_status(uuid, text, text) from public, anon, authenticated;
revoke all on function private.complete_pos_sale(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function private.create_inbound_shipment(uuid, uuid, jsonb, uuid, text, text, date, text, jsonb) to authenticated;
grant execute on function private.receive_shipment(uuid, jsonb) to authenticated;
grant execute on function private.set_shipment_status(uuid, text, text) to authenticated;
grant execute on function private.complete_pos_sale(uuid, uuid, jsonb) to authenticated;
revoke all on function public.create_inbound_shipment(uuid, uuid, jsonb, uuid, text, text, date, text, jsonb) from public, anon;
revoke all on function public.receive_shipment(uuid, jsonb) from public, anon;
revoke all on function public.set_shipment_status(uuid, text, text) from public, anon;
revoke all on function public.complete_pos_sale(uuid, uuid, jsonb) from public, anon;
grant execute on function public.create_inbound_shipment(uuid, uuid, jsonb, uuid, text, text, date, text, jsonb) to authenticated;
grant execute on function public.receive_shipment(uuid, jsonb) to authenticated;
grant execute on function public.set_shipment_status(uuid, text, text) to authenticated;
grant execute on function public.complete_pos_sale(uuid, uuid, jsonb) to authenticated;
