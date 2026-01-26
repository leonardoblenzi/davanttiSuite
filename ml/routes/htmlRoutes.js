// routes/htmlRoutes.js
"use strict";

const express = require("express");
const path = require("path");

// ✅ gate de permissão (padrao/admin/master)
const ensurePermission = require("../middleware/ensurePermission");

let HtmlController;
try {
  HtmlController = require("../controllers/HtmlController");
} catch (error) {
  console.error("❌ Erro ao carregar HtmlController:", error.message);
  throw error;
}

const router = express.Router();

// (Opcional) Evita cache das páginas HTML
function noCache(_req, res, next) {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  });
  next();
}

/**
 * ✅ IMPORTANTE:
 * Rotas públicas (login/cadastro/selecao-plataforma) ficam no index.js.
 * Aqui deixamos apenas páginas do app (já protegidas pelo authGate).
 */

// Dashboard
router.get("/dashboard", noCache, HtmlController.servirDashboard);

// Páginas existentes
router.get("/remover-promocao", noCache, HtmlController.servirRemoverPromocao);
router.get("/criar-promocao", noCache, HtmlController.criarPromocao);

// ✅ Prazo (HTML)
router.get("/prazo", noCache, (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "prazo.html"));
});

// ✅ Jardinagem (HTML) — ADMIN|MASTER (sensível) → redireciona p/ /nao-autorizado via middleware
router.get(
  "/jardinagem",
  noCache,
  ensurePermission.requireAdmin(),
  (_req, res) => {
    res.sendFile(path.join(__dirname, "..", "views", "jardinagem.html"));
  }
);

// Utilitários de geração/diagnóstico
router.get("/criar-dashboard", noCache, HtmlController.criarDashboard);
router.get(
  "/criar-arquivo-remocao",
  noCache,
  HtmlController.criarArquivoRemocao
);
router.get("/debug/routes", HtmlController.debugRoutes);

// Teste simples
router.get("/test", (_req, res) => {
  res.send("Servidor Node.js com Express está rodando!");
});

// Produtos Estratégicos (HTML)
router.get("/estrategicos", noCache, (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "estrategicos.html"));
});

// ✅ Exclusão de Anúncios (HTML) — ADMIN|MASTER (sensível)
router.get(
  "/excluir-anuncio",
  noCache,
  ensurePermission.requireAdmin(),
  (_req, res) => {
    res.sendFile(path.join(__dirname, "..", "views", "excluir-anuncio.html"));
  }
);

// ✅ Editar Anúncio (HTML) — ADMIN|MASTER (sensível)
router.get(
  "/editar-anuncio",
  noCache,
  ensurePermission.requireAdmin(),
  (_req, res) => {
    res.sendFile(path.join(__dirname, "..", "views", "editar-anuncio.html"));
  }
);

// Análise IA (HTML)
router.get("/analise-ia", noCache, (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "analise-ia.html"));
});

// Filtro Avançado de Anúncios (HTML)
router.get("/filtro-anuncios", noCache, (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "filtro-anuncios.html"));
});

// Full (HTML)
router.get("/full", noCache, (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "full.html"));
});


// ===========================
// ✅ Páginas HTML que antes colidiam com rotas de API (agora separadas)
// ===========================

// Publicidade (HTML)
router.get("/publicidade", noCache, (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "publicidade.html"));
});

// Pesquisa em Descrições (HTML)
router.get("/pesquisa-descricao", noCache, (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "pesquisa-descricao.html"));
});

// Validar Dimensões (HTML)
router.get("/validar-dimensoes", noCache, (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "validar-dimensoes.html"));
});

// Keyword Analytics (HTML)
router.get("/keyword-analytics", noCache, (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "keyword-analytics.html"));
});

// Curva ABC (HTML)
router.get("/ia-analytics/curva-abc", noCache, (_req, res) => {
  res.sendFile(
    path.join(__dirname, "..", "views", "ia-analytics", "curva-abc.html")
  );
});


// ===========================
// ✅ Painel Admin (HTML)
// (as APIs ficam em /api/admin/*; aqui são só as telas)
// ===========================
router.get(
  "/admin/usuarios",
  noCache,
  ensurePermission.requireAdmin(),
  (_req, res) => res.sendFile(path.join(__dirname, "..", "views", "admin-usuarios.html"))
);

router.get(
  "/admin/empresas",
  noCache,
  ensurePermission.requireAdmin(),
  (_req, res) => res.sendFile(path.join(__dirname, "..", "views", "admin-empresas.html"))
);

router.get(
  "/admin/vinculos",
  noCache,
  ensurePermission.requireAdmin(),
  (_req, res) => res.sendFile(path.join(__dirname, "..", "views", "admin-vinculos.html"))
);

// Aliases “contas-ml / tokens-ml” (pra compat com seus links)
router.get(
  "/admin/contas-ml",
  noCache,
  ensurePermission.requireAdmin(),
  (_req, res) => res.sendFile(path.join(__dirname, "..", "views", "admin-meli-contas.html"))
);

router.get(
  "/admin/tokens-ml",
  noCache,
  ensurePermission.requireAdmin(),
  (_req, res) => res.sendFile(path.join(__dirname, "..", "views", "admin-meli-tokens.html"))
);

// (Opcional) aliases mais “técnicos”
router.get(
  "/admin/meli-contas",
  noCache,
  ensurePermission.requireAdmin(),
  (_req, res) => res.sendFile(path.join(__dirname, "..", "views", "admin-meli-contas.html"))
);

router.get(
  "/admin/meli-tokens",
  noCache,
  ensurePermission.requireAdmin(),
  (_req, res) => res.sendFile(path.join(__dirname, "..", "views", "admin-meli-tokens.html"))
);

router.get(
  "/admin/oauth-states",
  noCache,
  ensurePermission.requireAdmin(),
  (_req, res) => res.sendFile(path.join(__dirname, "..", "views", "admin-oauth-states.html"))
);

router.get(
  "/admin/migracoes",
  noCache,
  ensurePermission.requireAdmin(),
  (_req, res) => res.sendFile(path.join(__dirname, "..", "views", "admin-migracoes.html"))
);

router.get(
  "/admin/backup",
  noCache,
  ensurePermission.requireAdmin(),
  (_req, res) => res.sendFile(path.join(__dirname, "..", "views", "admin-backup.html"))
);


module.exports = router;
