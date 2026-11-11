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
    select 1 from public.shipment_lines as line
    where line.shipment_id = new.id and line.quantity_received < line.quantity
  ) then
    raise exception 'Deliver the shipment through receiving so stock is posted';
  end if;
  if new.status = 'cancelled' and exists (
    select 1 from public.shipment_lines as line
    where line.shipment_id = new.id and line.quantity_received > 0
  ) then
    raise exception 'Received stock has to be returned before this shipment can be cancelled';
  end if;
  if new.location_id is distinct from old.location_id and exists (
    select 1 from public.shipment_lines as line
    where line.shipment_id = new.id and line.quantity_received > 0
  ) then
    raise exception 'Destination is locked once stock has been received';
  end if;
  return new;
end;
$fn$;

create trigger shipments_guard_status
  before update on public.shipments
  for each row execute function private.guard_shipment_status();

revoke all on function private.guard_shipment_status() from public, anon, authenticated;
grant execute on function private.guard_shipment_status() to authenticated;
