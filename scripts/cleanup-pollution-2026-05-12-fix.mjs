/**
 * Fix-forward v2 for cleanup-pollution-2026-05-12.mjs.
 *
 * Discovers all FK shapes that bit the first pass:
 *  - vouchers.charge_id → charges.id  (C001 voucher pinned a test charge)
 *  - referrals.charge_id → charges.id (none for our targets but defence in depth)
 *  - bookings.standing_parent_id → bookings.id (T001 + T002 self-FK)
 *  - bookings.shared_with_booking_id → bookings.id (T002 partners in T001, verified)
 *  - recalculate_family_balance uses param `target_family_id` (not p_family_id)
 *
 * Default = dry-run. Pass --apply.
 */

const trim = (s) => (s ? s.replace(/^"|"$/g, "") : s);
const BASE = trim(process.env.NEXT_PUBLIC_SUPABASE_URL);
const KEY = trim(process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!BASE || !KEY) {
  console.error("Missing env. Run via op run --env-file=.env.op -- node scripts/cleanup-pollution-2026-05-12-fix.mjs");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const MODE = APPLY ? "APPLY" : "DRY-RUN";

const C001 = "5762f614-699b-477b-a5fc-45cb77dadb51";
const S002 = "0157d856-357a-4fae-bd89-67c1cfd8889c";
const T001 = "aaaa0000-0000-4000-a000-000000000001";
const T002 = "aaaa0000-0000-4000-a000-000000000002";
const KEEP = "eff51248-f1c2-4806-9679-79798c6f8de0";

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};
const selectH = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function sel(t, q) {
  const r = await fetch(`${BASE}/rest/v1/${t}?${q}`, { headers: selectH });
  if (!r.ok) throw new Error(`SEL ${t}: ${r.status} ${await r.text()}`);
  return r.json();
}
async function del(t, q) {
  const r = await fetch(`${BASE}/rest/v1/${t}?${q}`, { method: "DELETE", headers });
  if (!r.ok) throw new Error(`DEL ${t}: ${r.status} ${await r.text()}`);
  const d = await r.json();
  return Array.isArray(d) ? d.length : 0;
}
async function patch(t, q, body) {
  const r = await fetch(`${BASE}/rest/v1/${t}?${q}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PATCH ${t}: ${r.status} ${await r.text()}`);
  const d = await r.json();
  return Array.isArray(d) ? d.length : 0;
}
async function rpc(fn, body) {
  const r = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`RPC ${fn}: ${r.status} ${await r.text()}`);
  return r.json();
}
async function authDel(uid) {
  const r = await fetch(`${BASE}/auth/v1/admin/users/${uid}`, {
    method: "DELETE",
    headers: selectH,
  });
  return { ok: r.ok, status: r.status, body: r.ok ? "" : (await r.text()).slice(0, 150) };
}
async function authRen(uid, email) {
  const r = await fetch(`${BASE}/auth/v1/admin/users/${uid}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ email, email_confirm: true }),
  });
  return { ok: r.ok, status: r.status, body: r.ok ? "" : (await r.text()).slice(0, 150) };
}

const inList = (ids) => ids.map((i) => `"${i}"`).join(",");
const wouldDo = (label) => console.log(`  [dry] ${label}`);

(async () => {
  console.log(`\n=== Fix-Forward v2 — ${MODE} ===\n`);

  // ── C001 ─────────────────────────────────────────────────────────────────────
  console.log("→ C001 (keep_family_clear_ops)");
  const c001Players = await sel("players", `family_id=eq.${C001}&select=id`);
  const c001pids = c001Players.map((p) => p.id);
  const c001Charges = await sel("charges", `family_id=eq.${C001}&select=id`);
  const c001cids = c001Charges.map((c) => c.id);
  const c001NonKeepPays = await sel(
    "payments",
    `family_id=eq.${C001}&id=not.eq.${KEEP}&select=id`
  );
  const c001NonKeepIds = c001NonKeepPays.map((p) => p.id);
  console.log(
    `  scope: players=${c001pids.length} charges=${c001cids.length} non-keeper-payments=${c001NonKeepIds.length}`
  );

  if (APPLY) {
    console.log(`  vouchers: ${await del("vouchers", `family_id=eq.${C001}`)}`);
    console.log(
      `  referrals: ${await del(
        "referrals",
        `or=(referring_family_id.eq.${C001},referred_family_id.eq.${C001})`
      )}`
    );
    if (c001cids.length) {
      console.log(
        `  payment_allocations(charge): ${await del(
          "payment_allocations",
          `charge_id=in.(${inList(c001cids)})`
        )}`
      );
    }
    if (c001NonKeepIds.length) {
      console.log(
        `  payment_allocations(payment): ${await del(
          "payment_allocations",
          `payment_id=in.(${inList(c001NonKeepIds)})`
        )}`
      );
    }
    console.log(`  charges: ${await del("charges", `family_id=eq.${C001}`)}`);
    console.log(
      `  payments: ${await del("payments", `family_id=eq.${C001}&id=not.eq.${KEEP}`)}`
    );
    console.log(
      `  bookings: ${await del(
        "bookings",
        `or=(family_id.eq.${C001},second_family_id.eq.${C001})`
      )}`
    );
    if (c001pids.length) {
      const ps = inList(c001pids);
      console.log(`  attendances: ${await del("attendances", `player_id=in.(${ps})`)}`);
      console.log(`  lesson_notes: ${await del("lesson_notes", `player_id=in.(${ps})`)}`);
      console.log(`  program_roster: ${await del("program_roster", `player_id=in.(${ps})`)}`);
      console.log(`  player_allowed_coaches: ${await del("player_allowed_coaches", `player_id=in.(${ps})`)}`);
      console.log(`  competition_players: ${await del("competition_players", `player_id=in.(${ps})`)}`);
    }
    console.log(`  family_pricing: ${await del("family_pricing", `family_id=eq.${C001}`)}`);
    console.log(`  messages: ${await del("messages", `family_id=eq.${C001}`)}`);
    console.log(`  invitations: ${await del("invitations", `family_id=eq.${C001}`)}`);
    console.log(`  invoices: ${await del("invoices", `family_id=eq.${C001}`)}`);
    console.log(`  cancellation_tracker: ${await del("cancellation_tracker", `family_id=eq.${C001}`)}`);
    console.log(
      `  recalc: ${JSON.stringify(await rpc("recalculate_family_balance", { target_family_id: C001 }))}`
    );
  } else {
    wouldDo("vouchers/referrals/allocations/charges/non-keeper payments/bookings/player-scoped/family-scoped + recalc");
  }

  // ── S002 ─────────────────────────────────────────────────────────────────────
  console.log("\n→ S002 (keep_family_clear_ops) — recalc only");
  if (APPLY) {
    console.log(
      `  recalc: ${JSON.stringify(await rpc("recalculate_family_balance", { target_family_id: S002 }))}`
    );
  } else {
    wouldDo(`recalculate_family_balance(target_family_id=${S002})`);
  }

  // ── T001 / T002 ──────────────────────────────────────────────────────────────
  for (const FAM of [T001, T002]) {
    const label = FAM === T001 ? "T001" : "T002";
    console.log(`\n→ ${label} (hard_delete) — finish`);
    const players = await sel("players", `family_id=eq.${FAM}&select=id`);
    const pids = players.map((p) => p.id);
    const roles = await sel("user_roles", `family_id=eq.${FAM}&select=user_id,role`);
    const parentUids = roles.filter((r) => r.role === "parent").map((r) => r.user_id);
    console.log(`  scope: players=${pids.length} parent_uids=${parentUids.length}`);

    if (APPLY) {
      console.log(`  vouchers: ${await del("vouchers", `family_id=eq.${FAM}`)}`);
      console.log(
        `  referrals: ${await del(
          "referrals",
          `or=(referring_family_id.eq.${FAM},referred_family_id.eq.${FAM})`
        )}`
      );
      const ns = await patch(
        "bookings",
        `or=(family_id.eq.${FAM},second_family_id.eq.${FAM})&standing_parent_id=not.is.null`,
        { standing_parent_id: null }
      );
      const nsh = await patch(
        "bookings",
        `or=(family_id.eq.${FAM},second_family_id.eq.${FAM})&shared_with_booking_id=not.is.null`,
        { shared_with_booking_id: null }
      );
      console.log(`  nulled standing=${ns} shared=${nsh}`);
      console.log(
        `  bookings: ${await del(
          "bookings",
          `or=(family_id.eq.${FAM},second_family_id.eq.${FAM})`
        )}`
      );
      if (pids.length) {
        const ps = inList(pids);
        console.log(`  attendances: ${await del("attendances", `player_id=in.(${ps})`)}`);
        console.log(`  lesson_notes: ${await del("lesson_notes", `player_id=in.(${ps})`)}`);
        console.log(`  program_roster: ${await del("program_roster", `player_id=in.(${ps})`)}`);
        console.log(`  player_allowed_coaches: ${await del("player_allowed_coaches", `player_id=in.(${ps})`)}`);
        console.log(`  competition_players: ${await del("competition_players", `player_id=in.(${ps})`)}`);
        console.log(`  media: ${await del("media", `player_id=in.(${ps})`)}`);
        console.log(`  team_members: ${await del("team_members", `player_id=in.(${ps})`)}`);
        console.log(`  availability: ${await del("availability", `player_id=in.(${ps})`)}`);
      }
      console.log(`  family_pricing: ${await del("family_pricing", `family_id=eq.${FAM}`)}`);
      console.log(`  messages: ${await del("messages", `family_id=eq.${FAM}`)}`);
      console.log(`  invitations: ${await del("invitations", `family_id=eq.${FAM}`)}`);
      console.log(`  invoices: ${await del("invoices", `family_id=eq.${FAM}`)}`);
      console.log(`  cancellation_tracker: ${await del("cancellation_tracker", `family_id=eq.${FAM}`)}`);
      console.log(`  family_balance: ${await del("family_balance", `family_id=eq.${FAM}`)}`);
      if (parentUids.length) {
        console.log(
          `  user_roles: ${await del("user_roles", `user_id=in.(${inList(parentUids)})`)}`
        );
      }
      console.log(`  players: ${await del("players", `family_id=eq.${FAM}`)}`);
      console.log(`  families: ${await del("families", `id=eq.${FAM}`)}`);
      for (const uid of parentUids) {
        const d = await authDel(uid);
        if (d.ok) {
          console.log(`  auth_user ${uid.slice(0, 8)}: deleted`);
        } else {
          const email = `archived+${uid.slice(0, 8)}@sunrisetennis.com.au`;
          const r = await authRen(uid, email);
          if (r.ok) console.log(`  auth_user ${uid.slice(0, 8)}: renamed -> ${email} (del=${d.status})`);
          else console.log(`  auth_user ${uid.slice(0, 8)}: FAIL del=${d.status} ren=${r.status} ${r.body}`);
        }
      }
    } else {
      wouldDo("vouchers/referrals; NULL booking self-FKs; delete bookings + player-scoped + family-scoped + balance + roles + players + families + auth users");
    }
  }

  // ── Final state ──────────────────────────────────────────────────────────────
  console.log("\n=== FINAL STATE ===");
  for (const F of [C001, S002, T001, T002]) {
    const fr = await sel("families", `id=eq.${F}&select=display_id,stripe_customer_id`);
    if (!fr.length) {
      console.log(`  ${F.slice(0, 8)}: GONE`);
      continue;
    }
    const c = await sel("charges", `family_id=eq.${F}&select=id`);
    const p = await sel("payments", `family_id=eq.${F}&select=id,amount_cents,status,stripe_payment_intent_id`);
    const b = await sel(
      "bookings",
      `or=(family_id.eq.${F},second_family_id.eq.${F})&select=id`
    );
    const fb = await sel(
      "family_balance",
      `family_id=eq.${F}&select=balance_cents,projected_balance_cents,confirmed_balance_cents`
    );
    console.log(
      `  ${fr[0].display_id.padEnd(12)} charges=${c.length} payments=${p.length} bookings=${b.length} fbal=${JSON.stringify(fb[0] || null)} cust=${fr[0].stripe_customer_id || "-"}`
    );
    for (const x of p) {
      console.log(
        `     $${(x.amount_cents / 100).toFixed(2)} ${x.status} pi=${x.stripe_payment_intent_id || "-"}`
      );
    }
  }
  console.log("");
})().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
