/**
 * Update programs to Term 2 2026 and auto-assign rosters by ball colour.
 *
 * SA Term 2 2026: 27 Apr - 4 Jul (approx 10 weeks)
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/setup-term2.mjs
 *
 * Options:
 *   --dry-run    Print what would be changed without writing to DB
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

async function supabasePost(table, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation,resolution=ignore-duplicates" },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (res.status >= 400) {
    throw new Error(`POST ${table} failed: ${res.status} ${JSON.stringify(body)}`);
  }
  return body;
}

/**
 * Map program level to the ball_color values used by players.
 * Programs use levels like "red", "orange", "orange-green", "yellow", etc.
 * Players use ball_color: "blue", "red", "orange", "green", "yellow"
 */
function levelToColors(level) {
  if (!level) return [];
  const l = level.toLowerCase();
  if (l === "red-orange") return ["red", "orange"];
  if (l === "orange-green") return ["orange", "green"];
  if (l === "elite") return ["yellow"]; // elite squads are yellow+ players
  return [l];
}

async function run() {
  console.log(DRY_RUN ? "=== DRY RUN ===" : "=== SETTING UP TERM 2 ===");

  // 1. Update all active programs to Term 2
  const programs = await supabaseGet(
    "programs",
    "select=id,name,slug,level,type,status&status=eq.active&order=day_of_week,start_time"
  );
  console.log(`Found ${programs.length} active programs`);

  if (!DRY_RUN) {
    // Update term field for all active programs
    const updated = await supabasePatch(
      "programs",
      "status=eq.active",
      { term: "Term 2 2026" }
    );
    console.log(`Updated ${updated.length} programs to Term 2 2026`);
  } else {
    console.log(`[DRY] Would update ${programs.length} programs to Term 2 2026`);
  }

  // 2. Get all active players with their ball_color
  const players = await supabaseGet(
    "players",
    "select=id,first_name,last_name,ball_color,family_id&status=eq.active&order=last_name"
  );
  console.log(`Found ${players.length} active players`);

  // 3. Get existing roster entries to avoid duplicates
  const existingRoster = await supabaseGet(
    "program_roster",
    "select=program_id,player_id"
  );
  const rosterSet = new Set(existingRoster.map((r) => `${r.program_id}:${r.player_id}`));

  // 4. Auto-assign players to programs by ball colour
  const rosterEntries = [];
  let skipped = 0;

  for (const program of programs) {
    const matchingColors = levelToColors(program.level);
    if (matchingColors.length === 0) continue;

    const eligible = players.filter((p) => matchingColors.includes(p.ball_color));

    for (const player of eligible) {
      const key = `${program.id}:${player.id}`;
      if (rosterSet.has(key)) {
        skipped++;
        continue;
      }

      rosterEntries.push({
        program_id: program.id,
        player_id: player.id,
        status: "enrolled",
      });
    }
  }

  console.log(`\nRoster assignments: ${rosterEntries.length} new entries (${skipped} already exist)`);

  if (rosterEntries.length > 0) {
    // Show breakdown
    const byProgram = {};
    for (const entry of rosterEntries) {
      const prog = programs.find((p) => p.id === entry.program_id);
      const name = prog?.name || entry.program_id;
      byProgram[name] = (byProgram[name] || 0) + 1;
    }
    for (const [name, count] of Object.entries(byProgram).sort()) {
      console.log(`  ${name}: ${count} players`);
    }

    if (!DRY_RUN) {
      // Insert in batches of 50
      for (let i = 0; i < rosterEntries.length; i += 50) {
        const batch = rosterEntries.slice(i, i + 50);
        try {
          await supabasePost("program_roster", batch);
          console.log(`  Inserted batch ${Math.floor(i / 50) + 1} (${batch.length} entries)`);
        } catch (e) {
          console.error(`  ERROR inserting batch: ${e.message}`);
        }
      }
    }
  }

  console.log("\n=== DONE ===");
}

run().catch(console.error);
