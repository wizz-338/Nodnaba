// Small building blocks shared by the PROJECT ZERO screens.

export const cx = (...a) => a.filter(Boolean).join(' ')

export function Btn({ kind = 'ghost', className, ...rest }) {
  return <button type="button" className={cx('pz-btn', `pz-btn--${kind}`, className)} {...rest} />
}

export function LinkBtn({ href, kind = 'ghost', className, testId, children }) {
  return (
    <a href={href} className={cx('pz-btn', `pz-btn--${kind}`, className)} data-testid={testId}>
      {children}
    </a>
  )
}

export function Panel({ className, testId, children }) {
  return (
    <section className={cx('pz-panel', className)} data-testid={testId}>
      {children}
    </section>
  )
}

export function Tag({ tone = 'muted', children }) {
  return <span className={cx('pz-tag', `pz-tag--${tone}`)}>{children}</span>
}

export function Bar({ value, total, label = '진행도' }) {
  const pct = total ? Math.round((value / total) * 100) : 0
  return (
    <div className="pz-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={value} aria-label={label}>
      <div className="pz-bar__fill" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Title({ children, aside }) {
  return (
    <div className="pz-title">
      <h2>{children}</h2>
      {aside}
    </div>
  )
}

const ICONS = {
  back: 'M15 18l-6-6 6-6',
  chevron: 'M9 6l6 6-6 6',
  lock: 'M7 11V8a5 5 0 0110 0v3M6 11h12v9H6z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  file: 'M7 3h7l5 5v13H7zM14 3v5h5',
  key: 'M14 10a4 4 0 11-4-4 4 4 0 014 4zm0 0h7m-3 0v3',
  note: 'M5 4h14v16H5zM8 9h8M8 13h8M8 17h5',
  case: 'M4 7h16v12H4zM9 7V5h6v2',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9V16h7v-2.1A6 6 0 0012 3z',
  zoomIn: 'M11 18a7 7 0 110-14 7 7 0 010 14zm9 2l-4-4M11 8v6M8 11h6',
  zoomOut: 'M11 18a7 7 0 110-14 7 7 0 010 14zm9 2l-4-4M8 11h6',
  alert: 'M12 4l9 16H3zM12 10v4M12 17h.01',
}

export function Icon({ name, className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={cx('pz-icon', className)} aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  )
}
