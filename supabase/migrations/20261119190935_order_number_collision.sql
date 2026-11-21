create or replace function private.unique_order_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_number integer;
  prefix text;
begin
  if exists (
    select 1
    from public.orders as sale
    where sale.business_id = new.business_id
      and sale.number = new.number
      and sale.id is distinct from new.id
  ) then
    select coalesce(max((regexp_match(sale.number, '(\d+)$'))[1]::integer), 0) + 1
      into next_number
    from public.orders as sale
    where sale.business_id = new.business_id;
    prefix := regexp_replace(new.number, '\d+$', '');
    new.number := prefix || lpad(next_number::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists orders_unique_number on public.orders;
create trigger orders_unique_number
  before insert on public.orders
  for each row
  execute function private.unique_order_number();