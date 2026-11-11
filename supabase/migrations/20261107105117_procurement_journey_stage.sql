create or replace function private.set_shipment_stage(
  p_shipment_id uuid,
  p_stage text,
  p_note text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_business uuid;
  v_status text;
  v_stage text;
  v_locked boolean;
begin
  select shipment.business_id, shipment.status, shipment.stage, shipment.actuals_locked
  into v_business, v_status, v_stage, v_locked
  from public.shipments as shipment
  where shipment.id = p_shipment_id
  for update;

  if not found then
    raise exception 'Shipment not found';
  end if;

  if not (private.is_business_member(v_business) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;

  if p_stage not in (
    'order_placed', 'at_forwarder', 'handed_to_freight', 'arrived', 'customs', 'cleared', 'received', 'stock_added'
  ) then
    raise exception 'Unknown shipment stage';
  end if;

  if v_status = 'cancelled' or v_stage = 'draft_order' then
    raise exception 'Convert the draft before tracking it';
  end if;

  if v_stage = 'stock_added' or v_locked then
    raise exception 'This shipment is already closed';
  end if;

  if p_stage = 'stock_added' and (v_status <> 'delivered' or not v_locked) then
    raise exception 'Confirm actuals before marking stock as added';
  end if;

  if v_status = 'delivered' and p_stage <> 'stock_added' then
    raise exception 'Delivered shipments stay closed';
  end if;

  update public.shipments as shipment
  set stage = p_stage
  where shipment.id = p_shipment_id;

  insert into public.shipment_events (business_id, shipment_id, status, stage, note, actor_id)
  values (
    v_business, p_shipment_id, v_status, p_stage,
    nullif(btrim(coalesce(p_note, '')), ''), auth.uid()
  );
end;
$fn$;

create or replace function public.set_shipment_stage(
  p_shipment_id uuid,
  p_stage text,
  p_note text default null
) returns void
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  perform private.set_shipment_stage(p_shipment_id, p_stage, p_note);
end;
$fn$;

revoke all on function private.set_shipment_stage(uuid, text, text) from public, anon;
grant execute on function private.set_shipment_stage(uuid, text, text) to authenticated;
revoke all on function public.set_shipment_stage(uuid, text, text) from public, anon;
grant execute on function public.set_shipment_stage(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
