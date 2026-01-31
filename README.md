# Bilibili Subtitle Extractor

一个Chrome插件，用于提取B站视频字幕，并通过DOM暴露数据供其他插件（如Claude）读取和分析。

## 功能

- 提取B站视频的CC字幕
- 支持多语言字幕选择
- 字幕数据通过DOM暴露，方便其他插件访问
- 可配合Claude插件进行视频内容总结

## 安装

### 从源码安装（开发者模式）

1. 克隆此仓库：
   ```bash
   git clone https://github.com/hgao1604/ExtractSubtitles.git
   ```

2. 打开Chrome浏览器，访问 `chrome://extensions/`

3. 开启右上角的**开发者模式**

4. 点击**加载已解压的扩展程序**，选择 `ExtractSubtitles` 文件夹

5. 插件图标会出现在工具栏中

## 使用方法

1. 打开B站视频页面
2. 点击工具栏中的**Subtitle Extractor**图标
3. 选择字幕语言
4. 点击**提取字幕**按钮
5. 提取完成后，字幕数据会存储在页面DOM中

### 访问提取的数据

在浏览器控制台中可以访问字幕数据：

```javascript
// 获取字幕数据
const data = JSON.parse(
  document.querySelector('#subtitle-extractor-data')
    .getAttribute('data-subtitles')
);

// 数据结构
console.log(data);
// {
//   platform: 'bilibili',
//   videoId: 'BV1xx...',
//   title: '视频标题',
//   language: 'zh-CN',
//   extractedAt: '2024-01-01T00:00:00.000Z',
//   subtitles: [
//     { start: 0, end: 2.5, text: '字幕内容' },
//     ...
//   ]
// }
```

### 配合Claude插件使用

在Claude的Chrome插件中创建快捷指令：

- **名称**: `summarize-subtitles`
- **提示词**:
  ```
  读取页面中 #subtitle-extractor-data 元素的 data-subtitles 属性中的字幕数据，
  总结视频内容并列出要点。
  ```

## 项目结构

```
ExtractSubtitles/
├── manifest.json              # 插件配置
├── background.js              # Service Worker
├── popup/
│   ├── popup.html            # 弹出界面
│   ├── popup.css             # 样式
│   └── popup.js              # 界面逻辑
├── content-scripts/
│   ├── shared.js             # 共享工具
│   └── bilibili.js           # B站内容脚本
└── injected/
    └── bilibili-injector.js  # B站页面注入脚本
```

## 工作原理

1. **Content Script** 注入到B站视频页面，与插件弹窗通信
2. **Injected Script** 在页面上下文中运行，访问 `window.__INITIAL_STATE__` 获取视频信息
3. **Background Service Worker** 处理跨域API请求
4. 提取的字幕存储在隐藏的DOM元素中，供其他插件访问

## 注意事项

- 视频必须有CC字幕才能提取
- 部分视频可能没有字幕或字幕受限
- 建议在B站登录状态下使用

## License

MIT

## 贡献

欢迎提交Pull Request！
