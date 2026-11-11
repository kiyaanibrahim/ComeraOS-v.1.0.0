-- Demo Colony opens as the sidebar's Demo User. No sign-in form.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
select
  '00000000-0000-0000-0000-000000000000',
  'c0c0a000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'demo@comera.os',
  extensions.crypt('comera-demo-colony', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Demo User"}'::jsonb,
  now(),
  now(),
  '',
  '',
  '',
  ''
where not exists (
  select 1 from auth.users where email = 'demo@comera.os'
);

insert into auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  'c0c0a000-0000-4000-8000-000000000002',
  'c0c0a000-0000-4000-8000-000000000001',
  '{"sub":"c0c0a000-0000-4000-8000-000000000001","email":"demo@comera.os"}'::jsonb,
  'email',
  'c0c0a000-0000-4000-8000-000000000001',
  now(),
  now(),
  now()
where exists (
  select 1 from auth.users where id = 'c0c0a000-0000-4000-8000-000000000001'
)
and not exists (
  select 1 from auth.identities where user_id = 'c0c0a000-0000-4000-8000-000000000001' and provider = 'email'
);
