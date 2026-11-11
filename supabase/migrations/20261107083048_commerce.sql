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
