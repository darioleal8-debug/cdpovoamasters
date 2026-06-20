/**
 * src/config/database.js
 * ---------------------------------------------------------
 * Pool de ligações ao PostgreSQL, partilhada por toda a app.
 * ---------------------------------------------------------
 */
 
const { Pool } = require('pg');
 
const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,                     // ligações máximas simultâneas no pool
  idleTimeoutMillis: 30000,
});
 
pool.on('error', (err) => {
  // Erros em ligações ociosas do pool não devem derrubar o processo,
  // mas devem ser visíveis nos logs.
  console.error('Erro inesperado no pool de PostgreSQL:', err);
});
 
/**
 * Atalho para executar queries diretamente na pool.
 * @param {string} text - SQL com placeholders ($1, $2...)
 * @param {Array} params - valores para os placeholders
 */
function query(text, params) {
  return pool.query(text, params);
}
 
module.exports = { pool, query };
