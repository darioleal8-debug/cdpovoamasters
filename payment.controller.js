/**
 * src/controllers/payment.controller.js
 * ---------------------------------------------------------
 * Controladores HTTP para pagamentos de cotas mensais.
 * Rotas montadas sob /api/seasons/:seasonId/payments
 * ---------------------------------------------------------
 */

const paymentService = require('../services/payment.service');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { ROLES } = require('../config/constants');

/**
 * POST /api/seasons/:seasonId/payments
 * Cria registo de cota mensal para um jogador. Apenas Admin.
 */
const create = catchAsync(async (req, res) => {
  const payment = await paymentService.create(req.params.seasonId, req.body);

  res.status(201).json({
    sucesso: true,
    mensagem: 'Registo de pagamento criado com sucesso.',
    dados: payment,
  });
});

/**
 * GET /api/seasons/:seasonId/payments
 * Visão geral de todos os pagamentos da temporada. Apenas Admin/Treinador.
 * Query opcional: ?status=pendente
 */
const listBySeason = catchAsync(async (req, res) => {
  const payments = await paymentService.listBySeason(req.params.seasonId, req.query);
  res.status(200).json({ sucesso: true, dados: payments });
});

/**
 * GET /api/seasons/:seasonId/payments/me
 * O próprio jogador consulta o seu histórico de pagamentos.
 */
const getOwnHistory = catchAsync(async (req, res) => {
  const payments = await paymentService.getHistory(req.user.id, req.params.seasonId);
  res.status(200).json({ sucesso: true, dados: payments });
});

/**
 * GET /api/seasons/:seasonId/payments/user/:userId
 * Admin/Treinador consulta o histórico de um jogador específico.
 */
const getHistoryForUser = catchAsync(async (req, res) => {
  const payments = await paymentService.getHistory(req.params.userId, req.params.seasonId);
  res.status(200).json({ sucesso: true, dados: payments });
});

/**
 * PATCH /api/seasons/:seasonId/payments/:paymentId/pay
 * Marca uma cota como paga. Apenas Admin.
 */
const markAsPaid = catchAsync(async (req, res) => {
  const payment = await paymentService.markAsPaid(req.params.paymentId, req.body, req.user.id);

  res.status(200).json({
    sucesso: true,
    mensagem: 'Pagamento marcado como pago.',
    dados: payment,
  });
});

/**
 * PATCH /api/seasons/:seasonId/payments/:paymentId/pending
 * Reverte uma cota para pendente. Apenas Admin.
 */
const markAsPending = catchAsync(async (req, res) => {
  const payment = await paymentService.markAsPending(req.params.paymentId);

  res.status(200).json({
    sucesso: true,
    mensagem: 'Pagamento marcado como pendente.',
    dados: payment,
  });
});

/**
 * PATCH /api/seasons/:seasonId/payments/:paymentId
 * Edita valor/mês/ano de uma cota. Apenas Admin.
 */
const update = catchAsync(async (req, res) => {
  const payment = await paymentService.update(req.params.paymentId, req.body);

  res.status(200).json({
    sucesso: true,
    mensagem: 'Pagamento atualizado com sucesso.',
    dados: payment,
  });
});

/**
 * DELETE /api/seasons/:seasonId/payments/:paymentId
 * Apenas Admin.
 */
const remove = catchAsync(async (req, res) => {
  await paymentService.remove(req.params.paymentId);

  res.status(200).json({
    sucesso: true,
    mensagem: 'Registo de pagamento removido com sucesso.',
  });
});

/**
 * Middleware auxiliar: garante que um jogador só acede ao
 * próprio histórico, exceto se for Admin/Treinador.
 * Usado na rota GET /payments/user/:userId
 */
function ensureSelfOrStaff(req, res, next) {
  const isStaff = req.user.role === ROLES.ADMIN || req.user.role === ROLES.TREINADOR;
  const isSelf = req.user.id === req.params.userId;

  if (!isStaff && !isSelf) {
    return next(new AppError('Só podes consultar o teu próprio histórico de pagamentos.', 403));
  }
  next();
}

module.exports = {
  create,
  listBySeason,
  getOwnHistory,
  getHistoryForUser,
  markAsPaid,
  markAsPending,
  update,
  remove,
  ensureSelfOrStaff,
};
