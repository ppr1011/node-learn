import { WebSocketServer as WSServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { Session } from './Session';
import { decodeMessage, MsgType } from './Protocol';
import { GameWorld } from '../core/GameWorld';
import { Player } from '../core/Player';
import { GameConfig } from '../config';
import { logger } from '../utils/Logger';

export class GameWebSocketServer {
  private wss: WSServer;
  private sessions: Map<string, Session> = new Map();
  private playerBySession: Map<string, Player> = new Map();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private nextSessionId = 1;

  constructor(private readonly world: GameWorld) {
    this.wss = new WSServer({ port: GameConfig.PORT });
    this.setupServer();
    this.startHeartbeat();
  }

  private setupServer(): void {
    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      const sessionId = `s_${this.nextSessionId++}`;
      const session = new Session(sessionId, ws);
      this.sessions.set(sessionId, session);

      logger.info(`New connection: ${sessionId} from ${req.socket.remoteAddress}`);

      ws.on('message', (raw: Buffer) => {
        this.handleMessage(sessionId, raw.toString());
      });

      ws.on('close', () => {
        this.handleDisconnect(sessionId);
      });

      ws.on('error', (err) => {
        logger.error(`WebSocket error [${sessionId}]: ${err.message}`);
        this.handleDisconnect(sessionId);
      });

      // 等待客户端发送 join 消息（包含玩家名称）
    });

    this.wss.on('error', (err) => {
      logger.error(`Server error: ${err.message}`);
    });

    logger.info(`WebSocket server listening on port ${GameConfig.PORT}`);
  }

  private handleMessage(sessionId: string, raw: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // 限流检查
    if (!session.checkRate()) {
      session.send(MsgType.ERROR, { msg: 'Rate limit exceeded' });
      return;
    }

    session.markActivity();

    const msg = decodeMessage(raw);
    if (!msg) return;

    const player = this.playerBySession.get(sessionId);

    switch (msg.type) {
      case MsgType.C_PING:
        session.send(MsgType.PONG, { time: msg.data?.time });
        break;

      case MsgType.C_MOVE:
        if (!player) {
          // 第一条消息当作 join
          this.handleJoin(sessionId, session, msg.data);
        } else {
          this.world.movement.handleInput(player, msg.data);
        }
        break;

      case MsgType.C_STOP:
        if (player) {
          player.velocity = { x: 0, y: 0 };
        }
        break;

      case MsgType.C_CHAT:
        if (player && msg.data?.text) {
          this.world.chat.handleChat(player, msg.data.text);
        }
        break;

      case MsgType.C_ATTACK:
        if (player) {
          this.world.combat.handleAttack(player);
        }
        break;

      default:
        // 第一条非 ping 消息视为 join
        if (!player && msg.data?.name) {
          this.handleJoin(sessionId, session, msg.data);
        }
        break;
    }
  }

  private handleJoin(sessionId: string, session: Session, data: any): void {
    const name = (data?.name || `Player_${this.nextSessionId}`).slice(0, 16);
    const player = new Player(name, session);
    this.playerBySession.set(sessionId, player);
    this.world.addPlayer(player);
  }

  private handleDisconnect(sessionId: string): void {
    const player = this.playerBySession.get(sessionId);
    if (player) {
      this.world.removePlayer(player);
      this.playerBySession.delete(sessionId);
    }
    this.sessions.delete(sessionId);
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      const timeout = GameConfig.HEARTBEAT_TIMEOUT;

      for (const [sessionId, session] of this.sessions) {
        if (!session.isAlive) {
          this.handleDisconnect(sessionId);
          continue;
        }

        if (now - session.lastActivity > timeout) {
          logger.warn(`Session ${sessionId} heartbeat timeout`);
          session.close();
          this.handleDisconnect(sessionId);
        }
      }
    }, GameConfig.HEARTBEAT_INTERVAL);
  }

  shutdown(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    for (const session of this.sessions.values()) {
      session.close();
    }

    this.wss.close();
    logger.info('WebSocket server shut down');
  }
}
