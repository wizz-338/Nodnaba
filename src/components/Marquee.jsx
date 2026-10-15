const WORDS = ['NODNABA', 'UNFINISHED STAR', '미완의 별', 'SOFT GLITCH', 'DREAM.EXE', '사선의 미완성']

export default function Marquee({ reverse = false }) {
  const row = [...WORDS, ...WORDS]
  return (
    <div className={`marquee ${reverse ? 'marquee--rev' : ''}`} aria-hidden="true">
      <div className="marquee__track">
        {row.map((w, i) => (
          <span key={i}>
            {w}
            <b>✦</b>
          </span>
        ))}
      </div>
    </div>
  )
}
