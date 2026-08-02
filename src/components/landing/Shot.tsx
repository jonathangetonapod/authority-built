import { useState } from 'react'

interface ShotProps {
  src: string
  alt: string
  /** Names the file that belongs here, shown until it is dropped in. */
  placeholder: string
  ratio: string
}

/**
 * A product screenshot in its frame.
 *
 * The images live in `public/shots/`. Until one is there the frame names the
 * file that belongs in it rather than showing a broken-image icon — the page
 * ships either way, and a missing screenshot stays obvious to us and quiet to
 * a visitor.
 */
export const Shot = ({ src, alt, placeholder, ratio }: ShotProps) => {
  const [missing, setMissing] = useState(false)
  return (
    <div className="gp-shot" style={{ aspectRatio: ratio }}>
      {missing
        ? <div className="gp-shot-empty" aria-hidden="true">{placeholder}</div>
        : <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setMissing(true)} />}
    </div>
  )
}

/** The fake browser bar the screenshots sit under. */
export const Chrome = ({ url }: { url: string }) => (
  <div className="gp-chrome" aria-hidden="true">
    <b /><b /><b /><span>{url}</span>
  </div>
)
