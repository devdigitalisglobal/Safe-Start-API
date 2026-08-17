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

## Security

See `../safe-start/SECURITY.md` — especially rotate any secrets that were ever hardcoded or committed to git.

## Dev scripts

| Command | Purpose |
|---|---|
| `npm run seed` | Reseed module and assessment content |
| `npm run seed:dashboard-users` | Create dev Staff Portal users (requires `DASHBOARD_DEV_PASSWORD`) |
| `npx tsx test-auth.ts` | Print a test JWT (requires `TEST_AUTH_EMAIL` / `TEST_AUTH_PASSWORD`) |
