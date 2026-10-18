import { features } from '../config/features.js';

/** Answers 404 when a feature flag is off, so a disabled feature looks like it does not exist. */
export function requireFeature(name) {
  return function featureGate(_req, res, next) {
    if (!features[name]()) return res.status(404).json({ error: 'Not found' });
    return next();
  };
}
