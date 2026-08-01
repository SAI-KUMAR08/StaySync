# Deployment

The app has a dual backend setup:

| Service | URL |
|---------|-----|
| Vercel (full-stack serverless, default) | `https://stay-sync-six.vercel.app` |
| Health (Vercel) | `GET https://stay-sync-six.vercel.app/api/health` |
| API (Render, long-running) | `https://myhostel-server.onrender.com` |
| Health (Render) | `GET https://myhostel-server.onrender.com/api/health` |

The Vercel deployment (`vercel.json` + `api/index.js`) serves both the Express API and the built client from one domain — in production the client calls same-origin `/api`. Real-time Socket.IO is NOT available on Vercel serverless; use the Render deployment when WebSockets are required.

---

## Vercel — full-stack serverless (default)

- Project root: repository root.
- Build command: `cd client && npx vite build` (output `client/dist`).
- The root `vercel.json` rewrites `/api/(.*)` to the serverless handler and all other paths to `/index.html` (SPA routing — no 404 on refresh).

### Vercel env (build time + runtime)

| Variable | Value |
|----------|--------|
| `MONGO_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | 16+ character secret |
| `REFRESH_TOKEN_SECRET` | Separate refresh secret (recommended) |
| `CLIENT_URL` | Same Vercel origin (for CORS/cookie settings) |

Do **not** set `VITE_API_URL` on Vercel — the client defaults to same-origin `/api`.

### Pull env from Vercel (`vercel env pull`)

Instead of maintaining multiple `.env.vercel*` snapshot files, pull the live environment for a given scope:

```bash
vercel env pull .env.local           # local dev env
vercel env pull .env.production      # production env
```

`vercel env pull` fetches the current environment variables from the Vercel project, so values stay in sync with the dashboard. Redeploy after changing env.

---

## Render — long-running backend (optional, for real-time)

`render.yaml` deploys the `server` folder as a persistent Node web service with full Socket.IO, WebSockets, and cron jobs.

### Render env (required)

| Variable | Value |
|----------|--------|
| `MONGO_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | 16+ character secret |
| `REFRESH_TOKEN_SECRET` | **REQUIRED** separate refresh secret — startup fails without it |
| `SEND_REAL_EMAIL` | **REQUIRED** `true` in production — startup fails otherwise (OTP codes are never echoed when false is only for local dev) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `EMAIL_FROM` | **REQUIRED** for OTP email delivery |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | **REQUIRED** — override the well-known defaults (`pravitha.555@gmail.com` / `Srirama@1234`); the app warns in production when they're still defaulted |
| `MONGO_DB_NAME` | Optional (default `smart-hostel`) |
| `CLIENT_URL` | **Exact** frontend origin, e.g. `https://stay-sync-six.vercel.app` |
| `CLIENT_URLS` | Optional comma-separated preview URLs |
| `NODE_ENV` | `production` |

`localhost:5173` is allowed automatically for local dev against the live API.

After changing env on Render, **Manual Deploy** the service so CORS updates apply.

To point the client at Render instead of same-origin, set `VITE_API_URL=https://myhostel-server.onrender.com` at build time.

---

## Local development (no CORS errors)

1. Use `client/.env.development` (committed) — **do not** set `VITE_API_URL` in `client/.env`.
2. `VITE_DEV_PROXY_TARGET` points the Vite proxy at local or Render API.
3. Run backend locally **or** use Render:

```bash
cd server && npm run dev    # optional if using local API
cd client && npm run dev    # opens http://localhost:5173
```

Browser calls `http://localhost:5173/api/...` → Vite proxies → backend. **No cross-origin requests.**

To use **local** API, set in `.env.development`:

```env
VITE_DEV_PROXY_TARGET=http://localhost:5000
```

Restart `npm run dev` after any `.env` change.

---

## Smoke test

1. `https://stay-sync-six.vercel.app/api/health` → `{ "success": true }` (Vercel serverless)
2. Local: admin login at `/admin-login` → Network tab shows `http://localhost:5173/api/...` (not blocked by CORS)
3. Production: API calls go to `https://stay-sync-six.vercel.app/api/...` (same-origin)

---

## Common errors

| Error | Fix |
|-------|-----|
| CORS blocked from `localhost:5173` | Remove `VITE_API_URL` from `client/.env`; use proxy (`.env.development`); restart Vite |
| CORS on deployed site | Set `CLIENT_URL` on the backend to the exact frontend origin; redeploy |
| `favicon.ico 404` | Fixed — use `/favicon.svg` in `client/public` |
| `Network Error` / cold start | Serverless cold start; the keep-warm workflow pings the health URL every 5 minutes — retry `/api/health` |
| Real-time sockets don't work on Vercel | Expected — Socket.IO requires the long-running Render deployment |
