export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
}

let _logLevel = LogLevel.WARN;

export function setLogLevel(level: LogLevel): void {
  _logLevel = level;
}

export function getLogLevel(): LogLevel {
  return _logLevel;
}

function formatMessage(tag: string, message: string): string {
  return `[GraphBase:${tag}] ${message}`;
}

export const Logger = {
  debug(tag: string, message: string, ...args: unknown[]): void {
    if (_logLevel <= LogLevel.DEBUG) {
      console.debug(formatMessage(tag, message), ...args);
    }
  },
  info(tag: string, message: string, ...args: unknown[]): void {
    if (_logLevel <= LogLevel.INFO) {
      console.info(formatMessage(tag, message), ...args);
    }
  },
  warn(tag: string, message: string, ...args: unknown[]): void {
    if (_logLevel <= LogLevel.WARN) {
      console.warn(formatMessage(tag, message), ...args);
    }
  },
  error(tag: string, message: string, ...args: unknown[]): void {
    if (_logLevel <= LogLevel.ERROR) {
      console.error(formatMessage(tag, message), ...args);
    }
  }
};
