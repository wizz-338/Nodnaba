// PROJECT ZERO ↔ Supabase. The case text, answers, clues and epilogue live only in
// Supabase (supabase/project-zero.sql + a private seed that is never committed).
// Nothing here holds case content: without an admin session the page gets nothing.

import { supabase } from '../lib/supabase'

export const CASE_ID = '001'

/** A failure with a kind the screens can act on. */
export class PzError extends Error {
  constructor(kind, detail = '') {
    super(kind)
    this.kind = kind // 'unconfigured' | 'not_ready' | 'denied' | 'signed_out' | 'too_fast' | 'network' | 'server'
    this.detail = detail
  }
}

function classify(res) {
  const e = res?.error || {}
  const code = e.code || ''
  const status = res?.status ?? 0
  const msg = `${e.message || ''}`
  if (msg.includes('not_allowed') || code === '42501' || status === 401 || status === 403) return new PzError('denied', msg)
  if (msg.includes('too_fast')) return new PzError('too_fast', msg)
  // table or function missing: the SQL has not been run yet
  if (status === 404 || ['PGRST202', 'PGRST205', '42P01', '42883'].includes(code)) return new PzError('not_ready', code || msg)
  if (status === 0) return new PzError('network', msg)
  return new PzError('server', [status, code, msg].filter(Boolean).join(' · '))
}

async function run(builder) {
  try {
    return await builder
  } catch (e) {
    return { error: { message: e?.message || 'Failed to fetch' }, status: 0 }
  }
}

function need() {
  if (!supabase) throw new PzError('unconfigured')
  return supabase
}

/** { user, isAdmin } — the same check as the guestbook's admin login (guestbook_admins). */
export async function getAdmin() {
  const sb = need()
  const { data: session } = await sb.auth.getSession()
  if (!session?.session) return { user: null, isAdmin: false }
  const { data: auth } = await sb.auth.getUser()
  if (!auth?.user) return { user: null, isAdmin: false }
  const res = await run(sb.from('guestbook_admins').select('user_id').eq('user_id', auth.user.id))
  if (res.error) throw classify(res)
  return { user: auth.user, isAdmin: !!res.data?.length }
}

export async function signIn(email, password) {
  const { error } = await need().auth.signInWithPassword({ email, password })
  if (error) throw new PzError('signed_out', error.message)
}

export async function signOut() {
  await need().auth.signOut()
}

// ── case content ─────────────────────────────────────────────

const isStr = (v) => typeof v === 'string'
const isStrArr = (v) => Array.isArray(v) && v.every(isStr)

/** The case as the screens use it, or null if the stored JSON is not what we expect. */
export function shapeCase(row) {
  const c = row?.content
  if (!row || !isStr(row.id) || !c || typeof c !== 'object') return null
  if (!Array.isArray(c.evidence) || !Array.isArray(c.puzzles) || !isStrArr(c.briefing) || !isStrArr(c.objectives)) return null
  const evidence = c.evidence.filter((e) => e && isStr(e.id) && isStr(e.title) && Array.isArray(e.blocks))
  const puzzles = c.puzzles
    .filter((p) => p && isStr(p.id) && Number.isFinite(p.order) && isStrArr(p.hints) && isStrArr(p.evidenceIds))
    .sort((a, b) => a.order - b.order)
  if (evidence.length !== c.evidence.length || puzzles.length !== c.puzzles.length || !puzzles.length) return null
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    intro: isStrArr(c.intro) ? c.intro : [],
    tagline: isStr(c.tagline) ? c.tagline : '',
    briefing: c.briefing,
    objectives: c.objectives,
    evidence,
    puzzles,
    next: c.next && isStr(c.next.title) ? c.next : null,
  }
}

/** Every case this admin may read (RLS returns none to anyone else). */
export async function loadCases() {
  const res = await run(need().from('pz_cases').select('id, code, title, sort, content').order('sort', { ascending: true }))
  if (res.error) throw classify(res)
  const cases = (res.data ?? []).map(shapeCase)
  if (!cases.length) throw new PzError('not_ready', 'no_cases')
  if (cases.some((c) => !c)) throw new PzError('server', 'case_shape')
  return cases
}

/** { solved: { P01: clue, … }, epilogue: [..] | null } from the server. */
export async function loadState(caseId) {
  const res = await run(need().rpc('pz_case_state', { p_case: caseId }))
  if (res.error) throw classify(res)
  const d = res.data || {}
  return {
    solved: d.solved && typeof d.solved === 'object' ? d.solved : {},
    epilogue: isStrArr(d.epilogue) ? d.epilogue : null,
  }
}

/** { status: 'correct', clue } | { status: 'wrong', message? } | { status: 'invalid', message } — checked on the server. */
export async function verifyAnswer(caseId, puzzleId, input) {
  const res = await run(need().rpc('pz_verify_answer', { p_case: caseId, p_puzzle: puzzleId, p_input: input }))
  if (res.error) throw classify(res)
  const d = res.data || {}
  if (d.status === 'correct') return { status: 'correct', clue: isStr(d.clue) ? d.clue : '' }
  if (d.status === 'invalid') return { status: 'invalid', message: isStr(d.message) ? d.message : '형식을 확인하라.' }
  return { status: 'wrong', message: isStr(d.message) ? d.message : undefined }
}

export async function resetCase(caseId) {
  const res = await run(need().rpc('pz_reset_case', { p_case: caseId }))
  if (res.error) throw classify(res)
}
