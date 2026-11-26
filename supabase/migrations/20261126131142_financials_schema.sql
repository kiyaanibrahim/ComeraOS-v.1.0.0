-- Financials schema: chart, journals, expenses, capital, purchasing payments, bank reconciliation.

-- Chart of accounts expansions for existing and new businesses.
insert into public.accounts (business_id, code, name, kind)
select business.id, account.code, account.name, account.kind
from public.businesses as business
cross join (
  values
    ('1010', 'Bank', 'asset'),
    ('1100', 'Accounts receivable', 'asset'),
    ('1300', 'Input tax', 'asset'),
    ('1500', 'Fixed assets', 'asset'),
    ('1510', 'Accumulated depreciation', 'asset'),
    ('2100', 'Loans payable', 'liability'),
    ('2200', 'Output tax', 'liability'),
    ('3100', 'Owner drawings', 'equity'),
    ('4100', 'Other income', 'income'),
    ('5100', 'Cost of goods sold', 'expense'),
    ('5200', 'Depreciation', 'expense'),
    ('5300', 'Interest', 'expense'),
    ('5400', 'Payroll', 'expense'),
    ('5500', 'Inventory adjustments', 'expense'),
    ('5600', 'Cash over/short', 'expense')
) as account(code, name, kind)
on conflict (business_id, code) do nothing;

create or replace function private.seed_finance_accounts(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.accounts (business_id, code, name, kind) values
    (p_business_id, '1000', 'Cash', 'asset'),
    (p_business_id, '1010', 'Bank', 'asset'),
    (p_business_id, '1100', 'Accounts receivable', 'asset'),
    (p_business_id, '1200', 'Inventory', 'asset'),
    (p_business_id, '1300', 'Input tax', 'asset'),
    (p_business_id, '1500', 'Fixed assets', 'asset'),
    (p_business_id, '1510', 'Accumulated depreciation', 'asset'),
    (p_business_id, '2000', 'Accounts payable', 'liability'),
    (p_business_id, '2100', 'Loans payable', 'liability'),
    (p_business_id, '2200', 'Output tax', 'liability'),
    (p_business_id, '3000', 'Owner equity', 'equity'),
    (p_business_id, '3100', 'Owner drawings', 'equity'),
    (p_business_id, '4000', 'Sales', 'income'),
    (p_business_id, '4100', 'Other income', 'income'),
    (p_business_id, '5000', 'Operating expenses', 'expense'),
    (p_business_id, '5100', 'Cost of goods sold', 'expense'),
    (p_business_id, '5200', 'Depreciation', 'expense'),
    (p_business_id, '5300', 'Interest', 'expense'),
    (p_business_id, '5400', 'Payroll', 'expense'),
    (p_business_id, '5500', 'Inventory adjustments', 'expense'),
    (p_business_id, '5600', 'Cash over/short', 'expense')
  on conflict (business_id, code) do nothing;
end;
$$;

revoke all on function private.seed_finance_accounts(uuid) from public, anon;
grant execute on function private.seed_finance_accounts(uuid) to authenticated;

-- Journal provenance and register context.
alter table public.journal_entries
  add column if not exists source_type text,
  add column if not exists source_id uuid,
  add column if not exists event text,
  add column if not exists reverses_entry_id uuid,
  add column if not exists location_id uuid,
  add column if not exists register_id uuid,
  add column if not exists register_session_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'journal_entries_reverses_entry_id_fkey'
  ) then
    alter table public.journal_entries
      add constraint journal_entries_reverses_entry_id_fkey
      foreign key (reverses_entry_id, business_id)
      references public.journal_entries (id, business_id)
      on delete restrict;
  end if;
end $$;

create unique index if not exists journal_entries_source_event_uidx
  on public.journal_entries (business_id, source_type, source_id, event)
  where source_type is not null and source_id is not null and event is not null;

create index if not exists journal_entries_location_id_idx on public.journal_entries (location_id);
create index if not exists journal_entries_register_session_id_idx on public.journal_entries (register_session_id);
create index if not exists journal_entries_source_id_idx on public.journal_entries (source_id);

-- Capital equity kinds.
alter table public.capital_entries drop constraint if exists capital_entries_kind_check;
alter table public.capital_entries
  add constraint capital_entries_kind_check
  check (kind in ('injection', 'asset', 'allocation', 'contribution', 'withdrawal', 'investment'));

alter table public.capital_entries
  add column if not exists location_id uuid,
  add column if not exists journal_entry_id uuid,
  add column if not exists bank_account_id uuid;

-- Expenses: payment tracking, schedules, loan link.
alter table public.expenses drop constraint if exists expenses_status_check;
alter table public.expenses
  add constraint expenses_status_check
  check (status in (
    'draft', 'submitted', 'approved', 'rejected',
    'upcoming', 'unpaid', 'partially_paid', 'paid', 'overdue', 'void'
  ));

alter table public.expenses
  add column if not exists location_id uuid,
  add column if not exists due_on date,
  add column if not exists amount_paid numeric(14, 2) not null default 0,
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'loan', 'payroll', 'schedule')),
  add column if not exists schedule_id uuid,
  add column if not exists loan_id uuid,
  add column if not exists principal_amount numeric(14, 2) not null default 0,
  add column if not exists interest_amount numeric(14, 2) not null default 0,
  add column if not exists account_id uuid,
  add column if not exists notes text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'expenses_id_business_id_key'
  ) then
    alter table public.expenses add constraint expenses_id_business_id_key unique (id, business_id);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'shipments_id_business_id_key'
  ) then
    alter table public.shipments add constraint shipments_id_business_id_key unique (id, business_id);
  end if;
end $$;

create table if not exists public.expense_schedules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  vendor text not null,
  category text not null,
  amount numeric(14, 2) not null,
  frequency text not null check (frequency in ('weekly', 'monthly', 'quarterly', 'yearly')),
  kind text not null check (kind in ('fixed', 'ongoing')),
  start_on date not null,
  end_on date,
  installment_count integer,
  next_on date not null,
  generated_count integer not null default 0,
  status text not null default 'active' check (status in ('active', 'paused', 'discontinued')),
  account_id uuid,
  location_id uuid,
  loan_id uuid,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id)
);

create index expense_schedules_business_id_idx on public.expense_schedules (business_id);
create index expense_schedules_loan_id_idx on public.expense_schedules (loan_id);
create index expense_schedules_next_on_idx on public.expense_schedules (next_on);

create trigger expense_schedules_set_updated_at
  before update on public.expense_schedules
  for each row execute function private.set_updated_at();

alter table public.expenses
  drop constraint if exists expenses_schedule_id_fkey;
alter table public.expenses
  add constraint expenses_schedule_id_fkey
  foreign key (schedule_id, business_id)
  references public.expense_schedules (id, business_id)
  on delete set null;

create table if not exists public.expense_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  expense_id uuid not null,
  amount numeric(14, 2) not null check (amount > 0),
  paid_on date not null default current_date,
  method text not null default 'cash' check (method in ('cash', 'card', 'bank_transfer')),
  bank_account_id uuid,
  notes text,
  journal_entry_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, business_id),
  foreign key (expense_id, business_id) references public.expenses (id, business_id) on delete cascade
);

create index expense_payments_business_id_idx on public.expense_payments (business_id);
create index expense_payments_expense_id_idx on public.expense_payments (expense_id);

create table if not exists public.expense_files (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  expense_id uuid not null,
  file_path text not null,
  file_name text not null,
  content_type text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (expense_id, business_id) references public.expenses (id, business_id) on delete cascade
);

create index expense_files_business_id_idx on public.expense_files (business_id);
create index expense_files_expense_id_idx on public.expense_files (expense_id);

-- Purchasing payments and returns (procurement remains source of stock).
create table if not exists public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  shipment_id uuid not null,
  amount numeric(14, 2) not null check (amount > 0),
  paid_on date not null default current_date,
  method text not null default 'bank_transfer' check (method in ('cash', 'card', 'bank_transfer')),
  bank_account_id uuid,
  notes text,
  journal_entry_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, business_id),
  foreign key (shipment_id, business_id) references public.shipments (id, business_id) on delete cascade
);

create index supplier_payments_business_id_idx on public.supplier_payments (business_id);
create index supplier_payments_shipment_id_idx on public.supplier_payments (shipment_id);

create table if not exists public.shipment_returns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  shipment_id uuid not null,
  number text not null,
  status text not null default 'posted' check (status in ('draft', 'posted', 'void')),
  amount numeric(14, 2) not null default 0,
  returned_on date not null default current_date,
  notes text,
  journal_entry_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, number),
  unique (id, business_id),
  foreign key (shipment_id, business_id) references public.shipments (id, business_id) on delete restrict
);

create index shipment_returns_business_id_idx on public.shipment_returns (business_id);
create index shipment_returns_shipment_id_idx on public.shipment_returns (shipment_id);

create trigger shipment_returns_set_updated_at
  before update on public.shipment_returns
  for each row execute function private.set_updated_at();

create table if not exists public.shipment_return_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  return_id uuid not null,
  shipment_line_id uuid,
  product_id uuid,
  description text not null,
  quantity numeric(14, 3) not null check (quantity > 0),
  unit_cost numeric(14, 2) not null default 0,
  line_total numeric(14, 2) not null default 0,
  foreign key (return_id, business_id) references public.shipment_returns (id, business_id) on delete cascade
);

create index shipment_return_lines_business_id_idx on public.shipment_return_lines (business_id);
create index shipment_return_lines_return_id_idx on public.shipment_return_lines (return_id);

alter table public.shipment_lines
  add column if not exists capitalize boolean not null default false;

-- Capital assets and loans.
create table if not exists public.fixed_assets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  category text not null default 'equipment',
  acquisition_cost numeric(14, 2) not null,
  residual_value numeric(14, 2) not null default 0,
  useful_life_months integer not null default 36 check (useful_life_months > 0),
  acquired_on date not null default current_date,
  disposed_on date,
  status text not null default 'active' check (status in ('active', 'disposed')),
  accumulated_depreciation numeric(14, 2) not null default 0,
  location_id uuid,
  shipment_id uuid,
  shipment_line_id uuid,
  acquisition_journal_id uuid,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id)
);

create index fixed_assets_business_id_idx on public.fixed_assets (business_id);
create index fixed_assets_shipment_id_idx on public.fixed_assets (shipment_id);
create unique index fixed_assets_shipment_line_uidx
  on public.fixed_assets (business_id, shipment_line_id)
  where shipment_line_id is not null;

create trigger fixed_assets_set_updated_at
  before update on public.fixed_assets
  for each row execute function private.set_updated_at();

create table if not exists public.depreciation_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  asset_id uuid not null,
  amount numeric(14, 2) not null check (amount > 0),
  period_on date not null,
  journal_entry_id uuid,
  created_at timestamptz not null default now(),
  unique (business_id, asset_id, period_on),
  unique (id, business_id),
  foreign key (asset_id, business_id) references public.fixed_assets (id, business_id) on delete cascade
);

create index depreciation_entries_business_id_idx on public.depreciation_entries (business_id);
create index depreciation_entries_asset_id_idx on public.depreciation_entries (asset_id);

create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  lender text not null,
  principal numeric(14, 2) not null check (principal > 0),
  outstanding numeric(14, 2) not null,
  interest_rate numeric(8, 4) not null default 0,
  start_on date not null default current_date,
  end_on date,
  installment_count integer,
  installment_amount numeric(14, 2),
  frequency text not null default 'monthly' check (frequency in ('weekly', 'monthly', 'quarterly', 'yearly')),
  next_on date,
  status text not null default 'active' check (status in ('active', 'paid', 'defaulted', 'cancelled')),
  location_id uuid,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id)
);

create index loans_business_id_idx on public.loans (business_id);

create trigger loans_set_updated_at
  before update on public.loans
  for each row execute function private.set_updated_at();

alter table public.expenses
  drop constraint if exists expenses_loan_id_fkey;
alter table public.expenses
  add constraint expenses_loan_id_fkey
  foreign key (loan_id, business_id)
  references public.loans (id, business_id)
  on delete set null;

alter table public.expense_schedules
  drop constraint if exists expense_schedules_loan_id_fkey;
alter table public.expense_schedules
  add constraint expense_schedules_loan_id_fkey
  foreign key (loan_id, business_id)
  references public.loans (id, business_id)
  on delete set null;

-- Bank accounts and statement lines for reconciliation.
create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  institution text,
  account_number_last4 text,
  currency text not null default 'USD',
  ledger_account_id uuid not null,
  opening_balance numeric(14, 2) not null default 0,
  status text not null default 'active' check (status in ('active', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id),
  foreign key (ledger_account_id, business_id) references public.accounts (id, business_id) on delete restrict
);

create index bank_accounts_business_id_idx on public.bank_accounts (business_id);

create trigger bank_accounts_set_updated_at
  before update on public.bank_accounts
  for each row execute function private.set_updated_at();

create table if not exists public.bank_statement_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  bank_account_id uuid not null,
  posted_on date not null,
  description text not null,
  amount numeric(14, 2) not null,
  status text not null default 'open' check (status in ('open', 'matched', 'adjusted')),
  matched_payment_id uuid,
  matched_supplier_payment_id uuid,
  matched_expense_payment_id uuid,
  journal_entry_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, business_id),
  foreign key (bank_account_id, business_id) references public.bank_accounts (id, business_id) on delete cascade
);

create index bank_statement_lines_business_id_idx on public.bank_statement_lines (business_id);
create index bank_statement_lines_bank_account_id_idx on public.bank_statement_lines (bank_account_id);

alter table public.register_sessions
  add column if not exists reconciled boolean not null default false,
  add column if not exists reconciliation_journal_id uuid;

-- Expense categories mapped to accounts.
create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  account_id uuid not null,
  created_at timestamptz not null default now(),
  unique (business_id, name),
  unique (id, business_id),
  foreign key (account_id, business_id) references public.accounts (id, business_id) on delete restrict
);

create index expense_categories_business_id_idx on public.expense_categories (business_id);

insert into public.expense_categories (business_id, name, account_id)
select business.id, 'Operating', account.id
from public.businesses as business
join public.accounts as account
  on account.business_id = business.id
 and account.code = '5000'
on conflict (business_id, name) do nothing;

-- General ledger view (posted lines by account).
create or replace view public.general_ledger
with (security_invoker = true)
as
select
  line.id,
  line.business_id,
  line.account_id,
  account.code as account_code,
  account.name as account_name,
  account.kind as account_kind,
  entry.id as entry_id,
  entry.entry_date,
  entry.memo,
  entry.source_type,
  entry.source_id,
  entry.event,
  entry.location_id,
  entry.register_id,
  entry.register_session_id,
  line.debit,
  line.credit,
  entry.posted,
  entry.created_at
from public.journal_lines as line
join public.journal_entries as entry
  on entry.id = line.entry_id
 and entry.business_id = line.business_id
join public.accounts as account
  on account.id = line.account_id
 and account.business_id = line.business_id
where entry.posted = true;

grant select on public.general_ledger to authenticated;

-- Permission helper.
create or replace function private.has_business_permission(target_business uuid, permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_operator()
    or exists (
      select 1
      from public.business_members as member
      join public.role_permissions as grant_row
        on grant_row.role_id = member.role_id
      where member.business_id = target_business
        and member.user_id = (select auth.uid())
        and member.status = 'active'
        and grant_row.permission_key = permission
    )
    or private.is_business_admin(target_business);
$$;

revoke all on function private.has_business_permission(uuid, text) from public, anon;
grant execute on function private.has_business_permission(uuid, text) to authenticated;

-- RLS for new tables.
select private.apply_business_access('public.expense_schedules', 'staff');
select private.apply_business_access('public.expense_payments', 'staff');
select private.apply_business_access('public.expense_files', 'staff');
select private.apply_business_access('public.supplier_payments', 'staff');
select private.apply_business_access('public.shipment_returns', 'staff');
select private.apply_business_access('public.shipment_return_lines', 'staff');
select private.apply_business_access('public.fixed_assets', 'admin');
select private.apply_business_access('public.depreciation_entries', 'admin');
select private.apply_business_access('public.loans', 'admin');
select private.apply_business_access('public.bank_accounts', 'admin');
select private.apply_business_access('public.bank_statement_lines', 'admin');
select private.apply_business_access('public.expense_categories', 'staff');

-- Keep bootstrap chart current for new businesses.
create or replace function private.bootstrap_business()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_role uuid;
begin
  insert into public.business_settings (business_id) values (new.id);

  insert into public.roles (business_id, key, name, is_system) values
    (new.id, 'owner', 'Owner', true),
    (new.id, 'admin', 'Admin', true),
    (new.id, 'manager', 'Manager', true),
    (new.id, 'staff', 'Staff', true);

  select id into owner_role
  from public.roles
  where business_id = new.id and key = 'owner';

  insert into public.role_permissions (role_id, permission_key)
  select role.id, permission.key
  from public.roles as role
  join public.permissions as permission on true
  where role.business_id = new.id
    and (
      (role.key in ('owner', 'admin') and permission.key not like 'platform.%')
      or (
        role.key = 'manager'
        and permission.key not like 'platform.%'
        and permission.key <> 'business.staff'
      )
      or (role.key = 'staff' and permission.module in ('sell', 'inventory'))
    );

  insert into public.business_members (business_id, user_id, role_id, role_key, status)
  values (new.id, new.owner_id, owner_role, 'owner', 'active');

  perform private.seed_finance_accounts(new.id);

  insert into public.business_capabilities (business_id, capability_key, enabled)
  select new.id, capability.key, true
  from public.capabilities as capability;

  return new;
end;
$$;
