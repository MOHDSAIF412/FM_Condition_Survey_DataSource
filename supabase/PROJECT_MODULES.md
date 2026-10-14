# Module project separation

Projects now have one `work_module`: condition, qhse, or meter. Creation stores
that module; project pickers, deleted-project lists, and report selectors filter
by it. Legacy mixed projects were split into independent project records only
for modules with existing reports. Team memberships were copied and report
parent IDs reassigned. No reports, findings, photos or storage files were deleted.

The live verification retained 107 reports, 820 findings and 1,783 photo rows,
with zero module/parent mismatches and zero missing inherited memberships.
The entire photo-row digest was unchanged.

`legacy_parent_id` and the private `fm_module_project_moves` ledger provide a
reversible record of the separation. Device copies with pending edits remap
only their project ID. A trigger routes older clients using legacy parent IDs
to the matching module copy and rejects unrelated cross-module links.

Deleting a QHSE or Meter project archives that module-specific project. Reports
are retained and return when the owner restores it. Condition Survey keeps its
existing rule requiring facilities to be moved or removed first. The server
checks the actual project module; client metadata cannot bypass that rule.
Owner-only deletion guards remain active.

## Rollback (administrative maintenance only; not executed)

Deploy the previous app before reverting to the shared-parent workflow.
In one administrative transaction, drop `aaa_route_module_project`, set the
transaction-local `fm.workflow` setting to `on`, move records whose project has
`legacy_parent_id` back to that parent, and restore the setting. Keep the
separated project rows, move ledger, and additive columns so no subsequent
reports or membership changes are discarded. Review memberships before any
merge, because the separated projects may acquire different teams after rollout.
No project or report deletion is needed to restore the prior parent structure.
