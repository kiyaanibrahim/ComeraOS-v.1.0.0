-- Fold catalog_entries visibility/sort onto products, then drop the catalog table.

alter table public.products
  add column if not exists is_visible boolean not null default true,
  add column if not exists sort_order integer not null default 0;

update public.products as product
set
  is_visible = entry.is_visible,
  sort_order = entry.sort_order,
  updated_at = now()
from public.catalog_entries as entry
where entry.product_id = product.id
  and entry.business_id = product.business_id;

drop table if exists public.catalog_entries;
