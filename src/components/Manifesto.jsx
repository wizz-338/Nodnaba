import { useReveal } from '../hooks'

const LINES = [
  ['ko', '네 개의 선이 하나의 별을 그리다 멈췄다.'],
  ['en', 'FOUR LINES. ONE STAR. NEVER CLOSED.'],
  ['ko', '완성되지 않은 것만이 계속 움직인다.'],
  ['en', 'ONLY THE UNFINISHED KEEPS MOVING.'],
  ['ko', '현실은 하나의 해상도일 뿐.'],
  ['en', 'REALITY IS JUST ONE RESOLUTION.'],
]

function Line({ lang, text, i }) {
  const ref = useReveal(0.4)
  return (
    <p ref={ref} className={`manifesto__line manifesto__line--${lang}`} style={{ '--dir': i % 2 ? 1 : -1, '--i': i }}>
      {lang === 'en' ? (
        <span className="glitch" data-text={text}>{text}</span>
      ) : (
        text
      )}
    </p>
  )
}

export default function Manifesto() {
  return (
    <section id="manifesto" className="section manifesto">
      <h2 className="label mono">
        <span>02</span> MANIFESTO
      </h2>
      {LINES.map(([lang, text], i) => (
        <Line key={i} lang={lang} text={text} i={i} />
      ))}
      <p className="manifesto__mirror mono" aria-label="NODNABA reversed is ABANDON">
        <span>N·O·D·N·A·B·A</span>
        <i aria-hidden="true">⟷</i>
        <span>A·B·A·N·D·O·N</span>
      </p>
    </section>
  )
}
