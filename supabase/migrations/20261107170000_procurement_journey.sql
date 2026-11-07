-- Drafts, shipment stages, and weight-based landing cost on the inbound shipment.

alter table public.products
  add column weight_grams numeric(14, 3),
  add column supplier_sku text,
  add column pack_size text;

alter table public.products
  add constraint products_weight_grams_check check (weight_grams is null or weight_grams >= 0);

alter table public.shipments
  drop constraint shipments_allocation_method_check;

alter table public.shipments
  add constraint shipments_allocation_method_check
  check (allocation_method in ('value', 'quantity', 'weight'));

alter table public.shipments
  add column name text,
  add column origin_country text,
  add column stage text,
  add column discount_percent numeric(6, 3) not null default 0,
  add column origin_currency text not null default 'USD',
  add column origin_to_usd_rate numeric(16, 6) not null default 1,
  add column usd_to_business_rate numeric(16, 6) not null default 1,
  add column freight_per_kg numeric(14, 4) not null default 0,
  add column declared_value numeric(14, 2) not null default 0,
  add column chargeable_weight_kg numeric(14, 3),
  add column package_count_actual integer,
  add column actuals_locked boolean not null default false;

update public.shipments
set stage = case status
  when 'delivered' then 'stock_added'
  when 'in_transit' then 'handed_to_freight'
  else 'order_placed'
end
where stage is null;

update public.shipments
set actuals_locked = true
where status = 'delivered';

alter table public.shipments
  alter column stage set default 'order_placed';

alter table public.shipments
  alter column stage set not null;

alter table public.shipments
  add constraint shipments_stage_check check (stage in (
    'draft_order',
    'order_placed',
    'at_forwarder',
    'handed_to_freight',
    'arrived',
    'customs',
    'cleared',
    'received',
    'stock_added'
  )),
  add constraint shipments_discount_percent_check check (discount_percent >= 0 and discount_percent <= 100),
  add constraint shipments_origin_to_usd_rate_check check (origin_to_usd_rate > 0),
  add constraint shipments_usd_to_business_rate_check check (usd_to_business_rate > 0),
  add constraint shipments_freight_per_kg_check check (freight_per_kg >= 0),
  add constraint shipments_declared_value_check check (declared_value >= 0),
  add constraint shipments_chargeable_weight_kg_check check (chargeable_weight_kg is null or chargeable_weight_kg >= 0),
  add constraint shipments_package_count_actual_check check (package_count_actual is null or package_count_actual >= 0);

create index shipments_business_stage_idx on public.shipments (business_id, stage);

alter table public.shipment_lines
  add column unit_weight_grams numeric(14, 3) not null default 0,
  add column supplier_sku text,
  add column batch_reference text;

alter table public.shipment_lines
  add constraint shipment_lines_unit_weight_grams_check check (unit_weight_grams >= 0);

alter table public.shipment_charges
  add column cost_group text not null default 'other',
  add column source text not null default 'projected';

update public.shipment_charges
set cost_group = case kind
  when 'freight' then 'freight'
  when 'duty' then 'clearance'
  when 'brokerage' then 'clearance'
  else 'other'
end,
source = 'actual';

alter table public.shipment_charges
  add constraint shipment_charges_cost_group_check
  check (cost_group in ('freight', 'shipping_company', 'clearance', 'other')),
  add constraint shipment_charges_source_check check (source in ('projected', 'actual'));

alter table public.shipment_events
  add column stage text;

alter table public.shipment_events
  add constraint shipment_events_stage_check check (stage is null or stage in (
    'draft_order',
    'order_placed',
    'at_forwarder',
    'handed_to_freight',
    'arrived',
    'customs',
    'cleared',
    'received',
    'stock_added'
  ));

create or replace function private.fill_shipment_line_catalog()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_weight numeric(14, 3);
  v_supplier_sku text;
begin
  select product.weight_grams, product.supplier_sku
  into v_weight, v_supplier_sku
  from public.products as product
  where product.id = new.product_id
    and product.business_id = new.business_id;

  if new.unit_weight_grams = 0 then
    new.unit_weight_grams := coalesce(v_weight, 0);
  end if;

  if new.supplier_sku is null then
    new.supplier_sku := v_supplier_sku;
  end if;

  return new;
end;
$fn$;

create trigger shipment_lines_fill_catalog
  before insert on public.shipment_lines
  for each row execute function private.fill_shipment_line_catalog();

create or replace function private.fill_shipment_charge_group()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.cost_group = 'other' then
    new.cost_group := case new.kind
      when 'freight' then 'freight'
      when 'duty' then 'clearance'
      when 'brokerage' then 'clearance'
      else 'other'
    end;
  end if;
  return new;
end;
$fn$;

create trigger shipment_charges_fill_group
  before insert on public.shipment_charges
  for each row execute function private.fill_shipment_charge_group();

create or replace function private.next_shipment_reference(p_business_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_count integer;
begin
  perform 1 from public.businesses as business where business.id = p_business_id for update;

  select coalesce(max(substring(shipment.reference from 5)::integer), 0) + 1
  into v_count
  from public.shipments as shipment
  where shipment.business_id = p_business_id
    and shipment.reference ~ '^SHP-[0-9]+$';

  return 'SHP-' || lpad(v_count::text, 4, '0');
end;
$fn$;

create or replace function private.recalculate_shipment(p_shipment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_method text;
  v_business uuid;
  v_pool numeric(14, 2);
  v_merch numeric(14, 2) := 0;
  v_qty numeric(14, 3) := 0;
  v_weight numeric(18, 3) := 0;
  v_count integer := 0;
  v_index integer := 0;
  v_remaining numeric(14, 2);
  v_allocated numeric(14, 2);
  v_line_merch numeric(14, 2);
  v_line_weight numeric(18, 3);
  v_line record;
begin
  select shipment.allocation_method, shipment.business_id
  into v_method, v_business
  from public.shipments as shipment
  where shipment.id = p_shipment_id;

  if not found then
    raise exception 'Shipment not found';
  end if;

  if not (private.is_business_member(v_business) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
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
    select line.quantity, line.unit_cost, line.unit_weight_grams
    from public.shipment_lines as line
    where line.shipment_id = p_shipment_id
  loop
    v_merch := v_merch + round(v_line.quantity * v_line.unit_cost, 2);
    v_qty := v_qty + v_line.quantity;
    v_weight := v_weight + round(v_line.quantity * v_line.unit_weight_grams, 3);
  end loop;

  if v_method = 'weight' and v_count > 0 and (
    v_weight <= 0
    or exists (
      select 1
      from public.shipment_lines as line
      where line.shipment_id = p_shipment_id
        and line.unit_weight_grams <= 0
    )
  ) then
    raise exception 'Add a unit weight before allocating by weight';
  end if;

  v_remaining := v_pool;

  for v_line in
    select line.id, line.quantity, line.unit_cost, line.unit_weight_grams
    from public.shipment_lines as line
    where line.shipment_id = p_shipment_id
    order by line.position, line.id
  loop
    v_index := v_index + 1;
    v_line_merch := round(v_line.quantity * v_line.unit_cost, 2);
    v_line_weight := round(v_line.quantity * v_line.unit_weight_grams, 3);

    if v_index = v_count then
      v_allocated := v_remaining;
    elsif v_method = 'quantity' and v_qty > 0 then
      v_allocated := round(v_pool * v_line.quantity / v_qty, 2);
      v_remaining := v_remaining - v_allocated;
    elsif v_method = 'weight' and v_weight > 0 then
      v_allocated := round(v_pool * v_line_weight / v_weight, 2);
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

create or replace function private.replace_shipment_charges(
  p_business_id uuid,
  p_shipment_id uuid,
  p_charges jsonb,
  p_default_source text,
  p_keep_zero boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_charge jsonb;
  v_kind text;
  v_group text;
  v_source text;
  v_amount numeric(14, 2);
begin
  if p_charges is not null and jsonb_typeof(p_charges) <> 'array' then
    raise exception 'Charges must be a list';
  end if;

  delete from public.shipment_charges as charge
  where charge.shipment_id = p_shipment_id;

  if p_charges is null then
    return;
  end if;

  for v_charge in
    select element.value
    from jsonb_array_elements(p_charges) as element(value)
  loop
    v_amount := coalesce((v_charge->>'amount')::numeric, 0);
    if v_amount = 0 and not p_keep_zero then
      continue;
    end if;
    if v_amount < 0 then
      raise exception 'Charge amount cannot be negative';
    end if;

    v_kind := coalesce(v_charge->>'kind', '');
    if v_kind not in ('freight', 'insurance', 'duty', 'brokerage', 'tax', 'other') then
      raise exception 'Unknown charge type';
    end if;

    v_group := nullif(btrim(coalesce(v_charge->>'cost_group', '')), '');
    if v_group is null then
      v_group := case v_kind
        when 'freight' then 'freight'
        when 'duty' then 'clearance'
        when 'brokerage' then 'clearance'
        else 'other'
      end;
    end if;
    if v_group not in ('freight', 'shipping_company', 'clearance', 'other') then
      raise exception 'Unknown cost group';
    end if;

    v_source := coalesce(nullif(btrim(coalesce(v_charge->>'source', '')), ''), p_default_source);
    if v_source not in ('projected', 'actual') then
      raise exception 'Unknown charge source';
    end if;

    insert into public.shipment_charges (
      business_id, shipment_id, kind, description, amount, recoverable, cost_group, source
    ) values (
      p_business_id,
      p_shipment_id,
      v_kind,
      nullif(btrim(coalesce(v_charge->>'description', '')), ''),
      v_amount,
      coalesce(v_charge->>'recoverable', '') in ('true', 't'),
      v_group,
      v_source
    );
  end loop;
end;
$fn$;

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

create or replace function private.duplicate_shipment(p_shipment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_source public.shipments%rowtype;
  v_shipment uuid;
  v_reference text;
  v_line public.shipment_lines%rowtype;
  v_charge public.shipment_charges%rowtype;
begin
  select shipment.*
  into v_source
  from public.shipments as shipment
  where shipment.id = p_shipment_id
  for update;

  if not found then
    raise exception 'Shipment not found';
  end if;

  if not (private.is_business_member(v_source.business_id) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;

  if v_source.stage <> 'draft_order' then
    raise exception 'Only a draft can be duplicated';
  end if;

  v_reference := private.next_shipment_reference(v_source.business_id);

  insert into public.shipments (
    business_id, direction, status, stage, carrier, tracking_number, location_id, supplier_id,
    allocation_method, reference, expected_on, name, origin_country, discount_percent,
    origin_currency, origin_to_usd_rate, usd_to_business_rate, freight_per_kg, declared_value,
    chargeable_weight_kg
  ) values (
    v_source.business_id, 'inbound', 'pending', 'draft_order', v_source.carrier, v_source.tracking_number,
    v_source.location_id, v_source.supplier_id, v_source.allocation_method, v_reference, v_source.expected_on,
    v_source.name, v_source.origin_country, v_source.discount_percent, v_source.origin_currency,
    v_source.origin_to_usd_rate, v_source.usd_to_business_rate, v_source.freight_per_kg, v_source.declared_value,
    v_source.chargeable_weight_kg
  ) returning id into v_shipment;

  for v_line in
    select line.*
    from public.shipment_lines as line
    where line.shipment_id = p_shipment_id
    order by line.position, line.id
  loop
    insert into public.shipment_lines (
      business_id, shipment_id, product_id, position, sku, name, description, sell_price, catalog_cost,
      quantity, unit_cost, unit_weight_grams, supplier_sku
    ) values (
      v_line.business_id, v_shipment, v_line.product_id, v_line.position, v_line.sku, v_line.name,
      v_line.description, v_line.sell_price, v_line.catalog_cost, v_line.quantity, v_line.unit_cost,
      v_line.unit_weight_grams, v_line.supplier_sku
    );
  end loop;

  for v_charge in
    select charge.*
    from public.shipment_charges as charge
    where charge.shipment_id = p_shipment_id
  loop
    insert into public.shipment_charges (
      business_id, shipment_id, kind, description, amount, recoverable, cost_group, source
    ) values (
      v_charge.business_id, v_shipment, v_charge.kind, v_charge.description, v_charge.amount,
      v_charge.recoverable, v_charge.cost_group, 'projected'
    );
  end loop;

  perform private.recalculate_shipment(v_shipment);

  insert into public.shipment_events (business_id, shipment_id, status, stage, note, actor_id)
  values (
    v_source.business_id, v_shipment, 'pending', 'draft_order',
    'Duplicated from ' || coalesce(v_source.reference, 'shipment'), auth.uid()
  );

  return v_shipment;
end;
$fn$;

create or replace function private.convert_shipment_draft(p_shipment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_business uuid;
begin
  select shipment.business_id
  into v_business
  from public.shipments as shipment
  where shipment.id = p_shipment_id
    and shipment.stage = 'draft_order'
    and shipment.status = 'pending'
  for update;

  if not found then
    raise exception 'Only an open draft can be converted';
  end if;

  if not (private.is_business_member(v_business) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;

  if not exists (
    select 1 from public.shipment_lines as line where line.shipment_id = p_shipment_id
  ) then
    raise exception 'Add at least one product';
  end if;

  update public.shipments as shipment
  set stage = 'order_placed'
  where shipment.id = p_shipment_id;

  insert into public.shipment_events (business_id, shipment_id, status, stage, note, actor_id)
  values (v_business, p_shipment_id, 'pending', 'order_placed', 'Draft converted', auth.uid());
end;
$fn$;

create or replace function private.delete_shipment_draft(p_shipment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_business uuid;
  v_reference text;
begin
  select shipment.business_id, shipment.reference
  into v_business, v_reference
  from public.shipments as shipment
  where shipment.id = p_shipment_id
    and shipment.stage = 'draft_order'
    and shipment.status = 'pending'
  for update;

  if not found then
    raise exception 'Only an open draft can be deleted';
  end if;

  if not (private.is_business_member(v_business) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;

  if exists (
    select 1
    from public.shipment_lines as line
    where line.shipment_id = p_shipment_id
      and line.quantity_received > 0
  ) then
    raise exception 'Received stock has to stay on this shipment';
  end if;

  delete from public.shipments as shipment
  where shipment.id = p_shipment_id;

  insert into public.audit_events (business_id, actor_id, action, entity, entity_id, payload)
  values (
    v_business, auth.uid(), 'shipment.draft_deleted', 'shipments', p_shipment_id,
    jsonb_build_object('reference', v_reference)
  );
end;
$fn$;

create or replace function private.set_shipment_stage(
  p_shipment_id uuid,
  p_stage text,
  p_note text default null
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

  if p_stage not in (
    'order_placed', 'at_forwarder', 'handed_to_freight', 'arrived', 'customs', 'cleared', 'received', 'stock_added'
  ) then
    raise exception 'Unknown shipment stage';
  end if;

  if v_status = 'cancelled' or v_stage = 'draft_order' then
    raise exception 'Convert the draft before tracking it';
  end if;

  if v_stage = 'stock_added' or v_locked then
    raise exception 'This shipment is already closed';
  end if;

  if p_stage = 'stock_added' and (v_status <> 'delivered' or not v_locked) then
    raise exception 'Confirm actuals before marking stock as added';
  end if;

  if v_status = 'delivered' and p_stage <> 'stock_added' then
    raise exception 'Delivered shipments stay closed';
  end if;

  update public.shipments as shipment
  set stage = p_stage
  where shipment.id = p_shipment_id;

  insert into public.shipment_events (business_id, shipment_id, status, stage, note, actor_id)
  values (
    v_business, p_shipment_id, v_status, p_stage,
    nullif(btrim(coalesce(p_note, '')), ''), auth.uid()
  );
end;
$fn$;

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

create or replace function private.receive_shipment(
  p_shipment_id uuid,
  p_lines jsonb default null
) returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_business uuid;
  v_location uuid;
  v_status text;
  v_reference text;
  v_direction text;
  v_locked boolean;
  v_line record;
  v_recv numeric(14, 3);
  v_on_hand numeric(14, 3);
  v_product_cost numeric(14, 2);
  v_track boolean;
  v_new_cost numeric(14, 2);
  v_batch uuid;
  v_posted boolean := false;
  v_lot text;
begin
  select shipment.business_id, shipment.location_id, shipment.status, shipment.reference,
         shipment.direction, shipment.actuals_locked
  into v_business, v_location, v_status, v_reference, v_direction, v_locked
  from public.shipments as shipment
  where shipment.id = p_shipment_id
  for update;

  if not found then
    raise exception 'Shipment not found';
  end if;

  if not (private.is_business_member(v_business) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
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

  if not v_locked and (
    p_lines is null
    or not exists (
      select 1
      from public.shipment_lines as line
      where line.shipment_id = p_shipment_id
        and line.quantity_received < line.quantity
        and (
          not exists (
            select 1
            from jsonb_array_elements(p_lines) as element(value)
            where (element.value->>'line_id')::uuid = line.id
          )
          or coalesce((
            select (element.value->>'quantity')::numeric
            from jsonb_array_elements(p_lines) as element(value)
            where (element.value->>'line_id')::uuid = line.id
            limit 1
          ), 0) < line.quantity - line.quantity_received
        )
    )
  ) then
    raise exception 'Confirm actuals before the shipment is fully received';
  end if;

  for v_line in
    select
      line.id,
      line.product_id,
      line.quantity,
      line.quantity_received,
      line.unit_landing_cost,
      line.batch_reference,
      product.cost as product_cost,
      product.track_inventory,
      product.name as product_name
    from public.shipment_lines as line
    join public.products as product
      on product.id = line.product_id
     and product.business_id = line.business_id
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

    if v_track and nullif(btrim(coalesce(v_line.batch_reference, '')), '') is null then
      raise exception 'Enter a batch reference for %', v_line.product_name;
    end if;

    select coalesce(sum(balance.quantity), 0)
    into v_on_hand
    from public.inventory_balances as balance
    where balance.business_id = v_business
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
      and product.business_id = v_business;

    insert into public.inventory_balances (business_id, product_id, location_id, quantity)
    values (v_business, v_line.product_id, v_location, v_recv)
    on conflict (business_id, product_id, location_id)
    do update set quantity = public.inventory_balances.quantity + excluded.quantity,
                  updated_at = now();

    v_batch := null;
    if v_track then
      v_lot := coalesce(nullif(btrim(coalesce(v_line.batch_reference, '')), ''), v_reference, p_shipment_id::text);
      insert into public.batches (business_id, product_id, location_id, lot_code, quantity)
      values (v_business, v_line.product_id, v_location, v_lot, v_recv)
      on conflict (business_id, product_id, lot_code)
      do update set quantity = public.batches.quantity + excluded.quantity,
                    updated_at = now()
      returning id into v_batch;
    end if;

    insert into public.inventory_movements (
      business_id, product_id, location_id, batch_id, quantity, reason, reference, created_by
    ) values (
      v_business, v_line.product_id, v_location, v_batch, v_recv,
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
    set status = 'delivered',
        stage = case when v_locked then 'stock_added' else shipment.stage end
    where shipment.id = p_shipment_id;

    insert into public.shipment_events (business_id, shipment_id, status, stage, note, actor_id)
    values (
      v_business,
      p_shipment_id,
      'delivered',
      case when v_locked then 'stock_added' else null end,
      'Received into inventory',
      auth.uid()
    );
  elsif v_posted then
    insert into public.shipment_events (business_id, shipment_id, status, note, actor_id)
    values (v_business, p_shipment_id, v_status, 'Partial receipt posted to inventory', auth.uid());
  end if;

  if v_posted then
    insert into public.audit_events (business_id, actor_id, action, entity, entity_id, payload)
    values (
      v_business, auth.uid(), 'shipment.received', 'shipments', p_shipment_id,
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
  v_business uuid;
  v_status text;
  v_stage text;
begin
  select shipment.business_id, shipment.status, shipment.stage
  into v_business, v_status, v_stage
  from public.shipments as shipment
  where shipment.id = p_shipment_id
  for update;

  if not found then
    raise exception 'Shipment not found';
  end if;

  if not (private.is_business_member(v_business) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;

  if p_status = 'delivered' then
    raise exception 'Confirm actuals to add this shipment to inventory';
  end if;

  if v_stage = 'draft_order' then
    raise exception 'Convert the draft before tracking it';
  end if;

  if v_status in ('delivered', 'cancelled') then
    raise exception 'This shipment is already closed';
  end if;

  if p_status not in ('pending', 'in_transit', 'cancelled') then
    raise exception 'Unknown shipment status';
  end if;

  if p_status = 'cancelled' and exists (
    select 1
    from public.shipment_lines as line
    where line.shipment_id = p_shipment_id
      and line.quantity_received > 0
  ) then
    raise exception 'Received stock has to be returned before this shipment can be cancelled';
  end if;

  update public.shipments as shipment
  set status = p_status
  where shipment.id = p_shipment_id;

  insert into public.shipment_events (business_id, shipment_id, status, stage, note, actor_id)
  values (
    v_business, p_shipment_id, p_status, v_stage,
    nullif(btrim(coalesce(p_note, '')), ''), auth.uid()
  );
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

create or replace function public.duplicate_shipment(p_shipment_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  return private.duplicate_shipment(p_shipment_id);
end;
$fn$;

create or replace function public.convert_shipment_draft(p_shipment_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  perform private.convert_shipment_draft(p_shipment_id);
end;
$fn$;

create or replace function public.delete_shipment_draft(p_shipment_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  perform private.delete_shipment_draft(p_shipment_id);
end;
$fn$;

create or replace function public.set_shipment_stage(
  p_shipment_id uuid,
  p_stage text,
  p_note text default null
) returns void
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  perform private.set_shipment_stage(p_shipment_id, p_stage, p_note);
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

revoke all on function private.save_shipment_draft(uuid, uuid, uuid, jsonb, uuid, text, text, text, text, date, text, numeric, text, numeric, numeric, numeric, numeric, jsonb, numeric) from public, anon;
revoke all on function private.duplicate_shipment(uuid) from public, anon;
revoke all on function private.convert_shipment_draft(uuid) from public, anon;
revoke all on function private.delete_shipment_draft(uuid) from public, anon;
revoke all on function private.set_shipment_stage(uuid, text, text) from public, anon;
revoke all on function private.save_shipment_actuals(uuid, integer, jsonb, jsonb, numeric, numeric) from public, anon;
revoke all on function private.confirm_shipment_actuals(uuid, integer, jsonb, jsonb, numeric, numeric) from public, anon;
revoke all on function private.next_shipment_reference(uuid) from public, anon, authenticated;
revoke all on function private.replace_shipment_charges(uuid, uuid, jsonb, text, boolean) from public, anon, authenticated;
revoke all on function private.assert_shipment_actuals(uuid) from public, anon, authenticated;
revoke all on function private.fill_shipment_line_catalog() from public, anon, authenticated;
revoke all on function private.fill_shipment_charge_group() from public, anon, authenticated;

grant execute on function private.save_shipment_draft(uuid, uuid, uuid, jsonb, uuid, text, text, text, text, date, text, numeric, text, numeric, numeric, numeric, numeric, jsonb, numeric) to authenticated;
grant execute on function private.duplicate_shipment(uuid) to authenticated;
grant execute on function private.convert_shipment_draft(uuid) to authenticated;
grant execute on function private.delete_shipment_draft(uuid) to authenticated;
grant execute on function private.set_shipment_stage(uuid, text, text) to authenticated;
grant execute on function private.save_shipment_actuals(uuid, integer, jsonb, jsonb, numeric, numeric) to authenticated;
grant execute on function private.confirm_shipment_actuals(uuid, integer, jsonb, jsonb, numeric, numeric) to authenticated;

revoke all on function public.save_shipment_draft(uuid, uuid, uuid, jsonb, uuid, text, text, text, text, date, text, numeric, text, numeric, numeric, numeric, numeric, jsonb, numeric) from public, anon;
revoke all on function public.duplicate_shipment(uuid) from public, anon;
revoke all on function public.convert_shipment_draft(uuid) from public, anon;
revoke all on function public.delete_shipment_draft(uuid) from public, anon;
revoke all on function public.set_shipment_stage(uuid, text, text) from public, anon;
revoke all on function public.save_shipment_actuals(uuid, integer, jsonb, jsonb, numeric, numeric) from public, anon;
revoke all on function public.confirm_shipment_actuals(uuid, integer, jsonb, jsonb, numeric, numeric) from public, anon;

grant execute on function public.save_shipment_draft(uuid, uuid, uuid, jsonb, uuid, text, text, text, text, date, text, numeric, text, numeric, numeric, numeric, numeric, jsonb, numeric) to authenticated;
grant execute on function public.duplicate_shipment(uuid) to authenticated;
grant execute on function public.convert_shipment_draft(uuid) to authenticated;
grant execute on function public.delete_shipment_draft(uuid) to authenticated;
grant execute on function public.set_shipment_stage(uuid, text, text) to authenticated;
grant execute on function public.save_shipment_actuals(uuid, integer, jsonb, jsonb, numeric, numeric) to authenticated;
grant execute on function public.confirm_shipment_actuals(uuid, integer, jsonb, jsonb, numeric, numeric) to authenticated;
