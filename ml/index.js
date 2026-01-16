// ml/index.js
"use strict";

require("dotenv").config();

const createMlApp = require("./app");

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  const app = createMlApp();

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log("🚀 ================================");
    console.log(`🌐 [ML] Servidor rodando em http://localhost:${PORT}`);
    console.log("🚀 ================================");
  });

  async function gracefulShutdown(signal) {
    console.log(`🛑 [ML] Recebido ${signal}, encerrando servidor...`);

    const queueService = app.locals?.queueService;
    if (queueService) {
      try {
        console.log("⏸️ [ML] Pausando sistema de filas...");
        // mantém o mesmo método que você já tinha
        if (typeof queueService.pausarJob === "function") {
          await queueService.pausarJob();
        }
        console.log("✅ [ML] Sistema de filas pausado");
      } catch (error) {
        console.error(
          "❌ [ML] Erro ao pausar sistema de filas:",
          error.message
        );
      }
    }

    server.close(() => {
      console.log("✅ [ML] Servidor encerrado com sucesso");
      process.exit(0);
    });

    setTimeout(() => {
      console.log("⏰ [ML] Forçando encerramento...");
      process.exit(1);
    }, 10000);
  }

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("unhandledRejection", (reason, promise) => {
    console.error(
      "❌ [ML] Unhandled Rejection at:",
      promise,
      "reason:",
      reason
    );
  });
  process.on("uncaughtException", (error) => {
    console.error("❌ [ML] Uncaught Exception:", error);
    gracefulShutdown("UNCAUGHT_EXCEPTION");
  });
}

// ✅ Para a suite: exporta a factory (sem listen)
module.exports = createMlApp;
