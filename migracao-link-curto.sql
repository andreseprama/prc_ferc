-- Link curto de partilha — colar no SQL Editor do Supabase e RUN
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
