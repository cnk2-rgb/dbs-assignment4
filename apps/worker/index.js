import { createClient } from "@supabase/supabase-js";

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 60000);
const WATTTIME_API_BASE_URL = "https://api.watttime.org";
const WATTTIME_LOGIN_URL = `${WATTTIME_API_BASE_URL}/login`;
const WATTTIME_REGION_FROM_LOC_URL = `${WATTTIME_API_BASE_URL}/v3/region-from-loc`;
const WATTTIME_SIGNAL_INDEX_URL = `${WATTTIME_API_BASE_URL}/v3/signal-index`;
const WATTTIME_HISTORICAL_URL = `${WATTTIME_API_BASE_URL}/v3/historical`;
const WATTTIME_SIGNAL_TYPE = "co2_moer";
const RECENT_HISTORICAL_WINDOW_MS = 15 * 60 * 1000;

function assertEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function createSupabase() {
  return createClient(
    assertEnv("SUPABASE_URL"),
    assertEnv("SUPABASE_SERVICE_ROLE_KEY")
  );
}

function createBasicAuthHeader(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

async function loginToWattTime() {
  const username = assertEnv("WATTTIME_USERNAME");
  const password = assertEnv("WATTTIME_PASSWORD");

  const response = await fetch(WATTTIME_LOGIN_URL, {
    headers: {
      Authorization: createBasicAuthHeader(username, password)
    }
  });

  if (!response.ok) {
    throw new Error(`WattTime login failed with status ${response.status}`);
  }

  const body = await response.json();

  if (!body.token) {
    throw new Error("WattTime login response did not include a token.");
  }

  return body.token;
}

async function fetchBalancingAuthority(token, location) {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    signal_type: WATTTIME_SIGNAL_TYPE
  });
  const response = await fetch(`${WATTTIME_REGION_FROM_LOC_URL}?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(
      `WattTime region-from-loc failed for ${location.name} with status ${response.status}`
    );
  }

  return response.json();
}

async function fetchSignalIndex(token, region) {
  const params = new URLSearchParams({
    region,
    signal_type: WATTTIME_SIGNAL_TYPE
  });
  const response = await fetch(`${WATTTIME_SIGNAL_INDEX_URL}?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(
      `WattTime signal-index failed for ${region} with status ${response.status}`
    );
  }

  return response.json();
}

async function fetchRecentMoer(token, region) {
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
    }
  });

  if (response.status === 403) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `WattTime historical failed for ${region} with status ${response.status}`
    );
  }

  const body = await response.json();
  const latestPoint = body.data?.at(-1);

  return latestPoint?.value === undefined || latestPoint?.value === null
    ? null
    : {
        point_time: latestPoint.point_time ?? null,
        value: Number(latestPoint.value)
      };
}

function deriveMoodLevel(emissionsPercentile) {
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

function derivePaletteName(moodLevel) {
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

async function fetchLocations(supabase) {
  const { data, error } = await supabase
    .from("locations")
    .select("id, name, latitude, longitude")
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function fetchWattTimeSignals(token, location) {
  const region = await fetchBalancingAuthority(token, location);
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

  return {
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
  };
}

async function upsertCurrentGridState(supabase, locationId, signals) {
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
}

async function pollOnce() {
  const supabase = createSupabase();
  const token = await loginToWattTime();
  const locations = await fetchLocations(supabase);

  for (const location of locations) {
    const signals = await fetchWattTimeSignals(token, location);
    await upsertCurrentGridState(supabase, location.id, signals);
    console.log(`Updated grid state for ${location.name}`);
  }

  if (locations.length === 0) {
    console.log("No locations found. Worker is idle until locations are seeded.");
  }
}

async function start() {
  console.log(`Grid Mood worker starting. Poll interval: ${POLL_INTERVAL_MS}ms`);

  while (true) {
    try {
      await pollOnce();
    } catch (error) {
      console.error("Worker poll failed:", error);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

start();
