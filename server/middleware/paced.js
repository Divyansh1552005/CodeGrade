import { mailConfig } from '../config/mail.js';

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Wraps a handler that returns { status, body } so every response takes at least AUTH_RESPONSE_FLOOR_MS.
 * Routes that answer the same way for existing and unknown accounts use it so the response time does not
 * tell the two apart. The real work still finishes before the response, so nothing is lost on a crash.
 */
export function paced(work) {
  return async function pacedHandler(req, res, next) {
    const started = Date.now();
    try {
      const { status = 200, body } = await work(req, res);
      const wait = mailConfig().responseFloorMs - (Date.now() - started);
      if (wait > 0) await sleep(wait);
      return res.status(status).json(body);
    } catch (err) {
      return next(err);
    }
  };
}
