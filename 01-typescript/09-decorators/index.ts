/**
 * 09 - 装饰器
 * 运行: npx ts-node --esm 01-typescript/09-decorators/index.ts
 * 注意: 需要在 tsconfig.json 中开启 "experimentalDecorators": true
 */

// ========== 类装饰器 ==========
function Sealed(constructor: Function) {
  Object.seal(constructor);
  Object.seal(constructor.prototype);
}

function Logger(prefix: string) {
  return function (constructor: Function) {
    console.log(`[${prefix}] Class "${constructor.name}" is defined`);
  };
}

@Sealed
@Logger("App")
class ApiService {
  name = "ApiService";

  fetchData(): string {
    return "data fetched";
  }
}

console.log("--- 类装饰器 ---");
const api = new ApiService();
console.log(api.fetchData());

// ========== 方法装饰器 ==========
function Log(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const original = descriptor.value;
  descriptor.value = function (...args: any[]) {
    console.log(`  → Calling ${propertyKey}(${args.join(", ")})`);
    const result = original.apply(this, args);
    console.log(`  ← ${propertyKey} returned: ${JSON.stringify(result)}`);
    return result;
  };
}

function Measure(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const original = descriptor.value;
  descriptor.value = function (...args: any[]) {
    const start = performance.now();
    const result = original.apply(this, args);
    const duration = performance.now() - start;
    console.log(`  ⏱ ${propertyKey} took ${duration.toFixed(3)}ms`);
    return result;
  };
}

class Calculator {
  @Log
  add(a: number, b: number): number {
    return a + b;
  }

  @Log
  @Measure
  multiply(a: number, b: number): number {
    let result = 0;
    for (let i = 0; i < b; i++) {
      result += a;
    }
    return result;
  }
}

console.log("\n--- 方法装饰器 ---");
const calc = new Calculator();
calc.add(2, 3);
calc.multiply(7, 8);

// ========== 属性装饰器 ==========
function MinLength(min: number) {
  return function (target: any, propertyKey: string) {
    let value: string;

    const getter = () => value;
    const setter = (newVal: string) => {
      if (newVal.length < min) {
        throw new Error(`${propertyKey} must be at least ${min} characters`);
      }
      value = newVal;
    };

    Object.defineProperty(target, propertyKey, {
      get: getter,
      set: setter,
      enumerable: true,
      configurable: true,
    });
  };
}

class UserForm {
  @MinLength(3)
  username: string = "default";

  @MinLength(6)
  password: string = "default123";
}

console.log("\n--- 属性装饰器 ---");
const form = new UserForm();
form.username = "Alice";
console.log("username:", form.username);

try {
  form.username = "AB";
} catch (e: any) {
  console.log("Error:", e.message);
}

// ========== 参数装饰器 ==========
const requiredParams: Map<string, number[]> = new Map();

function Required(target: any, propertyKey: string, parameterIndex: number) {
  const existing = requiredParams.get(propertyKey) || [];
  existing.push(parameterIndex);
  requiredParams.set(propertyKey, existing);
}

class Greeter {
  greet(@Required name: string, title?: string): string {
    return title ? `Hello, ${title} ${name}` : `Hello, ${name}`;
  }
}

console.log("\n--- 参数装饰器 ---");
const greeter = new Greeter();
console.log(greeter.greet("Alice", "Ms."));
console.log("required params for 'greet':", requiredParams.get("greet"));
