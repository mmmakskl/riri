import express from 'express';
import { readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS
app.use((req, res, next) => {
  const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['*'];
  const origin = req.headers.origin;
  
  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin || '*');
  }
  
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Health check
app.get(['/health', '/api/health'], (req, res) => {
  res.status(200).json({ status: 'ok', time: new Date().toISOString() });
});

// Root check
app.get('/', (req, res) => {
  res.status(200).send('RiRi AI Backend is running. Use /api/* for functions.');
});

const apiDir = join(__dirname, 'api');

if (existsSync(apiDir)) {
  const files = readdirSync(apiDir).filter(f => f.endsWith('.js'));
  console.log(`Found ${files.length} API handlers.`);

  for (const file of files) {
    try {
      const route = '/api/' + file.replace('.js', '');
      const modulePath = join(apiDir, file);
      const { default: handler } = await import(modulePath);
      
      if (typeof handler === 'function') {
        app.all(route, handler);
        console.log(`✅ Registered: ${route}`);
      } else {
        console.warn(`⚠️ Skipping ${file}: No default export function found.`);
      }
    } catch (err) {
      console.error(`❌ Failed to load handler ${file}:`, err.message);
    }
  }
} else {
  console.error(`❌ API directory not found at: ${apiDir}`);
}

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`🚀 Backend running on http://${HOST}:${PORT}`);
});
