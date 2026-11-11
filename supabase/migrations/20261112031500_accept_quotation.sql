-- Accepting a quote writes one open order and one issued bill. Stock stays
-- put until the goods are sold at a register.

alter table public.orders
  add column if not exists quotation_id uuid;

alter table public.orders
  drop constraint if exists orders_quotation_id_business_id_fkey;

alter table public.orders
  add constraint orders_quotation_id_business_id_fkey
  foreign key (quotation_id, business_id)
  references public.quotations (id, business_id);

create unique index if not exists orders_one_quotation_idx
  on public.orders (quotation_id)
  where quotation_id is not null;

alter table public.orders drop constraint if exists orders_source_check;

alter table public.orders
  add constraint orders_source_check
  check (source in ('pos', 'online', 'manual', 'quote'));

create or replace function private.accept_quotation(
  p_business_id uuid,
  p_quotation_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_quote public.quotations%rowtype;
  v_line record;
  v_order uuid;
  v_bill uuid;
  v_number text;
  v_bill_number text;
  v_prefix text;
  v_invoice_prefix text;
  v_tax_rate numeric(6, 3) := 0;
  v_count integer;
  v_subtotal numeric(14, 2) := 0;
  v_tax numeric(14, 2) := 0;
  v_total numeric(14, 2) := 0;
  v_line_total numeric(14, 2);
begin
  if not (private.is_business_member(p_business_id) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;

  select quote.*
  into v_quote
  from public.quotations as quote
  where quote.id = p_quotation_id
    and quote.business_id = p_business_id
  for update;

  if not found then
    raise exception 'Quote not found';
  end if;

  if v_quote.status not in ('draft', 'sent') then
    raise exception 'This quote cannot be accepted';
  end if;

  if not exists (
    select 1
    from public.quotation_lines as line
    where line.quotation_id = p_quotation_id
      and line.business_id = p_business_id
  ) then
    raise exception 'Add a product before accepting the quote';
  end if;

  perform 1
  from public.businesses as business
  where business.id = p_business_id
  for update;

  select settings.order_prefix, settings.invoice_prefix, settings.tax_rate
  into v_prefix, v_invoice_prefix, v_tax_rate
  from public.business_settings as settings
  where settings.business_id = p_business_id;

  select count(*) + 1 into v_count from public.orders as sale where sale.business_id = p_business_id;
  v_number := coalesce(v_prefix, 'ORD') || '-' || lpad(v_count::text, 4, '0');
  select count(*) + 1 into v_count from public.bills as bill where bill.business_id = p_business_id;
  v_bill_number := coalesce(v_invoice_prefix, 'INV') || '-' || lpad(v_count::text, 4, '0');

  insert into public.orders (
    business_id, customer_id, quotation_id, number, status, source, notes, created_by
  ) values (
    p_business_id, v_quote.customer_id, v_quote.id, v_number, 'open', 'quote',
    'Accepted from ' || v_quote.number, auth.uid()
  ) returning id into v_order;

  insert into public.bills (
    business_id, order_id, customer_id, number, status, issued_at
  ) values (
    p_business_id, v_order, v_quote.customer_id, v_bill_number, 'issued', now()
  ) returning id into v_bill;

  for v_line in
    select line.product_id, line.description, line.quantity, line.unit_price, line.line_total
    from public.quotation_lines as line
    where line.quotation_id = p_quotation_id
      and line.business_id = p_business_id
    order by line.id
  loop
    v_line_total := round(coalesce(v_line.line_total, 0), 2);
    v_subtotal := v_subtotal + v_line_total;

    insert into public.order_lines (
      business_id, order_id, product_id, description, quantity, unit_price, line_total
    ) values (
      p_business_id, v_order, v_line.product_id, v_line.description,
      v_line.quantity, v_line.unit_price, v_line_total
    );

    insert into public.bill_lines (
      business_id, bill_id, description, quantity, unit_price, line_total
    ) values (
      p_business_id, v_bill, v_line.description, v_line.quantity, v_line.unit_price, v_line_total
    );
  end loop;

  v_tax := round(v_subtotal * coalesce(v_tax_rate, 0) / 100, 2);
  v_total := round(v_subtotal + v_tax, 2);

  update public.orders as sale
  set subtotal = v_subtotal, tax = v_tax, total = v_total
  where sale.id = v_order;

  update public.bills as bill
  set subtotal = v_subtotal, tax = v_tax, total = v_total
  where bill.id = v_bill;

  update public.quotations as quote
  set status = 'accepted', total = v_total, updated_at = now()
  where quote.id = p_quotation_id;

  insert into public.audit_events (business_id, actor_id, action, entity, entity_id, payload)
  values (
    p_business_id, auth.uid(), 'sales.quote_accepted', 'orders', v_order,
    jsonb_build_object(
      'number', v_number,
      'bill_number', v_bill_number,
      'quotation_id', p_quotation_id,
      'quotation_number', v_quote.number,
      'subtotal', v_subtotal,
      'tax', v_tax,
      'total', v_total
    )
  );

  return jsonb_build_object(
    'id', v_order,
    'number', v_number,
    'bill_id', v_bill,
    'bill_number', v_bill_number,
    'subtotal', v_subtotal,
    'tax', v_tax,
    'total', v_total
  );
end;
$fn$;

create or replace function public.accept_quotation(
  p_business_id uuid,
  p_quotation_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  return private.accept_quotation(p_business_id, p_quotation_id);
end;
$fn$;

revoke all on function private.accept_quotation(uuid, uuid) from public, anon;
grant execute on function private.accept_quotation(uuid, uuid) to authenticated;
revoke all on function public.accept_quotation(uuid, uuid) from public, anon;
grant execute on function public.accept_quotation(uuid, uuid) to authenticated, service_role;
