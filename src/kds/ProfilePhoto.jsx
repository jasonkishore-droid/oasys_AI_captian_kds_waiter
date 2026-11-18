import { useRef, useState } from 'react'

const SIZE = 160 // pixels: small enough to send with every "On my way" (about 10 KB)

// Reads a picked or photographed image, crops it to a centred square and returns a small JPEG data URL.
function shrink(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight)
      const c = Object.assign(document.createElement('canvas'), { width: SIZE, height: SIZE })
      c.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, SIZE, SIZE)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', 0.72))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('That file is not a picture.'))
    }
    img.src = url
  })
}

// A round profile picture that doubles as the button to change it. `size` is the diameter in pixels.
export default function ProfilePhoto({ photo, onChange, size = 72, label = 'Profile picture' }) {
  const input = useRef(null)
  const [error, setError] = useState('')
  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // so picking the same file again still fires
    if (!file) return
    try {
      setError('')
      onChange(await shrink(file))
    } catch (err) {
      setError(err.message)
    }
  }
  return (
    <div className="pp">
      <button type="button" className="pp-btn" style={{ width: size, height: size }} onClick={() => input.current?.click()} aria-label={photo ? `Change ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`} title={photo ? 'Change picture' : 'Add a picture'}>
        {photo ? (
          <img src={photo} alt="" />
        ) : (
          <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
          </svg>
        )}
        <span className="pp-cam" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </span>
      </button>
      <input ref={input} type="file" accept="image/*" capture="user" hidden onChange={pick} />
      {error && (
        <p className="pp-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
