"use strict";

/* ============================================================
   1. POMOCNÉ FUNKCE
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

const uid = (p="id") => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`;
const todayISO = () => new Date().toISOString().slice(0,10);
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("cs-CZ") : "—";
const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString("cs-CZ") : "—";
const fmtCZK = (n) => new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK" }).format(Number(n) || 0);

const calcAge = (d) => {
  if (!d) return null;
  const t = new Date(), b = new Date(d);
  let age = t.getFullYear() - b.getFullYear();
  const m = t.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) age--;
  return age;
};

/* ============================================================
   2. ÚLOŽIŠTĚ
   ============================================================ */
const STORE_KEY = "sashalab_erp_v3";
const defaultState = () => ({
  theme: "dark",
  settings: { 
    companyName: "O&S CreativeWorks — SashaLab", address: "Jungmannova 871/16, Kuřim", 
    lectorName: "Oleksandr Kukushkin", emailMain: "os.cre8ive@gmail.com", emailCopy: "sasha2010.03.06@gmail.com",
    invoicePrefix: "SL", invoiceCounter: 1
  },
  students: [], lessons: [], homeworks: [], invoices: [], questions: [], packages: [],
  pricing: [{ id: "p1", name: "Individuální lekce 60 min", price: 450 }],
  recurringTemplates: [], packageDefs: [{ id: "pk1", name: "Balíček 10 lekcí", lessons: 10, price: 4000, validityDays: 180 }]
});

let state = JSON.parse(localStorage.getItem(STORE_KEY) || "null") || defaultState();
const save = () => localStorage.setItem(STORE_KEY, JSON.stringify(state));

function toast(msg, type="ok") {
  const wrap = $("#toastWrap");
  if (!wrap) return;
  const t = el("div", { class: `toast ${type}` }, msg);
  wrap.appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; setTimeout(() => t.remove(), 300); }, 3000);
}

function openModal({title, body, footer, size=""}) {
  $("#modalTitle").textContent = title || "";
  const bodyEl = $("#modalBody");
  bodyEl.innerHTML = "";
  if (typeof body === "string") bodyEl.innerHTML = body; else bodyEl.appendChild(body);
  const footEl = $("#modalFooter");
  footEl.innerHTML = "";
  footer.forEach(f => footEl.appendChild(f));
  $("#modal").className = `modal ${size}`.trim();
  $("#modalBackdrop").classList.add("open");
}
function closeModal() { $("#modalBackdrop").classList.remove("open"); }

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const btn = $("#btnTheme");
  if (btn) btn.textContent = theme === "dark" ? "🌙" : "☀️";
  state.theme = theme;
  save();
}

/* ============================================================
   3. MODULY (ROUTING)
   ============================================================ */
const ROUTES = {};
function navigate(route) {
  if (!route) route = "dashboard";
  $$("#nav a").forEach(a => a.classList.toggle("active", a.getAttribute("href") === "#/" + route));
  
  const titles = { 
    dashboard:"Dashboard", students:"Studenti", lessons:"Docházka", homework:"Úkoly", 
    certificates:"Certifikáty", invoices:"Fakturace", packages:"Balíčky", pricing:"Ceník", settings:"Nastavení" 
  };
  $("#pageTitle").textContent = titles[route] || "Dashboard";
  
  const app = $("#app");
  app.innerHTML = "";
  if (ROUTES[route]) {
    ROUTES[route](app);
  } else {
    app.innerHTML = "<div class='empty-state'>Modul se připravuje...</div>";
  }
  $("#sidebar")?.classList.remove("open");
}

ROUTES.dashboard = (app) => {
  const grid = el("div", { class: "grid grid-4" });
  [["Studenti", state.students.length], ["Lekce", state.lessons.length], ["Úkoly", state.homeworks.length], ["Faktury", state.invoices.length]].forEach(([l,v]) => {
    grid.appendChild(el("div", { class: "stat" }, el("span", { class: "label" }, l), el("span", { class: "value brand" }, String(v))));
  });
  app.appendChild(grid);
};

ROUTES.students = (app) => {
  app.appendChild(el("div", { style: "margin-bottom:16px" }, el("button", { class: "btn btn-primary", onclick: () => openStudentForm() }, "+ Přidat studenta")));
  const c = el("div", { class: "card" });
  if (!state.students.length) { c.appendChild(el("div", { class: "empty-state" }, "Žádní studenti.")); app.appendChild(c); return; }
  
  const t = el("table", { class: "table" });
  t.appendChild(el("thead", {}, el("tr", {}, el("th", {}, "Jméno"), el("th", {}, "Věk"), el("th", {}, "Akce"))));
  state.students.forEach(s => {
    t.appendChild(el("tbody", {}, el("tr", {},
      el("td", {}, el("strong", {}, s.firstName + " " + s.lastName)),
      el("td", {}, calcAge(s.birthDate) !== null ? calcAge(s.birthDate) + " let" : "—"),
      el("td", { class: "actions" },
        el("button", { class: "btn btn-sm", onclick: () => openStudentDetail(s.id) }, "Detail"), " ",
        el("button", { class: "btn btn-sm btn-danger", onclick: () => { if (confirm("Smazat?")) { state.students = state.students.filter(x => x.id !== s.id); save(); navigate("students"); } } }, "Smazat")
      )
    )));
  });
  c.appendChild(t); app.appendChild(c);
};

ROUTES.lessons = (app) => {
  app.appendChild(el("div", { class: "card" }, el("h3", {}, "Docházka"), el("p", { style: "color:var(--text-dim)" }, "Zápis lekcí - připravujeme.")));
};

ROUTES.homework = (app) => {
  app.appendChild(el("div", { class: "card" }, el("h3", {}, "Domácí úkoly"), el("p", { style: "color:var(--text-dim)" }, "Zadávání úkolů - připravujeme.")));
};

ROUTES.certificates = (app) => {
  app.appendChild(el("div", { class: "card" }, el("h3", {}, "Certifikáty"), el("p", { style: "color:var(--text-dim)" }, "Generování certifikátů - připravujeme.")));
};

ROUTES.invoices = (app) => {
  app.appendChild(el("div", { class: "card" }, el("h3", {}, "Fakturace"), el("p", { style: "color:var(--text-dim)" }, "Faktury - připravujeme.")));
};

ROUTES.packages = (app) => {
  app.appendChild(el("div", { class: "card" }, el("h3", {}, "Balíčky"), el("p", { style: "color:var(--text-dim)" }, "Balíčky - připravujeme.")));
};

ROUTES.pricing = (app) => {
  app.appendChild(el("div", { class: "card" }, el("h3", {}, "Ceník"), el("p", { style: "color:var(--text-dim)" }, "Ceník - připravujeme.")));
};

ROUTES.settings = (app) => {
  app.appendChild(el("div", { class: "card" }, el("h3", {}, "Nastavení"), el("p", { style: "color:var(--text-dim)" }, "Nastavení - připravujeme.")));
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
    save(); closeModal(); toast("Uloženo."); navigate("students");
  };
  openModal({ title: edit ? "Upravit studenta" : "Nový student", body: form, footer: [el("button", { class: "btn btn-primary", onclick: () => form.requestSubmit() }, "Uložit")] });
}

function openStudentDetail(id) {
  const s = state.students.find(x => x.id === id);
  if (!s) return;
  const body = el("div", {}, el("div", { class: "card" }, el("h3", {}, "Detail studenta"), el("p", {}, s.firstName + " " + s.lastName)));
  openModal({ title: "Profil", body, footer: [el("button", { class: "btn", onclick: closeModal }, "Zavřít")] });
}

/* ============================================================
   4. START
   ============================================================ */
window.addEventListener("hashchange", () => {
  const route = location.hash.replace(/^#\//, "") || "dashboard";
  navigate(route);
});

window.addEventListener("DOMContentLoaded", () => {
  applyTheme(state.theme || "dark");
  const route = location.hash.replace(/^#\//, "") || "dashboard";
  navigate(route);

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
