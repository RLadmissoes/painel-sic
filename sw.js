// Guarda o app no tablet para abrir sem internet.
// Ao mudar qualquer arquivo do app, aumente o número da versão abaixo.
const VERSAO = "painel-sic-v1";
const ARQUIVOS = ["./", "index.html", "config.js", "manifest.webmanifest", "icon-192.png", "icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // Arquivos do próprio app: tenta a internet primeiro (pega atualizações), senão usa a cópia salva.
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(e.request)
        .then(r => { const copia = r.clone(); caches.open(VERSAO).then(c => c.put(e.request, copia)); return r; })
        .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("index.html")))
    );
    return;
  }

  // Fontes do Google: usa a cópia salva quando existir.
  if (url.host === "fonts.googleapis.com" || url.host === "fonts.gstatic.com") {
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
        const copia = resp.clone(); caches.open(VERSAO).then(c => c.put(e.request, copia)); return resp;
      }))
    );
  }
  // Google Drive e login: sempre direto pela internet (não passa por aqui).
});
