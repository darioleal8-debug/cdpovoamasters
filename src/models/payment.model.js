/**
 * src/models/payment.model.js
 * ---------------------------------------------------------
 * Acesso à tabela "payments" (cotas mensais por temporada).
 * ---------------------------------------------------------
 */
 
const { query } = require('../config/database');
 
async function create({ userId, seasonId, month, referenceYear, amount }) {
  const sql = `
    INSERT INTO payments (user_id, season_id, month, reference_year, amount)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `;
  const { rows } = await query(sql, [userId, seasonId, month, referenceYear, amount]);
  return rows[0];
}
 
async function findById(id) {
  const sql = `SELECT * FROM payments WHERE id = $1`;
  const { rows } = await query(sql, [id]);
  return rows[0] || null;
}
 
/**
 * Histórico de pagamentos de UM jogador numa temporada.
 */
async function findByUserAndSeason(userId, seasonId) {
  const sql = `
    SELECT * FROM payments
    WHERE user_id = $1 AND season_id = $2
    ORDER BY reference_year ASC, month ASC
  `;
  const { rows } = await query(sql, [userId, seasonId]);
  return rows;
}
 
/**
 * Visão geral de TODOS os pagamentos de uma temporada
 * (uso administrativo), com nome do jogador incluído.
 */
async function findBySeason(seasonId, { status } = {}) {
  const conditions = ['p.season_id = $1'];
  const params = [seasonId];
 
  if (status) {
    params.push(status);
    conditions.push(`p.status = $${params.length}`);
  }
 
  const sql = `
    SELECT p.*, u.name AS player_name, u.email AS player_email
    FROM payments p
    JOIN users u ON u.id = p.user_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY u.name ASC, p.reference_year ASC, p.month ASC
  `;
  const { rows } = await query(sql, params);
  return rows;
}
 
async function markAsPaid(id, { paidAt, markedBy }) {
  const sql = `
    UPDATE payments SET
      status = 'pago',
      paid_at = COALESCE($1, now()),
      marked_by = $2
    WHERE id = $3
    RETURNING *
  `;
  const { rows } = await query(sql, [paidAt, markedBy, id]);
  return rows[0] || null;
}
 
async function markAsPending(id) {
  const sql = `
    UPDATE payments SET status = 'pendente', paid_at = NULL, marked_by = NULL
    WHERE id = $1
    RETURNING *
  `;
  const { rows } = await query(sql, [id]);
  return rows[0] || null;
}
 
async function update(id, fields) {
  const { amount, month, referenceYear } = fields;
  const sql = `
    UPDATE payments SET
      amount = COALESCE($1, amount),
      month = COALESCE($2, month),
      reference_year = COALESCE($3, reference_year)
    WHERE id = $4
    RETURNING *
  `;
  const { rows } = await query(sql, [amount, month, referenceYear, id]);
  return rows[0] || null;
}
 
async function remove(id) {
  await query('DELETE FROM payments WHERE id = $1', [id]);
}
 
module.exports = {
  create,
  findById,
  findByUserAndSeason,
  findBySeason,
  markAsPaid,
  markAsPending,
  update,
  remove,
};
