"use strict";

const express = require("express");
const TokenController = require("../controllers/TokenController");

const router = express.Router();

// Rotas de token (LEGADO - root)
// Mantemos para não quebrar chamadas antigas.
router.post("/getAccessToken", TokenController.getAccessToken);
router.post("/renovar-token-automatico", TokenController.renovarToken);
router.get("/verificar-token", TokenController.verificarToken);
router.get("/test-token", TokenController.testarToken);

// Rota para autenticação inicial (LEGADO - root)
router.post("/dados", TokenController.obterTokenInicial);

// ===============================
// ✅ ALIASES com prefixo /ml
// - Isso funciona mesmo se o app tiver montado tudo em /ml
// - E mantém compat com quem ainda chama no root
// ===============================

// Se você quiser deixar 100% igual, mantém os mesmos paths:
router.post("/ml/getAccessToken", TokenController.getAccessToken);
router.post("/ml/renovar-token-automatico", TokenController.renovarToken);
router.get("/ml/verificar-token", TokenController.verificarToken);
router.get("/ml/test-token", TokenController.testarToken);
router.post("/ml/dados", TokenController.obterTokenInicial);

module.exports = router;
