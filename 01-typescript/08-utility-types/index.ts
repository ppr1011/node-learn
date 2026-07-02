/**
 * 08 - 工具类型
 * 运行: npx ts-node 01-typescript/08-utility-types/index.ts
 */

interface User {
  id: number;
  name: string;
  email: string;
  age: number;
  role: "admin" | "user";
}

// ========== Partial<T> - 所有属性变为可选 ==========
function updateUser(id: number, updates: Partial<User>): void {
  console.log(`Updating user #${id} with:`, updates);
}

console.log("--- Partial ---");
updateUser(1, { name: "New Name" });
updateUser(2, { email: "new@test.com", age: 30 });

// ========== Required<T> - 所有属性变为必填 ==========
interface Config {
  host?: string;
  port?: number;
  debug?: boolean;
}

function initServer(config: Required<Config>): void {
  console.log(`Server: ${config.host}:${config.port}, debug=${config.debug}`);
}

console.log("\n--- Required ---");
initServer({ host: "localhost", port: 3000, debug: false });

// ========== Pick<T, K> - 选取部分属性 ==========
type UserPreview = Pick<User, "id" | "name">;

const preview: UserPreview = { id: 1, name: "Alice" };
console.log("\n--- Pick ---");
console.log("UserPreview:", preview);

// ========== Omit<T, K> - 排除部分属性 ==========
type CreateUserInput = Omit<User, "id">;

const newUser: CreateUserInput = {
  name: "Bob",
  email: "bob@test.com",
  age: 25,
  role: "user",
};
console.log("\n--- Omit ---");
console.log("CreateUserInput:", newUser);

// ========== Record<K, V> - 构建键值对类型 ==========
type UserRoles = Record<string, User>;

const users: UserRoles = {
  alice: { id: 1, name: "Alice", email: "a@test.com", age: 25, role: "admin" },
  bob: { id: 2, name: "Bob", email: "b@test.com", age: 30, role: "user" },
};
console.log("\n--- Record ---");
console.log("users:", users);

// ========== Readonly<T> ==========
const frozenUser: Readonly<User> = {
  id: 1,
  name: "Alice",
  email: "alice@test.com",
  age: 25,
  role: "admin",
};
// frozenUser.name = "Bob"; // 编译错误
console.log("\n--- Readonly ---");
console.log("frozenUser:", frozenUser);

// ========== Extract / Exclude ==========
type AllRoles = "admin" | "user" | "editor" | "viewer";
type WriteRoles = Extract<AllRoles, "admin" | "editor">;
type ReadOnlyRoles = Exclude<AllRoles, "admin" | "editor">;

const writer: WriteRoles = "admin";
const reader: ReadOnlyRoles = "viewer";
console.log("\n--- Extract / Exclude ---");
console.log("WriteRoles:", writer);
console.log("ReadOnlyRoles:", reader);

// ========== ReturnType / Parameters ==========
function createUser(name: string, age: number): User {
  return { id: Date.now(), name, age, email: `${name}@test.com`, role: "user" };
}

type CreateUserReturn = ReturnType<typeof createUser>;
type CreateUserParams = Parameters<typeof createUser>;

console.log("\n--- ReturnType / Parameters ---");
const params: CreateUserParams = ["Charlie", 28];
const result: CreateUserReturn = createUser(...params);
console.log("params:", params);
console.log("result:", result);

// ========== NonNullable ==========
type MaybeString = string | null | undefined;
type DefiniteString = NonNullable<MaybeString>; // string

const definite: DefiniteString = "always a string";
console.log("\n--- NonNullable ---");
console.log(definite);

// ========== 自定义工具类型 ==========
// 深度 Partial
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

interface NestedConfig {
  server: {
    host: string;
    port: number;
  };
  database: {
    url: string;
    pool: number;
  };
}

const partialConfig: DeepPartial<NestedConfig> = {
  server: { port: 8080 },
};
console.log("\n--- 自定义 DeepPartial ---");
console.log(partialConfig);

// 可为空类型
type Nullable<T> = { [P in keyof T]: T[P] | null };

const nullableUser: Nullable<Pick<User, "name" | "email">> = {
  name: "Alice",
  email: null,
};
console.log("\n--- 自定义 Nullable ---");
console.log(nullableUser);
