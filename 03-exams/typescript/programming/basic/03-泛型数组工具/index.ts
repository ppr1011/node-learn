/**
 * 基础 03 - 泛型数组工具(骨架)
 */

export function chunk<T>(arr: T[], size: number): T[][] {
  // TODO: 按 size 切块;size<=0 抛 RangeError
  throw new Error("TODO: 实现 chunk");
}

export function uniqueBy<T, K>(arr: T[], keyFn: (item: T) => K): T[] {
  // TODO: 按 keyFn 去重,保留首次出现,保持顺序
  throw new Error("TODO: 实现 uniqueBy");
}

export function groupBy<T, K extends string | number>(
  arr: T[],
  keyFn: (item: T) => K
): Record<K, T[]> {
  // TODO: 按 keyFn 分组
  throw new Error("TODO: 实现 groupBy");
}
