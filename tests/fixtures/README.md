# 东方财富回归样本

`eastmoney.json` 提取自用户 Windows 交接资料 `outputs/data-validation/results.json`，只包含测试需要的三只股票原始东方财富行、原抓取时间和来源说明。原文件未改写。样本抓取时间见 JSON 的 `checkedAt`。

这些记录用于离线测试转换、分页、重复处理和计算；其他异常场景由测试构造。生产 API 不读取这些样本，也不使用样本金额作为完整性判断或故障回退。
