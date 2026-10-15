import { supabase } from '../lib/supabase'

export const PAGE_SIZE = 20
export const MAX_MESSAGE = 200
export const MAX_NICK = 20

// Validation / anti-spam codes raised by post_guestbook() → what visitors see.
const RULES = {
  too_fast: '조금 천천히! 30초 뒤에 다시 남길 수 있어요.',
  hourly_limit: '한 시간에 다섯 번까지만 남길 수 있어요.',
  duplicate: '같은 내용의 글이 이미 있어요.',
  links_not_allowed: '링크는 남길 수 없어요.',
  spam_detected: '같은 글자를 너무 많이 반복했어요.',
  busy: '지금 글이 몰리고 있어요. 잠시 후 다시 시도해 주세요.',
  invalid_nickname: `닉네임은 1~${MAX_NICK}자로 적어 주세요.`,
  invalid_message: `메시지는 1~${MAX_MESSAGE}자로 적어 주세요.`,
}

// A failed request, with the real HTTP status and server error kept intact.
export class ApiError extends Error {
  constructor({ status = 0, code = '', message = '', hint = '', details = '' }) {
    super(message || 'request_failed')
    this.status = status
    this.code = code
    this.hint = hint
    this.details = details
  }

  // One line for the screen, e.g. "HTTP 401 · Invalid API key"
  get summary() {
    const head = this.status ? `HTTP ${this.status}` : 'NETWORK'
    return [head, this.code, this.message].filter(Boolean).join(' · ')
  }
}

function fail(res) {
  const e = res.error || {}
  const err = new ApiError({
    status: res.status,
    code: e.code,
    message: e.message || res.statusText,
    hint: e.hint,
    details: e.details,
  })
  console.error('[guestbook]', err.summary, e)
  return err
}

// Why a request failed, in plain words. Rule violations get their own text;
// configuration problems name the setting to check.
export function explain(err) {
  const raw = `${err?.message || ''}`
  const rule = Object.keys(RULES).find((k) => raw.includes(k))
  if (rule) return { text: RULES[rule], technical: false }

  const s = err?.status ?? 0
  const code = err?.code || ''
  let text = '신호가 끊겼어요. 잠시 후 다시 시도해 주세요.'
  if (s === 0) text = 'Supabase 서버에 닿지 못했어요. 네트워크 또는 SUPABASE_URL을 확인해 주세요.'
  else if (s === 401 || s === 403 || code === 'PGRST301' || code === '42501')
    text = '접근이 거부됐어요. API 키 또는 권한 설정을 확인해 주세요.'
  else if (s === 404 || code === 'PGRST202' || code === 'PGRST205' || code === '42P01' || code === '42883')
    text = '방명록 테이블이나 함수를 찾지 못했어요. guestbook.sql 실행과 Data API 설정을 확인해 주세요.'
  else if (code === 'PGRST106' || s === 406) text = 'public 스키마가 Data API에 노출되어 있지 않아요.'
  else if (s >= 500) text = 'Supabase 서버 오류예요. 프로젝트가 일시 정지됐는지 확인해 주세요.'
  return { text, technical: true }
}

async function run(builder) {
  try {
    return await builder
  } catch (e) {
    // fetch itself failed (offline, DNS, CORS)
    return { error: { message: e?.message || 'Failed to fetch' }, status: 0 }
  }
}

export async function fetchPage(page) {
  const from = page * PAGE_SIZE
  const res = await run(
    supabase
      .from('guestbook')
      .select('id, nickname, message, created_at', { count: 'exact' })
      .order('id', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
  )
  if (res.error) throw fail(res)
  return { rows: res.data ?? [], total: res.count ?? 0 }
}

export async function postEntry(nickname, message) {
  const res = await run(supabase.rpc('post_guestbook', { p_nickname: nickname, p_message: message }))
  if (res.error) throw fail(res)
  return res.data?.[0]
}

export async function deleteEntry(id) {
  const res = await run(supabase.from('guestbook').delete({ count: 'exact' }).eq('id', id))
  if (res.error) throw fail(res)
  if (!res.count) throw new ApiError({ status: res.status, message: 'not_allowed' })
}

export async function checkAdmin() {
  const { data: session } = await supabase.auth.getSession()
  if (!session?.session) return { user: null, isAdmin: false }
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return { user: null, isAdmin: false }
  const { data } = await supabase.from('guestbook_admins').select('user_id').eq('user_id', auth.user.id)
  return { user: auth.user, isAdmin: !!data?.length }
}

// Read-only health checks for #/visitor/check. Nothing here writes data:
// the function probe sends an empty nickname, which post_guestbook() rejects
// before touching the table.
export async function diagnose() {
  const read = await run(supabase.from('guestbook').select('id', { count: 'exact' }).limit(1))
  const probe = await run(supabase.rpc('post_guestbook', { p_nickname: '', p_message: 'diagnostic probe' }))
  const probeOk = probe.error && `${probe.error.message}`.includes('invalid_nickname')
  return {
    read: read.error ? { ok: false, err: fail(read) } : { ok: true, detail: `HTTP ${read.status} · ${read.count ?? 0}개` },
    rpc: probeOk
      ? { ok: true, detail: `HTTP ${probe.status} · 함수 실행 가능 (검증 거부 정상)` }
      : { ok: false, err: probe.error ? fail(probe) : new ApiError({ status: probe.status, message: 'probe_inserted?' }) },
  }
}
