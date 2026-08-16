# Tasks

- [x] Task 1: 新增弹窗响应式状态
  - 在 [pages/index/index.vue](file:///d:/aa看图app/pages/index/index.vue) 的状态声明区新增 `showMangaActionSheet`（ref，初值 false）与 `mangaActionFolder`（ref，初值 null）
- [x] Task 2: 改造 `onMangaLongPress` 逻辑
  - 将 `onMangaLongPress`（L927–939）中的 `uni.showActionSheet` 调用替换为：设置 `mangaActionFolder.value = folder` 并 `showMangaActionSheet.value = true`，不再直接调用 `confirmRenameManga` / `confirmDeleteManga`
- [x] Task 3: 新增弹窗选项点击处理函数
  - 新增 `onMangaActionRename`：关闭弹窗（showMangaActionSheet=false）并调用 `confirmRenameManga(mangaActionFolder.value)`
  - 新增 `onMangaActionDelete`：关闭弹窗并调用 `confirmDeleteManga(mangaActionFolder.value)`
  - 新增 `closeMangaActionSheet`：仅关闭弹窗（点击遮罩 / 取消时调用）
- [x] Task 4: 新增弹窗 template 节点
  - 在 template 中（参照 `page-jump-overlay` 的位置与结构）新增自定义居中弹窗：全屏半透明遮罩（点击关闭）+ 居中面板（标题 + 「重命名漫画」「删除漫画」两个选项行 + 取消按钮）
  - 遮罩用 `v-if="showMangaActionSheet"`，面板内选项点击分别调用 `onMangaActionRename` / `onMangaActionDelete`
- [x] Task 5: 新增弹窗 CSS 样式
  - 在 style 中（参照 `.page-jump-overlay` / `.page-jump-panel`）新增居中弹窗样式：遮罩 fixed 全屏 + flex 居中 + 半透明黑底；面板深色背景圆角；选项行可点击；删除项红色文字（沿用原 `itemColor: '#e64340'`）

# Task Dependencies

- Task 1 必须先于 Task 2、Task 3 完成（状态声明在使用前）
- Task 2、Task 3 互相独立，可并行（均依赖 Task 1）
- Task 4 依赖 Task 3（template 调用的处理函数需先定义）
- Task 5 与 Task 4 互相独立，可并行
