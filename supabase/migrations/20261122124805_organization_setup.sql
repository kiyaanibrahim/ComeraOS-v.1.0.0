-- Organization setup map: industries, places, store channel, and an employee directory.
-- The directory is not business membership. Stores and warehouses stay in locations.

create table public.organization_industries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_industries_name_not_blank check (length(btrim(name)) > 0),
  unique (id, organization_id)
);

create unique index organization_industries_name_key
  on public.organization_industries (organization_id, lower(btrim(name)));

create index organization_industries_organization_id_idx
  on public.organization_industries (organization_id);

create trigger organization_industries_set_updated_at
  before update on public.organization_industries
  for each row execute function private.set_updated_at();

alter table public.businesses
  add constraint businesses_id_organization_id_key unique (id, organization_id);

alter table public.businesses
  add column industry_id uuid;

alter table public.businesses
  add constraint businesses_industry_id_organization_id_fkey
  foreign key (industry_id, organization_id)
  references public.organization_industries (id, organization_id)
  on delete restrict;

create index businesses_industry_id_idx on public.businesses (industry_id);

create table public.places (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  address jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint places_name_not_blank check (length(btrim(name)) > 0),
  unique (id, business_id)
);

create index places_business_id_idx on public.places (business_id);

create trigger places_set_updated_at
  before update on public.places
  for each row execute function private.set_updated_at();

select private.apply_business_access('public.places', 'staff');

alter table public.locations
  add column place_id uuid,
  add column sales_channel text;

alter table public.locations
  add constraint locations_place_id_business_id_fkey
  foreign key (place_id, business_id)
  references public.places (id, business_id)
  on delete restrict;

alter table public.locations
  add constraint locations_sales_channel_check
  check (
    sales_channel is null
    or (
      kind in ('store', 'site')
      and sales_channel in ('physical', 'online', 'both')
    )
  );

create index locations_place_id_idx on public.locations (place_id);

create or replace function private.locations_prepare_channel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'warehouse' then
    new.sales_channel := null;
  elsif new.sales_channel is not null and new.sales_channel not in ('physical', 'online', 'both') then
    raise exception 'Choose physical, online, or both';
  end if;
  return new;
end;
$$;

revoke all on function private.locations_prepare_channel() from public, anon;

create trigger locations_prepare_channel
  before insert or update of kind, sales_channel
  on public.locations
  for each row
  execute function private.locations_prepare_channel();

create table public.organization_employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  display_name text not null,
  email text,
  phone text,
  job_title text,
  reports_to_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_employees_name_not_blank check (length(btrim(display_name)) > 0),
  constraint organization_employees_not_self check (reports_to_id is null or reports_to_id <> id),
  unique (id, organization_id),
  foreign key (reports_to_id, organization_id)
    references public.organization_employees (id, organization_id)
    on delete restrict
);

create index organization_employees_organization_id_idx
  on public.organization_employees (organization_id);

create index organization_employees_reports_to_id_idx
  on public.organization_employees (reports_to_id);

create trigger organization_employees_set_updated_at
  before update on public.organization_employees
  for each row execute function private.set_updated_at();

create or replace function private.employees_check_reports_to()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  current_id uuid;
  depth int := 0;
begin
  if new.reports_to_id is null then
    return new;
  end if;

  current_id := new.reports_to_id;
  while current_id is not null loop
    if current_id = new.id then
      raise exception 'Reporting line cannot loop';
    end if;
    depth := depth + 1;
    if depth > 50 then
      raise exception 'Reporting line is too deep';
    end if;
    select employee.reports_to_id
    into current_id
    from public.organization_employees as employee
    where employee.id = current_id
      and employee.organization_id = new.organization_id;
  end loop;

  return new;
end;
$$;

revoke all on function private.employees_check_reports_to() from public, anon;

create trigger employees_check_reports_to
  before insert or update of reports_to_id, organization_id
  on public.organization_employees
  for each row
  execute function private.employees_check_reports_to();

create table public.employee_store_assignments (
  employee_id uuid not null references public.organization_employees (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (employee_id, location_id)
);

create index employee_store_assignments_location_id_idx
  on public.employee_store_assignments (location_id);

create or replace function private.employee_store_assignments_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_org uuid;
  v_kind text;
  v_business_org uuid;
begin
  select employee.organization_id
  into v_org
  from public.organization_employees as employee
  where employee.id = new.employee_id;

  select location.kind, business.organization_id
  into v_kind, v_business_org
  from public.locations as location
  join public.businesses as business on business.id = location.business_id
  where location.id = new.location_id;

  if v_org is null or v_kind is null then
    raise exception 'Choose an employee and a store';
  end if;
  if v_kind not in ('store', 'site') then
    raise exception 'Staff are assigned to a store';
  end if;
  if v_business_org is distinct from v_org then
    raise exception 'That store is outside this organization';
  end if;

  return new;
end;
$$;

revoke all on function private.employee_store_assignments_check() from public, anon;

create trigger employee_store_assignments_check
  before insert or update of employee_id, location_id
  on public.employee_store_assignments
  for each row
  execute function private.employee_store_assignments_check();

alter table public.organization_industries enable row level security;
revoke all on table public.organization_industries from public, anon, authenticated;
grant select, insert, update, delete on table public.organization_industries to authenticated;

create policy select_organization_industry on public.organization_industries
  for select to authenticated
  using (private.can_read_organization(organization_id));

create policy insert_organization_industry on public.organization_industries
  for insert to authenticated
  with check (
    private.owns_organization(organization_id)
    or (select private.is_platform_operator())
  );

create policy update_organization_industry on public.organization_industries
  for update to authenticated
  using (
    private.owns_organization(organization_id)
    or (select private.is_platform_operator())
  )
  with check (
    private.owns_organization(organization_id)
    or (select private.is_platform_operator())
  );

create policy delete_organization_industry on public.organization_industries
  for delete to authenticated
  using (
    private.owns_organization(organization_id)
    or (select private.is_platform_operator())
  );

alter table public.organization_employees enable row level security;
revoke all on table public.organization_employees from public, anon, authenticated;
grant select, insert, update, delete on table public.organization_employees to authenticated;

create policy select_organization_employee on public.organization_employees
  for select to authenticated
  using (private.can_read_organization(organization_id));

create policy insert_organization_employee on public.organization_employees
  for insert to authenticated
  with check (
    private.owns_organization(organization_id)
    or (select private.is_platform_operator())
  );

create policy update_organization_employee on public.organization_employees
  for update to authenticated
  using (
    private.owns_organization(organization_id)
    or (select private.is_platform_operator())
  )
  with check (
    private.owns_organization(organization_id)
    or (select private.is_platform_operator())
  );

create policy delete_organization_employee on public.organization_employees
  for delete to authenticated
  using (
    private.owns_organization(organization_id)
    or (select private.is_platform_operator())
  );

alter table public.employee_store_assignments enable row level security;
revoke all on table public.employee_store_assignments from public, anon, authenticated;
grant select, insert, update, delete on table public.employee_store_assignments to authenticated;

create policy select_employee_store_assignment on public.employee_store_assignments
  for select to authenticated
  using (
    exists (
      select 1
      from public.organization_employees as employee
      where employee.id = employee_id
        and private.can_read_organization(employee.organization_id)
    )
  );

create policy insert_employee_store_assignment on public.employee_store_assignments
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.organization_employees as employee
      where employee.id = employee_id
        and (
          private.owns_organization(employee.organization_id)
          or (select private.is_platform_operator())
        )
    )
  );

create policy delete_employee_store_assignment on public.employee_store_assignments
  for delete to authenticated
  using (
    exists (
      select 1
      from public.organization_employees as employee
      where employee.id = employee_id
        and (
          private.owns_organization(employee.organization_id)
          or (select private.is_platform_operator())
        )
    )
  );
