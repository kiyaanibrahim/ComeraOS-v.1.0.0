-- Inbound shipment cart, landing cost, and the stock posting that feeds POS.

alter table public.shipments
  add column supplier_id uuid,
  add column allocation_method text not null default 'value'
    check (allocation_method in ('value', 'quantity')),
  add column reference text,
  add column expected_on date,
  add column merchandise_total numeric(14, 2) not null default 0,
  add column charge_total numeric(14, 2) not null default 0,
  add column landing_total numeric(14, 2) not null default 0;

alter table public.shipments
  add constraint shipments_id_colony_id_key unique (id, colony_id);

alter table public.shipments
  add constraint shipments_supplier_id_colony_id_fkey
  foreign key (supplier_id, colony_id) references public.suppliers (id, colony_id) on delete restrict;

create unique index shipments_colony_reference_key
  on public.shipments (colony_id, reference);

create index shipments_supplier_id_idx on public.shipments (supplier_id);
create index shipments_supplier_colony_idx on public.shipments (supplier_id, colony_id);

create table public.shipment_lines (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null references public.colonies (id) on delete cascade,
  shipment_id uuid not null,
  product_id uuid not null,
  position integer not null,
  sku text not null,
  name text not null,
  description text,
  sell_price numeric(14, 2) not null default 0,
  catalog_cost numeric(14, 2) not null default 0,
  quantity numeric(14, 3) not null,
  unit_cost numeric(14, 2) not null default 0,
  quantity_received numeric(14, 3) not null default 0,
  allocated_charge numeric(14, 2) not null default 0,
  unit_landing_cost numeric(14, 4) not null default 0,
  line_landing_total numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  unique (id, colony_id),
  unique (shipment_id, product_id),
  check (quantity > 0),
  check (unit_cost >= 0),
  check (quantity_received >= 0),
  check (quantity_received <= quantity),
  foreign key (shipment_id, colony_id) references public.shipments (id, colony_id) on delete cascade,
  foreign key (product_id, colony_id) references public.products (id, colony_id) on delete restrict
);

create table public.shipment_charges (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null references public.colonies (id) on delete cascade,
  shipment_id uuid not null,
  kind text not null check (kind in ('freight', 'insurance', 'duty', 'brokerage', 'tax', 'other')),
  description text,
  amount numeric(14, 2) not null,
  recoverable boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, colony_id),
  check (amount >= 0),
  foreign key (shipment_id, colony_id) references public.shipments (id, colony_id) on delete cascade
);

create table public.shipment_events (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null references public.colonies (id) on delete cascade,
  shipment_id uuid not null,
  status text not null check (status in ('pending', 'in_transit', 'delivered', 'cancelled')),
  note text,
  actor_id uuid references auth.users (id) on delete set null,
  occurred_at timestamptz not null default now(),
  foreign key (shipment_id, colony_id) references public.shipments (id, colony_id) on delete cascade
);

create index shipment_lines_colony_id_idx on public.shipment_lines (colony_id);
create index shipment_lines_shipment_id_idx on public.shipment_lines (shipment_id);
create index shipment_lines_product_id_idx on public.shipment_lines (product_id);
create index shipment_lines_shipment_colony_idx on public.shipment_lines (shipment_id, colony_id);
create index shipment_lines_product_colony_idx on public.shipment_lines (product_id, colony_id);
create index shipment_charges_colony_id_idx on public.shipment_charges (colony_id);
create index shipment_charges_shipment_id_idx on public.shipment_charges (shipment_id);
create index shipment_charges_shipment_colony_idx on public.shipment_charges (shipment_id, colony_id);
create index shipment_events_colony_id_idx on public.shipment_events (colony_id);
create index shipment_events_shipment_id_idx on public.shipment_events (shipment_id);
create index shipment_events_actor_id_idx on public.shipment_events (actor_id);
create index shipment_events_shipment_colony_idx on public.shipment_events (shipment_id, colony_id);

select private.apply_colony_access('public.shipment_lines', 'append');
select private.apply_colony_access('public.shipment_charges', 'append');
select private.apply_colony_access('public.shipment_events', 'append');

create or replace function private.guard_shipment_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.status = 'delivered' and exists (
    select 1
    from public.shipment_lines as line
    where line.shipment_id = new.id
      and line.quantity_received < line.quantity
  ) then
    raise exception 'Deliver the shipment through receiving so stock is posted';
  end if;

  if new.status = 'cancelled' and exists (
    select 1
    from public.shipment_lines as line
    where line.shipment_id = new.id
      and line.quantity_received > 0
  ) then
    raise exception 'Received stock has to be returned before this shipment can be cancelled';
  end if;

  if new.location_id is distinct from old.location_id and exists (
    select 1
    from public.shipment_lines as line
    where line.shipment_id = new.id
      and line.quantity_received > 0
  ) then
    raise exception 'Destination is locked once stock has been received';
  end if;

  return new;
end;
$fn$;

create trigger shipments_guard_status
  before update on public.shipments
  for each row execute function private.guard_shipment_status();

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
    colony_id,
    direction,
    status,
    carrier,
    tracking_number,
    location_id,
    supplier_id,
    allocation_method,
    reference,
    expected_on
  ) values (
    p_colony_id,
    'inbound',
    'pending',
    nullif(btrim(coalesce(p_carrier, '')), ''),
    nullif(btrim(coalesce(p_tracking_number, '')), ''),
    p_location_id,
    p_supplier_id,
    p_allocation_method,
    v_reference,
    p_expected_on
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
      colony_id,
      shipment_id,
      product_id,
      position,
      sku,
      name,
      description,
      sell_price,
      catalog_cost,
      quantity,
      unit_cost
    ) values (
      p_colony_id,
      v_shipment,
      v_product_id,
      v_position,
      v_sku,
      v_name,
      v_description,
      v_price,
      v_cost,
      v_qty,
      v_unit
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
        colony_id,
        shipment_id,
        kind,
        description,
        amount,
        recoverable
      ) values (
        p_colony_id,
        v_shipment,
        v_charge->>'kind',
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
    p_colony_id,
    auth.uid(),
    'shipment.created',
    'shipments',
    v_shipment,
    jsonb_build_object('reference', v_reference)
  );

  return v_shipment;
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
      colony_id,
      product_id,
      location_id,
      batch_id,
      quantity,
      reason,
      reference,
      created_by
    ) values (
      v_colony,
      v_line.product_id,
      v_location,
      v_batch,
      v_recv,
      'procurement_receipt',
      coalesce(v_reference, p_shipment_id::text),
      auth.uid()
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
    values (
      v_colony,
      p_shipment_id,
      'delivered',
      'Received into inventory',
      auth.uid()
    );
  elsif v_posted then
    insert into public.shipment_events (colony_id, shipment_id, status, note, actor_id)
    values (
      v_colony,
      p_shipment_id,
      v_status,
      'Partial receipt posted to inventory',
      auth.uid()
    );
  end if;

  if v_posted then
    insert into public.audit_events (colony_id, actor_id, action, entity, entity_id, payload)
    values (
      v_colony,
      auth.uid(),
      'shipment.received',
      'shipments',
      p_shipment_id,
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
    select 1
    from public.locations as location
    where location.id = p_location_id
      and location.colony_id = p_colony_id
  ) then
    raise exception 'Choose a selling location in this colony';
  end if;

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

    select balance.quantity
    into v_on_hand
    from public.inventory_balances as balance
    where balance.colony_id = p_colony_id
      and balance.product_id = v_entry.product_id::uuid
      and balance.location_id = p_location_id
    for update;

    if v_on_hand is null or v_on_hand < v_entry.quantity then
      raise exception 'Not enough stock for %', coalesce(v_product_name, 'product');
    end if;
  end loop;

  select settings.order_prefix
  into v_prefix
  from public.colony_settings as settings
  where settings.colony_id = p_colony_id;

  select count(*) + 1
  into v_count
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
    where product.id = v_entry.product_id::uuid
      and product.colony_id = p_colony_id;

    v_line_total := round(v_entry.quantity * v_product_price, 2);
    v_subtotal := v_subtotal + v_line_total;

    insert into public.order_lines (
      colony_id,
      order_id,
      product_id,
      description,
      quantity,
      unit_price,
      line_total
    ) values (
      p_colony_id,
      v_order,
      v_entry.product_id::uuid,
      v_product_name,
      v_entry.quantity,
      v_product_price,
      v_line_total
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
          p_colony_id,
          v_entry.product_id::uuid,
          p_location_id,
          v_batch.id,
          -v_take,
          'pos_sale',
          v_number,
          auth.uid()
        );
        v_left := v_left - v_take;
      end loop;

      if v_left > 0 then
        insert into public.inventory_movements (
          colony_id, product_id, location_id, quantity, reason, reference, created_by
        ) values (
          p_colony_id,
          v_entry.product_id::uuid,
          p_location_id,
          -v_left,
          'pos_sale',
          v_number,
          auth.uid()
        );
      end if;
    else
      insert into public.inventory_movements (
        colony_id, product_id, location_id, quantity, reason, reference, created_by
      ) values (
        p_colony_id,
        v_entry.product_id::uuid,
        p_location_id,
        -v_entry.quantity,
        'pos_sale',
        v_number,
        auth.uid()
      );
    end if;
  end loop;

  update public.orders as sale
  set subtotal = v_subtotal,
      total = v_subtotal
  where sale.id = v_order;

  insert into public.audit_events (colony_id, actor_id, action, entity, entity_id, payload)
  values (
    p_colony_id,
    auth.uid(),
    'pos.sale',
    'orders',
    v_order,
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
    p_colony_id,
    p_location_id,
    p_lines,
    p_supplier_id,
    p_carrier,
    p_tracking_number,
    p_expected_on,
    p_allocation_method,
    p_charges
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
