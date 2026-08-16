# 漫画列表长按误触修复 Spec

## Why

漫画列表快速下滑后，用户点按屏幕刹车时，手指停留处会误触该漫画的长按手势，弹出「重命名 / 删除」ActionSheet。

此前已将 `LONG_PRESS_DELAY` 从 200ms 提高到 1000ms 作为最小改动尝试，但用户反馈「确实不太好用」，原因是：长按响应明显变慢，每次重命名 / 删除都要按住 1 秒，手感差。

因此回退到最初提议的**三重防护方案**：在保持 200ms 快速长按响应的前提下，让长按检测感知列表滚动状态，从根因上抑制刹车误触。

## What Changes

- **回退**：将 `LONG_PRESS_DELAY` 从 1000ms 改回 200ms（恢复此前的快速响应优化）。
- **新增防护 1**：在 `onItemTouchStart` 开头判断「距上次 scroll 事件 < 300ms」则不启动长按定时器，直接抑制刹车误触主场景。
- **新增防护 2（保留原有）**：`onItemTouchMove` 中手指移动 > 10px 取消定时器（已有，不改动）。
- **新增防护 3**：在 `onLibraryScroll` 中，若 `longPressTimer` 存活则清除，覆盖「touchstart 时刚好卡在阈值外但惯性未停」的边界情况。
- **新增变量**：模块级 `lastLibraryScrollTime` 与常量 `SCROLL_SETTLE_DELAY = 300`。

## Impact

- Affected specs: 无（本仓库无既有 spec 文档）
- Affected code:
  - [pages/index/index.vue](file:///d:/aa看图app/pages/index/index.vue) — 长按检测逻辑（L858–924）、`onLibraryScroll`（L745–747）
- 不影响：阅读器（横向 swiper / 竖向 scroll-view）、漫画打开、删除 / 重命名流程、书库滚动定位、字母分组渲染。

## ADDED Requirements

### Requirement: 长按检测感知列表滚动状态

系统 SHALL 在列表正在滚动或刚停止滚动时抑制长按手势触发，避免点按刹车被误判为长按。

#### Scenario: 快速下滑后点按刹车
- **WHEN** 用户快速下滑漫画列表后点按屏幕刹车
- **THEN** 不应弹出「重命名 / 删除」ActionSheet

#### Scenario: 列表静止后正常长按
- **WHEN** 列表静止超过 300ms 后用户长按漫画条目
- **THEN** 200ms 内震动并弹出 ActionSheet（响应速度与优化前一致，无退化）

#### Scenario: 滚动中已有长按定时器
- **WHEN** 手指落下启动长按定时器后，列表惯性滚动仍持续上报 scroll 事件
- **THEN** `onLibraryScroll` 立即清除该定时器，不触发长按

### Requirement: 长按响应时间保持快速

系统 SHALL 将长按触发延迟保持为 200ms，不因误触修复而牺牲正常长按的响应速度。

#### Scenario: 静止长按响应时间
- **WHEN** 列表静止状态下用户按住漫画条目
- **THEN** 在 200ms 后触发震动与 ActionSheet

## MODIFIED Requirements

### Requirement: 漫画条目长按手势

漫画条目长按检测使用自定义 touch 事件（touchstart / touchmove / touchend），触发延迟 200ms，移动阈值 10px。新增：若距上次 scroll 事件 < 300ms 则不启动定时器；scroll 事件持续上报时清除已激活定时器。

## REMOVED Requirements

### Requirement: 长按触发延迟为 1000ms

**Reason**: 用户反馈 1000ms 长按响应过慢，每次重命名 / 删除体验差，决定回退至 200ms 并采用滚动状态感知方案。
**Migration**: 直接将 `LONG_PRESS_DELAY` 改回 200ms，无数据 / 配置迁移。
