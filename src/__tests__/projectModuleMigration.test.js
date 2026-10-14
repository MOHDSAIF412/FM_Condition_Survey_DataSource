import { beforeAll, afterAll, expect, test } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
let db,sql;
beforeAll(async()=>{
 db=new PGlite();sql=readFileSync('supabase/migrations/20261014174356_separate_module_projects.sql','utf8');
 await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
 create sequence project_number_seq;
 create table projects(id uuid primary key default gen_random_uuid(),project_number text default nextval('project_number_seq')::text,name text,client text,location text,notes text,status text,created_by uuid,due_date date);
 create table fm_project_members(project_id uuid,user_id uuid,added_by uuid,added_at timestamptz,primary key(project_id,user_id));
 create table condition_surveys(id text primary key,project_id uuid,facility jsonb,revision integer,status text);
 insert into projects(id,name) values ('00000000-0000-0000-0000-000000000001','Shared Abu Dhabi');
 insert into fm_project_members values ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',null,now());
 insert into condition_surveys values ('fm','00000000-0000-0000-0000-000000000001','{}',7,'submitted'),('qhse','00000000-0000-0000-0000-000000000001','{"module":"qhse","remarks":"keep me"}',8,'submitted'),('meter','00000000-0000-0000-0000-000000000001','{"module":"meter","remarks":"keep meters"}',9,'draft');`);
 await db.exec('begin;'+sql+'commit;');
},30000);
afterAll(async()=>db?.close());
test('separates parents while preserving records, revisions, submission status and memberships',async()=>{
 const records=(await db.query('select s.id,s.revision,s.status,s.facility,p.work_module from condition_surveys s join projects p on p.id=s.project_id order by s.id')).rows;
 expect(records.map(r=>[r.id,r.work_module,r.revision,r.status])).toEqual([['fm','condition',7,'submitted'],['meter','meter',9,'draft'],['qhse','qhse',8,'submitted']]);
 expect(records[1].facility.remarks).toBe('keep meters');
 expect((await db.query('select * from fm_project_members')).rows).toHaveLength(3);
 await db.exec('begin;'+sql+'commit;');
 expect((await db.query('select * from projects')).rows).toHaveLength(3);
});
test('routes older clients to the same module copy and rejects unrelated cross-module linking',async()=>{
 await db.exec(`insert into condition_surveys values ('old-client','00000000-0000-0000-0000-000000000001','{"module":"meter"}',1,'draft')`);
 expect((await db.query(`select p.work_module from condition_surveys s join projects p on p.id=s.project_id where s.id='old-client'`)).rows[0].work_module).toBe('meter');
 await db.exec(`insert into projects(id,name,work_module) values ('00000000-0000-0000-0000-000000000003','New independent project','qhse')`);
 await expect(db.exec(`insert into condition_surveys values ('bad','00000000-0000-0000-0000-000000000003','{"module":"meter"}',1,'draft')`)).rejects.toThrow('Choose a project from this module');
 await expect(db.exec(`update projects set work_module='meter' where id='00000000-0000-0000-0000-000000000003'`)).rejects.toThrow('belongs to one module');
});
