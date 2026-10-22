-- Counters are shared across serverless instances. Clients can reserve only
-- their own allowance; they cannot read or edit counters directly.
create table public.fm_ai_usage (
  principal text not null,
  window_kind text not null check (window_kind in ('minute', 'day')),
  window_start timestamptz not null,
  allowed integer not null default 0 check (allowed >= 0),
  blocked integer not null default 0 check (blocked >= 0),
  primary key (principal, window_kind, window_start)
);
alter table public.fm_ai_usage enable row level security;
revoke all on public.fm_ai_usage from public, anon, authenticated;

create function public.fm_reserve_ai_request() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  account_id uuid := auth.uid();
  minute_start timestamptz := date_trunc('minute', now());
  day_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  minute_used integer;
  day_used integer;
  global_used integer;
  retry_seconds integer;
begin
  if account_id is null or not public.fm_can('download_reports') then
    return jsonb_build_object('allowed', false, 'reason', 'forbidden');
  end if;
  -- Unlike an unexpired JWT alone, a live session also respects sign-out.
  if not exists (select 1 from auth.sessions s where s.user_id = account_id
    and s.id::text = auth.jwt()->>'session_id'
    and (s.not_after is null or s.not_after > now())) then
    return jsonb_build_object('allowed', false, 'reason', 'forbidden');
  end if;
  -- One lock guards the global and account reservations together, preventing
  -- concurrent instances from each spending the final remaining allowance.
  perform pg_advisory_xact_lock(723416092);
  delete from public.fm_ai_usage where window_start < day_start - interval '30 days'
    or (window_kind = 'minute' and window_start < day_start - interval '1 day');
  select coalesce(max(allowed), 0) into minute_used from public.fm_ai_usage
    where principal = account_id::text and window_kind = 'minute' and window_start = minute_start;
  select coalesce(max(allowed), 0) into day_used from public.fm_ai_usage
    where principal = account_id::text and window_kind = 'day' and window_start = day_start;
  select coalesce(max(allowed), 0) into global_used from public.fm_ai_usage
    where principal = 'global' and window_kind = 'day' and window_start = day_start;
  if minute_used >= 20 or day_used >= 500 or global_used >= 2000 then
    retry_seconds := greatest(1, ceil(extract(epoch from (
      case when day_used >= 500 or global_used >= 2000 then day_start + interval '1 day'
      else minute_start + interval '1 minute' end - now())))::integer);
    insert into public.fm_ai_usage(principal, window_kind, window_start, blocked)
      values ('global', 'day', day_start, 1)
      on conflict (principal, window_kind, window_start) do update
      set blocked = least(public.fm_ai_usage.blocked + 1, 1000000000);
    return jsonb_build_object('allowed', false, 'reason', 'rate_limited', 'retry_after', retry_seconds);
  end if;
  insert into public.fm_ai_usage(principal, window_kind, window_start, allowed)
    values (account_id::text, 'minute', minute_start, 1),
      (account_id::text, 'day', day_start, 1), ('global', 'day', day_start, 1)
    on conflict (principal, window_kind, window_start) do update
    set allowed = public.fm_ai_usage.allowed + 1;
  return jsonb_build_object('allowed', true);
end;
$$;
revoke all on function public.fm_reserve_ai_request() from public, anon;
grant execute on function public.fm_reserve_ai_request() to authenticated;

create function public.fm_security_summary() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.fm_can('manage_users') then
    raise insufficient_privilege using message = 'Administrator access required';
  end if;
  select jsonb_build_object(
    'active_admins', count(*),
    'admins_with_mfa', count(*) filter (where exists (
      select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified'))
  ) into result from public.fm_survey_users u
    where u.is_active and u.role in ('admin', 'super_admin');
  return result || jsonb_build_object(
    'ai_allowed_today', coalesce((select allowed from public.fm_ai_usage where principal = 'global'
      and window_kind = 'day' and window_start = date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'), 0),
    'ai_blocked_today', coalesce((select blocked from public.fm_ai_usage where principal = 'global'
      and window_kind = 'day' and window_start = date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'), 0),
    'per_account_minute', 20, 'per_account_day', 500, 'global_day', 2000);
end;
$$;
revoke all on function public.fm_security_summary() from public, anon;
grant execute on function public.fm_security_summary() to authenticated;
