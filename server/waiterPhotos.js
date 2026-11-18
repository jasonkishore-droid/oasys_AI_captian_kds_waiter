// The waiters' profile pictures, saved as files in The Captian's assets/waiters folder and served at
// /assets/waiters/<file>. A waiter's screen sends a small image once (when they set or change it) and keeps the
// returned path; "On my way" then sends only that short path, not the image.
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PHOTO_DIR = fileURLToPath(new URL('../assets/waiters/', import.meta.url))
export const PHOTO_URL_PREFIX = '/assets/waiters/'
export const PHOTO_MAX = 60_000 // characters of data URL: a 160px JPEG is about 10,000
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
// the only file names ever read or written: a name, a hash of the picture and an extension (no folders, no dots but one)
export const PHOTO_FILE = /^[a-z0-9-]{1,40}-[0-9a-f]{8}\.(jpg|png|webp)$/

class PhotoError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

// { name, photo: 'data:image/jpeg;base64,...' } -> { url: '/assets/waiters/ravi-1a2b3c4d.jpg' }
// The file name is the waiter's name plus a hash of the picture, so a new picture gets a new URL (no stale caches)
// and the same picture saved twice is one file.
export function savePhoto({ name, photo }) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(photo || ''))
  if (!m) throw new PhotoError(400, 'photo: must be a jpeg, png or webp data URL')
  if (String(photo).length > PHOTO_MAX) throw new PhotoError(400, `photo: too large (at most ${PHOTO_MAX} characters)`)
  const bytes = Buffer.from(m[2], 'base64')
  const slug = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'waiter'
  const file = `${slug}-${createHash('sha256').update(bytes).digest('hex').slice(0, 8)}.${EXT[m[1]]}`
  mkdirSync(PHOTO_DIR, { recursive: true })
  writeFileSync(join(PHOTO_DIR, file), bytes)
  return { url: PHOTO_URL_PREFIX + file }
}

// the file for GET /assets/waiters/<file>, or null
export function readPhoto(file) {
  if (!PHOTO_FILE.test(file)) return null
  const path = join(PHOTO_DIR, file)
  if (!existsSync(path)) return null
  return { bytes: readFileSync(path), type: MIME[file.split('.').pop()] }
}
