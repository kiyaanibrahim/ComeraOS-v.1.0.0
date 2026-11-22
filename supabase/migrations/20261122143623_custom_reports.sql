-- Saved custom reports. Each report is a named period plus the metrics that business watches.

create or replace function private.custom_report_metrics_ok(keys text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select keys <@ array[
      'sales',
      'orders',
      'average_order',
      'payments',
      'expenses',
      'returns',
      'open_orders',
      'new_customers'
    ]::text[]
    and cardinality(keys) between 1 and 8
    and cardinality(keys) = (
      select count(distinct metric_key)
      from unnest(keys) as metric_key
    );
$$;

create table public.custom_reports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  period text not null default 'month' check (period in ('week', 'month', 'quarter', 'year')),
  metrics text[] not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint custom_reports_name_not_blank check (length(btrim(name)) between 1 and 80),
  constraint custom_reports_metrics_ok check (private.custom_report_metrics_ok(metrics))
);

create unique index custom_reports_name_key
  on public.custom_reports (business_id, lower(btrim(name)));

create index custom_reports_business_id_idx on public.custom_reports (business_id);
create index custom_reports_created_by_idx on public.custom_reports (created_by);

create trigger custom_reports_set_updated_at
  before update on public.custom_reports
  for each row execute function private.set_updated_at();

select private.apply_business_access('public.custom_reports', 'staff');

create or replace function public.custom_report_snapshot(
  p_business_id uuid,
  p_period text default 'month'
)
returns table (
  metric_key text,
  label text,
  amount numeric,
  unit text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_zone text;
  v_today date;
  v_start date;
  v_from timestamptz;
  v_until timestamptz;
begin
  if p_period not in ('week', 'month', 'quarter', 'year') then
    raise exception 'Choose a week, month, quarter, or year';
  end if;

  if not (private.is_business_member(p_business_id) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;

  select business.timezone
  into v_zone
  from public.businesses as business
  where business.id = p_business_id;

  if v_zone is null or v_zone = '' then
    v_zone := 'UTC';
  end if;

  begin
    v_today := (timezone(v_zone, now()))::date;
  exception
    when invalid_parameter_value then
      v_zone := 'UTC';
      v_today := (timezone('UTC', now()))::date;
  end;

  v_start := case p_period
    when 'week' then v_today - 6
    when 'month' then v_today - 29
    when 'quarter' then v_today - 89
    else date_trunc('year', v_today)::date
  end;
  v_from := v_start::timestamp at time zone v_zone;
  v_until := (v_today + 1)::timestamp at time zone v_zone;

  return query
  with completed as (
    select
      count(*)::numeric as order_count,
      coalesce(sum(sale.total), 0)::numeric as sales
    from public.orders as sale
    where sale.business_id = p_business_id
      and sale.status = 'completed'
      and sale.created_at >= v_from
      and sale.created_at < v_until
  ),
  collected as (
    select coalesce(sum(payment.amount), 0)::numeric as payments
    from public.payments as payment
    where payment.business_id = p_business_id
      and payment.status = 'succeeded'
      and payment.created_at >= v_from
      and payment.created_at < v_until
  ),
  spent as (
    select coalesce(sum(expense.amount), 0)::numeric as expenses
    from public.expenses as expense
    where expense.business_id = p_business_id
      and expense.status = 'approved'
      and expense.spent_on >= v_start
      and expense.spent_on <= v_today
  ),
  refunded as (
    select coalesce(sum(sale_return.amount), 0)::numeric as returns
    from public.sale_returns as sale_return
    where sale_return.business_id = p_business_id
      and sale_return.created_at >= v_from
      and sale_return.created_at < v_until
  ),
  opened as (
    select count(*)::numeric as open_orders
    from public.orders as sale
    where sale.business_id = p_business_id
      and sale.status = 'open'
  ),
  joined as (
    select count(*)::numeric as new_customers
    from public.customers as customer
    where customer.business_id = p_business_id
      and customer.created_at >= v_from
      and customer.created_at < v_until
  )
  select metric.metric_key, metric.label, metric.amount, metric.unit
  from (
    select 'sales'::text, 'Sales'::text, completed.sales, 'money'::text, 1
    from completed
    union all
    select 'orders'::text, 'Orders'::text, completed.order_count, 'count'::text, 2
    from completed
    union all
    select
      'average_order'::text,
      'Average order'::text,
      case
        when completed.order_count = 0 then 0
        else round(completed.sales / completed.order_count, 2)
      end,
      'money'::text,
      3
    from completed
    union all
    select 'payments'::text, 'Payments'::text, collected.payments, 'money'::text, 4
    from collected
    union all
    select 'expenses'::text, 'Expenses'::text, spent.expenses, 'money'::text, 5
    from spent
    union all
    select 'returns'::text, 'Returns'::text, refunded.returns, 'money'::text, 6
    from refunded
    union all
    select 'open_orders'::text, 'Open orders'::text, opened.open_orders, 'count'::text, 7
    from opened
    union all
    select 'new_customers'::text, 'New customers'::text, joined.new_customers, 'count'::text, 8
    from joined
  ) as metric (metric_key, label, amount, unit, position)
  order by metric.position;
end;
$$;

revoke all on function public.custom_report_snapshot(uuid, text) from public, anon;
grant execute on function public.custom_report_snapshot(uuid, text) to authenticated;
