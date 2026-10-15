import { useCallback, useEffect, useState } from 'react'
import VoidCanvas from './components/VoidCanvas'
import Decor from './components/Decor'
import Boot from './components/Boot'
import Header from './components/Header'
import Hero from './components/Hero'
import Vision from './components/Vision'
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
        <Vision />
      </main>
      <Footer />
    </>
  )
}
