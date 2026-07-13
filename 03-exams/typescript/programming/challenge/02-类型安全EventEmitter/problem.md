# 挑战 02 - 类型安全的 EventEmitter

## 背景

Node 原生 `EventEmitter` 的事件名是字符串、载荷是 `any`,没有类型约束。本题实现一个**泛型、类型安全**的事件发射器:事件名与其载荷类型一一对应,`on` / `emit` 传错类型会编译报错。

```ts
class TypedEmitter<Events> {
  on<K extends keyof Events>(event: K, listener: (payload: Events[K]) => void): this;
  off<K extends keyof Events>(event: K, listener: (payload: Events[K]) => void): this;
  once<K extends keyof Events>(event: K, listener: (payload: Events[K]) => void): this;
  emit<K extends keyof Events>(event: K, payload: Events[K]): boolean;
  listenerCount<K extends keyof Events>(event: K): number;
}
```

> 💡 为什么泛型参数 `Events` 不加 `extends Record<string, unknown>` 约束?
> 因为用 `interface` 定义的事件表**没有隐式索引签名**,无法满足 `Record<string, unknown>` 约束(TS 经典陷阱)。
> 这里不加约束即可,`K extends keyof Events` 已足够保证类型安全。

## 要求

在 `index.ts` 中实现 `TypedEmitter`:

1. `on`:注册监听器,返回 `this`(可链式)。
2. `off`:移除**指定的**监听器函数(同一引用),返回 `this`。
3. `once`:注册只触发一次的监听器;触发后自动移除。
4. `emit`:同步依次调用该事件所有监听器;有监听器返回 `true`,否则 `false`。
5. `listenerCount`:返回某事件当前监听器数量(`once` 尚未触发也计入)。

## 提示

- 内部用 `Map<keyof Events, Set<Function>>` 存储监听器。
- `once` 的实现:包一层 wrapper,wrapper 里先 `off` 再调用原 listener。注意 `listenerCount` 与 `off` 的语义(参考答案对 once 的处理)。
- `emit` 遍历时先复制一份监听器列表,避免 `once` 在遍历中修改集合导致问题。

## 评分点

- 五个方法行为正确;
- 类型安全:错误的事件名/载荷类型应无法编译(测试含类型级用例)。

## 运行

```bash
npx ts-node 03-exams/typescript/programming/challenge/02-类型安全EventEmitter/index.test.ts
```
