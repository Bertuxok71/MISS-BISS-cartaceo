# Ordini Pizzeria — guida all'attivazione

Questa è l'app per prendere gli ordini in sala e mandarli in cucina in
tempo reale, con conto per tavolo, note, e ingredienti personalizzabili.
Segui questi passaggi in ordine: sono pensati per chi non è informatico.

## 1. Crea il progetto Firebase (gratuito)

1. Vai su **firebase.google.com** e accedi con un account Google.
2. Clicca **"Vai alla console"** → **"Aggiungi progetto"**.
3. Dai un nome (es. "pizzeria-ordini") e crealo (puoi disattivare Google
   Analytics, non serve).
4. Dentro il progetto, clicca l'icona **⚙️ → Impostazioni progetto**.
5. Scorri fino a **"Le tue app"** → clicca l'icona **`</>`** (app web).
6. Dai un nome all'app (es. "ordini-pizzeria-web") → **"Registra app"**.
7. Ti apparirà un blocco di codice con `apiKey`, `authDomain`, ecc.
   **Copia quei valori** e incollali nel file `firebase-config.js`
   (sostituendo le scritte "INCOLLA_QUI...").

## 2. Attiva il database (Firestore)

1. Nel menu a sinistra della console Firebase, clicca **"Firestore Database"**.
2. Clicca **"Crea database"**.
3. Scegli **"Avvia in modalità di produzione"** → scegli una regione
   vicina (es. `europe-west`) → **"Abilita"**.
4. Vai sulla scheda **"Regole"** in alto e sostituisci il contenuto con:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

   Poi clicca **"Pubblica"**.

   ⚠️ Nota: questa regola rende il database aperto a chiunque abbia il
   link dell'app — va benissimo per un uso interno come il tuo (nessun
   dato sensibile di clienti), ma non condividere il link pubblicamente.

## 3. Carica i file online (hosting gratuito con Netlify)

1. Vai su **netlify.com** e registrati (anche con Google).
2. Nella pagina principale, cerca l'area che dice qualcosa come
   **"Trascina qui la tua cartella"** (drag & drop del sito).
3. Trascina l'intera cartella `pizzeria-app` (quella con dentro
   `index.html`, `app.js`, ecc.) in quell'area.
4. Dopo qualche secondo Netlify ti darà un link tipo
   `https://nome-a-caso-123.netlify.app` — quello è il link della tua app.
   (Puoi anche rinominarlo da "Site settings" per renderlo più semplice
   da ricordare.)

## 4. Installa l'app su ogni iPhone/iPad

1. Apri il link Netlify con **Safari** (non Chrome: su iPhone/iPad solo
   Safari permette di installare come app).
2. Tocca il pulsante **Condividi** (il quadrato con la freccia in su).
3. Scorri e tocca **"Aggiungi a Home"**.
4. Comparirà un'icona come una vera app: quella userai tutti i giorni.

Ripeti su tutti i telefoni dei camerieri e sull'iPad in cucina — puntano
tutti allo stesso link, quindi si sincronizzano automaticamente tra loro.

## 5. Primo utilizzo — importa il tuo menù già pronto

Il tuo menù reale (dalle foto che hai mandato) è già digitalizzato nel
file `seed-data.js`: 7 categorie, 96 piatti/voci e 60 ingredienti.
Per caricarlo tutto in un colpo solo, invece di inserirlo a mano:

1. Apri (sempre da Safari, sullo stesso link Netlify) la pagina
   **`import.html`**, ad esempio `https://tuosito.netlify.app/import.html`.
2. Tocca **"Importa il menù ora"** e conferma.
3. Aspetta il messaggio "Fatto!" — a quel punto il menù è già dentro
   l'app, categorie comprese.
4. **Importante**: alcuni prezzi nelle foto non erano leggibili con
   certezza o erano scritti in modo ambiguo (es. "1,00/2,00" senza
   specificare a cosa si riferisse la doppia cifra). Questi sono stati
   segnati nel nome con la scritta **"DA CONFERMARE"** o **"PREZZO DA
   INSERIRE"**. Vai in **Impostazioni → Ingredienti** e correggili prima
   di usare l'app con i clienti — altrimenti il conto potrebbe risultare
   sbagliato.
5. Puoi usare `import.html` una sola volta: se lo riapri e lo rilanci,
   sovrascrive con gli stessi dati (utile solo se hai fatto un
   disastro e vuoi ripartire da zero con il menù originale).

Se invece preferisci partire da un menù vuoto e inserire tutto a mano:

1. Apri l'app → **Impostazioni** (PIN di default: **1234**).
2. Vai su **Categorie** → crea le tue categorie.
3. Vai su **Ingredienti** → aggiungi gli ingredienti con il relativo
   sovrapprezzo se aggiunti come extra.
4. Vai su **Piatti** → crea ogni piatto: nome, categoria, prezzo, e se è
   "componibile" seleziona quali ingredienti si possono togliere/aggiungere.
5. Vai su **Tavoli** → imposta quanti tavoli hai in sala.

Da questo momento puoi prendere ordini da **Sala**, seguirli da
**Cucina**, e modificare il menù quando vuoi da **Impostazioni** — senza
mai dover toccare il codice.

## Cambiare il PIN delle impostazioni

Il PIN è scritto nel database, non nel codice. Per cambiarlo: Firestore
Database → collezione `settings` → documento `general` → modifica il
campo `pin`.

## Se qualcosa non funziona

- **"Connessione in corso…" resta fisso**: controlla di aver incollato
  correttamente i valori in `firebase-config.js`.
- **Le modifiche non si vedono su un altro telefono**: verifica che
  tutti i dispositivi usino lo stesso link Netlify e abbiano connessione
  internet (l'app non funziona offline, serve sempre internet per la
  sincronizzazione).
- **Voglio cambiare il nome/icona dell'app**: modifica `manifest.json`
  e sostituisci `icon-192.png`/`icon-512.png` con le tue immagini
  (stesse dimensioni).
