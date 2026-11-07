-- ComeraOS tenant schema.
-- public: Data API tables, every one with row level security.
-- private: helper functions. This schema is not exposed to the Data API.

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Identity -------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  email text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.account_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  locale text not null default 'en',
  timezone text not null default 'UTC',
  marketing_emails boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.platform_operators (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Constellation and colony ---------------------------------------------------

create table public.portfolios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.portfolio_members (
  portfolio_id uuid not null references public.portfolios (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role_key text not null default 'member' check (role_key in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (portfolio_id, user_id)
);

create table public.colonies (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid references public.portfolios (id) on delete restrict,
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active', 'archived')),
  timezone text not null default 'UTC',
  currency text not null default 'USD',
  locale text not null default 'en',
  owner_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, portfolio_id)
);

create table public.colony_settings (
  colony_id uuid primary key references public.colonies (id) on delete cascade,
  legal_name text,
  tax_id text,
  address jsonb not null default '{}'::jsonb,
  invoice_prefix text not null default 'INV',
  order_prefix text not null default 'ORD',
  updated_at timestamptz not null default now()
);

create table public.permissions (
  key text primary key,
  module text not null,
  description text not null
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null references public.colonies (id) on delete cascade,
  key text not null,
  name text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (colony_id, key),
  unique (id, colony_id)
);

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  primary key (role_id, permission_key)
);

create table public.colony_members (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null references public.colonies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role_id uuid,
  role_key text not null check (role_key in ('owner', 'admin', 'manager', 'staff')),
  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (colony_id, user_id),
  foreign key (role_id, colony_id) references public.roles (id, colony_id) on delete restrict
);

-- Places, people, catalogue --------------------------------------------------

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null references public.colonies (id) on delete cascade,
  name text not null,
  kind text not null default 'store' check (kind in ('store', 'warehouse', 'site')),
  address jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, colony_id)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null references public.colonies (id) on delete cascade,
  name text not null,
  email text,
  phone text,
  notes text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, colony_id)
);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null references public.colonies (id) on delete cascade,
  customer_id uuid,
  title text not null,
  stage text not null default 'lead' check (stage in ('lead', 'qualified', 'proposal', 'won', 'lost')),
  amount numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (customer_id, colony_id) references public.customers (id, colony_id) on delete restrict
);

create table public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null references public.colonies (id) on delete cascade,
  customer_id uuid,
  deal_id uuid references public.deals (id) on delete set null,
  kind text not null default 'note',
  body text not null,
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (customer_id, colony_id) references public.customers (id, colony_id) on delete restrict
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null references public.colonies (id) on delete cascade,
  name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, colony_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null references public.colonies (id) on delete cascade,
  parent_id uuid,
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (colony_id, slug),
  unique (id, colony_id),
  foreign key (parent_id, colony_id) references public.categories (id, colony_id) on delete restrict
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null references public.colonies (id) on delete cascade,
  category_id uuid,
  sku text not null,
  name text not null,
  description text,
  price numeric(14, 2) not null default 0,
  cost numeric(14, 2) not null default 0,
  track_inventory boolean not null default true,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (colony_id, sku),
  unique (id, colony_id),
  foreign key (category_id, colony_id) references public.categories (id, colony_id) on delete restrict
);

create table public.catalog_entries (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null references public.colonies (id) on delete cascade,
  product_id uuid not null,
  is_visible boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (colony_id, product_id),
  foreign key (product_id, colony_id) references public.products (id, colony_id) on delete cascade
);

create table public.batches (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null references public.colonies (id) on delete cascade,
  product_id uuid not null,
  location_id uuid not null,
  lot_code text not null,
  quantity numeric(14, 3) not null default 0,
  expires_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (colony_id, product_id, lot_code),
  foreign key (product_id, colony_id) references public.products (id, colony_id) on delete restrict,
  foreign key (location_id, colony_id) references public.locations (id, colony_id) on delete restrict
);

create table public.inventory_balances (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null references public.colonies (id) on delete cascade,
  product_id uuid not null,
  location_id uuid not null,
  quantity numeric(14, 3) not null default 0,
  updated_at timestamptz not null default now(),
  unique (colony_id, product_id, location_id),
  foreign key (product_id, colony_id) references public.products (id, colony_id) on delete restrict,
  foreign key (location_id, colony_id) references public.locations (id, colony_id) on delete restrict
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null references public.colonies (id) on delete cascade,
  product_id uuid not null,
  location_id uuid not null,
  batch_id uuid references public.batches (id) on delete restrict,
  quantity numeric(14, 3) not null,
  reason text not null,
  reference text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (product_id, colony_id) references public.products (id, colony_id) on delete restrict,
  foreign key (location_id, colony_id) references public.locations (id, colony_id) on delete restrict
);

