import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import VoidCanvas from './components/VoidCanvas'
import Decor from './components/Decor'
import Boot from './components/Boot'
import Header from './components/Header'
import Hero from './components/Hero'
import Vision from './components/Vision'
import Footer from './components/Footer'
import PageTransition from './components/PageTransition'
import { startMotion, glitchNow } from './motion'
import { useRoute } from './route'

const VisitorPage = lazy(() => import('./visitor/VisitorPage'))
const GamePage = lazy(() => import('./game/GamePage'))

const SWAP_MS = 420
const END_MS = 900

function MainPage({ ready }) {
  return (
    <>
      <VoidCanvas />
      <Decor />
      <main>
        <Hero ready={ready} />
        <Vision />
      </main>
      <Footer />
    </>
  )
}

export default function App() {
  const route = useRoute()
  const [shown, setShown] = useState(route)
  const [warping, setWarping] = useState(false)
  const [booted, setBooted] = useState(route.page !== 'main')
  const done = useCallback(() => setBooted(true), [])
  const timers = useRef([])
  // where EXIT in the game goes back to
  const exitTo = useRef('#/')

  useEffect(() => startMotion(), [])

  // swap pages behind the pixel curtain
  useEffect(() => {
    if (route.page !== 'game') exitTo.current = location.hash || '#/'
    if (route.page === shown.page) {
      setShown(route)
      if (location.hash === '#/') scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    timers.current.forEach(clearTimeout)
    setWarping(true)
    glitchNow(SWAP_MS)
    timers.current = [
      setTimeout(() => {
        setShown(route)
        scrollTo(0, 0)
      }, SWAP_MS),
      setTimeout(() => setWarping(false), END_MS),
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  return (
    <>
      {shown.page !== 'game' && <div className="fx" aria-hidden="true" />}
      {!booted && <Boot onDone={done} />}
      {shown.page !== 'game' && <Header page={shown.page} />}
      {shown.page === 'main' ? (
        <MainPage ready={booted} />
      ) : (
        <Suspense fallback={<p className="route-loading mono">LOADING…</p>}>
          {shown.page === 'game' ? <GamePage exitHref={exitTo.current} /> : <VisitorPage admin={shown.admin} />}
        </Suspense>
      )}
      <PageTransition active={warping} />
    </>
  )
}
