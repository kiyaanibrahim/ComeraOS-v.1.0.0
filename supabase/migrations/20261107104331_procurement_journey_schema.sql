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

revoke all on function private.fill_shipment_line_catalog() from public, anon, authenticated;
revoke all on function private.fill_shipment_charge_group() from public, anon, authenticated;
