-- One year of operating history for Dreams Pvt Ltd and Juicify Pvt Ltd.
-- 8 Nov 2025 through 7 Nov 2026: catalog, receipts, sales, bills, and the books.

create or replace function private.seed_receipt(
  p_colony uuid,
  p_owner uuid,
  p_location uuid,
  p_supplier uuid,
  p_day date,
  p_expected date,
  p_qty numeric,
  p_prefix text,
  p_lane text,
  p_status text,
  p_carrier text,
  p_shelf integer
) returns void
language plpgsql
set search_path = pg_temp, public
as $fn$
declare
  v_ref text := 'IN-' || p_prefix || '-' || to_char(p_day, 'YYYYMMDD') || '-' || p_lane;
  v_at timestamptz := (p_day::timestamp + time '08:00') at time zone 'UTC';
  v_merch numeric(14, 2);
  v_freight numeric(14, 2);
  v_remaining numeric(14, 2);
  v_count integer;
  v_index integer := 0;
  v_line_merch numeric(14, 2);
  v_allocated numeric(14, 2);
  v_request uuid;
  v_po uuid;
  v_shipment uuid;
  v_batch uuid;
  v_row record;
begin
  select round(p_qty * coalesce(sum(cost), 0), 2)
  into v_merch
  from seed_catalog
  where colony_id = p_colony;

  if v_merch <= 0 then
    raise exception 'Receipt has no merchandise for %', p_prefix;
  end if;

  v_freight := round(v_merch * 0.04, 2);
  select count(*) into v_count from seed_catalog where colony_id = p_colony;

  insert into public.procurement_requests (
    colony_id, supplier_id, title, status, needed_on, created_by, created_at, updated_at
  ) values (
    p_colony,
    p_supplier,
    'Receipt ' || to_char(p_day, 'DD Mon YYYY'),
    case when p_status = 'delivered' then 'ordered' else 'submitted' end,
    coalesce(p_expected, p_day),
    p_owner,
    v_at,
    v_at
  ) returning id into v_request;

  insert into public.purchase_orders (
    colony_id, supplier_id, request_id, number, status, total, created_at, updated_at
  ) values (
    p_colony,
    p_supplier,
    v_request,
    'PO-' || p_prefix || '-' || to_char(p_day, 'YYYYMMDD') || '-' || p_lane,
    case when p_status = 'delivered' then 'received' else 'issued' end,
    v_merch + v_freight,
    v_at,
    v_at
  ) returning id into v_po;

  insert into public.shipments (
    colony_id, direction, status, carrier, tracking_number, location_id, supplier_id,
    purchase_order_id, allocation_method, reference, expected_on,
    merchandise_total, charge_total, landing_total, created_at, updated_at
  ) values (
    p_colony, 'inbound', p_status, p_carrier, 'TRK-' || v_ref, p_location, p_supplier,
    v_po, 'value', v_ref, coalesce(p_expected, p_day),
    v_merch, v_freight, v_merch + v_freight, v_at, v_at
  ) returning id into v_shipment;

  insert into public.shipment_charges (
    colony_id, shipment_id, kind, description, amount, recoverable, created_at
  ) values (
    p_colony, v_shipment, 'freight', 'Inbound freight', v_freight, false, v_at
  );

  v_remaining := v_freight;
  for v_row in
    select product_id, sku, name, price, cost, n
    from seed_catalog
    where colony_id = p_colony
    order by n
  loop
    v_index := v_index + 1;
    v_line_merch := round(p_qty * v_row.cost, 2);
    if v_index = v_count then
      v_allocated := v_remaining;
    else
      v_allocated := round(v_freight * v_line_merch / v_merch, 2);
      v_remaining := v_remaining - v_allocated;
    end if;

    insert into public.shipment_lines (
      colony_id, shipment_id, product_id, position, sku, name, sell_price, catalog_cost,
      quantity, unit_cost, quantity_received, allocated_charge, unit_landing_cost,
      line_landing_total, created_at
    ) values (
      p_colony, v_shipment, v_row.product_id, v_row.n, v_row.sku, v_row.name, v_row.price, v_row.cost,
      p_qty, v_row.cost,
      case when p_status = 'delivered' then p_qty else 0 end,
      v_allocated,
      round((v_line_merch + v_allocated) / p_qty, 4),
      v_line_merch + v_allocated,
      v_at
    );

    insert into public.purchase_order_lines (
      colony_id, purchase_order_id, product_id, description, quantity, unit_cost, line_total
    ) values (
      p_colony, v_po, v_row.product_id, v_row.name, p_qty, v_row.cost, v_line_merch
    );

    if p_status = 'delivered' then
      insert into public.batches (
        colony_id, product_id, location_id, lot_code, quantity, expires_on, created_at, updated_at
      ) values (
        p_colony, v_row.product_id, p_location, v_ref, p_qty,
        case when p_shelf is null then null else p_day + p_shelf end,
        v_at, v_at
      ) returning id into v_batch;

      insert into public.inventory_balances (colony_id, product_id, location_id, quantity, updated_at)
      values (p_colony, v_row.product_id, p_location, p_qty, v_at)
      on conflict (colony_id, product_id, location_id)
      do update set quantity = public.inventory_balances.quantity + excluded.quantity,
                    updated_at = excluded.updated_at;

      insert into public.inventory_movements (
        colony_id, product_id, location_id, batch_id, quantity, reason, reference, created_by, created_at
      ) values (
        p_colony, v_row.product_id, p_location, v_batch, p_qty,
        'procurement_receipt', v_ref, p_owner, v_at
      );
    end if;
  end loop;

  insert into public.shipment_events (colony_id, shipment_id, status, note, actor_id, occurred_at)
  values (p_colony, v_shipment, 'pending', 'Booked with the supplier', p_owner, v_at - interval '4 days');

  if p_status in ('in_transit', 'delivered') then
    insert into public.shipment_events (colony_id, shipment_id, status, note, actor_id, occurred_at)
    values (p_colony, v_shipment, 'in_transit', 'Handed to the carrier', p_owner, v_at - interval '2 days');
  end if;

  if p_status = 'delivered' then
    insert into public.shipment_events (colony_id, shipment_id, status, note, actor_id, occurred_at)
    values (p_colony, v_shipment, 'delivered', 'Received into stock', p_owner, v_at);
  end if;
end;
$fn$;

create or replace function private.seed_operating_year(
  p_colony uuid,
  p_owner uuid,
  p_prefix text,
  p_invoice_prefix text,
  p_legal text,
  p_tax text,
  p_address jsonb,
  p_carrier text,
  p_rent numeric,
  p_payroll numeric,
  p_utilities numeric,
  p_capital numeric,
  p_asset numeric,
  p_sale_qty numeric,
  p_receipt_qty numeric,
  p_shelf integer,
  p_sale_dows integer[],
  p_locations jsonb,
  p_suppliers jsonb,
  p_categories jsonb,
  p_products jsonb,
  p_customers jsonb
) returns void
language plpgsql
set search_path = pg_temp, public
as $fn$
declare
  v_item jsonb;
  v_store uuid;
  v_warehouse uuid;
  v_suppliers uuid[] := '{}';
  v_supplier uuid;
  v_customers uuid[] := '{}';
  v_customer uuid;
  v_products uuid[] := '{}';
  v_categories jsonb := '{}'::jsonb;
  v_category uuid;
  v_product uuid;
  v_n integer := 0;
  v_day date;
  v_at timestamptz;
  v_dow integer;
  v_count integer;
  v_slot integer;
  v_other integer;
  v_qty numeric;
  v_price numeric;
  v_name text;
  v_line_total numeric(14, 2);
  v_subtotal numeric(14, 2);
  v_status text;
  v_order uuid;
  v_number text;
  v_bill uuid;
  v_on_hand numeric;
  v_left numeric;
  v_take numeric;
  v_batch record;
  v_plan uuid;
  v_subscription uuid;
  v_register uuid;
  v_cash uuid;
  v_sales uuid;
  v_expense uuid;
  v_equity uuid;
  v_entry uuid;
  v_month record;
  v_quote uuid;
  v_deal uuid;
  v_i integer;
begin
  if exists (select 1 from public.products where colony_id = p_colony) then
    return;
  end if;

  update public.colony_settings
  set legal_name = p_legal,
      tax_id = p_tax,
      address = p_address,
      invoice_prefix = p_invoice_prefix,
      order_prefix = p_prefix,
      updated_at = timestamptz '2025-11-08 08:00+00'
  where colony_id = p_colony;

  for v_item in select value from jsonb_array_elements(p_locations)
  loop
    insert into public.locations (colony_id, name, kind, address, is_active, created_at, updated_at)
    values (
      p_colony, v_item->>'name', v_item->>'kind', p_address, true,
      timestamptz '2025-11-08 08:00+00', timestamptz '2025-11-08 08:00+00'
    ) returning id into v_product;
    if v_item->>'kind' = 'store' then
      v_store := v_product;
    else
      v_warehouse := v_product;
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_suppliers)
  loop
    insert into public.suppliers (colony_id, name, email, phone, created_at, updated_at)
    values (
      p_colony, v_item->>'name', v_item->>'email', v_item->>'phone',
      timestamptz '2025-11-08 08:00+00', timestamptz '2025-11-08 08:00+00'
    ) returning id into v_supplier;
    v_suppliers := v_suppliers || v_supplier;
  end loop;

  for v_item in select value from jsonb_array_elements(p_categories)
  loop
    insert into public.categories (colony_id, name, slug, created_at, updated_at)
    values (
      p_colony,
      v_item #>> '{}',
      lower(replace(v_item #>> '{}', ' ', '-')),
      timestamptz '2025-11-08 08:00+00',
      timestamptz '2025-11-08 08:00+00'
    ) returning id into v_category;
    v_categories := v_categories || jsonb_build_object(v_item #>> '{}', v_category);
  end loop;

  for v_item in select value from jsonb_array_elements(p_products)
  loop
    v_n := v_n + 1;
    insert into public.products (
      colony_id, category_id, sku, name, description, price, cost,
      track_inventory, status, created_at, updated_at
    ) values (
      p_colony,
      (v_categories ->> (v_item->>'category'))::uuid,
      v_item->>'sku',
      v_item->>'name',
      v_item->>'name',
      (v_item->>'price')::numeric,
      (v_item->>'cost')::numeric,
      true,
      'active',
      timestamptz '2025-11-08 08:00+00',
      timestamptz '2025-11-08 08:00+00'
    ) returning id into v_product;
    v_products := v_products || v_product;
    insert into seed_catalog (colony_id, product_id, sku, name, price, cost, n)
    values (
      p_colony, v_product, v_item->>'sku', v_item->>'name',
      (v_item->>'price')::numeric, (v_item->>'cost')::numeric, v_n
    );
    insert into public.catalog_entries (
      colony_id, product_id, is_visible, sort_order, created_at, updated_at
    ) values (
      p_colony, v_product, true, v_n,
      timestamptz '2025-11-08 08:00+00', timestamptz '2025-11-08 08:00+00'
    );
  end loop;

  v_i := 0;
  for v_item in select value from jsonb_array_elements(p_customers)
  loop
    v_i := v_i + 1;
    insert into public.customers (
      colony_id, name, email, phone, notes, status, created_at, updated_at
    ) values (
      p_colony, v_item->>'name', v_item->>'email', v_item->>'phone',
      'Account opened with the company', 'active',
      timestamptz '2025-11-08 08:00+00' + (v_i || ' days')::interval,
      timestamptz '2025-11-08 08:00+00' + (v_i || ' days')::interval
    ) returning id into v_customer;
    v_customers := v_customers || v_customer;
  end loop;

  v_count := cardinality(v_customers);
  for v_i in 1..least(v_count, 8)
  loop
    v_customer := v_customers[v_i];
    insert into public.deals (
      colony_id, customer_id, title, stage, amount, created_at, updated_at
    ) values (
      p_colony,
      v_customer,
      (select name from public.customers where id = v_customer) || ' supply agreement',
      (array['won', 'won', 'proposal', 'qualified', 'lead', 'lost', 'won', 'proposal'])[v_i],
      800 + v_i * 450,
      timestamptz '2025-11-20 09:00+00' + ((v_i - 1) * 40 || ' days')::interval,
      timestamptz '2025-11-20 09:00+00' + ((v_i - 1) * 40 || ' days')::interval
    ) returning id into v_deal;

    insert into public.crm_activities (
      colony_id, customer_id, deal_id, kind, body, occurred_at, created_by, created_at
    ) values (
      p_colony, v_customer, v_deal,
      case when v_i % 2 = 0 then 'call' else 'note' end,
      'Followed up on the supply agreement.',
      timestamptz '2025-11-21 09:00+00' + ((v_i - 1) * 40 || ' days')::interval,
      p_owner,
      timestamptz '2025-11-21 09:00+00' + ((v_i - 1) * 40 || ' days')::interval
    );
  end loop;

  select id into v_plan from public.plans where code = 'colony' limit 1;
  insert into public.subscriptions (
    colony_id, plan_id, status, current_period_end, created_at, updated_at
  ) values (
    p_colony, v_plan, 'active', date '2026-12-07',
    timestamptz '2025-11-08 08:00+00', timestamptz '2026-11-07 08:00+00'
  ) returning id into v_subscription;

  insert into public.registers (
    colony_id, location_id, name, device_label, status, created_at, updated_at
  ) values (
    p_colony, v_store, 'Front register', 'Counter 1', 'active',
    timestamptz '2025-11-08 08:00+00', timestamptz '2025-11-08 08:00+00'
  ) returning id into v_register;

  insert into public.capital_entries (
    colony_id, kind, description, amount, occurred_on, created_at, updated_at
  ) values
    (p_colony, 'injection', 'Opening capital', p_capital, date '2025-11-08', timestamptz '2025-11-08 08:00+00', timestamptz '2025-11-08 08:00+00'),
    (p_colony, 'asset', 'Fit-out and equipment', p_asset, date '2026-03-12', timestamptz '2026-03-12 08:00+00', timestamptz '2026-03-12 08:00+00');

  select id into v_cash from public.accounts where colony_id = p_colony and code = '1000';
  select id into v_equity from public.accounts where colony_id = p_colony and code = '3000';
  select id into v_sales from public.accounts where colony_id = p_colony and code = '4000';
  select id into v_expense from public.accounts where colony_id = p_colony and code = '5000';

  insert into public.journal_entries (
    colony_id, entry_date, memo, posted, created_by, created_at, updated_at
  ) values (
    p_colony, date '2025-11-08', 'Opening capital', true, p_owner,
    timestamptz '2025-11-08 08:00+00', timestamptz '2025-11-08 08:00+00'
  ) returning id into v_entry;
  insert into public.journal_lines (colony_id, entry_id, account_id, debit, credit) values
    (p_colony, v_entry, v_cash, p_capital, 0),
    (p_colony, v_entry, v_equity, 0, p_capital);

  for v_day in
    select gs::date
    from generate_series(date '2025-11-08', date '2026-11-07', interval '1 day') as gs
  loop
    v_at := (v_day::timestamp + time '11:00') at time zone 'UTC';
    v_dow := extract(dow from v_day)::int;
    v_supplier := v_suppliers[1 + (extract(month from v_day)::int % cardinality(v_suppliers))];

    if v_day = date '2025-11-08' or extract(day from v_day)::int = 1 then
      perform private.seed_receipt(
        p_colony, p_owner, v_store, v_supplier, v_day, v_day,
        p_receipt_qty, p_prefix, 'S', 'delivered', p_carrier, p_shelf
      );
    end if;

    if extract(day from v_day)::int = 1 and extract(month from v_day)::int in (2, 5, 8, 11) then
      perform private.seed_receipt(
        p_colony, p_owner, v_warehouse, v_supplier, v_day, v_day,
        round(p_receipt_qty / 2, 0), p_prefix, 'W', 'delivered', p_carrier, p_shelf
      );
    end if;

    if v_dow = any (p_sale_dows) then
      v_count := cardinality(v_products);
      v_slot := 1 + (extract(doy from v_day)::int % v_count);
      v_other := 1 + ((extract(doy from v_day)::int + 5) % v_count);
      if v_other = v_slot then
        v_other := 1 + (v_slot % v_count);
      end if;

      if v_day >= date '2026-10-28' then
        v_status := 'open';
      elsif extract(doy from v_day)::int % 23 = 0 then
        v_status := 'cancelled';
      else
        v_status := 'completed';
      end if;

      if extract(doy from v_day)::int % 5 = 0 then
        v_customer := null;
      else
        v_customer := v_customers[1 + (extract(doy from v_day)::int % cardinality(v_customers))];
      end if;

      v_number := p_prefix || '-' || to_char(v_day, 'YYYYMMDD');
      v_subtotal := 0;

      insert into public.orders (
        colony_id, location_id, customer_id, number, status, source,
        subtotal, tax, total, created_by, created_at, updated_at
      ) values (
        p_colony, v_store, v_customer, v_number, v_status,
        case when extract(doy from v_day)::int % 9 = 0 then 'online' else 'pos' end,
        0, 0, 0, p_owner, v_at, v_at
      ) returning id into v_order;

      foreach v_i in array array[v_slot, v_other]
      loop
        select name, price into v_name, v_price
        from public.products
        where id = v_products[v_i];
        v_qty := p_sale_qty;
        v_line_total := round(v_qty * v_price, 2);
        v_subtotal := v_subtotal + v_line_total;
        insert into public.order_lines (
          colony_id, order_id, product_id, description, quantity, unit_price, line_total
        ) values (
          p_colony, v_order, v_products[v_i], v_name, v_qty, v_price, v_line_total
        );

        if v_status = 'completed' then
          select quantity into v_on_hand
          from public.inventory_balances
          where colony_id = p_colony
            and product_id = v_products[v_i]
            and location_id = v_store;
          if v_on_hand is null or v_on_hand < v_qty then
            raise exception 'Short stock for % on %', v_name, v_day;
          end if;
          update public.inventory_balances
          set quantity = quantity - v_qty, updated_at = v_at
          where colony_id = p_colony
            and product_id = v_products[v_i]
            and location_id = v_store;

          v_left := v_qty;
          for v_batch in
            select id, quantity
            from public.batches
            where colony_id = p_colony
              and product_id = v_products[v_i]
              and location_id = v_store
              and quantity > 0
            order by created_at, id
          loop
            exit when v_left <= 0;
            v_take := least(v_batch.quantity, v_left);
            update public.batches
            set quantity = quantity - v_take, updated_at = v_at
            where id = v_batch.id;
            insert into public.inventory_movements (
              colony_id, product_id, location_id, batch_id, quantity, reason, reference, created_by, created_at
            ) values (
              p_colony, v_products[v_i], v_store, v_batch.id, -v_take,
              'pos_sale', v_number, p_owner, v_at
            );
            v_left := v_left - v_take;
          end loop;
        end if;
      end loop;

      update public.orders
      set subtotal = v_subtotal, total = v_subtotal, updated_at = v_at
      where id = v_order;

      if v_status in ('completed', 'open') then
        insert into public.bills (
          colony_id, order_id, customer_id, number, status, subtotal, tax, total,
          issued_at, created_at, updated_at
        ) values (
          p_colony, v_order, v_customer,
          p_invoice_prefix || '-' || to_char(v_day, 'YYYYMMDD'),
          case when v_status = 'completed' then 'paid' else 'issued' end,
          v_subtotal, 0, v_subtotal, v_at, v_at, v_at
        ) returning id into v_bill;
        insert into public.bill_lines (
          colony_id, bill_id, description, quantity, unit_price, line_total
        ) values (
          p_colony, v_bill, 'Goods sold ' || v_number, 1, v_subtotal, v_subtotal
        );
      end if;

      if v_status = 'completed' then
        insert into public.payments (
          colony_id, order_id, bill_id, amount, currency, status, provider, external_ref, created_at, updated_at
        ) values (
          p_colony, v_order, v_bill, v_subtotal, 'USD', 'succeeded', 'card',
          'PAY-' || v_number, v_at, v_at
        );

        if extract(doy from v_day)::int % 11 = 0 then
          insert into public.shipments (
            colony_id, direction, status, carrier, tracking_number, location_id, order_id,
            reference, expected_on, merchandise_total, created_at, updated_at
          ) values (
            p_colony, 'outbound', 'delivered', p_carrier, 'OUT-' || v_number, v_store, v_order,
            'OUT-' || v_number, v_day, v_subtotal, v_at, v_at
          );
        end if;
      end if;

      insert into public.register_sessions (
        colony_id, register_id, opened_by, opened_at, closed_at, opening_cash, closing_cash, status
      ) values (
        p_colony,
        v_register,
        p_owner,
        (v_day::timestamp + time '09:00') at time zone 'UTC',
        case
          when v_day >= date '2026-11-07' then null
          else (v_day::timestamp + time '18:00') at time zone 'UTC'
        end,
        200,
        case when v_day >= date '2026-11-07' then null else 200 + case when v_status = 'completed' then v_subtotal else 0 end end,
        case when v_day >= date '2026-11-07' then 'open' else 'closed' end
      );
    end if;

    if extract(day from v_day)::int = 1 or v_day = date '2025-11-08' then
      if v_day = date '2025-11-08' or extract(day from v_day)::int = 1 then
        if not (v_day = date '2025-11-08' and extract(day from v_day)::int = 1) then
          insert into public.expenses (
            colony_id, vendor, category, amount, status, spent_on, created_by, created_at, updated_at
          ) values (
            p_colony, 'Building lease', 'Rent', p_rent, 'approved', v_day, p_owner, v_at, v_at
          );
        end if;
      end if;
    end if;

    if extract(day from v_day)::int = 6 or v_day = date '2025-11-10' then
      insert into public.expenses (
        colony_id, vendor, category, amount, status, spent_on, created_by, created_at, updated_at
      ) values (
        p_colony, 'City utilities', 'Utilities', p_utilities, 'approved', v_day, p_owner, v_at, v_at
      );
    end if;

    if extract(day from v_day)::int = 15 then
      insert into public.expenses (
        colony_id, vendor, category, amount, status, spent_on, created_by, created_at, updated_at
      ) values (
        p_colony, 'Payroll', 'Payroll', p_payroll, 'approved', v_day, p_owner, v_at, v_at
      );
    end if;

    if extract(day from v_day)::int = 7 or v_day = date '2025-11-08' then
      insert into public.platform_invoices (
        colony_id, subscription_id, number, amount, status, due_on, created_at, updated_at
      ) values (
        p_colony, v_subscription,
        'PINV-' || p_prefix || '-' || to_char(v_day, 'YYYYMMDD'),
        49,
        case when v_day >= date '2026-11-07' then 'open' else 'paid' end,
        v_day + 14,
        v_at,
        v_at
      );
    end if;

    if extract(day from v_day)::int = 15 then
      v_customer := v_customers[1 + (extract(month from v_day)::int % cardinality(v_customers))];
      select name, price into v_name, v_price from public.products where id = v_products[1];
      insert into public.quotations (
        colony_id, customer_id, number, status, total, created_by, created_at, updated_at
      ) values (
        p_colony, v_customer, 'QT-' || p_prefix || '-' || to_char(v_day, 'YYYYMM'),
        (array['sent', 'accepted', 'declined', 'expired'])[1 + (extract(month from v_day)::int % 4)],
        round(v_price * 2, 2), p_owner, v_at, v_at
      ) returning id into v_quote;
      insert into public.quotation_lines (
        colony_id, quotation_id, product_id, description, quantity, unit_price, line_total
      ) values (
        p_colony, v_quote, v_products[1], v_name, 2, v_price, round(v_price * 2, 2)
      );
    end if;
  end loop;

  perform private.seed_receipt(
    p_colony, p_owner, v_store, v_suppliers[1], date '2026-11-05', date '2026-11-09',
    p_receipt_qty, p_prefix, 'T', 'in_transit', p_carrier, p_shelf
  );
  perform private.seed_receipt(
    p_colony, p_owner, v_store, v_suppliers[2], date '2026-11-04', date '2026-11-12',
    p_receipt_qty, p_prefix, 'P', 'pending', p_carrier, p_shelf
  );

  for v_i in 1..3
  loop
    v_day := date '2026-11-04' + (v_i - 1);
    v_at := (v_day::timestamp + time '16:00') at time zone 'UTC';
    v_number := p_prefix || '-DRAFT-' || v_i;
    select name, price into v_name, v_price from public.products where id = v_products[v_i];
    insert into public.orders (
      colony_id, location_id, customer_id, number, status, source,
      subtotal, tax, total, created_by, created_at, updated_at
    ) values (
      p_colony, v_store, v_customers[v_i], v_number, 'draft', 'manual',
      v_price, 0, v_price, p_owner, v_at, v_at
    ) returning id into v_order;
    insert into public.order_lines (
      colony_id, order_id, product_id, description, quantity, unit_price, line_total
    ) values (
      p_colony, v_order, v_products[v_i], v_name, 1, v_price, v_price
    );
  end loop;

  for v_month in
    select date_trunc('month', created_at)::date as month_start,
           (date_trunc('month', created_at) + interval '1 month - 1 day')::date as month_end,
           coalesce(sum(total), 0) as sales
    from public.orders
    where colony_id = p_colony
      and status = 'completed'
    group by 1, 2
  loop
    if v_month.sales > 0 then
      insert into public.journal_entries (
        colony_id, entry_date, memo, posted, created_by, created_at, updated_at
      ) values (
        p_colony, v_month.month_end, 'Sales ' || to_char(v_month.month_start, 'Mon YYYY'),
        true, p_owner, v_month.month_end::timestamptz, v_month.month_end::timestamptz
      ) returning id into v_entry;
      insert into public.journal_lines (colony_id, entry_id, account_id, debit, credit) values
        (p_colony, v_entry, v_cash, v_month.sales, 0),
        (p_colony, v_entry, v_sales, 0, v_month.sales);
    end if;
  end loop;

  for v_month in
    select date_trunc('month', spent_on)::date as month_start,
           (date_trunc('month', spent_on) + interval '1 month - 1 day')::date as month_end,
           coalesce(sum(amount), 0) as spend
    from public.expenses
    where colony_id = p_colony
    group by 1, 2
  loop
    if v_month.spend > 0 then
      insert into public.journal_entries (
        colony_id, entry_date, memo, posted, created_by, created_at, updated_at
      ) values (
        p_colony, v_month.month_end, 'Expenses ' || to_char(v_month.month_start, 'Mon YYYY'),
        true, p_owner, v_month.month_end::timestamptz, v_month.month_end::timestamptz
      ) returning id into v_entry;
      insert into public.journal_lines (colony_id, entry_id, account_id, debit, credit) values
        (p_colony, v_entry, v_expense, v_month.spend, 0),
        (p_colony, v_entry, v_cash, 0, v_month.spend);
    end if;
  end loop;

  insert into public.financial_reports (colony_id, kind, period_start, period_end, payload, created_at)
  select p_colony,
         'profit_and_loss',
         bounds.start_on,
         bounds.end_on,
         jsonb_build_object(
           'sales', coalesce((
             select sum(total) from public.orders
             where colony_id = p_colony and status = 'completed'
               and created_at::date between bounds.start_on and bounds.end_on
           ), 0),
           'expenses', coalesce((
             select sum(amount) from public.expenses
             where colony_id = p_colony
               and spent_on between bounds.start_on and bounds.end_on
           ), 0)
         ),
         bounds.end_on::timestamptz
  from (
    values
      (date '2025-11-08', date '2026-01-31'),
      (date '2026-02-01', date '2026-04-30'),
      (date '2026-05-01', date '2026-07-31'),
      (date '2026-08-01', date '2026-11-07')
  ) as bounds(start_on, end_on);

  insert into public.audit_events (colony_id, actor_id, action, entity, entity_id, payload, created_at)
  select p_colony, p_owner, 'order.completed', 'orders', id,
         jsonb_build_object('number', number), created_at
  from public.orders
  where colony_id = p_colony and status = 'completed'
  order by created_at desc
  limit 8;

  insert into public.health_checks (colony_id, check_key, status, detail, checked_at)
  values
    (p_colony, 'database', 'ok', 'Ledger reachable', timestamptz '2026-11-07 06:00+00'),
    (p_colony, 'auth', 'ok', 'Staff sign-in healthy', timestamptz '2026-11-07 06:00+00'),
    (p_colony, 'storage', 'ok', 'Catalog files healthy', timestamptz '2026-11-07 06:00+00');
end;
$fn$;

do $seed$
begin
  create temp table seed_catalog (
    colony_id uuid,
    product_id uuid,
    sku text,
    name text,
    price numeric,
    cost numeric,
    n integer
  ) on commit drop;

  perform private.seed_operating_year(
    '35deca21-c139-405a-a51a-736c0b3d5b2d',
    'c0c0a000-0000-4000-8000-000000000001',
    'DRM',
    'INV',
    'Dreams Pvt Ltd',
    'DRM-2044',
    '{"line1":"18 Orchard Street","city":"Lahore","country":"PK"}'::jsonb,
    'Northline',
    4200, 6800, 640, 250000, 18000,
    1, 18, null,
    array[2, 6],
    '[{"name":"Flagship Store","kind":"store"},{"name":"Central Warehouse","kind":"warehouse"}]'::jsonb,
    '[{"name":"Loom & Grain","email":"orders@loomandgrain.example","phone":"+92 300 100 2201"},{"name":"Harbor Textiles","email":"desk@harbortextiles.example","phone":"+92 300 100 2202"},{"name":"Northglass","email":"supply@northglass.example","phone":"+92 300 100 2203"}]'::jsonb,
    '["Bedding","Lighting","Tabletop","Fragrance"]'::jsonb,
    '[
      {"sku":"DRM-LINEN-Q","name":"Queen linen sheet set","category":"Bedding","price":189,"cost":72},
      {"sku":"DRM-LINEN-K","name":"King linen sheet set","category":"Bedding","price":229,"cost":88},
      {"sku":"DRM-DUVET","name":"Quilted duvet","category":"Bedding","price":240,"cost":96},
      {"sku":"DRM-PILLOW","name":"Down pillow pair","category":"Bedding","price":78,"cost":28},
      {"sku":"DRM-THROW","name":"Wool throw","category":"Bedding","price":145,"cost":58},
      {"sku":"DRM-LAMP-CER","name":"Ceramic table lamp","category":"Lighting","price":120,"cost":46},
      {"sku":"DRM-LAMP-ARC","name":"Arc floor lamp","category":"Lighting","price":310,"cost":128},
      {"sku":"DRM-BOWL","name":"Stoneware bowl","category":"Tabletop","price":36,"cost":11},
      {"sku":"DRM-MUG","name":"Daybreak mug","category":"Tabletop","price":22,"cost":6},
      {"sku":"DRM-VASE","name":"Glass vase","category":"Tabletop","price":64,"cost":21},
      {"sku":"DRM-CANDLE","name":"Cedar candle","category":"Fragrance","price":32,"cost":9},
      {"sku":"DRM-DIFFUSER","name":"Room diffuser","category":"Fragrance","price":48,"cost":14}
    ]'::jsonb,
    '[
      {"name":"Harbor & Co","email":"buyer@harbor.example","phone":"+92 321 555 0101"},
      {"name":"Lumen Retail","email":"buying@lumen.example","phone":"+92 321 555 0102"},
      {"name":"Field Office","email":"ops@fieldoffice.example","phone":"+92 321 555 0103"},
      {"name":"Orchard Hotel","email":"stores@orchard.example","phone":"+92 321 555 0104"},
      {"name":"Maple & Pine","email":"hello@maplepine.example","phone":"+92 321 555 0105"},
      {"name":"Sunday Market","email":"desk@sundaymarket.example","phone":"+92 321 555 0106"},
      {"name":"Atelier West","email":"studio@atelierwest.example","phone":"+92 321 555 0107"},
      {"name":"Kinfolk Rooms","email":"trade@kinfolk.example","phone":"+92 321 555 0108"}
    ]'::jsonb
  );

  perform private.seed_operating_year(
    'e93ebd14-34a2-4092-9896-801abd7dfd62',
    'c0c0a000-0000-4000-8000-000000000001',
    'JUI',
    'JBL',
    'Juicify Pvt Ltd',
    'JUI-8831',
    '{"line1":"42 Sea View","city":"Karachi","country":"PK"}'::jsonb,
    'Coldchain',
    1800, 2400, 420, 80000, 6500,
    4, 90, 12,
    array[1, 3, 5, 6],
    '[{"name":"Juice Bar","kind":"store"},{"name":"Cold Room","kind":"warehouse"}]'::jsonb,
    '[{"name":"Valley Citrus","email":"orders@valleycitrus.example","phone":"+92 300 200 3301"},{"name":"Greenpress Farms","email":"desk@greenpress.example","phone":"+92 300 200 3302"},{"name":"Bottleworks","email":"supply@bottleworks.example","phone":"+92 300 200 3303"}]'::jsonb,
    '["Pressed","Smoothies","Shots","Supplies"]'::jsonb,
    '[
      {"sku":"JUI-OJ","name":"Orange press 16oz","category":"Pressed","price":6.5,"cost":1.8},
      {"sku":"JUI-GREEN","name":"Green press 16oz","category":"Pressed","price":7.5,"cost":2.2},
      {"sku":"JUI-BEET","name":"Beet ginger 16oz","category":"Pressed","price":7,"cost":2.1},
      {"sku":"JUI-MANGO","name":"Mango press 16oz","category":"Pressed","price":6.75,"cost":2},
      {"sku":"JUI-BERRY","name":"Berry smoothie","category":"Smoothies","price":8.5,"cost":2.6},
      {"sku":"JUI-TROP","name":"Tropical smoothie","category":"Smoothies","price":8.5,"cost":2.7},
      {"sku":"JUI-SHOT","name":"Ginger shot","category":"Shots","price":4,"cost":0.9},
      {"sku":"JUI-TURM","name":"Turmeric shot","category":"Shots","price":4.25,"cost":0.95},
      {"sku":"JUI-BOTTLE","name":"Glass bottle","category":"Supplies","price":1.25,"cost":0.4},
      {"sku":"JUI-CLEANSE","name":"Three-day cleanse","category":"Pressed","price":64,"cost":22}
    ]'::jsonb,
    '[
      {"name":"Campus Kiosk","email":"kiosk@campus.example","phone":"+92 333 444 1001"},
      {"name":"Harbor Gym","email":"bar@harborgym.example","phone":"+92 333 444 1002"},
      {"name":"Little Noon Cafe","email":"hello@littlenoon.example","phone":"+92 333 444 1003"},
      {"name":"Office Pantry Co","email":"orders@officepantry.example","phone":"+92 333 444 1004"},
      {"name":"Greenline Catering","email":"kitchen@greenline.example","phone":"+92 333 444 1005"},
      {"name":"Padel Club","email":"front@padelclub.example","phone":"+92 333 444 1006"},
      {"name":"Hotel Cart","email":"fb@hotelcart.example","phone":"+92 333 444 1007"},
      {"name":"Wellness Desk","email":"desk@wellness.example","phone":"+92 333 444 1008"}
    ]'::jsonb
  );
end
$seed$;

drop function private.seed_operating_year(
  uuid, uuid, text, text, text, text, jsonb, text,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, integer, integer[],
  jsonb, jsonb, jsonb, jsonb, jsonb
);
drop function private.seed_receipt(
  uuid, uuid, uuid, uuid, date, date, numeric, text, text, text, text, integer
);
