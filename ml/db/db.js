"use strict";

// ml/db/db.js
// Conexão Postgres (Render) respeitando schema do ML (ml) + fallback public.
//
// Por que isso importa?
// - Se o search_path apontar para "public" enquanto suas tabelas estão em "ml",
//   o login vai falhar (normalmente com erro de relação inexistente) e virar 500.
// - Se existir tabela homônima em outro schema, pode dar "Credenciais inválidas"
//   por consultar a tabela errada.

const { Pool } = require("pg");

// ✅ Prioriza ML_DATABASE_URL se existir (suite), senão usa DATABASE_URL
const DATABASE_URL = process.env.ML_DATABASE_URL || process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL não definida. Configure no Render (Environment)."
  );
}

const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";

// =====================
// Helpers
// =====================
function safeSchemaName(input, fallback) {
  const s = String(input || "").trim();
  // schemas válidos: letras, números e underscore
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)) return fallback;
  return s;
}

// Extrai search_path definido na própria DATABASE_URL, se houver.
// Ex.: ...?sslmode=require&options=-c%20search_path=ml,public
function extractSearchPathFromUrl(connString) {
  try {
    const u = new URL(connString);

    // Caso alguém use search_path direto como query param
    const direct = u.searchParams.get("search_path");
    if (direct) return String(direct).trim() || null;

    const opts = u.searchParams.get("options");
    if (!opts) return null;

    // Render/URL pode vir com %20, + etc
    const decoded = decodeURIComponent(String(opts).replace(/\+/g, "%20"));
    // Normalmente vem: "-c search_path=ml,public"
    const m = decoded.match(/search_path\s*=\s*([^\s]+)/i);
    return m ? String(m[1]).trim() : null;
  } catch {
    return null;
  }
}

function sanitizeSearchPath(raw) {
  const list = String(raw || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => safeSchemaName(x, null))
    .filter(Boolean);

  if (!list.length) return null;

  // garante que public esteja por último (boa prática)
  const dedup = [];
  for (const s of list) if (!dedup.includes(s)) dedup.push(s);

  if (!dedup.includes("public")) dedup.push("public");
  // se public estiver no meio, move para o fim
  const withoutPublic = dedup.filter((s) => s !== "public");
  return [...withoutPublic, "public"].join(", ");
}

// =====================
// Resolve search_path
// =====================
// 1) ML_DB_SEARCH_PATH (mais forte)
// 2) search_path embutido na DATABASE_URL (options=-c search_path=...)
// 3) ML_DB_SCHEMA + modo

const ML_DB_SCHEMA = safeSchemaName(process.env.ML_DB_SCHEMA, "ml");

const URL_SP_RAW = extractSearchPathFromUrl(DATABASE_URL);
const ENV_SP_RAW = process.env.ML_DB_SEARCH_PATH;

const EXPLICIT_SP = sanitizeSearchPath(ENV_SP_RAW || URL_SP_RAW);

// Modos:
// - ml_first:  ml, public
// - public_first: public, ml
const SEARCH_PATH_MODE = String(
  process.env.ML_DB_SEARCH_PATH_MODE || "ml_first"
)
  .trim()
  .toLowerCase();

function buildSearchPath() {
  if (EXPLICIT_SP) return EXPLICIT_SP;

  const schema = safeSchemaName(ML_DB_SCHEMA, "ml");

  if (SEARCH_PATH_MODE === "public_first") {
    // public, ml
    return `public, ${schema}`;
  }

  // default: ml, public
  if (schema === "public") return "public";
  return `${schema}, public`;
}

const SEARCH_PATH = buildSearchPath();

// =====================
// Pool
// =====================
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: isProd ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (err) => {
  console.error("❌ [ML][DB] Postgres pool error:", err);
});

// Garante search_path em toda nova conexão
pool.on("connect", async (client) => {
  try {
    // ⚠️ não usar interpolação com dados não-sanitizados.
    // SEARCH_PATH já foi sanitizado para conter apenas schemas válidos.
    await client.query(`set search_path to ${SEARCH_PATH};`);
  } catch (e) {
    console.error(
      "❌ [ML][DB] Falha ao aplicar search_path:",
      SEARCH_PATH,
      e?.message || e
    );
  }
});

// =====================
// Exports
// =====================
async function query(text, params) {
  return pool.query(text, params);
}

async function withClient(fn) {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query,
  withClient,
  SEARCH_PATH,
  ML_DB_SCHEMA,
};
