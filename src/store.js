// Persistence (localStorage) and demo data. Everything stays in the visitor's browser.
import { PLANS, addDays, daysBetween } from "./members.js";

const KEY = "gymdesk.members.v1";

export function loadMembers() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // private mode or blocked storage: fall back to demo data
  }
}

export function saveMembers(members) {
  try {
    localStorage.setItem(KEY, JSON.stringify(members));
  } catch {
    /* storage unavailable; the app keeps working in memory */
  }
}

export function clearMembers() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export const newId = () => Math.random().toString(36).slice(2, 10);

// Small deterministic PRNG so the demo looks the same on every first visit.
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = [
  "Rohan Mehta", "Priya Sharma", "Arjun Verma", "Sneha Patel", "Vikram Singh", "Ananya Gupta",
  "Karan Malhotra", "Pooja Jain", "Rahul Yadav", "Neha Kulkarni", "Aditya Rao", "Kavya Nair",
  "Siddharth Joshi", "Ishita Agarwal", "Manish Tiwari", "Ritika Choudhary", "Harsh Pandey",
  "Simran Kaur", "Nikhil Saxena", "Aisha Khan", "Varun Bhatia", "Meera Iyer", "Yash Thakur",
  "Tanvi Deshmukh", "Abhishek Mishra", "Shreya Banerjee", "Kunal Chauhan", "Divya Raghav",
];

const PLAN_WEIGHTS = [
  ["monthly", 0.42], ["quarterly", 0.28], ["half", 0.12], ["yearly", 0.08], ["pt", 0.1],
];

function pickPlan(rand) {
  let r = rand();
  for (const [id, w] of PLAN_WEIGHTS) {
    if ((r -= w) <= 0) return id;
  }
  return "monthly";
}

/**
 * Builds ~6 months of realistic history relative to `today`:
 * members join on different days, renew when a plan ends, and some stop coming.
 */
export function demoMembers(today) {
  const rand = mulberry32(42);
  return NAMES.map((name, i) => {
    let plan = pickPlan(rand);
    let start = addDays(today, -Math.floor(5 + rand() * 210));
    const quits = rand() < 0.22;
    const payments = [];

    // The first five members end inside the reminder window, so "Renewals due" always has work in it.
    if (i < 5) {
      plan = i % 2 ? "quarterly" : "monthly";
      start = addDays(today, -(PLANS[plan].days - [0, 2, 3, 5, 6][i]));
    }

    for (;;) {
      payments.push({ date: start, amount: PLANS[plan].price, plan });
      const end = addDays(start, PLANS[plan].days);
      if (daysBetween(today, end) >= 0) break; // still running
      if (quits && rand() < 0.6) break; // member stopped renewing
      if (rand() < 0.15) plan = pickPlan(rand); // occasional plan switch
      start = end;
    }

    return {
      id: `demo${i}`,
      name,
      phone: `98765${String(43200 + i * 7).padStart(5, "0")}`, // placeholder numbers
      plan,
      startDate: start,
      payments,
    };
  });
}
