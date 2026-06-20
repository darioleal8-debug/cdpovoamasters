/**
 * src/controllers/playerProfile.controller.js
 * ---------------------------------------------------------
 * Controladores HTTP para o plantel (perfis de jogador por
 * temporada) e upload de fotografia.
 * Rotas montadas sob /api/seasons/:seasonId/players
 * ---------------------------------------------------------
 */

const playerProfileService = require('../services/playerProfile.service');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { ROLES } = require('../config/constants');

/**
 * GET /api/seasons/:seasonId/players
 * Lista o plantel completo da temporada. Qualquer autenticado.
 */
const listBySeason = catchAsync(async (req, res) => {
  const players = await playerProfileService.listBySeason(req.params.seasonId);
  res.status(200).json({ sucesso: true, dados: players });
});

/**
 * GET /api/seasons/:seasonId/players/:userId
 */
const getByUser = catchAsync(async (req, res) => {
  const profile = await playerProfileService.getByUserAndSeason(
    req.params.userId,
    req.params.seasonId
  );
  res.status(200).json({ sucesso: true, dados: profile });
});

/**
 * PUT /api/seasons/:seasonId/players/:userId
 * Admin/Treinador podem editar qualquer jogador.
 * Um Jogador só pode editar o seu PRÓPRIO perfil (verificado abaixo).
 */
const upsertProfile = catchAsync(async (req, res) => {
  const profile = await playerProfileService.upsertProfile(
    req.params.userId,
    req.params.seasonId,
    req.body
  );

  res.status(200).json({
    sucesso: true,
    mensagem: 'Perfil de plantel atualizado com sucesso.',
    dados: profile,
  });
});

/**
 * POST /api/seasons/:seasonId/players/:userId/photo
 * Upload de fotografia (multipart/form-data, campo "photo").
 */
const uploadPhoto = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new AppError('Nenhum ficheiro de fotografia foi enviado.', 400);
  }

  const profile = await playerProfileService.updatePhoto(
    req.params.userId,
    req.params.seasonId,
    req.file
  );

  res.status(200).json({
    sucesso: true,
    mensagem: 'Fotografia atualizada com sucesso.',
    dados: profile,
  });
});

/**
 * Middleware auxiliar: um Jogador só pode editar o seu próprio
 * perfil de plantel; Admin/Treinador podem editar qualquer um.
 */
function ensureSelfOrStaff(req, res, next) {
  const isStaff = req.user.role === ROLES.ADMIN || req.user.role === ROLES.TREINADOR;
  const isSelf = req.user.id === req.params.userId;

  if (!isStaff && !isSelf) {
    return next(new AppError('Só podes editar o teu próprio perfil de plantel.', 403));
  }
  next();
}

module.exports = { listBySeason, getByUser, upsertProfile, uploadPhoto, ensureSelfOrStaff };
