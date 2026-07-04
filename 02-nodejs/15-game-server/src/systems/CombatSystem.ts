import { Player } from '../core/Player';
import { Enemy } from '../core/Enemy';
import { GameWorld } from '../core/GameWorld';
import { MsgType } from '../network/Protocol';
import { GameConfig } from '../config';

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
      pvpTarget.takeDamage(player.attackDamage);
      const damageMsg = {
        attackerId: player.id,
        targetId: pvpTarget.id,
        damage: player.attackDamage,
        targetHp: pvpTarget.hp,
      };
      player.session.send(MsgType.DAMAGE, damageMsg);
      pvpTarget.session.send(MsgType.DAMAGE, damageMsg);
      for (const other of nearby) {
        if (other.id !== player.id && other.id !== pvpTarget.id) {
          other.session.send(MsgType.DAMAGE, damageMsg);
        }
      }
      if (pvpTarget.isDead) this.handlePlayerDeath(pvpTarget);
      return;
    }

    if (!enemyTarget) return;

    enemyTarget.takeDamage(player.attackDamage);
    const hitMsg = {
      enemyId: enemyTarget.id,
      attackerId: player.id,
      damage: player.attackDamage,
      enemyHp: enemyTarget.hp,
    };
    player.session.send(MsgType.ENEMY_HIT, hitMsg);
    for (const other of nearby) other.session.send(MsgType.ENEMY_HIT, hitMsg);

    if (enemyTarget.isDead) {
      const deadMsg = { enemyId: enemyTarget.id };
      player.session.send(MsgType.ENEMY_DEAD, deadMsg);
      for (const other of nearby) other.session.send(MsgType.ENEMY_DEAD, deadMsg);

      // 击杀 → 按几率掉落武器(强敌 luck 更高,更易出稀有/史诗)
      this.world.spawnWeaponDrop(enemyTarget);

      // Schedule respawn
      enemyTarget.respawnAt = Date.now() + ENEMY_RESPAWN_TIME;
    }
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
