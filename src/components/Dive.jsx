import Logo from './Logo'

const FRAMES = 12

export default function Dive() {
  return (
    <section id="dive" className="dive">
      <div className="dive__space" aria-hidden="true">
        {Array.from({ length: FRAMES }, (_, i) => (
          <span key={i} className={`dive__frame ${i % 3 === 0 ? 'dive__frame--chk' : ''}`} style={{ '--i': i }} />
        ))}
        <div className="dive__core">
          <Logo />
        </div>
      </div>
      <div className="dive__text">
        <h2 className="label mono">
          <span>04</span> DIVE
        </h2>
        <p className="glitch dive__title" data-text="DIVE INTO THE UNFINISHED">
          DIVE INTO THE UNFINISHED
        </p>
        <p className="dive__ko">닫히지 않은 별의 안쪽으로.</p>
      </div>
    </section>
  )
}
