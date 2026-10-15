// An image that tears into shifted, off-colour slices during glitch bursts,
// with a manga screentone layered on top.
export default function GlitchImage({ src, alt = '', position = '50% 50%', className = '' }) {
  return (
    <div className={`gimg ${className}`} style={{ '--src': `url(${src})`, '--pos': position }}>
      <img src={src} alt={alt} loading="lazy" decoding="async" style={{ objectPosition: position }} />
      <span className="gimg__slice gimg__slice--1" aria-hidden="true" />
      <span className="gimg__slice gimg__slice--2" aria-hidden="true" />
      <span className="gimg__slice gimg__slice--3" aria-hidden="true" />
      <span className="gimg__tone" aria-hidden="true" />
    </div>
  )
}
