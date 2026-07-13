# Node.js 概念自测 · 基础

> 先自己作答,再点开折叠块核对。共 10 题。

---

### 1.(选择)CommonJS 与 ES Module 的说法,错误的是?

A. CommonJS 用 `require` / `module.exports`
B. ESM 用 `import` / `export`
C. CommonJS 的 `require` 是同步的
D. 在 `.js` 文件里两种语法可以随意混用

<details><summary>答案与解析</summary>

**D**。一个模块的模块系统由 `package.json` 的 `"type"` 或文件扩展名(`.mjs`/`.cjs`)决定,不能随意混用。CJS 同步加载,ESM 支持静态分析与异步加载。

</details>

---

### 2.(选择)`__dirname` 在 CommonJS 中表示?

A. 当前工作目录(`process.cwd()`)
B. 当前**模块文件所在的目录**
C. 项目根目录
D. 用户主目录

<details><summary>答案与解析</summary>

**B**。`__dirname` 是当前模块文件所在目录,与运行命令的工作目录 `process.cwd()` 不同。ESM 中没有 `__dirname`,需用 `import.meta.url` 换算。

</details>

---

### 3.(简答)`fs.readFile` 与 `fs.readFileSync` 的区别?什么时候用同步版本?

<details><summary>答案与解析</summary>

`readFile` 是异步(回调/Promise),不阻塞事件循环;`readFileSync` 同步阻塞。服务器请求处理路径上应用异步版本;同步版本一般只在**启动阶段**(如读配置)或脚本工具里使用。

</details>

---

### 4.(选择)关于 Stream(流),错误的是?

A. 可以边读边处理,内存占用低
B. `pipe` 能把可读流接到可写流
C. 必须一次性把全部数据读入内存
D. Transform 流可读可写,用于转换数据

<details><summary>答案与解析</summary>

**C**。流的意义正是**不必**一次性载入全部数据,适合大文件/网络数据。

</details>

---

### 5.(选择)`EventEmitter` 中,同一事件注册多个监听器,`emit` 时如何执行?

A. 并行执行
B. 按注册顺序**同步依次**执行
C. 随机顺序
D. 只执行最后一个

<details><summary>答案与解析</summary>

**B**。`emit` 是同步的,按监听器注册顺序依次调用。

</details>

---

### 6.(简答)`process.env` 是什么?如何用 dotenv 管理配置?

<details><summary>答案与解析</summary>

`process.env` 是环境变量对象。`dotenv` 在启动时读取 `.env` 文件并把键值注入 `process.env`,便于按环境(dev/prod)分离配置。敏感信息(密钥、密码)应放环境变量而非硬编码,`.env` 不应提交到仓库。

</details>

---

### 7.(选择)Express 中,中间件函数的签名通常是?

A. `(req, res)`
B. `(req, res, next)`
C. `(err, req, res)`
D. `(next)`

<details><summary>答案与解析</summary>

**B**。普通中间件是 `(req, res, next)`;**错误处理中间件**是四参 `(err, req, res, next)`,Express 靠参数个数区分。

</details>

---

### 8.(简答)RESTful API 中,GET / POST / PUT / PATCH / DELETE 分别语义是什么?

<details><summary>答案与解析</summary>

- GET:读取(安全、幂等)
- POST:新建(非幂等)
- PUT:整体替换/更新(幂等)
- PATCH:部分更新
- DELETE:删除(幂等)

"幂等"指多次执行效果与一次相同。

</details>

---

### 9.(选择)HTTP 状态码 `201`、`400`、`401`、`404`、`500` 依次表示?

A. 创建成功 / 请求错误 / 未认证 / 未找到 / 服务器错误
B. 成功 / 未授权 / 禁止 / 未找到 / 网关错误
C. 创建成功 / 未找到 / 未认证 / 请求错误 / 服务器错误
D. 成功 / 重定向 / 未认证 / 未找到 / 服务器错误

<details><summary>答案与解析</summary>

**A**。201 Created、400 Bad Request、401 Unauthorized(未认证)、404 Not Found、500 Internal Server Error。注意 401(未认证)与 403(已认证但无权限)的区别。

</details>

---

### 10.(简答)`path.join` 和 `path.resolve` 有何区别?

<details><summary>答案与解析</summary>

- `path.join`:按平台分隔符拼接片段并规范化,得到的可能是相对路径。
- `path.resolve`:从右向左解析成**绝对路径**,遇到绝对路径片段会作为起点;若拼接后仍非绝对,则以 `process.cwd()` 为基准。

例:`path.join("a", "b")` → `"a/b"`;`path.resolve("a", "b")` → `"/当前工作目录/a/b"`。

</details>
