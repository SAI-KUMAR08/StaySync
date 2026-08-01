/**
 * Request validation middleware.
 *
 * Every endpoint that uses `validate()` returns the same normalized error
 * shape: `{ success, message, errors: { formErrors, fieldErrors } }` where
 * `fieldErrors` is a flat `{ fieldName: [messages] }` map (body/query/params
 * sections merged). This is the shape the frontend consumes for inline
 * field-level errors.
 */

/**
 * Build a flat `{ fieldName: [messages] }` map from a ZodError.
 *
 * Zod's `flatten()` collapses multi-level paths (e.g. "body.name") into the
 * first segment, which prevents field-level mapping. Reading `error.issues`
 * directly gives us the leaf field name (name, phone, …) that the frontend
 * uses for inline field errors.
 */
function flattenFieldErrors(error) {
  const result = {};
  for (const issue of error.issues) {
    const leaf = issue.path[issue.path.length - 1];
    if (typeof leaf !== "string" || leaf === "body" || leaf === "query" || leaf === "params") {
      continue;
    }
    (result[leaf] ||= []).push(issue.message);
  }
  return result;
}

export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: {
          formErrors: result.error.flatten().formErrors,
          fieldErrors: flattenFieldErrors(result.error),
        },
      });
    }

    // Merge with any existing validated data from previous validate() calls
    req.validated = {
      ...(req.validated || {}),
      body: { ...(req.validated?.body || {}), ...(result.data.body || {}) },
      query: { ...(req.validated?.query || {}), ...(result.data.query || {}) },
      params: { ...(req.validated?.params || {}), ...(result.data.params || {}) },
    };
    next();
  };
}
