"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type LocationRecord = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  source?: "supabase" | "browser";
};

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
      return "Low-emissions conditions are represented with spacious, pale, and quiet UI.";
    case "active":
      return "Midrange grid conditions are represented with warmer and more kinetic imagery.";
    case "tense":
      return "Higher-emissions conditions compress the scene and raise visual stress.";
    default:
      return "Waiting for a live WattTime snapshot to establish the atmosphere.";
  }
}

function describeMoerAvailability(state: CurrentGridState | null) {
  if (state?.co2_moer !== null && state?.co2_moer !== undefined) {
    return "Current marginal carbon intensity from WattTime.";
  }

  if (state?.region_abbrev) {
    return `Raw MOER is not available for ${state.region_abbrev} on the current WattTime access tier.`;
  }

  return "Current marginal carbon intensity will appear here when WattTime exposes raw MOER for the selected region.";
}

function getScenePalette(moodLevel: string) {
  switch (moodLevel) {
    case "tense":
      return {
        sky: "linear-gradient(180deg, #130d18 0%, #24131b 28%, #4f1d24 62%, #a24b38 100%)",
        glow: "rgba(255, 144, 84, 0.34)",
        orb: "#ff8a5b",
        ring: "rgba(255, 201, 145, 0.26)",
        ridge: "#20131d",
        ridgeSecondary: "#3b1d28",
        pulse: "rgba(255, 118, 82, 0.38)"
      };
    case "active":
      return {
        sky: "linear-gradient(180deg, #14202f 0%, #2b4253 32%, #ab7c53 72%, #e8b56c 100%)",
        glow: "rgba(255, 196, 98, 0.28)",
        orb: "#ffd166",
        ring: "rgba(255, 230, 175, 0.22)",
        ridge: "#1d2733",
        ridgeSecondary: "#4d4a4b",
        pulse: "rgba(255, 209, 102, 0.32)"
      };
    default:
      return {
        sky: "linear-gradient(180deg, #102032 0%, #214c66 35%, #6fa3aa 70%, #d5e7d9 100%)",
        glow: "rgba(167, 221, 201, 0.24)",
        orb: "#b9efe0",
        ring: "rgba(210, 241, 236, 0.22)",
        ridge: "#152534",
        ridgeSecondary: "#294156",
        pulse: "rgba(169, 214, 197, 0.3)"
      };
  }
}

function mergeDisplayLocations(storedLocations: LocationRecord[]) {
  const hiddenLocationNames = new Set([
    "sacramento, ca",
    "new york, ny",
    "your live location"
  ]);

  return storedLocations
    .filter(
      (location) =>
        location.source !== "browser" &&
        !hiddenLocationNames.has(location.name.trim().toLowerCase())
    )
    .map((location) => ({
      ...location,
      source: location.source ?? "supabase"
    }));
}

function describeGeolocationError(code?: number) {
  switch (code) {
    case 1:
      return "Location permission was denied.";
    case 2:
      return "Your location could not be determined.";
    case 3:
      return "Location request timed out.";
    default:
      return "Unable to retrieve your live location.";
  }
}

export function GridMood() {
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [statesByLocationId, setStatesByLocationId] = useState<
    Record<number, CurrentGridState>
  >({});
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const [loadingLocationId, setLoadingLocationId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"mood" | "data">("mood");
  const [isSignalIndexInfoOpen, setIsSignalIndexInfoOpen] = useState(false);
  const [geolocationStatus, setGeolocationStatus] = useState<
    "idle" | "requesting" | "ready" | "error" | "unsupported"
  >("idle");
  const [geolocationError, setGeolocationError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function hydrateLocation(location: LocationRecord) {
    const response = await fetch("/api/live-location", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: location.name,
        latitude: location.latitude,
        longitude: location.longitude
      })
    });

    const payload = (await response.json()) as
      | {
          error?: string;
          location: LocationRecord;
          state: CurrentGridState;
        }
      | { error?: string };

    if (!response.ok || !("location" in payload) || !("state" in payload)) {
      throw new Error(
        payload.error ?? `Failed to load an initial WattTime snapshot for ${location.name}.`
      );
    }

    const nextLocation = {
      ...payload.location,
      source: location.source === "browser" ? "browser" : "supabase"
    } satisfies LocationRecord;

    setLocations((current) => {
      const withoutExisting = current.filter(
        (currentLocation) => currentLocation.id !== nextLocation.id
      );

      return [...withoutExisting, nextLocation];
    });
    setStatesByLocationId((current) => ({
      ...current,
      [payload.state.location_id]: payload.state
    }));

    return payload.location.id;
  }

  async function handleLocationSelection(location: LocationRecord) {
    if (statesByLocationId[location.id] || location.source === "supabase") {
      setSelectedLocationId(location.id);
      return;
    }

    setLoadingLocationId(location.id);
    setError(null);

    try {
      const hydratedLocationId = await hydrateLocation(location);
      setSelectedLocationId(hydratedLocationId);
    } catch (selectionError) {
      setError(
        selectionError instanceof Error
          ? selectionError.message
          : `Failed to load ${location.name}.`
      );
    } finally {
      setLoadingLocationId(null);
    }
  }

  function requestBrowserLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeolocationStatus("unsupported");
      setGeolocationError("This browser does not support live location requests.");
      return;
    }

    setGeolocationStatus("requesting");
    setGeolocationError(null);

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const latitude = Number(coords.latitude.toFixed(4));
        const longitude = Number(coords.longitude.toFixed(4));
        const browserLocation: LocationRecord = {
          id: 0,
          name: "Your live location",
          latitude,
          longitude,
          source: "browser"
        };

        try {
          const hydratedLocationId = await hydrateLocation(browserLocation);
          setGeolocationStatus("ready");
          setGeolocationError(null);
          setSelectedLocationId(hydratedLocationId);
        } catch (requestError) {
          setGeolocationStatus("error");
          setGeolocationError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to load your live location."
          );
        }
      },
      (positionError) => {
        setGeolocationStatus("error");
        setGeolocationError(describeGeolocationError(positionError.code));
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000
      }
    );
  }

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    async function loadInitialData() {
      const [{ data: locationRows, error: locationsError }, { data: stateRows, error: statesError }] =
        await Promise.all([
          supabase
            .from("locations")
            .select("id, name, latitude, longitude")
            .order("created_at", { ascending: true }),
          supabase
            .from("current_grid_state")
            .select(
              "location_id, captured_at, region_name, region_abbrev, emissions_percentile, co2_moer, co2_aoer, health_damage, mood_level, palette_name, updated_at"
            )
        ]);

      if (locationsError || statesError) {
        setError(locationsError?.message ?? statesError?.message ?? "Failed to load live data.");
        return;
      }

      const nextLocations = locationRows ?? [];
      const nextStates = Object.fromEntries(
        (stateRows ?? []).map((row) => [row.location_id, row as CurrentGridState])
      );

      setLocations(nextLocations);
      setStatesByLocationId(nextStates);
      setSelectedLocationId((current) => current ?? nextLocations[0]?.id ?? null);
    }

    void loadInitialData();

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
          const incoming = payload.new as Partial<CurrentGridState> | null;

          if (!incoming || typeof incoming.location_id !== "number") {
            return;
          }

          const locationId = incoming.location_id;

          setStatesByLocationId((current) => {
            const existing = current[locationId];

            return {
              ...current,
              [locationId]: {
                location_id: locationId,
                captured_at: incoming.captured_at ?? existing?.captured_at ?? new Date().toISOString(),
                region_name: incoming.region_name ?? existing?.region_name ?? null,
                region_abbrev: incoming.region_abbrev ?? existing?.region_abbrev ?? null,
                emissions_percentile: incoming.emissions_percentile ?? existing?.emissions_percentile ?? null,
                co2_moer: incoming.co2_moer ?? existing?.co2_moer ?? null,
                co2_aoer: incoming.co2_aoer ?? existing?.co2_aoer ?? null,
                health_damage: incoming.health_damage ?? existing?.health_damage ?? null,
                mood_level: incoming.mood_level ?? existing?.mood_level ?? "unknown",
                palette_name: incoming.palette_name ?? existing?.palette_name ?? "dawn-waiting",
                updated_at: incoming.updated_at ?? existing?.updated_at ?? new Date().toISOString()
              }
            };
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const displayLocations = useMemo(() => mergeDisplayLocations(locations), [locations]);
  const browserLocation = useMemo(
    () => locations.find((location) => location.source === "browser") ?? null,
    [locations]
  );
  const selectedLocation =
    locations.find((location) => location.id === selectedLocationId) ?? null;
  const selectedState =
    (selectedLocationId !== null ? statesByLocationId[selectedLocationId] : null) ?? null;
  const moerEnabledLocation = useMemo(
    () =>
      displayLocations.find((location) => {
        const state = statesByLocationId[location.id];
        return state?.co2_moer !== null && state?.co2_moer !== undefined;
      }) ?? null,
    [displayLocations, statesByLocationId]
  );
  const showChicagoAccessMessage =
    selectedLocation?.name === "Chicago, IL" &&
    (selectedState?.co2_moer === null || selectedState?.co2_moer === undefined);
  const missingLiveSnapshot =
    selectedLocationId !== null &&
    selectedLocation !== null &&
    statesByLocationId[selectedLocationId] === undefined;
  const locationNotice =
    geolocationError;

  const metrics = [
    {
      label: "Signal Index",
      value: formatPercentile(selectedState?.emissions_percentile ?? null),
      description:
        "Statistical percentile of the current MOER (Marginal Operating Emissions Rate) relative to the upcoming 24 hours of forecast MOER values (100=dirtiest, 0=cleanest). If the index is high, users should delay flexible energy use to cleaner times later in the day."
    },
    {
      label: "Marginal CO2",
      value: formatNumber(selectedState?.co2_moer ?? null, "lbs/MWh"),
      description: describeMoerAvailability(selectedState)
    },
    {
      label: "Region",
      value: selectedState?.region_abbrev ?? "Awaiting live feed",
      description:
        selectedState?.region_name ??
        "The worker will resolve a balancing authority from the chosen location."
    }
  ];

  const scenePalette = getScenePalette(selectedState?.mood_level ?? "unknown");
  const intensity = Math.max(
    0.18,
    Math.min(1, (selectedState?.emissions_percentile ?? 40) / 100)
  );
  const orbScale = 1 + intensity * 0.22;
  const particleCount =
    selectedState?.mood_level === "tense"
      ? 10
      : selectedState?.mood_level === "active"
        ? 8
        : 6;
  const orbStyle: CSSProperties & Record<"--scene-orb-scale", string> = {
    background: `radial-gradient(circle at 32% 32%, rgba(255,255,255,0.92), ${scenePalette.orb} 48%, rgba(255,255,255,0) 78%)`,
    boxShadow: `0 0 110px ${scenePalette.glow}`,
    "--scene-orb-scale": String(orbScale)
  };
  const pageBackgroundStyle: CSSProperties = {
    background: `
      radial-gradient(circle at 18% 16%, ${scenePalette.glow}, transparent 32%),
      radial-gradient(circle at 82% 20%, ${scenePalette.pulse}, transparent 26%),
      linear-gradient(
        180deg,
        color-mix(in srgb, #f7f1e7 ${Math.max(18, 42 - intensity * 18)}%, ${scenePalette.orb}) 0%,
        color-mix(in srgb, #e4ddd2 ${Math.max(16, 40 - intensity * 15)}%, ${scenePalette.ring}) 44%,
        color-mix(in srgb, #c8d3da ${Math.max(14, 34 - intensity * 10)}%, ${scenePalette.orb}) 100%
      )
    `
  };
  const selectedUpdatedAt = selectedState?.updated_at
    ? new Date(selectedState.updated_at).toLocaleString()
    : "Awaiting live feed";
  const dataRows = [
    {
      field: "Location name",
      value: selectedLocation?.name ?? "Unavailable"
    },
    {
      field: "Latitude",
      value:
        selectedLocation?.latitude !== undefined
          ? String(selectedLocation.latitude)
          : "Unavailable"
    },
    {
      field: "Longitude",
      value:
        selectedLocation?.longitude !== undefined
          ? String(selectedLocation.longitude)
          : "Unavailable"
    },
    {
      field: "Region code",
      value: selectedState?.region_abbrev ?? "Unavailable"
    },
    {
      field: "Region name",
      value: selectedState?.region_name ?? "Unavailable"
    },
    {
      field: "Emissions percentile",
      value: formatPercentile(selectedState?.emissions_percentile ?? null)
    },
    {
      field: "Marginal CO2",
      value: formatNumber(selectedState?.co2_moer ?? null, "lbs/MWh")
    },
    {
      field: "Last updated",
      value: selectedUpdatedAt
    }
  ];

  return (
    <main
      className="min-h-screen px-6 py-8 text-stone-950 transition-[background] duration-700 md:px-10 lg:px-14"
      style={pageBackgroundStyle}
    >
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-7xl flex-col justify-between gap-10 rounded-[2rem] border border-[var(--panel-border)] bg-[var(--panel)] p-6 shadow-[0_18px_80px_rgba(30,45,62,0.12)] backdrop-blur md:p-10">
        <div className="flex flex-col gap-12 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm uppercase tracking-[0.35em] text-stone-600">
              Grid Mood
            </p>
            <h1 className="mt-4 max-w-3xl text-5xl leading-none tracking-[-0.04em] text-stone-950 md:text-7xl">
              A live sky shaped by the carbon emissions of the grid.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-700 md:text-xl">
              Explore live carbon emission metrics from various locations to make more eco-friendly energy usage decisions.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <p className="max-w-xl text-sm leading-6 text-stone-600">
                Explore our data source and its use cases in WattTime&apos;s signal
                documentation.
              </p>
              <a
                href="https://watttime.org/data-science/data-signals/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-900 shadow-sm transition hover:border-stone-500 hover:bg-stone-100"
              >
                Learn More
              </a>
            </div>
          </div>

          <aside className="w-full max-w-sm rounded-[1.75rem] border border-[var(--panel-border)] bg-white/70 p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.3em] text-stone-500">
              Status
            </p>
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-sm text-stone-500">Location</p>
                <p className="text-2xl text-stone-950">
                  {selectedLocation?.name ?? "Seed a location in Supabase"}
                </p>
              </div>
              <div>
                <p className="text-sm text-stone-500">Mood</p>
                <p className="text-base text-stone-700">
                  {describeMood(selectedState?.mood_level ?? "unknown")}
                </p>
              </div>
              <div>
                <p className="text-sm text-stone-500">Available places</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {displayLocations.map((location) => {
                    return (
                      <button
                        key={location.id}
                        type="button"
                        onClick={() => void handleLocationSelection(location)}
                        disabled={loadingLocationId === location.id}
                        className={`rounded-full border px-3 py-2 text-sm transition ${
                          location.id === selectedLocationId
                            ? "border-stone-900 bg-stone-900 text-white"
                            : "border-stone-300 bg-white text-stone-700 hover:border-stone-500"
                        } disabled:cursor-wait disabled:opacity-60`}
                      >
                        {loadingLocationId === location.id ? "Loading..." : location.name}
                      </button>
                    );
                  })}
                  {browserLocation ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleLocationSelection(browserLocation)}
                        disabled={
                          geolocationStatus === "requesting" ||
                          loadingLocationId === browserLocation.id
                        }
                        className={`rounded-full border px-3 py-2 text-sm transition ${
                          browserLocation.id === selectedLocationId
                            ? "border-stone-900 bg-stone-900 text-white"
                            : "border-stone-300 bg-white text-stone-700 hover:border-stone-500"
                        } disabled:cursor-wait disabled:opacity-60`}
                      >
                        {loadingLocationId === browserLocation.id ? "Loading..." : "My location"}
                      </button>
                      <button
                        type="button"
                        onClick={requestBrowserLocation}
                        disabled={geolocationStatus === "requesting"}
                        className="rounded-full border border-dashed border-stone-400 bg-transparent px-3 py-2 text-sm text-stone-700 transition hover:border-stone-700 disabled:cursor-wait disabled:opacity-60"
                      >
                        {geolocationStatus === "requesting"
                          ? "Locating..."
                          : "Refresh my location"}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={requestBrowserLocation}
                      disabled={geolocationStatus === "requesting"}
                      className="rounded-full border border-dashed border-stone-400 bg-transparent px-3 py-2 text-sm text-stone-700 transition hover:border-stone-700 disabled:cursor-wait disabled:opacity-60"
                    >
                      {geolocationStatus === "requesting" ? "Locating..." : "Use my location"}
                    </button>
                  )}
                </div>
              </div>
              {locationNotice ? (
                <div className="rounded-2xl bg-stone-100 px-4 py-3 text-sm text-stone-700">
                  {locationNotice}
                </div>
              ) : null}
              {error ? (
                <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}
            </div>
          </aside>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex rounded-full border border-[var(--panel-border)] bg-white/75 p-1">
            <button
              type="button"
              onClick={() => setActiveTab("mood")}
              className={`rounded-full px-4 py-2 text-sm transition ${
                activeTab === "mood"
                  ? "bg-stone-900 text-white"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              Grid Mood
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("data")}
              className={`rounded-full px-4 py-2 text-sm transition ${
                activeTab === "data"
                  ? "bg-stone-900 text-white"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              Live Data
            </button>
          </div>
          <p className="text-sm text-stone-600">
            Last updated: <span className="font-medium text-stone-900">{selectedUpdatedAt}</span>
          </p>
        </div>

        {showChicagoAccessMessage ? (
          <section className="rounded-[1.5rem] border border-amber-300 bg-amber-50/90 p-5 text-stone-800">
            <p className="text-sm uppercase tracking-[0.28em] text-amber-800">
              Marginal CO2 Access
            </p>
            <p className="mt-3 max-w-4xl text-base leading-7">
              The app is behaving correctly, but Chicago still cannot show numeric
              marginal CO2 on this WattTime account. To get a real <code>co2_moer</code>{" "}
              number in the UI for your chosen place, you need either a WattTime
              plan that includes <code>PJM_CHICAGO</code>, or a location in an
              authorized region like <code>CAISO_NORTH</code>.
            </p>
            {moerEnabledLocation ? (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setSelectedLocationId(moerEnabledLocation.id)}
                  className="rounded-full border border-stone-900 bg-stone-900 px-4 py-2 text-sm text-white transition hover:bg-stone-700"
                >
                  View {moerEnabledLocation.name} with marginal CO2
                </button>
              </div>
            ) : null}
          </section>
        ) : null}

        {activeTab === "mood" ? (
          <div className="grid gap-5 lg:grid-cols-[1.3fr_0.9fr]">
            <div className="grid gap-4">
              <section className="rounded-[1.5rem] border border-[var(--panel-border)] bg-white/72 p-5 shadow-sm">
                <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
                  Signal Index Scale
                </p>
                <div className="mt-4">
                  <div
                    aria-hidden="true"
                    className="h-3 w-full rounded-full border border-white/20 shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
                    style={{
                      background:
                        "linear-gradient(90deg, rgba(120,197,255,0.96) 0%, rgba(174,229,255,0.92) 18%, rgba(255,210,120,0.9) 50%, rgba(255,150,96,0.94) 76%, rgba(210,68,58,0.96) 100%)"
                    }}
                  />
                  <div className="mt-2 flex items-center justify-between gap-4 text-xs uppercase tracking-[0.2em] text-stone-700">
                    <div className="flex flex-col">
                      <span>Clean</span>
                      <span className="mt-1 text-[0.65rem] tracking-[0.18em] text-stone-500">
                        Signal Index 0
                      </span>
                    </div>
                    <div className="text-right">
                      <span>Dirty</span>
                      <span className="mt-1 block text-[0.65rem] tracking-[0.18em] text-stone-500">
                        Signal Index 100
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              <section
                className="relative overflow-hidden rounded-[2rem] border border-[var(--panel-border)] bg-stone-950 p-8 text-stone-100"
                style={{
                  background: scenePalette.sky
                }}
              >
                <div
                  className="pointer-events-none absolute inset-0 opacity-90 transition-all duration-700"
                  style={{
                    background: `radial-gradient(circle at 24% 24%, ${scenePalette.glow}, transparent 30%), radial-gradient(circle at 72% 18%, ${scenePalette.ring}, transparent 24%), radial-gradient(circle at 58% 70%, ${scenePalette.pulse}, transparent 36%)`
                  }}
                />
                <div className="pointer-events-none absolute inset-x-[-6%] top-[14%] h-40 rounded-full bg-white/10 blur-3xl" />
                <div
                  className="scene-orb pointer-events-none absolute left-[12%] top-[14%] h-36 w-36 rounded-full blur-[1px]"
                  style={orbStyle}
                />
                <div
                  className="scene-wave pointer-events-none absolute bottom-[18%] left-[-8%] h-40 w-[78%] rounded-[50%] blur-2xl"
                  style={{
                    background: `linear-gradient(180deg, rgba(255,255,255,0.02), ${scenePalette.ring})`
                  }}
                />
                <div
                  className="scene-wave pointer-events-none absolute bottom-[10%] right-[-15%] h-44 w-[74%] rounded-[50%] blur-2xl"
                  style={{
                    animationDelay: "1.2s",
                    background: `linear-gradient(180deg, rgba(255,255,255,0.02), ${scenePalette.pulse})`
                  }}
                />
                {Array.from({ length: particleCount }).map((_, index) => (
                  <span
                    key={index}
                    className="scene-particle pointer-events-none absolute rounded-full bg-white/80"
                    style={{
                      left: `${12 + index * (72 / Math.max(1, particleCount - 1))}%`,
                      top: `${18 + (index % 3) * 14}%`,
                      width: `${4 + (index % 3)}px`,
                      height: `${4 + (index % 3)}px`,
                      opacity: 0.24 + (index % 4) * 0.08,
                      animationDelay: `${index * 0.7}s`
                    }}
                  />
                ))}
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-[42%]"
                  style={{
                    background: `linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.14) 18%, ${scenePalette.ridgeSecondary} 18%, ${scenePalette.ridgeSecondary} 38%, ${scenePalette.ridge} 38%, ${scenePalette.ridge} 100%)`,
                    clipPath:
                      "polygon(0 72%, 12% 64%, 24% 70%, 34% 58%, 46% 63%, 58% 44%, 69% 56%, 81% 41%, 100% 58%, 100% 100%, 0 100%)"
                  }}
                />
                <div className="relative flex min-h-[24rem] flex-col justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.3em] text-stone-300">
                      Live atmosphere
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm text-stone-100">
                    <span className="rounded-full border border-white/20 bg-white/10 px-4 py-2 shadow-[0_10px_24px_rgba(0,0,0,0.18)] backdrop-blur-sm">
                      Palette: {selectedState?.palette_name ?? "dawn-waiting"}
                    </span>
                    <span className="rounded-full border border-white/20 bg-white/10 px-4 py-2 shadow-[0_10px_24px_rgba(0,0,0,0.18)] backdrop-blur-sm">
                      Last updated:{" "}
                      {selectedState?.updated_at
                        ? new Date(selectedState.updated_at).toLocaleTimeString()
                        : "pending"}
                    </span>
                    <span className="rounded-full border border-white/20 bg-white/10 px-4 py-2 shadow-[0_10px_24px_rgba(0,0,0,0.18)] backdrop-blur-sm">
                      Current MOER: {formatNumber(selectedState?.co2_moer ?? null, "lbs/MWh")}
                    </span>
                  </div>
                </div>
              </section>
            </div>

            <section className="grid gap-4">
              {metrics.map((metric) => (
                <article
                  key={metric.label}
                  className="relative rounded-[1.5rem] border border-[var(--panel-border)] bg-white/75 p-5"
                >
                  <div className="flex items-center gap-2">
                    <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
                      {metric.label}
                    </p>
                    {metric.label === "Signal Index" ? (
                      <div className="relative">
                        <button
                          type="button"
                          aria-expanded={isSignalIndexInfoOpen}
                          aria-label="Explain the signal index"
                          onClick={() => setIsSignalIndexInfoOpen((current) => !current)}
                          className="flex h-6 w-6 items-center justify-center rounded-full border border-stone-300 bg-white text-xs font-medium text-stone-600 transition hover:border-stone-500 hover:text-stone-900"
                        >
                          i
                        </button>
                        {isSignalIndexInfoOpen ? (
                          <div className="absolute left-0 top-9 z-20 w-[min(26rem,calc(100vw-5rem))] rounded-[1.25rem] border border-stone-200 bg-stone-950 p-4 text-sm leading-6 text-stone-100 shadow-[0_18px_50px_rgba(16,20,24,0.26)]">
                            <p>
                              In WattTime v3, the signal index is defined as a 0-100
                              percentile of the current <code>co2_moer</code>{" "}
                              relative to the upcoming 24 hours for that region. The Marginal Operating Emissions Rate (MOER) represents the emissions rate of the electricity generator(s) that are responding to changes in load on the local grid at a certain time. The MOER includes the effects of renewable curtailment and import/export between grid regions. The units of MOER are the amount of pollution per unit of energy (lbs/MWh).
                            </p>
                            <p className="mt-4">
                              That makes it useful for three reasons:
                            </p>
                            <ul className="mt-3 space-y-2 text-stone-200">
                              <li>
                                It supports timing decisions. If the index is
                                high now, you likely should delay flexible usage
                                because cleaner intervals are expected later
                                within the next day.
                              </li>
                              <li>
                                It simplifies UX. &ldquo;Dirty now, cleaner
                                later&rdquo; is easier to explain than raw
                                lbs/MWh.
                              </li>
                              <li>
                                It is locally contextual. Different grids have
                                very different absolute MOER ranges, so a
                                percentile is often more meaningful than
                                comparing raw values across places.
                              </li>
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <p className="mt-3 text-2xl text-stone-950">{metric.value}</p>
                  <p className="mt-3 text-sm leading-6 text-stone-600">
                    {metric.description}
                  </p>
                </article>
              ))}
            </section>
          </div>
        ) : (
          <section className="rounded-[2rem] border border-[var(--panel-border)] bg-white/75 p-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
                  Live Data Table
                </p>
                <h2 className="mt-2 text-3xl tracking-[-0.03em] text-stone-950">
                  Source values for {selectedLocation?.name ?? "the selected location"}
                </h2>
              </div>
              <div className="text-sm text-stone-600">
                <p>Last updated: <span className="font-medium text-stone-900">{selectedUpdatedAt}</span></p>
              </div>
            </div>

            <div className="mt-6 overflow-hidden rounded-[1.5rem] border border-[var(--panel-border)]">
              <table className="w-full border-collapse text-left">
                <thead className="bg-stone-900 text-white">
                  <tr>
                    <th className="px-4 py-3 text-sm font-medium">Field</th>
                    <th className="px-4 py-3 text-sm font-medium">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {dataRows.map((row, index) => (
                    <tr
                      key={row.field}
                      className={index % 2 === 0 ? "bg-white" : "bg-stone-50"}
                    >
                      <td className="px-4 py-3 text-sm font-medium text-stone-700">
                        {row.field}
                      </td>
                      <td className="px-4 py-3 text-sm text-stone-950">{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
