/**
 * 12 - 数据库操作 (MySQL)
 * 运行: npx ts-node 02-nodejs/12-database-mysql/index.ts
 * 需要: npm install mysql2
 *
 * 注意: 此示例展示代码模式，实际运行需要 MySQL 服务
 * 如果没有 MySQL，会 gracefully 降级为演示模式
 */

import mysql, { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";

// ========== 数据库配置 ==========
const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "3306"),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "test_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

// ========== 数据库管理类 ==========
class Database {
  private pool: Pool | null = null;

  async connect(): Promise<boolean> {
    try {
      this.pool = mysql.createPool(dbConfig);
      const conn = await this.pool.getConnection();
      conn.release();
      console.log("✓ 数据库连接成功");
      return true;
    } catch (err: any) {
      console.log("✗ 数据库连接失败:", err.message);
      return false;
    }
  }

  getPool(): Pool {
    if (!this.pool) throw new Error("Database not connected");
    return this.pool;
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      console.log("数据库连接已关闭");
    }
  }
}

// ========== 用户模型 ==========
interface User {
  id: number;
  name: string;
  email: string;
  age: number;
  created_at: Date;
}

class UserRepository {
  constructor(private pool: Pool) {}

  async createTable(): Promise<void> {
    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        age INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✓ users 表已创建");
  }

  async create(name: string, email: string, age: number): Promise<number> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "INSERT INTO users (name, email, age) VALUES (?, ?, ?)",
      [name, email, age]
    );
    return result.insertId;
  }

  async findById(id: number): Promise<User | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT * FROM users WHERE id = ?",
      [id]
    );
    return (rows[0] as User) || null;
  }

  async findAll(limit = 10, offset = 0): Promise<User[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT * FROM users ORDER BY id DESC LIMIT ? OFFSET ?",
      [limit, offset]
    );
    return rows as User[];
  }

  async findByEmail(email: string): Promise<User | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );
    return (rows[0] as User) || null;
  }

  async update(id: number, data: Partial<Pick<User, "name" | "email" | "age">>): Promise<boolean> {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.name) { fields.push("name = ?"); values.push(data.name); }
    if (data.email) { fields.push("email = ?"); values.push(data.email); }
    if (data.age !== undefined) { fields.push("age = ?"); values.push(data.age); }

    if (fields.length === 0) return false;
    values.push(id);

    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE users SET ${fields.join(", ")} WHERE id = ?`,
      values
    );
    return result.affectedRows > 0;
  }

  async delete(id: number): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "DELETE FROM users WHERE id = ?",
      [id]
    );
    return result.affectedRows > 0;
  }

  async count(): Promise<number> {
    const [rows] = await this.pool.execute<RowDataPacket[]>("SELECT COUNT(*) as total FROM users");
    return rows[0].total;
  }
}

// ========== 事务示例 ==========
class TransferService {
  constructor(private pool: Pool) {}

  async transfer(fromId: number, toId: number, amount: number): Promise<void> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.execute("UPDATE accounts SET balance = balance - ? WHERE id = ?", [amount, fromId]);
      await conn.execute("UPDATE accounts SET balance = balance + ? WHERE id = ?", [amount, toId]);

      await conn.commit();
      console.log(`✓ 转账成功: ${fromId} → ${toId}, ¥${amount}`);
    } catch (err) {
      await conn.rollback();
      console.log("✗ 转账失败，已回滚");
      throw err;
    } finally {
      conn.release();
    }
  }
}

// ========== 演示模式 (无需真实数据库) ==========
function demoMode(): void {
  console.log("\n========== 演示模式 (无需MySQL连接) ==========\n");

  console.log("--- 连接池配置 ---");
  console.log(JSON.stringify(dbConfig, null, 2));

  console.log("\n--- SQL 操作示例 ---");
  console.log(`
  // 创建
  const id = await userRepo.create("Alice", "alice@test.com", 25);

  // 查询
  const user = await userRepo.findById(1);
  const users = await userRepo.findAll(10, 0);

  // 更新
  await userRepo.update(1, { name: "Alice Updated", age: 26 });

  // 删除
  await userRepo.delete(1);

  // 事务
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  try {
    await conn.execute("UPDATE ...", [...]);
    await conn.execute("INSERT ...", [...]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  `);

  console.log("--- 防 SQL 注入 ---");
  console.log("✓ 始终使用参数化查询: execute('SELECT * FROM users WHERE id = ?', [id])");
  console.log("✗ 避免字符串拼接: execute(`SELECT * FROM users WHERE id = ${id}`)");

  console.log("\n--- 连接池最佳实践 ---");
  console.log("1. 使用连接池而非单连接");
  console.log("2. 用完连接立即 release()");
  console.log("3. 设置合理的 connectionLimit");
  console.log("4. 事务操作使用 getConnection()");
  console.log("5. 应用退出前调用 pool.end()");
}

// ========== 主函数 ==========
async function main(): Promise<void> {
  console.log("--- MySQL 数据库操作 ---\n");

  const db = new Database();
  const connected = await db.connect();

  if (connected) {
    const userRepo = new UserRepository(db.getPool());
    await userRepo.createTable();

    // CRUD 操作
    const id = await userRepo.create("Alice", "alice@test.com", 25);
    console.log("创建用户 id:", id);

    const user = await userRepo.findById(id);
    console.log("查询用户:", user);

    await userRepo.update(id, { age: 26 });
    console.log("更新后:", await userRepo.findById(id));

    console.log("总数:", await userRepo.count());

    await db.close();
  } else {
    demoMode();
  }
}

main();
