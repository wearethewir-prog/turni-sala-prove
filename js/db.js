// ============================================================
//  db.js — client Supabase + accesso dati + autenticazione
// ============================================================
(function () {
  const cfg = window.APP_CONFIG;
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  const lower = (s) => (s || '').trim().toLowerCase();
  const pad2 = (n) => String(n).padStart(2, '0');
  const dstr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const redirectUrl = () => location.origin + location.pathname;

  window.DB = {
    sb, lower, dstr, redirectUrl,

    async getSession() { const { data } = await sb.auth.getSession(); return data.session; },
    onAuth(cb) { sb.auth.onAuthStateChange((_e, session) => cb(session)); },
    async signInGoogle() { return sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectUrl() } }); },
    async signInEmail(email) { return sb.auth.signInWithOtp({ email: lower(email), options: { emailRedirectTo: redirectUrl() } }); },
    async signOut() { return sb.auth.signOut(); },

    // riga utente se autorizzato, altrimenti null (RLS restituisce 0 righe se non abilitato)
    async myProfile(email) {
      const { data, error } = await sb.from('utenti_autorizzati').select('*').eq('email', lower(email)).maybeSingle();
      if (error) { console.warn('myProfile', error); return null; }
      return data;
    },

    async listUsers() {
      const { data, error } = await sb.from('utenti_autorizzati').select('*')
        .order('ruolo', { ascending: true }).order('nome', { ascending: true });
      if (error) throw error; return data || [];
    },
    async addUser(u) {
      const row = { email: lower(u.email), nome: u.nome || '', colore: u.colore, ruolo: u.ruolo || 'membro', attivo: true };
      const { error } = await sb.from('utenti_autorizzati').insert(row); if (error) throw error;
    },
    async updateUser(email, patch) {
      const { error } = await sb.from('utenti_autorizzati').update(patch).eq('email', lower(email)); if (error) throw error;
    },
    async deleteUser(email) {
      const { error } = await sb.from('utenti_autorizzati').delete().eq('email', lower(email)); if (error) throw error;
    },

    // tutte le disponibilità della settimana (lun -> dom)
    async weekAvailabilities(monday) {
      const sun = new Date(monday); sun.setDate(sun.getDate() + 6);
      const { data, error } = await sb.from('disponibilita').select('*')
        .gte('giorno', dstr(monday)).lte('giorno', dstr(sun));
      if (error) throw error; return data || [];
    },

    // salva la settimana dell'utente (cancella + reinserisce)
    async saveMyWeek(email, monday, rows) {
      const sun = new Date(monday); sun.setDate(sun.getDate() + 6);
      const e = lower(email);
      const del = await sb.from('disponibilita').delete().eq('user_email', e)
        .gte('giorno', dstr(monday)).lte('giorno', dstr(sun));
      if (del.error) throw del.error;
      if (rows.length) {
        const ins = await sb.from('disponibilita').insert(
          rows.map(r => ({ user_email: e, giorno: r.giorno, ora_inizio: r.ora_inizio, ora_fine: r.ora_fine }))
        );
        if (ins.error) throw ins.error;
      }
    },

    subscribeDisponibilita(cb) {
      return sb.channel('disp-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'disponibilita' }, cb)
        .subscribe();
    }
  };
})();
