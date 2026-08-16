# Checklist

- [x] `LONG_PRESS_DELAY` 已回退为 200（非 1000）
- [x] 新增模块级变量 `lastLibraryScrollTime`（初值 0）与常量 `SCROLL_SETTLE_DELAY = 300`
- [x] `onLibraryScroll` 中每次 scroll 事件更新 `lastLibraryScrollTime = Date.now()`
- [x] `onLibraryScroll` 中若 `longPressTimer` 存活则清除并置 null
- [x] `onItemTouchStart` 在启动定时器前判断 `Date.now() - lastLibraryScrollTime < SCROLL_SETTLE_DELAY`，成立则不启动定时器
- [x] `onItemTouchMove`（10px 取消）、`onItemTouchEnd`、`onItemClick`、`onMangaLongPress` 保持不变
- [ ] 快速下滑后点按刹车不弹出 ActionSheet（主场景验证）— 待真机验证
- [ ] 列表静止后长按漫画 200ms 内震动并弹出 ActionSheet（响应速度无退化）— 待真机验证
- [ ] 滚动中手指落下、惯性继续时已激活的长按定时器被清除 — 代码逻辑已实现，待真机验证
- [ ] 单击漫画正常进入阅读器（`longPressTriggered` 为 false 走 `openManga`）— 代码逻辑未改，待真机验证
- [ ] 阅读器、删除 / 重命名流程、滚动定位、字母分组渲染不受影响 — 改动局部，待真机回归验证
