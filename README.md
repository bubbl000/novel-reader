# 📚 Novel Reader - 小说阅读器

基于 **Rust + Tauri 2 + React 18** 技术栈的跨平台桌面小说阅读器，支持 PDF、TXT、Markdown 本地文件管理和阅读，提供舒适的文本阅读体验。

## 🎯 项目目标

开发一个跨平台小说阅读器，支持本地文本文件管理和阅读，提供现代化的阅读体验。

### 非目标
- 不支持在线书籍抓取
- 不支持云端同步
- 不支持社交分享

## ✨ 功能特性

### 书库管理
- 多仓库支持：添加多个文件夹路径作为书库
- 自动扫描：递归扫描目录下的 PDF/TXT/MD 文件
- 文件夹树：左侧目录树导航，显示书籍数量
- 搜索过滤：按书名/作者搜索
- 排序：按书名/添加时间/格式排序
- 收藏系统：标记喜爱的书籍
- 标签系统：为书籍添加自定义标签
- 拖拽操作：拖拽文件到书库导入
- 右键菜单：文件/文件夹操作

### 阅读器
- **格式支持**：PDF 文本提取、TXT 纯文本、Markdown 渲染
- **阅读模式**：分页模式 / 连续滚动模式
- **排版设置**：字号（12-36px）、行距（1.2-3.0）
- **主题切换**：暗色 / 亮色 / 护眼三主题
- **章节导航**：侧栏目录，支持 TXT 智能章节分割和 MD 标题层级
- **自动进度**：打开时自动恢复上次阅读位置，翻页后 3 秒防抖自动保存
- **书签系统**：添加/删除/跳转书签，面板管理
- **高亮标注**：选中文本浮动工具栏，4 色高亮，添加笔记
- **全文搜索**：Ctrl+F 搜索框，前后跳转匹配项，高亮显示
- **阅读统计**：底部栏实时显示阅读时长，会话追踪
- **键盘导航**：方向键翻页、PageUp/Down、Home/End、Ctrl+F 搜索、Esc 关闭
- **滚轮分页**：300ms 节流的滚轮翻页

### 编码兼容
- 自动检测 TXT 文件编码（UTF-8、GBK、GB2312、Big5 等）
- 支持 BOM 标记的 UTF-8 文件
- 使用 chardetng 引擎进行高精度编码检测

## 🛠️ 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 桌面框架 | Tauri 2 | Rust 后端 + WebView 前端 |
| 前端框架 | React 18 + TypeScript | 组件化 UI |
| 样式方案 | TailwindCSS | 原子化 CSS |
| 状态管理 | Zustand | 轻量级状态管理 |
| 数据库 | SQLite (rusqlite) | 本地数据持久化 |
| 构建工具 | Vite 6 | 前端构建 |
| PDF 解析 | lopdf | Rust 纯实现 PDF 文本提取 |
| 编码检测 | chardetng + encoding_rs | 高精度字符编码检测与转换 |
| Markdown | pulldown-cmark | Rust 实现 MD 转 HTML |

## 📦 依赖库

### Rust 后端
| 依赖 | 版本 | 用途 |
|------|------|------|
| tauri | 2 | Tauri 框架核心 |
| serde / serde_json | 1 | 序列化/反序列化 |
| lopdf | 0.35 | PDF 文本提取 |
| chardetng | 0.1 | 字符编码检测 |
| encoding_rs | 0.8 | 编码转换 |
| pulldown-cmark | 0.12 | Markdown 解析 |
| rusqlite | 0.31 | SQLite 数据库操作 |
| regex | 1 | 正则表达式 |
| rayon | 1.8 | 并行扫描 |
| tokio | 1 | 异步运行时 |
| parking_lot | 0.12 | 高性能锁 |

### 前端
| 依赖 | 版本 | 用途 |
|------|------|------|
| @tauri-apps/api | 2 | Tauri 前端 API |
| react / react-dom | 18 | UI 框架 |
| zustand | 5 | 状态管理 |
| react-icons | 5 | 图标库 |
| tailwindcss | 4 | 样式框架 |

## 🚀 快速开始

### 环境要求
- Node.js >= 18
- Rust >= 1.70
- npm 或 pnpm

### 安装依赖
```bash
npm install
```

### 开发模式
```bash
npm run tauri dev
```

### 构建发布版本
```bash
npm run tauri build
```

## 📁 项目结构

```
novel-reader/
├── src/                        # React 前端源码
│   ├── components/
│   │   ├── LibraryView.tsx     # 书库管理界面（三栏布局）
│   │   ├── ReaderView.tsx      # 阅读器界面（文本渲染+功能面板）
│   │   └── SettingsDialog.tsx  # 设置对话框
│   ├── services/
│   │   └── databaseService.ts  # 数据库服务层（所有 Tauri invoke 封装）
│   ├── stores/
│   │   └── mangaStore.ts       # Zustand 状态存储
│   ├── types/
│   │   └── sourceType.ts       # 文件类型定义（pdf/txt/md）
│   ├── App.tsx                 # 根组件
│   ├── main.tsx                # 入口文件
│   └── index.css               # 全局样式
├── src-tauri/                  # Rust 后端
│   ├── src/
│   │   ├── main.rs             # 主入口 + 所有 Tauri 命令注册
│   │   ├── lib.rs              # 模块声明
│   │   ├── pdf_text_extractor.rs  # PDF 文本提取 + 目录提取
│   │   ├── txt_parser.rs       # TXT 解析 + chardetng 编码检测 + 智能章节分割
│   │   ├── md_parser.rs        # Markdown 解析 + pulldown-cmark 转 HTML + 标题目录
│   │   ├── search_engine.rs    # 全文搜索引擎（PDF/TXT/MD）
│   │   ├── reading_stats.rs    # 阅读统计（会话、时长、页数）
│   │   ├── database.rs         # 数据库操作（CRUD + 迁移）
│   │   ├── events.rs           # Tauri 事件系统
│   │   ├── file_operations.rs  # 文件操作（复制/移动/删除）
│   │   ├── folder_manager.rs   # 文件夹管理
│   │   ├── library_scanner.rs  # 目录扫描（pdf/txt/md）
│   │   ├── settings.rs         # 设置管理（JSON 持久化）
│   │   ├── cover_cache.rs      # 封面缓存
│   │   └── sort_utils.rs       # 自然排序算法
│   ├── capabilities/
│   │   └── default.json        # Tauri 权限配置
│   ├── Cargo.toml              # Rust 依赖
│   └── tauri.conf.json         # Tauri 应用配置
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── vite.config.ts
├── README.md                   # 本文件
├── 迭代信息.md                  # 迭代记录
└── 迭代规划.md                  # 迭代规划
```

## 🎨 UI 设计

### 颜色系统

| 资源键 | 颜色值 | 用途 |
|--------|--------|------|
| AccentBrush | #CBE93A | 主题色（亮绿） |
| AccentHoverBrush | #B5D033 | 主题色悬停 |
| AccentTextBrush | #1A1A1A | 主题色上的文字 |
| BgMainBrush | #1A1A1A | 主背景 |
| BgPanelBrush | #212121 | 面板背景 |
| BgCardBrush | #272727 | 卡片背景 |
| BgHoverBrush | #2E2E2E | 悬停背景 |
| BgInputBrush | #2A2A2A | 输入框背景 |
| BorderBrush1 | #363636 | 边框 1 |
| BorderBrush2 | #444444 | 边框 2 |
| TextPrimaryBrush | #E0E0E0 | 主要文字 |
| TextSecBrush | #909090 | 次要文字 |
| TextMutedBrush | #555555 | 弱化文字 |

## 📋 开发计划

详见 [迭代规划.md](./迭代规划.md) 和 [迭代信息.md](./迭代信息.md)

## 🙏 开源项目感谢

本项目基于漫画阅读器项目改造而来，得益于以下开源项目的启发和参考：

### 核心框架
- **[Tauri](https://github.com/tauri-apps/tauri)** - 轻量级跨平台桌面应用框架
- **[Rust](https://www.rust-lang.org/)** - 安全高效的系统编程语言

### 前端生态
- **[React](https://react.dev/)** - 用于构建用户界面的 JavaScript 库
- **[TailwindCSS](https://tailwindcss.com/)** - 实用优先的 CSS 框架
- **[Zustand](https://github.com/pmndrs/zustand)** - 轻量级状态管理库

### 参考项目
- **[Koodo-Reader](https://github.com/koodo-reader/koodo-reader)** - Electron + React 小说阅读器，为功能设计和 UI 布局提供参考
- **[YACReader](https://github.com/MaoTouHU/yacreader-develop)** - 经典的 C++ 漫画阅读器，为文件解析提供参考
- **[Comic Shelf](https://github.com/MaoTouHU/comic-shelf-main)** - 基于 Tauri 的漫画阅读器，为项目架构提供参考

感谢这些优秀的开源项目为社区做出的贡献！

## 📄 许可证

本项目采用 GPL-3.0 许可证。
