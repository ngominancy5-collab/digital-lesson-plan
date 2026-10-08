export function responseEnvelope(_req, res, next) {
  const original = res.json.bind(res);
  res.json = (body) => {
    if (body && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, 'success')) {
      return original(body);
    }
    const status = res.statusCode || 200;
    if (status >= 400) {
      return original({
        success: false,
        message: body?.message || body?.error || 'Request failed.',
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
