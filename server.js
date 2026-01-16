// server.js (RAIZ)
"use strict";

require("dotenv").config();
const express = require("express");
const path = require("path");

const createMlApp = require("./ml"); // ml/index.js exporta createMlApp
// const createShopeeApp = require("./shopee"); // depois

const app = express();

app.set("trust proxy", 1);
app.set("etag", false);

// ✅ Health geral
app.get("/healthz", (_req, res) =>
  res.json({ ok: true, app: "davanttiSuite" })
);

// ✅ Home da suite: SEMPRE vai pra seleção de plataforma (suite)
app.get("/", (_req, res) => res.redirect("/selecao-plataforma"));

// ✅ Página de seleção (suite) usando a view que já existe no ML
app.get("/selecao-plataforma", (_req, res) => {
  return res.sendFile(
    path.join(__dirname, "ml", "views", "selecao-plataforma.html")
  );
});

// ✅ Escolha da plataforma (suite)
app.get("/go/ml", (_req, res) => res.redirect("/ml/login"));
app.get("/go/shopee", (_req, res) => res.status(200).send("Shopee em construção"));

// ✅ Monta ML em /ml
app.use("/ml", createMlApp());

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
  console.log("👉 Seleção: /selecao-plataforma");
  console.log("👉 ML:      /ml");
  console.log("🚀 ================================");
});
