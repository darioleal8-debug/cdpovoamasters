/**
 * src/utils/catchAsync.js
 * ---------------------------------------------------------
 * Envolve funções de controlador assíncronas para que
 * qualquer erro (rejeição de Promise) seja automaticamente
 * passado ao next(), chegando ao middleware de erro global,
 * sem precisar de try/catch repetido em cada controlador.
 * ---------------------------------------------------------
 */
 
function catchAsync(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
 
module.exports = catchAsync;
