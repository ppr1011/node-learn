/**
 * 昼夜日程(功能7)—— 世界时钟 + NPC 作息
 *
 * 一整天压缩为 GameConfig.DAY_CYCLE_MS,循环推进四个相位:
 *   黎明(dawn) → 白天(day) → 黄昏(dusk) → 夜晚(night)
 * 相位既注入 LLM 快照影响台词,也通过 biasFor 改变行为树倾向(夜晚回巢、少清怪)。
 */

export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night';

export interface DayNight {
  phase: DayPhase;
  /** 整日进度 0–1(0=一天开始的黎明,循环) */
  t: number;
}

/** 相位边界(整日进度占比):黎明 15% / 白天 45% / 黄昏 15% / 夜晚 25% */
function phaseOf(t: number): DayPhase {
  if (t < 0.15) return 'dawn';
  if (t < 0.6) return 'day';
  if (t < 0.75) return 'dusk';
  return 'night';
}

/** 纯函数:由绝对时间与循环时长推出当前昼夜(无副作用,前后端可各自计算) */
export function phaseAt(now: number, cycleMs: number): DayNight {
  const t = (now % cycleMs) / cycleMs;
  return { phase: phaseOf(t), t };
}

const LABELS: Record<DayPhase, string> = {
  dawn: '黎明',
  day: '白天',
  dusk: '黄昏',
  night: '夜晚',
};

export function timeLabel(phase: DayPhase): string {
  return LABELS[phase];
}

export interface ScheduleBias {
  /** 是否允许主动清怪(夜晚 NPC 休整,只在跟随/显式 hunt 时才动) */
  huntAllowed: boolean;
  /** 是否应当回巢(夜晚远离出生点则往回走) */
  homebound: boolean;
  /** 是否更易逃跑(夜晚警惕,残血更早撤) */
  fleeBias: boolean;
}

export class NpcSchedule {
  static biasFor(phase: DayPhase): ScheduleBias {
    switch (phase) {
      case 'night':
        return { huntAllowed: false, homebound: true, fleeBias: true };
      case 'dusk':
        return { huntAllowed: true, homebound: false, fleeBias: true };
      case 'dawn':
      case 'day':
      default:
        return { huntAllowed: true, homebound: false, fleeBias: false };
    }
  }
}
