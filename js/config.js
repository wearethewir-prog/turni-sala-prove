// ============================================================
//  CONFIGURAZIONE — TURNI SALA PROVE
//  I valori SUPABASE_* vanno inseriti dopo aver creato il
//  progetto Supabase (Fase 2 del setup). L'anon key è pensata
//  per stare nel frontend: la sicurezza è garantita da login
//  Google + Row Level Security lato database.
// ============================================================
window.APP_CONFIG = {
  // --- Backend Supabase (da compilare in Fase 2) ---
  SUPABASE_URL: 'https://yaiarvzrjnxgbtrqjkfz.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlhaWFydnpyam54Z2J0cnFqa2Z6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MjMzNzIsImV4cCI6MjA5NzI5OTM3Mn0.akHCJ8VhL9p_NsiaW_Pj7i17T-uhBg6LHzJUoTjNw9E',

  // --- Admin perpetuo non eliminabile ---
  ADMIN_EMAIL: 'marabelli.s@gmail.com',

  // --- Parametri griglia (decisi insieme) ---
  ORA_INIZIO: 0,             // 00:00
  ORA_FINE: 24,              // 24:00
  SLOT_MINUTI: 30,           // granularità di uno slot
  CENTRO_FASCIA: 14,         // all'apertura la griglia si centra sulle 14:00
  REGOLA_EVIDENZA: 'chi_ha_risposto' // slot pieno = tutti quelli che hanno risposto
};
