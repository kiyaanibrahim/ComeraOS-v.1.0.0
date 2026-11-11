-- A store or site sells stock from one warehouse, configured on the location.

alter table public.locations
  add column fulfillment_warehouse_id uuid;

alter table public.locations
  add constraint locations_fulfillment_warehouse_id_business_id_fkey
  foreign key (fulfillment_warehouse_id, business_id)
  references public.locations (id, business_id)
  on delete restrict;

alter table public.locations
  add constraint locations_fulfillment_not_self
  check (fulfillment_warehouse_id is null or fulfillment_warehouse_id <> id);

create index locations_fulfillment_warehouse_business_idx
  on public.locations (fulfillment_warehouse_id, business_id);

update public.locations as place
set fulfillment_warehouse_id = (
  select register.warehouse_id
  from public.registers as register
  join public.locations as warehouse
    on warehouse.id = register.warehouse_id
    and warehouse.business_id = register.business_id
    and warehouse.kind = 'warehouse'
  where register.location_id = place.id
    and register.business_id = place.business_id
  order by register.created_at, register.id
  limit 1
)
where place.kind in ('store', 'site')
  and place.fulfillment_warehouse_id is null;

update public.locations as place
set fulfillment_warehouse_id = (
  select warehouse.id
  from public.locations as warehouse
  where warehouse.business_id = place.business_id
    and warehouse.kind = 'warehouse'
    and warehouse.id <> place.id
  order by warehouse.created_at, warehouse.id
  limit 1
)
where place.kind in ('store', 'site')
  and place.fulfillment_warehouse_id is null;

update public.locations
set is_active = false
where kind in ('store', 'site')
  and fulfillment_warehouse_id is null
  and is_active;

create or replace function private.locations_check_fulfillment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_kind text;
begin
  if tg_op = 'UPDATE'
    and old.kind in ('store', 'site')
    and new.kind not in ('store', 'site')
    and exists (
      select 1
      from public.registers as register
      where register.location_id = new.id
        and register.business_id = new.business_id
    )
  then
    raise exception 'Move registers off this store before changing its kind';
  end if;

  if new.kind = 'warehouse' then
    new.fulfillment_warehouse_id := null;
    return new;
  end if;

  if new.kind not in ('store', 'site') then
    return new;
  end if;

  if new.fulfillment_warehouse_id is null then
    if new.is_active then
      raise exception 'An active store needs a warehouse';
    end if;
    return new;
  end if;

  select location.kind
  into v_kind
  from public.locations as location
  where location.id = new.fulfillment_warehouse_id
    and location.business_id = new.business_id;

  if v_kind is distinct from 'warehouse' then
    raise exception 'Choose a warehouse in this business';
  end if;

  return new;
end;
$$;

revoke all on function private.locations_check_fulfillment() from public, anon;
grant execute on function private.locations_check_fulfillment() to authenticated;

create trigger locations_check_fulfillment
  before insert or update of kind, is_active, fulfillment_warehouse_id, business_id
  on public.locations
  for each row
  execute function private.locations_check_fulfillment();

create or replace function private.locations_sync_registers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind in ('store', 'site')
    and new.fulfillment_warehouse_id is not null
    and (
      tg_op = 'INSERT'
      or new.fulfillment_warehouse_id is distinct from old.fulfillment_warehouse_id
    )
  then
    update public.registers as register
    set warehouse_id = new.fulfillment_warehouse_id
    where register.location_id = new.id
      and register.business_id = new.business_id
      and register.warehouse_id is distinct from new.fulfillment_warehouse_id;
  end if;

  return new;
end;
$$;

revoke all on function private.locations_sync_registers() from public, anon;
grant execute on function private.locations_sync_registers() to authenticated;

create trigger locations_sync_registers
  after insert or update of kind, fulfillment_warehouse_id
  on public.locations
  for each row
  execute function private.locations_sync_registers();

create or replace function private.registers_check_places()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_place text;
  v_expected uuid;
  v_warehouse text;
begin
  select location.kind, location.fulfillment_warehouse_id
  into v_place, v_expected
  from public.locations as location
  where location.id = new.location_id
    and location.business_id = new.business_id;

  if v_place is null or v_place not in ('store', 'site') then
    raise exception 'A register belongs to a store or site';
  end if;

  if v_expected is null or new.warehouse_id is distinct from v_expected then
    raise exception 'A register sells stock from its store warehouse';
  end if;

  select location.kind
  into v_warehouse
  from public.locations as location
  where location.id = new.warehouse_id
    and location.business_id = new.business_id;

  if v_warehouse is distinct from 'warehouse' then
    raise exception 'Attach a warehouse to this register';
  end if;

  return new;
end;
$$;

update public.registers as register
set warehouse_id = place.fulfillment_warehouse_id
from public.locations as place
where place.id = register.location_id
  and place.business_id = register.business_id
  and place.fulfillment_warehouse_id is not null
  and register.warehouse_id is distinct from place.fulfillment_warehouse_id;
