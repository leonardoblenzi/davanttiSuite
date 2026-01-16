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

  // ✅ Static (vai virar /ml/css, /ml/js... quando montado)
  app.use(express.static(path.join(__dirname, "public")));

  // ✅ FIX favicon
  app.get("/favicon.ico", (_req, res) => res.status(204).end());

  console.log("🔍 [ML] Carregando módulos...");

  // ==================================================
  // Token provider (Curva ABC)
  // ==================================================
  try {
    const { getAccessTokenForAccount } = require("./services/ml-auth");
    app.set("getAccessTokenForAccount", getAccessTokenForAccount);
    console.log("✅ [ML] Token Adapter injetado");
  } catch (err) {
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
  // ==================================================
  try {
    if (!process.env.JWT_SECRET) {
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

    if (p === "/login") return true;
    if (p === "/cadastro") return true;
    if (p === "/selecao-plataforma") return true;

    if (p.startsWith("/api/auth")) return true;

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

  // ==========================================
  // ✅ Rotas públicas de página
  // ==========================================

  app.get("/", noCache, (req, res) => {
    const base = req.baseUrl || ""; // ✅ chave pra funcionar em /ml
    if (req.cookies?.auth_token) {
      return ensureAuth(req, res, () => res.redirect(base + "/dashboard"));
    }
    return res.redirect(base + "/selecao-plataforma");
  });

  app.get("/healthz", (_req, res) => {
    res.set("Cache-Control", "no-store");
    return res.status(200).json({ ok: true });
  });

  app.get("/selecao-plataforma", noCache, (req, res) => {
    return res.sendFile(
      path.join(__dirname, "views", "selecao-plataforma.html")
    );
  });

  app.get("/login", noCache, (req, res) => {
    return res.sendFile(path.join(__dirname, "views", "login.html"));
  });

  app.get("/cadastro", noCache, (req, res) => {
    return res.sendFile(path.join(__dirname, "views", "cadastro.html"));
  });

  app.get("/nao-autorizado", noCache, (req, res) => {
    return res
      .status(403)
      .sendFile(path.join(__dirname, "views", "nao-autorizado.html"));
  });

  // ==========================================
  // INICIALIZAR FILAS (ok ficar aqui)
  // ==========================================
  let queueService;
  try {
    queueService = require("./services/queueService");
    console.log("✅ [ML] QueueService carregado");
    queueService
      .iniciarProcessamento()
      .then(() => console.log("🚀 [ML] Filas iniciadas"))
      .catch((error) =>
        console.error("❌ [ML] Erro ao iniciar filas:", error.message)
      );
  } catch (error) {
    console.error("❌ [ML] Erro ao carregar QueueService:", error.message);
    console.warn("⚠️ [ML] Sem filas");
  }

  // 🔥 guarda pra suite poder encerrar depois (passo futuro)
  app.locals.queueService = queueService || null;

  // ==========================================
  // ✅ Daqui pra baixo: protegido
  // ==========================================

  app.post("/api/ml/logout", noCache, (req, res) => {
    // (deixa path "/" por enquanto; no passo de isolamento vamos prefixar cookie/paths)
    res.clearCookie("auth_token", { path: "/" });
    res.clearCookie("ml_account", { path: "/" });
    res.clearCookie("meli_conta_id", { path: "/" });
    return res.json({ ok: true });
  });

  // ... ✅ A PARTIR DAQUI: cola o RESTO do seu index.js exatamente como está
  // ... tudo que é app.get/app.use/app.post pode permanecer igual
  // ... Só NÃO copia a parte do app.listen + gracefulShutdown + process.on no final

  // ==========================================
  // ERRORS (mantém igual)
  // ==========================================

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
