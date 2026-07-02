/**
 * 05 - Stream 流
 * 运行: npx ts-node 02-nodejs/05-stream/index.ts
 */

import { Readable, Writable, Transform, pipeline } from "stream";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";

const pipelineAsync = promisify(pipeline);
const tempDir = path.join(__dirname, "temp");

// 确保临时目录存在
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// ========== 可读流 ==========
console.log("--- 自定义可读流 ---");

class CounterStream extends Readable {
  private current: number;

  constructor(private max: number) {
    super({ objectMode: true });
    this.current = 1;
  }

  _read(): void {
    if (this.current <= this.max) {
      this.push({ count: this.current, time: Date.now() });
      this.current++;
    } else {
      this.push(null); // 结束信号
    }
  }
}

const counter = new CounterStream(5);
const chunks: any[] = [];
counter.on("data", (chunk) => chunks.push(chunk));
counter.on("end", () => {
  console.log("CounterStream 输出:", chunks);
});

// ========== 可写流 ==========
console.log("\n--- 自定义可写流 ---");

class ConsoleWriter extends Writable {
  private lineCount = 0;

  _write(chunk: Buffer, encoding: string, callback: () => void): void {
    this.lineCount++;
    process.stdout.write(`  [${this.lineCount}] ${chunk.toString()}`);
    callback();
  }

  getLineCount(): number {
    return this.lineCount;
  }
}

const writer = new ConsoleWriter();
writer.write("Hello Stream\n");
writer.write("Second line\n");
writer.write("Third line\n");
writer.end();
console.log(`  Total lines: ${writer.getLineCount()}`);

// ========== Transform 流 ==========
console.log("\n--- Transform 流 ---");

class UpperCaseTransform extends Transform {
  _transform(chunk: Buffer, encoding: string, callback: (err: null, data: string) => void): void {
    callback(null, chunk.toString().toUpperCase());
  }
}

class LineNumberTransform extends Transform {
  private lineNum = 0;

  _transform(chunk: Buffer, encoding: string, callback: (err: null, data: string) => void): void {
    const lines = chunk.toString().split("\n").filter(Boolean);
    const numbered = lines.map((line) => `${++this.lineNum}: ${line}`).join("\n") + "\n";
    callback(null, numbered);
  }
}

// ========== 文件流操作 ==========
async function fileStreamDemo(): Promise<void> {
  console.log("\n--- 文件流操作 ---");

  // 创建测试文件
  const inputFile = path.join(tempDir, "input.txt");
  const outputFile = path.join(tempDir, "output.txt");

  const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}: hello stream world`);
  fs.writeFileSync(inputFile, lines.join("\n"));
  console.log("创建输入文件:", inputFile);

  // 使用 pipeline 连接流: 读取 → 转大写 → 加行号 → 写入
  await pipelineAsync(
    fs.createReadStream(inputFile, "utf-8"),
    new UpperCaseTransform(),
    new LineNumberTransform(),
    fs.createWriteStream(outputFile)
  );

  console.log("转换完成，输出文件:", outputFile);
  console.log("输出内容:");
  const result = fs.readFileSync(outputFile, "utf-8");
  console.log(result.split("\n").slice(0, 5).map((l) => `  ${l}`).join("\n"));
  console.log("  ...");
}

// ========== 背压处理 ==========
async function backpressureDemo(): Promise<void> {
  console.log("\n--- 背压处理 ---");

  let produced = 0;
  let consumed = 0;

  const fastProducer = new Readable({
    read() {
      for (let i = 0; i < 5; i++) {
        produced++;
        const canContinue = this.push(`data-${produced}\n`);
        if (!canContinue) {
          // 消费者来不及处理，暂停生产
          break;
        }
      }
      if (produced >= 20) {
        this.push(null);
      }
    },
  });

  const slowConsumer = new Writable({
    highWaterMark: 3,
    write(chunk, encoding, callback) {
      consumed++;
      // 模拟慢处理
      setTimeout(callback, 10);
    },
  });

  await pipelineAsync(fastProducer, slowConsumer);
  console.log(`  生产: ${produced} 条, 消费: ${consumed} 条`);
}

// ========== 实用示例: CSV 解析流 ==========
async function csvDemo(): Promise<void> {
  console.log("\n--- CSV 解析 Transform ---");

  class CsvParser extends Transform {
    private headers: string[] = [];
    private isFirst = true;

    constructor() {
      super({ objectMode: true });
    }

    _transform(chunk: Buffer, encoding: string, callback: () => void): void {
      const lines = chunk.toString().trim().split("\n");
      for (const line of lines) {
        const values = line.split(",");
        if (this.isFirst) {
          this.headers = values;
          this.isFirst = false;
        } else {
          const obj: Record<string, string> = {};
          this.headers.forEach((h, i) => {
            obj[h] = values[i];
          });
          this.push(obj);
        }
      }
      callback();
    }
  }

  const csvData = "name,age,city\nAlice,25,Shanghai\nBob,30,Beijing\nCharlie,28,Shenzhen";
  const csvFile = path.join(tempDir, "test.csv");
  fs.writeFileSync(csvFile, csvData);

  const parser = new CsvParser();
  const results: any[] = [];

  const readable = fs.createReadStream(csvFile, "utf-8");
  readable.pipe(parser);
  parser.on("data", (row) => results.push(row));
  parser.on("end", () => {
    console.log("解析结果:", results);
  });
}

// ========== 清理 ==========
async function cleanup(): Promise<void> {
  setTimeout(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log("\n--- 已清理临时文件 ---");
  }, 500);
}

// 执行
async function main() {
  await fileStreamDemo();
  await backpressureDemo();
  await csvDemo();
  await cleanup();
}

main();
