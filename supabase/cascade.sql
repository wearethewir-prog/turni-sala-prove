-- ============================================================
--  Cancellazione utente -> cancella anche le sue disponibilità
--  (pulizia orfani + foreign key ON DELETE CASCADE). Idempotente.
-- ============================================================

-- 1) rimuove eventuali disponibilità orfane (utente non più esistente)
delete from public.disponibilita d
  where not exists (select 1 from public.utenti_autorizzati u where u.email = d.user_email);

-- 2) vincolo con cascata (aggiunto solo se non già presente)
do $fk$
begin
  if not exists (select 1 from pg_constraint where conname = 'fk_disp_user') then
    alter table public.disponibilita
      add constraint fk_disp_user foreign key (user_email)
      references public.utenti_autorizzati(email)
      on update cascade on delete cascade;
  end if;
end
$fk$;
