/**
 * 07 - 类型守卫与缩窄
 * 运行: npx ts-node 01-typescript/07-type-guards-and-narrowing/index.ts
 */

// ========== typeof 守卫 ==========
function formatValue(value: string | number | boolean): string {
  if (typeof value === "string") {
    return `"${value}"`;
  }
  if (typeof value === "number") {
    return value.toFixed(2);
  }
  return value ? "true" : "false";
}

console.log("--- typeof 守卫 ---");
console.log(formatValue("hello"));
console.log(formatValue(3.14));
console.log(formatValue(true));

// ========== instanceof 守卫 ==========
class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

class ValidationError extends Error {
  constructor(public fields: string[]) {
    super(`Validation failed: ${fields.join(", ")}`);
  }
}

function handleError(error: Error): string {
  if (error instanceof HttpError) {
    return `HTTP ${error.statusCode}: ${error.message}`;
  }
  if (error instanceof ValidationError) {
    return `Validation: ${error.fields.join(", ")}`;
  }
  return `Unknown: ${error.message}`;
}

console.log("\n--- instanceof 守卫 ---");
console.log(handleError(new HttpError(404, "Not Found")));
console.log(handleError(new ValidationError(["name", "email"])));
console.log(handleError(new Error("something went wrong")));

// ========== in 操作符 ==========
interface Bird {
  fly(): void;
  layEggs(): void;
}

interface Fish {
  swim(): void;
  layEggs(): void;
}

function move(animal: Bird | Fish): string {
  if ("fly" in animal) {
    return "flying";
  }
  return "swimming";
}

console.log("\n--- in 操作符 ---");
const bird: Bird = { fly() {}, layEggs() {} };
const fish: Fish = { swim() {}, layEggs() {} };
console.log("bird:", move(bird));
console.log("fish:", move(fish));

// ========== 自定义类型守卫 ==========
interface Admin {
  role: "admin";
  permissions: string[];
}

interface RegularUser {
  role: "user";
  subscription: string;
}

type AppUser = Admin | RegularUser;

function isAdmin(user: AppUser): user is Admin {
  return user.role === "admin";
}

function describeUser(user: AppUser): string {
  if (isAdmin(user)) {
    return `Admin with permissions: ${user.permissions.join(", ")}`;
  }
  return `User with ${user.subscription} subscription`;
}

console.log("\n--- 自定义类型守卫 ---");
const admin: AppUser = { role: "admin", permissions: ["read", "write", "delete"] };
const regular: AppUser = { role: "user", subscription: "premium" };
console.log(describeUser(admin));
console.log(describeUser(regular));

// ========== 断言函数 ==========
function assertDefined<T>(value: T | undefined | null, name: string): asserts value is T {
  if (value === undefined || value === null) {
    throw new Error(`${name} is not defined`);
  }
}

console.log("\n--- 断言函数 ---");
const maybeValue: string | undefined = "hello";
assertDefined(maybeValue, "maybeValue");
console.log("after assert:", maybeValue.toUpperCase()); // TypeScript 知道这里是 string

// ========== 穷举检查 (Exhaustive Check) ==========
type Shape = "circle" | "rectangle" | "triangle";

function getShapeSides(shape: Shape): number {
  switch (shape) {
    case "circle":
      return 0;
    case "rectangle":
      return 4;
    case "triangle":
      return 3;
    default:
      // 如果 Shape 新增了类型但忘记处理，这里会报编译错误
      const _exhaustive: never = shape;
      return _exhaustive;
  }
}

console.log("\n--- 穷举检查 ---");
console.log("circle sides:", getShapeSides("circle"));
console.log("rectangle sides:", getShapeSides("rectangle"));

// ========== 可选链与空值合并 ==========
interface Company {
  name: string;
  address?: {
    city?: string;
    street?: string;
  };
}

function getCity(company: Company): string {
  return company.address?.city ?? "Unknown";
}

console.log("\n--- 可选链与空值合并 ---");
console.log(getCity({ name: "Acme", address: { city: "Shanghai" } }));
console.log(getCity({ name: "Beta" }));
