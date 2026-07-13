# TypeScript 概念自测 · 挑战

> 偏面试/进阶考点。共 8 题,含手写类型。

---

### 1.(手写)实现 `DeepReadonly<T>`,递归把所有层级变只读。

<details><summary>参考答案</summary>

```ts
type DeepReadonly<T> = T extends (infer U)[]
  ? ReadonlyArray<DeepReadonly<U>>
  : T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;
```

关键点:先处理数组,再处理对象,原始类型原样返回,避免无限递归。函数类型通常也应原样返回(可在 `T extends Function ? T : ...` 提前拦截)。

</details>

---

### 2.(手写)实现 `Awaited<T>`(拆掉 Promise 包装,支持嵌套 Promise)。

<details><summary>参考答案</summary>

```ts
type MyAwaited<T> = T extends Promise<infer U> ? MyAwaited<U> : T;
```

递归地剥离 `Promise`。TS 内置的 `Awaited<T>` 还额外处理了 thenable 与 `null`/`undefined` 边界。

</details>

---

### 3.(选择)`type A = { a: 1 } & { a: 2 }` 中 `A["a"]` 的类型是?

A. `1`
B. `2`
C. `1 | 2`
D. `never`

<details><summary>答案与解析</summary>

**D**。交叉类型要求同时满足两者,`a` 必须既是 `1` 又是 `2`,不可能 → `never`。

</details>

---

### 4.(简答)`Equal<X, Y>` 常见实现依赖什么技巧?为什么普通的 `X extends Y ? (Y extends X ? true : false) : false` 不够精确?

<details><summary>答案与解析</summary>

常见实现:

```ts
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
```

它比较的是两个"泛型函数类型"是否可赋值,能区分 `any` 与其他类型、并对交叉/联合更精确。双向 `extends` 会把 `any` 判成"和任意类型相等",且对某些结构相同但修饰符不同的类型不够敏感。

</details>

---

### 5.(手写)实现 `Parameters<T>`(取函数参数元组)。

<details><summary>参考答案</summary>

```ts
type MyParameters<T extends (...args: any[]) => any> =
  T extends (...args: infer P) => any ? P : never;
```

</details>

---

### 6.(简答)什么是"协变(covariance)"和"逆变(contravariance)"?函数参数是哪一种?

<details><summary>答案与解析</summary>

- **协变**:子类型关系方向保持一致(如 `Dog[]` 可看作 `Animal[]`)。
- **逆变**:方向相反。**函数参数**位置是逆变的:`(a: Animal) => void` 可赋给 `(a: Dog) => void` 需要的位置(参数越"宽"越安全)。

TS 在 `strictFunctionTypes` 下对函数参数做逆变检查(方法参数除外,仍是双变以兼容)。

</details>

---

### 7.(手写)用模板字面量类型 + 键重映射,把对象所有属性生成 `getX` 形式的 getter 类型。

<details><summary>参考答案</summary>

```ts
type Getters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};
// Getters<{ name: string; age: number }>
// => { getName: () => string; getAge: () => number }
```

</details>

---

### 8.(简答)`never` 类型有哪些典型用途?

<details><summary>答案与解析</summary>

1. 函数永不返回(抛异常/死循环)的返回类型;
2. **穷尽检查**:在判别联合的 `default` 分支用 `assertNever(x: never)`,遗漏分支时编译报错;
3. 条件类型里表示"过滤掉"(如 `Exclude` 用 `never` 剔除成员,联合中的 `never` 会被吸收);
4. 表示不可能到达的类型状态。

</details>
