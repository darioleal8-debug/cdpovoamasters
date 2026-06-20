/**
 * src/services/auth.service.js
 * ---------------------------------------------------------
 * Lógica de negócio para autenticação: registo público de
 * jogadores (sempre pendentes), login, e emissão/renovação
 * de tokens JWT (access + refresh).
 * ---------------------------------------------------------
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const userModel = require('../models/user.model');
const refreshTokenModel = require('../models/refreshToken.model');
const AppError = require('../utils/AppError');
const { ROLES, USER_STATUS } = require('../config/constants');

const SALT_ROUNDS = 12;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

async function generateRefreshToken(user) {
  const rawToken = crypto.randomBytes(48).toString('hex');
  const tokenHash = hashToken(rawToken);

  const expiresInDays = parseInt(process.env.JWT_REFRESH_EXPIRES_IN, 10) || 30;
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  await refreshTokenModel.create({ userId: user.id, tokenHash, expiresAt });

  return rawToken;
}

/**
 * Registo público — usado apenas para criar contas de JOGADOR.
 * A conta nasce sempre com status "pendente": só fica utilizável
 * depois de um Administrador a validar.
 */
async function register({ name, email, password }) {
  const existing = await userModel.findByEmail(email);
  if (existing) {
    throw new AppError('Já existe uma conta registada com este email.', 409);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await userModel.create({
    name,
    email,
    passwordHash,
    role: ROLES.JOGADOR,
    status: USER_STATUS.PENDENTE,
  });

  return user;
}

async function login({ email, password }) {
  const user = await userModel.findByEmail(email);

  // Mensagem genérica de propósito (não revelar se o email existe ou não)
  const invalidCredentialsError = new AppError('Email ou password incorretos.', 401);

  if (!user) throw invalidCredentialsError;

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) throw invalidCredentialsError;

  if (user.status === USER_STATUS.PENDENTE) {
    throw new AppError(
      'A tua conta ainda está pendente de validação por um administrador.',
      403
    );
  }

  if (user.status === USER_STATUS.REJEITADO) {
    throw new AppError('O teu pedido de registo foi rejeitado. Contacta o clube.', 403);
  }

  if (user.status === USER_STATUS.INATIVO) {
    throw new AppError('A tua conta está inativa. Contacta um administrador.', 403);
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = await generateRefreshToken(user);

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
    },
  };
}

/**
 * Troca um refresh token válido por um novo par de tokens
 * (rotação de refresh token, mais seguro do que reutilizar o mesmo).
 */
async function refresh(refreshTokenRaw) {
  const tokenHash = hashToken(refreshTokenRaw);
  const stored = await refreshTokenModel.findValidByHash(tokenHash);

  if (!stored) {
    throw new AppError('Refresh token inválido ou expirado. Inicia sessão novamente.', 401);
  }

  const user = await userModel.findById(stored.user_id);
  if (!user || user.status !== USER_STATUS.ATIVO) {
    throw new AppError('Conta não disponível.', 401);
  }

  // Revoga o token usado e emite um novo (rotação)
  await refreshTokenModel.revokeByHash(tokenHash);

  const accessToken = generateAccessToken(user);
  const newRefreshToken = await generateRefreshToken(user);

  return { accessToken, refreshToken: newRefreshToken };
}

async function logout(refreshTokenRaw) {
  const tokenHash = hashToken(refreshTokenRaw);
  await refreshTokenModel.revokeByHash(tokenHash);
}

module.exports = { register, login, refresh, logout };
