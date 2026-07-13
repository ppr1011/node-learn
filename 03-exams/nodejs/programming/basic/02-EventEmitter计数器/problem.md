# 基础 02 - 基于 EventEmitter 的计数器

## 背景

用 Node 原生 `events.EventEmitter` 实现一个会发事件的计数器,理解事件驱动。

## 要求

在 `index.ts` 中实现 `class Counter extends EventEmitter`:

- 初始 `value` 为 `0`,提供只读访问 `get value(): number`。
- `increment(step = 1): void`
  - `step` 必须为正整数,否则抛 `RangeError`;
  - 增加 `value`;
  - 每次都发出 `"change"` 事件,载荷为新的数值 `value`;
  - 每当 `value` **跨越一个新的 10 的整数倍**(如从 8 增到 12,跨过了 10)时,发出 `"milestone"` 事件,载荷为跨过的里程碑值(如 `10`)。一次 `increment` 若跨过多个里程碑,只需就最高的那个里程碑发一次即可。
- `reset(): void`:把 `value` 归零并发出 `"reset"` 事件(无载荷)。

## 提示

- `import { EventEmitter } from "events"`。
- 里程碑判断:比较 `Math.floor(old / 10)` 与 `Math.floor(value / 10)`。
- `this.emit("change", value)`。

## 评分点

- `increment` / `reset` 逻辑与事件正确;
- 参数校验(非正整数抛 `RangeError`);
- 里程碑跨越判断正确。

## 运行

```bash
npx ts-node 03-exams/nodejs/programming/basic/02-EventEmitter计数器/index.test.ts
```
