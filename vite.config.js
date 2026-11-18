// The Kitchen Display and the Waiter screen as one app on one port.
//   /kds     the Kitchen Display        /waiter   the Waiter screen        /   goes to the kitchen screen
//   /api/oasys/*   the ordering API (orders, tabs, kitchen stages, waiter calls, waiter accounts)
// `npm run dev` for development, `npm start` builds and serves it (what a host such as Railway or Render runs).
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { oasysRoutes } from './server/oasysApi.js'

function staff(env) {
  const attach = (server) => {
    // pretty addresses for the two pages (the files are kds.html and waiter.html)
    server.middlewares.use((req, _res, next) => {
      const [path, query] = (req.url || '').split('?')
      const to = path === '/' || path === '/index.html' || path === '/kds' ? '/kds.html' : path === '/waiter' ? '/waiter.html' : null
      if (to) req.url = query ? `${to}?${query}` : to
      next()
    })
    server.middlewares.use(oasysRoutes(env))
  }
  return { name: 'staff-screens', configureServer: attach, configurePreviewServer: attach }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // hosts such as Railway and Render give the port in PORT
  const port = Number(process.env.PORT || env.PORT || env.STAFF_PORT) || 5182
  return {
    plugins: [react(), staff(env)],
    publicDir: false,
    optimizeDeps: { include: ['react', 'react-dom', 'react-dom/client'] },
    server: { port, strictPort: true },
    // `npm start` serves the build on all addresses and answers to any host name (the host's own address)
    preview: { port, strictPort: true, host: true, allowedHosts: true },
    build: { outDir: 'dist', emptyOutDir: true, rollupOptions: { input: { kds: 'kds.html', waiter: 'waiter.html' } } },
  }
})
