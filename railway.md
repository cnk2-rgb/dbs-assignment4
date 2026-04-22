# Railway + Vercel Setup

This repo is a monorepo with two separate deployments connected to the same Git repository:

- Vercel deploys `apps/web`
- Railway deploys `apps/worker`

## Deployment split

- In Vercel, set the project Root Directory to `apps/web`
- In Railway, deploy the worker service from this repo and use the config at `apps/worker/railway.json`

## How the services connect

- The frontend on Vercel does not need to call Railway directly
- The Railway worker polls WattTime and writes into Supabase
- The Vercel frontend reads and subscribes to Supabase
- Supabase is the shared integration point between the two deployments

Current architecture does not require a direct Vercel <-> Railway HTTP path.

## Vercel env vars

Set these in the Vercel project for `apps/web`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

## Railway env vars

Set these in the Railway service for `apps/worker`:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WATTTIME_USERNAME`
- `WATTTIME_PASSWORD`
- `POLL_INTERVAL_MS`

## Practical setup flow

1. Connect this Git repo to Vercel
2. Configure the Vercel project Root Directory as `apps/web`
3. Connect the same Git repo to Railway
4. Point Railway at the worker service and keep `apps/worker/railway.json` in use
5. Add the platform-specific environment variables in each dashboard
6. Deploy both services

## Notes

- Vercel and Railway should each deploy from the same repo, but from different app directories
- If the architecture changes later and the frontend needs to call Railway over HTTP, add a Railway URL as a Vercel env var then
