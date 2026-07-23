-- ============================================================
-- Bilhetes Procarro — configuração da base de dados (Supabase)
-- Colar tudo no SQL Editor e carregar em RUN.
-- ============================================================

-- ---------- perfis ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  name text not null default '',
  role text not null default 'member' check (role in ('admin','member')),
  created_at timestamptz not null default now()
);

-- perfil criado automaticamente quando um utilizador é adicionado
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', initcap(replace(split_part(new.email,'@',1), '.', ' '))),
    case when lower(new.email) = 'andrecouto10@gmail.com' then 'admin' else 'member' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as
$$ select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;

-- ---------- jogos ----------
create table public.games (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  opponent text,
  competition text,
  match_date date,
  match_time text,
  created_at timestamptz not null default now()
);

-- ---------- bilhetes ----------
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  category text not null check (category in ('camarote','bancada','parque')),
  zone text, sector text, "row" text, seat text, gate text, entrance text, floor text,
  code text,
  original_name text,
  file_path text not null default '',
  assigned_to uuid references public.profiles(id) on delete set null,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz,
  guest_note text,
  created_at timestamptz not null default now()
);
create index tickets_game_idx on public.tickets(game_id);

-- ---------- partilhas com convidados ----------
create table public.shares (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  shared_by uuid not null references public.profiles(id) on delete cascade,
  guest_name text not null,
  guest_contact text,
  url text not null,
  expires_at timestamptz,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);
create index shares_ticket_idx on public.shares(ticket_id);

-- ---------- registo de atividade ----------
create table public.activity (
  id bigint generated always as identity primary key,
  actor uuid references public.profiles(id) on delete set null,
  action text not null,
  game_id uuid,
  ticket_id uuid,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ============================================================
-- Segurança (RLS)
-- ============================================================
alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.tickets enable row level security;
alter table public.shares enable row level security;
alter table public.activity enable row level security;

-- perfis: todos os membros autenticados veem todos; cada um edita o seu nome; admin edita tudo
create policy "profiles_select" on public.profiles for select to authenticated using (true);
create policy "profiles_update_self" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin());

-- jogos: todos veem; só admin gere
create policy "games_select" on public.games for select to authenticated using (true);
create policy "games_admin_ins" on public.games for insert to authenticated with check (public.is_admin());
create policy "games_admin_upd" on public.games for update to authenticated using (public.is_admin());
create policy "games_admin_del" on public.games for delete to authenticated using (public.is_admin());

-- bilhetes: todos veem os dados (transparência); só admin altera
create policy "tickets_select" on public.tickets for select to authenticated using (true);
create policy "tickets_admin_ins" on public.tickets for insert to authenticated with check (public.is_admin());
create policy "tickets_admin_upd" on public.tickets for update to authenticated using (public.is_admin());
create policy "tickets_admin_del" on public.tickets for delete to authenticated using (public.is_admin());

-- partilhas: todos veem; quem tem o bilhete (ou admin) pode partilhar; o próprio ou admin pode anular
create policy "shares_select" on public.shares for select to authenticated using (true);
create policy "shares_insert" on public.shares for insert to authenticated
  with check (
    shared_by = auth.uid()
    and (
      public.is_admin()
      or exists (select 1 from public.tickets t where t.id = ticket_id and t.assigned_to = auth.uid())
    )
  );
create policy "shares_update" on public.shares for update to authenticated
  using (shared_by = auth.uid() or public.is_admin());

-- atividade: todos veem; qualquer autenticado escreve o seu próprio registo
create policy "activity_select" on public.activity for select to authenticated using (true);
create policy "activity_insert" on public.activity for insert to authenticated
  with check (actor = auth.uid());

-- ============================================================
-- Armazenamento dos PDFs (bucket privado "tickets")
-- ============================================================
insert into storage.buckets (id, name, public)
values ('tickets', 'tickets', false)
on conflict (id) do nothing;

-- ler: admin, ou o membro a quem o bilhete está atribuído
create policy "tickets_files_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'tickets'
    and (
      public.is_admin()
      or exists (select 1 from public.tickets t where t.file_path = name and t.assigned_to = auth.uid())
    )
  );

-- escrever/apagar: só admin
create policy "tickets_files_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'tickets' and public.is_admin());
create policy "tickets_files_update" on storage.objects for update to authenticated
  using (bucket_id = 'tickets' and public.is_admin());
create policy "tickets_files_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'tickets' and public.is_admin());

-- ============================================================
-- Link curto de partilha (página pública do convidado)
-- ============================================================
alter table public.shares add column if not exists token text;
create index if not exists shares_token_idx on public.shares(token);

create or replace function public.get_share(tok text)
returns table(
  guest_name text, url text, expires_at timestamptz,
  game_title text, match_date date, match_time text,
  category text, zone text, sector text, "row" text, seat text, entrance text, floor text
)
language sql stable security definer set search_path = public as $$
  select s.guest_name, s.url, s.expires_at, g.title, g.match_date, g.match_time,
         t.category, t.zone, t.sector, t."row", t.seat, t.entrance, t.floor
  from public.shares s
  join public.tickets t on t.id = s.ticket_id
  join public.games g on g.id = t.game_id
  where s.token = tok
    and length(tok) >= 10
    and s.revoked = false
    and (s.expires_at is null or s.expires_at > now())
$$;

grant execute on function public.get_share(text) to anon, authenticated;
-- Gestão de utilizadores dentro da app — colar no SQL Editor do Supabase e RUN

-- Criar um utilizador (só admins conseguem)
create or replace function public.admin_create_user(
  new_email text, new_password text, new_name text, new_role text default 'member'
) returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare uid uuid := gen_random_uuid();
begin
  if not public.is_admin() then raise exception 'Sem permissão'; end if;
  if new_role not in ('admin','member') then raise exception 'Perfil inválido'; end if;
  if length(new_password) < 8 then raise exception 'A palavra-passe deve ter pelo menos 8 caracteres'; end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current
  ) values (
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
    lower(new_email), extensions.crypt(new_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', new_name), now(), now(),
    '', '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), uid, uid::text,
    jsonb_build_object('sub', uid::text, 'email', lower(new_email), 'email_verified', true),
    'email', now(), now(), now()
  );

  update public.profiles set role = new_role, name = new_name where id = uid;
  return uid;
end $$;

grant execute on function public.admin_create_user(text, text, text, text) to authenticated;

-- Remover um utilizador (só admins; nunca a própria conta)
create or replace function public.admin_delete_user(target uuid)
returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Sem permissão'; end if;
  if target = auth.uid() then raise exception 'Não podes apagar a tua própria conta'; end if;
  delete from auth.users where id = target;
end $$;

grant execute on function public.admin_delete_user(uuid) to authenticated;
-- Empresas (Procarro / Fercopor) + crianças no camarote
-- Colar no SQL Editor do Supabase e RUN

-- 1) empresa em cada utilizador
alter table public.profiles
  add column if not exists company text not null default 'procarro'
  check (company in ('procarro','fercopor'));

-- 2) atualizar a função de criação de utilizadores para incluir a empresa
drop function if exists public.admin_create_user(text, text, text, text);

create or replace function public.admin_create_user(
  new_email text, new_password text, new_name text,
  new_role text default 'member', new_company text default 'procarro'
) returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare uid uuid := gen_random_uuid();
begin
  if not public.is_admin() then raise exception 'Sem permissão'; end if;
  if new_role not in ('admin','member') then raise exception 'Perfil inválido'; end if;
  if new_company not in ('procarro','fercopor') then raise exception 'Empresa inválida'; end if;
  if length(new_password) < 8 then raise exception 'A palavra-passe deve ter pelo menos 8 caracteres'; end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current
  ) values (
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
    lower(new_email), extensions.crypt(new_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', new_name), now(), now(),
    '', '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), uid, uid::text,
    jsonb_build_object('sub', uid::text, 'email', lower(new_email), 'email_verified', true),
    'email', now(), now(), now()
  );

  update public.profiles set role = new_role, name = new_name, company = new_company where id = uid;
  return uid;
end $$;

grant execute on function public.admin_create_user(text, text, text, text, text) to authenticated;

-- 3) crianças no camarote (extra sem bilhete, com nome)
create table if not exists public.game_kids (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  name text not null,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.game_kids enable row level security;
create policy "kids_select" on public.game_kids for select to authenticated using (true);
create policy "kids_insert" on public.game_kids for insert to authenticated with check (added_by = auth.uid());
create policy "kids_delete" on public.game_kids for delete to authenticated
  using (added_by = auth.uid() or public.is_admin());

-- data de nascimento das crianças
alter table public.game_kids add column if not exists birthdate date;

-- marca de envio das crianças
alter table public.game_kids add column if not exists sent_at timestamptz;
alter table public.game_kids add column if not exists sent_by uuid references public.profiles(id) on delete set null;
create policy "kids_update" on public.game_kids for update to authenticated using (true);
