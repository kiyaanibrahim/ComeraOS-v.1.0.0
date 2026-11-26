-- Server-side generation of due recurring expenses, loan installments, and depreciation.

create or replace function private.generate_due_finance(p_as_of date default current_date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_schedule public.expense_schedules%rowtype;
  v_expense_id uuid;
  v_asset public.fixed_assets%rowtype;
  v_amount numeric(14, 2);
  v_dep_id uuid;
  v_journal uuid;
  v_principal numeric(14, 2);
  v_interest numeric(14, 2);
begin
  for v_schedule in
    select schedule.*
    from public.expense_schedules as schedule
    where schedule.status = 'active'
      and schedule.next_on <= coalesce(p_as_of, current_date)
      and (
        schedule.kind = 'ongoing'
        or (
          schedule.kind = 'fixed'
          and (
            schedule.installment_count is null
            or schedule.generated_count < schedule.installment_count
          )
          and (schedule.end_on is null or schedule.next_on <= schedule.end_on)
        )
      )
    for update
  loop
    v_principal := 0;
    v_interest := 0;
    if v_schedule.loan_id is not null then
      select round(v_schedule.amount * coalesce(loan.interest_rate, 0) / 100.0 / 12.0, 2)
      into v_interest
      from public.loans as loan
      where loan.id = v_schedule.loan_id
        and loan.business_id = v_schedule.business_id;
      v_interest := least(coalesce(v_interest, 0), v_schedule.amount);
      v_principal := round(v_schedule.amount - v_interest, 2);
    end if;

    insert into public.expenses (
      business_id, vendor, category, amount, status, spent_on, due_on,
      location_id, source, schedule_id, loan_id, principal_amount, interest_amount,
      notes, created_by
    ) values (
      v_schedule.business_id,
      v_schedule.vendor,
      v_schedule.category,
      v_schedule.amount,
      'upcoming',
      v_schedule.next_on,
      v_schedule.next_on,
      v_schedule.location_id,
      case when v_schedule.loan_id is not null then 'loan' else 'schedule' end,
      v_schedule.id,
      v_schedule.loan_id,
      coalesce(v_principal, 0),
      coalesce(v_interest, 0),
      v_schedule.notes,
      v_schedule.created_by
    ) returning id into v_expense_id;

    update public.expense_schedules as schedule
    set generated_count = schedule.generated_count + 1,
        next_on = private.next_schedule_date(schedule.next_on, schedule.frequency),
        status = case
          when schedule.kind = 'fixed'
            and schedule.installment_count is not null
            and schedule.generated_count + 1 >= schedule.installment_count
          then 'discontinued'
          when schedule.kind = 'fixed'
            and schedule.end_on is not null
            and private.next_schedule_date(schedule.next_on, schedule.frequency) > schedule.end_on
          then 'discontinued'
          else schedule.status
        end
    where schedule.id = v_schedule.id;

    v_count := v_count + 1;
  end loop;

  for v_asset in
    select asset.*
    from public.fixed_assets as asset
    where asset.status = 'active'
      and asset.useful_life_months > 0
      and asset.acquisition_cost > asset.residual_value
      and date_trunc('month', coalesce(p_as_of, current_date))::date
          > date_trunc('month', asset.acquired_on)::date
  loop
    v_amount := round(
      (v_asset.acquisition_cost - v_asset.residual_value) / v_asset.useful_life_months,
      2
    );
    if v_amount <= 0 then
      continue;
    end if;
    if v_asset.accumulated_depreciation + v_amount > v_asset.acquisition_cost - v_asset.residual_value then
      v_amount := round(v_asset.acquisition_cost - v_asset.residual_value - v_asset.accumulated_depreciation, 2);
    end if;
    if v_amount <= 0 then
      continue;
    end if;

    insert into public.depreciation_entries (business_id, asset_id, amount, period_on)
    values (
      v_asset.business_id,
      v_asset.id,
      v_amount,
      date_trunc('month', coalesce(p_as_of, current_date))::date
    )
    on conflict (business_id, asset_id, period_on) do nothing
    returning id into v_dep_id;

    if v_dep_id is null then
      continue;
    end if;

    v_journal := private.post_journal(
      v_asset.business_id,
      date_trunc('month', coalesce(p_as_of, current_date))::date,
      'Depreciation ' || v_asset.name,
      'depreciation_entry',
      v_dep_id,
      'depreciate',
      jsonb_build_array(
        jsonb_build_object('account_code', '5200', 'debit', v_amount, 'credit', 0),
        jsonb_build_object('account_code', '1510', 'debit', 0, 'credit', v_amount)
      ),
      v_asset.location_id
    );

    update public.depreciation_entries
    set journal_entry_id = v_journal
    where id = v_dep_id;

    update public.fixed_assets as asset
    set accumulated_depreciation = round(asset.accumulated_depreciation + v_amount, 2)
    where asset.id = v_asset.id;

    v_count := v_count + 1;
  end loop;

  update public.expenses as expense
  set status = 'overdue'
  where expense.status in ('upcoming', 'unpaid', 'partially_paid')
    and expense.due_on is not null
    and expense.due_on < coalesce(p_as_of, current_date)
    and expense.amount_paid < expense.amount;

  return v_count;
end;
$$;

revoke all on function private.generate_due_finance(date) from public, anon;

create or replace function public.generate_due_finance(p_as_of date default current_date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (private.is_platform_operator() or auth.role() = 'service_role') then
    if auth.uid() is null then
      raise exception 'Not allowed';
    end if;
  end if;
  return private.generate_due_finance(p_as_of);
end;
$$;

revoke all on function public.generate_due_finance(date) from public, anon;
grant execute on function public.generate_due_finance(date) to authenticated, service_role;

create extension if not exists pg_cron with schema extensions;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'comeraos-generate-due-finance';

    perform cron.schedule(
      'comeraos-generate-due-finance',
      '15 0 * * *',
      $cron$ select private.generate_due_finance(current_date); $cron$
    );
  end if;
exception
  when others then
    raise notice 'pg_cron schedule skipped: %', sqlerrm;
end $$;
