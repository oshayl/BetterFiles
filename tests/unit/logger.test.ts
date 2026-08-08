import { beforeEach, describe, expect, it } from 'vitest';
import { formatLogEntries, logger } from '../../src/utils/logger';

describe('logger', () => {
  beforeEach(() => {
    logger.clear();
  });

  it('buffers entries for diagnostics export', () => {
    logger.info('index', 'Indexing started');
    logger.error('index', 'Failed to read file', new Error('EACCES'));

    const entries = logger.snapshot();
    expect(entries).toHaveLength(2);
    expect(entries[0]?.scope).toBe('index');
    expect(entries[1]?.level).toBe('error');
  });

  it('caps the buffer so a long session cannot grow without bound', () => {
    for (let i = 0; i < 600; i += 1) {
      logger.debug('bulk', `entry ${i}`);
    }

    const entries = logger.snapshot();
    expect(entries).toHaveLength(500);
    // Oldest entries are dropped, newest retained.
    expect(entries[entries.length - 1]?.message).toBe('entry 599');
  });

  it('renders Error details without throwing on circular values', () => {
    const circular: Record<string, unknown> = { name: 'loop' };
    circular.self = circular;

    logger.warn('cache', 'Bad payload', circular);
    logger.error('cache', 'Boom', new Error('disk full'));

    const text = formatLogEntries(logger.snapshot());
    expect(text).toContain('[cache] Bad payload');
    expect(text).toContain('Error: disk full');
  });
});
