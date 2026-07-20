import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';

export function signToken(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiry });
}

export function verifyToken(token) {
  try { return jwt.verify(token, config.jwtSecret); }
  catch { return null; }
}

export function hashPassword(plain) {
  return bcrypt.hash(plain, config.bcryptRounds);
}

export function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}
