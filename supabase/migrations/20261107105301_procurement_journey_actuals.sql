create or replace function private.assert_shipment_actuals(p_shipment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_packages integer;
  v_method text;
  v_group text;
  v_name text;
begin
  select shipment.package_count_actual, shipment.allocation_method
  into v_packages, v_method
  from public.shipments as shipment
  where shipment.id = p_shipment_id;

  if v_packages is null then
    raise exception 'Save the package count before confirming';
  end if;

  foreach v_group in array array['freight', 'shipping_company', 'clearance']
  loop
    if not exists (
      select 1
      from public.shipment_charges as charge
      where charge.shipment_id = p_shipment_id
        and charge.cost_group = v_group
        and charge.source = 'actual'
    ) then
      raise exception 'Save the % actual before confirming', replace(v_group, '_', ' ');
    end if;
  end loop;

  if v_method = 'weight' and exists (
    select 1
    from public.shipment_lines as line
    where line.shipment_id = p_shipment_id
      and line.unit_weight_grams <= 0
  ) then
    raise exception 'Add a unit weight before allocating by weight';
  end if;

  select product.name
  into v_name
  from public.shipment_lines as line
  join public.products as product
    on product.id = line.product_id
   and product.business_id = line.business_id
  where line.shipment_id = p_shipment_id
    and product.track_inventory
    and nullif(btrim(coalesce(line.batch_reference, '')), '') is null
  limit 1;

  if v_name is not null then
    raise exception 'Enter a batch reference for %', v_name;
  end if;
end;
$fn$;

create or replace function private.save_shipment_actuals(
  p_shipment_id uuid,
  p_package_count integer,
  p_charges jsonb,
  p_batch_references jsonb,
  p_chargeable_weight_kg numeric default null,
  p_freight_per_kg numeric default null
) returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_business uuid;
  v_status text;
  v_stage text;
  v_locked boolean;
  v_ref jsonb;
  v_line uuid;
begin
  select shipment.business_id, shipment.status, shipment.stage, shipment.actuals_locked
  into v_business, v_status, v_stage, v_locked
  from public.shipments as shipment
  where shipment.id = p_shipment_id
  for update;

  if not found then
    raise exception 'Shipment not found';
  end if;

  if not (private.is_business_member(v_business) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;

  if v_locked or v_status in ('delivered', 'cancelled') or v_stage = 'draft_order' then
    raise exception 'Actuals can be saved on an open shipment';
  end if;

  if exists (
    select 1
    from public.shipment_lines as line
    where line.shipment_id = p_shipment_id
      and line.quantity_received > 0
  ) then
    raise exception 'Costs are locked after stock has been received';
  end if;

  if p_package_count is null or p_package_count < 0 then
    raise exception 'Save the package count before confirming';
  end if;

  if p_chargeable_weight_kg is not null and p_chargeable_weight_kg < 0 then
    raise exception 'Chargeable weight cannot be negative';
  end if;

  if p_freight_per_kg is not null and p_freight_per_kg < 0 then
    raise exception 'Freight rate cannot be negative';
  end if;

  update public.shipments as shipment
  set package_count_actual = p_package_count,
      chargeable_weight_kg = coalesce(p_chargeable_weight_kg, shipment.chargeable_weight_kg),
      freight_per_kg = coalesce(p_freight_per_kg, shipment.freight_per_kg)
  where shipment.id = p_shipment_id;

  if p_batch_references is not null and jsonb_typeof(p_batch_references) = 'array' then
    for v_ref in
      select element.value
      from jsonb_array_elements(p_batch_references) as element(value)
    loop
      v_line := (v_ref->>'line_id')::uuid;
      update public.shipment_lines as line
      set batch_reference = nullif(btrim(coalesce(v_ref->>'batch_reference', '')), '')
      where line.id = v_line
        and line.shipment_id = p_shipment_id;
    end loop;
  end if;

  perform private.replace_shipment_charges(v_business, p_shipment_id, p_charges, 'actual', true);
  perform private.recalculate_shipment(p_shipment_id);
end;
$fn$;

create or replace function private.confirm_shipment_actuals(
  p_shipment_id uuid,
  p_package_count integer,
  p_charges jsonb,
  p_batch_references jsonb,
  p_chargeable_weight_kg numeric default null,
  p_freight_per_kg numeric default null
) returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_business uuid;
  v_status text;
  v_received boolean;
begin
  select shipment.business_id, shipment.status
  into v_business, v_status
  from public.shipments as shipment
  where shipment.id = p_shipment_id
  for update;

  if not found then
    raise exception 'Shipment not found';
  end if;

  if not (private.is_business_member(v_business) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;

  if v_status = 'cancelled' then
    raise exception 'A cancelled shipment cannot receive stock';
  end if;

  if v_status = 'delivered' then
    raise exception 'This shipment is already closed';
  end if;

  select exists (
    select 1
    from public.shipment_lines as line
    where line.shipment_id = p_shipment_id
      and line.quantity_received > 0
  )
  into v_received;

  if not v_received then
    perform private.save_shipment_actuals(
      p_shipment_id,
      p_package_count,
      p_charges,
      p_batch_references,
      p_chargeable_weight_kg,
      p_freight_per_kg
    );
  end if;

  perform private.assert_shipment_actuals(p_shipment_id);

  update public.shipments as shipment
  set actuals_locked = true
  where shipment.id = p_shipment_id;

  perform private.receive_shipment(p_shipment_id, null);

  update public.shipments as shipment
  set stage = 'stock_added'
  where shipment.id = p_shipment_id
    and shipment.stage <> 'stock_added';
end;
$fn$;

create or replace function public.save_shipment_actuals(
  p_shipment_id uuid,
  p_package_count integer,
  p_charges jsonb,
  p_batch_references jsonb,
  p_chargeable_weight_kg numeric default null,
  p_freight_per_kg numeric default null
) returns void
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  perform private.save_shipment_actuals(
    p_shipment_id, p_package_count, p_charges, p_batch_references, p_chargeable_weight_kg, p_freight_per_kg
  );
end;
$fn$;

create or replace function public.confirm_shipment_actuals(
  p_shipment_id uuid,
  p_package_count integer,
  p_charges jsonb,
  p_batch_references jsonb,
  p_chargeable_weight_kg numeric default null,
  p_freight_per_kg numeric default null
) returns void
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  perform private.confirm_shipment_actuals(
    p_shipment_id, p_package_count, p_charges, p_batch_references, p_chargeable_weight_kg, p_freight_per_kg
  );
end;
$fn$;

revoke all on function private.assert_shipment_actuals(uuid) from public, anon, authenticated;
revoke all on function private.save_shipment_actuals(uuid, integer, jsonb, jsonb, numeric, numeric) from public, anon;
revoke all on function private.confirm_shipment_actuals(uuid, integer, jsonb, jsonb, numeric, numeric) from public, anon;
grant execute on function private.save_shipment_actuals(uuid, integer, jsonb, jsonb, numeric, numeric) to authenticated;
grant execute on function private.confirm_shipment_actuals(uuid, integer, jsonb, jsonb, numeric, numeric) to authenticated;
revoke all on function public.save_shipment_actuals(uuid, integer, jsonb, jsonb, numeric, numeric) from public, anon;
revoke all on function public.confirm_shipment_actuals(uuid, integer, jsonb, jsonb, numeric, numeric) from public, anon;
grant execute on function public.save_shipment_actuals(uuid, integer, jsonb, jsonb, numeric, numeric) to authenticated;
grant execute on function public.confirm_shipment_actuals(uuid, integer, jsonb, jsonb, numeric, numeric) to authenticated;

notify pgrst, 'reload schema';
