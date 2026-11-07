-- Cover composite foreign keys, which a single-column index does not satisfy.

create index batches_location_colony_idx on public.batches (location_id, colony_id);
create index batches_product_colony_idx on public.batches (product_id, colony_id);
create index bill_lines_bill_colony_idx on public.bill_lines (bill_id, colony_id);
create index bills_customer_colony_idx on public.bills (customer_id, colony_id);
create index bills_order_colony_idx on public.bills (order_id, colony_id);
create index catalog_entries_product_colony_idx on public.catalog_entries (product_id, colony_id);
create index categories_parent_colony_idx on public.categories (parent_id, colony_id);
create index colony_capabilities_key_idx on public.colony_capabilities (capability_key);
create index colony_members_role_colony_idx on public.colony_members (role_id, colony_id);
create index crm_activities_customer_colony_idx on public.crm_activities (customer_id, colony_id);
create index deals_customer_colony_idx on public.deals (customer_id, colony_id);
create index inventory_balances_location_colony_idx on public.inventory_balances (location_id, colony_id);
create index inventory_balances_product_colony_idx on public.inventory_balances (product_id, colony_id);
create index inventory_movements_location_colony_idx on public.inventory_movements (location_id, colony_id);
create index inventory_movements_product_colony_idx on public.inventory_movements (product_id, colony_id);
create index journal_lines_account_colony_idx on public.journal_lines (account_id, colony_id);
create index journal_lines_entry_colony_idx on public.journal_lines (entry_id, colony_id);
create index order_lines_order_colony_idx on public.order_lines (order_id, colony_id);
create index order_lines_product_colony_idx on public.order_lines (product_id, colony_id);
create index orders_customer_colony_idx on public.orders (customer_id, colony_id);
create index orders_location_colony_idx on public.orders (location_id, colony_id);
create index payments_bill_colony_idx on public.payments (bill_id, colony_id);
create index payments_order_colony_idx on public.payments (order_id, colony_id);
create index procurement_requests_supplier_colony_idx on public.procurement_requests (supplier_id, colony_id);
create index products_category_colony_idx on public.products (category_id, colony_id);
create index purchase_order_lines_product_colony_idx on public.purchase_order_lines (product_id, colony_id);
create index purchase_order_lines_order_colony_idx on public.purchase_order_lines (purchase_order_id, colony_id);
create index purchase_orders_request_colony_idx on public.purchase_orders (request_id, colony_id);
create index purchase_orders_supplier_colony_idx on public.purchase_orders (supplier_id, colony_id);
create index quotation_lines_product_colony_idx on public.quotation_lines (product_id, colony_id);
create index quotation_lines_quotation_colony_idx on public.quotation_lines (quotation_id, colony_id);
create index quotations_customer_colony_idx on public.quotations (customer_id, colony_id);
create index register_sessions_register_colony_idx on public.register_sessions (register_id, colony_id);
create index registers_location_colony_idx on public.registers (location_id, colony_id);
create index shipments_location_colony_idx on public.shipments (location_id, colony_id);
create index shipments_order_colony_idx on public.shipments (order_id, colony_id);
create index shipments_purchase_order_colony_idx on public.shipments (purchase_order_id, colony_id);

-- Keep catalogue reads on one policy so SELECT is not evaluated twice.

drop policy write_permission on public.permissions;
create policy insert_permission on public.permissions
  for insert to authenticated
  with check ((select private.is_platform_operator()));
create policy update_permission on public.permissions
  for update to authenticated
  using ((select private.is_platform_operator()))
  with check ((select private.is_platform_operator()));
create policy delete_permission on public.permissions
  for delete to authenticated
  using ((select private.is_platform_operator()));

drop policy write_capability on public.capabilities;
create policy insert_capability on public.capabilities
  for insert to authenticated
  with check ((select private.is_platform_operator()));
create policy update_capability on public.capabilities
  for update to authenticated
  using ((select private.is_platform_operator()))
  with check ((select private.is_platform_operator()));
create policy delete_capability on public.capabilities
  for delete to authenticated
  using ((select private.is_platform_operator()));

drop policy write_plan on public.plans;
create policy insert_plan on public.plans
  for insert to authenticated
  with check ((select private.is_platform_operator()));
create policy update_plan on public.plans
  for update to authenticated
  using ((select private.is_platform_operator()))
  with check ((select private.is_platform_operator()));
create policy delete_plan on public.plans
  for delete to authenticated
  using ((select private.is_platform_operator()));

drop policy write_plan_capability on public.plan_capabilities;
create policy insert_plan_capability on public.plan_capabilities
  for insert to authenticated
  with check ((select private.is_platform_operator()));
create policy update_plan_capability on public.plan_capabilities
  for update to authenticated
  using ((select private.is_platform_operator()))
  with check ((select private.is_platform_operator()));
create policy delete_plan_capability on public.plan_capabilities
  for delete to authenticated
  using ((select private.is_platform_operator()));
