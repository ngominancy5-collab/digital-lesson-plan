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

function readableError(err, status) {
  const raw = String(err.message || '');
  if (err instanceof AppError) return raw || 'Request failed.';
  if (/Authentication failed against database server/i.test(raw)) {
    return 'The database rejected the PlanWise login. The username or password in DATABASE_URL is not valid.';
  }
  if (/Can't reach database server|ECONNREFUSED .*5432|connect ECONNREFUSED/i.test(raw)) {
    return 'PlanWise cannot reach the database. Make sure PostgreSQL is running.';
  }
  if (status >= 500) return 'Something went wrong. Please try again.';
  return raw || 'Request failed.';
}

export function errorHandler(err, _req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const message = readableError(err, status);

  if (status >= 500 && !(err instanceof AppError)) {
    const providerStatus = err.response?.status || '';
    const providerMessage = err.response?.data?.error?.message || '';
    console.error(err.name || 'Error', err.message, providerStatus, providerMessage);
  }

  res.status(status).json({
    success: false,
    message,
    error: message,
    details: err.details || undefined,
  });
}
