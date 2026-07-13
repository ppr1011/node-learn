# 挑战 01 - 递归类型体操:DeepReadonly / DeepPartial / deepFreeze

## 背景

内置的 `Readonly<T>` / `Partial<T>` 只作用于**第一层**。本题实现"深层"版本,并实现运行时的深冻结。

## 要求

在 `index.ts` 中实现:

### 类型层(递归映射类型)

1. `DeepReadonly<T>`:递归地把所有层级的属性变为 `readonly`。
   - 对象要递归;
   - 数组/函数/原始值按你的理解处理(测试只覆盖「嵌套对象」场景)。

2. `DeepPartial<T>`:递归地把所有层级的属性变为可选。

### 值层

3. `deepFreeze<T>(obj: T): DeepReadonly<T>`
   递归 `Object.freeze` 对象及其所有嵌套对象属性,返回同一引用(类型收窄为 `DeepReadonly<T>`)。

## 提示

- 递归映射:`type DeepReadonly<T> = { readonly [K in keyof T]: DeepReadonly<T[K]> }`。
  但要小心:当 `T[K]` 是原始类型时,`DeepReadonly<number>` 应仍是 `number`。可加条件类型 `T extends object ? ... : T`。
- `deepFreeze` 先遍历自身可枚举属性,对是对象的属性递归冻结,最后冻结自身。
- 注意避免对 `null` 递归(`typeof null === "object"`)。

## 评分点

- `DeepReadonly` / `DeepPartial` 对嵌套对象生效(类型级断言);
- `deepFreeze` 使嵌套对象也被冻结(`Object.isFrozen` 为 `true`),修改会抛错。

## 运行

```bash
npx ts-node 03-exams/typescript/programming/challenge/01-递归类型体操/index.test.ts
```
