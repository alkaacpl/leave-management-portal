/**
 * Validate and replace req.body / req.query / req.params with the parsed zod output.
 * Zod errors are turned into 400 responses by the error handler.
 */
export function validate(schemas) {
  return (req, _res, next) => {
    if (schemas.params) req.params = schemas.params.parse(req.params);
    if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
    if (schemas.query) {
      // Express 5 exposes req.query as a getter, so store parsed values separately.
      req.validatedQuery = schemas.query.parse(req.query);
    }
    next();
  };
}
