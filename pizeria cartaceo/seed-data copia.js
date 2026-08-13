// ====================================================================
// SEED DATA — menù reale della pizzeria (da foto caricate il 23/07/2026)
// ====================================================================
// Questo file contiene i dati da caricare UNA VOLTA SOLA in Firestore
// tramite import.html. Dopo l'importazione puoi modificare tutto da
// Impostazioni, questo file non serve più (puoi anche cancellarlo).
//
// ATTENZIONE — alcuni prezzi nelle foto non erano leggibili con
// certezza al 100% o erano ambigui. Sono segnalati con il commento
// "DA CONFERMARE": vai in Impostazioni dopo l'importazione e controllali
// prima di usare l'app con i clienti.
// ====================================================================

const SEED_CATEGORIES = [
  { id: "cat_pizze_classiche", name: "Pizze Classiche", reparto: "cucina" },
  { id: "cat_pizze_speciali", name: "Pizze Speciali", reparto: "cucina" },
  { id: "cat_oltre_la_pizza", name: "Oltre la pizza", reparto: "cucina" },
  { id: "cat_insalatone", name: "Insalatone", reparto: "cucina" },
  { id: "cat_bevande", name: "Bevande", reparto: "bar" },
  { id: "cat_caffetteria", name: "Caffetteria", reparto: "bar" },
  { id: "cat_dolci", name: "Dolci", reparto: "bar" },
];

// ---- Ingredienti "di ricetta" (removibili, nessun sovrapprezzo se tolti) ----
const RECIPE_INGREDIENTS = [
  "Pomodoro", "Mozzarella", "Aglio", "Origano", "Prosciutto cotto", "Carciofi",
  "Funghi", "Salame piccante", "Prosciutto crudo", "Cipolle", "Acciughe",
  "Capperi", "Asparagi", "Zucchine", "Melanzane", "Funghi porcini", "Gorgonzola",
  "Nostrano di Bovegno", "Gamberetti", "Frutti di mare", "Calamari",
  "Pomodoro fresco", "Mozzarella di bufala", "Tonno", "Wurstel",
  "Patatine fritte", "Uovo", "Radicchio", "Scamorza", "Burrata", "Pomodorini",
  "Salsiccia", "Formagella nostrana", "Pancetta", "Speck", "Rucola", "Grana",
  "Bresaola", "Brie", "Insalata verde", "Fagioli", "Mais", "Pollo croccante",
];

// ---- Ingredienti "extra" (con sovrapprezzo se aggiunti) ----
const EXTRA_INGREDIENTS = [
  { name: "Ingrediente aggiuntivo (piccolo) — DA CONFERMARE quale", price: 2.00 },
  { name: "Ingrediente aggiuntivo (grande) — DA CONFERMARE quale", price: 3.00 },
  { name: "Gamberetti extra (porzione piccola)", price: 1.00 },
  { name: "Gamberetti extra (porzione grande)", price: 2.00 },
  { name: "Olive verdi (porzione piccola)", price: 1.00 },
  { name: "Olive verdi (porzione grande)", price: 2.00 },
  { name: "Olive nere con nocciolo (porzione piccola)", price: 1.00 },
  { name: "Olive nere con nocciolo (porzione grande)", price: 2.00 },
  { name: "Rucola (aggiunta) — PREZZO DA INSERIRE", price: 0 },
  { name: "Radicchio (aggiunta) — PREZZO DA INSERIRE", price: 0 },
  { name: "Carciofi (aggiunta) — PREZZO DA INSERIRE", price: 0 },
  { name: "Zucchine grigliate (aggiunta) — PREZZO DA INSERIRE", price: 0 },
  { name: "Melanzane grigliate (aggiunta) — PREZZO DA INSERIRE", price: 0 },
  { name: "Salse ketchup/maionese", price: 0.50 },
];

// ---- Varianti (modifiche al piatto stesso, con un proprio prezzo — NON sono ingredienti fisici) ----
const VARIANTI_LIST = [
  { name: "Impasto doppio (doppia pasta)", price: 2.50 },
  { name: "Senza glutine", price: 3.00 },
  { name: "Mozzarella senza lattosio", price: 1.50 },
];

function slug(name) {
  return "ing_" + name.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
function slugVar(name) {
  return "var_" + name.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

const SEED_INGREDIENTS = [
  ...RECIPE_INGREDIENTS.map(name => ({ id: slug(name), name, price: 0 })),
  ...EXTRA_INGREDIENTS.map(e => ({ id: slug(e.name), name: e.name, price: e.price })),
];

const SEED_VARIANTI = VARIANTI_LIST.map(v => ({ id: slugVar(v.name), name: v.name, price: v.price }));

function ids(names) { return names.map(n => slug(n)); }
function idsVar(names) { return names.map(n => slugVar(n)); }

// Extra generici applicabili a tutte le pizze (ingredienti fisici non meglio specificati)
const PIZZA_EXTRAS = ids([
  "Ingrediente aggiuntivo (piccolo) — DA CONFERMARE quale",
  "Ingrediente aggiuntivo (grande) — DA CONFERMARE quale",
]);

// Varianti applicabili a tutte le pizze
const PIZZA_VARIANTI = idsVar([
  "Impasto doppio (doppia pasta)",
  "Senza glutine",
  "Mozzarella senza lattosio",
]);

const INSALATA_EXTRAS = ids([
  "Gamberetti extra (porzione piccola)", "Gamberetti extra (porzione grande)",
  "Olive verdi (porzione piccola)", "Olive verdi (porzione grande)",
  "Olive nere con nocciolo (porzione piccola)", "Olive nere con nocciolo (porzione grande)",
  "Rucola (aggiunta) — PREZZO DA INSERIRE", "Radicchio (aggiunta) — PREZZO DA INSERIRE",
  "Carciofi (aggiunta) — PREZZO DA INSERIRE", "Zucchine grigliate (aggiunta) — PREZZO DA INSERIRE",
  "Melanzane grigliate (aggiunta) — PREZZO DA INSERIRE",
]);

const SEED_DISHES = [
  // ---------------- PIZZE CLASSICHE ----------------
  d("Margherita", "cat_pizze_classiche", 6.50, ["Pomodoro", "Mozzarella"]),
  d("Marinara", "cat_pizze_classiche", 5.00, ["Pomodoro", "Aglio", "Origano"]),
  d("Capricciosa", "cat_pizze_classiche", 9.50, ["Pomodoro", "Mozzarella", "Prosciutto cotto", "Carciofi", "Funghi"]),
  d("Prosciutto e Funghi", "cat_pizze_classiche", 9.00, ["Pomodoro", "Mozzarella", "Prosciutto cotto", "Funghi"]),
  d("Prosciutto", "cat_pizze_classiche", 8.50, ["Pomodoro", "Mozzarella", "Prosciutto cotto"]),
  d("Salame Piccante", "cat_pizze_classiche", 8.50, ["Pomodoro", "Mozzarella", "Salame piccante"]),
  d("Crudo", "cat_pizze_classiche", 10.00, ["Pomodoro", "Mozzarella", "Prosciutto crudo"]),
  d("Pugliese", "cat_pizze_classiche", 8.00, ["Pomodoro", "Mozzarella", "Cipolle"]),
  d("Napoletana", "cat_pizze_classiche", 8.00, ["Pomodoro", "Mozzarella", "Acciughe"]),
  d("Romana", "cat_pizze_classiche", 8.50, ["Pomodoro", "Mozzarella", "Acciughe", "Capperi"]),
  d("Verdure", "cat_pizze_classiche", 9.50, ["Pomodoro", "Mozzarella", "Asparagi", "Zucchine", "Melanzane", "Carciofi"]),
  d("Porcini", "cat_pizze_classiche", 10.00, ["Pomodoro", "Mozzarella", "Funghi porcini"]),
  d("Gorgonzola", "cat_pizze_classiche", 8.50, ["Pomodoro", "Mozzarella", "Gorgonzola"]),
  d("Ai Formaggi", "cat_pizze_classiche", 10.00, ["Pomodoro", "Mozzarella", "Nostrano di Bovegno", "Gorgonzola"]),
  d("Nostrano di Bovegno e Porcini", "cat_pizze_classiche", 12.00, ["Pomodoro", "Mozzarella", "Nostrano di Bovegno", "Funghi porcini"]),
  d("Gamberetti e Zucchine", "cat_pizze_classiche", 10.00, ["Pomodoro", "Mozzarella", "Gamberetti", "Zucchine"]),
  d("Frutti di Mare", "cat_pizze_classiche", 12.00, ["Pomodoro", "Mozzarella", "Frutti di mare"]),
  d("Calamari", "cat_pizze_classiche", 13.00, ["Pomodoro", "Mozzarella", "Calamari"]),
  d("Calzone Farcito", "cat_pizze_classiche", 10.00, ["Pomodoro", "Mozzarella", "Prosciutto cotto", "Funghi", "Carciofi"]),
  d("Pomodoro Fresco e Bufala", "cat_pizze_classiche", 9.50, ["Pomodoro", "Mozzarella", "Pomodoro fresco", "Mozzarella di bufala"]),
  d("Bufalina", "cat_pizze_classiche", 8.50, ["Pomodoro", "Mozzarella", "Mozzarella di bufala"]),

  // ---------------- PIZZE SPECIALI ----------------
  d("Tonno", "cat_pizze_speciali", 8.00, ["Pomodoro", "Mozzarella", "Tonno"]),
  d("Tonno e Cipolla", "cat_pizze_speciali", 9.00, ["Pomodoro", "Mozzarella", "Tonno", "Cipolle"]),
  d("Wurstel", "cat_pizze_speciali", 8.00, ["Pomodoro", "Mozzarella", "Wurstel"]),
  d("Wurstel e Patatine", "cat_pizze_speciali", 9.00, ["Pomodoro", "Mozzarella", "Wurstel", "Patatine fritte"]),
  d("Asparagi e Uovo", "cat_pizze_speciali", 9.50, ["Pomodoro", "Mozzarella", "Asparagi", "Uovo"]),
  d("Radicchio e Gorgonzola", "cat_pizze_speciali", 9.50, ["Pomodoro", "Mozzarella", "Radicchio", "Gorgonzola"]),
  d("Scamorza e Radicchio", "cat_pizze_speciali", 9.50, ["Pomodoro", "Mozzarella", "Scamorza", "Radicchio"]),
  d("Burrata, Crudo, Pomodorini", "cat_pizze_speciali", 13.00, ["Pomodoro", "Mozzarella", "Burrata", "Prosciutto crudo", "Pomodorini"]),
  d("Nostrano di Bovegno e Radicchio", "cat_pizze_speciali", 12.00, ["Pomodoro", "Mozzarella", "Nostrano di Bovegno", "Radicchio"]),
  d("Nostrano di Bovegno, Salsiccia, Porcini", "cat_pizze_speciali", 13.00, ["Pomodoro", "Mozzarella", "Nostrano di Bovegno", "Salsiccia", "Funghi porcini"]),
  d("Formagella Nostrana, Pancetta, Funghi", "cat_pizze_speciali", 13.00, ["Pomodoro", "Mozzarella", "Formagella nostrana", "Pancetta", "Funghi"]),
  d("Crudo, Bufala e Pomodorini", "cat_pizze_speciali", 13.00, ["Pomodoro", "Mozzarella", "Mozzarella di bufala", "Prosciutto crudo", "Pomodorini"]),
  d("Gorgo, Zucchine, Speck", "cat_pizze_speciali", 13.00, ["Pomodoro", "Mozzarella", "Gorgonzola", "Zucchine", "Speck"]),
  d("Gorgo, Cipolle, Acciughe", "cat_pizze_speciali", 10.00, ["Pomodoro", "Mozzarella", "Gorgonzola", "Cipolle", "Acciughe"]),
  d("Miss Biss", "cat_pizze_speciali", 9.50, ["Pomodoro", "Mozzarella", "Pancetta", "Cipolle"]),
  d("Mucca", "cat_pizze_speciali", 10.00, ["Mozzarella", "Mozzarella di bufala", "Pomodorini", "Rucola"]),
  d("Porcini, Pancetta e Grana", "cat_pizze_speciali", 13.00, ["Pomodoro", "Mozzarella", "Pancetta", "Grana", "Funghi porcini"]),
  d("Bresaola, Rucola e Grana", "cat_pizze_speciali", 13.00, ["Pomodoro", "Mozzarella", "Bresaola", "Rucola", "Grana"]),
  d("Carciofi, Speck, Brie", "cat_pizze_speciali", 13.00, ["Pomodoro", "Mozzarella", "Carciofi", "Speck", "Brie"]),

  // ---------------- OLTRE LA PIZZA (non componibili) ----------------
  s("Caprese", "cat_oltre_la_pizza", 8.00),
  s("Piatto di Burrata e Crudo (con focaccia)", "cat_oltre_la_pizza", 12.00),
  s("Formaggio Fuso", "cat_oltre_la_pizza", 5.00),
  peso("Costata (~500gr)", "cat_oltre_la_pizza", 0.45, "dag"),
  s("Patatine Fritte", "cat_oltre_la_pizza", 5.00),
  s("Fritto Misto", "cat_oltre_la_pizza", 16.00),
  s("Calamari Fritti", "cat_oltre_la_pizza", 15.00),
  s("Bocconcini di Pollo con Patatine (5 pz)", "cat_oltre_la_pizza", 8.00),
  s("Bocconcini di Pollo con Patatine (10 pz)", "cat_oltre_la_pizza", 13.00),
  s("Cotoletta di Pollo con Patatine", "cat_oltre_la_pizza", 9.00),
  s("Crudo e Melone (in stagione)", "cat_oltre_la_pizza", 10.00),

  // ---------------- INSALATONE ----------------
  d2("La Solita", "cat_insalatone", 8.00, ["Insalata verde", "Pomodorini", "Tonno", "Mozzarella"]),
  d2("Fagiolata Mex", "cat_insalatone", 9.00, ["Insalata verde", "Fagioli", "Tonno", "Cipolle", "Mais"]),
  d2("La Golosa", "cat_insalatone", 14.00, ["Insalata verde", "Pomodorini", "Mais", "Grana", "Pollo croccante", "Burrata"]),

  // ---------------- BEVANDE ----------------
  s("Bionda Moretti piccola (spina)", "cat_bevande", 3.00),
  s("Bionda Moretti media (spina)", "cat_bevande", 5.00),
  s("Rossa Moretti piccola (spina)", "cat_bevande", 3.50),
  s("Rossa Moretti media (spina)", "cat_bevande", 6.00),
  s("Weiss / Franziskaner / Paulaner (50cl)", "cat_bevande", 5.00),
  s("Ceres", "cat_bevande", 4.50),
  s("Leffe Ambrata/Rossa (75cl)", "cat_bevande", 9.00),
  s("Ichnusa non filtrata (50cl)", "cat_bevande", 5.00),
  s("Birra senza glutine", "cat_bevande", 4.00),
  s("Birra analcolica (33cl)", "cat_bevande", 4.00),
  s("Birra analcolica (66cl)", "cat_bevande", 5.50),
  s("Birra artigianale", "cat_bevande", 6.00),
  s("Prosecco / Spumante (75cl)", "cat_bevande", 15.00),
  s("Ferrari (75cl)", "cat_bevande", 25.00),
  s("Berlucchi (75cl)", "cat_bevande", 25.00),
  s("Acqua 50cl", "cat_bevande", 1.50),
  s("Acqua 70cl", "cat_bevande", 2.50),
  s("Bibita in lattina/bottiglia (33cl)", "cat_bevande", 3.00),
  s("Coca Cola grande (1lt)", "cat_bevande", 7.50),
  s("Vino bianco alla spina (1lt)", "cat_bevande", 12.00),
  s("Amaro / Limoncello / Grappa", "cat_bevande", 3.50),
  s("Whisky", "cat_bevande", 4.50),

  // ---------------- CAFFETTERIA ----------------
  s("Caffè", "cat_caffetteria", 1.50),
  s("Caffè corretto", "cat_caffetteria", 2.50),
  s("Decaffeinato", "cat_caffetteria", 2.00),
  s("Caffè d'orzo", "cat_caffetteria", 2.00),
  s("Caffè al ginseng", "cat_caffetteria", 2.50),
  s("Tea / Tisane", "cat_caffetteria", 2.00),
  s("Servizio per vostra torta", "cat_caffetteria", 8.00),
  s("Coperto e servizio", "cat_caffetteria", 2.00),

  // ---------------- DOLCI ----------------
  s("Babà al rhum", "cat_dolci", 6.00),
  s("Mango e Passion Fruit", "cat_dolci", 6.00),
  s("Panna Cotta km0 Cascina Cadenei", "cat_dolci", 3.50),
  s("Cheesecake ai Frutti di Bosco", "cat_dolci", 6.00),
  s("Tortino al Cioccolato Fondente con Cuore Caldo", "cat_dolci", 6.00),
  s("Torta Sacher", "cat_dolci", 6.00),
  s("Crema Catalana", "cat_dolci", 6.00),
  s("Tartufo Bianco / Nero", "cat_dolci", 5.00),
  s("Coppa di Gelato", "cat_dolci", 5.00),
  s("Tiramisù", "cat_dolci", 5.00),
  s("Meringata", "cat_dolci", 5.00),
  s("Sorbetto al Limone", "cat_dolci", 3.50),
];

// ---- helper per costruire i piatti ----
// d()  = pizza classica/speciale: componibile, ingredienti removibili + extra generici pizza
// d2() = insalatone: componibile, ingredienti removibili + extra insalatone
// s()  = piatto semplice: non componibile

function d(name, categoryId, price, recipeIngredientNames) {
  return {
    id: "dish_" + slug(name).replace("ing_", ""),
    name, categoryId, price,
    componibile: true,
    removableIds: ids(recipeIngredientNames),
    extraIds: PIZZA_EXTRAS,
    variantIds: PIZZA_VARIANTI,
    glutenFree: false,
    lactoseFree: false,
  };
}

function d2(name, categoryId, price, recipeIngredientNames) {
  return {
    id: "dish_" + slug(name).replace("ing_", ""),
    name, categoryId, price,
    componibile: true,
    removableIds: ids(recipeIngredientNames),
    extraIds: INSALATA_EXTRAS,
    variantIds: [],
    glutenFree: false,
    lactoseFree: false,
  };
}

function s(name, categoryId, price) {
  return {
    id: "dish_" + slug(name).replace("ing_", ""),
    name, categoryId, price,
    componibile: false,
    removableIds: [],
    extraIds: [],
    variantIds: [],
    glutenFree: false,
    lactoseFree: false,
  };
}

// piatto a prezzo di peso (es. carne/pesce venduti a decagrammo): componibile,
// così puoi selezionare in Impostazioni quali contorni offrire come extra
function peso(name, categoryId, pricePerUnit, unit) {
  return {
    id: "dish_" + slug(name).replace("ing_", ""),
    name, categoryId, price: pricePerUnit, unit,
    componibile: true,
    removableIds: [],
    extraIds: [],
    variantIds: [],
    glutenFree: false,
    lactoseFree: false,
  };
}
