import { useCallback, useEffect, useState } from 'react'
import VoidCanvas from './components/VoidCanvas'
import Decor from './components/Decor'
import Boot from './components/Boot'
import Header from './components/Header'
import Hero from './components/Hero'
import Manifesto from './components/Manifesto'
import Marquee from './components/Marquee'
import Fragments from './components/Fragments'
import Dive from './components/Dive'
import Signal from './components/Signal'
import Footer from './components/Footer'
import { startMotion } from './motion'

export default function App() {
  const [booted, setBooted] = useState(false)
  const done = useCallback(() => setBooted(true), [])

  useEffect(() => startMotion(), [])

  return (
    <>
      <VoidCanvas />
      <Decor />
      <div className="fx" aria-hidden="true" />
      {!booted && <Boot onDone={done} />}
      <Header />
      <main>
        <Hero ready={booted} />
        <Marquee />
        <Manifesto />
        <Fragments />
        <Marquee reverse />
        <Dive />
        <Signal />
      </main>
      <Footer />
    </>
  )
}
