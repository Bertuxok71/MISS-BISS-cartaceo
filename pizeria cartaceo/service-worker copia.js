// Service worker minimo: non serve funzionare offline (l'app ha bisogno
// di internet per sincronizzare gli ordini), basta che esista perché
// Safari/iOS permetta l'installazione sulla schermata Home.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", () => self.clients.claim());
self.addEventListener("fetch", () => {});
