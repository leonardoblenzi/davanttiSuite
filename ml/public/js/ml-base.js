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
    return base + path;
  };
})();
