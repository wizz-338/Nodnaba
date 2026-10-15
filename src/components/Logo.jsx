// NODNABA mark — four strokes, an unfinished star. One continuous ribbon
// that never closes: the last diagonal leaves the shape open.
export const LOGO_PATH =
  'M210 45 C520 260 900 620 1060 860 C1180 1040 1290 1230 1180 1240 ' +
  'C980 1240 520 960 90 760 C0 720 10 655 150 630 C400 585 800 600 1105 385 ' +
  'C1175 400 1185 470 1140 525 C960 820 620 1250 255 1430'

export default function Logo({ className = '', draw = false, glitch = true, title = 'NODNABA' }) {
  return (
    <svg
      className={`logo ${draw ? 'logo--draw' : ''} ${glitch ? 'logo--rgb' : ''} ${className}`}
      viewBox="-40 0 1408 1488"
      role="img"
      aria-label={title}
    >
      <g fill="none" strokeWidth="64" strokeLinejoin="round">
        {glitch && (
          <>
            <path className="logo__ch logo__ch--c" d={LOGO_PATH} pathLength="1" />
            <path className="logo__ch logo__ch--m" d={LOGO_PATH} pathLength="1" />
          </>
        )}
        <path className="logo__main" d={LOGO_PATH} pathLength="1" />
      </g>
    </svg>
  )
}
