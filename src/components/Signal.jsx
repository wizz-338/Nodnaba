import { useState } from 'react'
import { useScramble } from '../hooks'
import { glitchNow } from '../motion'

export default function Signal() {
  const [sent, setSent] = useState(false)
  const msg = useScramble(sent ? 'SIGNAL RECEIVED ✦' : 'SEND A SIGNAL', { duration: 600 })

  return (
    <section id="signal" className="section signal">
      <h2 className="label mono">
        <span>05</span> SIGNAL
      </h2>
      <p className="signal__title">
        다음 조각이 열릴 때
        <br />
        가장 먼저 신호를 받으세요.
      </p>
      <form
        className="signal__form"
        onSubmit={(e) => {
          e.preventDefault()
          glitchNow(300)
          setSent(true)
        }}
      >
        <label className="mono" htmlFor="email">
          YOUR FREQUENCY
        </label>
        <input id="email" type="email" required placeholder="you@somewhere.space" autoComplete="email" disabled={sent} />
        <button type="submit" className="btn mono" disabled={sent}>
          {msg}
        </button>
      </form>
    </section>
  )
}
