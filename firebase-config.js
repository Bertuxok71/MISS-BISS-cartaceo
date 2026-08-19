// Configurazione Firebase — PROGETTO DI PROVA (miss-biss-scimmie-634ca)
// Database separato da quello vero: qui puoi fare tutte le prove che vuoi
// senza rischiare di toccare gli ordini reali della pizzeria.
const firebaseConfig = {
  apiKey: "AIzaSyD0xzfjuXH4flmSUHpTDqnoTblE-6YBrQQ",
  authDomain: "miss-biss-scimmie-634ca.firebaseapp.com",
  projectId: "miss-biss-scimmie-634ca",
  storageBucket: "miss-biss-scimmie-634ca.firebasestorage.app",
  messagingSenderId: "265183424136",
  appId: "1:265183424136:web:6e3dfe40041211998a393d"
};
 
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
 