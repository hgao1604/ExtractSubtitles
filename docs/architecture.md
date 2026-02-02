# 插件架构文档

## 一、整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Chrome 浏览器                               │
│                                                                      │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐              │
│  │  B站页面    │    │ YouTube页面 │    │   其他页面   │              │
│  │             │    │             │    │             │              │
│  │ bilibili.js │    │ youtube.js  │    │  (无脚本)   │              │
│  │     +       │    │     +       │    │             │              │
│  │ injector.js │    │ injector.js │    │             │              │
│  └──────┬──────┘    └──────┬──────┘    └─────────────┘              │
│         │                  │                                         │
│         └────────┬─────────┘                                         │
│                  ▼                                                   │
│         ┌─────────────────┐         ┌─────────────┐                 │
│         │  background.js  │◄───────►│   Popup     │                 │
│         │  (Service Worker)│         │  popup.js   │                 │
│         │                 │         │             │                 │
│         │  • API 请求     │         │  • 显示状态  │                 │
│         │  • Badge 控制   │         │  • 用户交互  │                 │
│         └─────────────────┘         └─────────────┘                 │
└─────────────────────────────────────────────────────────────────────┘
```

## 二、文件职责

| 文件 | 职责 |
|------|------|
| `manifest.json` | 插件配置、权限声明 |
| `background.js` | API 请求代理、Badge 控制 |
| `popup/popup.js` | 用户界面交互 |
| `popup/popup.html` | 弹出界面 HTML |
| `popup/popup.css` | 弹出界面样式 |
| `content-scripts/bilibili.js` | B站页面逻辑 |
| `content-scripts/youtube.js` | YouTube 页面逻辑 |
| `content-scripts/shared.js` | 共享工具函数 |
| `injected/bilibili-injector.js` | 读取 B站页面变量 |
| `injected/youtube-injector.js` | XHR 拦截、读取 YouTube 变量 |

## 三、为什么需要 Injector 脚本？

Chrome 扩展的 Content Script 运行在**隔离的上下文**中，无法访问页面的 `window` 对象。

| 脚本类型 | 运行环境 | 能做什么 | 不能做什么 |
|---------|---------|---------|-----------|
| Content Script | 插件上下文 | 使用 Chrome API、与 Popup 通信 | 访问页面的 `window` |
| Injector Script | 页面上下文 | 访问 `window` 变量、修改 XHR | 使用 Chrome API |

**通信方式**：使用 `window.postMessage()` 在两个上下文之间传递消息。

## 四、B站流程

```
用户打开 B站视频
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ 1. Content Script 加载 (bilibili.js)                         │
│    └─► 注入 bilibili-injector.js 到页面                      │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ 2. Injector 读取页面变量                                      │
│    └─► window.__INITIAL_STATE__ 获取 bvid, cid               │
│    └─► 发送 VIDEO_INFO_READY 消息给 Content Script            │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ 3. Content Script 请求字幕列表                                │
│    └─► 发送消息给 Background                                  │
│    └─► Background 调用 B站 API                                │
│        https://api.bilibili.com/x/player/wbi/v2              │
│    └─► 返回字幕列表 [{lan: 'zh-CN', subtitle_url: '...'}]    │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ 4. 设置 Badge                                                 │
│    ├─► 有字幕 → 🟢 ✓ (绿色)                                   │
│    └─► 无字幕 → 🔴 ! (红色)                                   │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ 5. 用户点击插件图标，打开 Popup                               │
│    └─► Popup 发送 GET_STATUS 消息                             │
│    └─► Content Script 返回状态（视频信息、字幕列表）          │
│    └─► Popup 显示语言选择下拉框                               │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ 6. 用户选择语言，点击"提取字幕"                               │
│    └─► Content Script 请求字幕内容                            │
│    └─► Background 下载字幕 JSON                               │
│    └─► Content Script 写入 DOM                                │
│        <div id="subtitle-extractor-data"                     │
│             data-subtitles="{...}">                          │
└──────────────────────────────────────────────────────────────┘
```

## 五、YouTube 流程

### 5.1 为什么 YouTube 需要 XHR 拦截？

YouTube 使用 **POT (Proof of Token)** 保护机制，直接请求字幕 API 会返回空数据。

**解决方案**：拦截 YouTube 播放器自己发起的字幕请求，获取服务器返回的完整数据。

### 5.2 流程图

```
用户打开 YouTube 视频
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ 1. Content Script 加载 (youtube.js)                          │
│    └─► 注入 youtube-injector.js 到页面                       │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ 2. Injector 安装 XHR 拦截器                                   │
│    └─► 重写 XMLHttpRequest.prototype.open/send               │
│    └─► 监听所有包含 'timedtext' 的请求                        │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ 3. Injector 读取视频信息                                      │
│    └─► window.ytInitialPlayerResponse                        │
│    └─► 发送 VIDEO_INFO_READY 消息（包含 captionTracks）       │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ 4. Content Script 延迟设置 Badge (600ms)                      │
│    └─► 有字幕轨道但未捕获 → 🔴 ! (红色)                       │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ 5. 用户开启字幕 (点击 CC 按钮)                                │
│    └─► YouTube 播放器发起字幕请求                             │
│    └─► XHR 拦截器捕获响应                                     │
│    └─► 解析字幕数据                                           │
│    └─► 发送 SUBTITLE_CAPTURED 消息                            │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ 6. Content Script 处理捕获的字幕（延迟 500ms）                │
│    └─► 存储到 capturedSubtitles 数组                          │
│    └─► 设置 Badge → 🟢 ✓ (绿色)                               │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ 7. 用户点击插件图标，打开 Popup                               │
│    └─► 显示已捕获的语言列表                                   │
│    └─► 用户点击"提取字幕"                                     │
│    └─► Content Script 写入 DOM                                │
└──────────────────────────────────────────────────────────────┘
```

### 5.3 XHR 拦截原理

```javascript
// 保存原始方法
const originalXHROpen = XMLHttpRequest.prototype.open;
const originalXHRSend = XMLHttpRequest.prototype.send;

// 重写 open 方法：记录请求 URL
XMLHttpRequest.prototype.open = function(method, url, ...args) {
  this._requestUrl = url;
  return originalXHROpen.apply(this, [method, url, ...args]);
};

// 重写 send 方法：拦截字幕请求
XMLHttpRequest.prototype.send = function(...args) {
  const url = this._requestUrl;

  if (url && url.includes('timedtext')) {
    this.addEventListener('load', function() {
      // 捕获字幕数据
    });
  }

  return originalXHRSend.apply(this, args);
};
```

## 六、Badge 状态机

```
┌─────────────────────────────────────────────────────────────┐
│                      Badge 状态机                            │
│                                                              │
│                    ┌─────────────┐                          │
│                    │   无标记    │◄──── 非视频页面           │
│                    └─────────────┘                          │
│                           │                                  │
│              进入视频页面 │                                  │
│                           ▼                                  │
│   ┌─────────────────────────────────────────────┐           │
│   │                                              │           │
│   │  B站: 检测字幕列表    YouTube: 检测字幕轨道  │           │
│   │         │                      │             │           │
│   │         ▼                      ▼             │           │
│   │    ┌────┴────┐           ┌────┴────┐        │           │
│   │    │         │           │         │        │           │
│   │   有字幕   无字幕       有轨道   无轨道      │           │
│   │    │         │           │         │        │           │
│   │    ▼         ▼           ▼         ▼        │           │
│   │  🟢 ✓     🔴 !        🔴 !      (无)       │           │
│   │                          │                   │           │
│   │                    用户开启字幕              │           │
│   │                    字幕被捕获                │           │
│   │                          │                   │           │
│   │                          ▼                   │           │
│   │                        🟢 ✓                  │           │
│   │                                              │           │
│   └─────────────────────────────────────────────┘           │
│                                                              │
│              URL 变化时清除 Badge                            │
└─────────────────────────────────────────────────────────────┘
```

## 七、消息类型汇总

| 消息 | 发送方 | 接收方 | 用途 |
|------|--------|--------|------|
| `SET_BADGE` | Content Script | Background | 设置 Badge 状态 |
| `GET_STATUS` | Popup | Content Script | 获取当前状态 |
| `EXTRACT_SUBTITLE` | Popup | Content Script | 提取字幕 |
| `REFRESH_INFO` | Popup | Content Script | 刷新视频信息 |
| `VIDEO_INFO_READY` | Injector | Content Script | 视频信息就绪 |
| `SUBTITLE_CAPTURED` | Injector | Content Script | 字幕已捕获 (YouTube) |
| `FETCH_BILIBILI_SUBTITLE_LIST` | Content Script | Background | 获取 B站字幕列表 |
| `FETCH_BILIBILI_SUBTITLE_CONTENT` | Content Script | Background | 获取 B站字幕内容 |

## 八、数据结构

### 8.1 导出的字幕数据格式

```javascript
{
  "platform": "bilibili" | "youtube",
  "videoId": "BV1xx..." | "dQw4w9WgXcQ",
  "title": "视频标题",
  "author": "作者名",
  "language": "zh-CN" | "en",
  "extractedAt": "2024-01-01T00:00:00.000Z",
  "subtitles": [
    { "start": 0, "end": 2.5, "text": "字幕内容" },
    { "start": 2.5, "end": 5.0, "text": "更多字幕" }
  ]
}
```

### 8.2 访问字幕数据

```javascript
const data = JSON.parse(
  document.querySelector('#subtitle-extractor-data')
    ?.getAttribute('data-subtitles') || '{}'
);
```

## 九、时序处理

为避免竞态问题，YouTube 的消息处理使用了延迟机制：

```
时间线 ────────────────────────────────────────────────────────────►
    0ms        500ms       600ms
     │           │           │
     ▼           ▼           ▼
VIDEO_INFO   SUBTITLE    VIDEO_INFO
  到达       CAPTURED     Badge检查
     │        处理完成         │
     │           │           │
     │           ▼           ▼
     │        🟢 ✓       检查 capturedSubtitles
     │        设置        │
     │                   ├─► 有数据 → 不设置（保持绿色）
     │                   └─► 无数据 → 🔴 ! 设置
```
