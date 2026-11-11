create or replace function private.duplicate_shipment(p_shipment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_source public.shipments%rowtype;
  v_shipment uuid;
  v_reference text;
  v_line public.shipment_lines%rowtype;
  v_charge public.shipment_charges%rowtype;
begin
  select shipment.*
  into v_source
  from public.shipments as shipment
  where shipment.id = p_shipment_id
  for update;

  if not found then
    raise exception 'Shipment not found';
  end if;

  if not (private.is_business_member(v_source.business_id) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;

  if v_source.stage <> 'draft_order' then
    raise exception 'Only a draft can be duplicated';
  end if;

  v_reference := private.next_shipment_reference(v_source.business_id);

  insert into public.shipments (
    business_id, direction, status, stage, carrier, tracking_number, location_id, supplier_id,
    allocation_method, reference, expected_on, name, origin_country, discount_percent,
    origin_currency, origin_to_usd_rate, usd_to_business_rate, freight_per_kg, declared_value,
    chargeable_weight_kg
  ) values (
    v_source.business_id, 'inbound', 'pending', 'draft_order', v_source.carrier, v_source.tracking_number,
    v_source.location_id, v_source.supplier_id, v_source.allocation_method, v_reference, v_source.expected_on,
    v_source.name, v_source.origin_country, v_source.discount_percent, v_source.origin_currency,
    v_source.origin_to_usd_rate, v_source.usd_to_business_rate, v_source.freight_per_kg, v_source.declared_value,
    v_source.chargeable_weight_kg
  ) returning id into v_shipment;

  for v_line in
    select line.*
    from public.shipment_lines as line
    where line.shipment_id = p_shipment_id
    order by line.position, line.id
  loop
    insert into public.shipment_lines (
      business_id, shipment_id, product_id, position, sku, name, description, sell_price, catalog_cost,
      quantity, unit_cost, unit_weight_grams, supplier_sku
    ) values (
      v_line.business_id, v_shipment, v_line.product_id, v_line.position, v_line.sku, v_line.name,
      v_line.description, v_line.sell_price, v_line.catalog_cost, v_line.quantity, v_line.unit_cost,
      v_line.unit_weight_grams, v_line.supplier_sku
    );
  end loop;

  for v_charge in
    select charge.*
    from public.shipment_charges as charge
    where charge.shipment_id = p_shipment_id
  loop
    insert into public.shipment_charges (
      business_id, shipment_id, kind, description, amount, recoverable, cost_group, source
    ) values (
      v_charge.business_id, v_shipment, v_charge.kind, v_charge.description, v_charge.amount,
      v_charge.recoverable, v_charge.cost_group, 'projected'
    );
  end loop;

  perform private.recalculate_shipment(v_shipment);

  insert into public.shipment_events (business_id, shipment_id, status, stage, note, actor_id)
  values (
    v_source.business_id, v_shipment, 'pending', 'draft_order',
    'Duplicated from ' || coalesce(v_source.reference, 'shipment'), auth.uid()
  );

  return v_shipment;
end;
$fn$;

create or replace function private.convert_shipment_draft(p_shipment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_business uuid;
begin
  select shipment.business_id
  into v_business
  from public.shipments as shipment
  where shipment.id = p_shipment_id
    and shipment.stage = 'draft_order'
    and shipment.status = 'pending'
  for update;

  if not found then
    raise exception 'Only an open draft can be converted';
  end if;

  if not (private.is_business_member(v_business) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;

  if not exists (
    select 1 from public.shipment_lines as line where line.shipment_id = p_shipment_id
  ) then
    raise exception 'Add at least one product';
  end if;

  update public.shipments as shipment
  set stage = 'order_placed'
  where shipment.id = p_shipment_id;

  insert into public.shipment_events (business_id, shipment_id, status, stage, note, actor_id)
  values (v_business, p_shipment_id, 'pending', 'order_placed', 'Draft converted', auth.uid());
end;
$fn$;

create or replace function private.delete_shipment_draft(p_shipment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_business uuid;
  v_reference text;
begin
  select shipment.business_id, shipment.reference
  into v_business, v_reference
  from public.shipments as shipment
  where shipment.id = p_shipment_id
    and shipment.stage = 'draft_order'
    and shipment.status = 'pending'
  for update;

  if not found then
    raise exception 'Only an open draft can be deleted';
  end if;

  if not (private.is_business_member(v_business) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;

  if exists (
    select 1
    from public.shipment_lines as line
    where line.shipment_id = p_shipment_id
      and line.quantity_received > 0
  ) then
    raise exception 'Received stock has to stay on this shipment';
  end if;

  delete from public.shipments as shipment
  where shipment.id = p_shipment_id;

  insert into public.audit_events (business_id, actor_id, action, entity, entity_id, payload)
  values (
    v_business, auth.uid(), 'shipment.draft_deleted', 'shipments', p_shipment_id,
    jsonb_build_object('reference', v_reference)
  );
end;
$fn$;

create or replace function public.duplicate_shipment(p_shipment_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  return private.duplicate_shipment(p_shipment_id);
end;
$fn$;

create or replace function public.convert_shipment_draft(p_shipment_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  perform private.convert_shipment_draft(p_shipment_id);
end;
$fn$;

create or replace function public.delete_shipment_draft(p_shipment_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  perform private.delete_shipment_draft(p_shipment_id);
end;
$fn$;

revoke all on function private.duplicate_shipment(uuid) from public, anon;
revoke all on function private.convert_shipment_draft(uuid) from public, anon;
revoke all on function private.delete_shipment_draft(uuid) from public, anon;
grant execute on function private.duplicate_shipment(uuid) to authenticated;
grant execute on function private.convert_shipment_draft(uuid) to authenticated;
grant execute on function private.delete_shipment_draft(uuid) to authenticated;
revoke all on function public.duplicate_shipment(uuid) from public, anon;
revoke all on function public.convert_shipment_draft(uuid) from public, anon;
revoke all on function public.delete_shipment_draft(uuid) from public, anon;
grant execute on function public.duplicate_shipment(uuid) to authenticated;
grant execute on function public.convert_shipment_draft(uuid) to authenticated;
grant execute on function public.delete_shipment_draft(uuid) to authenticated;
