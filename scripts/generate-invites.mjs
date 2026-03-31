/**
 * Generate parent invite links for all families with email contacts.
 *
 * Creates invitation records in the DB and outputs a CSV-style list
 * of family name, parent email, and invite link for Maxim to distribute.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/generate-invites.mjs
 *
 * Options:
 *   --dry-run    Show which invites would be created without writing to DB
 */

import { randomUUID } from "node:crypto";

const SUPABASE_URL = "https://cdtsviwasgblnqdambis.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes("--dry-run");
const APP_URL = "https://sunrise-tennis.vercel.app";

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

async function run() {
  console.log(DRY_RUN ? "=== DRY RUN ===" : "=== GENERATING INVITES ===");

  // 1. Get all active families with contacts
  const families = await supabaseGet(
    "families",
    "select=id,display_id,family_name,primary_contact&status=eq.active&order=display_id"
  );

  // 2. Get existing pending invitations to avoid duplicates
  const existingInvites = await supabaseGet(
    "invitations",
    "select=family_id,email,status&status=eq.pending"
  );
  const existingFamilyIds = new Set(existingInvites.map((i) => i.family_id));

  const invites = [];
  const noEmail = [];
  const skipped = [];

  for (const family of families) {
    // Skip test family
    if (family.display_id === "C001") continue;

    const email = family.primary_contact?.email;
    if (!email) {
      noEmail.push(`${family.display_id} ${family.family_name}`);
      continue;
    }

    if (existingFamilyIds.has(family.id)) {
      skipped.push(`${family.display_id} ${family.family_name} (already has pending invite)`);
      continue;
    }

    const token = randomUUID();
    invites.push({
      family_id: family.id,
      email,
      token,
      status: "pending",
      display_id: family.display_id,
      family_name: family.family_name,
    });
  }

  console.log(`\nFamilies with email: ${invites.length}`);
  console.log(`No email: ${noEmail.length}`);
  console.log(`Already invited: ${skipped.length}`);

  if (noEmail.length > 0) {
    console.log("\nFamilies without email:");
    noEmail.forEach((n) => console.log(`  - ${n}`));
  }

  if (skipped.length > 0) {
    console.log("\nAlready invited:");
    skipped.forEach((s) => console.log(`  - ${s}`));
  }

  if (invites.length === 0) {
    console.log("\nNo new invites to create.");
    return;
  }

  // 3. Insert invitations
  if (!DRY_RUN) {
    const dbRows = invites.map(({ family_id, email, token }) => ({
      family_id,
      email,
      token,
      status: "pending",
    }));

    try {
      await supabasePost("invitations", dbRows);
      console.log(`\nCreated ${dbRows.length} invitations`);
    } catch (e) {
      console.error(`\nERROR creating invitations: ${e.message}`);
      return;
    }
  }

  // 4. Output invite list
  console.log("\n=== INVITE LINKS ===");
  console.log("Display ID | Family Name | Parent Email | Invite Link");
  console.log("-----------|-------------|--------------|------------");
  for (const inv of invites) {
    const link = `${APP_URL}/signup?invite=${inv.token}`;
    console.log(`${inv.display_id} | ${inv.family_name} | ${inv.email} | ${link}`);
  }

  console.log(`\n=== DONE: ${invites.length} invite links generated ===`);
}

run().catch(console.error);
