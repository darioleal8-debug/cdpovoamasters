/**
 * src/controllers/auth.controller.js
 * ---------------------------------------------------------
 * Controladores HTTP para autenticação: registo, login,
 * refresh e logout. Apenas traduzem request <-> service;
 * a lógica de negócio vive em auth.service.js.
 * ---------------------------------------------------------
 */

const authService = require('../services/auth.service');
const catchAsync = require('../utils/catchAsync');

/**
 * POST /api/auth/register
 * Registo público — cria sempre uma conta de JOGADOR pendente.
 */
const register = catchAsync(async (req, res) => {
  const user = await authService.register(req.body);

  res.status(201).json({
    sucesso: true,
    mensagem: 'Conta criada com sucesso. Aguarda validação por um administrador.',
    dados: user,
  });
});

/**
 * POST /api/auth/login
 */
const login = catchAsync(async (req, res) => {
  const { accessToken, refreshToken, user } = await authService.login(req.body);

  res.status(200).json({
    sucesso: true,
    mensagem: 'Autenticação efetuada com sucesso.',
    dados: { accessToken, refreshToken, user },
  });
});

/**
 * POST /api/auth/refresh
 */
const refresh = catchAsync(async (req, res) => {
  const { accessToken, refreshToken } = await authService.refresh(req.body.refreshToken);

  res.status(200).json({
    sucesso: true,
    mensagem: 'Token renovado com sucesso.',
    dados: { accessToken, refreshToken },
  });
});

/**
 * POST /api/auth/logout
 */
const logout = catchAsync(async (req, res) => {
  await authService.logout(req.body.refreshToken);

  res.status(200).json({
    sucesso: true,
    mensagem: 'Sessão terminada com sucesso.',
  });
});

/**
 * GET /api/auth/me
 * Devolve os dados do utilizador autenticado (a partir do token).
 */
const me = catchAsync(async (req, res) => {
  res.status(200).json({
    sucesso: true,
    dados: req.user,
  });
});

module.exports = { register, login, refresh, logout, me };
