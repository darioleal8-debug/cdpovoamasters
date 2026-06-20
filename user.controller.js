/**
 * src/controllers/user.controller.js
 * ---------------------------------------------------------
 * Controladores HTTP para gestão de utilizadores.
 * ---------------------------------------------------------
 */

const userService = require('../services/user.service');
const catchAsync = require('../utils/catchAsync');

/**
 * GET /api/users
 * Query params opcionais: ?role=jogador&status=pendente
 * Apenas Admin.
 */
const list = catchAsync(async (req, res) => {
  const { role, status } = req.query;
  const users = await userService.list({ role, status });

  res.status(200).json({ sucesso: true, dados: users });
});

/**
 * GET /api/users/:id
 * Admin e Treinador podem consultar qualquer utilizador.
 */
const getById = catchAsync(async (req, res) => {
  const user = await userService.getPublicProfile(req.params.id);
  res.status(200).json({ sucesso: true, dados: user });
});

/**
 * POST /api/users/coaches
 * Apenas Admin pode criar contas de Treinador (já ativas).
 */
const createCoach = catchAsync(async (req, res) => {
  const coach = await userService.createCoach(req.body);

  res.status(201).json({
    sucesso: true,
    mensagem: 'Conta de treinador criada com sucesso.',
    dados: coach,
  });
});

/**
 * PATCH /api/users/:id/review
 * Aprova ou rejeita uma conta de jogador pendente. Apenas Admin.
 */
const reviewAccount = catchAsync(async (req, res) => {
  const user = await userService.reviewAccount(req.params.id, req.body.status);

  res.status(200).json({
    sucesso: true,
    mensagem: `Conta marcada como "${req.body.status}".`,
    dados: user,
  });
});

/**
 * PATCH /api/users/:id/role
 * Promove/demove o nível de acesso. Apenas Admin.
 */
const changeRole = catchAsync(async (req, res) => {
  const user = await userService.changeRole(req.params.id, req.body.role, req.user.id);

  res.status(200).json({
    sucesso: true,
    mensagem: `Nível de acesso atualizado para "${req.body.role}".`,
    dados: user,
  });
});

/**
 * PATCH /api/users/:id/status
 * Ativa/inativa uma conta. Apenas Admin.
 */
const changeStatus = catchAsync(async (req, res) => {
  const user = await userService.changeStatus(req.params.id, req.body.status);

  res.status(200).json({
    sucesso: true,
    mensagem: `Estado da conta atualizado para "${req.body.status}".`,
    dados: user,
  });
});

/**
 * PATCH /api/users/me
 * O próprio utilizador edita o seu nome/email.
 */
const updateOwnProfile = catchAsync(async (req, res) => {
  const user = await userService.updateOwnProfile(req.user.id, req.body);

  res.status(200).json({
    sucesso: true,
    mensagem: 'Perfil atualizado com sucesso.',
    dados: user,
  });
});

/**
 * PATCH /api/users/me/password
 * O próprio utilizador altera a sua password.
 */
const changeOwnPassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  await userService.changeOwnPassword(req.user.id, currentPassword, newPassword);

  res.status(200).json({
    sucesso: true,
    mensagem: 'Password atualizada com sucesso.',
  });
});

module.exports = {
  list,
  getById,
  createCoach,
  reviewAccount,
  changeRole,
  changeStatus,
  updateOwnProfile,
  changeOwnPassword,
};
