import GlitchImage from './GlitchImage'
import { useReveal } from '../hooks'
import portrait from '../assets/portrait.webp'
import closeup from '../assets/closeup.webp'
import banner from '../assets/banner.webp'

function Panel({ className, children }) {
  const ref = useReveal(0.25)
  return (
    <figure ref={ref} className={`panel ${className}`}>
      {children}
    </figure>
  )
}

export default function Manga() {
  return (
    <section id="vision" className="manga">
      <div className="manga__burst" aria-hidden="true" />
      <div className="manga__page">
        <Panel className="panel--tall">
          <GlitchImage src={portrait} alt="고양이 후드를 뒤집어쓴 NODNABA 캐릭터" position="50% 30%" />
          <span className="sfx sfx--a" aria-hidden="true">ザザッ</span>
        </Panel>
        <Panel className="panel--close">
          <GlitchImage src={closeup} alt="" position="40% 50%" />
          <span className="kata" aria-hidden="true">ノドナバ</span>
        </Panel>
        <Panel className="panel--wide">
          <GlitchImage src={banner} alt="NODNABA 로고와 캐릭터가 담긴 글리치 배너" />
          <span className="sfx sfx--b" aria-hidden="true">ジジ…</span>
        </Panel>
      </div>
    </section>
  )
}
