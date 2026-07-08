/** 英雄默认技能表(所有玩家自带,独立于武器) */
export type SkillId = 'heal' | 'fireball' | 'meteor';

export interface SkillDef {
  id: SkillId;
  label: string;
  cooldown: number; // ms
  range: number;    // 施法距离(px)
  heal?: number;
  damage?: number;
  aoeRadius?: number;
}

export const SKILLS: Record<SkillId, SkillDef> = {
  heal: {
    id: 'heal',
    label: '治疗',
    cooldown: 5000,
    range: 280,
    heal: 35,
  },
  fireball: {
    id: 'fireball',
    label: '火球术',
    cooldown: 2500,
    range: 320,
    damage: 28,
  },
  meteor: {
    id: 'meteor',
    label: '陨石雨',
    cooldown: 8000,
    range: 360,
    damage: 20,
    aoeRadius: 130,
  },
};

export const DEFAULT_SKILL_IDS: SkillId[] = ['heal', 'fireball', 'meteor'];

export function isSkillId(v: unknown): v is SkillId {
  return v === 'heal' || v === 'fireball' || v === 'meteor';
}
