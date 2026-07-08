import { Player } from '../core/Player';
import { Enemy } from '../core/Enemy';
import { GameWorld } from '../core/GameWorld';
import { MsgType } from '../network/Protocol';
import { isSkillId, SKILLS, SkillId } from '../core/Skills';
import { CombatSystem } from './CombatSystem';
import { NpcSpeech } from '../ai/agent/npcSpeech';

interface CastData {
  skillId?: unknown;
  targetId?: unknown;
  targetKind?: unknown;
  x?: unknown;
  y?: unknown;
}

export class SkillSystem {
  /** 各玩家各技能上次施法时间 */
  private readonly lastCast = new Map<number, Partial<Record<SkillId, number>>>();

  constructor(
    private readonly world: GameWorld,
    private readonly combat: CombatSystem,
  ) {}

  handleCast(player: Player, raw: CastData | undefined): void {
    if (!raw || !isSkillId(raw.skillId) || player.isDead) return;

    const skill = SKILLS[raw.skillId];
    const now = Date.now();
    const cdMap = this.lastCast.get(player.id) ?? {};
    const last = cdMap[skill.id] ?? 0;
    if (now - last < skill.cooldown) return;

    let ok = false;
    switch (skill.id) {
      case 'heal':
        ok = this.castHeal(player, raw);
        break;
      case 'fireball':
        ok = this.castFireball(player, raw);
        break;
      case 'meteor':
        ok = this.castMeteor(player, raw);
        break;
    }
    if (!ok) return;

    cdMap[skill.id] = now;
    this.lastCast.set(player.id, cdMap);
  }

  /** 移除玩家时清理冷却记录 */
  removePlayer(playerId: number): void {
    this.lastCast.delete(playerId);
  }

  private castHeal(player: Player, raw: CastData): boolean {
    const skill = SKILLS.heal;
    const nearby = this.world.aoi.getNearbyPlayers(player);

    let targetPlayer: Player | null = null;
    let targetEnemy: Enemy | null = null;

    if (raw.targetKind === 'enemy' && typeof raw.targetId === 'number') {
      targetEnemy = this.world.enemies.get(raw.targetId) ?? null;
    } else if (raw.targetKind === 'player' && typeof raw.targetId === 'number') {
      targetPlayer = this.world.players.get(raw.targetId) ?? null;
    } else if (typeof raw.targetId === 'number') {
      targetPlayer = this.world.players.get(raw.targetId) ?? null;
      if (!targetPlayer) targetEnemy = this.world.enemies.get(raw.targetId) ?? null;
    } else {
      targetPlayer = player;
    }

    if (targetPlayer) {
      if (targetPlayer.isDead) return false;
      if (targetPlayer.id !== player.id) {
        const dist = player.distanceTo(targetPlayer);
        if (dist > skill.range) return false;
      }
      player.facing = Math.atan2(
        targetPlayer.position.y - player.position.y,
        targetPlayer.position.x - player.position.x,
      );
      this.broadcastSkillCast(player, 'heal', nearby, {
        x: Math.round(targetPlayer.position.x),
        y: Math.round(targetPlayer.position.y),
      });
      const healed = targetPlayer.heal(skill.heal!);
      if (healed <= 0) return false;
      this.broadcastHeal(player, targetPlayer, 'player', healed, nearby);
      return true;
    }

    if (targetEnemy) {
      if (targetEnemy.isDead) return false;
      const dist = Math.hypot(
        player.position.x - targetEnemy.position.x,
        player.position.y - targetEnemy.position.y,
      );
      if (dist > skill.range) return false;
      player.facing = Math.atan2(
        targetEnemy.position.y - player.position.y,
        targetEnemy.position.x - player.position.x,
      );
      this.broadcastSkillCast(player, 'heal', nearby, {
        x: Math.round(targetEnemy.position.x),
        y: Math.round(targetEnemy.position.y),
      });
      const healed = targetEnemy.heal(skill.heal!);
      if (healed <= 0) return false;
      this.broadcastHeal(player, targetEnemy, 'enemy', healed, nearby);
      NpcSpeech.onHealedByPlayer(this.world, targetEnemy, player.name, healed, Date.now());
      return true;
    }

    return false;
  }

  private castFireball(player: Player, raw: CastData): boolean {
    const skill = SKILLS.fireball;
    const nearby = this.world.aoi.getNearbyPlayers(player);
    const damage = skill.damage! + Math.floor((player.level - 1) * 1.5);

    let targetPlayer: Player | null = null;
    let targetEnemy: Enemy | null = null;

    if (raw.targetKind === 'enemy' && typeof raw.targetId === 'number') {
      targetEnemy = this.world.enemies.get(raw.targetId) ?? null;
    } else if (raw.targetKind === 'player' && typeof raw.targetId === 'number') {
      targetPlayer = this.world.players.get(raw.targetId) ?? null;
    } else if (typeof raw.targetId === 'number') {
      targetEnemy = this.world.enemies.get(raw.targetId) ?? null;
      if (!targetEnemy) targetPlayer = this.world.players.get(raw.targetId) ?? null;
    } else {
      targetEnemy = this.findNearestEnemy(player, skill.range);
      if (!targetEnemy) targetPlayer = this.findNearestPlayer(player, skill.range);
    }

    const target = targetPlayer ?? targetEnemy;
    if (!target || target.isDead) return false;

    const dist = targetPlayer
      ? player.distanceTo(targetPlayer)
      : Math.hypot(
          player.position.x - targetEnemy!.position.x,
          player.position.y - targetEnemy!.position.y,
        );
    if (dist > skill.range) return false;

    player.facing = Math.atan2(
      target.position.y - player.position.y,
      target.position.x - player.position.x,
    );
    this.broadcastSkillCast(player, 'fireball', nearby, {
      x: Math.round(target.position.x),
      y: Math.round(target.position.y),
      dir: Math.round(player.facing * 100) / 100,
    });

    if (targetPlayer) {
      this.combat.damagePlayer(player, targetPlayer, damage);
    } else {
      this.combat.damageEnemy(player, targetEnemy!, damage);
    }
    return true;
  }

  private castMeteor(player: Player, raw: CastData): boolean {
    const skill = SKILLS.meteor;
    if (typeof raw.x !== 'number' || typeof raw.y !== 'number') return false;

    const cx = raw.x;
    const cy = raw.y;
    const dist = Math.hypot(player.position.x - cx, player.position.y - cy);
    if (dist > skill.range) return false;

    const nearby = this.world.aoi.getNearbyPlayers(player);
    player.facing = Math.atan2(cy - player.position.y, cx - player.position.x);

    this.broadcastSkillCast(player, 'meteor', nearby, {
      x: Math.round(cx),
      y: Math.round(cy),
      radius: skill.aoeRadius,
      dir: Math.round(player.facing * 100) / 100,
    });

    const damage = skill.damage! + Math.floor((player.level - 1) * 1.2);
    const radius = skill.aoeRadius!;
    const hits: { kind: 'enemy' | 'player'; id: number; damage: number; hp: number }[] = [];

    for (const enemy of this.world.enemies.values()) {
      if (enemy.isDead) continue;
      const d = Math.hypot(enemy.position.x - cx, enemy.position.y - cy);
      if (d > radius) continue;
      this.combat.damageEnemy(player, enemy, damage, false);
      hits.push({ kind: 'enemy', id: enemy.id, damage, hp: enemy.hp });
    }

    for (const other of this.world.players.values()) {
      if (other.isDead || other.id === player.id) continue;
      const d = Math.hypot(other.position.x - cx, other.position.y - cy);
      if (d > radius) continue;
      this.combat.damagePlayer(player, other, damage, false);
      hits.push({ kind: 'player', id: other.id, damage, hp: other.hp });
    }

    const aoeMsg = {
      casterId: player.id,
      skillId: 'meteor' as const,
      x: Math.round(cx),
      y: Math.round(cy),
      radius,
      hits,
    };
    player.session.send(MsgType.AOE_HIT, aoeMsg);
    for (const other of nearby) other.session.send(MsgType.AOE_HIT, aoeMsg);

    return true;
  }

  private findNearestEnemy(player: Player, range: number): Enemy | null {
    let best: Enemy | null = null;
    let bestDist = range;
    for (const enemy of this.world.enemies.values()) {
      if (enemy.isDead) continue;
      const dist = Math.hypot(
        player.position.x - enemy.position.x,
        player.position.y - enemy.position.y,
      );
      if (dist <= bestDist) {
        bestDist = dist;
        best = enemy;
      }
    }
    return best;
  }

  private findNearestPlayer(player: Player, range: number): Player | null {
    let best: Player | null = null;
    let bestDist = range;
    for (const other of this.world.aoi.getNearbyPlayers(player)) {
      if (other.id === player.id || other.isDead) continue;
      const dist = player.distanceTo(other);
      if (dist <= bestDist) {
        bestDist = dist;
        best = other;
      }
    }
    return best;
  }

  private broadcastSkillCast(
    player: Player,
    skillId: SkillId,
    nearby: Player[],
    extra: Record<string, unknown>,
  ): void {
    const msg = { casterId: player.id, skillId, ...extra };
    player.session.send(MsgType.SKILL_CAST, msg);
    for (const other of nearby) other.session.send(MsgType.SKILL_CAST, msg);
  }

  private broadcastHeal(
    caster: Player,
    target: Player | Enemy,
    targetKind: 'player' | 'enemy',
    amount: number,
    nearby: Player[],
  ): void {
    const msg = {
      casterId: caster.id,
      targetKind,
      targetId: target.id,
      amount,
      hp: target.hp,
      maxHp: target.maxHp,
    };
    caster.session.send(MsgType.HEAL, msg);
    for (const other of nearby) other.session.send(MsgType.HEAL, msg);
  }
}
