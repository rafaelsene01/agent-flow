export function sendError(res, status, message, err = null) {
  if (err) console.error(`[${status}] ${message}`, err);
  return res.status(status).json({ error: message });
}

export function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
