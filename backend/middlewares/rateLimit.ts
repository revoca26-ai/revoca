// middlewares/rateLimit.ts
//
// Simple in-memory sliding-window rate limiter: 10 requests per minute per user.
// In-memory is fine for a single dev process (per the doc's Stage 15 spec) —
// this resets on server restart and won't work correctly across multiple
// server instances. A real production version would use Redis instead.

import { Request, Response, NextFunction } from 'express';

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

// userId -> array of request timestamps within the current window
const requestLog = new Map<string, number[]>();

export default function rateLimit(req: Request, res: Response, next: NextFunction) {
  const userId = req.user?.id;
  if (!userId) {
    // Should never happen if this runs after requireAuth, but fail safe
    // rather than crash if middleware ordering ever changes.
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = Date.now();
  const timestamps = requestLog.get(userId) ?? [];

  // Drop timestamps outside the current window
  const recent = timestamps.filter((t) => now - t < WINDOW_MS);

  if (recent.length >= MAX_REQUESTS) {
    const oldestInWindow = recent[0];
    const retryAfterMs = WINDOW_MS - (now - oldestInWindow);
    res.setHeader('Retry-After', Math.ceil(retryAfterMs / 1000).toString());
    return res.status(429).json({ error: 'RATE_LIMITED' });
  }

  recent.push(now);
  requestLog.set(userId, recent);
  next();
}