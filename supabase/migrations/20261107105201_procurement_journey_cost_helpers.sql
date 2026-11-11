create or replace function private.next_shipment_reference(p_business_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_count integer;
begin
  perform 1 from public.businesses as business where business.id = p_business_id for update;

  select coalesce(max(substring(shipment.reference from 5)::integer), 0) + 1
  into v_count
  from public.shipments as shipment
  where shipment.business_id = p_business_id
    and shipment.reference ~ '^SHP-[0-9]+$';

  return 'SHP-' || lpad(v_count::text, 4, '0');
end;
$fn$;

create or replace function private.recalculate_shipment(p_shipment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_method text;
  v_business uuid;
  v_pool numeric(14, 2);
  v_merch numeric(14, 2) := 0;
  v_qty numeric(14, 3) := 0;
  v_weight numeric(18, 3) := 0;
  v_count integer := 0;
  v_index integer := 0;
  v_remaining numeric(14, 2);
  v_allocated numeric(14, 2);
  v_line_merch numeric(14, 2);
  v_line_weight numeric(18, 3);
  v_line record;
begin
  select shipment.allocation_method, shipment.business_id
  into v_method, v_business
  from public.shipments as shipment
  where shipment.id = p_shipment_id;

  if not found then
    raise exception 'Shipment not found';
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
    raise exception 'Costs are locked after stock has been received';
  end if;

  select coalesce(sum(charge.amount), 0)
  into v_pool
  from public.shipment_charges as charge
  where charge.shipment_id = p_shipment_id
    and charge.recoverable = false;

  select count(*)
  into v_count
  from public.shipment_lines as line
  where line.shipment_id = p_shipment_id;

  for v_line in
    select line.quantity, line.unit_cost, line.unit_weight_grams
    from public.shipment_lines as line
    where line.shipment_id = p_shipment_id
  loop
    v_merch := v_merch + round(v_line.quantity * v_line.unit_cost, 2);
    v_qty := v_qty + v_line.quantity;
    v_weight := v_weight + round(v_line.quantity * v_line.unit_weight_grams, 3);
  end loop;

  if v_method = 'weight' and v_count > 0 and (
    v_weight <= 0
    or exists (
      select 1
      from public.shipment_lines as line
      where line.shipment_id = p_shipment_id
        and line.unit_weight_grams <= 0
    )
  ) then
    raise exception 'Add a unit weight before allocating by weight';
  end if;

  v_remaining := v_pool;

  for v_line in
    select line.id, line.quantity, line.unit_cost, line.unit_weight_grams
    from public.shipment_lines as line
    where line.shipment_id = p_shipment_id
    order by line.position, line.id
  loop
    v_index := v_index + 1;
    v_line_merch := round(v_line.quantity * v_line.unit_cost, 2);
    v_line_weight := round(v_line.quantity * v_line.unit_weight_grams, 3);

    if v_index = v_count then
      v_allocated := v_remaining;
    elsif v_method = 'quantity' and v_qty > 0 then
      v_allocated := round(v_pool * v_line.quantity / v_qty, 2);
      v_remaining := v_remaining - v_allocated;
    elsif v_method = 'weight' and v_weight > 0 then
      v_allocated := round(v_pool * v_line_weight / v_weight, 2);
      v_remaining := v_remaining - v_allocated;
    elsif v_merch > 0 then
      v_allocated := round(v_pool * v_line_merch / v_merch, 2);
      v_remaining := v_remaining - v_allocated;
    elsif v_qty > 0 then
      v_allocated := round(v_pool * v_line.quantity / v_qty, 2);
      v_remaining := v_remaining - v_allocated;
    else
      v_allocated := 0;
    end if;

    update public.shipment_lines as line
    set allocated_charge = v_allocated,
        line_landing_total = v_line_merch + v_allocated,
        unit_landing_cost = case
          when v_line.quantity = 0 then 0
          else round((v_line_merch + v_allocated) / v_line.quantity, 4)
        end
    where line.id = v_line.id;
  end loop;

  update public.shipments as shipment
  set merchandise_total = v_merch,
      charge_total = v_pool,
      landing_total = v_merch + v_pool
  where shipment.id = p_shipment_id;
end;
$fn$;

create or replace function private.replace_shipment_charges(
  p_business_id uuid,
  p_shipment_id uuid,
  p_charges jsonb,
  p_default_source text,
  p_keep_zero boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_charge jsonb;
  v_kind text;
  v_group text;
  v_source text;
  v_amount numeric(14, 2);
begin
  if p_charges is not null and jsonb_typeof(p_charges) <> 'array' then
    raise exception 'Charges must be a list';
  end if;

  delete from public.shipment_charges as charge
  where charge.shipment_id = p_shipment_id;

  if p_charges is null then
    return;
  end if;

  for v_charge in
    select element.value
    from jsonb_array_elements(p_charges) as element(value)
  loop
    v_amount := coalesce((v_charge->>'amount')::numeric, 0);
    if v_amount = 0 and not p_keep_zero then
      continue;
    end if;
    if v_amount < 0 then
      raise exception 'Charge amount cannot be negative';
    end if;

    v_kind := coalesce(v_charge->>'kind', '');
    if v_kind not in ('freight', 'insurance', 'duty', 'brokerage', 'tax', 'other') then
      raise exception 'Unknown charge type';
    end if;

    v_group := nullif(btrim(coalesce(v_charge->>'cost_group', '')), '');
    if v_group is null then
      v_group := case v_kind
        when 'freight' then 'freight'
        when 'duty' then 'clearance'
        when 'brokerage' then 'clearance'
        else 'other'
      end;
    end if;
    if v_group not in ('freight', 'shipping_company', 'clearance', 'other') then
      raise exception 'Unknown cost group';
    end if;

    v_source := coalesce(nullif(btrim(coalesce(v_charge->>'source', '')), ''), p_default_source);
    if v_source not in ('projected', 'actual') then
      raise exception 'Unknown charge source';
    end if;

    insert into public.shipment_charges (
      business_id, shipment_id, kind, description, amount, recoverable, cost_group, source
    ) values (
      p_business_id,
      p_shipment_id,
      v_kind,
      nullif(btrim(coalesce(v_charge->>'description', '')), ''),
      v_amount,
      coalesce(v_charge->>'recoverable', '') in ('true', 't'),
      v_group,
      v_source
    );
  end loop;
end;
$fn$;

revoke all on function private.next_shipment_reference(uuid) from public, anon, authenticated;
revoke all on function private.replace_shipment_charges(uuid, uuid, jsonb, text, boolean) from public, anon, authenticated;
