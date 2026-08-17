/** Cached across warm serverless invocations on Vercel. */
let app;

export default async function handler(req, res) {
  if (!app) {
    const { buildApp } = await import('../dist/src/app.js');
    app = await buildApp();
    await app.ready();
  }
  app.server.emit('request', req, res);
}
