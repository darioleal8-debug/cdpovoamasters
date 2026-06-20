/**
 * src/models/refreshToken.model.js
 * ---------------------------------------------------------
 * Acesso à tabela "refresh_tokens", usada para renovação
 * de sessões JWT sem exigir novo login constantemente.
 * ---------------------------------------------------------
 */
 
const { query } = require('../config/database');
 
async function create({ userId, tokenHash, expiresAt }) {
  const sql = `
    INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
    VALUES ($1, $2, $3)
    RETURNING id, user_id, expires_at
  `;
  const { rows } = await query(sql, [userId, tokenHash, expiresAt]);
  return rows[0];
}
 
async function findValidByHash(tokenHash) {
  const sql = `
    SELECT * FROM refresh_tokens
    WHERE token_hash = $1 AND revoked = false AND expires_at > now()
  `;
  const { rows } = await query(sql, [tokenHash]);
  return rows[0] || null;
}
 
async function revokeByHash(tokenHash) {
  await query('UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1', [tokenHash]);
}
 
async function revokeAllForUser(userId) {
  await query('UPDATE refresh_tokens SET revoked = true WHERE user_id = $1', [userId]);
}
 
module.exports = { create, findValidByHash, revokeByHash, revokeAllForUser };
