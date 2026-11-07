-- Rename the tenant vocabulary in place. Rows, keys, and policies stay attached.

do $rename$
declare
  rec record;
  new_name text;
  definition text;
  leftover text;
begin
  for rec in
    select n.nspname as schema_name, c.relname as table_name
    from pg_attribute as attribute
    join pg_class as c on c.oid = attribute.attrelid
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and attribute.attname = 'colony_id'
      and attribute.attnum > 0
      and not attribute.attisdropped
  loop
    execute format(
      'alter table %I.%I rename column colony_id to business_id',
      rec.schema_name,
      rec.table_name
    );
  end loop;

  alter table public.colony_capabilities rename to business_capabilities;
  alter table public.colony_settings rename to business_settings;
  alter table public.colony_members rename to business_members;
  alter table public.colonies rename to businesses;

  insert into public.permissions (key, module, description)
  values
    ('business.settings', 'business', 'Business settings'),
    ('business.staff', 'business', 'Staff and access')
  on conflict (key) do update
  set module = excluded.module, description = excluded.description;

  update public.role_permissions
  set permission_key = 'business.settings'
  where permission_key = 'colony.settings';

  update public.role_permissions
  set permission_key = 'business.staff'
  where permission_key = 'colony.staff';

  delete from public.permissions
  where key in ('colony.settings', 'colony.staff');

  update public.permissions
  set description = 'Features'
  where key = 'platform.capabilities';

  update public.permissions
  set description = 'Plans'
  where key = 'platform.catalogue';

  update public.permissions
  set description = 'POS sessions'
  where key = 'platform.register';

  update public.permissions
  set description = 'Health'
  where key = 'platform.health';

  update public.permissions
  set description = 'Audit'
  where key = 'platform.integrity';

  update public.capabilities
  set description = 'Sell in person at the counter'
  where key = 'pos';

  update public.plans
  set name = case code
    when 'core' then 'Starter'
    when 'colony' then 'Complete'
    when 'cosmos' then 'Owner'
    else name
  end
  where code in ('core', 'colony', 'cosmos');

  alter function private.is_colony_member(uuid) rename to is_business_member;
  alter function private.is_colony_admin(uuid) rename to is_business_admin;
  alter function private.shares_colony(uuid) rename to shares_business;
  alter function private.apply_colony_access(regclass, text) rename to apply_business_access;
  alter function private.bootstrap_colony() rename to bootstrap_business;

  for rec in
    select p.oid
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prokind = 'f'
      and position('colony' in pg_get_functiondef(p.oid)) > 0
  loop
    definition := pg_get_functiondef(rec.oid);
    -- Argument names cannot change with CREATE OR REPLACE. Hold them aside.
    definition := replace(definition, 'p_colony_id', '__KEEP_P_COLONY_ID__');
    definition := replace(definition, 'target_colony', '__KEEP_TARGET_COLONY__');
    definition := replace(definition, 'p_colony', '__KEEP_P_COLONY__');
    definition := replace(definition, 'colony_capabilities', 'business_capabilities');
    definition := replace(definition, 'colony_settings', 'business_settings');
    definition := replace(definition, 'colony_members', 'business_members');
    definition := replace(definition, 'colony_id', 'business_id');
    definition := replace(definition, 'colonies', 'businesses');
    definition := replace(definition, 'is_colony_member', 'is_business_member');
    definition := replace(definition, 'is_colony_admin', 'is_business_admin');
    definition := replace(definition, 'apply_colony_access', 'apply_business_access');
    definition := replace(definition, 'bootstrap_colony', 'bootstrap_business');
    definition := replace(definition, 'shares_colony', 'shares_business');
    definition := replace(definition, 'select_colony', 'select_business');
    definition := replace(definition, 'insert_colony', 'insert_business');
    definition := replace(definition, 'update_colony', 'update_business');
    definition := replace(definition, 'delete_colony', 'delete_business');
    definition := replace(definition, 'v_colony', 'v_business');
    definition := replace(definition, 'this colony', 'this business');
    definition := replace(definition, 'This colony', 'This business');
    definition := replace(definition, '__KEEP_P_COLONY_ID__', 'p_colony_id');
    definition := replace(definition, '__KEEP_TARGET_COLONY__', 'target_colony');
    definition := replace(definition, '__KEEP_P_COLONY__', 'p_colony');
    definition := replace(definition, 'colony.', 'business.');
    definition := replace(definition, ' as colony', ' as business');
    execute definition;
  end loop;

  execute 'drop function public.create_inbound_shipment(uuid, uuid, jsonb, uuid, text, text, date, text, jsonb)';
  execute 'drop function public.complete_pos_sale(uuid, uuid, jsonb)';

  execute $public_fns$
    create or replace function public.create_inbound_shipment(
      p_business_id uuid,
      p_location_id uuid,
      p_lines jsonb,
      p_supplier_id uuid default null,
      p_carrier text default null,
      p_tracking_number text default null,
      p_expected_on date default null,
      p_allocation_method text default 'value',
      p_charges jsonb default '[]'::jsonb
    ) returns uuid
    language plpgsql
    security invoker
    set search_path = ''
    as $fn$
    begin
      return private.create_inbound_shipment(
        p_business_id,
        p_location_id,
        p_lines,
        p_supplier_id,
        p_carrier,
        p_tracking_number,
        p_expected_on,
        p_allocation_method,
        p_charges
      );
    end;
    $fn$;

    create or replace function public.complete_pos_sale(
      p_business_id uuid,
      p_location_id uuid,
      p_lines jsonb
    ) returns jsonb
    language plpgsql
    security invoker
    set search_path = ''
    as $fn$
    begin
      return private.complete_pos_sale(p_business_id, p_location_id, p_lines);
    end;
    $fn$;
  $public_fns$;

  execute 'revoke all on function public.create_inbound_shipment(uuid, uuid, jsonb, uuid, text, text, date, text, jsonb) from public, anon';
  execute 'revoke all on function public.complete_pos_sale(uuid, uuid, jsonb) from public, anon';
  execute 'grant execute on function public.create_inbound_shipment(uuid, uuid, jsonb, uuid, text, text, date, text, jsonb) to authenticated';
  execute 'grant execute on function public.complete_pos_sale(uuid, uuid, jsonb) to authenticated';

  for rec in
    select c.relname as table_name, t.tgname as trigger_name
    from pg_trigger as t
    join pg_class as c on c.oid = t.tgrelid
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and not t.tgisinternal
      and t.tgname ilike '%colony%'
  loop
    new_name := replace(rec.trigger_name, 'colonies', 'businesses');
    new_name := replace(new_name, 'colony', 'business');
    execute format(
      'alter trigger %I on public.%I rename to %I',
      rec.trigger_name,
      rec.table_name,
      new_name
    );
  end loop;

  for rec in
    select pol.polrelid::regclass as table_name, pol.polname as policy_name
    from pg_policy as pol
    where pol.polname ilike '%colony%'
  loop
    new_name := replace(rec.policy_name, 'colony', 'business');
    execute format(
      'alter policy %I on %s rename to %I',
      rec.policy_name,
      rec.table_name,
      new_name
    );
  end loop;

  for rec in
    select con.conrelid::regclass as table_name, con.conname as constraint_name
    from pg_constraint as con
    join pg_namespace as n on n.oid = con.connamespace
    where n.nspname = 'public'
      and con.conname ilike '%colony%'
  loop
    new_name := replace(rec.constraint_name, 'colony_id', 'business_id');
    new_name := replace(new_name, 'colonies', 'businesses');
    new_name := replace(new_name, 'colony', 'business');
    execute format(
      'alter table %s rename constraint %I to %I',
      rec.table_name,
      rec.constraint_name,
      new_name
    );
  end loop;

  for rec in
    select c.relname as index_name
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'i'
      and c.relname ilike '%colony%'
  loop
    new_name := replace(rec.index_name, 'colony_id', 'business_id');
    new_name := replace(new_name, 'colonies', 'businesses');
    new_name := replace(new_name, 'colony', 'business');
    if new_name <> rec.index_name
      and not exists (
        select 1
        from pg_class as existing
        join pg_namespace as existing_ns on existing_ns.oid = existing.relnamespace
        where existing_ns.nspname = 'public'
          and existing.relname = new_name
      )
    then
      execute format('alter index public.%I rename to %I', rec.index_name, new_name);
    end if;
  end loop;

  select string_agg(format('%s.%s', n.nspname, p.proname), ', ')
  into leftover
  from pg_proc as p
  join pg_namespace as n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and p.prokind = 'f'
    and position(
      'colony' in replace(replace(replace(pg_get_functiondef(p.oid), 'p_colony_id', ''), 'target_colony', ''), 'p_colony', '')
    ) > 0;

  if leftover is not null then
    raise exception 'Function bodies still say colony: %', leftover;
  end if;

  select string_agg(format('%s.%s', c.relname, a.attname), ', ')
  into leftover
  from pg_attribute as a
  join pg_class as c on c.oid = a.attrelid
  join pg_namespace as n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and a.attnum > 0
    and not a.attisdropped
    and a.attname ilike '%colony%';

  if leftover is not null then
    raise exception 'Columns still say colony: %', leftover;
  end if;

  select string_agg(c.relname, ', ')
  into leftover
  from pg_class as c
  join pg_namespace as n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname ilike '%colony%';

  if leftover is not null then
    raise exception 'Tables still say colony: %', leftover;
  end if;

  select string_agg(format('%s.%s', pol.polrelid::regclass, pol.polname), ', ')
  into leftover
  from pg_policy as pol
  where coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') ilike '%colony%'
    or coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') ilike '%colony%';

  if leftover is not null then
    raise exception 'Policies still say colony: %', leftover;
  end if;
end
$rename$;

notify pgrst, 'reload schema';
