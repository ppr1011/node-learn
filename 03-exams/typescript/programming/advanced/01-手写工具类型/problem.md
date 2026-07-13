# 进阶 01 - 手写工具类型

## 背景

TypeScript 内置了 `Pick` / `Omit` / `Readonly` 等工具类型。本题要求你**从零实现**它们,并实现对应的运行时函数,理解「类型层」和「值层」的对应关系。

## 要求

在 `index.ts` 中实现:

### 类型层(用映射类型 + `keyof` + 条件类型)

1. `MyPick<T, K extends keyof T>`:等价于内置 `Pick`。
2. `MyOmit<T, K extends keyof T>`:等价于内置 `Omit`(从 `T` 中去掉 `K`)。
3. `MyReadonly<T>`:把所有属性变成只读。

### 值层(运行时函数)

4. `pick<T, K extends keyof T>(obj: T, keys: K[]): MyPick<T, K>`
   从对象里挑出指定的键。

5. `omit<T, K extends keyof T>(obj: T, keys: K[]): MyOmit<T, K>`
   从对象里去掉指定的键(返回新对象,不修改原对象)。

## 提示

- 映射类型语法:`{ [P in K]: T[P] }`。
- `MyOmit` 可借助 `Exclude<keyof T, K>`,或用 `as` 重映射键。
- 运行时 `pick` 遍历 `keys`;`omit` 遍历 `Object.keys(obj)` 并过滤。
- 类型断言 `as` 在运行时函数收尾处通常需要。

## 评分点

- 三个类型别名与内置类型行为一致(测试用类型级断言 `Expect<Equal<...>>` 检验);
- `pick` / `omit` 运行时行为正确,且 `omit` 不修改原对象。

## 运行

```bash
npx ts-node 03-exams/typescript/programming/advanced/01-手写工具类型/index.test.ts
```
