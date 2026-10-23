// UI layer: reads state, renders the dashboard, and wires up events.
import {
  PLANS, addDays, createMember, daysLeft, describeDaysLeft, endDate, filterMembers, formatDate,
  formatINR, normalizePhone, renew, renewalsDue, revenueByMonth, statusOf, summarize, toCSV, todayISO, totalPaid,
  whatsappReminder,
} from "./members.js";
import { clearMembers, demoMembers, loadMembers, newId, saveMembers } from "./store.js";
import { renderBarChart } from "./chart.js";

const GYM_NAME = "the gym";
const $ = (sel) => document.querySelector(sel);

function openDialog(selector) {
  const dialog = $(selector);
  dialog.returnValue = ""; // Escape keeps the previous value, so clear it first
  dialog.showModal();
}

const today = todayISO();
const state = {
  members: loadMembers() ?? demoMembers(today),
  filters: { query: "", status: "all", plan: "all", sort: "ending" },
  editingId: null,
  renewingId: null,
  deletingId: null,
};

const STATUS_LABEL = { active: "Active", expiring: "Ending soon", expired: "Expired" };
const compactINR = (n) => (n >= 1000 ? `₹${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `₹${n}`);

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function initials(name) {
  return name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function formatPhone(p) {
  return p.length === 10 ? `${p.slice(0, 5)} ${p.slice(5)}` : p;
}

function persist() {
  saveMembers(state.members);
  render();
}

// ---------- rendering ----------

function renderKpis() {
  const s = summarize(state.members, today);
  const months = revenueByMonth(state.members, today, 2);
  const [prev, current] = months;
  $("#kpi-current").textContent = s.current;
  $("#kpi-current-meta").textContent = `of ${s.total} members on record`;
  $("#kpi-expiring").textContent = s.expiring;
  $("#kpi-expired").textContent = s.expired;
  $("#kpi-revenue").textContent = formatINR(current.total);

  const meta = $("#kpi-revenue-meta");
  if (prev.total > 0) {
    const change = Math.round(((current.total - prev.total) / prev.total) * 100);
    meta.textContent = `${change >= 0 ? "▲" : "▼"} ${Math.abs(change)}% vs ${prev.label}`;
    meta.dataset.trend = change >= 0 ? "up" : "down";
  } else {
    meta.textContent = "First month of data";
    delete meta.dataset.trend;
  }
}

function renderChart() {
  const data = revenueByMonth(state.members, today, 6);
  const total = data.reduce((s, d) => s + d.total, 0);
  $("#revenue-total").innerHTML = `${formatINR(total)}<span>6-month total</span>`;
  renderBarChart($("#revenue-chart"), data, { format: formatINR, compact: compactINR });
}

function renderDue() {
  const due = renewalsDue(state.members, today);
  $("#due-count").textContent = due.length;
  const list = $("#due-list");
  if (!due.length) {
    list.innerHTML = `<li class="due-empty">Nobody is due. Nice work.</li>`;
    return;
  }
  list.innerHTML = due
    .map(({ member: m, left }) => `
      <li class="due" data-id="${m.id}">
        <span class="avatar" aria-hidden="true">${escapeHTML(initials(m.name))}</span>
        <div class="due__who">
          <strong>${escapeHTML(m.name)}</strong>
          <span class="${left < 0 ? "text-red" : "text-amber"}">${describeDaysLeft(left)} · ${PLANS[m.plan].label}</span>
        </div>
        <a class="icon-btn icon-btn--wa" href="${whatsappReminder(m, today, GYM_NAME)}" target="_blank" rel="noopener"
           aria-label="Send WhatsApp reminder to ${escapeHTML(m.name)}" title="WhatsApp reminder">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 0 1-11.8 7L4 20l1.1-4A8 8 0 1 1 20 12Z"/><path d="M9 9.5c.3 2.4 2.1 4.3 4.5 4.8l1-1.1 1.7.7-.3 1.6c-3.6.2-7.3-3.4-7-7l1.6-.3.7 1.7Z"/></svg>
        </a>
        <button class="btn btn--small" type="button" data-action="renew">Renew</button>
      </li>`)
    .join("");
}

function renderMembers() {
  const list = filterMembers(state.members, state.filters, today);
  $("#member-count").textContent = `${list.length} of ${state.members.length} shown`;
  $("#empty-state").hidden = list.length > 0;
  $("#member-rows").innerHTML = list
    .map((m) => {
      const status = statusOf(m, today);
      const left = daysLeft(m, today);
      return `
      <tr data-id="${m.id}">
        <td data-label="Member">
          <div class="who">
            <span class="avatar" aria-hidden="true">${escapeHTML(initials(m.name))}</span>
            <div><strong>${escapeHTML(m.name)}</strong><span class="muted">${formatPhone(m.phone)}</span></div>
          </div>
        </td>
        <td data-label="Plan">${PLANS[m.plan].label}</td>
        <td data-label="Ends"><span>${formatDate(endDate(m))}</span><span class="muted">${describeDaysLeft(left)}</span></td>
        <td data-label="Status"><span class="badge badge--${status}">${STATUS_LABEL[status]}</span></td>
        <td data-label="Total paid" class="num">${formatINR(totalPaid(m))}</td>
        <td class="row-actions">
          <button class="btn btn--small" type="button" data-action="renew">Renew</button>
          <button class="icon-btn" type="button" data-action="edit" aria-label="Edit ${escapeHTML(m.name)}" title="Edit">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/></svg>
          </button>
          <button class="icon-btn" type="button" data-action="delete" aria-label="Remove ${escapeHTML(m.name)}" title="Remove">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/></svg>
          </button>
        </td>
      </tr>`;
    })
    .join("");
}

function render() {
  renderKpis();
  renderChart();
  renderDue();
  renderMembers();
}

// ---------- dialogs ----------

const planOptions = () =>
  Object.values(PLANS).map((p) => `<option value="${p.id}">${p.label} · ${formatINR(p.price)}</option>`).join("");

function openMemberDialog(member) {
  state.editingId = member?.id ?? null;
  const form = $("#member-form");
  form.reset();
  $("#member-dialog-title").textContent = member ? "Edit member" : "Add member";
  form.name.value = member?.name ?? "";
  form.phone.value = member?.phone ?? "";
  form.plan.value = member?.plan ?? "monthly";
  form.startDate.value = member?.startDate ?? today;
  form.amount.value = member ? member.payments.at(-1).amount : PLANS.monthly.price;
  form.amount.disabled = Boolean(member); // payments are recorded through "Renew"
  updateMemberHint();
  openDialog("#member-dialog");
}

function updateMemberHint() {
  const form = $("#member-form");
  if (!form.startDate.value) return;
  const end = addDays(form.startDate.value, PLANS[form.plan.value].days);
  $("#member-hint").textContent = `Membership runs until ${formatDate(end)}.`;
}

function saveMemberFromForm() {
  const f = $("#member-form");
  const data = {
    name: f.name.value,
    phone: f.phone.value,
    plan: f.plan.value,
    startDate: f.startDate.value,
    amount: Number(f.amount.value),
  };
  if (state.editingId) {
    state.members = state.members.map((m) =>
      m.id === state.editingId
        ? { ...m, name: data.name.trim(), phone: normalizePhone(data.phone), plan: data.plan, startDate: data.startDate }
        : m);
    toast(`${data.name.trim()} updated`);
  } else {
    state.members = [createMember({ ...data, id: newId() }), ...state.members];
    toast(`${data.name.trim()} added`);
  }
  persist();
}

function openRenewDialog(member) {
  state.renewingId = member.id;
  const form = $("#renew-form");
  $("#renew-who").textContent = `${member.name} · currently ${PLANS[member.plan].label}, ${describeDaysLeft(daysLeft(member, today)).toLowerCase()}`;
  form.plan.value = member.plan;
  form.amount.value = PLANS[member.plan].price;
  updateRenewHint();
  openDialog("#renew-dialog");
}

function updateRenewHint() {
  const member = state.members.find((m) => m.id === state.renewingId);
  if (!member) return;
  const form = $("#renew-form");
  const preview = renew(member, form.plan.value, today, 0);
  $("#renew-hint").textContent = `New end date: ${formatDate(endDate(preview))}. Unused days carry over.`;
}

function renewFromForm() {
  const form = $("#renew-form");
  let name = "";
  state.members = state.members.map((m) => {
    if (m.id !== state.renewingId) return m;
    name = m.name;
    return renew(m, form.plan.value, today, Number(form.amount.value));
  });
  toast(`Renewed ${name} · ${formatINR(Number(form.amount.value))} recorded`);
  persist();
}

// ---------- misc ----------

let toastTimer;
function toast(message) {
  const t = $("#toast");
  t.textContent = message;
  t.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("is-visible"), 2600);
}

function exportCSV() {
  const blob = new Blob([toCSV(state.members, today)], { type: "text/csv" });
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: `gymdesk-members-${today}.csv`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

function applyTheme(theme) {
  if (theme) document.documentElement.dataset.theme = theme;
  try {
    if (theme) localStorage.setItem("gymdesk.theme", theme);
  } catch { /* ignore */ }
}

function toggleTheme() {
  const isDark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(isDark ? "light" : "dark");
}

// ---------- events ----------

function onRowAction(e) {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const id = btn.closest("[data-id]").dataset.id;
  const member = state.members.find((m) => m.id === id);
  if (!member) return;
  if (btn.dataset.action === "renew") openRenewDialog(member);
  if (btn.dataset.action === "edit") openMemberDialog(member);
  if (btn.dataset.action === "delete") {
    state.deletingId = id;
    $("#confirm-text").textContent = `${member.name} and their payment history will be removed from this dashboard.`;
    openDialog("#confirm-dialog");
  }
}

function init() {
  try {
    const saved = localStorage.getItem("gymdesk.theme");
    if (saved) applyTheme(saved);
  } catch { /* ignore */ }

  $("#today-label").textContent = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
  $("#plan-select").innerHTML = planOptions();
  $("#renew-plan").innerHTML = planOptions();
  $("#plan-filter").insertAdjacentHTML("beforeend", Object.values(PLANS).map((p) => `<option value="${p.id}">${p.label}</option>`).join(""));

  $("#add-member").addEventListener("click", () => openMemberDialog());
  $("#export-csv").addEventListener("click", exportCSV);
  $("#theme-toggle").addEventListener("click", toggleTheme);
  $("#reset-demo").addEventListener("click", () => {
    clearMembers();
    state.members = demoMembers(today);
    persist();
    toast("Demo data restored");
  });

  $("#search").addEventListener("input", (e) => { state.filters.query = e.target.value; renderMembers(); });
  $("#plan-filter").addEventListener("change", (e) => { state.filters.plan = e.target.value; renderMembers(); });
  $("#sort").addEventListener("change", (e) => { state.filters.sort = e.target.value; renderMembers(); });
  $("#status-filter").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-status]");
    if (!btn) return;
    state.filters.status = btn.dataset.status;
    for (const b of e.currentTarget.children) b.setAttribute("aria-checked", String(b === btn));
    renderMembers();
  });

  $("#member-rows").addEventListener("click", onRowAction);
  $("#due-list").addEventListener("click", onRowAction);

  const memberForm = $("#member-form");
  memberForm.plan.addEventListener("change", () => {
    if (!state.editingId) memberForm.amount.value = PLANS[memberForm.plan.value].price;
    updateMemberHint();
  });
  memberForm.startDate.addEventListener("change", updateMemberHint);
  $("#member-dialog").addEventListener("close", (e) => {
    if (e.target.returnValue === "save") saveMemberFromForm();
  });

  const renewForm = $("#renew-form");
  renewForm.plan.addEventListener("change", () => {
    renewForm.amount.value = PLANS[renewForm.plan.value].price;
    updateRenewHint();
  });
  $("#renew-dialog").addEventListener("close", (e) => {
    if (e.target.returnValue === "renew") renewFromForm();
  });

  $("#confirm-dialog").addEventListener("close", (e) => {
    if (e.target.returnValue !== "delete") return;
    const gone = state.members.find((m) => m.id === state.deletingId);
    state.members = state.members.filter((m) => m.id !== state.deletingId);
    if (gone) toast(`${gone.name} removed`);
    persist();
  });

  render();

  // Re-draw the chart at the new width so its labels stay readable.
  let resizeTimer;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderChart, 120);
  }).observe($("#revenue-chart"));
}

init();
