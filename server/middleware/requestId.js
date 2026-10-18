import { createLogger, newRequestId } from '../utils/logger.js';

const ACCEPTED = /^[A-Za-z0-9_-]{8,64}$/;

/** Gives every request an id (honouring a sane incoming X-Request-Id) and a logger bound to it. */
export function requestId(req, res, next) {
  const incoming = req.get('x-request-id');
  req.id = incoming && ACCEPTED.test(incoming) ? incoming : newRequestId();
  req.log = createLogger({ requestId: req.id });
  res.set('X-Request-Id', req.id);
  next();
}
