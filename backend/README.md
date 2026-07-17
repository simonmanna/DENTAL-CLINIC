# Fshikta Dental — Backend

Dental Hospital Management System (DHMS) API server.

Built with **NestJS 11** + **Prisma 5** + **PostgreSQL**.

## Prerequisites

- Node.js 20+
- PostgreSQL 16+
- npm

## Setup

```bash
npm install
npx prisma generate
npx prisma migrate deploy   # apply existing migrations
npx ts-node prisma/seed.ts  # seed reference data
```

## Configuration

Copy `.env.example` to `.env` and fill in:
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — `openssl rand -hex 64`
- `CORS_ORIGIN` — your frontend URL (e.g. `http://localhost:5173`)

## Scripts

| Command | Description |
|---------|-------------|
| `npm run start` | Start production server |
| `npm run start:dev` | Watch mode for development |
| `npm run build` | Compile NestJS bundle |
| `npm run test` | Run Jest unit tests |
| `npm run test:e2e` | Run end-to-end tests |
| `npm run lint` | ESLint check + auto-fix |
| `npm run format` | Prettier formatting |

## Architecture

- **src/** — 60+ modules organized by domain (billing, patients, inventory, pharmacy, etc.)
- **prisma/schema.prisma** — 3800-line schema covering ~60 models
- **prisma/migrations/** — 5 migration snapshots
- **prisma/seeds/** — 24 seed files for reference data

See [USER_MANUAL.md](../USER_MANUAL.md) for full system documentation.
