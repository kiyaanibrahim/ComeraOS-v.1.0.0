-- Assign product SKUs, supplier SKUs, and shipment batch references when they are left blank.

create or replace function private.assign_product_codes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if nullif(btrim(coalesce(new.sku, '')), '') is null then
    new.sku := 'SKU-' || upper(substr(replace(new.id::text, '-', ''), 1, 8));
  end if;

  if nullif(btrim(coalesce(new.supplier_sku, '')), '') is null then
    new.supplier_sku := new.sku;
  end if;

  return new;
end;
$fn$;

drop trigger if exists products_assign_codes on public.products;

create trigger products_assign_codes
  before insert or update on public.products
  for each row execute function private.assign_product_codes();

create or replace function private.assign_shipment_line_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_supplier_sku text;
begin
  if nullif(btrim(coalesce(new.batch_reference, '')), '') is null then
    new.batch_reference := 'BATCH-' || upper(substr(replace(new.id::text, '-', ''), 1, 6));
  end if;

  if nullif(btrim(coalesce(new.supplier_sku, '')), '') is null then
    select product.supplier_sku
    into v_supplier_sku
    from public.products as product
    where product.id = new.product_id
      and product.business_id = new.business_id;

    new.supplier_sku := nullif(btrim(coalesce(v_supplier_sku, '')), '');
  end if;

  return new;
end;
$fn$;

drop trigger if exists shipment_lines_assign_reference on public.shipment_lines;

create trigger shipment_lines_assign_reference
  before insert or update on public.shipment_lines
  for each row execute function private.assign_shipment_line_reference();

revoke all on function private.assign_product_codes() from public, anon, authenticated;
revoke all on function private.assign_shipment_line_reference() from public, anon, authenticated;

update public.products as product
set supplier_sku = product.sku
where nullif(btrim(coalesce(product.supplier_sku, '')), '') is null;

update public.shipment_lines as line
set batch_reference = 'BATCH-' || upper(substr(replace(line.id::text, '-', ''), 1, 6))
where nullif(btrim(coalesce(line.batch_reference, '')), '') is null;

update public.shipment_lines as line
set supplier_sku = product.supplier_sku
from public.products as product
where product.id = line.product_id
  and product.business_id = line.business_id
  and nullif(btrim(coalesce(line.supplier_sku, '')), '') is null
  and nullif(btrim(coalesce(product.supplier_sku, '')), '') is not null;
