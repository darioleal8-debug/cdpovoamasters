/**
 * src/services/season.service.js
 * ---------------------------------------------------------
 * Lógica de negócio para temporadas: garante que existe,
 * no máximo, uma temporada ativa de cada vez, e que ao
 * ativar uma nova, as anteriores passam automaticamente
 * a "arquivada" (histórico).
 * ---------------------------------------------------------
 */

const { pool } = require('../config/database');
const seasonModel = require('../models/season.model');
const AppError = require('../utils/AppError');
const { SEASON_STATUS } = require('../config/constants');

async function list() {
  return seasonModel.findAll();
}

async function getById(id) {
  const season = await seasonModel.findById(id);
  if (!season) throw new AppError('Temporada não encontrada.', 404);
  return season;
}

async function getActive() {
  const season = await seasonModel.findActive();
  if (!season) {
    throw new AppError('Não existe nenhuma temporada ativa configurada.', 404);
  }
  return season;
}

/**
 * Cria uma nova temporada. Se for criada já como "ativa",
 * arquiva atomicamente qualquer temporada ativa anterior
 * (usa uma transação para evitar estados inconsistentes).
 */
async function create({ name, year, start_date, end_date, status }) {
  const wantsActive = status === SEASON_STATUS.ATIVA;

  if (!wantsActive) {
    return seasonModel.create({
      name,
      year,
      startDate: start_date,
      endDate: end_date,
      status: SEASON_STATUS.ARQUIVADA,
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE seasons SET status = 'arquivada' WHERE status = 'ativa'`);
    const { rows } = await client.query(
      `INSERT INTO seasons (name, year, start_date, end_date, status)
       VALUES ($1, $2, $3, $4, 'ativa') RETURNING *`,
      [name, year, start_date, end_date]
    );
    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function update(id, fields) {
  await getById(id); // garante que existe
  return seasonModel.update(id, {
    name: fields.name,
    year: fields.year,
    startDate: fields.start_date,
    endDate: fields.end_date,
  });
}

/**
 * Define esta temporada como a ATIVA, arquivando
 * automaticamente qualquer outra que estivesse ativa.
 */
async function setActive(id) {
  await getById(id);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE seasons SET status = 'arquivada' WHERE status = 'ativa'`);
    const { rows } = await client.query(
      `UPDATE seasons SET status = 'ativa' WHERE id = $1 RETURNING *`,
      [id]
    );
    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function archive(id) {
  await getById(id);
  return seasonModel.setArchived(id);
}

module.exports = { list, getById, getActive, create, update, setActive, archive };
