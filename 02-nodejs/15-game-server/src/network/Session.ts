import WebSocket from 'ws';
import { MsgType, encodeMessage } from './Protocol';
import { RateLimiter } from '../utils/RateLimiter';
import { GameConfig } from '../config';

export class Session {
  private alive: boolean = true;
  private lastPingTime: number = Date.now();
  private rateLimiter: RateLimiter;

  constructor(
    readonly id: string,
    private readonly ws: WebSocket
  ) {
    this.rateLimiter = new RateLimiter(
      GameConfig.RATE_LIMIT_MAX,
      GameConfig.RATE_LIMIT_REFILL
    );
  }

  get isAlive(): boolean {
    return this.alive && this.ws.readyState === WebSocket.OPEN;
  }

  get lastActivity(): number {
    return this.lastPingTime;
  }

  markActivity(): void {
    this.lastPingTime = Date.now();
  }

  checkRate(): boolean {
    return this.rateLimiter.consume();
  }

  send(type: MsgType, data?: any): void {
    if (!this.isAlive) return;

    try {
      this.ws.send(encodeMessage(type, data));
    } catch {
      this.close();
    }
  }

  close(): void {
    this.alive = false;
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
  }
}
