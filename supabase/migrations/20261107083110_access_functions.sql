create or replace function private.is_platform_operator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_operators as operator
    where operator.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_colony_member(target_colony uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.colony_members as member
    where member.colony_id = target_colony
      and member.user_id = (select auth.uid())
      and member.status = 'active'
  );
$$;

create or replace function private.is_colony_admin(target_colony uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.colony_members as member
    where member.colony_id = target_colony
      and member.user_id = (select auth.uid())
      and member.status = 'active'
      and member.role_key in ('owner', 'admin')
  );
$$;

create or replace function private.shares_colony(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.colony_members as mine
    join public.colony_members as theirs on theirs.colony_id = mine.colony_id
    where mine.user_id = (select auth.uid())
      and mine.status = 'active'
      and theirs.user_id = target_user
      and theirs.status = 'active'
  );
$$;

create or replace function private.is_portfolio_member(target_portfolio uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.portfolio_members as member
    where member.portfolio_id = target_portfolio
      and member.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_portfolio_owner(target_portfolio uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.portfolios as portfolio
    where portfolio.id = target_portfolio
      and portfolio.owner_id = (select auth.uid())
  );
$$;

create or replace function private.apply_colony_access(target regclass, write_mode text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  qualified text := target::text;
  member text := 'private.is_colony_member(colony_id)';
  admin text := 'private.is_colony_admin(colony_id)';
  operator text := '(select private.is_platform_operator())';
  write_check text;
begin
  if write_mode not in ('staff', 'admin', 'append') then
    raise exception 'unknown write_mode %', write_mode;
  end if;

  execute format('alter table %s enable row level security', qualified);
  execute format('revoke all on table %s from public, anon, authenticated', qualified);

  if write_mode = 'append' then
    execute format('grant select, insert on table %s to authenticated', qualified);
  else
    execute format('grant select, insert, update, delete on table %s to authenticated', qualified);
  end if;

  execute format(
    'create policy select_colony on %s for select to authenticated using (%s or %s)',
    qualified, member, operator
  );

  write_check := case when write_mode = 'admin' then admin else member end;

  execute format(
    'create policy insert_colony on %s for insert to authenticated with check (%s or %s)',
    qualified, write_check, operator
  );

  if write_mode <> 'append' then
    execute format(
      'create policy update_colony on %s for update to authenticated using (%s or %s) with check (%s or %s)',
      qualified, write_check, operator, write_check, operator
    );
    execute format(
      'create policy delete_colony on %s for delete to authenticated using (%s or %s)',
      qualified, admin, operator
    );
  end if;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(split_part(new.email, '@', 1), 'Member'),
    new.email
  );
  insert into public.account_settings (user_id) values (new.id);
  return new;
end;
$$;

create or replace function private.sync_user_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set email = new.email
  where id = new.id;
  return new;
end;
$$;

create or replace function private.bootstrap_portfolio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.portfolio_members (portfolio_id, user_id, role_key)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

create or replace function private.bootstrap_colony()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_role uuid;
begin
  insert into public.colony_settings (colony_id) values (new.id);

  insert into public.roles (colony_id, key, name, is_system) values
    (new.id, 'owner', 'Owner', true),
    (new.id, 'admin', 'Admin', true),
    (new.id, 'manager', 'Manager', true),
    (new.id, 'staff', 'Staff', true);

  select id into owner_role
  from public.roles
  where colony_id = new.id and key = 'owner';

  insert into public.role_permissions (role_id, permission_key)
  select role.id, permission.key
  from public.roles as role
  join public.permissions as permission on true
  where role.colony_id = new.id
    and (
      (role.key in ('owner', 'admin') and permission.key not like 'platform.%')
      or (
        role.key = 'manager'
        and permission.key not like 'platform.%'
        and permission.key <> 'colony.staff'
      )
      or (role.key = 'staff' and permission.module in ('sell', 'inventory'))
    );

  insert into public.colony_members (colony_id, user_id, role_id, role_key, status)
  values (new.id, new.owner_id, owner_role, 'owner', 'active');

  insert into public.accounts (colony_id, code, name, kind) values
    (new.id, '1000', 'Cash', 'asset'),
    (new.id, '1200', 'Inventory', 'asset'),
    (new.id, '2000', 'Accounts payable', 'liability'),
    (new.id, '3000', 'Owner equity', 'equity'),
    (new.id, '4000', 'Sales', 'income'),
    (new.id, '5000', 'Operating expenses', 'expense');

  insert into public.colony_capabilities (colony_id, capability_key, enabled)
  select new.id, capability.key, true
  from public.capabilities as capability;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function private.sync_user_email();

create trigger portfolios_bootstrap
  after insert on public.portfolios
  for each row execute function private.bootstrap_portfolio();

create trigger colonies_bootstrap
  after insert on public.colonies
  for each row execute function private.bootstrap_colony();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'account_settings', 'portfolios', 'colonies', 'colony_settings',
    'roles', 'colony_members', 'locations', 'customers', 'deals', 'suppliers',
    'categories', 'products', 'catalog_entries', 'batches', 'inventory_balances',
    'orders', 'quotations', 'bills', 'payments', 'procurement_requests',
    'purchase_orders', 'shipments', 'expenses', 'capital_entries',
    'journal_entries', 'colony_capabilities', 'plans', 'subscriptions',
    'platform_invoices', 'registers'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function private.set_updated_at()',
      table_name || '_set_updated_at',
      table_name
    );
  end loop;
end $$;
