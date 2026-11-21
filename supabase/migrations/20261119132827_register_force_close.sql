create or replace function private.force_close_register_session(
  p_business_id uuid,
  p_session_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_session public.register_sessions%rowtype;
begin
  if not (private.is_business_member(p_business_id) or private.is_platform_operator()) then
    raise exception 'You are not a member of this business';
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
    raise exception 'Only the person who opened this register can force close it';
  end if;
  update public.register_sessions as session
  set status = 'closed',
      closed_at = now(),
      closed_by = auth.uid(),
      force_closed = true
  where session.id = v_session.id
  returning * into v_session;
  insert into public.audit_events (business_id, actor_id, action, entity, entity_id, payload)
  values (
    p_business_id, auth.uid(), 'pos.register.force_close', 'register_sessions', v_session.id,
    jsonb_build_object('force_closed', true)
  );
  return jsonb_build_object('id', v_session.id, 'status', v_session.status, 'force_closed', true, 'closed_at', v_session.closed_at);
end;
$fn$;

create or replace function public.force_close_register_session(p_business_id uuid, p_session_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  return private.force_close_register_session(p_business_id, p_session_id);
end;
$fn$;

revoke all on function private.force_close_register_session(uuid, uuid) from public, anon;
grant execute on function private.force_close_register_session(uuid, uuid) to authenticated;
revoke all on function public.force_close_register_session(uuid, uuid) from public, anon;
grant execute on function public.force_close_register_session(uuid, uuid) to authenticated, service_role;