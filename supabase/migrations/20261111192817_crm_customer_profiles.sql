-- Customer profiles keep an address and a type. Lifetime history stays on
-- orders, payments, quotations, bills, deals, and notes.

alter table public.customers
  add column address text;

alter table public.customers
  add column customer_type text not null default 'individual';

alter table public.customers
  add constraint customers_customer_type_check
  check (customer_type in ('individual', 'business'));

do $$
declare
  v_business uuid;
  v_currency text;
  v_amina uuid := 'c0c0c100-0000-4000-8000-000000000001';
  v_coral uuid := 'c0c0c100-0000-4000-8000-000000000002';
begin
  select customer.business_id
  into v_business
  from public.customers as customer
  where customer.id = v_amina;

  if v_business is null then
    select customer.business_id
    into v_business
    from public.customers as customer
    where lower(customer.email) = 'kiyaanibrahim01@gmail.com'
       or lower(customer.name) = 'thaaib'
    order by
      case when lower(customer.email) = 'kiyaanibrahim01@gmail.com' then 0 else 1 end,
      customer.created_at desc
    limit 1;
  end if;

  if v_business is null then
    select business.id
    into v_business
    from public.businesses as business
    where business.slug = 'demo'
    limit 1;
  end if;

  if v_business is null then
    return;
  end if;

  select coalesce(business.currency, 'USD')
  into v_currency
  from public.businesses as business
  where business.id = v_business;

  insert into public.customers (
    id, business_id, name, email, phone, address, notes, status, customer_type, created_at, updated_at
  )
  values
    (
      v_amina,
      v_business,
      'Amina Shareef',
      'amina.shareef@example.com',
      '7914402',
      'M. Fenboa, Felidhoo',
      'Store pickup. Pays cash.',
      'active',
      'individual',
      timestamptz '2026-05-20 08:00:00+00',
      timestamptz '2026-05-20 08:00:00+00'
    ),
    (
      v_coral,
      v_business,
      'Coral Atoll Trading',
      'orders@coral-atoll.example',
      '3321104',
      'H. Blue Ocean, Malé',
      'Wholesale account. Quotes before large orders.',
      'active',
      'business',
      timestamptz '2026-06-01 08:00:00+00',
      timestamptz '2026-06-01 08:00:00+00'
    )
  on conflict (id) do nothing;

  insert into public.orders (
    id, business_id, customer_id, number, status, source, subtotal, tax, total, notes, created_at, updated_at
  )
  values
    (
      'c0c0c110-0000-4000-8000-000000000001', v_business, v_amina,
      'CRM-DEMO-AMINA-01', 'completed', 'pos', 45, 0, 45, null,
      timestamptz '2026-06-14 09:30:00+00', timestamptz '2026-06-14 09:30:00+00'
    ),
    (
      'c0c0c110-0000-4000-8000-000000000002', v_business, v_amina,
      'CRM-DEMO-AMINA-02', 'completed', 'pos', 80, 0, 80, null,
      timestamptz '2026-08-02 11:10:00+00', timestamptz '2026-08-02 11:10:00+00'
    ),
    (
      'c0c0c110-0000-4000-8000-000000000003', v_business, v_amina,
      'CRM-DEMO-AMINA-03', 'completed', 'pos', 32.50, 0, 32.50, null,
      timestamptz '2026-09-19 14:05:00+00', timestamptz '2026-09-19 14:05:00+00'
    ),
    (
      'c0c0c110-0000-4000-8000-000000000004', v_business, v_amina,
      'CRM-DEMO-AMINA-04', 'completed', 'pos', 18, 0, 18, 'Refunded at the counter.',
      timestamptz '2026-10-28 16:40:00+00', timestamptz '2026-10-28 16:40:00+00'
    ),
    (
      'c0c0c110-0000-4000-8000-000000000011', v_business, v_coral,
      'CRM-DEMO-CORAL-01', 'completed', 'manual', 240, 0, 240, null,
      timestamptz '2026-07-11 10:00:00+00', timestamptz '2026-07-11 10:00:00+00'
    ),
    (
      'c0c0c110-0000-4000-8000-000000000012', v_business, v_coral,
      'CRM-DEMO-CORAL-02', 'completed', 'manual', 180, 0, 180, null,
      timestamptz '2026-10-05 10:20:00+00', timestamptz '2026-10-05 10:20:00+00'
    )
  on conflict (id) do nothing;

  insert into public.order_lines (
    id, business_id, order_id, description, quantity, unit_price, line_total
  )
  values
    ('c0c0c120-0000-4000-8000-000000000001', v_business, 'c0c0c110-0000-4000-8000-000000000001', 'Reef tea', 2, 22.50, 45),
    ('c0c0c120-0000-4000-8000-000000000002', v_business, 'c0c0c110-0000-4000-8000-000000000002', 'Gift hamper', 1, 80, 80),
    ('c0c0c120-0000-4000-8000-000000000003', v_business, 'c0c0c110-0000-4000-8000-000000000003', 'Sample pack', 1, 32.50, 32.50),
    ('c0c0c120-0000-4000-8000-000000000004', v_business, 'c0c0c110-0000-4000-8000-000000000004', 'Coconut oil', 1, 18, 18),
    ('c0c0c120-0000-4000-8000-000000000011', v_business, 'c0c0c110-0000-4000-8000-000000000011', 'Still water case', 12, 20, 240),
    ('c0c0c120-0000-4000-8000-000000000012', v_business, 'c0c0c110-0000-4000-8000-000000000012', 'Glass bottle case', 6, 30, 180)
  on conflict (id) do nothing;

  insert into public.payments (
    id, business_id, order_id, amount, currency, status, method, created_at, updated_at
  )
  values
    (
      'c0c0c130-0000-4000-8000-000000000001', v_business, 'c0c0c110-0000-4000-8000-000000000001',
      45, v_currency, 'succeeded', 'cash',
      timestamptz '2026-06-14 09:31:00+00', timestamptz '2026-06-14 09:31:00+00'
    ),
    (
      'c0c0c130-0000-4000-8000-000000000002', v_business, 'c0c0c110-0000-4000-8000-000000000002',
      80, v_currency, 'succeeded', 'cash',
      timestamptz '2026-08-02 11:11:00+00', timestamptz '2026-08-02 11:11:00+00'
    ),
    (
      'c0c0c130-0000-4000-8000-000000000003', v_business, 'c0c0c110-0000-4000-8000-000000000003',
      32.50, v_currency, 'succeeded', 'cash',
      timestamptz '2026-09-19 14:06:00+00', timestamptz '2026-09-19 14:06:00+00'
    ),
    (
      'c0c0c130-0000-4000-8000-000000000004', v_business, 'c0c0c110-0000-4000-8000-000000000004',
      18, v_currency, 'refunded', 'cash',
      timestamptz '2026-10-28 16:55:00+00', timestamptz '2026-10-28 16:55:00+00'
    ),
    (
      'c0c0c130-0000-4000-8000-000000000011', v_business, 'c0c0c110-0000-4000-8000-000000000011',
      240, v_currency, 'succeeded', 'card',
      timestamptz '2026-07-11 10:05:00+00', timestamptz '2026-07-11 10:05:00+00'
    ),
    (
      'c0c0c130-0000-4000-8000-000000000012', v_business, 'c0c0c110-0000-4000-8000-000000000012',
      180, v_currency, 'succeeded', 'card',
      timestamptz '2026-10-05 10:25:00+00', timestamptz '2026-10-05 10:25:00+00'
    )
  on conflict (id) do nothing;

  insert into public.quotations (
    id, business_id, customer_id, number, status, total, created_at, updated_at
  )
  values (
    'c0c0c160-0000-4000-8000-000000000001',
    v_business,
    v_coral,
    'CRM-DEMO-Q-01',
    'sent',
    420,
    timestamptz '2026-11-02 09:00:00+00',
    timestamptz '2026-11-02 09:00:00+00'
  )
  on conflict (id) do nothing;

  insert into public.quotation_lines (
    id, business_id, quotation_id, description, quantity, unit_price, line_total
  )
  values (
    'c0c0c161-0000-4000-8000-000000000001',
    v_business,
    'c0c0c160-0000-4000-8000-000000000001',
    'Monsoon stock case',
    20,
    21,
    420
  )
  on conflict (id) do nothing;

  insert into public.deals (
    id, business_id, customer_id, title, stage, amount, created_at, updated_at
  )
  values
    (
      'c0c0c140-0000-4000-8000-000000000001', v_business, v_amina,
      'Welcome hamper', 'won', 80,
      timestamptz '2026-08-02 11:20:00+00', timestamptz '2026-08-02 11:20:00+00'
    ),
    (
      'c0c0c140-0000-4000-8000-000000000002', v_business, v_coral,
      'Monsoon restock', 'proposal', 420,
      timestamptz '2026-11-02 09:15:00+00', timestamptz '2026-11-02 09:15:00+00'
    )
  on conflict (id) do nothing;

  insert into public.crm_activities (
    id, business_id, customer_id, deal_id, kind, body, occurred_at, created_at
  )
  values
    (
      'c0c0c150-0000-4000-8000-000000000001', v_business, v_amina,
      'c0c0c140-0000-4000-8000-000000000001', 'note',
      'Prefers cash and picks up from the store counter.',
      timestamptz '2026-09-20 08:30:00+00', timestamptz '2026-09-20 08:30:00+00'
    ),
    (
      'c0c0c150-0000-4000-8000-000000000002', v_business, v_coral,
      'c0c0c140-0000-4000-8000-000000000002', 'note',
      'Asked for a standing quote on monsoon stock before the next inbound.',
      timestamptz '2026-11-02 09:20:00+00', timestamptz '2026-11-02 09:20:00+00'
    )
  on conflict (id) do nothing;
end $$;
