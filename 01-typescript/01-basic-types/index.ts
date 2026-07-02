/**
 * 01 - TypeScript 基础类型
 * 运行: npx ts-node 01-typescript/01-basic-types/index.ts
 */

// ========== 原始类型 ==========
const username: string = "Alice";
const age: number = 25;
const isActive: boolean = true;

console.log("--- 原始类型 ---");
console.log(`name: ${username}, age: ${age}, isActive: ${isActive}`);

// ========== 数组 ==========
const numbers: number[] = [1, 2, 3, 4, 5];
const names: Array<string> = ["Alice", "Bob", "Charlie"];

console.log("\n--- 数组 ---");
console.log("numbers:", numbers);
console.log("names:", names);

// ========== 元组 (Tuple) ==========
const point: [number, number] = [10, 20];
const record: [string, number, boolean] = ["Alice", 25, true];

console.log("\n--- 元组 ---");
console.log("point:", point);
console.log("record:", record);

// ========== any 与 unknown ==========
let anything: any = "hello";
anything = 42; // any 可以赋值为任何类型，跳过类型检查

let uncertain: unknown = "world";
// uncertain.toUpperCase(); // 错误！unknown 不能直接使用
if (typeof uncertain === "string") {
  console.log("\n--- any vs unknown ---");
  console.log("uncertain (narrowed):", uncertain.toUpperCase());
}

// ========== void, null, undefined ==========
function logMessage(msg: string): void {
  console.log("\n--- void ---");
  console.log("log:", msg);
}
logMessage("这个函数没有返回值");

const n: null = null;
const u: undefined = undefined;
console.log("null:", n, "undefined:", u);

// ========== never ==========
function throwError(message: string): never {
  throw new Error(message);
}

function infiniteLoop(): never {
  while (true) {
    // 永远不会结束
    break; // 仅为演示目的加了 break，实际 never 类型不应有 break
  }
  return undefined as never;
}

// ========== 对象类型 ==========
const user: { name: string; age: number; email?: string } = {
  name: "Bob",
  age: 30,
};

console.log("\n--- 对象类型 ---");
console.log("user:", user);
console.log("email (可选):", user.email ?? "未设置");

// ========== 联合类型 ==========
let id: string | number;
id = "abc-123";
console.log("\n--- 联合类型 ---");
console.log("id (string):", id);
id = 456;
console.log("id (number):", id);

// ========== 类型断言 ==========
const someValue: unknown = "this is a string";
const strLength: number = (someValue as string).length;
console.log("\n--- 类型断言 ---");
console.log("string length:", strLength);
