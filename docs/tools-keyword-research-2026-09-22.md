# Tools 关键词与搜索意图研究

审阅日期：2026-09-22。

本研究用于重建 ClozDesign 的 Tools 内容体系。结论结合了三类证据：站内 2026-09-19 的 GSC、Bing Webmaster Tools 和 GA4 基线；当前产品代码与可用能力；以及 2026-09-22 对英文搜索结果和竞争页面的联网抽查。

本文件重点处理现有页面的关键词边界和质量。超出现有 URL 的新增工具、品类和工作流机会，见 [`tools-seo-opportunity-discovery-2026-09-22.md`](./tools-seo-opportunity-discovery-2026-09-22.md)。

这不是带精确月搜索量的付费关键词库导出。优先级中的“高、中、低”表示证据和产品匹配程度，不表示具体搜索量。上线前应再从 GSC 导出完整查询，并在可用时用 Google Keyword Planner 或同类数据库补充地区、语言、月搜索量和 CPC。

## 结论

Tools 不应按所有可能的服装关键词无限扩页。深度复核后，第一阶段应把 5 个页面作为稳定核心，4 个页面设为“通过功能验收后再强化”，另保留 `/tools` 作为目录页。Bulk、POD、On-model 和 Virtual Try-on 暂不作为核心 SEO 工具页扩张，因为用户对这些词的功能期待与当前能力存在明显差距。

页面是否值得独立索引，采用三项判断：

1. **第一方需求**：GSC、Bing 或 GA4 已出现查询、曝光、点击或有效落地访问；
2. **独立搜索意图**：结果页中的任务、页面类型和用户问题与相邻词明显不同；
3. **产品兑现能力**：用户可以在当前页面真正完成标题和正文承诺的操作。

同时满足三项的页面进入稳定核心；满足两项的进入验证队列；只满足一项的保留为研究假设，不直接扩页。

### 建议页面清单

| 优先级 | 建议 URL | 主关键词 | 同页覆盖的次级词 | 决策 |
| --- | --- | --- | --- | --- |
| P0 | `/tools/dress-designer` | online dress designer | design a dress online, 3D dress designer, dress design tool online | 保留独立页并优先优化。已有 Google/Bing 点击和 Bing AI 引用，当前 3D dress 工作流可承接。 |
| P0 | `/tools/t-shirt-mockup-generator` | t-shirt mockup generator | free t-shirt mockup generator, 3D t-shirt mockup, upload design on shirt, t-shirt mockup online | 保留为核心页。泛词竞争强，但站内已有工具、模型详情和 Google AI 曝光。 |
| P0 | `/tools/3d-clothing-mockup-generator` | 3D clothing mockup generator | 3D apparel mockup generator, 3D garment mockup, clothing mockup online | 保留为跨品类工具页，突出可旋转 3D、换色、上传图案和透明 PNG。 |
| P0 | `/tools/polo-shirt-mockup-generator` | polo shirt mockup generator | polo logo mockup, polo shirt logo placement, uniform polo mockup | 保留独立页。站内落地访问和 Polo placement AI 引用已有证据；内容应围绕左胸 Logo、领口/门襟与刺绣限制。 |
| P1 | `/tools/hoodie-mockup-generator` | hoodie mockup generator | 3D hoodie mockup, hoodie design mockup, front and back hoodie mockup | 保留独立页。SERP 工具意图明确，需展示胸前、背面、帽子与袋鼠袋对印花区域的影响。 |
| 验证 | `/tools/front-and-back-t-shirt-mockup` | front and back t-shirt mockup | t-shirt mockup front and back, back print mockup, two-sided shirt mockup | 只有在同一流程支持正背面分别上传、定位和导出时，才升级为核心页。当前落地页只有一个上传入口，需先做功能验收。 |
| 验证 | `/tools/long-sleeve-shirt-mockup-generator` | long sleeve shirt mockup generator | long sleeve mockup, sleeve print mockup, long sleeve logo placement | SERP 意图成立；需验证袖子能独立放图并展示袖缝、方向和有效印区，不能只使用长袖模型。 |
| 验证 | `/tools/oversized-t-shirt-mockup-generator` | oversized t-shirt mockup generator | oversized tee mockup, heavyweight t-shirt mockup, streetwear t-shirt mockup | 需使用真实 oversized 模型，并用 boxy、drop shoulder、宽袖和印花比例形成独特内容。 |
| 验证 | `/tools/streetwear-hoodie-mockup-generator` | streetwear hoodie mockup generator | oversized hoodie mockup, back print hoodie mockup | GA4 已有 53 次落地会话，不能未经 URL 级查询复核就撤页；先保留 URL，再判断是独立优化还是并入 Hoodie。 |
| Hub | `/tools` | clothing mockup tools / clothing design tools online | apparel mockup tools, free clothing design tools | 作为目录与选择页，不和具体生成器争同一关键词。按任务和服装类型链接全部核心页。 |

### 暂缓或合并的页面

| 当前/候选方向 | 处理建议 | 原因 |
| --- | --- | --- |
| Streetwear Hoodie Mockup Generator | 暂时保留，先补 URL 级 GSC/Bing 查询和转化数据 | 已有 53 次 GA4 落地会话。与 Hoodie/Oversized 有重叠风险，但现阶段直接 noindex 或重定向可能损失已有入口。 |
| Transparent Apparel Mockup Generator | 先作为 3D Clothing 页的重要输出模块；是否独立以 GSC 查询验证 | “transparent PNG”更多表现为输出属性。若保留独立页，必须展示透明导出、边缘质量及多品类实际文件。 |
| Bulk T-Shirt Mockup Generator | 暂不重点推广；真实批量功能完成后再索引 | 当前页面导出固定示例图。SERP 中 bulk 通常意味着一次上传后生成大量颜色、blank、场景或 SKU，并支持批量下载。 |
| Print-on-Demand Mockup Generator | 改为教程/解决方案页，或等供应商 blank 工作流上线 | 该词的结果页强调 Etsy/Shopify、Printful/Printify、精确 blank 颜色、批量和刊登工作流，普通 3D 预览承接不足。 |
| On-model Clothing Mockup Generator | 等真人生成能力稳定后再建独立页 | 当前 SERP 将其理解为把真实服装或 flat lay 生成真人模特商品图，可选择模特、姿势和场景。它不是普通 3D 人台预览。 |
| AI Virtual Try-On | 放在独立产品体系，不归入 mockup 工具集群 | 搜索者通常希望上传人物照和服装图看穿着效果，意图和为商品创建 mockup 不同。 |
| 3D Clothing Models / GLB Downloads | 由 `/mockups` 和模型详情页承接 | “models/download/GLB”是资产下载意图，不是在线生成器意图。工具页负责制作结果，模型库负责浏览、格式和授权。 |

## 证据等级与当前数据

### 第一方基线

现有站内数据比第三方免费关键词估算更适合决定 ClozDesign 的近期顺序：

| 信号 | 已知数据 | 含义 |
| --- | --- | --- |
| GSC，28 天 | 179 点击，约 2,380 曝光，CTR 7.5%，平均排名 19.6 | 已经有自然搜索基础，但大量词仍在第二页附近；优先优化已有曝光页通常比无依据扩页更快。 |
| Bing，30 天 | 126 点击，约 2,700 曝光 | Bing 已能提供可观验证样本。 |
| Bing AI | 403 次引用 | 结构清楚、答案明确的服装内容已进入 AI 引用场景。 |
| GA4，28 天 | 2,646 sessions | 可将搜索曝光与真实工具使用连接，而不只看排名。 |
| Dress Tool | Google 5/98；Bing 62/700；Bing CTR 8.86%，平均排名 5.55；Bing AI 62 次引用 | 当前证据最完整的品类工具页，应先深化而非改 URL。 |
| T-shirt Tool | 152 次落地会话；Google AI 25 次曝光 | 核心页成立，但需要把泛词与子意图边界重新划清。 |
| 3D Tool | 163 次落地会话 | 跨品类工具页有使用基础。 |
| Polo Tool | 81 次落地会话；Polo placement 内容获 81 次 Bing AI 引用 | Polo 的工具与知识内容可以组成明确主题集群。 |
| Streetwear Hoodie | 53 次落地会话 | 不能仅因内容重叠就立即撤页，需先查来源与行为。 |
| `/mockups/pants` | Bing 0/879；`3d pants` 0/848 | 存在需求信号，但当前页面类型或摘要与查询不匹配，是修复意图映射的候选。 |

证据等级定义：

- **A 级**：第一方数据、独立 SERP 意图、真实产品能力三者同时成立；
- **B 级**：三者中有两项成立，需要补查询或功能验证；
- **C 级**：只有竞争页面或逻辑推演支持，不能据此批量建页。

当前 Dress、T-shirt、3D Clothing、Polo 属于 A 级；Hoodie 接近 A 级但需要更细的页面级数据；Front & Back、Long Sleeve、Oversized、Streetwear Hoodie 属于 B 级；Bulk、POD、On-model 和 Virtual Try-on 当前属于 C 级或产品不匹配。

## 现有页面审计：主要问题不是缺页，而是页面区分度不足

代码复核显示，现有工具变体页使用同一套模板，并继承大量基础页内容。变体目前只替换有限的标题、简介、关键词和一个展示项，后面的竞品洞察、操作步骤和 FAQ 大量共用。搜索引擎看到的会是多个主体高度相似的 URL，而不是多个解决不同任务的工具。

还存在三类边界冲突：

- T-shirt 核心页同时覆盖 `front and back`、`oversized`、Polo 和 Long Sleeve 等子意图，会和现有变体页争同一批查询；
- Hoodie 页覆盖 sweatshirt 词。如果以后建立 Sweatshirt 页，应把 sweatshirt 从 Hoodie 的主目标中移出；
- Tools 页面与 `/mockups` 模型页没有明确分工，generator、model、download、GLB 等词容易互相混用。

建议建立固定归属：

| 搜索意图 | 唯一主页面 | 其他页面如何处理 |
| --- | --- | --- |
| generic t-shirt mockup generator | `/tools/t-shirt-mockup-generator` | 子页只在相关段落中被链接，不再让核心页堆叠所有子词。 |
| front and back / oversized / long sleeve | 各自通过验收的任务页 | 核心 T-shirt 页写简短入口和差异，不重复完整答案。 |
| 3D clothing/apparel generator | `/tools/3d-clothing-mockup-generator` | 各品类页强调服装特有问题。 |
| model / GLB / download / asset | `/mockups` 与模型详情页 | Tools 页避免把自己描述成 3D 模型下载库。 |
| how to / placement / size / comparison | 文章页 | 文章回答问题并把用户导向工具；工具页聚焦执行。 |
| dress design online | `/tools/dress-designer` | Dress 教程承接灵感、方法与比较，不复制工具首屏。 |

## 功能承诺验收门槛

任何页面在进入核心索引前，都要用真实用户文件完成一次端到端验收：

| 页面 | 必须通过的验收 | 未通过时的处理 |
| --- | --- | --- |
| Front & Back | 正面和背面可分别上传两份图、分别定位，并能得到匹配的两面输出 | 保留为产品入口或并回 T-shirt，不以 two-sided 为核心 SEO 承诺。 |
| Long Sleeve | 袖子有独立设计区域，方向和边界正确，转动后可检查袖缝 | 只写 long-sleeve garment preview，不写 sleeve print placement。 |
| Oversized | 使用真实 oversized/heavyweight 模型，轮廓和普通 Tee 可见不同 | 并入 T-shirt 的模型选择模块。 |
| Transparent | 下载文件含真实 alpha 通道，边缘无白边，像素尺寸可说明 | 作为 3D Clothing 的功能段落，不建立独立页。 |
| Bulk | 用户自己的设计可生成多颜色、多个商品或场景，并一次性下载 | 暂停索引和推广；当前固定示例图导出不符合 bulk。 |
| POD | blank、颜色、印区和导出能对应真实上架工作流 | 先做教程/解决方案页，不称为 POD generator。 |

“免费”“无水印”“无需注册”“4K”“商用”等词也必须逐项在导出端核验，并在页面写出具体边界。Google 明确建议页面内容以帮助用户为目的，并在标题、主标题、链接文字和图片替代文本中使用用户会搜索的词；重复堆放 `meta keywords` 不会产生排名价值。参考：[Google Search Essentials](https://developers.google.com/search/docs/essentials)、[Google 支持的 meta 标签](https://developers.google.com/search/docs/crawling-indexing/special-tags)、[Google 不使用 keywords meta 标签](https://developers.google.com/search/blog/2009/09/google-does-not-use-keywords-meta-tag)。

## 新品类机会队列

深度 SERP 抽查显示，下一轮机会不应继续从相同 T-shirt 修饰词里拆页，而应优先测试有独立服装形态、且站内已有模型资产的品类。

| 顺序 | 候选页 | 当前证据 | 上线条件 |
| --- | --- | --- | --- |
| 1 | Sweatshirt Mockup Generator | 搜索结果中已有独立生成器和模板生态；站内有 crewneck sweatshirt 资产；与 Hoodie 的帽子、袋鼠袋和印区不同 | 补 GSC/Bing 查询；准备 crewneck 特有样例；从 Hoodie 中移出 sweatshirt 主词。 |
| 2 | Sweatpants / Joggers Mockup Generator | Kittl、Mock It、MockupLabs 等有独立结果；站内已有 jogger/pants 模型；`3d pants` 已有 848 次 Bing 曝光 | 先判断现有 `/mockups/pants` 的查询和 CTR 问题，再决定建工具页还是优化集合页。 |
| 3 | Jacket Mockup Generator | 竞争结果存在，站内夹克模型库存较丰富，产品匹配度高 | 需要第一方查询证据，并选定 bomber、varsity、zip jacket 等主模型，避免一页混合过宽。 |
| 4 | Shorts Mockup Generator | 有独立 SERP 和站内模型 | 等前三类验证后再做，先看是否有自然曝光。 |
| 5 | Jersey Mockup Generator | 搜索者对球队配色、号码、姓名和正背面有独特需求 | 只有号码/姓名/两面工作流成熟后才值得建立。 |
| 暂缓 | Leggings Mockup Generator | 有素材需求，但本轮 SERP 的在线工具信号较弱 | 先留在模型库，等待第一方查询证据。 |

参考竞争页面：[FreeMockup Sweatshirt](https://freemockup.app/sweatshirt-mockup-generator/)、[Mock It Sweatpants](https://mock-it.co/mockups/sweatpants/)、[Kittl Sweatpants](https://www.kittl.com/tools/mockups/sweatpants)、[Dynamic Mockups Jacket](https://dynamicmockups.com/mockup-generator/jacket/)、[Dynamic Mockups Shorts](https://dynamicmockups.com/mockup-generator/shorts/)、[Fotor Jersey](https://www.fotor.com/design/jersey-mockup-generator/)。这些页面用于验证结果类型和功能预期，不代表其公开的营销数字已经独立审计。

## 关键词意图地图

### 1. 核心生成器词

`[garment] mockup generator` 是最清楚的工具意图。结果页通常直接提供上传图案、换色、定位和导出。T-shirt、Hoodie、Polo、Long Sleeve、Oversized 都适合使用这个结构。

搜索结果中的共同要求：

- 首屏即展示可操作工具或明确的 Start 按钮；
- 支持 PNG/JPG，透明 PNG 通常被建议为最佳输入；
- 调整图案位置、尺寸和服装颜色；
- 明确下载格式、分辨率、水印、注册和商用范围；
- 用真实结果说明 flat lay、hanger、on-model、front/back 等输出差异。

### 2. 3D 词群

`3D clothing mockup generator`、`3D apparel mockup generator` 和 `3D garment mockup` 的搜索者期待旋转、缩放、实时换色、多角度及高分辨率导出。House of Esse、Fayr3D、3DMocker 和 Pacdora 都把实时 3D 与导出作为核心承诺。

ClozDesign 与该意图匹配较好，但必须清楚区分：

- 视觉 mockup 与生产级 CAD/版型模拟；
- 在线预览与可下载 3D 源文件；
- 透明 PNG、静态图片、视频和 GLB 等不同输出。

### 3. Designer / Maker 词群

`online dress designer` 与 `clothing designer online` 比 mockup generator 更宽，可能包括换廓形、面料、结构、纸样甚至定制服装。Dress 页可以承接颜色、图案和 3D 预览，但应明确不提供的打版、合体和自动成衣能力。

`t-shirt designer` 还常带有定制下单意图。若页面不能购买印制成衣，不应把该词作为 T-shirt mockup 页唯一主词。

### 4. Mockup 单数/复数与模板词

`t-shirt mockup`、`hoodie mockup` 等无 generator 的泛词混合了在线工具、PSD 下载、图片素材和模板库。单个生成器页可以覆盖，但必须用标题和首屏说明是 online generator。模板或资产浏览应由独立集合页承接，避免工具页和素材页互相抢意图。

### 5. 结果与工作流修饰词

以下修饰词有真实需求，但只能在能力成立时使用：

| 修饰词 | 用户实际期待 |
| --- | --- |
| free | 能实际完成核心流程；需说明水印、注册、次数和分辨率限制 |
| online / no Photoshop | 浏览器完成上传、调整和导出 |
| upload design / upload logo | 用户自己的文件真正进入最终结果 |
| front and back | 两面可分别放图并形成匹配输出 |
| transparent background / PNG | 下载文件确实含 alpha，而非白底 JPG |
| realistic / photorealistic | 图案随褶皱、纹理、光影和透视变化，不是平面贴图感 |
| high resolution / 4K | 有可核验的像素尺寸 |
| commercial use | 有清晰授权条款 |
| no signup / no watermark | 导出环节确实不要求登录、结果确实无水印 |
| bulk | 多颜色、多设计、多场景或多 SKU 自动处理，并有批量下载 |
| POD | 与商品 blank、供应商颜色、印区、商城图片或刊登工作流匹配 |
| on model | 真人或逼真人体模特商品图，而非悬空服装模型 |

## SERP 与竞争格局

### 泛工具平台

- [Canva Hoodie Mockup Generator](https://www.canva.com/create/hoodie-mockups/) 用拖放编辑、免费素材、跨设备和免拍摄来承接入门用户。
- [Pacdora Mockup Generator](https://www.pacdora.com/tools/mockup-generator) 以 5000+ mockups、3D 调整、4K PNG/JPG/MP4 和大量品类页构成规模优势。
- [Kittl Print-on-Demand](https://www.kittl.com/for/print-on-demand) 把设计、print size、跨产品变体和批量导出连成 POD 工作流。

泛词上 ClozDesign 不适合比拼模板总数，应强调服装专属的实时 3D、真实可用模型和透明商品图输出。

### 轻量免费工具

- [FreeMockup Hoodie Generator](https://freemockup.app/hoodie-mockup-generator/) 强调无需注册、无水印、浏览器本地处理以及明确的免费/高清导出边界。
- [TeeMockup Long Sleeve Generator](https://freeteemockup.com/long-sleeve-mockup-generator) 用简单的上传、定位、下载流程承接长尾服装词。
- [Kitmul T-Shirt Mockup](https://kitmul.com/en/image-design/tshirt-mockup) 把 WebGL 旋转、换色、PNG 导出和本地处理写进页面核心说明。

这类站点说明长尾工具页仍有机会，但页面必须真的可用，且免费、隐私、导出规格要写清楚。

### 3D 专项竞争者

- [House of Esse](https://houseofesse.com/) 同时覆盖 2D 模板、3D mockup、服装设计和 AI，承诺实时 3D 与高分辨率透明输出。
- [Fayr3D](https://www.fayr3d.com/) 聚焦拖放 Logo、纹理、实时颜色和 4K 导出。
- [3DMocker Apparel](https://3dmocker.com/mockups/apparel) 将 T-shirt、Hoodie、Polo、Oversized、Long Sleeve 等全部放在同一 3D apparel 集合中。

这些结果验证了“跨品类 3D hub + 少量强品类页”的结构，比大量近似页面更稳妥。

### 高门槛工作流

- [MockupBulk](https://www.mockupbulk.com/) 的 bulk 含一次设计生成大量颜色、多个印花位置和供应商 blank。
- [Mock It Long Sleeve](https://mock-it.co/mockups/long-sleeve/) 强调真实 blank 品牌、供应商颜色、多个一致视角和商品目录批量制作。
- [Dynamic Mockups Polo](https://dynamicmockups.com/mockup-generator/polo-shirt/) 将 AI 场景、批量生成、API 和电商集成放进同一产品承诺。
- [clothink](https://clothink.ai/features/visualise) 的 on-model 工作流从服装草图生成真人、产品图、多角度和场景。

这些页面说明 Bulk、POD 和 On-model 不是普通 mockup 页加一段文案就能承接的关键词。

## 页面内容模板

所有核心工具页共享骨架，但主体内容必须围绕独立任务写作：

1. H1：一个主关键词加真实差异，例如 `Free 3D Polo Shirt Mockup Generator`。
2. 首屏：真实可操作实例、输入格式、核心操作和输出格式。
3. 实际输出：至少展示用户自己的图案在 2～4 个视角或颜色中的结果。
4. 服装特有问题：如 Polo 门襟、Hoodie 袋鼠袋、Long Sleeve 袖缝、Oversized 图案比例。
5. 三步流程：选择真实模型、上传与调整、导出。
6. 能力表：支持、不支持、免费边界、尺寸、格式和授权。
7. 针对该任务的 FAQ，不批量复制泛 FAQ。
8. 相关入口：同品类模型、一个相邻工具和一个具体教程。

### 核心页关键词简报

| 页面 | 主任务词 | 可以自然覆盖 | 必须回答的用户问题 | 不应争抢的词 |
| --- | --- | --- | --- | --- |
| Dress Designer | online dress designer | design a dress online, 3D dress designer, dress design tool online, upload pattern to dress | 能改什么；能否上传自己的图案；能看哪些角度；输出什么；是否提供纸样或生产文件 | dress pattern maker、fashion CAD、custom dress order，除非相应能力存在 |
| T-shirt | t-shirt mockup generator | free/online/3D t-shirt mockup, upload design on shirt, shirt color mockup | 支持哪些图；怎么缩放定位；深色面料效果；输出尺寸；是否水印 | oversized、front and back、long sleeve 的完整内容；POD supplier workflow |
| 3D Clothing | 3D clothing mockup generator | 3D apparel mockup generator, 3D garment mockup, clothing mockup online | 可选哪些服装；是否实时旋转；颜色和图案如何更新；透明输出；是否下载 3D 文件 | CLO/Marvelous Designer 类纸样模拟和服装工程能力 |
| Polo | polo shirt mockup generator | polo logo mockup, polo shirt logo placement, embroidered polo preview, uniform polo mockup | 左胸安全区；Logo 与门襟/领口距离；刺绣细节限制；正背面；团队制服配色 | 普通 T-shirt 泛词 |
| Hoodie | hoodie mockup generator | 3D hoodie mockup, pullover hoodie mockup, hoodie logo mockup | 袋鼠袋如何影响印花；帽绳遮挡；背印；深色 hoodie；拉链款是否支持 | crewneck sweatshirt；streetwear/oversized 的完整内容，除非决定合并 |
| Front & Back | front and back t-shirt mockup | two-sided shirt mockup, back print mockup, front back shirt design | 两面能否分别上传；如何保持尺寸一致；是否一次导出两张；正背图是否来自同一 garment/color | generic t-shirt generator |
| Long Sleeve | long sleeve shirt mockup generator | sleeve print mockup, long sleeve logo placement, long sleeve tee mockup | 袖子能否独立放图；印花方向；袖缝边界；左右袖；胸前与袖子如何组合 | generic t-shirt generator |
| Oversized | oversized t-shirt mockup generator | oversized tee, heavyweight t-shirt, boxy t-shirt, drop shoulder mockup | 与普通 Tee 的轮廓差异；印花相对比例；落肩/宽袖；街头服饰正背展示 | generic t-shirt generator |

关键词应进入可读正文和界面说明，而不是做同义词罗列。每页只选一个主任务，次级词用于回答真实问题。搜索摘要通常从可见正文抽取，所以首屏下方第一段要用具体句子说明输入、操作、输出和限制。

### 页面独特内容资产

为了让页面差异不只存在于 `<title>`，每个核心页至少需要以下独有资产：

- 1 个该服装的可操作 3D 默认模型；
- 3 个来自该工具真实导出的结果，覆盖不同颜色或视角；
- 1 张印花区域或避让位置示意图；
- 1 个该服装特有的能力/限制表；
- 4～6 个不与其他页复制的 FAQ；
- 1 篇对应知识文章，例如 Polo 左胸位置、Hoodie 袋鼠袋避让或 Oversized 印花比例。

结构化数据只能描述页面上用户真实可见的工具和能力。可继续使用 `SoftwareApplication`，但它不会保证富媒体结果，也不能替代独特正文。参考：[Google Software app structured data](https://developers.google.com/search/docs/appearance/structured-data/software-app)、[Structured data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)。

Google 建议标题简洁且准确描述页面，避免重复模板标题和关键词堆砌；站点结构主要通过可抓取的内部链接表达页面重要性。相似页面如果主体内容近似，Google 可能将其聚类并选择一个 canonical。因此，独立 URL 必须对应真正不同的模型、操作、样例和问题，而不是只换服装名。

参考：[Google title link 指南](https://developers.google.com/search/docs/appearance/title-link)、[站点结构指南](https://developers.google.com/search/docs/specialty/ecommerce/help-google-understand-your-ecommerce-site-structure)、[Canonical 说明](https://developers.google.com/search/docs/crawling-indexing/canonicalization)。

## 建议执行顺序

1. 保留全部现有 URL，先导出完整 GSC 查询/页面数据，避免误删已有入口；单独核查 Streetwear Hoodie 的来源、查询和转化。
2. 对全部工具做功能验收，删除或改写无法兑现的承诺；Bulk 固定示例图导出是当前最高风险项。
3. 第一轮重写 Dress、T-shirt、3D Clothing 和 Polo，记录发布日期和基线；同时从 T-shirt 核心页移出子页的主关键词。
4. 第二轮重写 Hoodie；Front & Back、Long Sleeve 和 Oversized 只有在功能验收通过后进入核心索引。
5. 用现有资产制作 Sweatshirt 页面 brief，并先验证查询；同时修复 `/mockups/pants` 对 `3d pants` 的意图和摘要匹配，再决定是否建立 Sweatpants/Joggers 工具页。
6. Transparent 先放在 3D Clothing 页验证；Bulk、POD、On-model 与 Virtual Try-on 等对应产品能力成熟后再建或强化。
7. 每 28 天按页面查看非品牌点击、CTR、编辑开始、上传、有效导出和注册，不用排名或曝光单独决定扩页。

### 28 天决策规则

重写或新建页面都记录上线日，以连续两个 28 天窗口评估：

| 指标 | 用途 | 决策方式 |
| --- | --- | --- |
| 非品牌 impressions / queries | 判断需求和关键词归属 | 看新增查询是否围绕该页的唯一任务，而不是只看总曝光。 |
| CTR 与平均位置 | 判断标题、摘要和意图匹配 | 同一位置区间内 CTR 下降时，先检查结果类型和承诺，不立即加关键词。 |
| Start / editor open | 判断落地内容是否把用户送入工具 | 曝光增长但启动率下降，说明内容吸引了不匹配的人群。 |
| Upload success | 判断核心任务是否可用 | 启动高但上传低，应先修产品摩擦。 |
| Valid export | 判断页面是否兑现搜索承诺 | 作为工具页的核心完成指标；不能只用注册量替代。 |
| Registration after value | 判断 SEO 流量的业务价值 | 与有效导出一起看，避免用过早登录墙抬高流失。 |

合并或撤销页面至少满足以下一种情况：连续两个窗口没有目标查询和有效使用；查询几乎全部被另一个页面更好承接；或功能无法兑现该词的核心任务。存在已有点击或有效使用的 URL，先准备目标页和重定向映射，再做变更。

## 下一轮需要补的数据

- GSC 16 个月完整查询与页面导出，按国家和设备拆分；
- Bing 完整关键词/页面导出，而非可见样本；
- Keyword Planner 的美国及目标市场月搜索量、三个月变化和竞争度；
- 每个候选主词前 10 名结果类型：工具、模板库、文章、图片或电商页；
- Tools 各 URL 的索引状态、canonical、外链和历史点击；
- 进入编辑器、上传、自定义预览和导出的页面级漏斗。

精确搜索量补齐后，可以调整 P0/P1 的先后，但不会改变“按搜索任务区分页面、按真实能力决定是否建页”的基本原则。
