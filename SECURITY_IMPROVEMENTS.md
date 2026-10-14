# Security and reliability release — 15 October 2026

## Verified changes

- Removed unused vulnerable SheetJS. Updated and pinned PDF, test/build and CSS dependencies; audited runtime and development dependencies. npm audit reports zero known vulnerabilities at verification time. Tests use explicitly blank cloud configuration, so deployment credentials cannot reach live data from tests.
- Closed a legacy anonymous read policy on deleted_rows_archive and revoked anonymous privileges on the eight FM application tables. All 215 archive rows and the 103 reports / 810 findings / 1780 photo rows were retained. Only the nominated active owner can read recovery archives; verified MFA is required once enrolled. Restore RPC remains unavailable to app accounts.
- Covered Meter Mapping soft-delete/restore markers in the owner deletion guard. Restricted photo insert/update paths to visible projects/surveys; denied storage-file deletion. Old survey-prefixed paths remain readable; new project-prefixed uploads work before the first report row is committed.
- MFA enrollment and sign-in challenge in Account security & backup. Database permissions, admin checks and project visibility enforce MFA after verified enrollment. No existing account is forcibly enrolled. Online profile checks fail closed on authoritative access denial, retain drafts and refresh periodically/on return.
- Administrator function v4 closes anonymous bootstrap permanently. Service-role profile lookup is followed by a permission RPC using the caller's own JWT, so deactivation/MFA cannot be bypassed. Password creation/reset and in-app password changes enforce 12 characters and a padded hash-prefix breach lookup; passwords and full hashes are never sent to the lookup service or diagnostics. Supabase's global Auth password policy remains a separate dashboard setting.
- CSP on Vercel and packaged HTML, framing denial, MIME sniffing protection, referrer/permission policies. Removed redundant Google font requests; Inter remains bundled. Production builds refuse absent cloud settings and secret/service-role client keys.
- OTA requires the canonical HTTPS bundle URL plus SHA-256 checksum; installed OTA versions cannot be downgraded. Fresh native shells correctly enter the independent OTA version family. Reload guards include account setup/backup dialogs.
- Lists render 24 records initially and preserve selection across load-more; mobile tests exercise 1,500 records per module. Photo previews resize display copies only, retaining originals in exports. Module exports provide per-photo progress, cooperative cancellation and accurate download/share status.
- Device backup and non-overwriting restoration preserve pending photos, revisions and newer local records. These backups cover device records, not a complete hosted database or all cloud photo files. Diagnostic files contain categories/times only; repeated sync failures prompt a backup. Daily GitHub workflow checks audit/tests/build and public live headers/bundle integrity; notifications follow the repository's Actions settings.
- Android 1.6 / version code 8 disables automatic cloud/device-transfer backup, cleartext networking and release debugging. Background activity is protected against recents snapshots; foreground screenshots remain available. The existing local certificate is retained for upgrade compatibility; its private keystore is outside Git. These native changes require installing the updated APK. No data-clear/uninstall step is part of this release.

## Remaining owner actions and limits

1. Enable Supabase Auth leaked-password protection where supported, set the global password policy, and disable public signup for administrator-issued accounts. Public signup was confirmed enabled and leaked-password protection disabled. The current connector cannot modify Auth configuration. UI/server-admin breach checks do not replace global Auth enforcement against direct API requests.
2. Enroll MFA by scanning and confirming the authenticator code. Protect the GitHub/Supabase administrator accounts with their own MFA as well.
3. Install the updated APK for native backup/debug/recents protections. Web changes ship through OTA. Native protections were compiled and package-checked; physical-device behavior still needs a phone check.
4. Verify hosted database/off-site backup coverage in Supabase and keep private backup copies. Provider backup availability/retention depends on the plan; storage file bytes require separate backup. No paid plan or new external monitoring account has been purchased/configured.

The same Supabase project also hosts separate CAFM functionality. Its employee-email lookup remains publicly callable by design and needs a separate review of that application's login flow; this release does not disable an unrelated login system. Other signed-in SECURITY DEFINER warnings include intentional permission helpers and are not blanket evidence of vulnerabilities.

No app can be guaranteed unhackable. This release closes verified gaps and adds regression checks; it is not a formal penetration-test certification. Device backup exports are sensitive unencrypted files and should be stored privately. Offline data continues to rely on the OS/app sandbox; this release does not claim custom at-rest encryption or immediate offline remote revocation.

## Rollback

App code can be reverted to the previous deployment while retaining security migrations. Never restore anonymous archive access. Existing clients retain report/photo data; older clients' first photo uploads may defer until their report row exists, then retry. Library/record snapshots are preserved. The administrator function remains authenticated-only. No tables, evidence files or archive rows were dropped.
