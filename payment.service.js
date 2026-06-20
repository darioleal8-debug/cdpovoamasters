/**
 * src/services/payment.service.js
 * ---------------------------------------------------------
 * Lógica de negócio para pagamentos de cotas mensais.
 * Regras de acesso (quem pode ver/marcar o quê) ficam nos
 * controladores/rotas; aqui fica a lógica de dados.
 * ---------------------------------------------------------
 */

const paymentModel = require('../models/payment.model');
const userModel = require('../models/user.model');
const seasonModel = require('../models/season.model');
const AppError = require('../utils/AppError');
const { ROLES } = require('../config/constants');

async function ensurePlayerExists(userId) {
  const user = await userModel.findById(userId);
  if (!user) throw new AppError('Jogador não encontrado.', 404);
  if (user.role !== ROLES.JOGADOR) {
    throw new AppError('Só é possível criar cotas para contas de jogador.', 400);
  }
  return user;
}

async function ensureSeasonExists(seasonId) {
  const season = await seasonModel.findById(seasonId);
  if (!season) throw new AppError('Temporada não encontrada.', 404);
  return season;
}

/**
 * Cria um registo de cota mensal para um jogador, numa temporada.
 * Apenas Administrador (garantido na rota).
 */
async function create(seasonId, { user_id, month, reference_year, amount }) {
  await ensureSeasonExists(seasonId);
  await ensurePlayerExists(user_id);

  return paymentModel.create({
    userId: user_id,
    seasonId,
    month,
    referenceYear: reference_year,
    amount,
  });
}

async function getById(id) {
  const payment = await paymentModel.findById(id);
  if (!payment) throw new AppError('Pagamento não encontrado.', 404);
  return payment;
}

/**
 * Histórico de pagamentos do PRÓPRIO jogador (ou consulta
 * administrativa de um jogador específico).
 */
async function getHistory(userId, seasonId) {
  await ensureSeasonExists(seasonId);
  return paymentModel.findByUserAndSeason(userId, seasonId);
}

async function listBySeason(seasonId, filters) {
  await ensureSeasonExists(seasonId);
  return paymentModel.findBySeason(seasonId, filters);
}

async function markAsPaid(id, { paid_at }, markedBy) {
  await getById(id);
  return paymentModel.markAsPaid(id, { paidAt: paid_at || null, markedBy });
}

async function markAsPending(id) {
  await getById(id);
  return paymentModel.markAsPending(id);
}

async function update(id, fields) {
  await getById(id);
  return paymentModel.update(id, {
    amount: fields.amount,
    month: fields.month,
    referenceYear: fields.reference_year,
  });
}

async function remove(id) {
  await getById(id);
  await paymentModel.remove(id);
}

module.exports = {
  create,
  getById,
  getHistory,
  listBySeason,
  markAsPaid,
  markAsPending,
  update,
  remove,
};
