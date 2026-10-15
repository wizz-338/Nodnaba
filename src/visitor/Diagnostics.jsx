import { useEffect, useState } from 'react'
import { config, supabase } from '../lib/supabase'
import { diagnose, explain } from './guestbookApi'
import { Window } from './Guestbook'

const KEY_LABEL = {
  publishable: 'publishable 키 (공개용, 정상)',
  anon: 'anon 키 (공개용, 정상)',
  secret: 'secret 키 (비밀 키, 사용 금지!)',
  service_role: 'service_role 키 (비밀 키, 사용 금지!)',
  'unknown-jwt': '알 수 없는 JWT',
  unknown: '알 수 없는 형식',
  missing: '없음',
}

const PROBLEM_TEXT = {
  url_missing: 'SUPABASE_URL이 비어 있어요.',
  url_invalid: 'SUPABASE_URL이 올바른 주소가 아니에요.',
  url_not_base: 'SUPABASE_URL에 경로가 붙어 있어요. https://<ref>.supabase.co 형태만 넣어 주세요. (자동 보정 중)',
  key_missing: 'SUPABASE_ANON_KEY가 비어 있어요.',
  key_secret: '비밀 키가 설정돼 있어요. 브라우저에 노출되면 안 되는 키라 연결을 막았어요.',
  key_unknown: '키 형식을 알아볼 수 없어요. anon 또는 publishable 키를 그대로 복사해 주세요.',
  key_other_project: 'API 키가 SUPABASE_URL과 다른 프로젝트의 키예요.',
}

function Row({ label, ok, children }) {
  return (
    <li className={`diag__row ${ok === true ? 'is-ok' : ok === false ? 'is-bad' : ''}`}>
      <span className="diag__mark">{ok === true ? 'OK' : ok === false ? 'NG' : '··'}</span>
      <span className="diag__label">{label}</span>
      <span className="diag__val">{children}</span>
    </li>
  )
}

// #/visitor/check — read-only self test against the configured project.
export default function Diagnostics() {
  const [res, setRes] = useState(null)

  useEffect(() => {
    if (supabase) diagnose().then(setRes)
  }, [])

  const keyOk = ['publishable', 'anon'].includes(config.keyType)
  return (
    <Window title="SYSTEM CHECK" className="diag">
      <ul className="diag__list">
        <Row label="프로젝트 URL" ok={!!config.host && !config.problems.includes('url_invalid')}>
          {config.host || '(없음)'}
        </Row>
        <Row label="API 키 종류" ok={keyOk}>
          {KEY_LABEL[config.keyType]} {config.keyPreview && <code>{config.keyPreview}</code>}
        </Row>
        {config.keyRef && config.ref && (
          <Row label="키의 프로젝트" ok={config.keyRef === config.ref}>
            {config.keyRef} {config.keyRef === config.ref ? '= URL과 일치' : `≠ URL(${config.ref})`}
          </Row>
        )}
        <Row label="목록 읽기" ok={res ? res.read.ok : undefined}>
          {!supabase ? '연결 안 됨' : !res ? '확인 중…' : res.read.ok ? res.read.detail : <ErrLine err={res.read.err} />}
        </Row>
        <Row label="글쓰기 함수" ok={res ? res.rpc.ok : undefined}>
          {!supabase ? '연결 안 됨' : !res ? '확인 중…' : res.rpc.ok ? res.rpc.detail : <ErrLine err={res.rpc.err} />}
        </Row>
      </ul>
      {config.problems.length > 0 && (
        <ul className="diag__problems">
          {config.problems.map((p) => (
            <li key={p}>{PROBLEM_TEXT[p]}</li>
          ))}
        </ul>
      )}
      <p className="diag__note">이 검사는 데이터를 쓰거나 지우지 않아요.</p>
    </Window>
  )
}

function ErrLine({ err }) {
  return (
    <>
      {explain(err).text}
      <code className="px-detail">{err.summary}</code>
    </>
  )
}
