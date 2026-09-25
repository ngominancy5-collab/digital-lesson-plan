export class AppError extends Error {
  constructor(message, status = 400, details = null) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.details = details;
  }
}

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function errorHandler(err, _req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const message = status >= 500
    ? 'Something went wrong. Please try again.'
    : (err.message || 'Request failed.');

  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({
    error: message,
    details: err.details || undefined,
  });
}
