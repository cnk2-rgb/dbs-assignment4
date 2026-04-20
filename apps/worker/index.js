import { createClient } from "@supabase/supabase-js";

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 60000);
const WATTTIME_LOGIN_URL = "https://api2.watttime.org/v2/login";
const WATTTIME_BA_FROM_LOC_URL = "https://api2.watttime.org/v2/ba-from-loc";
const WATTTIME_INDEX_URL = "https://api2.watttime.org/v2/index";

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
  const response = await fetch(
    `${WATTTIME_BA_FROM_LOC_URL}?latitude=${location.latitude}&longitude=${location.longitude}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      `WattTime ba-from-loc failed for ${location.name} with status ${response.status}`
    );
  }

  return response.json();
}

async function fetchRealtimeIndex(token, balancingAuthority) {
  const response = await fetch(
    `${WATTTIME_INDEX_URL}?ba=${encodeURIComponent(
      balancingAuthority
    )}&style=all`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      `WattTime index failed for ${balancingAuthority} with status ${response.status}`
    );
  }

  return response.json();
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
  const index = await fetchRealtimeIndex(token, region.abbrev);
  const emissionsPercentile =
    index.percent === undefined || index.percent === null
      ? null
      : Number(index.percent);
  const co2Moer =
    index.moer === undefined || index.moer === null ? null : Number(index.moer);
  const moodLevel = deriveMoodLevel(emissionsPercentile);

  return {
    captured_at: index.point_time ?? new Date().toISOString(),
    region_name: region.name ?? null,
    region_abbrev: region.abbrev ?? null,
    emissions_percentile: emissionsPercentile,
    co2_moer: co2Moer,
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
