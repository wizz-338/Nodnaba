-- PROJECT ZERO (#/project-zero) — schema only. Run once in Supabase: SQL Editor → New query → paste → Run.
-- Safe to re-run: every statement is idempotent.
--
-- This file holds NO case content and NO answers (this repository is public).
-- The content is loaded separately with the private seed file, which is never committed.
--
-- Security model (reviewed: see the notes at the end of this file)
--   * Only accounts listed in public.guestbook_admins (the existing site admins) can use PROJECT ZERO.
--   * pz_cases: admins read the case text (briefing, evidence, puzzles, hints). The epilogue column
--     is not granted: it is returned by pz_case_state() only once every puzzle is solved.
--   * pz_answer_keys (answers, wrong-answer feedback, clues): no grants, RLS on, no policies →
--     unreadable through the API. Only the security definer functions below read it,
--     after checking that the caller is an admin.
--   * Visitors (anon) get nothing from any pz_ table or function.
--   * Existing objects (guestbook, guestbook_admins, post_guestbook) are not altered;
--     guestbook_admins is only READ.

-- ── tables ────────────────────────────────────────────────────────────────

create table if not exists public.pz_cases (
  id          text primary key check (id ~ '^[0-9]{3}$'),
  code        text not null,
  title       text not null,
  sort        int  not null default 0,
  content     jsonb not null,                -- briefing, objectives, evidence, puzzles (no answers, no clues)
  epilogue    jsonb not null default '[]',   -- shown after the case is solved
  updated_at  timestamptz not null default now()
);

create table if not exists public.pz_answer_keys (
  case_id     text not null references public.pz_cases (id) on delete cascade,
  puzzle_id   text not null check (puzzle_id ~ '^P[0-9]{2}$'),
  kind        text not null check (kind in ('time', 'code', 'korean')),
  accepted    text[] not null,               -- normalized correct answers
  near        jsonb not null default '{}',   -- normalized common wrong answer → feedback text
  clue        text not null,                 -- revealed when solved
  primary key (case_id, puzzle_id)
);

-- graded answers: the player's solved state on the server and the rate limit (the typed text is not stored)
create table if not exists public.pz_attempts (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  case_id     text not null,
  puzzle_id   text not null,
  correct     boolean not null,
  created_at  timestamptz not null default now()
);
create index if not exists pz_attempts_user_idx on public.pz_attempts (user_id, case_id, created_at desc);

-- ── privileges ────────────────────────────────────────────────────────────

alter table public.pz_cases       enable row level security;
alter table public.pz_answer_keys enable row level security;
alter table public.pz_attempts    enable row level security;

revoke all on public.pz_cases       from anon, authenticated;
revoke all on public.pz_answer_keys from anon, authenticated;
revoke all on public.pz_attempts    from anon, authenticated;
-- Supabase's default privileges also grant new sequences to the API roles: take that back too
revoke all on sequence public.pz_attempts_id_seq from anon, authenticated;

-- cases: admins may read (not the epilogue column); nobody writes through the API
grant select (id, code, title, sort, content, updated_at) on public.pz_cases to authenticated;
drop policy if exists "pz_cases: admins can read" on public.pz_cases;
create policy "pz_cases: admins can read"
  on public.pz_cases for select
  to authenticated
  using (exists (select 1 from public.guestbook_admins a where a.user_id = auth.uid()));

-- answer keys and attempts: no grants, no policies (functions only)

-- ── helpers ───────────────────────────────────────────────────────────────

create or replace function public.pz_require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (select 1 from public.guestbook_admins a where a.user_id = v_uid) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

-- same rules as the game's v0.1.0 client normalizer
create or replace function public.pz_normalize(p_kind text, p_input text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v text := btrim(normalize(coalesce(p_input, ''), NFKC));
  m text[];
begin
  if v = '' then return jsonb_build_object('ok', false, 'message', '답을 입력하라.'); end if;
  if char_length(v) > 60 then return jsonb_build_object('ok', false, 'message', '입력이 너무 길다.'); end if;

  if p_kind = 'time' then
    v := regexp_replace(v, '\s+', '', 'g');
    m := regexp_match(v, '^(\d{1,2}):(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$');
    if m is null then
      return jsonb_build_object('ok', false, 'message', '형식이 맞지 않다. 시:분:초.밀리초 형식으로 입력하라.');
    end if;
    if m[4] is null then return jsonb_build_object('ok', false, 'message', '밀리초(.mmm)까지 입력하라.'); end if;
    if m[1]::int > 23 or m[2]::int > 59 or m[3]::int > 59 then
      return jsonb_build_object('ok', false, 'message', '존재할 수 없는 시각이다.');
    end if;
    return jsonb_build_object('ok', true, 'value',
      lpad(m[1]::int::text, 2, '0') || ':' || lpad(m[2]::int::text, 2, '0') || ':' ||
      lpad(m[3]::int::text, 2, '0') || '.' || rpad(m[4], 3, '0'));
  elsif p_kind = 'code' then
    v := regexp_replace(upper(v), '[\s_-]+', '', 'g');
    if v !~ '^[A-Z0-9]+$' then
      return jsonb_build_object('ok', false, 'message', '영문과 숫자로 된 식별자를 입력하라.');
    end if;
    return jsonb_build_object('ok', true, 'value', v);
  else
    v := regexp_replace(upper(v), '[\s_.,·:;''"‘’“”!?()\[\]-]+', '', 'g');
    if v = '' then return jsonb_build_object('ok', false, 'message', '답을 입력하라.'); end if;
    return jsonb_build_object('ok', true, 'value', v);
  end if;
end;
$$;

-- ── API: answer check ─────────────────────────────────────────────────────
-- {"status":"correct","clue":…} | {"status":"wrong","message"?:…} | {"status":"invalid","message":…}

create or replace function public.pz_verify_answer(p_case text, p_puzzle text, p_input text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := public.pz_require_admin();
  v_key  public.pz_answer_keys%rowtype;
  v_norm jsonb;
  v_ok   boolean;
begin
  select * into v_key from public.pz_answer_keys k where k.case_id = p_case and k.puzzle_id = p_puzzle;
  if not found then
    return jsonb_build_object('status', 'invalid', 'message', '알 수 없는 퍼즐이다.');
  end if;

  v_norm := public.pz_normalize(v_key.kind, p_input);
  if not (v_norm ->> 'ok')::boolean then
    return jsonb_build_object('status', 'invalid', 'message', v_norm ->> 'message');
  end if;

  -- at most 30 graded answers a minute per account
  if (select count(*) from public.pz_attempts t
      where t.user_id = v_uid and t.created_at > now() - interval '1 minute') >= 30 then
    raise exception 'too_fast' using errcode = 'P0001';
  end if;

  v_ok := (v_norm ->> 'value') = any (v_key.accepted);
  insert into public.pz_attempts (user_id, case_id, puzzle_id, correct) values (v_uid, p_case, p_puzzle, v_ok);

  if v_ok then return jsonb_build_object('status', 'correct', 'clue', v_key.clue); end if;
  return jsonb_strip_nulls(jsonb_build_object('status', 'wrong', 'message', v_key.near ->> (v_norm ->> 'value')));
end;
$$;

-- ── API: what this admin has solved (clues), and the epilogue once all are solved ─

create or replace function public.pz_case_state(p_case text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := public.pz_require_admin();
  v_solved jsonb;
  v_total  int;
begin
  select coalesce(jsonb_object_agg(k.puzzle_id, k.clue), '{}'::jsonb) into v_solved
  from public.pz_answer_keys k
  where k.case_id = p_case
    and exists (select 1 from public.pz_attempts t
                where t.user_id = v_uid and t.case_id = p_case and t.puzzle_id = k.puzzle_id and t.correct);

  select count(*) into v_total from public.pz_answer_keys k where k.case_id = p_case;

  return jsonb_build_object(
    'solved', v_solved,
    'epilogue', case when v_total > 0 and (select count(*) from jsonb_object_keys(v_solved)) = v_total
                     then (select c.epilogue from public.pz_cases c where c.id = p_case) end);
end;
$$;

-- ── API: start the case over (deletes only this admin's own attempts for it) ─

create or replace function public.pz_reset_case(p_case text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.pz_require_admin();
begin
  delete from public.pz_attempts t where t.user_id = v_uid and t.case_id = p_case;
end;
$$;

-- functions: nothing for anon; the API ones for signed-in users (they check admin themselves)
revoke all on function public.pz_require_admin()                    from public, anon, authenticated;
revoke all on function public.pz_normalize(text, text)               from public, anon, authenticated;
revoke all on function public.pz_verify_answer(text, text, text)     from public, anon;
revoke all on function public.pz_case_state(text)                    from public, anon;
revoke all on function public.pz_reset_case(text)                    from public, anon;
grant execute on function public.pz_verify_answer(text, text, text) to authenticated;
grant execute on function public.pz_case_state(text)                to authenticated;
grant execute on function public.pz_reset_case(text)                to authenticated;

-- ── review notes ──────────────────────────────────────────────────────────
-- * Supabase's default privileges grant every new public table, sequence and function to
--   anon/authenticated. Each pz_ object is therefore revoked from them explicitly above;
--   "revoke … from public" alone would not be enough.
-- * SECURITY DEFINER functions run with search_path = '' and name every table schema-first
--   (public.…, auth.uid()), so a caller cannot redirect them to look-alike objects.
-- * Admin = a row in public.guestbook_admins for auth.uid() (taken from the signed JWT).
--   Nobody can add themselves: the API roles have no INSERT on guestbook_admins.
-- * pz_answer_keys and pz_attempts have RLS on and no policy on purpose (only the functions
--   read them); Supabase's advisor lists that as "RLS enabled, no policy" — expected.
-- * Answers never leave the database. A clue is returned only for a puzzle this admin has
--   answered correctly; the epilogue only once every puzzle is solved. Graded answers are
--   limited to 30 a minute per account.
-- * The case text itself (evidence, hints) is readable by admins only, after sign-in.

-- ── removal (only if PROJECT ZERO should go; touches nothing else) ───────
-- drop function if exists public.pz_reset_case(text), public.pz_case_state(text),
--   public.pz_verify_answer(text, text, text), public.pz_normalize(text, text), public.pz_require_admin();
-- drop table if exists public.pz_attempts, public.pz_answer_keys, public.pz_cases;
