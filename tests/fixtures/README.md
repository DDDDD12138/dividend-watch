# 测试样本与职责

所有测试离线运行。生产代码不读取这里的样本，也不使用样本金额作为完整性判断或故障回退。

## 原始接口响应

| 文件                         | 接口     | 使用位置                     |
| ---------------------------- | -------- | ---------------------------- |
| `eastmoney/search.json`      | 股票搜索 | `provider-contracts.test.ts` |
| `eastmoney/dividends.json`   | 分红记录 | `provider-contracts.test.ts` |
| `eastmoney/profile.json`     | 公司资料 | `provider-contracts.test.ts` |
| `eastmoney/allocations.json` | 年度统计 | `provider-contracts.test.ts` |
| `sina/year-end-prices.json`  | 新浪年线 | `provider-contracts.test.ts` |
| `tencent/quotes.gb18030.bin` | 腾讯行情 | `provider-contracts.test.ts` |

这些文件是公开接口的 HTTP 响应体，保留原始字节，没有手工修改字段或补写响应外壳。请求 URL（含参数）、采集时间和编码记录在 [captures.json](captures.json)。腾讯样本保留 GB18030 字节，测试通过生产解码流程读取，避免 UTF-8 文本样本掩盖编码问题。

分红和年度统计在采集时使用报告期过滤条件控制体积，分别保留 3 条和 1 条记录，响应的 `count`、`pages` 与内容一致。兼容测试独立校验生产请求的参数，然后回放这份有限范围的响应；这些样本不代表完整历史。少量正常响应用于解析兼容性，异常字段、多页、空结果和网络失败由人工构造覆盖。

更新时，从 `captures.json` 选择对应 URL，用 `curl -fsSL --max-time 20 'URL' -o 文件` 获取响应；确认收到有效数据后，同步更新采集信息和该接口的明确预期值。不要手工改写原始响应来让测试通过，也不要为了行情日期变化定期刷新全部样本。测试时钟固定在采集时间，运行测试不会访问这些 URL。原始 JSON 已排除自动格式化。

## 人工测试输入

| 模块                   | 职责                                      | 适用测试                 |
| ---------------------- | ----------------------------------------- | ------------------------ |
| `support/context.ts`   | 固定时钟与公司身份                        | 各层共享                 |
| `support/providers.ts` | 最小来源行、响应包装、行情文本和 API 模拟 | 解析边界、分页、API 故障 |
| `support/domain.ts`    | 标准化分红记录、业务输入和明确的 API 输出 | 业务计算、展示模型、页面 |

业务测试直接给被测计算函数传入标准化记录；页面测试直接给组件传入 API 数据，不在准备数据时调用 `fetchDividends`、`normalizeRecord` 或 `buildHistory`。默认业务例子只有提案、年末、中期和上一年四条记录，现金金额使用 `0.2 + 0.1 = 0.3` 等简单值，特定场景在用例中覆盖。

`quoteText` 等构造函数明确属于人工输入，并非真实抓包。不要把它们生成的内容保存为“原始响应”。正常响应外壳优先复用 `searchBody`、`eastmoneyPage` 等函数；故意缺字段、类型错误等测试可以在用例中直接构造。这样可以分别维护接口事实和业务情景，避免两者相互牵动。

API、缓存和错误处理测试使用 `apiFetcher` 提供的单条人工分红记录，不读取接口样本。完整请求参数由接口兼容测试集中校验；`apiFetcher` 只匹配用例需要的接口、报表、股票身份和页码，其他请求报错。真实响应到年度汇总的贯通检查复用 `eastmoney/dividends.json`，无需另外保存历史数据集。

新浪年线样本为华域汽车的 6 条原始年线，包含 5 个完整年度及一个未结束年度。仅用于接口契约测试；日期归属、异常价格、缓存隔离和股息率计算使用 `year-end-prices.test.ts` 中的人工数据，不依赖真实金额。
