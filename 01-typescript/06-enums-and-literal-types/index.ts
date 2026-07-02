/**
 * 06 - 枚举与字面量类型
 * 运行: npx ts-node 01-typescript/06-enums-and-literal-types/index.ts
 */

// ========== 数字枚举 ==========
enum Direction {
  Up = 0,
  Down = 1,
  Left = 2,
  Right = 3,
}

console.log("--- 数字枚举 ---");
console.log("Direction.Up:", Direction.Up);
console.log("Direction[0]:", Direction[0]); // 反向映射

// ========== 字符串枚举 ==========
enum HttpMethod {
  GET = "GET",
  POST = "POST",
  PUT = "PUT",
  DELETE = "DELETE",
  PATCH = "PATCH",
}

function makeRequest(url: string, method: HttpMethod): void {
  console.log(`${method} ${url}`);
}

console.log("\n--- 字符串枚举 ---");
makeRequest("/api/users", HttpMethod.GET);
makeRequest("/api/users", HttpMethod.POST);

// ========== const enum (编译时内联) ==========
const enum StatusCode {
  OK = 200,
  NotFound = 404,
  ServerError = 500,
}

console.log("\n--- const enum ---");
console.log("OK:", StatusCode.OK);
console.log("NotFound:", StatusCode.NotFound);

// ========== 字面量类型 ==========
type Theme = "light" | "dark" | "system";
type Port = 3000 | 8080 | 443;

function setTheme(theme: Theme): void {
  console.log(`Theme set to: ${theme}`);
}

console.log("\n--- 字面量类型 ---");
setTheme("dark");
// setTheme("blue"); // 编译错误

// ========== 可辨识联合 (Discriminated Union) ==========
interface Circle {
  kind: "circle";
  radius: number;
}

interface Rectangle {
  kind: "rectangle";
  width: number;
  height: number;
}

interface Triangle {
  kind: "triangle";
  base: number;
  height: number;
}

type Shape = Circle | Rectangle | Triangle;

function area(shape: Shape): number {
  switch (shape.kind) {
    case "circle":
      return Math.PI * shape.radius ** 2;
    case "rectangle":
      return shape.width * shape.height;
    case "triangle":
      return (shape.base * shape.height) / 2;
  }
}

console.log("\n--- 可辨识联合 ---");
const shapes: Shape[] = [
  { kind: "circle", radius: 5 },
  { kind: "rectangle", width: 4, height: 6 },
  { kind: "triangle", base: 3, height: 8 },
];
shapes.forEach((s) => {
  console.log(`${s.kind}: area = ${area(s).toFixed(2)}`);
});

// ========== 模板字面量类型 ==========
type EventName = "click" | "focus" | "blur";
type Handler = `on${Capitalize<EventName>}`;
// Handler = "onClick" | "onFocus" | "onBlur"

const handlers: Record<Handler, () => void> = {
  onClick: () => console.log("clicked"),
  onFocus: () => console.log("focused"),
  onBlur: () => console.log("blurred"),
};

console.log("\n--- 模板字面量类型 ---");
Object.entries(handlers).forEach(([name, fn]) => {
  process.stdout.write(`${name}: `);
  fn();
});

// ========== 枚举替代方案: as const ==========
const COLORS = {
  Red: "#ff0000",
  Green: "#00ff00",
  Blue: "#0000ff",
} as const;

type Color = (typeof COLORS)[keyof typeof COLORS];
// Color = "#ff0000" | "#00ff00" | "#0000ff"

console.log("\n--- as const 替代枚举 ---");
console.log("COLORS:", COLORS);

const STATUS = ["idle", "loading", "success", "error"] as const;
type Status = (typeof STATUS)[number];
// Status = "idle" | "loading" | "success" | "error"

function showStatus(s: Status): void {
  console.log(`status: ${s}`);
}
showStatus("loading");
