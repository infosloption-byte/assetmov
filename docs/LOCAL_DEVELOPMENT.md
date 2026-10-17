# Local Development

## Requirements

- Windows with WampServer and its MySQL service running
- Node.js 22 or newer within the supported project range
- npm

AssetMov uses the repository root as an npm workspace. Run `npm install` and the root-level verification scripts from the **repository root** unless a step below explicitly says to use the backend folder.

## Prepare WAMP and environment files

1. Start WampServer and confirm its MySQL service is running.
2. In phpMyAdmin, create an empty development database named `assetmov` (for example, with the `utf8mb4` character set).
3. From the repository root in PowerShell, create local environment files if they do not already exist:

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

Do not overwrite existing `.env` files blindly; preserve any settings you already have.

Check `backend/.env` and set `DATABASE_URL` to match your actual WAMP MySQL username, password, port and database. The example uses the common local WAMP setup of `root`, no password and port `3306`. Confirm these values in your own installation. Also make sure it contains:

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

From the **repository root**, run both services together:

```powershell
npm run dev
```

- Frontend: http://localhost:5176
- Backend API: http://localhost:4000
- API health/database readiness: http://localhost:4000/api/health

Vite is configured with `strictPort: true`, so it fails with a clear error if port `5176` is already in use instead of silently switching ports. Use `http://localhost:5176` consistently so it matches the backend's `FRONTEND_ORIGIN` CORS setting.

## Run only one service

From the repository root:

```powershell
npm run dev:frontend
npm run dev:backend
```

Run one of these commands in a separate terminal as needed. Stop the running process with `Ctrl+C`.

## Troubleshooting

- If MySQL connection fails, confirm WAMP's MySQL service is running and check the database name, port and credentials in `backend/.env`.
- If API health reports a database error, ensure migrations were applied and the generated Prisma client is current.
- If browser requests fail due to CORS, open the frontend at `http://localhost:5176` and check `FRONTEND_ORIGIN` in `backend/.env`.
- If Prisma client imports are missing, run `npm run db:generate` from the repository root.
- Never commit `.env` files, real customer exports, personal records, secrets, database dumps or runtime logs.
