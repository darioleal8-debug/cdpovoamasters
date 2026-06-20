/**
 * src/controllers/event.controller.js
 * ---------------------------------------------------------
 * Controladores HTTP para o calendário: jogos, treinos e
 * outros eventos, organizados por temporada.
 * Rotas montadas sob /api/seasons/:seasonId/events
 * ---------------------------------------------------------
 */

const eventService = require('../services/event.service');
const catchAsync = require('../utils/catchAsync');

/**
 * POST /api/seasons/:seasonId/events/games
 * Admin e Treinador.
 */
const createGame = catchAsync(async (req, res) => {
  const event = await eventService.createGame(req.params.seasonId, req.body, req.user.id);

  res.status(201).json({
    sucesso: true,
    mensagem: 'Jogo criado com sucesso.',
    dados: event,
  });
});

/**
 * POST /api/seasons/:seasonId/events/trainings
 * Admin e Treinador.
 */
const createTraining = catchAsync(async (req, res) => {
  const event = await eventService.createTraining(req.params.seasonId, req.body, req.user.id);

  res.status(201).json({
    sucesso: true,
    mensagem: 'Treino criado com sucesso.',
    dados: event,
  });
});

/**
 * POST /api/seasons/:seasonId/events/others
 * Admin e Treinador.
 */
const createOtherEvent = catchAsync(async (req, res) => {
  const event = await eventService.createOtherEvent(req.params.seasonId, req.body, req.user.id);

  res.status(201).json({
    sucesso: true,
    mensagem: 'Evento criado com sucesso.',
    dados: event,
  });
});

/**
 * GET /api/seasons/:seasonId/events
 * Query params opcionais: ?type=jogo&from=AAAA-MM-DD&to=AAAA-MM-DD
 * Qualquer utilizador autenticado pode consultar.
 */
const listBySeason = catchAsync(async (req, res) => {
  const events = await eventService.listBySeason(req.params.seasonId, req.query);
  res.status(200).json({ sucesso: true, dados: events });
});

/**
 * GET /api/seasons/:seasonId/events/:eventId
 */
const getById = catchAsync(async (req, res) => {
  const event = await eventService.getById(req.params.eventId);
  res.status(200).json({ sucesso: true, dados: event });
});

/**
 * PATCH /api/seasons/:seasonId/events/:eventId
 * Admin e Treinador.
 */
const update = catchAsync(async (req, res) => {
  const event = await eventService.update(req.params.eventId, req.body);

  res.status(200).json({
    sucesso: true,
    mensagem: 'Evento atualizado com sucesso.',
    dados: event,
  });
});

/**
 * DELETE /api/seasons/:seasonId/events/:eventId
 * Admin e Treinador.
 */
const remove = catchAsync(async (req, res) => {
  await eventService.remove(req.params.eventId);

  res.status(200).json({
    sucesso: true,
    mensagem: 'Evento removido com sucesso.',
  });
});

module.exports = {
  createGame,
  createTraining,
  createOtherEvent,
  listBySeason,
  getById,
  update,
  remove,
};
