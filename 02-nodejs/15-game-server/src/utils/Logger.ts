import { openSync, writeSync } from 'fs';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// LOG_FILE=/path/log 时同步 append 每行到文件,绕开 Node stdout pipe 的 8KB block buffer
// (nohup/后台运行时,console.log 会 block-buffered,肉眼看日志"停"了实际只是没 flush)
const LOG_FD = process.env.LOG_FILE
  ? openSync(process.env.LOG_FILE, 'a')
  : null;

class Logger {
  private level: LogLevel = LogLevel.INFO;

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private format(tag: string, msg: string): string {
    const time = new Date().toISOString().slice(11, 23);
    return `[${time}] [${tag}] ${msg}`;
  }

  private emit(line: string, isErr = false): void {
    if (isErr) console.error(line); else console.log(line);
    if (LOG_FD !== null) writeSync(LOG_FD, line + '\n');
  }

  debug(msg: string): void {
    if (this.level <= LogLevel.DEBUG) this.emit(this.format('DEBUG', msg));
  }

  info(msg: string): void {
    if (this.level <= LogLevel.INFO) this.emit(this.format('INFO', msg));
  }

  warn(msg: string): void {
    if (this.level <= LogLevel.WARN) this.emit(this.format('WARN', msg));
  }

  error(msg: string): void {
    if (this.level <= LogLevel.ERROR) this.emit(this.format('ERROR', msg), true);
  }
}

export const logger = new Logger();
