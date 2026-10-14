# Project templates

Migration `20261014182427_project_template_snapshots.sql` adds module-specific field layouts to the existing template library and a project snapshot. Existing rows retain null snapshots and keep their current forms. No survey, snag, photo or access policy is modified.

The built-in Condition Survey and Meter Mapping standards remain available. Condition uses the published form configuration, including its existing custom fields; Meter preserves the source spreadsheet fields and calculation formulas. QHSE also has its standard layout.

Create reusable templates in Inspection Templates, choosing the work module and editing a copy of the standard. Saved Condition checklists from the existing checklist builder are also selectable. During Create Project, choose a template, edit the project copy, optionally save a new reusable copy, then create the project. Only accounts with the existing manage_templates permission can save reusable library templates; project creators can customize their own project snapshot. RLS remains the server boundary.

New records copy the project layout. Condition starting checklist items are added during Create Facility. Later library changes or archival never rewrite project snapshots or existing records. No report values, photos or signatures are copied from a template. Existing projects are not automatically assigned a template.

Custom fields are supported in all three modules and exports. The Condition report retains its standard built-in columns; project selection controls its form fields and custom report fields. Meter optional columns are hidden in Excel rather than removed, preserving formula references and recorded values. All formula inputs and required fields stay enabled in the new project template editor.

Rollback: deploy the previous app version. Leave the additive columns in place to retain saved project templates; no destructive rollback is necessary. Template archival is reversible.

Validation: authenticated owner template creation for all three modules tested in a rolled-back transaction; project/schema constraints verified; browser flows at 320/390/1440px; project snapshot isolation and custom Meter Excel fields/formulas tested alongside the full suite.
