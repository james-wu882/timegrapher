/* Timegrapher — account system (passwordless, magic-link only).
   Thin wrapper over Supabase Auth (GoTrue) via REST, so the static site needs
   no SDK bundle and stays inside the existing 'self' CSP (only connect-src adds
   the Supabase origin). The publishable key below is a *public* client key by
   design — it carries no privileges beyond what Row Level Security allows. */
'use strict';
(function (global) {
  const SUPABASE_URL = 'https://uftvlwzrbhumyibpljko.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_IME41IpH071u6TYKXqj29A_DXNOyfBt';
  const AUTH = SUPABASE_URL + '/auth/v1';
  const STORE = 'tg-auth-session';

  function load() { try { return JSON.parse(localStorage.getItem(STORE)); } catch (e) { return null; } }
  function save(s) { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) {} }
  function wipe() { try { localStorage.removeItem(STORE); } catch (e) {} }

  async function api(path, opts) {
    opts = opts || {};
    const headers = { apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json' };
    if (opts.token) headers.Authorization = 'Bearer ' + opts.token;
    const res = await fetch(AUTH + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      const msg = (data && (data.msg || data.error_description || data.error_message || data.error)) ||
                  ('Something went wrong (' + res.status + ').');
      const err = new Error(msg);
      err.status = res.status;
      err.code = data && data.code;
      throw err;
    }
    return data;
  }

  let markReady;
  const Auth = {
    URL: SUPABASE_URL,
    /* Resolves (with isAuthed boolean) once any magic-link callback in the URL
       has been consumed — pages should gate their signed-in UI on this. */
    ready: new Promise(function (r) { markReady = r; }),

    session: load,
    user: function () { const s = load(); return (s && s.user) || null; },
    isAuthed: function () { const s = load(); return !!(s && s.access_token); },

    /* Send a passwordless magic link. Creates the account if the email is new,
       so there is a single flow for sign-up and sign-in. The link returns the
       user to redirectTo (default: this origin's /account). */
    sendMagicLink: async function (email, redirectTo) {
      const rt = redirectTo || (location.origin + '/account');
      await api('/otp?redirect_to=' + encodeURIComponent(rt), {
        method: 'POST',
        body: { email: email, create_user: true }
      });
      return true;
    },

    refresh: async function () {
      const s = load();
      if (!s || !s.refresh_token) return null;
      try {
        const data = await api('/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh_token } });
        save(data);
        return data;
      } catch (e) { wipe(); return null; }
    },

    signOut: async function () {
      const s = load();
      try { if (s && s.access_token) await api('/logout', { method: 'POST', token: s.access_token, body: {} }); } catch (e) {}
      wipe();
    },

    /* Implicit-flow callback: when a magic link returns the user, the tokens
       arrive in the URL hash. Capture them, drop them from the address bar,
       and backfill the user record. Returns true if a session was established. */
    hydrateFromHash: async function () {
      const hash = location.hash || '';
      if (hash.indexOf('access_token=') === -1) return false;
      const p = new URLSearchParams(hash.replace(/^#/, ''));
      const access_token = p.get('access_token');
      const refresh_token = p.get('refresh_token');
      if (!access_token) return false;
      const expiresIn = Number(p.get('expires_in')) || 3600;
      save({
        access_token: access_token,
        refresh_token: refresh_token,
        token_type: p.get('token_type') || 'bearer',
        expires_in: expiresIn,
        expires_at: Math.floor(Date.now() / 1000) + expiresIn
      });
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
      try {
        const user = await api('/user', { token: access_token });
        save(Object.assign({}, load(), { user: user }));
      } catch (e) {}
      return true;
    },

    /* Reflect auth state into masthead links marked data-auth="signin". */
    paintNav: function () {
      const authed = this.isAuthed();
      const nodes = document.querySelectorAll('[data-auth="signin"]');
      for (let i = 0; i < nodes.length; i++) {
        nodes[i].textContent = authed ? 'Account' : 'Sign in';
        nodes[i].setAttribute('href', '/account');
      }
    }
  };

  async function init() {
    try { await Auth.hydrateFromHash(); } catch (e) {}
    Auth.paintNav();
    markReady(Auth.isAuthed());
  }

  global.TGAuth = Auth;
  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})(window);
