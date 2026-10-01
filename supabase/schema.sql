-- ============================================================================
--  MIK-VER UNIVERSAL GROUP²OSTE — Schéma Supabase complet (v1.0)
--  À coller dans : Supabase → SQL Editor → Run
--  Conseillé : exécuter d'abord sur un projet de TEST.
--
--  Ce fichier applique TOUTES les règles décidées :
--   · 5 photos max par personne et par concours
--   · suppression d'une photo = perte de ses points, BLOQUÉE les 3 dernières heures
--   · réactions pondérées (barème modifiable sans redéployer), 1 seule de chaque
--     type par personne et par photo, jamais sur sa propre photo
--   · classement = meilleure photo de chaque personne ; égalité = la 1ʳᵉ arrivée
--   · 1 seul gagnant ; l'admin peut participer mais PAS gagner (can_win = false)
--   · clôture automatique toutes les 5 min (pg_cron OU cron Vercel, au choix)
--   · annulation + remboursement si minimum de participants non atteint
--   · répartition gagnant/organisateur en % (défaut 85 / 15) sur le NET
--   · journal public des actions admin (transparence)
--   · fichiers images mis à la poubelle (storage_trash) pour nettoyage serveur
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  phone        text unique,
  display_name text,
  is_admin     boolean not null default false,
  can_win      boolean not null default true,   -- l'admin passe à false
  created_at   timestamptz not null default now()
);

create table if not exists public.contests (
  id               bigint generated always as identity primary key,
  status           text not null default 'ouvert'
                     check (status in ('ouvert','clos','annule')),
  starts_at        timestamptz not null default now(),
  ends_at          timestamptz not null,          -- starts_at + 24 h
  gain_mode        integer not null default 0 check (gain_mode >= 0), -- 0 = gratuit
  fee_fcfa         integer not null default 0,
  winner_pct       integer not null default 85 check (winner_pct between 0 and 100),
  organizer_pct    integer not null default 15,
  min_participants integer not null default 5,
  created_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  check (winner_pct + organizer_pct = 100),
  check (ends_at > starts_at),
  check (gain_mode = 0 or fee_fcfa > 0)
);

-- inscription d'un participant (gratuit : créée par l'app ; payant : par le serveur
-- UNIQUEMENT après confirmation webhook)
create table if not exists public.entries (
  id         bigint generated always as identity primary key,
  contest_id bigint not null references public.contests(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  amount_fcfa integer not null default 0,
  net_fcfa    integer not null default 0,         -- montant - frais prestataire
  status     text not null default 'en_attente'
               check (status in ('en_attente','paye','rembourse')),
  created_at timestamptz not null default now(),
  unique (contest_id, user_id)
);

create table if not exists public.photos (
  id               bigint generated always as identity primary key,
  contest_id       bigint not null references public.contests(id) on delete cascade,
  owner_id         uuid not null references public.profiles(id) on delete cascade,
  storage_path     text not null unique,          -- chemin dans le bucket 'photos'
  caption          text,
  score            integer not null default 0,
  score_updated_at timestamptz not null default now(), -- sert au départage égalité
  created_at       timestamptz not null default now()
);

-- barème des émojis : MODIFIABLE sans toucher au code ni redéployer
create table if not exists public.reaction_weights (
  key    text primary key,
  emoji  text not null,
  label  text not null,
  points integer not null check (points >= 0)    -- jamais négatif : anti-sabotage
);

create table if not exists public.reactions (
  id           bigint generated always as identity primary key,
  photo_id     bigint not null references public.photos(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  reaction_key text not null references public.reaction_weights(key),
  created_at   timestamptz not null default now(),
  unique (photo_id, user_id, reaction_key)        -- 1 seule de chaque type / photo
);

-- résultat figé d'un concours clos (survit au nettoyage)
create table if not exists public.results (
  contest_id             bigint primary key references public.contests(id) on delete cascade,
  winner_photo_id        bigint references public.photos(id) on delete set null,
  winner_user_id         uuid references public.profiles(id),
  winner_score           integer not null default 0,
  participants           integer not null default 0,
  gross_fcfa             integer not null default 0,
  net_fcfa               integer not null default 0,
  winner_amount_fcfa     integer not null default 0,  -- net × winner_pct / 100
  organizer_amount_fcfa  integer not null default 0,  -- le reste
  closed_at              timestamptz not null default now()
);

-- argent : écrit UNIQUEMENT par le serveur (service_role), jamais par l'app
create table if not exists public.payments (
  id           bigint generated always as identity primary key,
  direction    text not null check (direction in ('in','out')),
  contest_id   bigint references public.contests(id) on delete set null,
  user_id      uuid references public.profiles(id) on delete set null,
  provider     text not null default 'cardflux',
  provider_ref text unique,                       -- id transaction agrégateur
  amount_fcfa  integer not null,
  status       text not null default 'initie'
                 check (status in ('initie','confirme','echec','rembourse')),
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  confirmed_at timestamptz
);

-- files images à supprimer du Storage par la fonction serveur de nettoyage
create table if not exists public.storage_trash (
  id           bigint generated always as identity primary key,
  storage_path text not null,
  queued_at    timestamptz not null default now()
);

-- journal PUBLIC des actions admin / du système (transparence du créateur)
create table if not exists public.admin_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid references public.profiles(id),
  action     text not null,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_photos_contest   on public.photos (contest_id, owner_id);
create index if not exists idx_reactions_photo  on public.reactions (photo_id);
create index if not exists idx_entries_contest  on public.entries (contest_id);
create index if not exists idx_contests_status  on public.contests (status, ends_at);

-- ---------------------------------------------------------------------------
-- 2. DONNÉES DE DÉPART
-- ---------------------------------------------------------------------------

insert into public.reaction_weights (key, emoji, label, points) values
  ('coeur',      '❤️', 'Cœur',      5),
  ('rire',       '😂', 'Rire',      4),
  ('surprise',   '😮', 'Surprise',  3),
  ('pitie',      '🥺', 'Pitié',     2),
  ('peur',       '😱', 'Peur',      2),
  ('tristesse',  '😢', 'Tristesse', 1)
on conflict (key) do update
  set points = excluded.points, emoji = excluded.emoji, label = excluded.label;

insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. FONCTIONS & DÉCLENCHEURS (les règles vivent ICI, pas dans l'app)
-- ---------------------------------------------------------------------------

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select is_admin from public.profiles where id = auth.uid()), false) $$;

-- profil créé automatiquement à l'inscription (auth téléphone)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, phone, display_name)
  values (new.id, new.phone,
          coalesce(new.raw_user_meta_data->>'display_name', 'Membre ' || left(coalesce(new.phone,'?'), 4)))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- publication : concours ouvert + max 5 photos par personne
create or replace function public.enforce_photo_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare c public.contests; n integer;
begin
  select * into c from public.contests where id = new.contest_id;
  if c is null or c.status <> 'ouvert' or now() > c.ends_at then
    raise exception 'Concours clos : publication impossible';
  end if;
  select count(*) into n from public.photos
   where contest_id = new.contest_id and owner_id = new.owner_id;
  if n >= 5 then
    raise exception 'Maximum 5 photos par personne et par concours';
  end if;
  return new;
end $$;
drop trigger if exists photos_insert_rules on public.photos;
create trigger photos_insert_rules before insert on public.photos
  for each row execute function public.enforce_photo_rules();

-- suppression : bloquée les 3 dernières heures ; le fichier part à la poubelle
create or replace function public.enforce_photo_delete() returns trigger
language plpgsql security definer set search_path = public as $$
declare c public.contests;
begin
  select * into c from public.contests where id = old.contest_id;
  if c.status = 'ouvert' and now() > c.ends_at - interval '3 hours' then
    raise exception 'Suppression bloquée pendant les 3 dernières heures du concours';
  end if;
  insert into public.storage_trash (storage_path) values (old.storage_path);
  return old;
end $$;
drop trigger if exists photos_delete_rules on public.photos;
create trigger photos_delete_rules before delete on public.photos
  for each row execute function public.enforce_photo_delete();

-- réaction : jamais sur sa propre photo, concours ouvert
create or replace function public.enforce_reaction_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.photos; c public.contests;
begin
  select * into p from public.photos where id = new.photo_id;
  if p is null then raise exception 'Photo introuvable'; end if;
  if p.owner_id = new.user_id then
    raise exception 'Interdit de réagir à sa propre photo';
  end if;
  select * into c from public.contests where id = p.contest_id;
  if c.status <> 'ouvert' or now() > c.ends_at then
    raise exception 'Concours clos : réaction impossible';
  end if;
  return new;
end $$;
drop trigger if exists reactions_insert_rules on public.reactions;
create trigger reactions_insert_rules before insert on public.reactions
  for each row execute function public.enforce_reaction_rules();

-- score recalculé à chaque réaction (les points partent avec la photo supprimée)
create or replace function public.recompute_photo_score() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid bigint;
begin
  pid := coalesce(new.photo_id, old.photo_id);
  update public.photos p set
    score = coalesce((select sum(w.points)
                        from public.reactions r
                        join public.reaction_weights w on w.key = r.reaction_key
                       where r.photo_id = pid), 0),
    score_updated_at = now()
  where p.id = pid;
  return coalesce(new, old);
end $$;
drop trigger if exists reactions_score on public.reactions;
create trigger reactions_score after insert on public.reactions
  for each row execute function public.recompute_photo_score();

-- ---------------------------------------------------------------------------
-- 4. CLÔTURE AUTOMATIQUE (le cœur du cycle de 24 h)
-- ---------------------------------------------------------------------------

create or replace function public.close_contests() returns text
language plpgsql security definer set search_path = public as $$
declare
  c public.contests;
  n_part integer; gross integer; net integer;
  wp bigint; wu uuid; ws integer;
begin
  for c in
    select * from public.contests where status = 'ouvert' and ends_at <= now()
  loop
    -- nombre de participants : inscrits payés, ou publieurs si gratuit
    if c.gain_mode = 0 then
      select count(distinct owner_id) into n_part
        from public.photos where contest_id = c.id;
    else
      select count(*) into n_part
        from public.entries where contest_id = c.id and status = 'paye';
    end if;

    if c.gain_mode > 0 and n_part < c.min_participants then
      -- trop peu de monde : annulation + remboursement
      update public.contests set status = 'annule' where id = c.id;
      update public.entries set status = 'rembourse'
        where contest_id = c.id and status = 'paye';
      insert into public.admin_log (actor_id, action, details)
        values (c.created_by, 'annulation_concours',
                jsonb_build_object('contest_id', c.id,
                                   'motif', 'minimum de participants non atteint',
                                   'participants', n_part));
    else
      -- gagnant : meilleure photo de chaque personne, puis la meilleure ;
      -- égalité = score atteint en premier ; l'admin (can_win=false) est exclu
      select p.id, p.owner_id, p.score into wp, wu, ws
        from public.photos p
        join public.profiles pr on pr.id = p.owner_id and pr.can_win
        where p.contest_id = c.id
          and p.score = (select max(q.score) from public.photos q
                          where q.contest_id = c.id and q.owner_id = p.owner_id)
        order by p.score desc, p.score_updated_at asc
        limit 1;

      select coalesce(sum(amount_fcfa), 0), coalesce(sum(net_fcfa), 0)
        into gross, net
        from public.entries where contest_id = c.id and status = 'paye';

      insert into public.results
        (contest_id, winner_photo_id, winner_user_id, winner_score, participants,
         gross_fcfa, net_fcfa, winner_amount_fcfa, organizer_amount_fcfa)
      values
        (c.id, wp, wu, coalesce(ws, 0), n_part, gross, net,
         net * c.winner_pct / 100, net - net * c.winner_pct / 100);

      update public.contests set status = 'clos' where id = c.id;
      insert into public.admin_log (actor_id, action, details)
        values (c.created_by, 'cloture_concours',
                jsonb_build_object('contest_id', c.id, 'gagnant', wu, 'score', ws));
    end if;

    -- nettoyage : supprimer les photos met les fichiers en file de poubelle ;
    -- les réactions suivent par cascade. Le résultat, lui, est déjà figé.
    delete from public.photos where contest_id = c.id;
  end loop;
  return 'ok';
end $$;

-- OPTION A — pg_cron (si l'extension est activée sur ton projet) :
-- select cron.schedule('mik-ver-cloture', '*/5 * * * *',
--                      'select public.close_contests()');
-- OPTION B — sans pg_cron : un cron Vercel appelle /api/cloture toutes les 5 min,
--            qui exécute cette même fonction via service_role. (Recommandé : B.)

-- ---------------------------------------------------------------------------
-- 5. VUE CLASSEMENT (meilleure photo par personne, rangs)
-- ---------------------------------------------------------------------------

create or replace view public.v_leaderboard as
select p.contest_id,
       p.owner_id,
       pr.display_name,
       max(p.score) as score,
       (array_agg(p.id order by p.score desc, p.score_updated_at asc))[1] as best_photo_id,
       rank() over (partition by p.contest_id
                    order by max(p.score) desc, min(p.score_updated_at) asc) as rang
  from public.photos p
  join public.profiles pr on pr.id = p.owner_id
 group by p.contest_id, p.owner_id, pr.display_name;

-- ---------------------------------------------------------------------------
-- 6. SÉCURITÉ : RLS + droits (qui peut lire / écrire quoi)
-- ---------------------------------------------------------------------------

alter table public.profiles        enable row level security;
alter table public.contests        enable row level security;
alter table public.entries         enable row level security;
alter table public.photos          enable row level security;
alter table public.reactions       enable row level security;
alter table public.reaction_weights enable row level security;
alter table public.results         enable row level security;
alter table public.payments        enable row level security;
alter table public.storage_trash   enable row level security;
alter table public.admin_log       enable row level security;

-- profils : tout le monde voit le trombinoscope, personne ne voit les téléphones
revoke all on public.profiles from anon, authenticated;
grant select (id, display_name, is_admin, can_win) on public.profiles to anon, authenticated;
grant update (display_name) on public.profiles to authenticated;
create policy prof_select on public.profiles for select using (true);
create policy prof_update on public.profiles for update using (id = auth.uid());

-- concours : lecture publique, écriture admin
create policy cont_select on public.contests for select using (true);
create policy cont_write  on public.contests for all
  using (public.is_admin()) with check (public.is_admin());

-- inscriptions : lecture soi-même/admin ; écriture soi-même en mode GRATUIT
-- (en mode payant, seul le serveur insère, après webhook)
create policy entr_select on public.entries for select
  using (user_id = auth.uid() or public.is_admin());
create policy entr_insert_gratuit on public.entries for insert with check (
  user_id = auth.uid()
  and exists (select 1 from public.contests c
               where c.id = contest_id and c.gain_mode = 0 and c.status = 'ouvert')
);

-- photos : lecture publique, publication/suppression soi-même (règles = triggers)
create policy phot_select on public.photos for select using (true);
create policy phot_insert on public.photos for insert with check (owner_id = auth.uid());
create policy phot_update on public.photos for update using (owner_id = auth.uid());
create policy phot_delete on public.photos for delete
  using (owner_id = auth.uid() or public.is_admin());

-- réactions : lecture publique, écriture soi-même (règles = triggers)
create policy reac_select on public.reactions for select using (true);
create policy reac_insert on public.reactions for insert with check (user_id = auth.uid());

-- barème : lecture publique, modification admin
create policy weigh_select on public.reaction_weights for select using (true);
create policy weigh_write  on public.reaction_weights for all
  using (public.is_admin()) with check (public.is_admin());

-- résultats + journal : lecture publique (transparence)
create policy res_select  on public.results  for select using (true);
create policy log_select  on public.admin_log for select using (true);

-- paiements : lecture soi-même/admin, écriture SERVEUR UNIQUEMENT (service_role)
create policy pay_select on public.payments for select
  using (user_id = auth.uid() or public.is_admin());

-- poubelle Storage : serveur uniquement (aucune policy = personne côté app)

-- droits PostgREST
grant select on public.contests, public.reaction_weights, public.results,
              public.admin_log, public.v_leaderboard to anon, authenticated;
grant select, insert on public.entries to authenticated;
grant select, insert, update, delete on public.photos to authenticated;
grant select, insert on public.reactions to authenticated;
grant select on public.payments to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Stockage : lecture publique du bucket 'photos', écriture dans SON propre dossier
create policy storage_photos_read on storage.objects for select
  using (bucket_id = 'photos');
create policy storage_photos_write on storage.objects for insert
  with check (bucket_id = 'photos'
              and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- 7. APRÈS COLLAGE : 3 gestes à faire une fois
-- ---------------------------------------------------------------------------
-- 1) Inscris-toi dans l'app (ou crée ton utilisateur), puis passe-toi admin :
--    update public.profiles set is_admin = true, can_win = false
--     where phone = '+241XXXXXXXX';
-- 2) Vérifie le barème : select * from public.reaction_weights;
-- 3) Choisis l'option de cron (A ou B, voir §4) — recommandation : B (Vercel).
-- ============================================================================
