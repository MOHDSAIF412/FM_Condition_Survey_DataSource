import { beforeAll, afterAll, test, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

let db;
const project = '00000000-0000-0000-0000-000000000001';
const survey = (id) => ({ id, project_id: project, title: id, facility: {}, signatures: {}, status: 'draft' });
const snag = (surveyId, id, description = 'Initial') => ({ id, survey_id: surveyId, position: 0, defect_description: description, quantity: 1 });
async function commit(s, revision = null, items = [], photos = [], deleted = []) {
  const result = await db.query('select fm_commit_survey($1::jsonb,$2::integer,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb) as result',
    [JSON.stringify(s), revision, JSON.stringify(items), JSON.stringify(photos), JSON.stringify(deleted), '[]']);
  return result.rows[0].result;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select '${project}'::uuid $$;
    create function fm_can(text) returns boolean language sql as $$ select coalesce(current_setting('test.can_edit',true),'yes') <> 'no' $$;
    create table condition_surveys (
      id text primary key, title text, facility jsonb, signatures jsonb, general_notes text,
      status text, submitted_at timestamptz, facility_name text, revision integer not null default 1,
      project_id uuid, facility_number serial, updated_at timestamptz default now(), due_date date,
      review_status text, review_note text, reviewed_by uuid, reviewed_at timestamptz,
      approved_by uuid, approved_at timestamptz
    );
    create table survey_items (
      id text primary key, survey_id text references condition_surveys(id) on delete cascade,
      position integer, asset_name text, department text, location text, priority integer,
      defect_description text, estimated_cost numeric, quantity numeric, unit text,
      custom_values jsonb default '{}', updated_at timestamptz
    );
    create table survey_photos (
      id text primary key, survey_id text references condition_surveys(id) on delete cascade,
      item_id text references survey_items(id) on delete cascade,
      caption text, name text, storage_path text, taken_at timestamptz
    );
    alter table condition_surveys enable row level security;
    create policy project_access on condition_surveys to authenticated
      using (project_id = '${project}') with check (project_id = '${project}');
    grant usage on schema public,auth to authenticated;
    grant all on all tables in schema public to authenticated;
    grant usage on all sequences in schema public to authenticated;
  `);
  const workflow = readFileSync('supabase/migrations/20260919_stage6_workflows.sql','utf8');
  for (const name of ['fm_workflow_guard','fm_locked_facility_guard']) {
    const definition = workflow.match(new RegExp(`create or replace function public\\.${name}\\(\\)[\\s\\S]*?\\$\\$;`));
    if (!definition) throw new Error(`Missing existing guard ${name}`);
    await db.exec(definition[0]);
  }
  await db.exec(`
    create trigger condition_surveys_workflow_guard before insert or update or delete on condition_surveys
    for each row execute function fm_workflow_guard();
    create trigger survey_items_locked_guard before insert or update or delete on survey_items
    for each row execute function fm_locked_facility_guard();
    create trigger survey_photos_locked_guard before insert or update or delete on survey_photos
    for each row execute function fm_locked_facility_guard();
  `);
  await db.exec(readFileSync('supabase/migrations/20261002_atomic_survey_sync.sql', 'utf8'));
  await db.exec('set role authenticated');
}, 30000);
afterAll(async () => { await db?.close(); });

test('two devices with the same base revision cannot overwrite each other', async () => {
  const s = survey('concurrent');
  await commit(s, null, [snag(s.id,'c1')]);
  const results = await Promise.all([
    commit(s, 1, [snag(s.id,'c1','Device A')]),
    commit(s, 1, [snag(s.id,'c1','Device B')])
  ]);
  expect(results.filter((r) => r.pushed)).toHaveLength(1);
  expect(results.filter((r) => r.conflict)).toHaveLength(1);
  const rows = await db.query("select defect_description from survey_items where id='c1'");
  expect(rows.rows[0].defect_description).toBe('Device A');
});
test('a child failure rolls back parent revision and every preceding row', async () => {
  const s = survey('rollback');
  await commit(s, null, [snag(s.id,'r1')]);
  await expect(commit({ ...s, title: 'Changed' }, 1, [snag(s.id,'r1','Changed')],
    [{ id:'broken', survey_id:s.id, item_id:'missing' }])).rejects.toThrow('Photo has no snag');
  const { rows } = await db.query("select title,revision from condition_surveys where id='rollback'");
  expect(rows[0]).toEqual({ title:'rollback', revision:1 });
  expect((await db.query("select defect_description from survey_items where id='r1'")).rows[0].defect_description).toBe('Initial');
});
test('preserves omitted custom fields and deletes only explicit tombstones', async () => {
  const s = survey('preserve');
  await commit(s, null, [{ ...snag(s.id,'p1'), custom_values:{condition:'poor'} }, snag(s.id,'p2')]);
  await commit(s, 1, [snag(s.id,'p1')]);
  expect((await db.query("select count(*)::int as n from survey_items where survey_id='preserve'")).rows[0].n).toBe(2);
  expect((await db.query("select custom_values from survey_items where id='p1'")).rows[0].custom_values).toEqual({condition:'poor'});
  await commit(s, 2, [snag(s.id,'p1')], [], ['p2']);
  expect((await db.query("select count(*)::int as n from survey_items where survey_id='preserve'")).rows[0].n).toBe(1);
});
test('cannot move a snag ID between surveys, even with access to both', async () => {
  const a=survey('owner-a'), b=survey('owner-b');
  await commit(a,null,[snag(a.id,'owned')]);
  await expect(commit(b,null,[snag(b.id,'owned')])).rejects.toThrow('Snag ID belongs');
  expect((await db.query("select id from condition_surveys where id='owner-b'")).rows).toHaveLength(0);
});
test('RLS and role checks remain in force for the RPC', async () => {
  await expect(commit({ ...survey('forbidden'), project_id:'00000000-0000-0000-0000-000000000099' })).rejects.toThrow(/row-level security/);
  await db.exec("set test.can_edit='no'");
  await expect(commit(survey('no-edit'))).rejects.toThrow('your role cannot upload');
  await db.exec("set test.can_edit='yes'");
});
test('legacy direct uploads are blocked while project/due-date operations still work', async () => {
  await expect(db.exec("update survey_items set defect_description='Legacy overwrite' where id='c1'"))
    .rejects.toThrow('requires the updated app');
  await expect(db.exec("update condition_surveys set revision=revision+1 where id='concurrent'"))
    .rejects.toThrow('requires the updated app');
  await db.exec("update condition_surveys set due_date='2026-12-01' where id='concurrent'");
});
test('a deleted server survey is not silently resurrected by an old device', async () => {
  expect(await commit(survey('deleted'), 8)).toMatchObject({conflict:true});
});
test('existing approval locks and workflow changes remain effective', async () => {
  const s = survey('approved');
  await commit(s,null,[snag(s.id,'approved-item')]);
  await db.exec("begin; set local fm.workflow='on'; update condition_surveys set review_status='approved',revision=2 where id='approved'; commit;");
  await expect(commit(s,2,[snag(s.id,'approved-item','Changed')])).rejects.toThrow('approved and locked');
  expect((await db.query("select revision from condition_surveys where id='approved'")).rows[0].revision).toBe(2);
});
test('rollback restores legacy writers without removing survey data', async () => {
  await db.exec('reset role');
  await db.exec(readFileSync('supabase/migrations/20261002_atomic_survey_sync.rollback.sql','utf8'));
  await db.exec("update survey_items set defect_description='Legacy restored' where id='c1'");
  expect((await db.query("select count(*)::int as n from condition_surveys")).rows[0].n).toBeGreaterThan(0);
});
