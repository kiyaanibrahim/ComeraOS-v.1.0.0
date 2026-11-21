revoke update on table public.organizations from authenticated;

drop policy if exists update_organization on public.organizations;
