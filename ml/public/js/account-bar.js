// public/js/accountBar.js
// OAuth-only: mostra a conta atual na navbar usando /api/account/current.
// Se não houver conta e não estiver em /select-conta, redireciona pra seleção.

window.AccountBar = (function () {
  let _loaded = false;

  function pickAccountPayload(j = {}) {
    // esperado: { accountType:'oauth', accountKey:'123', label:'...' }
    const key = j.accountKey || (j.current && j.current.id) || null;
    const label = j.label || (j.current && j.current.label) || "";
    return { key, label };
  }

  async function load() {
    if (_loaded && window.__ACCOUNT__) return window.__ACCOUNT__;

    const lbl = document.querySelector("[data-account-label]");
    const btn = document.querySelector("[data-account-switch]");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const r = await fetch("/ml/api/account/current", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const ct = String(r.headers.get("content-type") || "");
      if (!ct.includes("application/json")) {
        if (lbl) lbl.textContent = "indisponível";
        return null;
      }

      const j = await r.json().catch(() => ({}));
      const acc = pickAccountPayload(j);

      if (acc.key) {
        if (lbl) lbl.textContent = acc.label || "Conta selecionada";
        window.__ACCOUNT__ = {
          key: String(acc.key),
          label: String(acc.label || "").trim() || "Conta selecionada",
        };
      } else {
        const base = (window.mlBase && window.mlBase.basePath) || "";
        const goSelect = (base ? base : "") + "/select-conta";
        const isSelect = location.pathname === goSelect;
        const isAdmin = location.pathname.startsWith(
          (base ? base : "") + "/admin",
        );

        if (lbl) lbl.textContent = "Não selecionada";

        // Só força ir pra seleção se NÃO for página admin
        if (!isSelect && !isAdmin) location.replace(goSelect);

        // botão "trocar conta" deve sempre apontar pro lugar certo
        if (btn) btn.href = goSelect;
      }
    } catch (e) {
      clearTimeout(timeoutId);
      if (lbl)
        lbl.textContent = e?.name === "AbortError" ? "tempo esgotado" : "erro";
      // em erro, não redireciona automaticamente pra evitar loop off-line
      return null;
    }

    if (btn) {
      btn.addEventListener(
        "click",
        () => {
          if (location.pathname !== "/select-conta")
            window.location.href = "/ml/select-conta";
        },
        { once: true },
      );
    }

    _loaded = true;
    return window.__ACCOUNT__;
  }

  async function ensure() {
    if (!window.__ACCOUNT__) return await load();
    return window.__ACCOUNT__;
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!_loaded) load();
  });

  return { load, ensure };
})();
