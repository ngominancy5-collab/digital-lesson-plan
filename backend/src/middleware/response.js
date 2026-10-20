export function responseEnvelope(_req, res, next) {
  const original = res.json.bind(res);
  res.json = (body) => {
    if (body && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, 'success')) {
      return original(body);
    }
    const status = res.statusCode || 200;
    if (status >= 400) {
      const message = body?.message || body?.error || 'Request failed.';
      const detail = body?.detail || (typeof body?.details === 'string' ? body.details : '');
      return original({
        success: false,
        message,
        error: message,
        ...(detail ? { detail } : {}),
        ...(body?.details && typeof body.details !== 'string' ? { details: body.details } : {}),
      });
    }
    return original({
      success: true,
      message: body?.message || 'OK',
      data: body ?? {},
    });
  };
  next();
}
