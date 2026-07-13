# TypeScript 概念自测 · 进阶

> 先自己作答,再点开折叠块核对。共 10 题。

---

### 1.(选择)`keyof { a: 1; b: 2 }` 的结果是?

A. `"a" | "b"`
B. `1 | 2`
C. `string`
D. `{ a: 1; b: 2 }`

<details><summary>答案与解析</summary>

**A**。`keyof` 取对象类型的**键**组成的联合。取"值的联合"需要索引访问 `T[keyof T]`。

</details>

---

### 2.(选择)`Pick<T, K>` 的正确定义是?

A. `{ [P in keyof T]: T[P] }`
B. `{ [P in K]: T[P] }`
C. `{ [P in Exclude<keyof T, K>]: T[P] }`
D. `T extends K ? T : never`

<details><summary>答案与解析</summary>

**B**。`Pick` 从 `T` 中挑出 `K` 指定的键。选项 C 是 `Omit` 的实现思路。

</details>

---

### 3.(选择)以下条件类型的结果是?

```ts
type R = string extends string | number ? 1 : 2;
```

A. `1`
B. `2`
C. `1 | 2`
D. 报错

<details><summary>答案与解析</summary>

**A**。`string` 是 `string | number` 的子类型,`extends` 成立,取 `1`。

</details>

---

### 4.(选择)分布式条件类型:`type T = (A | B) extends U ? X : Y` 中,当被检查类型是**裸类型参数**时会发生什么?

A. 不做任何特殊处理
B. 会对联合类型的每个成员分别求值再合并
C. 一定返回 `Y`
D. 报错

<details><summary>答案与解析</summary>

**B**。当条件类型作用于**裸(naked)类型参数**且该参数是联合时,会**分布**:`(A|B) extends U ? X : Y` 变成 `(A extends U ? X:Y) | (B extends U ? X:Y)`。用 `[T] extends [U]` 包一层可**关闭**分布。

</details>

---

### 5.(简答)`infer` 关键字的作用是什么?举一个例子。

<details><summary>答案与解析</summary>

`infer` 在条件类型的 `extends` 子句里**声明一个待推断的类型变量**,让 TS 帮你从结构中"抽取"类型。例如取函数返回类型:

```ts
type MyReturnType<T> = T extends (...args: any[]) => infer R ? R : never;
```

或取数组元素类型:`type Elem<T> = T extends (infer U)[] ? U : T;`

</details>

---

### 6.(简答)`Partial<T>`、`Required<T>`、`Readonly<T>` 分别做什么?它们如何用映射类型实现?

<details><summary>答案与解析</summary>

- `Partial<T>`:所有属性变可选 —— `{ [K in keyof T]?: T[K] }`
- `Required<T>`:所有属性变必需 —— `{ [K in keyof T]-?: T[K] }`
- `Readonly<T>`:所有属性变只读 —— `{ readonly [K in keyof T]: T[K] }`

`-?` 去掉可选修饰符,`-readonly` 去掉只读修饰符。

</details>

---

### 7.(选择)映射类型中的键重映射(key remapping)用什么语法?

A. `{ [K in keyof T]: ... }`
B. `{ [K in keyof T as NewKey]: ... }`
C. `{ [K as keyof T]: ... }`
D. `{ keyof T => ... }`

<details><summary>答案与解析</summary>

**B**。TS 4.1+ 支持 `as` 重映射键,可结合模板字面量类型生成新键名,如 `` as `get${Capitalize<string & K>}` ``。返回 `never` 可过滤掉某些键。

</details>

---

### 8.(简答)函数重载(overload)和联合类型参数各适合什么场景?

<details><summary>答案与解析</summary>

- **重载**:当"入参组合"与"返回类型"存在**对应关系**时用,能让调用方按传入的具体参数得到精确的返回类型。
- **联合类型参数**:当参数是若干类型之一、且返回类型不随之变化时更简洁。

重载签名写多个、实现签名写一个(且实现签名对外不可见)。

</details>

---

### 9.(选择)`as const` 对 `{ role: "admin" }` 的作用是?

A. 无变化
B. 把 `role` 的类型从 `string` 收窄为字面量 `"admin"`,并让属性只读
C. 把对象变成数组
D. 报错

<details><summary>答案与解析</summary>

**B**。`as const` 做"常量断言":字面量收窄为具体字面量类型、数组变只读元组、对象属性变 `readonly`。常用于让联合字面量被精确推断。

</details>

---

### 10.(简答)什么是"类型收窄(narrowing)"?列举至少 3 种收窄手段。

<details><summary>答案与解析</summary>

收窄指在某个代码分支里,把一个较宽的类型(如联合)确定为更具体的类型。常见手段:
1. `typeof`(`typeof x === "string"`)
2. `instanceof`(`x instanceof Date`)
3. `in` 操作符(`"id" in obj`)
4. 字面量判别(判别联合:`switch (shape.kind)`)
5. 真值收窄(`if (x)`)、相等收窄(`x === null`)
6. 自定义类型守卫(`x is Foo`)

</details>
