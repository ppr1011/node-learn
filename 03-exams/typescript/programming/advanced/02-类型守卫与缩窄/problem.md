# 进阶 02 - 类型守卫与联合缩窄

## 背景

判别联合(discriminated union)+ 类型守卫 + 穷尽检查,是 TypeScript 里处理"多态数据"的核心手段。

```ts
type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "square"; side: number }
  | { kind: "rectangle"; width: number; height: number };
```

## 要求

在 `index.ts` 中实现:

1. `isCircle(s: Shape): s is Extract<Shape, { kind: "circle" }>`
   自定义类型守卫,判断是否为圆形。

2. `area(s: Shape): number`
   计算面积:
   - 圆:`π * r²`
   - 正方形:`side²`
   - 矩形:`width * height`
   必须用 `switch (s.kind)` 缩窄,并在 `default` 分支调用 `assertNever(s)` 做**穷尽检查**(将来新增形状忘记处理时会编译报错)。

3. `assertNever(x: never): never`
   兜底函数:抛出错误。参数类型必须是 `never`。

4. `isNonEmptyStringArray(v: unknown): v is string[]`
   运行时类型守卫:判断 `v` 是否为「非空的字符串数组」(所有元素都是 string,且长度 > 0)。

## 提示

- `Extract<Shape, { kind: "circle" }>` 取出圆形那一支。
- `assertNever` 是 `(x: never) => never`,在 `default` 里传入 `s`;若某个 `kind` 没处理,`s` 就不是 `never`,编译会报错。
- `isNonEmptyStringArray` 用 `Array.isArray` + `every(x => typeof x === "string")` + 长度判断。

## 评分点

- 三个函数行为正确;
- `area` 用穷尽检查(参考答案对照);
- 类型守卫返回类型标注正确(`x is T`)。

## 运行

```bash
npx ts-node 03-exams/typescript/programming/advanced/02-类型守卫与缩窄/index.test.ts
```
