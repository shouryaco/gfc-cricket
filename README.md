# GFC Cricket

One admin manages players, availability, balanced teams, fixtures, tosses, scoring, and results. Spectators can view a match link when public scoring is enabled for its tournament.

## Netlify + Supabase setup

1. Create a Supabase project. In its **SQL Editor**, paste and run `supabase/001_init.sql` once on an empty project. It creates the cricket tables and enables Row Level Security without public database policies. The app accesses data through its server routes.
2. In Supabase **Connect**, copy the **Transaction pooler URI**. Keep it secret. Set it in Netlify as the secret runtime variable `DATABASE_URL`. Use the URI as given, including its database password, and do not prefix it with `NEXT_PUBLIC_`.
3. Run `node scripts/create-admin-secret.mjs` in a terminal. Choose a strong password; the script prints `ADMIN_PASSWORD_HASH` and `SESSION_SECRET`. Put those values in Netlify's secret environment variables, along with `ADMIN_USERNAME=admin`. Never commit them or send the raw values in chat.
4. Push this source to a private Git repository and import that repository in Netlify. Its build command is `npm run build`, publish directory `.next`, and Node version 22 (also defined in `netlify.toml`). A serverless Next.js deployment is required; dragging a static folder into Netlify will not run the scoring API.
5. In Netlify's **Rate Limiting** settings, limit `/api/auth/login` per IP (for example, 10 requests per minute) before making the site public.
6. On a deploy preview, sign in at `/login`, add players, make a playing day, mark availability, generate teams, confirm fixtures, score a complete match, and test correction, undo, standings, and the spectator link. Publish only after that trial passes.

The admin username defaults to `admin`. No player login or email sign-in is used. The admin password is not in source; a salted scrypt hash is stored in Netlify settings. The admin session uses a signed, HttpOnly cookie.

## Local testing (optional)

Node 22.13+ is required. Run `npm install`, copy `.env.example` to `.env.local`, set `GFC_LOCAL_DB=1`, and add generated admin values. Then run `npm run dev` and open `http://localhost:3000`. A SQLite database is created at `local-data/gfc.sqlite` and migrations are applied automatically. The local database is separate from Supabase.

## Current verification

TypeScript checks and SQLite migration application were run in the authoring environment. The production build and actual Supabase connection must be verified on a Netlify deploy preview. The previous Cloudflare-hosted app is a separate deployment and is unchanged.
