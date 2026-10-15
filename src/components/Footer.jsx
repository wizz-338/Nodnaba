import Logo from './Logo'

export const X_URL = 'https://x.com/readevism'

export default function Footer() {
  return (
    <footer className="footer">
      <Logo className="footer__logo" />
      <p className="footer__name">NODNABA</p>
      <a className="footer__x mono" href={X_URL} target="_blank" rel="noopener noreferrer">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18.9 2H22l-6.8 7.8L23 22h-6.2l-4.8-6.3L6.4 22H3.3l7.3-8.3L1 2h6.3l4.4 5.8L18.9 2Zm-1.1 18.1h1.7L6.3 3.8H4.5l13.3 16.3Z" />
        </svg>
        @readevism
      </a>
      <p className="footer__copy mono">© {new Date().getFullYear()} NODNABA</p>
    </footer>
  )
}
