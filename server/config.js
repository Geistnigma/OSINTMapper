import crypto from 'crypto';

export const config = {
  port: parseInt(process.env.PORT) || 4444,
  host: process.env.BIND_HOST || '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex'),
  jwtExpiry: '24h',
  bcryptRounds: 12,
  nodeEnv: process.env.NODE_ENV || 'development',
  clientDist: process.env.CLIENT_DIST || '../client/dist',
};
