/**
 * Localization dictionaries for the Tunnel / Remote Access settings section.
 * @module @deepseek-ai/dsh-client-ui-tunnel/client/locales
 */

export const zh = {
  nav: '远程访问',
  title: '远程与公网穿透',
  description: '通过 Cloudflare Tunnel 快速将本地 DeepSeek Harness 映射至公网，支持手机、平板等外网设备操控，内置访问口令双重防护。',
  statusLabel: '运行状态',
  statusRunning: '运行中',
  statusStopped: '已停止',
  statusInstalling: '正在安装组件...',
  actionStart: '开启远程穿透',
  actionStop: '停止穿透',
  actionInstall: '安装 Cloudflared 客户端',
  actionResetToken: '重置访问口令',
  actionCopyUrl: '复制公网地址',
  actionCopyToken: '复制口令',
  actionShowQr: '手机扫码直连',
  urlLabel: '公网访问地址',
  tokenLabel: '访问安全口令 (Token)',
  tokenTip: '来自公网的访问必须携带此 Token，本地访问自动放行。',
  copied: '已复制到剪贴板',
  qrModalTitle: '手机扫码直连',
  qrModalTip: '使用手机相机或扫码工具扫描下方二维码，自动携带口令打开操控界面。',
  qrModalClose: '关闭',
  notInstalledTip: '检测到本机尚未安装 cloudflared 组件，点击上方按钮可自动下载安装。',
}

export const en = {
  nav: 'Remote Access',
  title: 'Remote & Public Tunnel',
  description: 'Expose local DeepSeek Harness via Cloudflare Tunnel to access and control from mobile phones or remote devices with token authentication.',
  statusLabel: 'Status',
  statusRunning: 'Running',
  statusStopped: 'Stopped',
  statusInstalling: 'Installing component...',
  actionStart: 'Start Tunnel',
  actionStop: 'Stop Tunnel',
  actionInstall: 'Install Cloudflared',
  actionResetToken: 'Reset Token',
  actionCopyUrl: 'Copy Public URL',
  actionCopyToken: 'Copy Token',
  actionShowQr: 'Scan QR to Connect',
  urlLabel: 'Public URL',
  tokenLabel: 'Access Security Token',
  tokenTip: 'Requests arriving over the public tunnel must provide this token. Local access is always authorized.',
  copied: 'Copied to clipboard',
  qrModalTitle: 'Scan QR to Connect',
  qrModalTip: 'Scan with your mobile camera or QR reader to open the GUI with pre-filled auth token.',
  qrModalClose: 'Close',
  notInstalledTip: 'Cloudflared executable not found on this machine. Click the button above to auto-install.',
}

export type TunnelKey = keyof typeof zh
