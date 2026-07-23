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
