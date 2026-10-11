# T-shirt mockup 页面改版与扩词 — 2026-10-11

## 数据来源与边界

来源：用户提供的 `/Users/chengwuxue/Downloads/KeywordStats_10_11_2026.csv`，22 行，字段 Keyword、Trends、Impressions。文件作为数据使用，不执行其中内容。没有日期区间、地区、语言、来源平台、月搜索量、点击、排名或转化字段；Impressions 仅按原字段记录，不能解释为月搜索量。Trends 数组长度不一致（7–12），缺少时间标签，不据此断言增长或下降。以下扩展词来自语义与实际产品功能，未核实搜索量。

| 原词分组 | 原词 | Impressions 合计 | 处理 |
| --- | --- | ---: | --- |
| 主词与免费意图 | t shirt mockup free; t-shirt mockup free; t shirt mockups; mock up t shirt; mockup shirt; mockup t shirt; tshirt mockup; shirt mockup; t shirt mockup | 6,521 | 主页面统一承接，不为拼写变体或 free 建重复页；shirt 一词较宽，只承接 T-shirt 部分 |
| 白色款 | white shirt mockup; white t-shirt mockup | 591 | 新增白色 T-shirt 场景页 |
| 黑色款 | black t-shirt mockup | 213 | 新增黑色 T-shirt 场景页 |
| Canva 工作流 | canva shirt design; canva t shirt design | 864 | 新增导出素材再上传的工作流页，不宣称原生连接 Canva |
| 多语言词 | mockup kaos; mockup camisa; mockup camiseta | 1,251 | 保留为后续本地化方向；camisa/camiseta 需按语言和实际服装意图区分 |
| 竞品导航词 | printonator; mockey; mockuptree | 2,194 | 不生成未经验证的竞品比较页 |
| 过宽词 | mockup free | 6,935 | 服装部分由 /tools 与 /mockups 承接，不建泛 mockup 页面 |
| 无关词 | best arroz con coco near me | 175,440 | 排除，与服装产品无关 |

## 本次上线到代码的页面与扩词

原始词与扩展词分开记录；本表扩词不附带虚构搜索量。共 92 个语义关键词/短语，覆盖 1 个改版主页面、6 个新增页面、5 个已有页面。关键词用于内容规划，不在页面上堆叠关键词列表。

| 目标 URL | 搜索任务 | 关键词与长尾扩展 |
| --- | --- | --- |
| `/tools/t-shirt-mockup-generator` | 选择 blank、浏览款型与进入编辑 | t shirt mockup; t-shirt mockup; tshirt mockup; shirt mockup; mockup t shirt; mock up t shirt; t shirt mockups; t shirt mockup free; t-shirt mockup free; online t-shirt mockup generator; 3D t-shirt mockup; t-shirt mockup without Photoshop; browser t-shirt mockup; blank t-shirt mockup |
| `/tools/white-t-shirt-mockup` **新** | 浅色布料的图案、边缘与可读性 | white t-shirt mockup; white shirt mockup; blank white t-shirt mockup; white tee mockup; white t-shirt logo mockup; white t-shirt mockup online; white crewneck mockup; white graphic tee preview |
| `/tools/black-t-shirt-mockup` **新** | 深色布料、透明图案和印刷沟通 | black t-shirt mockup; black shirt mockup; black tee mockup; blank black t-shirt mockup; black t-shirt logo mockup; black t-shirt mockup online; dark t-shirt graphic preview; black crewneck mockup |
| `/tools/canva-t-shirt-mockup` **新** | 从 Canva 导出原始图案并上传 | canva shirt design; canva t shirt design; Canva artwork t-shirt mockup; Canva PNG shirt mockup; how to put Canva design on a shirt; Canva graphic on 3D T-shirt; Canva logo shirt preview; export Canva artwork for T-shirt mockup |
| `/tools/t-shirt-logo-mockup` **新** | 胸前 logo 的左右、比例与间距 | t-shirt logo mockup; shirt logo mockup; left chest logo mockup; branded t-shirt mockup; small logo tee mockup; center chest logo preview; company logo shirt mockup; logo placement on T-shirt |
| `/tools/graphic-t-shirt-mockup` **新** | 大图印花、款型比例与两面布局 | graphic t-shirt mockup; graphic tee mockup; t-shirt print mockup; back graphic shirt mockup; streetwear graphic tee preview; large print T-shirt mockup; front graphic tee preview; two-sided graphic T-shirt mockup |
| `/tools/transparent-t-shirt-mockup` **新** | 输出透明 PNG、区别图案和产品透明度 | transparent t-shirt mockup; t-shirt mockup PNG; shirt mockup transparent background; transparent tee mockup; T-shirt product cutout; T-shirt render without background; transparent shirt product image; PNG garment mockup |
| `/tools/oversized-t-shirt-mockup-generator` **已有** | 宽松与落肩款型 | oversized t-shirt mockup; oversized tee mockup; drop shoulder T-shirt mockup; baggy shirt mockup; relaxed fit tee preview; streetwear T-shirt blank |
| `/tools/front-and-back-t-shirt-mockup` **已有** | 统一两面的角度与设计检查 | front and back t-shirt mockup; front shirt mockup; back shirt mockup; two sided shirt mockup; chest and back print preview; T-shirt approval views |
| `/tools/bulk-t-shirt-mockup-generator` **已有** | 多色产品组 | bulk t-shirt mockup; T-shirt colorway mockup; multiple shirt colors mockup; product variant T-shirt preview; same artwork different shirt colors; T-shirt collection sheet |
| `/tools/print-on-demand-mockup-generator` **已有** | POD 及商品图库 | print-on-demand shirt mockup; POD t-shirt preview; Etsy T-shirt product image; Shopify shirt mockup; merch listing mockup; T-shirt catalog preview |
| `/tools/long-sleeve-shirt-mockup-generator` **已有** | 袖长与袖部图案 | long sleeve shirt mockup; long sleeve tee mockup; sleeve print mockup; long sleeve merch mockup; crewneck long sleeve preview; seasonal shirt mockup |

## 设计与实现

先分析 `views/tshirt-generator-landing.ejs`、对应 CSS/JS、最新品牌首页、相关工具页和真实模型资产；再使用内置 imagegen 生成完整设计稿：`design-mockups/tshirt-generator-keyword-pages-full-design-v1.png`。原始生成提示词保存于同目录 JSON 文件。

实现保留网站真实导航和页脚，使用 Helvetica Neue、黑白与暖灰背景、细线分隔、矩形按钮。主页面依次为工具预览、款型选择、实际操作步骤、场景入口、FAQ、收尾操作区；桌面主要模块至少占一屏可用高度，移动端自然展开。六个新页面共用视觉框架，但各自有独立标题、介绍、三个业务检查项、三步流程和专属 FAQ。

预览直接自动初始化，加载时立即显示真实 garment cover；提供前/后/侧视图与黑白预览色，款型选择同步所有 editor 入口。预览颜色仅作用于该页；文案说明在 editor 中设置最终颜色，避免未传递状态的误解。失败时保留产品图和 editor 入口、提供 Retry；无模型时提供真实 library 入口，不伪造可编辑模型。实际 3D 渲染生成黑色款首帧，用于该场景的即时预览。

免费范围按 `lib/user-entitlements.js` 校准：免费预览，账户免费限三个项目，成品导出和去水印需 Pro 或以上。Canva 文件导出工作流没有原生 API 连接。图案内容区使用既有示例素材，注明 illustrative，不把示例图当作用户已经完成的设计。

SEO：每页独立 canonical、title、description、FAQ 与 HowTo 数据；工具目录、主页面、相关页互链；静态 sitemap 和 sitemap 生成脚本同步新增六页。没有为 free 或拼写变体建 doorway 页面。

## 与生成稿的必要差异

- 复用真实模型的领型、袖口及实际可选款型，而非生成稿的虚拟商品形状。
- 下方素材复用项目已有 garment 示例，流程展示配三步说明，不新增不可工作的上传或导出按钮。
- 免费与付费边界、Canva 无原生连接、颜色预览与最终 editor 颜色的区别在真实页面明确说明。
- 全局导航、优惠条与页脚保留站点现有内容；不以生成稿虚构的菜单替换全站结构。

## 后续扩展

优先验证新页面的 Search Console 曝光、点击、CTR 和进入编辑器转化，再决定是否新增场景。不能用本文件推断排名或 SEO 结果。

印尼语 `mockup kaos`、西班牙语/葡萄牙语 `mockup camiseta` 与 `mockup camisa` 暂不建只有英语正文的落地页；后续需要完整本地化文案、导航、语言路径和 hreflang。竞品词需先实际研究对方产品和限制，再决定是否有足够独立价值做比较内容。

参考：
- Google Search 的 doorway / scaled content 说明：https://developers.google.com/search/docs/essentials/spam-policies
- Canva 透明背景导出要求：https://www.canva.com/help/transparent-background/

## 已执行验证

- 内置 imagegen 设计稿在实现前生成；完成后的桌面整页与 390px 移动端截图经过目视检查。移动端产品预览在文案后、操作入口前呈现，优先让首屏看到商品。
- 浏览器逐一检查主页面及六个场景页：独立 canonical、title/description、可索引 robots、可见 FAQ 与 JSON-LD FAQ 一致、三步 HowTo、黑色页自动应用黑色、桌面和移动端无横向溢出。
- 实测颜色切换、前后视图、款型切换后所有 editor 链接同步、键盘 End 切换、工具目录六个新入口。
- 阻断模型请求触发失败状态：保留首帧产品图与 editor 入口；解除阻断后点击 Retry 成功恢复。重试等待 viewer 卸载并为请求增加重试参数，避免同一事件循环重设相同 URL 时无法重新加载的问题。
- 页面 JavaScript errors 为 0；本地图片资源无破损。首个模型自动加载，其余模型在选择后才请求。
- `npm run build` 成功，Worker 模板和工具目录在编译后实际渲染成功；黑色首帧 manifest 支持 Worker 环境，不依赖 Worker 不支持的 fs.existsSync。
- 相关 14 项测试全通过（T-shirt 页面、工具目录、加载状态、工具性能、Worker 模板）。
- 项目根目录测试 388 项：377 通过、11 失败。用本次改动前的源文件基线执行对应测试：同样 11 个失败名称，无新增失败；这些失败涉及已有首页、渲染标准和设计保存行为。本次没有声称全量测试全绿。
- `git diff --check` 通过。本次仅在本地实现和验证，尚未部署到生产环境。

## Choose your blank 横向款型列表（v2）

实现前生成并保存 `design-mockups/tshirt-blank-horizontal-gallery-v1.png` 与对应 prompt JSON。沿用整页原有风格，只替换款型区；设计稿中的虚拟商品名称不用于网站，实际图片、名称和编辑链接均来自 active T-shirt 模型库。目前展示 21 款，最多取 24 款，完整库入口继续保留。首屏仍为四个代表款型的自动 3D 预览，列表不额外初始化 3D。

桌面保留下一张露出部分，移动端可横向滑动。根据用户后续要求移除滚动条，改为每三秒自动向后移动一款，到末尾循环回开头；按用户要求移除暂停、前进及后退按钮；保留方向键及 Home/End。鼠标悬停、键盘焦点、手动操作、页面不可见时暂停，减少动态效果偏好默认暂停。无模型时保留 library 空状态入口。

验证：1440px、390px、320px 页面无横向溢出；列表 21 张，hero 4 个 viewer；首尾键可移动；自动滚动与悬停暂停已验证，控制按钮及滚动条均已移除，首个及最后一个编辑页面返回 200，页面脚本错误为 0。相关测试 15 项通过，Worker 构建与 `git diff --check` 通过。列表布局遵循生成稿，商品内容采用真实库数据；其余页面模块延续既有设计。

商业页面文案清理：按用户要求移除章节眉题（01 / The blank 等）、细节/步骤的两位编号、款型位置编号和末尾重复的引导眉题。保留实际产品名称、功能说明、价格边界、标题和编辑入口；自动滚动行为不变。

继续清理：款型卡片改为单一整卡编辑器链接，移除 Open editor、重复引导句和末尾重复营销模块。主标题直接使用 T-shirt mockup generator，功能说明聚焦图案、颜色与视角。首屏去掉免费/Pro 导出提示，费用说明保留在 FAQ、步骤与价格页。默认预览改为常规直筒圆领短袖，避免卷袖款。

精简主工具落地页：移除 How-to 操作模块和对应主页面 HowTo 结构化数据；保留专题页独立流程。移除款型区、场景区及 FAQ 标题旁的重复说明，FAQ 全部默认收起。主页面保留一句功能说明、自动 3D 预览、整卡款型入口、相关场景链接与 FAQ；费用说明在 FAQ/价格页保留。直筒圆领模型含未激活材质，颜色预览先 ensureLoaded 后设置材质，避免加载后报错。

最新加载展示调整：用户明确要求覆盖此前首帧图片偏好，首屏 3D 加载时仅显示居中的旋转指示器，删除封面图和 Preparing preview 文字；保留无障碍状态标签。模型自动加载、成功后显示 3D、失败时可重试。款型库中的产品图片保留。

棉质默认预览：共享 T-shirt 工具模板的所有 3D 款型复用现有 materials-v2/cotton-jersey 的 normal 和 roughness 贴图，7 倍平铺、非金属、粗糙度 0.86，保留原模型颜色贴图细节。纹理按模型缓存，颜色切换不重复加载；材质准备完毕才显示 3D。浏览器检查四个款型的默认棉质与贴图/平铺参数，截图目视通过。

## 六个扩词页面的差异化结构（v2，替代原共用检查项与步骤）

用户明确指出问题是页面模块和内容结构相同。实现前生成完整六页设计板 `design-mockups/tshirt-workflow-distinct-pages-v2.png`，提示词保存在对应 JSON；保留网站现有排版和交互风格，重新设计各场景正文。

- White：浅色双列商品陈列，展示空白圆领与胸前图案示例。
- Black：深色产品展台，展示实际棉质黑色模型与编辑入口。
- Canva：横向图案效果展示与支持的文件格式。
- Logo：大图与胸前细节的非对称组合。
- Graphic：完整正反面图案展示，避免裁掉图案。
- Transparent：实际透明 PNG 与可切换的白色、深色、沙色和透明背景。

首屏功能介绍缩短；移除共用检查项、三步流程和全部 T-shirt 场景的 HowTo 数据。保留自动 3D、真实编辑入口、独立 FAQ、canonical、相关页面链接。四个首屏款型继续复用既有库，本次主要区分正文结构。

设计稿差异：使用现有商品示例替代生成稿中的虚构品牌；白色与黑色 PNG 来自实际棉质 3D 模型渲染，透明图含真实 alpha。没有加入虚拟上传、Canva 原生连接或无法工作的导出按钮。示例素材用简短图注说明。

验证：六页在 1440px 与 390px 浏览器中无横向溢出、图片正常、无脚本错误；FAQ 与结构化数据一致，透明背景切换有效。桌面模块维持可用屏高、手机自然展开。相关 10 项测试与 Worker 构建通过；截图保存于 `tmp/tshirt-redesign/scene-*.png`。仅本地完成，未部署。

## Women / Men 场景页（v1）

按用户要求移除 Canva 专题页、所有入口与 sitemap 地址，同时删除该页专用布局和样式；本地旧路径返回 404。其他页面不再展示 Canva FAQ。

新增 `/tools/women-t-shirt-mockup` 与 `/tools/men-t-shirt-mockup`。先用内置 imagegen 生成整页桌面/手机设计板 `design-mockups/tshirt-women-men-pages-v1.png`，提示词保存于同名 `.prompt.json`。沿用既有黑白、暖灰、留白和矩形按钮，Women 采用一大两小非对称陈列，Men 采用三列陈列。

Women 从现有库优先选择修身 V 领、长袖短款、荷叶边与七分袖短款；Men 优先选择常规直筒圆领、宽松落肩、直筒长袖与 Polo。所有模型、产品图和编辑器链接均为真实库记录；没有生成新的模型或声称测量尺码/真人试穿能力。款型不足时使用可用模型，无模型时保留既有空状态。

独立标题、描述、关键词、FAQ、canonical；工具目录、相关场景和 sitemap 自动接入两页。默认棉质、自动 3D、纯旋转加载和入场动画继续复用。没有恢复三步说明或 HowTo。

设计差异：使用实际 V 领与高领款替代生成稿中的虚拟圆领；导航和页脚沿用站点，删除生成稿中多余商品解释和价格营销模块，价格链接仅在 FAQ 保留。

验证：1440px、390px 的两页无横向溢出，实际自动 3D 加载、默认款型、款型切换和编辑入口一致性通过；七个场景的图片、FAQ/schema 和透明背景切换检查通过。相关 11 项测试通过，Worker 构建与两个新 partial 的实际 Worker 渲染通过。桌面和移动端截图在 `tmp/tshirt-redesign/audience-*.png`。仅本地实现，未部署。

Black 场景颜色继承：默认圆领的封面 manifest 改用实际棉质黑色 PNG，Black 页分享图和商品展示也使用黑色素材。所有首屏款型编辑链接携带 `color=171717`，切换款型后仍保留；详情页先应用黑色再完成加载，编辑器将各服装面片初始化为黑色。已保存 project/adminProject 不使用 URL 初始色覆盖。快速颜色控件同步选中黑色，更新相关静态资源版本。实际浏览器检查黑色分享封面、款型链接、详情 3D 材质与编辑器面片颜色；入口颜色的有效值、无效值及已保存项目保护通过运行测试。相关 45 项测试与构建通过。

## White / Black 自动滚动款型区与重新生成封面（v2）

按用户最新要求替换 White 的双图示例、Black 的深色展台，均复用主工具页的自动横向滚动列表：无滚动条、暂停/前进/后退按钮，整卡进入对应编辑器，保留触摸和键盘操作。White 展示完整 21 款现有模型，Black 展示当前四个首屏款型；Black 列表只接受有黑色封面的记录，避免回退到白色图片。

使用内置 imagegen 对四个实际原封面分别重生成黑色版本，保持领型、袖长和轮廓。成品保存在 `public/images/tshirt-studio/black-covers-v2/*.webp`；生成提示词、原始输出路径与成品路径在 `design-mockups/tshirt-black-cover-regeneration-v2.prompt.json`。WebP 仅编码压缩，没有裁切或缩放，四张各约 36–56KB。原始生成 PNG 保留在工具输出目录。全部 Black 卡片、分享封面及对应详情初始封面更新，进入详情/编辑器的黑色颜色继承继续有效。White / Black 场景采用 4:5 图片框，保持单层完整商品图。

桌面 1440px 与手机 390px 检查：卡片数量、四张新黑色图、图片解码、无横向页面溢出、无控制按钮/滚动条、自动滚动及黑色编辑链接通过。相关 13 项测试和 Worker 构建通过，两个场景的嵌套共享 gallery partial 在 Worker 实际渲染通过。仅本地完成，未部署。

### Fashion T-shirt collections — 2026-10-11

- White and Black include eight curated, active Fashion Mockup T-shirt styles; Women and Men each include four styles selected by explicit catalog metadata. Missing records are omitted, with no invented assets or dead editor links.
- Full-page design: `design-mockups/tshirt-fashion-gallery-four-pages-v1.png`. Implementation retains existing page layouts and uses real catalog imagery instead of the board's illustrative photos and generic promotional copy. New section contains only heading, product names and catalog link.
- Black covers use the Fashion editor's garment-mask multiply fill, leaving person/background intact; card links initialize the Fashion editor with `#171717`. URL color choices are validated and never override saved projects.
- Both garment and Fashion collections support automatic scrolling, touch and keyboard navigation without visible scrollbars or playback controls. Reduced-motion preference disables automatic scrolling.
- Validated four pages at 1440px and 390px: counts 8/8/4/4, all photos and Black canvas covers load, no horizontal page overflow, and Black editor initializes correctly. Worker partial render, color validation/project preservation tests and production build passed. Local service on port 3012; not deployed.

### Generated Black Fashion covers — 2026-10-11

- Replaced all eight runtime-tinted Black Fashion thumbnails with image_gen edits of the existing catalog photos. Black garment edits preserve each original person, pose, backdrop and framing; collar, cuffs and hem are fully black with natural cotton texture and visible folds.
- Selected assets: `public/images/tshirt-studio/fashion-black-v1/`; map: `public/config/tshirt-fashion-posters.json`; edit prompt and original generation paths: `design-mockups/tshirt-fashion-black-photos-v1.prompt.json`. WebP quality 92, no resizing/cropping. White/Women/Men retain original catalog photos.
- Removed the retired thumbnail canvas tint code, spinner and error styles. Black card links still initialize the Fashion editor with color `171717`, using its editable garment mask and preserving saved projects.
- Catalog listing now resolves current editable SVG masks using the same join as detail pages, fixing the previous use of outdated raster masks.
