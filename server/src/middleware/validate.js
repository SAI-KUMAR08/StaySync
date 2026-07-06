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
        errors: result.error.flatten(),
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
