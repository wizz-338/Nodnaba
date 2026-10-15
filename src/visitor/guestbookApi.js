import { supabase } from '../lib/supabase'

export const PAGE_SIZE = 20
export const MAX_MESSAGE = 200
export const MAX_NICK = 20

// Server error codes raised by post_guestbook() → what visitors see.
const MESSAGES = {
  too_fast: '조금 천천히! 30초 뒤에 다시 남길 수 있어요.',
  hourly_limit: '한 시간에 다섯 번까지만 남길 수 있어요.',
  duplicate: '같은 내용의 글이 이미 있어요.',
  links_not_allowed: '링크는 남길 수 없어요.',
  spam_detected: '같은 글자를 너무 많이 반복했어요.',
  busy: '지금 글이 몰리고 있어요. 잠시 후 다시 시도해 주세요.',
  invalid_nickname: `닉네임은 1~${MAX_NICK}자로 적어 주세요.`,
  invalid_message: `메시지는 1~${MAX_MESSAGE}자로 적어 주세요.`,
}

export function errorText(err) {
  const raw = err?.message || ''
  const key = Object.keys(MESSAGES).find((k) => raw.includes(k))
  return key ? MESSAGES[key] : '신호가 끊겼어요. 잠시 후 다시 시도해 주세요.'
}

export async function fetchPage(page) {
  const from = page * PAGE_SIZE
  const { data, count, error } = await supabase
    .from('guestbook')
    .select('id, nickname, message, created_at', { count: 'exact' })
    .order('id', { ascending: false })
    .range(from, from + PAGE_SIZE - 1)
  if (error) throw error
  return { rows: data, total: count ?? 0 }
}

export async function postEntry(nickname, message) {
  const { data, error } = await supabase.rpc('post_guestbook', { p_nickname: nickname, p_message: message })
  if (error) throw error
  return data?.[0]
}

export async function deleteEntry(id) {
  const { error, count } = await supabase.from('guestbook').delete({ count: 'exact' }).eq('id', id)
  if (error) throw error
  if (!count) throw new Error('not_allowed')
}

export async function checkAdmin() {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return { user: null, isAdmin: false }
  const { data } = await supabase.from('guestbook_admins').select('user_id').eq('user_id', auth.user.id)
  return { user: auth.user, isAdmin: !!data?.length }
}
