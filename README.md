# 股息观察 · dividend-watch

A 股股息观察项目，用于跟踪自选公司的历史分红，并根据统一期望股息率计算目标价格。

当前处于工程初始化阶段，页面仍为 Vite 官方 React 模板。已接入本地 Cloudflare Worker + Hono，提供 `/api/health` 健康检查。真实行情、分红数据和 D1 尚未接入。

## 开发环境

- Node.js 最低版本 22.12.0；`.nvmrc` 指定开发基准版本 24.11.1，不作为兼容上限。目前已在 Node.js 24.11.1 上验证。
- pnpm 最低版本 12；`packageManager` 指定统一开发版本 12.11.2。启用自动版本管理时，pnpm 仍会使用该指定版本。
- React + TypeScript 6 + Vite，原生 CSS。

在 WSL 项目目录中运行命令。已安装 nvm 时，可以执行 `nvm install` 和 `nvm use`，它们会读取 `.nvmrc`。

首次安装及启动：

```bash
pnpm install --frozen-lockfile
pnpm dev
```

浏览器打开终端输出的地址，通常为 `http://localhost:5173`。

使用 pnpm 添加、更新依赖，并提交对应的 `pnpm-lock.yaml` 变更。

Prettier 按[官方建议](https://prettier.io/docs/install.html)固定精确版本：即使补丁升级也可能改变格式化结果。需要升级时显式更新版本及锁文件，再运行格式化和检查。

## 常用命令

| 命令                    | 用途                                                              |
| ----------------------- | ----------------------------------------------------------------- |
| `pnpm dev`              | 同时启动前端和本地 Worker                                         |
| `pnpm format`           | 使用 Prettier 格式化文件                                          |
| `pnpm format:check`     | 检查格式，不修改文件                                              |
| `pnpm lint`             | 使用 Oxlint 检查代码                                              |
| `pnpm cf-typegen`       | 重新生成 Worker 类型文件                                          |
| `pnpm cf-typegen:check` | 检查生成类型对应的配置和运行时是否过期                            |
| `pnpm typecheck`        | 先检查 Worker 类型是否过期，再检查前端、Vite 配置及 Worker 的类型 |
| `pnpm check`            | 依次执行格式、Lint、类型检查，失败时停止                          |
| `pnpm build`            | 检查类型并构建前端及 Worker 到 `dist/`                            |
| `pnpm preview`          | 在本地 Workers 运行时预览构建产物，需先构建                       |

提交前执行：

```bash
pnpm check
pnpm build
```

## 工程规范

- `.editorconfig`：UTF-8、两空格缩进、LF 换行、文件末尾换行；Markdown 保留行尾空格以支持显式换行。
- `.prettierrc`：JavaScript / TypeScript 使用单引号、不加分号，其余采用 Prettier 默认规则。
- `.prettierignore`：排除构建产物、覆盖率目录和 pnpm 锁文件。
- `.oxlintrc.json`：沿用模板的 Oxlint 配置。暂不启用 `oxlint-tsgolint`，类型检查由 TypeScript 6 的 `tsc` 负责。
- `tsconfig.app.json`、`tsconfig.node.json`：均显式开启 `strict`。`noEmit` 禁止输出编译代码，增量检查缓存位于 `node_modules/.tmp/`。

## 当前目录

```text
src/                  React 页面、样式和模块资源
public/               直接提供访问的静态资源
vite.config.ts        Vite 开发与构建配置
tsconfig.app.json     前端 TypeScript 配置
tsconfig.node.json    Vite 配置文件的 TypeScript 配置
tsconfig.json         TypeScript 项目引用入口
```

业务页面和共享计算模块将在对应功能实现时添加。自动化测试、CI、Git hooks 和云端部署后续逐步接入。

## 本地 Worker API

接入方式依据 [Cloudflare 官方 React SPA + API 指南](https://developers.cloudflare.com/workers/vite-plugin/tutorial/)。

`pnpm dev` 使用 Cloudflare Vite 插件在本地 workerd 中运行 Hono，前端使用相对路径请求同源接口。无需登录 Cloudflare，也无需先部署。

- `worker/index.ts`：Hono 入口，`GET /api/health` 返回 `{"status":"ok","service":"dividend-watch"}`。
- `wrangler.jsonc`：Worker 配置，`/api` 和 `/api/*` 优先进入 Worker；不存在的 API 返回 JSON 404，其他页面使用 SPA 回退。
- `tsconfig.worker.json`：独立 Worker 类型环境，继承严格检查设置，通过 `compilerOptions.types` 引用生成文件。
- `worker-configuration.d.ts`：由 `pnpm cf-typegen`（Wrangler 官方命令）生成并纳入版本控制，不手动编辑；修改 Wrangler 配置后重新生成。
- `pnpm-workspace.yaml`：由 `pnpm approve-builds` 生成，仅允许 esbuild、workerd 安装脚本；当前仍为单项目仓库。

兼容日期使用当前安装的 workerd 对应日期 `2026-10-12`。后续更新运行时及兼容日期时重新生成类型并验证。

类型维护遵循 [Cloudflare 官方 TypeScript 指南](https://developers.cloudflare.com/workers/languages/typescript/#5-update-your-scripts-and-ci-pipelines)：保留生成文件，通过 `wrangler types --check` 检查记录的配置哈希和运行时信息是否过期（不检查生成文件正文是否被手动修改）。`pnpm check` 和 `pnpm build` 都会经由 `pnpm typecheck` 执行该检查。若提示过期，运行 `pnpm cf-typegen`，检查生成差异后连同配置一并提交。

启动后点击模板页面下方的“检查 API 连接”，或在浏览器访问 `/api/health`。命令行也可执行：

```bash
curl http://localhost:5173/api/health
```

构建产物位于 `dist/client/` 和 `dist/dividend_watch/`。运行 `pnpm preview` 可在本地检查构建后的前端和 API。

本次仅配置本地运行，尚未部署或创建任何云端资源。`.wrangler/`、`.dev.vars*` 和 `.env*` 已加入 Git 忽略规则（示例文件除外）。
