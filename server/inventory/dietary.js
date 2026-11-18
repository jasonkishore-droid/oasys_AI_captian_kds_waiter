// The dietary and allergen tags for the menu filters (F3). They are kept with the menu itself, in the
// Menu Card project (src/dietary.js), and matched to the till's dishes by name. The owner's sign-off,
// src/dietary-signoff.json, is re-read whenever it changes, so a new sign-off applies without a restart
// (edits to the draft tags in dietary.js need one).
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { InventoryError } from './store.js'

export function dietarySource(menuCardDir) {
  const file = join(menuCardDir, 'src', 'dietary.js')
  const signoffFile = join(menuCardDir, 'src', 'dietary-signoff.json')
  let mod = null
  let signoff = { mtime: -1, data: null }

  return {
    async load() {
      if (!mod) {
        if (!existsSync(file)) throw new InventoryError(503, `The dietary tags were not found at ${file}. Set MENU_CARD_DIR to the Menu Card folder.`)
        mod = await import(pathToFileURL(file).href)
      }
      const mtime = existsSync(signoffFile) ? statSync(signoffFile).mtimeMs : 0
      if (mtime !== signoff.mtime) {
        let data = null
        try {
          data = mtime ? JSON.parse(readFileSync(signoffFile, 'utf8')) : null
        } catch (e) {
          console.error('[dietary] could not read the sign-off file; treating every dish as unconfirmed:', e.message)
        }
        signoff = { mtime, data }
      }
      return { mod, signoff: signoff.data }
    },
  }
}
