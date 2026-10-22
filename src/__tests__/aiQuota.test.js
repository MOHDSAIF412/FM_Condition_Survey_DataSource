import { test, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

test('database quotas enforce permission, session, account and global ceilings with private counters', async () => {
  const db = new PGlite();
  const uid = '00000000-0000-0000-0000-000000000001';
  const session = '00000000-0000-0000-0000-000000000002';
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$select current_setting('test.uid')::uuid$$;
      create function auth.jwt() returns jsonb language sql as $$select current_setting('test.jwt')::jsonb$$;
      create function public.fm_can(text) returns boolean language sql as $$select current_setting('test.allowed') = 'yes'$$;
      create table auth.sessions(id uuid, user_id uuid, not_after timestamptz);
      create table auth.mfa_factors(user_id uuid, status text);
      create table public.fm_survey_users(id uuid, role text, is_active boolean);
      insert into auth.sessions values('${session}','${uid}',null);
      insert into public.fm_survey_users values('${uid}','admin',true);
      set test.uid='${uid}'; set test.jwt='{"session_id":"${session}"}'; set test.allowed='yes';
      grant usage on schema public,auth to authenticated,anon;
    `);
    await db.exec(readFileSync('supabase/migrations/20261022091550_ai_request_quotas.sql', 'utf8'));
    const reserve = async () => (await db.query('select public.fm_reserve_ai_request() as quota')).rows[0].quota;
    await db.exec("set test.allowed='no'; set role authenticated;");
    expect(await reserve()).toEqual({ allowed: false, reason: 'forbidden' });
    await db.exec("set test.allowed='yes'; set test.jwt='{}';");
    expect(await reserve()).toEqual({ allowed: false, reason: 'forbidden' });
    await db.exec(`set test.jwt='{"session_id":"${session}"}';`);
    const parallel = await Promise.all(Array.from({ length: 25 }, reserve));
    expect(parallel.filter(q => q.allowed)).toHaveLength(20);
    expect(parallel.filter(q => q.reason === 'rate_limited')).toHaveLength(5);
    await expect(db.query('select * from public.fm_ai_usage')).rejects.toThrow('permission denied');
    await expect(db.exec('update public.fm_ai_usage set allowed=0')).rejects.toThrow('permission denied');
    const summary = (await db.query('select public.fm_security_summary() as status')).rows[0].status;
    expect(summary.ai_allowed_today).toBe(20);
    expect(summary.ai_blocked_today).toBe(5);
    await db.exec("set test.allowed='no';");
    await expect(db.query('select public.fm_security_summary()')).rejects.toThrow('Administrator access required');
    await db.exec("reset role; set test.allowed='yes'; delete from public.fm_ai_usage where window_kind='minute'; update public.fm_ai_usage set allowed=500 where principal <> 'global'; set role authenticated;");
    expect((await reserve()).reason).toBe('rate_limited');
    await db.exec("reset role; update public.fm_ai_usage set allowed=0; update public.fm_ai_usage set allowed=2000 where principal='global'; set role authenticated;");
    expect((await reserve()).reason).toBe('rate_limited');
    await db.exec('reset role; set role anon;');
    await expect(reserve()).rejects.toThrow('permission denied');
  } finally { await db.close(); }
}, 30000);
