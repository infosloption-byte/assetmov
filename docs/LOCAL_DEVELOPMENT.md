# Local Development

## Requirements

- Node.js 22 or newer within the supported project range
- npm
- Docker Desktop or Docker Engine with Compose
- Git

## Initial setup

From the repository root:

```sh
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
docker compose up -d mysql
npm install
npm run db:validate
npm run db:migrate
npm run db:generate
npm run db:seed:plans
npm run build
```

Windows PowerShell equivalent for environment files:

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
docker compose up -d mysql
npm install
npm run db:validate
npm run build
```

The local Docker service binds MySQL to host port **3307** so it does not collide with a typical local MySQL installation on port 3306. Credentials in the committed Compose file are disposable local-development defaults only. Do not reuse them outside a local machine.

## Create the first database migration

After MySQL is healthy:

```sh
npm run db:migrate
npm run db:generate
npm run db:seed:plans
```

Prisma's migration command creates a migration from the current schema and applies it to the local database. Review and commit the generated initial migration directory before sharing this feature. The plan seed creates proposed defaults only when a plan key is absent. Never use development migration commands as the production deployment process; production uses reviewed, committed migrations.

## Run the application

From the repository root:

```sh
npm run dev
```

- React frontend: http://localhost:5173
- Node API: http://localhost:4000
- API health and database readiness: http://localhost:4000/api/health

The preview dashboard checks API health, but its asset metrics are intentionally placeholders until tenant authentication and the asset API are implemented.

## Useful commands

```sh
npm run lint
npm run typecheck
npm test
npm run db:validate
npm run build
```

## Troubleshooting

- If API health reports disconnected, confirm Docker MySQL is healthy and `backend/.env` has the same local URL as the Compose setup.
- If Prisma generated-client imports are missing, run `npm run db:generate --workspace @assetmov/backend`.
- If the database schema changes, create and commit a migration. Do not manually change production schema without corresponding migrations.
- Never commit real customer/bank exports, personal records, secrets, database dumps, or runtime logs.
