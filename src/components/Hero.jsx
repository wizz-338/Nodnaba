import { useState } from 'react'
import Logo from './Logo'
import { useScramble } from '../hooks'
import { glitchNow } from '../motion'

export default function Hero({ ready }) {
  const [reversed, setReversed] = useState(false)
  const word = useScramble(reversed ? 'ABANDON' : 'NODNABA', { duration: 650, enabled: ready })
  const tag = useScramble('A SPACE BETWEEN DREAM AND SIGNAL', { duration: 1400, enabled: ready })

  return (
    <section id="top" className={`hero ${ready ? 'hero--ready' : ''}`}>
      <div className="hero__inner">
        <p className="hero__meta mono">
          <span>SIGNAL / ∞.000</span>
          <span>VER. 0.1</span>
        </p>

        <div className="hero__mark">
          <Logo draw={ready} />
        </div>

        <h1 className="hero__title">
          <button
            className="glitch hero__word"
            data-text={word}
            onClick={() => {
              glitchNow(260)
              setReversed((v) => !v)
            }}
            aria-label="NODNABA"
          >
            {word || ' '}
          </button>
        </h1>
        <p className="hero__script" aria-hidden="true">Nodnaba</p>

        <p className="hero__tag mono">{tag}</p>
        <p className="hero__ko">
          네 개의 선, 미완의 별.
          <br />
          사선의 미완성.
        </p>
      </div>

      <a className="hero__scroll mono" href="#vision">
        <span>SCROLL TO DISTORT</span>
        <i aria-hidden="true" />
      </a>
    </section>
  )
}
