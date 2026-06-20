/**
 * src/middlewares/authorize.js
 * ---------------------------------------------------------
 * Middleware de autorização por nível de acesso (role).
 * Deve ser usado SEMPRE depois de "authenticate", já que
 * depende de req.user estar preenchido.
 * ---------------------------------------------------------
 * Uso:
 *   router.post('/', authenticate, authorize('admin'), controller.create)
 *   router.put('/', authenticate, authorize('admin', 'treinador'), controller.update)
 * ---------------------------------------------------------
 */
 
const AppError = require('../utils/AppError');
 
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Não autenticado.', 401));
    }
 
    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError('Não tens permissões suficientes para esta ação.', 403)
      );
    }
 
    next();
  };
}
 
module.exports = authorize;
