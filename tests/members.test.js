import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLANS, addDays, createMember, daysBetween, endDate, filterMembers, formatINR, normalizePhone,
  renew, renewalsDue, revenueByMonth, statusOf, summarize, toCSV, totalPaid, whatsappReminder,
} from "../src/members.js";
import { demoMembers } from "../src/store.js";

const TODAY = "2026-10-24";
const member = (overrides = {}) =>
  createMember({ id: "m1", name: "Rohan Mehta", phone: "98765 43210", plan: "monthly", startDate: "2026-10-01", ...overrides });

test("date helpers handle month and year boundaries", () => {
  assert.equal(addDays("2026-01-31", 1), "2026-02-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(daysBetween("2026-10-01", "2026-10-31"), 30);
  assert.equal(daysBetween("2026-10-31", "2026-10-01"), -30);
});

test("status is active, expiring or expired based on days left", () => {
  assert.equal(statusOf(member({ startDate: "2026-10-20" }), TODAY), "active"); // ends 19 Nov
  assert.equal(statusOf(member({ startDate: "2026-10-01" }), TODAY), "expiring"); // ends 31 Oct, 7 days left
  assert.equal(statusOf(member({ startDate: "2026-09-24" }), TODAY), "expiring"); // ends today
  assert.equal(statusOf(member({ startDate: "2026-09-20" }), TODAY), "expired");
});

test("renewing early carries unused days over", () => {
  const m = member({ startDate: "2026-10-01" }); // ends 31 Oct
  const renewed = renew(m, "quarterly", TODAY);
  assert.equal(renewed.startDate, "2026-10-31");
  assert.equal(endDate(renewed), "2027-01-29");
  assert.equal(renewed.payments.at(-1).amount, PLANS.quarterly.price);
  assert.equal(m.payments.length, 1, "original member is not mutated");
});

test("renewing a lapsed member starts from today", () => {
  const renewed = renew(member({ startDate: "2026-08-01" }), "monthly", TODAY, 1200);
  assert.equal(renewed.startDate, TODAY);
  assert.equal(totalPaid(renewed), 1500 + 1200);
});

test("createMember validates input and normalises phone numbers", () => {
  assert.throws(() => member({ name: "  " }), /Name is required/);
  assert.throws(() => member({ plan: "weekly" }), /Unknown plan/);
  assert.equal(normalizePhone("+91 98765-43210"), "9876543210");
});

test("summarize counts walk-in members, expiring and expired", () => {
  const list = [
    member({ id: "a", startDate: "2026-10-20" }),
    member({ id: "b", startDate: "2026-10-01" }),
    member({ id: "c", startDate: "2026-08-01" }),
  ];
  assert.deepEqual(summarize(list, TODAY), { total: 3, current: 2, expiring: 1, expired: 1 });
});

test("revenueByMonth groups payments into the last N months", () => {
  const list = [
    member({ id: "a", startDate: "2026-10-02" }),
    member({ id: "b", startDate: "2026-09-15", plan: "pt" }),
    member({ id: "c", startDate: "2025-01-01" }), // outside the window
  ];
  const months = revenueByMonth(list, TODAY, 3);
  assert.deepEqual(months.map((m) => m.key), ["2026-08", "2026-09", "2026-10"]);
  assert.deepEqual(months.map((m) => m.total), [0, 8000, 1500]);
});

test("renewalsDue lists soonest first and skips long-lapsed members", () => {
  const list = [
    member({ id: "soon", startDate: "2026-09-27" }), // ends in 3 days
    member({ id: "lapsed", startDate: "2026-09-20" }), // ended 4 days ago
    member({ id: "old", startDate: "2026-06-01" }), // ended months ago
    member({ id: "fine", startDate: "2026-10-20" }),
  ];
  assert.deepEqual(renewalsDue(list, TODAY).map((d) => d.member.id), ["lapsed", "soon"]);
});

test("filterMembers searches, filters and sorts", () => {
  const list = [
    member({ id: "a", name: "Zara Ali", startDate: "2026-10-20" }),
    member({ id: "b", name: "Aman Roy", startDate: "2026-10-01", plan: "monthly" }),
    member({ id: "c", name: "Neha Jain", startDate: "2026-10-10", plan: "yearly" }),
  ];
  assert.deepEqual(filterMembers(list, { sort: "name" }, TODAY).map((m) => m.id), ["b", "c", "a"]);
  assert.deepEqual(filterMembers(list, { query: "zara" }, TODAY).map((m) => m.id), ["a"]);
  assert.deepEqual(filterMembers(list, { plan: "yearly" }, TODAY).map((m) => m.id), ["c"]);
  assert.deepEqual(filterMembers(list, { status: "expiring" }, TODAY).map((m) => m.id), ["b"]);
});

test("CSV export escapes commas and quotes", () => {
  const csv = toCSV([member({ name: 'Rohan "Ro" Mehta, Jr' })], TODAY);
  const [header, row] = csv.split("\n");
  assert.match(header, /^Name,Phone,Plan/);
  assert.ok(row.startsWith('"Rohan ""Ro"" Mehta, Jr",9876543210,Monthly'));
});

test("WhatsApp reminder link uses the member's number and end date", () => {
  const url = new URL(whatsappReminder(member(), TODAY, "Energy Gym"));
  assert.equal(url.pathname, "/919876543210");
  assert.match(url.searchParams.get("text"), /^Hi Rohan, your monthly membership at Energy Gym ends on 31 Oct 2026/);
});

test("formatINR uses Indian digit grouping", () => {
  assert.equal(formatINR(125000), "₹1,25,000");
});

test("demo data always has renewals to show", () => {
  const demo = demoMembers(TODAY);
  assert.equal(demo.length, 28);
  assert.ok(renewalsDue(demo, TODAY).length >= 5);
  assert.ok(revenueByMonth(demo, TODAY).every((m) => m.total > 0));
});
