// ============================================================
//  app.js — logica UI: auth, griglia, disegno, vista d'insieme, admin
// ============================================================
(function () {
  const CONFIG = window.APP_CONFIG;
  const SLOT_MIN = CONFIG.SLOT_MINUTI;            // 30
  const SLOTS = (24 * 60) / SLOT_MIN;             // 48
  const DAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
  const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  const MESI_FULL = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  const PASTELS = ['#FF8A8A', '#FFB36B', '#FFD96B', '#A6E3A1', '#6FD6C7', '#FF9FC4',
                   '#E0A96D', '#CFCFCF', '#9BE38B', '#FFC1A1', '#7FD1C1', '#D4A373'];
  const STRUMENTI = [
    ['chitarra', '🎸', 'Chitarra'], ['basso', '🪕', 'Basso'], ['batteria', '🥁', 'Batteria'],
    ['voce', '🎤', 'Voce'], ['tastiere', '🎹', 'Tastiere'], ['violino', '🎻', 'Violino'],
    ['sax', '🎷', 'Sax'], ['tromba', '🎺', 'Tromba'], ['fisarmonica', '🪗', 'Fisarmonica'],
    ['altro', '🎵', 'Altro']
  ];
  const strumEmoji = (k) => { const f = STRUMENTI.find(s => s[0] === k); return f ? f[1] : '🎵'; };
  function fillStrumentoSelect(sel, value) {
    sel.innerHTML = STRUMENTI.map(s => `<option value="${s[0]}">${s[1]} ${s[2]}</option>`).join('');
    sel.value = value || 'chitarra';
  }
  // icona strumento come immagine Twemoji (cartoon, uguale su ogni dispositivo, scalabile)
  const TWEMOJI = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/';
  function strumIco(key) {
    const cp = strumEmoji(key).codePointAt(0).toString(16);
    return `<img class="strum-ico" src="${TWEMOJI}${cp}.svg" alt="">`;
  }

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
    editMode: false, paintingActive: false, _slideDir: null
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
        if (state.view === 'all' || state.view === 'list') { clearTimeout(state._allTimer); state._allTimer = setTimeout(reloadCurrentView, 350); }
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && (state.view === 'all' || state.view === 'list')) reloadCurrentView();
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
    const show = state._updateAvail && !state._toastDismissed;
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
  function setWeek(monday, dir) {
    if (state.view === 'mine' && state.dirty && !confirm('Hai modifiche non salvate in questa settimana. Cambiare comunque?')) return;
    state.curMonday = monday; state.mineKey = null; state.editMode = false;
    state._slideDir = (dir && (state.view === 'mine' || state.view === 'all')) ? dir : null;
    updateWeekLabel(); reloadCurrentView();
  }
  function reloadCurrentView() {
    if (state.view === 'mine') loadMine();
    else if (state.view === 'all') loadAll();
    else if (state.view === 'list') loadList();
    else loadAdmin();
  }
  // animazione di scorrimento al cambio settimana
  function applySlide(container) {
    if (!state._slideDir) return;
    const cal = container.querySelector('.cal'); if (!cal) return;
    const cls = state._slideDir === 'next' ? 'slide-next' : 'slide-prev';
    cal.classList.add(cls);
    cal.addEventListener('animationend', () => cal.classList.remove(cls), { once: true });
    state._slideDir = null;
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
    applySlide(calMine);
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
      el.innerHTML = h >= 30
        ? `<span>${slotHM(s.startSlot)}</span><span>${slotHM(s.endSlot)}</span>`
        : `<span>${slotHM(s.startSlot)}</span>`;
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
    applySlide(calAll);
  }

  async function refreshUsers() {
    const users = await DB.listUsers();
    state.usersByEmail = {}; users.forEach(u => state.usersByEmail[DB.lower(u.email)] = u);
    return users;
  }

  // per ogni giorno: segmenti in cui >=2 utenti coincidono (stesso set) + chi sono
  function computeOverlap(rows) {
    const responders = [...new Set(rows.map(r => DB.lower(r.user_email)))];
    const R = responders.length;
    const byDay = []; let best = { count: 0 };
    for (let d = 0; d < 7; d++) {
      const dayStr = DB.dstr(addDays(state.curMonday, d));
      const dayRows = rows.filter(r => r.giorno === dayStr);
      const sets = [];
      for (let s = 0; s < SLOTS; s++) {
        const u = [];
        for (const r of dayRows) { if (hmToSlot(r.ora_inizio) <= s && s < hmToSlot(r.ora_fine)) u.push(DB.lower(r.user_email)); }
        const uniq = [...new Set(u)];
        sets.push(uniq);
        if (uniq.length > best.count) best = { count: uniq.length, day: d, slot: s };
      }
      const segs = []; let i = 0;
      while (i < SLOTS) {
        if (sets[i].length < 2) { i++; continue; }
        const key = [...sets[i]].sort().join('|');
        let j = i + 1;
        while (j < SLOTS && [...sets[j]].sort().join('|') === key) j++;
        segs.push({ a: i, b: j, users: sets[i].slice(), isFull: sets[i].length === R && R >= 2 });
        i = j;
      }
      byDay.push({ d, segs });
    }
    return { responders, R, byDay, best };
  }

  function renderOverview(rows) {
    const ch = cellH(calAll);
    const ov = computeOverlap(rows);
    for (let d = 0; d < 7; d++) {
      const col = colByDay(calAll, d); if (!col) continue;
      const dayStr = DB.dstr(addDays(state.curMonday, d));
      const dayRows = rows.filter(r => r.giorno === dayStr);
      // rettangoli per utente: colore configurato, trasparenti, SENZA nome
      for (const r of dayRows) {
        const u = state.usersByEmail[DB.lower(r.user_email)];
        const a = hmToSlot(r.ora_inizio), b = hmToSlot(r.ora_fine);
        const el = document.createElement('div'); el.className = 'ov-block';
        el.style.top = (a * ch) + 'px'; el.style.height = ((b - a) * ch) + 'px';
        el.style.background = hexToRgba(u ? u.colore : '#cccccc', 0.30);
        col.appendChild(el);
      }
      // bande di incrocio (>=2 musicisti): verde + icone strumenti; se ci sono TUTTI -> verde forte + orario
      for (const sg of ov.byDay[d].segs) {
        const icons = sg.users.map(e => { const u = state.usersByEmail[e]; return strumIco(u ? u.strumento : 'altro'); }).join('');
        const band = document.createElement('div');
        band.className = 'ov-band' + (sg.isFull ? ' full' : '');
        band.style.top = (sg.a * ch) + 'px'; band.style.height = ((sg.b - sg.a) * ch) + 'px';
        band.innerHTML = sg.isFull
          ? `<div class="iconz">${icons}</div><div class="tt">${slotHM(sg.a)}<br>${slotHM(sg.b)}</div>`
          : `<div class="iconz">${icons}</div>`;
        col.appendChild(band);
      }
      // tap (senza scroll) sulla colonna -> mostra chi è disponibile in quella fascia
      col.addEventListener('click', (e) => {
        const rc = col.getBoundingClientRect();
        const slot = Math.max(0, Math.min(SLOTS - 1, Math.floor((e.clientY - rc.top) / (rc.height / SLOTS))));
        const here = dayRows.filter(x => hmToSlot(x.ora_inizio) <= slot && slot < hmToSlot(x.ora_fine));
        if (here.length) showTapInfo(d, slot, here);
      });
    }
    renderLegend(ov.responders);
  }

  // segmenti (>=2 utenti coincidenti) di un singolo giorno
  function daySegments(dayRows) {
    const sets = [];
    for (let s = 0; s < SLOTS; s++) {
      const u = [];
      for (const r of dayRows) { if (hmToSlot(r.ora_inizio) <= s && s < hmToSlot(r.ora_fine)) u.push(DB.lower(r.user_email)); }
      sets.push([...new Set(u)]);
    }
    const segs = []; let i = 0;
    while (i < SLOTS) {
      if (sets[i].length < 2) { i++; continue; }
      const key = [...sets[i]].sort().join('|'); let j = i + 1;
      while (j < SLOTS && [...sets[j]].sort().join('|') === key) j++;
      segs.push({ a: i, b: j, users: sets[i].slice() });
      i = j;
    }
    return segs;
  }

  // VISTA ELENCO: dal giorno odierno in avanti, una riga per giorno con >=2 musicisti, raggruppata per mese
  async function loadList() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let rows = [];
    try { const r = await Promise.all([DB.availabilitiesFrom(today), refreshUsers()]); rows = r[0]; }
    catch (e) { toast('Errore nel caricamento', true); console.error(e); }
    renderElenco(rows);
  }

  function renderElenco(rows) {
    const activeEmails = Object.values(state.usersByEmail).filter(u => u.attivo).map(u => DB.lower(u.email));
    const byDay = {};
    for (const r of rows) (byDay[r.giorno] = byDay[r.giorno] || []).push(r);
    const giorni = Object.keys(byDay).sort();
    let html = '<h3>🗒️ Prossime disponibilità</h3>';
    let curMonth = null, any = false;
    for (const g of giorni) {
      const segs = daySegments(byDay[g]);
      if (!segs.length) continue;
      let best = segs[0]; for (const sg of segs) if (sg.users.length > best.users.length) best = sg;
      const fullSeg = (activeEmails.length >= 2) ? segs.find(sg => activeEmails.every(e => sg.users.includes(e))) : null;
      const show = fullSeg || best;
      const dt = parseDate(g);
      const mk = dt.getFullYear() + '-' + dt.getMonth();
      if (mk !== curMonth) { curMonth = mk; html += `<div class="el-month">${MESI_FULL[dt.getMonth()].toUpperCase()}</div>`; }
      const count = show.users.length;
      const icons = show.users.map(e => { const u = state.usersByEmail[e]; return strumIco(u ? u.strumento : 'altro'); }).join('');
      const dayName = DAYS[(dt.getDay() + 6) % 7];
      html += `<div class="el-row${fullSeg ? ' full' : ''}"><span class="el-day">${dayName} ${dt.getDate()}</span><span class="el-info">${fullSeg ? 'tutti' : count} · ${slotHM(show.a)}–${slotHM(show.b)}</span><span class="el-icons">${icons}</span></div>`;
      any = true;
    }
    if (!any) html += '<div class="empty">Nessun giorno con almeno 2 musicisti insieme, da oggi in avanti.</div>';
    $('list-content').innerHTML = html;
  }

  // ---------- toast info: tap (senza scroll) su un rettangolo nella vista "Tutti" ----------
  function showTapInfo(d, slot, rows) {
    const dt = addDays(state.curMonday, d);
    let html = `<h4>${DAYS[d]} ${dt.getDate()} ${MESI[dt.getMonth()]} · ${slotHM(slot)}</h4>`;
    for (const r of rows) {
      const u = state.usersByEmail[DB.lower(r.user_email)];
      const color = u ? u.colore : '#cccccc';
      const ico = strumIco(u ? u.strumento : 'altro');
      html += `<div class="tap-row"><span class="dot" style="background:${color}"></span><span class="em">${ico}</span><span class="nm">${nameOf(r.user_email)}</span><span class="tap-time">${r.ora_inizio.slice(0, 5)}–${r.ora_fine.slice(0, 5)}</span></div>`;
    }
    $('tap-body').innerHTML = html;
    $('tap-modal').classList.remove('hidden');
  }
  function closeTap() { $('tap-modal').classList.add('hidden'); }

  // ---------- swipe orizzontale per cambiare settimana (Le mie / Tutti) ----------
  function attachSwipeWeek(el) {
    let sx = 0, sy = 0, ok = false;
    el.addEventListener('touchstart', (e) => { if (e.touches.length !== 1) { ok = false; return; } sx = e.touches[0].clientX; sy = e.touches[0].clientY; ok = true; }, { passive: true });
    el.addEventListener('touchend', (e) => {
      if (!ok) return; ok = false;
      const t = e.changedTouches[0]; const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8) setWeek(addDays(state.curMonday, dx < 0 ? 7 : -7), dx < 0 ? 'next' : 'prev');
    }, { passive: true });
  }

  function renderLegend(responders) {
    const set = new Set(responders);
    const users = Object.values(state.usersByEmail).filter(u => u.attivo).sort((a, b) => (a.nome || a.email).localeCompare(b.nome || b.email));
    $('legend').innerHTML = users.map(u => {
      const me = DB.lower(u.email) === DB.lower(state.me.email);
      const absent = !set.has(DB.lower(u.email));
      const name = u.nome || u.email.split('@')[0];
      return `<span class="chip${absent ? ' absent' : ''}${me ? ' me' : ''}"><span class="dot" style="background:${u.colore}"></span>${me ? '<b>' + name + '</b>' : name} <span class="lg-strum">${strumIco(u.strumento)}</span></span>`;
    }).join('');
  }

  function nameOf(email) { const u = state.usersByEmail[DB.lower(email)]; return u ? (u.nome || u.email.split('@')[0]) : email.split('@')[0]; }
  function shortName(u, email) {
    const n = (u && u.nome && u.nome.trim()) ? u.nome.trim().split(/\s+/)[0] : email.split('@')[0];
    return n.length > 8 ? n.slice(0, 8) : n;
  }
  function whoLabel(email) { const u = state.usersByEmail[DB.lower(email)]; return (u ? strumEmoji(u.strumento) + ' ' : '') + nameOf(email); }

  function renderSummary(box, summaryDays, responders, R, best) {
    let html = '<h3>📋 Quando ci siamo</h3>';
    if (R === 0) { html += '<div class="empty">Nessuno ha ancora inserito disponibilità questa settimana.</div>'; box.innerHTML = html; return; }
    if (R === 1) { html += `<div class="empty">Solo <b>${whoLabel(responders[0])}</b> ha inserito disponibilità. Servono almeno 2 persone per trovare un incrocio.</div>`; box.innerHTML = html; return; }

    const whoAll = responders.map(whoLabel).join(', ');
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
    fillStrumentoSelect($('u-strumento'), 'chitarra');
  }

  function renderUserList(users) {
    const adminEmail = CONFIG.ADMIN_EMAIL.toLowerCase();
    $('user-list').innerHTML = '';
    users.forEach(u => {
      const isPerma = DB.lower(u.email) === adminEmail;
      const row = document.createElement('div'); row.className = 'user-row';
      const name = u.nome || u.email.split('@')[0];
      row.innerHTML = `
        <input type="color" class="dot" value="${u.colore}" title="Colore">
        <select class="strum-sel" title="Strumento"></select>
        <div class="info"><div class="n">${name}</div><div class="e">${u.email}</div></div>
        <span class="tag ${u.attivo ? '' : 'off'}">${u.ruolo === 'admin' ? 'admin' : (u.attivo ? 'attivo' : 'disattivo')}</span>`;
      row.querySelector('input[type=color]').addEventListener('change', async (ev) => {
        try { await DB.updateUser(u.email, { colore: ev.target.value }); toast('Colore aggiornato'); }
        catch (e) { toast('Errore', true); }
      });
      const ssel = row.querySelector('.strum-sel'); fillStrumentoSelect(ssel, u.strumento || 'chitarra');
      ssel.addEventListener('change', async (ev) => {
        try { await DB.updateUser(u.email, { strumento: ev.target.value }); toast('Strumento aggiornato'); }
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
      await DB.addUser({ nome, email, colore: $('u-colore').value, strumento: $('u-strumento').value, ruolo: $('u-ruolo').value });
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
    $('view-list').classList.toggle('hidden', v !== 'list');
    $('view-admin').classList.toggle('hidden', v !== 'admin');
    $('tab-mine').classList.toggle('active', v === 'mine');
    $('tab-all').classList.toggle('active', v === 'all');
    $('tab-list').classList.toggle('active', v === 'list');
    $('tab-admin').classList.toggle('active', v === 'admin');
    if (v === 'mine') loadMine();
    else if (v === 'all') loadAll();
    else if (v === 'list') loadList();
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
    $('btn-prev').addEventListener('click', () => setWeek(addDays(state.curMonday, -7), 'prev'));
    $('btn-next').addEventListener('click', () => setWeek(addDays(state.curMonday, 7), 'next'));
    $('btn-today').addEventListener('click', () => setWeek(startOfWeek(new Date())));

    // tab
    $('tab-mine').addEventListener('click', () => showView('mine'));
    $('tab-all').addEventListener('click', () => showView('all'));
    $('tab-list').addEventListener('click', () => showView('list'));
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

    // swipe orizzontale -> cambia settimana; toast info su tap (vista Tutti)
    attachSwipeWeek($('view-mine'));
    attachSwipeWeek($('view-all'));
    $('tap-x').addEventListener('click', closeTap);
    $('tap-modal').addEventListener('click', (e) => { if (e.target.id === 'tap-modal') closeTap(); });
  }

  function boot() {
    if (!window.supabase || !CONFIG.SUPABASE_URL) { document.body.innerHTML = '<p style="padding:20px">Configurazione mancante.</p>'; return; }
    wire();
    DB.onAuth(handleSession);
    DB.getSession().then(handleSession);
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
