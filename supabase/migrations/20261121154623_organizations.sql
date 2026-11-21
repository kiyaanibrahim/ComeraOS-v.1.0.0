-- An organization is the incorporated company. Businesses operate under it.

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_name_not_blank check (length(btrim(name)) > 0)
);

create index organizations_owner_id_idx on public.organizations (owner_id);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function private.set_updated_at();

alter table public.organizations
  add column source_business_id uuid;

insert into public.organizations (name, owner_id, source_business_id)
select
  coalesce(nullif(btrim(settings.legal_name), ''), business.name),
  business.owner_id,
  business.id
from public.businesses as business
left join public.business_settings as settings on settings.business_id = business.id;

alter table public.businesses
  add column organization_id uuid;

update public.businesses as business
set organization_id = organization.id
from public.organizations as organization
where organization.source_business_id = business.id;

alter table public.organizations
  drop column source_business_id;

alter table public.businesses
  alter column organization_id set not null;

alter table public.businesses
  add constraint businesses_organization_id_fkey
  foreign key (organization_id) references public.organizations (id) on delete restrict;

create index businesses_organization_id_idx on public.businesses (organization_id);

update public.business_settings as settings
set legal_name = organization.name
from public.businesses as business
join public.organizations as organization on organization.id = business.organization_id
where settings.business_id = business.id
  and settings.legal_name is distinct from organization.name;

create or replace function private.sync_organization_legal_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.business_settings as settings
  set legal_name = organization.name
  from public.organizations as organization
  where settings.business_id = new.id
    and organization.id = new.organization_id;
  return new;
end;
$$;

create trigger sync_organization_legal_name
  after insert on public.businesses
  for each row execute function private.sync_organization_legal_name();

create or replace function private.rename_organization_legal_names()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.name is distinct from old.name then
    update public.business_settings as settings
    set legal_name = new.name
    from public.businesses as business
    where business.organization_id = new.id
      and settings.business_id = business.id;
  end if;
  return new;
end;
$$;

create trigger rename_organization_legal_names
  after update of name on public.organizations
  for each row execute function private.rename_organization_legal_names();

revoke all on function private.sync_organization_legal_name() from public, anon;
revoke all on function private.rename_organization_legal_names() from public, anon;

alter table public.organizations enable row level security;
revoke all on table public.organizations from public, anon, authenticated;
grant select, insert, update, delete on table public.organizations to authenticated;

create policy select_organization on public.organizations
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (select private.is_platform_operator())
    or exists (
      select 1
      from public.businesses as business
      where business.organization_id = organizations.id
        and private.is_business_member(business.id)
    )
  );

create policy insert_organization on public.organizations
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy update_organization on public.organizations
  for update to authenticated
  using (owner_id = (select auth.uid()) or (select private.is_platform_operator()))
  with check (owner_id = (select auth.uid()) or (select private.is_platform_operator()));

create policy delete_organization on public.organizations
  for delete to authenticated
  using (owner_id = (select auth.uid()) or (select private.is_platform_operator()));

drop policy insert_business on public.businesses;

create policy insert_business on public.businesses
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.organizations as organization
      where organization.id = organization_id
        and organization.owner_id = (select auth.uid())
    )
    and (
      portfolio_id is null
      or private.is_portfolio_member(portfolio_id)
    )
  );
