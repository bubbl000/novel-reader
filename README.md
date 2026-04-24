# 📚 Novel Reader - 小说阅读器

基于 **Rust + Tauri + React** 技术栈的跨平台小说阅读器，支持 PDF、TXT、Markdown 本地文件管理和阅读，提供舒适的文本阅读体验。

## 🎯 项目目标

开发一个跨平台小说阅读器，支持本地文本文件管理和阅读，提供现代化的阅读体验。

### 非目标
- 不支持在线书籍抓取
- 不支持云端同步
- 不支持社交分享

## 🛠️ 技术栈

- **前端**：React 18 + TypeScript + TailwindCSS
- **后端**：Rust + Tauri 2
- **数据存储**：SQLite
- **构建工具**：Vite 6
- **状态管理**：Zustand

## 📦 依赖库

### Rust 后端
| 依赖 | 版本 | 用途 |
|------|------|------|
| tauri | 2 | Tauri框架核心 |
| serde | 1 | 序列化/反序列化 |
| lopdf | 0.35 | PDF文本提取 |
| chardetng | 0.1 | 字符编码检测 |
| encoding_rs | 0.8 | 编码转换 |
| pulldown-cmark | 0.12 | Markdown解析 |
| rusqlite | 0.31 | SQLite数据库操作 |

### 前端
| 依赖 | 版本 | 用途 |
|------|------|------|
| @tauri-apps/api | 2 | Tauri前端API |
| react | 18 | UI框架 |
| react-dom | 18 | React DOM渲染 |
| zustand | 5 | 状态管理 |
| react-icons | 5 | 图标库 |

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
├── src/                    # React前端源码
│   ├── components/         # UI组件
│   │   ├── LibraryView.tsx # 书库管理界面
│   │   ├── ReaderView.tsx  # 阅读器界面
│   │   └── SettingsDialog.tsx
│   ├── services/           # 服务层
│   │   └── databaseService.ts
│   ├── stores/             # 状态管理
│   │   └── mangaStore.ts   # Zustand 状态存储
│   ├── types/              # TypeScript类型定义
│   ├── App.tsx             # 根组件
│   ├── main.tsx            # 入口文件
│   └── index.css           # 全局样式
├── src-tauri/              # Rust后端
│   ├── src/                # Rust源码
│   │   ├── main.rs         # 主入口
│   │   ├── lib.rs          # 核心库声明
│   │   ├── pdf_text_extractor.rs # PDF文本提取
│   │   ├── txt_parser.rs   # TXT解析（含编码检测）
│   │   ├── md_parser.rs    # Markdown解析
│   │   ├── database.rs     # 数据库操作
│   │   ├── events.rs       # 事件系统
│   │   ├── file_operations.rs # 文件操作
│   │   ├── folder_manager.rs  # 文件夹管理
│   │   ├── library_scanner.rs # 目录扫描
│   │   ├── settings.rs     # 设置管理
│   │   └── sort_utils.rs   # 排序算法
│   ├── capabilities/       # Tauri权限配置
│   ├── Cargo.toml          # Rust依赖
│   └── tauri.conf.json     # Tauri配置
├── package.json            # 前端依赖配置
├── tsconfig.json           # TypeScript配置
├── tailwind.config.js      # TailwindCSS配置
├── vite.config.ts          # Vite配置
└── 迭代信息.md              # 迭代记录
```

## 🎨 UI设计

### 颜色系统

| 资源键 | 颜色值 | 用途 |
|--------|--------|------|
| AccentBrush | #CBE93A | 主题色（亮绿） |
| AccentHoverBrush | #B5D033 | 主题色悬停 |
| BgMainBrush | #1A1A1A | 主背景 |
| BgPanelBrush | #212121 | 面板背景 |
| BgCardBrush | #272727 | 卡片背景 |
| TextPrimaryBrush | #E0E0E0 | 主要文字 |
| TextSecBrush | #909090 | 次要文字 |

## 📋 开发计划

详见 [迭代信息.md](./迭代信息.md)

### 当前阶段
- ✅ **阶段1：基础能力** - 已完成
  - ✅ PDF文本提取
  - ✅ TXT解析（含编码检测）
  - ✅ Markdown解析
  - ✅ 数据库结构升级
  - ✅ 基础文本渲染
  - ✅ 分页/滚动阅读模式

## 🙏 开源项目感谢

本项目得益于以下开源项目的启发和参考：

### 核心框架
- **[Tauri](https://github.com/tauri-apps/tauri)** - 轻量级跨平台桌面应用框架
- **[Rust](https://www.rust-lang.org/)** - 安全高效的系统编程语言

### 前端生态
- **[React](https://react.dev/)** - 用于构建用户界面的JavaScript库
- **[TailwindCSS](https://tailwindcss.com/)** - 实用优先的CSS框架
- **[Zustand](https://github.com/pmndrs/zustand)** - 轻量级状态管理库

### 参考项目
- **[Koodo-Reader](https://github.com/koodo-reader/koodo-reader)** - Electron + React 小说阅读器，为功能设计提供参考
- **[YACReader](https://github.com/MaoTouHU/yacreader-develop)** - 经典的C++漫画阅读器，为文件解析提供参考
- **[Comic Shelf](https://github.com/MaoTouHU/comic-shelf-main)** - 基于Tauri的漫画阅读器，为项目架构提供参考

感谢这些优秀的开源项目为社区做出的贡献！

## 📄 许可证

本项目采用 MIT 许可证。
