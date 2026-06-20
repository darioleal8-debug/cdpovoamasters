/**
 * src/middlewares/errorHandler.js
 * ---------------------------------------------------------
 * Middleware de erro global. Captura tanto AppError
 * (erros "esperados", como 400/401/403/404) como erros
 * inesperados (bugs, falhas de BD), devolvendo sempre uma
 * resposta JSON consistente.
 * ---------------------------------------------------------
 */
 
const AppError = require('../utils/AppError');
 
// Mapeia códigos de erro comuns do PostgreSQL para mensagens amigáveis
function mapDatabaseError(err) {
  // unique_violation
  if (err.code === '23505') {
    return new AppError('Já existe um registo com estes dados (violação de unicidade).', 409);
  }
  // foreign_key_violation
  if (err.code === '23503') {
    return new AppError('Referência inválida: o registo relacionado não existe.', 400);
  }
  // check_violation
  if (err.code === '23514') {
    return new AppError('Os dados não cumprem as regras de validação da base de dados.', 400);
  }
  return null;
}
 
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let error = err;
 
  // Se for um erro "cru" do driver do PostgreSQL, tenta traduzi-lo
  if (!(error instanceof AppError) && error.code) {
    const mapped = mapDatabaseError(error);
    if (mapped) error = mapped;
  }
 
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      sucesso: false,
      mensagem: error.message,
      ...(error.details ? { erros: error.details } : {}),
    });
  }
 
  // Erro não esperado: regista no log do servidor, mas não expõe detalhes internos
  console.error('Erro inesperado:', error);
 
  return res.status(500).json({
    sucesso: false,
    mensagem: 'Ocorreu um erro interno no servidor.',
  });
}
 
module.exports = errorHandler;
