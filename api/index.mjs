/** Cached across warm serverless invocations on Vercel. */
let app;
let initPromise;

async function getApp() {
  if (!initPromise) {
    initPromise = (async () => {
      const { buildApp } = await import('../dist/src/app.js');
      const instance = await buildApp();
      await instance.ready();
      return instance;
    })().catch((err) => {
      initPromise = undefined;
      throw err;
    });
  }
  return initPromise;
}

export default async function handler(req, res) {
  try {
    app = await getApp();
    app.server.emit('request', req, res);
  } catch (err) {
    console.error('[safe-start-api] Serverless init failed:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          error: 'Server initialization failed',
          message: err instanceof Error ? err.message : String(err),
        })
      );
    }
  }
}
