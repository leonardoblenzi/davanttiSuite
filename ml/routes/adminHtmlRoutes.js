"use strict";

const express = require("express");
const path = require("path");

const router = express.Router();

function noCache(_req, res, next) {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  });
  next();
}

function normalizeNivel(n) {
  return String(n || "").trim().toLowerCase();
}

function truthy(v) {
  return v === true || v === 1 || v === "1" || v === "true";
}

function isMaster(req, res) {
  const u = req.user || res.locals?.user || {};
  const nivel = normalizeNivel(u?.nivel);
  const role = normalizeNivel(u?.role);
  return (
    nivel === "admin_master" ||
    role === "admin_master" ||
    truthy(u?.is_master) ||
    truthy(u?.isMaster) ||
    truthy(u?.flags?.is_master)
  );
}

function wantsHtml(req) {
  const accept = String(req.headers?.accept || "").toLowerCase();
  return accept.includes("text/html") || accept.includes("application/xhtml+xml");
}

function ensureMasterHtml(req, res, next) {
  if (isMaster(req, res)) return next();

  // ✅ Para páginas HTML, melhor experiência: manda para /nao-autorizado
  if (wantsHtml(req) && req.method === "GET") {
    const base = String(req.baseUrl || "");
    return res.redirect(base + "/nao-autorizado");
  }

  return res.status(403).json({ ok: false, error: "Acesso não autorizado." });
}

function sendView(viewFile) {
  return (_req, res) => {
    return res.sendFile(path.join(__dirname, "..", "views", viewFile));
  };
}

// ✅ Painel Admin (páginas)
router.get(
  "/admin/usuarios",
  noCache,
  ensureMasterHtml,
  sendView("admin-usuarios.html"),
);
router.get(
  "/admin/empresas",
  noCache,
  ensureMasterHtml,
  sendView("admin-empresas.html"),
);
router.get(
  "/admin/vinculos",
  noCache,
  ensureMasterHtml,
  sendView("admin-vinculos.html"),
);

// Contas/Tokens ML (rota canônica)
router.get(
  "/admin/meli-contas",
  noCache,
  ensureMasterHtml,
  sendView("admin-meli-contas.html"),
);
router.get(
  "/admin/meli-tokens",
  noCache,
  ensureMasterHtml,
  sendView("admin-meli-tokens.html"),
);

// ✅ ALIASES (compat com o menu antigo)
// Alguns HTMLs apontam para /admin/contas-ml e /admin/tokens-ml
router.get(
  "/admin/contas-ml",
  noCache,
  ensureMasterHtml,
  sendView("admin-meli-contas.html"),
);
router.get(
  "/admin/tokens-ml",
  noCache,
  ensureMasterHtml,
  sendView("admin-meli-tokens.html"),
);

router.get(
  "/admin/oauth-states",
  noCache,
  ensureMasterHtml,
  sendView("admin-oauth-states.html"),
);
router.get(
  "/admin/migracoes",
  noCache,
  ensureMasterHtml,
  sendView("admin-migracoes.html"),
);
router.get(
  "/admin/backup",
  noCache,
  ensureMasterHtml,
  sendView("admin-backup.html"),
);

module.exports = router;
