import { InvalidStateTransitionError } from '../models/Answer.js';

/**
 * Centralized error handler. Maps known error types to appropriate HTTP codes
 * so route handlers can simply `next(err)` or throw.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof InvalidStateTransitionError) {
    return res.status(400).json({ error: err.message });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({ error: `Invalid ${err.path}` });
  }

  // Duplicate key (e.g. unique email).
  if (err.code === 11000) {
    return res.status(409).json({ error: 'Resource already exists' });
  }

  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    console.error(err);
  }
  // A string code on a client error (for example ADMIN_PROTECTED) is part of the answer so the UI can act on it.
  const code = status < 500 && typeof err.code === 'string' && /^[A-Z_]+$/.test(err.code) ? { code: err.code } : {};
  return res.status(status).json({ error: err.message || 'Internal server error', ...code });
}

/** Small helper to build errors with an HTTP status attached. */
export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}
