# 《山海经·洪荒开荒》抖音小游戏工程

将浏览器单文件 HTML 原型迁移为**抖音小游戏（tt 运行时，Canvas 渲染，无 DOM）**标准工程。
原型机制完全对齐《猫国建设者》v1.6.1，题材为《山海经》。

## 目录结构

```
shanhajing-douyin/
├── game.js               # 抖音小游戏入口（require 加载引擎/适配/UI）
├── game.json             # 小游戏配置（竖屏、隐藏状态栏）
├── project.config.json   # 项目配置（appid 需替换！）
├── preview.html          # 浏览器预览页（官方推荐"先在浏览器跑通"）
├── test-douyin.js        # 引擎回归测试（node test-douyin.js，17 项）
└── js/
    ├── core.js           # 引擎层：数据表 + 数值 + 存档（平台无关，可注入存储）
    ├── adapter.js        # 平台抽象：tt / 浏览器双端统一（存储/画布/触摸/分享）
    ├── ui.js             # Canvas 自绘 UI（无 DOM，竖屏布局 + 触摸命中 + 滚动）
    └── preview.js        # 浏览器预览入口（挂 canvas 进 DOM + 调试模式）
```

## 与本机浏览器版（shanhajing/）的关系

| 项 | 浏览器版 | 抖音版 |
|---|---|---|
| 渲染 | DOM | Canvas 自绘 |
| 存档 | localStorage | tt.getStorageSync（key 均为 `shanhajing_save_v1`） |
| 平台 | 任意浏览器 | 抖音小游戏运行时 |
| 引擎 | game.js（含 UI） | core.js（抽离 UI，逻辑一致） |

存档 key 相同：浏览器版玩过的进度可直接被抖音版读取；反之亦然。

## 上架步骤（抖音小游戏）

1. **浏览器跑通**（官方推荐前置）：
   双击打开 `preview.html`，确认游戏可玩、Console 无报错。
   预览默认开启底部调试栏（加速/加资源/全典籍），方便快速测试。

2. **安装抖音开发者工具**：抖音开放平台 → 开发者工具下载（IDE）。

3. **导入工程**：
   - 打开 IDE → 新建/导入项目 → 选择本目录（`shanhajing-douyin/`）。
   - 替换 `project.config.json` 中的 `appid`：
     - 已在[抖音开放平台](https://developer.open-douyin.com)注册小游戏 → 填入真实 AppID；
     - 未注册 → 留空使用 IDE 测试号（仅本地调试，不能上传）。

4. **真机预览**：IDE 右上角"预览"扫码，在抖音 App 内试玩。

5. **上传与提审**：
   - IDE 工具栏"上传"，上传后到抖音开放平台后台：
     - 完善小游戏资料（名称/图标/简介，类目建议：**小游戏-休闲-模拟经营**）；
     - 提交审核（首提需准备软著或承诺函等资质材料，具体以平台当期要求为准）；
     - 审核通过后发布。

## 包体积

纯 JS 方案，全部代码 < 100KB，远低于抖音限制（非分包 ≤ 20MB；分包后主包 ≤ 4MB）。
**无需分包**。若未来加入图片/音频资源，注意总包体即可。

## 已实现玩法（对齐原版机制）

- 资源链：灵禾（人口口粮，受季节影响，冬季 ×0.25）→ 精炼 100 灵禾 = 1 木料 → 木料造草庐/藏经阁 → 学识研典籍 → 解锁樵夫/林场自动化。
- 灵农产出**不受季节影响**（过冬核心）；每族人消耗 0.85 灵禾/t；出生速率 0.01/t。
- 建筑价格递增：`价格 = 基础 × 倍率^(已有数)`；草庐 +2 族人上限；粮仓 +75 灵禾上限。
- 典籍链 8 卷：历法→百草经→狩猎经→山经→金经→算经→营造经→铸器经。
- 轮回系统：族人 > 70 可得气运（每点 +1% 产出，>50 点边际递减）；轮回保留气运、重置家业、自动备份旧档。
- 引导提示：根据当前状态提示"下一步"（饿死→研历法→研百草经→派灵农→建草庐）。

## 代码分层（迁移架构）

```
game.js (入口)
  ├── core.js    createGame() 工厂：G 状态 + 数据表 + tick/build/setJob/research/craft/reincarnate + 存档
  ├── adapter.js 平台抽象：createCanvas / getInfo(安全区) / raf / onTouch* / toast / share / onShow/onHide
  └── ui.js      SHUI.boot(App, Platform)：Canvas 绘制 + 触摸命中 + 滚动 + 模态框 + 调试栏
```

- `core.js` 不依赖 DOM 与平台 API：存档通过 `setStorageAdapter()` 注入（tt / localStorage / 内存）。
- `ui.js` 不直接引用 `tt` 或 `document`：一切平台能力经 `adapter.js` 的 `SHPlatform`。
- 想关闭调试栏：`game.js` 里 `SHUI.boot(App, SHPlatform, { dev: false })`（默认已关；preview.js 里为 true）。

## 测试

```bash
node test-douyin.js    # 17 项引擎回归测试（注入内存存储，模拟 tt 无 localStorage 环境）
```

## 后续可扩展（不影响上架）

- 广告变现：抖音激励视频（`tt.createRewardedVideoAd`）可接入"双倍产出/离线收益"；
- 离线收益：`tt.getSystemInfoSync` + 时间戳差值补发；
- 排行榜：抖音开放数据域（`tt.getOpenDataContext`）做"气运榜"；
- 音效/插画资源：包体预算充足（<20MB）。

## 部署到抖音云托管（获得线上试玩 URL）

> 说明：抖音小游戏的**正式分发**走"IDE 上传 → 提审 → 发布"，玩家在抖音 App 内游玩，**不需要**云托管。
> 云托管用于：① 给朋友/客户分享**浏览器试玩链接**；② 未来加后端（排行榜/存档云同步/广告配置）时部署服务端。
> 本工程为纯前端，直接按下面"静态站点"方式部署即可。

### 方式一：仅静态托管（推荐，最快拿到 URL）

部署文件已备好（`deploy/` 目录）：`Dockerfile` + `nginx.conf`（监听 8000）+ `run.sh`（抖音云托管要求必须有的启动脚本）。

1. **开通抖音云**：浏览器打开 https://cloud.douyin.com/ → 用抖音开放平台账号登录 → 控制台应用列表 → 找到本小游戏（AppID `tt534225ffcd3aa56202`）点"开通抖音云"（1-3 分钟）。
2. **本地构建并验证镜像**（本机需装 Docker）：
   ```bash
   cd shanhajing-douyin
   docker build -f deploy/Dockerfile -t shanhajing-web .
   docker run -p 8000:8000 shanhajing-web
   # 浏览器打开 http://localhost:8000/preview.html 验证可玩
   ```
3. **推送镜像**：登录抖音云 CLI 并切换环境后推送（首次需 `dycloud login`）：
   ```bash
   npm install -g @open-dy/cloud-cli --registry=https://registry.npmjs.org/
   dycloud login
   dycloud env:switch
   docker tag shanhajing-web <镜像仓库地址>/shanhajing-web:<版本>
   dycloud container:push   # 按 CLI 交互上传镜像
   ```
4. **发布**：抖音云控制台 → 服务 → 部署运行 → 发布方式选「镜像部署」→ 选刚上传的镜像版本 → 发布。
5. **访问**：发布后获得默认访问域名（云控制台服务详情页查看）；如要绑定自己的域名，在「自定义域名」里绑定（**域名需完成 ICP 备案**，HTTPS 可选）。

> 备选（不需要 Docker）：抖音云支持 **Git 部署**——把本工程推到 Git 仓库，控制台选择 Git 仓库自动构建部署（Dockerfile 已在仓库内，会自动识别）。

### 方式二：正式上架抖音小游戏（玩家在抖音内玩）

按上文「上架步骤」：IDE 上传 → 后台完善资料（名称/图标/简介，类目：小游戏-休闲-模拟经营）→ 提审 → 发布。
审核通过后玩家在抖音 App 内搜索/推荐位进入，走平台的分发与合规体系，云托管不是必需项。
