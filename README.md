# 股息观察 · dividend-watch

A 股股息观察项目，用于跟踪自选公司的历史分红，并根据统一期望股息率计算目标价格。

当前已实现首页和单分红来源 API：东方财富公司搜索、腾讯行情、东方财富分红记录及财年汇总。首页支持添加与移除关注、期望股息率、目标价格、排序和手动刷新；桌面表格与移动端卡片共用数据逻辑。首次打开自选列表为空，个人设置保存在本浏览器；可按名称或代码搜索并关注沪、深、北交易所 A 股，最多 50 家公司。

在“添加公司”弹窗中搜索、添加和移除关注；搜索与已关注列表独立，搜索失败仍可移除。来源和更新时间收在页脚“数据说明”及数值提示中。分红小图以参考年度为截止展示五年，无参考年度时展示来源中已结束年份的历史，缺失值不按零处理。

首页代码位于 `src/features/watchlist/`，主题变量位于 `src/styles/theme.css`。金额计算复用 `shared/money.ts`；行情与分红独立加载，刷新失败时保留上次成功数据并提示。公司抽屉、分红详情页、导入导出、巨潮和 D1 后续接入。

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

API 契约、来源字段和计算口径见 [API 文档](docs/api.md)。使用 `pnpm test` 运行离线回归测试，`pnpm test:watch` 开启监听。

提交前执行：

```bash
pnpm check
pnpm test
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
vite.config.ts        Vite 开发与构建配置
tsconfig.app.json     前端 TypeScript 配置
tsconfig.node.json    Vite 配置文件的 TypeScript 配置
tsconfig.json         TypeScript 项目引用入口
```

共享类型和精确计算位于 `shared/`，来源适配与汇总位于 `worker/`，测试位于 `tests/`。CI、Git hooks 和云端部署后续接入。

## 本地 Worker API

接入方式依据 [Cloudflare 官方 React SPA + API 指南](https://developers.cloudflare.com/workers/vite-plugin/tutorial/)。

`pnpm dev` 使用 Cloudflare Vite 插件在本地 workerd 中运行 Hono，前端使用相对路径请求同源接口。无需登录 Cloudflare，也无需先部署。

- `worker/index.ts`：Worker 入口，业务路由在 `worker/app.ts`；`GET /api/health` 返回 `{"status":"ok","service":"dividend-watch"}`。
- `wrangler.jsonc`：Worker 配置，`/api` 和 `/api/*` 优先进入 Worker；不存在的 API 返回 JSON 404，其他页面使用 SPA 回退。
- `tsconfig.worker.json`：独立 Worker 类型环境，继承严格检查设置，通过 `compilerOptions.types` 引用生成文件。
- `worker-configuration.d.ts`：由 `pnpm cf-typegen`（Wrangler 官方命令）生成并纳入版本控制，不手动编辑；修改 Wrangler 配置后重新生成。
- `pnpm-workspace.yaml`：由 `pnpm approve-builds` 生成，仅允许 esbuild、workerd 安装脚本；当前仍为单项目仓库。

兼容日期使用当前安装的 workerd 对应日期 `2026-10-12`。后续更新运行时及兼容日期时重新生成类型并验证。

类型维护遵循 [Cloudflare 官方 TypeScript 指南](https://developers.cloudflare.com/workers/languages/typescript/#5-update-your-scripts-and-ci-pipelines)：保留生成文件，通过 `wrangler types --check` 检查记录的配置哈希和运行时信息是否过期（不检查生成文件正文是否被手动修改）。`pnpm check` 和 `pnpm build` 都会经由 `pnpm typecheck` 执行该检查。若提示过期，运行 `pnpm cf-typegen`，检查生成差异后连同配置一并提交。

启动后可在浏览器访问 `/api/health` 检查 API 连接。命令行也可执行：

```bash
curl http://localhost:5173/api/health
```

构建产物位于 `dist/client/` 和 `dist/dividend_watch/`。运行 `pnpm preview` 可在本地检查构建后的前端和 API。

本次仅配置本地运行，尚未部署或创建任何云端资源。`.wrangler/`、`.dev.vars*` 和 `.env*` 已加入 Git 忽略规则（示例文件除外）。
