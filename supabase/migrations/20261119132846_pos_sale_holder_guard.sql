create or replace function private.pos_sale_requires_holder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.source = 'pos' and new.status = 'completed' and new.register_session_id is not null then
    if not exists (
      select 1
      from public.register_sessions as session
      where session.id = new.register_session_id
        and session.business_id = new.business_id
        and session.opened_by = (select auth.uid())
    ) then
      raise exception 'This register is open on another login';
    end if;
  end if;
  return new;
end;
$fn$;

drop trigger if exists pos_sale_requires_holder on public.orders;
create trigger pos_sale_requires_holder
  before insert or update on public.orders
  for each row
  execute function private.pos_sale_requires_holder();