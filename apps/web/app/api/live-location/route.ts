import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const WATTTIME_API_BASE_URL = "https://api.watttime.org";
const WATTTIME_LOGIN_URL = `${WATTTIME_API_BASE_URL}/login`;
const WATTTIME_REGION_FROM_LOC_URL = `${WATTTIME_API_BASE_URL}/v3/region-from-loc`;
const WATTTIME_SIGNAL_INDEX_URL = `${WATTTIME_API_BASE_URL}/v3/signal-index`;
const WATTTIME_HISTORICAL_URL = `${WATTTIME_API_BASE_URL}/v3/historical`;
const WATTTIME_SIGNAL_TYPE = "co2_moer";
const RECENT_HISTORICAL_WINDOW_MS = 15 * 60 * 1000;

type LiveLocationRequest = {
  name?: string;
  latitude?: number;
  longitude?: number;
};

function assertEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function createSupabaseAdmin() {
  return createClient(assertEnv("SUPABASE_URL"), assertEnv("SUPABASE_SERVICE_ROLE_KEY"));
}

function createBasicAuthHeader(username: string, password: string) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

async function loginToWattTime() {
  const username = assertEnv("WATTTIME_USERNAME");
  const password = assertEnv("WATTTIME_PASSWORD");
  const response = await fetch(WATTTIME_LOGIN_URL, {
    headers: {
      Authorization: createBasicAuthHeader(username, password)
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`WattTime login failed with status ${response.status}`);
  }

  const body = (await response.json()) as { token?: string };

  if (!body.token) {
    throw new Error("WattTime login response did not include a token.");
  }

  return body.token;
}

async function fetchBalancingAuthority(
  token: string,
  latitude: number,
  longitude: number
) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    signal_type: WATTTIME_SIGNAL_TYPE
  });
  const response = await fetch(`${WATTTIME_REGION_FROM_LOC_URL}?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`WattTime region-from-loc failed with status ${response.status}`);
  }

  return (await response.json()) as {
    region?: string | null;
    region_full_name?: string | null;
  };
}

async function fetchSignalIndex(token: string, region: string) {
  const params = new URLSearchParams({
    region,
    signal_type: WATTTIME_SIGNAL_TYPE
  });
  const response = await fetch(`${WATTTIME_SIGNAL_INDEX_URL}?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`WattTime signal-index failed with status ${response.status}`);
  }

  return (await response.json()) as {
    data?: Array<{
      point_time?: string | null;
      value?: number | string | null;
    }>;
  };
}

async function fetchRecentMoer(token: string, region: string) {
  const end = new Date();
  const start = new Date(end.getTime() - RECENT_HISTORICAL_WINDOW_MS);
  const params = new URLSearchParams({
    region,
    signal_type: WATTTIME_SIGNAL_TYPE,
    start: start.toISOString(),
    end: end.toISOString()
  });
  const response = await fetch(`${WATTTIME_HISTORICAL_URL}?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    cache: "no-store"
  });

  if (response.status === 403) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`WattTime historical failed with status ${response.status}`);
  }

  const body = (await response.json()) as {
    data?: Array<{
      point_time?: string | null;
      value?: number | string | null;
    }>;
  };
  const latestPoint = body.data?.at(-1);

  if (!latestPoint || latestPoint.value === null || latestPoint.value === undefined) {
    return null;
  }

  return {
    point_time: latestPoint.point_time ?? null,
    value: Number(latestPoint.value)
  };
}

function deriveMoodLevel(emissionsPercentile: number | null) {
  if (emissionsPercentile === null || Number.isNaN(emissionsPercentile)) {
    return "unknown";
  }

  if (emissionsPercentile < 34) {
    return "calm";
  }

  if (emissionsPercentile < 67) {
    return "active";
  }

  return "tense";
}

function derivePaletteName(moodLevel: string) {
  switch (moodLevel) {
    case "calm":
      return "mineral-morning";
    case "active":
      return "amber-current";
    case "tense":
      return "ember-pressure";
    default:
      return "dawn-waiting";
  }
}

async function findOrCreateLocation(name: string, latitude: number, longitude: number) {
  const supabase = createSupabaseAdmin();
  const { data: existingLocation, error: existingLocationError } = await supabase
    .from("locations")
    .select("id, name, latitude, longitude")
    .eq("latitude", latitude)
    .eq("longitude", longitude)
    .limit(1)
    .maybeSingle();

  if (existingLocationError) {
    throw existingLocationError;
  }

  if (existingLocation) {
    return existingLocation;
  }

  const { data: insertedLocation, error: insertLocationError } = await supabase
    .from("locations")
    .insert({
      name,
      latitude,
      longitude
    })
    .select("id, name, latitude, longitude")
    .single();

  if (insertLocationError) {
    throw insertLocationError;
  }

  return insertedLocation;
}

async function persistCurrentGridState(
  locationId: number,
  signals: {
    captured_at: string;
    region_name: string | null;
    region_abbrev: string | null;
    emissions_percentile: number | null;
    co2_moer: number | null;
    co2_aoer: null;
    health_damage: null;
    mood_level: string;
    palette_name: string;
  }
) {
  const supabase = createSupabaseAdmin();
  const payload = {
    location_id: locationId,
    ...signals,
    updated_at: new Date().toISOString()
  };
  const { error } = await supabase
    .from("current_grid_state")
    .upsert(payload, { onConflict: "location_id" });

  if (error) {
    throw error;
  }

  return payload;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LiveLocationRequest;
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const name = body.name?.trim() || "Your live location";

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json(
        { error: "Latitude and longitude are required." },
        { status: 400 }
      );
    }

    const token = await loginToWattTime();
    const [location, region] = await Promise.all([
      findOrCreateLocation(name, latitude, longitude),
      fetchBalancingAuthority(token, latitude, longitude)
    ]);

    if (!region.region) {
      throw new Error("WattTime did not return a balancing authority for this location.");
    }

    const [signalIndex, recentMoer] = await Promise.all([
      fetchSignalIndex(token, region.region),
      fetchRecentMoer(token, region.region)
    ]);
    const currentIndexPoint = signalIndex.data?.[0] ?? null;
    const emissionsPercentile =
      currentIndexPoint?.value === undefined || currentIndexPoint?.value === null
        ? null
        : Number(currentIndexPoint.value);
    const moodLevel = deriveMoodLevel(emissionsPercentile);
    const persistedState = await persistCurrentGridState(location.id, {
      captured_at:
        currentIndexPoint?.point_time ??
        recentMoer?.point_time ??
        new Date().toISOString(),
      region_name: region.region_full_name ?? null,
      region_abbrev: region.region ?? null,
      emissions_percentile: emissionsPercentile,
      co2_moer: recentMoer?.value ?? null,
      co2_aoer: null,
      health_damage: null,
      mood_level: moodLevel,
      palette_name: derivePaletteName(moodLevel)
    });

    return NextResponse.json({
      location: {
        ...location,
        source: "browser"
      },
      state: persistedState
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load live location.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
