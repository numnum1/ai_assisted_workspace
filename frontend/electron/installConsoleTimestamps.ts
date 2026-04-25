/**
 * Prefixes main-process console output with an ISO-8601 timestamp.
 * Import once at the top of `main.ts` before other modules.
 */

type LogFn = (...args: unknown[]) => void;

function wrap(original: LogFn): LogFn {
  return (...args: unknown[]) => {
    original(`[${new Date().toISOString()}]`, ...args);
  };
}

const c = globalThis.console;
(c as { log: LogFn }).log = wrap(c.log.bind(c));
(c as { info: LogFn }).info = wrap(c.info.bind(c));
(c as { warn: LogFn }).warn = wrap(c.warn.bind(c));
(c as { error: LogFn }).error = wrap(c.error.bind(c));
(c as { debug: LogFn }).debug = wrap(c.debug.bind(c));
(c as { trace: LogFn }).trace = wrap(c.trace.bind(c));
