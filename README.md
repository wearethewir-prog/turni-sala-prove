# 🎸 TURNI SALA PROVE

App web mobile-first per organizzare le prove del gruppo in sala prove.
Login con Google (solo utenti autorizzati), calendario settimanale delle
disponibilità in stile Google Calendar, vista di sovrapposizione per
trovare gli orari in cui ci siamo tutti.

## Stack
- **Frontend:** HTML/CSS/JS puro, mobile-first → GitHub Pages
- **Backend:** Supabase (PostgreSQL + Auth Google + Realtime)
- **Login:** Supabase Auth, provider Google nativo

## Decisioni di progetto
- Griglia oraria **00:00–24:00**, slot da **30 minuti**, vista auto-centrata sulla fascia **14:00–24:00**.
- Settimana **Lunedì → Domenica**, colonne = giorni, righe = orari.
- Evidenza "ci siamo": slot pieno quando coincidono **tutti quelli che hanno inserito disponibilità** quella settimana.
- Colori pastello **fissi per utente** (semi-trasparenti nella vista d'insieme).
- Admin perpetuo non eliminabile: **marabelli.s@gmail.com**.

## Pagine
1. **Le mie disponibilità** — griglia settimanale, si "dipinge" trascinando il dito, tap su una striscia per modificarla/eliminarla, salva.
2. **Disponibilità di tutti** — sovrapposizione colorata + evidenza incroci + resoconto testuale.
3. **Utenti** (solo admin) — lista autorizzati, assegnazione colore, attiva/disattiva.

---

## ✅ Checklist setup infrastruttura

> L'account Google usato per GitHub / Supabase / Google Cloud può essere
> qualunque (anche quello del gruppo): è separato dall'**admin dell'app**,
> che resta `marabelli.s@gmail.com` (definito nel database).

### Fase 1 — GitHub
- [ ] Account GitHub pronto (nuovo o esistente)
- [ ] Repository creato (consigliato pubblico, es. `turni-sala-prove`)
- [ ] GitHub Pages attivo su branch `main` / root
- [ ] Personal Access Token (classic, scope `repo`) generato

### Fase 2 — Supabase
- [ ] Progetto Supabase creato (regione EU)
- [ ] Project URL + anon key copiati
- [ ] Management Access Token generato

### Fase 3 — Google Cloud (login Google)
- [ ] Progetto Google Cloud + schermata consenso OAuth
- [ ] OAuth Client ID (Web) con origini + redirect Supabase
- [ ] Client ID + Client Secret copiati

### Fase 4 — Supabase Auth
- [ ] Provider Google abilitato (Client ID + Secret incollati)
- [ ] Site URL + Redirect URLs impostati sulla URL di GitHub Pages

### Fase 5 — Build & deploy (lato Claude)
- [ ] Schema database applicato
- [ ] `js/config.js` compilato
- [ ] Codice app pushato → deploy automatico
- [ ] Login Google + autorizzazione utenti testati
