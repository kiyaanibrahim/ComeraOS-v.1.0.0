-- A register belongs to a store or site and sells stock from one warehouse.

alter table public.registers
  add column warehouse_id uuid;

update public.registers as register
set warehouse_id = (
  select location.id
  from public.locations as location
  where location.business_id = register.business_id
    and location.kind = 'warehouse'
  order by location.created_at, location.id
  limit 1
)
where register.warehouse_id is null;

do $$
begin
  if exists (
    select 1
    from public.registers as register
    left join public.locations as store
      on store.id = register.location_id
      and store.business_id = register.business_id
    left join public.locations as warehouse
      on warehouse.id = register.warehouse_id
      and warehouse.business_id = register.business_id
    where register.location_id is null
      or register.warehouse_id is null
      or store.kind not in ('store', 'site')
      or warehouse.kind is distinct from 'warehouse'
  ) then
    raise exception 'Every register needs a store or site and a warehouse';
  end if;
end $$;

alter table public.registers
  alter column location_id set not null,
  alter column warehouse_id set not null;

alter table public.registers
  add constraint registers_warehouse_id_business_id_fkey
  foreign key (warehouse_id, business_id)
  references public.locations (id, business_id)
  on delete restrict;

alter table public.registers
  add constraint registers_location_warehouse_distinct
  check (location_id <> warehouse_id);

create index registers_warehouse_id_idx on public.registers (warehouse_id);
create index registers_warehouse_business_idx on public.registers (warehouse_id, business_id);

create or replace function private.registers_check_places()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_place text;
  v_warehouse text;
begin
  select location.kind
  into v_place
  from public.locations as location
  where location.id = new.location_id
    and location.business_id = new.business_id;

  if v_place is null or v_place not in ('store', 'site') then
    raise exception 'A register belongs to a store or site';
  end if;

  select location.kind
  into v_warehouse
  from public.locations as location
  where location.id = new.warehouse_id
    and location.business_id = new.business_id;

  if v_warehouse is distinct from 'warehouse' then
    raise exception 'Attach a warehouse to this register';
  end if;

  return new;
end;
$$;

revoke all on function private.registers_check_places() from public, anon;
grant execute on function private.registers_check_places() to authenticated;

create trigger registers_check_places
  before insert or update of location_id, warehouse_id, business_id
  on public.registers
  for each row
  execute function private.registers_check_places();

alter table public.orders
  add column register_id uuid;

alter table public.orders
  add constraint orders_register_id_business_id_fkey
  foreign key (register_id, business_id)
  references public.registers (id, business_id)
  on delete restrict;

create index orders_register_id_idx on public.orders (register_id);
create index orders_register_business_idx on public.orders (register_id, business_id);

drop function public.complete_pos_sale(uuid, uuid, jsonb);
drop function private.complete_pos_sale(uuid, uuid, jsonb);

create or replace function private.complete_pos_sale(
  p_business_id uuid,
  p_register_id uuid,
  p_lines jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_store uuid;
  v_warehouse uuid;
  v_merged jsonb := '{}'::jsonb;
  v_line jsonb;
  v_product_id uuid;
  v_qty numeric(14, 3);
  v_entry record;
  v_product_name text;
  v_product_price numeric(14, 2);
  v_track boolean;
  v_on_hand numeric(14, 3);
  v_order uuid;
  v_number text;
  v_prefix text;
  v_count integer;
  v_subtotal numeric(14, 2) := 0;
  v_line_total numeric(14, 2);
  v_left numeric(14, 3);
  v_take numeric(14, 3);
  v_batch record;
begin
  if not (private.is_business_member(p_business_id) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add a product to the sale';
  end if;

  select register.location_id, register.warehouse_id
  into v_store, v_warehouse
  from public.registers as register
  where register.id = p_register_id
    and register.business_id = p_business_id
    and register.status = 'active';

  if not found then
    raise exception 'Choose an active register in this business';
  end if;

  for v_line in
    select element.value
    from jsonb_array_elements(p_lines) as element(value)
  loop
    v_product_id := (v_line->>'product_id')::uuid;
    v_qty := (v_line->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Quantity must be greater than zero';
    end if;
    v_merged := jsonb_set(
      v_merged,
      array[v_product_id::text],
      to_jsonb(coalesce((v_merged->>v_product_id::text)::numeric, 0) + v_qty)
    );
  end loop;

  perform 1 from public.businesses as business where business.id = p_business_id for update;

  for v_entry in
    select item.key as product_id, (item.value)::text::numeric as quantity
    from jsonb_each(v_merged) as item(key, value)
    order by item.key
  loop
    select product.name, product.price, product.track_inventory
    into v_product_name, v_product_price, v_track
    from public.products as product
    where product.id = v_entry.product_id::uuid
      and product.business_id = p_business_id
      and product.status = 'active';

    if not found then
      raise exception 'Product is not active in this business';
    end if;

    select balance.quantity
    into v_on_hand
    from public.inventory_balances as balance
    where balance.business_id = p_business_id
      and balance.product_id = v_entry.product_id::uuid
      and balance.location_id = v_warehouse
    for update;

    if v_on_hand is null or v_on_hand < v_entry.quantity then
      raise exception 'Not enough stock for %', coalesce(v_product_name, 'product');
    end if;
  end loop;

  select settings.order_prefix
  into v_prefix
  from public.business_settings as settings
  where settings.business_id = p_business_id;

  select count(*) + 1
  into v_count
  from public.orders as sale
  where sale.business_id = p_business_id;

  v_number := coalesce(v_prefix, 'ORD') || '-' || lpad(v_count::text, 4, '0');

  insert into public.orders (
    business_id, location_id, register_id, number, status, source, created_by
  ) values (
    p_business_id, v_store, p_register_id, v_number, 'completed', 'pos', auth.uid()
  ) returning id into v_order;

  for v_entry in
    select item.key as product_id, (item.value)::text::numeric as quantity
    from jsonb_each(v_merged) as item(key, value)
    order by item.key
  loop
    select product.name, product.price, product.track_inventory
    into v_product_name, v_product_price, v_track
    from public.products as product
    where product.id = v_entry.product_id::uuid
      and product.business_id = p_business_id;

    v_line_total := round(v_entry.quantity * v_product_price, 2);
    v_subtotal := v_subtotal + v_line_total;

    insert into public.order_lines (
      business_id, order_id, product_id, description, quantity, unit_price, line_total
    ) values (
      p_business_id,
      v_order,
      v_entry.product_id::uuid,
      v_product_name,
      v_entry.quantity,
      v_product_price,
      v_line_total
    );

    update public.inventory_balances as balance
    set quantity = balance.quantity - v_entry.quantity
    where balance.business_id = p_business_id
      and balance.product_id = v_entry.product_id::uuid
      and balance.location_id = v_warehouse;

    if v_track then
      v_left := v_entry.quantity;
      for v_batch in
        select batch.id, batch.quantity
        from public.batches as batch
        where batch.business_id = p_business_id
          and batch.product_id = v_entry.product_id::uuid
          and batch.location_id = v_warehouse
          and batch.quantity > 0
        order by batch.created_at, batch.id
        for update
      loop
        exit when v_left <= 0;
        v_take := least(v_batch.quantity, v_left);
        update public.batches as batch
        set quantity = batch.quantity - v_take
        where batch.id = v_batch.id;

        insert into public.inventory_movements (
          business_id, product_id, location_id, batch_id, quantity, reason, reference, created_by
        ) values (
          p_business_id,
          v_entry.product_id::uuid,
          v_warehouse,
          v_batch.id,
          -v_take,
          'pos_sale',
          v_number,
          auth.uid()
        );
        v_left := v_left - v_take;
      end loop;

      if v_left > 0 then
        insert into public.inventory_movements (
          business_id, product_id, location_id, quantity, reason, reference, created_by
        ) values (
          p_business_id,
          v_entry.product_id::uuid,
          v_warehouse,
          -v_left,
          'pos_sale',
          v_number,
          auth.uid()
        );
      end if;
    else
      insert into public.inventory_movements (
        business_id, product_id, location_id, quantity, reason, reference, created_by
      ) values (
        p_business_id,
        v_entry.product_id::uuid,
        v_warehouse,
        -v_entry.quantity,
        'pos_sale',
        v_number,
        auth.uid()
      );
    end if;
  end loop;

  update public.orders as sale
  set subtotal = v_subtotal,
      total = v_subtotal
  where sale.id = v_order;

  insert into public.audit_events (business_id, actor_id, action, entity, entity_id, payload)
  values (
    p_business_id,
    auth.uid(),
    'pos.sale',
    'orders',
    v_order,
    jsonb_build_object(
      'number', v_number,
      'total', v_subtotal,
      'register_id', p_register_id,
      'warehouse_id', v_warehouse
    )
  );

  return jsonb_build_object(
    'id', v_order,
    'number', v_number,
    'total', v_subtotal,
    'register_id', p_register_id,
    'location_id', v_store,
    'warehouse_id', v_warehouse
  );
end;
$fn$;

create or replace function public.complete_pos_sale(
  p_business_id uuid,
  p_register_id uuid,
  p_lines jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  return private.complete_pos_sale(p_business_id, p_register_id, p_lines);
end;
$fn$;

revoke all on function private.complete_pos_sale(uuid, uuid, jsonb) from public, anon;
grant execute on function private.complete_pos_sale(uuid, uuid, jsonb) to authenticated;

revoke all on function public.complete_pos_sale(uuid, uuid, jsonb) from public, anon;
grant execute on function public.complete_pos_sale(uuid, uuid, jsonb) to authenticated, service_role;
