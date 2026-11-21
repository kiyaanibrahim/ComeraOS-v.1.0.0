-- Keep organization checks out of table policies so businesses and organizations
-- do not re-enter each other's row security.

create or replace function private.owns_organization(target_organization uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organizations as organization
    where organization.id = target_organization
      and organization.owner_id = (select auth.uid())
  );
$$;

create or replace function private.can_read_organization(target_organization uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.owns_organization(target_organization)
    or (select private.is_platform_operator())
    or exists (
      select 1
      from public.businesses as business
      where business.organization_id = target_organization
        and private.is_business_member(business.id)
    );
$$;

revoke all on function private.owns_organization(uuid) from public, anon;
revoke all on function private.can_read_organization(uuid) from public, anon;
grant execute on function private.owns_organization(uuid) to authenticated;
grant execute on function private.can_read_organization(uuid) to authenticated;

drop policy insert_business on public.businesses;

create policy insert_business on public.businesses
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and private.owns_organization(organization_id)
    and (
      portfolio_id is null
      or private.is_portfolio_member(portfolio_id)
    )
  );

drop policy select_organization on public.organizations;

create policy select_organization on public.organizations
  for select to authenticated
  using (private.can_read_organization(id));
