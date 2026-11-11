create or replace function private.restock_pos(
  p_business_id uuid,
  p_product_id uuid,
  p_location_id uuid,
  p_quantity numeric,
  p_reason text,
  p_reference text
) returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if p_product_id is null or p_location_id is null or coalesce(p_quantity, 0) <= 0 then
    return;
  end if;
  insert into public.inventory_balances (business_id, product_id, location_id, quantity)
  values (p_business_id, p_product_id, p_location_id, p_quantity)
  on conflict (business_id, product_id, location_id)
  do update set quantity = public.inventory_balances.quantity + excluded.quantity,
                updated_at = now();
  insert into public.inventory_movements (
    business_id, product_id, location_id, quantity, reason, reference, created_by
  ) values (
    p_business_id, p_product_id, p_location_id, p_quantity, p_reason, p_reference, auth.uid()
  );
end;
$fn$;

revoke all on function private.restock_pos(uuid, uuid, uuid, numeric, text, text) from public, anon, authenticated;

drop function if exists public.complete_pos_sale(uuid, uuid, jsonb, text, numeric, text, uuid);
drop function if exists private.complete_pos_sale(uuid, uuid, jsonb, text, numeric, text, uuid);