/**
 * 武器定义 —— 服务端权威数值表
 *
 * 与 Enemy.ts 的 KIND_STATS 同构:把「一类实体按 kind 分档的静态数值」集中放在实体文件里,
 * 而非散进 config。玩家装备武器 = 把这里的 damage/range/cooldown 拷到 Player 上(见 Player.equip)。
 *
 * 武器阵容对齐 client/assets/weapons/ 的真实 CC0 贴图(Kenney Tiny Dungeon):
 * 该素材包不含弓/矛,故用「匕首/剑/巨剑/斧/锤/法杖」六件,覆盖 快/均衡/重/超重/旋风/远程 的手感谱系。
 */

export type WeaponKind = 'fist' | 'dagger' | 'sword' | 'greatsword' | 'axe' | 'hammer' | 'staff';
export type Rarity = 'common' | 'rare' | 'epic';

export interface WeaponStats {
  label: string; // 中文名(客户端 HUD 显示)
  damage: number;
  range: number; // 攻击判定距离(px)
  cooldown: number; // ms
  rarity: Rarity;
  dropWeight: number; // 掉落加权(越大越常见);fist 不掉落 → 0
}

export const WEAPONS: Record<WeaponKind, WeaponStats> = {
  // 默认徒手(挥拳):作为起手武器需能拿下第一杀,故适当增强(伤害/出手速度/距离)
  fist: { label: '徒手', damage: 14, range: 90, cooldown: 600, rarity: 'common', dropWeight: 0 },
  dagger: { label: '匕首', damage: 12, range: 70, cooldown: 450, rarity: 'common', dropWeight: 30 },
  sword: { label: '铁剑', damage: 20, range: 105, cooldown: 800, rarity: 'common', dropWeight: 26 },
  greatsword: { label: '巨剑', damage: 30, range: 120, cooldown: 1250, rarity: 'rare', dropWeight: 14 },
  axe: { label: '战斧', damage: 34, range: 95, cooldown: 1400, rarity: 'rare', dropWeight: 12 },
  hammer: { label: '战锤', damage: 42, range: 100, cooldown: 1700, rarity: 'epic', dropWeight: 6 },
  staff: { label: '法杖', damage: 26, range: 240, cooldown: 1150, rarity: 'epic', dropWeight: 8 },
};

/** 可掉落的武器种类(排除 fist) */
export const DROPPABLE: WeaponKind[] = (Object.keys(WEAPONS) as WeaponKind[]).filter(
  (k) => WEAPONS[k].dropWeight > 0
);

/**
 * 加权随机掉一件武器。luck > 1 时提高稀有/史诗权重(强敌掉好货)。
 * @param luck 幸运系数:common 权重恒定,rare×luck,epic×luck²。
 */
export function rollWeaponDrop(luck = 1): WeaponKind {
  const weightOf = (k: WeaponKind): number => {
    const w = WEAPONS[k];
    const mult = w.rarity === 'epic' ? luck * luck : w.rarity === 'rare' ? luck : 1;
    return w.dropWeight * mult;
  };
  const total = DROPPABLE.reduce((s, k) => s + weightOf(k), 0);
  let r = Math.random() * total;
  for (const k of DROPPABLE) {
    r -= weightOf(k);
    if (r <= 0) return k;
  }
  return DROPPABLE[DROPPABLE.length - 1]!;
}
