// Settings for the inventory (ordering) backend.
//
// The bills Greeny places go into the same database as the Stock Management till, so the
// settings that shape a bill (bill prefix, GST rate, timezone, negative stock) must match the
// till's. They are read from Stock Management's server/.env, and anything set in this app's
// .env wins. INVENTORY_DIR points at that server folder if it is not the sibling project.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..') // The Captain's folder

// a small .env reader: KEY=value lines, # comments, optional quotes
function readEnvFile(file) {
  const out = {}
  if (!existsSync(file)) return out
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = raw.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    let v = m[2]
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1)
    else v = v.replace(/\s+#.*$/, '')
    out[m[1]] = v
  }
  return out
}

const num = (v, def) => (v === undefined || v === '' ? def : Number(v))
const bool = (v, def) => (v === undefined || v === '' ? def : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()))

export function inventoryConfig(appEnv = {}) {
  const dir = resolve(ROOT, appEnv.INVENTORY_DIR || '../Stock Management/server')
  const shared = readEnvFile(join(dir, '.env'))
  const env = { ...shared, ...Object.fromEntries(Object.entries(appEnv).filter(([, v]) => v !== undefined && v !== '')) }
  const sqlite = appEnv.INVENTORY_DB || shared.SQLITE_FILE || './db/vasamo.sqlite3'
  return {
    dir,
    // open tabs (dining sessions) are kept in this app's own database
    tabsFile: resolve(ROOT, appEnv.TABS_DB || './data/tabs.sqlite3'),
    // the Menu Card project: its dietary tags and the owner's sign-off drive the menu's dietary filters
    menuCardDir: resolve(ROOT, appEnv.MENU_CARD_DIR || '../Menue Card'),
    dbFile: isAbsolute(sqlite) ? sqlite : resolve(appEnv.INVENTORY_DB ? ROOT : dir, sqlite),
    timezone: env.TIMEZONE || 'Asia/Kolkata',
    restaurant: {
      name: env.RESTAURANT_NAME || 'Oasys Restaurant',
      tagline: env.RESTAURANT_TAGLINE || 'South Indian Kitchen',
      address: env.RESTAURANT_ADDRESS || 'Chennai, Tamil Nadu',
      gstin: env.GSTIN || '',
    },
    billing: {
      prefix: env.BILL_PREFIX || 'VAS',
      taxRate: num(env.GST_RATE, 5),
      allowNegativeStock: bool(env.ALLOW_NEGATIVE_STOCK, true),
      serviceRate: num(env.ORDER_SERVICE_RATE, 0),
    },
    email: {
      resendKey: env.RESEND_API_KEY || '',
      from: env.EMAIL_FROM || 'Oasys Restaurant <onboarding@resend.dev>',
      replyTo: env.EMAIL_REPLY_TO || '',
    },
  }
}
