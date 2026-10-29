# Security controls and verification

Updated 2026-10-22. Production: fm-condition-survey-data-source.vercel.app.

## Applied controls

- Supabase login/sign-up: 30 requests per five minutes per IP; token verification: 30 per five minutes; refresh: 150 per five minutes. These are existing settings verified in the dashboard.
- Supabase minimum password length: the app enforces 6 (lowered from 12 on 2026-10-29). The dashboard setting (Authentication → Providers → Email → Minimum password length) must be 6 or lower to match. Existing passwords are not reset. Public sign-up and anonymous sign-in remain disabled; email confirmation and secure email changes are enabled.
- Vercel firewall rule **Protect AI API**: Request Path equals `/api/describe`, fixed window of 60 seconds, 100 requests per IP, respond HTTP 429. Published separately in Vercel, not managed by vercel.json. Do not enable browser challenges globally without testing Capacitor clients.
- AI calls require a verified login, active app account, report permission, enrolled MFA assurance and a nonexpired, nonrevoked auth session. The reservation RPC uses the caller JWT, never a supplied account ID or a service key.
- Database counters enforce 20 AI calls/minute and 500/day per account, 2,000/day globally. Day boundaries are UTC. Reservations count even when the provider fails. Cached descriptions do not spend quota. Each call carries at most six snags. Direct RPC calls consume the caller's allowance but cannot bypass a limit or invoke the provider.
- Counters are private, protected by RLS and revoked direct grants. One transaction lock prevents concurrent overbooking; stale minute counters and counters older than 30 days are pruned during reservations.
- API returns Retry-After for quota refusals, does not cache responses, fails closed when the quota service fails, and bounds upstream requests with timeouts.
- Account security shows administrators the MFA enrollment count and today's AI allowed/blocked counts. Nonadministrators cannot fetch this summary. It refreshes on open or manually; it is not a push alert.
- Vercel logs include `ai_rate_limited` and `quota_check_failed` events without tokens or survey contents. Inspect these in project function logs.
- **Production security checks** runs every six hours in GitHub Actions, checking availability, security headers, private paths, anonymous AI denial and OTA bundle integrity. **Security and quality** retains daily dependency audit, tests and build. GitHub notification preferences determine email delivery; no external alert integration was provisioned.

## Verification

- Release checks: 347 tests across 52 files; npm audit reported zero known vulnerabilities; production build passed.
- Real PostgreSQL-compatible tests cover private counters, anonymous denial, permission denial, invalid session, minute/day/global ceilings, and admin summary authorization. Endpoint tests prove no provider call on refusal or quota errors.
- Live quota RPC tested with an existing surveyor's database authorization context and live session inside a rolled-back transaction. This is not a fresh browser login as that surveyor.
- Live firewall test: 105 anonymous POSTs, five workers; 100 returned 401 and five returned 429. No model requests or record writes.

## Remaining work and limits

- Owner deferred app and Vercel authenticator enrollment. MFA is supported and enforced for enrolled accounts, but accounts without enrolled factors still permit password sign-in. Do not impose mandatory MFA until owners enroll and recovery access is confirmed.
- Two separate real account login tests (administrator and ordinary user) remain pending user sign-in. Existing RLS identity tests do not prove the password/MFA login journey.
- Supabase built-in leaked-password protection requires Pro and is disabled on the current Free plan. App-managed new/change passwords check the breached-password service, but that does not replace an Auth server policy against direct API calls. See https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.
- Security advisors still flag callable definer functions, including other CAFM functions in this shared database. FM authorization helpers and the two quota/summary RPCs intentionally require definer access and validate the caller. Private counter table intentionally has no client policy. Do not blindly revoke shared CAFM functions; review their application separately. See https://supabase.com/docs/guides/database/database-linter.
- The Vercel rule protects only the AI route. Supabase data requests go directly to its API and are governed by JWT/RLS, storage policies and platform controls, not Vercel's firewall. No throughput or maximum-concurrent-user capacity claim follows from these checks; run a measured load test in staging for that.

## Rollback

Before reverting the API, assess restoring the old unmetered AI route; disabling AI configuration is safer during an incident. The new table and RPCs are additive and can remain while reverting UI. To change the edge limit, edit **Protect AI API** and publish in Vercel. To adjust database quotas, change both reservation thresholds and summary values in a new migration and repeat the quota tests. Do not remove existing app RLS or MFA policies.
