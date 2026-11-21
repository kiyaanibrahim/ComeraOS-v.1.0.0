alter table public.register_sessions
  add column if not exists session_number integer,
  add column if not exists closed_by uuid,
  add column if not exists force_closed boolean not null default false;

with numbered as (
  select id, row_number() over (partition by business_id order by opened_at, id) as n
  from public.register_sessions
  where session_number is null
)
update public.register_sessions as session
set session_number = numbered.n
from numbered
where session.id = numbered.id
  and session.session_number is null;

create unique index if not exists register_sessions_business_number_idx
  on public.register_sessions (business_id, session_number);

create table if not exists public.register_cash_moves (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id),
  register_session_id uuid not null,
  kind text not null check (kind in ('in', 'out')),
  amount numeric(14, 2) not null check (amount > 0),
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (id, business_id),
  foreign key (register_session_id, business_id)
    references public.register_sessions (id, business_id)
);

create index if not exists register_cash_moves_business_id_idx
  on public.register_cash_moves (business_id);
create index if not exists register_cash_moves_session_idx
  on public.register_cash_moves (register_session_id);

do $guard$
begin
  if not exists (
    select 1
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'register_cash_moves'
      and relation.relrowsecurity
  ) then
    perform private.apply_business_access('public.register_cash_moves'::regclass, 'staff');
  end if;
end
$guard$;