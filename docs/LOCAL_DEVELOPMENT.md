# Local Development

## Requirements

- Windows with WampServer and MySQL **5.7 or newer** (or a compatible supported MariaDB version)
- Node.js 22 or newer within the supported project range
- npm

AssetMov uses an npm-workspaces monorepo: the React frontend and Node.js/Express backend are separate packages in `frontend/` and `backend/`, each with its own `package.json` and scripts. The repository root provides optional convenience commands that orchestrate both packages. Install workspace dependencies once from the repository root; run each service directly from its own folder when you want them independent. The Prisma schema uses JSON fields, which require MySQL 5.7 or newer. Check your exact database version in phpMyAdmin with `SELECT VERSION() AS version, @@version_comment AS distribution;`. Do not proceed with MySQL 5.0–5.6 without upgrading the database server or changing the data model and persistence implementation.

## Prepare WAMP and environment files

1. Start WampServer and confirm its MySQL service is running.
2. In phpMyAdmin, create an empty development database named `assetmov` (for example, with the `utf8mb4` character set).
3. From the repository root in PowerShell, create local environment files if they do not already exist:

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

Do not overwrite existing `.env` files blindly; preserve any settings you already have.

Check `backend/.env` and set `DATABASE_URL` to match your actual WAMP MySQL username, password, port and database. Generated primary/foreign keys are stored as 36-character strings, and generic audit entity IDs as 100-character strings, so composite indexes fit older MySQL key-size limits while retaining `utf8mb4`. The example uses the common local WAMP setup of `root`, no password and port `3306`. Confirm these values in your own installation. Also make sure it contains:

```dotenv
API_PORT=4000
FRONTEND_ORIGIN=http://localhost:5176
DATABASE_URL=mysql://root:@127.0.0.1:3306/assetmov
```

The `DATABASE_URL` above is only an example for a local WAMP instance with those credentials; replace it if yours differs. Do not use a blank-password database account outside local development.

Check `frontend/.env` contains:

```dotenv
VITE_API_BASE_URL=http://localhost:4000/api
```

## Install dependencies and verify the Prisma schema

Run these commands from the **repository root**:

```powershell
npm install
npm run db:validate
```

The root install manages dependencies for both npm workspaces. Do not create separate lockfiles for `frontend/` or `backend/`.

## Create and apply the initial migration

The repository needs an initial Prisma migration. If `assetmov` is a new, empty database, open PowerShell in the **backend** folder:

```powershell
Set-Location backend
npm run db:migrate -- --name initial_assetmov_schema
```

Review the generated file under `backend/prisma/migrations` and commit it to Git. If your database already has tables or valuable data, stop before running the migration and take a backup; do not reset or drop an existing database just to make the migration command pass.

After the migration succeeds, return to the **repository root** and run:

```powershell
Set-Location ..
npm run db:generate
npm run db:seed:plans
npm run lint
npm run typecheck
npm test
npm run build
```

The plan seed inserts the proposed default plans only when their keys do not already exist.

## Run the application

### Run both services together (optional convenience command)

From the **repository root**, run:

```powershell
npm run dev
```

This starts the frontend and backend as separate development processes. It does not combine their code or turn the backend into part of React.

- Frontend: http://localhost:5176
- Backend API: http://localhost:4000
- API health/database readiness: http://localhost:4000/api/health

Vite is configured with `strictPort: true`, so it fails with a clear error if port `5176` is already in use instead of silently switching ports. Use `http://localhost:5176` consistently so it matches the backend's `FRONTEND_ORIGIN` CORS setting.

### Run the frontend and backend independently

Open **two PowerShell terminals**. Use each package's own folder and package script.

Terminal 1 — React frontend:

```powershell
Set-Location C:\\wamp\\www\\html\\assetmov\\frontend
npm run dev
```

Terminal 2 — Node.js/Express backend:

```powershell
Set-Location C:\\wamp\\www\\html\\assetmov\\backend
npm run dev
```

Stop each service with `Ctrl+C` in its own terminal.

## Run lint and type checks independently

From the repository root, the workspace scripts verify both packages:

```powershell
npm run lint
npm run typecheck
```

Or run a check for only one package in its own terminal:

```powershell
# Frontend only
Set-Location C:\\wamp\\www\\html\\assetmov\\frontend
npm run lint
npm run typecheck
```

```powershell
# Backend only
Set-Location C:\\wamp\\www\\html\\assetmov\\backend
npm run lint
npm run typecheck
```

## Troubleshooting

- If MySQL connection fails, confirm WAMP's MySQL service is running and check the database name, port and credentials in `backend/.env`.
- If API health reports a database error, ensure migrations were applied and the generated Prisma client is current.
- If browser requests fail due to CORS, open the frontend at `http://localhost:5176` and check `FRONTEND_ORIGIN` in `backend/.env`.
- If Prisma client imports are missing, run `npm run db:generate` from the repository root.
- Never commit `.env` files, real customer exports, personal records, secrets, database dumps or runtime logs.
