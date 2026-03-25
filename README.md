# QR Redirect Manager

A self-hosted QR code redirect management system for RentalMarketingPro. Manage 500 dynamic QR codes, track scans with geolocation and device data, and update redirect destinations at any time — without reprinting codes.

## Features

- 500 dynamic QR codes at `yourdomain.com/qr/001` through `/qr/500`
- Admin dashboard with search, filter, bulk edit, and status toggle
- Per-code scan history with timestamp, city, country, and device type
- Global scan log with pagination and search
- Stats page with top performers chart
- Simple password-based admin login (no OAuth)

---

## Quick Start (Local Development)

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/qr-redirect-manager.git
cd qr-redirect-manager
pnpm install
```

### 2. Set up Neon PostgreSQL

1. Go to [console.neon.tech](https://console.neon.tech) and create a free account
2. Create a new project (e.g., `qr-redirect-manager`)
3. Copy the **Connection String** from the dashboard (it looks like `postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require`)

### 3. Create your `.env` file

```bash
cp .env.example .env
```

Edit `.env` and fill in:

```env
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
JWT_SECRET=any-long-random-string-32-chars-minimum
ADMIN_PASSWORD=your-chosen-admin-password
```

### 4. Run database migrations and seed

```bash
pnpm db:migrate   # Creates the tables
pnpm db:seed      # Populates 500 QR codes
```

### 5. Start the dev server

```bash
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) and log in with your `ADMIN_PASSWORD`.

---

## Deploying to Vercel

> **Architecture note:** This project runs as a Vercel serverless function. The Express app is compiled by esbuild into `dist/server.js`, re-exported from `api/index.js` (Vercel's function entry point), and the React frontend is served from `dist/client` as static files. **Do not** set a custom "Start Command" in Vercel — serverless functions don't have one.

### Step 1: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
gh repo create qr-redirect-manager --private --push --source .
```

### Step 2: Import to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **Add New → Project**
3. Import your `qr-redirect-manager` GitHub repo
4. Vercel will auto-detect the settings from `vercel.json`
5. **Do NOT override** the Build Command or Output Directory — `vercel.json` handles it

### Step 3: Add Environment Variables

In Vercel project → **Settings → Environment Variables**, add:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | Your Neon connection string |
| `JWT_SECRET` | A long random string (32+ chars) |
| `ADMIN_PASSWORD` | Your chosen admin password |
| `NODE_ENV` | `production` |

### Step 4: Deploy

Click **Deploy**. Vercel will:
1. Run `pnpm install`
2. Run `pnpm build` (builds React → `dist/client`, server → `dist/server.js`)
3. Serve `dist/client` as static files
4. Expose `api/index.js` as a serverless function handling `/qr/*` and `/api/trpc/*`

### Step 5: Run migrations on production

After the first deploy, run migrations against your Neon database:

```bash
# From your local machine with DATABASE_URL pointing to production Neon
pnpm db:migrate
pnpm db:seed
```

### Step 6: Connect your domain

In Vercel → **Settings → Domains**, add your domain (e.g., `qr.yourdomain.com`).

In your DNS provider, add:

| Type | Name | Value |
|------|------|-------|
| `CNAME` | `qr` | `cname.vercel-dns.com` |

### Troubleshooting 404s

- **`/qr/001` returns 404** → Check that `pnpm db:seed` ran successfully against your production Neon DB and that `DATABASE_URL` is set in Vercel env vars.
- **`/api/trpc/*` returns 404** → Verify the Vercel build succeeded and `dist/server.js` was created. Check build logs in Vercel dashboard.
- **Dashboard login fails** → Confirm `ADMIN_PASSWORD` and `JWT_SECRET` are set in Vercel environment variables.
- **Still getting 404 after env var changes** → Trigger a redeploy: Vercel → Deployments → Redeploy.

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret for signing session cookies (32+ chars) |
| `ADMIN_PASSWORD` | Yes | Password for the admin dashboard login |
| `NODE_ENV` | Yes (prod) | Set to `production` on Vercel |
| `PORT` | No | Local dev port (default: 3000) |

---

## Setting Up Google Review Redirects

1. Get your Google Review link from [business.google.com](https://business.google.com) → **Get more reviews**
   - It looks like: `https://g.page/r/AbCdEfGhIjKlMnOp/review`
2. Log into the admin dashboard
3. On the **QR Codes** page, check the header checkbox to select all codes on the page
4. Click **Set Destination (N)** and paste your Google Review link
5. Repeat across all pages, or use bulk select to cover all 500 at once

---

## Project Structure

```
server/
  index.ts       ← Express server + QR redirect endpoint
  routers.ts     ← tRPC procedures (auth + QR management)
  db.ts          ← Database query helpers
  context.ts     ← tRPC context with JWT session auth
  migrate.ts     ← Database migration script
  seed.ts        ← Seeds 500 QR codes
drizzle/
  schema.ts      ← Database schema (qr_codes + scan_logs)
client/src/
  pages/         ← QRDashboard, Stats, ScanHistory, Login
  components/    ← DashboardLayout, ScanLogDrawer
  hooks/         ← useAuth
  lib/trpc.ts    ← tRPC client
```
