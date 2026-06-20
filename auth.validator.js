/**
 * src/validators/auth.validator.js
 * ---------------------------------------------------------
 * Esquemas de validação de entrada para autenticação.
 * ---------------------------------------------------------
 */
 
const { z } = require('zod');
 
// Registo público: qualquer pessoa pode criar conta de JOGADOR.
// A conta nasce sempre "pendente" — o role e status nunca vêm do cliente.
const registerSchema = z.object({
  name: z
    .string({ required_error: 'O nome é obrigatório.' })
    .trim()
    .min(2, 'O nome deve ter pelo menos 2 caracteres.')
    .max(120),
  email: z
    .string({ required_error: 'O email é obrigatório.' })
    .trim()
    .toLowerCase()
    .email('Email inválido.')
    .max(160),
  password: z
    .string({ required_error: 'A password é obrigatória.' })
    .min(8, 'A password deve ter pelo menos 8 caracteres.')
    .max(72, 'A password não pode exceder 72 caracteres.'),
});
 
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email inválido.'),
  password: z.string().min(1, 'A password é obrigatória.'),
});
 
const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'O refresh token é obrigatório.'),
});
 
module.exports = { registerSchema, loginSchema, refreshSchema };
