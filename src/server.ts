import express from 'express';
import path from 'node:path';
import { router } from './app.js';

const app = express();
const clientDirectory = path.join(process.cwd(), 'dist', 'client');

app.use(express.json());
app.use(router);

app.get('/health', (_req, res) => {
  res.send('OK');
});

app.use(express.static(clientDirectory));
app.use((_req, res) => {
  res.sendFile(path.join(clientDirectory, 'index.html'));
});

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});
