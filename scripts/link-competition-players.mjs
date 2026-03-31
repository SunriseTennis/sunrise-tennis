/**
 * Link competition_players to imported family players by name matching.
 *
 * Competition players were seeded with names but without player_id links.
 * This script matches them to the newly imported players by first + last name.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/link-competition-players.mjs
 *
 * Options:
 *   --dry-run    Show matches without updating DB
 */

const SUPABASE_URL = "https://cdtsviwasgblnqdambis.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes("--dry-run");

if (!SERVICE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY env var required");
  process.exit(1);
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function supabaseGet(table, query = "") {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: "GET",
    headers,
  });
  return res.json();
}

async function supabasePatch(table, query, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (res.status >= 400) {
    throw new Error(`PATCH ${table} failed: ${res.status} ${JSON.stringify(body)}`);
  }
  return body;
}

/**
 * Normalize a name for fuzzy matching: lowercase, strip hyphens, collapse spaces
 */
function normalize(name) {
  return (name || "")
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function run() {
  console.log(DRY_RUN ? "=== DRY RUN ===" : "=== LINKING COMPETITION PLAYERS ===");

  // 1. Get all competition players without a player_id link
  const compPlayers = await supabaseGet(
    "competition_players",
    "select=id,first_name,last_name,player_id&player_id=is.null"
  );
  console.log(`Unlinked competition players: ${compPlayers.length}`);

  if (compPlayers.length === 0) {
    console.log("No unlinked players to process.");
    return;
  }

  // 2. Get all imported players
  const players = await supabaseGet(
    "players",
    "select=id,first_name,last_name"
  );

  // Build lookup: "first last" → player
  const playerMap = new Map();
  for (const p of players) {
    const key = normalize(`${p.first_name} ${p.last_name}`);
    playerMap.set(key, p);
  }

  let matched = 0;
  let unmatched = 0;
  const unmatchedNames = [];

  for (const cp of compPlayers) {
    const cpName = normalize(`${cp.first_name} ${cp.last_name}`);
    const match = playerMap.get(cpName);

    if (match) {
      if (!DRY_RUN) {
        try {
          await supabasePatch(
            "competition_players",
            `id=eq.${cp.id}`,
            { player_id: match.id }
          );
        } catch (e) {
          console.error(`  ERROR linking ${cp.first_name} ${cp.last_name}: ${e.message}`);
          continue;
        }
      }
      console.log(`  LINKED: ${cp.first_name} ${cp.last_name} → ${match.id}`);
      matched++;
    } else {
      unmatchedNames.push(`${cp.first_name} ${cp.last_name}`);
      unmatched++;
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Matched: ${matched}`);
  console.log(`Unmatched: ${unmatched}`);
  if (unmatchedNames.length > 0) {
    console.log("\nUnmatched competition players (no family player found):");
    unmatchedNames.forEach((n) => console.log(`  - ${n}`));
  }
}

run().catch(console.error);
