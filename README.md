# Order-Site

Move-out sale site with separate buyer and seller pages, account sign-in, and profile activity tracking.

## Run locally

```bash
npm run setup-and-start
```

- Buyer page: `http://localhost:3000/`
- Seller page: `http://localhost:3000/seller`

## Account system (new)

- Start at `/signin` to create an account or sign in.
- Supports email-based accounts (including Gmail addresses).
- Roles:
  - **buyer**: browse and submit hold requests with offers.
  - **seller**: create/manage listings.
- Sessions are cookie-based and persisted server-side using signed cookies.
- Profile page at `/profile` shows account summary and recent activity.

### Seller ownership rules

- Sellers can create listings.
- Sellers can edit/delete **only listings they created**.
- Sellers can mark held listings as sold (shows Bought on cards).

### Important security note

This app now stores user credentials in local JSON for simple self-hosted use.
For production deployments, use HTTPS and set a strong `SESSION_SECRET`.

```bash
SESSION_SECRET=your-long-random-session-secret
```

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
SUPABASE_ITEMS_TABLE=moveout_items
SESSION_SECRET=your-long-random-session-secret
```

When both Supabase env vars are present, the server uses Supabase automatically.

## Deploy for free on Vercel (with Supabase)

1. Push this repository to GitHub.
2. Go to https://vercel.com and import the repo.
3. In Vercel project settings, add environment variables:

```bash
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ITEMS_TABLE=moveout_items
SESSION_SECRET=your-long-random-session-secret
```

4. Deploy. Vercel will use `vercel.json` and route all requests through the Node server.

- Sign-in link: `https://your-project.vercel.app/signin`
- Buyer link: `https://your-project.vercel.app/`
- Seller link: `https://your-project.vercel.app/seller`
- Profile link: `https://your-project.vercel.app/profile`

### 4) Optional: seed defaults

If the table is empty, this app auto-seeds initial default items at startup.
