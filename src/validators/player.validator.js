/**
 * src/validators/player.validator.js
 * ---------------------------------------------------------
 * Esquemas de validação para o perfil de plantel de um
 * jogador numa temporada (número, posição, altura, idade).
 * A fotografia é tratada pelo multer, não pelo Zod.
 * ---------------------------------------------------------
 */
 
const { z } = require('zod');
const { PLAYER_POSITION } = require('../config/constants');
 
const upsertPlayerProfileSchema = z.object({
  jersey_number: z.coerce.number().int().min(0).max(99).optional(),
  position: z.enum(Object.values(PLAYER_POSITION)).optional(),
  height_cm: z.coerce.number().int().min(100).max(260).optional(),
  age: z.coerce.number().int().min(10).max(100).optional(),
});
 
module.exports = { upsertPlayerProfileSchema };
