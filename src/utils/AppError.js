/**
 * src/utils/AppError.js
 * ---------------------------------------------------------
 * Erro de aplicação com código HTTP associado. Lançado nos
 * serviços/controladores e capturado pelo middleware de
 * erro global, garantindo respostas consistentes ao cliente.
 * ---------------------------------------------------------
 */
 
class AppError extends Error {
  /**
   * @param {string} message - mensagem amigável para o cliente
   * @param {number} statusCode - código HTTP (400, 401, 403, 404, 409...)
   * @param {object|null} details - detalhes extra opcionais (ex: erros de validação)
   */
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true; // distingue de bugs inesperados
  }
}
 
module.exports = AppError;
