alter table public.business_settings add column if not exists tax_rate numeric(6, 3) not null default 0;
alter table public.business_settings drop constraint if exists business_settings_tax_rate_check;
alter table public.business_settings add constraint business_settings_tax_rate_check check (tax_rate >= 0 and tax_rate <= 100);
alter table public.orders add column if not exists discount numeric(14, 2) not null default 0;
alter table public.bills add column if not exists discount numeric(14, 2) not null default 0;
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (status in ('draft', 'open', 'held', 'completed', 'cancelled', 'void'));
alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check check (status in ('pending', 'succeeded', 'failed', 'refunded', 'void'));
create unique index if not exists orders_one_held_register_idx on public.orders (register_id) where status = 'held' and register_id is not null;
create table if not exists public.sale_returns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  bill_id uuid not null,
  order_id uuid not null,
  number text not null,
  method text not null,
  amount numeric(14, 2) not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, business_id),
  unique (business_id, number),
  foreign key (bill_id, business_id) references public.bills (id, business_id),
  foreign key (order_id, business_id) references public.orders (id, business_id)
);
create table if not exists public.sale_return_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  return_id uuid not null,
  order_line_id uuid,
  product_id uuid,
  description text not null,
  quantity numeric(14, 3) not null,
  unit_price numeric(14, 2) not null,
  line_total numeric(14, 2) not null,
  foreign key (return_id, business_id) references public.sale_returns (id, business_id) on delete cascade,
  foreign key (product_id, business_id) references public.products (id, business_id)
);
create index if not exists sale_returns_business_id_idx on public.sale_returns (business_id);
create index if not exists sale_returns_bill_id_idx on public.sale_returns (bill_id);
create index if not exists sale_returns_order_id_idx on public.sale_returns (order_id);
create index if not exists sale_return_lines_business_id_idx on public.sale_return_lines (business_id);
create index if not exists sale_return_lines_return_id_idx on public.sale_return_lines (return_id);
create index if not exists sale_return_lines_order_line_id_idx on public.sale_return_lines (order_line_id);
alter table public.sale_returns enable row level security;
alter table public.sale_return_lines enable row level security;
revoke all on table public.sale_returns from public, anon, authenticated;
revoke all on table public.sale_return_lines from public, anon, authenticated;
grant select on table public.sale_returns to authenticated;
grant select on table public.sale_return_lines to authenticated;
drop policy if exists select_business on public.sale_returns;
create policy select_business on public.sale_returns for select to authenticated using (private.is_business_member(business_id) or (select private.is_platform_operator()));
drop policy if exists select_business on public.sale_return_lines;
create policy select_business on public.sale_return_lines for select to authenticated using (private.is_business_member(business_id) or (select private.is_platform_operator()));