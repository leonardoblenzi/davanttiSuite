// ml/public/js/ml-base.js
(() => {
  // Base real onde o app está montado
  // - suite:   /ml/login -> base "/ml"
  // - local:   /login    -> base ""
  const p = window.location.pathname || "/";
  const base = p.startsWith("/ml/") || p === "/ml" ? "/ml" : "";

  window.ML_BASE = base;

  window.mlUrl = function mlUrl(path) {
    // garante "/"
    if (!path) return base || "/";
    if (path.startsWith("http")) return path;
    if (!path.startsWith("/")) path = "/" + path;

    // ✅ Evita duplicar o prefixo quando alguém já passou /ml/...
    // Ex.: mlUrl('/ml/select-conta') em ambiente SUITE -> mantém como está.
    if (base && (path === base || path.startsWith(base + "/"))) return path;

    return base + path;
  };
})();
