import { ApiError } from './errors.js';

/** Replaces req[source] with the parsed value, or rejects with a 400 listing the bad fields. */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || source,
        message: issue.message,
      }));
      return next(new ApiError(400, 'validation_failed', 'Request validation failed', details));
    }
    req[source] = result.data;
    return next();
  };
}
