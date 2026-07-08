import { Player } from '../core/Player';
import { Enemy } from '../core/Enemy';
import { GameWorld } from '../core/GameWorld';
import { MsgType } from '../network/Protocol';
import { GameConfig } from '../config';
import { NpcMemory } from '../ai/llm/memory';
import { NpcQuests } from '../ai/agent/quest';
import { RumorBoard } from '../ai/agent/rumor';

const ENEMY_RESPAWN_TIME = GameConfig.ENEMY_RESPAWN_TIME;

export class CombatSystem {
  constructor(private readonly world: GameWorld) {}

  handleAttack(player: Player): void {
    if (!player.canAttack()) return;
    player.lastAttackTime = Date.now();

    const nearby = this.world.aoi.getNearbyPlayers(player);

    // ── 选定攻击目标:玩家优先,其次敌人(都取攻击距离内最近) ────────────
    let pvpTarget: Player | null = null;
    let pvpDist = player.attackRange;
    for (const other of nearby) {
      if (other.isDead) continue;
      const dist = player.distanceTo(other);
      if (dist <= pvpDist) { pvpDist = dist; pvpTarget = other; }
    }

    let enemyTarget: Enemy | null = null;
    if (!pvpTarget) {
      let enemyDist = player.attackRange;
      for (const enemy of this.world.enemies.values()) {
        if (enemy.isDead) continue;
        const dx = player.position.x - enemy.position.x;
        const dy = player.position.y - enemy.position.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= enemyDist) { enemyDist = dist; enemyTarget = enemy; }
      }
    }

    // ── 攻击方向:朝目标(并写回 facing);无目标沿最后朝向挥空 ──────────────
    const target = pvpTarget ?? enemyTarget;
    if (target) {
      player.facing = Math.atan2(
        target.position.y - player.position.y,
        target.position.x - player.position.x
      );
    }

    // ── 广播挥击动画(命中与否都播,空挥也有动作) ─────────────────────────
    const attackMsg = {
      attackerId: player.id,
      weapon: player.weapon,
      dir: Math.round(player.facing * 100) / 100,
      range: player.attackRange,
      hit: !!target,
    };
    player.session.send(MsgType.ATTACK, attackMsg);
    for (const other of nearby) other.session.send(MsgType.ATTACK, attackMsg);

    // ── 命中结算 ─────────────────────────────────────────────────────────
    if (pvpTarget) {
      this.damagePlayer(player, pvpTarget, player.attackDamage);
      return;
    }

    if (!enemyTarget) return;
    this.damageEnemy(player, enemyTarget, player.attackDamage);
  }

  /** 对玩家造成伤害并广播(技能 / 普攻共用) */
  damagePlayer(
    attacker: Player,
    target: Player,
    damage: number,
    broadcast: boolean = true,
  ): void {
    const nearby = this.world.aoi.getNearbyPlayers(attacker);
    target.takeDamage(damage);
    if (broadcast) {
      const damageMsg = {
        attackerId: attacker.id,
        targetId: target.id,
        damage,
        targetHp: target.hp,
      };
      attacker.session.send(MsgType.DAMAGE, damageMsg);
      target.session.send(MsgType.DAMAGE, damageMsg);
      for (const other of nearby) {
        if (other.id !== attacker.id && other.id !== target.id) {
          other.session.send(MsgType.DAMAGE, damageMsg);
        }
      }
    }
    if (target.isDead) this.handlePlayerDeath(target);
  }

  /** 对敌人造成伤害并广播;可选跳过即时广播(陨石雨汇总走 AOE_HIT) */
  damageEnemy(
    attacker: Player,
    enemy: Enemy,
    damage: number,
    broadcast: boolean = true,
  ): void {
    const nearby = this.world.aoi.getNearbyPlayers(attacker);
    enemy.takeDamage(damage);
    if (enemy.llmEnabled) {
      NpcMemory.onPlayerHit(enemy, attacker.name, damage, Date.now());
    }
    if (broadcast) {
      const hitMsg = {
        enemyId: enemy.id,
        attackerId: attacker.id,
        damage,
        enemyHp: enemy.hp,
      };
      attacker.session.send(MsgType.ENEMY_HIT, hitMsg);
      for (const other of nearby) other.session.send(MsgType.ENEMY_HIT, hitMsg);
    }
    if (enemy.isDead) this.onEnemyKilled(attacker, enemy, nearby);
  }

  private onEnemyKilled(attacker: Player, enemy: Enemy, nearby: Player[]): void {
    if (enemy.llmEnabled) {
      NpcMemory.onNpcDeath(enemy, attacker.name, Date.now());
      RumorBoard.add(
        this.world,
        enemy.zoneId,
        `${attacker.name}击杀了${enemy.displayName || 'NPC'}`,
        Date.now()
      );
    } else {
      NpcQuests.onPlayerKillMob(
        this.world,
        attacker,
        enemy.kind,
        enemy.position.x,
        enemy.position.y,
        Date.now()
      );
    }
    const deadMsg = { enemyId: enemy.id };
    attacker.session.send(MsgType.ENEMY_DEAD, deadMsg);
    for (const other of nearby) other.session.send(MsgType.ENEMY_DEAD, deadMsg);

    const levelsGained = attacker.gainXp(enemy.xpReward);
    attacker.session.send(MsgType.XP_GAIN, {
      id: attacker.id,
      gained: enemy.xpReward,
      xp: attacker.xp,
      xpToNext: attacker.xpToNext,
      level: attacker.level,
    });
    if (levelsGained > 0) {
      const lvMsg = {
        id: attacker.id,
        level: attacker.level,
        hp: attacker.hp,
        maxHp: attacker.maxHp,
        xp: attacker.xp,
        xpToNext: attacker.xpToNext,
      };
      attacker.session.send(MsgType.LEVEL_UP, lvMsg);
      for (const other of nearby) other.session.send(MsgType.LEVEL_UP, lvMsg);
    }

    this.world.spawnWeaponDrop(enemy);
    enemy.respawnAt = Date.now() + ENEMY_RESPAWN_TIME;
  }

  /** Called by CombatSystem or EnemyAISystem when a player's HP drops to 0 */
  handlePlayerDeath(player: Player): void {
    const nearby = this.world.aoi.getNearbyPlayers(player);

    player.session.send(MsgType.PLAYER_DEAD, { id: player.id });
    for (const other of nearby) {
      other.session.send(MsgType.PLAYER_DEAD, { id: player.id });
    }

    setTimeout(() => {
      if (!this.world.players.has(player.id)) return;

      const spawn = this.world.findSafeSpawn(player.radius);
      player.respawn(spawn.x, spawn.y);

      this.world.aoi.removePlayer(player);
      this.world.aoi.addPlayer(player);

      player.session.send(MsgType.PLAYER_RESPAWN, player.toPublicState());

      const newNearby = this.world.aoi.getNearbyPlayers(player);
      for (const other of newNearby) {
        other.session.send(MsgType.PLAYER_RESPAWN, player.toPublicState());
      }
    }, GameConfig.RESPAWN_TIME);
  }
}
