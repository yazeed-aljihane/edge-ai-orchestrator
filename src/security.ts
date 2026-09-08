import 'dotenv/config';
import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

export const edgeToken = process.env.EDGE_API_TOKEN;
const operatorToken = process.env.OPERATOR_API_TOKEN;
export const localDevelopment = process.env.NODE_ENV === 'development' && process.env.LOCAL_DEV_AUTH === 'true';
if (!edgeToken || edgeToken.length < 32) {
  throw new Error('Set EDGE_API_TOKEN to at least 32 characters');
}
if (!localDevelopment && (!operatorToken || operatorToken.length < 32)) {
  throw new Error('Set OPERATOR_API_TOKEN to at least 32 characters outside local development');
}
const localOrigins = new Set([
  'http://127.0.0.1:3000', 'http://localhost:3000',
  'http://127.0.0.1:5173', 'http://localhost:5173',
  'http://127.0.0.1:5174', 'http://localhost:5174',
]);
export const requireLocalRequest: RequestHandler = (req, res, next) => {
  const address = req.socket.remoteAddress;
  const origin = req.headers.origin;
  const host = req.headers.host;
  const site = req.headers['sec-fetch-site'];
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address ?? '') ||
      !host || !localOrigins.has(`http://${host}`) ||
      (origin !== undefined && !localOrigins.has(origin)) ||
      site === 'cross-site' || req.headers['x-rime-client'] !== 'local-ui') {
    res.status(403).json({ error: 'Local workspace requests only' });
    return;
  }
  next();
};
export const authenticate: RequestHandler = (req, res, next) => {
  if (localDevelopment) {
    requireLocalRequest(req, res, next);
    return;
  }
  const supplied = Buffer.from(req.headers.authorization?.replace(/^Bearer /, '') ?? '');
  const expected = Buffer.from(operatorToken ?? '');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
};
