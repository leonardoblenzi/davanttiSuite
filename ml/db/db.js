"use strict";

// ml/db/db.js
// Conexão Postgres (Render) respeitando schema do ML (ml) + fallback public.

const { Pool } = require("pg");

// ✅ Prioriza ML_DATABASE_URL se existir (suite), senão usa DATABASE_URL
const DATABASE_URL = process.env.ML_DATABASE_URL || process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL não definida. Configure no Render (Environment).",
  );
}

const isProd =
  String(process.env.NODE_ENV || "").toLowerCase() === "production";

// =====================
// Helpers
// =====================
function safeSchemaName(input, fallback) {
  const s = String(input || "").trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)) return fallback;
  return s;
}

// Ex.: ...?sslmode=require&options=-c%20search_path=ml,public
function extractSearchPathFromUrl(connString) {
  try {
    const u = new URL(connString);

    const direct = u.searchParams.get("search_path");
    if (direct) return String(direct).trim() || null;

    const opts = u.searchParams.get("options");
    if (!opts) return null;

    const decoded = decodeURIComponent(String(opts).replace(/\+/g, "%20"));
    // "-c search_path=ml,public"  ou  "-c search_path=ml,public -c ... "
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

  const dedup = [];
  for (const s of list) if (!dedup.includes(s)) dedup.push(s);

  // garante public por último
  const withoutPublic = dedup.filter((s) => s !== "public");
  return [...withoutPublic, "public"].join(", ");
}

// =====================
// Resolve search_path
// =====================
const ML_DB_SCHEMA = safeSchemaName(process.env.ML_DB_SCHEMA, "ml");

const URL_SP_RAW = extractSearchPathFromUrl(DATABASE_URL);
const ENV_SP_RAW = process.env.ML_DB_SEARCH_PATH;

const EXPLICIT_SP = sanitizeSearchPath(ENV_SP_RAW || URL_SP_RAW);

// default: ml, public
function buildSearchPath() {
  if (EXPLICIT_SP) return EXPLICIT_SP;
  const schema = safeSchemaName(ML_DB_SCHEMA, "ml");
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

// ✅ Garante search_path em toda nova conexão
pool.on("connect", async (client) => {
  try {
    await client.query(`set search_path to ${SEARCH_PATH};`);
  } catch (e) {
    console.error(
      "❌ [ML][DB] Falha ao aplicar search_path:",
      SEARCH_PATH,
      e?.message || e,
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
