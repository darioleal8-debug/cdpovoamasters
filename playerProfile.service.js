/**
 * src/services/playerProfile.service.js
 * ---------------------------------------------------------
 * Lógica de negócio para o plantel: dados de jogador
 * (posição, altura, idade, número) por temporada, e
 * gestão da fotografia associada.
 * ---------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');

const playerProfileModel = require('../models/playerProfile.model');
const userModel = require('../models/user.model');
const seasonModel = require('../models/season.model');
const AppError = require('../utils/AppError');
const { ROLES } = require('../config/constants');

async function ensureSeasonExists(seasonId) {
  const season = await seasonModel.findById(seasonId);
  if (!season) throw new AppError('Temporada não encontrada.', 404);
  return season;
}

async function ensurePlayerExists(userId) {
  const user = await userModel.findById(userId);
  if (!user) throw new AppError('Jogador não encontrado.', 404);
  if (user.role !== ROLES.JOGADOR) {
    throw new AppError('Esta conta não corresponde a um jogador.', 400);
  }
  return user;
}

async function listBySeason(seasonId) {
  await ensureSeasonExists(seasonId);
  return playerProfileModel.findBySeason(seasonId);
}

async function getByUserAndSeason(userId, seasonId) {
  await ensureSeasonExists(seasonId);
  const profile = await playerProfileModel.findByUserAndSeason(userId, seasonId);
  if (!profile) {
    throw new AppError('Este jogador ainda não tem perfil de plantel nesta temporada.', 404);
  }
  return profile;
}

/**
 * Cria/atualiza o perfil de plantel de um jogador numa temporada.
 * Usado por Admin/Treinador (qualquer jogador) ou pelo próprio
 * jogador (apenas o seu próprio perfil — validado na rota/controlador).
 */
async function upsertProfile(userId, seasonId, fields) {
  await ensureSeasonExists(seasonId);
  await ensurePlayerExists(userId);

  return playerProfileModel.upsert(userId, seasonId, {
    jerseyNumber: fields.jersey_number,
    position: fields.position,
    heightCm: fields.height_cm,
    age: fields.age,
  });
}

/**
 * Associa uma fotografia recém-enviada ao perfil de plantel.
 * Remove o ficheiro anterior do disco, se existir, para não
 * acumular ficheiros órfãos.
 */
async function updatePhoto(userId, seasonId, uploadedFile) {
  await ensureSeasonExists(seasonId);

  let profile = await playerProfileModel.findByUserAndSeason(userId, seasonId);

  if (!profile) {
    // Garante que existe um perfil base antes de associar a foto
    profile = await playerProfileModel.upsert(userId, seasonId, {});
  }

  // Remove a foto anterior, se existir, para libertar espaço em disco
  if (profile.photo_path) {
    const oldPath = path.join(process.cwd(), profile.photo_path);
    fs.unlink(oldPath, () => {
      /* ignora erro se o ficheiro já não existir */
    });
  }

  const relativePath = path.join(
    process.env.UPLOAD_DIR || 'uploads/players',
    uploadedFile.filename
  );

  return playerProfileModel.updatePhoto(profile.id, relativePath);
}

module.exports = { listBySeason, getByUserAndSeason, upsertProfile, updatePhoto };
