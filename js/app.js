// ============================================================
//  app.js — logica UI: auth, griglia, disegno, vista d'insieme, admin
// ============================================================
(function () {
  const CONFIG = window.APP_CONFIG;
  const SLOT_MIN = CONFIG.SLOT_MINUTI;            // 30
  const SLOTS = (24 * 60) / SLOT_MIN;             // 48
  const DAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
  const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  const PASTELS = ['#FF8A8A', '#FFB36B', '#FFD96B', '#A6E3A1', '#6FD6C7', '#FF9FC4',
                   '#E0A96D', '#CFCFCF', '#9BE38B', '#FFC1A1', '#7FD1C1', '#D4A373'];

  const $ = (id) => document.getElementById(id);
  const pad2 = (n) => String(n).padStart(2, '0');
  const slotHM = (s) => `${pad2(Math.floor(s * SLOT_MIN / 60))}:${pad2((s * SLOT_MIN) % 60)}`;
  const slotTime = (s) => slotHM(s) + ':00';
  const hmToSlot = (t) => { const [h, m] = t.split(':'); return (parseInt(h) * 60 + parseInt(m)) / SLOT_MIN; };

  function startOfWeek(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); return x; }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function dayIndexOf(giorno) { return Math.round((parseDate(giorno) - state.curMonday) / 86400000); }
  function hexToRgba(hex, a) { const n = hex.replace('#', ''); const r = parseInt(n.substr(0, 2), 16), g = parseInt(n.substr(2, 2), 16), b = parseInt(n.substr(4, 2), 16); return `rgba(${r},${g},${b},${a})`; }

  const state = {
    session: null, me: null, isAdmin: false,
    usersByEmail: {}, curMonday: startOfWeek(new Date()),
    view: 'mine', mineStrips: [], mineKey: null, dirty: false,
    channel: null, _initedFor: null, _allTimer: null,
    _localSha: null, _updateAvail: false, _toastDismissed: false, _verChannel: null, _verPollId: null,
    editMode: false, paintingActive: false
  };

  // ---------- toast ----------
  let toastTimer;
  function toast(msg, isErr) {
    const t = $('toast'); t.textContent = msg; t.classList.toggle('err', !!isErr); t.classList.remove('hidden');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 2400);
  }

  // ---------- schermate ----------
  function showScreen(name) {
    $('login-screen').classList.toggle('hidden', name !== 'login');
    $('blocked-screen').classList.toggle('hidden', name !== 'blocked');
    $('app').classList.toggle('hidden', name !== 'app');
  }

  // ============================================================
  //  AUTENTICAZIONE
  // ============================================================
  async function handleSession(session) {
    state.session = session;
    if (!session) { state._initedFor = null; showScreen('login'); return; }
    const email = DB.lower(session.user.email);
    if (state._initedFor === email) return;
    const profile = await DB.myProfile(email);
    if (!profile || !profile.attivo) {
      state._initedFor = null;
      $('blocked-email').textContent = session.user.email;
      showScreen('blocked');
      return;
    }
    state.me = profile; state.isAdmin = profile.ruolo === 'admin';
    state._initedFor = email;
    initApp();
  }

  function initApp() {
    showScreen('app');
    $('tab-admin').classList.toggle('hidden', !state.isAdmin);
    updateWeekLabel();
    if (!state.channel) {
      state.channel = DB.subscribeDisponibilita(() => {
        if (state.view === 'all') { clearTimeout(state._allTimer); state._allTimer = setTimeout(loadAll, 350); }
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && state.view === 'all') loadAll();
      });
    }
    startVersionCheck();
    showView('mine');
  }

  async function doGoogle(force) {
    $('login-msg').textContent = force ? 'Scegli l\'account…' : 'Apertura Google…';
    $('login-msg').classList.remove('err');
    const { error } = await DB.signInGoogle(force);
    if (error) { $('login-msg').textContent = 'Errore login Google: ' + error.message; $('login-msg').classList.add('err'); }
  }

  // ---------- rilevamento aggiornamenti (badge + toast) ----------
  async function startVersionCheck() {
    if (state._verChannel) return;
    try { state._localSha = await DB.getAppSha(); } catch (_) {}
    state._verChannel = DB.subscribeAppVersion(onVerChange);
    state._verPollId = setInterval(async () => {
      try { const s = await DB.getAppSha(); if (s && state._localSha && s !== state._localSha) showUpdate(); } catch (_) {}
    }, 5 * 60 * 1000);
  }
  function onVerChange(sha) { if (sha && state._localSha && sha !== state._localSha) showUpdate(); }
  function showUpdate() {
    if (state._updateAvail) return;
    state._updateAvail = true;
    $('btn-update').classList.remove('hidden');
    refreshUpdateToast();
  }
  // il toast compare solo nella pagina principale ("Le mie") e finché non lo chiudi
  function refreshUpdateToast() {
    const show = state._updateAvail && !state._toastDismissed && state.view === 'mine';
    $('update-toast').classList.toggle('hidden', !show);
  }
  function applyUpdate() {
    $('btn-update').disabled = true;
    $('update-overlay').classList.remove('hidden');
    const bust = Date.now();
    const assets = ['index.html', 'js/app.js', 'js/db.js', 'js/config.js', 'css/style.css'];
    const jobs = [];
    if ('serviceWorker' in navigator) jobs.push(navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister()))).catch(() => {}));
    if (window.caches) jobs.push(caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))).catch(() => {}));
    Promise.all(jobs)
      .then(() => Promise.all(assets.map(u => fetch(u, { cache: 'reload' }).catch(() => {}))))
      .then(() => location.replace(location.pathname + '?_r=' + bust))
      .catch(() => location.reload());
  }

  // ============================================================
  //  NAVIGAZIONE SETTIMANA
  // ============================================================
  function updateWeekLabel() {
    const a = state.curMonday, b = addDays(a, 6);
    const label = a.getMonth() === b.getMonth()
      ? `${a.getDate()} – ${b.getDate()} ${MESI[b.getMonth()]}`
      : `${a.getDate()} ${MESI[a.getMonth()]} – ${b.getDate()} ${MESI[b.getMonth()]}`;
    $('week-label').textContent = label;
  }
  function setWeek(monday) {
    if (state.view === 'mine' && state.dirty && !confirm('Hai modifiche non salvate in questa settimana. Cambiare comunque?')) return;
    state.curMonday = monday; state.mineKey = null; state.editMode = false;
    updateWeekLabel(); reloadCurrentView();
  }
  function reloadCurrentView() {
    if (state.view === 'mine') loadMine();
    else if (state.view === 'all') loadAll();
    else loadAdmin();
  }

  // ============================================================
  //  COSTRUZIONE GRIGLIA
  // ============================================================
  function buildCal(container) {
    container.innerHTML = '';
    const cal = document.createElement('div'); cal.className = 'cal';
    const corner = document.createElement('div'); corner.className = 'cal-corner'; cal.appendChild(corner);

    const days = document.createElement('div'); days.className = 'cal-days';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let d = 0; d < 7; d++) {
      const dt = addDays(state.curMonday, d);
      const h = document.createElement('div');
      h.className = 'cal-dayh' + (d >= 5 ? ' weekend' : '') + (sameDay(dt, today) ? ' today' : '');
      h.innerHTML = `<span>${DAYS[d]}</span><b>${dt.getDate()}</b>`;
      days.appendChild(h);
    }
    cal.appendChild(days);

    const times = document.createElement('div'); times.className = 'cal-times';
    for (let h = 0; h < 24; h++) { const t = document.createElement('div'); t.className = 'cal-time'; t.innerHTML = `<span>${pad2(h)}:00</span>`; times.appendChild(t); }
    cal.appendChild(times);

    const grid = document.createElement('div'); grid.className = 'cal-grid';
    for (let d = 0; d < 7; d++) {
      const col = document.createElement('div');
      col.className = 'cal-col' + (d >= 5 ? ' weekend' : ''); col.dataset.day = d;
      for (let s = 0; s < SLOTS; s++) {
        const sl = document.createElement('div');
        sl.className = 'slot' + (s % 2 === 0 ? ' hour' : '') + ((s === 0 || s === 24) ? ' h3' : '');
        col.appendChild(sl);
      }
      grid.appendChild(col);
    }
    cal.appendChild(grid);
    container.appendChild(cal);
  }

  function cellH(container) { const s = container.querySelector('.slot'); return s ? s.getBoundingClientRect().height : 15; }
  function colByDay(container, d) { return container.querySelector(`.cal-col[data-day="${d}"]`); }
  function centerOn14(container) {
    requestAnimationFrame(() => { container.scrollTop = Math.max(0, (CONFIG.CENTRO_FASCIA * 2 - 2) * cellH(container)); });
  }

  // ============================================================
  //  VISTA: LE MIE DISPONIBILITÀ
  // ============================================================
  const calMine = $('cal-mine');

  async function loadMine() {
    buildCal(calMine);
    attachPaint(calMine);
    const key = DB.dstr(state.curMonday);
    if (state.mineKey !== key) {
      try {
        const rows = await DB.weekAvailabilities(state.curMonday);
        state.mineStrips = rows.filter(r => DB.lower(r.user_email) === DB.lower(state.me.email))
          .map(r => ({ giorno: r.giorno, startSlot: hmToSlot(r.ora_inizio), endSlot: hmToSlot(r.ora_fine) }));
        state.mineKey = key; setDirty(false);
      } catch (e) { toast('Errore nel caricamento', true); console.error(e); }
    }
    renderMineStrips();
    updateEditUI();
    centerOn14(calMine);
  }

  function setDirty(b) { state.dirty = b; $('save-dot').classList.toggle('hidden', !b); }

  function setEditMode(on) { state.editMode = on; updateEditUI(); }
  function updateEditUI() {
    const editing = state.editMode;
    $('btn-save').classList.toggle('editing', editing);
    $('cal-mine').classList.toggle('editing', editing);
    $('save-label').textContent = editing ? 'Salva disponibilità' : 'Inserisci disponibilità';
    $('mine-hint').innerHTML = editing
      ? '✏️ Tieni premuto un attimo e <b>trascina</b> per segnare gli orari. Tocca una striscia per modificarla. Per scorrere, trascina con un tocco breve.'
      : '👁 Modalità visualizzazione. Premi <b>“Inserisci disponibilità”</b> in basso per modificare.';
  }

  function renderMineStrips() {
    calMine.querySelectorAll('.strip, .selection').forEach(e => e.remove());
    const ch = cellH(calMine);
    for (const s of state.mineStrips) {
      const d = dayIndexOf(s.giorno); if (d < 0 || d > 6) continue;
      const col = colByDay(calMine, d); if (!col) continue;
      const el = document.createElement('div'); el.className = 'strip';
      el.style.top = (s.startSlot * ch) + 'px';
      el.style.height = ((s.endSlot - s.startSlot) * ch) + 'px';
      el.dataset.giorno = s.giorno; el.dataset.start = s.startSlot; el.dataset.end = s.endSlot;
      const h = (s.endSlot - s.startSlot) * ch;
      el.innerHTML = h >= 30 ? `${slotHM(s.startSlot)}<br><small>${slotHM(s.endSlot)}</small>` : `${slotHM(s.startSlot)}`;
      col.appendChild(el);
    }
  }

  // unisce un intervallo nuovo con quelli esistenti dello stesso giorno
  function addStripMerged(giorno, a, b) {
    const others = state.mineStrips.filter(s => s.giorno !== giorno);
    const day = state.mineStrips.filter(s => s.giorno === giorno).map(s => [s.startSlot, s.endSlot]);
    day.push([a, b]); day.sort((x, y) => x[0] - y[0]);
    const merged = [];
    for (const iv of day) { const last = merged[merged.length - 1]; if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]); else merged.push([...iv]); }
    state.mineStrips = others.concat(merged.map(m => ({ giorno, startSlot: m[0], endSlot: m[1] })));
  }
  function removeStrip(giorno, a, b) {
    state.mineStrips = state.mineStrips.filter(s => !(s.giorno === giorno && s.startSlot === a && s.endSlot === b));
  }

  // ---------- controller disegno (solo in modifica; tieni premuto poi trascina) ----------
  const HOLD_MS = 600;   // attesa prima di iniziare a disegnare (sotto = scroll)
  const MOVE_TOL = 10;   // px di tolleranza durante l'attesa
  function attachPaint(container) {
    let st = null;
    function slotFromY(col, y) { const r = col.getBoundingClientRect(); return Math.max(0, Math.min(SLOTS - 1, Math.floor((y - r.top) / (r.height / SLOTS)))); }
    function showSel() {
      container.querySelectorAll('.selection').forEach(e => e.remove());
      const a = Math.min(st.startSlot, st.curSlot), b = Math.max(st.startSlot, st.curSlot) + 1;
      const ch = st.col.getBoundingClientRect().height / SLOTS;
      const sel = document.createElement('div'); sel.className = 'selection';
      sel.style.top = (a * ch) + 'px'; sel.style.height = ((b - a) * ch) + 'px';
      st.col.appendChild(sel);
    }
    function begin() {
      if (!st || st.onStrip) return;
      st.painting = true; state.paintingActive = true;   // blocca lo scroll (vedi listener touchmove)
      try { st.col.setPointerCapture(st.pid); } catch (_) {}
      if (navigator.vibrate) { try { navigator.vibrate(18); } catch (_) {} }
      showSel();
    }
    function onDown(e) {
      if (!state.editMode) return;                  // in visualizzazione: niente disegno, scroll normale
      if (e.button != null && e.button !== 0) return;
      const col = e.currentTarget;
      const stripEl = e.target.closest && e.target.closest('.strip');
      const s = slotFromY(col, e.clientY);
      st = { col, day: +col.dataset.day, startSlot: s, curSlot: s, sx: e.clientX, sy: e.clientY, pid: e.pointerId, onStrip: !!stripEl, stripEl, moved: false, painting: false };
      if (stripEl) { /* tap su striscia -> modifica (al pointerup) */ }
      else if (e.pointerType === 'mouse') begin();          // col mouse non c'è scroll: disegna subito
      else st.timer = setTimeout(begin, HOLD_MS);            // touch: tieni premuto
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    }
    function onMove(e) {
      if (!st) return;
      if (Math.abs(e.clientX - st.sx) > MOVE_TOL || Math.abs(e.clientY - st.sy) > MOVE_TOL) st.moved = true;
      if (!st.painting) {
        if (st.moved) { clearTimeout(st.timer); cleanup(); }   // mosso prima del tempo -> è uno scroll
        return;
      }
      e.preventDefault();
      st.curSlot = slotFromY(st.col, e.clientY);
      showSel();
    }
    function onUp() {
      if (!st) return;
      clearTimeout(st.timer);
      if (st.painting) {
        const a = Math.min(st.startSlot, st.curSlot), b = Math.max(st.startSlot, st.curSlot) + 1;
        addStripMerged(DB.dstr(addDays(state.curMonday, st.day)), a, b);
        setDirty(true); renderMineStrips();
      } else if (st.onStrip && !st.moved) {
        openStripEditor(st.stripEl);
      }
      cleanup();
    }
    function cleanup() {
      state.paintingActive = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      container.querySelectorAll('.selection').forEach(e => e.remove());
      st = null;
    }
    container.querySelectorAll('.cal-col').forEach(c => c.addEventListener('pointerdown', onDown));
  }

  // ---------- modal modifica striscia ----------
  let editing = null;
  function fillTimeSelect(sel, from, to) {
    sel.innerHTML = '';
    for (let s = from; s <= to; s++) { const o = document.createElement('option'); o.value = s; o.textContent = slotHM(s); sel.appendChild(o); }
  }
  function openStripEditor(stripEl) {
    const giorno = stripEl.dataset.giorno, a = +stripEl.dataset.start, b = +stripEl.dataset.end;
    editing = { giorno, a, b };
    const gsel = $('m-giorno'); gsel.innerHTML = '';
    for (let d = 0; d < 7; d++) { const dt = addDays(state.curMonday, d); const o = document.createElement('option'); o.value = DB.dstr(dt); o.textContent = `${DAYS[d]} ${dt.getDate()}`; gsel.appendChild(o); }
    gsel.value = giorno;
    fillTimeSelect($('m-inizio'), 0, SLOTS - 1); $('m-inizio').value = a;
    fillTimeSelect($('m-fine'), 1, SLOTS); $('m-fine').value = b;
    $('m-err').textContent = '';
    $('modal-strip').classList.remove('hidden');
  }
  function closeModal() { $('modal-strip').classList.add('hidden'); editing = null; }

  // ---------- salvataggio ----------
  async function saveMine() {
    const btn = $('btn-save'); btn.disabled = true;
    try {
      const rows = state.mineStrips.map(s => ({ giorno: s.giorno, ora_inizio: slotTime(s.startSlot), ora_fine: slotTime(s.endSlot) }));
      await DB.saveMyWeek(state.me.email, state.curMonday, rows);
      setDirty(false); toast('Disponibilità salvate ✓'); setEditMode(false);
    } catch (e) { console.error(e); toast('Errore nel salvataggio', true); }
    finally { btn.disabled = false; }
  }

  // ============================================================
  //  VISTA: TUTTI (sovrapposizioni)
  // ============================================================
  const calAll = $('cal-all');

  async function loadAll() {
    buildCal(calAll);
    let rows = [];
    try {
      [rows] = await Promise.all([DB.weekAvailabilities(state.curMonday), refreshUsers()]);
    } catch (e) { toast('Errore nel caricamento', true); console.error(e); }
    renderOverview(rows);
    centerOn14(calAll);
  }

  async function refreshUsers() {
    const users = await DB.listUsers();
    state.usersByEmail = {}; users.forEach(u => state.usersByEmail[DB.lower(u.email)] = u);
    return users;
  }

  function renderOverview(rows) {
    const ch = cellH(calAll);
    // responders della settimana
    const responders = [...new Set(rows.map(r => DB.lower(r.user_email)))];
    const R = responders.length;
    const fullEnabled = R >= 2;
    const summaryDays = [];
    let best = { count: 0 };

    for (let d = 0; d < 7; d++) {
      const col = colByDay(calAll, d); if (!col) continue;
      const dayStr = DB.dstr(addDays(state.curMonday, d));
      const dayRows = rows.filter(r => r.giorno === dayStr);

      // blocchi colorati per utente (colore configurato) + etichetta nome in cima
      const dayBlocks = dayRows.map(r => {
        const u = state.usersByEmail[DB.lower(r.user_email)];
        return { color: u ? u.colore : '#cccccc', name: shortName(u, r.user_email), a: hmToSlot(r.ora_inizio), b: hmToSlot(r.ora_fine) };
      }).sort((x, y) => x.a - y.a);
      let lastLabelBottom = -999;
      for (const blk of dayBlocks) {
        const top = blk.a * ch, height = (blk.b - blk.a) * ch;
        const el = document.createElement('div'); el.className = 'ov-block';
        el.style.top = top + 'px'; el.style.height = height + 'px';
        el.style.background = hexToRgba(blk.color, 0.5);
        col.appendChild(el);
        // nome in cima, spostato in basso se si sovrappone a un'altra etichetta
        const ly = Math.max(top + 1, lastLabelBottom + 2);
        if (ly + 12 <= top + height) {
          const lab = document.createElement('div'); lab.className = 'ov-name';
          lab.textContent = blk.name; lab.style.top = ly + 'px'; lab.style.color = blk.color;
          col.appendChild(lab);
          lastLabelBottom = ly + 12;
        }
      }

      // conteggio per slot
      const count = new Array(SLOTS).fill(0);
      for (let s = 0; s < SLOTS; s++) {
        const here = new Set();
        for (const r of dayRows) { if (hmToSlot(r.ora_inizio) <= s && s < hmToSlot(r.ora_fine)) here.add(DB.lower(r.user_email)); }
        count[s] = here.size;
        if (here.size > best.count) best = { count: here.size, day: d, slot: s };
      }

      // run contigui dove ci siamo tutti (= R)
      if (fullEnabled) {
        const ranges = [];
        let run = null;
        for (let s = 0; s < SLOTS; s++) {
          if (count[s] === R) { if (!run) run = [s, s + 1]; else run[1] = s + 1; }
          else if (run) { ranges.push(run); run = null; }
        }
        if (run) ranges.push(run);
        for (const [a, b] of ranges) {
          const full = document.createElement('div'); full.className = 'ov-full';
          full.style.top = (a * ch) + 'px'; full.style.height = ((b - a) * ch) + 'px';
          full.innerHTML = `${slotHM(a)}<br>${slotHM(b)}`;
          col.appendChild(full);
        }
        if (ranges.length) summaryDays.push({ d, ranges });
      }
    }

    renderLegend(responders);
    renderSummary(summaryDays, responders, R, best);
  }

  function renderLegend(responders) {
    const set = new Set(responders);
    const users = Object.values(state.usersByEmail).filter(u => u.attivo).sort((a, b) => (a.nome || a.email).localeCompare(b.nome || b.email));
    $('legend').innerHTML = users.map(u => {
      const me = DB.lower(u.email) === DB.lower(state.me.email);
      const absent = !set.has(DB.lower(u.email));
      const name = u.nome || u.email.split('@')[0];
      return `<span class="chip${absent ? ' absent' : ''}${me ? ' me' : ''}"><span class="dot" style="background:${u.colore}"></span>${me ? '<b>' + name + '</b>' : name}</span>`;
    }).join('');
  }

  function nameOf(email) { const u = state.usersByEmail[DB.lower(email)]; return u ? (u.nome || u.email.split('@')[0]) : email.split('@')[0]; }
  function shortName(u, email) {
    const n = (u && u.nome && u.nome.trim()) ? u.nome.trim().split(/\s+/)[0] : email.split('@')[0];
    return n.length > 8 ? n.slice(0, 8) : n;
  }

  function renderSummary(summaryDays, responders, R, best) {
    const box = $('summary');
    let html = '<h3>📋 Quando ci siamo</h3>';
    if (R === 0) { html += '<div class="empty">Nessuno ha ancora inserito disponibilità questa settimana.</div>'; box.innerHTML = html; return; }
    if (R === 1) { html += `<div class="empty">Solo <b>${nameOf(responders[0])}</b> ha inserito disponibilità. Servono almeno 2 persone per trovare un incrocio.</div>`; box.innerHTML = html; return; }

    const whoAll = responders.map(nameOf).join(', ');
    if (summaryDays.length === 0) {
      html += `<div class="empty">Nessun orario in cui ci siete <b>tutti e ${R}</b> (${whoAll}).</div>`;
      if (best.count >= 2) html += `<div class="best">Massimo finora: <b>${best.count} persone</b> insieme ${DAYS[best.day]} verso le ${slotHM(best.slot)}.</div>`;
    } else {
      for (const sd of summaryDays) {
        const dt = addDays(state.curMonday, sd.d);
        html += `<div class="sum-day"><div class="d">${DAYS[sd.d]} ${dt.getDate()} ${MESI[dt.getMonth()]}</div>`;
        for (const [a, b] of sd.ranges) html += `<div class="sum-row"><span class="t">${slotHM(a)}–${slotHM(b)}</span><span class="who">ci siamo tutti</span></div>`;
        html += `</div>`;
      }
      html += `<div class="best">Tutti = ${whoAll}</div>`;
    }
    box.innerHTML = html;
  }

  // ============================================================
  //  VISTA: UTENTI (admin)
  // ============================================================
  function nextPastel(users) {
    const used = new Set(users.map(u => (u.colore || '').toUpperCase()));
    return PASTELS.find(c => !used.has(c.toUpperCase())) || PASTELS[Math.floor(users.length % PASTELS.length)];
  }

  async function loadAdmin() {
    let users = [];
    try { users = await refreshUsers(); } catch (e) { toast('Errore', true); }
    renderUserList(users);
    $('u-colore').value = nextPastel(users);
  }

  function renderUserList(users) {
    const adminEmail = CONFIG.ADMIN_EMAIL.toLowerCase();
    $('user-list').innerHTML = '';
    users.forEach(u => {
      const isPerma = DB.lower(u.email) === adminEmail;
      const row = document.createElement('div'); row.className = 'user-row';
      const name = u.nome || u.email.split('@')[0];
      row.innerHTML = `
        <input type="color" class="dot" value="${u.colore}" title="Cambia colore">
        <div class="info"><div class="n">${name}</div><div class="e">${u.email}</div></div>
        <span class="tag ${u.attivo ? '' : 'off'}">${u.ruolo === 'admin' ? 'admin' : (u.attivo ? 'attivo' : 'disattivo')}</span>`;
      // colore
      row.querySelector('input[type=color]').addEventListener('change', async (ev) => {
        try { await DB.updateUser(u.email, { colore: ev.target.value }); toast('Colore aggiornato'); }
        catch (e) { toast('Errore', true); }
      });
      if (isPerma) {
        const lock = document.createElement('span'); lock.className = 'lock'; lock.textContent = '🔒'; lock.title = 'Admin perpetuo'; row.appendChild(lock);
      } else {
        const toggle = document.createElement('button'); toggle.textContent = u.attivo ? '🚫' : '✅'; toggle.title = u.attivo ? 'Disattiva' : 'Attiva';
        toggle.addEventListener('click', async () => { try { await DB.updateUser(u.email, { attivo: !u.attivo }); loadAdmin(); } catch (e) { toast('Errore', true); } });
        const del = document.createElement('button'); del.textContent = '🗑'; del.title = 'Elimina';
        del.addEventListener('click', async () => { if (!confirm(`Eliminare ${name}?`)) return; try { await DB.deleteUser(u.email); loadAdmin(); } catch (e) { toast('Errore', true); } });
        row.appendChild(toggle); row.appendChild(del);
      }
      $('user-list').appendChild(row);
    });
  }

  async function addUser(e) {
    e.preventDefault();
    const nome = $('u-nome').value.trim(), email = $('u-email').value.trim();
    if (!email) { toast('Inserisci un\'email', true); return; }
    try {
      await DB.addUser({ nome, email, colore: $('u-colore').value, ruolo: $('u-ruolo').value });
      $('u-nome').value = ''; $('u-email').value = ''; $('u-ruolo').value = 'membro';
      toast('Membro aggiunto ✓'); loadAdmin();
    } catch (err) {
      console.error(err);
      toast(err.code === '23505' ? 'Email già presente' : 'Errore (sei admin?)', true);
    }
  }

  // ============================================================
  //  ROUTING TAB
  // ============================================================
  function showView(v) {
    state.view = v;
    $('view-mine').classList.toggle('hidden', v !== 'mine');
    $('view-all').classList.toggle('hidden', v !== 'all');
    $('view-admin').classList.toggle('hidden', v !== 'admin');
    $('tab-mine').classList.toggle('active', v === 'mine');
    $('tab-all').classList.toggle('active', v === 'all');
    $('tab-admin').classList.toggle('active', v === 'admin');
    if (v === 'mine') loadMine();
    else if (v === 'all') loadAll();
    else loadAdmin();
    refreshUpdateToast();
  }

  // ============================================================
  //  WIRING + BOOT
  // ============================================================
  function wire() {
    // login (solo Google)
    $('btn-google').addEventListener('click', () => doGoogle(false));
    $('btn-google-switch').addEventListener('click', () => doGoogle(true));
    $('btn-logout-blocked').addEventListener('click', () => DB.signOut());
    $('btn-logout').addEventListener('click', () => DB.signOut());

    // aggiornamenti
    $('btn-update').addEventListener('click', applyUpdate);
    $('update-toast-reload').addEventListener('click', applyUpdate);
    $('update-toast-x').addEventListener('click', () => { state._toastDismissed = true; refreshUpdateToast(); });

    // settimana
    $('btn-prev').addEventListener('click', () => setWeek(addDays(state.curMonday, -7)));
    $('btn-next').addEventListener('click', () => setWeek(addDays(state.curMonday, 7)));
    $('btn-today').addEventListener('click', () => setWeek(startOfWeek(new Date())));

    // tab
    $('tab-mine').addEventListener('click', () => showView('mine'));
    $('tab-all').addEventListener('click', () => showView('all'));
    $('tab-admin').addEventListener('click', () => showView('admin'));

    // inserisci / salva (toggle modalità)
    $('btn-save').addEventListener('click', () => {
      if (!state.editMode) setEditMode(true);
      else if (state.dirty) saveMine();
      else setEditMode(false);
    });
    // blocca lo scroll della griglia SOLO mentre si sta disegnando
    $('cal-mine').addEventListener('touchmove', (e) => { if (state.paintingActive) e.preventDefault(); }, { passive: false });

    // modal
    $('btn-m-cancel').addEventListener('click', closeModal);
    $('modal-strip').addEventListener('click', (e) => { if (e.target.id === 'modal-strip') closeModal(); });
    $('btn-m-del').addEventListener('click', () => { if (editing) { removeStrip(editing.giorno, editing.a, editing.b); setDirty(true); renderMineStrips(); } closeModal(); });
    $('btn-m-save').addEventListener('click', () => {
      if (!editing) return closeModal();
      const g = $('m-giorno').value, a = +$('m-inizio').value, b = +$('m-fine').value;
      if (b <= a) { $('m-err').textContent = 'L\'ora di fine deve essere dopo l\'inizio.'; return; }
      removeStrip(editing.giorno, editing.a, editing.b);
      addStripMerged(g, a, b);
      setDirty(true); renderMineStrips(); closeModal();
    });

    // admin
    $('admin-form').addEventListener('submit', addUser);
  }

  function boot() {
    if (!window.supabase || !CONFIG.SUPABASE_URL) { document.body.innerHTML = '<p style="padding:20px">Configurazione mancante.</p>'; return; }
    wire();
    DB.onAuth(handleSession);
    DB.getSession().then(handleSession);
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
