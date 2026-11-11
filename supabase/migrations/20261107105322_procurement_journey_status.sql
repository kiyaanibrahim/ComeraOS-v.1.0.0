create or replace function private.set_shipment_status(
  p_shipment_id uuid,
  p_status text,
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
begin
  select shipment.business_id, shipment.status, shipment.stage
  into v_business, v_status, v_stage
  from public.shipments as shipment
  where shipment.id = p_shipment_id
  for update;

  if not found then
    raise exception 'Shipment not found';
  end if;

  if not (private.is_business_member(v_business) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;

  if p_status = 'delivered' then
    raise exception 'Confirm actuals to add this shipment to inventory';
  end if;

  if v_stage = 'draft_order' then
    raise exception 'Convert the draft before tracking it';
  end if;

  if v_status in ('delivered', 'cancelled') then
    raise exception 'This shipment is already closed';
  end if;

  if p_status not in ('pending', 'in_transit', 'cancelled') then
    raise exception 'Unknown shipment status';
  end if;

  if p_status = 'cancelled' and exists (
    select 1
    from public.shipment_lines as line
    where line.shipment_id = p_shipment_id
      and line.quantity_received > 0
  ) then
    raise exception 'Received stock has to be returned before this shipment can be cancelled';
  end if;

  update public.shipments as shipment
  set status = p_status
  where shipment.id = p_shipment_id;

  insert into public.shipment_events (business_id, shipment_id, status, stage, note, actor_id)
  values (
    v_business, p_shipment_id, p_status, v_stage,
    nullif(btrim(coalesce(p_note, '')), ''), auth.uid()
  );
end;
$fn$;

notify pgrst, 'reload schema';
