# 股息观察 · dividend-watch

A 股股息观察项目，用于跟踪自选公司的历史分红，并根据统一期望股息率计算目标价格。

当前处于工程初始化阶段，页面仍为 Vite 官方 React 模板。真实行情、分红数据、Cloudflare Worker API 和 D1 尚未接入。

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

| 命令                | 用途                                        |
| ------------------- | ------------------------------------------- |
| `pnpm dev`          | 启动本地前端开发服务                        |
| `pnpm format`       | 使用 Prettier 格式化文件                    |
| `pnpm format:check` | 检查格式，不修改文件                        |
| `pnpm lint`         | 使用 Oxlint 检查代码                        |
| `pnpm typecheck`    | 使用 TypeScript 检查前端与 Vite 配置的类型  |
| `pnpm check`        | 依次执行格式、Lint、类型检查，失败时停止    |
| `pnpm build`        | 执行类型检查并构建到 `dist/`                |
| `pnpm preview`      | 预览已构建的前端产物，需先运行 `pnpm build` |

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

业务页面、共享计算模块和 Worker 目录将在对应功能实现时添加。自动化测试、CI、Git hooks 和云端部署后续逐步接入。
