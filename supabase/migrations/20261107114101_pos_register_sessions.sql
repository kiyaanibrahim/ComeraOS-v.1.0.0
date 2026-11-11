-- POS register sessions: open with cash, pay by method, close with a count.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'register_sessions_id_business_id_key'
  ) then
    alter table public.register_sessions
      add constraint register_sessions_id_business_id_key unique (id, business_id);
  end if;
end $$;

alter table public.register_sessions
  add column if not exists opening_count jsonb not null default '{}'::jsonb,
  add column if not exists closing_count jsonb,
  add column if not exists expected_cash numeric(14, 2),
  add column if not exists counted_cash numeric(14, 2),
  add column if not exists cash_difference numeric(14, 2);

create unique index if not exists register_sessions_one_open_idx
  on public.register_sessions (register_id)
  where status = 'open';

alter table public.orders
  add column if not exists register_session_id uuid,
  add column if not exists notes text;

alter table public.orders
  drop constraint if exists orders_register_session_id_business_id_fkey;

alter table public.orders
  add constraint orders_register_session_id_business_id_fkey
  foreign key (register_session_id, business_id)
  references public.register_sessions (id, business_id)
  on delete restrict;

create index if not exists orders_register_session_id_idx on public.orders (register_session_id);
create index if not exists orders_register_session_business_idx on public.orders (register_session_id, business_id);

alter table public.payments
  add column if not exists method text,
  add column if not exists register_session_id uuid,
  add column if not exists tendered numeric(14, 2),
  add column if not exists change_amount numeric(14, 2);

update public.payments
set method = case lower(coalesce(provider, ''))
  when 'cash' then 'cash'
  when 'card' then 'card'
  when 'bank' then 'bank_transfer'
  when 'bank_transfer' then 'bank_transfer'
  else 'card'
end
where method is null;

alter table public.payments
  alter column method set default 'card';

alter table public.payments
  alter column method set not null;

alter table public.payments
  drop constraint if exists payments_method_check;

alter table public.payments
  add constraint payments_method_check
  check (method in ('cash', 'card', 'bank_transfer'));

alter table public.payments
  drop constraint if exists payments_register_session_id_business_id_fkey;

alter table public.payments
  add constraint payments_register_session_id_business_id_fkey
  foreign key (register_session_id, business_id)
  references public.register_sessions (id, business_id)
  on delete restrict;

create index if not exists payments_register_session_id_idx on public.payments (register_session_id);
create index if not exists payments_register_session_business_idx on public.payments (register_session_id, business_id);
create index if not exists payments_method_idx on public.payments (business_id, method);
