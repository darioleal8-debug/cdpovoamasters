/**
 * src/validators/event.validator.js
 * ---------------------------------------------------------
 * Esquemas de validação para eventos de calendário:
 * jogos, treinos e outros eventos.
 * ---------------------------------------------------------
 */
 
const { z } = require('zod');
const { EVENT_TYPE } = require('../config/constants');
 
const baseEventFields = {
  title: z.string().trim().min(2).max(160),
  location: z.string().trim().min(2).max(200),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (AAAA-MM-DD).'),
  event_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Hora inválida (HH:MM).'),
  description: z.string().trim().max(2000).optional().nullable(),
};
 
// type é fixo de acordo com a rota (jogo / treino / outro), por isso
// cada esquema específico injeta o campo correto.
const createGameSchema = z.object({
  ...baseEventFields,
  opponent: z.string().trim().min(1).max(160),
});
 
const createTrainingSchema = z.object({
  ...baseEventFields,
  training_kind: z.string().trim().min(1).max(80),
});
 
const createOtherEventSchema = z.object({
  ...baseEventFields,
});
 
// Para updates, todos os campos são opcionais
const updateEventSchema = z.object({
  title: z.string().trim().min(2).max(160).optional(),
  location: z.string().trim().min(2).max(200).optional(),
  event_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (AAAA-MM-DD).')
    .optional(),
  event_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Hora inválida (HH:MM).')
    .optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  opponent: z.string().trim().max(160).optional().nullable(),
  training_kind: z.string().trim().max(80).optional().nullable(),
});
 
// Query params para filtrar o calendário (?type=jogo&from=...&to=...)
const listEventsQuerySchema = z.object({
  type: z.enum(Object.values(EVENT_TYPE)).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
 
module.exports = {
  createGameSchema,
  createTrainingSchema,
  createOtherEventSchema,
  updateEventSchema,
  listEventsQuerySchema,
};
