/**
 * src/middlewares/authenticate.js
 * ---------------------------------------------------------
 * Verifica o token JWT enviado no cabeçalho Authorization
 * ("Bearer <token>"), e anexa os dados do utilizador
 * autenticado a req.user para uso posterior nas rotas.
 * ---------------------------------------------------------
 */
 
const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');
const { USER_STATUS } = require('../config/constants');
const userService = require('../services/user.service');
 
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
 
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Token de autenticação não fornecido.', 401);
    }
 
    const token = authHeader.split(' ')[1];
 
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new AppError('O token expirou. Por favor, autentica-te novamente.', 401);
      }
      throw new AppError('Token inválido.', 401);
    }
 
    // Vai à base de dados confirmar que o utilizador ainda existe e está ativo.
    // Isto evita que um utilizador entretanto desativado continue a usar um
    // token antigo que ainda não expirou.
    const user = await userService.findById(payload.sub);
 
    if (!user) {
      throw new AppError('Utilizador não encontrado.', 401);
    }
 
    if (user.status !== USER_STATUS.ATIVO) {
      throw new AppError('A tua conta não está ativa. Contacta um administrador.', 403);
    }
 
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
    };
 
    next();
  } catch (err) {
    next(err);
  }
}
 
module.exports = authenticate;
