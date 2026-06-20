/**
 * src/controllers/season.controller.js
 * ---------------------------------------------------------
 * Controladores HTTP para gestão de temporadas.
 * ---------------------------------------------------------
 */

const seasonService = require('../services/season.service');
const catchAsync = require('../utils/catchAsync');

/**
 * GET /api/seasons
 * Lista todas as temporadas (ativa + histórico). Qualquer autenticado.
 */
const list = catchAsync(async (req, res) => {
  const seasons = await seasonService.list();
  res.status(200).json({ sucesso: true, dados: seasons });
});

/**
 * GET /api/seasons/active
 * Devolve a temporada atualmente ativa.
 */
const getActive = catchAsync(async (req, res) => {
  const season = await seasonService.getActive();
  res.status(200).json({ sucesso: true, dados: season });
});

/**
 * GET /api/seasons/:id
 */
const getById = catchAsync(async (req, res) => {
  const season = await seasonService.getById(req.params.id);
  res.status(200).json({ sucesso: true, dados: season });
});

/**
 * POST /api/seasons
 * Cria nova temporada. Apenas Admin.
 */
const create = catchAsync(async (req, res) => {
  const season = await seasonService.create(req.body);

  res.status(201).json({
    sucesso: true,
    mensagem: 'Temporada criada com sucesso.',
    dados: season,
  });
});

/**
 * PATCH /api/seasons/:id
 * Edita dados de uma temporada (nome, datas...). Apenas Admin.
 */
const update = catchAsync(async (req, res) => {
  const season = await seasonService.update(req.params.id, req.body);

  res.status(200).json({
    sucesso: true,
    mensagem: 'Temporada atualizada com sucesso.',
    dados: season,
  });
});

/**
 * PATCH /api/seasons/:id/activate
 * Define esta temporada como a ATIVA (arquiva a anterior). Apenas Admin.
 */
const activate = catchAsync(async (req, res) => {
  const season = await seasonService.setActive(req.params.id);

  res.status(200).json({
    sucesso: true,
    mensagem: `Temporada "${season.name}" definida como ativa.`,
    dados: season,
  });
});

/**
 * PATCH /api/seasons/:id/archive
 * Arquiva manualmente uma temporada. Apenas Admin.
 */
const archive = catchAsync(async (req, res) => {
  const season = await seasonService.archive(req.params.id);

  res.status(200).json({
    sucesso: true,
    mensagem: `Temporada "${season.name}" arquivada.`,
    dados: season,
  });
});

module.exports = { list, getActive, getById, create, update, activate, archive };
