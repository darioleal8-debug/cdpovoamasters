/**
 * src/validators/chat.validator.js
 * ---------------------------------------------------------
 * Esquema de validação para envio de mensagens no chat.
 * ---------------------------------------------------------
 */
 
const { z } = require('zod');
 
const createMessageSchema = z.object({
  content: z
    .string({ required_error: 'O conteúdo da mensagem é obrigatório.' })
    .trim()
    .min(1, 'A mensagem não pode estar vazia.')
    .max(2000, 'A mensagem não pode exceder 2000 caracteres.'),
});
 
const listMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  before: z.string().datetime().optional(), // paginação: mensagens antes deste timestamp
});
 
module.exports = { createMessageSchema, listMessagesQuerySchema };
