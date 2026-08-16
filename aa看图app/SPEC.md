# 漫画阅读 App — 产品与技术规格文档

> 本文档基于现有 uni-app 实现反推整理，作为在 Android Studio 中用 Kotlin + Jetpack Compose 从零重建的依据。所有行为、边界、缓存策略、时序约束均显式列出，实现时逐条对照验收。

---

## 1. 项目概述

### 1.1 应用定位
纯本地漫画阅读器，扫描设备内部存储固定目录下的图片文件夹与 PDF 文件，提供书库管理与阅读体验。无网络功能、无账号体系、无云端。

### 1.2 目标目录
- 漫画根目录（硬编码）：`/storage/emulated/0/MyManga`
- 仅扫描根目录下的：
  - 子文件夹（每个文件夹视为一部图片漫画，内部图片按文件名自然排序为页序）
  - 根目录下的 `.pdf` 文件
  - 子文件夹内的 `.pdf` 文件（显示名为 `子文件夹名/PDF名`）
- 跳过以 `.` 开头的目录/文件

### 1.3 支持的图片扩展名
`.jpg .jpeg .jpe .jfif .png .gif .webp .bmp .tif .tiff .avif .heic .heif`

### 1.4 最低系统版本
Android 5.0（API 21），因 PdfRenderer 自此版本提供。

---

## 2. 核心功能清单

| 模块 | 功能 |
|---|---|
| **权限** | 申请 `MANAGE_EXTERNAL_STORAGE`（API 30+）或 `READ_EXTERNAL_STORAGE`（API < 30），引导用户去系统设置授权 |
| **书库** | 列出所有漫画，按名称首字符分组（字母/数字/#），支持搜索、筛选（全部/未读/在读/已读完） |
| **缩略图** | 图片漫画用第一张图作封面；PDF 渲染第一页为缩略图，缓存到 `_doc/pdf_cache` |
| **刷新** | 手动刷新书库，重新扫描目录，新增条目立即加载缩略图（不要求打开过） |
| **阅读器** | 横向（左右滑动翻页）/ 竖向（上下滚动）两种模式，可切换并持久化 |
| **PDF 阅读** | 用 PdfRenderer 把每页渲染成 JPEG 缓存，按需渲染、预加载相邻页 |
| **进度** | 每部漫画独立保存阅读页码，重开自动定位 |
| **历史** | 最近阅读列表（最多 70 条），按时间倒序，可清空 |
| **沉浸式** | 全屏沉浸模式 |
| **音量键翻页** | 阅读时音量-下一页、音量+上一页，并阻止系统调音量 |
| **循环阅读** | 末页继续翻则回到首页 |
| **页码跳转** | 弹窗输入页码跳转 |

---

## 3. 推荐技术栈

| 层 | 选型 | 用途 |
|---|---|---|
| UI | Jetpack Compose | 全部界面 |
| 图片加载 | Coil | 缩略图、阅读页（自带内存+磁盘缓存、异步解码） |
| 翻页 | HorizontalPager（Compose Foundation） | 替代虚拟 Swiper |
| 竖向滚动 | LazyColumn | 替代手写虚拟滚动 |
| PDF | `android.graphics.pdf.PdfRenderer` | 原生 API |
| 存储 | DataStore (Preferences) | 替代 uni Storage |
| 文件缓存 | 应用内部存储 `_files/pdf_cache/` | 替代 `_doc/pdf_cache` |
| 异步 | Kotlin Coroutines + Flow | 替代 setTimeout 链 |
| 依赖注入 | 手写或 Hilt | 视项目规模 |
| 架构 | MVVM + 单 Activity | — |

---

## 4. 数据模型

### 4.1 漫画条目 `MangaItem`
```kotlin
data class MangaItem(
    val type: MangaType,        // FOLDER | PDF
    val name: String,           // 显示名（PDF 已去掉 .pdf 扩展名）
    val path: String,           // 绝对路径
    val imageCount: Int,        // -1 表示未知；0 表示无内容；>0 为实际页数
    val coverPath: String,      // 缩略图路径（file:// 或空）
    val progressText: String    // 列表显示的进度文案
)

enum class MangaType { FOLDER, PDF }
```

### 4.2 观看历史 `HistoryEntry`
```kotlin
data class HistoryEntry(
    val path: String,
    val name: String,
    val type: MangaType,
    val pageIndex: Int,
    val imageCount: Int,
    val coverPath: String,
    val lastReadTime: Long      // 毫秒时间戳
)
```

### 4.3 阅读进度
每部漫画独立存储，key 为路径。值为页码索引（0-based）。

### 4.4 PDF 元信息
```kotlin
data class PdfMeta(
    val mtime: Long,            // PDF 文件最后修改时间，用于缓存失效
    val imageCount: Int,        // 总页数
    val coverPath: String       // 缩略图 file:// URL
)
```

### 4.5 文件夹元信息
```kotlin
data class FolderMeta(
    val mtime: Long,            // 文件夹最后修改时间
    val imageCount: Int,
    val coverPath: String
)
```

### 4.6 竖向布局缓存（恢复进度用）
```kotlin
data class VerticalLayoutCache(
    val pageHeight: Int,        // 统一页高（普通分页各页同高）
    val pageIndex: Int,
    val scrollTop: Long         // 滚动位置
)
```

---

## 5. 存储设计（Key 清单）

所有持久化数据的 key 命名（迁移到 DataStore 后建议保留同样语义）：

| Key | 类型 | 内容 |
|---|---|---|
| `MangaReader_Progress_<path>` | Int | 某漫画阅读到的页码索引 |
| `MangaReader_PendingStorageAuth` | Bool | 标记用户已去设置页授权（用于返回后重试） |
| `MangaReader_StorageGranted` | Bool | 曾经成功访问过 MyManga，下次启动跳过权限等待 |
| `MangaReader_FolderMeta_<path>` | FolderMeta | 文件夹元信息缓存 |
| `MangaReader_PdfMeta_<path>` | PdfMeta | PDF 元信息缓存 |
| `MangaReader_WatchHistory` | List<HistoryEntry> | 观看历史（最多 70 条） |
| `MangaReader_ReadMode` | String | `horizontal` \| `vertical` |
| `MangaReader_PathList_<path>` | {mtime, paths[]} | 图片路径列表缓存（大目录二次打开免扫） |
| `MangaReader_LibrarySnapshot` | {savedAt, items[]} | 书库列表快照（启动秒开） |
| `MangaReader_LibraryFilter` | String | 当前筛选 `all/unread/reading/finished` |
| `MangaReader_VerticalLayout_<path>` | VerticalLayoutCache | 竖向布局恢复数据 |

`<path>` 中的 `/` 替换为 `_` 作为 key 后缀。

### 文件缓存目录
- PDF 页面缓存：`<内部存储>/pdf_cache/<pdf路径转义>/page_<i>.jpg`
- PDF 缩略图缓存：`<内部存储>/pdf_cache/<pdf路径转义>/thumb.jpg`
- 路径转义规则：`/` 与 `:` 均替换为 `_`

---

## 6. 启动流程

### 6.1 启动序列
1. 初始化屏幕尺寸、加载阅读模式、加载历史、加载筛选
2. 进入沉浸式全屏
3. 注册 App resume 监听
4. `bootstrapApp`：
   - 若 `StorageGranted=true`：
     - 恢复书库快照 → 列表立即可点
     - 启动后台 enrich（补全封面/页数）
     - 启动初始封面 enrich（280ms 后补全可见区 28 条）
     - 600ms 后清理已删除漫画
     - 走 fastPath 直接扫描
   - 若未授权：发起权限申请流程

### 6.2 权限申请状态机
```
[启动] 
  └─ 读取 StorageGranted?
       ├─ 是 + 目录可读 → fastPath 扫描
       ├─ 是 + 目录不可读 → 清除 flag，提示需授权
       └─ 否 → 走完整权限申请
       
[完整权限申请]
  ├─ SDK >= 30: 引导用户去"所有文件访问"设置页
  │   ├─ 用户授权后返回: 用 withRetry 多次探测（200/600/1200/2000ms）
  │   └─ 探测成功 → markStorageGranted → 扫描
  └─ SDK 23~29: requestPermissions 申请 READ/WRITE_EXTERNAL_STORAGE
       └─ 授权或目录可读 → 扫描
```

### 6.3 关键标志
- `STORAGE_GRANTED_KEY`：成功访问过则置 true，下次启动跳过权限等待（秒开）
- `PENDING_AUTH_KEY`：用户已去设置页，返回 App 时触发重试

---

## 7. 目录扫描与缓存策略

### 7.1 三层扫描速度

#### 第一层：快扫（启动/刷新用）`listMangaFoldersFastNative`
- 只列出 MyManga 根目录下的子文件夹与 PDF
- 元信息从 Storage 读取（不做 mtime 校验）
- 目标：毫秒级返回，列表先显示

#### 第二层：后台补全 `enrichFolderMetaInBackground`
- 仅在用户空闲时运行（无操作 ≥ 2.8 秒）
- 逐条处理，每条间隔 320ms
- 用户操作（打开漫画、刷新、滚动等）会暂停补全 8 秒
- 优先补全可见区，按 scroll 位置排序

#### 第三层：子目录 PDF 后台扫描 `collectSubfolderPdfsInBackground`
- 启动 5 秒后开始
- 用户空闲时扫描各子文件夹内的 PDF，合并进列表

### 7.2 单条补全规则 `enrichSingleItem`

**PDF 分支：**
1. 若 Storage 有完整 meta（coverPath + imageCount≥0）→ 直接用
2. 否则：
   - imageCount 未知 → `getPdfPageCount`（开 PdfRenderer 读页数）
   - coverPath 为空：
     - 缩略图缓存文件存在 → 直接用
     - **缓存不存在 + 支持 PDF + 页数>0 → 调 `renderPdfThumbnail` 渲染第一页**（这是本次修复的关键点）
3. 写回 PdfMeta 到 Storage

**文件夹分支：**
1. 若 Storage 有完整 meta → 直接用
2. 否则：
   - coverPath 为空 → `getFirstImagePathNative`（只找第一张图，不全扫）
   - imageCount 未知 → `countImagesInFolderNative`（只数不全扫路径）
3. 写回 FolderMeta

### 7.3 缓存失效策略
所有文件夹/PDF 元信息缓存都带 `mtime`，下次读取时与文件当前 mtime 比对，不一致则丢弃缓存。

### 7.4 路径列表缓存（打开漫画用）
- 第一次打开：全扫图片路径并排序，写入 `PathList_<path>` + mtime
- 再次打开：直接读缓存（fast path，不做 mtime 校验）
- 后台异步校验 mtime，不一致则清内存缓存

---

## 8. PDF 渲染策略

### 8.1 渲染参数
- 正文页渲染宽度：1440px（约等于屏幕宽）
- 缩略图宽度：240px
- 输出格式：JPEG 质量 88
- Bitmap 配置：ARGB_8888，先填白色背景再渲染

### 8.2 渲染流程 `renderPdfPage`
1. `ParcelFileDescriptor.open(file, MODE_READ_ONLY)`
2. `new PdfRenderer(pfd)`
3. `renderer.openPage(pageIndex)`
4. 按 targetWidth 等比缩放（仅缩小不放大）
5. `Bitmap.createBitmap(outW, outH, ARGB_8888)` + `eraseColor(0xFFFFFFFF)`
6. `Matrix.setScale(scale, scale)` + `page.render(bitmap, null, matrix, RENDER_MODE_FOR_DISPLAY)`
7. `FileOutputStream` + `bitmap.compress(JPEG, 88, fos)`
8. **务必在 finally 中按顺序关闭**：fos → page → bitmap.recycle → renderer → pfd

### 8.3 阅读时按需渲染
- 当前页 + 邻近页（横向 ±5 页，竖向 ±8 页）优先
- 渲染顺序：当前页 → 当前±1 → ±2 ...（中心扩散）
- 同一页同时只渲染一次（用 `pdfRenderingPages` Set 去重）
- 渲染完成更新 `imageList[pageIdx]` + 触发 UI 刷新

### 8.4 缓存命中检查
- `getPdfPageUrl(path, idx)`：缓存文件存在则返回 file:// URL，否则返回空
- 渲染前先检查缓存命中

---

## 9. 阅读器设计

### 9.1 横向模式（HorizontalPager）
- 用 Compose `HorizontalPager` 替代手写虚拟 Swiper
- 翻页动画时长 250ms
- 末页继续向左滑 → 回到首页（循环阅读）
- 首页继续向右滑 → 不动
- 当前页变化时：更新显示页码、保存进度、预加载相邻页

### 9.2 竖向模式（LazyColumn）
- 全页列表，每页 `Coil AsyncImage` + `widthFix` 等比
- 首次进入定位到上次进度页：
  - 记录 `readerLocatingTarget` 和保护期（1.5 秒）
  - 保护期内忽略 scroll 事件写页码（避免 scrollTop=0 误写回第 1 页）
- 图片 `onLoad` 回调拿到实际高度，存入 `pageHeights` 用于精确 scroll 定位
- 采纳首个量到的页高作为 `verticalUniformHeight`（普通分页各页同高）
- 向上滚动到顶部附近（< 160px）时前置加载 12 页

### 9.3 翻页方式
| 方式 | 行为 |
|---|---|
| 横向滑动 | 左右翻页 |
| 竖向滚动 | 上下翻页 |
| 音量-键 | 下一页（节流 180ms） |
| 音量+键 | 上一页（节流 180ms） |
| 系统返回键 | 阅读时返回书库（不退出 App） |
| 页码栏点击 | 弹出跳转弹窗 |

### 9.4 预加载范围
- 横向：当前页 ±5 页
- 竖向：当前页 ±8 页
- PDF 模式范围 +3~4 页

---

## 10. 阅读进度与观看历史

### 10.1 进度保存时机
- 横向：每次 `onSwiperChange` 翻页后立即保存
- 竖向：滚动停止 300ms 后保存当前页码
- 跳页：`goToPage` 强制保存
- 返回书库：`backToLibrary` 强制保存
- **保护期**：定位期间（`isReaderLocating()`）或 `verticalRestorePending` 期间不保存，避免覆盖正确进度

### 10.2 起始页决策 `resolveStartPageIndex`
1. 优先用 Storage 中的进度（若在 0..pageCount-1 范围内）
2. 否则用观看历史中该漫画的 pageIndex
3. 否则 0

### 10.3 观看历史维护 `addToWatchHistory`
- 入参：path、name、type、pageIndex、imageCount、coverPath
- 移除同 path 旧条目，新条目插入到最前
- 最多保留 70 条
- 读取时按 lastReadTime 倒序

### 10.4 历史卡片显示规则
- 路径不存在 → 显示"已删除"角标，点击弹窗询问是否移除
- 路径存在 → 打开漫画并定位到上次页码

### 10.5 进度文案规则 `buildProgressText`
| 条件 | 文案 |
|---|---|
| PDF 且 imageCount<0 | `PDF · 点击阅读` |
| imageCount<0 | `点击阅读` |
| imageCount=0 | `PDF 无法打开` 或 `文件夹内无图片` |
| 无进度记录 | `共 N 页 · 未读` |
| 已读到末页 | `共 N 页 · 已读完` |
| 其他 | `读到第 X / N 页` |

---

## 11. 书库列表 UI 行为

### 11.1 排序与分组
- 按名称自然排序（`localeCompare` numeric 模式，正确处理 "卷1" / "卷10" / "卷2"）
- 首字符分组：A-Z / 0-9 / 其他归 `#`
- 分组头显示字母

### 11.2 筛选 `matchesLibraryFilter`
| 筛选 | 条件 |
|---|---|
| all | 全部 |
| unread | imageCount≤0 或 无进度记录 |
| reading | 有进度且未到末页 |
| finished | 有进度且到末页 |

### 11.3 搜索
- 输入框实时过滤名称（不区分大小写）
- 输入时重置 scroll 位置

### 11.4 占位与空状态
- 缩略图未加载 → 显示 emoji 占位（图片漫画 📖，PDF 📄）
- PDF 条目右下角显示红色 `PDF` 角标
- 列表为空 → "MyManga 内暂无内容" + 创建指引
- 筛选无结果 → "没有匹配的漫画"

### 11.5 下拉刷新
- 顶部下拉触发 `refreshFolders`
- 刷新中按钮显示"刷新中…"且禁用点击

### 11.6 继续阅读区
- 历史非空时显示在书库顶部横向滚动条
- 显示封面、名称、进度、时间
- 清空按钮弹确认框（仅清历史，进度不丢）

---

## 12. 时序约束与隐式状态机

这是迁移时最容易漏的部分，必须逐条实现：

### 12.1 阅读器定位保护期
```
进入阅读器
  ├─ 记录 readerLocatingTarget = 起始页
  ├─ readerLocatingUntil = now + (起始页>0 ? 1500ms : 600ms)
  └─ 在 isReaderLocating() 期间：
       - 不保存进度
       - 不响应 scroll 写页码
```

### 12.2 竖向恢复状态 `verticalRestorePending`
- 进入阅读器到成功定位到目标页前为 true
- 定位完成（DOM 测量验证）后置 false
- 期间 scroll 事件不写页码

### 12.3 程序化 scroll 期间 `verticalScrollSuppress`
- `scrollVerticalToPage` 触发时置 true
- 延迟 120ms（无动画）或 320ms（有动画）后置 false
- 期间 scroll 事件不写页码

### 12.4 虚拟 Swiper 重置期 `swiperResetting`
- `setupVirtualSwiper` 或归位中置 true
- 期间忽略 `onSwiperChange` 事件（避免误改页码）

### 12.5 后台 enrich 暂停规则
- 用户主动操作（打开漫画、刷新、跳页）→ 暂停 8 秒
- 用户滚动 → 更新 `lastUserActivity`，需空闲 2.8 秒才继续
- 进入阅读器 → 立即取消 enrich
- 返回书库 → 重新调度

### 12.6 刷新流程
```
refreshFolders()
  ├─ pauseEnrichForUserAction（取消后台补全）
  ├─ isRefreshing = true
  ├─ 校验目录可读（不可读则提示并引导授权）
  ├─ 清空 imageListCache
  ├─ scanAndLoadFolders(force=true)
  ├─ pruneMissingMangaFromLibrary(showToast=true)
  └─ finally: isRefreshing=false, scheduleEnrichWhenIdle
```

### 12.7 打开漫画流程
```
openManga(item)
  ├─ pauseEnrichForUserAction
  ├─ 校验路径存在（不存在弹窗询问移除）
  ├─ type=PDF → openPdf
  ├─ imageCount=0 → toast"该文件夹内没有图片"
  ├─ fast path: PathListCache 命中 → enterMangaReader
  ├─ 否则 showLoading + 全扫图片
  └─ paths 空 → toast"没有图片"
```

### 12.8 返回书库流程
```
backToLibrary()
  ├─ pauseEnrichForUserAction
  ├─ disableVolumeKeys
  ├─ 关闭跳页弹窗
  ├─ flushPendingPageHeights
  ├─ 计算最终进度页（竖向取 max(currentIndex, displayIndex, scrollPage)）
  ├─ saveProgress(force=true)
  ├─ 竖向保存布局缓存
  ├─ addToWatchHistory（带最新封面）
  ├─ 更新 mangaFolders 中对应条目的进度文案和封面
  └─ 清理所有阅读器状态
```

---

## 13. 性能指标与约束

| 指标 | 目标 |
|---|---|
| 启动到书库可点 | < 500ms（有快照） |
| 打开漫画到首屏 | < 300ms（缓存命中）/ < 1s（首次扫描） |
| 单条 enrich 耗时 | < 100ms（图片文件夹）/ < 500ms（PDF 首次渲染缩略图） |
| enrich 间隔 | 320ms |
| enrich 启动延迟 | 280ms（初始）/ 2800ms（空闲） |
| 翻页动画 | 250ms |
| 翻页节流 | 180ms |
| PDF 预加载范围 | 横向 ±5，竖向 ±8 |
| 历史最大条数 | 70 |
| 缩略图初始补全数 | 28 条（可见区优先） |

---

## 14. 边界情况清单（验收用）

- [ ] PDF 文件被删除 → 书库列表移除、历史标记"已删除"
- [ ] 文件夹被删除 → 同上
- [ ] 文件夹新增图片 → mtime 变化触发缓存失效，重新扫描
- [ ] PDF 替换同名文件 → mtime 变化触发重渲染
- [ ] 刷新时新增 PDF → **立即渲染缩略图**（不要求打开过）
- [ ] 已读漫画末页继续翻 → 回首页（循环阅读）
- [ ] 已读漫画首页向前翻 → 不动
- [ ] 阅读中按返回键 → 回书库不退出 App
- [ ] 阅读中切到后台再回来 → 不重复扫描
- [ ] 启动时未授权 → 全屏遮罩提示 + "去授权"按钮
- [ ] 启动时已授权但目录不可读 → 清除 granted flag，重新走授权
- [ ] 书库快照存在 → 启动秒开列表，后台扫描补全
- [ ] 竖向阅读重进 → 恢复 scrollTop（在 ±3 页范围内）
- [ ] 横向阅读重进 → 恢复到目标页
- [ ] 缩略图渲染失败 → 显示占位图，不崩溃
- [ ] PDF 渲染失败 → 单页跳过，其他页正常
- [ ] 大目录（数百本）→ 列表流畅滚动（用 LazyColumn）
- [ ] 单本数千页 → 翻页不卡（用 Pager/RecyclerView 虚拟化）

---

## 15. 项目结构建议

```
app/src/main/java/com/<yourpkg>/manga/
├── App.kt                          // Application
├── MainActivity.kt                 // 单 Activity，沉浸式
├── core/
│   ├── permission/                 // 权限申请状态机
│   ├── storage/                    // DataStore 封装
│   └── pdf/                        // PdfRenderer 封装
│       ├── PdfRenderer.kt
│       └── PdfCache.kt
├── data/
│   ├── model/                      // MangaItem, HistoryEntry, Meta 等
│   ├── repo/
│   │   ├── LibraryRepository.kt    // 扫描、缓存、enrich
│   │   ├── ProgressRepository.kt   // 进度读写
│   │   └── HistoryRepository.kt    // 历史读写
│   └── cache/
│       ├── FolderMetaCache.kt
│       ├── PdfMetaCache.kt
│       └── PathListCache.kt
├── ui/
│   ├── library/
│   │   ├── LibraryScreen.kt
│   │   ├── LibraryViewModel.kt
│   │   └── components/              // 漫画卡片、历史卡片、筛选条
│   ├── reader/
│   │   ├── ReaderScreen.kt
│   │   ├── ReaderViewModel.kt
│   │   ├── HorizontalReader.kt     // HorizontalPager
│   │   ├── VerticalReader.kt       // LazyColumn
│   │   └── PageJumpDialog.kt
│   └── components/                  // 通用组件
└── util/
    ├── FileScanner.kt
    └── NaturalSort.kt
```

---

## 16. 实现优先级（建议里程碑）

### M1 — 骨架可跑
- 项目创建、依赖配置（Compose + Coil + DataStore）
- MainActivity 沉浸式全屏
- 权限申请流程
- 扫描 MyManga 列出条目（无缩略图）

### M2 — 书库可用
- 书库列表 UI（分组、搜索、筛选）
- 缩略图加载（图片漫画用 Coil 直接显示第一张）
- PDF 缩略图渲染（PdfRenderer 第一页）
- 阅读模式切换持久化
- 快照启动秒开

### M3 — 阅读器
- 横向阅读器（HorizontalPager）
- 竖向阅读器（LazyColumn）
- 阅读进度保存与恢复
- 音量键翻页
- 页码跳转弹窗
- 循环阅读

### M4 — PDF 完整支持
- PDF 按页渲染缓存
- 预加载策略
- 阅读中 PDF 与图片漫画行为一致

### M5 — 历史与完善
- 观看历史卡片
- 缺失漫画清理
- 后台 enrich
- 子目录 PDF 后台扫描
- 边界情况验收（对照第 14 节）

### M6 — 性能与打磨
- Profiler 测启动/翻页/扫描耗时
- 大目录压测（数百本）
- 单本大书压测（数千页）
- APK 体积优化

---

## 17. 迁移注意事项

1. **`plus.android` 反射调用全部移除**，改成直接 Kotlin 调原生 API，性能与可读性都更好。
2. **Storage → DataStore**：注意 DataStore 是异步的，启动时同步读快照需要预加载或用 RunBlocking（仅启动一次）。
3. **`file://` URL → Coil 直接吃 File/Path**：Coil 支持 File、Uri、String，不再需要手动拼 file://。
4. **音量键拦截**：重写 Activity `onKeyDown` 即可，不需要 `plus.key`。
5. **沉浸式全屏**：用 `WindowCompat.setDecorFitsSystemWindows(window, false)` + `WindowInsetsControllerCompat.hide(WindowInsetsCompat.typeSystemBars())`。
6. **后台 enrich 改用 Coroutines**：用 `Flow` 收集用户活动状态，用 `delay` 替代 setTimeout 链。
7. **权限申请用 Activity Result API**：`registerForActivityResult(ActivityResultContracts.StartActivityForResult)`。
8. **Coil 自动管缓存**，原来手写的 `_doc/pdf_cache` 只用于 PDF 渲染的 JPEG 缓存，缩略图本身可以交给 Coil 内存+磁盘缓存。

---

## 18. 后续可扩展功能（非本期）

- 书签/目录跳转
- 双页阅读（日漫横排）
- 镜像翻转（左→右翻页）
- 亮度/对比度调节
- 缩略图网格视图
- 标签/分类管理
- ZIP/CBZ/RAR 压缩包漫画
- 在线源（如需要）

---

**文档完。实现时按第 16 节里程碑推进，每完成一个里程碑对照第 14 节验收。**
