import express from 'express';
import path from 'node:path';
import { localDevelopment, requireLocalRequest } from './security.js';
import { router } from './app.js';

const app = express();
const clientDirectory = path.join(process.cwd(), 'dist', 'client');

app.use(express.json());
app.get('/health/session', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (localDevelopment) {
    requireLocalRequest(req, res, () => res.json({ localDevelopment: true }));
    return;
  }
  res.json({ localDevelopment: false });
});
app.use(router);

app.get('/health', (_req, res) => {
  res.send('OK');
});

app.use(express.static(clientDirectory));
app.use((_req, res) => {
  res.sendFile(path.join(clientDirectory, 'index.html'));
});

app.listen(3000, '127.0.0.1', () => {
  console.log('Server is running on port 3000');
});
