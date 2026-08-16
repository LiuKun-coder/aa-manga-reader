# Checklist

- [x] 新增响应式状态 `showMangaActionSheet`（ref，初值 false）与 `mangaActionFolder`（ref，初值 null）
- [x] `onMangaLongPress` 不再调用 `uni.showActionSheet`，改为设置 `mangaActionFolder` 并显示自定义弹窗
- [x] 新增 `onMangaActionRename`：关闭弹窗并调用 `confirmRenameManga(mangaActionFolder.value)`
- [x] 新增 `onMangaActionDelete`：关闭弹窗并调用 `confirmDeleteManga(mangaActionFolder.value)`
- [x] 新增 `closeMangaActionSheet`：仅关闭弹窗（遮罩 / 取消按钮调用）
- [x] template 新增居中弹窗节点：全屏半透明遮罩（点击关闭）+ 居中面板（重命名 / 删除 / 取消）
- [x] 弹窗用 `v-if="showMangaActionSheet"` 控制显隐
- [x] 删除选项文字为红色（沿用原 `#e64340`）
- [x] CSS 样式参照 `page-jump-overlay` 模式：fixed 全屏遮罩 + flex 居中 + 深色圆角面板
- [ ] 长按后弹窗在屏幕中间淡入显示，不从底部升起 — 待真机验证
- [ ] 点击「重命名漫画」→ 关闭弹窗 → 弹出重命名输入框（uni.showModal 居中）— 待真机验证
- [ ] 点击「删除漫画」→ 关闭弹窗 → 弹出删除二次确认（uni.showModal 居中）— 待真机验证
- [ ] 点击遮罩或取消按钮 → 弹窗关闭，不触发操作 — 待真机验证
- [x] 长按检测三重防护逻辑不受影响（lastLibraryScrollTime / SCROLL_SETTLE_DELAY 完好）
- [x] 删除 / 重命名执行流程不受影响（confirmDeleteManga / confirmRenameManga 未改动）
