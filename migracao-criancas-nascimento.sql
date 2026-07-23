-- Data de nascimento das crianças do camarote — colar no SQL Editor e RUN
alter table public.game_kids add column if not exists birthdate date;
