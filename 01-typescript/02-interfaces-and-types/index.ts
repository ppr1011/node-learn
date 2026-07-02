/**
 * 02 - 接口与类型别名
 * 运行: npx ts-node 01-typescript/02-interfaces-and-types/index.ts
 */

// ========== Interface 基本用法 ==========
interface User {
  id: number;
  name: string;
  email: string;
  age?: number; // 可选属性
  readonly createdAt: Date; // 只读属性
}

const user: User = {
  id: 1,
  name: "Alice",
  email: "alice@example.com",
  createdAt: new Date(),
};

console.log("--- Interface 基本用法 ---");
console.log(user);

// ========== Interface 继承 ==========
interface Animal {
  name: string;
  sound(): string;
}

interface Pet extends Animal {
  owner: string;
}

const dog: Pet = {
  name: "Buddy",
  owner: "Alice",
  sound() {
    return "Woof!";
  },
};

console.log("\n--- Interface 继承 ---");
console.log(`${dog.name} says ${dog.sound()}, owner: ${dog.owner}`);

// ========== Interface 合并声明 ==========
interface Config {
  host: string;
  port: number;
}

interface Config {
  debug?: boolean; // 同名 interface 会自动合并
}

const config: Config = { host: "localhost", port: 3000, debug: true };
console.log("\n--- Interface 合并 ---");
console.log(config);

// ========== Type Alias 基本用法 ==========
type Point = {
  x: number;
  y: number;
};

type ID = string | number;

const point: Point = { x: 10, y: 20 };
const userId: ID = "user-123";

console.log("\n--- Type Alias ---");
console.log("point:", point);
console.log("userId:", userId);

// ========== 交叉类型 (Intersection) ==========
type HasName = { name: string };
type HasAge = { age: number };
type Person = HasName & HasAge;

const person: Person = { name: "Bob", age: 30 };
console.log("\n--- 交叉类型 ---");
console.log(person);

// ========== 索引签名 ==========
interface Dictionary {
  [key: string]: string;
}

const dict: Dictionary = {
  hello: "你好",
  world: "世界",
  typescript: "类型脚本",
};

console.log("\n--- 索引签名 ---");
console.log(dict);

// ========== Interface vs Type 的区别 ==========
// 1. interface 可以合并声明，type 不行
// 2. type 可以表示联合类型、元组等，interface 不行
// 3. interface 用于定义对象的 "形状"，type 更通用

type StringOrNumber = string | number; // type 可以定义联合类型
type Tuple = [string, number]; // type 可以定义元组
// interface 不能做到这些

// ========== 函数类型 ==========
interface MathFunc {
  (a: number, b: number): number;
}

type MathFuncType = (a: number, b: number) => number;

const add: MathFunc = (a, b) => a + b;
const multiply: MathFuncType = (a, b) => a * b;

console.log("\n--- 函数类型 ---");
console.log("add(2, 3):", add(2, 3));
console.log("multiply(2, 3):", multiply(2, 3));
