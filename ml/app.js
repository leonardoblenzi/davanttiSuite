// ml/app.js
"use strict";

const express = require("express");
const path = require("path");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");

// Middlewares próprios
const ensureAccount = require("./middleware/ensureAccount");
const { authMiddleware } = require("./middleware/authMiddleware");
const { ensureAuth } = require("./middleware/ensureAuth");

// Bootstrap MASTER (idempotente)
const { ensureMasterUser } = require("./services/bootstrapMaster");

module.exports = function createMlApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.set("etag", false);

  // ========================
  // Middlewares básicos
  // ========================
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.use(cors());
  app.use(cookieParser());

  // ✅ Static (quando montado na suite em /ml vira /ml/css, /ml/js...)
  app.use(express.static(path.join(__dirname, "public")));

  // ✅ FIX favicon
  app.get("/favicon.ico", (_req, res) => res.status(204).end());

  console.log("🔍 [ML] Carregando módulos...");

  // ==================================================
  // ✅ Bootstrap do MASTER (idempotente)
  // ==================================================
  ensureMasterUser()
    .then(() => console.log("✅ [ML] Bootstrap MASTER ok"))
    .catch((e) =>
      console.error("❌ [ML] Bootstrap MASTER falhou:", e?.message || e),
    );

  // ==================================================
  // Token provider (Curva ABC)
  // ==================================================
  try {
    const { getAccessTokenForAccount } = require("./services/ml-auth");
    app.set("getAccessTokenForAccount", getAccessTokenForAccount);
    console.log("✅ [ML] Token Adapter injetado");
  } catch (_err) {
    console.warn("⚠️ [ML] Não foi possível injetar ml-auth.");
  }

  // ==================================================
  // noCache
  // ==================================================
  function noCache(_req, res, next) {
    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      "Surrogate-Control": "no-store",
    });
    next();
  }

  // ==================================================
  // Helpers baseUrl (suite /ml vs standalone)
  // ==================================================
  function getBase(req) {
    return String(req.baseUrl || "");
  }

  // ==================================================
  // ✅ Auth Routes públicas
  // ==================================================
  try {
    if (!(process.env.ML_JWT_SECRET || process.env.JWT_SECRET)) {
      console.warn("⚠️ [ML] JWT_SECRET não definido.");
    }
    const authRoutes = require("./routes/authRoutes");
    app.use("/api/auth", authRoutes);
    console.log("✅ [ML] AuthRoutes carregado");
  } catch (e) {
    console.error("❌ [ML] Erro ao carregar AuthRoutes:", e.message);
  }

  // ==================================================
  // ✅ Auth Gate (tudo protegido)
  // ==================================================
  function isPublicPath(req) {
    const p = req.path || "";

    // páginas públicas
    if (p === "/login") return true;
    if (p === "/cadastro") return true;
    if (p === "/selecao-plataforma") return true;

    // ✅ acessíveis pós-login sem conta selecionada
    if (p === "/select-conta") return true;
    if (p === "/vincular-conta") return true;

    // auth
    if (p.startsWith("/api/auth")) return true;

    // healthchecks
    if (p === "/healthz") return true;
    if (p.startsWith("/api/system/health")) return true;
    if (p.startsWith("/api/system/stats")) return true;
    if (p.startsWith("/api/health")) return true;

    // assets
    if (
      p.startsWith("/css/") ||
      p.startsWith("/js/") ||
      p.startsWith("/img/") ||
      p.startsWith("/fonts/") ||
      p.startsWith("/vendor/")
    ) {
      return true;
    }

    if (p === "/favicon.ico") return true;
    return false;
  }

  function authGate(req, res, next) {
    if (isPublicPath(req)) return next();
    return ensureAuth(req, res, next);
  }

  app.use(authGate);
  console.log("✅ [ML] AuthGate aplicado");

  // ==================================================
  // ✅ Rotas de páginas PÚBLICAS (HTML)
  // (essas NÃO devem exigir conta selecionada)
  // ==================================================
  app.get("/", noCache, (req, res) => {
    const base = getBase(req);
    if (req.cookies?.auth_token) {
      return ensureAuth(req, res, () => res.redirect(base + "/dashboard"));
    }
    return res.redirect(base + "/selecao-plataforma");
  });

  app.get("/healthz", (_req, res) => {
    res.set("Cache-Control", "no-store");
    return res.status(200).json({ ok: true });
  });

  app.get("/selecao-plataforma", noCache, (_req, res) => {
    return res.sendFile(
      path.join(__dirname, "views", "selecao-plataforma.html"),
    );
  });

  app.get("/login", noCache, (_req, res) => {
    return res.sendFile(path.join(__dirname, "views", "login.html"));
  });

  app.get("/cadastro", noCache, (_req, res) => {
    return res.sendFile(path.join(__dirname, "views", "cadastro.html"));
  });

  app.get("/select-conta", noCache, (_req, res) => {
    return res.sendFile(path.join(__dirname, "views", "select-conta.html"));
  });

  app.get("/vincular-conta", noCache, (_req, res) => {
    return res.sendFile(path.join(__dirname, "views", "vincular-conta.html"));
  });

  app.get("/nao-autorizado", noCache, (_req, res) => {
    return res
      .status(403)
      .sendFile(path.join(__dirname, "views", "nao-autorizado.html"));
  });

  // ==========================================
  // ✅ Middlewares “do ML” (depois do authGate)
  // ==========================================
  try {
    app.use(ensureAccount);
  } catch (e) {
    console.warn("⚠️ [ML] ensureAccount não aplicado:", e?.message || e);
  }

  // ✅ IMPORTANTÍSSIMO: authMiddleware depende das credenciais injetadas por ensureAccount
  // (res.locals.mlCreds). Então ele PRECISA vir DEPOIS do ensureAccount.
  try {
    app.use(authMiddleware);
  } catch (e) {
    console.warn("⚠️ [ML] authMiddleware não aplicado:", e?.message || e);
  }

  // ==========================================
  // ✅ Gate de ADMIN (HTML)
  // (isso resolve: master loga, mas não consegue abrir /admin/*)
  // ==========================================
  const JWT_SECRET = process.env.ML_JWT_SECRET || process.env.JWT_SECRET || "";
  function getUserFromReq(req) {
    if (req.user && req.user.nivel) return req.user;

    const token = req.cookies?.auth_token;
    if (!token || !JWT_SECRET) return null;

    try {
      return jwt.verify(token, JWT_SECRET);
    } catch {
      return null;
    }
  }

  function normalizeNivel(n) {
    return String(n || "")
      .trim()
      .toLowerCase();
  }

  function ensureAdminAnyHtml(req, res, next) {
    const u = getUserFromReq(req);
    if (!u) return res.redirect(getBase(req) + "/login");

    const nivel = normalizeNivel(u.nivel);
    const ok = nivel === "administrador" || nivel === "admin_master";
    if (!ok) return res.redirect(getBase(req) + "/nao-autorizado");

    req.user = { ...u, nivel };
    return next();
  }

  // ==================================================
  // ✅ Rotas HTML PROTEGIDAS (agora passam pelo ensureAccount)
  // ==================================================
  app.get("/dashboard", noCache, (_req, res) => {
    return res.sendFile(path.join(__dirname, "views", "dashboard.html"));
  });

  // ✅ ADMIN HTML (serve teus arquivos admin-*.html)
  app.get("/admin", noCache, ensureAdminAnyHtml, (req, res) => {
    return res.redirect(getBase(req) + "/admin/usuarios");
  });

  app.get("/admin/usuarios", noCache, ensureAdminAnyHtml, (_req, res) => {
    return res.sendFile(path.join(__dirname, "views", "admin-usuarios.html"));
  });

  app.get("/admin/empresas", noCache, ensureAdminAnyHtml, (_req, res) => {
    return res.sendFile(path.join(__dirname, "views", "admin-empresas.html"));
  });

  app.get("/admin/vinculos", noCache, ensureAdminAnyHtml, (_req, res) => {
    return res.sendFile(path.join(__dirname, "views", "admin-vinculos.html"));
  });

  app.get("/admin/meli-contas", noCache, ensureAdminAnyHtml, (_req, res) => {
    return res.sendFile(
      path.join(__dirname, "views", "admin-meli-contas.html"),
    );
  });

  app.get("/admin/meli-tokens", noCache, ensureAdminAnyHtml, (_req, res) => {
    return res.sendFile(
      path.join(__dirname, "views", "admin-meli-tokens.html"),
    );
  });

  app.get("/admin/oauth-states", noCache, ensureAdminAnyHtml, (_req, res) => {
    return res.sendFile(
      path.join(__dirname, "views", "admin-oauth-states.html"),
    );
  });

  app.get("/admin/migracoes", noCache, ensureAdminAnyHtml, (_req, res) => {
    return res.sendFile(path.join(__dirname, "views", "admin-migracoes.html"));
  });

  app.get("/admin/backup", noCache, ensureAdminAnyHtml, (_req, res) => {
    return res.sendFile(path.join(__dirname, "views", "admin-backup.html"));
  });

  // ==========================================
  // ✅ Logout (mantém)
  // ==========================================
  app.post("/api/ml/logout", noCache, (_req, res) => {
    res.clearCookie("auth_token", { path: "/" });
    res.clearCookie("ml_account", { path: "/" });
    res.clearCookie("meli_conta_id", { path: "/" });
    return res.json({ ok: true });
  });

  // ==========================================
  // ✅ ROTAS (plugar módulos)
  // ==========================================
  function safeUse(label, modPath, mountPath = null) {
    try {
      const r = require(modPath);
      if (mountPath) app.use(mountPath, r);
      else app.use(r);
      console.log(`✅ [ML] ${label} carregado`);
    } catch (e) {
      console.warn(`⚠️ [ML] Falhou ao carregar ${label}:`, e.message);
    }
  }

  // páginas/HTML do dashboard etc (se existir)
  safeUse("HtmlRoutes", "./routes/htmlRoutes");

  // routers com mount fixo
  safeUse("accountRoutes", "./routes/accountRoutes", "/api/account");
  safeUse("meliOAuthRoutes", "./routes/meliOAuthRoutes", "/api/meli");
  safeUse("tokenRoutes", "./routes/tokenRoutes", "/api/tokens");
  safeUse("dashboardRoutes", "./routes/dashboardRoutes", "/api/dashboard");

  // demais (mantém)
  safeUse("itemsRoutes", "./routes/itemsRoutes");
  safeUse("editarAnuncioRoutes", "./routes/editarAnuncioRoutes");
  safeUse("excluirAnuncioRoutes", "./routes/excluirAnuncioRoutes");
  safeUse("jardinagemRoutes", "./routes/jardinagemRoutes");
  safeUse("promocoesRoutes", "./routes/promocoesRoutes");
  safeUse("removerPromocaoRoutes", "./routes/removerPromocaoRoutes");
  safeUse("publicidadeRoutes", "./routes/publicidadeRoutes");
  safeUse("estrategicosRoutes", "./routes/estrategicosRoutes");
  safeUse("fullRoutes", "./routes/fullRoutes");
  safeUse("AnaliseAnuncioRoutes", "./routes/AnaliseAnuncioRoutes");
  safeUse("pesquisaDescricaoRoutes", "./routes/pesquisaDescricaoRoutes");
  safeUse("PrazoProducaoRoutes", "./routes/prazoProducaoRoutes");
  safeUse("keywordAnalyticsRoutes", "./routes/keywordAnalyticsRoutes");
  safeUse("ValidarDimensoesRoutes", "./routes/validarDimensoesRoutes");
  safeUse(
    "analytics-filtro-anuncios-routes",
    "./routes/analytics-filtro-anuncios-routes",
  );
  safeUse("analytics-abc-Routes", "./routes/analytics-abc-Routes");

  // Admin APIs
  safeUse("adminUsuariosRoutes", "./routes/adminUsuariosRoutes");
  safeUse("adminEmpresasRoutes", "./routes/adminEmpresasRoutes");
  safeUse("adminVinculosRoutes", "./routes/adminVinculosRoutes");
  safeUse("adminMeliContasRoutes", "./routes/adminMeliContasRoutes");
  safeUse("adminMeliTokensRoutes", "./routes/adminMeliTokensRoutes");
  safeUse("adminOAuthStatesRoutes", "./routes/adminOAuthStatesRoutes");
  safeUse("adminMigracoesRoutes", "./routes/adminMigracoesRoutes");
  safeUse("adminBackupRoutes", "./routes/adminBackupRoutes");

  // ==========================================
  // ERRORS (mantém)
  // ==========================================
  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    console.error("❌ [ML] Erro não tratado:", error);
    res.status(500).json({
      success: false,
      error: "Erro interno do servidor",
      message: error.message,
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
    });
  });

  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: "Rota não encontrada",
      path: req.originalUrl,
      method: req.method,
    });
  });

  return app;
};
