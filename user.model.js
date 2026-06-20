/**
 * src/models/user.model.js
 * ---------------------------------------------------------
 * Acesso direto à tabela "users". Cada função corresponde
 * a uma operação SQL específica, sem lógica de negócio
 * (essa fica nos services).
 * ---------------------------------------------------------
 */
 
const { query } = require('../config/database');
 
const PUBLIC_COLUMNS = 'id, name, email, role, status, created_at, updated_at';
 
async function create({ name, email, passwordHash, role, status }) {
  const sql = `
    INSERT INTO users (name, email, password_hash, role, status)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING ${PUBLIC_COLUMNS}
  `;
  const { rows } = await query(sql, [name, email, passwordHash, role, status]);
  return rows[0];
}
 
async function findByEmail(email) {
  const sql = `SELECT * FROM users WHERE email = $1`;
  const { rows } = await query(sql, [email]);
  return rows[0] || null;
}
 
async function findById(id) {
  const sql = `SELECT * FROM users WHERE id = $1`;
  const { rows } = await query(sql, [id]);
  return rows[0] || null;
}
 
async function findPublicById(id) {
  const sql = `SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`;
  const { rows } = await query(sql, [id]);
  return rows[0] || null;
}
 
/**
 * Lista utilizadores com filtros opcionais por role e/ou status.
 */
async function findAll({ role, status } = {}) {
  const conditions = [];
  const params = [];
 
  if (role) {
    params.push(role);
    conditions.push(`role = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
 
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
 
  const sql = `
    SELECT ${PUBLIC_COLUMNS}
    FROM users
    ${whereClause}
    ORDER BY created_at DESC
  `;
  const { rows } = await query(sql, params);
  return rows;
}
 
async function updateRole(id, role) {
  const sql = `
    UPDATE users SET role = $1
    WHERE id = $2
    RETURNING ${PUBLIC_COLUMNS}
  `;
  const { rows } = await query(sql, [role, id]);
  return rows[0] || null;
}
 
async function updateStatus(id, status) {
  const sql = `
    UPDATE users SET status = $1
    WHERE id = $2
    RETURNING ${PUBLIC_COLUMNS}
  `;
  const { rows } = await query(sql, [status, id]);
  return rows[0] || null;
}
 
async function updateProfile(id, { name, email }) {
  const sql = `
    UPDATE users SET
      name = COALESCE($1, name),
      email = COALESCE($2, email)
    WHERE id = $3
    RETURNING ${PUBLIC_COLUMNS}
  `;
  const { rows } = await query(sql, [name, email, id]);
  return rows[0] || null;
}
 
async function updatePassword(id, passwordHash) {
  const sql = `UPDATE users SET password_hash = $1 WHERE id = $2`;
  await query(sql, [passwordHash, id]);
}
 
async function remove(id) {
  await query('DELETE FROM users WHERE id = $1', [id]);
}
 
module.exports = {
  create,
  findByEmail,
  findById,
  findPublicById,
  findAll,
  updateRole,
  updateStatus,
  updateProfile,
  updatePassword,
  remove,
};
