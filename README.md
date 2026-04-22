# Grid Mood

Grid Mood is a Week 4 multi-service system that turns WattTime grid signals into a live atmospheric artwork.

## Architecture

- `apps/web`: Next.js frontend for the live visual experience
- `apps/worker`: Node.js polling worker for WattTime and Supabase writes
- `Supabase`: Postgres, Auth, and Realtime shared state
- `Railway`: worker deployment target
- `Vercel`: frontend deployment target

## Next steps

1. Install dependencies with `npm install`.
2. Set `.env` values for local development.
3. Run `supabase/schema.sql` in the Supabase SQL editor.
4. Seed at least one row in `locations`.
5. Start both services locally with `npm run dev`.
6. Or, if you want to run them separately, use `npm run dev:web` and `npm run dev:worker`.

## Local env vars

For `apps/web`, set these in the root `.env` file used by `dotenv-cli`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

For `apps/worker`, set these in the same root `.env` file:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WATTTIME_USERNAME`
- `WATTTIME_PASSWORD`
- `POLL_INTERVAL_MS`

## Railway worker

- Railway config for the worker lives at [apps/worker/railway.json](/Users/claricekim/design-build-ship/assignment-4/apps/worker/railway.json:1).
- Import the repo as a JavaScript monorepo and deploy the worker service from the `apps/worker` package.
- Set the worker environment variables in Railway: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WATTTIME_USERNAME`, `WATTTIME_PASSWORD`, and optionally `POLL_INTERVAL_MS`.

## Environmental impact:
https://watttime.org/data-science/data-signals/