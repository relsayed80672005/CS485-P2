import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config();

import { generateIssuesRouter } from './src/routes/generateIssues.js';
import { publishIssuesRouter } from './src/routes/publishIssues.js';
import { healthRouter } from './src/routes/health.js';
import { authRouter } from './src/routes/auth.js';
import { projectsRouter } from './src/routes/projects.js';
import { documentsRouter } from './src/routes/documents.js';
import { tasksRouter } from './src/routes/tasks.js';
import { calculatorRouter } from './src/routes/calculator.js';

import { errorHandler } from './src/middleware/errorHandler.js';
import { requestLogger } from './src/middleware/requestLogger.js';
import { generateRequestId } from './src/middleware/errorHandler.js';

import { testConnection, closePool } from './src/database/connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_LAMBDA = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

app.use(helmet({
  contentSecurityPolicy: NODE_ENV === 'production' ? undefined : false,
  crossOriginEmbedderPolicy: false
}));

function getCorsAllowedOrigins() {
  const devDefaults = [
    'http://localhost:5173',
    'http://localhost:3001',
    'http://127.0.0.1:5173',
    'http://host.docker.internal:5173',
  ];

  const fromEnv = process.env.FRONTEND_URL;
  const fromEnvList = fromEnv
    ? fromEnv.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  return [...new Set([...devDefaults, ...fromEnvList])];
}

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowed = getCorsAllowedOrigins();
    if (allowed.includes(origin)) return callback(null, true);
    if (/\.amplifyapp\.com$/.test(origin)) return callback(null, true);
    callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.options('*', cors(corsOptions));
app.use(cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());

app.use((req, res, next) => {
  req.id = generateRequestId();
  next();
});

app.use(requestLogger);

app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/generate-issues', generateIssuesRouter);
app.use('/api/publish-issues', publishIssuesRouter);
app.use('/api/calculator', calculatorRouter);

app.get('/', (req, res) => {
  res.json({
    name: 'AI Specification Breakdown API',
    version: '2.0.0',
    environment: NODE_ENV,
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      projects: '/api/projects',
      documents: '/api/documents',
      tasks: '/api/tasks',
      generateIssues: '/api/generate-issues',
      publishIssues: '/api/publish-issues',
      calculator: '/api/calculator',
    },
    documentation: 'See README.md for API details'
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
    timestamp: new Date().toISOString(),
    requestId: req.id
  });
});

app.use(errorHandler);

async function startServer() {
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.error('Failed to connect to database. Please check your database configuration.');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`
╔═════════════════════════════════════════════════════════╗
║   AI Specification Breakdown API                      ║
╠═════════════════════════════════════════════════════════╣
║   Environment: ${NODE_ENV.padEnd(20)}║
║   Port: ${String(PORT).padEnd(28)}║
║   URL: http://localhost:${PORT}                   ║
║   Database: ✓ Connected                              ║
╚═════════════════════════════════════════════════════════╝
  `);
  });
}

// Only start the HTTP server when running locally, not in Lambda
if (!IS_LAMBDA && process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}

// Warm up DB connection in Lambda without blocking startup
if (IS_LAMBDA) {
  testConnection()
    .then((ok) => {
      if (!ok) console.warn('[Lambda] DB connection failed — continuing without DB');
    })
    .catch((err) => console.warn('[Lambda] DB connection error:', err.message));
}

process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  await closePool();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing HTTP server');
  await closePool();
  process.exit(0);
});

export { app };
