create or replace function private.close_register_session(
  p_business_id uuid,
  p_session_id uuid,
  p_counted_cash numeric,
  p_closing_count jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_session public.register_sessions%rowtype;
  v_cash_sales numeric(14, 2) := 0;
  v_card_sales numeric(14, 2) := 0;
  v_bank_sales numeric(14, 2) := 0;
  v_sale_count integer := 0;
  v_moves numeric(14, 2) := 0;
  v_expected numeric(14, 2);
  v_counted numeric(14, 2) := coalesce(p_counted_cash, 0);
  v_diff numeric(14, 2);
begin
  if not (private.is_business_member(p_business_id) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;
  if v_counted < 0 then
    raise exception 'Counted cash cannot be negative';
  end if;
  select session.* into v_session
  from public.register_sessions as session
  where session.id = p_session_id and session.business_id = p_business_id
  for update;
  if not found then
    raise exception 'Register session not found';
  end if;
  if v_session.status <> 'open' then
    raise exception 'This register session is already closed';
  end if;
  if v_session.opened_by is distinct from auth.uid()
     and not (private.is_business_admin(p_business_id) or private.is_platform_operator()) then
    raise exception 'Only the person who opened this register can close it';
  end if;
  select
    coalesce(sum(payment.amount) filter (where payment.method = 'cash'), 0),
    coalesce(sum(payment.amount) filter (where payment.method = 'card'), 0),
    coalesce(sum(payment.amount) filter (where payment.method = 'bank_transfer'), 0),
    count(*)::integer
  into v_cash_sales, v_card_sales, v_bank_sales, v_sale_count
  from public.payments as payment
  where payment.business_id = p_business_id
    and payment.register_session_id = p_session_id
    and payment.status = 'succeeded';
  select coalesce(sum(case when move.kind = 'in' then move.amount else -move.amount end), 0)
  into v_moves
  from public.register_cash_moves as move
  where move.business_id = p_business_id and move.register_session_id = p_session_id;
  v_expected := round(v_session.opening_cash + v_cash_sales + v_moves, 2);
  v_diff := round(v_counted - v_expected, 2);
  update public.register_sessions as session
  set status = 'closed',
      closed_at = now(),
      closed_by = auth.uid(),
      force_closed = false,
      closing_cash = v_counted,
      closing_count = coalesce(p_closing_count, '{}'::jsonb),
      expected_cash = v_expected,
      counted_cash = v_counted,
      cash_difference = v_diff
  where session.id = v_session.id
  returning * into v_session;
  insert into public.audit_events (business_id, actor_id, action, entity, entity_id, payload)
  values (
    p_business_id, auth.uid(), 'pos.register.close', 'register_sessions', v_session.id,
    jsonb_build_object(
      'opening_cash', v_session.opening_cash,
      'cash_sales', v_cash_sales,
      'card_sales', v_card_sales,
      'bank_transfer_sales', v_bank_sales,
      'cash_moves', v_moves,
      'sale_count', v_sale_count,
      'expected_cash', v_expected,
      'counted_cash', v_counted,
      'cash_difference', v_diff
    )
  );
  return jsonb_build_object(
    'id', v_session.id,
    'status', v_session.status,
    'opening_cash', v_session.opening_cash,
    'cash_sales', v_cash_sales,
    'card_sales', v_card_sales,
    'bank_transfer_sales', v_bank_sales,
    'sale_count', v_sale_count,
    'expected_cash', v_expected,
    'counted_cash', v_counted,
    'cash_difference', v_diff,
    'closed_at', v_session.closed_at
  );
end;
$fn$;