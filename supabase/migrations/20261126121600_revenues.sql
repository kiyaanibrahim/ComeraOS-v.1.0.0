-- Recognized revenue for the Financials revenue tab.

create table public.revenues (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  source text not null,
  category text not null,
  amount numeric(14, 2) not null,
  status text not null default 'draft' check (status in ('draft', 'recognized', 'void')),
  recognized_on date not null default current_date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index revenues_business_id_idx on public.revenues (business_id);
create index revenues_created_by_idx on public.revenues (created_by);

create trigger revenues_set_updated_at
  before update on public.revenues
  for each row execute function private.set_updated_at();

select private.apply_business_access('public.revenues', 'staff');

insert into public.permissions (key, module, description)
values ('finance.revenue', 'finance', 'Revenue')
on conflict (key) do update
set module = excluded.module, description = excluded.description;

insert into public.capabilities (key, name, description, module)
values ('revenue', 'Revenue', 'Recognized revenue', 'finance')
on conflict (key) do update
set name = excluded.name, description = excluded.description, module = excluded.module;

insert into public.plan_capabilities (plan_id, capability_key)
select plan.id, 'revenue'
from public.plans as plan
on conflict do nothing;

insert into public.business_capabilities (business_id, capability_key, enabled)
select business.id, 'revenue', true
from public.businesses as business
on conflict do nothing;

insert into public.role_permissions (role_id, permission_key)
select role.id, 'finance.revenue'
from public.roles as role
where role.key in ('owner', 'admin', 'manager')
on conflict do nothing;
