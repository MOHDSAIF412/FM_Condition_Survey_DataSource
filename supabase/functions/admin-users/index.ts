// Only place in the whole system that can create, delete, or reset a login.
//
// verify_jwt is OFF deliberately, with authentication done by hand below, for
// one reason: this function also has to handle the very first admin account,
// when there is no admin (and no session) yet to present a JWT at all. The
// gateway's automatic JWT check has no concept of "unless the table is
// empty", so it has to be handled in code instead.
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically by
// the Edge Functions runtime -- the service role key is never sent to, or
// held by, the browser.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, content-type',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS'
    }
  });
}

/** The caller's own row in fm_survey_users, found via their bearer token. */
async function callerProfile(req: Request) {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return null;

  const { data: userData, error } = await admin.auth.getUser(token);
  if (error || !userData?.user) return null;

  const { data: profile } = await admin
    .from('fm_survey_users')
    .select('id, email, role, is_active')
    .eq('id', userData.user.id)
    .maybeSingle();

  return profile || null;
}

function randomPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '').slice(0, 20) + 'Aa1!';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({});

  try {
    const { count } = await admin
      .from('fm_survey_users')
      .select('id', { count: 'exact', head: true });
    const bootstrapMode = (count || 0) === 0;

    const caller = bootstrapMode ? null : await callerProfile(req);
    const isAdmin = bootstrapMode || (caller && caller.role === 'admin' && caller.is_active);

    if (req.method === 'GET') {
      if (!isAdmin) return json({ error: 'Admin access required.' }, 403);
      const { data, error } = await admin
        .from('fm_survey_users')
        .select('id, email, full_name, role, is_active, created_at')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return json({ users: data });
    }

    if (req.method === 'POST') {
      if (!isAdmin) return json({ error: 'Admin access required.' }, 403);

      const body = await req.json().catch(() => ({}));
      const email = String(body.email || '').trim().toLowerCase();
      const fullName = String(body.fullName || '').trim();
      // A non-admin creator can never grant themselves admin by passing a role
      // in the request; only bootstrap (the very first account) is admin by
      // default otherwise every new account is 'user' unless the caller who
      // IS already an admin explicitly asks for 'admin'.
      const requestedRole = body.role === 'admin' ? 'admin' : 'user';
      const role = bootstrapMode ? 'admin' : requestedRole;
      const password = String(body.password || '').trim() || randomPassword();

      if (!email || !email.includes('@')) return json({ error: 'A valid email is required.' }, 400);
      if (password.length < 8) return json({ error: 'Password must be at least 8 characters.' }, 400);

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });
      if (createErr) return json({ error: createErr.message }, 400);

      const { error: profileErr } = await admin.from('fm_survey_users').insert({
        id: created.user.id,
        email,
        full_name: fullName || null,
        role,
        created_by: caller?.id || null
      });
      if (profileErr) {
        // Do not leave an auth user with no matching profile row.
        await admin.auth.admin.deleteUser(created.user.id);
        throw profileErr;
      }

      return json({ user: { id: created.user.id, email, fullName, role }, password, bootstrap: bootstrapMode });
    }

    if (req.method === 'DELETE') {
      if (!isAdmin) return json({ error: 'Admin access required.' }, 403);

      const { userId } = await req.json().catch(() => ({}));
      if (!userId) return json({ error: 'userId is required.' }, 400);
      if (caller && userId === caller.id) {
        return json({ error: 'You cannot delete your own account.' }, 400);
      }

      const { error: delErr } = await admin.auth.admin.deleteUser(userId);
      if (delErr) return json({ error: delErr.message }, 400);
      await admin.from('fm_survey_users').delete().eq('id', userId);

      return json({ deleted: true });
    }

    if (req.method === 'PATCH') {
      // An administrator resets someone's password, and the new one is shown
      // once, exactly like creating an account. This is the recovery route for
      // a surveyor locked out on site: it does not depend on email delivery.
      // Never available in bootstrap mode -- there is nobody to reset.
      if (bootstrapMode || !isAdmin) return json({ error: 'Admin access required.' }, 403);

      const body = await req.json().catch(() => ({}));
      const userId = String(body.userId || '');
      if (!userId) return json({ error: 'userId is required.' }, 400);

      const password = String(body.password || '').trim() || randomPassword();
      if (password.length < 8) return json({ error: 'Password must be at least 8 characters.' }, 400);

      const { data: target } = await admin
        .from('fm_survey_users')
        .select('id, email')
        .eq('id', userId)
        .maybeSingle();
      if (!target) return json({ error: 'That user was not found.' }, 404);

      const { error: updErr } = await admin.auth.admin.updateUserById(userId, { password });
      if (updErr) return json({ error: updErr.message }, 400);

      return json({ user: { id: target.id, email: target.email }, password });
    }

    return json({ error: 'Method not allowed.' }, 405);
  } catch (err) {
    console.error('[admin-users] error:', err);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
});
