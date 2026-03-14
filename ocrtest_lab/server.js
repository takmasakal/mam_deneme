import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3310);
const UPSTREAM = process.env.MAM_UPSTREAM || 'http://127.0.0.1:3001';
const PROXY_USER = String(process.env.OCRTEST_PROXY_USER || 'mamadmin').trim() || 'mamadmin';
const PROXY_EMAIL = String(process.env.OCRTEST_PROXY_EMAIL || 'mamadmin@ocrtest.local').trim() || 'mamadmin@ocrtest.local';

function proxyRequest(req, res) {
  const upstreamUrl = new URL(req.originalUrl, UPSTREAM);
  const options = {
    protocol: upstreamUrl.protocol,
    hostname: upstreamUrl.hostname,
    port: upstreamUrl.port || 80,
    method: req.method,
    path: `${upstreamUrl.pathname}${upstreamUrl.search}`,
    headers: {
      ...req.headers,
      'x-forwarded-user': String(req.headers['x-forwarded-user'] || PROXY_USER),
      'x-forwarded-email': String(req.headers['x-forwarded-email'] || PROXY_EMAIL),
      host: upstreamUrl.host,
      connection: 'close'
    }
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.status(proxyRes.statusCode || 502);
    Object.entries(proxyRes.headers || {}).forEach(([k, v]) => {
      if (v !== undefined) res.setHeader(k, v);
    });
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (error) => {
    if (!res.headersSent) {
      res.status(502).json({ error: `Proxy failed: ${String(error.message || error)}` });
    }
  });

  req.pipe(proxyReq);
}

app.use('/api', proxyRequest);
app.use('/uploads', proxyRequest);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => {
  res.json({ ok: true, upstream: UPSTREAM });
});

app.listen(PORT, () => {
  console.log(`OCR Lab running on http://localhost:${PORT}`);
  console.log(`Proxy upstream: ${UPSTREAM}`);
});
