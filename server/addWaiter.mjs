// Add a waiter account, or change a waiter's password and profile (same username):
//   node server/addWaiter.mjs <username> <password> "<Name>" [Mr.|Mrs.|Ms.]
//   npm run waiter:add -- ravi secret123 "Ravi" Mr.
// The account goes into the tabs database (data/tabs.sqlite3 unless TABS_DB says otherwise).
import { inventoryConfig } from './inventory/config.js'
import { openTabs } from './inventory/tabs.js'
import { addWaiter } from './inventory/waiters.js'

const [username, password, name, prefix = ''] = process.argv.slice(2)
if (!username || !password) {
  console.error('Usage: node server/addWaiter.mjs <username> <password> "<Name>" [Mr.|Mrs.|Ms.]')
  process.exit(1)
}
const tabs = openTabs(inventoryConfig(process.env).tabsFile)
try {
  const w = addWaiter(tabs, { username, password, name, prefix })
  console.log(`Saved waiter ${w.username} (${[w.prefix, w.name].filter(Boolean).join(' ')})`)
} catch (e) {
  console.error(e.message)
  process.exitCode = 1
} finally {
  tabs.shutdown()
}
