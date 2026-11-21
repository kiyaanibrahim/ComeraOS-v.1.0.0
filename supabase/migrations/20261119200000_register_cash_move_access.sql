do $guard$
begin
  if not exists (
    select 1
    from pg_policy as policy
    join pg_class as relation on relation.oid = policy.polrelid
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'register_cash_moves'
  ) then
    perform private.apply_business_access('public.register_cash_moves'::regclass, 'staff');
  end if;
end
$guard$;
