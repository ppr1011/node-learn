/**
 * 03 - 函数
 * 运行: npx ts-node 01-typescript/03-functions/index.ts
 */

// ========== 基本函数类型 ==========
function greet(name: string): string {
  return `Hello, ${name}!`;
}

const add = (a: number, b: number): number => a + b;

console.log("--- 基本函数 ---");
console.log(greet("TypeScript"));
console.log("add(2, 3):", add(2, 3));

// ========== 可选参数与默认参数 ==========
function buildUrl(host: string, port?: number, protocol: string = "https"): string {
  const portStr = port ? `:${port}` : "";
  return `${protocol}://${host}${portStr}`;
}

console.log("\n--- 可选参数与默认参数 ---");
console.log(buildUrl("example.com"));
console.log(buildUrl("example.com", 8080));
console.log(buildUrl("example.com", 3000, "http"));

// ========== 剩余参数 ==========
function sum(...numbers: number[]): number {
  return numbers.reduce((acc, curr) => acc + curr, 0);
}

console.log("\n--- 剩余参数 ---");
console.log("sum(1,2,3,4,5):", sum(1, 2, 3, 4, 5));

// ========== 函数重载 ==========
function format(value: string): string;
function format(value: number): string;
function format(value: string | number): string {
  if (typeof value === "string") {
    return value.trim().toUpperCase();
  }
  return value.toFixed(2);
}

console.log("\n--- 函数重载 ---");
console.log('format(" hello "):', format(" hello "));
console.log("format(3.14159):", format(3.14159));

// ========== 回调函数 ==========
function fetchData(url: string, callback: (data: string, error?: Error) => void): void {
  setTimeout(() => {
    callback(`Data from ${url}`);
  }, 100);
}

console.log("\n--- 回调函数 ---");
fetchData("https://api.example.com", (data) => {
  console.log("received:", data);
});

// ========== 泛型函数预览 ==========
function identity<T>(value: T): T {
  return value;
}

function firstElement<T>(arr: T[]): T | undefined {
  return arr[0];
}

console.log("\n--- 泛型函数 ---");
console.log("identity('hello'):", identity("hello"));
console.log("identity(42):", identity(42));
console.log("firstElement([10, 20, 30]):", firstElement([10, 20, 30]));

// ========== this 参数 ==========
interface Button {
  label: string;
  onClick(this: Button): void;
}

const button: Button = {
  label: "Submit",
  onClick() {
    console.log("\n--- this 参数 ---");
    console.log(`Button "${this.label}" clicked`);
  },
};

button.onClick();

// ========== 高阶函数 ==========
function createMultiplier(factor: number): (n: number) => number {
  return (n) => n * factor;
}

const double = createMultiplier(2);
const triple = createMultiplier(3);

console.log("\n--- 高阶函数 ---");
console.log("double(5):", double(5));
console.log("triple(5):", triple(5));
