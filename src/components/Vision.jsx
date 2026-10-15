// A quiet stretch of scroll where the background illustration opens up and
// pans; only manga sound effects float over it.
export default function Vision() {
  return (
    <section id="vision" className="vision" aria-label="NODNABA">
      <div className="vision__stage">
        <div className="vision__burst" aria-hidden="true" />
        <span className="sfx sfx--a" aria-hidden="true">ザザッ</span>
        <span className="kata" aria-hidden="true">ノドナバ</span>
        <span className="sfx sfx--b" aria-hidden="true">ジジ…</span>
      </div>
    </section>
  )
}
