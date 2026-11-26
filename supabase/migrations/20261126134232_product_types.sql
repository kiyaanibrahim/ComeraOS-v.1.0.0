-- Product types: standard, variable, bundle, and sellable variants.

-- ---------------------------------------------------------------------------
-- Catalog columns
-- ---------------------------------------------------------------------------

alter table public.products
  drop constraint if exists products_status_check;

alter table public.products
  add column if not exists product_type text not null default 'standard',
  add column if not exists parent_id uuid,
  add column if not exists barcode text,
  add column if not exists brand_id uuid,
  add column if not exists unit text not null default 'each',
  add column if not exists tax_mode text not null default 'inherit',
  add column if not exists tax_rate numeric(6, 3),
  add column if not exists variant_key text;

update public.products
set product_type = 'standard'
where product_type is null or product_type = '';

alter table public.products
  add constraint products_product_type_check
    check (product_type in ('standard', 'variable', 'bundle', 'variant')),
  add constraint products_status_check
    check (status in ('active', 'inactive', 'archived')),
  add constraint products_tax_mode_check
    check (tax_mode in ('inherit', 'exempt', 'custom')),
  add constraint products_tax_rate_check
    check (
      (tax_mode = 'custom' and tax_rate is not null and tax_rate >= 0 and tax_rate <= 100)
      or (tax_mode <> 'custom' and tax_rate is null)
    ),
  add constraint products_parent_type_check
    check (
      (product_type = 'variant' and parent_id is not null and variant_key is not null)
      or (product_type <> 'variant' and parent_id is null and variant_key is null)
    );

alter table public.products
  add constraint products_parent_id_business_id_fkey
    foreign key (parent_id, business_id) references public.products (id, business_id) on delete cascade;

create unique index if not exists products_business_id_barcode_key
  on public.products (business_id, barcode)
  where barcode is not null and length(btrim(barcode)) > 0;

create unique index if not exists products_parent_id_variant_key_key
  on public.products (parent_id, variant_key)
  where parent_id is not null and variant_key is not null;

create index if not exists products_parent_id_idx on public.products (parent_id);
create index if not exists products_brand_id_idx on public.products (brand_id);
create index if not exists products_product_type_business_idx on public.products (business_id, product_type);

-- ---------------------------------------------------------------------------
-- Brands
-- ---------------------------------------------------------------------------

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name),
  unique (id, business_id)
);

create index if not exists brands_business_id_idx on public.brands (business_id);

alter table public.products
  add constraint products_brand_id_business_id_fkey
    foreign key (brand_id, business_id) references public.brands (id, business_id) on delete set null;

select private.apply_business_access('public.brands', 'staff');

-- ---------------------------------------------------------------------------
-- Options and variant value links
-- ---------------------------------------------------------------------------

create table if not exists public.product_options (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  product_id uuid not null,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (product_id, name),
  unique (id, business_id),
  unique (id, product_id),
  foreign key (product_id, business_id) references public.products (id, business_id) on delete cascade
);

create index if not exists product_options_product_id_idx on public.product_options (product_id);
create index if not exists product_options_business_id_idx on public.product_options (business_id);

create table if not exists public.product_option_values (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  option_id uuid not null,
  value text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (option_id, value),
  unique (id, business_id),
  unique (id, option_id),
  foreign key (option_id, business_id) references public.product_options (id, business_id) on delete cascade
);

create index if not exists product_option_values_option_id_idx on public.product_option_values (option_id);
create index if not exists product_option_values_business_id_idx on public.product_option_values (business_id);

create table if not exists public.product_variant_values (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  variant_id uuid not null,
  option_id uuid not null,
  option_value_id uuid not null,
  created_at timestamptz not null default now(),
  unique (variant_id, option_id),
  unique (id, business_id),
  foreign key (variant_id, business_id) references public.products (id, business_id) on delete cascade,
  foreign key (option_id, business_id) references public.product_options (id, business_id) on delete cascade,
  foreign key (option_value_id, option_id) references public.product_option_values (id, option_id) on delete cascade
);

create index if not exists product_variant_values_variant_id_idx on public.product_variant_values (variant_id);
create index if not exists product_variant_values_option_id_idx on public.product_variant_values (option_id);
create index if not exists product_variant_values_option_value_id_idx on public.product_variant_values (option_value_id);
create index if not exists product_variant_values_business_id_idx on public.product_variant_values (business_id);

select private.apply_business_access('public.product_options', 'staff');
select private.apply_business_access('public.product_option_values', 'staff');
select private.apply_business_access('public.product_variant_values', 'staff');

-- ---------------------------------------------------------------------------
-- Bundle components
-- ---------------------------------------------------------------------------

create table if not exists public.bundle_components (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  bundle_id uuid not null,
  component_id uuid not null,
  quantity numeric(14, 3) not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (bundle_id, component_id),
  unique (id, business_id),
  foreign key (bundle_id, business_id) references public.products (id, business_id) on delete cascade,
  foreign key (component_id, business_id) references public.products (id, business_id) on delete restrict,
  check (bundle_id <> component_id)
);

create index if not exists bundle_components_bundle_id_idx on public.bundle_components (bundle_id);
create index if not exists bundle_components_component_id_idx on public.bundle_components (component_id);
create index if not exists bundle_components_business_id_idx on public.bundle_components (business_id);

select private.apply_business_access('public.bundle_components', 'staff');

create or replace function private.enforce_bundle_component()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bundle_type text;
  v_component_type text;
begin
  select product.product_type into v_bundle_type
  from public.products as product
  where product.id = new.bundle_id and product.business_id = new.business_id;
  if v_bundle_type is distinct from 'bundle' then
    raise exception 'Only bundle products can have components';
  end if;
  select product.product_type into v_component_type
  from public.products as product
  where product.id = new.component_id and product.business_id = new.business_id;
  if v_component_type is null then
    raise exception 'Bundle component must belong to this business';
  end if;
  if v_component_type not in ('standard', 'variant') then
    raise exception 'Bundles can only include standard products or variants';
  end if;
  return new;
end;
$$;

drop trigger if exists bundle_components_enforce on public.bundle_components;
create trigger bundle_components_enforce
  before insert or update on public.bundle_components
  for each row execute function private.enforce_bundle_component();

-- ---------------------------------------------------------------------------
-- Product images + storage
-- ---------------------------------------------------------------------------

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  product_id uuid not null,
  path text not null,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, business_id),
  foreign key (product_id, business_id) references public.products (id, business_id) on delete cascade
);

create index if not exists product_images_product_id_idx on public.product_images (product_id);
create index if not exists product_images_business_id_idx on public.product_images (business_id);

select private.apply_business_access('public.product_images', 'staff');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists product_images_select on storage.objects;
drop policy if exists product_images_insert on storage.objects;
drop policy if exists product_images_update on storage.objects;
drop policy if exists product_images_delete on storage.objects;

create policy product_images_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'product-images'
    and (
      private.is_platform_operator()
      or private.is_business_member((split_part(name, '/', 1))::uuid)
    )
  );

create policy product_images_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and (
      private.is_platform_operator()
      or private.is_business_member((split_part(name, '/', 1))::uuid)
    )
  );

create policy product_images_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'product-images'
    and (
      private.is_platform_operator()
      or private.is_business_member((split_part(name, '/', 1))::uuid)
    )
  )
  with check (
    bucket_id = 'product-images'
    and (
      private.is_platform_operator()
      or private.is_business_member((split_part(name, '/', 1))::uuid)
    )
  );

create policy product_images_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'product-images'
    and (
      private.is_platform_operator()
      or private.is_business_admin((split_part(name, '/', 1))::uuid)
    )
  );

-- ---------------------------------------------------------------------------
-- Sale line cost snapshot + component snapshot
-- ---------------------------------------------------------------------------

alter table public.order_lines
  add column if not exists unit_cost numeric(14, 2) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'order_lines_id_business_id_key'
  ) then
    alter table public.order_lines
      add constraint order_lines_id_business_id_key unique (id, business_id);
  end if;
end $$;

create table if not exists public.order_line_components (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  order_line_id uuid not null,
  component_id uuid not null,
  quantity numeric(14, 3) not null check (quantity > 0),
  unit_cost numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  unique (id, business_id),
  foreign key (order_line_id, business_id) references public.order_lines (id, business_id) on delete cascade,
  foreign key (component_id, business_id) references public.products (id, business_id) on delete restrict
);

create index if not exists order_line_components_order_line_id_idx on public.order_line_components (order_line_id);
create index if not exists order_line_components_component_id_idx on public.order_line_components (component_id);
create index if not exists order_line_components_business_id_idx on public.order_line_components (business_id);

select private.apply_business_access('public.order_line_components', 'staff');

alter table public.sale_return_lines
  add column if not exists unit_cost numeric(14, 2) not null default 0;

-- ---------------------------------------------------------------------------
-- Stockable product guard
-- ---------------------------------------------------------------------------

create or replace function private.product_is_stockable(p_type text)
returns boolean
language sql
immutable
as $$
  select p_type in ('standard', 'variant');
$$;

create or replace function private.enforce_stockable_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
begin
  select product.product_type into v_type
  from public.products as product
  where product.id = new.product_id and product.business_id = new.business_id;
  if not private.product_is_stockable(v_type) then
    raise exception 'Variable parents and bundles do not hold inventory';
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_balances_stockable on public.inventory_balances;
create trigger inventory_balances_stockable
  before insert or update on public.inventory_balances
  for each row execute function private.enforce_stockable_balance();

create or replace function private.enforce_stockable_shipment_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
begin
  select product.product_type into v_type
  from public.products as product
  where product.id = new.product_id and product.business_id = new.business_id;
  if not private.product_is_stockable(v_type) then
    raise exception 'Shipments can only include standard products or variants';
  end if;
  return new;
end;
$$;

drop trigger if exists shipment_lines_stockable on public.shipment_lines;
create trigger shipment_lines_stockable
  before insert or update on public.shipment_lines
  for each row execute function private.enforce_stockable_shipment_line();

create or replace function private.product_has_history(p_business_id uuid, p_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.products as product
    where product.business_id = p_business_id
      and (product.id = p_product_id or product.parent_id = p_product_id)
      and (
        exists (
          select 1 from public.order_lines as line
          where line.business_id = p_business_id and line.product_id = product.id
        )
        or exists (
          select 1 from public.shipment_lines as line
          where line.business_id = p_business_id and line.product_id = product.id
        )
        or exists (
          select 1 from public.inventory_movements as move
          where move.business_id = p_business_id and move.product_id = product.id
        )
        or exists (
          select 1 from public.inventory_balances as balance
          where balance.business_id = p_business_id and balance.product_id = product.id and balance.quantity <> 0
        )
        or exists (
          select 1 from public.bundle_components as component
          where component.business_id = p_business_id and component.component_id = product.id
        )
        or exists (
          select 1 from public.order_line_components as component
          where component.business_id = p_business_id and component.component_id = product.id
        )
      )
  );
$$;

create or replace function private.deduct_product_stock(
  p_business_id uuid,
  p_product_id uuid,
  p_location_id uuid,
  p_quantity numeric,
  p_track boolean,
  p_reference text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_left numeric(14, 3);
  v_take numeric(14, 3);
  v_batch record;
begin
  update public.inventory_balances as balance
  set quantity = balance.quantity - p_quantity
  where balance.business_id = p_business_id
    and balance.product_id = p_product_id
    and balance.location_id = p_location_id;
  if p_track then
    v_left := p_quantity;
    for v_batch in
      select batch.id, batch.quantity from public.batches as batch
      where batch.business_id = p_business_id
        and batch.product_id = p_product_id
        and batch.location_id = p_location_id
        and batch.quantity > 0
      order by batch.created_at, batch.id
      for update
    loop
      exit when v_left <= 0;
      v_take := least(v_batch.quantity, v_left);
      update public.batches as batch set quantity = batch.quantity - v_take where batch.id = v_batch.id;
      insert into public.inventory_movements (business_id, product_id, location_id, batch_id, quantity, reason, reference, created_by)
      values (p_business_id, p_product_id, p_location_id, v_batch.id, -v_take, 'pos_sale', p_reference, auth.uid());
      v_left := v_left - v_take;
    end loop;
    if v_left > 0 then
      insert into public.inventory_movements (business_id, product_id, location_id, quantity, reason, reference, created_by)
      values (p_business_id, p_product_id, p_location_id, -v_left, 'pos_sale', p_reference, auth.uid());
    end if;
  else
    insert into public.inventory_movements (business_id, product_id, location_id, quantity, reason, reference, created_by)
    values (p_business_id, p_product_id, p_location_id, -p_quantity, 'pos_sale', p_reference, auth.uid());
  end if;
end;
$$;

revoke all on function private.deduct_product_stock(uuid, uuid, uuid, numeric, boolean, text) from public, anon;


-- ---------------------------------------------------------------------------
-- save_product
-- ---------------------------------------------------------------------------

create or replace function private.save_product(p_business_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_id uuid := coalesce((p_payload->>'id')::uuid, gen_random_uuid());
  v_type text := lower(coalesce(p_payload->>'product_type', 'standard'));
  v_existing public.products%rowtype;
  v_brand_id uuid := nullif(p_payload->>'brand_id', '')::uuid;
  v_brand_name text := nullif(btrim(coalesce(p_payload->>'brand_name', '')), '');
  v_sku text := nullif(btrim(coalesce(p_payload->>'sku', '')), '');
  v_barcode text := nullif(btrim(coalesce(p_payload->>'barcode', '')), '');
  v_name text := nullif(btrim(coalesce(p_payload->>'name', '')), '');
  v_status text := coalesce(nullif(p_payload->>'status', ''), 'active');
  v_tax_mode text := coalesce(nullif(p_payload->>'tax_mode', ''), 'inherit');
  v_tax_rate numeric(6, 3) := nullif(p_payload->>'tax_rate', '')::numeric;
  v_track boolean := coalesce((p_payload->>'track_inventory')::boolean, true);
  v_option jsonb;
  v_value text;
  v_option_id uuid;
  v_value_id uuid;
  v_variant jsonb;
  v_variant_id uuid;
  v_component jsonb;
  v_image jsonb;
  v_option_map jsonb := '{}'::jsonb;
  v_value_map jsonb := '{}'::jsonb;
  v_keep_variants uuid[] := '{}';
  v_option_pos integer := 0;
  v_value_pos integer;
  v_ov jsonb;
  v_variant_name text;
  v_parts text[];
  v_key text;
  v_unit_cost numeric(14, 2);
  v_child record;
begin
  if not (private.is_business_member(p_business_id) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;
  if v_type not in ('standard', 'variable', 'bundle') then
    raise exception 'Choose Standard, Variable, or Bundle';
  end if;
  if v_name is null then
    raise exception 'Product name is required';
  end if;
  if v_status not in ('active', 'inactive', 'archived') then
    raise exception 'Invalid product status';
  end if;
  if v_tax_mode = 'custom' then
    if v_tax_rate is null or v_tax_rate < 0 or v_tax_rate > 100 then
      raise exception 'Custom tax rate must be between 0 and 100';
    end if;
  else
    v_tax_rate := null;
  end if;
  if v_type in ('variable', 'bundle') then
    v_track := false;
  end if;
  if v_sku is null then
    v_sku := 'SKU-' || upper(substr(replace(v_id::text, '-', ''), 1, 8));
  end if;

  select product.* into v_existing
  from public.products as product
  where product.id = v_id and product.business_id = p_business_id;

  if found then
    if v_existing.product_type = 'variant' then
      raise exception 'Edit variants through their parent product';
    end if;
    if v_existing.product_type is distinct from v_type and private.product_has_history(p_business_id, v_id) then
      raise exception 'This product type cannot change because it already has sales or inventory';
    end if;
  end if;

  if v_brand_id is null and v_brand_name is not null then
    insert into public.brands (business_id, name)
    values (p_business_id, v_brand_name)
    on conflict (business_id, name) do update set updated_at = now()
    returning id into v_brand_id;
  elsif v_brand_id is not null and not exists (
    select 1 from public.brands as brand where brand.id = v_brand_id and brand.business_id = p_business_id
  ) then
    raise exception 'Choose a brand from this business';
  end if;

  if exists (
    select 1 from public.products as product
    where product.business_id = p_business_id and product.sku = v_sku and product.id <> v_id
  ) then
    raise exception 'SKU % is already in use', v_sku;
  end if;
  if v_barcode is not null and exists (
    select 1 from public.products as product
    where product.business_id = p_business_id and product.barcode = v_barcode and product.id <> v_id
  ) then
    raise exception 'Barcode % is already in use', v_barcode;
  end if;

  insert into public.products (
    id, business_id, category_id, brand_id, sku, barcode, name, description, price, cost,
    track_inventory, status, weight_grams, supplier_sku, pack_size, is_visible, sort_order,
    product_type, parent_id, unit, tax_mode, tax_rate, variant_key
  ) values (
    v_id,
    p_business_id,
    nullif(p_payload->>'category_id', '')::uuid,
    v_brand_id,
    v_sku,
    v_barcode,
    v_name,
    nullif(btrim(coalesce(p_payload->>'description', '')), ''),
    coalesce((p_payload->>'price')::numeric, 0),
    coalesce((p_payload->>'cost')::numeric, 0),
    v_track,
    v_status,
    nullif(p_payload->>'weight_grams', '')::numeric,
    coalesce(nullif(btrim(coalesce(p_payload->>'supplier_sku', '')), ''), v_sku),
    nullif(btrim(coalesce(p_payload->>'pack_size', '')), ''),
    coalesce((p_payload->>'is_visible')::boolean, true),
    coalesce((p_payload->>'sort_order')::integer, 0),
    v_type,
    null,
    coalesce(nullif(btrim(coalesce(p_payload->>'unit', '')), ''), 'each'),
    v_tax_mode,
    v_tax_rate,
    null
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    brand_id = excluded.brand_id,
    sku = excluded.sku,
    barcode = excluded.barcode,
    name = excluded.name,
    description = excluded.description,
    price = excluded.price,
    cost = excluded.cost,
    track_inventory = excluded.track_inventory,
    status = excluded.status,
    weight_grams = excluded.weight_grams,
    supplier_sku = excluded.supplier_sku,
    pack_size = excluded.pack_size,
    is_visible = excluded.is_visible,
    sort_order = excluded.sort_order,
    product_type = excluded.product_type,
    unit = excluded.unit,
    tax_mode = excluded.tax_mode,
    tax_rate = excluded.tax_rate,
    updated_at = now()
  where public.products.business_id = p_business_id;

  delete from public.product_images as image
  where image.product_id = v_id and image.business_id = p_business_id;

  if p_payload ? 'images' and jsonb_typeof(p_payload->'images') = 'array' then
    for v_image in select element.value from jsonb_array_elements(p_payload->'images') as element(value)
    loop
      insert into public.product_images (business_id, product_id, path, sort_order, is_primary)
      values (
        p_business_id,
        v_id,
        btrim(v_image->>'path'),
        coalesce((v_image->>'sort_order')::integer, 0),
        coalesce((v_image->>'is_primary')::boolean, false)
      );
    end loop;
  end if;

  if v_type = 'variable' then
    delete from public.product_options as option_row
    where option_row.product_id = v_id and option_row.business_id = p_business_id;

    if p_payload ? 'options' and jsonb_typeof(p_payload->'options') = 'array' then
      for v_option in select element.value from jsonb_array_elements(p_payload->'options') as element(value)
      loop
        v_option_pos := v_option_pos + 1;
        insert into public.product_options (business_id, product_id, name, position)
        values (p_business_id, v_id, nullif(btrim(v_option->>'name'), ''), v_option_pos)
        returning id into v_option_id;
        v_option_map := jsonb_set(v_option_map, array[lower(btrim(v_option->>'name'))], to_jsonb(v_option_id));
        v_value_pos := 0;
        for v_value in select btrim(element.value #>> '{}') from jsonb_array_elements(coalesce(v_option->'values', '[]'::jsonb)) as element(value)
        loop
          if v_value = '' then continue; end if;
          v_value_pos := v_value_pos + 1;
          insert into public.product_option_values (business_id, option_id, value, position)
          values (p_business_id, v_option_id, v_value, v_value_pos)
          returning id into v_value_id;
          v_value_map := jsonb_set(
            v_value_map,
            array[lower(btrim(v_option->>'name')) || '=' || lower(v_value)],
            to_jsonb(v_value_id)
          );
        end loop;
      end loop;
    end if;

    if p_payload ? 'variants' and jsonb_typeof(p_payload->'variants') = 'array' then
      for v_variant in select element.value from jsonb_array_elements(p_payload->'variants') as element(value)
      loop
        v_variant_id := coalesce(nullif(v_variant->>'id', '')::uuid, gen_random_uuid());
        v_key := nullif(btrim(coalesce(v_variant->>'variant_key', '')), '');
        v_parts := array[]::text[];
        if v_variant ? 'option_values' then
          for v_ov in
            select element.value
            from jsonb_array_elements(v_variant->'option_values') as element(value)
            order by lower(element.value->>'option')
          loop
            v_parts := v_parts || (lower(btrim(v_ov->>'option')) || ':' || lower(btrim(v_ov->>'value')));
          end loop;
        end if;
        if v_key is null then
          v_key := array_to_string(v_parts, '|');
        end if;
        if v_key is null or v_key = '' then
          raise exception 'Each variant needs option values';
        end if;
        if exists (
          select 1 from public.products as product
          where product.parent_id = v_id
            and product.business_id = p_business_id
            and product.variant_key = v_key
            and product.id <> v_variant_id
        ) then
          raise exception 'Duplicate variant combination %', v_key;
        end if;
        v_variant_name := v_name || ' — ' || replace(v_key, '|', ' / ');
        if exists (
          select 1 from public.products as product
          where product.business_id = p_business_id
            and product.sku = coalesce(nullif(btrim(coalesce(v_variant->>'sku', '')), ''), 'SKU-' || upper(substr(replace(v_variant_id::text, '-', ''), 1, 8)))
            and product.id <> v_variant_id
        ) then
          raise exception 'Variant SKU is already in use';
        end if;
        if nullif(btrim(coalesce(v_variant->>'barcode', '')), '') is not null and exists (
          select 1 from public.products as product
          where product.business_id = p_business_id
            and product.barcode = btrim(v_variant->>'barcode')
            and product.id <> v_variant_id
        ) then
          raise exception 'Variant barcode is already in use';
        end if;

        insert into public.products (
          id, business_id, category_id, brand_id, sku, barcode, name, description, price, cost,
          track_inventory, status, weight_grams, supplier_sku, pack_size, is_visible, sort_order,
          product_type, parent_id, unit, tax_mode, tax_rate, variant_key
        ) values (
          v_variant_id,
          p_business_id,
          nullif(p_payload->>'category_id', '')::uuid,
          v_brand_id,
          coalesce(nullif(btrim(coalesce(v_variant->>'sku', '')), ''), 'SKU-' || upper(substr(replace(v_variant_id::text, '-', ''), 1, 8))),
          nullif(btrim(coalesce(v_variant->>'barcode', '')), ''),
          coalesce(nullif(btrim(coalesce(v_variant->>'name', '')), ''), v_variant_name),
          nullif(btrim(coalesce(p_payload->>'description', '')), ''),
          coalesce((v_variant->>'price')::numeric, coalesce((p_payload->>'price')::numeric, 0)),
          coalesce((v_variant->>'cost')::numeric, coalesce((p_payload->>'cost')::numeric, 0)),
          coalesce((v_variant->>'track_inventory')::boolean, true),
          coalesce(nullif(v_variant->>'status', ''), 'active'),
          nullif(p_payload->>'weight_grams', '')::numeric,
          coalesce(nullif(btrim(coalesce(v_variant->>'supplier_sku', '')), ''), nullif(btrim(coalesce(v_variant->>'sku', '')), ''), 'SKU-' || upper(substr(replace(v_variant_id::text, '-', ''), 1, 8))),
          nullif(btrim(coalesce(p_payload->>'pack_size', '')), ''),
          coalesce((p_payload->>'is_visible')::boolean, true),
          coalesce((v_variant->>'sort_order')::integer, 0),
          'variant',
          v_id,
          coalesce(nullif(btrim(coalesce(p_payload->>'unit', '')), ''), 'each'),
          v_tax_mode,
          v_tax_rate,
          v_key
        )
        on conflict (id) do update set
          category_id = excluded.category_id,
          brand_id = excluded.brand_id,
          sku = excluded.sku,
          barcode = excluded.barcode,
          name = excluded.name,
          description = excluded.description,
          price = excluded.price,
          cost = excluded.cost,
          track_inventory = excluded.track_inventory,
          status = excluded.status,
          weight_grams = excluded.weight_grams,
          supplier_sku = excluded.supplier_sku,
          pack_size = excluded.pack_size,
          is_visible = excluded.is_visible,
          sort_order = excluded.sort_order,
          unit = excluded.unit,
          tax_mode = excluded.tax_mode,
          tax_rate = excluded.tax_rate,
          variant_key = excluded.variant_key,
          parent_id = excluded.parent_id,
          product_type = 'variant',
          updated_at = now()
        where public.products.business_id = p_business_id;

        delete from public.product_variant_values as link
        where link.variant_id = v_variant_id and link.business_id = p_business_id;

        if v_variant ? 'option_values' then
          for v_ov in select element.value from jsonb_array_elements(v_variant->'option_values') as element(value)
          loop
            v_option_id := (v_option_map->>lower(btrim(v_ov->>'option')))::uuid;
            v_value_id := (v_value_map->>(lower(btrim(v_ov->>'option')) || '=' || lower(btrim(v_ov->>'value'))))::uuid;
            if v_option_id is null or v_value_id is null then
              raise exception 'Variant option % = % is missing', v_ov->>'option', v_ov->>'value';
            end if;
            insert into public.product_variant_values (business_id, variant_id, option_id, option_value_id)
            values (p_business_id, v_variant_id, v_option_id, v_value_id);
          end loop;
        end if;

        delete from public.product_images as image
        where image.product_id = v_variant_id and image.business_id = p_business_id;
        if nullif(btrim(coalesce(v_variant->>'image_path', '')), '') is not null then
          insert into public.product_images (business_id, product_id, path, sort_order, is_primary)
          values (p_business_id, v_variant_id, btrim(v_variant->>'image_path'), 0, true);
        end if;

        v_keep_variants := v_keep_variants || v_variant_id;
      end loop;
    end if;

    for v_child in
      select product.id, product.status
      from public.products as product
      where product.parent_id = v_id and product.business_id = p_business_id
        and not (product.id = any (v_keep_variants))
    loop
      if private.product_has_history(p_business_id, v_child.id) then
        update public.products set status = 'inactive', updated_at = now()
        where id = v_child.id and business_id = p_business_id;
      else
        delete from public.products where id = v_child.id and business_id = p_business_id;
      end if;
    end loop;

    delete from public.bundle_components where bundle_id = v_id and business_id = p_business_id;

  elsif v_type = 'bundle' then
    delete from public.bundle_components where bundle_id = v_id and business_id = p_business_id;
    v_unit_cost := 0;
    if p_payload ? 'components' and jsonb_typeof(p_payload->'components') = 'array' then
      for v_component in select element.value from jsonb_array_elements(p_payload->'components') as element(value)
      loop
        insert into public.bundle_components (business_id, bundle_id, component_id, quantity)
        values (
          p_business_id,
          v_id,
          (v_component->>'component_id')::uuid,
          (v_component->>'quantity')::numeric
        );
        select v_unit_cost + coalesce(product.cost, 0) * (v_component->>'quantity')::numeric
        into v_unit_cost
        from public.products as product
        where product.id = (v_component->>'component_id')::uuid and product.business_id = p_business_id;
      end loop;
    end if;
    if not exists (select 1 from public.bundle_components where bundle_id = v_id and business_id = p_business_id) then
      raise exception 'Add at least one component to the bundle';
    end if;
    update public.products
    set cost = round(v_unit_cost, 2), updated_at = now()
    where id = v_id and business_id = p_business_id;
    delete from public.products where parent_id = v_id and business_id = p_business_id;
  else
    delete from public.bundle_components where bundle_id = v_id and business_id = p_business_id;
    delete from public.product_options where product_id = v_id and business_id = p_business_id;
    for v_child in
      select product.id from public.products as product
      where product.parent_id = v_id and product.business_id = p_business_id
    loop
      if private.product_has_history(p_business_id, v_child.id) then
        raise exception 'This product still has variants with history';
      end if;
      delete from public.products where id = v_child.id and business_id = p_business_id;
    end loop;
  end if;

  return jsonb_build_object('id', v_id, 'product_type', v_type, 'sku', v_sku);
end;
$fn$;

create or replace function public.save_product(p_business_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  return private.save_product(p_business_id, p_payload);
end;
$fn$;

revoke all on function private.save_product(uuid, jsonb) from public, anon;
grant execute on function private.save_product(uuid, jsonb) to authenticated;
revoke all on function public.save_product(uuid, jsonb) from public, anon;
grant execute on function public.save_product(uuid, jsonb) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- POS complete sale with variants, bundles, unit_cost, and line tax
-- ---------------------------------------------------------------------------

create or replace function private.complete_pos_sale(
  p_business_id uuid,
  p_register_id uuid,
  p_lines jsonb,
  p_method text,
  p_tendered numeric default null,
  p_notes text default null,
  p_customer_id uuid default null,
  p_discount numeric default 0,
  p_draft_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_store uuid;
  v_warehouse uuid;
  v_session_id uuid;
  v_currency text;
  v_merged jsonb := '{}'::jsonb;
  v_receipt jsonb := '[]'::jsonb;
  v_line jsonb;
  v_product_id uuid;
  v_qty numeric(14, 3);
  v_entry record;
  v_product public.products%rowtype;
  v_on_hand numeric(14, 3);
  v_order uuid;
  v_bill uuid;
  v_payment uuid;
  v_number text;
  v_bill_number text;
  v_prefix text;
  v_invoice_prefix text;
  v_tax_rate numeric(6, 3) := 0;
  v_count integer;
  v_subtotal numeric(14, 2) := 0;
  v_discount numeric(14, 2) := 0;
  v_tax numeric(14, 2) := 0;
  v_total numeric(14, 2) := 0;
  v_line_total numeric(14, 2);
  v_line_id uuid;
  v_unit_cost numeric(14, 2);
  v_line_tax_rate numeric(6, 3);
  v_line_share numeric(14, 2);
  v_discount_left numeric(14, 2);
  v_allocated numeric(14, 2);
  v_taxable numeric(14, 2);
  v_method text := lower(trim(coalesce(p_method, '')));
  v_tendered numeric(14, 2);
  v_change numeric(14, 2) := 0;
  v_component record;
  v_need numeric(14, 3);
  v_deductions jsonb := '[]'::jsonb;
  v_deduction record;
  v_lines_meta jsonb := '[]'::jsonb;
  v_meta record;
  v_idx integer := 0;
  v_line_count integer;
begin
  if not (private.is_business_member(p_business_id) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;
  if coalesce(p_discount, 0) < 0 then
    raise exception 'Discount cannot be negative';
  end if;
  if p_customer_id is not null and not exists (
    select 1 from public.customers as customer
    where customer.id = p_customer_id and customer.business_id = p_business_id and customer.status = 'active'
  ) then
    raise exception 'Choose an active customer from this business';
  end if;
  if v_method not in ('cash', 'card', 'bank_transfer') then
    raise exception 'Choose cash, card, or bank transfer';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add a product to the sale';
  end if;
  select register.location_id, register.warehouse_id into v_store, v_warehouse
  from public.registers as register
  where register.id = p_register_id and register.business_id = p_business_id and register.status = 'active';
  if not found then
    raise exception 'Choose an active register in this business';
  end if;
  select session.id into v_session_id
  from public.register_sessions as session
  where session.register_id = p_register_id and session.business_id = p_business_id and session.status = 'open'
  for update;
  if v_session_id is null then
    raise exception 'Open the register before selling';
  end if;
  select business.currency into v_currency from public.businesses as business where business.id = p_business_id;
  for v_line in select element.value from jsonb_array_elements(p_lines) as element(value)
  loop
    v_product_id := (v_line->>'product_id')::uuid;
    v_qty := (v_line->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Quantity must be greater than zero';
    end if;
    v_merged := jsonb_set(v_merged, array[v_product_id::text], to_jsonb(coalesce((v_merged->>v_product_id::text)::numeric, 0) + v_qty));
  end loop;
  perform 1 from public.businesses as business where business.id = p_business_id for update;

  for v_entry in
    select item.key as product_id, (item.value)::text::numeric as quantity
    from jsonb_each(v_merged) as item(key, value)
    order by item.key
  loop
    select product.* into v_product
    from public.products as product
    where product.id = v_entry.product_id::uuid and product.business_id = p_business_id and product.status = 'active';
    if not found then
      raise exception 'Product is not active in this business';
    end if;
    if v_product.product_type = 'variable' then
      raise exception 'Choose a variant for %', v_product.name;
    end if;
    if v_product.product_type = 'bundle' then
      if not exists (
        select 1 from public.bundle_components as component
        where component.bundle_id = v_product.id and component.business_id = p_business_id
      ) then
        raise exception 'Bundle % has no components', v_product.name;
      end if;
      for v_component in
        select component.component_id, component.quantity, product.name, product.track_inventory, product.cost
        from public.bundle_components as component
        join public.products as product
          on product.id = component.component_id and product.business_id = component.business_id
        where component.bundle_id = v_product.id and component.business_id = p_business_id
        order by component.component_id
      loop
        v_need := v_component.quantity * v_entry.quantity;
        select balance.quantity into v_on_hand
        from public.inventory_balances as balance
        where balance.business_id = p_business_id
          and balance.product_id = v_component.component_id
          and balance.location_id = v_warehouse
        for update;
        if v_on_hand is null or v_on_hand < v_need then
          raise exception 'Not enough stock for % in bundle %', v_component.name, v_product.name;
        end if;
        v_deductions := v_deductions || jsonb_build_array(jsonb_build_object(
          'product_id', v_component.component_id,
          'quantity', v_need,
          'track_inventory', v_component.track_inventory
        ));
      end loop;
    else
      select balance.quantity into v_on_hand
      from public.inventory_balances as balance
      where balance.business_id = p_business_id
        and balance.product_id = v_entry.product_id::uuid
        and balance.location_id = v_warehouse
      for update;
      if v_on_hand is null or v_on_hand < v_entry.quantity then
        raise exception 'Not enough stock for %', coalesce(v_product.name, 'product');
      end if;
      v_deductions := v_deductions || jsonb_build_array(jsonb_build_object(
        'product_id', v_entry.product_id::uuid,
        'quantity', v_entry.quantity,
        'track_inventory', v_product.track_inventory
      ));
    end if;
  end loop;

  select settings.order_prefix, settings.invoice_prefix, settings.tax_rate into v_prefix, v_invoice_prefix, v_tax_rate
  from public.business_settings as settings where settings.business_id = p_business_id;
  select count(*) + 1 into v_count from public.bills as bill where bill.business_id = p_business_id;
  v_bill_number := coalesce(v_invoice_prefix, 'INV') || '-' || lpad(v_count::text, 4, '0');

  if p_draft_id is not null then
    select sale.id, sale.number into v_order, v_number
    from public.orders as sale
    where sale.id = p_draft_id
      and sale.business_id = p_business_id
      and sale.register_id = p_register_id
      and sale.source = 'pos'
      and sale.status = 'draft'
    for update;
    if not found then
      raise exception 'This draft is no longer open';
    end if;
    if exists (
      select 1 from public.bills as bill
      where bill.order_id = v_order and bill.business_id = p_business_id
    ) then
      raise exception 'This draft is no longer open';
    end if;
    update public.orders as sale
    set location_id = v_store,
        customer_id = p_customer_id,
        register_session_id = v_session_id,
        notes = nullif(trim(coalesce(p_notes, '')), ''),
        status = 'completed'
    where sale.id = v_order;
    delete from public.order_lines as line
    where line.order_id = v_order and line.business_id = p_business_id;
  else
    select count(*) + 1 into v_count from public.orders as sale where sale.business_id = p_business_id;
    v_number := coalesce(v_prefix, 'ORD') || '-' || lpad(v_count::text, 4, '0');
    insert into public.orders (
      business_id, location_id, customer_id, register_id, register_session_id, number, status, source, notes, created_by
    ) values (
      p_business_id, v_store, p_customer_id, p_register_id, v_session_id, v_number, 'completed', 'pos',
      nullif(trim(coalesce(p_notes, '')), ''), auth.uid()
    ) returning id into v_order;
  end if;

  insert into public.bills (business_id, order_id, customer_id, number, status, issued_at)
  values (p_business_id, v_order, p_customer_id, v_bill_number, 'paid', now())
  returning id into v_bill;

  for v_entry in
    select item.key as product_id, (item.value)::text::numeric as quantity
    from jsonb_each(v_merged) as item(key, value)
    order by item.key
  loop
    select product.* into v_product
    from public.products as product
    where product.id = v_entry.product_id::uuid and product.business_id = p_business_id;
    v_line_total := round(v_entry.quantity * v_product.price, 2);
    v_subtotal := v_subtotal + v_line_total;
    if v_product.product_type = 'bundle' then
      select coalesce(sum(round(component.quantity * coalesce(product.cost, 0), 2)), 0)
      into v_unit_cost
      from public.bundle_components as component
      join public.products as product
        on product.id = component.component_id and product.business_id = component.business_id
      where component.bundle_id = v_product.id and component.business_id = p_business_id;
    else
      v_unit_cost := coalesce(v_product.cost, 0);
    end if;
    if v_product.tax_mode = 'exempt' then
      v_line_tax_rate := 0;
    elsif v_product.tax_mode = 'custom' then
      v_line_tax_rate := coalesce(v_product.tax_rate, 0);
    else
      v_line_tax_rate := coalesce(v_tax_rate, 0);
    end if;
    v_receipt := v_receipt || jsonb_build_array(jsonb_build_object('name', v_product.name, 'quantity', v_entry.quantity, 'price', v_product.price));
    insert into public.order_lines (business_id, order_id, product_id, description, quantity, unit_price, unit_cost, line_total)
    values (p_business_id, v_order, v_product.id, v_product.name, v_entry.quantity, v_product.price, v_unit_cost, v_line_total)
    returning id into v_line_id;
    insert into public.bill_lines (business_id, bill_id, description, quantity, unit_price, line_total)
    values (p_business_id, v_bill, v_product.name, v_entry.quantity, v_product.price, v_line_total);
    v_lines_meta := v_lines_meta || jsonb_build_array(jsonb_build_object(
      'line_id', v_line_id,
      'line_total', v_line_total,
      'tax_rate', v_line_tax_rate
    ));
    if v_product.product_type = 'bundle' then
      insert into public.order_line_components (business_id, order_line_id, component_id, quantity, unit_cost)
      select p_business_id, v_line_id, component.component_id, component.quantity, coalesce(product.cost, 0)
      from public.bundle_components as component
      join public.products as product
        on product.id = component.component_id and product.business_id = component.business_id
      where component.bundle_id = v_product.id and component.business_id = p_business_id;
    end if;
  end loop;

  for v_deduction in
    select
      (item.value->>'product_id')::uuid as product_id,
      sum((item.value->>'quantity')::numeric) as quantity,
      bool_or((item.value->>'track_inventory')::boolean) as track_inventory
    from jsonb_array_elements(v_deductions) as item(value)
    group by (item.value->>'product_id')::uuid
    order by (item.value->>'product_id')::uuid
  loop
    perform private.deduct_product_stock(
      p_business_id,
      v_deduction.product_id,
      v_warehouse,
      v_deduction.quantity,
      v_deduction.track_inventory,
      v_number
    );
  end loop;

  v_discount := least(round(coalesce(p_discount, 0), 2), v_subtotal);
  v_discount_left := v_discount;
  v_tax := 0;
  select jsonb_array_length(v_lines_meta) into v_line_count;
  for v_meta in
    select
      (item.value->>'line_id')::uuid as line_id,
      (item.value->>'line_total')::numeric as line_total,
      (item.value->>'tax_rate')::numeric as tax_rate,
      ordinality
    from jsonb_array_elements(v_lines_meta) with ordinality as item(value, ordinality)
    order by ordinality
  loop
    v_idx := v_idx + 1;
    if v_subtotal > 0 then
      if v_idx = v_line_count then
        v_allocated := v_discount_left;
      else
        v_allocated := least(v_discount_left, round(v_discount * v_meta.line_total / v_subtotal, 2));
        v_discount_left := v_discount_left - v_allocated;
      end if;
    else
      v_allocated := 0;
    end if;
    v_taxable := round(v_meta.line_total - v_allocated, 2);
    v_tax := v_tax + round(v_taxable * coalesce(v_meta.tax_rate, 0) / 100, 2);
  end loop;
  v_tax := round(v_tax, 2);
  v_total := round(v_subtotal - v_discount + v_tax, 2);
  update public.orders as sale set subtotal = v_subtotal, discount = v_discount, tax = v_tax, total = v_total where sale.id = v_order;
  update public.bills as bill set subtotal = v_subtotal, discount = v_discount, tax = v_tax, total = v_total where bill.id = v_bill;
  if v_method = 'cash' then
    v_tendered := coalesce(p_tendered, v_total);
    if v_tendered < v_total then
      raise exception 'Cash received is less than the total';
    end if;
    v_change := round(v_tendered - v_total, 2);
  else
    v_tendered := v_total;
    v_change := 0;
  end if;
  insert into public.payments (
    business_id, order_id, bill_id, amount, currency, status, method, provider, register_session_id, tendered, change_amount, external_ref
  ) values (
    p_business_id, v_order, v_bill, v_total, coalesce(v_currency, 'USD'), 'succeeded', v_method, v_method,
    v_session_id, v_tendered, v_change, 'PAY-' || v_number
  ) returning id into v_payment;
  insert into public.audit_events (business_id, actor_id, action, entity, entity_id, payload)
  values (
    p_business_id, auth.uid(), 'pos.sale', 'orders', v_order,
    jsonb_build_object('number', v_number, 'bill_number', v_bill_number, 'subtotal', v_subtotal, 'discount', v_discount, 'tax', v_tax, 'total', v_total, 'method', v_method, 'customer_id', p_customer_id, 'register_session_id', v_session_id)
  );
  return jsonb_build_object('id', v_order, 'number', v_number, 'bill_id', v_bill, 'bill_number', v_bill_number, 'lines', v_receipt, 'subtotal', v_subtotal, 'discount', v_discount, 'tax', v_tax, 'tax_rate', coalesce(v_tax_rate, 0), 'total', v_total, 'method', v_method, 'customer_id', p_customer_id, 'tendered', v_tendered, 'change', v_change);
end;
$fn$;

create or replace function public.complete_pos_sale(
  p_business_id uuid,
  p_register_id uuid,
  p_lines jsonb,
  p_method text,
  p_tendered numeric default null,
  p_notes text default null,
  p_customer_id uuid default null,
  p_discount numeric default 0,
  p_draft_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  return private.complete_pos_sale(
    p_business_id, p_register_id, p_lines, p_method, p_tendered, p_notes, p_customer_id, p_discount, p_draft_id
  );
end;
$fn$;

revoke all on function private.complete_pos_sale(uuid, uuid, jsonb, text, numeric, text, uuid, numeric, uuid) from public, anon;
grant execute on function private.complete_pos_sale(uuid, uuid, jsonb, text, numeric, text, uuid, numeric, uuid) to authenticated;
revoke all on function public.complete_pos_sale(uuid, uuid, jsonb, text, numeric, text, uuid, numeric, uuid) from public, anon;
grant execute on function public.complete_pos_sale(uuid, uuid, jsonb, text, numeric, text, uuid, numeric, uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Returns and voids restock bundle components from snapshots
-- ---------------------------------------------------------------------------

create or replace function private.return_pos_sale(
  p_business_id uuid,
  p_bill_id uuid,
  p_lines jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_bill public.bills%rowtype;
  v_order public.orders%rowtype;
  v_session_status text;
  v_warehouse uuid;
  v_method text;
  v_line jsonb;
  v_order_line record;
  v_qty numeric(14, 3);
  v_already numeric(14, 3);
  v_returned_subtotal numeric(14, 2) := 0;
  v_refund numeric(14, 2);
  v_return uuid;
  v_number text;
  v_component record;
  v_unit_cost numeric(14, 2);
begin
  if not (private.is_business_member(p_business_id) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Choose a line to return';
  end if;
  select bill.* into v_bill from public.bills as bill
  where bill.id = p_bill_id and bill.business_id = p_business_id
  for update;
  if not found or v_bill.status = 'void' or v_bill.order_id is null then
    raise exception 'This bill cannot be returned';
  end if;
  select sale.* into v_order from public.orders as sale
  where sale.id = v_bill.order_id and sale.business_id = p_business_id
  for update;
  if not found or v_order.status <> 'completed' then
    raise exception 'This bill cannot be returned';
  end if;
  select session.status into v_session_status from public.register_sessions as session
  where session.id = v_order.register_session_id and session.business_id = p_business_id;
  if v_session_status = 'open' then
    raise exception 'Void this sale from the open session';
  end if;
  select register.warehouse_id into v_warehouse from public.registers as register
  where register.id = v_order.register_id and register.business_id = p_business_id;
  select payment.method into v_method from public.payments as payment
  where payment.order_id = v_order.id and payment.business_id = p_business_id and payment.status = 'succeeded'
  order by payment.created_at limit 1;
  v_method := coalesce(v_method, 'cash');
  v_number := 'RET-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  insert into public.sale_returns (business_id, bill_id, order_id, number, method, amount, created_by)
  values (p_business_id, v_bill.id, v_order.id, v_number, v_method, 0, auth.uid())
  returning id into v_return;
  for v_line in select element.value from jsonb_array_elements(p_lines) as element(value)
  loop
    v_qty := (v_line->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Return quantity must be greater than zero';
    end if;
    select line.* into v_order_line from public.order_lines as line
    where line.id = (v_line->>'order_line_id')::uuid and line.order_id = v_order.id and line.business_id = p_business_id
    for update;
    if not found then
      raise exception 'That line is not on this bill';
    end if;
    select coalesce(sum(returned.quantity), 0) into v_already
    from public.sale_return_lines as returned
    where returned.order_line_id = v_order_line.id and returned.business_id = p_business_id and returned.return_id <> v_return;
    if v_already + v_qty > v_order_line.quantity then
      raise exception 'Return quantity is higher than the quantity sold';
    end if;
    v_returned_subtotal := v_returned_subtotal + round(v_qty * v_order_line.unit_price, 2);
    v_unit_cost := coalesce(v_order_line.unit_cost, 0);
    insert into public.sale_return_lines (
      business_id, return_id, order_line_id, product_id, description, quantity, unit_price, unit_cost, line_total
    ) values (
      p_business_id, v_return, v_order_line.id, v_order_line.product_id, v_order_line.description,
      v_qty, v_order_line.unit_price, v_unit_cost, round(v_qty * v_order_line.unit_price, 2)
    );
    if exists (
      select 1 from public.order_line_components as component
      where component.order_line_id = v_order_line.id and component.business_id = p_business_id
    ) then
      for v_component in
        select component.component_id, component.quantity
        from public.order_line_components as component
        where component.order_line_id = v_order_line.id and component.business_id = p_business_id
        order by component.component_id
      loop
        perform private.restock_pos(
          p_business_id,
          v_component.component_id,
          v_warehouse,
          v_component.quantity * v_qty,
          'pos_return',
          v_number
        );
      end loop;
    else
      perform private.restock_pos(p_business_id, v_order_line.product_id, v_warehouse, v_qty, 'pos_return', v_number);
    end if;
  end loop;
  if v_order.subtotal > 0 then
    v_refund := round(v_returned_subtotal * v_order.total / v_order.subtotal, 2);
  else
    v_refund := v_returned_subtotal;
  end if;
  update public.sale_returns set amount = v_refund where id = v_return;
  insert into public.payments (business_id, order_id, bill_id, amount, currency, status, method, provider, external_ref)
  select p_business_id, v_order.id, v_bill.id, v_refund, business.currency, 'refunded', v_method, v_method, v_number
  from public.businesses as business where business.id = p_business_id;
  perform private.post_sale_return(v_return);
  insert into public.audit_events (business_id, actor_id, action, entity, entity_id, payload)
  values (p_business_id, auth.uid(), 'pos.return', 'bills', v_bill.id, jsonb_build_object('number', v_number, 'amount', v_refund, 'method', v_method));
  return jsonb_build_object('id', v_return, 'number', v_number, 'amount', v_refund, 'method', v_method);
end;
$fn$;

create or replace function public.return_pos_sale(p_business_id uuid, p_bill_id uuid, p_lines jsonb) returns jsonb
language plpgsql security invoker set search_path = ''
as $fn$
begin
  return private.return_pos_sale(p_business_id, p_bill_id, p_lines);
end;
$fn$;

revoke all on function private.return_pos_sale(uuid, uuid, jsonb) from public, anon;
grant execute on function private.return_pos_sale(uuid, uuid, jsonb) to authenticated;
revoke all on function public.return_pos_sale(uuid, uuid, jsonb) from public, anon;
grant execute on function public.return_pos_sale(uuid, uuid, jsonb) to authenticated, service_role;

create or replace function private.void_pos_sale(p_business_id uuid, p_order_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_order public.orders%rowtype;
  v_session_status text;
  v_warehouse uuid;
  v_line record;
  v_component record;
begin
  if not (private.is_business_member(p_business_id) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;
  select sale.* into v_order from public.orders as sale
  where sale.id = p_order_id and sale.business_id = p_business_id
  for update;
  if not found or v_order.source <> 'pos' or v_order.status <> 'completed' then
    raise exception 'This sale cannot be voided';
  end if;
  select session.status into v_session_status from public.register_sessions as session
  where session.id = v_order.register_session_id and session.business_id = p_business_id;
  if v_session_status is distinct from 'open' then
    raise exception 'This session is closed. Return the bill instead';
  end if;
  select register.warehouse_id into v_warehouse from public.registers as register
  where register.id = v_order.register_id and register.business_id = p_business_id;
  for v_line in
    select line.id, line.product_id, line.quantity
    from public.order_lines as line
    where line.order_id = v_order.id and line.business_id = p_business_id
  loop
    if exists (
      select 1 from public.order_line_components as component
      where component.order_line_id = v_line.id and component.business_id = p_business_id
    ) then
      for v_component in
        select component.component_id, component.quantity
        from public.order_line_components as component
        where component.order_line_id = v_line.id and component.business_id = p_business_id
        order by component.component_id
      loop
        perform private.restock_pos(
          p_business_id,
          v_component.component_id,
          v_warehouse,
          v_component.quantity * v_line.quantity,
          'pos_void',
          v_order.number
        );
      end loop;
    else
      perform private.restock_pos(p_business_id, v_line.product_id, v_warehouse, v_line.quantity, 'pos_void', v_order.number);
    end if;
  end loop;
  update public.orders set status = 'void' where id = v_order.id;
  update public.bills set status = 'void' where order_id = v_order.id and business_id = p_business_id;
  update public.payments set status = 'void' where order_id = v_order.id and business_id = p_business_id and status = 'succeeded';
  insert into public.audit_events (business_id, actor_id, action, entity, entity_id, payload)
  values (p_business_id, auth.uid(), 'pos.void', 'orders', v_order.id, jsonb_build_object('number', v_order.number));
  return jsonb_build_object('id', v_order.id, 'number', v_order.number, 'status', 'void');
end;
$fn$;

create or replace function public.void_pos_sale(p_business_id uuid, p_order_id uuid) returns jsonb
language plpgsql security invoker set search_path = ''
as $fn$
begin
  return private.void_pos_sale(p_business_id, p_order_id);
end;
$fn$;

revoke all on function private.void_pos_sale(uuid, uuid) from public, anon;
grant execute on function private.void_pos_sale(uuid, uuid) to authenticated;
revoke all on function public.void_pos_sale(uuid, uuid) from public, anon;
grant execute on function public.void_pos_sale(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Adjust inventory only for stockable products
-- ---------------------------------------------------------------------------

create or replace function public.adjust_inventory(
  p_business_id uuid,
  p_product_id uuid,
  p_location_id uuid,
  p_quantity numeric,
  p_reason text default 'adjustment',
  p_reference text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_move uuid;
  v_type text;
begin
  if not (private.is_business_member(p_business_id) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;
  if coalesce(p_quantity, 0) = 0 then
    raise exception 'Quantity cannot be zero';
  end if;
  select product.product_type into v_type
  from public.products as product
  where product.id = p_product_id and product.business_id = p_business_id;
  if not private.product_is_stockable(v_type) then
    raise exception 'Variable parents and bundles do not hold inventory';
  end if;

  insert into public.inventory_balances (business_id, product_id, location_id, quantity)
  values (p_business_id, p_product_id, p_location_id, p_quantity)
  on conflict (business_id, product_id, location_id)
  do update set quantity = public.inventory_balances.quantity + excluded.quantity,
                updated_at = now();

  insert into public.inventory_movements (
    business_id, product_id, location_id, quantity, reason, reference, created_by
  ) values (
    p_business_id, p_product_id, p_location_id, p_quantity,
    case when p_reason in ('adjustment', 'stock_adjustment') then p_reason else 'adjustment' end,
    nullif(btrim(coalesce(p_reference, '')), ''),
    auth.uid()
  ) returning id into v_move;

  return v_move;
end;
$$;

revoke all on function public.adjust_inventory(uuid, uuid, uuid, numeric, text, text) from public, anon;
grant execute on function public.adjust_inventory(uuid, uuid, uuid, numeric, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- COGS from snapshotted unit_cost; return posting after lines exist
-- ---------------------------------------------------------------------------

create or replace function private.post_completed_sale(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_lines jsonb := '[]'::jsonb;
  v_cogs numeric(14, 2) := 0;
  v_net numeric(14, 2);
  v_cash_code text;
begin
  select sale.* into v_order from public.orders as sale where sale.id = p_order_id;
  if not found or v_order.status <> 'completed' then
    return null;
  end if;

  select payment.* into v_payment
  from public.payments as payment
  where payment.order_id = p_order_id
    and payment.business_id = v_order.business_id
    and payment.status = 'succeeded'
  order by payment.created_at
  limit 1;

  if not found then
    return null;
  end if;

  select coalesce(sum(round(line.quantity * coalesce(line.unit_cost, 0), 2)), 0)
  into v_cogs
  from public.order_lines as line
  where line.order_id = p_order_id
    and line.business_id = v_order.business_id;

  v_net := round(coalesce(v_order.total, 0) - coalesce(v_order.tax, 0), 2);
  v_cash_code := private.cash_account_code(v_payment.method);

  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', v_cash_code, 'debit', v_order.total, 'credit', 0),
    jsonb_build_object('account_code', '4000', 'debit', 0, 'credit', greatest(v_net, 0))
  );
  if coalesce(v_order.tax, 0) > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', '2200', 'debit', 0, 'credit', v_order.tax)
    );
  end if;
  if v_cogs > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', '5100', 'debit', v_cogs, 'credit', 0),
      jsonb_build_object('account_code', '1200', 'debit', 0, 'credit', v_cogs)
    );
  end if;

  return private.post_journal(
    v_order.business_id,
    v_order.created_at::date,
    'Sale ' || v_order.number,
    'order',
    v_order.id,
    'sale_paid',
    v_lines,
    v_order.location_id,
    v_order.register_id,
    v_order.register_session_id
  );
end;
$$;

revoke all on function private.post_completed_sale(uuid) from public, anon;

create or replace function private.post_sale_return(p_return_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_return public.sale_returns%rowtype;
  v_order public.orders%rowtype;
  v_method text;
  v_cogs numeric(14, 2) := 0;
  v_tax numeric(14, 2) := 0;
  v_net numeric(14, 2);
  v_cash_code text;
  v_lines jsonb;
begin
  select ret.* into v_return from public.sale_returns as ret where ret.id = p_return_id;
  if not found then
    return null;
  end if;
  if exists (
    select 1 from public.journal_entries as entry
    where entry.business_id = v_return.business_id
      and entry.source_type = 'sale_return'
      and entry.source_id = v_return.id
  ) then
    return null;
  end if;

  select sale.* into v_order from public.orders as sale where sale.id = v_return.order_id;
  select payment.method into v_method
  from public.payments as payment
  where payment.order_id = v_return.order_id
    and payment.status in ('succeeded', 'refunded')
  order by payment.created_at
  limit 1;

  select coalesce(sum(round(line.quantity * coalesce(line.unit_cost, 0), 2)), 0),
         coalesce(sum(round(line.line_total * coalesce(v_order.tax, 0) / nullif(v_order.subtotal, 0), 2)), 0)
  into v_cogs, v_tax
  from public.sale_return_lines as line
  where line.return_id = p_return_id;

  v_net := round(coalesce(v_return.amount, 0) - coalesce(v_tax, 0), 2);
  v_cash_code := private.cash_account_code(v_method);
  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', '4000', 'debit', greatest(v_net, 0), 'credit', 0),
    jsonb_build_object('account_code', v_cash_code, 'debit', 0, 'credit', v_return.amount)
  );
  if v_tax > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', '2200', 'debit', v_tax, 'credit', 0)
    );
  end if;
  if v_cogs > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', '1200', 'debit', v_cogs, 'credit', 0),
      jsonb_build_object('account_code', '5100', 'debit', 0, 'credit', v_cogs)
    );
  end if;

  return private.post_journal(
    v_return.business_id,
    v_return.created_at::date,
    'Return ' || coalesce(v_return.number, v_return.id::text),
    'sale_return',
    v_return.id,
    'sale_refund',
    v_lines,
    case when found then v_order.location_id else null end,
    case when found then v_order.register_id else null end,
    case when found then v_order.register_session_id else null end
  );
end;
$$;

revoke all on function private.post_sale_return(uuid) from public, anon;

drop trigger if exists sale_returns_finance_post on public.sale_returns;
