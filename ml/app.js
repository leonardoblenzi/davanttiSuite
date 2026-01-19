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
const ensurePermission = require("./middleware/ensurePermission");

// Bootstrap MASTER
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
  // (mantém em /api/auth; na suite vira /ml/api/auth)
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

    // auth
    if (p.startsWith("/api/auth")) return true;

    // healthchecks (Render/monitor)
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
  // ✅ Compat de API (IMPORTANTE)
  // --------------------------------------------------
  // Na suite: /ml/api/xxx chega aqui como /api/xxx (pq app está montado em /ml)
  //
  // Seu backend tem MUITA rota declarada como "/ml/api/..." dentro dos routers.
  // Então fazemos o alias APENAS para /api/* (exceto /api/auth/*):
  //
  //   /api/dashboard/...  ->  /ml/api/dashboard/...
  //
  // Assim você não precisa reescrever todos os paths do backend.
  // ==================================================
  app.use("/api", (req, _res, next) => {
    // Dentro deste middleware o Express removeu o prefixo "/api",
    // então req.url começa com "/auth/..." ou "/dashboard/..." etc.
    if (req.url === "/auth" || req.url.startsWith("/auth/")) return next();

    // evita duplicar caso alguém já chegue com /ml/api...
    if (req.url === "/ml/api" || req.url.startsWith("/ml/api/")) return next();

    req.url = "/ml/api" + req.url;
    return next();
  });

  // ==========================================
  // ✅ Rotas públicas de página
  // ==========================================
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

  app.get("/nao-autorizado", noCache, (_req, res) => {
    return res
      .status(403)
      .sendFile(path.join(__dirname, "views", "nao-autorizado.html"));
  });

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

  try {
    app.use(ensurePermission);
  } catch (e) {
    console.warn("⚠️ [ML] ensurePermission não aplicado:", e?.message || e);
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
  // ✅ Logout “ML” (mantém seu comportamento atual)
  // ==========================================
  app.post("/api/ml/logout", noCache, (_req, res) => {
    res.clearCookie("auth_token", { path: "/" });
    res.clearCookie("ml_account", { path: "/" });
    res.clearCookie("meli_conta_id", { path: "/" });
    return res.json({ ok: true });
  });

  // ==========================================
  // ✅ ROTAS
  // ==========================================
  function safeUse(label, modPath, mountPath = null) {
    try {
      const mod = require(modPath);

      // alguns módulos podem exportar { router } em vez de router direto
      const router = mod?.router || mod;

      if (typeof router !== "function") {
        console.warn(`⚠️ [ML] ${label} não exporta um router válido.`);
        return;
      }

      if (mountPath) app.use(mountPath, router);
      else app.use(router);

      console.log(`✅ [ML] ${label} carregado`);
    } catch (e) {
      console.warn(`⚠️ [ML] Falhou ao carregar ${label}:`, e.message);
    }
  }

  // páginas/HTML (dashboard etc)
  safeUse("HtmlRoutes", "./routes/htmlRoutes");

  // APIs
  safeUse("accountRoutes", "./routes/accountRoutes");
  safeUse("meliOAuthRoutes", "./routes/meliOAuthRoutes");
  safeUse("tokenRoutes", "./routes/tokenRoutes");
  safeUse("dashboardRoutes", "./routes/dashboardRoutes");
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

  // Admin
  safeUse("adminUsuariosRoutes", "./routes/adminUsuariosRoutes");
  safeUse("adminEmpresasRoutes", "./routes/adminEmpresasRoutes");
  safeUse("adminVinculosRoutes", "./routes/adminVinculosRoutes");
  safeUse("adminMeliContasRoutes", "./routes/adminMeliContasRoutes");
  safeUse("adminMeliTokensRoutes", "./routes/adminMeliTokensRoutes");
  safeUse("adminOAuthStatesRoutes", "./routes/adminOAuthStatesRoutes");
  safeUse("adminMigracoesRoutes", "./routes/adminMigracoesRoutes");
  safeUse("adminBackupRoutes", "./routes/adminBackupRoutes");

  // ==========================================
  // ERRORS
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
