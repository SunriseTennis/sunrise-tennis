/**
 * One-off: create per-session charges for existing test enrollments
 * and recalculate balances.
 *
 * Usage:
 *   cd /c/Users/maxim/Projects/sunrise-tennis
 *   export $(grep SUPABASE_SERVICE_ROLE_KEY .env.local | xargs)
 *   node scripts/fix-test-balances.mjs
 */

const SUPABASE_URL = "https://cdtsviwasgblnqdambis.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY env var");
  process.exit(1);
}

const restHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "resolution=ignore-duplicates,return=representation",
};

async function restSelect(table, query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  return res.json();
}

async function restInsert(table, data) {
  const rows = Array.isArray(data) ? data : [data];
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: restHeaders,
    body: JSON.stringify(rows),
  });
  if (res.status >= 400) {
    const body = await res.text();
    console.error(`  FAILED ${table}: ${res.status} ${body}`);
    return null;
  }
  console.log(`  OK ${table}: ${rows.length} row(s)`);
  return res.json();
}

async function rpcCall(fnName, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers: restHeaders,
    body: JSON.stringify(params),
  });
  if (res.status >= 400) {
    const body = await res.text();
    console.error(`  FAILED rpc/${fnName}: ${res.status} ${body}`);
    return null;
  }
  return res.json();
}

async function run() {
  console.log("\n=== Creating charges for test family enrollments ===\n");

  // Get all test families
  const families = await restSelect("families", "display_id=like.T*&select=id,display_id,family_name");
  console.log(`Found ${families.length} test families`);

  // Get all test players with enrollments
  const familyIds = families.map(f => f.id);
  const players = await restSelect(
    "players",
    `family_id=in.(${familyIds.join(",")})&select=id,first_name,family_id`
  );
  console.log(`Found ${players.length} test players`);

  // Get roster enrollments for test players
  const playerIds = players.map(p => p.id);
  const roster = await restSelect(
    "program_roster",
    `player_id=in.(${playerIds.join(",")})&status=eq.enrolled&select=player_id,program_id`
  );
  console.log(`Found ${roster.length} enrollments`);

  // Check existing charges to avoid duplicates
  const existingCharges = await restSelect(
    "charges",
    `family_id=in.(${familyIds.join(",")})&status=in.(pending,confirmed)&select=session_id,player_id`
  );
  const chargeKey = (sessionId, playerId) => `${sessionId}:${playerId}`;
  const existingSet = new Set(existingCharges.map(c => chargeKey(c.session_id, c.player_id)));
  console.log(`Found ${existingCharges.length} existing charges`);

  // Fetch sessions and pricing per program
  const programCache = {};
  const today = new Date().toISOString().split("T")[0];

  const chargeRows = [];
  for (const entry of roster) {
    const { player_id, program_id } = entry;
    const player = players.find(p => p.id === player_id);
    if (!player) continue;

    if (!programCache[program_id]) {
      const [sessions, progInfo] = await Promise.all([
        restSelect("sessions", `program_id=eq.${program_id}&status=eq.scheduled&date=gte.${today}&order=date.asc&select=id,date`),
        restSelect("programs", `id=eq.${program_id}&select=name,per_session_cents`),
      ]);
      programCache[program_id] = {
        sessions,
        name: progInfo?.[0]?.name ?? "Program",
        perSessionCents: progInfo?.[0]?.per_session_cents ?? 2000,
      };
    }

    const { sessions, name, perSessionCents } = programCache[program_id];
    if (!perSessionCents) continue; // skip programs with no pricing (e.g. comps)

    for (const session of sessions) {
      if (existingSet.has(chargeKey(session.id, player_id))) continue;
      chargeRows.push({
        family_id: player.family_id,
        player_id,
        type: "session",
        source_type: "enrollment",
        session_id: session.id,
        program_id,
        description: `${name} - ${session.date}`,
        amount_cents: perSessionCents,
        status: "pending",
      });
    }
  }

  console.log(`\nCreating ${chargeRows.length} new charges...`);
  if (chargeRows.length > 0) {
    for (let i = 0; i < chargeRows.length; i += 100) {
      const batch = chargeRows.slice(i, i + 100);
      await restInsert("charges", batch);
    }
  }

  // Recalculate balances
  console.log("\nRecalculating balances...");
  for (const f of families) {
    const result = await rpcCall("recalculate_family_balance", { target_family_id: f.id });
    const balanceDollars = result != null ? (result / 100).toFixed(2) : "error";
    console.log(`  ${f.display_id} (${f.family_name}): $${balanceDollars}`);
  }

  console.log("\n=== Done ===\n");
}

run().catch(console.error);
