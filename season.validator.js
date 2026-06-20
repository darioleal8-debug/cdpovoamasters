/**
 * src/validators/season.validator.js
 * ---------------------------------------------------------
 * Esquemas de validação para criação/edição de temporadas.
 * ---------------------------------------------------------
 */
 
const { z } = require('zod');
const { SEASON_STATUS } = require('../config/constants');
 
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'A data deve estar no formato AAAA-MM-DD.');
 
const createSeasonSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    year: z.string().trim().min(4).max(9), // ex: "2025/2026"
    start_date: dateString,
    end_date: dateString,
    status: z.enum(Object.values(SEASON_STATUS)).optional(),
  })
  .refine((data) => new Date(data.end_date) >= new Date(data.start_date), {
    message: 'A data de fim deve ser posterior ou igual à data de início.',
    path: ['end_date'],
  });
 
const updateSeasonSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    year: z.string().trim().min(4).max(9).optional(),
    start_date: dateString.optional(),
    end_date: dateString.optional(),
  })
  .refine(
    (data) =>
      !data.start_date || !data.end_date || new Date(data.end_date) >= new Date(data.start_date),
    {
      message: 'A data de fim deve ser posterior ou igual à data de início.',
      path: ['end_date'],
    }
  );
 
module.exports = { createSeasonSchema, updateSeasonSchema };
