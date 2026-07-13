# TypeScript 概念自测 · 基础

> 先自己作答,再点开折叠块核对。共 10 题(选择 + 简答)。

---

### 1.(选择)下列关于 `any` 与 `unknown` 的说法,正确的是?

A. `any` 和 `unknown` 完全等价
B. `unknown` 类型的值可以直接调用任意方法
C. `unknown` 类型的值必须先缩窄类型才能使用
D. `any` 会保留类型检查

<details><summary>答案与解析</summary>

**C**。`unknown` 是"类型安全版的 any":任何值都能赋给它,但使用前必须先用类型守卫/断言缩窄。`any` 则完全关闭类型检查(D 错)。`unknown` 不能直接调用方法(B 错),两者不等价(A 错)。

</details>

---

### 2.(选择)`let x: [string, number]` 是什么类型?

A. 数组,元素为 string 或 number
B. 元组,第一个是 string,第二个是 number,长度固定为 2
C. 对象
D. 联合类型

<details><summary>答案与解析</summary>

**B**。元组(tuple)固定长度且每个位置类型确定。`(string | number)[]` 才是"元素为 string 或 number 的数组"。

</details>

---

### 3.(选择)`interface` 和 `type` 的区别,下列错误的是?

A. `interface` 可以声明合并(同名自动合并)
B. `type` 可以定义联合类型 / 元组 / 映射类型
C. `interface` 可以用联合类型直接定义(如 `interface A = X | Y`)
D. 两者都能描述对象结构、都能被类 `implements`

<details><summary>答案与解析</summary>

**C**。`interface` 不能直接等于一个联合类型;联合类型只能用 `type`。A、B、D 都正确。

</details>

---

### 4.(选择)以下代码 `a` 的类型是?

```ts
const a = [1, 2, 3];
```

A. `number[]`
B. `readonly number[]`
C. `[number, number, number]`
D. `any[]`

<details><summary>答案与解析</summary>

**A**。数组字面量默认推断为 `number[]`。要得到元组需要 `as const` 或显式标注。`as const` 会得到 `readonly [1, 2, 3]`。

</details>

---

### 5.(选择)`function f(): void` 的返回值,下列哪种赋值**不会**报错?

```ts
const r: void = f();
```

A. 可以,`void` 表示函数没有有意义的返回值
B. 报错,`void` 不能作为变量类型
C. 报错,必须返回 `undefined`
D. 报错,`void` 只能用于函数返回

<details><summary>答案与解析</summary>

**A**。`void` 可以作为变量类型(值只能是 `undefined`)。它表达"忽略返回值"。

</details>

---

### 6.(简答)`??`(空值合并)与 `||` 有什么区别?

<details><summary>答案与解析</summary>

`||` 在左值为**任何假值**(`0`、`""`、`false`、`null`、`undefined`、`NaN`)时取右值;
`??` 只在左值为 `null` 或 `undefined` 时取右值。
例:`0 || 5 === 5`,但 `0 ?? 5 === 0`。处理"默认值"时通常用 `??` 更安全。

</details>

---

### 7.(简答)可选属性 `email?: string` 与 `email: string | undefined` 有何不同?

<details><summary>答案与解析</summary>

- `email?: string`:该属性**可以不存在**(对象里可以完全没有这个键),类型为 `string | undefined`。
- `email: string | undefined`:该属性**必须存在**,但值可以是 `undefined`(即必须显式写 `email: undefined`)。

在开启 `exactOptionalPropertyTypes` 时二者差异更明显。

</details>

---

### 8.(简答)什么是类型断言(`as`)?它和类型转换有何本质区别?

<details><summary>答案与解析</summary>

类型断言只是**告诉编译器**"我确信这个值是某类型",仅在编译期起作用,**不产生任何运行时代码/转换**。它不会像 `Number()`/`String()` 那样真正改变值。滥用 `as` 会绕过类型检查带来风险,应尽量用类型守卫替代。

</details>

---

### 9.(选择)开启 `strict` 后,下列哪项**默认开启**?

A. `strictNullChecks`
B. `noImplicitAny`
C. `strictFunctionTypes`
D. 以上都是

<details><summary>答案与解析</summary>

**D**。`strict: true` 是一组严格检查的总开关,包含 `strictNullChecks`、`noImplicitAny`、`strictFunctionTypes`、`strictBindCallApply`、`alwaysStrict` 等。

</details>

---

### 10.(简答)联合类型 `string | number` 的值,直接调用 `.toUpperCase()` 会怎样?如何正确处理?

<details><summary>答案与解析</summary>

会报错,因为 `number` 上没有 `toUpperCase`。只能访问联合各成员的**公共成员**。正确做法是先缩窄:

```ts
function f(x: string | number) {
  if (typeof x === "string") return x.toUpperCase();
  return x.toFixed(2);
}
```

</details>
