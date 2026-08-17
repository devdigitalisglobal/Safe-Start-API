# Safe Start API

Fastify + Prisma API for the mobile learner app and Staff Portal.

## Setup

```powershell
cd "D:\Digitalis Global Projects\safe-start-api"
copy .env.example .env
npm install
npm run dev
```

See `.env.example` for all required variables.

## Production deploy

Deploy to **Vercel** (serverless, Sydney) or **Render** (always-on Node).

| Platform | Best for |
|---|---|
| **Vercel** | Mobile APK + portal API traffic; PDF export returns 503 until Chrome is configured |
| **Render** | Full features including dashboard PDF export (Puppeteer) |

See **`../safe-start/DEPLOY-CLOUD.md`** for env vars and step-by-step.

### Vercel (quick)

1. Import **Safe-Start-API** on [vercel.com/new](https://vercel.com/new), branch **`main`**
2. Add env vars from `.env.example` (`NODE_ENV=production`, `DATABASE_URL`, Supabase keys, `CORS_ORIGINS`, `PARTNER_API_SIGNING_KEY`)
3. Deploy → test `https://YOUR-PROJECT.vercel.app/health`

## Security

See `../safe-start/SECURITY.md` — especially rotate any secrets that were ever hardcoded or committed to git.

## Dev scripts

| Command | Purpose |
|---|---|
| `npm run seed` | Reseed module and assessment content |
| `npm run seed:dashboard-users` | Create dev Staff Portal users (requires `DASHBOARD_DEV_PASSWORD`) |
| `npx tsx test-auth.ts` | Print a test JWT (requires `TEST_AUTH_EMAIL` / `TEST_AUTH_PASSWORD`) |
