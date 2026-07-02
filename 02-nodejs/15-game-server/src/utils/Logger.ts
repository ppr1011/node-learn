export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

class Logger {
  private level: LogLevel = LogLevel.INFO;

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private format(tag: string, msg: string): string {
    const time = new Date().toISOString().slice(11, 23);
    return `[${time}] [${tag}] ${msg}`;
  }

  debug(msg: string): void {
    if (this.level <= LogLevel.DEBUG) {
      console.log(this.format('DEBUG', msg));
    }
  }

  info(msg: string): void {
    if (this.level <= LogLevel.INFO) {
      console.log(this.format('INFO', msg));
    }
  }

  warn(msg: string): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(this.format('WARN', msg));
    }
  }

  error(msg: string): void {
    if (this.level <= LogLevel.ERROR) {
      console.error(this.format('ERROR', msg));
    }
  }
}

export const logger = new Logger();
