-- Additive: existing forms, report data, standard templates and access rules stay intact.
alter table public.inspection_templates
  add column if not exists work_module text not null default 'condition'
    check (work_module in ('condition', 'qhse', 'meter')),
  add column if not exists field_layout jsonb
    check (field_layout is null or jsonb_typeof(field_layout) = 'object');
alter table public.projects
  add column if not exists report_template jsonb
    check (report_template is null or (jsonb_typeof(report_template) = 'object'
      and report_template->>'module' is not null
      and report_template->>'module' = work_module));
comment on column public.projects.report_template is
  'Project-specific snapshot of selected template. Later library edits do not alter this copy.';
notify pgrst, 'reload schema';
