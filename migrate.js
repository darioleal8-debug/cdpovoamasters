/**
 * database/migrate.js
 * ---------------------------------------------------------
 * Aplica o schema.sql à base de dados configurada no .env.
 * Uso: npm run migrate
 * ---------------------------------------------------------
 */
 
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
 
async function migrate() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
 
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
 
  console.log('A aplicar o schema à base de dados...');
 
  try {
    await pool.query(schemaSql);
    console.log('Schema aplicado com sucesso.');
  } catch (err) {
    console.error('Erro ao aplicar o schema:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
 
migrate();
