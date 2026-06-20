/**
 * src/middlewares/validate.js
 * ---------------------------------------------------------
 * Middleware genérico que valida req.body, req.params ou
 * req.query contra um esquema Zod. Em caso de erro, devolve
 * 422 com a lista detalhada de problemas encontrados.
 * ---------------------------------------------------------
 * Uso nas rotas:
 *   router.post('/', validate(createSeasonSchema), controller.create)
 *   router.get('/', validate(listEventsQuerySchema, 'query'), controller.list)
 * ---------------------------------------------------------
 */
 
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
 
    if (!result.success) {
      const issues = result.error.issues.map((issue) => ({
        campo: issue.path.join('.') || source,
        mensagem: issue.message,
      }));
 
      return res.status(422).json({
        sucesso: false,
        mensagem: 'Dados de entrada inválidos.',
        erros: issues,
      });
    }
 
    // Substitui os dados originais pelos dados validados/transformados
    // (ex: trim, lowercase, coerção de tipos já aplicados pelo Zod)
    req[source] = result.data;
    next();
  };
}
 
module.exports = validate;
