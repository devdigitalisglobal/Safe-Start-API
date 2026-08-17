import { buildApp } from '../dist/src/app.js';

/** Cached across warm serverless invocations on Vercel. */
let app;

export default async function handler(req, res) {
  if (!app) {
    app = await buildApp();
    await app.ready();
  }
  app.server.emit('request', req, res);
}
