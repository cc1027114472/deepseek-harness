# 魔丸 (Mowan Agent) 版本发布与在线更新规范

## 1. 概述与设计原则

本规范规定了**魔丸 (Mowan Agent)** 客户端从**版本号管理、产物构建打包、云端清单发布**到**客户端在线检测、UI更新标识呈现、一键升级安装**的完整技术标准。

### 设计原则
1. **用户无感干扰**：更新检测在后台静默进行，提示采用轻量徽标与微通知，不粗暴弹窗阻断用户当前工作。
2. **数据零丢失**：应用更新仅替换二进制程序及静态资源，用户配置文件、会话日志、自定义预设及密钥绝不触碰。
3. **安全与完整性校验**：所有远端更新包必须校验 SHA-256 哈希，防止网络劫持或下载损坏。
4. **平滑覆盖与自重启**：升级过程支持自动终止旧服务、就地覆盖文件并重新拉起最新版本。

---

## 2. 版本号与命名规范

### 2.1 语义化版本 (SemVer)
版本格式统一为：`vMajor.Minor.Patch`（如 `v1.0.1`）：
* **Major (主版本号)**：系统架构级变动、不兼容的底层通信协议或 Node/Go 运行时重大升级。
* **Minor (次版本号)**：重大功能更新、新功能模块上线、新预设或插件支持。
* **Patch (修订版本号)**：Bug 修复、样式与体验优化、安全补丁。

### 2.2 打包产物标准命名
每次发布需生成以下标准产物：
* **全量安装包**：`Mowan-Agent-Setup-{version}.exe`（例如 `Mowan-Agent-Setup-1.0.1.exe`）
* **最新发布安装包重定向名**：`Mowan-Agent-Setup-latest.exe`
* **版本清单元数据**：`latest.json`
* **可选热更新增量包**：`Mowan-Patch-{version}.zip`（用于仅更新前端 UI 和 JS bundle）

---

## 3. 云端版本清单与分发源规范

魔丸采用 **“自建官方主站优先 + GitHub/CDN 镜像双重容灾”** 的高可用分发架构：

### 3.1 官方多通道更新分发源
1. **官方业务主站 (第一优选 / 国内高速直链)**：
   * **清单地址**：`https://ukapi.cc/downloads/latest.json`
   * **最新安装包直链**：`https://ukapi.cc/downloads/Mowan-Agent-Setup-latest.exe`
   * **服务器物理部署路径**：`154.23.162.32:/var/www/sub2api-downloads/`（Nginx 静态映射）
2. **官方公开 GitHub 仓库 (第二优选 / 全球容灾备份)**：
   * **仓库地址**：`https://github.com/wensheng-ai/mowan-agent-releases`
   * **清单地址 (GitHub Raw)**：`https://raw.githubusercontent.com/wensheng-ai/mowan-agent-releases/main/releases/latest.json`
   * **Release 资产地址**：`https://github.com/wensheng-ai/mowan-agent-releases/releases/latest/download/Mowan-Agent-Setup-latest.exe`
3. **国内 CDN 加速兜底 (jsDelivr)**：
   * **镜像地址**：`https://cdn.jsdelivr.net/gh/wensheng-ai/mowan-agent-releases@main/releases/latest.json`

### 3.2 latest.json 字段规范与示例

```json
{
  "version": "2.0.3",
  "releaseDate": "2026-09-25",
  "minSupportedVersion": "1.0.0",
  "mandatory": false,
  "downloadUrl": "https://ukapi.cc/downloads/Mowan-Agent-Setup-latest.exe",
  "backupDownloadUrl": "https://github.com/wensheng-ai/mowan-agent-releases/releases/download/v2.0.3/Mowan-Agent-Setup-2.0.3.exe",
  "sha256": "115a90f374c323e2dfec10d036ea755feea511ca36adca9fb77b3c7e9698ee1c",
  "fileSize": 182832905,
  "changelog": [
    "左侧栏版本徽章支持动态更新感知与一键直达设置",
    "全面优化 sub2api / ukapi.cc 一键导入魔丸体验",
    "本地 WebServer 增加 CORS 跨域与 Chrome PNA 预检支持",
    "性能提升与已知问题修复"
  ]
}
```

### 3.2 字段说明
| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `version` | string | 是 | 最新版本号（如 `1.0.1`，无前缀 `v`） |
| `releaseDate` | string | 是 | 发布日期，格式 `YYYY-MM-DD` |
| `minSupportedVersion` | string | 否 | 支持跨版本直接增量覆盖的最低版本，低于此版本需强制全量安装 |
| `mandatory` | boolean | 是 | 是否强制升级（若为 true，旧版本进入阻断式升级提醒） |
| `downloadUrl` | string | 是 | 全量安装包下载直链 |
| `sha256` | string | 是 | 全量安装包的完整 SHA-256 校验和（小写） |
| `fileSize` | number | 否 | 文件大小（字节数，用于计算下载百分比） |
| `patchUrl` | string | 否 | 前端增量包直链（免全量安装） |
| `patchSha256` | string | 否 | 增量包的 SHA-256 校验和 |
| `changelog` | array/string | 是 | 版本更新日志，支持 Markdown 或字符串数组 |

---

## 4. 客户端更新检测与 UI 表现规范

### 4.1 检测机制与触发时机
1. **静默自检**：
   * 客户端主服务启动成功后，延迟 **10 秒** 发起第一次异步静默检测。
   * 客户端持续运行时，每隔 **24 小时** 静默轮询一次。
2. **用户主动检查**：
   * 在「设置 -> 关于魔丸」页面提供【检查更新】按钮，点击后立即向远端发起实时检测。
3. **版本比对规则**：
   * 严格按照 SemVer 规则：当 `latest.version > current.version` 时，标记为存在可用更新。

### 4.2 界面视觉与交互规范

#### (1) 侧边栏/导航栏（全局更新标识与动态入口）
* **左侧栏版本动态胶囊（最推荐交互入口）**：
  * **日常状态**：左侧栏魔丸 Logo 旁显示低调中性灰版本号胶囊（如 `v2.0.3`），与整体深色/浅色 UI 自然融合，鼠标悬停 Tooltip 提示 `当前版本 v2.0.3 (点击查看或检查更新)`。
  * **发现新版本**：自动切换为渐变红橙呼吸发光胶囊（`#ff4d4f` → `#fa541c`），伴随白色微光呼吸脉冲与闪烁白点（White Pulse Dot），文案动态呈现 `🔥 发现新版本 vX.Y.Z NEW`。
  * **直达交互**：点击版本胶囊即可直接通过前端事件 `dsh:open-settings` 直达设置与更新面板，无需层层翻找菜单。
* **常驻设置齿轮**：发现新版本后，左下角/顶部的设置图标右上角同步点亮 **呼吸发光红点（Red Dot Badge）**。
* **悬浮提示 (Tooltip)**：鼠标悬停在图标或胶囊上显示：`“发现新版本 vX.Y.Z，点击立即更新”`。

#### (2) 顶部轻量微通告 (Banner)
* 客户端首页或设置页顶部展示单行提示条：
  > 💡 **发现新版本 v1.0.1**：公网穿透支持自定义域名，长会话性能大幅提升。[查看更新] [稍后提醒]
* 点击【稍后提醒】后，该版本在 24 小时内不再主动弹出顶部横幅（红点徽标仍保留）。

#### (3) 系统托盘菜单 (Windows Tray)
* Go 托盘程序在检测到新版本时，动态在右键菜单顶部插入：
  * `★ 发现新版本 v1.0.1 (点击更新)`
* 伴随发出系统原生气泡通知（Windows Balloon/Toast）：
  * 标题：`魔丸已发布新版本`
  * 内容：`新版本 v1.0.1 已准备就绪，点击打开控制台升级。`

#### (4) 「设置 -> 关于魔丸」面板
* 展示当前软件版本与发行通道。
* 当有新版本时，展开版本更新详情卡片：
  * 版本标签：`v1.0.1 (最新版)`
  * 格式化渲染更新日志（Markdown 列表）
  * 主动作按钮：**【立即下载并更新】**
  * 副动作：**【在浏览器中下载】** / **【忽略该版本】**

---

## 5. 升级下载与执行模式规范

### 5.1 方案 A：全量安装包升级模式（适用核心运行时变动）
1. **下载阶段**：
   * 前端点击【立即下载并更新】后，后端下载安装包至系统临时目录 `%TEMP%\mowan-update\Mowan-Agent-Setup-{version}.exe`。
   * 前端显示动态百分比进度条（已下载 MB / 总大小 MB，下载速度）。
2. **校验阶段**：
   * 下载完成后计算文件 SHA-256，与 `latest.json` 中的 `sha256` 严格比对。
   * 若校验不通过，删除临时文件并报错提示重新下载。
3. **执行升级与拉起**：
   * 提示用户：`“新版本已准备就绪，点击确定将重启并完成升级。”`
   * 点击确定后：
     1. 主进程调用更新程序：
        ```powershell
        Mowan-Agent-Setup-{version}.exe /UPGRADE /AUTO-RESTART
        ```
     2. 本地 Node 进程与 Go Launcher 优雅退出，释放所有文件占用。
     3. 安装程序静默解压覆盖现有安装目录文件，并在完成后重新启动 `Mowan-Agent.exe`。

### 5.2 方案 B：资源与前端热更新模式（无感极速更新）
* 若仅调整前端 UI、Prompt 或部分插件脚本，且 `latest.json` 提供了 `patchUrl`：
  1. 下载增量包 `Mowan-Patch-{version}.zip`（通常小于 20MB）。
  2. 校验通过后，解压覆盖应用根目录对应的静态资源与 JS Bundle。
  3. 通过 Launcher 内置的 `Restart()` 重新拉起 Node 服务。
  4. 浏览器端调用 `location.reload()`，用户无需重新执行安装程序，在数秒内即可完成升级。

---

## 6. 发布上线流程与服务器分发指南

### 6.1 核心分发机制说明（必读）
* **安装包为什么不走 Git**：安装包（`Mowan-Agent-Setup-latest.exe`）体积约 175MB，属于大型 Windows 可执行文件，已被 Git 严格忽略，**无需也不应提交进 `sub2api` 代码库**。
* **ukapi.cc 如何分发下载**：生产服务器 `154.23.162.32` 上的 Nginx 已经配置了极速静态映射：
  ```nginx
  location /downloads/ {
      alias /var/www/sub2api-downloads/;
      sendfile on;
  }
  ```
* **发版的本质动作**：将打包好的 `.exe` 和 `latest.json` 清单通过 SFTP 上传到服务器的 `/var/www/sub2api-downloads/` 目录，外网用户访问 `https://ukapi.cc/downloads/...` 即可瞬间生效（无需重启 Docker 或后端服务）。

---

### 6.2 一键全自动发版命令（最推荐 ⭐⭐⭐⭐⭐）
当需要发布新版本时（例如 `2.0.2`），直接在项目根目录执行：
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\publish-release.ps1 -Version "2.0.2" -Changelog "✨ 新增特性A;🚀 性能优化B"
```

**该脚本将全自动依次完成全部工作**：
1. **自动更新版本号**：更新源码 `updater.ts` 中的 `CURRENT_VERSION = '2.0.2'`；
2. **自动构建安装包**：编译 launcher、installer 并组装 SFX 生成最新 `Mowan-Agent-Setup-2.0.2.exe` 与 `latest.exe`；
3. **自动计算哈希**：精确获取安装包 SHA-256 与字节大小；
4. **自动同步 sub2api 项目**：拷贝安装包与 `latest.json` 到本地 `sub2api/frontend/public/downloads/`，并自动更新前端 `agentDownload.ts` 界面展示常量；
5. **自动发布 GitHub Release**：向官方组织 `wensheng-ai/mowan-agent-releases` 创建 Release 并上传安装包；
6. **自动更新 GitHub 清单**：更新推送云端 `latest.json`；
7. **自动直传部署 ukapi.cc 服务器**：通过 SFTP 直接将安装包和 `latest.json` 上传至服务器 `/var/www/sub2api-downloads/`，公网立即秒级可测可下！

---

### 6.3 独立单独部署服务器命令（可选）
若安装包已经打包好，只想重新部署/同步至 `ukapi.cc` 服务器，只需执行：
```powershell
python .\scripts\upload-to-server.py 2.0.2
```

---

### 6.4 发布后验收验证 CheckList
- [ ] **1. 验证公网清单**：浏览器访问 `https://ukapi.cc/downloads/latest.json`，确认版本号和 SHA-256 正确。
- [ ] **2. 验证下载直链**：浏览器访问 `https://ukapi.cc/downloads/Mowan-Agent-Setup-latest.exe`，确认下载正常开始。
- [ ] **3. 验证客户端感知**：打开本地旧版本客户端，确认设置齿轮亮起红点，点击【检查更新】能正确拉取到新版本和日志。

---

## 7. 外部一键导入与通信安全规范 (CORS, Chrome PNA 与深度链接)

为了支撑外部站点（如 `ukapi.cc` 或其它云端管理平台）一键将 Provider 配置与 API Key 自动导入魔丸客户端，系统定义了如下通信与穿透标准：

### 7.1 双轨一键导入机制 (Dual-Track Import)
公网 HTTPS 网页直接发起 `fetch("http://127.0.0.1:3090/...")` 会受到浏览器严格的 **Chrome Private Network Access (PNA)** 与混合内容安全策略拦截。因此客户端与 Web 端采用双轨策略：
1. **轨道 1：本地客户端唤醒 (`mowan://` Deeplink)**：
   - 网页创建隐藏 `iframe` 发起 `mowan://launch` 协议调用，通过 Windows 注册表唤醒未运行的本地客户端；
2. **轨道 2：用户手势顶层导航 (`window.open`)**：
   - 用户点击一键配置按钮后，通过 `window.open("http://127.0.0.1:3090/#/settings?action=import-provider&...")` 触发顶层标签页导航；
   - 顶层手势导航完全豁免浏览器的 PNA 预检限制，魔丸 Web 控制台在加载时解析 URL 参数并自动写入配置、弹出成功提示。

### 7.2 WebServer PNA 与跨域响应标准
本地嵌入式 WebServer（`@deepseek-ai/dsh-webserver`）对所有进入的 HTTP 请求统一配置响应头：
* **OPTIONS 预检**：统一返回 `HTTP 204 No Content`；
* **关键响应头**：
  * `Access-Control-Allow-Origin: *`
  * `Access-Control-Allow-Private-Network: true`（响应 Chrome PNA 规范）
  * `Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE, PATCH`
  * `Access-Control-Allow-Headers: Authorization, Content-Type, X-Requested-With, Origin, Accept`

### 7.3 Windows 原生协议注册规范
安装程序（`Mowan-Agent-Setup.exe`）在执行安装或覆盖升级时，向当前用户注册表自动注册 `mowan` URL 协议：
* **注册表项**：`HKCU\Software\Classes\mowan`
* **协议默认值**：`URL:Mowan Protocol`
* **标记**：`URL Protocol` = `""`
* **打开指令**：`HKCU\Software\Classes\mowan\shell\open\command` -> `"{InstallDir}\Mowan-Agent.exe" "%1"`

