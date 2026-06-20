/**
 * src/validators/user.validator.js
 * ---------------------------------------------------------
 * Esquemas de validação para gestão administrativa de
 * utilizadores: criação de treinadores, promoção/demoção,
 * validação de contas pendentes.
 * ---------------------------------------------------------
 */
 
const { z } = require('zod');
const { ROLES, USER_STATUS } = require('../config/constants');
 
// Apenas o Administrador usa este esquema para criar diretamente
// uma conta de Treinador (já ativa, sem passar por validação).
const createCoachSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(72),
});
 
// Alterar o role de um utilizador (promover/demover)
const changeRoleSchema = z.object({
  role: z.enum([ROLES.ADMIN, ROLES.TREINADOR, ROLES.JOGADOR], {
    errorMap: () => ({ message: `O role deve ser um de: ${Object.values(ROLES).join(', ')}` }),
  }),
});
 
// Validar (aprovar/rejeitar) conta de jogador pendente
const reviewAccountSchema = z.object({
  status: z.enum([USER_STATUS.ATIVO, USER_STATUS.REJEITADO], {
    errorMap: () => ({ message: 'O estado deve ser "ativo" ou "rejeitado".' }),
  }),
});
 
// Alterar estado genérico de conta (ex: inativar)
const changeStatusSchema = z.object({
  status: z.enum(Object.values(USER_STATUS)),
});
 
// O próprio utilizador a editar nome/email
const updateOwnProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().toLowerCase().email().optional(),
  })
  .refine((data) => data.name !== undefined || data.email !== undefined, {
    message: 'Deves fornecer pelo menos um campo para atualizar (name ou email).',
  });
 
// O próprio utilizador a alterar a sua password
const changeOwnPasswordSchema = z.object({
  currentPassword: z.string().min(1, 'A password atual é obrigatória.'),
  newPassword: z.string().min(8, 'A nova password deve ter pelo menos 8 caracteres.').max(72),
});
 
module.exports = {
  createCoachSchema,
  changeRoleSchema,
  reviewAccountSchema,
  changeStatusSchema,
  updateOwnProfileSchema,
  changeOwnPasswordSchema,
};
