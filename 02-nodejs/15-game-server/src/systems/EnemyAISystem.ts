import { Enemy } from '../core/Enemy';
import { Player } from '../core/Player';
import { GameWorld } from '../core/GameWorld';
import { MsgType } from '../network/Protocol';
import { GameConfig } from '../config';

const PATROL_RADIUS = 200; // max patrol wander from spawn point

export class EnemyAISystem {
  constructor(private readonly world: GameWorld) {}

  update(dt: number): void {
    const now = Date.now();

    for (const enemy of this.world.enemies.values()) {
      // Handle pending respawns
      if (enemy.isDead) {
        if (enemy.respawnAt > 0 && now >= enemy.respawnAt) {
          const pos = this.world.findSafeSpawn(enemy.radius);
          enemy.respawn(pos.x, pos.y);
          // Broadcast respawn via next state tick (isDead=false will be included)
        }
        continue;
      }

      this.tickEnemy(enemy, dt);
    }
  }

  private tickEnemy(enemy: Enemy, dt: number): void {
    const target = this.findNearestPlayer(enemy);

    if (target) {
      const dist = this.distBetween(enemy, target);
      if (dist <= enemy.attackRange) {
        enemy.aiState = 'attack';
        enemy.velocity = { x: 0, y: 0 };
        this.tryAttack(enemy, target);
      } else {
        enemy.aiState = 'chase';
        enemy.targetPlayerId = target.id;
        this.moveToward(enemy, target.position.x, target.position.y, enemy.speed, dt);
      }
    } else {
      enemy.targetPlayerId = null;
      this.patrol(enemy, dt);
    }

    // Apply movement + boundary clamp
    this.applyMovement(enemy, dt);
  }

  private findNearestPlayer(enemy: Enemy): Player | null {
    let nearest: Player | null = null;
    let minDist = enemy.detectionRange;

    for (const player of this.world.players.values()) {
      if (player.isDead) continue;
      const d = this.distBetween(enemy, player);
      if (d < minDist) { minDist = d; nearest = player; }
    }
    return nearest;
  }

  private tryAttack(enemy: Enemy, player: Player): void {
    const now = Date.now();
    if (now - enemy.lastAttackTime < enemy.attackCooldown) return;
    enemy.lastAttackTime = now;

    player.takeDamage(enemy.attackDamage);

    const damageMsg = {
      attackerId: -(enemy.id), // negative = enemy attacker
      targetId: player.id,
      damage: enemy.attackDamage,
      targetHp: player.hp,
    };

    // Broadcast to the victim and all nearby players
    player.session.send(MsgType.DAMAGE, damageMsg);
    for (const other of this.world.aoi.getNearbyPlayers(player)) {
      if (other.id !== player.id) other.session.send(MsgType.DAMAGE, damageMsg);
    }

    if (player.isDead) {
      // Delegate to CombatSystem death handler
      this.world.combat.handlePlayerDeath(player);
    }
  }

  private patrol(enemy: Enemy, dt: number): void {
    enemy.idleTimer -= dt;

    if (!enemy.patrolTarget || enemy.idleTimer <= 0) {
      // Pick a new random point within PATROL_RADIUS of spawn
      const angle = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * PATROL_RADIUS;
      enemy.patrolTarget = {
        x: Math.max(0, Math.min(GameConfig.MAP_WIDTH, enemy.spawnX + Math.cos(angle) * dist)),
        y: Math.max(0, Math.min(GameConfig.MAP_HEIGHT, enemy.spawnY + Math.sin(angle) * dist)),
      };
      enemy.idleTimer = 1.5 + Math.random() * 3;
      enemy.aiState = 'patrol';
    }

    if (enemy.patrolTarget) {
      const dx = enemy.patrolTarget.x - enemy.position.x;
      const dy = enemy.patrolTarget.y - enemy.position.y;
      const d = Math.hypot(dx, dy);
      if (d < 12) {
        // Reached target, idle for a bit
        enemy.patrolTarget = null;
        enemy.idleTimer = 1 + Math.random() * 2;
        enemy.aiState = 'idle';
        enemy.velocity = { x: 0, y: 0 };
      } else {
        this.moveToward(enemy, enemy.patrolTarget.x, enemy.patrolTarget.y, enemy.speed * 0.4, dt);
      }
    } else {
      enemy.aiState = 'idle';
      enemy.velocity = { x: 0, y: 0 };
    }
  }

  /** Set velocity toward (tx, ty) at given speed */
  private moveToward(enemy: Enemy, tx: number, ty: number, speed: number, dt: number): void {
    const dx = tx - enemy.position.x;
    const dy = ty - enemy.position.y;
    const d = Math.hypot(dx, dy);
    if (d < 2) { enemy.velocity = { x: 0, y: 0 }; return; }
    enemy.velocity = { x: (dx / d) * speed, y: (dy / d) * speed };
  }

  /** Apply velocity and clamp to map bounds (no obstacle push-out for simplicity) */
  private applyMovement(enemy: Enemy, dt: number): void {
    if (enemy.velocity.x === 0 && enemy.velocity.y === 0) return;
    const nx = Math.max(enemy.radius, Math.min(
      GameConfig.MAP_WIDTH - enemy.radius, enemy.position.x + enemy.velocity.x * dt));
    const ny = Math.max(enemy.radius, Math.min(
      GameConfig.MAP_HEIGHT - enemy.radius, enemy.position.y + enemy.velocity.y * dt));
    enemy.position.x = nx;
    enemy.position.y = ny;
  }

  private distBetween(a: { position: { x: number; y: number } }, b: { position: { x: number; y: number } }): number {
    return Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
  }
}
