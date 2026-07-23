-- Crianças do camarote: data de nascimento + marca de "enviado por WhatsApp"
-- Colar no SQL Editor e RUN (seguro correr mais do que uma vez)
alter table public.game_kids add column if not exists birthdate date;
alter table public.game_kids add column if not exists sent_at timestamptz;
alter table public.game_kids add column if not exists sent_by uuid references public.profiles(id) on delete set null;

drop policy if exists "kids_update" on public.game_kids;
create policy "kids_update" on public.game_kids for update to authenticated using (true);
