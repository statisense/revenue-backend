import { Logger } from '@nestjs/common';

const log = new Logger('Queues');

/** True when BullMQ/Redis should be used. */
export function areQueuesEnabled(): boolean {
  const flag = process.env.QUEUES_DISABLED;
  if (flag === '1' || flag === 'true') return false;
  return true;
}

export function disableQueues(reason: string): void {
  process.env.QUEUES_DISABLED = '1';
  log.warn(`Queues disabled: ${reason}`);
}

/**
 * Probe Redis. On failure sets QUEUES_DISABLED=1 so Nest boots without BullMQ.
 * Safe to call before AppModule is imported.
 */
export async function probeRedisOrDisable(timeoutMs = 2500): Promise<boolean> {
  if (!areQueuesEnabled()) return false;

  const url = process.env.REDIS_URL || '';
  if (!url || url.includes('${{')) {
    disableQueues('REDIS_URL missing or unresolved');
    return false;
  }

  // In production, treat explicit localhost Redis as "not configured"
  if (
    process.env.NODE_ENV === 'production' &&
    (/redis:\/\/[^@]*@?127\.0\.0\.1/i.test(url) || /redis:\/\/[^@]*@?localhost/i.test(url))
  ) {
    disableQueues('REDIS_URL points at localhost in production');
    return false;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Redis = require('ioredis') as typeof import('ioredis').default;
    const client = new Redis(url, {
      connectTimeout: timeoutMs,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
      retryStrategy: () => null,
    });
    await Promise.race([
      (async () => {
        await client.connect();
        await client.ping();
      })(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Redis probe timeout')), timeoutMs)),
    ]);
    await client.quit().catch(() => undefined);
    log.log('Redis available — notification queues enabled');
    return true;
  } catch (err) {
    disableQueues(`Redis unreachable (${(err as Error).message})`);
    return false;
  }
}
