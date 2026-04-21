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
2. Copy `.env.example` to `.env.local` for the web app and `.env` for the worker context.
3. Run `supabase/schema.sql` in the Supabase SQL editor.
4. Seed at least one row in `locations`.
5. Start both services locally with `npm run dev`.
6. Or, if you want to run them separately, use `npm run dev:web` and `npm run dev:worker`.
