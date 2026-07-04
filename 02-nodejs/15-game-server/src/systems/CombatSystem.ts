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

    // ── Try player-vs-player ──────────────────────────────────────
    const nearby = this.world.aoi.getNearbyPlayers(player);
    let pvpTarget: Player | null = null;
    let pvpDist = Infinity;

    for (const other of nearby) {
      if (other.isDead) continue;
      const dist = player.distanceTo(other);
      if (dist <= player.attackRange && dist < pvpDist) {
        pvpDist = dist;
        pvpTarget = other;
      }
    }

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

    // ── Try player-vs-enemy ───────────────────────────────────────
    let enemyTarget: Enemy | null = null;
    let enemyDist = player.attackRange;

    for (const enemy of this.world.enemies.values()) {
      if (enemy.isDead) continue;
      const dx = player.position.x - enemy.position.x;
      const dy = player.position.y - enemy.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= enemyDist) { enemyDist = dist; enemyTarget = enemy; }
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
