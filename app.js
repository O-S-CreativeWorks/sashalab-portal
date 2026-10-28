"use strict";

/* ============================================================
   1. UTILITIES (Pomocné funkce)
   ============================================================ */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === "class") node.className = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
  return node;
};

const uid = (prefix = "id") => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const fmtCZK = (n) => new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK" }).format(Number(n) || 0);
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("cs-CZ") : "—";
const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString("cs-CZ") : "—";
const todayISO = () => new Date().toISOString().slice(0, 10);

function calcAge(dateISO) {
  if (!dateISO) return null;
  const d = new Date(dateISO);
  if (isNaN(d)) return null;
  const t = new Date();
  let age = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) age--;
  return age;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function addDays(dateISO, days) {
  const d = new Date(dateISO);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function getWeekday(dateISO) { return new Date(dateISO).getDay(); }
function fmtDateShort(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric" });
}

/* ============================================================
   2. STORE (localStorage)
   ============================================================ */
const STORE_KEY = "sashalab_erp_v3";

const defaultState = () => ({
  theme: "dark",
  settings: {
    companyName: "O&S CreativeWorks — SashaLab", address: "Jungmannova 871/16, Kuřim", 
    lectorName: "Oleksandr Kukushkin", emailMain: "os.cre8ive@gmail.com", emailCopy: "sasha2010.03.06@gmail.com",
    invoicePrefix: "SL", invoiceCounter: 1,
    workingHours: {
      1: { open: true, from: "15:00", to: "20:00" }, 2: { open: true, from: "15:30", to: "20:00" },
      3: { open: true, from: "18:00", to: "20:00" }, 4: { open: false, from: "", to: "" },
      5: { open: false, from: "", to: "" }, 6: { open: true, from: "12:00", to: "20:00" },
      0: { open: false, from: "", to: "" }
    }
  },
  students: [], lessons: [], homeworks: [], invoices: [], questions: [], print3d: [], recurringTemplates: [], studentPackages: [],
  pricing: [
    { id: "p_lesson_60", name: "Individuální lekce 60 min", price: 450 },
    { id: "p_lesson_45", name: "Individuální lekce 45 min", price: 350 },
    { id: "p_online", name: "Online lekce 60 min", price: 400 }
  ],
  packageDefs: [
    { id: "pk_10", name: "Balíček 10 lekcí", lessons: 10, price: 4000, validityDays: 180 },
    { id: "pk_5", name: "Balíček 5 lekcí", lessons: 5, price: 2100, validityDays: 90 }
  ]
});

let state = JSON.parse(localStorage.getItem(STORE_KEY) || "null") || defaultState();

function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { toast("Nepodařilo se uložit data.", "danger"); }
}

/* ============================================================
   3. UI & TÉMA
   ============================================================ */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const btn = $("#btnTheme");
  if (btn) btn.textContent = theme === "dark" ? "🌙" : "☀️";
  state.theme = theme;
  saveState();
}

function toast(msg, type = "ok", ms = 3000) {
  const wrap = $("#toastWrap");
  if (!wrap) return;
  const t = el("div", { class: `toast ${type}` }, msg);
  wrap.appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateX(20px)"; setTimeout(() => t.remove(), 200); }, ms);
}

function openModal({ title, body, footer, size = "" }) {
  const backdrop = $("#modalBackdrop"), modal = $("#modal");
  if (!backdrop || !modal) return;
  $("#modalTitle").textContent = title || "";
  const bodyEl = $("#modalBody"), footEl = $("#modalFooter");
  bodyEl.innerHTML = ""; footEl.innerHTML = "";
  if (typeof body === "string") bodyEl.innerHTML = body; else if (body instanceof Node) bodyEl.appendChild(body);
  if (Array.isArray(footer)) footer.forEach((n) => footEl.appendChild(n));
  modal.className = `modal ${size}`.trim();
  backdrop.classList.add("open");
}
function closeModal() { $("#modalBackdrop")?.classList.remove("open"); }

/* ============================================================
   4. POMOCNÉ VÝPOČTY (Platby, balíčky, odznaky)
   ============================================================ */
function invoicePaidTotal(inv) { return (inv.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0); }
function invoiceRemaining(inv) { return Math.max(0, (Number(inv.total) || 0) - invoicePaidTotal(inv)); }
function invoiceEffectiveStatus(inv) {
  const paid = invoicePaidTotal(inv); const total = Number(inv.total) || 0;
  if (paid >= total && total > 0) return "paid";
  if (paid > 0) return "partial";
  if (inv.dueDate && inv.dueDate < todayISO()) return "overdue";
  return "issued";
}

function activePackagesFor(studentId) {
  return state.studentPackages.filter((p) => p.studentId === studentId && p.lessonsUsed < p.lessonsTotal && (!p.expiresAt || p.expiresAt >= todayISO()));
}
function totalAvailableLessons(studentId) { return activePackagesFor(studentId).reduce((sum, p) => sum + (p.lessonsTotal - p.lessonsUsed), 0); }
function consumeLessonFromPackage(studentId) {
  const list = activePackagesFor(studentId).sort((a, b) => (a.expiresAt || "9999").localeCompare(b.expiresAt || "9999"));
  if (!list.length) return false;
  list[0].lessonsUsed += 1; return true;
}

const BADGE_DEFS = [
  { id: "b1", icon: "🎸", title: "První krůček", check: s => state.lessons.filter(l => l.studentId===s.id && l.status==="present").length >= 1 },
  { id: "b2", icon: "🔟", title: "10 lekcí", check: s => state.lessons.filter(l => l.studentId===s.id && l.status==="present").length >= 10 },
  { id: "b3", icon: "🔥", title: "5× v řadě", check: s => state.lessons.filter(l => l.studentId===s.id).length >= 5 },
  { id: "b4", icon: "✎", title: "5 úkolů", check: s => state.homeworks.filter(h => h.studentId===s.id && h.done).length >= 5 },
  { id: "b5", icon: "⭐", title: "Nový level", check: s => s.level && s.level !== "Začátečník" }
];
function getEarnedBadges(s) { return BADGE_DEFS.filter(b => b.check(s)); }

const AI_KB = [
  { k: ["akord", "barré", "bar"], a: "Základní akordy: C, G, D, A, E, Am, Em. Pro barré F dur drž prst nízko za pražcem." },
  { k: ["rytmus", "metronom"], a: "Cvič s metronomem na 60 BPM. Přesnost je důležitější než rychlost." },
  { k: ["ladění", "ladička"], a: "Standardní ladění kytary je E-A-D-G-H-E." }
];
function askAI(q) {
  const norm = q.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const hit = AI_KB.find(i => i.k.some(k => norm.includes(k)));
  return hit ? hit.a : null;
}
function escalateQ(studentId, q) {
  const s = state.students.find(x => x.id === studentId);
  state.questions.push({ id: uid("q"), studentId, studentName: s.firstName + " " + s.lastName, question: q, date: new Date().toISOString(), answered: false });
  saveState();
  const sub = encodeURIComponent("Dotaz od žáka: " + s.firstName + " " + s.lastName);
  const bod = encodeURIComponent("Žák " + s.firstName + " " + s.lastName + " se zeptal:\n\n" + q + "\n\nProsím o odpověď.");
  window.open(`mailto:${state.settings.emailMain}?cc=${state.settings.emailCopy}&subject=${sub}&body=${bod}`, "_blank");
}

/* ============================================================
   5. ROUTER & MODULY (Plné funkce)
   ============================================================ */
const ROUTES = {};
function navigate(route) {
  if (!route) route = "dashboard";
  $$("#nav a").forEach(a => a.classList.toggle("active", a.dataset.route === route));
  const titles = { dashboard:"Dashboard", students:"Studenti", lessons:"Docházka", homework:"Domácí úkoly", certificates:"Certifikáty", invoices:"Fakturace", packages:"Balíčky", pricing:"Ceník", settings:"Nastavení" };
  $("#pageTitle").textContent = titles[route] || "Dashboard";
  const app = $("#app"); app.innerHTML = "";
  if (ROUTES[route]) ROUTES[route](app);
  $("#sidebar")?.classList.remove("open");
}

ROUTES.dashboard = (app) => {
  const grid = el("div", { class: "grid grid-4" });
  [["Studenti", state.students.length], ["Lekce", state.lessons.length], ["Úkoly", state.homeworks.length], ["Faktury", state.invoices.length]].forEach(([l,v]) => {
    grid.appendChild(el("div", { class: "stat" }, el("span", { class: "label" }, l), el("span", { class: "value brand" }, String(v))));
  });
  app.appendChild(grid);

  const openQ = state.questions.filter(q => !q.answered);
  if (openQ.length) {
    const c = el("div", { class: "card", style: "margin-top:16px; border-left:4px solid var(--danger)" }, el("h3", { style: "color:var(--danger)" }, `✉ Nezodpovězené dotazy (${openQ.length})`));
    openQ.forEach(q => c.appendChild(el("div", { style: "padding:8px 0; border-bottom:1px solid var(--border); font-size:13px" }, el("strong", {}, q.studentName + ": "), q.question)));
    app.appendChild(c);
  }
};

ROUTES.students = (app) => {
  app.appendChild(el("div", { style: "margin-bottom:16px" }, el("button", { class: "btn btn-primary", onclick: () => openStudentForm() }, "+ Přidat studenta")));
  const c = el("div", { class: "card" });
  if (!state.students.length) { c.appendChild(el("div", { class: "empty-state" }, "Žádní studenti.")); app.appendChild(c); return; }
  
  const t = el("table", { class: "table" });
  t.appendChild(el("thead", {}, el("tr", {}, el("th", {}, "Jméno"), el("th", {}, "Věk"), el("th", {}, "Odznaky"), el("th", {}, "Balíček"), el("th", {}, "Akce"))));
  state.students.forEach(s => {
    const badges = getEarnedBadges(s).length;
    const pkg = totalAvailableLessons(s.id);
    t.appendChild(el("tbody", {}, el("tr", {},
      el("td", {}, el("strong", {}, s.firstName + " " + s.lastName)),
      el("td", {}, calcAge(s.birthDate) !== null ? calcAge(s.birthDate) + " let" : "—"),
      el("td", {}, el("span", { class: "badge info" }, badges + " / " + BADGE_DEFS.length)),
      el("td", {}, pkg > 0 ? el("span", { class: "badge ok" }, pkg + " lekcí") : "—"),
      el("td", { class: "actions" },
        el("button", { class: "btn btn-sm", onclick: () => openStudentDetail(s.id) }, "Detail"), " ",
        el("button", { class: "btn btn-sm btn-danger", onclick: () => { if (confirm("Smazat?")) { state.students = state.students.filter(x => x.id !== s.id); saveState(); navigate("students"); } } }, "Smazat")
      )
    )));
  });
  c.appendChild(t); app.appendChild(c);
};

function openStudentForm(id = null) {
  const edit = id ? state.students.find(x => x.id === id) : null;
  const s = edit || { id: uid("stu"), firstName: "", lastName: "", birthDate: "", level: "Začátečník" };
  const form = el("form", {});
  form.append(
    el("div", { class: "form-row" }, el("div", { class: "field" }, el("label", {}, "Jméno"), el("input", { name: "firstName", value: s.firstName, required: true })), el("div", { class: "field" }, el("label", {}, "Příjmení"), el("input", { name: "lastName", value: s.lastName, required: true }))),
    el("div", { class: "form-row" }, el("div", { class: "field" }, el("label", {}, "Datum narození"), el("input", { type: "date", name: "birthDate", value: s.birthDate })), el("div", { class: "field" }, el("label", {}, "Úroveň"), el("select", { name: "level" }, ...["Začátečník", "Mírně pokročilý", "Pokročilý", "Expert"].map(l => el("option", { value: l, selected: s.level === l }, l)))))
  );
  form.onsubmit = e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form).entries());
    const payload = { ...s, ...d };
    if (edit) { const i = state.students.findIndex(x => x.id === s.id); state.students[i] = payload; }
    else state.students.push(payload);
    saveState(); closeModal(); toast("Uloženo."); navigate("students");
  };
  openModal({ title: edit ? "Upravit studenta" : "Nový student", body: form, footer: [el("button", { class: "btn btn-primary", onclick: () => form.requestSubmit() }, "Uložit")] });
}

function openStudentDetail(id) {
  const s = state.students.find(x => x.id === id);
  if (!s) return;
  const badges = getEarnedBadges(s);
  const body = el("div", {},
    el("div", { class: "card" },
      el("h3", {}, "Rodičovský portál"),
      el("p", { style: "font-size:12px; color:var(--text-dim); margin-bottom:10px" }, "Pošlete odkaz rodičům."),
      el("div", { style: "display:flex; gap:8px; align-items:center" },
        el("input", { value: "https://o-s-creativeworks.github.io/sashalab-portal/#/portal/" + (s.publicToken || ""), readonly: true, style: "flex:1; background:var(--bg-3); border:1px solid var(--border); padding:8px; border-radius:6px" }),
        el("button", { class: "btn btn-sm", onclick: () => {
          if (!s.publicToken) { s.publicToken = uid("tok"); saveState(); openStudentDetail(id); }
          else { navigator.clipboard?.writeText("https://o-s-creativeworks.github.io/sashalab-portal/#/portal/" + s.publicToken); toast("Zkopírováno!"); }
        } }, s.publicToken ? "📋 Kopírovat" : "🔗 Vygenerovat")
      )
    ),
    el("div", { class: "card" }, el("h3", {}, `Odznaky (${badges.length})`), el("div", { class: "badges-grid" }, ...BADGE_DEFS.map(b => el("div", { class: `badge-card ${badges.includes(b) ? 'earned' : ''}` }, el("div", { class: "b-icon" }, b.icon), el("div", { class: "b-title" }, b.title)))))
  );
  openModal({ title: `Profil: ${s.firstName} ${s.lastName}`, body, footer: [el("button", { class: "btn", onclick: closeModal }, "Zavřít")], size: "lg" });
}

/* --- DOCHÁZKA --- */
ROUTES.lessons = (app) => {
  app.appendChild(el("div", { class: "filters" }, el("button", { class: "btn btn-primary", onclick: () => openLessonForm() }, "+ Nová lekce")));
  const c = el("div", { class: "card" });
  if (!state.lessons.length) { c.appendChild(el("div", { class: "empty-state" }, "Žádné lekce.")); app.appendChild(c); return; }
  const t = el("table", { class: "table" });
  t.appendChild(el("thead", {}, el("tr", {}, el("th", {}, "Datum"), el("th", {}, "Student"), el("th", {}, "Stav"), el("th", {}))));
  [...state.lessons].sort((a,b)=>(b.date||"").localeCompare(a.date||"")).forEach(l => {
    const s = state.students.find(x => x.id === l.studentId);
    t.appendChild(el("tbody", {}, el("tr", {},
      el("td", {}, fmtDate(l.date)), el("td", {}, s ? s.firstName + " " + s.lastName : "—"),
      el("td", {}, el("span", { class: `badge ${l.status === "present" ? "ok" : l.status === "absent" ? "danger" : "warn"}` }, l.status === "present" ? "Přítomen" : l.status === "absent" ? "Neomluven" : "Omluven")),
      el("td", { class: "actions" }, el("button", { class: "btn btn-sm btn-danger", onclick: () => { if (confirm("Smazat?")) { state.lessons = state.lessons.filter(x=>x.id!==l.id); saveState(); navigate("lessons"); } } }, "✕"))
    )));
  });
  c.appendChild(t); app.appendChild(c);
};
function openLessonForm() {
  if (!state.students.length) { toast("Nejprve student.", "danger"); return; }
  const form = el("form", {});
  form.append(
    el("div", { class: "form-row" }, el("div", { class: "field" }, el("label", {}, "Student"), el("select", { name: "studentId" }, ...state.students.map(s => el("option", { value: s.id }, s.firstName + " " + s.lastName)))), el("div", { class: "field" }, el("label", {}, "Datum"), el("input", { type: "date", name: "date", value: todayISO() }))),
    el("div", { class: "form-row full" }, el("div", { class: "field" }, el("label", {}, "Stav"), el("select", { name: "status" }, el("option", { value: "present" }, "Přítomen"), el("option", { value: "excused" }, "Omluven"), el("option", { value: "absent" }, "Neomluven"))))
  );
  form.onsubmit = e => { e.preventDefault(); const d = Object.fromEntries(new FormData(form).entries()); state.lessons.push({ id: uid("les"), ...d }); saveState(); closeModal(); toast("Uloženo."); navigate("lessons"); };
  openModal({ title: "Nová lekce", body: form, footer: [el("button", { class: "btn btn-primary", onclick: () => form.requestSubmit() }, "Uložit")] });
}

/* --- DOMÁCÍ ÚKOLY --- */
ROUTES.homework = (app) => {
  app.appendChild(el("div", { class: "filters" }, el("button", { class: "btn btn-primary", onclick: () => openHomeworkForm() }, "+ Nový úkol")));
  const c = el("div", { class: "card" });
  if (!state.homeworks.length) { c.appendChild(el("div", { class: "empty-state" }, "Žádné úkoly.")); app.appendChild(c); return; }
  const t = el("table", { class: "table" });
  t.appendChild(el("thead", {}, el("tr", {}, el("th", {}, "Student"), el("th", {}, "Úkol"), el("th", {}, "Stav"), el("th", {}))));
  state.homeworks.forEach(h => {
    const s = state.students.find(x => x.id === h.studentId);
    t.appendChild(el("tbody", {}, el("tr", {},
      el("td", {}, s ? s.firstName + " " + s.lastName : "—"), el("td", {}, h.title),
      el("td", {}, h.done ? el("span", { class: "badge ok" }, "Splněno") : el("span", { class: "badge warn" }, "Otevřeno")),
      el("td", { class: "actions" }, el("button", { class: "btn btn-sm btn-danger", onclick: () => { if (confirm("Smazat?")) { state.homeworks = state.homeworks.filter(x=>x.id!==h.id); saveState(); navigate("homework"); } } }, "✕"))
    )));
  });
  c.appendChild(t); app.appendChild(c);
};
function openHomeworkForm() {
  if (!state.students.length) { toast("Nejprve student.", "danger"); return; }
  const form = el("form", {});
  form.append(el("div", { class: "form-row" }, el("div", { class: "field" }, el("label", {}, "Student"), el("select", { name: "studentId" }, ...state.students.map(s => el("option", { value: s.id }, s.firstName + " " + s.lastName)))), el("div", { class: "field" }, el("label", {}, "Název úkolu"), el("input", { name: "title", required: true }))));
  form.onsubmit = e => { e.preventDefault(); const d = Object.fromEntries(new FormData(form).entries()); state.homeworks.push({ id: uid("hw"), ...d, done: false, date: new Date().toISOString() }); saveState(); closeModal(); toast("Uloženo."); navigate("homework"); };
  openModal({ title: "Nový úkol", body: form, footer: [el("button", { class: "btn btn-primary", onclick: () => form.requestSubmit() }, "Uložit")] });
}

/* --- FAKTURACE --- */
ROUTES.invoices = (app) => {
  app.appendChild(el("div", { class: "filters" }, el("button", { class: "btn btn-primary", onclick: () => openInvoiceForm() }, "+ Nová faktura")));
  const c = el("div", { class: "card" });
  if (!state.invoices.length) { c.appendChild(el("div", { class: "empty-state" }, "Žádné faktury.")); app.appendChild(c); return; }
  const t = el("table", { class: "table" });
  t.appendChild(el("thead", {}, el("tr", {}, el("th", {}, "Číslo"), el("th", {}, "Částka"), el("th", {}, "Stav"), el("th", {}))));
  state.invoices.forEach(inv => {
    t.appendChild(el("tbody", {}, el("tr", {},
      el("td", {}, inv.number), el("td", {}, fmtCZK(inv.total)),
      el("td", {}, el("span", { class: "badge info" }, invoiceEffectiveStatus(inv))),
      el("td", { class: "actions" }, el("button", { class: "btn btn-sm btn-danger", onclick: () => { if (confirm("Smazat?")) { state.invoices = state.invoices.filter(x=>x.id!==inv.id); saveState(); navigate("invoices"); } } }, "✕"))
    )));
  });
  c.appendChild(t); app.appendChild(c);
};
function openInvoiceForm() {
  const form = el("form", {});
  form.append(el("div", { class: "form-row" }, el("div", { class: "field" }, el("label", {}, "Částka"), el("input", { type: "number", name: "total", required: true })), el("div", { class: "field" }, el("label", {}, "Datum"), el("input", { type: "date", name: "date", value: todayISO() }))));
  form.onsubmit = e => { e.preventDefault(); const d = Object.fromEntries(new FormData(form).entries()); state.invoices.push({ id: uid("inv"), number: "SL" + Date.now().toString().slice(-4), total: Number(d.total), status: "issued", date: d.date }); saveState(); closeModal(); toast("Uloženo."); navigate("invoices"); };
  openModal({ title: "Nová faktura", body: form, footer: [el("button", { class: "btn btn-primary", onclick: () => form.requestSubmit() }, "Vystavit")] });
}

ROUTES.packages = (app) => { app.appendChild(el("div", { class: "card" }, el("h3", {}, "Balíčky"), el("p", { style: "color:var(--text-dim)" }, "Správa balíčků (zjednodušeno)."))); };
ROUTES.pricing = (app) => { app.appendChild(el("div", { class: "card" }, el("h3", {}, "Ceník"), el("p", { style: "color:var(--text-dim)" }, "Nastavení cen (zjednodušeno)."))); };
ROUTES.settings = (app) => {
  const form = el("form", {});
  form.append(el("div", { class: "card" }, el("h3", {}, "Nastavení"), el("div", { class: "form-row" }, el("div", { class: "field" }, el("label", {}, "Název firmy"), el("input", { name: "companyName", value: state.settings.companyName })), el("div", { class: "field" }, el("label", {}, "Hlavní e-mail"), el("input", { name: "emailMain", value: state.settings.emailMain })))));
  form.onsubmit = e => { e.preventDefault(); const d = Object.fromEntries(new FormData(form).entries()); state.settings = { ...state.settings, ...d }; saveState(); toast("Uloženo."); };
  form.appendChild(el("button", { class: "btn btn-primary", style: "margin-top:14px", onclick: () => form.requestSubmit() }, "Uložit"));
  app.appendChild(form);
};

/* ============================================================
   6. PORTÁL PRO ŽÁKA (Běží na GitHubu)
   ============================================================ */
function renderPortal(app) {
  const token = location.hash.split("/portal/")[1]?.split("?")[0];
  if (!token) { app.innerHTML = "<div class='empty-state'><div class='icon'>🔒</div>Přístup zamítnut.</div>"; return; }
  const s = state.students.find(x => x.publicToken === token);
  if (!s) { app.innerHTML = "<div class='empty-state'><div class='icon'>🔒</div>Neplatný odkaz.</div>"; return; }

  app.appendChild(el("div", { class: "card", style: "text-align:center" }, el("h1", { style: "font-size:28px; color:var(--brand)" }, s.firstName + " " + s.lastName), el("p", { style: "color:var(--text-dim)" }, "Úroveň: " + s.level)));

  const badges = getEarnedBadges(s);
  const bg = el("div", { class: "card" }, el("h3", {}, "🏆 Moje odznaky"));
  const grid = el("div", { class: "badges-grid" });
  BADGE_DEFS.forEach(b => grid.appendChild(el("div", { class: `badge-card ${badges.includes(b) ? 'earned' : ''}` }, el("div", { class: "b-icon" }, b.icon), el("div", { class: "b-title" }, b.title))));
  bg.appendChild(grid); app.appendChild(bg);

  // Nástroje
  const toolCard = el("div", { class: "card" }, el("h3", {}, "🎛 Nástroje"));
  const tabs = el("div", { class: "tool-tabs" });
  const cont = el("div", {});
  toolCard.append(tabs, cont); app.appendChild(toolCard);

  const tools = [
    { n: "🤖 AI Pomocník", f: () => {
        cont.innerHTML = "";
        const chat = el("div", { class: "chat-window" }, el("div", { class: "chat-msg bot" }, `Ahoj ${s.firstName}! Zeptej se mě na cokoli o kytaře.`));
        const inp = el("input", { style: "flex:1; padding:10px; background:var(--bg-3); border:1px solid var(--border); border-radius:8px", placeholder: "Napiš dotaz..." });
        const send = () => {
          const q = inp.value.trim(); if(!q) return;
          chat.appendChild(el("div", { class: "chat-msg user" }, q)); inp.value=""; chat.scrollTop = chat.scrollHeight;
          setTimeout(() => {
            const a = askAI(q);
            if(a) chat.appendChild(el("div", { class: "chat-msg bot" }, a));
            else { chat.appendChild(el("div", { class: "chat-msg bot" }, "Děkujeme! Předali jsme lektorovi.")); escalateQ(s.id, q); }
            chat.scrollTop = chat.scrollHeight;
          }, 400);
        };
        inp.onkeydown = e => { if(e.key === "Enter") send(); };
        cont.append(chat, el("div", { class: "chat-input-row" }, inp, el("button", { class: "btn btn-primary", onclick: send }, "Odeslat")));
    }},
    { n: "🥁 Metronom", f: () => {
        cont.innerHTML = "";
        let bpm = 80, running = false, int = null, beat = 0;
        const ui = el("div", { class: "metronome-ui" },
          el("div", { class: "tempo-display" }, String(bpm)),
          el("div", { style: "font-size:12px; color:var(--text-dim); margin-bottom:20px" }, "BPM"),
          el("div", { class: "beat-indicator" }, ...[0,1,2,3].map(() => el("div", { class: "beat-dot" }))),
          el("button", { class: "btn btn-primary", style: "margin-top:20px", onclick: (e) => {
            running = !running;
            if(running) { e.target.textContent = "⏸ Stop"; int = setInterval(() => { const dots = $$(".beat-dot", ui); dots.forEach((d,i)=>d.classList.toggle("active", i===beat)); beat=(beat+1)%4; }, 60000/bpm); }
            else { e.target.textContent = "▶ Start"; clearInterval(int); $$(".beat-dot", ui).forEach(d=>d.classList.remove("active")); }
          }}, "▶ Start")
        );
        cont.appendChild(ui);
    }}
  ];

  tools.forEach((t, i) => {
    const b = el("button", { class: i===0 ? "active" : "", onclick: () => { $$("button", tabs).forEach(x=>x.classList.remove("active")); b.classList.add("active"); t.f(); } }, t.n);
    tabs.appendChild(b);
  });
  tools[0].f();
}

/* ============================================================
   7. START A ROUTOVÁNÍ
   ============================================================ */
window.addEventListener("hashchange", () => {
  if (location.hash.startsWith("#/portal/")) {
    $("#pageTitle").textContent = "Portál studenta";
    $("#nav").style.display = "none"; 
    const app = $("#app"); app.innerHTML = "";
    renderPortal(app);
  } else {
    $("#nav").style.display = "block"; 
    navigate(location.hash.replace(/^#\//, "") || "dashboard");
  }
});

window.addEventListener("DOMContentLoaded", () => {
  applyTheme(state.theme || "dark");
  if (location.hash.startsWith("#/portal/")) {
    $("#pageTitle").textContent = "Portál studenta";
    $("#nav").style.display = "none";
    const app = $("#app"); app.innerHTML = "";
    renderPortal(app);
  } else {
    $("#nav").style.display = "block";
    navigate(location.hash.replace(/^#\//, "") || "dashboard");
  }

  $("#menuToggle").onclick = () => $("#sidebar").classList.toggle("open");
  $("#modalClose").onclick = closeModal;
  $("#modalBackdrop").onclick = e => { if (e.target.id === "modalBackdrop") closeModal(); };
  $("#btnQuickAdd").onclick = () => openStudentForm();
  $("#btnTheme").onclick = () => applyTheme(state.theme === "dark" ? "light" : "dark");
  $("#btnExport").onclick = () => {
    const b = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = el("a", { href: URL.createObjectURL(b), download: "sashalab.json" });
    a.click(); toast("Export hotov.");
  };
});
