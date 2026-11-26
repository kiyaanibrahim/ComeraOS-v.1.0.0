create or replace function public.return_inbound_shipment(
  p_business_id uuid,
  p_shipment_id uuid,
  p_lines jsonb,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shipment public.shipments%rowtype;
  v_return uuid;
  v_number text;
  v_total numeric(14, 2) := 0;
  v_line jsonb;
  v_ship_line public.shipment_lines%rowtype;
  v_qty numeric(14, 3);
  v_cost numeric(14, 2);
  v_line_total numeric(14, 2);
  v_journal uuid;
begin
  if not (private.is_business_member(p_business_id) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;
  select shipment.* into v_shipment
  from public.shipments as shipment
  where shipment.id = p_shipment_id and shipment.business_id = p_business_id
  for update;
  if not found or v_shipment.direction <> 'inbound' or v_shipment.status <> 'delivered' then
    raise exception 'Choose a received inbound shipment';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Choose a quantity to return';
  end if;

  v_number := 'PR-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  insert into public.shipment_returns (
    business_id, shipment_id, number, status, amount, notes, created_by
  ) values (
    p_business_id, p_shipment_id, v_number, 'posted', 0, nullif(btrim(coalesce(p_notes, '')), ''), auth.uid()
  ) returning id into v_return;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    select line.* into v_ship_line
    from public.shipment_lines as line
    where line.id = (v_line->>'line_id')::uuid
      and line.shipment_id = p_shipment_id
      and line.business_id = p_business_id;
    if not found then
      raise exception 'A return line is not on this shipment';
    end if;
    v_qty := (v_line->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty > v_ship_line.quantity_received then
      raise exception 'Return quantity is not available';
    end if;
    if v_ship_line.capitalize then
      raise exception 'Capitalized lines are not returned to inventory';
    end if;
    v_cost := coalesce(v_ship_line.unit_landing_cost, 0);
    v_line_total := round(v_qty * v_cost, 2);
    v_total := v_total + v_line_total;

    insert into public.shipment_return_lines (
      business_id, return_id, shipment_line_id, product_id, description, quantity, unit_cost, line_total
    ) values (
      p_business_id, v_return, v_ship_line.id, v_ship_line.product_id,
      coalesce(v_ship_line.description, 'Returned goods'), v_qty, v_cost, v_line_total
    );

    update public.shipment_lines as line
    set quantity_received = line.quantity_received - v_qty
    where line.id = v_ship_line.id;

    if v_ship_line.product_id is not null and v_shipment.location_id is not null then
      update public.inventory_balances as balance
      set quantity = balance.quantity - v_qty, updated_at = now()
      where balance.business_id = p_business_id
        and balance.product_id = v_ship_line.product_id
        and balance.location_id = v_shipment.location_id;

      insert into public.inventory_movements (
        business_id, product_id, location_id, quantity, reason, reference, created_by
      ) values (
        p_business_id, v_ship_line.product_id, v_shipment.location_id, -v_qty,
        'procurement_return', v_number, auth.uid()
      );
    end if;
  end loop;

  update public.shipment_returns set amount = v_total where id = v_return;

  if v_total > 0 then
    v_journal := private.post_journal(
      p_business_id,
      current_date,
      'Purchase return ' || v_number,
      'shipment_return',
      v_return,
      'return',
      jsonb_build_array(
        jsonb_build_object('account_code', '2000', 'debit', v_total, 'credit', 0),
        jsonb_build_object('account_code', '1200', 'debit', 0, 'credit', v_total)
      ),
      v_shipment.location_id
    );
    update public.shipment_returns set journal_entry_id = v_journal where id = v_return;
  end if;

  return v_return;
end;
$$;

revoke all on function public.return_inbound_shipment(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.return_inbound_shipment(uuid, uuid, jsonb, text) to authenticated;
