# 基础 02 - 接口实现:泛型栈

## 背景

实现一个泛型栈 `Stack<T>`,满足给定接口 `IStack<T>`。

```ts
interface IStack<T> {
  push(item: T): void;      // 入栈
  pop(): T | undefined;     // 出栈(空栈返回 undefined)
  peek(): T | undefined;    // 查看栈顶但不弹出
  size(): number;           // 元素个数
  isEmpty(): boolean;       // 是否为空
  toArray(): T[];           // 从栈底到栈顶的数组副本
}
```

## 要求

在 `index.ts` 中实现 `class Stack<T> implements IStack<T>`:

- 后进先出(LIFO);
- `pop` / `peek` 在空栈时返回 `undefined`;
- `toArray` 返回的是**副本**(修改返回值不能影响栈内部);
- 顺序:数组下标 0 是栈底,最后一个元素是栈顶。

## 提示

- 内部用一个私有数组存储即可。
- `toArray` 记得 `[...this.items]` 返回副本。

## 评分点

- 六个方法行为正确;
- 泛型参数正确传递,`implements IStack<T>` 不报错。

## 运行

```bash
npx ts-node 03-exams/typescript/programming/basic/02-接口实现-栈/index.test.ts
```
