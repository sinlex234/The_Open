// In-browser stand-in for supabase-js backed by localStorage (__mockdb = server, __mocksess = session)
(function () {
  const load = () => JSON.parse(localStorage.getItem('__mockdb') || '{"users":[],"profiles":[],"open":[]}');
  const save = db => localStorage.setItem('__mockdb', JSON.stringify(db));
  const sess = () => JSON.parse(localStorage.getItem('__mocksess') || 'null');
  let listeners = [];
  const emit = (ev, s) => listeners.forEach(f => f(ev, s));
  window.supabase = { createClient() {
    const auth = {
      async getSession() { const x = sess(); return { data: { session: x ? { ...x, access_token: 'mock-token' } : null } }; },
      onAuthStateChange(f) { listeners.push(f); setTimeout(() => f('INITIAL_SESSION', sess()), 0); return { data: { subscription: { unsubscribe() {} } } }; },
      async signUp({ email, password, options }) {
        const db = load(); if (db.users.find(u => u.email === email)) return { data: { user: { identities: [] }, session: null }, error: null };
        const u = { id: 'u' + Math.random().toString(36).slice(2, 8), email, password }; db.users.push(u);
        db.profiles.push({ id: u.id, username: options && options.data && options.data.username || null }); save(db);
        const s = { user: { id: u.id, email, user_metadata: {} } }; localStorage.setItem('__mocksess', JSON.stringify(s)); setTimeout(() => emit('SIGNED_IN', s), 0);
        return { data: { user: { ...s.user, identities: [{}] }, session: s }, error: null };
      },
      async signInWithIdToken({ provider, token, nonce }) {
        window.__idtok = { provider, token, nonce };
        const s = { user: { id: 'g-user-1', email: 'g@test.com', user_metadata: { full_name: 'G Test' } } }; localStorage.setItem('__mocksess', JSON.stringify(s)); setTimeout(() => emit('SIGNED_IN', s), 0);
        return { data: { session: s, user: s.user }, error: null };
      },
      async signInWithPassword({ email, password }) {
        const u = load().users.find(x => x.email === email && x.password === password);
        if (!u) return { data: {}, error: { message: 'Invalid login credentials' } };
        const s = { user: { id: u.id, email, user_metadata: {} } }; localStorage.setItem('__mocksess', JSON.stringify(s)); setTimeout(() => emit('SIGNED_IN', s), 0);
        return { data: { session: s }, error: null };
      },
      async signInWithOAuth() { return { error: null }; },
      async signOut() { localStorage.removeItem('__mocksess'); setTimeout(() => emit('SIGNED_OUT', null), 0); return { error: null }; },
      async resetPasswordForEmail() { return { error: null }; }, async updateUser() { return { error: null }; },
    };
    function from(table) {
      const st = { filters: [], op: 'select' };
      const api = { select() { return api; }, eq(c, v) { st.filters.push([c, v]); return api; }, maybeSingle() { return api; }, gte() { return api; }, insert(rows) { st.op = 'insert'; st.rows = Array.isArray(rows) ? rows : [rows]; return api; },
        upsert(rows) { st.op = 'upsert'; st.rows = Array.isArray(rows) ? rows : [rows]; return api; }, update(v) { st.op = 'update'; st.val = v; return api; },
        then(res) { res(run()); } };
      function run() {
        const db = load();
        if (table === 'open_profiles') {
          if (st.op === 'upsert') { st.rows.forEach(r => { db.open = db.open.filter(x => x.user_id !== r.user_id); db.open.push(r); }); save(db); return { error: null }; }
          const row = db.open.find(x => x.user_id === st.filters[0][1]); return { data: row ? { answers: row.answers } : null, error: null };
        }
        if (table === 'open_crowd') {
          db.crowd = db.crowd || [];
          if (st.op === 'insert') { st.rows.forEach(r => db.crowd.push({ ...r })); save(db); return { error: null }; }
          if (st.op === 'update') { const f = Object.fromEntries(st.filters); db.crowd.forEach(r => { if (r.event_key === f.event_key && r.market === f.market) Object.assign(r, st.val); }); save(db); return { error: null }; }
          return { data: db.crowd, error: null };
        }
        if (table === 'profiles') return { data: db.profiles.find(p => p.id === st.filters[0][1]) || null, error: null };
        return { data: null, error: null };
      }
      return api;
    }
    return { auth, from, async rpc(fn, { uname }) { const db = load(); if (fn === 'username_available') return { data: !db.profiles.find(p => p.username === uname), error: null }; const p = db.profiles.find(p => p.username === uname); return { data: p ? db.users.find(u => u.id === p.id).email : null, error: null }; } };
  } };
})();
