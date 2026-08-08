/**
 * Structured logging.
 *
 * Two audiences, deliberately separated (roadmap section 25): technical detail
 * goes here, user-facing wording lives with the error model. Production builds
 * drop debug/info entirely via the `__DEV__` define, but always keep warn/error
 * so field reports remain useful.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  readonly level: LogLevel;
  readonly scope: string;
  readonly message: string;
  readonly detail?: unknown;
  /** Milliseconds since panel start, avoiding wall-clock dependence in tests. */
  readonly at: number;
}

const MAX_BUFFERED_ENTRIES = 500;

/** Ring buffer backing the diagnostics export (roadmap section 39). */
const buffer: LogEntry[] = [];
const start = Date.now();

function record(level: LogLevel, scope: string, message: string, detail?: unknown): void {
  const entry: LogEntry = { level, scope, message, detail, at: Date.now() - start };

  buffer.push(entry);
  if (buffer.length > MAX_BUFFERED_ENTRIES) {
    buffer.shift();
  }

  const isDev = typeof __DEV__ === 'undefined' ? true : __DEV__;
  if (!isDev && (level === 'debug' || level === 'info')) {
    return;
  }

  const prefix = `[${scope}]`;
  if (level === 'error') console.error(prefix, message, detail ?? '');
  else if (level === 'warn') console.warn(prefix, message, detail ?? '');
  else console.log(prefix, message, detail ?? '');
}

export const logger = {
  debug: (scope: string, message: string, detail?: unknown) =>
    record('debug', scope, message, detail),
  info: (scope: string, message: string, detail?: unknown) => record('info', scope, message, detail),
  warn: (scope: string, message: string, detail?: unknown) => record('warn', scope, message, detail),
  error: (scope: string, message: string, detail?: unknown) =>
    record('error', scope, message, detail),

  /** Snapshot for diagnostics export. */
  snapshot(): readonly LogEntry[] {
    return [...buffer];
  },

  clear(): void {
    buffer.length = 0;
  },
};

/** Renders the buffer as plain text for the diagnostics file. */
export function formatLogEntries(entries: readonly LogEntry[]): string {
  return entries
    .map((entry) => {
      const detail =
        entry.detail === undefined
          ? ''
          : ` | ${safeStringify(entry.detail)}`;
      return `${String(entry.at).padStart(8)}ms ${entry.level.toUpperCase().padEnd(5)} [${entry.scope}] ${entry.message}${detail}`;
    })
    .join('\n');
}

function safeStringify(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
