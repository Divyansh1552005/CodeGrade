import { Router } from 'express';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { httpError } from '../middleware/errorHandler.js';
import {
  issueTokenPair,
  rotateRefreshToken,
  revokeRefreshToken,
} from '../services/tokenService.js';
import { setRefreshCookie, clearRefreshCookie, REFRESH_COOKIE } from '../utils/cookies.js';

const router = Router();

const findUserById = (id) => User.findById(id);

// POST /auth/register  { name, email, password, role }
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body || {};
    if (!name || !email || !password || !role) {
      throw httpError(400, 'name, email, password and role are required');
    }
    if (!['student', 'teacher'].includes(role)) {
      throw httpError(400, 'role must be "student" or "teacher"');
    }
    if (String(password).length < 6) {
      throw httpError(400, 'password must be at least 6 characters');
    }

    const passwordHash = await User.hashPassword(password);
    const user = await User.create({ name, email, passwordHash, role });
    const { accessToken, refreshToken } = await issueTokenPair(user);
    setRefreshCookie(res, refreshToken);
    return res.status(201).json({ user: user.toJSON(), accessToken });
  } catch (err) {
    return next(err);
  }
});

// POST /auth/login  { email, password }
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      throw httpError(400, 'email and password are required');
    }
    const user = await User.findOne({ email: String(email).toLowerCase() });
    if (!user || !(await user.comparePassword(password))) {
      throw httpError(401, 'Invalid credentials');
    }
    const { accessToken, refreshToken } = await issueTokenPair(user);
    setRefreshCookie(res, refreshToken);
    return res.json({ user: user.toJSON(), accessToken });
  } catch (err) {
    return next(err);
  }
});

// POST /auth/refresh  — rotate (single-use) using the refresh cookie; returns a
// fresh access token in the body and sets a new refresh cookie.
router.post('/refresh', async (req, res, next) => {
  try {
    const rawToken = req.cookies?.[REFRESH_COOKIE];
    const { accessToken, refreshToken } = await rotateRefreshToken(rawToken, findUserById);
    setRefreshCookie(res, refreshToken);
    return res.json({ accessToken });
  } catch (err) {
    // On any refresh failure, clear the stale cookie so the client logs out cleanly.
    clearRefreshCookie(res);
    return next(err);
  }
});

// POST /auth/logout  — revoke the refresh token and clear the cookie.
router.post('/logout', async (req, res, next) => {
  try {
    await revokeRefreshToken(req.cookies?.[REFRESH_COOKIE]);
    clearRefreshCookie(res);
    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
});

// GET /auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user.toJSON() });
});

export default router;
