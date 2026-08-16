# 长按操作弹窗居中显示 Spec

## Why

长按漫画条目后弹出的「重命名漫画 / 删除漫画」选项窗口当前使用 `uni.showActionSheet`，从屏幕底部升起，与用户期望的居中弹出不一致。用户希望该窗口在屏幕中间淡入显示，而非从底部升起。

## What Changes

- 新增自定义居中弹窗组件，替代 `onMangaLongPress` 中的 `uni.showActionSheet` 调用。
- 弹窗包含两个选项：「重命名漫画」「删除漫画」，点击遮罩或取消可关闭。
- 复用现有 `page-jump-overlay` 的居中弹窗样式模式（fixed 全屏遮罩 + flex 居中面板）。
- 后续的 `confirmDeleteManga` / `confirmRenameManga`（均使用 `uni.showModal`，已是系统居中弹窗）保持不变。

## Impact

- Affected specs: 无
- Affected code:
  - [pages/index/index.vue](file:///d:/aa看图app/pages/index/index.vue) — `onMangaLongPress`（L927–939）逻辑改造、template 新增弹窗节点、style 新增样式
- 不影响：长按检测逻辑（三重防护）、删除 / 重命名执行流程、阅读器、书库列表滚动。

## ADDED Requirements

### Requirement: 长按操作弹窗居中显示

长按漫画条目后，系统 SHALL 以居中淡入的方式弹出操作选项窗口（重命名 / 删除），而非从屏幕底部升起的 ActionSheet。

#### Scenario: 长按弹出居中选项
- **WHEN** 用户长按漫画条目触发长按手势
- **THEN** 屏幕中间淡入显示一个包含「重命名漫画」「删除漫画」两个选项的弹窗，带半透明全屏遮罩

#### Scenario: 点击重命名选项
- **WHEN** 用户在居中弹窗中点击「重命名漫画」
- **THEN** 弹窗关闭，随后弹出重命名输入框（`uni.showModal`，已是居中）

#### Scenario: 点击删除选项
- **WHEN** 用户在居中弹窗中点击「删除漫画」
- **THEN** 弹窗关闭，随后弹出删除二次确认（`uni.showModal`，已是居中）

#### Scenario: 点击遮罩或取消关闭
- **WHEN** 用户点击弹窗外的半透明遮罩区域或取消按钮
- **THEN** 弹窗关闭，不触发任何操作

## MODIFIED Requirements

### Requirement: 长按漫画条目弹出操作选项

长按漫画条目后，原先调用 `uni.showActionSheet` 从底部升起选项，现改为显示自定义居中弹窗组件。弹窗内容由 template 驱动，通过响应式状态 `showMangaActionSheet` 控制显隐，`mangaActionFolder` 保存目标漫画。选中后调用原有的 `confirmRenameManga` / `confirmDeleteManga`。

## REMOVED Requirements

无。
