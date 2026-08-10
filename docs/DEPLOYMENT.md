# Deployment

Production topology: **Vercel serves the static React SPA; Railway runs the long-running Node/Express backend** (REST API + Socket.IO + cron jobs).

| Service | URL |
|---------|-----|
| Frontend (Vercel, static) | `https://stay-sync-six.vercel.app` |
| API + real-time (Railway, long-running) | `https://<your-service>.up.railway.app` |
| Health (Railway) | `GET https://<your-service>.up.railway.app/api/health` |

The client is built with `VITE_API_URL=https://<your-service>.up.railway.app` so both axios (`/api`) and the Socket.IO client target Railway. The old Vercel serverless API (`api/index.js`) has been removed — Vercel is now a pure static host and serves the SPA fallback (`/index.html`) for every route.

---

## Vercel — static frontend (default)

- Project root: repository root.
- Build command: `cd client && npx vite build` (output `client/dist`).
- `vercel.json` rewrites every path to `/index.html` (SPA routing — no 404 on refresh). There is **no `/api` rewrite** — the backend lives on Railway.

### Vercel env (build time)

| Variable | Value |
|----------|--------|
| `VITE_API_URL` | **Required** — `https://<your-service>.up.railway.app` (no trailing slash). The axios base URL and Socket.IO origin both derive from this single variable. |

> ⚠️ If `VITE_API_URL` is missing, the client falls back to same-origin `/api` and **breaks** — the API no longer runs on Vercel.

### Pull env from Vercel (`vercel env pull`)

Instead of maintaining multiple `.env.vercel*` snapshot files, pull the live environment for a given scope:

```bash
vercel env pull .env.local           # local dev env
vercel env pull .env.production      # production env
```

`vercel env pull` fetches the current environment variables from the Vercel project, so values stay in sync with the dashboard. Redeploy after changing env.

---

## Railway — backend (required)

The backend is a persistent Railway **service** (paid plan — runs continuously, so Socket.IO and the `node-cron` jobs stay alive; there is no spin-down like other platforms' free tiers).

### Create the service

1. Railway → New Project → **Deploy from GitHub repo** → select this repo.
2. ⚠️ If Railway offers an automatic JS-monorepo import (it detects both `client/` and `server/`), **do not** accept the `client` service — the frontend stays on Vercel. Keep **only** the backend service.
3. Two service-root options — **either works, the config is already in the repo**:
   - **Repo root (default — no dashboard change needed):** leave the Root Directory empty. The root `railway.toml` overrides the root build script (which would otherwise try to build the Vite client), installs the server deps, and starts the server.
   - **`server/` (smaller image, optional):** set Service → Settings → Root Directory → `server`; then `server/railway.toml` applies instead.
4. **Networking → Generate Domain** → gives a public `https://<your-service>.up.railway.app` URL (you can rename the subdomain or add a custom domain).

> A successful build's log shows `npm install --prefix server` (or, with Root Directory `server`, just `npm install`) — **never** a `vite`/`stay-sync@1.0.0 build` step. The client is not built on Railway.

### Railway env (Variables tab)

| Variable | Value |
|----------|--------|
| `MONGO_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | 16+ character secret |
| `REFRESH_TOKEN_SECRET` | **REQUIRED** separate refresh secret — startup fails without it |
| `RESEND_API_KEY` | **REQUIRED** — Resend API key (create at https://resend.com/api-keys). Startup fails without it in production; there is no dev fallback/logging, so OTP requests also fail in development when it is unset |
| `RESEND_FROM_EMAIL` | **REQUIRED** — verified sender address, e.g. `Sri Rama Hostel <noreply@your-domain.com>` (add & verify the sending domain in Resend; dev only falls back to Resend's `onboarding@resend.dev`) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | **REQUIRED** — override the well-known defaults (`lsk.edu13@gmail.com` / `Srirama@1234`); the app warns in production when they're still defaulted |
| `MONGO_DB_NAME` | Optional (default `smart-hostel`) |
| `CLIENT_URL` | **Exact** frontend origin, e.g. `https://stay-sync-six.vercel.app` |
| `CLIENT_URLS` | Optional comma-separated preview URLs |

`PORT` is injected automatically by Railway and the app already listens on `process.env.PORT`. `localhost:5173` is allowed automatically for local dev against the live API.

After changing env, **redeploy** the service so CORS updates apply.

---

## Keep-warm (GitHub Actions, optional)

`.github/workflows/keep-warm.yml` pings the Railway health URL every 5 minutes as an uptime monitor. Set the `RAILWAY_HEALTH_URL` repository variable (Settings → Secrets and variables → Actions → Variables) to `https://<your-service>.up.railway.app/api/health`. Until then the job prints instructions and exits cleanly. Railway paid services don't spin down, so this is optional — not required.

---

## Local development (no CORS errors)

1. Use `client/.env.development` (committed) — **do not** set `VITE_API_URL` in `client/.env`.
2. `VITE_DEV_PROXY_TARGET` points the Vite proxy at local or Railway API.
3. Run backend locally **or** use Railway:

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

1. `https://<your-service>.up.railway.app/api/health` → `{ "success": true, "db": "connected" }`
2. Admin login at `/admin-login` → API calls go to `https://<your-service>.up.railway.app/api/...` (check the Network tab)
3. Open the app in **two** browser tabs → create a notice/complaint in one; it appears instantly in the other (proves real Socket.IO)

---

## Common errors

| Error | Fix |
|-------|-----|
| CORS blocked from `localhost:5173` | Remove `VITE_API_URL` from `client/.env`; use proxy (`.env.development`); restart Vite |
| CORS on deployed site | Set `CLIENT_URL` on Railway to the exact frontend origin; redeploy |
| Client calls same-origin `/api` in production | `VITE_API_URL` is missing on Vercel — add it (build-time) and redeploy |
| `favicon.ico 404` | Fixed — use `/favicon.svg` in `client/public` |
| Tenant OTP never arrives | `RESEND_API_KEY` / `RESEND_FROM_EMAIL` must be configured and the sender domain verified in Resend; check the server log for `[EMAIL]` errors |
| Deploy stuck on "Building" | Confirm the repo is pushed with the root `railway.toml` (skips the client build); the build log must show `npm install --prefix server`, not a `vite` step |
| Build fails: `Cannot find package 'vite'` / `stay-sync@1.0.0 build` | The root `railway.toml` isn't being applied yet — redeploy after the file is pushed (Railway reads config from the pushed code) |
