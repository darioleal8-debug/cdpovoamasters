/**
 * src/models/event.model.js
 * ---------------------------------------------------------
 * Acesso à tabela "events" (jogos, treinos, outros eventos).
 * ---------------------------------------------------------
 */
 
const { query } = require('../config/database');
 
async function create({
  seasonId,
  type,
  title,
  location,
  eventDate,
  eventTime,
  opponent,
  trainingKind,
  description,
  createdBy,
}) {
  const sql = `
    INSERT INTO events
      (season_id, type, title, location, event_date, event_time, opponent, training_kind, description, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
  `;
  const { rows } = await query(sql, [
    seasonId,
    type,
    title,
    location,
    eventDate,
    eventTime,
    opponent || null,
    trainingKind || null,
    description || null,
    createdBy,
  ]);
  return rows[0];
}
 
/**
 * Lista eventos de uma temporada, com filtros opcionais de
 * tipo e intervalo de datas.
 */
async function findBySeason(seasonId, { type, from, to } = {}) {
  const conditions = ['season_id = $1'];
  const params = [seasonId];
 
  if (type) {
    params.push(type);
    conditions.push(`type = $${params.length}`);
  }
  if (from) {
    params.push(from);
    conditions.push(`event_date >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    conditions.push(`event_date <= $${params.length}`);
  }
 
  const sql = `
    SELECT * FROM events
    WHERE ${conditions.join(' AND ')}
    ORDER BY event_date ASC, event_time ASC
  `;
  const { rows } = await query(sql, params);
  return rows;
}
 
async function findById(id) {
  const sql = `SELECT * FROM events WHERE id = $1`;
  const { rows } = await query(sql, [id]);
  return rows[0] || null;
}
 
async function update(id, fields) {
  const { title, location, eventDate, eventTime, opponent, trainingKind, description } = fields;
  const sql = `
    UPDATE events SET
      title = COALESCE($1, title),
      location = COALESCE($2, location),
      event_date = COALESCE($3, event_date),
      event_time = COALESCE($4, event_time),
      opponent = COALESCE($5, opponent),
      training_kind = COALESCE($6, training_kind),
      description = COALESCE($7, description)
    WHERE id = $8
    RETURNING *
  `;
  const { rows } = await query(sql, [
    title,
    location,
    eventDate,
    eventTime,
    opponent,
    trainingKind,
    description,
    id,
  ]);
  return rows[0] || null;
}
 
async function remove(id) {
  await query('DELETE FROM events WHERE id = $1', [id]);
}
 
module.exports = { create, findBySeason, findById, update, remove };
