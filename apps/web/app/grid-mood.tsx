"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type CurrentGridState = {
  location_id: number;
  captured_at: string;
  region_name: string | null;
  region_abbrev: string | null;
  emissions_percentile: number | null;
  co2_moer: number | null;
  co2_aoer: number | null;
  health_damage: number | null;
  mood_level: string;
  palette_name: string;
  updated_at: string;
  location?: {
    id: number;
    name: string;
    latitude: number;
    longitude: number;
  } | null;
};

type CurrentGridStateRow = Omit<CurrentGridState, "location"> & {
  location?: CurrentGridState["location"] | CurrentGridState["location"][];
};

function formatNumber(value: number | null, suffix: string) {
  if (value === null || Number.isNaN(value)) {
    return "Unavailable";
  }

  return `${value.toFixed(1)} ${suffix}`.trim();
}

function formatPercentile(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "Unavailable";
  }

  return `${Math.round(value)} / 100`;
}

function describeMood(moodLevel: string) {
  switch (moodLevel) {
    case "calm":
      return "Low-emissions conditions should feel spacious, pale, and quiet.";
    case "active":
      return "Midrange grid conditions should feel warmer and more kinetic.";
    case "tense":
      return "Higher-emissions conditions should compress the scene and raise visual stress.";
    default:
      return "Waiting for a live WattTime snapshot to establish the atmosphere.";
  }
}

export function GridMood() {
  const [state, setState] = useState<CurrentGridState | null>(null);
  const [error, setError] = useState<string | null>(null);

  function normalizeState(row: CurrentGridStateRow | null): CurrentGridState | null {
    if (!row) {
      return null;
    }

    const location = Array.isArray(row.location) ? (row.location[0] ?? null) : (row.location ?? null);

    return {
      ...row,
      location
    };
  }

  function mergeRealtimeUpdate(
    current: CurrentGridState | null,
    incoming: Partial<CurrentGridState>
  ): CurrentGridState | null {
    if (!current) {
      if (
        typeof incoming.location_id !== "number" ||
        typeof incoming.captured_at !== "string" ||
        typeof incoming.mood_level !== "string" ||
        typeof incoming.palette_name !== "string" ||
        typeof incoming.updated_at !== "string"
      ) {
        return current;
      }

      return {
        location_id: incoming.location_id,
        captured_at: incoming.captured_at,
        region_name: incoming.region_name ?? null,
        region_abbrev: incoming.region_abbrev ?? null,
        emissions_percentile: incoming.emissions_percentile ?? null,
        co2_moer: incoming.co2_moer ?? null,
        co2_aoer: incoming.co2_aoer ?? null,
        health_damage: incoming.health_damage ?? null,
        mood_level: incoming.mood_level,
        palette_name: incoming.palette_name,
        updated_at: incoming.updated_at,
        location: null
      };
    }

    return {
      ...current,
      ...incoming,
      location: current.location
    };
  }

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    async function loadInitialState() {
      const { data, error: queryError } = await supabase
        .from("current_grid_state")
        .select(
          "location_id, captured_at, region_name, region_abbrev, emissions_percentile, co2_moer, co2_aoer, health_damage, mood_level, palette_name, updated_at, location:locations(id, name, latitude, longitude)"
        )
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (queryError) {
        setError(queryError.message);
        return;
      }

      setState(normalizeState(data as CurrentGridStateRow | null));
    }

    void loadInitialState();

    const channel = supabase
      .channel("current-grid-state")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "current_grid_state"
        },
        (payload) => {
          setState((current) =>
            mergeRealtimeUpdate(
              current,
              (payload.new as Partial<CurrentGridState>) ?? {}
            )
          );
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const metrics = [
    {
      label: "Grid Percentile",
      value: formatPercentile(state?.emissions_percentile ?? null),
      description: "Relative dirtiness of the current grid compared with the past month."
    },
    {
      label: "Marginal CO2",
      value: formatNumber(state?.co2_moer ?? null, "lbs/MWh"),
      description: "Current marginal carbon intensity from WattTime."
    },
    {
      label: "Region",
      value: state?.region_abbrev ?? "Awaiting live feed",
      description: state?.region_name ?? "The worker will resolve a balancing authority from the chosen location."
    }
  ];

  return (
    <main className="min-h-screen px-6 py-8 text-stone-950 md:px-10 lg:px-14">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-7xl flex-col justify-between gap-10 rounded-[2rem] border border-[var(--panel-border)] bg-[var(--panel)] p-6 shadow-[0_18px_80px_rgba(30,45,62,0.12)] backdrop-blur md:p-10">
        <div className="flex flex-col gap-12 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm uppercase tracking-[0.35em] text-stone-600">
              Grid Mood
            </p>
            <h1 className="mt-4 max-w-3xl text-5xl leading-none tracking-[-0.04em] text-stone-950 md:text-7xl">
              A live sky shaped by the carbon mood of the grid.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-700 md:text-xl">
              WattTime drives the live state. The Railway worker resolves the
              location&apos;s balancing authority, writes the latest emissions
              percentile and marginal signal to Supabase, and this page subscribes
              through Realtime.
            </p>
          </div>

          <aside className="w-full max-w-sm rounded-[1.75rem] border border-[var(--panel-border)] bg-white/70 p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.3em] text-stone-500">
              Status
            </p>
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-sm text-stone-500">Location</p>
                <p className="text-2xl text-stone-950">
                  {state?.location?.name ?? "Seed a location in Supabase"}
                </p>
              </div>
              <div>
                <p className="text-sm text-stone-500">Mood</p>
                <p className="text-base text-stone-700">
                  {describeMood(state?.mood_level ?? "unknown")}
                </p>
              </div>
              {error ? (
                <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}
            </div>
          </aside>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.3fr_0.9fr]">
          <section className="relative overflow-hidden rounded-[2rem] border border-[var(--panel-border)] bg-stone-950 p-8 text-stone-100">
            <div
              className="absolute inset-0 transition-all duration-700"
              style={{
                background:
                  state?.mood_level === "tense"
                    ? "radial-gradient(circle at 20% 20%, rgba(209,73,91,0.50), transparent 25%), radial-gradient(circle at 70% 30%, rgba(255,145,77,0.28), transparent 30%), radial-gradient(circle at 45% 75%, rgba(105,32,58,0.42), transparent 32%)"
                    : state?.mood_level === "active"
                      ? "radial-gradient(circle at 20% 20%, rgba(255,209,102,0.42), transparent 25%), radial-gradient(circle at 70% 30%, rgba(240,168,104,0.24), transparent 30%), radial-gradient(circle at 45% 75%, rgba(135,170,196,0.28), transparent 30%)"
                      : "radial-gradient(circle at 20% 20%, rgba(169,214,197,0.45), transparent 25%), radial-gradient(circle at 70% 30%, rgba(197,229,222,0.24), transparent 30%), radial-gradient(circle at 45% 75%, rgba(142,180,227,0.22), transparent 30%)"
              }}
            />
            <div className="relative flex min-h-[24rem] flex-col justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-stone-300">
                  Live atmosphere placeholder
                </p>
                <p className="mt-4 max-w-xl text-lg leading-8 text-stone-200">
                  This panel is already reacting to the current mood bucket from
                  WattTime. The next step is to replace the gradient layer with a
                  real canvas scene driven by the same live values.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 text-sm text-stone-300">
                <span className="rounded-full border border-white/15 px-4 py-2">
                  Palette: {state?.palette_name ?? "dawn-waiting"}
                </span>
                <span className="rounded-full border border-white/15 px-4 py-2">
                  Updated:{" "}
                  {state?.captured_at
                    ? new Date(state.captured_at).toLocaleTimeString()
                    : "pending"}
                </span>
              </div>
            </div>
          </section>

          <section className="grid gap-4">
            {metrics.map((metric) => (
              <article
                key={metric.label}
                className="rounded-[1.5rem] border border-[var(--panel-border)] bg-white/75 p-5"
              >
                <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
                  {metric.label}
                </p>
                <p className="mt-3 text-2xl text-stone-950">{metric.value}</p>
                <p className="mt-3 text-sm leading-6 text-stone-600">
                  {metric.description}
                </p>
              </article>
            ))}
          </section>
        </div>
      </section>
    </main>
  );
}
