-- The first rename matched the substring colony. The plural colonies
-- does not contain that substring, so these names were left behind.

alter table public.businesses rename constraint colonies_id_portfolio_id_key to businesses_id_portfolio_id_key;
alter table public.businesses rename constraint colonies_owner_id_fkey to businesses_owner_id_fkey;
alter table public.businesses rename constraint colonies_pkey to businesses_pkey;
alter table public.businesses rename constraint colonies_portfolio_id_fkey to businesses_portfolio_id_fkey;
alter table public.businesses rename constraint colonies_slug_key to businesses_slug_key;
alter table public.businesses rename constraint colonies_status_check to businesses_status_check;

alter index public.colonies_owner_id_idx rename to businesses_owner_id_idx;
alter index public.colonies_portfolio_id_idx rename to businesses_portfolio_id_idx;

alter trigger colonies_bootstrap on public.businesses rename to businesses_bootstrap;
alter trigger colonies_set_updated_at on public.businesses rename to businesses_set_updated_at;
