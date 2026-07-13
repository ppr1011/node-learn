/**
 * 基础 02 - 接口实现:泛型栈(骨架)
 */

export interface IStack<T> {
  push(item: T): void;
  pop(): T | undefined;
  peek(): T | undefined;
  size(): number;
  isEmpty(): boolean;
  toArray(): T[];
}

export class Stack<T> implements IStack<T> {
  // TODO: 用一个私有数组保存元素

  push(item: T): void {
    throw new Error("TODO: 实现 push");
  }

  pop(): T | undefined {
    throw new Error("TODO: 实现 pop");
  }

  peek(): T | undefined {
    throw new Error("TODO: 实现 peek");
  }

  size(): number {
    throw new Error("TODO: 实现 size");
  }

  isEmpty(): boolean {
    throw new Error("TODO: 实现 isEmpty");
  }

  toArray(): T[] {
    throw new Error("TODO: 实现 toArray");
  }
}
