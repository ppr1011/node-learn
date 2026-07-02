/**
 * 05 - 泛型
 * 运行: npx ts-node 01-typescript/05-generics/index.ts
 */

// ========== 泛型函数 ==========
function identity<T>(value: T): T {
  return value;
}

function pair<A, B>(first: A, second: B): [A, B] {
  return [first, second];
}

console.log("--- 泛型函数 ---");
console.log(identity<string>("hello"));
console.log(identity(42)); // 类型推断
console.log(pair("age", 25));

// ========== 泛型约束 ==========
interface HasLength {
  length: number;
}

function logLength<T extends HasLength>(value: T): T {
  console.log(`Length: ${value.length}`);
  return value;
}

console.log("\n--- 泛型约束 ---");
logLength("hello");
logLength([1, 2, 3]);
logLength({ length: 10, name: "test" });

// ========== keyof 约束 ==========
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

const person = { name: "Alice", age: 25, city: "Shanghai" };

console.log("\n--- keyof 约束 ---");
console.log("name:", getProperty(person, "name"));
console.log("age:", getProperty(person, "age"));

// ========== 泛型接口 ==========
interface Repository<T> {
  getById(id: number): T | undefined;
  getAll(): T[];
  create(item: T): T;
  delete(id: number): boolean;
}

interface User {
  id: number;
  name: string;
  email: string;
}

class InMemoryRepo<T extends { id: number }> implements Repository<T> {
  private items: T[] = [];

  getById(id: number): T | undefined {
    return this.items.find((item) => item.id === id);
  }

  getAll(): T[] {
    return [...this.items];
  }

  create(item: T): T {
    this.items.push(item);
    return item;
  }

  delete(id: number): boolean {
    const index = this.items.findIndex((item) => item.id === id);
    if (index === -1) return false;
    this.items.splice(index, 1);
    return true;
  }
}

console.log("\n--- 泛型接口与类 ---");
const userRepo = new InMemoryRepo<User>();
userRepo.create({ id: 1, name: "Alice", email: "alice@test.com" });
userRepo.create({ id: 2, name: "Bob", email: "bob@test.com" });
console.log("all users:", userRepo.getAll());
console.log("user #1:", userRepo.getById(1));
userRepo.delete(1);
console.log("after delete #1:", userRepo.getAll());

// ========== 泛型工具函数 ==========
function map<T, U>(arr: T[], fn: (item: T, index: number) => U): U[] {
  return arr.map(fn);
}

function filter<T>(arr: T[], predicate: (item: T) => boolean): T[] {
  return arr.filter(predicate);
}

console.log("\n--- 泛型工具函数 ---");
const nums = [1, 2, 3, 4, 5];
console.log("doubled:", map(nums, (n) => n * 2));
console.log("even:", filter(nums, (n) => n % 2 === 0));

// ========== 条件类型 ==========
type IsString<T> = T extends string ? "yes" : "no";
type A = IsString<string>; // "yes"
type B = IsString<number>; // "no"

type Flatten<T> = T extends Array<infer U> ? U : T;
type C = Flatten<string[]>; // string
type D = Flatten<number>; // number

console.log("\n--- 条件类型 (编译时) ---");
const a: A = "yes";
const b: B = "no";
console.log("IsString<string>:", a);
console.log("IsString<number>:", b);

// ========== 泛型默认值 ==========
interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

function createResponse<T>(data: T): ApiResponse<T> {
  return { code: 200, message: "success", data };
}

console.log("\n--- 泛型默认值 ---");
console.log(createResponse({ users: ["Alice", "Bob"] }));
console.log(createResponse("simple string data"));
