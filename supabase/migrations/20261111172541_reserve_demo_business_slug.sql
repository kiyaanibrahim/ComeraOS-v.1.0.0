create or replace function private.guard_reserved_business_slug()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if new.slug = 'demo'
     and new.owner_id is distinct from 'c0c0a000-0000-4000-8000-000000000001'::uuid then
    raise exception 'The demo business is reserved';
  end if;
  return new;
end;
$fn$;

create trigger businesses_guard_reserved_slug
  before insert or update on public.businesses
  for each row
  execute function private.guard_reserved_business_slug();

revoke all on function private.guard_reserved_business_slug() from public, anon, authenticated;
