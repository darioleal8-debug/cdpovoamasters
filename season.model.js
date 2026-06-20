/**
 * src/models/season.model.js
 * ---------------------------------------------------------
 * Acesso à tabela "seasons" (temporadas).
 * ---------------------------------------------------------
 */
 
const { query } = require('../config/database');
 
async function create({ name, year, startDate, endDate, status }) {
  const sql = `
    INSERT INTO seasons (name, year, start_date, end_date, status)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `;
  const { rows } = await query(sql, [name, year, startDate, endDate, status]);
  return rows[0];
}
 
async function findAll() {
  const sql = `SELECT * FROM seasons ORDER BY start_date DESC`;
  const { rows } = await query(sql);
  return rows;
}
 
async function findById(id) {
  const sql = `SELECT * FROM seasons WHERE id = $1`;
  const { rows } = await query(sql, [id]);
  return rows[0] || null;
}
 
async function findActive() {
  const sql = `SELECT * FROM seasons WHERE status = 'ativa' LIMIT 1`;
  const { rows } = await query(sql);
  return rows[0] || null;
}
 
async function update(id, fields) {
  const { name, year, startDate, endDate } = fields;
  const sql = `
    UPDATE seasons SET
      name = COALESCE($1, name),
      year = COALESCE($2, year),
      start_date = COALESCE($3, start_date),
      end_date = COALESCE($4, end_date)
    WHERE id = $5
    RETURNING *
  `;
  const { rows } = await query(sql, [name, year, startDate, endDate, id]);
  return rows[0] || null;
}
 
/**
 * Desativa qualquer temporada atualmente ativa (passa a "arquivada").
 * Usado antes de marcar uma nova temporada como ativa, garantindo
 * que nunca há duas temporadas ativas em simultâneo.
 */
async function archiveAllActive() {
  await query(`UPDATE seasons SET status = 'arquivada' WHERE status = 'ativa'`);
}
 
async function setActive(id) {
  const sql = `UPDATE seasons SET status = 'ativa' WHERE id = $1 RETURNING *`;
  const { rows } = await query(sql, [id]);
  return rows[0] || null;
}
 
async function setArchived(id) {
  const sql = `UPDATE seasons SET status = 'arquivada' WHERE id = $1 RETURNING *`;
  const { rows } = await query(sql, [id]);
  return rows[0] || null;
}
 
module.exports = {
  create,
  findAll,
  findById,
  findActive,
  update,
  archiveAllActive,
  setActive,
  setArchived,
};
