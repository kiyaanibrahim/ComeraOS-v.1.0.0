-- Public RPCs for Financials desks and inventory adjustments.

create or replace function private.next_schedule_date(p_from date, p_frequency text)
returns date
language sql
immutable
as $$
  select case p_frequency
    when 'weekly' then (p_from + interval '7 days')::date
    when 'monthly' then (p_from + interval '1 month')::date
    when 'quarterly' then (p_from + interval '3 months')::date
    when 'yearly' then (p_from + interval '1 year')::date
    else p_from
  end;
$$;

create or replace function public.create_manual_expense(
  p_business_id uuid,
  p_vendor text,
  p_category text,
  p_amount numeric,
  p_spent_on date default current_date,
  p_due_on date default null,
  p_location_id uuid default null,
  p_notes text default null,
  p_account_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not (private.is_business_member(p_business_id) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  insert into public.expenses (
    business_id, vendor, category, amount, status, spent_on, due_on,
    location_id, notes, source, account_id, created_by
  ) values (
    p_business_id,
    coalesce(nullif(btrim(coalesce(p_vendor, '')), ''), 'Vendor'),
    coalesce(nullif(btrim(coalesce(p_category, '')), ''), 'Operating'),
    round(p_amount, 2),
    'unpaid',
    coalesce(p_spent_on, current_date),
    coalesce(p_due_on, p_spent_on, current_date),
    p_location_id,
    nullif(btrim(coalesce(p_notes, '')), ''),
    'manual',
    p_account_id,
    auth.uid()
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_manual_expense(uuid, text, text, numeric, date, date, uuid, text, uuid) from public, anon;
grant execute on function public.create_manual_expense(uuid, text, text, numeric, date, date, uuid, text, uuid) to authenticated;

create or replace function public.create_expense_schedule(
  p_business_id uuid,
  p_vendor text,
  p_category text,
  p_amount numeric,
  p_frequency text,
  p_kind text,
  p_start_on date,
  p_end_on date default null,
  p_installment_count integer default null,
  p_location_id uuid default null,
  p_notes text default null,
  p_loan_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not (private.is_business_member(p_business_id) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;
  if p_frequency not in ('weekly', 'monthly', 'quarterly', 'yearly') then
    raise exception 'Choose a valid frequency';
  end if;
  if p_kind not in ('fixed', 'ongoing') then
    raise exception 'Choose fixed or ongoing';
  end if;

  insert into public.expense_schedules (
    business_id, vendor, category, amount, frequency, kind, start_on, end_on,
    installment_count, next_on, location_id, notes, loan_id, created_by
  ) values (
    p_business_id,
    nullif(btrim(p_vendor), ''),
    nullif(btrim(coalesce(p_category, 'Operating')), ''),
    round(p_amount, 2),
    p_frequency,
    p_kind,
    coalesce(p_start_on, current_date),
    p_end_on,
    p_installment_count,
    coalesce(p_start_on, current_date),
    p_location_id,
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_loan_id,
    auth.uid()
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_expense_schedule(uuid, text, text, numeric, text, text, date, date, integer, uuid, text, uuid) from public, anon;
grant execute on function public.create_expense_schedule(uuid, text, text, numeric, text, text, date, date, integer, uuid, text, uuid) to authenticated;

create or replace function public.set_expense_schedule_status(
  p_business_id uuid,
  p_schedule_id uuid,
  p_status text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (private.is_business_member(p_business_id) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;
  if p_status not in ('active', 'paused', 'discontinued') then
    raise exception 'Unknown schedule status';
  end if;
  update public.expense_schedules as schedule
  set status = p_status
  where schedule.id = p_schedule_id
    and schedule.business_id = p_business_id;
  if not found then
    raise exception 'Schedule not found';
  end if;
end;
$$;

revoke all on function public.set_expense_schedule_status(uuid, uuid, text) from public, anon;
grant execute on function public.set_expense_schedule_status(uuid, uuid, text) to authenticated;

create or replace function public.pay_expense(
  p_business_id uuid,
  p_expense_id uuid,
  p_amount numeric,
  p_method text default 'cash',
  p_paid_on date default current_date,
  p_bank_account_id uuid default null,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expense public.expenses%rowtype;
  v_payment uuid;
  v_journal uuid;
  v_cash_code text;
  v_expense_account uuid;
  v_remaining numeric(14, 2);
  v_principal numeric(14, 2);
  v_interest numeric(14, 2);
  v_lines jsonb;
begin
  if not (private.is_business_member(p_business_id) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  select expense.* into v_expense
  from public.expenses as expense
  where expense.id = p_expense_id and expense.business_id = p_business_id
  for update;
  if not found then
    raise exception 'Expense not found';
  end if;

  v_remaining := round(v_expense.amount - v_expense.amount_paid, 2);
  if p_amount > v_remaining then
    raise exception 'Payment exceeds the outstanding amount';
  end if;

  v_cash_code := private.cash_account_code(p_method);
  v_expense_account := coalesce(
    v_expense.account_id,
    private.account_by_code(p_business_id, case when v_expense.source = 'payroll' then '5400' else '5000' end)
  );

  if v_expense.source = 'loan' then
    v_principal := least(round(coalesce(nullif(v_expense.principal_amount, 0), v_expense.amount - v_expense.interest_amount), 2), p_amount);
    v_interest := round(p_amount - v_principal, 2);
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', '2100', 'debit', v_principal, 'credit', 0)
    );
    if v_interest > 0 then
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object('account_code', '5300', 'debit', v_interest, 'credit', 0)
      );
    end if;
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', v_cash_code, 'debit', 0, 'credit', p_amount)
    );
  else
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_expense_account, 'debit', p_amount, 'credit', 0),
      jsonb_build_object('account_code', v_cash_code, 'debit', 0, 'credit', p_amount)
    );
  end if;

  insert into public.expense_payments (
    business_id, expense_id, amount, paid_on, method, bank_account_id, notes, created_by
  ) values (
    p_business_id, p_expense_id, round(p_amount, 2), coalesce(p_paid_on, current_date),
    lower(coalesce(p_method, 'cash')), p_bank_account_id, nullif(btrim(coalesce(p_notes, '')), ''), auth.uid()
  ) returning id into v_payment;

  v_journal := private.post_journal(
    p_business_id,
    coalesce(p_paid_on, current_date),
    'Expense payment',
    'expense_payment',
    v_payment,
    'pay',
    v_lines,
    v_expense.location_id
  );

  update public.expense_payments
  set journal_entry_id = v_journal
  where id = v_payment;

  update public.expenses as expense
  set amount_paid = round(expense.amount_paid + p_amount, 2),
      status = case
        when round(expense.amount_paid + p_amount, 2) >= expense.amount then 'paid'
        when round(expense.amount_paid + p_amount, 2) > 0 then 'partially_paid'
        else expense.status
      end
  where expense.id = p_expense_id;

  if v_expense.source = 'loan' and v_expense.loan_id is not null and v_principal > 0 then
    update public.loans as loan
    set outstanding = greatest(round(loan.outstanding - v_principal, 2), 0),
        status = case when greatest(round(loan.outstanding - v_principal, 2), 0) = 0 then 'paid' else loan.status end
    where loan.id = v_expense.loan_id
      and loan.business_id = p_business_id;
  end if;

  return v_payment;
end;
$$;

revoke all on function public.pay_expense(uuid, uuid, numeric, text, date, uuid, text) from public, anon;
grant execute on function public.pay_expense(uuid, uuid, numeric, text, date, uuid, text) to authenticated;

create or replace function public.pay_supplier(
  p_business_id uuid,
  p_shipment_id uuid,
  p_amount numeric,
  p_method text default 'bank_transfer',
  p_paid_on date default current_date,
  p_bank_account_id uuid default null,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shipment public.shipments%rowtype;
  v_paid numeric(14, 2);
  v_payment uuid;
  v_journal uuid;
  v_cash_code text;
begin
  if not (private.is_business_member(p_business_id) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;
  select shipment.* into v_shipment
  from public.shipments as shipment
  where shipment.id = p_shipment_id and shipment.business_id = p_business_id
  for update;
  if not found or v_shipment.status <> 'delivered' then
    raise exception 'Choose a received purchase';
  end if;
  select coalesce(sum(payment.amount), 0) into v_paid
  from public.supplier_payments as payment
  where payment.shipment_id = p_shipment_id and payment.business_id = p_business_id;
  if p_amount <= 0 or p_amount > round(coalesce(v_shipment.landing_total, 0) - v_paid, 2) then
    raise exception 'Payment must be within the outstanding balance';
  end if;

  v_cash_code := private.cash_account_code(p_method);
  insert into public.supplier_payments (
    business_id, shipment_id, amount, paid_on, method, bank_account_id, notes, created_by
  ) values (
    p_business_id, p_shipment_id, round(p_amount, 2), coalesce(p_paid_on, current_date),
    lower(coalesce(p_method, 'bank_transfer')), p_bank_account_id, nullif(btrim(coalesce(p_notes, '')), ''), auth.uid()
  ) returning id into v_payment;

  v_journal := private.post_journal(
    p_business_id,
    coalesce(p_paid_on, current_date),
    'Supplier payment',
    'supplier_payment',
    v_payment,
    'pay',
    jsonb_build_array(
      jsonb_build_object('account_code', '2000', 'debit', p_amount, 'credit', 0),
      jsonb_build_object('account_code', v_cash_code, 'debit', 0, 'credit', p_amount)
    ),
    v_shipment.location_id
  );

  update public.supplier_payments set journal_entry_id = v_journal where id = v_payment;
  return v_payment;
end;
$$;

revoke all on function public.pay_supplier(uuid, uuid, numeric, text, date, uuid, text) from public, anon;
grant execute on function public.pay_supplier(uuid, uuid, numeric, text, date, uuid, text) to authenticated;

create or replace function public.create_capital_entry(
  p_business_id uuid,
  p_kind text,
  p_description text,
  p_amount numeric,
  p_occurred_on date default current_date,
  p_location_id uuid default null,
  p_method text default 'bank_transfer'
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_journal uuid;
  v_cash_code text;
  v_lines jsonb;
begin
  if not (private.is_business_admin(p_business_id) or private.is_platform_operator()) then
    raise exception 'Only admins can record capital entries';
  end if;
  if p_kind not in ('contribution', 'withdrawal', 'investment', 'injection') then
    raise exception 'Choose contribution, withdrawal, or investment';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  insert into public.capital_entries (
    business_id, kind, description, amount, occurred_on, location_id
  ) values (
    p_business_id,
    case when p_kind = 'injection' then 'contribution' else p_kind end,
    nullif(btrim(p_description), ''),
    round(p_amount, 2),
    coalesce(p_occurred_on, current_date),
    p_location_id
  ) returning id into v_id;

  v_cash_code := private.cash_account_code(p_method);
  if p_kind = 'withdrawal' then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', '3100', 'debit', p_amount, 'credit', 0),
      jsonb_build_object('account_code', v_cash_code, 'debit', 0, 'credit', p_amount)
    );
  else
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', v_cash_code, 'debit', p_amount, 'credit', 0),
      jsonb_build_object('account_code', '3000', 'debit', 0, 'credit', p_amount)
    );
  end if;

  v_journal := private.post_journal(
    p_business_id,
    coalesce(p_occurred_on, current_date),
    'Capital ' || p_kind,
    'capital_entry',
    v_id,
    p_kind,
    v_lines,
    p_location_id
  );
  update public.capital_entries set journal_entry_id = v_journal where id = v_id;
  return v_id;
end;
$$;

revoke all on function public.create_capital_entry(uuid, text, text, numeric, date, uuid, text) from public, anon;
grant execute on function public.create_capital_entry(uuid, text, text, numeric, date, uuid, text) to authenticated;

create or replace function public.create_fixed_asset(
  p_business_id uuid,
  p_name text,
  p_acquisition_cost numeric,
  p_useful_life_months integer default 36,
  p_acquired_on date default current_date,
  p_residual_value numeric default 0,
  p_location_id uuid default null,
  p_method text default 'bank_transfer',
  p_category text default 'equipment'
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_journal uuid;
  v_cash_code text;
begin
  if not (private.is_business_admin(p_business_id) or private.is_platform_operator()) then
    raise exception 'Only admins can create assets';
  end if;
  insert into public.fixed_assets (
    business_id, name, category, acquisition_cost, residual_value, useful_life_months,
    acquired_on, location_id, created_by
  ) values (
    p_business_id, nullif(btrim(p_name), ''), coalesce(p_category, 'equipment'),
    round(p_acquisition_cost, 2), round(coalesce(p_residual_value, 0), 2),
    greatest(coalesce(p_useful_life_months, 36), 1), coalesce(p_acquired_on, current_date),
    p_location_id, auth.uid()
  ) returning id into v_id;

  v_cash_code := private.cash_account_code(p_method);
  v_journal := private.post_journal(
    p_business_id,
    coalesce(p_acquired_on, current_date),
    'Asset ' || p_name,
    'fixed_asset',
    v_id,
    'acquisition',
    jsonb_build_array(
      jsonb_build_object('account_code', '1500', 'debit', p_acquisition_cost, 'credit', 0),
      jsonb_build_object('account_code', v_cash_code, 'debit', 0, 'credit', p_acquisition_cost)
    ),
    p_location_id
  );
  update public.fixed_assets set acquisition_journal_id = v_journal where id = v_id;
  return v_id;
end;
$$;

revoke all on function public.create_fixed_asset(uuid, text, numeric, integer, date, numeric, uuid, text, text) from public, anon;
grant execute on function public.create_fixed_asset(uuid, text, numeric, integer, date, numeric, uuid, text, text) to authenticated;

create or replace function public.create_loan(
  p_business_id uuid,
  p_name text,
  p_lender text,
  p_principal numeric,
  p_interest_rate numeric default 0,
  p_start_on date default current_date,
  p_end_on date default null,
  p_installment_count integer default null,
  p_frequency text default 'monthly',
  p_method text default 'bank_transfer',
  p_location_id uuid default null,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_journal uuid;
  v_cash_code text;
  v_installment numeric(14, 2);
  v_schedule uuid;
  v_interest_portion numeric(14, 2);
  v_principal_portion numeric(14, 2);
begin
  if not (private.is_business_admin(p_business_id) or private.is_platform_operator()) then
    raise exception 'Only admins can create loans';
  end if;
  if coalesce(p_principal, 0) <= 0 then
    raise exception 'Principal must be greater than zero';
  end if;

  v_installment := case
    when coalesce(p_installment_count, 0) > 0 then round(p_principal / p_installment_count, 2)
    else null
  end;

  insert into public.loans (
    business_id, name, lender, principal, outstanding, interest_rate, start_on, end_on,
    installment_count, installment_amount, frequency, next_on, location_id, notes, created_by
  ) values (
    p_business_id, nullif(btrim(p_name), ''), nullif(btrim(p_lender), ''),
    round(p_principal, 2), round(p_principal, 2), coalesce(p_interest_rate, 0),
    coalesce(p_start_on, current_date), p_end_on, p_installment_count, v_installment,
    coalesce(p_frequency, 'monthly'),
    case when coalesce(p_installment_count, 0) > 0 then coalesce(p_start_on, current_date) else null end,
    p_location_id, nullif(btrim(coalesce(p_notes, '')), ''), auth.uid()
  ) returning id into v_id;

  v_cash_code := private.cash_account_code(p_method);
  v_journal := private.post_journal(
    p_business_id,
    coalesce(p_start_on, current_date),
    'Loan ' || p_name,
    'loan',
    v_id,
    'drawdown',
    jsonb_build_array(
      jsonb_build_object('account_code', v_cash_code, 'debit', p_principal, 'credit', 0),
      jsonb_build_object('account_code', '2100', 'debit', 0, 'credit', p_principal)
    ),
    p_location_id
  );

  if coalesce(p_installment_count, 0) > 0 and v_installment is not null then
    v_interest_portion := round(v_installment * coalesce(p_interest_rate, 0) / 100.0 / 12.0, 2);
    v_principal_portion := round(v_installment - v_interest_portion, 2);
    insert into public.expense_schedules (
      business_id, vendor, category, amount, frequency, kind, start_on, end_on,
      installment_count, next_on, loan_id, location_id, notes, created_by
    ) values (
      p_business_id, p_lender, 'Loan repayment', v_installment, coalesce(p_frequency, 'monthly'),
      'fixed', coalesce(p_start_on, current_date), p_end_on, p_installment_count,
      coalesce(p_start_on, current_date), v_id, p_location_id, 'Loan schedule', auth.uid()
    ) returning id into v_schedule;
  end if;

  return v_id;
end;
$$;

revoke all on function public.create_loan(uuid, text, text, numeric, numeric, date, date, integer, text, text, uuid, text) from public, anon;
grant execute on function public.create_loan(uuid, text, text, numeric, numeric, date, date, integer, text, text, uuid, text) to authenticated;

create or replace function public.create_manual_journal(
  p_business_id uuid,
  p_entry_date date,
  p_memo text,
  p_lines jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not (private.is_business_admin(p_business_id) or private.is_platform_operator()) then
    raise exception 'Only admins can post manual journals';
  end if;
  v_id := private.post_journal(
    p_business_id,
    coalesce(p_entry_date, current_date),
    coalesce(p_memo, 'Manual journal'),
    'manual',
    gen_random_uuid(),
    'manual',
    p_lines
  );
  return v_id;
end;
$$;

revoke all on function public.create_manual_journal(uuid, date, text, jsonb) from public, anon;
grant execute on function public.create_manual_journal(uuid, date, text, jsonb) to authenticated;

create or replace function public.recognize_other_income(
  p_business_id uuid,
  p_source text,
  p_category text,
  p_amount numeric,
  p_recognized_on date default current_date,
  p_method text default 'cash'
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_cash_code text;
begin
  if not (private.is_business_member(p_business_id) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;
  insert into public.revenues (
    business_id, source, category, amount, status, recognized_on, created_by
  ) values (
    p_business_id,
    nullif(btrim(coalesce(p_source, 'other')), ''),
    nullif(btrim(coalesce(p_category, 'Other')), ''),
    round(p_amount, 2),
    'recognized',
    coalesce(p_recognized_on, current_date),
    auth.uid()
  ) returning id into v_id;

  v_cash_code := private.cash_account_code(p_method);
  perform private.post_journal(
    p_business_id,
    coalesce(p_recognized_on, current_date),
    'Other income',
    'revenue',
    v_id,
    'recognized',
    jsonb_build_array(
      jsonb_build_object('account_code', v_cash_code, 'debit', p_amount, 'credit', 0),
      jsonb_build_object('account_code', '4100', 'debit', 0, 'credit', p_amount)
    )
  );
  return v_id;
end;
$$;

revoke all on function public.recognize_other_income(uuid, text, text, numeric, date, text) from public, anon;
grant execute on function public.recognize_other_income(uuid, text, text, numeric, date, text) to authenticated;

create or replace function public.adjust_inventory(
  p_business_id uuid,
  p_product_id uuid,
  p_location_id uuid,
  p_quantity numeric,
  p_reason text default 'adjustment',
  p_reference text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_move uuid;
begin
  if not (private.is_business_member(p_business_id) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;
  if coalesce(p_quantity, 0) = 0 then
    raise exception 'Quantity cannot be zero';
  end if;

  insert into public.inventory_balances (business_id, product_id, location_id, quantity)
  values (p_business_id, p_product_id, p_location_id, p_quantity)
  on conflict (business_id, product_id, location_id)
  do update set quantity = public.inventory_balances.quantity + excluded.quantity,
                updated_at = now();

  insert into public.inventory_movements (
    business_id, product_id, location_id, quantity, reason, reference, created_by
  ) values (
    p_business_id, p_product_id, p_location_id, p_quantity,
    case when p_reason in ('adjustment', 'stock_adjustment') then p_reason else 'adjustment' end,
    nullif(btrim(coalesce(p_reference, '')), ''),
    auth.uid()
  ) returning id into v_move;

  return v_move;
end;
$$;

revoke all on function public.adjust_inventory(uuid, uuid, uuid, numeric, text, text) from public, anon;
grant execute on function public.adjust_inventory(uuid, uuid, uuid, numeric, text, text) to authenticated;

create or replace function public.reconcile_register_session(
  p_business_id uuid,
  p_session_id uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.register_sessions%rowtype;
  v_journal uuid;
  v_diff numeric(14, 2);
begin
  if not (private.is_business_member(p_business_id) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;
  select session.* into v_session
  from public.register_sessions as session
  where session.id = p_session_id and session.business_id = p_business_id
  for update;
  if not found then
    raise exception 'Session not found';
  end if;
  if v_session.reconciled then
    return v_session.reconciliation_journal_id;
  end if;

  v_diff := round(coalesce(v_session.cash_difference, 0), 2);
  if v_diff = 0 then
    update public.register_sessions
    set reconciled = true
    where id = p_session_id;
    return null;
  end if;

  if v_diff > 0 then
    v_journal := private.post_journal(
      p_business_id,
      coalesce(v_session.closed_at::date, current_date),
      'Register cash over',
      'register_session',
      p_session_id,
      'cash_difference',
      jsonb_build_array(
        jsonb_build_object('account_code', '1000', 'debit', v_diff, 'credit', 0),
        jsonb_build_object('account_code', '5600', 'debit', 0, 'credit', v_diff)
      ),
      null,
      v_session.register_id,
      p_session_id
    );
  else
    v_journal := private.post_journal(
      p_business_id,
      coalesce(v_session.closed_at::date, current_date),
      'Register cash short',
      'register_session',
      p_session_id,
      'cash_difference',
      jsonb_build_array(
        jsonb_build_object('account_code', '5600', 'debit', abs(v_diff), 'credit', 0),
        jsonb_build_object('account_code', '1000', 'debit', 0, 'credit', abs(v_diff))
      ),
      null,
      v_session.register_id,
      p_session_id
    );
  end if;

  update public.register_sessions
  set reconciled = true, reconciliation_journal_id = v_journal
  where id = p_session_id;
  return v_journal;
end;
$$;

revoke all on function public.reconcile_register_session(uuid, uuid) from public, anon;
grant execute on function public.reconcile_register_session(uuid, uuid) to authenticated;

create or replace function public.add_bank_statement_line(
  p_business_id uuid,
  p_bank_account_id uuid,
  p_posted_on date,
  p_description text,
  p_amount numeric
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not (private.is_business_admin(p_business_id) or private.is_platform_operator()) then
    raise exception 'Only admins can enter statement lines';
  end if;
  insert into public.bank_statement_lines (
    business_id, bank_account_id, posted_on, description, amount, created_by
  ) values (
    p_business_id, p_bank_account_id, coalesce(p_posted_on, current_date),
    nullif(btrim(p_description), ''), round(p_amount, 2), auth.uid()
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.add_bank_statement_line(uuid, uuid, date, text, numeric) from public, anon;
grant execute on function public.add_bank_statement_line(uuid, uuid, date, text, numeric) to authenticated;

create or replace function public.match_bank_statement_line(
  p_business_id uuid,
  p_line_id uuid,
  p_payment_id uuid default null,
  p_supplier_payment_id uuid default null,
  p_expense_payment_id uuid default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (private.is_business_admin(p_business_id) or private.is_platform_operator()) then
    raise exception 'Only admins can reconcile bank lines';
  end if;
  update public.bank_statement_lines as line
  set status = 'matched',
      matched_payment_id = p_payment_id,
      matched_supplier_payment_id = p_supplier_payment_id,
      matched_expense_payment_id = p_expense_payment_id
  where line.id = p_line_id
    and line.business_id = p_business_id
    and line.status = 'open';
  if not found then
    raise exception 'Statement line not found or already matched';
  end if;
end;
$$;

revoke all on function public.match_bank_statement_line(uuid, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.match_bank_statement_line(uuid, uuid, uuid, uuid, uuid) to authenticated;

create or replace function public.adjust_bank_statement_line(
  p_business_id uuid,
  p_line_id uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.bank_statement_lines%rowtype;
  v_bank public.bank_accounts%rowtype;
  v_journal uuid;
  v_amount numeric(14, 2);
begin
  if not (private.is_business_admin(p_business_id) or private.is_platform_operator()) then
    raise exception 'Only admins can adjust bank lines';
  end if;
  select line.* into v_line from public.bank_statement_lines as line
  where line.id = p_line_id and line.business_id = p_business_id for update;
  if not found or v_line.status <> 'open' then
    raise exception 'Open statement line required';
  end if;
  select bank.* into v_bank from public.bank_accounts as bank where bank.id = v_line.bank_account_id;
  v_amount := abs(v_line.amount);

  if v_line.amount >= 0 then
    v_journal := private.post_journal(
      p_business_id, v_line.posted_on, 'Bank adjustment',
      'bank_statement_line', p_line_id, 'cash_difference',
      jsonb_build_array(
        jsonb_build_object('account_id', v_bank.ledger_account_id, 'debit', v_amount, 'credit', 0),
        jsonb_build_object('account_code', '5600', 'debit', 0, 'credit', v_amount)
      )
    );
  else
    v_journal := private.post_journal(
      p_business_id, v_line.posted_on, 'Bank adjustment',
      'bank_statement_line', p_line_id, 'cash_difference',
      jsonb_build_array(
        jsonb_build_object('account_code', '5600', 'debit', v_amount, 'credit', 0),
        jsonb_build_object('account_id', v_bank.ledger_account_id, 'debit', 0, 'credit', v_amount)
      )
    );
  end if;

  update public.bank_statement_lines
  set status = 'adjusted', journal_entry_id = v_journal
  where id = p_line_id;
  return v_journal;
end;
$$;

revoke all on function public.adjust_bank_statement_line(uuid, uuid) from public, anon;
grant execute on function public.adjust_bank_statement_line(uuid, uuid) to authenticated;

create or replace function public.create_bank_account(
  p_business_id uuid,
  p_name text,
  p_institution text default null,
  p_account_number_last4 text default null,
  p_opening_balance numeric default 0
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ledger uuid;
  v_id uuid;
begin
  if not (private.is_business_admin(p_business_id) or private.is_platform_operator()) then
    raise exception 'Only admins can create bank accounts';
  end if;
  v_ledger := private.account_by_code(p_business_id, '1010');
  insert into public.bank_accounts (
    business_id, name, institution, account_number_last4, ledger_account_id, opening_balance
  ) values (
    p_business_id, nullif(btrim(p_name), ''), nullif(btrim(coalesce(p_institution, '')), ''),
    nullif(btrim(coalesce(p_account_number_last4, '')), ''), v_ledger, round(coalesce(p_opening_balance, 0), 2)
  ) returning id into v_id;

  if coalesce(p_opening_balance, 0) <> 0 then
    if p_opening_balance > 0 then
      perform private.post_journal(
        p_business_id, current_date, 'Opening bank balance',
        'bank_account', v_id, 'opening',
        jsonb_build_array(
          jsonb_build_object('account_code', '1010', 'debit', p_opening_balance, 'credit', 0),
          jsonb_build_object('account_code', '3000', 'debit', 0, 'credit', p_opening_balance)
        )
      );
    else
      perform private.post_journal(
        p_business_id, current_date, 'Opening bank balance',
        'bank_account', v_id, 'opening',
        jsonb_build_array(
          jsonb_build_object('account_code', '3000', 'debit', abs(p_opening_balance), 'credit', 0),
          jsonb_build_object('account_code', '1010', 'debit', 0, 'credit', abs(p_opening_balance))
        )
      );
    end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public.create_bank_account(uuid, text, text, text, numeric) from public, anon;
grant execute on function public.create_bank_account(uuid, text, text, text, numeric) to authenticated;
