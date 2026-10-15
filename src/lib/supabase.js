import { createClient } from '@supabase/supabase-js'

// Both values are public by design: the anon/publishable key only grants what
// the row-level security rules in supabase/guestbook.sql allow. A secret or
// service_role key must never reach the browser, so we refuse to use one.
const url = (import.meta.env.VITE_SUPABASE_URL || '').trim()
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

function decodeJwt(token) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '=')))
  } catch {
    return null
  }
}

// What kind of key was configured, and does it belong to the configured project?
export function inspectConfig() {
  let host = ''
  let ref = ''
  try {
    host = new URL(url).host
    ref = host.endsWith('.supabase.co') ? host.split('.')[0] : ''
  } catch {
    /* invalid URL */
  }

  let keyType = 'missing'
  let keyRef = ''
  if (key.startsWith('sb_publishable_')) keyType = 'publishable'
  else if (key.startsWith('sb_secret_')) keyType = 'secret'
  else if (key.split('.').length === 3) {
    const claims = decodeJwt(key)
    keyRef = claims?.ref || ''
    keyType = claims?.role === 'anon' ? 'anon' : claims?.role === 'service_role' ? 'service_role' : 'unknown-jwt'
  } else if (key) keyType = 'unknown'

  const problems = []
  if (!url) problems.push('url_missing')
  else if (!host) problems.push('url_invalid')
  else if (/\/(rest|auth)\/v1|\/project\//.test(url)) problems.push('url_not_base')
  if (!key) problems.push('key_missing')
  if (keyType === 'secret' || keyType === 'service_role') problems.push('key_secret')
  if (keyType === 'unknown' || keyType === 'unknown-jwt') problems.push('key_unknown')
  if (keyRef && ref && keyRef !== ref) problems.push('key_other_project')

  return { url, host, ref, keyType, keyRef, keyPreview: key ? `${key.slice(0, 14)}…` : '', problems }
}

export const config = inspectConfig()

const fatal = config.problems.some((p) => ['url_missing', 'url_invalid', 'key_missing', 'key_secret'].includes(p))

// Always talk to the project origin, even if a path was pasted into the URL.
export const supabase = fatal ? null : createClient(new URL(config.url).origin, key)
