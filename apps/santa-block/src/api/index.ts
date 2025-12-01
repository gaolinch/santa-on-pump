import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger';
import healthRoutes from './routes/health';
import statsRoutes from './routes/stats';
import proofsRoutes from './routes/proofs';
import revealsRoutes from './routes/reveals';
import adminRoutes from './routes/admin';
import transactionsRoutes from './routes/transactions';
import schedulerRoutes from './routes/scheduler';
import hourlyAirdropsRoutes from './routes/hourly-airdrops';

export function createApp(): Application {
  const app = express();

  // Security middleware
  app.use(helmet());
  
  // CORS configuration - allow specific origins
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    process.env.FRONTEND_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    // Add your production frontend URLs here
  ].filter(Boolean);

  app.use(cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, curl, Postman, etc.)
      if (!origin) return callback(null, true);
      
      // Allow all origins in development
      if (process.env.NODE_ENV === 'development') {
        return callback(null, true);
      }
      
      // In production, check against allowed list
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        logger.warn({ origin }, 'CORS request from unauthorized origin');
        callback(null, true); // Still allow for now, but log it
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cache-Control'],
  }));

  // Body parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Request logging
  app.use((req: Request, res: Response, next: NextFunction) => {
    logger.info({
      method: req.method,
      path: req.path,
      ip: req.ip,
    }, 'Incoming request');
    next();
  });

  // Rate limiting - prevent API abuse and crawling
  const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 500, // Limit each IP to 500 requests per windowMs
    message: {
      error: 'Too many requests from this IP, please try again later.',
      retry_after: '15 minutes'
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    skip: (req) => {
      // Skip rate limiting for health checks and public gift list
      return req.path === '/health' || req.path === '/proofs/all/gifts';
    },
    handler: (req, res) => {
      logger.warn({
        ip: req.ip,
        path: req.path,
      }, 'Rate limit exceeded');
      res.status(429).json({
        error: 'Too many requests from this IP, please try again later.',
        retry_after: '15 minutes'
      });
    }
  });

  // Stricter rate limiting for sensitive endpoints
  const strictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Only 20 requests per 15 minutes for individual proof lookups
    message: {
      error: 'Too many requests to this endpoint, please try again later.',
      retry_after: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip strict rate limiting for /proofs/all/gifts (read-only display endpoint)
      return req.path === '/proofs/all/gifts';
    },
    handler: (req, res) => {
      logger.warn({
        ip: req.ip,
        path: req.path,
      }, 'Strict rate limit exceeded on proofs endpoint');
      res.status(429).json({
        error: 'Too many requests to this endpoint, please try again later.',
        retry_after: '15 minutes'
      });
    }
  });

  // Apply general rate limiting to all routes
  app.use(apiLimiter);

  // Routes
  app.use('/health', healthRoutes);
  app.use('/stats', statsRoutes);
  app.use('/proofs', strictLimiter, proofsRoutes); // Stricter limits on individual proofs, but not /all/gifts
  app.use('/reveals', revealsRoutes); // Daily reveal data
  app.use('/admin', adminRoutes);
  app.use('/transactions', transactionsRoutes);
  app.use('/scheduler', schedulerRoutes);
  app.use('/hourly-airdrops', hourlyAirdropsRoutes);

  // Root endpoint
  app.get('/', (req: Request, res: Response) => {
    res.json({
      name: 'Santa Block API',
      version: '1.0.0',
      description: 'Backend relayer service for Santa - The On-Chain Advent Calendar',
      endpoints: {
        health: '/health',
        stats: '/stats',
        proofs: '/proofs',
        reveals: '/reveals',
        admin: '/admin (requires auth)',
        transactions: '/transactions',
        scheduler: '/scheduler',
        hourlyAirdrops: '/hourly-airdrops',
      },
    });
  });

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not found',
      path: req.path,
    });
  });

  // Error handler
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error({ err, path: req.path }, 'Unhandled error');
    res.status(500).json({
      error: 'Internal server error',
      message: err.message,
    });
  });

  return app;
}

