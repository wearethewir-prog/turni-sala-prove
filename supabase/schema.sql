-- ============================================================
--  TURNI SALA PROVE - schema database (PostgreSQL / Supabase)
--  Eseguito via Management API. Idempotente (ri-eseguibile).
-- ============================================================

-- ---------- Tabelle ----------
create table if not exists public.utenti_autorizzati (
  email      text primary key,
  nome       text not null default '',
  colore     text not null default '#BAE1FF',
  ruolo      text not null default 'membro' check (ruolo in ('admin','membro')),
  attivo     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.disponibilita (
  id          uuid primary key default gen_random_uuid(),
  user_email  text not null,
  giorno      date not null,
  ora_inizio  time not null,
  ora_fine    time not null,
  created_at  timestamptz not null default now(),
  constraint ora_valida check (ora_fine > ora_inizio)
);
create index if not exists idx_disp_giorno on public.disponibilita (giorno);
create index if not exists idx_disp_email  on public.disponibilita (user_email);

-- ---------- Funzioni helper (security definer) ----------
create or replace function public.email_autorizzata() returns boolean
  language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from public.utenti_autorizzati u
    where lower(u.email) = lower(auth.jwt() ->> 'email') and u.attivo = true
  );
$fn$;

create or replace function public.is_admin() returns boolean
  language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from public.utenti_autorizzati u
    where lower(u.email) = lower(auth.jwt() ->> 'email')
      and u.ruolo = 'admin' and u.attivo = true
  );
$fn$;

-- ---------- Protezione admin perpetuo ----------
create or replace function public.proteggi_admin() returns trigger
  language plpgsql as $fn$
declare admin_email text := 'marabelli.s@gmail.com';
begin
  if (tg_op = 'DELETE') then
    if lower(old.email) = admin_email then
      raise exception 'Impossibile eliminare l''admin perpetuo';
    end if;
    return old;
  else -- UPDATE
    if lower(old.email) = admin_email then
      new.email  := old.email;
      new.ruolo  := 'admin';
      new.attivo := true;
    end if;
    return new;
  end if;
end;
$fn$;

drop trigger if exists trg_proteggi_admin on public.utenti_autorizzati;
create trigger trg_proteggi_admin
  before update or delete on public.utenti_autorizzati
  for each row execute function public.proteggi_admin();

-- ---------- Seed admin perpetuo ----------
insert into public.utenti_autorizzati (email, nome, colore, ruolo, attivo)
values ('marabelli.s@gmail.com', 'Stefano Marabelli', '#BAE1FF', 'admin', true)
on conflict (email) do update set ruolo = 'admin', attivo = true;

-- ---------- Row Level Security ----------
alter table public.utenti_autorizzati enable row level security;
alter table public.disponibilita      enable row level security;

drop policy if exists ua_select    on public.utenti_autorizzati;
drop policy if exists ua_admin_all  on public.utenti_autorizzati;
create policy ua_select on public.utenti_autorizzati
  for select to authenticated using (public.email_autorizzata());
create policy ua_admin_all on public.utenti_autorizzati
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists disp_select on public.disponibilita;
drop policy if exists disp_insert on public.disponibilita;
drop policy if exists disp_update on public.disponibilita;
drop policy if exists disp_delete on public.disponibilita;
create policy disp_select on public.disponibilita
  for select to authenticated using (public.email_autorizzata());
create policy disp_insert on public.disponibilita
  for insert to authenticated
  with check (public.email_autorizzata() and lower(user_email) = lower(auth.jwt() ->> 'email'));
create policy disp_update on public.disponibilita
  for update to authenticated
  using (lower(user_email) = lower(auth.jwt() ->> 'email'))
  with check (lower(user_email) = lower(auth.jwt() ->> 'email'));
create policy disp_delete on public.disponibilita
  for delete to authenticated
  using (lower(user_email) = lower(auth.jwt() ->> 'email'));

-- ---------- GRANT espliciti (policy post-30/10/2026) ----------
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on public.utenti_autorizzati to authenticated;
grant select, insert, update, delete on public.disponibilita      to authenticated;
grant all on public.utenti_autorizzati to service_role;
grant all on public.disponibilita      to service_role;

-- ---------- Realtime ----------
do $rt$
begin
  begin alter publication supabase_realtime add table public.disponibilita;      exception when others then null; end;
  begin alter publication supabase_realtime add table public.utenti_autorizzati; exception when others then null; end;
end
$rt$;
