# Production deployment (Render API + Vercel frontend)

## URLs

| Service | URL |
|---------|-----|
| API (Render) | `https://myhostel-server.onrender.com` |
| Health | `GET https://myhostel-server.onrender.com/api/health` |
| Frontend (example) | `https://hostel-frountend.vercel.app` |

---

## Render — backend env (required)

| Variable | Value |
|----------|--------|
| `MONGO_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | 16+ character secret |
| `CLIENT_URL` | **Exact** frontend origin, e.g. `https://hostel-frountend.vercel.app` |
| `CLIENT_URLS` | Optional comma-separated preview URLs |
| `NODE_ENV` | `production` |

`localhost:5173` is allowed automatically for local dev against the live API.

After changing env on Render, **Manual Deploy** the service so CORS updates apply.

---

## Vercel — frontend env (build time)

| Variable | Value |
|----------|--------|
| `VITE_API_URL` | `https://myhostel-server.onrender.com` |
| `VITE_RAZORPAY_KEY_ID` | Optional Razorpay test key |

Use `client/.env.production` as reference. Redeploy after changing variables.

`client/vercel.json` enables SPA routing (no 404 on refresh).

---

## Local development (no CORS errors)

1. Use `client/.env.development` (committed) — **do not** set `VITE_API_URL` in `client/.env`.
2. `VITE_DEV_PROXY_TARGET` points Vite proxy at local or Render API.
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

1. `https://myhostel-server.onrender.com/api/health` → `{ "success": true }`
2. Local: register on `/onboarding` → Network tab shows `http://localhost:5173/api/auth/register` (not blocked by CORS)
3. Production: register → `https://myhostel-server.onrender.com/api/auth/register`

---

## Common errors

| Error | Fix |
|-------|-----|
| CORS blocked from `localhost:5173` | Remove `VITE_API_URL` from `client/.env`; use proxy (`.env.development`); restart Vite |
| CORS on deployed Vercel site | Set `CLIENT_URL` on Render to exact Vercel URL; redeploy API |
| `favicon.ico 404` | Fixed — use `/favicon.svg` in `client/public` |
| `Network Error` / cold start | Render free tier sleeps; wait 30s and retry `/api/health` |
