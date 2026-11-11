create or replace function private.recalculate_shipment(p_shipment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_method text;
  v_colony uuid;
  v_pool numeric(14, 2);
  v_merch numeric(14, 2) := 0;
  v_qty numeric(14, 3) := 0;
  v_count integer := 0;
  v_index integer := 0;
  v_remaining numeric(14, 2);
  v_allocated numeric(14, 2);
  v_line_merch numeric(14, 2);
  v_line record;
begin
  select shipment.allocation_method, shipment.colony_id
  into v_method, v_colony
  from public.shipments as shipment
  where shipment.id = p_shipment_id;

  if not found then
    raise exception 'Shipment not found';
  end if;

  if not (private.is_colony_member(v_colony) or private.is_platform_operator()) then
    raise exception 'You are not a member of this colony';
  end if;

  if exists (
    select 1
    from public.shipment_lines as line
    where line.shipment_id = p_shipment_id
      and line.quantity_received > 0
  ) then
    raise exception 'Costs are locked after stock has been received';
  end if;

  select coalesce(sum(charge.amount), 0)
  into v_pool
  from public.shipment_charges as charge
  where charge.shipment_id = p_shipment_id
    and charge.recoverable = false;

  select count(*)
  into v_count
  from public.shipment_lines as line
  where line.shipment_id = p_shipment_id;

  for v_line in
    select line.quantity, line.unit_cost
    from public.shipment_lines as line
    where line.shipment_id = p_shipment_id
  loop
    v_merch := v_merch + round(v_line.quantity * v_line.unit_cost, 2);
    v_qty := v_qty + v_line.quantity;
  end loop;

  v_remaining := v_pool;

  for v_line in
    select line.id, line.quantity, line.unit_cost
    from public.shipment_lines as line
    where line.shipment_id = p_shipment_id
    order by line.position, line.id
  loop
    v_index := v_index + 1;
    v_line_merch := round(v_line.quantity * v_line.unit_cost, 2);

    if v_index = v_count then
      v_allocated := v_remaining;
    elsif v_method = 'quantity' and v_qty > 0 then
      v_allocated := round(v_pool * v_line.quantity / v_qty, 2);
      v_remaining := v_remaining - v_allocated;
    elsif v_merch > 0 then
      v_allocated := round(v_pool * v_line_merch / v_merch, 2);
      v_remaining := v_remaining - v_allocated;
    elsif v_qty > 0 then
      v_allocated := round(v_pool * v_line.quantity / v_qty, 2);
      v_remaining := v_remaining - v_allocated;
    else
      v_allocated := 0;
    end if;

    update public.shipment_lines as line
    set allocated_charge = v_allocated,
        line_landing_total = v_line_merch + v_allocated,
        unit_landing_cost = case
          when v_line.quantity = 0 then 0
          else round((v_line_merch + v_allocated) / v_line.quantity, 4)
        end
    where line.id = v_line.id;
  end loop;

  update public.shipments as shipment
  set merchandise_total = v_merch,
      charge_total = v_pool,
      landing_total = v_merch + v_pool
  where shipment.id = p_shipment_id;
end;
$fn$;

create or replace function private.create_inbound_shipment(
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
security definer
set search_path = ''
as $fn$
declare
  v_shipment uuid;
  v_reference text;
  v_count integer;
  v_line jsonb;
  v_charge jsonb;
  v_position integer := 0;
  v_product_id uuid;
  v_seen uuid[] := '{}';
  v_sku text;
  v_name text;
  v_description text;
  v_price numeric(14, 2);
  v_cost numeric(14, 2);
  v_status text;
  v_qty numeric(14, 3);
  v_unit numeric(14, 2);
  v_amount numeric(14, 2);
begin
  if not (private.is_colony_member(p_colony_id) or private.is_platform_operator()) then
    raise exception 'You are not a member of this colony';
  end if;

  if p_allocation_method not in ('value', 'quantity') then
    raise exception 'Allocation method must be value or quantity';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one product';
  end if;

  if not exists (
    select 1
    from public.locations as location
    where location.id = p_location_id
      and location.colony_id = p_colony_id
  ) then
    raise exception 'Choose a destination location in this colony';
  end if;

  if p_supplier_id is not null and not exists (
    select 1
    from public.suppliers as supplier
    where supplier.id = p_supplier_id
      and supplier.colony_id = p_colony_id
  ) then
    raise exception 'Supplier is not in this colony';
  end if;

  perform 1 from public.colonies as colony where colony.id = p_colony_id for update;

  select coalesce(max(substring(shipment.reference from 5)::integer), 0) + 1
  into v_count
  from public.shipments as shipment
  where shipment.colony_id = p_colony_id
    and shipment.reference ~ '^SHP-[0-9]+$';

  v_reference := 'SHP-' || lpad(v_count::text, 4, '0');

  insert into public.shipments (
    colony_id, direction, status, carrier, tracking_number, location_id,
    supplier_id, allocation_method, reference, expected_on
  ) values (
    p_colony_id, 'inbound', 'pending',
    nullif(btrim(coalesce(p_carrier, '')), ''),
    nullif(btrim(coalesce(p_tracking_number, '')), ''),
    p_location_id, p_supplier_id, p_allocation_method, v_reference, p_expected_on
  ) returning id into v_shipment;

  for v_line in
    select element.value
    from jsonb_array_elements(p_lines) as element(value)
  loop
    v_product_id := (v_line->>'product_id')::uuid;
    if v_product_id = any (v_seen) then
      raise exception 'Each product can only be added once';
    end if;
    v_seen := array_append(v_seen, v_product_id);

    select product.sku, product.name, product.description, product.price, product.cost, product.status
    into v_sku, v_name, v_description, v_price, v_cost, v_status
    from public.products as product
    where product.id = v_product_id
      and product.colony_id = p_colony_id;

    if not found then
      raise exception 'Product is not in this colony';
    end if;

    if v_status <> 'active' then
      raise exception 'Only active products can be purchased';
    end if;

    v_qty := (v_line->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Quantity must be greater than zero';
    end if;

    if coalesce(v_line->>'unit_cost', '') <> '' then
      v_unit := (v_line->>'unit_cost')::numeric;
    else
      v_unit := v_cost;
    end if;

    if v_unit < 0 then
      raise exception 'Unit cost cannot be negative';
    end if;

    v_position := v_position + 1;

    insert into public.shipment_lines (
      colony_id, shipment_id, product_id, position, sku, name, description,
      sell_price, catalog_cost, quantity, unit_cost
    ) values (
      p_colony_id, v_shipment, v_product_id, v_position, v_sku, v_name, v_description,
      v_price, v_cost, v_qty, v_unit
    );
  end loop;

  if p_charges is not null and jsonb_typeof(p_charges) = 'array' then
    for v_charge in
      select element.value
      from jsonb_array_elements(p_charges) as element(value)
    loop
      v_amount := coalesce((v_charge->>'amount')::numeric, 0);
      if v_amount = 0 then
        continue;
      end if;
      if v_amount < 0 then
        raise exception 'Charge amount cannot be negative';
      end if;
      if coalesce(v_charge->>'kind', '') not in ('freight', 'insurance', 'duty', 'brokerage', 'tax', 'other') then
        raise exception 'Unknown charge type';
      end if;

      insert into public.shipment_charges (
        colony_id, shipment_id, kind, description, amount, recoverable
      ) values (
        p_colony_id, v_shipment, v_charge->>'kind',
        nullif(btrim(coalesce(v_charge->>'description', '')), ''),
        v_amount,
        coalesce(v_charge->>'recoverable', '') = 'true'
      );
    end loop;
  end if;

  perform private.recalculate_shipment(v_shipment);

  insert into public.shipment_events (colony_id, shipment_id, status, note, actor_id)
  values (p_colony_id, v_shipment, 'pending', 'Shipment created', auth.uid());

  insert into public.audit_events (colony_id, actor_id, action, entity, entity_id, payload)
  values (
    p_colony_id, auth.uid(), 'shipment.created', 'shipments', v_shipment,
    jsonb_build_object('reference', v_reference)
  );

  return v_shipment;
end;
$fn$;
