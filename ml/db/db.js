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
const ML_DB_SCHEMA = String(process.env.ML_DB_SCHEMA || "ml").trim();

// No Render, é comum precisar SSL (principalmente se usar External Database URL).
const isProd =
  String(process.env.NODE_ENV || "").toLowerCase() === "production";

// ✅ Sanitiza schema (evita injection por ENV)
function safeSchemaName(raw, fallback = "ml") {
  const v = String(raw || "").trim();
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(v) ? v : fallback;
}

const SAFE_SCHEMA = safeSchemaName(ML_DB_SCHEMA, "ml");

// ✅ pg Pool
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: isProd ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

// ✅ Toda conexão nova no pool recebe o search_path (zero-code)
pool.on("connect", async (client) => {
  try {
    await client.query(`set search_path to ${SAFE_SCHEMA}, public;`);
  } catch (e) {
    // não derruba a app por causa disso
    console.warn(
      `⚠️ [DB] Não foi possível setar search_path (${SAFE_SCHEMA}, public). Usando default. Motivo:`,
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
