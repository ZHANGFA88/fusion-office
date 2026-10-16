# Fusion Office（融合办公室）

以 **grokbot-jev-dashboard 的虚拟交易办公室**为基座的个人情报与交易台：走进办公室就能看懂一支自主运行的智能体队伍在干什么、合不合规矩、账对不对。在此之上加了 A股/港股/美股**模拟交易台**（纸面下单、真实下单接口留口）与四个分室：行情、定投赛跑、机械蜘蛛、AI 安全。界面中英双语（默认中文），数据自带的葡语日志经模板翻译层转成当前语言显示。

构建规格见 [docs/SPEC-V2.md](docs/SPEC-V2.md)，grokbot 原仓研读笔记见 [STUDY.md](STUDY.md)。同系列另有钛金影院风版本：ZHANGFA88/fusion-dashboard。

## 分室

| 路由 | 内容 |
|---|---|
| `/`（app/index.html） | 办公室：像素办公室动画 + 8 位机器人格 + 余额/JEV 分析/thresholds 三面板（grokbot 原页改造：双语化 + 日志翻译层 + 顶栏分室导航 + 股票交易员状态条）。数据每 20 秒直连上游 `data` 分支 state.json，本机 `/api/office/state` 代理兜底 |
| `/app/trade.html` | 股票交易台：三市场模拟子账户（CNY/HKD/USD）、FinSight 行情与 K 线、市价/限价下单、持仓盈亏、工单账本 |
| `/app/markets.html` | 行情室：FinSight 指数、自选、板块、精选、快讯 |
| `/app/race.html` | 赛跑放映室：六大指数定投赛跑全片 + 终值条（组合 ¥2,746,664 / +353.24% / IRR 16.17%） |
| `/app/spider.html` | 蜘蛛工坊：prompt-spider-ui 舞台（本机 :4317）状态与内嵌 + MCP 工具清单 |
| `/app/safety.html` | AI 安全情报室：AISafetyHot-Hub 每日简报 + 每日 30 篇论文 |

## 运行

需要常开机器（办公室数据与行情为实时拉取）。

```bash
python3 scripts/serve.py            # 主服务，默认端口 8772（FINANCE_PORT 可改）
node modules/spider/server.mjs      # 蜘蛛舞台，端口 4317（可选）
```

- 行情与分析接口沿用 FinSight（`/api/finance/*`），办公室代理 `/api/office/state`，安全内容经 `/api/fusion/safety-file` 同源代理读取。
- 蜘蛛 MCP（可选）：`cd modules/spider/mcp && npm ci` 后按其 README 接入。
- 模拟交易数据存 `data/paper.db`（SQLite，运行时生成，不入库）；`data/finance.db` 为报价缓存种子。

## 模拟交易规则（PAPER）

- 下单走统一网关抽象 `OrderGateway`：当前实现 `PaperGateway`（纸面撮合）；`BrokerGateway` 为真实券商留口（未接入，调用返回未实现）。
- 市价单按 FinSight 最新报价即时成交；无报价拒绝成交（不伪造价格），缓存旧价成交会打 `stale_price` 标记。限价单挂单，读取账户/持仓/工单时检查触发。
- A股：买入 100 股整数手，T+1（当日买入不可卖）；佣金 0.025%（最低 ¥5），卖出印花税 0.05%。港股：佣金 0.03% + 约 0.0057% 征费。美股：0 费率。以上均为模拟参数，界面有明示。
- 初始虚拟资金：CNY 1,000,000 / HKD 1,000,000 / USD 100,000；交易台内可一键重置。

## 蜘蛛实时新闻模式

蜘蛛本来不抓任何东西——它是个「提示词可视化舞台」：默认只循环播放一段约 21 秒的预置演示（演示文本 + 本地规则分流，不联网、无模型调用）。接上自己的 Agent（MCP）后，它能把 Agent 实时上报的步骤/词语结成蛛网。

本仓内置喂入器把 FinSight 财经快讯接了进去：

- `node scripts/spider_news_feeder.mjs`（`bash scripts/run.sh` 会自动带起）：用蜘蛛自带的 SessionStore + PreviewHub 开一个**横屏（landscape）实时会话**，每 45 秒拉一次 `/api/finance/news`（东财/新浪双源），新标题按关键词分到三条分支——市场动态 / 公司行业 / 宏观政策——推成事件；点蛛网节点可看详情与原文链接。
- 会话地址（带进程令牌）写在 `data/spider-live.json`，主服务以 `/api/fusion/spider-live` 暴露心跳；蜘蛛分室优先加载实时会话，喂入器离线时自动回退到 :4317 的预置演示。
- 蜘蛛分室舞台下方另有「最新快讯」列表，标题即原文链接，可直接点开。
- 零第三方依赖：喂入器只用蜘蛛自带 lib 与 Node 内置模块，不需要给 mcp/ 跑 npm ci。

## 数据来源（多源互备）

- A股报价：新浪 → 东方财富 → 雪球 → 百度；港美报价：腾讯 → 新浪 → CNBC → Yahoo；加密/外汇：Yahoo。任一源无数据自动顺延下一源，全部无数据时用本地缓存旧值并打「旧价」标记，绝不伪造价格。
- 板块榜：东方财富 → 新浪行业/概念板块（新浪源无主力净流入与涨跌家数，相应字段为空）。
- 快讯：东方财富快讯 → 新浪财经滚动新闻。K线：东方财富 → 新浪 → Yahoo。
- 办公室数据：上游 grokbot `data` 分支 state.json 直连，本机 `/api/office/state` 代理兜底。

## 语言

- 界面字符串中英双语包（`app/assets/i18n.js`，办公室页因单文件架构内联同份词条，改词条需两处同步）。
- 葡语日志翻译层 `trLog()`：引擎日志为固定句式 + 变量，按模板正则翻译（实测对上游 250 条日志残留葡语为 0），未覆盖的新句式回退原文并加 `[原文]` 标记，不乱译。

## 来源与许可

- 办公室基座：Vazolini/grokbot-jev-dashboard（葡语 Degen Lab 纸面交易页，含其 `decisions.js` 与办公室插画）——**原仓无 LICENSE**，本仓默认私有，公开前请自行评估。
- 行情后端 FinSight finance-dashboard：用户自有项目。
- 机械蜘蛛：Kirito14IT/prompt-spider-ui，MIT（见 modules/spider/LICENSE）。
- AI 安全内容：wuyoscar/AISafetyHot-Hub，文字 CC BY-NC 4.0，页面内有署名。
- 定投赛跑：用户自有回测引擎与数据（modules/race）。
- 未入库的大文件：`modules/spider/docs/preview.gif`（8.7MB 预览动图）与 `modules/spider/docs/brand/` 品牌图片（非运行必需，需要时见上游仓库）。
