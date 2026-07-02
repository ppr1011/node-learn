/**
 * 04 - 类
 * 运行: npx ts-node 01-typescript/04-classes/index.ts
 */

// ========== 基本类 ==========
class Animal {
  public name: string;
  private _age: number;
  protected species: string;

  constructor(name: string, age: number, species: string) {
    this.name = name;
    this._age = age;
    this.species = species;
  }

  get age(): number {
    return this._age;
  }

  set age(value: number) {
    if (value < 0) throw new Error("Age cannot be negative");
    this._age = value;
  }

  describe(): string {
    return `${this.name} is a ${this.species}, ${this._age} years old`;
  }
}

const cat = new Animal("Whiskers", 3, "Cat");
console.log("--- 基本类 ---");
console.log(cat.describe());
console.log("name (public):", cat.name);
console.log("age (getter):", cat.age);

// ========== 继承 ==========
class Dog extends Animal {
  private tricks: string[] = [];

  constructor(name: string, age: number) {
    super(name, age, "Dog");
  }

  learn(trick: string): void {
    this.tricks.push(trick);
  }

  perform(): string {
    if (this.tricks.length === 0) return `${this.name} doesn't know any tricks`;
    return `${this.name} can: ${this.tricks.join(", ")}`;
  }

  // 方法重写
  describe(): string {
    return `${super.describe()} | Tricks: ${this.tricks.length}`;
  }
}

const dog = new Dog("Buddy", 5);
dog.learn("sit");
dog.learn("shake");

console.log("\n--- 继承 ---");
console.log(dog.describe());
console.log(dog.perform());

// ========== 抽象类 ==========
abstract class Shape {
  abstract area(): number;
  abstract perimeter(): number;

  toString(): string {
    return `${this.constructor.name}: area=${this.area().toFixed(2)}, perimeter=${this.perimeter().toFixed(2)}`;
  }
}

class Circle extends Shape {
  constructor(private radius: number) {
    super();
  }

  area(): number {
    return Math.PI * this.radius ** 2;
  }

  perimeter(): number {
    return 2 * Math.PI * this.radius;
  }
}

class Rectangle extends Shape {
  constructor(private width: number, private height: number) {
    super();
  }

  area(): number {
    return this.width * this.height;
  }

  perimeter(): number {
    return 2 * (this.width + this.height);
  }
}

console.log("\n--- 抽象类 ---");
const shapes: Shape[] = [new Circle(5), new Rectangle(4, 6)];
shapes.forEach((s) => console.log(s.toString()));

// ========== 实现接口 ==========
interface Serializable {
  serialize(): string;
}

interface Printable {
  print(): void;
}

class User implements Serializable, Printable {
  constructor(
    public readonly id: number,
    public name: string,
    public email: string
  ) {}

  serialize(): string {
    return JSON.stringify({ id: this.id, name: this.name, email: this.email });
  }

  print(): void {
    console.log(`User #${this.id}: ${this.name} <${this.email}>`);
  }
}

console.log("\n--- 实现接口 ---");
const user = new User(1, "Alice", "alice@example.com");
user.print();
console.log("serialized:", user.serialize());

// ========== 静态成员 ==========
class Counter {
  private static count = 0;

  static increment(): void {
    Counter.count++;
  }

  static getCount(): number {
    return Counter.count;
  }

  static reset(): void {
    Counter.count = 0;
  }
}

console.log("\n--- 静态成员 ---");
Counter.increment();
Counter.increment();
Counter.increment();
console.log("count:", Counter.getCount());

// ========== 单例模式 ==========
class Database {
  private static instance: Database;
  private connected = false;

  private constructor() {}

  static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  connect(): void {
    this.connected = true;
    console.log("Database connected");
  }

  isConnected(): boolean {
    return this.connected;
  }
}

console.log("\n--- 单例模式 ---");
const db1 = Database.getInstance();
const db2 = Database.getInstance();
db1.connect();
console.log("db1 === db2:", db1 === db2);
console.log("db2.isConnected():", db2.isConnected());
