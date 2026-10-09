import { test, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { hasPermission } from '../utils/roles';

test('only the nominated active account can delete, even with admin or extra grants', () => {
  for (const role of ['super_admin', 'admin', 'manager', 'surveyor', 'engineer', 'viewer']) {
    for (const permission of ['delete_snags', 'delete_projects']) {
      expect(hasPermission({ role, email: 'other@example.com', permissions: { [permission]: true } }, permission)).toBe(false);
      expect(hasPermission({ role, email: 'MSAIF412@gmail.com' }, permission)).toBe(true);
      expect(hasPermission({ role, email: 'msaif412@gmail.com', is_active: false }, permission)).toBe(false);
    }
  }
});

test('database blocks other accounts from physical and soft deletion without blocking edits', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select current_setting('test.uid')::uuid $$;
      create table auth.users(id uuid primary key, email text);
      create table fm_survey_users(id uuid primary key, role text, is_active boolean, permissions jsonb);
      create table fm_roles(key text primary key, permissions jsonb);
      create table projects(id text primary key, notes text);
      create table condition_surveys(id text primary key, facility jsonb);
      create table survey_items(id text primary key);
      create table survey_photos(id text primary key);
      insert into auth.users values ('00000000-0000-0000-0000-000000000001','msaif412@gmail.com'),('00000000-0000-0000-0000-000000000002','technician@example.com');
      insert into fm_survey_users select id,'super_admin',true,'{"delete_snags":true}'::jsonb from auth.users;
      set test.uid='00000000-0000-0000-0000-000000000001';
      insert into projects values ('p','Original notes');
      insert into condition_surveys values ('s','{}');
      insert into survey_items values ('i'); insert into survey_photos values ('photo');
    `);
    await db.exec(readFileSync('supabase/migrations/20261010_owner_only_deletion.sql','utf8'));
    await db.exec(`set test.uid='00000000-0000-0000-0000-000000000002'`);
    expect((await db.query(`select fm_can('delete_snags') as allowed`)).rows[0].allowed).toBe(false);
    for (const table of ['projects','condition_surveys','survey_items','survey_photos'])
      await expect(db.exec(`delete from ${table}`)).rejects.toThrow('Only the owner');
    await expect(db.exec(`update projects set notes='{"_fmProjectTrash":1,"deletedAt":"today","notes":"Original notes"}'`)).rejects.toThrow('Only the owner');
    await expect(db.exec(`update condition_surveys set facility='{"qhse":{"deletedAt":"today"}}'`)).rejects.toThrow('Only the owner');
    await db.exec(`update projects set notes='Updated notes'; update condition_surveys set facility='{"address":"Updated location"}'`);
    await db.exec(`set test.uid='00000000-0000-0000-0000-000000000001'`);
    expect((await db.query(`select fm_can('delete_snags') as allowed`)).rows[0].allowed).toBe(true);
    await db.exec(`update projects set notes='{"_fmProjectTrash":1,"deletedAt":"today","notes":"Updated notes"}'; delete from survey_items where id='i'`);
    expect((await db.query('select count(*)::int as n from survey_items')).rows[0].n).toBe(0);
  } finally { await db.close(); }
}, 30000);
