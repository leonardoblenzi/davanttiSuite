// middleware/ensurePermission.js
// ACL simples baseado em `req.user` (injetado pelo ensureAuth/authMiddleware)
//
// ✅ Objetivo:
// - Permitir usar `app.use(ensurePermission)` sem quebrar (middleware padrão)
// - Manter compat com o padrão antigo: `ensurePermission.requireAdmin()` etc.

"use strict";

function normalizeNivel(n) {
  return String(n || "").trim().toLowerCase();
}

function truthy(v) {
  return v === true || v === 1 || v === "1" || v === "true";
}

function isMaster(req) {
  const nivel = normalizeNivel(req.user?.nivel);
  const role = normalizeNivel(req.user?.role);

  return (
    nivel === "admin_master" ||
    role === "admin_master" ||
    truthy(req.user?.is_master) ||
    truthy(req.user?.isMaster) ||
    truthy(req.user?.flags?.is_master)
  );
}

function isAdmin(req) {
  const nivel = normalizeNivel(req.user?.nivel);
  const role = normalizeNivel(req.user?.role);

  return (
    nivel === "administrador" ||
    role === "administrador" ||
    truthy(req.user?.is_admin) ||
    truthy(req.user?.isAdmin) ||
    truthy(req.user?.flags?.is_admin)
  );
}

function ensurePermission(req, res, next) {
  // Middleware padrão: só injeta flags úteis pra views/headers
  const _is_master = isMaster(req);
  const _is_admin = isAdmin(req);
  const _is_admin_any = _is_master || _is_admin;

  res.locals = res.locals || {};
  res.locals.perms = {
    is_master: _is_master,
    is_admin: _is_admin,
    is_admin_any: _is_admin_any,
  };

  return next();
}

function deny(res, status, error) {
  return res.status(status).json({ ok: false, error });
}

ensurePermission.requireAdmin = function requireAdmin() {
  return (req, res, next) => {
    if (isMaster(req) || isAdmin(req)) return next();
    return deny(res, 403, "Não autorizado (admin requerido)");
  };
};

ensurePermission.requireMaster = function requireMaster() {
  return (req, res, next) => {
    if (isMaster(req)) return next();
    return deny(res, 403, "Não autorizado (master requerido)");
  };
};

ensurePermission.isMaster = isMaster;
ensurePermission.isAdmin = isAdmin;
ensurePermission.normalizeNivel = normalizeNivel;

module.exports = ensurePermission;
