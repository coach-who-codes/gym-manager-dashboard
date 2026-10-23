// Pure membership logic. No DOM access here, so every function can be unit-tested in Node.

export const PLANS = {
  monthly: { id: "monthly", label: "Monthly", days: 30, price: 1500 },
  quarterly: { id: "quarterly", label: "Quarterly", days: 90, price: 4000 },
  half: { id: "half", label: "Half-yearly", days: 180, price: 7000 },
  yearly: { id: "yearly", label: "Yearly", days: 365, price: 12000 },
  pt: { id: "pt", label: "Personal training", days: 30, price: 8000 },
};

/** A membership counts as "expiring" when it ends within this many days. */
export const EXPIRING_WINDOW = 7;

const DAY_MS = 86_400_000;
const pad = (n) => String(n).padStart(2, "0");

// ---------- dates (ISO yyyy-mm-dd strings, calculated in UTC to avoid DST/timezone drift) ----------

export function parseDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISO(date) {
  return date.toISOString().slice(0, 10);
}

export function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(iso, days) {
  const d = parseDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

export function daysBetween(fromIso, toIso) {
  return Math.round((parseDate(toIso) - parseDate(fromIso)) / DAY_MS);
}

// ---------- membership status ----------

export function endDate(member) {
  return addDays(member.startDate, PLANS[member.plan].days);
}

export function daysLeft(member, today) {
  return daysBetween(today, endDate(member));
}

/** "active" | "expiring" | "expired" */
export function statusOf(member, today) {
  const left = daysLeft(member, today);
  if (left < 0) return "expired";
  if (left <= EXPIRING_WINDOW) return "expiring";
  return "active";
}

export function totalPaid(member) {
  return member.payments.reduce((sum, p) => sum + p.amount, 0);
}

/**
 * Renew a membership. If the current plan is still running, the new period
 * starts when the current one ends, so the member never loses paid days.
 */
export function renew(member, planId, today, amount = PLANS[planId].price) {
  if (!PLANS[planId]) throw new Error(`Unknown plan: ${planId}`);
  const currentEnd = endDate(member);
  const start = daysBetween(today, currentEnd) > 0 ? currentEnd : today;
  return {
    ...member,
    plan: planId,
    startDate: start,
    payments: [...member.payments, { date: today, amount, plan: planId }],
  };
}

export function createMember({ id, name, phone, plan, startDate, amount }) {
  if (!name || !name.trim()) throw new Error("Name is required");
  if (!PLANS[plan]) throw new Error(`Unknown plan: ${plan}`);
  return {
    id,
    name: name.trim(),
    phone: normalizePhone(phone),
    plan,
    startDate,
    payments: [{ date: startDate, amount: amount ?? PLANS[plan].price, plan }],
  };
}

export function normalizePhone(phone = "") {
  const digits = String(phone).replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

// ---------- dashboard numbers ----------

export function summarize(members, today) {
  const counts = { active: 0, expiring: 0, expired: 0 };
  for (const m of members) counts[statusOf(m, today)] += 1;
  return {
    total: members.length,
    current: counts.active + counts.expiring, // members who can walk in today
    expiring: counts.expiring,
    expired: counts.expired,
  };
}

/** Revenue for each of the last `months` calendar months, oldest first. */
export function revenueByMonth(members, today, months = 6) {
  const t = parseDate(today);
  const buckets = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - i, 1));
    buckets.push({
      key: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`,
      label: d.toLocaleString("en-IN", { month: "short", timeZone: "UTC" }),
      total: 0,
    });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const m of members) {
    for (const p of m.payments) {
      const bucket = byKey.get(p.date.slice(0, 7));
      if (bucket) bucket.total += p.amount;
    }
  }
  return buckets;
}

/** Members who need a renewal call: ending within the window, or lapsed in the last `lapsedDays`. */
export function renewalsDue(members, today, lapsedDays = 15) {
  return members
    .map((m) => ({ member: m, left: daysLeft(m, today) }))
    .filter(({ left }) => left <= EXPIRING_WINDOW && left >= -lapsedDays)
    .sort((a, b) => a.left - b.left);
}

export function filterMembers(members, { query = "", status = "all", plan = "all", sort = "ending" } = {}, today) {
  const q = query.trim().toLowerCase();
  const list = members.filter((m) => {
    if (status !== "all" && statusOf(m, today) !== status) return false;
    if (plan !== "all" && m.plan !== plan) return false;
    if (q && !m.name.toLowerCase().includes(q) && !m.phone.includes(q)) return false;
    return true;
  });
  const sorters = {
    ending: (a, b) => daysLeft(a, today) - daysLeft(b, today),
    name: (a, b) => a.name.localeCompare(b.name),
    paid: (a, b) => totalPaid(b) - totalPaid(a),
  };
  return list.sort(sorters[sort] ?? sorters.ending);
}

// ---------- formatting & export ----------

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export const formatINR = (n) => inr.format(n);
export const formatDate = (iso) => dateFmt.format(parseDate(iso));

export function describeDaysLeft(left) {
  if (left < 0) return `Ended ${-left} day${left === -1 ? "" : "s"} ago`;
  if (left === 0) return "Ends today";
  return `${left} day${left === 1 ? "" : "s"} left`;
}

function csvCell(value) {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(members, today) {
  const header = ["Name", "Phone", "Plan", "Start", "End", "Status", "Total paid (INR)"];
  const rows = members.map((m) => [
    m.name,
    m.phone,
    PLANS[m.plan].label,
    m.startDate,
    endDate(m),
    statusOf(m, today),
    totalPaid(m),
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}

/** wa.me link with a ready-to-send renewal reminder. */
export function whatsappReminder(member, today, gymName = "our gym") {
  const first = member.name.split(" ")[0];
  const left = daysLeft(member, today);
  const when = formatDate(endDate(member));
  const plan = PLANS[member.plan].label.toLowerCase();
  const text =
    left < 0
      ? `Hi ${first}, your ${plan} membership at ${gymName} ended on ${when}. Renew this week and get back on track. Reply here and I'll set it up.`
      : `Hi ${first}, your ${plan} membership at ${gymName} ends on ${when}. Renew before then so you don't miss a session. Reply here and I'll set it up.`;
  return `https://wa.me/91${member.phone}?text=${encodeURIComponent(text)}`;
}
