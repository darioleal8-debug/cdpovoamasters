/**
 * src/models/playerProfile.model.js
 * ---------------------------------------------------------
 * Acesso à tabela "player_profiles" (dados de plantel de
 * um jogador numa temporada específica).
 * ---------------------------------------------------------
 */
 
const { query } = require('../config/database');
 
/**
 * Lista o plantel completo de uma temporada, já incluindo
 * o nome e email do utilizador associado a cada perfil.
 */
async function findBySeason(seasonId) {
  const sql = `
    SELECT pp.*, u.name AS player_name, u.email AS player_email
    FROM player_profiles pp
    JOIN users u ON u.id = pp.user_id
    WHERE pp.season_id = $1
    ORDER BY pp.jersey_number ASC NULLS LAST, u.name ASC
  `;
  const { rows } = await query(sql, [seasonId]);
  return rows;
}
 
async function findByUserAndSeason(userId, seasonId) {
  const sql = `
    SELECT pp.*, u.name AS player_name, u.email AS player_email
    FROM player_profiles pp
    JOIN users u ON u.id = pp.user_id
    WHERE pp.user_id = $1 AND pp.season_id = $2
  `;
  const { rows } = await query(sql, [userId, seasonId]);
  return rows[0] || null;
}
 
async function findById(id) {
  const sql = `SELECT * FROM player_profiles WHERE id = $1`;
  const { rows } = await query(sql, [id]);
  return rows[0] || null;
}
 
/**
 * Cria o perfil de plantel se não existir, ou atualiza os
 * campos fornecidos se já existir (upsert por user_id+season_id).
 */
async function upsert(userId, seasonId, fields) {
  const { jerseyNumber, position, heightCm, age } = fields;
 
  const sql = `
    INSERT INTO player_profiles (user_id, season_id, jersey_number, position, height_cm, age)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (user_id, season_id)
    DO UPDATE SET
      jersey_number = COALESCE(EXCLUDED.jersey_number, player_profiles.jersey_number),
      position      = COALESCE(EXCLUDED.position, player_profiles.position),
      height_cm     = COALESCE(EXCLUDED.height_cm, player_profiles.height_cm),
      age           = COALESCE(EXCLUDED.age, player_profiles.age)
    RETURNING *
  `;
  const { rows } = await query(sql, [userId, seasonId, jerseyNumber, position, heightCm, age]);
  return rows[0];
}
 
async function updatePhoto(id, photoPath) {
  const sql = `UPDATE player_profiles SET photo_path = $1 WHERE id = $2 RETURNING *`;
  const { rows } = await query(sql, [photoPath, id]);
  return rows[0] || null;
}
 
async function remove(id) {
  await query('DELETE FROM player_profiles WHERE id = $1', [id]);
}
 
module.exports = {
  findBySeason,
  findByUserAndSeason,
  findById,
  upsert,
  updatePhoto,
  remove,
};
