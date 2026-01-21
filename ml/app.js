"use strict";

const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");

// Middlewares do ML (suite)
const ensureAuth = require("./middleware/ensureAuth");
const ensurePermission = require("./middleware/ensurePermission");
const ensureAccount = require("./middleware/ensureAccount");

// ✅ ML token middleware (depende do ensureAccount)
const authMiddleware = require("./middleware/authMiddleware");

// Exporta função que devolve app (pra ser montado em /ml)
module.exports = function createMlApp(options = {}) {
  const app = express();

  // ==========================================
  // BASIC MIDDLEWARES
  // ==========================================
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // views
  app.set("views", path.join(__dirname, "views"));
  app.set("view engine", "ejs");

  // static
  app.use(express.static(path.join(__dirname, "public")));

  // ==========================================
  // AUTH (suite login)
  // ==========================================
  // Nota: quem chama (suite/server.js) já monta isso em /ml,
  // então aqui as rotas são relativas ao "ml app".
  try {
    app.use(ensureAuth);
  } catch (e) {
    console.warn("⚠️ [ML] ensureAuth não aplicado:", e?.message || e);
  }

  // ✅ Permissões (admin etc.)
  try {
    app.use(ensurePermission);
  } catch (e) {
    console.warn("⚠️ [ML] ensurePermission não aplicado:", e?.message || e);
  }

  // ✅ Ordem correta:
  // 1) ensureAccount injeta res.locals.mlCreds (conta + tokens)
  // 2) authMiddleware usa isso pra renovar/injetar req.ml.accessToken
  try {
    app.use(ensureAccount);
  } catch (e) {
    console.warn("⚠️ [ML] ensureAccount não aplicado:", e?.message || e);
  }

  try {
    app.use(authMiddleware);
  } catch (e) {
    console.warn("⚠️ [ML] authMiddleware não aplicado:", e?.message || e);
  }

  // ==========================================
  // ROUTES
  // ==========================================
  function safeUse(label, routePath, mountPath = null) {
    try {
      const router = require(routePath);
      if (mountPath) app.use(mountPath, router);
      else app.use(router);
      console.log(`✅ [ML] Rotas carregadas: ${label}`);
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
