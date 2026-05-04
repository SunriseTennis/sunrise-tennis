/**
 * Analyse Breely CSV export against current Supabase families/players.
 *
 * Goal: identify which Breely submitters are NOT yet in the platform DB,
 * so we can plan an import without doubling-up on existing families.
 *
 * Reads:  h:/My Drive/Sunrise/export (8).csv
 * Writes: scripts/_out/breely-import-plan-<date>.md
 *
 * Usage:
 *   op run --env-file=.env.op -- node scripts/analyze-breely-export.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const SUPABASE_URL = "https://cdtsviwasgblnqdambis.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CSV_PATH = "h:/My Drive/Sunrise/export (8).csv";

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
  if (!res.ok) {
    throw new Error(`GET ${table} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

// ── CSV parser (handles embedded quotes/commas/newlines) ──

function parseCsv(text) {
  // strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    // not in quotes
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ── Helpers ──

function cleanEmail(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim().toLowerCase();
  if (!trimmed) return null;
  if (!trimmed.includes("@")) return null;
  return trimmed;
}

function cleanPhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d+]/g, "");
  if (!digits) return null;
  // Normalise: +61 4xx xxx xxx → 04xx xxx xxx
  if (digits.startsWith("+61")) return "0" + digits.slice(3);
  return digits;
}

function titleCase(s) {
  if (!s) return s;
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function parseDob(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function ageFromDob(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const now = new Date("2026-05-04");
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

function normaliseName(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z]/g, "");
}

// ── Main ──

async function run() {
  console.log(`Reading: ${CSV_PATH}`);
  const text = readFileSync(CSV_PATH, "utf8");
  const rows = parseCsv(text);
  const header = rows[0];
  const data = rows.slice(1).filter((r) => r.length >= header.length - 2);

  console.log(`Parsed ${data.length} data rows.`);

  // Column index lookup
  const col = (name) => header.findIndex((h) => h === name);
  const C = {
    formName: col("Form Name"),
    submittedAt: col("Submitted At"),
    clientFullName: col("Client Full Name"),
    clientEmail: col("Client Email"),
    phone: col("Phone Number"),
    childFirst: col("Child's First Name"),
    childLast: col("Child's Surname"),
    priorFTD: col("Have You Partaken In Any Prior FTD Programs?"),
    photoConsent1: header.findIndex((h) =>
      h.startsWith(
        "I Hereby Give Permission For My Child To Be In Photographs And Videos Taken During Coaching Sessions, Competitions"
      )
    ),
    photoConsent2: header.findIndex((h) =>
      /Photographs And Videos.*Foundation Tennis Development And Somerton Park Tennis Club Social Media Pages\s*$/.test(
        h
      )
    ),
    addParentFirst: col("Additional Parent/guardian First Name"),
    addParentLast: col("Additional Parent/guardian Surname"),
    addParentPhone: col("Additional Parent/guardian Contact Number"),
    medical: col(
      "Allergies, Medical Conditions Or Special Considerations: Please Indicate Any Relevant Information Below"
    ),
    voucher: col(
      "Do You Plan On Using A Sports Voucher? If Yes, Please Send A Scan Of Your Completed Form To Foundationtennis@hotmail Com (more Info Can Be Found At Sportsvouchers Sa Gov Au)"
    ),
    dob: col("Child's Date Of Birth"),
    gender: col("Child's Gender"),
  };

  // Group by email — each email = one family.
  const families = new Map();

  for (const r of data) {
    const email = cleanEmail(r[C.clientEmail]);
    if (!email) continue;
    const fullName = (r[C.clientFullName] || "").trim();
    const phone = cleanPhone(r[C.phone]);
    const childFirst = (r[C.childFirst] || "").trim();
    const childLast = (r[C.childLast] || "").trim();
    const dob = parseDob(r[C.dob]);
    const gender = (r[C.gender] || "").trim().toLowerCase() || null;
    const medical = (r[C.medical] || "").trim();
    const photoConsent =
      (r[C.photoConsent1] || "").trim().toLowerCase() === "yes" ||
      (r[C.photoConsent2] || "").trim().toLowerCase() === "yes";
    const addParentFirst = (r[C.addParentFirst] || "").trim();
    const addParentLast = (r[C.addParentLast] || "").trim();
    const addParentPhone = cleanPhone(r[C.addParentPhone]);
    const formName = (r[C.formName] || "").trim();
    const submittedAt = (r[C.submittedAt] || "").trim();

    let fam = families.get(email);
    if (!fam) {
      fam = {
        email,
        primaryName: fullName,
        primaryPhone: phone,
        children: new Map(),
        secondaryParents: new Set(),
        secondaryPhones: new Set(),
        forms: new Set(),
        firstSubmittedAt: submittedAt,
        lastSubmittedAt: submittedAt,
      };
      families.set(email, fam);
    }
    if (formName) fam.forms.add(formName);
    if (submittedAt) fam.lastSubmittedAt = submittedAt;
    if (phone && !fam.primaryPhone) fam.primaryPhone = phone;
    // accumulate additional parent/guardian
    if (addParentFirst || addParentLast) {
      fam.secondaryParents.add(`${addParentFirst} ${addParentLast}`.trim());
    }
    if (addParentPhone) fam.secondaryPhones.add(addParentPhone);

    if (!childFirst) continue; // booking-only row, skip child
    const childKey = normaliseName(childFirst) + "|" + normaliseName(childLast);

    let child = fam.children.get(childKey);
    if (!child) {
      child = {
        firstName: titleCase(childFirst),
        lastName: titleCase(childLast || fullName.split(" ").slice(-1)[0] || ""),
        dob: dob,
        gender: gender,
        medical: medical,
        photoConsent: photoConsent,
      };
      fam.children.set(childKey, child);
    } else {
      // Merge, preferring non-empty values
      if (!child.dob && dob) child.dob = dob;
      if (!child.gender && gender) child.gender = gender;
      if (!child.medical && medical) child.medical = medical;
      if (!child.photoConsent && photoConsent) child.photoConsent = true;
    }
  }

  console.log(`Unique submitter emails: ${families.size}`);

  // ── Pull existing families from DB ──
  console.log(`Querying Supabase for existing families…`);
  const existingFamilies = await supabaseGet(
    "families",
    "select=id,display_id,family_name,primary_contact,secondary_contact,status&order=display_id"
  );
  console.log(`Existing families in DB: ${existingFamilies.length}`);

  const existingPlayers = await supabaseGet(
    "players",
    "select=id,family_id,first_name,last_name,dob"
  );
  console.log(`Existing players in DB: ${existingPlayers.length}`);

  // Build lookup maps
  const dbByEmail = new Map();
  const dbByName = new Map();
  for (const f of existingFamilies) {
    const primary = cleanEmail(f.primary_contact?.email);
    const secondary = cleanEmail(f.secondary_contact?.email);
    if (primary) dbByEmail.set(primary, f);
    if (secondary && !dbByEmail.has(secondary)) dbByEmail.set(secondary, f);
    const nameKey = normaliseName(f.family_name);
    if (nameKey) {
      if (!dbByName.has(nameKey)) dbByName.set(nameKey, []);
      dbByName.get(nameKey).push(f);
    }
  }

  const playersByFamily = new Map();
  for (const p of existingPlayers) {
    if (!playersByFamily.has(p.family_id)) playersByFamily.set(p.family_id, []);
    playersByFamily.get(p.family_id).push(p);
  }

  // ── Categorise ──
  const exactMatch = [];
  const nameMatchEmailDiff = [];
  const newFamilies = [];

  for (const fam of families.values()) {
    const surname = fam.primaryName.split(/\s+/).slice(-1)[0] || "";
    const surnameKey = normaliseName(surname);

    const byEmail = dbByEmail.get(fam.email);
    if (byEmail) {
      exactMatch.push({ fam, db: byEmail });
      continue;
    }
    const byName = dbByName.get(surnameKey) || [];
    if (byName.length > 0) {
      nameMatchEmailDiff.push({ fam, candidates: byName });
      continue;
    }
    newFamilies.push(fam);
  }

  // ── Build report ──
  const today = new Date().toISOString().slice(0, 10);
  const lines = [];
  lines.push(`# Breely Export → DB Import Plan`);
  lines.push(``);
  lines.push(`> Generated ${today} from \`export (8).csv\` (${data.length} form submissions).`);
  lines.push(`> Cross-referenced against ${existingFamilies.length} families currently in Supabase.`);
  lines.push(``);
  lines.push(`## Summary`);
  lines.push(``);
  lines.push(`| Bucket | Count |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Unique submitters in CSV | ${families.size} |`);
  lines.push(`| **Already in DB** (email match) | ${exactMatch.length} |`);
  lines.push(`| **Possibly already in DB** (surname match, email differs) | ${nameMatchEmailDiff.length} |`);
  lines.push(`| **NEW — candidates for import** | ${newFamilies.length} |`);
  lines.push(``);

  // NEW families section — the actual import plan
  lines.push(`## NEW Families — Import Candidates`);
  lines.push(``);
  lines.push(`These submitters do not match any current DB family by email or surname.`);
  lines.push(``);

  const sorted = [...newFamilies].sort((a, b) =>
    (a.primaryName || "").localeCompare(b.primaryName || "")
  );

  let n = 0;
  for (const fam of sorted) {
    n++;
    const surname = (fam.primaryName.split(/\s+/).slice(-1)[0] || "").trim();
    const givenName = fam.primaryName.split(/\s+/).slice(0, -1).join(" ").trim();
    lines.push(`### ${n}. ${fam.primaryName || "(unknown)"}`);
    lines.push(``);
    lines.push(`- **Family name (proposed):** ${titleCase(surname) || "?"}`);
    lines.push(`- **Primary contact:** ${givenName || fam.primaryName} — ${fam.email}${fam.primaryPhone ? ` — ${fam.primaryPhone}` : ""}`);
    if (fam.secondaryParents.size > 0 || fam.secondaryPhones.size > 0) {
      const sp = [...fam.secondaryParents].filter(Boolean).join(", ");
      const spp = [...fam.secondaryPhones].filter(Boolean).join(", ");
      lines.push(`- **Secondary parent:** ${sp || "(no name)"}${spp ? ` — ${spp}` : ""}`);
    }
    lines.push(`- **Forms submitted:** ${[...fam.forms].join(", ") || "—"}`);
    lines.push(`- **First submission:** ${fam.firstSubmittedAt}`);

    if (fam.children.size === 0) {
      lines.push(`- **Players:** (no child data captured — booking-only)`);
    } else {
      lines.push(`- **Players (${fam.children.size}):**`);
      for (const c of fam.children.values()) {
        const age = ageFromDob(c.dob);
        const bits = [];
        bits.push(`${c.firstName} ${c.lastName}`);
        if (c.dob) bits.push(`DOB ${c.dob}${age != null ? ` (age ${age})` : ""}`);
        if (c.gender) bits.push(c.gender);
        const medical = c.medical && !/^nil\.?$/i.test(c.medical) ? c.medical : null;
        if (medical) bits.push(`medical: "${medical}"`);
        if (c.photoConsent) bits.push("photo consent ✓");
        lines.push(`    - ${bits.join(" — ")}`);
      }
    }
    lines.push(``);
  }

  // Already-in-DB section (for cross-check)
  lines.push(`## Already in DB (email match) — SKIP`);
  lines.push(``);
  lines.push(`| Submitter | Email | DB family |`);
  lines.push(`| --- | --- | --- |`);
  for (const { fam, db } of exactMatch) {
    lines.push(`| ${fam.primaryName} | ${fam.email} | ${db.display_id} ${db.family_name} |`);
  }
  lines.push(``);

  // Surname match — needs human review
  lines.push(`## Surname Match — REVIEW`);
  lines.push(``);
  lines.push(`Email differs but a family with the same surname already exists in the DB.`);
  lines.push(`Review each: same family using a new email → update DB. Different family → import as new.`);
  lines.push(``);
  for (const { fam, candidates } of nameMatchEmailDiff) {
    lines.push(`### ${fam.primaryName} — ${fam.email}`);
    lines.push(``);
    if (fam.primaryPhone) lines.push(`- CSV phone: ${fam.primaryPhone}`);
    if (fam.children.size > 0) {
      lines.push(`- CSV players:`);
      for (const c of fam.children.values()) {
        lines.push(
          `    - ${c.firstName} ${c.lastName}${c.dob ? ` (DOB ${c.dob})` : ""}`
        );
      }
    }
    lines.push(`- DB candidate(s):`);
    for (const cand of candidates) {
      const dbPlayers = playersByFamily.get(cand.id) || [];
      const playerNames = dbPlayers
        .map((p) => `${p.first_name}${p.dob ? ` (${p.dob})` : ""}`)
        .join(", ");
      lines.push(
        `    - ${cand.display_id} ${cand.family_name} — ${cand.primary_contact?.email || "(no email)"} — players: ${playerNames || "(none)"}`
      );
    }
    lines.push(``);
  }

  const outDir = resolve(process.cwd(), "scripts/_out");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `breely-import-plan-${today}.md`);
  writeFileSync(outPath, lines.join("\n"));
  console.log(`\nWritten: ${outPath}`);
  console.log(
    `\nSummary: ${families.size} unique submitters | ` +
      `${exactMatch.length} already in DB | ` +
      `${nameMatchEmailDiff.length} surname match (review) | ` +
      `${newFamilies.length} NEW candidates.`
  );
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
