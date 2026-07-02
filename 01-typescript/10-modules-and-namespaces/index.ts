/**
 * 10 - 模块与命名空间
 * 运行: npx ts-node 01-typescript/10-modules-and-namespaces/index.ts
 */

// ========== ES Module 导入导出 ==========
// 这里演示在单文件中的模块概念，实际项目中会拆分文件

// 模拟 math.ts 模块的导出
namespace MathModule {
  export function add(a: number, b: number): number {
    return a + b;
  }

  export function subtract(a: number, b: number): number {
    return a - b;
  }

  export const PI = 3.14159;
}

console.log("--- 模块概念 ---");
console.log("add(2, 3):", MathModule.add(2, 3));
console.log("PI:", MathModule.PI);

// ========== 命名空间 ==========
namespace Validation {
  export interface Validator {
    validate(value: string): boolean;
  }

  export class EmailValidator implements Validator {
    validate(value: string): boolean {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }
  }

  export class PhoneValidator implements Validator {
    validate(value: string): boolean {
      return /^\d{11}$/.test(value);
    }
  }

  export class LengthValidator implements Validator {
    constructor(private min: number, private max: number) {}
    validate(value: string): boolean {
      return value.length >= this.min && value.length <= this.max;
    }
  }
}

console.log("\n--- 命名空间 ---");
const emailValidator = new Validation.EmailValidator();
const phoneValidator = new Validation.PhoneValidator();
const lengthValidator = new Validation.LengthValidator(3, 20);

console.log("email 'test@a.com':", emailValidator.validate("test@a.com"));
console.log("email 'invalid':", emailValidator.validate("invalid"));
console.log("phone '13800138000':", phoneValidator.validate("13800138000"));
console.log("length 'hi':", lengthValidator.validate("hi"));
console.log("length 'hello':", lengthValidator.validate("hello"));

// ========== 嵌套命名空间 ==========
namespace App {
  export namespace Models {
    export interface User {
      id: number;
      name: string;
    }

    export interface Post {
      id: number;
      title: string;
      authorId: number;
    }
  }

  export namespace Services {
    export class UserService {
      private users: Models.User[] = [];

      add(user: Models.User): void {
        this.users.push(user);
      }

      findById(id: number): Models.User | undefined {
        return this.users.find((u) => u.id === id);
      }

      getAll(): Models.User[] {
        return this.users;
      }
    }
  }
}

console.log("\n--- 嵌套命名空间 ---");
const userService = new App.Services.UserService();
userService.add({ id: 1, name: "Alice" });
userService.add({ id: 2, name: "Bob" });
console.log("all:", userService.getAll());
console.log("find #1:", userService.findById(1));

// ========== 声明合并 ==========
// 模拟为第三方库扩展类型
interface Array<T> {
  customFirst(): T | undefined;
}

Array.prototype.customFirst = function () {
  return this[0];
};

console.log("\n--- 声明合并 (扩展内置类型) ---");
const arr = [10, 20, 30];
console.log("customFirst:", arr.customFirst());

// ========== 类型声明文件概念 (.d.ts) ==========
// 通常在 .d.ts 文件中声明第三方库的类型
// declare module "my-library" {
//   export function doSomething(value: string): number;
//   export interface Options {
//     debug?: boolean;
//     timeout?: number;
//   }
// }

// ========== 动态导入 ==========
async function loadModule(): Promise<void> {
  // 动态导入示例 (实际会从文件系统加载)
  const fs = await import("fs");
  const stats = fs.statSync(__filename);
  console.log("\n--- 动态导入 ---");
  console.log(`Current file size: ${stats.size} bytes`);
}

loadModule();

// ========== re-export 模式 ==========
// 实际项目中的 barrel 文件 (index.ts):
// export { UserService } from './user.service';
// export { PostService } from './post.service';
// export type { User, Post } from './models';

console.log("\n--- 模块最佳实践 ---");
console.log("1. 使用 ES Modules (import/export) 而非 namespace");
console.log("2. 每个文件是一个模块");
console.log("3. 使用 barrel files (index.ts) 统一导出");
console.log("4. 为第三方库创建 .d.ts 声明文件");
console.log("5. 使用 paths 配置路径别名");
