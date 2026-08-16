# USM ERP API

Fastify API for the configurator and ERP. It listens on port `9012` by default.

## Development

```powershell
pnpm install
pnpm dev
```

With no `DATABASE_URL`, the API uses an in-memory repository, an auto-login owner session,
and seeded template/customer/project/design/quote/order records. Credentials for an explicit
development login are `admin@local.usm` / `usm-local-dev`. Override them in `.env`.

Set `ERP_DEV_SERVER_URL=http://127.0.0.1:9013` to proxy every non-`/api` request through
Fastify, so users only open port `9012`. Without that setting, the server serves
`ERP_STATIC_DIR` and falls back to `index.html` for client routes.

## PostgreSQL

Set `DATABASE_URL`, `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`, then run:

```powershell
pnpm db:migrate
pnpm dev
```

Production refuses to start without `DATABASE_URL`. PostgreSQL enables Better Auth email/password
and organization membership; all business queries additionally filter by the authenticated tenant.
Cross-tenant foreign keys are prevented with `(tenant_id, id)` constraints.

## Verification

```powershell
pnpm typecheck
pnpm test
pnpm build
```

Quote creation never accepts client totals. The server rebuilds BOM data with the existing root
configurator model and applies the existing dealer price source. Draft updates require `If-Match`;
mutations can use `Idempotency-Key`.
