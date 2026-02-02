# Subtitle Extractor

一个 Chrome 插件，用于提取 **B站** 和 **YouTube** 视频字幕，并通过 DOM 暴露数据供其他插件（如 Claude）读取和分析。

## 功能

- 支持 **Bilibili** 和 **YouTube** 双平台
- 自动检测并捕获视频字幕
- 支持多语言字幕选择
- 字幕数据通过 DOM 暴露，方便其他插件访问
- 可配合 Claude 插件进行视频内容总结

## 安装

### 从源码安装（开发者模式）

1. 克隆此仓库：
   ```bash
   git clone https://github.com/hgao1604/ExtractSubtitles.git
   ```

2. 打开 Chrome 浏览器，访问 `chrome://extensions/`

3. 开启右上角的**开发者模式**

4. 点击**加载已解压的扩展程序**，选择 `ExtractSubtitles` 文件夹

5. 插件图标会出现在工具栏中

## 使用方法

### Bilibili

1. 打开 B站视频页面
2. 点击工具栏中的插件图标
3. 选择字幕语言
4. 点击**提取字幕**按钮

### YouTube

1. 打开 YouTube 视频页面
2. **开启字幕**（点击 CC 按钮）
3. 播放视频几秒钟，等待右上角出现绿色提示 "字幕已捕获"
4. 点击插件图标，选择语言并提取

> **注意**: YouTube 使用 XHR 拦截方案，需要先开启字幕并播放视频才能捕获字幕数据。

## 访问提取的数据

在浏览器控制台中可以访问字幕数据：

```javascript
// 获取字幕数据
const data = JSON.parse(
  document.querySelector('#subtitle-extractor-data')
    ?.getAttribute('data-subtitles') || '{}'
);

console.log(data);
// {
//   platform: 'bilibili' | 'youtube',
//   videoId: 'BV1xx...' | 'dQw4w9WgXcQ',
//   title: '视频标题',
//   author: '作者名',
//   language: 'zh-CN' | 'en',
//   extractedAt: '2026-02-01T00:00:00.000Z',
//   subtitles: [
//     { start: 0, end: 2.5, text: '字幕内容' },
//     ...
//   ]
// }
```

### 配合 Claude 插件使用

在 Claude 的 Chrome 插件中创建快捷指令：

- **名称**: `summarize-subtitles`
- **提示词**:
  ```
  读取页面中 #subtitle-extractor-data 元素的 data-subtitles 属性中的字幕数据，
  总结视频内容并列出要点。
  ```

## 项目结构

```
ExtractSubtitles/
├── manifest.json                # 插件配置
├── background.js                # Service Worker
├── popup/
│   ├── popup.html              # 弹出界面
│   ├── popup.css               # 样式
│   └── popup.js                # 界面逻辑
├── content-scripts/
│   ├── shared.js               # 共享工具
│   ├── bilibili.js             # B站内容脚本
│   └── youtube.js              # YouTube内容脚本
└── injected/
    ├── bilibili-injector.js    # B站页面注入脚本
    └── youtube-injector.js     # YouTube页面注入脚本（XHR拦截）
```

## 工作原理

### Bilibili

1. **Injected Script** 访问 `window.__INITIAL_STATE__` 获取视频信息
2. **Background Service Worker** 调用 B站 API 获取字幕
3. 字幕数据存储在 DOM 元素中

### YouTube

1. **Injected Script** 安装 XHR 拦截器
2. 拦截 YouTube 播放器的 `timedtext` 请求
3. 捕获服务器返回的字幕数据
4. 通过 `postMessage` 传递给 Content Script

> YouTube 采用 XHR 拦截方案是因为直接请求字幕 API 需要 POT (Proof of Token) 参数，无法绕过。

## 注意事项

### Bilibili
- 视频必须有 CC 字幕才能提取
- 建议在登录状态下使用

### YouTube
- 必须**开启字幕**并**播放视频**才能捕获
- 切换视频后需等待几秒重新捕获
- 如遇到问题，尝试刷新页面

## License

MIT

## 贡献

欢迎提交 Pull Request！
