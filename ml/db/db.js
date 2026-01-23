// ml/db/db.js
// Conexão Postgres (Render) via ML_DATABASE_URL (suite)
// Fallback opcional: DATABASE_URL
// ✅ Extra: seta search_path automaticamente (ml, public) no connect do pool
// Assim o ML consulta tabelas do schema "ml" sem prefixar "ml." nas queries.

"use strict";

const { Pool } = require("pg");

// ✅ Preferência: variável isolada do ML
const DATABASE_URL = process.env.ML_DATABASE_URL || process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error(
    "ML_DATABASE_URL não definida (fallback DATABASE_URL também ausente). Configure no .env/Render (Environment).",
  );
}

// ✅ Schema padrão do ML (pode trocar no Render)
// ✅ Schema do ML (pode trocar no Render)
//
// ⚠️ Nota importante:
// O DavanttiSuite historicamente criou as tabelas no schema padrão (public).
// Se você definir ML_DB_SCHEMA=ml e existir uma tabela com o mesmo nome no schema "ml"
// (por exemplo, uma "usuarios" vazia), o Postgres vai priorizar essa tabela e o login
// vai começar a dar "credenciais inválidas" mesmo com o usuário existindo.
//
// Por isso, o padrão aqui é PUBLIC, e o search_path fica "public, <schema_ml>".
// Se você realmente quiser priorizar o schema ML primeiro, defina:
//   ML_DB_SEARCH_PATH_MODE=ml_first
const ML_DB_SCHEMA = String(process.env.ML_DB_SCHEMA || "public").trim();

// No Render, é comum precisar SSL (principalmente se usar External Database URL).
const isProd =
  String(process.env.NODE_ENV || "").toLowerCase() === "production";

// ✅ Sanitiza schema (evita injection por ENV)
function safeSchemaName(raw, fallback = "ml") {
  const v = String(raw || "").trim();
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(v) ? v : fallback;
}

// Se o DATABASE_URL já vier com search_path configurado (Render permite isso via
// querystring `options=-c search_path=ml,public`), a gente respeita.
// Isso evita o bug clássico: existir `public.usuarios` e `ml.usuarios`, e o código
// forçar `public` primeiro → login fica "credenciais inválidas".
function detectSearchPathFromDatabaseUrl(urlStr) {
  try {
    const u = new URL(urlStr);

    // 1) Alguns setups usam search_path direto como query param
    const direct =
      u.searchParams.get("search_path") || u.searchParams.get("searchPath");
    if (direct) {
      const parts = String(direct)
        .split(",")
        .map((s) => safeSchemaName(s, ""))
        .filter(Boolean);
      return parts.length ? parts : null;
    }

    // 2) Render/libpq: options=-c search_path=ml,public
    const optRaw = u.searchParams.get("options");
    if (!optRaw) return null;

    const opt = decodeURIComponent(optRaw);
    const m = opt.match(/search_path\s*=\s*([^\s]+)/i);
    if (!m) return null;

    const val = String(m[1] || "").trim();
    const parts = val
      .split(",")
      .map((s) => safeSchemaName(s, ""))
      .filter(Boolean);
    return parts.length ? parts : null;
  } catch {
    return null;
  }
}

const SAFE_SCHEMA = safeSchemaName(ML_DB_SCHEMA, "ml");

// ✅ Se houver search_path explícito no DATABASE_URL, ele tem prioridade total.
const EXPLICIT_SEARCH_PATH_PARTS =
  detectSearchPathFromDatabaseUrl(DATABASE_URL);
const EXPLICIT_SEARCH_PATH = EXPLICIT_SEARCH_PATH_PARTS
  ? EXPLICIT_SEARCH_PATH_PARTS.join(", ")
  : null;

// ✅ pg Pool
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: isProd ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

const SEARCH_PATH_MODE = String(
  process.env.ML_DB_SEARCH_PATH_MODE || "public_first",
)
  .trim()
  .toLowerCase();

function buildSearchPath() {
  if (EXPLICIT_SEARCH_PATH) return EXPLICIT_SEARCH_PATH;

  // se o schema for public, não precisa adicionar duplicado
  if (SAFE_SCHEMA === "public") return "public";

  // default: public primeiro (evita pegar tabelas vazias no schema ml e quebrar login)
  if (SEARCH_PATH_MODE === "ml_first") return `${SAFE_SCHEMA}, public`;

  return `public, ${SAFE_SCHEMA}`;
}

// ✅ Toda conexão nova no pool recebe o search_path (zero-code)
pool.on("connect", async (client) => {
  try {
    const sp = buildSearchPath();
    await client.query(`set search_path to ${sp};`);
  } catch (e) {
    // não derruba a app por causa disso
    console.warn(
      `⚠️ [DB] Não foi possível setar search_path (${buildSearchPath()}). Usando default. Motivo:`,
      e?.message || e,
    );
  }
});

// Log básico de erro do pool
pool.on("error", (err) => {
  console.error("❌ Postgres pool error:", err);
});

// Helper simples (agora pode usar pool.query direto também, mas mantém compat)
async function query(text, params) {
  return pool.query(text, params);
}

// Helper para transação / client dedicado
async function withClient(fn) {
  const client = await pool.connect();
  try {
    // o search_path já foi setado no pool.on("connect")
    return await fn(client);
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query,
  withClient,
  ML_DB_SCHEMA: SAFE_SCHEMA,
};
