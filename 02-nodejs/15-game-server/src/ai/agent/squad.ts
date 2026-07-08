/**
 * 多 Agent 协作 / 小队(功能9)
 *
 * 当 ≥2 只彼此靠近的 LLM NPC 盯上同一只普通怪时,自动成队并分工:
 *   - striker(leader):正面强攻,原样冲脸
 *   - flanker:绕到怪相对 leader 的「远侧」形成包抄
 *   - bait:直冲拉仇恨,替队友吸引怪的注意
 * 分工写进 Enemy 黑板(squadId/squadRole/squadTargetId),行为树的 chaseMob 据此改移动目标点;
 * 快照把分工与队友注入 LLM,leader 首次成队时播报一句协调台词(共享黑板 + leader 播报式协作)。
 */

import { Enemy } from '../../core/Enemy';
import { GameWorld } from '../../core/GameWorld';
import { GameConfig } from '../../config';
import { MsgType } from '../../network/Protocol';

export type SquadRole = 'striker' | 'flanker' | 'bait';

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** 探测某 NPC 当前最可能的普通怪目标(与 llmActions.acquireMobTarget 同口径) */
function nearestMob(enemy: Enemy, world: GameWorld): Enemy | null {
  let nearest: Enemy | null = null;
  let min = enemy.detectionRange;
  for (const other of world.enemies.values()) {
    if (other.id === enemy.id || other.isDead || other.llmEnabled) continue;
    const d = dist(enemy.position.x, enemy.position.y, other.position.x, other.position.y);
    if (d < min) { min = d; nearest = other; }
  }
  return nearest;
}

export class SquadSystem {
  /** 每支小队上次播报协调台词的时间(按 squadId=目标怪 id) */
  private readonly announceAt = new Map<number, number>();

  constructor(private readonly world: GameWorld) {}

  update(now: number): void {
    const world = this.world;

    // 1) 收集:每只怪被哪些「正在战斗状态」的 LLM NPC 盯上
    const byMob = new Map<number, Enemy[]>();
    for (const enemy of world.enemies.values()) {
      if (!enemy.llmEnabled || enemy.isDead) continue;
      // 逃跑 / 回巢 / 未被委托狩猎的,不参与组队
      if (enemy.llmDirective?.intent === 'flee') { this.clear(enemy); continue; }
      if (enemy.huntForPlayerId === null) { this.clear(enemy); continue; }
      const mob = nearestMob(enemy, world);
      if (!mob) { this.clear(enemy); continue; }
      const arr = byMob.get(mob.id) ?? [];
      arr.push(enemy);
      byMob.set(mob.id, arr);
    }

    const seen = new Set<number>(); // 本轮已入队的 NPC id

    // 2) 对每只被 ≥2 只 NPC 盯上的怪成队分工
    for (const [mobId, members] of byMob) {
      if (members.length < 2) continue;
      const mob = world.enemies.get(mobId);
      if (!mob || mob.isDead) continue;

      // leader = 距怪最近者
      members.sort(
        (a, b) =>
          dist(a.position.x, a.position.y, mob.position.x, mob.position.y) -
          dist(b.position.x, b.position.y, mob.position.x, mob.position.y)
      );
      const leader = members[0]!;

      // 只纳入与 leader 相互靠近的成员
      const squad = members.filter(
        (m) => m === leader || dist(m.position.x, m.position.y, leader.position.x, leader.position.y) <= GameConfig.SQUAD_RADIUS
      );
      if (squad.length < 2) continue;

      let roleIdx = 0;
      for (const m of squad) {
        m.squadId = mobId;
        m.squadTargetId = mobId;
        if (m === leader) {
          m.squadRole = 'striker';
        } else {
          m.squadRole = roleIdx % 2 === 0 ? 'flanker' : 'bait';
          roleIdx++;
        }
        seen.add(m.id);
      }

      this.maybeAnnounce(leader, squad, mob, now);
    }

    // 3) 未入队的 LLM NPC 清空小队字段
    for (const enemy of world.enemies.values()) {
      if (!enemy.llmEnabled) continue;
      if (!seen.has(enemy.id)) this.clear(enemy);
    }
  }

  private clear(enemy: Enemy): void {
    enemy.squadId = null;
    enemy.squadRole = null;
    enemy.squadTargetId = null;
  }

  /** leader 首次成队(带冷却)时喊一句协调台词,广播给附近玩家 */
  private maybeAnnounce(leader: Enemy, squad: Enemy[], mob: Enemy, now: number): void {
    const last = this.announceAt.get(leader.squadId!) ?? 0;
    if (now - last < GameConfig.SQUAD_ANNOUNCE_COOLDOWN_MS) return;
    this.announceAt.set(leader.squadId!, now);

    const allies = squad.filter((m) => m !== leader).map((m) => m.displayName || 'NPC').join('、');
    const text = `${mob.kind}就交给我!${allies}从两翼包抄,别让它跑了!`;
    this.broadcastNear(leader, text);
  }

  private broadcastNear(enemy: Enemy, text: string): void {
    const chatMsg = {
      from: enemy.displayName ?? `NPC#${enemy.id}`,
      fromId: -enemy.id,
      text: text.slice(0, 100),
      x: Math.round(enemy.position.x),
      y: Math.round(enemy.position.y),
    };
    for (const p of this.world.players.values()) {
      if (p.isDead) continue;
      if (dist(p.position.x, p.position.y, enemy.position.x, enemy.position.y) <= enemy.detectionRange * 2.5) {
        p.session.send(MsgType.CHAT_MSG, chatMsg);
      }
    }
  }
}

/** 供 LLM 快照读取:该 NPC 的小队分工 + 队友名 + 目标(无队则 undefined) */
export function squadSnapshot(
  world: GameWorld,
  enemy: Enemy
): { role: string; allies: string[]; target: string } | undefined {
  if (enemy.squadId === null || enemy.squadRole === null) return undefined;
  const allies: string[] = [];
  for (const other of world.enemies.values()) {
    if (other.id === enemy.id || !other.llmEnabled) continue;
    if (other.squadId === enemy.squadId) allies.push(other.displayName || other.kind);
  }
  const mob = enemy.squadTargetId !== null ? world.enemies.get(enemy.squadTargetId) : null;
  return {
    role: enemy.squadRole,
    allies,
    target: mob ? mob.kind : '目标',
  };
}
