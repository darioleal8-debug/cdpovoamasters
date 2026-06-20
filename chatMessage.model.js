/**
 * src/models/chatMessage.model.js
 * ---------------------------------------------------------
 * Acesso à tabela "chat_messages" (chat interno).
 * ---------------------------------------------------------
 */
 
const { query } = require('../config/database');
 
async function create({ authorId, content }) {
  const sql = `
    INSERT INTO chat_messages (author_id, content)
    VALUES ($1, $2)
    RETURNING *
  `;
  const { rows } = await query(sql, [authorId, content]);
  return rows[0];
}
 
/**
 * Lista mensagens por ordem cronológica (mais antigas primeiro),
 * já com o nome do autor incluído. Suporta paginação simples
 * por cursor (timestamp) e limite de resultados.
 */
async function findAll({ limit = 50, before } = {}) {
  const conditions = [];
  const params = [];
 
  if (before) {
    params.push(before);
    conditions.push(`cm.created_at < $${params.length}`);
  }
 
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
 
  params.push(limit);
 
  const sql = `
    SELECT cm.id, cm.content, cm.created_at,
           u.id AS author_id, u.name AS author_name, u.role AS author_role
    FROM chat_messages cm
    JOIN users u ON u.id = cm.author_id
    ${whereClause}
    ORDER BY cm.created_at DESC
    LIMIT $${params.length}
  `;
  const { rows } = await query(sql, params);
 
  // Devolve em ordem cronológica ascendente (mais antiga primeiro)
  return rows.reverse();
}
 
module.exports = { create, findAll };
