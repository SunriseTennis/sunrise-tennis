/**
 * Breely → Supabase import (2026-05).
 *
 * Three things in one go:
 *   1. Delete T003 Clarke test family (FK-safe cascade) — frees up the
 *      surname slot for the new Clarke-Lauridsen family.
 *   2. Update secondary_contact on 4 existing families: C072 Vardanega,
 *      C048 Mugford, C050 Notridge, C053 Pekhart. Bans Modi (C047) was
 *      added manually by Maxim.
 *   3. Insert 20 new families + 22 players (5 sets of siblings: Joncheff,
 *      Martelle).
 *
 * 10 of the 20 are McAuley families; their players are tagged
 * school = "McAuley Community School".
 *
 * Player defaults: media_consent_* = false (3-tier opt-in default),
 * classifications = [], track = 'participation', no auth user, no invitation
 * (Maxim sends invites in a follow-up step). signup_source = 'legacy_import'
 * (allowed by the family_approval_state CHECK; these came from outside the
 * platform). approval_status = 'approved' so admin doesn't have to clear
 * them through /admin/approvals.
 *
 * Outputs: scripts/_out/breely-import-result-<date>.txt with the BCC line
 * (comma-separated, paste-ready into Gmail).
 *
 * Usage:
 *   op run --env-file=.env.op -- node scripts/import-breely-2026-05.mjs --dry-run
 *   op run --env-file=.env.op -- node scripts/import-breely-2026-05.mjs --apply
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const SUPABASE_URL = "https://cdtsviwasgblnqdambis.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DRY_RUN = process.argv.includes("--dry-run");
const APPLY = process.argv.includes("--apply");
if (!DRY_RUN && !APPLY) {
  console.error("Pass --dry-run OR --apply");
  process.exit(1);
}
if (!SERVICE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY env var required");
  process.exit(1);
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function sbGet(table, query = "") {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: "GET",
    headers,
  });
  if (!res.ok) {
    throw new Error(`GET ${table}?${query} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function sbPost(table, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`POST ${table} failed: ${res.status} ${text}`);
  }
  return JSON.parse(text);
}

async function sbPatch(table, query, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(data),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`PATCH ${table}?${query} failed: ${res.status} ${text}`);
  }
  return JSON.parse(text);
}

async function sbDelete(table, query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) {
    throw new Error(`DELETE ${table}?${query} failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data.length : 0;
}

// ── Data: 20 new families, 22 players ───────────────────────────────────

const MCAULEY = "McAuley Community School";

/**
 * Each entry:
 *   family_name (lowercase surname → C0XX)
 *   primary: { name, phone, email }
 *   secondary?: { name, phone? }
 *   players: [{ first_name, last_name, dob, gender?, medical?, school? }]
 */
const NEW_FAMILIES = [
  // 1. Doroja — McAuley
  {
    family_name: "Doroja",
    primary: { name: "Alodia Doroja", phone: "0467400845", email: "odiapi@yahoo.com" },
    secondary: { name: "Warren Doroja" },
    players: [{ first_name: "Phoebe", last_name: "Doroja", dob: "2019-03-24", gender: null, school: MCAULEY }],
  },
  // 2. Pummeroy
  {
    family_name: "Pummeroy",
    primary: { name: "Angela Pummeroy", phone: "0421830493", email: "angelahubbard08@yahoo.com.au" },
    secondary: null, // CSV had "Angela Pummeroy" again — same person, drop
    players: [{ first_name: "Max", last_name: "Pummeroy", dob: "2012-04-13", gender: null }],
  },
  // 3. Kamau (kid: Dylan Basil — surname differs)
  {
    family_name: "Kamau",
    primary: { name: "Anne Kamau", phone: "0449826204", email: "annekamau57@gmail.com" },
    secondary: { name: "Dancan Basil", phone: "0451083825" },
    players: [{ first_name: "Dylan", last_name: "Basil", dob: "2018-10-24", gender: null }],
  },
  // 4. Spurling — McAuley
  {
    family_name: "Spurling",
    primary: { name: "Bill Spurling", phone: "0401204713", email: "billspurling89@gmail.com" },
    secondary: { name: "Gertie Spurling", phone: "0488151110" },
    players: [{ first_name: "Penny", last_name: "Spurling", dob: "2020-05-28", gender: null, school: MCAULEY }],
  },
  // 5. Russelli — McAuley (kid: Nikki Russell — Russelli/Russell mismatch in CSV)
  {
    family_name: "Russelli",
    primary: { name: "Bita Russelli", phone: "0422550534", email: "bita.russell84@gmail.com" },
    secondary: { name: "Alan Naji", phone: "0448472104" },
    players: [{ first_name: "Nikki", last_name: "Russell", dob: "2021-01-04", gender: null, school: MCAULEY }],
  },
  // 6. Cordner — McAuley
  {
    family_name: "Cordner",
    primary: { name: "Carly Cordner", phone: "0414212806", email: "carly.cordner@gmail.com" },
    secondary: { name: "Allan Cordner", phone: "0480796850" },
    players: [{ first_name: "Evie", last_name: "Cordner", dob: "2019-10-06", gender: null, school: MCAULEY }],
  },
  // 7. Norsworthy
  {
    family_name: "Norsworthy",
    primary: { name: "Chad Norsworthy", phone: "0402528736", email: "chadnorsworthy@metrooffice.com.au" },
    secondary: null, // CSV had "Chad Norsworthy" repeated
    players: [{ first_name: "Darcy", last_name: "Norsworthy", dob: "2018-08-06", gender: null }],
  },
  // 8. Whitters — McAuley
  {
    family_name: "Whitters",
    primary: { name: "Danielle Whitters", phone: "0451029293", email: "daniellewhitters@gmail.com" },
    secondary: { name: "Anthony Whitters" },
    players: [{ first_name: "Asher", last_name: "Whitters", dob: "2017-01-03", gender: null, school: MCAULEY }],
  },
  // 9. Silke — McAuley (kid: Eve Johnson — secondary parent is Brian Johnson)
  {
    family_name: "Silke",
    primary: { name: "Edel Silke", phone: "0401468536", email: "edel.silke@gmail.com" },
    secondary: { name: "Brian Johnson", phone: "0466233565" },
    players: [{ first_name: "Eve", last_name: "Johnson", dob: "2017-08-13", gender: null, school: MCAULEY }],
  },
  // 10. Ramswamy (kid: Kyra Poovaiah)
  {
    family_name: "Ramswamy",
    primary: { name: "Greta Ramswamy", phone: "0420552629", email: "gretzr@gmail.com" },
    secondary: { name: "Prajwal Poovaiah" },
    players: [{ first_name: "Kyra", last_name: "Poovaiah", dob: "2016-10-27", gender: null }],
  },
  // 11. Smith — McAuley
  {
    family_name: "Smith",
    primary: { name: "Jess Smith", phone: "041903265", email: "jess.smith339@yahoo.com.au" },
    secondary: { name: "Adam Smith", phone: "0425354614" },
    players: [{ first_name: "Lexi", last_name: "Smith", dob: "2019-03-07", gender: null, school: MCAULEY }],
  },
  // 12. Elliott — McAuley
  {
    family_name: "Elliott",
    primary: { name: "Joanne Elliott", phone: "0418813392", email: "joandphil3@outlook.com" },
    secondary: null,
    players: [{ first_name: "Hugo", last_name: "Elliott", dob: "2019-06-07", gender: null, school: MCAULEY }],
  },
  // 13. Griffin — McAuley
  {
    family_name: "Griffin",
    primary: { name: "Kara Griffin", phone: "0414431332", email: "kgriffin@scentregroup.com" },
    secondary: null,
    players: [{ first_name: "Fletcher", last_name: "Griffin", dob: "2018-04-17", gender: null, school: MCAULEY }],
  },
  // 14. Joncheff — 2 kids
  {
    family_name: "Joncheff",
    primary: { name: "Kimberley Joncheff", phone: "0409311227", email: "kaotway@gmail.com" },
    secondary: { name: "Phillip Joncheff", phone: "0412231645" },
    players: [
      { first_name: "Sofia", last_name: "Joncheff", dob: "2019-10-31", gender: null },
      { first_name: "Matteo", last_name: "Joncheff", dob: "2022-03-31", gender: null },
    ],
  },
  // 15. Wielgosz
  {
    family_name: "Wielgosz",
    primary: { name: "Krystian Wielgosz", phone: "0403977828", email: "kryswielco@gmail.com" },
    secondary: { name: "Ning Wang", phone: "0403543224" },
    players: [{ first_name: "Hendrix", last_name: "Wielgosz", dob: "2015-01-05", gender: null }],
  },
  // 16. Kaouri (kid: Clio Varanaki)
  {
    family_name: "Kaouri",
    primary: { name: "Marianda Kaouri", phone: "0484085349", email: "mkaouri1978@gmail.com" },
    secondary: null, // CSV had "Marianda Kaouri" repeated
    players: [{ first_name: "Clio", last_name: "Varanaki", dob: "2019-03-02", gender: null }],
  },
  // 17. Venter — peanut allergy
  {
    family_name: "Venter",
    primary: { name: "Marnus Venter", phone: "040660526", email: "marnus.venter@gmail.com" },
    secondary: { name: "Jacqui Mc Donald", phone: "0432163326" },
    players: [{ first_name: "Mae", last_name: "Venter", dob: "2019-09-05", gender: null, medical: "Peanuts" }],
  },
  // 18. Martelle — 2 kids
  {
    family_name: "Martelle",
    primary: { name: "Sarah Martelle", phone: "0433669390", email: "stoouli@gmail.com" },
    secondary: { name: "Kyle Martelle", phone: "0466655400" },
    players: [
      { first_name: "Lochlan", last_name: "Martelle", dob: "2019-04-19", gender: "male" },
      { first_name: "Maya", last_name: "Martelle", dob: "2017-05-02", gender: null },
    ],
  },
  // 19. Matijevic (kid: Spencer Golding) — McAuley
  {
    family_name: "Matijevic",
    primary: { name: "Tegan Matijevic", phone: "0422175245", email: "tsmatijevic@gmail.com" },
    secondary: { name: "Joshua Golding", phone: "0417880391" },
    players: [{ first_name: "Spencer", last_name: "Golding", dob: "2018-01-30", gender: null, school: MCAULEY }],
  },
  // 20. Clarke (kid: Imogen Clarke-Lauridsen)
  {
    family_name: "Clarke",
    primary: { name: "Kylie Clarke", phone: "0400822524", email: "kyliechris@icloud.com" },
    secondary: null,
    players: [{ first_name: "Imogen", last_name: "Clarke-Lauridsen", dob: "2016-08-12", gender: null }],
  },
];

const SECONDARY_CONTACT_UPDATES = [
  {
    display_id: "C072",
    family_name: "Vardanega",
    secondary: { name: "Jade Vardanega", phone: "0417338128", email: "jadevardanega@gmail.com" },
  },
  {
    display_id: "C048",
    family_name: "Mugford",
    secondary: { name: "Sallyann Mugford", phone: "0402967110", email: "salmugford@gmail.com" },
  },
  {
    display_id: "C050",
    family_name: "Notridge",
    secondary: { name: "Sarah Notridge", phone: "0450549739", email: "sarah_cox84@hotmail.com" },
  },
  {
    display_id: "C053",
    family_name: "Pekhart",
    secondary: { name: "Emma Pekhart", phone: "0474232645", email: "thepekharts@gmail.com" },
  },
];

// ── Helpers ────────────────────────────────────────────────────────────

function splitFirstLast(fullName) {
  const parts = (fullName || "").trim().split(/\s+/);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

function buildContact(c) {
  if (!c) return null;
  const { first, last } = splitFirstLast(c.name);
  return {
    name: c.name,
    first_name: first,
    last_name: last,
    phone: c.phone || undefined,
    email: c.email || undefined,
  };
}

async function nextDisplayId() {
  const fams = await sbGet(
    "families",
    "select=display_id&display_id=like.C%25&order=display_id.desc&limit=1"
  );
  if (!fams.length) return "C001";
  const m = fams[0].display_id.match(/C(\d+)/);
  const n = m ? parseInt(m[1], 10) + 1 : 1;
  return `C${String(n).padStart(3, "0")}`;
}

function bumpDisplayId(id) {
  const m = id.match(/C(\d+)/);
  const n = parseInt(m[1], 10) + 1;
  return `C${String(n).padStart(3, "0")}`;
}

// ── Step 1: Delete T003 Clarke test family ─────────────────────────────

async function deleteT003Clarke() {
  console.log("\n=== STEP 1: Delete T003 Clarke test family ===");
  const fams = await sbGet(
    "families",
    "select=id,display_id,family_name&display_id=eq.T003"
  );
  if (!fams.length) {
    console.log("  T003 Clarke not found — already deleted or never seeded. Skipping.");
    return;
  }
  const fam = fams[0];
  console.log(`  Found ${fam.display_id} ${fam.family_name} (id ${fam.id})`);

  // Find related records
  const players = await sbGet("players", `select=id&family_id=eq.${fam.id}`);
  const playerIds = players.map((p) => p.id);
  const payments = await sbGet("payments", `select=id&family_id=eq.${fam.id}`);
  const paymentIds = payments.map((p) => p.id);
  const userRoles = await sbGet(
    "user_roles",
    `select=user_id&family_id=eq.${fam.id}&role=eq.parent`
  );
  const parentUserIds = userRoles.map((r) => r.user_id).filter(Boolean);

  console.log(
    `  ${playerIds.length} player(s), ${paymentIds.length} payment(s), ` +
      `${parentUserIds.length} parent auth user(s)`
  );

  if (DRY_RUN) {
    console.log("  [dry-run] Would delete in FK-safe order. Skipping.");
    return;
  }

  // FK-safe cascade
  if (paymentIds.length > 0) {
    await sbDelete("payment_allocations", `payment_id=in.(${paymentIds.join(",")})`);
  }
  await sbDelete("charges", `family_id=eq.${fam.id}`);
  await sbDelete("payments", `family_id=eq.${fam.id}`);
  await sbDelete("bookings", `family_id=eq.${fam.id}`);
  if (playerIds.length > 0) {
    await sbDelete("attendances", `player_id=in.(${playerIds.join(",")})`);
    await sbDelete("lesson_notes", `player_id=in.(${playerIds.join(",")})`);
    await sbDelete("program_roster", `player_id=in.(${playerIds.join(",")})`);
  }
  await sbDelete("family_balance", `family_id=eq.${fam.id}`);
  await sbDelete("players", `family_id=eq.${fam.id}`);
  await sbDelete("user_roles", `family_id=eq.${fam.id}`);
  await sbDelete("families", `id=eq.${fam.id}`);

  // Remove parent auth users
  for (const uid of parentUserIds) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${uid}`, {
      method: "DELETE",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (!res.ok) {
      console.warn(`  WARN: failed to delete auth user ${uid}: ${res.status}`);
    }
  }
  console.log(`  Deleted T003 Clarke (cascade complete).`);
}

// ── Step 2: Update secondary contact on 4 families ──────────────────────

async function updateSecondaryContacts() {
  console.log("\n=== STEP 2: Update secondary_contact on 4 existing families ===");
  for (const u of SECONDARY_CONTACT_UPDATES) {
    const fams = await sbGet(
      "families",
      `select=id,display_id,family_name,secondary_contact&display_id=eq.${u.display_id}`
    );
    if (!fams.length) {
      console.warn(`  ${u.display_id} ${u.family_name} not found — skipping.`);
      continue;
    }
    const fam = fams[0];
    const before = fam.secondary_contact;
    const newContact = buildContact(u.secondary);
    console.log(
      `  ${fam.display_id} ${fam.family_name}: ${before ? "REPLACE" : "ADD"} secondary → ${u.secondary.email}`
    );
    if (DRY_RUN) {
      console.log(`    [dry-run] would PATCH families set secondary_contact = ${JSON.stringify(newContact)}`);
      continue;
    }
    await sbPatch("families", `id=eq.${fam.id}`, { secondary_contact: newContact });
  }
}

// ── Step 3: Insert new families + players ──────────────────────────────

async function importNewFamilies() {
  console.log("\n=== STEP 3: Insert 20 new families + 22 players ===");

  const startingId = await nextDisplayId();
  console.log(`  Next display_id starts at: ${startingId}`);

  let displayId = startingId;
  const importedEmails = [];
  const importedSummary = [];

  for (const fam of NEW_FAMILIES) {
    const primaryContact = buildContact(fam.primary);
    const secondaryContact = fam.secondary ? buildContact(fam.secondary) : null;

    const familyRow = {
      display_id: displayId,
      family_name: fam.family_name,
      primary_contact: primaryContact,
      secondary_contact: secondaryContact,
      status: "active",
      // approval_status defaults to 'approved'; signup_source set explicitly
      // to 'legacy_import' (these came from outside the platform, like FTD).
      signup_source: "legacy_import",
      approval_status: "approved",
    };

    if (DRY_RUN) {
      console.log(`  [dry-run] ${displayId} ${fam.family_name} ← ${fam.primary.email}`);
      for (const p of fam.players) {
        const schoolBit = p.school ? ` school=${p.school}` : "";
        const medBit = p.medical ? ` medical=${p.medical}` : "";
        console.log(`            player: ${p.first_name} ${p.last_name} (DOB ${p.dob})${schoolBit}${medBit}`);
      }
      importedEmails.push(fam.primary.email);
      importedSummary.push({ display_id: displayId, family_name: fam.family_name, primary_email: fam.primary.email });
      displayId = bumpDisplayId(displayId);
      continue;
    }

    const inserted = await sbPost("families", familyRow);
    const newFamily = Array.isArray(inserted) ? inserted[0] : inserted;
    console.log(`  ${displayId} ${fam.family_name} created (id ${newFamily.id})`);

    for (const p of fam.players) {
      const playerRow = {
        family_id: newFamily.id,
        first_name: p.first_name,
        last_name: p.last_name,
        dob: p.dob || null,
        gender: p.gender || null,
        ball_color: null,
        level: null,
        classifications: [],
        track: "participation",
        medical_notes: p.medical || null,
        physical_notes: null,
        school: p.school || null,
        media_consent_coaching: false,
        media_consent_social: false,
        status: "active",
      };
      await sbPost("players", playerRow);
      console.log(`    + ${p.first_name} ${p.last_name}${p.school ? ` [${p.school}]` : ""}`);
    }

    importedEmails.push(fam.primary.email);
    importedSummary.push({ display_id: displayId, family_name: fam.family_name, primary_email: fam.primary.email });
    displayId = bumpDisplayId(displayId);
  }

  return { importedEmails, importedSummary };
}

// ── Output ─────────────────────────────────────────────────────────────

async function writeOutput({ importedEmails, importedSummary }) {
  const today = new Date().toISOString().slice(0, 10);
  const bccLine = importedEmails.join(", ");

  const idW = Math.max(...importedSummary.map((r) => r.display_id.length), 4);
  const nameW = Math.max(...importedSummary.map((r) => r.family_name.length), 11);
  const breakdown = importedSummary
    .map(
      (r) =>
        `${r.display_id.padEnd(idW)} | ${r.family_name.padEnd(nameW)} | ${r.primary_email}`
    )
    .join("\n");
  const tableHeader = `${"ID".padEnd(idW)} | ${"Family".padEnd(nameW)} | Primary email`;
  const sep = "-".repeat(tableHeader.length);

  const out = [
    `# Breely import — ${today} ${DRY_RUN ? "(DRY RUN)" : "(APPLIED)"}`,
    `# ${importedSummary.length} families imported, ${importedEmails.length} unique primary emails.`,
    "",
    `=== BCC line (paste into Gmail BCC field) ===`,
    "",
    bccLine,
    "",
    `=== Per-family breakdown ===`,
    "",
    tableHeader,
    sep,
    breakdown,
    "",
  ].join("\n");

  const outDir = resolve(process.cwd(), "scripts/_out");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(
    outDir,
    `breely-import-result-${today}${DRY_RUN ? "-dryrun" : ""}.txt`
  );
  writeFileSync(outPath, out);
  console.log(`\n${out}`);
  console.log(`\nWritten: ${outPath}`);
}

// ── Main ──────────────────────────────────────────────────────────────

async function run() {
  console.log(`\nMode: ${DRY_RUN ? "DRY RUN (no DB writes)" : "APPLY (writing to DB)"}\n`);

  await deleteT003Clarke();
  await updateSecondaryContacts();
  const result = await importNewFamilies();
  await writeOutput(result);

  console.log(
    `\nDone. ${result.importedEmails.length} families ` +
      `${DRY_RUN ? "would be" : "were"} imported.`
  );
}

run().catch((e) => {
  console.error("\nFAILED:", e);
  process.exit(1);
});
