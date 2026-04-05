/**
 * Seed test data for Sunrise Tennis PWA
 *
 * Creates 10 test families (17 players), 2 test coaches, and auth users for all.
 * All test emails use @sunrise.test domain, display IDs use T001-T010.
 *
 * Usage:
 *   cd /c/Users/maxim/Projects/sunrise-tennis
 *   export $(grep SUPABASE_SERVICE_ROLE_KEY .env.local | xargs)
 *   node scripts/seed-test-data.mjs
 */

const SUPABASE_URL = "https://cdtsviwasgblnqdambis.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = "Testsunrise2026!";

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

// ── Helpers ────────────────────────────────────────────────────────────

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
  const result = await res.json();
  console.log(`  OK ${table}: ${rows.length} row(s)`);
  return result;
}

async function restSelect(table, query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
  });
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

async function createAuthUser(email) {
  // Check if user already exists
  const checkRes = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1`,
    {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
    }
  );

  // Try to create - if 422, user already exists
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password: PASSWORD,
      email_confirm: true,
    }),
  });

  if (res.status === 422) {
    // User already exists — find their ID
    const listRes = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1000`,
      {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
      }
    );
    const listData = await listRes.json();
    const existing = listData.users?.find((u) => u.email === email);
    if (existing) {
      console.log(`  EXISTS auth user: ${email} (${existing.id})`);
      return existing.id;
    }
    console.error(`  FAILED to find existing user: ${email}`);
    return null;
  }

  if (res.status >= 400) {
    const body = await res.text();
    console.error(`  FAILED auth user ${email}: ${res.status} ${body}`);
    return null;
  }

  const data = await res.json();
  console.log(`  OK auth user: ${email} (${data.id})`);
  return data.id;
}

// ── Deterministic UUIDs ────────────────────────────────────────────────
// Families: aaaaaaaa-test-0000-0000-00000000000X
// Players:  bbbbbbbb-test-0000-0000-00000000000X
// Coaches:  cccccccc-test-0000-0000-00000000000X

function familyUUID(n) {
  return `aaaa0000-0000-4000-a000-${String(n).padStart(12, "0")}`;
}
function playerUUID(n) {
  return `bbbb0000-0000-4000-a000-${String(n).padStart(12, "0")}`;
}
function coachUUID(n) {
  return `cccc0000-0000-4000-a000-${String(n).padStart(12, "0")}`;
}

// ── Test Data Definitions ──────────────────────────────────────────────

const TEST_FAMILIES = [
  {
    num: 1,
    name: "Anderson",
    parent: "Sarah Anderson",
    players: [
      { first: "Liam", last: "Anderson", level: "red", dob: "2017-03-15", gender: "male" },
    ],
  },
  {
    num: 2,
    name: "Bennett",
    parent: "James Bennett",
    players: [
      { first: "Olivia", last: "Bennett", level: "red", dob: "2016-08-22", gender: "female" },
      { first: "Noah", last: "Bennett", level: "orange", dob: "2014-11-10", gender: "male" },
    ],
  },
  {
    num: 3,
    name: "Clarke",
    parent: "Michelle Clarke",
    players: [
      { first: "Ava", last: "Clarke", level: "orange", dob: "2015-01-30", gender: "female" },
    ],
  },
  {
    num: 4,
    name: "Davies",
    parent: "Andrew Davies",
    players: [
      { first: "Ethan", last: "Davies", level: "green", dob: "2013-06-18", gender: "male" },
      { first: "Mia", last: "Davies", level: "yellow", dob: "2011-09-05", gender: "female" },
    ],
  },
  {
    num: 5,
    name: "Evans",
    parent: "Karen Evans",
    players: [
      { first: "Sophia", last: "Evans", level: "red", dob: "2017-02-14", gender: "female" },
      { first: "Jack", last: "Evans", level: "red", dob: "2016-07-28", gender: "male" },
      { first: "Lily", last: "Evans", level: "orange", dob: "2014-04-03", gender: "female" },
    ],
  },
  {
    num: 6,
    name: "Foster",
    parent: "David Foster",
    players: [
      { first: "Thomas", last: "Foster", level: "yellow", dob: "2012-10-12", gender: "male" },
    ],
  },
  {
    num: 7,
    name: "Green",
    parent: "Rachel Green",
    players: [
      { first: "Charlotte", last: "Green", level: "green", dob: "2013-12-20", gender: "female" },
      { first: "William", last: "Green", level: "green", dob: "2014-05-08", gender: "male" },
    ],
  },
  {
    num: 8,
    name: "Harris",
    parent: "Mark Harris",
    players: [
      { first: "Amelia", last: "Harris", level: "orange", dob: "2015-07-25", gender: "female" },
    ],
  },
  {
    num: 9,
    name: "Irving",
    parent: "Lisa Irving",
    players: [
      { first: "Oliver", last: "Irving", level: "yellow", dob: "2011-11-16", gender: "male" },
      { first: "Isabella", last: "Irving", level: "red", dob: "2017-08-09", gender: "female" },
    ],
  },
  {
    num: 10,
    name: "Johnson",
    parent: "Peter Johnson",
    players: [
      { first: "Ruby", last: "Johnson", level: "blue", dob: "2019-04-22", gender: "female" },
    ],
  },
];

const TEST_COACHES = [
  { num: 1, name: "Test-Alice", email: "tc1@sunrise.test", phone: "0400000001" },
  { num: 2, name: "Test-Ben", email: "tc2@sunrise.test", phone: "0400000002" },
];

// Program name → player level mapping for enrollment
const LEVEL_TO_PROGRAMS = {
  blue: ["Tue Blue Ball"],
  red: ["Mon Red Ball", "Tue Red Ball", "Wed Girls Red Ball", "Thu Red Squad"],
  orange: ["Mon Orange Ball", "Tue Orange Ball"],
  green: ["Mon Green Ball", "Tue Green Ball"],
  yellow: ["Mon Yellow Ball", "Wed Yellow Ball", "Thu Yellow Squad", "Wed Girls Yellow"],
};

// Which program each player should enroll in (by family num + player index)
const ENROLLMENT_MAP = {
  "1-0": "Mon Red Ball",
  "2-0": "Tue Red Ball",
  "2-1": "Mon Orange Ball",
  "3-0": "Tue Orange Ball",
  "4-0": "Mon Green Ball",
  "4-1": "Mon Yellow Ball",
  "5-0": "Wed Girls Red Ball",
  "5-1": "Tue Red Ball",
  "5-2": "Tue Orange Ball",
  "6-0": "Thu Yellow Squad",
  "7-0": "Mon Green Ball",
  "7-1": "Tue Green Ball",
  "8-0": "Mon Orange Ball",
  "9-0": "Wed Yellow Ball",
  "9-1": "Thu Red Squad",
  "10-0": "Tue Blue Ball",
};

// Coach assignments (test coaches as assistants on real programs)
const COACH_PROGRAMS = {
  1: ["Mon Red Ball", "Tue Orange Ball"],
  2: ["Mon Green Ball", "Thu Yellow Squad"],
};

// ── Main ───────────────────────────────────────────────────────────────

async function run() {
  console.log("\n=== Seeding Test Data ===\n");

  // 1. Fetch existing programs to get UUIDs
  console.log("Fetching programs...");
  const programs = await restSelect("programs", "status=eq.active&select=id,name");
  const programByName = Object.fromEntries(programs.map((p) => [p.name, p.id]));
  console.log(`  Found ${programs.length} active programs\n`);

  // 2. Create auth users for coaches
  console.log("Creating coach auth users...");
  const coachAuthIds = {};
  for (const coach of TEST_COACHES) {
    const userId = await createAuthUser(coach.email);
    coachAuthIds[coach.num] = userId;
  }

  // 3. Insert coaches
  console.log("\nInserting coaches...");
  await restInsert(
    "coaches",
    TEST_COACHES.map((c) => ({
      id: coachUUID(c.num),
      user_id: coachAuthIds[c.num],
      name: c.name,
      phone: c.phone,
      email: c.email,
      status: "active",
      is_owner: false,
      hourly_rate: { group_rate_cents: 2500, private_rate_cents: 3500, client_private_rate_cents: 6000 },
    }))
  );

  // 4. Insert user_roles for coaches
  console.log("Inserting coach user_roles...");
  await restInsert(
    "user_roles",
    TEST_COACHES.map((c) => ({
      user_id: coachAuthIds[c.num],
      role: "coach",
      coach_id: coachUUID(c.num),
    }))
  );

  // 5. Assign test coaches to programs
  console.log("Assigning coaches to programs...");
  const coachProgramRows = [];
  for (const [coachNum, programNames] of Object.entries(COACH_PROGRAMS)) {
    for (const pName of programNames) {
      const pid = programByName[pName];
      if (!pid) {
        console.error(`  Program not found: ${pName}`);
        continue;
      }
      coachProgramRows.push({
        program_id: pid,
        coach_id: coachUUID(Number(coachNum)),
        role: "assistant",
      });
    }
  }
  if (coachProgramRows.length > 0) {
    await restInsert("program_coaches", coachProgramRows);
  }

  // 6. Create auth users for parents
  console.log("\nCreating parent auth users...");
  const parentAuthIds = {};
  for (const family of TEST_FAMILIES) {
    const email = `tp${family.num}@sunrise.test`;
    const userId = await createAuthUser(email);
    parentAuthIds[family.num] = userId;
  }

  // 7. Insert families
  console.log("\nInserting families...");
  await restInsert(
    "families",
    TEST_FAMILIES.map((f) => ({
      id: familyUUID(f.num),
      display_id: `T${String(f.num).padStart(3, "0")}`,
      family_name: f.name,
      primary_contact: {
        name: f.parent,
        email: `tp${f.num}@sunrise.test`,
        phone: `040000${String(f.num).padStart(4, "0")}`,
      },
      status: "active",
      notes: "Test family - created by seed-test-data.mjs",
    }))
  );

  // 8. Insert family_balance rows
  console.log("Inserting family_balance...");
  await restInsert(
    "family_balance",
    TEST_FAMILIES.map((f) => ({
      family_id: familyUUID(f.num),
      balance_cents: 0,
      confirmed_balance_cents: 0,
      projected_balance_cents: 0,
    }))
  );

  // 9. Insert user_roles for parents
  console.log("Inserting parent user_roles...");
  await restInsert(
    "user_roles",
    TEST_FAMILIES.map((f) => ({
      user_id: parentAuthIds[f.num],
      role: "parent",
      family_id: familyUUID(f.num),
    }))
  );

  // 10. Insert players
  console.log("\nInserting players...");
  let playerNum = 0;
  const playerRows = [];
  const playerIndex = []; // track {familyNum, playerIdx, playerUUID, level} for enrollment
  for (const family of TEST_FAMILIES) {
    family.players.forEach((p, idx) => {
      playerNum++;
      const pid = playerUUID(playerNum);
      playerRows.push({
        id: pid,
        family_id: familyUUID(family.num),
        first_name: p.first,
        last_name: p.last,
        level: p.level,
        ball_color: p.level,
        dob: p.dob,
        gender: p.gender,
        status: "active",
        media_consent: true,
      });
      playerIndex.push({
        familyNum: family.num,
        playerIdx: idx,
        playerId: pid,
        level: p.level,
        familyId: familyUUID(family.num),
      });
    });
  }
  await restInsert("players", playerRows);

  // 11. Enroll players in programs (program_roster + bookings)
  console.log("\nEnrolling players in programs...");
  const rosterRows = [];
  const bookingRows = [];
  for (const pi of playerIndex) {
    const key = `${pi.familyNum}-${pi.playerIdx}`;
    const programName = ENROLLMENT_MAP[key];
    if (!programName) continue;

    const programId = programByName[programName];
    if (!programId) {
      console.error(`  Program not found for enrollment: ${programName}`);
      continue;
    }

    rosterRows.push({
      program_id: programId,
      player_id: pi.playerId,
      status: "enrolled",
    });

    bookingRows.push({
      family_id: pi.familyId,
      player_id: pi.playerId,
      program_id: programId,
      booking_type: "term_enrollment",
      status: "confirmed",
      payment_option: "pay_later",
      booked_by: parentAuthIds[pi.familyNum],
    });
  }

  if (rosterRows.length > 0) {
    await restInsert("program_roster", rosterRows);
  }
  if (bookingRows.length > 0) {
    await restInsert("bookings", bookingRows);
  }

  // 12. Create per-session charges for each enrollment
  console.log("\nCreating per-session charges...");
  const chargeRows = [];
  const programSessions = {}; // cache: programId -> sessions[]
  const programPricing = {}; // cache: programId -> per_session_cents

  for (const pi of playerIndex) {
    const key = `${pi.familyNum}-${pi.playerIdx}`;
    const programName = ENROLLMENT_MAP[key];
    if (!programName) continue;

    const programId = programByName[programName];
    if (!programId) continue;

    // Fetch sessions for this program (cached)
    if (!programSessions[programId]) {
      const today = new Date().toISOString().split("T")[0];
      programSessions[programId] = await restSelect(
        "sessions",
        `program_id=eq.${programId}&status=eq.scheduled&date=gte.${today}&order=date.asc&select=id,date`
      );
    }

    // Fetch pricing (cached)
    if (!programPricing[programId]) {
      const details = await restSelect("programs", `id=eq.${programId}&select=per_session_cents`);
      programPricing[programId] = details?.[0]?.per_session_cents ?? 2000;
    }

    const sessions = programSessions[programId];
    const perSessionCents = programPricing[programId];

    for (const session of sessions) {
      chargeRows.push({
        family_id: pi.familyId,
        player_id: pi.playerId,
        type: "session",
        source_type: "enrollment",
        session_id: session.id,
        program_id: programId,
        description: `${programName} - ${session.date}`,
        amount_cents: perSessionCents,
        status: "pending",
      });
    }
  }

  if (chargeRows.length > 0) {
    // Insert in batches of 100 (REST API payload limit)
    for (let i = 0; i < chargeRows.length; i += 100) {
      const batch = chargeRows.slice(i, i + 100);
      await restInsert("charges", batch);
    }
    console.log(`  Created ${chargeRows.length} charges across ${rosterRows.length} enrollments`);
  }

  // 13. Recalculate balances for all test families
  console.log("\nRecalculating family balances...");
  for (const f of TEST_FAMILIES) {
    await rpcCall("recalculate_family_balance", { target_family_id: familyUUID(f.num) });
  }
  console.log("  OK recalculated 10 family balances");

  // ── Summary ───────────────────────────���──────────────────────────────
  console.log("\n=== Test Data Seeded Successfully ===\n");
  console.log("Families: 10 (T001-T010)");
  console.log(`Players:  ${playerRows.length}`);
  console.log("Coaches:  2 (Test-Alice, Test-Ben)");
  console.log(`Enrollments: ${rosterRows.length}`);
  console.log(`Charges:  ${chargeRows.length}`);
  console.log("");
  console.log("\nLogin credentials (password for all: " + PASSWORD + "):\n");
  for (const f of TEST_FAMILIES) {
    console.log(`  Parent T${String(f.num).padStart(3, "0")} (${f.name}):  tp${f.num}@sunrise.test`);
  }
  for (const c of TEST_COACHES) {
    console.log(`  Coach ${c.name}:  ${c.email}`);
  }
  console.log("");
}

run().catch(console.error);
