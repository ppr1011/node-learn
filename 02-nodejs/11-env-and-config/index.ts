/**
 * 11 - 环境变量与配置管理
 * 运行: npx ts-node 02-nodejs/11-env-and-config/index.ts
 * 需要: npm install dotenv
 */

import * as path from "path";
import * as fs from "fs";

// ========== 创建示例 .env 文件 ==========
const envContent = `
# 应用配置
APP_NAME=MyNodeApp
APP_PORT=3000
APP_ENV=development

# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_NAME=myapp
DB_USER=root
DB_PASSWORD=secret123

# Redis 配置
REDIS_URL=redis://localhost:6379

# JWT 配置
JWT_SECRET=my-super-secret-key
JWT_EXPIRES_IN=7d

# 第三方服务
API_KEY=sk-xxxxxxxxxxxx
SMTP_HOST=smtp.example.com
SMTP_PORT=587
`;

const envPath = path.join(__dirname, ".env");
fs.writeFileSync(envPath, envContent.trim());
console.log("--- 创建 .env 文件 ---");
console.log(`路径: ${envPath}\n`);

// ========== 手动解析 .env (理解原理) ==========
function parseEnvFile(filePath: string): Record<string, string> {
  const content = fs.readFileSync(filePath, "utf-8");
  const env: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, "");
    env[key] = value;
  }

  return env;
}

const parsed = parseEnvFile(envPath);
console.log("--- 手动解析 .env ---");
console.log(parsed);

// ========== 使用 dotenv ==========
require("dotenv").config({ path: envPath });

console.log("\n--- dotenv 加载后 ---");
console.log("APP_NAME:", process.env.APP_NAME);
console.log("APP_PORT:", process.env.APP_PORT);
console.log("DB_HOST:", process.env.DB_HOST);

// ========== 配置管理类 ==========
interface AppConfig {
  app: {
    name: string;
    port: number;
    env: "development" | "production" | "test";
  };
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
    url: string;
  };
  redis: {
    url: string;
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
}

class ConfigService {
  private config: AppConfig;

  constructor() {
    this.config = this.load();
    this.validate();
  }

  private load(): AppConfig {
    return {
      app: {
        name: this.getString("APP_NAME", "MyApp"),
        port: this.getNumber("APP_PORT", 3000),
        env: this.getString("APP_ENV", "development") as AppConfig["app"]["env"],
      },
      database: {
        host: this.getString("DB_HOST", "localhost"),
        port: this.getNumber("DB_PORT", 3306),
        name: this.getString("DB_NAME", "app"),
        user: this.getString("DB_USER", "root"),
        password: this.getString("DB_PASSWORD", ""),
        get url() {
          return `mysql://${this.user}:${this.password}@${this.host}:${this.port}/${this.name}`;
        },
      },
      redis: {
        url: this.getString("REDIS_URL", "redis://localhost:6379"),
      },
      jwt: {
        secret: this.getString("JWT_SECRET", ""),
        expiresIn: this.getString("JWT_EXPIRES_IN", "1d"),
      },
    };
  }

  private getString(key: string, defaultValue: string): string {
    return process.env[key] || defaultValue;
  }

  private getNumber(key: string, defaultValue: number): number {
    const value = process.env[key];
    return value ? parseInt(value, 10) : defaultValue;
  }

  private validate(): void {
    const required = ["JWT_SECRET", "DB_PASSWORD"];
    const missing = required.filter((key) => !process.env[key]);

    if (missing.length > 0 && this.config.app.env === "production") {
      throw new Error(`Missing required env vars: ${missing.join(", ")}`);
    }
  }

  get<K extends keyof AppConfig>(section: K): AppConfig[K] {
    return this.config[section];
  }

  getAll(): AppConfig {
    return this.config;
  }

  isDev(): boolean {
    return this.config.app.env === "development";
  }

  isProd(): boolean {
    return this.config.app.env === "production";
  }
}

console.log("\n--- ConfigService ---");
const config = new ConfigService();
console.log("app:", config.get("app"));
console.log("database url:", config.get("database").url);
console.log("isDev:", config.isDev());

// ========== 多环境配置 ==========
console.log("\n--- 多环境配置策略 ---");
console.log("1. .env              - 默认配置 (提交到 git)");
console.log("2. .env.local        - 本地覆盖 (不提交)");
console.log("3. .env.development  - 开发环境");
console.log("4. .env.production   - 生产环境");
console.log("5. .env.test         - 测试环境");
console.log("\n加载优先级: 环境变量 > .env.local > .env.[NODE_ENV] > .env");

// ========== 安全建议 ==========
console.log("\n--- 安全建议 ---");
console.log("1. 永远不要将 .env 提交到版本控制");
console.log("2. 提供 .env.example 作为模板");
console.log("3. 生产环境使用系统环境变量或密钥管理服务");
console.log("4. 敏感信息加密存储");
console.log("5. 定期轮换密钥");

// 清理
fs.unlinkSync(envPath);
