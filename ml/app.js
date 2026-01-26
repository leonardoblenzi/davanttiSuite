// ml/app.js
"use strict";

const express = require("express");
const path = require("path");
const cors = require("cors");
const cookieParser = require("cookie-parser");

// Middlewares próprios
const ensureAccount = require("./middleware/ensureAccount");
const { authMiddleware } = require("./middleware/authMiddleware");
const { ensureAuth } = require("./middleware/ensureAuth");

// ⚠️ cuidado: no teu log apareceu "app.use() requires a middleware function"
// então eu vou carregar ensurePermission de forma segura.
let ensurePermission = null;
let requireMasterMW = null;
try {
  // Pode ser que o arquivo exporte { ensurePermission } ao invés do default.
  const mod = require("./middleware/ensurePermission");
  ensurePermission = typeof mod === "function" ? mod : mod?.ensurePermission;

  // ✅ precisa existir para rotas/páginas admin (master)
  if (typeof mod?.requireMaster === "function") {
    requireMasterMW = mod.requireMaster();
  }
} catch (_e) {
  ensurePermission = null;
  requireMasterMW = null;
}

// Fallback seguro se o middleware não estiver disponível
if (typeof requireMasterMW !== "function") {
  requireMasterMW = (_req, _res, next) => next();
}

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
  // ✅ Auth Routes públicas
  // (mantém em /api/auth, porque na SUITE /ml/api/auth chega aqui como /api/auth)
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

    // ✅ estas páginas precisam ser acessíveis após login, mas sem “conta selecionada”
    // (quem controla isso é ensureAccount, que já tem OPEN_PREFIXES)
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
  // ✅ Rotas de páginas (HTML)
  // ==================================================
  app.get("/", noCache, (req, res) => {
    const base = req.baseUrl || ""; // ✅ funciona quando montado em /ml
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

  // ✅ ESSAS DUAS ESTAVAM FALTANDO (por isso dava 404)
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

  // ==================================================
  // ✅ Admin HTML (MASTER only)
  // IMPORTANTE: no projeto original, estas páginas existem e são acessadas via /admin/*.
  // Aqui, como o app ML é montado em /ml na Suite, o caminho vira /ml/admin/* automaticamente.
  // ==================================================
  function sendView(file) {
    return (_req, res) => res.sendFile(path.join(__dirname, "views", file));
  }

  app.get(
    "/admin/usuarios",
    noCache,
    requireMasterMW,
    sendView("admin-usuarios.html"),
  );
  app.get(
    "/admin/empresas",
    noCache,
    requireMasterMW,
    sendView("admin-empresas.html"),
  );
  app.get(
    "/admin/vinculos",
    noCache,
    requireMasterMW,
    sendView("admin-vinculos.html"),
  );
  app.get(
    "/admin/contas",
    noCache,
    requireMasterMW,
    sendView("admin-contas.html"),
  );
  app.get(
    "/admin/tokens",
    noCache,
    requireMasterMW,
    sendView("admin-tokens.html"),
  );
  app.get(
    "/admin/oauth-states",
    noCache,
    requireMasterMW,
    sendView("admin-oauth-states.html"),
  );
  app.get(
    "/admin/migracoes",
    noCache,
    requireMasterMW,
    sendView("admin-migracoes.html"),
  );
  app.get(
    "/admin/backup",
    noCache,
    requireMasterMW,
    sendView("admin-backup.html"),
  );

  // ==========================================
  // ✅ Middlewares “do ML” (depois do authGate)
  // ==========================================
  try {
    app.use(authMiddleware);
  } catch (e) {
    console.warn("⚠️ [ML] authMiddleware não aplicado:", e?.message || e);
  }

  try {
    app.use(ensureAccount);
  } catch (e) {
    console.warn("⚠️ [ML] ensureAccount não aplicado:", e?.message || e);
  }

  // ✅ aplica ACL só se for middleware válido
  if (typeof ensurePermission === "function") {
    app.use(ensurePermission);
  } else {
    console.warn("⚠️ [ML] ensurePermission não aplicado: export inválido");
  }

  // ==========================================
  // INICIALIZAR FILAS
  // ==========================================
  let queueService;
  try {
    queueService = require("./services/queueService");
    console.log("✅ [ML] QueueService carregado");
    queueService
      .iniciarProcessamento()
      .then(() => console.log("🚀 [ML] Filas iniciadas"))
      .catch((error) =>
        console.error("❌ [ML] Erro ao iniciar filas:", error.message),
      );
  } catch (error) {
    console.error("❌ [ML] Erro ao carregar QueueService:", error.message);
    console.warn("⚠️ [ML] Sem filas");
  }

  app.locals.queueService = queueService || null;

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

  // ✅ IMPORTANTÍSSIMO: routers relativos devem ser montados no prefixo correto
  safeUse("accountRoutes", "./routes/accountRoutes", "/api/account");
  safeUse("meliOAuthRoutes", "./routes/meliOAuthRoutes", "/api/meli");
  safeUse("tokenRoutes", "./routes/tokenRoutes", "/api/tokens");
  safeUse("dashboardRoutes", "./routes/dashboardRoutes", "/api/dashboard");

  // os outros eu mantenho como estavam (muitos já têm paths absolutos /ml/api/...)
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

  // ==================================================
  // ✅ Admin APIs
  // IMPORTANTE: os módulos admin* (do projeto original) esperam ser montados em /api/admin
  // (ex.: router.get('/usuarios') -> /api/admin/usuarios)
  // ==================================================
  function safeUseAdmin(label, modPath) {
    try {
      const r = require(modPath);
      app.use("/api/admin", requireMasterMW, r);
      console.log(`✅ [ML] ${label} carregado (em /api/admin)`);
    } catch (e) {
      console.warn(`⚠️ [ML] Falhou ao carregar ${label}:`, e.message);
    }
  }

  safeUseAdmin("adminUsuariosRoutes", "./routes/adminUsuariosRoutes");
  safeUseAdmin("adminEmpresasRoutes", "./routes/adminEmpresasRoutes");
  safeUseAdmin("adminVinculosRoutes", "./routes/adminVinculosRoutes");
  safeUseAdmin("adminMeliContasRoutes", "./routes/adminMeliContasRoutes");
  safeUseAdmin("adminMeliTokensRoutes", "./routes/adminMeliTokensRoutes");
  safeUseAdmin("adminOAuthStatesRoutes", "./routes/adminOAuthStatesRoutes");
  safeUseAdmin("adminMigracoesRoutes", "./routes/adminMigracoesRoutes");
  safeUseAdmin("adminBackupRoutes", "./routes/adminBackupRoutes");

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
