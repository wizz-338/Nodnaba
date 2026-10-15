-- NODNABA guestbook — run once in Supabase: SQL Editor → New query → paste → Run.
-- Safe to re-run: every statement is idempotent.
--
-- Security model
--   * Visitors (anon key) can READ entries and POST through post_guestbook() only.
--   * Nobody but listed admins can DELETE. Nobody can UPDATE.
--   * The hashed IP used for rate limiting is never readable through the API.

-- ── tables ────────────────────────────────────────────────────────────────

create table if not exists public.guestbook (
  id          bigint generated always as identity primary key,
  nickname    text not null check (char_length(nickname) between 1 and 20),
  message     text not null check (char_length(message) between 1 and 200),
  created_at  timestamptz not null default now(),
  ip_hash     text
);

create index if not exists guestbook_created_idx on public.guestbook (created_at desc);
create index if not exists guestbook_ip_idx on public.guestbook (ip_hash, created_at desc);

create table if not exists public.guestbook_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- ── privileges ────────────────────────────────────────────────────────────

alter table public.guestbook enable row level security;
alter table public.guestbook_admins enable row level security;

revoke all on public.guestbook from anon, authenticated;
grant select (id, nickname, message, created_at) on public.guestbook to anon, authenticated;
grant delete on public.guestbook to authenticated;

revoke all on public.guestbook_admins from anon, authenticated;
grant select on public.guestbook_admins to authenticated;

drop policy if exists "guestbook: everyone can read" on public.guestbook;
create policy "guestbook: everyone can read"
  on public.guestbook for select
  to anon, authenticated
  using (true);

drop policy if exists "guestbook: admins can delete" on public.guestbook;
create policy "guestbook: admins can delete"
  on public.guestbook for delete
  to authenticated
  using (exists (select 1 from public.guestbook_admins a where a.user_id = auth.uid()));

drop policy if exists "admins: see own row" on public.guestbook_admins;
create policy "admins: see own row"
  on public.guestbook_admins for select
  to authenticated
  using (user_id = auth.uid());

-- ── posting (validation + anti-spam) ─────────────────────────────────────

create or replace function public.post_guestbook(p_nickname text, p_message text)
returns table (id bigint, nickname text, message text, created_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_nick    text;
  v_msg     text;
  v_headers json;
  v_ip      text;
  v_hash    text;
begin
  -- strip control characters (keep line breaks in the message), trim
  v_nick := btrim(regexp_replace(coalesce(p_nickname, ''), '[[:cntrl:]]', '', 'g'));
  v_msg  := regexp_replace(coalesce(p_message, ''), E'\\r\\n?', E'\n', 'g');
  v_msg  := regexp_replace(v_msg, E'[\\x01-\\x09\\x0B-\\x1F\\x7F]', '', 'g');
  v_msg  := btrim(regexp_replace(v_msg, E'\n{3,}', E'\n\n', 'g'), E' \n\t');

  if char_length(v_nick) not between 1 and 20 then
    raise exception 'invalid_nickname' using errcode = '22023';
  end if;
  if char_length(v_msg) not between 1 and 200 then
    raise exception 'invalid_message' using errcode = '22023';
  end if;
  if v_msg ~* '(https?://|www\.|[a-z0-9-]+\.(com|net|org|io|xyz|ru|cn|kr|me|ly|gg|site|link|top|shop)(\M|/))'
     or v_nick ~* '(https?://|www\.)' then
    raise exception 'links_not_allowed' using errcode = '22023';
  end if;
  if v_msg ~ '(.)\1{14,}' then
    raise exception 'spam_detected' using errcode = '22023';
  end if;

  -- identify the sender by a hash of their IP (never stored in clear)
  v_headers := nullif(current_setting('request.headers', true), '')::json;
  v_ip := coalesce(
    v_headers ->> 'cf-connecting-ip',
    v_headers ->> 'x-real-ip',
    nullif(btrim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), ''),
    'unknown'
  );
  v_hash := encode(sha256(convert_to('nodnaba-guestbook:' || v_ip, 'UTF8')), 'hex');

  -- serialise posts from the same sender so the limits below can't be raced
  perform pg_advisory_xact_lock(hashtextextended(v_hash, 0));

  if exists (select 1 from public.guestbook g
             where g.ip_hash = v_hash and g.created_at > now() - interval '30 seconds') then
    raise exception 'too_fast' using errcode = 'P0001';
  end if;
  if (select count(*) from public.guestbook g
      where g.ip_hash = v_hash and g.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'hourly_limit' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.guestbook g
             where g.message = v_msg and g.created_at > now() - interval '1 day') then
    raise exception 'duplicate' using errcode = 'P0001';
  end if;
  if (select count(*) from public.guestbook g
      where g.created_at > now() - interval '1 minute') >= 20 then
    raise exception 'busy' using errcode = 'P0001';
  end if;

  return query
    insert into public.guestbook as g (nickname, message, ip_hash)
    values (v_nick, v_msg, v_hash)
    returning g.id, g.nickname, g.message, g.created_at;
end;
$$;

revoke all on function public.post_guestbook(text, text) from public;
grant execute on function public.post_guestbook(text, text) to anon, authenticated;
