# 魔丸 (Mowan Agent) 打包与发布规范指南

本文档规定了魔丸 (Mowan Agent) 客户端在 Windows 环境下的平铺打包、混淆保护、压缩封装、版本发布流程，以及**防止打包体积异常膨胀的防线与排查 SOP**。

---

## 1. 核心架构与打包流水线

```
源码 / Workspace
   │
   ├── 1. launcher / uninstaller (C++ Native 编译)
   ├── 2. runtime (嵌入式独立 Node.js 运行时)
   ├── 3. bundle-flat.mjs (平铺零软链接 node_modules，提取生产依赖)
   ├── 4. obfuscate-flat-bundle.mjs (自研核心模块混淆与源码映射擦除)
   ├── 5. 7z a -tzip -mx5 (多线程高压缩比归档生成 payload.zip)
   └── 6. installer-base (Win32 原生轻量自解压与安装器封装)
         │
         ▼
    Mowan-Agent-Setup.exe (最终独立单文件安装包)
```

---

## 2. 体积基线预算与红线限制 (Size Budgets)

为保障客户端用户的下载体验、静默更新效率以及 GitHub Release 的单文件限制（2 GB 上限），严格执行以下体积预算：

| 阶段 / 产物 | 正常健康区间 | 预警阈值 | 熔断阈值 (Hard Gate) | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| **flat-bundle 未压缩目录** | 650 MB ~ 800 MB | > 950 MB | **> 1200 MB** | 超出即自动中断打包 |
| **7z payload 压缩包** | 240 MB ~ 300 MB | > 400 MB | **> 550 MB** | 归档核心体积 |
| **最终 Setup.exe 安装包** | 250 MB ~ 350 MB | > 450 MB | **> 600 MB** | 超出即阻断发布并报错 |

---

## 3. 事故复盘与根本防范：2.4GB 体积爆炸根因

### 根因复盘
在历史版本打包脚本中，曾存在向 `apps/web/dist` 拷贝 `Setup.exe` 的逻辑：
```powershell
# ❌ 错误历史代码示例（严禁复现）：
Copy-Item $setupExe "$root\apps\web\dist\Mowan-Agent-Setup.exe" -Force
```
这导致在后续执行 `bundle-flat.mjs` 打包时：
1. `copyCleanSourceDir('apps', ...)` 将 `apps/web/dist` 中的上一次安装包（约 300MB~400MB）复制到了平铺包中；
2. 随后又在 `Hoisting workspace packages into node_modules/@deepseek-ai` 阶段，将包含安装包的 `apps/web` 整个复制到了 `node_modules/@deepseek-ai/dsh-web-frontend` 中；
3. 每次重复打包都会成倍膨胀（300MB → 600MB → 1.2GB → 2.5GB），最终生成高达 2.56GB 的巨无霸安装包，直接触发 GitHub Release 单文件 2GB 的硬拒绝拦截（HTTP 422 Validation Failed）。

### 严格禁令与红线
1. **严禁将任何构建产物（`.exe`、`.zip`、`.tar`）放置在源码或静态资源目录（如 `apps/`、`packages/`、`vendor/`）下**。构建产物只能存放在顶层 `dist/` 或临时目录。
2. **严禁在代码中写反向拷贝到前端资产目录的逻辑**。
3. `bundle-flat.mjs` 在遍历文件时，必须统一过滤 `.exe`、`.zip`、`.tar`，严防二进制产物被误打包。

---

## 4. 三级自动化熔断防御机制

项目已在代码层配置了自动化熔断门禁，无需人工记忆：

1. **第一道防线：文件收集过滤器 (`scripts/bundle-flat.mjs`)**
   - 递归拷贝源码和依赖时，自动跳过所有 `.exe`, `.zip`, `.tar`, `.map`, `.ts`, `.log` 文件。
2. **第二道防线：平铺体积熔断门禁 (`scripts/bundle-flat.mjs`)**
   - 打包结束时自动审计 `dist/flat-bundle` 真实体积。
   - 若体积 `> 1200 MB`，直接抛出 `FATAL` 错误并终止打包，拒绝生成压缩包。
3. **第三道防线：安装包体积熔断门禁 (`scripts/build-setup-exe.ps1`)**
   - 封装完成后检验最终 `Setup.exe` 体积。
   - 若安装包 `> 600 MB`，直接阻断构建与发布，禁止向 GitHub、官网服务器（ukapi.cc）推送异常大文件。

---

## 5. 体积异常快速排查 SOP

若未来触发体积预警或需要排查依赖体积，可直接运行以下命令：

### 5.1 快速定位平铺目录中占用最大的依赖包
在 PowerShell 中运行：
```powershell
node -e '
const fs = require("fs");
const path = require("path");
function getDirSize(dir) {
  let size = 0;
  try {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) size += getDirSize(full);
      else if (item.isFile()) size += fs.statSync(full).size;
    }
  } catch {}
  return size;
}
const nm = path.join(process.cwd(), "dist", "flat-bundle", "node_modules");
const results = [];
for (const e of fs.readdirSync(nm, { withFileTypes: true })) {
  const full = path.join(nm, e.name);
  if (e.isDirectory()) {
    if (e.name.startsWith("@")) {
      for (const se of fs.readdirSync(full, { withFileTypes: true })) {
        results.push({ name: e.name + "/" + se.name, sizeMB: (getDirSize(path.join(full, se.name)) / 1048576).toFixed(1) });
      }
    } else {
      results.push({ name: e.name, sizeMB: (getDirSize(full) / 1048576).toFixed(1) });
    }
  }
}
results.sort((a,b) => parseFloat(b.sizeMB) - parseFloat(a.sizeMB));
console.table(results.slice(0, 20));
'
```

### 5.2 扫描项目中是否有误存的大文件
```powershell
Get-ChildItem -Path apps, packages -Recurse | Where-Object { $_.Length -gt 10MB } | Select-Object FullName, Length
```

---

## 6. 标准发布命令

一切准备就绪后，执行官方统一自动化发布脚本（自动执行全量构建、体积检验、哈希生成、配置同步、GitHub Release、服务器 SFTP 极速部署）：

```powershell
pwsh -NoProfile -File .\scripts\publish-release.ps1 -Version "x.y.z" -Changelog "✨ 更新说明条目1;🛡️ 更新说明条目2"
```
