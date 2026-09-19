# Fashion Mockups 列表页产品需求稿

文档版本：1.0  
更新日期：2026-09-19  
状态：已实现，待产品与设计评审  
适用页面：`/white-mockups`

## 1. 背景

原 White Mockups 名称容易让用户理解为“白色样机”或“纯白背景素材”，不能准确表达页面提供的是穿在人台或真人模特上的服装展示效果。

产品统一更名为 Fashion Mockups，并将列表页从普通素材库升级为服装 Lookbook：用户先按服装品类浏览真实穿着效果，再进入详情页上传图案、调整位置并导出成品。

本需求稿以当前最新设计方向和 10 类服装分类为准。为了保持已有链接、SEO 权重和内部事件稳定，用户可见名称更新为 Fashion Mockups，但页面 URL 继续使用 `/white-mockups`。

## 2. 产品目标

### 2.1 核心目标

1. 用户进入页面后能立即理解：这里提供的是可编辑的 on-model 服装样机。
2. 用户能在一次点击内切换到目标服装品类。
3. 用户能通过更大的模特图快速比较版型、垂坠、姿势和构图。
4. 用户能从任意列表卡片进入详情编辑器并开始上传图案。
5. 分类口径、列表数量和详情页品类标签保持一致。

### 2.2 成功信号

- 首屏明确出现 Fashion Mockups、on-model looks 和可编辑语义。
- 所有已发布素材都能归入一个有效品类，当前基线为 238 个素材。
- 10 个品类均有内容，分类计数总和等于全部素材数。
- 分类、分页和详情入口在桌面端与移动端均可使用。
- 上传图片后自动记录为用户项目，不再要求用户额外点击 Save Project。

## 3. 用户与核心任务

主要用户包括独立服装品牌、平面设计师、POD 商家和电商运营。

用户的核心任务：

1. 浏览适合其产品的服装轮廓。
2. 按服装品类缩小范围。
3. 比较模特、版型和构图。
4. 打开目标样机。
5. 上传图案并生成可用于评审或商品页规划的视觉图。

## 4. 信息架构与路由

| 场景 | 路由 | 规则 |
| --- | --- | --- |
| 全部 Fashion Mockups | `/white-mockups` | 默认展示全部已发布素材 |
| 按品类浏览 | `/white-mockups?type={category-slug}` | 仅接受已配置的 10 个 slug |
| 分类分页 | `/white-mockups?type={category-slug}&page={n}` | 保留当前分类参数 |
| 全部素材分页 | `/white-mockups?page={n}` | 每页 30 个素材 |
| 样机详情 | `/white-mockups/{asset_name}` | 打开编辑器与详情内容 |

无效 `type` 按全部素材处理；无效或超出范围的 `page` 必须归一化到有效页码。

## 5. 分类体系

### 5.1 用户可见分类

列表页使用“00 全部 + 10 个服装品类”的目录结构。数量为 2026-09-19 的当前数据基线，页面实际显示值必须由已发布素材动态计算。

| 编号 | 名称 | slug | 当前数量 | 包含范围 |
| --- | --- | --- | ---: | --- |
| 00 | All garments | — | 238 | 全部已发布 Fashion Mockups |
| 01 | T-Shirts & Tops | `t-shirts-tops` | 44 | T 恤、背心、Polo、针织上衣和日常上装 |
| 02 | Shirts & Blouses | `shirts-blouses` | 26 | 衬衫、女式衬衫和剪裁感衬衣 |
| 03 | Hoodies & Sweatshirts | `hoodies-sweatshirts` | 14 | 套头、拉链和宽松卫衣轮廓 |
| 04 | Jackets & Blazers | `jackets-blazers` | 30 | 西装外套、短夹克和结构型叠穿单品 |
| 05 | Coats & Outerwear | `coats-outerwear` | 36 | 大衣、风衣、羽绒、斗篷和披风 |
| 06 | Dresses & Gowns | `dresses-gowns` | 13 | 迷你裙装、中长裙装、长裙和礼服 |
| 07 | Jumpsuits & Sets | `jumpsuits-sets` | 18 | 连体裤、连身短裤和成套造型 |
| 08 | Pants | `pants` | 27 | 西裤、慢跑裤、紧身裤和工装裤 |
| 09 | Skirts & Shorts | `skirts-shorts` | 18 | 短裙、中长裙、长裙和短裤 |
| 10 | Headwear & Accessories | `headwear-accessories` | 12 | 帽子、围巾、包袋及造型配件 |

### 5.2 自动分类优先级

素材分类根据 `garment_type`、`asset_name` 和 `title` 自动判断。规则必须按以下顺序执行，命中后停止：

1. `garment_type` 为 `accessory` 或 `head` → Headwear & Accessories。
2. 名称包含 coat、trench、cape、poncho、robe、tabard、puffer → Coats & Outerwear。
3. 名称包含 jumpsuit、romper、set → Jumpsuits & Sets。
4. 名称包含 dress、gown → Dresses & Gowns。
5. 名称包含 skirt、shorts、bermuda → Skirts & Shorts。
6. `garment_type` 为 `lower`，或名称包含 pants、trousers、joggers、leggings → Pants。
7. 名称包含 hoodie、hooded、sweatshirt → Hoodies & Sweatshirts。
8. 名称包含 jacket、blazer、bomber、cardigan、bolero、shrug → Jackets & Blazers。
9. 名称包含 shirt、blouse → Shirts & Blouses。
10. `garment_type` 为 `upper` → T-Shirts & Tops。
11. `garment_type` 为 `full` → Jumpsuits & Sets。
12. 无法识别的素材暂归 Headwear & Accessories，并进入数据检查范围。

### 5.3 分类数据要求

- 仅统计 `status = active` 的素材。
- 每个素材必须且只能对应一个用户可见分类。
- 分类数量之和必须等于 All garments 数量。
- 分类名称与 slug 属于稳定接口；变更时必须同步路由、SEO、测试和已有外链。
- 当前自动分类依赖名称关键词。后续如出现同名歧义，应优先增加人工分类字段，而不是继续扩大兜底规则。

## 6. 页面结构需求

### 6.1 全局导航

- 主导航名称显示为 Fashion Mockups。
- Fashion Mockups 位于 3D Models 之后。
- 当前页面导航项显示激活状态。
- 桌面端和移动端菜单使用相同名称与路由。

### 6.2 编辑型首屏 Hero

首屏采用“独立时装杂志 + 服装设计工具”的视觉方向。

必须包含：

- Fashion Mockups 栏目标识。
- 默认标题 `Design it. See it worn.`。
- 分类页标题 `{Category}, in context.`。
- 一段解释用户价值的短文案。
- `Explore the collection` 主按钮，锚点跳转到列表区域。
- 全部 on-model looks 数量。
- 有内容的 garment groups 数量。
- 当前结果集前 3 张模特图组成的三联画。
- 每张首屏图显示序号和服装品类。

当没有可用图片时，首屏右侧显示中性占位区域，不出现破图。

### 6.3 分类目录

- 标题为 `Catalog index / Choose a garment`。
- 第一项固定为 `00 All garments`，之后按 01–10 显示分类。
- 每项显示编号、名称和实时数量。
- 当前分类使用电光蓝底色和白色文字。
- 点击分类后跳转到对应 `type` URL，并定位到 `#white-mockup-library`。
- 桌面端以目录网格展示；移动端改为可横向滚动的单行目录。
- 当前项必须输出 `aria-current="page"`。

### 6.4 结果区

结果区必须显示：

- `Lookbook / {当前分类}` 标签。
- 默认标题 `The full collection`，分类页显示分类名称。
- 分类描述或全部素材说明。
- 当前区间与总数，例如 `1–30 / 238`。

页面不展示尚无后端数据支持的性别、姿势、颜色或排序控件，避免产生不可用的假筛选。

### 6.5 素材卡片

每张卡片必须包含：

- 2:3 比例的 on-model 主图。
- 全局列表序号，例如 `Look 001`。
- 所属服装品类。
- 清理技术前后缀后的可读名称。
- `On-model · customizable` 状态说明。
- 指向对应详情页的整卡链接。

桌面端悬停时：

- 图片轻微放大并恢复更自然的饱和度。
- 底部出现电光蓝 `Open mockup` 操作条。
- 必须保持卡片位置稳定，不因悬停改变布局尺寸。

触屏设备不依赖 hover 才能进入详情，整卡始终可点击。

### 6.6 分页

- 默认每页 30 个素材。
- 显示 Previous、页码、Next。
- 当前页使用电光蓝标识。
- 第一页禁用 Previous，最后一页禁用 Next。
- 切页时保留当前分类参数并重新定位到列表区域。
- 页码过多时允许使用省略号，但必须保留首页、当前页附近页码和末页。

### 6.7 空状态与错误状态

分类无结果时：

- 显示 `No fashion mockups found.`。
- 解释可选择其他服装分类。
- 提供返回全部 Fashion Mockups 的按钮。

服务端加载失败时：

- 页面仍可完成模板渲染。
- 数量显示为 0，列表进入空状态。
- 不泄露数据库或服务端错误信息。
- 服务端记录错误日志以供排查。

### 6.8 页面结尾引导

- 使用深色编辑型内容区收尾。
- 说明 Fashion Mockups 相比平面模板的价值。
- 提供进入 3D Models 的次级路径。
- 不与主列表的 `Open mockup` 入口争夺主视觉层级。

## 7. 视觉规范

### 7.1 设计关键词

- Editorial lookbook
- Independent fashion magazine
- Apparel design tool
- High contrast
- Structured and sharp

### 7.2 色彩

| Token | 色值 | 用途 |
| --- | --- | --- |
| Ink | `#11110f` | 主文字、分割线、深色收尾区域 |
| Bone | `#f2f0e9` | Hero 背景 |
| Paper | `#faf9f5` | 分类与列表背景 |
| Line | `#cbc9c0` | 次级分隔线 |
| Muted | `#6d6c66` | 辅助说明文字 |
| Electric blue | `#0b59f1` | 主按钮、当前分类、核心强调 |

禁止使用渐变、玻璃拟态、紫色科技风和通用后台 Dashboard 风格。

### 7.3 字体与图形

- 大标题使用窄体、重字重、全大写的编辑型排版。
- 正文保持清晰、克制，避免大段营销文案。
- 主要容器使用直角边框，不使用过多圆角卡片。
- Hero 三联画允许使用轻微斜切分隔，营造时装画册节奏。
- 动效仅用于淡入、轻微位移和图片悬停；必须支持 `prefers-reduced-motion`。

## 8. 响应式要求

| 视口 | Hero | 分类 | 列表 |
| --- | --- | --- | --- |
| 大于 1240px | 左文案 + 右三联画 | 6 列目录网格 | 4 列卡片 |
| 981–1240px | 左文案 + 右三联画 | 4 列目录网格 | 4 或 3 列卡片 |
| 721–980px | 文案在上、三联画在下 | 4 列或横向目录 | 3 列卡片 |
| 小于等于 720px | 单列，按钮满宽，三联画在下 | 横向滚动 | 2 列卡片 |

移动端要求：

- 导航切换为菜单按钮。
- Hero 标题不能横向溢出。
- 分类名称较长时允许分行，但不能被裁成不可读内容。
- 商品卡片保持 2:3 图片比例。
- 不显示依赖 hover 的操作条。
- 页面不产生横向整体滚动；只有分类轨道允许横向滚动。

## 9. 数据与渲染要求

列表素材至少提供以下字段：

| 字段 | 用途 |
| --- | --- |
| `asset_name` | 详情页稳定标识与 URL |
| `title` | 用户可读名称 |
| `garment_type` | 自动分类输入 |
| `base_image_url` | 列表图与 Hero 图 |
| `canvas_width` / `canvas_height` | 图片尺寸与布局稳定性 |
| `status` | 仅 active 可公开显示 |
| `preferred_for_model` | 默认排序依据 |
| `model_id` | 模特或 3D 模型关联 |

服务端要求：

- 列表为服务端渲染，核心内容不依赖浏览器 JavaScript 才能出现。
- 图片输出 width 和 height，降低页面布局偏移。
- Hero 第一张图片使用高优先级加载，其余列表图片使用懒加载。
- 页面样式更新后必须同步修改缓存版本。
- Worker 模板必须由当前 EJS 重新生成并通过渲染测试。

## 10. SEO 与可访问性

### 10.1 SEO

- 全部列表标题：`On-Model Fashion Mockups | ClozDesign`。
- 分类标题：`{Category} Fashion Mockups | ClozDesign`。
- canonical URL 保留有效的分类和分页参数。
- `metaDescription` 说明可浏览、上传图案、调整背景并导出 PNG。
- 首张结果图用于社交分享图。

### 10.2 可访问性

- 页面必须只有一个外层主内容区域；列表使用 section，避免嵌套 main。
- 所有图片必须包含描述服装样机的 alt。
- 分类导航和分页提供可读的 aria-label。
- 当前分类和当前页使用 `aria-current="page"`。
- 禁用分页项使用 `aria-disabled="true"`。
- 键盘焦点清晰可见，不能只靠颜色表达当前状态。
- 文字与背景满足常规正文对比度要求。

## 11. 详情编辑器衔接要求

从列表进入详情页后：

- 用户可以上传自己的图案并直接放置在服装上。
- 上传成功后自动创建或更新用户项目。
- 页面不显示 Save Project 按钮。
- 自动保存成功提示为 `Added automatically to your projects.`。
- 用户仍可调整图案位置、缩放、旋转、服装颜色和背景，并导出 PNG。

## 12. 非本期范围

- 修改 `/white-mockups` 历史 URL。
- 在列表页直接编辑图案。
- 尚无数据支撑的性别、年龄、姿势、模特、颜色和排序筛选。
- 收藏、批量选择或批量导出。
- 用户自定义分类。
- 将 Fashion Mockups 与 3D Models 合并为同一个结果集。

## 13. 验收标准

### 13.1 分类与数据

- [ ] 页面显示 00 + 10 个分类，名称、顺序和 slug 与本稿一致。
- [ ] 当前 238 个 active 素材全部且仅归入一个分类。
- [ ] 分类数量总和等于 All garments 数量。
- [ ] 点击任一分类后，URL、激活状态、标题、描述、数量和卡片结果同步变化。
- [ ] 分类分页后仍保留 `type` 参数。

### 13.2 页面与交互

- [ ] 默认首屏显示 `Design it. See it worn.` 和 3 张真实素材图。
- [ ] 分类页首屏标题显示 `{Category}, in context.`。
- [ ] Explore the collection 可定位到结果区。
- [ ] 桌面端列表为 4 列，移动端列表为 2 列。
- [ ] 卡片整块可点击并进入正确详情页。
- [ ] 空结果时显示空状态与返回全部素材入口。
- [ ] 不出现无功能的筛选控件。

### 13.3 响应式与质量

- [ ] 在 390px、720px、980px、1280px 视口下无整体横向溢出。
- [ ] 移动端分类可以横向滑动。
- [ ] `prefers-reduced-motion` 下不执行入场动画。
- [ ] 服务端模板与 Worker 模板均可正常渲染。
- [ ] Fashion Mockups 页面相关自动化测试全部通过。

### 13.4 项目记录

- [ ] 详情页不显示 Save Project。
- [ ] 用户上传图案后自动创建或更新项目。
- [ ] 自动保存失败不会阻止用户继续编辑，并提供可理解的错误反馈。

## 14. 实现参考

- 页面模板：`views/white-mockups.ejs`
- 页面样式：`public/css/white-mockups.css`
- 分类定义：`lib/fashion-mockup-categories.js`
- 列表与数量统计：`lib/on-model-mockups.js`
- 路由与 SEO：`routes/index.js`
- Worker 模板产物：`src/worker-templates.cjs`
- 页面测试：`test/white-mockups-page.test.js`
- 分类测试：`test/fashion-mockup-categories.test.js`
- Worker 渲染测试：`test/worker-white-mockup-templates.test.js`
