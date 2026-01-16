// server.js (RAIZ)
"use strict";

require("dotenv").config();
const express = require("express");

const createMlApp = require("./ml"); // ml/index.js exporta createMlApp
const createShopeeApp = require("./shopee"); // vamos ajustar já já

const app = express();

app.set("trust proxy", 1);
app.set("etag", false);

// ✅ Health geral
app.get("/healthz", (_req, res) =>
  res.json({ ok: true, app: "davanttiSuite" })
);

// ✅ Home: manda pra ML (ou cria uma tela de seleção depois)
app.get("/", (_req, res) => res.redirect("/ml"));

// ✅ Monta os sub-apps
app.use("/ml", createMlApp());
app.use("/shopee", createShopeeApp());

// 404 geral
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Rota não encontrada (suite)",
    path: req.originalUrl,
    method: req.method,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 ================================");
  console.log(`🌐 Suite rodando em http://localhost:${PORT}`);
  console.log("👉 ML:      /ml");
  console.log("👉 Shopee:  /shopee");
  console.log("🚀 ================================");
});
