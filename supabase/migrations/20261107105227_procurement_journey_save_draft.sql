create or replace function private.save_shipment_draft(
  p_business_id uuid,
  p_shipment_id uuid,
  p_location_id uuid,
  p_lines jsonb,
  p_supplier_id uuid default null,
  p_name text default null,
  p_origin_country text default null,
  p_carrier text default null,
  p_tracking_number text default null,
  p_expected_on date default null,
  p_allocation_method text default 'weight',
  p_discount_percent numeric default 0,
  p_origin_currency text default null,
  p_origin_to_usd_rate numeric default 1,
  p_usd_to_business_rate numeric default 1,
  p_freight_per_kg numeric default 0,
  p_declared_value numeric default null,
  p_charges jsonb default '[]'::jsonb,
  p_chargeable_weight_kg numeric default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_shipment uuid;
  v_reference text;
  v_currency text;
  v_origin text;
  v_line jsonb;
  v_product_id uuid;
  v_seen uuid[] := '{}';
  v_sku text;
  v_name text;
  v_description text;
  v_price numeric(14, 2);
  v_cost numeric(14, 2);
  v_weight numeric(14, 3);
  v_supplier_sku text;
  v_status text;
  v_qty numeric(14, 3);
  v_unit numeric(14, 2);
  v_position integer := 0;
  v_rate numeric(16, 6);
  v_declared numeric(14, 2) := 0;
  v_kg numeric(18, 6) := 0;
  v_freight numeric(14, 2);
begin
  if not (private.is_business_member(p_business_id) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;

  if p_allocation_method not in ('value', 'quantity', 'weight') then
    raise exception 'Allocation method must be value, quantity, or weight';
  end if;

  if p_discount_percent < 0 or p_discount_percent > 100 then
    raise exception 'Discount must be between 0 and 100';
  end if;

  if p_origin_to_usd_rate <= 0 or p_usd_to_business_rate <= 0 then
    raise exception 'Exchange rates must be greater than zero';
  end if;

  if p_freight_per_kg < 0 then
    raise exception 'Freight rate cannot be negative';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Add the product list';
  end if;

  if not exists (
    select 1
    from public.locations as location
    where location.id = p_location_id
      and location.business_id = p_business_id
  ) then
    raise exception 'Choose a destination location in this business';
  end if;

  if p_supplier_id is not null and not exists (
    select 1
    from public.suppliers as supplier
    where supplier.id = p_supplier_id
      and supplier.business_id = p_business_id
  ) then
    raise exception 'Supplier is not in this business';
  end if;

  select business.currency
  into v_currency
  from public.businesses as business
  where business.id = p_business_id;

  v_origin := coalesce(nullif(btrim(coalesce(p_origin_currency, '')), ''), v_currency, 'USD');
  v_rate := p_origin_to_usd_rate * p_usd_to_business_rate;

  if p_shipment_id is null then
    v_reference := private.next_shipment_reference(p_business_id);
    insert into public.shipments (
      business_id, direction, status, stage, carrier, tracking_number, location_id, supplier_id,
      allocation_method, reference, expected_on, name, origin_country, discount_percent,
      origin_currency, origin_to_usd_rate, usd_to_business_rate, freight_per_kg,
      chargeable_weight_kg
    ) values (
      p_business_id, 'inbound', 'pending', 'draft_order',
      nullif(btrim(coalesce(p_carrier, '')), ''),
      nullif(btrim(coalesce(p_tracking_number, '')), ''),
      p_location_id, p_supplier_id, p_allocation_method, v_reference, p_expected_on,
      nullif(btrim(coalesce(p_name, '')), ''),
      nullif(btrim(coalesce(p_origin_country, '')), ''),
      p_discount_percent, v_origin, p_origin_to_usd_rate, p_usd_to_business_rate, p_freight_per_kg,
      p_chargeable_weight_kg
    ) returning id into v_shipment;

    insert into public.shipment_events (business_id, shipment_id, status, stage, note, actor_id)
    values (p_business_id, v_shipment, 'pending', 'draft_order', 'Draft saved', auth.uid());
  else
    select shipment.id
    into v_shipment
    from public.shipments as shipment
    where shipment.id = p_shipment_id
      and shipment.business_id = p_business_id
      and shipment.stage = 'draft_order'
      and shipment.status = 'pending'
      and shipment.actuals_locked = false
    for update;

    if not found then
      raise exception 'Only an open draft can be edited';
    end if;

    if exists (
      select 1
      from public.shipment_lines as line
      where line.shipment_id = v_shipment
        and line.quantity_received > 0
    ) then
      raise exception 'Received stock has to stay on this shipment';
    end if;

    update public.shipments as shipment
    set carrier = nullif(btrim(coalesce(p_carrier, '')), ''),
        tracking_number = nullif(btrim(coalesce(p_tracking_number, '')), ''),
        location_id = p_location_id,
        supplier_id = p_supplier_id,
        allocation_method = p_allocation_method,
        expected_on = p_expected_on,
        name = nullif(btrim(coalesce(p_name, '')), ''),
        origin_country = nullif(btrim(coalesce(p_origin_country, '')), ''),
        discount_percent = p_discount_percent,
        origin_currency = v_origin,
        origin_to_usd_rate = p_origin_to_usd_rate,
        usd_to_business_rate = p_usd_to_business_rate,
        freight_per_kg = p_freight_per_kg,
        chargeable_weight_kg = p_chargeable_weight_kg
    where shipment.id = v_shipment;

    delete from public.shipment_lines as line
    where line.shipment_id = v_shipment;
  end if;

  for v_line in
    select element.value
    from jsonb_array_elements(p_lines) as element(value)
  loop
    v_product_id := (v_line->>'product_id')::uuid;
    if v_product_id = any (v_seen) then
      raise exception 'Each product can only be added once';
    end if;
    v_seen := array_append(v_seen, v_product_id);

    select product.sku, product.name, product.description, product.price, product.cost,
           product.weight_grams, product.supplier_sku, product.status
    into v_sku, v_name, v_description, v_price, v_cost, v_weight, v_supplier_sku, v_status
    from public.products as product
    where product.id = v_product_id
      and product.business_id = p_business_id;

    if not found then
      raise exception 'Product is not in this business';
    end if;

    if v_status <> 'active' then
      raise exception 'Only active products can be purchased';
    end if;

    v_qty := (v_line->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Quantity must be greater than zero';
    end if;

    if p_allocation_method = 'weight' and coalesce(v_weight, 0) <= 0 then
      raise exception 'Add a unit weight for % before allocating by weight', v_name;
    end if;

    v_unit := round(v_cost * (1 - p_discount_percent / 100) * v_rate, 2);
    v_declared := v_declared + round(v_qty * v_cost * (1 - p_discount_percent / 100) * p_origin_to_usd_rate, 2);
    v_kg := v_kg + (v_qty * coalesce(v_weight, 0) / 1000);
    v_position := v_position + 1;

    insert into public.shipment_lines (
      business_id, shipment_id, product_id, position, sku, name, description, sell_price,
      catalog_cost, quantity, unit_cost, unit_weight_grams, supplier_sku
    ) values (
      p_business_id, v_shipment, v_product_id, v_position, v_sku, v_name, v_description, v_price,
      v_cost, v_qty, v_unit, coalesce(v_weight, 0), v_supplier_sku
    );
  end loop;

  perform private.replace_shipment_charges(p_business_id, v_shipment, p_charges, 'projected', false);

  if p_freight_per_kg > 0 and not exists (
    select 1
    from public.shipment_charges as charge
    where charge.shipment_id = v_shipment
      and charge.cost_group = 'freight'
  ) then
    v_freight := round(v_kg * p_freight_per_kg * p_usd_to_business_rate, 2);
    if v_freight > 0 then
      insert into public.shipment_charges (
        business_id, shipment_id, kind, description, amount, recoverable, cost_group, source
      ) values (
        p_business_id, v_shipment, 'freight', 'Projected from weight', v_freight, false, 'freight', 'projected'
      );
    end if;
  end if;

  update public.shipments as shipment
  set declared_value = coalesce(p_declared_value, v_declared)
  where shipment.id = v_shipment;

  perform private.recalculate_shipment(v_shipment);

  insert into public.audit_events (business_id, actor_id, action, entity, entity_id, payload)
  values (
    p_business_id, auth.uid(), 'shipment.draft_saved', 'shipments', v_shipment,
    jsonb_build_object('reference', (select shipment.reference from public.shipments as shipment where shipment.id = v_shipment))
  );

  return v_shipment;
end;
$fn$;

create or replace function public.save_shipment_draft(
  p_business_id uuid,
  p_shipment_id uuid,
  p_location_id uuid,
  p_lines jsonb,
  p_supplier_id uuid default null,
  p_name text default null,
  p_origin_country text default null,
  p_carrier text default null,
  p_tracking_number text default null,
  p_expected_on date default null,
  p_allocation_method text default 'weight',
  p_discount_percent numeric default 0,
  p_origin_currency text default null,
  p_origin_to_usd_rate numeric default 1,
  p_usd_to_business_rate numeric default 1,
  p_freight_per_kg numeric default 0,
  p_declared_value numeric default null,
  p_charges jsonb default '[]'::jsonb,
  p_chargeable_weight_kg numeric default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  return private.save_shipment_draft(
    p_business_id, p_shipment_id, p_location_id, p_lines, p_supplier_id, p_name, p_origin_country,
    p_carrier, p_tracking_number, p_expected_on, p_allocation_method, p_discount_percent,
    p_origin_currency, p_origin_to_usd_rate, p_usd_to_business_rate, p_freight_per_kg,
    p_declared_value, p_charges, p_chargeable_weight_kg
  );
end;
$fn$;

revoke all on function private.save_shipment_draft(uuid, uuid, uuid, jsonb, uuid, text, text, text, text, date, text, numeric, text, numeric, numeric, numeric, numeric, jsonb, numeric) from public, anon;
grant execute on function private.save_shipment_draft(uuid, uuid, uuid, jsonb, uuid, text, text, text, text, date, text, numeric, text, numeric, numeric, numeric, numeric, jsonb, numeric) to authenticated;
revoke all on function public.save_shipment_draft(uuid, uuid, uuid, jsonb, uuid, text, text, text, text, date, text, numeric, text, numeric, numeric, numeric, numeric, jsonb, numeric) from public, anon;
grant execute on function public.save_shipment_draft(uuid, uuid, uuid, jsonb, uuid, text, text, text, text, date, text, numeric, text, numeric, numeric, numeric, numeric, jsonb, numeric) to authenticated;
