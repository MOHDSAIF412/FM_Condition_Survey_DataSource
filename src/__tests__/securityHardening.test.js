import { test, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { needsMfa } from '../utils/mfa';
import { safeFilename } from '../utils/fileSaver';
import { contentSecurityPolicy, validateCloudConfig } from '../../scripts/securityHeaders';
import { validateDeviceBackup } from '../utils/deviceBackup';
import { checkReportCancelled } from '../utils/reportTask';

test('MFA gate requires the second factor for enrolled accounts and fails closed on malformed tokens', () => {
  const session = aal => ({ user: { factors: [{status:'verified'}] }, access_token: `header.${btoa(JSON.stringify({aal}))}.signature` });
  expect(needsMfa(session('aal1'))).toBe(true);
  expect(needsMfa(session('aal2'))).toBe(false);
  expect(needsMfa({user:{factors:[{status:'verified'}]},access_token:'bad'})).toBe(true);
  expect(needsMfa({user:{factors:[{status:'unverified'}]}})).toBe(false);
});
test('filenames cannot write outside the report directory', () => {
  expect(safeFilename('../../secret.json')).not.toMatch(/\.\.|[\\/]/);
  expect(safeFilename('Report.xlsx')).toBe('Report.xlsx');
});
test('web and packaged shell reject injected scripts and embedding', () => {
  expect(contentSecurityPolicy).toContain("script-src 'self'");
  expect(contentSecurityPolicy).not.toContain("'unsafe-eval'");
  const config = JSON.parse(readFileSync('vercel.json','utf8'));
  const policy = config.headers[0].headers.find(h => h.key === 'Content-Security-Policy').value;
  expect(policy).toBe(`${contentSecurityPolicy}; frame-ancestors 'none'`);
});
test('backup restoration rejects another account, duplicate IDs and malformed data', () => {
  const backup = {schemaVersion:1,backupType:'device-records',accountId:'a',records:[{id:'s',facility:{},items:[]}]};
  expect(validateDeviceBackup(backup,'a')).toHaveLength(1);
  expect(() => validateDeviceBackup(backup,'b')).toThrow('different account');
  expect(() => validateDeviceBackup({...backup,records:[...backup.records,...backup.records]},'a')).toThrow('duplicate');
  expect(() => validateDeviceBackup({...backup,records:[{id:'s'}]},'a')).toThrow('invalid');
  const controller = new AbortController(); controller.abort();
  expect(() => checkReportCancelled(controller.signal)).toThrow('cancelled');
});

test('real RLS prevents foreign photo writes, technician meter deletion, anonymous privileged calls and MFA bypass', async () => {
  const db = new PGlite();
  const owner='00000000-0000-0000-0000-000000000001', technician='00000000-0000-0000-0000-000000000002';
  const assigned='00000000-0000-0000-0000-000000000010', foreign='00000000-0000-0000-0000-000000000020';
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema storage;
      create function auth.uid() returns uuid language sql as $$select current_setting('test.uid')::uuid$$;
      create function auth.jwt() returns jsonb language sql as $$select current_setting('test.jwt')::jsonb$$;
      create function storage.foldername(name text) returns text[] language sql as $$select string_to_array(name,'/')$$;
      create table auth.users(id uuid primary key,email text);
      create table auth.mfa_factors(user_id uuid,status text);
      create table public.fm_survey_users(id uuid primary key,role text,is_active boolean,permissions jsonb);
      create table public.fm_roles(key text primary key,permissions jsonb,all_projects boolean);
      create table public.fm_project_members(project_id uuid,user_id uuid);
      create table public.projects(id uuid primary key,created_by uuid,notes text);
      create table public.condition_surveys(id text primary key,project_id uuid,facility jsonb);
      create table public.survey_items(id text primary key);
      create table public.survey_photos(id text primary key);
      create table storage.objects(id text primary key,bucket_id text,name text);
      create table public.deleted_rows_archive(id text primary key, data jsonb);
      grant select on public.deleted_rows_archive to anon, authenticated;
      alter table public.deleted_rows_archive enable row level security;
      create policy archive_read_only on public.deleted_rows_archive for select to anon,authenticated using(true);
      insert into public.deleted_rows_archive values('retained','{}');
      create function public.fm_visible_survey_ids() returns setof text language sql security definer as $$select id from condition_surveys where project_id in(select fm_visible_project_ids())$$;
    ` .replace('      create function public.fm_visible_survey_ids() returns setof text language sql security definer as $$select id from condition_surveys where project_id in(select fm_visible_project_ids())$$;', ''));
    await db.exec(readFileSync('supabase/migrations/20261010_owner_only_deletion.sql','utf8'));
    await db.exec(`create function public.fm_visible_survey_ids() returns setof text language plpgsql security definer as $$begin return query select s.id from public.condition_surveys s where s.project_id in(select public.fm_visible_project_ids()); end$$;
      grant usage on schema public,storage,auth to authenticated;
      grant select,insert,update on public.projects,public.condition_surveys,storage.objects to authenticated;
      alter table storage.objects enable row level security;
      alter table projects enable row level security;
      insert into auth.users values('${owner}','msaif412@gmail.com'),('${technician}','technician@example.com');
      insert into fm_survey_users values('${owner}','super_admin',true,'{}'),('${technician}','surveyor',true,'{"edit_surveys":true}');
      set test.uid='${owner}'; set test.jwt='{"aal":"aal1"}';
      insert into projects values('${assigned}','${owner}',null),('${foreign}','${owner}',null);
      insert into fm_project_members values('${assigned}','${technician}');
      insert into condition_surveys values('assigned','${assigned}','{"module":"meter"}'),('foreign','${foreign}','{}');
    `);
    await db.exec(readFileSync('supabase/migrations/20261014195847_harden_owner_storage_and_mfa.sql','utf8'));
    await db.exec(readFileSync('supabase/migrations/20261014204725_secure_recovery_archive_access.sql','utf8'));
    await db.exec(`set role authenticated; set test.uid='${technician}'`);
    expect((await db.query('select id from deleted_rows_archive')).rows).toEqual([]);
    expect((await db.query('select id from projects')).rows).toEqual([{id:assigned}]);
    await db.exec(`insert into storage.objects values('own','survey-photos','projects/${assigned}/new-survey/item/photo.jpg')`);
    await expect(db.exec(`insert into storage.objects values('foreign','survey-photos','projects/${foreign}/foreign/item/photo.jpg')`)).rejects.toThrow(/row-level security/);
    await expect(db.exec(`update condition_surveys set facility='{"module":"meter","meter":{"deletedAt":"today"}}' where id='assigned'`)).rejects.toThrow('Only the owner');
    await db.exec(`reset role; insert into auth.mfa_factors values('${technician}','verified'); set role authenticated;`);
    expect((await db.query(`select fm_can('edit_surveys') as allowed`)).rows[0].allowed).toBe(false);
    expect((await db.query('select id from projects')).rows).toEqual([]);
    await db.exec(`set test.jwt='{"aal":"aal2"}'`);
    expect((await db.query(`select fm_can('edit_surveys') as allowed`)).rows[0].allowed).toBe(true);
    await db.exec('reset role; set role anon;');
    await expect(db.query('select public.fm_is_deletion_owner()')).rejects.toThrow('permission denied');
    await expect(db.query('select public.fm_owner_deletion_guard()')).rejects.toThrow('permission denied');
    await expect(db.query('select id from deleted_rows_archive')).rejects.toThrow('permission denied');
    await db.exec(`reset role; set test.uid='${owner}'; set role authenticated;`);
    expect((await db.query('select id from deleted_rows_archive')).rows).toEqual([{id:'retained'}]);
  } finally { await db.close(); }
}, 30000);

test('production builds refuse missing configuration or privileged Supabase keys', () => {
  expect(() => validateCloudConfig({})).toThrow('Production requires');
  const url='https://example.supabase.co';
  expect(() => validateCloudConfig({VITE_SUPABASE_URL:url,VITE_SUPABASE_ANON_KEY:'sb_secret_never_ship'})).toThrow('Secret');
  expect(() => validateCloudConfig({VITE_SUPABASE_URL:url,VITE_SUPABASE_ANON_KEY:'sb_publishable_public'})).not.toThrow();
});
