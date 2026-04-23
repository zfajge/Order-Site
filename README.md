# Order-Site

Move-out sale site with separate buyer and seller pages.

## Run locally

```bash
npm run setup-and-start
```

- Buyer page: `http://localhost:3000/`
- Seller page: `http://localhost:3000/seller`

Default seller password: `Thunder235911!!`

## Deploy with persistent storage (Supabase)

The app supports two storage backends:

- **Supabase (recommended for cloud)** via REST API
- Local JSON file (`data/items.json`) fallback

### 1) Create a Supabase project

1. Go to https://supabase.com and create a free project.
2. Open SQL editor and run the SQL in `supabase-schema.sql`.

### 2) Get project credentials

From Project Settings / API, copy:

- Project URL (looks like `https://YOUR-PROJECT.supabase.co`)
- Service role key (server-side secret)

### 3) Set environment variables in your host (e.g., Render)

```bash
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SELLER_PASSWORD=your-strong-password
```

When both Supabase env vars are present, the server uses Supabase automatically.

### 4) Optional: seed defaults

If the table is empty, this app auto-seeds initial default items at startup.
