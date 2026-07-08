/**
 * NPC Agent-to-Agent (A2A) 协议 —— 功能10
 *
 * 消息总线 + 类型契约。NPC 之间通过 inbox 传递协作请求,
 * 由 EscortGuideSystem 编排带路/护送任务。
 *
 * @author gaarachen
 */

import { Enemy } from '../../core/Enemy';
import { GameWorld } from '../../core/GameWorld';

/** A2A 消息种类 */
export type A2AKind =
  | 'guide_request'   // 玩家请求带路(内部,由聊天触发)
  | 'escort_request'  // 玩家请求护送(内部)
  | 'escort_follow'   // 护送者到达目标 NPC 后,请求其跟随返回
  | 'escort_complete' // 护送完成,解除跟随
  | 'cancel';         // 取消协作

export type A2AStatus = 'pending' | 'accepted' | 'rejected' | 'done';

/** 单条 A2A 消息 */
export interface A2AMessage {
  id: number;
  fromNpcId: number;
  fromNpcName: string;
  toNpcId: number;
  kind: A2AKind;
  payload: {
    targetNpcId?: number;
    targetNpcName?: string;
    playerId?: number;
    playerName?: string;
    destX?: number;
    destY?: number;
    reason?: string;
  };
  at: number;
  status: A2AStatus;
}

let nextMsgId = 1;

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** 世界级 A2A 消息总线(每 GameWorld 一个实例) */
export class A2ABus {
  private readonly inbox = new Map<number, A2AMessage[]>();

  /** 投递消息到目标 NPC 的 inbox */
  post(msg: Omit<A2AMessage, 'id' | 'status'> & { status?: A2AStatus }): A2AMessage {
    const full: A2AMessage = {
      ...msg,
      id: nextMsgId++,
      status: msg.status ?? 'pending',
    };
    const arr = this.inbox.get(msg.toNpcId) ?? [];
    arr.push(full);
    this.inbox.set(msg.toNpcId, arr);
    return full;
  }

  /** 取出并清空某 NPC 的待处理消息 */
  drain(npcId: number): A2AMessage[] {
    const arr = this.inbox.get(npcId) ?? [];
    this.inbox.set(npcId, []);
    return arr;
  }

  /** 某 NPC 待处理消息数(供快照) */
  pendingCount(npcId: number): number {
    return (this.inbox.get(npcId) ?? []).filter((m) => m.status === 'pending').length;
  }
}

/** 按 displayName 模糊匹配 LLM NPC */
export function findNpcByName(world: GameWorld, name: string): Enemy | null {
  const q = name.trim().toLowerCase();
  if (!q) return null;
  let best: Enemy | null = null;
  let bestScore = 0;
  for (const e of world.enemies.values()) {
    if (!e.llmEnabled || e.isDead) continue;
    const label = (e.displayName || e.kind).toLowerCase();
    if (label === q) return e;
    if (label.includes(q) || q.includes(label)) {
      const score = Math.min(label.length, q.length);
      if (score > bestScore) { bestScore = score; best = e; }
    }
  }
  return best;
}

/** 附近 LLM NPC 列表(供 LLM 快照) */
export function nearbyNpcs(
  world: GameWorld,
  enemy: Enemy,
  range: number
): Array<{ name: string; distance: number; role?: string }> {
  const out: Array<{ name: string; distance: number; role?: string }> = [];
  for (const other of world.enemies.values()) {
    if (other.id === enemy.id || !other.llmEnabled || other.isDead) continue;
    const d = dist(enemy.position.x, enemy.position.y, other.position.x, other.position.y);
    if (d <= range) {
      out.push({
        name: other.displayName || other.kind,
        distance: Math.round(d),
        role: other.a2aRole ?? undefined,
      });
    }
  }
  out.sort((a, b) => a.distance - b.distance);
  return out;
}

/** 清空某 NPC 的全部 A2A 协作状态 */
export function clearA2AState(enemy: Enemy): void {
  enemy.guideTargetNpcId = null;
  enemy.guideForPlayerId = null;
  enemy.escortPhase = null;
  enemy.escortTargetNpcId = null;
  enemy.escortDestX = 0;
  enemy.escortDestY = 0;
  enemy.escortForPlayerId = null;
  enemy.followNpcId = null;
  enemy.a2aRole = null;
}
