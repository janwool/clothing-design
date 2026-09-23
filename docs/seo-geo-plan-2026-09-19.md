# ClozDesign SEO / GEO 重规划

审阅日期：2026-09-19。基于已登录的 Google Search Console、Bing Webmaster Tools、GA4 报表和本地代码。本轮交付为规划，未修改线上页面、统计配置或索引设置。

## 1. 决策

把增长主线调整为「保住已有搜索入口，扩展已被 AI 引用的实操内容，用真实作品产出衡量效果」。当前不能再把 GEO 当成未来的小实验，也不能仅凭 AI 来源会话判定其商业价值。先修复统计，再按落地页和来源评价有效导出、注册激活与付费。

相比之前的产品增长方案，有四项修订：

- Dress Designer 升为第一批重点维护入口。Bing 已有实际点击和 AI 引用，不能仅因近期产品偏向 T 恤而弱化它。
- T 恤与 3D mockup 保持核心产品方向：工具页、经典模型详情和现有教程共同承接，避免只做首页。
- Polo、印花位置与真实感教程升为 GEO 重点。已有引用证据，比大规模新建泛服装文章更值得投入。
- Bulk、Oversized、POD 继续作为产品匹配假设，先验证能力与需求，不与已验证入口等量投入。裤装作为一个有曝光、无点击的独立实验。

## 2. 数据基线与限制

各平台默认日期不同，以下保留实际窗口，不直接相加或计算跨平台转化率。此次读取的是报表汇总与可见明细，未做全量历史导出或前后周期对比，不能据此宣称增长由某次改版造成。

| 来源与窗口 | 已观察值 | 解释 |
| --- | --- | --- |
| GSC Web，08-20～09-16，28 天 | 点击 179；曝光约 2,380；CTR 7.5%；平均排名 19.6 | 全站平均不能代替目标词排名 |
| GSC 生成式 AI Beta，同一 28 天 | 曝光 143；页面表 19 条 | 此报表展示曝光，不能当成点击或引用次数 |
| GSC 收录，界面更新 09-14 | 已收录 368；未收录约 1.2K | 未收录包含合理的重定向、canonical 与 noindex |
| GSC sitemap | Success；最后读取 09-13；发现 187 页 | 提交日期 07-23；当前没有提交失败证据，187不是全站已收录数 |
| Bing Search，08-20～09-18，30 天，All | 点击 126；曝光约 2,700；CTR 4.67% | 下方关键词与页面明细仅覆盖 Web，和 All 总计不一定一致 |
| Bing AI，08-20～09-18，30 天 | 总引用 403；Avg. Cited Pages 3 | 来源为 Microsoft Copilots and Partners；平均被引用页数不是总独立 URL 数 |
| GA4，08-22～09-18，28 天 | 会话 2,646；活跃用户 1,844；参与率 65.8%；平均参与 4m08s | 仍需过滤内部访问和核验采集 |
| GA4，同一窗口 | 关键事件 0；收入 $0 | 说明目前报表不能证明转化，不等于实际没有注册或收入 |

GA4 来源明细：

| Session source / medium | 会话 | 参与率 | 平均参与/会话 |
| --- | ---: | ---: | ---: |
| chatgpt.com / ai-assistant | 1,337（50.53%） | 74.20% | 3m21s |
| (direct) / (none) | 697 | 44.05% | 4m55s |
| google / organic | 314 | 70.70% | 5m07s |
| bing / organic | 123 | 84.55% | 5m35s |
| pinterest / organic-social | 78 | 70.51% | 2m57s |
| tagassistant.google.com / referral | 12 | 58.33% | 21s |

AI Assistant 渠道合计 1,340 会话（50.64%）。这些是 GA4 归因标签，不等于已逐条证实来自 ChatGPT 推荐；需核查 referrer、UTM、渠道规则、内部测试与会话异常。不能将其与 Bing 403 次引用做除法。Bing 的参与表现值得保留投入，但还不足以证明付费质量更高。

GA4 落地页：`(not set)` 678 会话（25.62%）；首页 666；3D 工具 163；T 恤工具 152；`/mockups` 134；basic-short-sleeve T 恤模型 113；Polo 工具 81；Dress Designer 77；Streetwear Hoodie 工具 53；Pricing 50。以上是所有来源，不是自然搜索单独表现。

### 搜索入口证据

| 页面/查询 | Google Web 点击/曝光（28天） | Bing Web 点击/曝光（30天） | 规划含义 |
| --- | --- | --- | --- |
| 首页 | 109 / 220 | 42 / 289 | 保留品牌和核心能力说明，入口直达实际工作流 |
| classic-crew-neck-t-shirt 模型详情 | 20 / 400 | 本次未记录 | Google 中优先优化的非首页入口，页面 CTR 5% |
| `/mockups` | 11 / 184 | 0 / 6 | 继续承担可浏览的资产集合 |
| `/tools/dress-designer` | 5 / 98 | 62 / 700 | 已验证双引擎入口，Bing CTR 8.86%、均位 5.55 |
| GLB clothing models 教程 | 5 / 37 | 2 / 3 | 保留技术教程与工具连接，样本小 |
| `/mockups/pants` | 本次未记录 | 0 / 879 | 高曝光零点击；均位 9.45，单独测试 |
| 查询 `cloz design` | 49 / 59 | 11 / 99 | 品牌词单独报告 |
| 查询 `3d pants` | 本次未记录 | 0 / 848 | 与裤装页面的需求错位待查 |

GSC 查询明细存在隐藏查询等限制；不能用 179−49 精确推算全部非品牌点击。长问题式查询不自动等于 AI 来源。已看到「free garment templates」「technical design workflows」「commercial-use assets」等需求，需核验产品是否真正支持下载、格式和授权。

### AI 已引用/展示内容

| 页面 | Bing AI 引用，30天 |
| --- | ---: |
| `/blog/how-to-make-realistic-t-shirt-mockups` | 96 |
| `/blog/polo-shirt-logo-placement-guide` | 81 |
| `/tools/dress-designer` | 62 |
| 首页 | 36 |
| 首页 `?lng=en` | 18 |
| `/blog/long-sleeve-shirt-print-placement-guide` | 16 |
| `/blog/free-3d-clothing-design-online` | 14 |
| Polo 工具、Hoodie placement 教程 | 各 11 |

Bing 页面/检索问题表属于样本，不要求明细之和等于总数。可见 grounding queries 包含 free clothing design websites with 3d models、dress designing app、clothing model、dress design；这些是检索上下文，不能视为完整用户原始提示词。

Google AI 28 天：首页 64 曝光；T 恤工具 25；tailored hoodie 模型 11；classic dress 模型 9；classic hoodie 模型 7。Google 和 Bing 的强项不同：Google 重点保留工具与模型事实；Bing 加强现有实操教程。不要套用“Google AI 无独立报表”的旧假设，此账号已可读取 Beta 报表。

## 3. P0：先恢复可决策的数据（第1周）

1. **核验并恢复标准 `page_view`。** 本地 `views/partials/header.ejs:12` 和错误页关闭 `send_page_view`；`public/js/analytics.js` 仅发 `<surface>_page_view`，本次在 public/views/lib 中未检索到显式标准事件。自定义功能事件继续保留，但不能替代 GA4 标准页面事件。实施时选择一个标准页面事件发送入口，每次有效页面加载只发一次，带正确 location/referrer。检查 GTM、增强型衡量、缓存版本及生产实际请求，避免重复。
2. `(not set)` 与上述实现相符，但尚未证明全部 678 会话都由这一原因造成。按日期、host、设备和事件版本拆分，并在 DebugView 验证新会话第一页面事件。检查会话超时后的交互及 consent 状态。Google 官方说明：会话没有 `page_view` 时落地页可能为 `(not set)`。
3. **建立可靠转化事实。** 保留现有细分事件，报表映射到编辑开始→自定义预览成功→保存→有效导出→真实注册→首次购买。注册以账号创建成功确认，不能以离开认证页代替；支付以验签成功、交易 ID 去重的事实确认。功能点击不标为最终转化。错误、续费、退款单列。
4. **校验 AI 归因。** 保留原始 session source/medium、landing page 与必要的非敏感来源字段；复查 `ai-assistant` 来源的 UTM 与渠道归类，排除自测链接。单独标识 localhost、预览域、Tag Assistant、团队调试，先测试过滤再应用。不能按国家批量判定机器人。
5. 输出来源×落地页×设备漏斗，按独立用户或会话固定分母。当前代码中的新功能事件与 GA4 近7天仍可见的旧泛事件应按上线日期分段，不能直接拼接比较。

验收：受控新会话能正确显示落地页；刷新/跳转不重复计数；每个注册/购买/导出测试与业务事实一致；新增数据的 `(not set)` 比例持续下降。内部目标可先定低于 5%，这是诊断目标而非行业标准；历史缺失不会被修复自动补齐。

## 4. P0：收录与旧 URL 治理（第1～2周）

GSC 原因：404 503；重定向 324；正确 canonical 替代页 211；noindex 15；5xx 2；其他4xx 1；soft404 1；已抓取未收录 107；Google 选不同 canonical 8；已发现未收录 28。本次只记录了可见十项，不能据此称已审完全部原因。

404 样本含 `/mockups/jumpsuit`、`/mockups/dresses-skirts`、`/mockups/jackets-coats`、`/mockups/hats`、旧 mockup 详情、`/templates`、`/dashboard` 和旧 ZPRJ 下载路径。先做「旧 URL→业务状态→精确替代 URL→是否有内链/曝光」映射：

- 有同等内容替代：单跳永久重定向到准确目标，同时更新内链与 sitemap。
- 仍有效但意外丢失：恢复内容/资源，特别是有搜索点击或用户下载承诺的地址。
- 永久下架且无替代：保留正确 404/410，并清除内链和 sitemap；不全部跳首页。
- 私人 dashboard、登录与测试页：按产品访问逻辑与 noindex 策略处理，不以收录为目标。
- 先定位 2 个 5xx、1 个异常4xx、1 个 soft404；对 8 个 canonical 冲突检查原始 HTML、最终地址、内链和 sitemap 一致性。
- 107 个已抓取未收录先抽查核心资产与有曝光页面：独特内容、真实可用模型、重复参数、质量与渲染；不要为了收录给每个模型机械补字数。

现有 `lib/seo-priority.js` 允许「有图+有模型+优先品类」达到 5 分，即可能不需要独特描述就通过。新收录门槛应加入可用性、分类正确、真实封面和独特信息；不能把字数分数当质量证明。默认 sitemap 模型上限 180，需确认不会挤掉已获搜索/AI流量的有效页面。

`lib/url-policy.js` 已有 www/HTTPS/尾斜线规范及去查询参数 canonical。复查 `?lng=en` 等地址与语言内容是否一致，不在未经确认的多语言策略上批量重定向。生成器给静态页使用运行当日 lastmod，改为真实内容更新时间。sitemap 只列可索引 canonical 200 页面；更新后检查两站长平台处理结果。IndexNow 用于真实新增/变更/删除 URL 通知，不承诺收录。

本次外部 Python HTTP 抽查大部分返回 403，一项 TLS EOF；这只证明当前请求环境的结果，不能直接证明 Googlebot/Bingbot 被拦。需结合站长平台 Live Test 和 CDN/WAF 日志确认，不因此关闭安全保护。

## 5. 第一批页面清单（第2～4周）

| 优先级 | 页面/集群 | 具体修改 | 衡量 |
| --- | --- | --- | --- |
| P1 | Dress Designer + 现有 dress 教程 | 保留 URL；首屏直达可用 dress 模型；展示真实作品、操作步骤、免费范围、导出和能力边界 | Bing 点击、进入编辑器、有效导出；保护已有引用 |
| P1 | T-shirt 工具 + classic crew-neck 详情 | 模型详情到编辑器一步；真实正背面样例；上传/颜色/输出说明；标题突出模型类型与真实可用功能 | Google 页面 CTR、非品牌点击、有效预览 |
| P1 | 3D clothing 工具 + `/mockups` | 分清「制作展示图」「浏览/下载资产」意图；解释实际支持格式与授权；指向相关模型 | 来源分组后的完成率 |
| P1 | realistic T-shirt、Polo placement 两篇 | 保留原 URL 和有效答案；补第一手图示、测试条件、适用版型、失败例子；关联对应工具/模板 | Bing 引用、教程→工具会话、有效导出 |
| P2 | `/mockups/pants` | 先核对 SERP 和用户是要3D素材还是在线mockup；按实际供给改标题摘要、首屏分类和预览 | Bing 当前 879曝光/0点击基线，28天观察 |
| P2 | Long sleeve / Hoodie placement | 增补经过产品验证的袖子/背面位置图和使用入口，保持独立问题边界 | 引用、工具使用、回访 |

标题草案（上线前与真实内容核对）：Dress Designer — Design a Dress Online in 3D；Classic Crew-Neck T-Shirt 3D Model & Mockup；3D Pants Models for Apparel Mockups。只有确有下载入口和相应权益时才加入 Download/Free 等承诺。不要同时改标题、URL、主内容和注册门槛，以便解释变化。

每个工具页提供一个可启动实例、一组实际输出、支持与不支持的能力、免费/付费区别、下一步入口。教程在相关步骤旁提供能承接同一任务的链接；暂未实现预选或跨编辑器同步时，不能假装“一键继续”。保留现有博客的页脚、相关内容与上下文内链，不必为了 GEO 把 Guides 强行加回主导航。

## 6. GEO 内容与实体规划

围绕已经出现的需求建立四个可验证主题：

1. 真实 T 恤 mockup：同一印花在颜色、光照、角度上的实际结果，解释为何像贴纸、为何边缘失真。
2. 印花/Logo 位置：胸前、Polo、袖子、背面；标明测量基准、版型和实际样例。建议尺寸不是所有成衣都适用的生产标准。
3. 在线 Dress Design：说明现有设计调整范围，区分视觉预览与制版/合体模拟，不迎合不支持的“上传草图自动成衣”需求。
4. 3D 文件与使用权：真实格式、UV、兼容范围、是否含源文件、商用许可和再分发边界；先核实权利与下载能力，再承接 commercial-use/free assets 查询。

文章采用读者容易理解的直接答案、步骤、图示和事实表；不是机械拼 FAQ 或按每个问题建一页。标明实际作者/审核者、更新日期和一手测试条件。结构化数据匹配可见内容，保留合适的 WebPage/Breadcrumb/Article 等；不伪造评分、评价或不存在的功能。

统一 ClozDesign 品牌名称、首页/关于/定价/许可的事实。不要为了统一品牌立即删除带来搜索的历史内容；先核对旧 ClothingDesign 名称与迁移关系。

Google 官方当前明确 SEO 基础同样适用于生成式搜索，强调有价值的独特内容，并不使用 llms.txt 提升其搜索可见性。因此该文件不列首月重点；不承诺特殊 schema、固定答案字数或 FAQ 必然带来引用。Google AI 曝光、Bing 引用、GA4 AI 会话和业务转化分别报告，不合成一个“GEO分数”。

## 7. 30/60/90 天安排与资源

首月建议工时：40% 统计和技术治理；35% 已有工具/模型入口；25% 已被引用教程。完成数据验收后再调整；这是执行分配，不是投放预算。

| 时间 | 交付 | 验收/决策 |
| --- | --- | --- |
| 第1周 | page_view 与关键转化审计；AI归因检查；冻结基线；列出异常 URL | 测试会话完整；真实业务事实可对账；不误把报表0当业务0 |
| 第2周 | 核心旧URL映射、异常响应、canonical、sitemap修正 | 目标页可访问/可索引；无无关首页跳转；Live Test通过 |
| 第3～4周 | Dress、T恤/3D入口和两篇主教程优化；裤装单页实验 | URL稳定；真实样例/入口可用；记录发布日期 |
| 第5～8周 | 扩展Long sleeve/Hoodie，补格式与许可说明，按结果改落地页 | 以来源×页面的有效导出、激活和付费决定扩展 |
| 第9～12周 | 扩大有效集群；验证Oversized/POD/Bulk | 无真实功能或无合格行为的方向不批量建页 |

每周固定检查：核心页技术错误；品牌/非品牌搜索点击；Google AI曝光；Bing引用与引用URL；AI来源有效导出；注册7日激活；付款与退款。每28天用相同日期、过滤条件做环比，并标注各平台时区/数据延迟。搜索点击与GA4会话不是同一个口径。

第一阶段目标是数据可用和核心任务可完成；未拿到可信转化基线前，不承诺流量翻倍、排名前3或付费增长。30天后优先扩大「有合格流量且有有效产出」的页面；曝光无点击先查意图/摘要，点击无预览先查承接，预览无导出先查功能/体验，引用增加无访问不直接判失败，也不算收入成功。

## 8. 证据入口

后台需当前账号访问，数据会随日期变化：

- [Google Web 表现](https://search.google.com/search-console/performance/search-analytics?resource_id=sc-domain%3Acloz-design.com&num_of_days=28)
- [Google AI 表现](https://search.google.com/search-console/performance/search-analytics/ai?resource_id=sc-domain%3Acloz-design.com&num_of_days=28)
- [Google 收录](https://search.google.com/search-console/index?resource_id=sc-domain%3Acloz-design.com)
- [Bing Search](https://www.bing.com/webmasters/searchperf?siteUrl=https%3A%2F%2Fcloz-design.com%2F)
- [Bing AI](https://www.bing.com/webmasters/aiperformance?siteUrl=https%3A%2F%2Fcloz-design.com%2F)
- [GA4](https://analytics.google.com/analytics/web/#/a401272897p545758914/reports/intelligenthome)

官方资料（本次查阅）：

- [Google 生成式搜索优化指南](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
- [GA4 `(not set)` 解释](https://support.google.com/analytics/answer/13504892?hl=en-EN)
- [Bing AI Performance 说明](https://www.bing.com/webmasters/help/ai-performance-9f8e7d6c)
- [IndexNow FAQ](https://www.indexnow.org/faq)

待补证据：生产标准page_view请求、渠道归因规则、完整日期对齐的查询/页面导出、内部流量过滤、真实注册/订单对账、全量旧URL映射、WAF日志与爬虫实时测试。以上不会阻止先推进已经有证据支持的入口维护，但会影响增长效果判断。
