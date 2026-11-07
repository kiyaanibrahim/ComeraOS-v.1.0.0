-- Sell -----------------------------------------------------------------------

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null references public.colonies (id) on delete cascade,
  location_id uuid,
  customer_id uuid,
  number text not null,
  status text not null default 'draft' check (status in ('draft', 'open', 'completed', 'cancelled')),
  source text not null default 'manual' check (source in ('pos', 'online', 'manual')),
  subtotal numeric(14, 2) not null default 0,
  tax numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (colony_id, number),
  unique (id, colony_id),
  foreign key (location_id, colony_id) references public.locations (id, colony_id) on delete restrict,
  foreign key (customer_id, colony_id) references public.customers (id, colony_id) on delete restrict
);

create table public.order_lines (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null,
  order_id uuid not null,
  product_id uuid,
  description text not null,
  quantity numeric(14, 3) not null default 1,
  unit_price numeric(14, 2) not null default 0,
  line_total numeric(14, 2) not null default 0,
  foreign key (order_id, colony_id) references public.orders (id, colony_id) on delete cascade,
  foreign key (product_id, colony_id) references public.products (id, colony_id) on delete restrict
);

create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null references public.colonies (id) on delete cascade,
  customer_id uuid,
  number text not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'declined', 'expired')),
  total numeric(14, 2) not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (colony_id, number),
  unique (id, colony_id),
  foreign key (customer_id, colony_id) references public.customers (id, colony_id) on delete restrict
);

create table public.quotation_lines (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null,
  quotation_id uuid not null,
  product_id uuid,
  description text not null,
  quantity numeric(14, 3) not null default 1,
  unit_price numeric(14, 2) not null default 0,
  line_total numeric(14, 2) not null default 0,
  foreign key (quotation_id, colony_id) references public.quotations (id, colony_id) on delete cascade,
  foreign key (product_id, colony_id) references public.products (id, colony_id) on delete restrict
);

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null references public.colonies (id) on delete cascade,
  order_id uuid,
  customer_id uuid,
  number text not null,
  status text not null default 'draft' check (status in ('draft', 'issued', 'paid', 'void')),
  subtotal numeric(14, 2) not null default 0,
  tax numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (colony_id, number),
  unique (id, colony_id),
  foreign key (order_id, colony_id) references public.orders (id, colony_id) on delete restrict,
  foreign key (customer_id, colony_id) references public.customers (id, colony_id) on delete restrict
);

create table public.bill_lines (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null,
  bill_id uuid not null,
  description text not null,
  quantity numeric(14, 3) not null default 1,
  unit_price numeric(14, 2) not null default 0,
  line_total numeric(14, 2) not null default 0,
  foreign key (bill_id, colony_id) references public.bills (id, colony_id) on delete cascade
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null references public.colonies (id) on delete cascade,
  order_id uuid,
  bill_id uuid,
  amount numeric(14, 2) not null,
  currency text not null default 'USD',
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'refunded')),
  provider text,
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (order_id, colony_id) references public.orders (id, colony_id) on delete restrict,
  foreign key (bill_id, colony_id) references public.bills (id, colony_id) on delete restrict
);

-- Supply and finance ---------------------------------------------------------

create table public.procurement_requests (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null references public.colonies (id) on delete cascade,
  supplier_id uuid,
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected', 'ordered')),
  needed_on date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, colony_id),
  foreign key (supplier_id, colony_id) references public.suppliers (id, colony_id) on delete restrict
);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null references public.colonies (id) on delete cascade,
  supplier_id uuid not null,
  request_id uuid,
  number text not null,
  status text not null default 'draft' check (status in ('draft', 'issued', 'received', 'cancelled')),
  total numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (colony_id, number),
  unique (id, colony_id),
  foreign key (supplier_id, colony_id) references public.suppliers (id, colony_id) on delete restrict,
  foreign key (request_id, colony_id) references public.procurement_requests (id, colony_id) on delete restrict
);

create table public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null,
  purchase_order_id uuid not null,
  product_id uuid,
  description text not null,
  quantity numeric(14, 3) not null default 1,
  unit_cost numeric(14, 2) not null default 0,
  line_total numeric(14, 2) not null default 0,
  foreign key (purchase_order_id, colony_id) references public.purchase_orders (id, colony_id) on delete cascade,
  foreign key (product_id, colony_id) references public.products (id, colony_id) on delete restrict
);

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null references public.colonies (id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  status text not null default 'pending' check (status in ('pending', 'in_transit', 'delivered', 'cancelled')),
  carrier text,
  tracking_number text,
  location_id uuid,
  order_id uuid,
  purchase_order_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (location_id, colony_id) references public.locations (id, colony_id) on delete restrict,
  foreign key (order_id, colony_id) references public.orders (id, colony_id) on delete restrict,
  foreign key (purchase_order_id, colony_id) references public.purchase_orders (id, colony_id) on delete restrict
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null references public.colonies (id) on delete cascade,
  vendor text not null,
  category text not null,
  amount numeric(14, 2) not null,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected')),
  spent_on date not null default current_date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.capital_entries (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null references public.colonies (id) on delete cascade,
  kind text not null check (kind in ('injection', 'asset', 'allocation')),
  description text not null,
  amount numeric(14, 2) not null,
  occurred_on date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null references public.colonies (id) on delete cascade,
  code text not null,
  name text not null,
  kind text not null check (kind in ('asset', 'liability', 'equity', 'income', 'expense')),
  created_at timestamptz not null default now(),
  unique (colony_id, code),
  unique (id, colony_id)
);

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null references public.colonies (id) on delete cascade,
  entry_date date not null default current_date,
  memo text,
  posted boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, colony_id)
);

create table public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null,
  entry_id uuid not null,
  account_id uuid not null,
  debit numeric(14, 2) not null default 0,
  credit numeric(14, 2) not null default 0,
  check (debit >= 0 and credit >= 0),
  check (debit = 0 or credit = 0),
  check (debit > 0 or credit > 0),
  foreign key (entry_id, colony_id) references public.journal_entries (id, colony_id) on delete cascade,
  foreign key (account_id, colony_id) references public.accounts (id, colony_id) on delete restrict
);

create table public.financial_reports (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null references public.colonies (id) on delete cascade,
  kind text not null,
  period_start date not null,
  period_end date not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Platform -------------------------------------------------------------------

create table public.capabilities (
  key text primary key,
  name text not null,
  description text not null,
  module text not null
);

create table public.colony_capabilities (
  colony_id uuid not null references public.colonies (id) on delete cascade,
  capability_key text not null references public.capabilities (key) on delete cascade,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (colony_id, capability_key)
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  price numeric(14, 2) not null default 0,
  interval text not null default 'month' check (interval in ('month', 'year')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.plan_capabilities (
  plan_id uuid not null references public.plans (id) on delete cascade,
  capability_key text not null references public.capabilities (key) on delete cascade,
  primary key (plan_id, capability_key)
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null references public.colonies (id) on delete cascade,
  plan_id uuid not null references public.plans (id) on delete restrict,
  status text not null default 'trialing' check (status in ('trialing', 'active', 'past_due', 'canceled')),
  current_period_end date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platform_invoices (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null references public.colonies (id) on delete cascade,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  number text not null,
  amount numeric(14, 2) not null,
  status text not null default 'open' check (status in ('open', 'paid', 'void')),
  due_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (colony_id, number)
);

create table public.registers (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null references public.colonies (id) on delete cascade,
  location_id uuid,
  name text not null,
  device_label text,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, colony_id),
  foreign key (location_id, colony_id) references public.locations (id, colony_id) on delete restrict
);

create table public.register_sessions (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null,
  register_id uuid not null,
  opened_by uuid references auth.users (id) on delete set null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_cash numeric(14, 2) not null default 0,
  closing_cash numeric(14, 2),
  status text not null default 'open' check (status in ('open', 'closed')),
  foreign key (register_id, colony_id) references public.registers (id, colony_id) on delete cascade
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid references public.colonies (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  checksum text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.health_checks (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid references public.colonies (id) on delete cascade,
  check_key text not null,
  status text not null check (status in ('ok', 'degraded', 'down')),
  detail text,
  checked_at timestamptz not null default now()
);

-- Indexes on foreign keys ----------------------------------------------------

create index portfolios_owner_id_idx on public.portfolios (owner_id);
create index portfolio_members_user_id_idx on public.portfolio_members (user_id);
create index colonies_portfolio_id_idx on public.colonies (portfolio_id);
create index colonies_owner_id_idx on public.colonies (owner_id);
create index roles_colony_id_idx on public.roles (colony_id);
create index role_permissions_permission_key_idx on public.role_permissions (permission_key);
create index colony_members_user_id_idx on public.colony_members (user_id);
create index colony_members_role_id_idx on public.colony_members (role_id);
create index locations_colony_id_idx on public.locations (colony_id);
create index customers_colony_id_idx on public.customers (colony_id);
create index deals_colony_id_idx on public.deals (colony_id);
create index deals_customer_id_idx on public.deals (customer_id);
create index crm_activities_colony_id_idx on public.crm_activities (colony_id);
create index crm_activities_customer_id_idx on public.crm_activities (customer_id);
create index crm_activities_deal_id_idx on public.crm_activities (deal_id);
create index crm_activities_created_by_idx on public.crm_activities (created_by);
create index suppliers_colony_id_idx on public.suppliers (colony_id);
create index categories_parent_id_idx on public.categories (parent_id);
create index products_category_id_idx on public.products (category_id);
create index batches_colony_id_idx on public.batches (colony_id);
create index batches_product_id_idx on public.batches (product_id);
create index batches_location_id_idx on public.batches (location_id);
create index inventory_movements_colony_id_idx on public.inventory_movements (colony_id);
create index inventory_movements_product_id_idx on public.inventory_movements (product_id);
create index inventory_movements_location_id_idx on public.inventory_movements (location_id);
create index inventory_movements_batch_id_idx on public.inventory_movements (batch_id);
create index inventory_movements_created_by_idx on public.inventory_movements (created_by);
create index orders_location_id_idx on public.orders (location_id);
create index orders_customer_id_idx on public.orders (customer_id);
create index orders_created_by_idx on public.orders (created_by);
create index orders_status_idx on public.orders (colony_id, status);
create index order_lines_order_id_idx on public.order_lines (order_id);
create index order_lines_colony_id_idx on public.order_lines (colony_id);
create index order_lines_product_id_idx on public.order_lines (product_id);
create index quotations_customer_id_idx on public.quotations (customer_id);
create index quotations_created_by_idx on public.quotations (created_by);
create index quotation_lines_quotation_id_idx on public.quotation_lines (quotation_id);
create index quotation_lines_colony_id_idx on public.quotation_lines (colony_id);
create index quotation_lines_product_id_idx on public.quotation_lines (product_id);
create index bills_order_id_idx on public.bills (order_id);
create index bills_customer_id_idx on public.bills (customer_id);
create index bill_lines_bill_id_idx on public.bill_lines (bill_id);
create index bill_lines_colony_id_idx on public.bill_lines (colony_id);
create index payments_colony_id_idx on public.payments (colony_id);
create index payments_order_id_idx on public.payments (order_id);
create index payments_bill_id_idx on public.payments (bill_id);
create index payments_status_idx on public.payments (colony_id, status);
create index procurement_requests_colony_id_idx on public.procurement_requests (colony_id);
create index procurement_requests_supplier_id_idx on public.procurement_requests (supplier_id);
create index procurement_requests_created_by_idx on public.procurement_requests (created_by);
create index purchase_orders_supplier_id_idx on public.purchase_orders (supplier_id);
create index purchase_orders_request_id_idx on public.purchase_orders (request_id);
create index purchase_order_lines_purchase_order_id_idx on public.purchase_order_lines (purchase_order_id);
create index purchase_order_lines_colony_id_idx on public.purchase_order_lines (colony_id);
create index purchase_order_lines_product_id_idx on public.purchase_order_lines (product_id);
create index shipments_colony_id_idx on public.shipments (colony_id);
create index shipments_location_id_idx on public.shipments (location_id);
create index shipments_order_id_idx on public.shipments (order_id);
create index shipments_purchase_order_id_idx on public.shipments (purchase_order_id);
create index expenses_colony_id_idx on public.expenses (colony_id);
create index expenses_created_by_idx on public.expenses (created_by);
create index capital_entries_colony_id_idx on public.capital_entries (colony_id);
create index journal_entries_colony_id_idx on public.journal_entries (colony_id);
create index journal_entries_created_by_idx on public.journal_entries (created_by);
create index journal_lines_colony_id_idx on public.journal_lines (colony_id);
create index journal_lines_entry_id_idx on public.journal_lines (entry_id);
create index journal_lines_account_id_idx on public.journal_lines (account_id);
create index financial_reports_colony_id_idx on public.financial_reports (colony_id);
create index plan_capabilities_capability_key_idx on public.plan_capabilities (capability_key);
create index subscriptions_colony_id_idx on public.subscriptions (colony_id);
create index subscriptions_plan_id_idx on public.subscriptions (plan_id);
create index platform_invoices_subscription_id_idx on public.platform_invoices (subscription_id);
create index registers_colony_id_idx on public.registers (colony_id);
create index registers_location_id_idx on public.registers (location_id);
create index register_sessions_colony_id_idx on public.register_sessions (colony_id);
create index register_sessions_register_id_idx on public.register_sessions (register_id);
create index register_sessions_opened_by_idx on public.register_sessions (opened_by);
create index audit_events_colony_id_idx on public.audit_events (colony_id, created_at desc);
create index audit_events_actor_id_idx on public.audit_events (actor_id);
create index health_checks_colony_id_idx on public.health_checks (colony_id, checked_at desc);

