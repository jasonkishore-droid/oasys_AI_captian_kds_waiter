# Oasys AI Captain: Kitchen Display and Waiter screen

The two staff screens of the Oasys Restaurant AI Captain, as one app on one port.

| Address | What it is |
|---|---|
| `/kds` (also `/`) | **Kitchen Display**: live tickets from every table. Move each through New, Preparing, Ready, On the way, Served. Preparing takes the recipe ingredients off the stock shelf. |
| `/waiter` | **Waiter screen**: calls from tables (On my way, On table, Done, or hand back with "Sorry, can't attend") and ready orders to collect and serve. A waiter's name and picture show on the guest's tablet. |
| `/api/oasys/*` | The ordering API both screens (and the guest tablet) use. |

## Run

```
npm install
npm run dev        # http://localhost:5182/kds and /waiter
npm start          # build, then serve it (what a host runs); PORT sets the port
```

Needs Node 22.13 or newer (it uses the built-in `node:sqlite`).

## Logins (demo)

| Screen | Username | Password |
|---|---|---|
| Kitchen Display | `kds` | `kds123` |
| Waiter screen | `Shankar` | `s123` |

The kitchen login is a screen lock checked in the browser (`src/kds/kdsAuth.js`). Waiter accounts are stored in the database with
hashed passwords and checked by the server. Add or change a waiter with
`npm run waiter:add -- <username> <password> "<Name>" [Mr.|Mrs.|Ms.]`. **Change all of these before real use.**

## Data

- The app's own database (`data/tabs.sqlite3`: tabs, rounds and kitchen stages, waiter calls, waiter accounts) is created on first start.
- The menu, recipes and stock come from **Stock Management's** SQLite file. Set `INVENTORY_DB` (see `.env.example`). Without it, the
  kitchen and waiter screens still show tickets and calls, but anything that needs the menu or stock answers with an error.
- Waiters' pictures are saved in `assets/waiters/` (not committed).

## Layout

```
kds.html, waiter.html    the two pages
src/kds/                 Kitchen Display (and the parts the waiter screen shares: login, cards, hooks)
src/waiter/              Waiter screen
server/oasysApi.js       the API middleware
server/inventory/        orders, tabs, kitchen stages, waiter calls and accounts, stock
vite.config.js           one config: both pages and the API on one port
```
