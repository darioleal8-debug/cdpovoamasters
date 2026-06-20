/**
 * database/seed.js
 * ---------------------------------------------------------
 * Popula a base de dados com dados mínimos para arrancar:
 *  - Uma conta de Administrador (a partir do .env)
 *  - Uma temporada ativa de exemplo
 * Uso: npm run seed
 * ---------------------------------------------------------
 */
 
require('dotenv').config();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
 
async function seed() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
 
  try {
    const adminEmail = process.env.SEED_ADMIN_EMAIL;
    const adminPassword = process.env.SEED_ADMIN_PASSWORD;
    const adminName = process.env.SEED_ADMIN_NAME || 'Administrador';
 
    // --- Criar administrador (se ainda não existir) ---
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [adminEmail]);
 
    if (existing.rows.length === 0) {
      const passwordHash = await bcrypt.hash(adminPassword, 12);
      await pool.query(
        `INSERT INTO users (name, email, password_hash, role, status)
         VALUES ($1, $2, $3, 'admin', 'ativo')`,
        [adminName, adminEmail, passwordHash]
      );
      console.log(`Administrador criado: ${adminEmail}`);
    } else {
      console.log(`Administrador já existe: ${adminEmail} (ignorado)`);
    }
 
    // --- Criar temporada ativa de exemplo (se não houver nenhuma) ---
    const seasons = await pool.query('SELECT id FROM seasons');
 
    if (seasons.rows.length === 0) {
      await pool.query(
        `INSERT INTO seasons (name, year, start_date, end_date, status)
         VALUES ($1, $2, $3, $4, 'ativa')`,
        ['Masters 2025/2026', '2025/2026', '2025-09-01', '2026-06-30']
      );
      console.log('Temporada inicial "Masters 2025/2026" criada e marcada como ativa.');
    } else {
      console.log('Já existem temporadas na base de dados (seed de temporada ignorado).');
    }
 
    console.log('Seed concluído.');
  } catch (err) {
    console.error('Erro ao executar o seed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
 
seed();
