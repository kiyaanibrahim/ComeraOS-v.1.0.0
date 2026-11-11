create or replace function private.receive_shipment(
  p_shipment_id uuid,
  p_lines jsonb default null
) returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_colony uuid;
  v_location uuid;
  v_status text;
  v_reference text;
  v_direction text;
  v_line record;
  v_recv numeric(14, 3);
  v_on_hand numeric(14, 3);
  v_product_cost numeric(14, 2);
  v_track boolean;
  v_new_cost numeric(14, 2);
  v_batch uuid;
  v_posted boolean := false;
begin
  select shipment.colony_id, shipment.location_id, shipment.status, shipment.reference, shipment.direction
  into v_colony, v_location, v_status, v_reference, v_direction
  from public.shipments as shipment
  where shipment.id = p_shipment_id
  for update;

  if not found then
    raise exception 'Shipment not found';
  end if;

  if not (private.is_colony_member(v_colony) or private.is_platform_operator()) then
    raise exception 'You are not a member of this colony';
  end if;

  if v_direction <> 'inbound' then
    raise exception 'Only inbound shipments receive stock';
  end if;

  if v_status = 'cancelled' then
    raise exception 'A cancelled shipment cannot receive stock';
  end if;

  if v_status = 'delivered' then
    return;
  end if;

  if v_location is null then
    raise exception 'Choose a destination location before receiving';
  end if;

  if p_lines is not null and (
    jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0
  ) then
    raise exception 'Choose a quantity to receive';
  end if;

  if p_lines is not null and exists (
    select 1
    from jsonb_array_elements(p_lines) as element(value)
    where not exists (
      select 1
      from public.shipment_lines as line
      where line.id = (element.value->>'line_id')::uuid
        and line.shipment_id = p_shipment_id
    )
  ) then
    raise exception 'A line on this receipt is not part of the shipment';
  end if;

  for v_line in
    select
      line.id,
      line.product_id,
      line.quantity,
      line.quantity_received,
      line.unit_landing_cost,
      product.cost as product_cost,
      product.track_inventory,
      product.name as product_name
    from public.shipment_lines as line
    join public.products as product
      on product.id = line.product_id
     and product.colony_id = line.colony_id
    where line.shipment_id = p_shipment_id
      and line.quantity_received < line.quantity
      and (
        p_lines is null
        or line.id in (
          select (element.value->>'line_id')::uuid
          from jsonb_array_elements(p_lines) as element(value)
        )
      )
    order by line.position, line.id
  loop
    if p_lines is null then
      v_recv := v_line.quantity - v_line.quantity_received;
    else
      select (element.value->>'quantity')::numeric
      into v_recv
      from jsonb_array_elements(p_lines) as element(value)
      where (element.value->>'line_id')::uuid = v_line.id
      limit 1;

      if v_recv is null or v_recv <= 0 then
        raise exception 'Quantity must be greater than zero';
      end if;

      if v_recv > v_line.quantity - v_line.quantity_received then
        raise exception 'Quantity exceeds what is still outstanding for %', v_line.product_name;
      end if;
    end if;

    v_product_cost := v_line.product_cost;
    v_track := v_line.track_inventory;

    select coalesce(sum(balance.quantity), 0)
    into v_on_hand
    from public.inventory_balances as balance
    where balance.colony_id = v_colony
      and balance.product_id = v_line.product_id;

    if v_on_hand <= 0 then
      v_new_cost := round(v_line.unit_landing_cost, 2);
    else
      v_new_cost := round(
        (v_on_hand * v_product_cost + v_recv * v_line.unit_landing_cost) / (v_on_hand + v_recv),
        2
      );
    end if;

    update public.products as product
    set cost = v_new_cost
    where product.id = v_line.product_id
      and product.colony_id = v_colony;

    insert into public.inventory_balances (colony_id, product_id, location_id, quantity)
    values (v_colony, v_line.product_id, v_location, v_recv)
    on conflict (colony_id, product_id, location_id)
    do update set quantity = public.inventory_balances.quantity + excluded.quantity,
                  updated_at = now();

    v_batch := null;
    if v_track then
      insert into public.batches (colony_id, product_id, location_id, lot_code, quantity)
      values (v_colony, v_line.product_id, v_location, coalesce(v_reference, p_shipment_id::text), v_recv)
      on conflict (colony_id, product_id, lot_code)
      do update set quantity = public.batches.quantity + excluded.quantity,
                    updated_at = now()
      returning id into v_batch;
    end if;

    insert into public.inventory_movements (
      colony_id, product_id, location_id, batch_id, quantity, reason, reference, created_by
    ) values (
      v_colony, v_line.product_id, v_location, v_batch, v_recv,
      'procurement_receipt', coalesce(v_reference, p_shipment_id::text), auth.uid()
    );

    update public.shipment_lines as line
    set quantity_received = line.quantity_received + v_recv
    where line.id = v_line.id;

    v_posted := true;
  end loop;

  if p_lines is not null and not v_posted then
    raise exception 'Nothing outstanding to receive';
  end if;

  if not exists (
    select 1
    from public.shipment_lines as line
    where line.shipment_id = p_shipment_id
      and line.quantity_received < line.quantity
  ) then
    update public.shipments as shipment
    set status = 'delivered'
    where shipment.id = p_shipment_id;

    insert into public.shipment_events (colony_id, shipment_id, status, note, actor_id)
    values (v_colony, p_shipment_id, 'delivered', 'Received into inventory', auth.uid());
  elsif v_posted then
    insert into public.shipment_events (colony_id, shipment_id, status, note, actor_id)
    values (v_colony, p_shipment_id, v_status, 'Partial receipt posted to inventory', auth.uid());
  end if;

  if v_posted then
    insert into public.audit_events (colony_id, actor_id, action, entity, entity_id, payload)
    values (
      v_colony, auth.uid(), 'shipment.received', 'shipments', p_shipment_id,
      jsonb_build_object('reference', v_reference)
    );
  end if;
end;
$fn$;

create or replace function private.set_shipment_status(
  p_shipment_id uuid,
  p_status text,
  p_note text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_colony uuid;
  v_status text;
begin
  select shipment.colony_id, shipment.status
  into v_colony, v_status
  from public.shipments as shipment
  where shipment.id = p_shipment_id
  for update;

  if not found then
    raise exception 'Shipment not found';
  end if;

  if not (private.is_colony_member(v_colony) or private.is_platform_operator()) then
    raise exception 'You are not a member of this colony';
  end if;

  if p_status = 'delivered' then
    perform private.receive_shipment(p_shipment_id, null);
    return;
  end if;

  if v_status in ('delivered', 'cancelled') then
    raise exception 'This shipment is already closed';
  end if;

  if p_status not in ('pending', 'in_transit', 'cancelled') then
    raise exception 'Unknown shipment status';
  end if;

  update public.shipments as shipment
  set status = p_status
  where shipment.id = p_shipment_id;

  insert into public.shipment_events (colony_id, shipment_id, status, note, actor_id)
  values (v_colony, p_shipment_id, p_status, nullif(btrim(coalesce(p_note, '')), ''), auth.uid());
end;
$fn$;
