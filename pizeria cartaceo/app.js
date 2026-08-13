// ====================================================================
// ORDINI PIZZERIA — app.js
// ====================================================================

let db = null;
let firebaseOk = false;

try {
  firebase.initializeApp(FIREBASE_CONFIG);
  db = firebase.firestore();
  firebaseOk = true;
} catch (e) {
  console.error("Errore inizializzazione Firebase:", e);
}

// ---------- STATO LOCALE (specchio di Firestore, aggiornato in tempo reale) ----------
const state = {
  categories: [],   // {id, name}
  ingredients: [],  // {id, name, price}
  varianti: [],     // {id, name, price} — modifiche al piatto con costo proprio (es. impasto doppio)
  dishes: [],       // {id, name, categoryId, price, componibile, removableIds:[], extraIds:[], glutenFree, lactoseFree}
  orders: [],       // {id, table, tableLabel, items:[], createdAt, status, archived}
  tableNotes: {},   // { [tableKey]: text }
  asportoPreferiti: [], // [{id, name}] nomi asporto usati in passato, per suggerimenti
  settings: {
    sale: [
      { id: "sala1", name: "Sala 1", numTables: 12 },
      { id: "sala2", name: "Sala 2", numTables: 8 },
      { id: "sala3", name: "Sala 3", numTables: 8 },
      { id: "sala4", name: "Sala 4", numTables: 8 },
      { id: "sala5", name: "Sala 5", numTables: 8 },
    ],
    pin: "1234",
  },
};

let currentTable = null;      // chiave univoca, es. "sala1#4" oppure "asporto#abc123"
let currentTableLabel = "";   // etichetta da mostrare, es. "Sala 1 · Tavolo 4" oppure "Asporto: Mario"
let currentSalaId = null;     // sala attualmente aperta (schermata tavoli)
let currentReadyBy = null;    // orario di ritiro asporto (stringa "HH:MM"), null per i tavoli normali
let cart = [];
let modalDish = null;
let modalQty = 1;
let soundOn = localStorage.getItem("ordini_sound") !== "off";
let knownOrderIds = new Set();
let firstOrdersLoad = true;
let acknowledgedOverdueIds = new Set(); // ordini in ritardo per cui è stato premuto STOP sull'allarme

// ---------- UTIL ----------
function euro(n) {
  return "€" + (Math.round(n * 100) / 100).toFixed(2).replace(".", ",");
}
function qtyLabel(item) {
  return (item.unit && item.unit !== "pezzo") ? (item.qty + " " + item.unit + " di") : (item.qty + "×");
}
function buildMods(item) {
  if (item.famiglia && item.famiglia.length) {
    return item.famiglia.map((g, i) => {
      let sub = [];
      if (g.removed && g.removed.length) sub.push("senza " + g.removed.join(", "));
      if (g.added && g.added.length) sub.push("+ " + g.added.map(a => a.name).join(", "));
      if (g.varianti && g.varianti.length) sub.push(g.varianti.map(v => v.name).join(", "));
      return `Gusto ${i + 1}: ${g.name}` + (sub.length ? ` (${sub.join(" · ")})` : "");
    });
  }
  const mods = [];
  if (item.removed && item.removed.length) mods.push("Senza " + item.removed.join(", "));
  if (item.added && item.added.length) mods.push("+ " + item.added.map(a => a.name).join(", "));
  if (item.varianti && item.varianti.length) mods.push(item.varianti.map(v => v.name).join(", "));
  return mods;
}
function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
function $(sel, root = document) { return root.querySelector(sel); }
function $all(sel, root = document) { return [...root.querySelectorAll(sel)]; }

function showView(id) {
  $all(".view").forEach(v => v.classList.remove("active"));
  $("#" + id).classList.add("active");
}
function openModal(id) { $("#" + id).classList.remove("hidden"); }
function closeModal(id) { $("#" + id).classList.add("hidden"); }

// ---------- MEMORIA DI NAVIGAZIONE ----------
// iOS a volte ricarica la pagina quando si passa a un'altra app (es. Labelife)
// e si torna indietro: qui salviamo "dove eravamo" per ripristinarlo subito,
// invece di ritrovarsi sulla home. Non sostituisce Firestore: gli ordini
// restano comunque salvati lì, questa è solo la posizione nella app.
function salvaStatoNav(screen) {
  try {
    localStorage.setItem("ordini_nav_state", JSON.stringify({
      screen, salaId: currentSalaId, table: currentTable,
      tableLabel: currentTableLabel, readyBy: currentReadyBy
    }));
  } catch (e) { /* ignora se localStorage non disponibile */ }
}
function ripristinaStatoNav() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem("ordini_nav_state") || "null"); } catch (e) { saved = null; }
  if (!saved) return;
  if (saved.screen === "cucina") { renderCucina(); showView("view-cucina"); return; }
  if (saved.screen === "bar") { renderBar(); showView("view-bar"); return; }
  if (saved.screen === "stampa") { renderStampaQueue(); showView("view-stampa"); return; }
  if (saved.screen === "asporto-list") {
    $("#cameriere-sale-list").classList.add("hidden");
    $("#cameriere-tables").classList.add("hidden");
    $("#cameriere-asporto").classList.remove("hidden");
    renderAsportoList();
    showView("view-cameriere");
    return;
  }
  if (saved.screen === "sala-tables" && saved.salaId) {
    openSala(saved.salaId);
    showView("view-cameriere");
    return;
  }
  if ((saved.screen === "tavolo" || saved.screen === "conto") && saved.table) {
    selectTable(saved.table, saved.tableLabel, saved.readyBy || null);
    showView("view-cameriere");
    if (saved.screen === "conto") openConto();
    return;
  }
  if (saved.screen === "sala-list") {
    currentSalaId = null; currentTable = null; currentTableLabel = ""; currentReadyBy = null;
    $("#cameriere-sale-list").classList.remove("hidden");
    $("#cameriere-tables").classList.add("hidden");
    $("#cameriere-asporto").classList.add("hidden");
    $("#cameriere-tavolo").classList.add("hidden");
    $("#cameriere-conto").classList.add("hidden");
    renderSaleList();
    renderAsportoList();
    showView("view-cameriere");
    return;
  }
  // per "home" o stati non riconosciuti: resta sulla home, va bene così
}

$all("[data-close-modal]").forEach(btn => {
  btn.addEventListener("click", () => btn.closest(".modal").classList.add("hidden"));
});
$all("[data-back]").forEach(btn => {
  btn.addEventListener("click", () => showView("view-home"));
});

// ====================================================================
// CONNESSIONE FIRESTORE — LISTENER IN TEMPO REALE
// ====================================================================
function initListeners() {
  if (!firebaseOk) {
    $("#conn-status").textContent = "Firebase non configurato — modifica firebase-config.js";
    $("#conn-status").classList.add("err");
    return;
  }

  db.collection("settings").doc("general").onSnapshot(doc => {
    if (doc.exists) {
      const data = doc.data();
      state.settings = Object.assign({}, state.settings, data);
      if (!Array.isArray(state.settings.sale) || state.settings.sale.length === 0) {
        state.settings.sale = [
          { id: "sala1", name: "Sala 1", numTables: 12 },
          { id: "sala2", name: "Sala 2", numTables: 8 },
          { id: "sala3", name: "Sala 3", numTables: 8 },
          { id: "sala4", name: "Sala 4", numTables: 8 },
          { id: "sala5", name: "Sala 5", numTables: 8 },
        ];
      }
    } else {
      db.collection("settings").doc("general").set(state.settings);
    }
    renderSaleList();
    renderSaleAdmin();
    if (currentSalaId) renderTablesGrid();
  });

  db.collection("categories").orderBy("name").onSnapshot(snap => {
    state.categories = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderCategorieAdmin();
    renderPiattiAdmin();
    populateCategoriaSelect();
    if (currentTable) renderMenu();
  }, err => console.error(err));

  db.collection("ingredients").orderBy("name").onSnapshot(snap => {
    state.ingredients = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderIngredientiAdmin();
    if (currentTable) renderMenu();
  }, err => console.error(err));

  db.collection("varianti").orderBy("name").onSnapshot(snap => {
    state.varianti = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderVariantiAdmin();
  }, err => console.error(err));

  db.collection("dishes").orderBy("name").onSnapshot(snap => {
    state.dishes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderPiattiAdmin();
    if (currentTable) renderMenu();
  }, err => console.error(err));

  db.collection("tableNotes").onSnapshot(snap => {
    state.tableNotes = {};
    snap.docs.forEach(d => { state.tableNotes[d.id] = d.data().text || ""; });
    if (currentSalaId) renderTablesGrid();
    renderCucina();
    renderBar();
  });

  db.collection("asportoPreferiti").onSnapshot(snap => {
    state.asportoPreferiti = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  });

  db.collection("orders").orderBy("createdAt", "asc").onSnapshot(snap => {
    state.orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const activeIds = new Set(state.orders.filter(o => !o.archived).map(o => o.id));

    if (!firstOrdersLoad) {
      const nuovi = [...activeIds].filter(id => !knownOrderIds.has(id));
      if (nuovi.length > 0) playBeep();
    }
    firstOrdersLoad = false;
    knownOrderIds = activeIds;

    if (currentSalaId) renderTablesGrid();
    renderAsportoList();
    renderCucina();
    renderBar();
    renderStampaQueue();
    aggiornaBadgeStampa();
    if (currentTable) renderContoIfOpen();
    if ($("#tab-archivio").classList.contains("active")) renderArchivioAdmin();
  }, err => console.error(err));

  $("#conn-status").textContent = "Connesso ✓";
  $("#conn-status").classList.add("ok");
}

// ====================================================================
// SUONO NOTIFICA CUCINA
// ====================================================================
function playBeep() {
  if (!soundOn) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1046].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.32);
    });
  } catch (e) { /* ignora se audio bloccato */ }
}

// Allarme tipo sveglia per gli ordini asporto in ritardo: molto più forte
// e insistente del beep normale, pensato per essere sentito anche col
// locale pieno e rumoroso.
function playAlarmTone() {
  if (!soundOn) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    const toni = [1100, 750, 1100, 750, 1100, 750];
    toni.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      const t0 = now + i * 0.16;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.6, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.16);
    });
  } catch (e) { /* ignora se audio bloccato */ }
}

function toggleSound() {
  soundOn = !soundOn;
  localStorage.setItem("ordini_sound", soundOn ? "on" : "off");
  const icon = soundOn ? "🔊" : "🔇";
  $("#btn-sound-toggle-cucina").textContent = icon;
  $("#btn-sound-toggle-bar").textContent = icon;
}
$("#btn-sound-toggle-cucina").addEventListener("click", toggleSound);
$("#btn-sound-toggle-bar").addEventListener("click", toggleSound);

// ====================================================================
// HOME — SCELTA RUOLO
// ====================================================================
$all(".role-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const role = btn.dataset.role;
    if (role === "cameriere") {
      currentTable = null;
      currentSalaId = null;
      $("#cameriere-sale-list").classList.remove("hidden");
      $("#cameriere-tables").classList.add("hidden");
      $("#cameriere-asporto").classList.add("hidden");
      $("#cameriere-tavolo").classList.add("hidden");
      $("#cameriere-conto").classList.add("hidden");
      renderSaleList();
      renderAsportoList();
      showView("view-cameriere");
      salvaStatoNav("sala-list");
    } else if (role === "cucina") {
      renderCucina();
      showView("view-cucina");
      salvaStatoNav("cucina");
    } else if (role === "bar") {
      renderBar();
      showView("view-bar");
      salvaStatoNav("bar");
    } else if (role === "stampa") {
      renderStampaQueue();
      showView("view-stampa");
      salvaStatoNav("stampa");
    } else if (role === "impostazioni") {
      $("#pin-input").value = "";
      $("#pin-errore").classList.add("hidden");
      openModal("modal-pin");
    }
  });
});

$("#btn-conferma-pin").addEventListener("click", () => {
  if ($("#pin-input").value === String(state.settings.pin || "1234")) {
    closeModal("modal-pin");
    showView("view-impostazioni");
  } else {
    $("#pin-errore").classList.remove("hidden");
  }
});

// ====================================================================
// SALA — LISTA SALE + ASPORTO
// ====================================================================
function renderSaleList() {
  const wrap = $("#sale-list");
  if (!wrap) return;
  wrap.innerHTML = "";
  (state.settings.sale || []).forEach(sala => {
    const nOrdiniAttivi = new Set(
      state.orders.filter(o => !o.archived && String(o.table || "").startsWith(sala.id + "#")).map(o => o.table)
    ).size;
    const div = document.createElement("button");
    div.className = "sale-tile";
    div.innerHTML = `<span>${sala.name}<div class="sale-sub">${sala.numTables} tavoli${nOrdiniAttivi ? " · " + nOrdiniAttivi + " occupati" : ""}</div></span><span>›</span>`;
    div.addEventListener("click", () => openSala(sala.id));
    wrap.appendChild(div);
  });
}

function openSala(salaId) {
  currentSalaId = salaId;
  const sala = (state.settings.sale || []).find(s => s.id === salaId);
  $("#sala-corrente-nome").textContent = sala ? sala.name : "";
  $("#cameriere-sale-list").classList.add("hidden");
  $("#cameriere-asporto").classList.add("hidden");
  $("#cameriere-tables").classList.remove("hidden");
  renderTablesGrid();
  salvaStatoNav("sala-tables");
}

$all("#btn-back-sale, #btn-back-sale-2").forEach(btn => {
  btn.addEventListener("click", () => {
    currentSalaId = null;
    $("#cameriere-tables").classList.add("hidden");
    $("#cameriere-asporto").classList.add("hidden");
    $("#cameriere-sale-list").classList.remove("hidden");
    renderSaleList();
    salvaStatoNav("sala-list");
  });
});

$("#btn-vai-asporto").addEventListener("click", () => {
  currentSalaId = null;
  $("#cameriere-sale-list").classList.add("hidden");
  $("#cameriere-tables").classList.add("hidden");
  $("#cameriere-asporto").classList.remove("hidden");
  renderAsportoList();
  salvaStatoNav("asporto-list");
});

// ====================================================================
// SALA — GRIGLIA TAVOLI DI UNA SALA
// ====================================================================
function renderTablesGrid() {
  const grid = $("#tables-grid");
  if (!grid || !currentSalaId) return;
  grid.innerHTML = "";
  const sala = (state.settings.sale || []).find(s => s.id === currentSalaId);
  const n = sala ? (sala.numTables || 1) : 1;
  for (let i = 1; i <= n; i++) {
    const key = currentSalaId + "#" + i;
    const hasOrder = state.orders.some(o => o.table === key && !o.archived);
    const div = document.createElement("button");
    div.className = "table-tile" + (hasOrder ? " has-order" : "");
    div.innerHTML = i + (hasOrder ? '<span class="dot"></span>' : "");
    div.addEventListener("click", () => selectTable(key, sala.name + " · Tavolo " + i));
    grid.appendChild(div);
  }
}

// ====================================================================
// SALA — ASPORTO
// ====================================================================
function ordineEReparto(o) {
  // true se l'ordine è "pronto" su tutti i reparti che lo riguardano
  const okCucina = o.statusCucina ? o.statusCucina === "pronto" : true;
  const okBar = o.statusBar ? o.statusBar === "pronto" : true;
  return okCucina && okBar;
}
function isOrdineInRitardo(o) {
  if (!o.readyBy) return false;
  if (ordineEReparto(o)) return false;
  return new Date(o.readyBy).getTime() < Date.now();
}

function renderAsportoList() {
  const wrap = $("#asporto-list");
  if (!wrap) return;
  wrap.innerHTML = "";
  const tavoliAsporto = new Map(); // key -> {label, readyBy, inRitardo}
  state.orders.filter(o => !o.archived && String(o.table || "").startsWith("asporto#")).forEach(o => {
    const prev = tavoliAsporto.get(o.table);
    const inRitardo = isOrdineInRitardo(o);
    tavoliAsporto.set(o.table, {
      label: o.tableLabel || o.table,
      readyBy: o.readyBy || (prev && prev.readyBy),
      inRitardo: inRitardo || (prev && prev.inRitardo)
    });
  });
  if (tavoliAsporto.size === 0) {
    wrap.innerHTML = '<p class="hint-text">Nessuna ordinazione asporto aperta al momento.</p>';
    return;
  }
  [...tavoliAsporto.entries()].forEach(([key, info]) => {
    const div = document.createElement("div");
    div.className = "asporto-tile" + (info.inRitardo ? " in-ritardo" : "");
    const oraLabel = info.readyBy ? new Date(info.readyBy).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "";
    div.innerHTML = `<span>${info.label}${oraLabel ? ` · ⏰ ${oraLabel}` : ""}${info.inRitardo ? " · IN RITARDO" : ""}</span><span class="dot"></span>`;
    div.addEventListener("click", () => selectTable(key, info.label, info.readyBy || null));
    wrap.appendChild(div);
  });
}

function timeStringToISO(hhmm) {
  const now = new Date();
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  if (d.getTime() < now.getTime() - 2 * 60 * 60 * 1000) d.setDate(d.getDate() + 1);
  return d.toISOString();
}
function nowAsHHMM() {
  const d = new Date();
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

$("#btn-nuovo-asporto").addEventListener("click", () => {
  $("#asporto-nome-input").value = "";
  $("#asporto-ora-input").value = nowAsHHMM();
  $("#asporto-suggerimenti").classList.add("hidden");
  openModal("modal-asporto");
});

$("#asporto-nome-input").addEventListener("input", e => {
  const q = e.target.value.trim().toLowerCase();
  const wrap = $("#asporto-suggerimenti");
  if (!q) { wrap.classList.add("hidden"); wrap.innerHTML = ""; return; }
  const match = state.asportoPreferiti.filter(p => p.name.toLowerCase().includes(q)).slice(0, 5);
  if (match.length === 0) { wrap.classList.add("hidden"); wrap.innerHTML = ""; return; }
  wrap.innerHTML = "";
  match.forEach(p => {
    const item = document.createElement("button");
    item.className = "suggerimento-item";
    item.textContent = p.name;
    item.addEventListener("click", () => {
      $("#asporto-nome-input").value = p.name;
      wrap.classList.add("hidden");
      wrap.innerHTML = "";
    });
    wrap.appendChild(item);
  });
  wrap.classList.remove("hidden");
});

$("#btn-crea-asporto").addEventListener("click", () => {
  const nome = $("#asporto-nome-input").value.trim();
  const ora = $("#asporto-ora-input").value;
  if (!nome) return;
  const giaSalvato = state.asportoPreferiti.some(p => p.name.toLowerCase() === nome.toLowerCase());
  if (!giaSalvato) {
    db.collection("asportoPreferiti").doc(slugFile(nome)).set({ name: nome });
  }
  const readyBy = ora ? timeStringToISO(ora) : null;
  const key = "asporto#" + uid();
  closeModal("modal-asporto");
  selectTable(key, "Asporto: " + nome, readyBy);
});

function selectTable(key, label, readyBy) {
  currentTable = key;
  currentTableLabel = label;
  currentReadyBy = readyBy || null;
  cart = [];
  menuSearchQuery = "";
  $("#menu-search-input").value = "";
  $("#tavolo-label").textContent = label;
  $("#cameriere-sale-list").classList.add("hidden");
  $("#cameriere-tables").classList.add("hidden");
  $("#cameriere-asporto").classList.add("hidden");
  $("#cameriere-conto").classList.add("hidden");
  $("#cameriere-tavolo").classList.remove("hidden");
  updateCarrelloBar();
  renderMenu();
  salvaStatoNav("tavolo");
}

// ====================================================================
// SALA — MENU
// ====================================================================
let menuSearchQuery = "";
$("#menu-search-input").addEventListener("input", e => {
  menuSearchQuery = e.target.value.trim().toLowerCase();
  renderMenu();
});

function renderMenu() {
  const container = $("#menu-container");
  container.innerHTML = "";
  let trovatiTotali = 0;
  state.categories.forEach(cat => {
    const dishes = state.dishes.filter(d => d.categoryId === cat.id
      && (!menuSearchQuery || d.name.toLowerCase().includes(menuSearchQuery)));
    if (dishes.length === 0) return;
    trovatiTotali += dishes.length;
    const wrap = document.createElement("div");
    wrap.className = "menu-cat";
    wrap.innerHTML = `<h4>${cat.name}</h4>`;
    dishes.forEach(dish => {
      const row = document.createElement("div");
      row.className = "dish-row";
      row.innerHTML = `
        <div>
          <div class="dish-name">${dish.name}</div>
          <div class="dish-price">${euro(dish.price || 0)}</div>
        </div>
        <button class="dish-add-btn">+</button>`;
      row.querySelector(".dish-add-btn").addEventListener("click", () => {
        if (dish.isFamiglia) openFamigliaModal(dish); else openDishModal(dish);
      });
      wrap.appendChild(row);
    });
    container.appendChild(wrap);
  });
  if (state.categories.length === 0) {
    container.innerHTML = '<p class="hint-text">Nessun piatto configurato. Vai in Impostazioni → Piatti per aggiungerne.</p>';
  } else if (trovatiTotali === 0) {
    container.innerHTML = '<p class="hint-text">Nessun piatto trovato per "' + menuSearchQuery + '".</p>';
  }
}

// Crea un gruppo (titolo + barra di ricerca + lista) dove le righe si
// filtrano digitando, utile quando la lista di ingredienti/varianti è lunga.
// buildRowFn(item) deve restituire l'elemento riga già pronto (con i suoi
// event listener collegati) per un singolo elemento della lista.
function creaGruppoConRicerca(titolo, items, placeholder, buildRowFn) {
  const g = document.createElement("div");
  g.className = "opt-group";
  const searchId = "search-" + uid();
  g.innerHTML = `<h5>${titolo}</h5><input type="text" class="ingredienti-search" id="${searchId}" placeholder="${placeholder}">`;
  const listWrap = document.createElement("div");
  g.appendChild(listWrap);

  function renderRighe(query) {
    listWrap.innerHTML = "";
    const q = query.trim().toLowerCase();
    const filtrati = q ? items.filter(it => it.name.toLowerCase().includes(q)) : items;
    if (filtrati.length === 0) {
      listWrap.innerHTML = '<p class="hint-text">Nessun risultato.</p>';
      return;
    }
    filtrati.forEach(item => listWrap.appendChild(buildRowFn(item)));
  }
  renderRighe("");
  g.querySelector("#" + searchId).addEventListener("input", e => renderRighe(e.target.value));
  return g;
}

// ---------- MODALE PERSONALIZZAZIONE PIATTO ----------
let modalSelRemoved = new Set();
let modalSelExtra = new Set();
let modalSelVarianti = new Set();

function openDishModal(dish) {
  modalDish = dish;
  modalQty = 1;
  modalSelRemoved = new Set();
  modalSelExtra = new Set();
  modalSelVarianti = new Set();

  $("#modal-piatto-nome").textContent = dish.name;
  const body = $("#modal-piatto-body");
  body.innerHTML = "";

  if (dish.componibile) {
    const removable = state.ingredients.filter(i => (dish.removableIds || []).includes(i.id));
    const extra = state.ingredients.filter(i => (dish.extraIds || []).includes(i.id));
    const varianti = state.varianti.filter(v => (dish.variantIds || []).includes(v.id));

    if (removable.length > 0) {
      const g = document.createElement("div");
      g.className = "opt-group";
      g.innerHTML = "<h5>Togli ingrediente</h5>";
      removable.forEach(ing => {
        const row = document.createElement("div");
        row.className = "opt-row";
        row.innerHTML = `<input type="checkbox" id="rm-${ing.id}"><label for="rm-${ing.id}">Senza ${ing.name}</label>`;
        row.querySelector("input").addEventListener("change", e => {
          e.target.checked ? modalSelRemoved.add(ing.id) : modalSelRemoved.delete(ing.id);
        });
        g.appendChild(row);
      });
      body.appendChild(g);
    }

    if (extra.length > 0) {
      const g = creaGruppoConRicerca("Aggiungi extra", extra, "🔍 Cerca ingrediente...", ing => {
        const row = document.createElement("div");
        row.className = "opt-row";
        const checked = modalSelExtra.has(ing.id) ? "checked" : "";
        row.innerHTML = `<input type="checkbox" id="ex-${ing.id}" ${checked}><label for="ex-${ing.id}">${ing.name}</label><span class="opt-price">+${euro(ing.price || 0)}</span>`;
        row.querySelector("input").addEventListener("change", e => {
          e.target.checked ? modalSelExtra.add(ing.id) : modalSelExtra.delete(ing.id);
          updateModalPrice();
        });
        return row;
      });
      body.appendChild(g);
    }

    if (varianti.length > 0) {
      const g = document.createElement("div");
      g.className = "opt-group";
      g.innerHTML = "<h5>Varianti</h5>";
      varianti.forEach(v => {
        const row = document.createElement("div");
        row.className = "opt-row";
        row.innerHTML = `<input type="checkbox" id="var-${v.id}"><label for="var-${v.id}">${v.name}</label><span class="opt-price">+${euro(v.price || 0)}</span>`;
        row.querySelector("input").addEventListener("change", e => {
          e.target.checked ? modalSelVarianti.add(v.id) : modalSelVarianti.delete(v.id);
          updateModalPrice();
        });
        g.appendChild(row);
      });
      body.appendChild(g);
    }
  }

  const noteWrap = document.createElement("div");
  noteWrap.className = "opt-group";
  noteWrap.innerHTML = `<h5>Nota</h5><textarea id="modal-nota" rows="2" placeholder="Es. ben cotta, taglio in 4..."></textarea>`;
  body.appendChild(noteWrap);

  const isPeso = !!(dish.unit && dish.unit !== "pezzo");
  $("#qty-val").textContent = modalQty;
  $("#qty-unit-label").textContent = "";
  document.querySelector(".qty-control").classList.toggle("hidden", isPeso);
  $("#peso-control").classList.toggle("hidden", !isPeso);
  if (isPeso) {
    $("#peso-unita-label").textContent = dish.unit;
    $("#peso-input").value = "";
    modalQty = 0;
  } else {
    modalQty = 1;
  }
  updateModalPrice();
  openModal("modal-piatto");
}

function currentUnitPrice() {
  let p = modalDish.price || 0;
  modalSelExtra.forEach(id => {
    const ing = state.ingredients.find(i => i.id === id);
    if (ing) p += (ing.price || 0);
  });
  modalSelVarianti.forEach(id => {
    const v = state.varianti.find(v => v.id === id);
    if (v) p += (v.price || 0);
  });
  return p;
}
function updateModalPrice() {
  $("#modal-prezzo").textContent = euro(currentUnitPrice() * modalQty);
}

$("#qty-meno").addEventListener("click", () => { if (modalQty > 1) modalQty--; $("#qty-val").textContent = modalQty; updateModalPrice(); });
$("#qty-piu").addEventListener("click", () => { modalQty++; $("#qty-val").textContent = modalQty; updateModalPrice(); });
$("#peso-input").addEventListener("input", e => {
  modalQty = parseFloat(e.target.value) || 0;
  updateModalPrice();
});

$("#btn-aggiungi-carrello").addEventListener("click", () => {
  const isPeso = !!(modalDish.unit && modalDish.unit !== "pezzo");
  if (isPeso && (!modalQty || modalQty <= 0)) {
    alert("Inserisci il peso (" + modalDish.unit + ") prima di aggiungere il piatto.");
    return;
  }
  const removedNames = [...modalSelRemoved].map(id => state.ingredients.find(i => i.id === id)?.name).filter(Boolean);
  const addedList = [...modalSelExtra].map(id => {
    const ing = state.ingredients.find(i => i.id === id);
    return { name: ing.name, price: ing.price || 0 };
  });
  const variantiList = [...modalSelVarianti].map(id => {
    const v = state.varianti.find(v => v.id === id);
    return { name: v.name, price: v.price || 0 };
  });
  const note = $("#modal-nota") ? $("#modal-nota").value.trim() : "";
  const unitPrice = currentUnitPrice();
  const categoria = state.categories.find(c => c.id === modalDish.categoryId);
  const reparto = categoria ? (categoria.reparto || "cucina") : "cucina";

  cart.push({
    dishId: modalDish.id,
    name: modalDish.name,
    qty: modalQty,
    unit: modalDish.unit || "pezzo",
    unitPrice,
    lineTotal: unitPrice * modalQty,
    removed: removedNames,
    added: addedList,
    varianti: variantiList,
    note,
    reparto
  });

  closeModal("modal-piatto");
  updateCarrelloBar();
});

// ====================================================================
// PIZZA FAMIGLIA (1-3 gusti, prezzo calcolato)
// ====================================================================
let famDish = null;
let famNumGusti = 1;
let famSlots = []; // [{pizzaId, removed:Set, extra:Set, varianti:Set}, ...]

function pizzeDisponibiliPerFamiglia() {
  return state.dishes.filter(d => d.componibile && !d.isFamiglia);
}

function openFamigliaModal(dish) {
  famDish = dish;
  famNumGusti = 1;
  famSlots = [emptySlot(), emptySlot(), emptySlot()];
  $("#famiglia-titolo").textContent = dish.name;
  $("#fam-nota").value = "";
  $all(".fam-num-btn").forEach(b => b.classList.toggle("active", b.dataset.num === "1"));
  renderFamigliaSlots();
  openModal("modal-famiglia");
}
function emptySlot() { return { pizzaId: "", removed: new Set(), extra: new Set(), varianti: new Set() }; }

$all(".fam-num-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    famNumGusti = parseInt(btn.dataset.num, 10);
    $all(".fam-num-btn").forEach(b => b.classList.toggle("active", b === btn));
    renderFamigliaSlots();
  });
});

function slotUnitPrice(slot) {
  const pizza = state.dishes.find(d => d.id === slot.pizzaId);
  if (!pizza) return 0;
  let p = pizza.price || 0;
  slot.extra.forEach(id => { const ing = state.ingredients.find(i => i.id === id); if (ing) p += (ing.price || 0); });
  slot.varianti.forEach(id => { const v = state.varianti.find(v => v.id === id); if (v) p += (v.price || 0); });
  return p;
}

function calcolaPrezzoFamiglia(prezzi) {
  if (prezzi.length === 1) return prezzi[0] * 2.5;
  if (prezzi.length === 2) {
    const somma = prezzi[0] + prezzi[1];
    return somma + 0.25 * somma;
  }
  // 3 gusti: media dei tre gusti + 1/4 della media
  const media = (prezzi[0] + prezzi[1] + prezzi[2]) / 3;
  return media + 0.25 * media;
}

function renderFamigliaSlots() {
  const container = $("#fam-gusti-container");
  container.innerHTML = "";
  const pizze = pizzeDisponibiliPerFamiglia();

  for (let i = 0; i < famNumGusti; i++) {
    const slot = famSlots[i];
    const box = document.createElement("div");
    box.className = "fam-gusto-box";
    box.innerHTML = `<h5>Gusto ${i + 1}</h5>
      <select data-slot="${i}" class="fam-pizza-select">
        <option value="">— scegli pizza —</option>
        ${pizze.map(p => `<option value="${p.id}" ${slot.pizzaId === p.id ? "selected" : ""}>${p.name} (${euro(p.price || 0)})</option>`).join("")}
      </select>
      <div class="fam-slot-opzioni" data-slot-opzioni="${i}"></div>`;
    box.querySelector(".fam-pizza-select").addEventListener("change", e => {
      famSlots[i] = emptySlot();
      famSlots[i].pizzaId = e.target.value;
      renderFamigliaSlotOpzioni(i);
      aggiornaPrezzoFamiglia();
    });
    container.appendChild(box);
    renderFamigliaSlotOpzioniInto(box.querySelector(`[data-slot-opzioni="${i}"]`), i);
  }
  aggiornaPrezzoFamiglia();
}

function renderFamigliaSlotOpzioni(i) {
  const box = $(`[data-slot-opzioni="${i}"]`);
  if (box) renderFamigliaSlotOpzioniInto(box, i);
}

function renderFamigliaSlotOpzioniInto(box, i) {
  box.innerHTML = "";
  const slot = famSlots[i];
  const pizza = state.dishes.find(d => d.id === slot.pizzaId);
  if (!pizza) return;

  const removable = state.ingredients.filter(ing => (pizza.removableIds || []).includes(ing.id));
  const extra = state.ingredients.filter(ing => (pizza.extraIds || []).includes(ing.id));
  const varianti = state.varianti.filter(v => (pizza.variantIds || []).includes(v.id));

  if (removable.length > 0) {
    const g = document.createElement("div");
    g.className = "opt-group";
    g.innerHTML = "<h5>Togli ingrediente</h5>";
    removable.forEach(ing => {
      const row = document.createElement("div");
      row.className = "opt-row";
      row.innerHTML = `<input type="checkbox" id="fam-rm-${i}-${ing.id}"><label for="fam-rm-${i}-${ing.id}">Senza ${ing.name}</label>`;
      row.querySelector("input").addEventListener("change", e => {
        e.target.checked ? slot.removed.add(ing.id) : slot.removed.delete(ing.id);
      });
      g.appendChild(row);
    });
    box.appendChild(g);
  }
  if (extra.length > 0) {
    const g = creaGruppoConRicerca("Aggiungi extra", extra, "🔍 Cerca ingrediente...", ing => {
      const row = document.createElement("div");
      row.className = "opt-row";
      const checked = slot.extra.has(ing.id) ? "checked" : "";
      row.innerHTML = `<input type="checkbox" id="fam-ex-${i}-${ing.id}" ${checked}><label for="fam-ex-${i}-${ing.id}">${ing.name}</label><span class="opt-price">+${euro(ing.price || 0)}</span>`;
      row.querySelector("input").addEventListener("change", e => {
        e.target.checked ? slot.extra.add(ing.id) : slot.extra.delete(ing.id);
        aggiornaPrezzoFamiglia();
      });
      return row;
    });
    box.appendChild(g);
  }
  if (varianti.length > 0) {
    const g = document.createElement("div");
    g.className = "opt-group";
    g.innerHTML = "<h5>Varianti</h5>";
    varianti.forEach(v => {
      const row = document.createElement("div");
      row.className = "opt-row";
      row.innerHTML = `<input type="checkbox" id="fam-var-${i}-${v.id}"><label for="fam-var-${i}-${v.id}">${v.name}</label><span class="opt-price">+${euro(v.price || 0)}</span>`;
      row.querySelector("input").addEventListener("change", e => {
        e.target.checked ? slot.varianti.add(v.id) : slot.varianti.delete(v.id);
        aggiornaPrezzoFamiglia();
      });
      g.appendChild(row);
    });
    box.appendChild(g);
  }
}

function aggiornaPrezzoFamiglia() {
  const attivi = famSlots.slice(0, famNumGusti);
  const tuttiScelti = attivi.every(s => s.pizzaId);
  if (!tuttiScelti) { $("#famiglia-prezzo").textContent = "—"; return; }
  const prezzi = attivi.map(slotUnitPrice);
  $("#famiglia-prezzo").textContent = euro(calcolaPrezzoFamiglia(prezzi));
}

$("#btn-aggiungi-famiglia").addEventListener("click", () => {
  const attivi = famSlots.slice(0, famNumGusti);
  if (!attivi.every(s => s.pizzaId)) { alert("Scegli una pizza per ogni gusto prima di aggiungere."); return; }

  const gustiDettaglio = attivi.map(slot => {
    const pizza = state.dishes.find(d => d.id === slot.pizzaId);
    const removedNames = [...slot.removed].map(id => state.ingredients.find(i => i.id === id)?.name).filter(Boolean);
    const addedList = [...slot.extra].map(id => {
      const ing = state.ingredients.find(i => i.id === id);
      return { name: ing.name, price: ing.price || 0 };
    });
    const variantiList = [...slot.varianti].map(id => {
      const v = state.varianti.find(v => v.id === id);
      return { name: v.name, price: v.price || 0 };
    });
    return { name: pizza.name, removed: removedNames, added: addedList, varianti: variantiList, unitPrice: slotUnitPrice(slot) };
  });

  const prezzi = gustiDettaglio.map(g => g.unitPrice);
  const prezzoFinale = calcolaPrezzoFamiglia(prezzi);
  const nomeCompleto = famDish.name + " (" + gustiDettaglio.map(g => g.name).join(" / ") + ")";
  const note = $("#fam-nota").value.trim();
  const categoria = state.categories.find(c => c.id === famDish.categoryId);
  const reparto = categoria ? (categoria.reparto || "cucina") : "cucina";

  cart.push({
    dishId: famDish.id,
    name: nomeCompleto,
    qty: 1,
    unit: "pezzo",
    unitPrice: prezzoFinale,
    lineTotal: prezzoFinale,
    removed: [], added: [], varianti: [],
    famiglia: gustiDettaglio,
    note,
    reparto
  });

  closeModal("modal-famiglia");
  updateCarrelloBar();
});

function updateCarrelloBar() {
  const bar = $("#carrello-bar");
  const lista = $("#carrello-lista");
  if (cart.length === 0) {
    bar.classList.add("hidden");
    lista.innerHTML = "";
    return;
  }
  bar.classList.remove("hidden");
  const count = cart.reduce((s, i) => s + i.qty, 0);
  const totale = cart.reduce((s, i) => s + i.lineTotal, 0);
  $("#carrello-count").textContent = count;
  $("#carrello-totale").textContent = euro(totale);

  lista.innerHTML = "";
  cart.forEach((item, idx) => {
    let mods = buildMods(item);
    if (item.note) mods.push("Nota: " + item.note);
    const row = document.createElement("div");
    row.className = "carrello-riga";
    row.innerHTML = `
      <div class="carrello-riga-testo">
        <div class="riga-top"><span>${qtyLabel(item)} ${item.name}</span><span>${euro(item.lineTotal)}</span></div>
        ${mods.length ? `<div class="riga-mod">${mods.join(" · ")}</div>` : ""}
      </div>
      <button class="carrello-riga-rimuovi" title="Rimuovi">✕</button>`;
    row.querySelector(".carrello-riga-rimuovi").addEventListener("click", () => {
      cart.splice(idx, 1);
      updateCarrelloBar();
    });
    lista.appendChild(row);
  });
}

$("#btn-invia-cucina").addEventListener("click", () => {
  if (cart.length === 0 || !currentTable) return;
  const hasCucina = cart.some(i => (i.reparto || "cucina") === "cucina");
  const hasBar = cart.some(i => (i.reparto || "cucina") === "bar");
  const orderData = {
    table: currentTable,
    tableLabel: currentTableLabel,
    items: cart,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    archived: false,
  };
  if (hasCucina) { orderData.statusCucina = "nuovo"; orderData.stampaCucina = "da_stampare"; }
  if (hasBar) orderData.statusBar = "nuovo";
  if (currentReadyBy) orderData.readyBy = currentReadyBy;
  db.collection("orders").add(orderData).then(() => {
    cart = [];
    updateCarrelloBar();
    tornaAllaListaSale();
  }).catch(e => alert("Errore invio ordine: " + e.message));
});

function tornaAllaListaSale() {
  $("#cameriere-tavolo").classList.add("hidden");
  $("#cameriere-conto").classList.add("hidden");
  $("#cameriere-tables").classList.add("hidden");
  $("#cameriere-asporto").classList.add("hidden");
  $("#cameriere-sale-list").classList.remove("hidden");
  currentTable = null;
  currentTableLabel = "";
  currentSalaId = null;
  currentReadyBy = null;
  renderSaleList();
  renderAsportoList();
  salvaStatoNav("sala-list");
}

// ====================================================================
// SALA — NOTE TAVOLO
// ====================================================================
$("#btn-note-tavolo").addEventListener("click", () => {
  $("#note-tavolo-numero").textContent = currentTableLabel;
  $("#note-tavolo-testo").value = state.tableNotes[currentTable] || "";
  openModal("modal-note");
});
$("#btn-salva-note").addEventListener("click", () => {
  const testo = $("#note-tavolo-testo").value.trim();
  db.collection("tableNotes").doc(String(currentTable)).set({ text: testo })
    .then(() => closeModal("modal-note"));
});

// ====================================================================
// SALA — CONTO TAVOLO
// ====================================================================
$("#btn-conto-tavolo").addEventListener("click", () => openConto());

function openConto() {
  $("#cameriere-tavolo").classList.add("hidden");
  $("#cameriere-conto").classList.remove("hidden");
  $("#conto-label").textContent = "Conto — " + currentTableLabel;
  $("#conto-parziale-wrap").classList.add("hidden");
  renderConto();
  salvaStatoNav("conto");
}
function renderContoIfOpen() {
  if (!$("#cameriere-conto").classList.contains("hidden")) renderConto();
}
function ordiniTavoloCorrente() {
  return state.orders.filter(o => o.table === currentTable && !o.archived);
}
function renderConto() {
  const lista = $("#conto-lista");
  lista.innerHTML = "";
  const ordiniTavolo = ordiniTavoloCorrente();
  let totale = 0;
  ordiniTavolo.forEach(o => {
    (o.items || []).forEach((item, idx) => {
      totale += item.lineTotal;
      const div = document.createElement("div");
      div.className = "conto-riga-tavolo";
      let mods = buildMods(item);
      if (item.note) mods.push("Nota: " + item.note);
      div.innerHTML = `
        <div class="riga-top">
          <span>${qtyLabel(item)} ${item.name}</span>
          <span class="riga-top-right">${euro(item.lineTotal)}<button class="conto-riga-rimuovi" title="Rimuovi articolo">✕</button></span>
        </div>
        ${mods.length ? `<div class="riga-mod">${mods.join(" · ")}</div>` : ""}`;
      div.querySelector(".conto-riga-rimuovi").addEventListener("click", () => {
        if (!confirm("Rimuovere \"" + item.name + "\" da questo ordine? Se il cliente ha cambiato idea, va tolto anche dalla preparazione in corso.")) return;
        rimuoviArticoloDaOrdine(o.id, idx);
      });
      lista.appendChild(div);
    });
  });
  if (ordiniTavolo.length === 0) {
    lista.innerHTML = '<p class="hint-text">Nessuna ordinazione ancora per questo tavolo.</p>';
  }
  $("#conto-totale-finale").textContent = euro(totale);
}

function rimuoviArticoloDaOrdine(orderId, itemIndex) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;
  const nuoviItems = (order.items || []).filter((_, i) => i !== itemIndex);
  const updates = { items: nuoviItems };
  if (nuoviItems.length === 0) updates.archived = true;
  db.collection("orders").doc(orderId).update(updates);
}

// ---------- STAMPA SCONTRINO (immagine PNG, con testo a capo corretto) ----------
function slugFile(s) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "ordine";
}

function wrapCanvasText(ctx, text, maxWidth) {
  const words = String(text).split(" ");
  const lines = [];
  let current = "";
  words.forEach(word => {
    const test = current ? current + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  });
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

async function stampaScontrino() {
  const ordiniTavolo = ordiniTavoloCorrente();
  const righe = [];
  let totale = 0;
  ordiniTavolo.forEach(o => {
    (o.items || []).forEach(item => {
      totale += item.lineTotal;
      righe.push({ qty: qtyLabel(item), name: item.name, prezzo: euro(item.lineTotal) });
    });
  });
  const dataOra = new Date().toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  // 80mm di carta termica ≈ 576px a 203dpi (standard per stampanti a scontrino/etichette)
  const W = 576;
  const PAD = 28;
  const contentW = W - PAD * 2;
  const font = (size, bold) => (bold ? "bold " : "") + size + "px -apple-system, Helvetica, Arial, sans-serif";

  // --- passata 1: misura tutto il testo per calcolare l'altezza esatta (niente tagli) ---
  const mCanvas = document.createElement("canvas");
  mCanvas.width = W; mCanvas.height = 10;
  const mctx = mCanvas.getContext("2d");

  mctx.font = font(28, true);
  const titleLines = wrapCanvasText(mctx, currentTableLabel, contentW);
  mctx.font = font(18, false);
  const dateLines = wrapCanvasText(mctx, dataOra, contentW);

  mctx.font = font(21, false);
  const itemBlocks = righe.map(r => {
    const lines = wrapCanvasText(mctx, `${r.qty} ${r.name}`, contentW);
    return { lines, prezzo: r.prezzo };
  });

  const titleLH = 36, dateLH = 24, itemLH = 27, priceLH = 27, totalLH = 36;
  let H = PAD;
  H += titleLines.length * titleLH;
  H += dateLines.length * dateLH + 18;
  H += 20; // linea tratteggiata
  itemBlocks.forEach(b => { H += b.lines.length * itemLH + priceLH + 12; });
  H += 20; // linea tratteggiata
  H += totalLH + PAD;

  // --- passata 2: disegno vero sul canvas alla dimensione corretta ---
  const canvas = document.createElement("canvas");
  const scale = 2; // per un'immagine più nitida in stampa
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "alphabetic";

  let y = PAD + 20;
  ctx.font = font(28, true);
  ctx.textAlign = "center";
  titleLines.forEach(line => { ctx.fillText(line, W / 2, y); y += titleLH; });

  ctx.font = font(18, false);
  dateLines.forEach(line => { ctx.fillText(line, W / 2, y); y += dateLH; });
  y += 18;

  ctx.textAlign = "left";
  ctx.beginPath();
  ctx.setLineDash([3, 3]);
  ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
  y += 30;

  ctx.font = font(21, false);
  itemBlocks.forEach(b => {
    ctx.textAlign = "left";
    b.lines.forEach(line => { ctx.fillText(line, PAD, y); y += itemLH; });
    ctx.textAlign = "right";
    ctx.fillText(b.prezzo, W - PAD, y);
    y += priceLH + 12;
  });

  ctx.beginPath();
  ctx.setLineDash([3, 3]);
  ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
  y += 32;

  ctx.font = font(26, true);
  ctx.textAlign = "left";
  ctx.fillText("Totale", PAD, y);
  ctx.textAlign = "right";
  ctx.fillText(euro(totale), W - PAD, y);

  // Trasformiamo il disegno (già corretto, senza tagli) in un vero PDF:
  // Labelife intercetta i PDF nel pannello di condivisione (come per le
  // etichette di spedizione di Shopify), ma non le semplici immagini.
  if (!window.jspdf) {
    alert("Libreria PDF non ancora caricata, controlla la connessione e riprova tra un attimo.");
    return;
  }
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: W > H ? "l" : "p", unit: "pt", format: [W, H] });
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, W, H);
  const pdfBlob = pdf.output("blob");
  const fileName = "scontrino-" + slugFile(currentTableLabel) + ".pdf";
  const file = new File([pdfBlob], fileName, { type: "application/pdf" });

  // Prova prima la condivisione nativa: se Labelife è installata, tra le
  // app disponibili dovrebbe comparire proprio come per un PDF di Shopify.
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Scontrino " + currentTableLabel });
      return;
    } catch (e) { /* condivisione annullata: proseguiamo col download qui sotto */ }
  }

  // Fallback: scarica direttamente il PDF (finisce in File > Download).
  // Niente più scheda nuova: su iOS aprire un file generato al volo in
  // un'altra scheda è inaffidabile (resta bianca). Il download diretto
  // invece avviene nella stessa pagina, senza questo problema.
  const url = URL.createObjectURL(pdfBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

$("#btn-stampa-scontrino").addEventListener("click", stampaScontrino);

// ---------- CONTO PARZIALE (divisione per numero di persone) ----------
$("#btn-conto-parziale").addEventListener("click", () => {
  const wrap = $("#conto-parziale-wrap");
  const apri = wrap.classList.contains("hidden");
  wrap.classList.toggle("hidden");
  if (apri) {
    $("#conto-parziale-persone").value = "";
    $("#conto-parziale-risultato").textContent = "";
    $("#conto-parziale-persone").focus();
  }
});
$("#conto-parziale-persone").addEventListener("input", () => {
  const n = parseInt($("#conto-parziale-persone").value, 10);
  const risultato = $("#conto-parziale-risultato");
  if (!n || n < 1) { risultato.textContent = ""; return; }
  const totale = ordiniTavoloCorrente().reduce((s, o) => s + (o.items || []).reduce((s2, it) => s2 + it.lineTotal, 0), 0);
  risultato.textContent = euro(totale / n) + " a testa";
});

$("#btn-aggiungi-ordine").addEventListener("click", () => {
  $("#cameriere-conto").classList.add("hidden");
  $("#cameriere-tavolo").classList.remove("hidden");
  $("#tavolo-label").textContent = currentTableLabel;
  renderMenu();
  salvaStatoNav("tavolo");
});

$("#btn-chiudi-conto").addEventListener("click", () => {
  if (!confirm("Chiudere il conto — " + currentTableLabel + "? Verrà stampato lo scontrino e gli ordini verranno archiviati.")) return;
  stampaScontrino();
  const ordiniTavolo = ordiniTavoloCorrente();
  const batch = db.batch();
  ordiniTavolo.forEach(o => batch.update(db.collection("orders").doc(o.id), { archived: true }));
  batch.commit().then(() => {
    tornaAllaListaSale();
  });
});

// ====================================================================
// CODA DI STAMPA (foglietti cucina su carta, via Labelife)
// ====================================================================
function aggiornaBadgeStampa() {
  const el = $("#stampa-badge-home");
  if (!el) return;
  const n = state.orders.filter(o => !o.archived && o.stampaCucina === "da_stampare").length;
  el.textContent = n > 0 ? `🔴 ${n} da stampare` : "Foglietti cucina da stampare";
}

function renderStampaQueue() {
  const lista = $("#stampa-lista");
  if (!lista) return;
  const daStampare = state.orders
    .filter(o => !o.archived && o.stampaCucina === "da_stampare")
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));

  lista.innerHTML = "";
  if (daStampare.length === 0) {
    lista.innerHTML = '<p class="hint-text">Nessun foglietto in coda.</p>';
    return;
  }
  daStampare.forEach(o => {
    const ora = o.createdAt?.toDate ? o.createdAt.toDate().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "--:--";
    const card = document.createElement("div");
    card.className = "ordine-card";
    let itemsHtml = "";
    (o.items || []).filter(item => (item.reparto || "cucina") === "cucina").forEach(item => {
      const mods = buildMods(item);
      itemsHtml += `
        <div class="ordine-item">
          <div class="ordine-item-nome">${qtyLabel(item)} ${item.name}</div>
          ${mods.length ? `<div class="ordine-item-mod">${mods.join(" · ")}</div>` : ""}
          ${item.note ? `<div class="ordine-item-nota">"${item.note}"</div>` : ""}
        </div>`;
    });
    card.innerHTML = `
      <div class="ordine-top">
        <span class="ordine-tavolo">${o.tableLabel || o.table}</span>
        <span class="ordine-ora">${ora}</span>
      </div>
      ${itemsHtml}
      <button class="btn-primary btn-stampa-foglietto" style="width:100%; margin-top:12px;">🖨️ Stampa</button>`;
    card.querySelector(".btn-stampa-foglietto").addEventListener("click", (e) => {
      e.target.disabled = true;
      e.target.textContent = "Stampo…";
      stampaFoglioCucina(o);
    });
    lista.appendChild(card);
  });
}

async function stampaFoglioCucina(o) {
  const itemsCucina = (o.items || []).filter(item => (item.reparto || "cucina") === "cucina");
  if (itemsCucina.length === 0) return;
  const tableLabel = o.tableLabel || o.table;
  const dataOra = new Date().toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const W = 576;
  const PAD = 28;
  const contentW = W - PAD * 2;
  const font = (size, bold, italic) => (italic ? "italic " : "") + (bold ? "bold " : "") + size + "px -apple-system, Helvetica, Arial, sans-serif";

  // --- passata 1: misura tutto il testo per calcolare l'altezza esatta ---
  const mCanvas = document.createElement("canvas");
  mCanvas.width = W; mCanvas.height = 10;
  const mctx = mCanvas.getContext("2d");

  mctx.font = font(30, true);
  const titleLines = wrapCanvasText(mctx, tableLabel, contentW);
  mctx.font = font(18, false);
  const dateLines = wrapCanvasText(mctx, dataOra, contentW);

  const itemBlocks = itemsCucina.map(item => {
    mctx.font = font(23, true);
    const lines = wrapCanvasText(mctx, `${qtyLabel(item)} ${item.name}`, contentW);
    mctx.font = font(16, false);
    const modLines = [];
    buildMods(item).forEach(m => modLines.push(...wrapCanvasText(mctx, m, contentW - 14)));
    let noteLines = [];
    if (item.note) {
      mctx.font = font(16, false, true);
      noteLines = wrapCanvasText(mctx, `"${item.note}"`, contentW - 14);
    }
    return { lines, modLines, noteLines };
  });

  const titleLH = 38, dateLH = 24, itemLH = 30, modLH = 22, noteLH = 22;
  let H = PAD;
  H += titleLines.length * titleLH;
  H += dateLines.length * dateLH + 18;
  H += 20; // linea tratteggiata
  itemBlocks.forEach(b => {
    H += b.lines.length * itemLH + b.modLines.length * modLH + b.noteLines.length * noteLH + 16;
  });
  H += PAD;

  // --- passata 2: disegno vero ---
  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "alphabetic";

  let y = PAD + 22;
  ctx.font = font(30, true);
  ctx.textAlign = "center";
  titleLines.forEach(line => { ctx.fillText(line, W / 2, y); y += titleLH; });

  ctx.font = font(18, false);
  dateLines.forEach(line => { ctx.fillText(line, W / 2, y); y += dateLH; });
  y += 18;

  ctx.textAlign = "left";
  ctx.beginPath();
  ctx.setLineDash([3, 3]);
  ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
  y += 30;

  itemBlocks.forEach(b => {
    ctx.font = font(23, true);
    b.lines.forEach(line => { ctx.fillText(line, PAD, y); y += itemLH; });
    ctx.font = font(16, false);
    b.modLines.forEach(line => { ctx.fillText(line, PAD + 14, y); y += modLH; });
    if (b.noteLines.length) {
      ctx.font = font(16, false, true);
      b.noteLines.forEach(line => { ctx.fillText(line, PAD + 14, y); y += noteLH; });
    }
    y += 16;
  });

  if (!window.jspdf) {
    alert("Libreria PDF non ancora caricata, controlla la connessione e riprova tra un attimo.");
    renderStampaQueue();
    return;
  }
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: W > H ? "l" : "p", unit: "pt", format: [W, H] });
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, W, H);
  const pdfBlob = pdf.output("blob");
  const fileName = "cucina-" + slugFile(tableLabel) + ".pdf";
  const file = new File([pdfBlob], fileName, { type: "application/pdf" });

  // Segniamo subito il foglietto come stampato: da qui in poi viene comunque
  // generato un PDF (condiviso o scaricato), quindi esce dalla coda.
  db.collection("orders").doc(o.id).update({ stampaCucina: "stampato" }).catch(() => {});

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Cucina " + tableLabel });
      return;
    } catch (e) { /* condivisione annullata: proseguiamo col download qui sotto */ }
  }
  const url = URL.createObjectURL(pdfBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ====================================================================
// CUCINA / BAR
// ====================================================================
let paginaPerReparto = { bar: 0 };

function statusFieldPerReparto(reparto) {
  return reparto === "bar" ? "statusBar" : "statusCucina";
}

$("#pag-prec-bar").addEventListener("click", () => { if (paginaPerReparto.bar > 0) { paginaPerReparto.bar--; renderBar(); } });
$("#pag-succ-bar").addEventListener("click", () => { paginaPerReparto.bar++; renderBar(); });

// Crea la card di un ordine per la vista cucina/bar (riutilizzata ovunque)
function creaOrdineCard(o, reparto, statusField) {
  const statusAttuale = o[statusField] || "nuovo";
  const inRitardo = isOrdineInRitardo(o);
  const card = document.createElement("div");
  card.className = "ordine-card status-" + statusAttuale + (inRitardo ? " in-ritardo" : "");
  const ora = o.createdAt?.toDate ? o.createdAt.toDate().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "--:--";
  const oraRitiro = o.readyBy ? new Date(o.readyBy).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : null;

  let itemsHtml = "";
  (o.items || []).filter(item => (item.reparto || "cucina") === reparto).forEach(item => {
    let mods = buildMods(item);
    itemsHtml += `
      <div class="ordine-item">
        <div class="ordine-item-nome">${qtyLabel(item)} ${item.name}</div>
        ${mods.length ? `<div class="ordine-item-mod">${mods.join(" · ")}</div>` : ""}
        ${item.note ? `<div class="ordine-item-nota">"${item.note}"</div>` : ""}
      </div>`;
  });

  const nota = state.tableNotes[o.table];

  card.innerHTML = `
    <div class="ordine-top">
      <span class="ordine-tavolo">${o.tableLabel || o.table}</span>
      <span class="ordine-ora">${oraRitiro ? "⏰ " + oraRitiro : ora}</span>
    </div>
    ${inRitardo ? `<div class="ordine-nota-tavolo ordine-ritardo">⏰ IN RITARDO — doveva essere pronto per le ${oraRitiro}</div>` : ""}
    ${nota ? `<div class="ordine-nota-tavolo">⚠️ ${nota}</div>` : ""}
    ${itemsHtml}
    <div class="ordine-status-btns">
      <button class="status-btn ${statusAttuale === "nuovo" ? "active" : ""}" data-status="nuovo">Da preparare</button>
      <button class="status-btn ${statusAttuale === "in_preparazione" ? "active prep" : ""}" data-status="in_preparazione">In prep.</button>
      <button class="status-btn ${statusAttuale === "pronto" ? "active done" : ""}" data-status="pronto">Pronto</button>
    </div>`;

  card.querySelectorAll(".status-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      db.collection("orders").doc(o.id).update({ [statusField]: btn.dataset.status });
    });
  });

  return card;
}

// ---------- CUCINA: doppia colonna a scorrimento indipendente (asporto | tavoli), niente paginazione ----------
function renderCucina() {
  const statusField = statusFieldPerReparto("cucina");
  const attivi = state.orders
    .filter(o => !o.archived && (o.items || []).some(i => (i.reparto || "cucina") === "cucina"))
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));

  const asporto = attivi.filter(o => String(o.table || "").startsWith("asporto#"))
    .sort((a, b) => new Date(a.readyBy || 0) - new Date(b.readyBy || 0));
  const sala = attivi.filter(o => !String(o.table || "").startsWith("asporto#"));

  const listaAsporto = $("#cucina-lista-asporto");
  const listaSala = $("#cucina-lista-sala");
  listaAsporto.innerHTML = "";
  listaSala.innerHTML = "";

  if (asporto.length === 0) {
    listaAsporto.innerHTML = '<p class="hint-text">Nessun asporto in corso.</p>';
  } else {
    asporto.forEach(o => listaAsporto.appendChild(creaOrdineCard(o, "cucina", statusField)));
  }
  if (sala.length === 0) {
    listaSala.innerHTML = '<p class="hint-text">Nessun ordine in corso.</p>';
  } else {
    sala.forEach(o => listaSala.appendChild(creaOrdineCard(o, "cucina", statusField)));
  }
}

// ---------- BAR: lista unica paginata (come prima) ----------
function renderBar() {
  const reparto = "bar";
  const statusField = statusFieldPerReparto(reparto);
  const lista = $("#bar-lista");
  if (!lista) return;

  const attivi = state.orders
    .filter(o => !o.archived && (o.items || []).some(i => (i.reparto || "cucina") === reparto))
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));

  lista.innerHTML = "";
  if (attivi.length === 0) {
    lista.innerHTML = '<p class="hint-text">Nessun ordine in corso per questo reparto.</p>';
    $("#bar-paginazione").classList.add("hidden");
    return;
  }

  const perPagina = 4;
  const totPagine = Math.max(1, Math.ceil(attivi.length / perPagina));
  if (paginaPerReparto.bar >= totPagine) paginaPerReparto.bar = totPagine - 1;
  const paginaCorrente = paginaPerReparto.bar;
  const pagina = attivi.slice(paginaCorrente * perPagina, paginaCorrente * perPagina + perPagina);

  $("#bar-paginazione").classList.toggle("hidden", attivi.length <= perPagina);
  $("#pag-info-bar").textContent = (paginaCorrente + 1) + "/" + totPagine;
  $("#pag-prec-bar").disabled = paginaCorrente === 0;
  $("#pag-succ-bar").disabled = paginaCorrente >= totPagine - 1;

  pagina.forEach(o => lista.appendChild(creaOrdineCard(o, reparto, statusField)));
}

// ====================================================================
// IMPOSTAZIONI — TABS
// ====================================================================
$all(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    $all(".tab-btn").forEach(b => b.classList.remove("active"));
    $all(".tab-panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    $("#" + btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "tab-archivio") renderArchivioAdmin();
  });
});

// ---------- CATEGORIE ----------
let editingCategoriaId = null;
function renderCategorieAdmin() {
  const wrap = $("#lista-categorie-admin");
  if (!wrap) return;
  wrap.innerHTML = "";
  state.categories.forEach(cat => {
    const row = document.createElement("div");
    row.className = "admin-row";
    const repartoLabel = cat.reparto === "bar" ? "☕ Bar" : cat.reparto === "nessuno" ? "🧾 Solo conto" : "🍕 Cucina";
    row.innerHTML = `<div><div class="admin-row-main">${cat.name}</div><div class="admin-row-sub">${repartoLabel}</div></div><button class="admin-row-edit">Modifica</button>`;
    row.querySelector("button").addEventListener("click", () => openEditCategoria(cat));
    wrap.appendChild(row);
  });
}
function openEditCategoria(cat) {
  editingCategoriaId = cat ? cat.id : null;
  $("#edit-categoria-titolo").textContent = cat ? "Modifica categoria" : "Nuova categoria";
  $("#edit-categoria-nome").value = cat ? cat.name : "";
  $("#edit-categoria-reparto").value = cat ? (cat.reparto || "cucina") : "cucina";
  $("#btn-elimina-categoria").style.display = cat ? "block" : "none";
  openModal("modal-edit-categoria");
}
$("#btn-nuova-categoria").addEventListener("click", () => openEditCategoria(null));
$("#btn-salva-categoria").addEventListener("click", () => {
  const name = $("#edit-categoria-nome").value.trim();
  const reparto = $("#edit-categoria-reparto").value;
  if (!name) return;
  const ref = editingCategoriaId ? db.collection("categories").doc(editingCategoriaId) : db.collection("categories").doc();
  ref.set({ name, reparto }).then(() => closeModal("modal-edit-categoria"));
});
$("#btn-elimina-categoria").addEventListener("click", () => {
  if (!editingCategoriaId) return;
  if (!confirm("Eliminare questa categoria? I piatti associati resteranno ma senza categoria.")) return;
  db.collection("categories").doc(editingCategoriaId).delete().then(() => closeModal("modal-edit-categoria"));
});

// ---------- INGREDIENTI ----------
let editingIngredienteId = null;
function renderIngredientiAdmin() {
  const wrap = $("#lista-ingredienti-admin");
  if (!wrap) return;
  wrap.innerHTML = "";
  state.ingredients.forEach(ing => {
    const row = document.createElement("div");
    row.className = "admin-row";
    row.innerHTML = `<div><div class="admin-row-main">${ing.name}</div><div class="admin-row-sub">+${euro(ing.price || 0)} se aggiunto</div></div><button class="admin-row-edit">Modifica</button>`;
    row.querySelector("button").addEventListener("click", () => openEditIngrediente(ing));
    wrap.appendChild(row);
  });
}
function openEditIngrediente(ing) {
  editingIngredienteId = ing ? ing.id : null;
  $("#edit-ingrediente-titolo").textContent = ing ? "Modifica ingrediente" : "Nuovo ingrediente";
  $("#edit-ingrediente-nome").value = ing ? ing.name : "";
  $("#edit-ingrediente-prezzo").value = ing ? ing.price : "";
  $("#btn-elimina-ingrediente").style.display = ing ? "block" : "none";
  openModal("modal-edit-ingrediente");
}
$("#btn-nuovo-ingrediente").addEventListener("click", () => openEditIngrediente(null));
$("#btn-salva-ingrediente").addEventListener("click", () => {
  const name = $("#edit-ingrediente-nome").value.trim();
  const price = parseFloat($("#edit-ingrediente-prezzo").value) || 0;
  if (!name) return;
  const ref = editingIngredienteId ? db.collection("ingredients").doc(editingIngredienteId) : db.collection("ingredients").doc();
  ref.set({ name, price }).then(() => closeModal("modal-edit-ingrediente"));
});
$("#btn-elimina-ingrediente").addEventListener("click", () => {
  if (!editingIngredienteId) return;
  if (!confirm("Eliminare questo ingrediente? Verrà rimosso anche dai piatti che lo usano come opzione.")) return;
  db.collection("ingredients").doc(editingIngredienteId).delete().then(() => closeModal("modal-edit-ingrediente"));
});

// ---------- VARIANTI ----------
let editingVarianteId = null;
function renderVariantiAdmin() {
  const wrap = $("#lista-varianti-admin");
  if (!wrap) return;
  wrap.innerHTML = "";
  state.varianti.forEach(v => {
    const row = document.createElement("div");
    row.className = "admin-row";
    row.innerHTML = `<div><div class="admin-row-main">${v.name}</div><div class="admin-row-sub">+${euro(v.price || 0)}</div></div><button class="admin-row-edit">Modifica</button>`;
    row.querySelector("button").addEventListener("click", () => openEditVariante(v));
    wrap.appendChild(row);
  });
}
function openEditVariante(v) {
  editingVarianteId = v ? v.id : null;
  $("#edit-variante-titolo").textContent = v ? "Modifica variante" : "Nuova variante";
  $("#edit-variante-nome").value = v ? v.name : "";
  $("#edit-variante-prezzo").value = v ? v.price : "";
  $("#btn-elimina-variante").style.display = v ? "block" : "none";
  openModal("modal-edit-variante");
}
$("#btn-nuova-variante").addEventListener("click", () => openEditVariante(null));
$("#btn-salva-variante").addEventListener("click", () => {
  const name = $("#edit-variante-nome").value.trim();
  const price = parseFloat($("#edit-variante-prezzo").value) || 0;
  if (!name) return;
  const ref = editingVarianteId ? db.collection("varianti").doc(editingVarianteId) : db.collection("varianti").doc();
  ref.set({ name, price }).then(() => closeModal("modal-edit-variante"));
});
$("#btn-elimina-variante").addEventListener("click", () => {
  if (!editingVarianteId) return;
  if (!confirm("Eliminare questa variante? Verrà rimossa anche dai piatti che la usano come opzione.")) return;
  db.collection("varianti").doc(editingVarianteId).delete().then(() => closeModal("modal-edit-variante"));
});

// ---------- PIATTI ----------
let editingPiattoId = null;
function populateCategoriaSelect() {
  const sel = $("#edit-piatto-categoria");
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
  if (current) sel.value = current;
}
function renderPiattiAdmin() {
  const wrap = $("#lista-piatti-admin");
  if (!wrap) return;
  wrap.innerHTML = "";
  state.dishes.forEach(dish => {
    const cat = state.categories.find(c => c.id === dish.categoryId);
    const row = document.createElement("div");
    row.className = "admin-row";
    row.innerHTML = `<div><div class="admin-row-main">${dish.name}</div><div class="admin-row-sub">${cat ? cat.name : "senza categoria"} · ${euro(dish.price || 0)}</div></div><button class="admin-row-edit">Modifica</button>`;
    row.querySelector("button").addEventListener("click", () => openEditPiatto(dish));
    wrap.appendChild(row);
  });
}
function renderIngredientCheckList(containerId, selectedIds, items) {
  items = items || state.ingredients;
  const wrap = $("#" + containerId);
  wrap.innerHTML = "";
  items.forEach(ing => {
    const row = document.createElement("div");
    row.className = "opt-row";
    const checked = selectedIds.includes(ing.id) ? "checked" : "";
    row.innerHTML = `<input type="checkbox" data-ing="${ing.id}" ${checked}><label>${ing.name}</label>`;
    wrap.appendChild(row);
  });
}
function openEditPiatto(dish) {
  editingPiattoId = dish ? dish.id : null;
  $("#edit-piatto-titolo").textContent = dish ? "Modifica piatto" : "Nuovo piatto";
  $("#edit-piatto-nome").value = dish ? dish.name : "";
  $("#edit-piatto-prezzo").value = dish ? dish.price : "";
  const hasPesoUnit = dish && dish.unit && dish.unit !== "pezzo";
  $("#edit-piatto-prezzo-peso").checked = !!hasPesoUnit;
  $("#edit-piatto-unita-peso").value = hasPesoUnit ? dish.unit : "";
  $("#edit-piatto-unita-peso-wrap").classList.toggle("hidden", !hasPesoUnit);
  populateCategoriaSelect();
  if (dish) $("#edit-piatto-categoria").value = dish.categoryId || "";
  $("#edit-piatto-famiglia").checked = dish ? !!dish.isFamiglia : false;
  $("#edit-piatto-normale-wrap").classList.toggle("hidden", $("#edit-piatto-famiglia").checked);
  $("#edit-piatto-componibile").checked = dish ? !!dish.componibile : false;
  $("#edit-piatto-glutine").checked = dish ? !!dish.glutenFree : false;
  $("#edit-piatto-lattosio").checked = dish ? !!dish.lactoseFree : false;
  $("#edit-piatto-ingredienti-wrap").classList.toggle("hidden", !($("#edit-piatto-componibile").checked));
  renderIngredientCheckList("edit-piatto-rimovibili", dish ? (dish.removableIds || []) : []);
  renderIngredientCheckList("edit-piatto-extra", dish ? (dish.extraIds || []) : []);
  renderIngredientCheckList("edit-piatto-varianti", dish ? (dish.variantIds || []) : [], state.varianti);
  $("#btn-elimina-piatto").style.display = dish ? "block" : "none";
  openModal("modal-edit-piatto");
}
$("#edit-piatto-famiglia").addEventListener("change", e => {
  $("#edit-piatto-normale-wrap").classList.toggle("hidden", e.target.checked);
});
$("#edit-piatto-componibile").addEventListener("change", e => {
  $("#edit-piatto-ingredienti-wrap").classList.toggle("hidden", !e.target.checked);
});
$("#edit-piatto-prezzo-peso").addEventListener("change", e => {
  $("#edit-piatto-unita-peso-wrap").classList.toggle("hidden", !e.target.checked);
});
$("#btn-nuovo-piatto").addEventListener("click", () => openEditPiatto(null));
$("#btn-salva-piatto").addEventListener("click", () => {
  const name = $("#edit-piatto-nome").value.trim();
  const isFamiglia = $("#edit-piatto-famiglia").checked;
  const price = parseFloat($("#edit-piatto-prezzo").value) || 0;
  const prezzoAPeso = $("#edit-piatto-prezzo-peso").checked;
  const unitaPeso = $("#edit-piatto-unita-peso").value.trim();
  const unit = prezzoAPeso ? (unitaPeso || "dag") : "pezzo";
  const categoryId = $("#edit-piatto-categoria").value;
  const componibile = $("#edit-piatto-componibile").checked;
  const removableIds = $all("#edit-piatto-rimovibili input:checked").map(i => i.dataset.ing);
  const extraIds = $all("#edit-piatto-extra input:checked").map(i => i.dataset.ing);
  const variantIds = $all("#edit-piatto-varianti input:checked").map(i => i.dataset.ing);
  const glutenFree = $("#edit-piatto-glutine").checked;
  const lactoseFree = $("#edit-piatto-lattosio").checked;
  if (!name) return;

  const data = { name, isFamiglia, price, unit, categoryId, componibile, removableIds, extraIds, variantIds, glutenFree, lactoseFree };
  const ref = editingPiattoId ? db.collection("dishes").doc(editingPiattoId) : db.collection("dishes").doc();
  ref.set(data).then(() => closeModal("modal-edit-piatto"));
});
$("#btn-elimina-piatto").addEventListener("click", () => {
  if (!editingPiattoId) return;
  if (!confirm("Eliminare questo piatto dal menù?")) return;
  db.collection("dishes").doc(editingPiattoId).delete().then(() => closeModal("modal-edit-piatto"));
});

// ---------- SALE (nome + numero tavoli di ciascuna) ----------
function renderSaleAdmin() {
  const wrap = $("#lista-sale-admin");
  if (!wrap) return;
  wrap.innerHTML = "";
  (state.settings.sale || []).forEach((sala, idx) => {
    const row = document.createElement("div");
    row.className = "sala-admin-row";
    row.innerHTML = `
      <input type="text" data-sala-nome value="${sala.name}">
      <div class="qty-control">
        <button data-sala-meno>−</button>
        <span data-sala-val>${sala.numTables}</span>
        <button data-sala-piu>+</button>
        <span class="hint-text" style="margin-left:8px;">tavoli</span>
      </div>`;
    const nomeInput = row.querySelector("[data-sala-nome]");
    nomeInput.addEventListener("change", () => salvaSala(idx, { name: nomeInput.value.trim() || sala.name }));
    row.querySelector("[data-sala-meno]").addEventListener("click", () => {
      const n = Math.max(1, sala.numTables - 1);
      row.querySelector("[data-sala-val]").textContent = n;
      salvaSala(idx, { numTables: n });
    });
    row.querySelector("[data-sala-piu]").addEventListener("click", () => {
      const n = sala.numTables + 1;
      row.querySelector("[data-sala-val]").textContent = n;
      salvaSala(idx, { numTables: n });
    });
    wrap.appendChild(row);
  });
}
function salvaSala(idx, changes) {
  const sale = (state.settings.sale || []).map((s, i) => i === idx ? Object.assign({}, s, changes) : s);
  db.collection("settings").doc("general").set({ sale }, { merge: true });
}

// ---------- ALTRO — reset ordini bloccati ----------
$("#btn-reset-ordini").addEventListener("click", () => {
  const attivi = state.orders.filter(o => !o.archived);
  if (attivi.length === 0) { alert("Non ci sono ordini attivi al momento."); return; }
  if (!confirm("Azzerare TUTTI i " + attivi.length + " ordini attivi (Sala, Cucina, Bar, Asporto)? Questa azione non si può annullare.")) return;
  const chunks = [];
  for (let i = 0; i < attivi.length; i += 400) chunks.push(attivi.slice(i, i + 400));
  Promise.all(chunks.map(chunk => {
    const batch = db.batch();
    chunk.forEach(o => batch.update(db.collection("orders").doc(o.id), { archived: true }));
    return batch.commit();
  })).then(() => alert("Fatto: tutti gli ordini attivi sono stati azzerati."))
    .catch(e => alert("Errore durante il reset: " + e.message));
});

// ---------- ARCHIVIO ORDINI (conti chiusi) ----------
let archivioPagina = 0;
let archivioSelezionati = new Set();

function ordiniArchiviati() {
  return state.orders.filter(o => o.archived).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

function renderArchivioAdmin() {
  const lista = $("#lista-archivio-admin");
  if (!lista) return;
  const tutti = ordiniArchiviati();
  const perPagina = 25;
  const totPagine = Math.max(1, Math.ceil(tutti.length / perPagina));
  if (archivioPagina >= totPagine) archivioPagina = totPagine - 1;
  const pagina = tutti.slice(archivioPagina * perPagina, archivioPagina * perPagina + perPagina);

  lista.innerHTML = "";
  if (tutti.length === 0) {
    lista.innerHTML = '<p class="hint-text">Nessun ordine archiviato ancora.</p>';
  }
  pagina.forEach(o => {
    const data = o.createdAt?.toDate ? o.createdAt.toDate().toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "--";
    const totale = (o.items || []).reduce((s, it) => s + it.lineTotal, 0);
    const nomiPiatti = (o.items || []).map(it => qtyLabel(it) + " " + it.name).join(", ");
    const row = document.createElement("div");
    row.className = "archivio-riga";
    row.innerHTML = `
      <input type="checkbox" data-order-id="${o.id}" ${archivioSelezionati.has(o.id) ? "checked" : ""}>
      <div class="archivio-riga-info">
        <div class="archivio-riga-top"><span>${o.tableLabel || o.table} — ${data}</span><span>${euro(totale)}</span></div>
        <div class="archivio-riga-sub">${nomiPiatti}</div>
      </div>`;
    row.querySelector("input").addEventListener("change", e => {
      e.target.checked ? archivioSelezionati.add(o.id) : archivioSelezionati.delete(o.id);
      aggiornaContatoreArchivio();
    });
    lista.appendChild(row);
  });

  $("#archivio-paginazione").classList.toggle("hidden", tutti.length <= perPagina);
  $("#pag-info-archivio").textContent = (archivioPagina + 1) + "/" + totPagine;
  $("#pag-prec-archivio").disabled = archivioPagina === 0;
  $("#pag-succ-archivio").disabled = archivioPagina >= totPagine - 1;
  $("#archivio-seleziona-tutti").checked = pagina.length > 0 && pagina.every(o => archivioSelezionati.has(o.id));
  aggiornaContatoreArchivio();
}

function aggiornaContatoreArchivio() {
  $("#archivio-num-selezionati").textContent = archivioSelezionati.size;
  $("#btn-elimina-selezionati-archivio").disabled = archivioSelezionati.size === 0;
}

$("#pag-prec-archivio").addEventListener("click", () => { if (archivioPagina > 0) { archivioPagina--; renderArchivioAdmin(); } });
$("#pag-succ-archivio").addEventListener("click", () => { archivioPagina++; renderArchivioAdmin(); });

$("#archivio-seleziona-tutti").addEventListener("change", e => {
  const perPagina = 25;
  const pagina = ordiniArchiviati().slice(archivioPagina * perPagina, archivioPagina * perPagina + perPagina);
  pagina.forEach(o => { e.target.checked ? archivioSelezionati.add(o.id) : archivioSelezionati.delete(o.id); });
  renderArchivioAdmin();
});

$("#btn-elimina-selezionati-archivio").addEventListener("click", () => {
  const ids = [...archivioSelezionati];
  if (ids.length === 0) return;
  if (!confirm("Eliminare definitivamente " + ids.length + " ordini dall'archivio? Non si possono recuperare dopo, neanche dall'esportazione CSV se non l'hai già fatta.")) return;
  const chunks = [];
  for (let i = 0; i < ids.length; i += 400) chunks.push(ids.slice(i, i + 400));
  Promise.all(chunks.map(chunk => {
    const batch = db.batch();
    chunk.forEach(id => batch.delete(db.collection("orders").doc(id)));
    return batch.commit();
  })).then(() => {
    archivioSelezionati.clear();
    renderArchivioAdmin();
  }).catch(e => alert("Errore durante l'eliminazione: " + e.message));
});

$("#btn-esporta-archivio").addEventListener("click", () => {
  const tutti = ordiniArchiviati();
  if (tutti.length === 0) { alert("Non ci sono ordini archiviati da esportare."); return; }
  const righeCsv = [["Data", "Ora", "Tavolo/Asporto", "Articolo", "Quantità/Peso", "Prezzo articolo (€)", "Note modifiche", "Totale ordine (€)"]];
  tutti.forEach(o => {
    const d = o.createdAt?.toDate ? o.createdAt.toDate() : null;
    const dataStr = d ? d.toLocaleDateString("it-IT") : "";
    const oraStr = d ? d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "";
    const totale = (o.items || []).reduce((s, it) => s + it.lineTotal, 0);
    (o.items || []).forEach(item => {
      const mods = buildMods(item).join(" · ");
      righeCsv.push([dataStr, oraStr, o.tableLabel || o.table, item.name, String(item.qty) + (item.unit && item.unit !== "pezzo" ? " " + item.unit : ""), item.lineTotal.toFixed(2), mods, totale.toFixed(2)]);
    });
  });
  const csv = righeCsv.map(riga => riga.map(campo => '"' + String(campo).replace(/"/g, '""') + '"').join(",")).join("\r\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "archivio-ordini-" + new Date().toISOString().slice(0, 10) + ".csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
});

// ====================================================================
// AVVIO
// ====================================================================
initListeners();
ripristinaStatoNav();

// ---------- ALLARME ASPORTO IN RITARDO (tipo sveglia, con STOP) ----------
function ordiniInAllarme() {
  return state.orders.filter(o => !o.archived && isOrdineInRitardo(o) && !acknowledgedOverdueIds.has(o.id));
}
function aggiornaBannerAllarme() {
  const inAllarme = ordiniInAllarme();
  const banner = $("#allarme-asporto-banner");
  if (inAllarme.length === 0) { banner.classList.add("hidden"); return; }
  banner.classList.remove("hidden");
  $("#allarme-asporto-testo").textContent = inAllarme.length === 1
    ? "⏰ IN RITARDO: " + (inAllarme[0].tableLabel || inAllarme[0].table)
    : "⏰ " + inAllarme.length + " ordini asporto in ritardo";
}
$("#btn-stop-allarme").addEventListener("click", () => {
  ordiniInAllarme().forEach(o => acknowledgedOverdueIds.add(o.id));
  aggiornaBannerAllarme();
});

// Controllo periodico (ogni 15s): aggiorna banner e le viste con l'orario/ritardo,
// e ripulisce gli "acknowledged" per ordini non più in ritardo (es. segnati pronto).
setInterval(() => {
  state.orders.forEach(o => {
    if (o.archived || !isOrdineInRitardo(o)) acknowledgedOverdueIds.delete(o.id);
  });
  aggiornaBannerAllarme();
  if (!$("#cameriere-asporto").classList.contains("hidden")) renderAsportoList();
  if ($("#view-cucina").classList.contains("active")) renderCucina();
  if ($("#view-bar").classList.contains("active")) renderBar();
}, 15000);

// Suono dell'allarme: si ripete finché c'è almeno un ordine in ritardo non "fermato"
setInterval(() => {
  aggiornaBannerAllarme();
  if (ordiniInAllarme().length > 0) playAlarmTone();
}, 2000);

// Registrazione service worker (per installazione PWA su Home)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}
