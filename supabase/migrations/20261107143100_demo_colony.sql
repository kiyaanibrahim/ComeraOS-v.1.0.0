insert into public.colonies (id, name, slug, owner_id)
select
  'c0c0a000-0000-4000-8000-000000000010',
  'Demo Colony',
  'demo',
  'c0c0a000-0000-4000-8000-000000000001'
where not exists (select 1 from public.colonies where slug = 'demo')
  and exists (
    select 1 from auth.users where id = 'c0c0a000-0000-4000-8000-000000000001'
  );
