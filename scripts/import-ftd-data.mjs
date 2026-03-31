/**
 * Import FTD client data into Supabase
 *
 * Reads family index.json files from FTD OneDrive and creates
 * families + players in the Sunrise Tennis database.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-ftd-data.mjs
 *
 * Options:
 *   --dry-run    Print what would be imported without writing to DB
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const SUPABASE_URL = "https://cdtsviwasgblnqdambis.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes("--dry-run");

const FTD_CLIENTS_DIR =
  "C:/Users/maxim/FTD OneDrive/OneDrive/Business-Management-System/01-Clients/active";

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

// ── Helpers ──

async function supabasePost(table, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (res.status >= 400) {
    throw new Error(`POST ${table} failed: ${res.status} ${JSON.stringify(body)}`);
  }
  return body;
}

async function supabaseGet(table, query = "") {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: "GET",
    headers,
  });
  return res.json();
}

/**
 * Sanitize JSON string by fixing malformed FTD data.
 * Handles cases like Roddam where phone field is "phone": "\r\n  },"
 * (missing value — just a bare quote followed by newline).
 */
function sanitizeJson(raw) {
  // Fix empty string values that have a newline instead of closing quote
  // Pattern: "key": "\r\n  → "key": ""
  return raw.replace(/":\s*"\r?\n/g, '": ""\n');
}

/**
 * Capitalize family name: "bromley" → "Bromley", "OReilly" stays "OReilly"
 */
function capitalizeName(name) {
  if (!name) return name;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Parse DOB from FTD format "Month DD, YYYY" → "YYYY-MM-DD"
 */
function parseDob(dobStr) {
  if (!dobStr) return null;
  const d = new Date(dobStr);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
}

/**
 * Split "FirstName MiddleName LastName" → { first, last }
 * Last name = everything after the last space
 */
function splitName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: parts[0] };
  const last = parts.pop();
  const first = parts.join(" ");
  return { first, last };
}

/**
 * Map FTD stage to ball_color and level
 * FTD uses: blue, red, orange, green, yellow
 * DB uses: ball_color (blue/red/orange/green/yellow) + level (same values or "competitive")
 */
function mapStageToLevel(stage) {
  if (!stage) return { ball_color: null, level: null };
  // Handle array stages (e.g. ["yellow", "blind", "B3"]) — take the first element
  const raw = Array.isArray(stage) ? stage[0] : stage;
  if (!raw || typeof raw !== "string") return { ball_color: null, level: null };
  const s = raw.toLowerCase();
  return { ball_color: s, level: s };
}

// ── Main import ──

async function run() {
  console.log(DRY_RUN ? "=== DRY RUN ===" : "=== IMPORTING FTD DATA ===");

  // 1. Read all family folders
  const folders = await readdir(FTD_CLIENTS_DIR);
  console.log(`Found ${folders.length} family folders`);

  // 2. Get existing families to determine next display_id
  const existingFamilies = await supabaseGet(
    "families",
    "select=display_id&order=display_id.desc&limit=1"
  );
  let nextNum = 1;
  if (existingFamilies.length > 0) {
    const match = existingFamilies[0].display_id.match(/C(\d+)/);
    if (match) nextNum = parseInt(match[1], 10) + 1;
  }
  console.log(`Next display_id: C${String(nextNum).padStart(3, "0")}`);

  // 3. Check existing family names to avoid duplicates
  const allFamilies = await supabaseGet("families", "select=family_name");
  const existingNames = new Set(allFamilies.map((f) => f.family_name.toLowerCase()));

  const stats = { families: 0, players: 0, skipped: 0, errors: [] };

  // 4. Process each family
  for (const folder of folders.sort()) {
    const folderPath = join(FTD_CLIENTS_DIR, folder);

    // Find the *-index.json file
    const files = await readdir(folderPath);
    const indexFile = files.find((f) => f.endsWith("-index.json"));
    if (!indexFile) {
      console.warn(`  SKIP ${folder}: no index.json found`);
      stats.skipped++;
      continue;
    }

    let data;
    try {
      const raw = await readFile(join(folderPath, indexFile), "utf-8");
      data = JSON.parse(sanitizeJson(raw));
    } catch (e) {
      console.error(`  ERROR ${folder}: failed to parse ${indexFile}: ${e.message}`);
      stats.errors.push({ folder, error: e.message });
      continue;
    }

    // Capitalize family name if needed
    data.family_name = capitalizeName(data.family_name);

    // Check for duplicate
    if (existingNames.has(data.family_name?.toLowerCase())) {
      console.log(`  SKIP ${folder}: family "${data.family_name}" already exists`);
      stats.skipped++;
      continue;
    }

    const displayId = `C${String(nextNum).padStart(3, "0")}`;

    // Build primary contact
    const primaryContact = {};
    if (data.primary_contact) {
      primaryContact.name = data.primary_contact.name || null;
      primaryContact.email = data.primary_contact.email || null;
      primaryContact.phone = data.primary_contact.phone || null;
    }

    // Build secondary contact
    let secondaryContact = null;
    if (data.alternate_contact && (data.alternate_contact.name || data.alternate_contact.phone)) {
      secondaryContact = {
        name: data.alternate_contact.name || null,
        phone: data.alternate_contact.phone || data.alternate_contact.email || null,
        email: data.alternate_contact.email || null,
      };
    }

    const familyRow = {
      display_id: displayId,
      family_name: data.family_name,
      primary_contact: primaryContact,
      secondary_contact: secondaryContact,
      status: "active",
    };

    if (DRY_RUN) {
      console.log(`  [DRY] ${displayId} ${data.family_name}: ${(data.players || []).length} player(s)`);
      nextNum++;
      stats.families++;
      stats.players += (data.players || []).length;
      continue;
    }

    // Insert family
    let familyResult;
    try {
      familyResult = await supabasePost("families", familyRow);
      if (Array.isArray(familyResult)) familyResult = familyResult[0];
      console.log(`  OK ${displayId} ${data.family_name} (id: ${familyResult.id})`);
      stats.families++;
      existingNames.add(data.family_name.toLowerCase());
      nextNum++;
    } catch (e) {
      console.error(`  ERROR creating family ${data.family_name}: ${e.message}`);
      stats.errors.push({ folder, error: e.message });
      continue;
    }

    // Insert players
    for (const player of data.players || []) {
      const { first, last } = splitName(player.name);
      const { ball_color, level } = mapStageToLevel(player.stage);
      const dob = parseDob(player.dob);

      const playerRow = {
        family_id: familyResult.id,
        first_name: first,
        last_name: last,
        dob,
        ball_color,
        level,
        medical_notes: player.medical_info || null,
        media_consent: player.media_consent === true,
        gender: player.gender || null,
        status: "active",
      };

      try {
        const result = await supabasePost("players", playerRow);
        const p = Array.isArray(result) ? result[0] : result;
        console.log(`    + ${first} ${last} (${ball_color || "unknown"}, id: ${p.id})`);
        stats.players++;
      } catch (e) {
        console.error(`    ERROR creating player ${player.name}: ${e.message}`);
        stats.errors.push({ folder, player: player.name, error: e.message });
      }
    }
  }

  // Summary
  console.log("\n=== IMPORT SUMMARY ===");
  console.log(`Families created: ${stats.families}`);
  console.log(`Players created:  ${stats.players}`);
  console.log(`Skipped:          ${stats.skipped}`);
  console.log(`Errors:           ${stats.errors.length}`);
  if (stats.errors.length > 0) {
    console.log("\nErrors:");
    stats.errors.forEach((e) => console.log(`  - ${e.folder}: ${e.error}`));
  }
}

run().catch(console.error);
