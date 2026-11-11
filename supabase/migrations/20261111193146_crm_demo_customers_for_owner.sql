do $$
declare
  v_from uuid;
  v_to uuid;
  v_currency text;
  v_amina uuid := 'c0c0c100-0000-4000-8000-000000000001';
  v_coral uuid := 'c0c0c100-0000-4000-8000-000000000002';
begin
  select business.id into v_from from public.businesses as business where business.slug = 'demo';
  select business.id into v_to
  from public.businesses as business
  join public.profiles as profile on profile.id = business.owner_id
  where profile.email = 'kiyaanibrahim01@gmail.com'
  limit 1;
  if v_from is null or v_to is null or v_from = v_to then
    return;
  end if;
  if not exists (
    select 1 from public.customers as customer
    where customer.id = v_amina and customer.business_id = v_from
  ) then
    return;
  end if;
  select coalesce(business.currency, 'USD') into v_currency from public.businesses as business where business.id = v_to;
  delete from public.crm_activities where business_id = v_from and id in ('c0c0c150-0000-4000-8000-000000000001', 'c0c0c150-0000-4000-8000-000000000002');
  delete from public.deals where business_id = v_from and id in ('c0c0c140-0000-4000-8000-000000000001', 'c0c0c140-0000-4000-8000-000000000002');
  delete from public.quotation_lines where business_id = v_from and id = 'c0c0c161-0000-4000-8000-000000000001';
  delete from public.quotations where business_id = v_from and id = 'c0c0c160-0000-4000-8000-000000000001';
  delete from public.payments where business_id = v_from and id in ('c0c0c130-0000-4000-8000-000000000001','c0c0c130-0000-4000-8000-000000000002','c0c0c130-0000-4000-8000-000000000003','c0c0c130-0000-4000-8000-000000000004','c0c0c130-0000-4000-8000-000000000011','c0c0c130-0000-4000-8000-000000000012');
  delete from public.order_lines where business_id = v_from and id in ('c0c0c120-0000-4000-8000-000000000001','c0c0c120-0000-4000-8000-000000000002','c0c0c120-0000-4000-8000-000000000003','c0c0c120-0000-4000-8000-000000000004','c0c0c120-0000-4000-8000-000000000011','c0c0c120-0000-4000-8000-000000000012');
  delete from public.orders where business_id = v_from and id in ('c0c0c110-0000-4000-8000-000000000001','c0c0c110-0000-4000-8000-000000000002','c0c0c110-0000-4000-8000-000000000003','c0c0c110-0000-4000-8000-000000000004','c0c0c110-0000-4000-8000-000000000011','c0c0c110-0000-4000-8000-000000000012');
  delete from public.customers where business_id = v_from and id in (v_amina, v_coral);
  insert into public.customers (id, business_id, name, email, phone, address, notes, status, customer_type, created_at, updated_at) values
    (v_amina, v_to, 'Amina Shareef', 'amina.shareef@example.com', '7914402', 'M. Fenboa, Felidhoo', 'Store pickup. Pays cash.', 'active', 'individual', timestamptz '2026-05-20 08:00:00+00', timestamptz '2026-05-20 08:00:00+00'),
    (v_coral, v_to, 'Coral Atoll Trading', 'orders@coral-atoll.example', '3321104', 'H. Blue Ocean, Malé', 'Wholesale account. Quotes before large orders.', 'active', 'business', timestamptz '2026-06-01 08:00:00+00', timestamptz '2026-06-01 08:00:00+00');
  insert into public.orders (id, business_id, customer_id, number, status, source, subtotal, tax, total, notes, created_at, updated_at) values
    ('c0c0c110-0000-4000-8000-000000000001', v_to, v_amina, 'CRM-DEMO-AMINA-01', 'completed', 'pos', 45, 0, 45, null, timestamptz '2026-06-14 09:30:00+00', timestamptz '2026-06-14 09:30:00+00'),
    ('c0c0c110-0000-4000-8000-000000000002', v_to, v_amina, 'CRM-DEMO-AMINA-02', 'completed', 'pos', 80, 0, 80, null, timestamptz '2026-08-02 11:10:00+00', timestamptz '2026-08-02 11:10:00+00'),
    ('c0c0c110-0000-4000-8000-000000000003', v_to, v_amina, 'CRM-DEMO-AMINA-03', 'completed', 'pos', 32.50, 0, 32.50, null, timestamptz '2026-09-19 14:05:00+00', timestamptz '2026-09-19 14:05:00+00'),
    ('c0c0c110-0000-4000-8000-000000000004', v_to, v_amina, 'CRM-DEMO-AMINA-04', 'completed', 'pos', 18, 0, 18, 'Refunded at the counter.', timestamptz '2026-10-28 16:40:00+00', timestamptz '2026-10-28 16:40:00+00'),
    ('c0c0c110-0000-4000-8000-000000000011', v_to, v_coral, 'CRM-DEMO-CORAL-01', 'completed', 'manual', 240, 0, 240, null, timestamptz '2026-07-11 10:00:00+00', timestamptz '2026-07-11 10:00:00+00'),
    ('c0c0c110-0000-4000-8000-000000000012', v_to, v_coral, 'CRM-DEMO-CORAL-02', 'completed', 'manual', 180, 0, 180, null, timestamptz '2026-10-05 10:20:00+00', timestamptz '2026-10-05 10:20:00+00');
  insert into public.order_lines (id, business_id, order_id, description, quantity, unit_price, line_total) values
    ('c0c0c120-0000-4000-8000-000000000001', v_to, 'c0c0c110-0000-4000-8000-000000000001', 'Reef tea', 2, 22.50, 45),
    ('c0c0c120-0000-4000-8000-000000000002', v_to, 'c0c0c110-0000-4000-8000-000000000002', 'Gift hamper', 1, 80, 80),
    ('c0c0c120-0000-4000-8000-000000000003', v_to, 'c0c0c110-0000-4000-8000-000000000003', 'Sample pack', 1, 32.50, 32.50),
    ('c0c0c120-0000-4000-8000-000000000004', v_to, 'c0c0c110-0000-4000-8000-000000000004', 'Coconut oil', 1, 18, 18),
    ('c0c0c120-0000-4000-8000-000000000011', v_to, 'c0c0c110-0000-4000-8000-000000000011', 'Still water case', 12, 20, 240),
    ('c0c0c120-0000-4000-8000-000000000012', v_to, 'c0c0c110-0000-4000-8000-000000000012', 'Glass bottle case', 6, 30, 180);
  insert into public.payments (id, business_id, order_id, amount, currency, status, method, created_at, updated_at) values
    ('c0c0c130-0000-4000-8000-000000000001', v_to, 'c0c0c110-0000-4000-8000-000000000001', 45, v_currency, 'succeeded', 'cash', timestamptz '2026-06-14 09:31:00+00', timestamptz '2026-06-14 09:31:00+00'),
    ('c0c0c130-0000-4000-8000-000000000002', v_to, 'c0c0c110-0000-4000-8000-000000000002', 80, v_currency, 'succeeded', 'cash', timestamptz '2026-08-02 11:11:00+00', timestamptz '2026-08-02 11:11:00+00'),
    ('c0c0c130-0000-4000-8000-000000000003', v_to, 'c0c0c110-0000-4000-8000-000000000003', 32.50, v_currency, 'succeeded', 'cash', timestamptz '2026-09-19 14:06:00+00', timestamptz '2026-09-19 14:06:00+00'),
    ('c0c0c130-0000-4000-8000-000000000004', v_to, 'c0c0c110-0000-4000-8000-000000000004', 18, v_currency, 'refunded', 'cash', timestamptz '2026-10-28 16:55:00+00', timestamptz '2026-10-28 16:55:00+00'),
    ('c0c0c130-0000-4000-8000-000000000011', v_to, 'c0c0c110-0000-4000-8000-000000000011', 240, v_currency, 'succeeded', 'card', timestamptz '2026-07-11 10:05:00+00', timestamptz '2026-07-11 10:05:00+00'),
    ('c0c0c130-0000-4000-8000-000000000012', v_to, 'c0c0c110-0000-4000-8000-000000000012', 180, v_currency, 'succeeded', 'card', timestamptz '2026-10-05 10:25:00+00', timestamptz '2026-10-05 10:25:00+00');
  insert into public.quotations (id, business_id, customer_id, number, status, total, created_at, updated_at) values
    ('c0c0c160-0000-4000-8000-000000000001', v_to, v_coral, 'CRM-DEMO-Q-01', 'sent', 420, timestamptz '2026-11-02 09:00:00+00', timestamptz '2026-11-02 09:00:00+00');
  insert into public.quotation_lines (id, business_id, quotation_id, description, quantity, unit_price, line_total) values
    ('c0c0c161-0000-4000-8000-000000000001', v_to, 'c0c0c160-0000-4000-8000-000000000001', 'Monsoon stock case', 20, 21, 420);
  insert into public.deals (id, business_id, customer_id, title, stage, amount, created_at, updated_at) values
    ('c0c0c140-0000-4000-8000-000000000001', v_to, v_amina, 'Welcome hamper', 'won', 80, timestamptz '2026-08-02 11:20:00+00', timestamptz '2026-08-02 11:20:00+00'),
    ('c0c0c140-0000-4000-8000-000000000002', v_to, v_coral, 'Monsoon restock', 'proposal', 420, timestamptz '2026-11-02 09:15:00+00', timestamptz '2026-11-02 09:15:00+00');
  insert into public.crm_activities (id, business_id, customer_id, deal_id, kind, body, occurred_at, created_at) values
    ('c0c0c150-0000-4000-8000-000000000001', v_to, v_amina, 'c0c0c140-0000-4000-8000-000000000001', 'note', 'Prefers cash and picks up from the store counter.', timestamptz '2026-09-20 08:30:00+00', timestamptz '2026-09-20 08:30:00+00'),
    ('c0c0c150-0000-4000-8000-000000000002', v_to, v_coral, 'c0c0c140-0000-4000-8000-000000000002', 'note', 'Asked for a standing quote on monsoon stock before the next inbound.', timestamptz '2026-11-02 09:20:00+00', timestamptz '2026-11-02 09:20:00+00');
end $$;
