/**
 * 进阶 01 - 参考答案
 */

export type MyPick<T, K extends keyof T> = {
  [P in K]: T[P];
};

export type MyOmit<T, K extends keyof T> = {
  [P in Exclude<keyof T, K>]: T[P];
};

export type MyReadonly<T> = {
  readonly [P in keyof T]: T[P];
};

export function pick<T extends object, K extends keyof T>(
  obj: T,
  keys: K[]
): MyPick<T, K> {
  const result = {} as MyPick<T, K>;
  for (const key of keys) {
    (result as any)[key] = obj[key];
  }
  return result;
}

export function omit<T extends object, K extends keyof T>(
  obj: T,
  keys: K[]
): MyOmit<T, K> {
  const omitSet = new Set<PropertyKey>(keys);
  const result = {} as Record<PropertyKey, unknown>;
  for (const key of Object.keys(obj) as (keyof T)[]) {
    if (!omitSet.has(key)) {
      result[key as PropertyKey] = obj[key];
    }
  }
  return result as MyOmit<T, K>;
}
