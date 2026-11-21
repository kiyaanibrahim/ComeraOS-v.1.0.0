create or replace function private.open_register_session(
  p_business_id uuid,
  p_register_id uuid,
  p_opening_cash numeric,
  p_opening_count jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_session public.register_sessions%rowtype;
  v_cash numeric(14, 2) := coalesce(p_opening_cash, 0);
  v_number integer;
begin
  if not (private.is_business_member(p_business_id) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
  end if;
  if v_cash < 0 then
    raise exception 'Opening cash cannot be negative';
  end if;
  if not exists (
    select 1 from public.registers as register
    where register.id = p_register_id
      and register.business_id = p_business_id
      and register.status = 'active'
  ) then
    raise exception 'Choose an active register';
  end if;

  select session.* into v_session
  from public.register_sessions as session
  where session.register_id = p_register_id
    and session.business_id = p_business_id
    and session.status = 'open'
  limit 1;

  if found then
    if v_session.opened_by is distinct from auth.uid() then
      raise exception 'This register is already open';
    end if;
    return jsonb_build_object(
      'id', v_session.id,
      'register_id', v_session.register_id,
      'opening_cash', v_session.opening_cash,
      'opened_at', v_session.opened_at,
      'status', v_session.status,
      'session_number', v_session.session_number,
      'resumed', true
    );
  end if;

  perform 1 from public.businesses as business where business.id = p_business_id for update;
  select coalesce(max(session.session_number), 0) + 1 into v_number
  from public.register_sessions as session
  where session.business_id = p_business_id;

  insert into public.register_sessions (
    business_id, register_id, opened_by, opening_cash, opening_count, status, session_number
  ) values (
    p_business_id, p_register_id, auth.uid(), v_cash, coalesce(p_opening_count, '{}'::jsonb), 'open', v_number
  )
  returning * into v_session;

  insert into public.audit_events (business_id, actor_id, action, entity, entity_id, payload)
  values (
    p_business_id, auth.uid(), 'pos.register.open', 'register_sessions', v_session.id,
    jsonb_build_object('register_id', p_register_id, 'opening_cash', v_cash, 'session_number', v_number)
  );

  return jsonb_build_object(
    'id', v_session.id,
    'register_id', v_session.register_id,
    'opening_cash', v_session.opening_cash,
    'opened_at', v_session.opened_at,
    'status', v_session.status,
    'session_number', v_session.session_number,
    'resumed', false
  );
end;
$fn$;