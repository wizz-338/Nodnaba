import Logo from './Logo'

export default function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="footer">
      <Logo className="footer__logo" />
      <p className="footer__name">NODNABA</p>
      <ul className="footer__links mono">
        <li><a href="#top">INSTAGRAM ↗</a></li>
        <li><a href="#top">X ↗</a></li>
        <li><a href="#signal">CONTACT ↗</a></li>
      </ul>
      <a className="footer__top mono" href="#top">↑ RETURN TO SURFACE</a>
      <p className="footer__copy mono">© {year} NODNABA — ALL REALITIES RESERVED.</p>
    </footer>
  )
}
