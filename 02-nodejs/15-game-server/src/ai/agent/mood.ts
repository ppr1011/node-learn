/**
 * NPC 心情 —— 影响 LLM 语气与战术倾向
 */

import { Enemy } from '../../core/Enemy';
import { GameWorld } from '../../core/GameWorld';

function clamp(v: number): number {
  return Math.max(-100, Math.min(100, v));
}

export function moodLabel(mood: number): string {
  if (mood >= 60) return '愉快';
  if (mood >= 25) return '平静';
  if (mood >= -20) return '普通';
  if (mood >= -55) return '烦躁';
  return '沮丧';
}

export class NpcMood {
  static tick(enemy: Enemy, world: GameWorld, dt: number): void {
    if (!enemy.llmEnabled || enemy.isDead) return;

    let delta = 0;
    const w = world.weather.kind;
    if (w === 'rain' || w === 'snow') delta -= 0.8 * dt;
    if (w === 'clear') delta += 0.15 * dt;

    let nearby = 0;
    for (const p of world.players.values()) {
      if (p.isDead) continue;
      const d = Math.hypot(p.position.x - enemy.position.x, p.position.y - enemy.position.y);
      if (d <= enemy.detectionRange * 1.2) nearby++;
    }
    if (nearby === 0) delta -= 0.4 * dt;
    else if (nearby >= 1) delta += 0.2 * dt;

    enemy.mood = clamp(enemy.mood + delta);
  }

  static onFriendlyChat(enemy: Enemy): void {
    enemy.mood = clamp(enemy.mood + 8);
  }

  static onHit(enemy: Enemy): void {
    enemy.mood = clamp(enemy.mood - 25);
  }

  static onQuestComplete(enemy: Enemy): void {
    enemy.mood = clamp(enemy.mood + 15);
  }

  static onHealed(enemy: Enemy): void {
    enemy.mood = clamp(enemy.mood + 12);
  }

  static shouldFleeBias(enemy: Enemy): boolean {
    return enemy.mood < -45 || enemy.hp / enemy.maxHp < 0.35;
  }

  static format(enemy: Enemy): string {
    return `${moodLabel(enemy.mood)}(${enemy.mood})`;
  }
}
