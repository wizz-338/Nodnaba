import Logo from './Logo'

export const YOUTUBE_URL = 'https://youtube.com/@zyo_musix'

export default function Footer() {
  return (
    <footer className="footer">
      <Logo className="footer__logo" />
      <p className="footer__name">NODNABA</p>
      <div className="footer__links">
        <a className="footer__x mono" href={YOUTUBE_URL} target="_blank" rel="noopener noreferrer" aria-label="YouTube @zyo_musix">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12 31 31 0 0 0 1 16.8a3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8ZM9.7 15.1V8.9l5.8 3.1-5.8 3.1Z" />
          </svg>
          @zyo_musix
        </a>
      </div>
      <p className="footer__copy mono">© {new Date().getFullYear()} NODNABA</p>
    </footer>
  )
}
