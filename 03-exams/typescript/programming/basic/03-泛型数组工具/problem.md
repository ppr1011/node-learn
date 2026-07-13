# 基础 03 - 泛型数组工具

## 背景

实现三个常用的泛型数组工具函数,要求类型安全(不使用 `any`)。

## 要求

在 `index.ts` 中实现:

1. `chunk<T>(arr: T[], size: number): T[][]`
   把数组按 `size` 切成若干块。最后一块可能不足 `size`。
   - `size <= 0` 时抛出 `RangeError`。
   - 空数组返回 `[]`。

2. `uniqueBy<T, K>(arr: T[], keyFn: (item: T) => K): T[]`
   按 `keyFn` 计算的键去重,**保留首次出现**的元素,保持原顺序。

3. `groupBy<T, K extends string | number>(arr: T[], keyFn: (item: T) => K): Record<K, T[]>`
   按 `keyFn` 分组,返回「键 → 该组元素数组」。组内保持原顺序。

## 提示

- `chunk` 可用循环 + `slice`。
- `uniqueBy` 用 `Set`/`Map` 记录已见过的键。
- `groupBy` 返回对象,注意用 `Record<K, T[]>`;可先 `Object.create(null)` 或 `{} as Record<K, T[]>`。

## 评分点

- 三个函数行为正确、类型正确;
- `chunk` 的边界(size<=0 抛错、空数组)正确。

## 运行

```bash
npx ts-node 03-exams/typescript/programming/basic/03-泛型数组工具/index.test.ts
```
