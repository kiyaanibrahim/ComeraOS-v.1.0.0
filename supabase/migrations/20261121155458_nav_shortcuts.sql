create table public.nav_shortcuts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null,
  path text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (business_id, user_id, path),
  check (char_length(label) <= 80),
  check (path = '' or (char_length(label) between 1 and 80 and path ~ '^[a-z0-9]+(?:/[a-z0-9-]+)*$'))
);

create index nav_shortcuts_business_id_idx on public.nav_shortcuts (business_id);
create index nav_shortcuts_user_id_idx on public.nav_shortcuts (user_id);

alter table public.nav_shortcuts enable row level security;
revoke all on table public.nav_shortcuts from public, anon, authenticated;
grant select, insert, update, delete on table public.nav_shortcuts to authenticated;

create policy select_own_shortcut on public.nav_shortcuts
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and (private.is_business_member(business_id) or (select private.is_platform_operator()))
  );

create policy insert_own_shortcut on public.nav_shortcuts
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (private.is_business_member(business_id) or (select private.is_platform_operator()))
  );

create policy update_own_shortcut on public.nav_shortcuts
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and (private.is_business_member(business_id) or (select private.is_platform_operator()))
  )
  with check (
    user_id = (select auth.uid())
    and (private.is_business_member(business_id) or (select private.is_platform_operator()))
  );

create policy delete_own_shortcut on public.nav_shortcuts
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and (private.is_business_member(business_id) or (select private.is_platform_operator()))
  );