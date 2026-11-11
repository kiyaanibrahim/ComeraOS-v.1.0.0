select private.apply_colony_access('public.locations', 'staff');
select private.apply_colony_access('public.customers', 'staff');
select private.apply_colony_access('public.deals', 'staff');
select private.apply_colony_access('public.crm_activities', 'append');
select private.apply_colony_access('public.suppliers', 'staff');
select private.apply_colony_access('public.categories', 'staff');
select private.apply_colony_access('public.products', 'staff');
select private.apply_colony_access('public.catalog_entries', 'staff');
select private.apply_colony_access('public.batches', 'staff');
select private.apply_colony_access('public.inventory_balances', 'staff');
select private.apply_colony_access('public.inventory_movements', 'append');
select private.apply_colony_access('public.orders', 'staff');
select private.apply_colony_access('public.order_lines', 'staff');
select private.apply_colony_access('public.quotations', 'staff');
select private.apply_colony_access('public.quotation_lines', 'staff');
select private.apply_colony_access('public.bills', 'staff');
select private.apply_colony_access('public.bill_lines', 'staff');
select private.apply_colony_access('public.payments', 'staff');
select private.apply_colony_access('public.procurement_requests', 'staff');
select private.apply_colony_access('public.purchase_orders', 'staff');
select private.apply_colony_access('public.purchase_order_lines', 'staff');
select private.apply_colony_access('public.shipments', 'staff');
select private.apply_colony_access('public.expenses', 'staff');
select private.apply_colony_access('public.capital_entries', 'admin');
select private.apply_colony_access('public.accounts', 'admin');
select private.apply_colony_access('public.journal_entries', 'admin');
select private.apply_colony_access('public.journal_lines', 'admin');
select private.apply_colony_access('public.financial_reports', 'append');
select private.apply_colony_access('public.colony_capabilities', 'admin');
select private.apply_colony_access('public.subscriptions', 'admin');
select private.apply_colony_access('public.platform_invoices', 'admin');
select private.apply_colony_access('public.registers', 'admin');
select private.apply_colony_access('public.register_sessions', 'staff');
select private.apply_colony_access('public.audit_events', 'append');

alter table public.health_checks enable row level security;
revoke all on table public.health_checks from public, anon, authenticated;
grant select, insert on table public.health_checks to authenticated;

create policy select_health on public.health_checks
  for select to authenticated
  using (
    colony_id is null
    or private.is_colony_member(colony_id)
    or (select private.is_platform_operator())
  );

create policy insert_health on public.health_checks
  for insert to authenticated
  with check (
    (select private.is_platform_operator())
    or (colony_id is not null and private.is_colony_admin(colony_id))
  );

alter table public.profiles enable row level security;
revoke all on table public.profiles from public, anon, authenticated;
grant select (id, display_name, email, phone, avatar_url, created_at, updated_at) on public.profiles to authenticated;
grant update (display_name, phone, avatar_url) on public.profiles to authenticated;

create policy select_profile on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or private.shares_colony(id)
    or (select private.is_platform_operator())
  );

create policy update_profile on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter table public.account_settings enable row level security;
revoke all on table public.account_settings from public, anon, authenticated;
grant select, update on table public.account_settings to authenticated;

create policy select_account_settings on public.account_settings
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_platform_operator()));

create policy update_account_settings on public.account_settings
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter table public.platform_operators enable row level security;
revoke all on table public.platform_operators from public, anon, authenticated;
grant select on table public.platform_operators to authenticated;

create policy select_own_operator on public.platform_operators
  for select to authenticated
  using (user_id = (select auth.uid()));

alter table public.portfolios enable row level security;
revoke all on table public.portfolios from public, anon, authenticated;
grant select, insert, update, delete on table public.portfolios to authenticated;

create policy select_portfolio on public.portfolios
  for select to authenticated
  using (
    private.is_portfolio_member(id)
    or owner_id = (select auth.uid())
    or (select private.is_platform_operator())
  );

create policy insert_portfolio on public.portfolios
  for insert to authenticated
  with check (owner_id = (select auth.uid()) or (select private.is_platform_operator()));

create policy update_portfolio on public.portfolios
  for update to authenticated
  using (private.is_portfolio_owner(id) or (select private.is_platform_operator()))
  with check (private.is_portfolio_owner(id) or (select private.is_platform_operator()));

create policy delete_portfolio on public.portfolios
  for delete to authenticated
  using (private.is_portfolio_owner(id) or (select private.is_platform_operator()));

alter table public.portfolio_members enable row level security;
revoke all on table public.portfolio_members from public, anon, authenticated;
grant select, insert, update, delete on table public.portfolio_members to authenticated;

create policy select_portfolio_member on public.portfolio_members
  for select to authenticated
  using (private.is_portfolio_member(portfolio_id) or (select private.is_platform_operator()));

create policy insert_portfolio_member on public.portfolio_members
  for insert to authenticated
  with check (private.is_portfolio_owner(portfolio_id) or (select private.is_platform_operator()));

create policy update_portfolio_member on public.portfolio_members
  for update to authenticated
  using (private.is_portfolio_owner(portfolio_id) or (select private.is_platform_operator()))
  with check (private.is_portfolio_owner(portfolio_id) or (select private.is_platform_operator()));

create policy delete_portfolio_member on public.portfolio_members
  for delete to authenticated
  using (private.is_portfolio_owner(portfolio_id) or (select private.is_platform_operator()));

alter table public.colonies enable row level security;
revoke all on table public.colonies from public, anon, authenticated;
grant select, insert, update, delete on table public.colonies to authenticated;

create policy select_colony on public.colonies
  for select to authenticated
  using (
    private.is_colony_member(id)
    or (portfolio_id is not null and private.is_portfolio_member(portfolio_id))
    or (select private.is_platform_operator())
  );

create policy insert_colony on public.colonies
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (
      portfolio_id is null
      or private.is_portfolio_member(portfolio_id)
    )
  );

create policy update_colony on public.colonies
  for update to authenticated
  using (private.is_colony_admin(id) or (select private.is_platform_operator()))
  with check (private.is_colony_admin(id) or (select private.is_platform_operator()));

create policy delete_colony on public.colonies
  for delete to authenticated
  using (private.is_colony_admin(id) or (select private.is_platform_operator()));

alter table public.colony_settings enable row level security;
revoke all on table public.colony_settings from public, anon, authenticated;
grant select, update on table public.colony_settings to authenticated;

create policy select_colony_settings on public.colony_settings
  for select to authenticated
  using (private.is_colony_member(colony_id) or (select private.is_platform_operator()));

create policy update_colony_settings on public.colony_settings
  for update to authenticated
  using (private.is_colony_admin(colony_id) or (select private.is_platform_operator()))
  with check (private.is_colony_admin(colony_id) or (select private.is_platform_operator()));

alter table public.colony_members enable row level security;
revoke all on table public.colony_members from public, anon, authenticated;
grant select, insert, update, delete on table public.colony_members to authenticated;

create policy select_colony_member on public.colony_members
  for select to authenticated
  using (private.is_colony_member(colony_id) or (select private.is_platform_operator()));

create policy insert_colony_member on public.colony_members
  for insert to authenticated
  with check (private.is_colony_admin(colony_id) or (select private.is_platform_operator()));

create policy update_colony_member on public.colony_members
  for update to authenticated
  using (private.is_colony_admin(colony_id) or (select private.is_platform_operator()))
  with check (private.is_colony_admin(colony_id) or (select private.is_platform_operator()));

create policy delete_colony_member on public.colony_members
  for delete to authenticated
  using (private.is_colony_admin(colony_id) or (select private.is_platform_operator()));

alter table public.roles enable row level security;
revoke all on table public.roles from public, anon, authenticated;
grant select, insert, update, delete on table public.roles to authenticated;

create policy select_role on public.roles
  for select to authenticated
  using (private.is_colony_member(colony_id) or (select private.is_platform_operator()));

create policy insert_role on public.roles
  for insert to authenticated
  with check (private.is_colony_admin(colony_id) or (select private.is_platform_operator()));

create policy update_role on public.roles
  for update to authenticated
  using (private.is_colony_admin(colony_id) or (select private.is_platform_operator()))
  with check (private.is_colony_admin(colony_id) or (select private.is_platform_operator()));

create policy delete_role on public.roles
  for delete to authenticated
  using (private.is_colony_admin(colony_id) or (select private.is_platform_operator()));

alter table public.role_permissions enable row level security;
revoke all on table public.role_permissions from public, anon, authenticated;
grant select, insert, update, delete on table public.role_permissions to authenticated;

create policy select_role_permission on public.role_permissions
  for select to authenticated
  using (
    exists (
      select 1
      from public.roles as role
      where role.id = role_id
        and (
          private.is_colony_member(role.colony_id)
          or (select private.is_platform_operator())
        )
    )
  );

create policy insert_role_permission on public.role_permissions
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.roles as role
      where role.id = role_id
        and (
          private.is_colony_admin(role.colony_id)
          or (select private.is_platform_operator())
        )
    )
  );

create policy update_role_permission on public.role_permissions
  for update to authenticated
  using (
    exists (
      select 1 from public.roles as role
      where role.id = role_id
        and (private.is_colony_admin(role.colony_id) or (select private.is_platform_operator()))
    )
  )
  with check (
    exists (
      select 1 from public.roles as role
      where role.id = role_id
        and (private.is_colony_admin(role.colony_id) or (select private.is_platform_operator()))
    )
  );

create policy delete_role_permission on public.role_permissions
  for delete to authenticated
  using (
    exists (
      select 1 from public.roles as role
      where role.id = role_id
        and (private.is_colony_admin(role.colony_id) or (select private.is_platform_operator()))
    )
  );

alter table public.permissions enable row level security;
revoke all on table public.permissions from public, anon, authenticated;
grant select on table public.permissions to authenticated;

create policy select_permission on public.permissions
  for select to authenticated
  using (true);

create policy write_permission on public.permissions
  for all to authenticated
  using ((select private.is_platform_operator()))
  with check ((select private.is_platform_operator()));

alter table public.capabilities enable row level security;
revoke all on table public.capabilities from public, anon, authenticated;
grant select on table public.capabilities to authenticated;

create policy select_capability on public.capabilities
  for select to authenticated
  using (true);

create policy write_capability on public.capabilities
  for all to authenticated
  using ((select private.is_platform_operator()))
  with check ((select private.is_platform_operator()));

alter table public.plans enable row level security;
revoke all on table public.plans from public, anon, authenticated;
grant select on table public.plans to authenticated;

create policy select_plan on public.plans
  for select to authenticated
  using (true);

create policy write_plan on public.plans
  for all to authenticated
  using ((select private.is_platform_operator()))
  with check ((select private.is_platform_operator()));

alter table public.plan_capabilities enable row level security;
revoke all on table public.plan_capabilities from public, anon, authenticated;
grant select on table public.plan_capabilities to authenticated;

create policy select_plan_capability on public.plan_capabilities
  for select to authenticated
  using (true);

create policy write_plan_capability on public.plan_capabilities
  for all to authenticated
  using ((select private.is_platform_operator()))
  with check ((select private.is_platform_operator()));

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_platform_operator() to authenticated;
grant execute on function private.is_colony_member(uuid) to authenticated;
grant execute on function private.is_colony_admin(uuid) to authenticated;
grant execute on function private.shares_colony(uuid) to authenticated;
grant execute on function private.is_portfolio_member(uuid) to authenticated;
grant execute on function private.is_portfolio_owner(uuid) to authenticated;
grant usage on schema private to supabase_auth_admin;
grant execute on function private.handle_new_user() to authenticated, supabase_auth_admin;
grant execute on function private.sync_user_email() to authenticated, supabase_auth_admin;
grant execute on function private.bootstrap_portfolio() to authenticated;
grant execute on function private.bootstrap_colony() to authenticated;
grant execute on function private.set_updated_at() to authenticated;

insert into public.permissions (key, module, description) values
  ('sell.pos', 'sell', 'Point of sale'),
  ('sell.orders', 'sell', 'Orders'),
  ('sell.quotations', 'sell', 'Quotations'),
  ('sell.payments', 'sell', 'Online payments'),
  ('sell.bills', 'sell', 'Bills'),
  ('crm.customers', 'crm', 'Customers and pipeline'),
  ('ops.locations', 'ops', 'Locations'),
  ('ops.shipments', 'ops', 'Shipments'),
  ('ops.procurement', 'ops', 'Procurement'),
  ('inventory.stock', 'inventory', 'Inventory'),
  ('inventory.products', 'inventory', 'Products'),
  ('inventory.catalog', 'inventory', 'Catalogue'),
  ('inventory.categories', 'inventory', 'Categories'),
  ('inventory.batches', 'inventory', 'Batches'),
  ('finance.purchasing', 'finance', 'Purchasing'),
  ('finance.expenses', 'finance', 'Expenses'),
  ('finance.capital', 'finance', 'Capital'),
  ('finance.accounting', 'finance', 'Accounting'),
  ('finance.reporting', 'finance', 'Reporting'),
  ('colony.settings', 'colony', 'Colony settings'),
  ('colony.staff', 'colony', 'Staff and access'),
  ('platform.capabilities', 'platform', 'Capability registry'),
  ('platform.catalogue', 'platform', 'Commercial catalogue'),
  ('platform.billing', 'platform', 'Subscription billing'),
  ('platform.register', 'platform', 'Registers'),
  ('platform.health', 'platform', 'Platform health'),
  ('platform.integrity', 'platform', 'Integrity engine');

insert into public.capabilities (key, name, description, module) values
  ('pos', 'Point of sale', 'Sell in person at a register', 'sell'),
  ('orders', 'Orders', 'Order ledger and drafts', 'sell'),
  ('quotations', 'Quotations', 'Quotes and conversion', 'sell'),
  ('payments', 'Payments', 'Inbound payment intents', 'sell'),
  ('bills', 'Bills', 'Customer invoices and receipts', 'sell'),
  ('crm', 'CRM', 'Customers, deals, and activity', 'crm'),
  ('locations', 'Locations', 'Stores, warehouses, and sites', 'ops'),
  ('shipments', 'Shipments', 'Inbound and outbound logistics', 'ops'),
  ('procurement', 'Procurement', 'Purchase requests', 'ops'),
  ('inventory', 'Inventory', 'Stock balances and movements', 'inventory'),
  ('products', 'Products', 'SKU master', 'inventory'),
  ('catalog', 'Catalog', 'Sellable catalogue', 'inventory'),
  ('categories', 'Categories', 'Product taxonomy', 'inventory'),
  ('batches', 'Batches', 'Lot tracking', 'inventory'),
  ('purchasing', 'Purchasing', 'Purchase orders', 'finance'),
  ('expenses', 'Expenses', 'Operating expenses', 'finance'),
  ('capital', 'Capital', 'Capital and assets', 'finance'),
  ('accounting', 'Accounting', 'Ledger and chart of accounts', 'finance'),
  ('reporting', 'Reporting', 'Saved financial reports', 'finance');

insert into public.plans (code, name, price, interval, active)
values ('colony', 'Colony', 0, 'month', true);

insert into public.plan_capabilities (plan_id, capability_key)
select plan.id, capability.key
from public.plans as plan
cross join public.capabilities as capability
where plan.code = 'colony';
