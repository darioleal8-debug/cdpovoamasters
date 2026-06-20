/**
 * src/services/user.service.js
 * ---------------------------------------------------------
 * Lógica de negócio para gestão de utilizadores:
 *  - listar / validar contas pendentes de jogador
 *  - criação de contas de treinador (apenas admin)
 *  - promoção / demoção de roles (apenas admin)
 *  - edição de perfil próprio
 * ---------------------------------------------------------
 */

const bcrypt = require('bcrypt');
const userModel = require('../models/user.model');
const AppError = require('../utils/AppError');
const { ROLES, USER_STATUS } = require('../config/constants');

const SALT_ROUNDS = 12;

async function findById(id) {
  return userModel.findById(id);
}

async function getPublicProfile(id) {
  const user = await userModel.findPublicById(id);
  if (!user) throw new AppError('Utilizador não encontrado.', 404);
  return user;
}

async function list({ role, status }) {
  return userModel.findAll({ role, status });
}

/**
 * Apenas Administradores podem criar diretamente contas de
 * Treinador — já nascem ativas, sem necessidade de validação.
 */
async function createCoach({ name, email, password }) {
  const existing = await userModel.findByEmail(email);
  if (existing) {
    throw new AppError('Já existe uma conta registada com este email.', 409);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  return userModel.create({
    name,
    email,
    passwordHash,
    role: ROLES.TREINADOR,
    status: USER_STATUS.ATIVO,
  });
}

/**
 * Aprova ou rejeita uma conta de jogador pendente.
 */
async function reviewAccount(userId, status) {
  const user = await userModel.findById(userId);
  if (!user) throw new AppError('Utilizador não encontrado.', 404);

  if (user.status !== USER_STATUS.PENDENTE) {
    throw new AppError('Esta conta já foi avaliada anteriormente.', 409);
  }

  return userModel.updateStatus(userId, status);
}

/**
 * Promove ou demove o nível de acesso de um utilizador.
 * Apenas chamado por Administradores (garantido na rota).
 */
async function changeRole(userId, newRole, actingAdminId) {
  const user = await userModel.findById(userId);
  if (!user) throw new AppError('Utilizador não encontrado.', 404);

  if (user.id === actingAdminId && newRole !== ROLES.ADMIN) {
    throw new AppError('Não podes remover o teu próprio nível de Administrador.', 400);
  }

  return userModel.updateRole(userId, newRole);
}

async function changeStatus(userId, status) {
  const user = await userModel.findById(userId);
  if (!user) throw new AppError('Utilizador não encontrado.', 404);
  return userModel.updateStatus(userId, status);
}

async function updateOwnProfile(userId, { name, email }) {
  if (email) {
    const existing = await userModel.findByEmail(email);
    if (existing && existing.id !== userId) {
      throw new AppError('Este email já está a ser usado por outra conta.', 409);
    }
  }
  return userModel.updateProfile(userId, { name, email });
}

async function changeOwnPassword(userId, currentPassword, newPassword) {
  const user = await userModel.findById(userId);
  if (!user) throw new AppError('Utilizador não encontrado.', 404);

  const matches = await bcrypt.compare(currentPassword, user.password_hash);
  if (!matches) {
    throw new AppError('A password atual está incorreta.', 401);
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await userModel.updatePassword(userId, passwordHash);
}

module.exports = {
  findById,
  getPublicProfile,
  list,
  createCoach,
  reviewAccount,
  changeRole,
  changeStatus,
  updateOwnProfile,
  changeOwnPassword,
};
