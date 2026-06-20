/**
 * src/services/event.service.js
 * ---------------------------------------------------------
 * Lógica de negócio para o calendário: jogos, treinos e
 * outros eventos, sempre associados a uma temporada.
 * ---------------------------------------------------------
 */

const eventModel = require('../models/event.model');
const seasonModel = require('../models/season.model');
const AppError = require('../utils/AppError');
const { EVENT_TYPE } = require('../config/constants');

async function ensureSeasonExists(seasonId) {
  const season = await seasonModel.findById(seasonId);
  if (!season) throw new AppError('Temporada não encontrada.', 404);
  return season;
}

async function createGame(seasonId, data, createdBy) {
  await ensureSeasonExists(seasonId);
  return eventModel.create({
    seasonId,
    type: EVENT_TYPE.JOGO,
    title: data.title,
    location: data.location,
    eventDate: data.event_date,
    eventTime: data.event_time,
    opponent: data.opponent,
    description: data.description,
    createdBy,
  });
}

async function createTraining(seasonId, data, createdBy) {
  await ensureSeasonExists(seasonId);
  return eventModel.create({
    seasonId,
    type: EVENT_TYPE.TREINO,
    title: data.title,
    location: data.location,
    eventDate: data.event_date,
    eventTime: data.event_time,
    trainingKind: data.training_kind,
    description: data.description,
    createdBy,
  });
}

async function createOtherEvent(seasonId, data, createdBy) {
  await ensureSeasonExists(seasonId);
  return eventModel.create({
    seasonId,
    type: EVENT_TYPE.OUTRO,
    title: data.title,
    location: data.location,
    eventDate: data.event_date,
    eventTime: data.event_time,
    description: data.description,
    createdBy,
  });
}

async function listBySeason(seasonId, filters) {
  await ensureSeasonExists(seasonId);
  return eventModel.findBySeason(seasonId, filters);
}

async function getById(id) {
  const event = await eventModel.findById(id);
  if (!event) throw new AppError('Evento não encontrado.', 404);
  return event;
}

async function update(id, fields) {
  await getById(id);
  return eventModel.update(id, {
    title: fields.title,
    location: fields.location,
    eventDate: fields.event_date,
    eventTime: fields.event_time,
    opponent: fields.opponent,
    trainingKind: fields.training_kind,
    description: fields.description,
  });
}

async function remove(id) {
  await getById(id);
  await eventModel.remove(id);
}

module.exports = {
  createGame,
  createTraining,
  createOtherEvent,
  listBySeason,
  getById,
  update,
  remove,
};
