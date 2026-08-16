# Tasks

- [x] Task 1: 回退 `LONG_PRESS_DELAY` 至 200ms
  - 将 [pages/index/index.vue](file:///d:/aa看图app/pages/index/index.vue) L863 的 `const LONG_PRESS_DELAY = 1000` 改回 `const LONG_PRESS_DELAY = 200`
- [x] Task 2: 新增滚动状态变量与常量
  - 在长按变量声明区（L858–864 附近）新增模块级 `let lastLibraryScrollTime = 0` 与 `const SCROLL_SETTLE_DELAY = 300`
- [x] Task 3: 修改 `onLibraryScroll` 更新时间戳并清除活跃定时器
  - 在 [pages/index/index.vue](file:///d:/aa看图app/pages/index/index.vue) L745–747 的 `onLibraryScroll` 中：更新 `lastLibraryScrollTime = Date.now()`；若 `longPressTimer` 存活则 `clearTimeout` 并置 null
- [x] Task 4: 修改 `onItemTouchStart` 增加滚动抑制判断
  - 在 [pages/index/index.vue](file:///d:/aa看图app/pages/index/index.vue) L866–881 的 `onItemTouchStart` 开头（获取 touch 之后、启动定时器之前）增加：若 `Date.now() - lastLibraryScrollTime < SCROLL_SETTLE_DELAY` 则重置 `longPressStartX/Y = 0` 并 `return`，不启动定时器

# Task Dependencies

- Task 2 必须先于 Task 3、Task 4 完成（变量声明在使用前）
- Task 1、Task 2 互相独立，可并行
- Task 3、Task 4 互相独立，可并行（均依赖 Task 2）
