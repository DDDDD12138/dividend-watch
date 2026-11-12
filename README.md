# 股息观察 · dividend-watch

A 股股息观察项目，用于跟踪自选公司的历史分红，并根据统一期望股息率计算目标价格。

当前已实现首页、分红详情页和单分红来源 API：东方财富公司搜索、腾讯行情、东方财富分红记录及财年汇总。首页支持添加与移除关注、期望股息率、目标价格、排序和手动刷新；桌面表格与移动端卡片共用数据逻辑。首次打开自选列表为空，个人设置保存在本浏览器；可按名称或代码搜索并关注沪、深、北交易所 A 股，最多 50 家公司。

在“添加公司”弹窗中搜索、添加和移除关注；搜索与已关注列表独立，搜索失败仍可移除。来源和更新时间收在页脚“数据说明”及数值提示中。首页估值仅使用上一财年；小图固定展示最近五个已结束财年，缺失值不按零处理，也不向更早年份回退。

首页代码位于 `src/features/watchlist/`，主题变量位于 `src/styles/theme.css`。金额计算复用 `shared/money.ts`；行情与分红独立加载，同一资源刷新时保留本页上次成功结果；失败时提示“更新失败”，整轮刷新结束后统一排序。导入导出、巨潮和 D1 后续接入。

详情页地址为 `/dividends/:code`，首页公司名称和分红小图均可进入。使用 React Router 的基础路由，支持直接打开和刷新；自选与排序设置继续保存在本浏览器。详情页提供近 5 年／近 10 年／全部范围、年度合计内嵌单次记录图表、年度明细与记录弹窗；“分红比例”视图对照真实年度利润、已实施现金分红总额与分红比例。手机端明细表可横向滚动，并在各年度之间同步滚动进度。

请求逻辑位于 `src/data/`，详情页位于 `src/features/dividends/`，复用现有主题与金额类型。图表仅绘制已结束年份，未结束年份和报告期待确认的记录仍保留在明细；未知合计不绘柱形。大柱与小柱共用刻度，来源进度不改写，没有派息日或公告原文时不补造字段。

## 开发环境

- Node.js 最低版本 22.12.0；`.nvmrc` 指定开发基准版本 24.11.1，不作为兼容上限。目前已在 Node.js 24.11.1 上验证。
- pnpm 最低版本 12；`packageManager` 指定统一开发版本 12.18.0。启用自动版本管理时，pnpm 仍会使用该指定版本。
- React + TypeScript 7 + Vite，原生 CSS。

在 WSL 项目目录中运行命令。已安装 nvm 时，可以执行 `nvm install` 和 `nvm use`，它们会读取 `.nvmrc`。

VS Code 用户请安装工作区推荐的 [TypeScript 7 扩展](https://marketplace.visualstudio.com/items?itemName=TypeScriptTeam.native-preview)，执行 `TypeScript: Enable TypeScript 7`，并将 `js/ts.tsdk.path` 设置为 `./node_modules/typescript`，让编辑器与命令行使用项目中的同一版本。WSL 下请将扩展安装在对应的远程环境中。

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
| `pnpm icons:generate`   | 从 SVG 生成多尺寸 favicon.ico                                     |
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

## 网站图标

`public/icon.svg` 是浏览器图标的源文件。修改后运行：

```bash
pnpm icons:generate
```

脚本使用 [resvg-js](https://github.com/thx/resvg-js) 分别渲染 16、32、48、64、128、256px，再通过 [icon-encoder](https://github.com/shockpkg/icon-encoder) 封装成带透明通道、内部采用 PNG 压缩的 `public/favicon.ico`。生成前检查 `index.html` 的 ICO 尺寸声明是否一致。

将 SVG、生成后的 ICO 和相关声明一起提交。普通构建直接使用已生成的文件，无需重复生成。`apple-touch-icon.png` 和 manifest 引用的 PNG 用于主屏幕场景，不由这个命令更新。

## 工程规范

- `.editorconfig`：UTF-8、两空格缩进、LF 换行、文件末尾换行；Markdown 保留行尾空格以支持显式换行。
- `.prettierrc`：JavaScript / TypeScript 使用单引号、不加分号，其余采用 Prettier 默认规则。
- `.prettierignore`：排除构建产物、覆盖率目录和 pnpm 锁文件。
- `.oxlintrc.json`：沿用模板的 Oxlint 配置。暂不启用 `oxlint-tsgolint`，类型检查由 TypeScript 7 的 `tsc` 负责。
- `tsconfig.app.json`、`tsconfig.node.json`：均显式开启 `strict`。`noEmit` 禁止输出编译代码，增量检查缓存位于 `node_modules/.tmp/`。

## 当前目录

```text
src/                  React 页面、样式和模块资源
vite.config.ts        Vite 开发与构建配置
tsconfig.app.json     前端 TypeScript 配置
tsconfig.node.json    Vite 配置文件的 TypeScript 配置
tsconfig.json         TypeScript 项目引用入口
```

共享类型和精确计算位于 `shared/`，来源适配与汇总位于 `worker/`，测试位于 `tests/`。CI 和 Git hooks 后续接入。

## 本地 Worker API

接入方式依据 [Cloudflare 官方 React SPA + API 指南](https://developers.cloudflare.com/workers/vite-plugin/tutorial/)。

`pnpm dev` 使用 Cloudflare Vite 插件在本地 workerd 中运行 Hono，前端使用相对路径请求同源接口。无需登录 Cloudflare，也无需先部署。

- `worker/index.ts`：Worker 入口，HTTP 路由与依赖组装在 `worker/app.ts`；`GET /api/health` 返回 `{"status":"ok","service":"dividend-watch"}`。
- `worker/validation.ts`：查询词、单个代码和批量代码校验；`worker/app.ts` 统一映射 HTTP 错误，不包含业务编排或展示文案。
- `worker/services/`：公司身份、行情、资料、分红与年度统计服务，负责来源调用、各自缓存策略、业务计算与结果组装。行情并发状态限定在单次请求内。
- `worker/providers/`：来源请求与标准化；东方财富两个历史接口共用分页流程。预期来源错误与内部异常分开处理，前端按共享错误码生成提示。
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

`.wrangler/`、`.dev.vars*` 和 `.env*` 已加入 Git 忽略规则（示例文件除外）。

## 部署到 Cloudflare

在已登录 Cloudflare 的 WSL / Bash 环境中运行：

```bash
pnpm deploy:cloudflare
```

脚本先构建，再使用 `dist/dividend_watch/wrangler.json` 部署；部署说明自动取最近一次 Git 提交的短哈希和标题。先提交再部署，可让说明对应此次改动。使用 `pnpm deploy:cloudflare --dry-run` 可仅验证构建和部署打包，不发布。

## 部署到腾讯 EdgeOne Pages

`*.workers.dev` 在中国大陆被阻断，自定义域名虽可访问，但 Cloudflare 免费计划把大陆流量导向美西节点，晚高峰丢包严重。EdgeOne Pages 作为第二个部署目标并存，业务代码两边共用，Cloudflare 链路不受影响。

- `functions/api/[[default]].ts` 与 `functions/api/index.ts`：EdgeOne 入口，导出 `onRequest`，接管 `/api` 和 `/api/*`，其余路径由 Pages 提供静态文件并自带 SPA 回退。
- `functions/edgeone-polyfills.ts`：按规范实现并安装 EdgeOne 运行时缺少的 `AbortSignal.timeout`、`AbortSignal.any` 和 `Response.json`（实测缺失，缺了后者缓存会静默失效）；原生存在时不触碰。行为由 `tests/edgeone-polyfills.test.ts` 覆盖。
- `functions/edgeone-fetch.ts`：EdgeOne 的 `fetch` 会忽略 `RequestInit.signal`（实测 abort 后请求仍跑满），该包装在等待侧实现 signal 语义并通过 `createApp({ fetcher })` 注入，保证超时预算与 Cloudflare 一致。
- `pnpm dev:edgeone`：本地 8088 端口运行的就是真实的 EdgeOne 边缘运行时（实测与线上一致：同样缺少上述 API、同样忽略 signal），可在不发布的情况下验证运行时行为。腾讯的运行时类型包 `@edgeone/ef-types` 自 2024 年起未更新且与实测不符，因此不作为类型检查依据；新用到的 Web API 是否被 EdgeOne 支持，以 `pnpm dev:edgeone` 实测为准。
- `vite.edgeone.config.ts`：不含 Cloudflare 插件的前端构建，输出到 `dist/edgeone/`。
- `edgeone.json`：EdgeOne 的安装、构建命令与输出目录，GitHub 自动构建和 CLI 都读取它。

```bash
pnpm build:edgeone    # 仅构建前端产物
pnpm deploy:edgeone   # 构建并用 edgeone CLI 发布（需先 pnpm exec edgeone login）
pnpm exec edgeone makers deploy --anonymous --site global -a overseas   # 免登录临时预览，一小时后失效
```

加速区域选“全球（不含中国大陆）”（CLI 参数 `-a overseas`），无需备案。EdgeOne 分配的默认域名（`*.edgeone.dev`）按平台策略对中国大陆网络一律返回 401，大陆访问必须绑定自定义域名。当前绑定的是 `cn.divwatch.top`：在 EdgeOne 项目的 Domains 页添加域名并完成 TXT 归属验证，再在 Cloudflare DNS 中添加 CNAME `cn` 指向 EdgeOne 给出的地址并关闭代理（灰色云朵，否则流量会先经过 Cloudflare），最后在 HTTPS configuration 中申请免费证书并开启 Force HTTPS。`.edgeone/` 与 `dividend-watch.zip` 为 CLI 本地产物，已加入 Git 忽略规则。
