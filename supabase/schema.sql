create table if not exists public.locations (
  id bigint generated always as identity primary key,
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  created_at timestamptz not null default now()
);

create table if not exists public.current_grid_state (
  location_id bigint primary key references public.locations(id) on delete cascade,
  captured_at timestamptz not null,
  region_name text,
  region_abbrev text,
  emissions_percentile numeric,
  co2_moer numeric,
  co2_aoer numeric,
  health_damage numeric,
  mood_level text not null default 'unknown',
  palette_name text not null default 'dawn-waiting',
  updated_at timestamptz not null default now()
);

insert into public.locations (name, latitude, longitude)
select seed.name, seed.latitude, seed.longitude
from (
  values
    ('Chicago, IL', 41.8781, -87.6298)
) as seed(name, latitude, longitude)
where not exists (
  select 1
  from public.locations existing
  where lower(existing.name) = lower(seed.name)
);

alter table public.locations enable row level security;
alter table public.current_grid_state enable row level security;

create policy "Public read access for locations"
on public.locations
for select
to anon, authenticated
using (true);

create policy "Public read access for current grid state"
on public.current_grid_state
for select
to anon, authenticated
using (true);

alter publication supabase_realtime add table public.current_grid_state;
