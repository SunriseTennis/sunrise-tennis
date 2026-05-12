/**
 * One-off DB pollution cleanup — 12-May-2026.
 *
 * Plan: ~/.claude/plans/cryptic-plotting-sparrow.md
 *
 * Targets:
 *   - C001 (Maxim) → keep family + players + $1 real Stripe payment + cus_USUtdv0Iwza8J1.
 *                    Wipe everything else operational (charges, payments except the $1,
 *                    bookings, attendances, roster, family_pricing, voucher,
 *                    competition_players, allowed_coaches, etc.). Recalc balance.
 *   - S002 (Maxi Testing) → keep family + players + auth user.
 *                    Wipe operational data only. Recalc balance.
 *   - T001-T010 + TPLN18-001 → hard-delete family + players + auth user.
 *
 * Default mode: dry-run. Pass --apply to execute deletes. Backup written in BOTH modes
 * to scripts/_out/cleanup-2026-05-12-backup-<ISO>.json.
 *
 * Usage:
 *   op run --env-file=.env.op -- node scripts/cleanup-pollution-2026-05-12.mjs            # dry-run
 *   op run --env-file=.env.op -- node scripts/cleanup-pollution-2026-05-12.mjs --apply    # execute
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "_out");

// 1Password sometimes ships URL-like fields wrapped in literal quotes; strip them.
const trim = (s) => (s ? s.replace(/^"|"$/g, "") : s);
const BASE = trim(process.env.NEXT_PUBLIC_SUPABASE_URL);
const KEY = trim(process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!BASE || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.");
  console.error("Run via: op run --env-file=.env.op -- node scripts/cleanup-pollution-2026-05-12.mjs");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const MODE = APPLY ? "APPLY" : "DRY-RUN";

const PRESERVE_C001_PAYMENT_ID = "eff51248-f1c2-4806-9679-79798c6f8de0";
const PRESERVE_C001_STRIPE_PI = "pi_3TTZuSR5uB3LfIZ22qPB7Q1B";

// Target inventory — display_id → { id, disposition }
const TARGETS = [
  { display_id: "C001",       id: "5762f614-699b-477b-a5fc-45cb77dadb51", disposition: "keep_family_clear_ops" },
  { display_id: "S002",       id: "0157d856-357a-4fae-bd89-67c1cfd8889c", disposition: "keep_family_clear_ops" },
  { display_id: "T001",       id: "aaaa0000-0000-4000-a000-000000000001", disposition: "hard_delete" },
  { display_id: "T002",       id: "aaaa0000-0000-4000-a000-000000000002", disposition: "hard_delete" },
  { display_id: "T004",       id: "aaaa0000-0000-4000-a000-000000000004", disposition: "hard_delete" },
  { display_id: "T005",       id: "aaaa0000-0000-4000-a000-000000000005", disposition: "hard_delete" },
  { display_id: "T006",       id: "aaaa0000-0000-4000-a000-000000000006", disposition: "hard_delete" },
  { display_id: "T007",       id: "aaaa0000-0000-4000-a000-000000000007", disposition: "hard_delete" },
  { display_id: "T008",       id: "aaaa0000-0000-4000-a000-000000000008", disposition: "hard_delete" },
  { display_id: "T009",       id: "aaaa0000-0000-4000-a000-000000000009", disposition: "hard_delete" },
  { display_id: "T010",       id: "aaaa0000-0000-4000-a000-000000000010", disposition: "hard_delete" },
  { display_id: "TPLN18-001", id: "db4c3f03-065d-42d9-b96f-2f88cb4517de", disposition: "hard_delete" },
];

const restHeaders = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

const selectHeaders = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
};

async function restSelect(table, query) {
  const url = `${BASE}/rest/v1/${table}${query ? "?" + query : ""}`;
  const res = await fetch(url, { headers: selectHeaders });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SELECT ${table}: HTTP ${res.status} — ${body}`);
  }
  return res.json();
}

async function restDelete(table, query) {
  const url = `${BASE}/rest/v1/${table}?${query}`;
  const res = await fetch(url, { method: "DELETE", headers: restHeaders });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DELETE ${table}: HTTP ${res.status} — ${body}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data.length : 0;
}

async function restRpc(fn, body) {
  const url = `${BASE}/rest/v1/rpc/${fn}`;
  const res = await fetch(url, {
    method: "POST",
    headers: restHeaders,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`RPC ${fn}: HTTP ${res.status} — ${txt}`);
  }
  return res.json();
}

async function authDeleteUser(userId) {
  const url = `${BASE}/auth/v1/admin/users/${userId}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, status: res.status, body };
  }
  return { ok: true };
}

async function authRenameUser(userId, newEmail) {
  const url = `${BASE}/auth/v1/admin/users/${userId}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: restHeaders,
    body: JSON.stringify({ email: newEmail, email_confirm: true }),
  });
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, status: res.status, body };
  }
  return { ok: true };
}

function inList(ids) {
  return `(${ids.map((id) => `"${id}"`).join(",")})`;
}

// ─── Snapshot every row that would be deleted, per family ─────────────────────

async function snapshotFamily(target) {
  const { id: famId, disposition } = target;

  const players = await restSelect(
    "players",
    `family_id=eq.${famId}&select=*`
  );
  const playerIds = players.map((p) => p.id);

  const charges = await restSelect("charges", `family_id=eq.${famId}&select=*`);
  const allPayments = await restSelect("payments", `family_id=eq.${famId}&select=*`);

  // For C001, we preserve the $1 payment; do not include it in the snapshot of rows-to-delete.
  const payments =
    target.display_id === "C001"
      ? allPayments.filter((p) => p.id !== PRESERVE_C001_PAYMENT_ID)
      : allPayments;
  const paymentIds = payments.map((p) => p.id);

  const payment_allocations = paymentIds.length
    ? await restSelect(
        "payment_allocations",
        `payment_id=in.${inList(paymentIds)}&select=*`
      )
    : [];

  const attendances = playerIds.length
    ? await restSelect(
        "attendances",
        `player_id=in.${inList(playerIds)}&select=*`
      )
    : [];

  const lesson_notes = playerIds.length
    ? await restSelect(
        "lesson_notes",
        `player_id=in.${inList(playerIds)}&select=*`
      )
    : [];

  const bookings = await restSelect(
    "bookings",
    `or=(family_id.eq.${famId},second_family_id.eq.${famId})&select=*`
  );

  const program_roster = playerIds.length
    ? await restSelect(
        "program_roster",
        `player_id=in.${inList(playerIds)}&select=*`
      )
    : [];

  const player_allowed_coaches = playerIds.length
    ? await restSelect(
        "player_allowed_coaches",
        `player_id=in.${inList(playerIds)}&select=*`
      )
    : [];

  const competition_players = playerIds.length
    ? await restSelect(
        "competition_players",
        `player_id=in.${inList(playerIds)}&select=*`
      )
    : [];

  const vouchers = await restSelect(
    "vouchers",
    `family_id=eq.${famId}&select=*`
  );

  const family_pricing = await restSelect(
    "family_pricing",
    `family_id=eq.${famId}&select=*`
  );

  const messages = await restSelect(
    "messages",
    `family_id=eq.${famId}&select=*`
  );

  const invitations = await restSelect(
    "invitations",
    `family_id=eq.${famId}&select=*`
  );

  const snapshot = {
    display_id: target.display_id,
    id: famId,
    disposition,
    players_count: players.length,
    snapshots: {
      players: disposition === "hard_delete" ? players : undefined, // only snapshot if it's going away
      charges,
      payments,
      payment_allocations,
      attendances,
      lesson_notes,
      bookings,
      program_roster,
      player_allowed_coaches,
      competition_players,
      vouchers,
      family_pricing,
      messages,
      invitations,
    },
  };

  if (disposition === "hard_delete") {
    const family_balance = await restSelect(
      "family_balance",
      `family_id=eq.${famId}&select=*`
    );
    const user_roles = await restSelect(
      "user_roles",
      `family_id=eq.${famId}&select=*`
    );
    snapshot.snapshots.family_balance = family_balance;
    snapshot.snapshots.user_roles = user_roles;
    snapshot.parent_user_ids = user_roles
      .filter((r) => r.role === "parent")
      .map((r) => r.user_id);

    // Optionally include auth user metadata (email) for the audit trail. We
    // hit GoTrue admin API; if it fails, snapshot just the id.
    const authUsers = [];
    for (const uid of snapshot.parent_user_ids) {
      try {
        const res = await fetch(`${BASE}/auth/v1/admin/users/${uid}`, {
          headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
        });
        if (res.ok) {
          const u = await res.json();
          authUsers.push({ id: u.id, email: u.email });
        } else {
          authUsers.push({ id: uid, email: null, lookup_error: `HTTP ${res.status}` });
        }
      } catch (e) {
        authUsers.push({ id: uid, email: null, lookup_error: String(e) });
      }
    }
    snapshot.snapshots.auth_users = authUsers;
  }

  // Capture preserved bits for C001 too — for the audit trail.
  if (target.display_id === "C001") {
    const preserved = allPayments.find((p) => p.id === PRESERVE_C001_PAYMENT_ID);
    const family = await restSelect(
      "families",
      `id=eq.${famId}&select=display_id,stripe_customer_id,primary_contact`
    );
    snapshot.preserved = {
      payment: preserved,
      stripe_customer_id: family[0]?.stripe_customer_id,
    };
  }

  return snapshot;
}

// ─── Delete pass per family ───────────────────────────────────────────────────

async function deleteFamilyOps(target, snapshot) {
  const { id: famId, disposition } = target;
  const counts = {};

  const playerIds = (snapshot.snapshots.attendances?.length ||
    snapshot.snapshots.program_roster?.length ||
    snapshot.snapshots.player_allowed_coaches?.length ||
    snapshot.snapshots.lesson_notes?.length ||
    snapshot.snapshots.competition_players?.length)
    ? (await restSelect("players", `family_id=eq.${famId}&select=id`)).map((p) => p.id)
    : (await restSelect("players", `family_id=eq.${famId}&select=id`)).map((p) => p.id);
  // playerIds includes the C001/S002 player IDs we are KEEPING (we only delete their FK rows, not the player itself).

  // 1. payment_allocations first (FK to charges + payments).
  const paymentIdsToDelete = snapshot.snapshots.payments.map((p) => p.id);
  if (paymentIdsToDelete.length) {
    counts.payment_allocations = await restDelete(
      "payment_allocations",
      `payment_id=in.${inList(paymentIdsToDelete)}`
    );
  } else {
    counts.payment_allocations = 0;
  }

  // 2. charges (full wipe — voided + active).
  counts.charges = await restDelete("charges", `family_id=eq.${famId}`);

  // 3. payments — C001 keeps the $1; everyone else full wipe.
  if (target.display_id === "C001") {
    counts.payments = await restDelete(
      "payments",
      `family_id=eq.${famId}&id=not.eq.${PRESERVE_C001_PAYMENT_ID}`
    );
  } else {
    counts.payments = await restDelete("payments", `family_id=eq.${famId}`);
  }

  // 4. attendances (player-scoped).
  if (playerIds.length) {
    counts.attendances = await restDelete(
      "attendances",
      `player_id=in.${inList(playerIds)}`
    );
  } else {
    counts.attendances = 0;
  }

  // 5. lesson_notes.
  if (playerIds.length) {
    counts.lesson_notes = await restDelete(
      "lesson_notes",
      `player_id=in.${inList(playerIds)}`
    );
  } else {
    counts.lesson_notes = 0;
  }

  // 6. bookings (family or second_family).
  counts.bookings = await restDelete(
    "bookings",
    `or=(family_id.eq.${famId},second_family_id.eq.${famId})`
  );

  // 7. program_roster.
  if (playerIds.length) {
    counts.program_roster = await restDelete(
      "program_roster",
      `player_id=in.${inList(playerIds)}`
    );
  } else {
    counts.program_roster = 0;
  }

  // 8. player_allowed_coaches.
  if (playerIds.length) {
    counts.player_allowed_coaches = await restDelete(
      "player_allowed_coaches",
      `player_id=in.${inList(playerIds)}`
    );
  } else {
    counts.player_allowed_coaches = 0;
  }

  // 9. competition_players.
  if (playerIds.length) {
    counts.competition_players = await restDelete(
      "competition_players",
      `player_id=in.${inList(playerIds)}`
    );
  } else {
    counts.competition_players = 0;
  }

  // 10. vouchers (family-scoped).
  counts.vouchers = await restDelete("vouchers", `family_id=eq.${famId}`);

  // 11. family_pricing.
  counts.family_pricing = await restDelete(
    "family_pricing",
    `family_id=eq.${famId}`
  );

  // 12. messages.
  counts.messages = await restDelete("messages", `family_id=eq.${famId}`);

  // 13. invitations.
  counts.invitations = await restDelete(
    "invitations",
    `family_id=eq.${famId}`
  );

  if (disposition === "hard_delete") {
    // 14. family_balance cache row.
    counts.family_balance = await restDelete(
      "family_balance",
      `family_id=eq.${famId}`
    );

    // 15. user_roles for the parent(s).
    if (snapshot.parent_user_ids?.length) {
      counts.user_roles = await restDelete(
        "user_roles",
        `user_id=in.${inList(snapshot.parent_user_ids)}`
      );
    } else {
      counts.user_roles = 0;
    }

    // 16. players (no FKs left now).
    counts.players = await restDelete("players", `family_id=eq.${famId}`);

    // 17. families row itself.
    counts.families = await restDelete("families", `id=eq.${famId}`);

    // 18. auth.users — try delete, fall back to rename.
    const authDispositions = [];
    for (const uid of snapshot.parent_user_ids || []) {
      const del = await authDeleteUser(uid);
      if (del.ok) {
        authDispositions.push({ user_id: uid, action: "deleted" });
      } else {
        const renameEmail = `archived+${uid.slice(0, 8)}@sunrisetennis.com.au`;
        const ren = await authRenameUser(uid, renameEmail);
        if (ren.ok) {
          authDispositions.push({
            user_id: uid,
            action: "renamed",
            new_email: renameEmail,
            delete_status: del.status,
          });
        } else {
          authDispositions.push({
            user_id: uid,
            action: "failed",
            delete_status: del.status,
            rename_status: ren.status,
            rename_body: ren.body?.slice(0, 200),
          });
        }
      }
    }
    counts.auth_users = authDispositions;
  } else {
    // Keep-family path: refresh the family_balance cache.
    await restRpc("recalculate_family_balance", { p_family_id: famId });
    counts.recalculated_balance = true;
  }

  return counts;
}

// ─── Pretty-print scope ───────────────────────────────────────────────────────

function pretty(snapshot) {
  const s = snapshot.snapshots;
  const fmt = (arr) => (Array.isArray(arr) ? arr.length : "-");
  return [
    `  ${snapshot.display_id.padEnd(12)} ${snapshot.disposition.padEnd(22)}`,
    `players=${fmt(s.players ?? "—keep—")} charges=${fmt(s.charges)} payments=${fmt(s.payments)} ` +
      `alloc=${fmt(s.payment_allocations)} att=${fmt(s.attendances)} ` +
      `bkg=${fmt(s.bookings)} ros=${fmt(s.program_roster)} ` +
      `pac=${fmt(s.player_allowed_coaches)} comp=${fmt(s.competition_players)} ` +
      `vouch=${fmt(s.vouchers)} pricing=${fmt(s.family_pricing)} ` +
      `msg=${fmt(s.messages)} inv=${fmt(s.invitations)}` +
      (snapshot.disposition === "hard_delete"
        ? ` fbal=${fmt(s.family_balance)} roles=${fmt(s.user_roles)}`
        : ""),
  ].join("\n        ");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log(`\n=== Cleanup Pollution 12-May-2026 — ${MODE} ===\n`);
  console.log(`Targets: ${TARGETS.length} families`);
  console.log(
    `Preserving: C001 payment ${PRESERVE_C001_PAYMENT_ID} (${PRESERVE_C001_STRIPE_PI})`
  );
  console.log("");

  // 1. Snapshot every family.
  console.log("Building snapshots...");
  const snapshots = [];
  for (const target of TARGETS) {
    const snap = await snapshotFamily(target);
    snapshots.push(snap);
    console.log(pretty(snap));
  }

  // 2. Write backup.
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(OUT_DIR, `cleanup-2026-05-12-backup-${stamp}.json`);
  fs.writeFileSync(
    backupPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        mode: MODE,
        preserved: {
          c001_one_real_payment_id: PRESERVE_C001_PAYMENT_ID,
          c001_one_real_stripe_pi: PRESERVE_C001_STRIPE_PI,
          c001_stripe_customer_id: snapshots.find((s) => s.display_id === "C001")
            ?.preserved?.stripe_customer_id,
        },
        families: snapshots,
      },
      null,
      2
    )
  );
  console.log(`\nBackup written: ${backupPath}`);

  if (!APPLY) {
    console.log("\nDry-run only. Re-run with --apply to execute deletes.\n");
    return;
  }

  // 3. Apply.
  console.log("\n=== EXECUTING DELETES ===\n");
  const allCounts = [];
  for (const snapshot of snapshots) {
    const target = TARGETS.find((t) => t.id === snapshot.id);
    console.log(`\n→ ${target.display_id} (${target.disposition})`);
    try {
      const counts = await deleteFamilyOps(target, snapshot);
      console.log("  counts:", JSON.stringify(counts));
      allCounts.push({ display_id: target.display_id, counts });
    } catch (e) {
      console.error(`  FAILED: ${e.message}`);
      allCounts.push({ display_id: target.display_id, error: e.message });
    }
  }

  // 4. Persist counts to the backup file as a second pass note.
  const counts_path = path.join(
    OUT_DIR,
    `cleanup-2026-05-12-counts-${stamp}.json`
  );
  fs.writeFileSync(counts_path, JSON.stringify(allCounts, null, 2));
  console.log(`\nCounts written: ${counts_path}`);
  console.log("\n=== APPLY COMPLETE ===\n");
})().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
