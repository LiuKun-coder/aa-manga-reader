<template>
	<view class="reader-page">
		<!-- 无书库数据时的全屏权限/错误提示 -->
		<view v-if="showBlockingStatus" class="status-overlay">
			<text class="status-text">{{ statusMessage }}</text>
			<button v-if="needOpenSettings" class="settings-btn" @click="openAllFilesAccessSettings">
				前往授权「所有文件访问」
			</button>
		</view>

		<!-- 书库：MyManga 下的子文件夹列表（有快照/历史时不被权限提示挡住） -->
		<view v-else-if="viewMode === 'library'" class="library-view">
			<view v-if="statusMessage && canShowLibrary" class="status-banner">
				<text class="status-banner-text">{{ statusMessage }}</text>
				<button v-if="needOpenSettings" class="status-banner-btn" @click="openAllFilesAccessSettings">
					去授权
				</button>
			</view>
				<!-- iOS Large Title：粗体无衬线大标题 -->
			<view class="library-header">
				<text class="library-title">书库</text>
			</view>
			<view class="library-toolbar">
				<view class="search-wrap">
					<view class="search-icon"></view>
					<input
						class="library-search-input"
						type="text"
						v-model="librarySearchQuery"
						placeholder="搜索漫画名"
						placeholder-class="search-placeholder"
						confirm-type="search"
						@input="onLibrarySearchInput"
					/>
				</view>
				<scroll-view class="library-filter-scroll" scroll-x enable-flex>
					<text
						v-for="opt in libraryFilterOptions"
						:key="opt.id"
						class="library-filter-chip"
						:class="{ 'library-filter-active': libraryFilter === opt.id }"
						@click="setLibraryFilter(opt.id)"
					>{{ opt.label }}</text>
				</scroll-view>
			</view>

			<!-- 观看历史：最近阅读的漫画，方便退出后继续看 -->
			<view v-if="watchHistory.length > 0" class="history-section">
				<view class="history-section-header">
					<text class="history-section-title">继续阅读</text>
					<text class="history-clear" @click="clearWatchHistory">清空</text>
				</view>
				<scroll-view class="history-scroll" scroll-x enable-flex @scroll="noteUserActivity">
					<view
						v-for="item in watchHistory"
						:key="item.path"
						class="history-card"
						:class="{ 'history-card-missing': item.missing }"
						@click="openFromHistory(item)"
					>
						<view class="history-cover-wrap">
							<image
								v-if="item.coverPath"
								class="history-cover"
								:src="item.coverPath"
								mode="aspectFill"
								lazy-load
							/>
							<view v-else class="history-cover history-cover-placeholder">
								<view class="cover-placeholder-icon"></view>
							</view>
							<text v-if="item.missing" class="history-missing-badge">已删除</text>
						</view>
						<text class="history-name">{{ item.name }}</text>
						<text class="history-progress">{{ formatHistoryProgress(item) }}</text>
						<text class="history-time">{{ formatHistoryTime(item.lastReadTime) }}</text>
					</view>
				</scroll-view>
			</view>

			<scroll-view
			v-if="mangaFolders.length > 0"
			class="folder-list"
			:class="{ 'folder-list-scrolling': isLibraryScrolling }"
			scroll-y
			refresher-enabled
			:refresher-triggered="isRefreshing"
			refresher-background="#0C0D10"
			:scroll-top="libraryScrollTopBinding"
			@refresherrefresh="onLibraryPullRefresh"
			@scroll="onLibraryScroll"
		>
				<view v-if="filteredMangaFolders.length === 0" class="empty-library">
				<view class="empty-illustration empty-illustration--search"></view>
				<text class="empty-text">没有匹配的漫画</text>
				<text class="empty-hint">试试更换关键词或筛选条件</text>
				<text class="empty-quote">每一本好书都在等你发现</text>
			</view>
				<template
					v-else
					v-for="row in libraryDisplayRows"
					:key="row.key"
					v-memo="row.type === 'header' ? [row.letter] : [row.folder.coverPath, row.folder.imageCount, row.folder.progressText, row.folder.name, row.folder.type]"
				>
					<view v-if="row.type === 'header'" class="library-section-header">
						<text class="library-section-letter">{{ row.letter }}</text>
					</view>
					<view
					v-else
					class="folder-item"
					@click="onItemClick(row.folder)"
					@touchstart="onItemTouchStart(row.folder, $event)"
					@touchmove="onItemTouchMove($event)"
					@touchend="onItemTouchEnd"
					@touchcancel="onItemTouchEnd"
				>
						<view class="folder-cover-wrap">
							<image
								v-if="row.folder.coverPath"
								class="folder-cover"
								:src="row.folder.coverPath"
								mode="aspectFill"
								lazy-load
							/>
							<view v-else class="folder-cover folder-cover-placeholder">
							<view class="cover-placeholder-icon" :class="{ 'cover-placeholder-icon--pdf': row.folder.type === 'pdf' }"></view>
						</view>
							<text v-if="row.folder.type === 'pdf'" class="folder-type-badge">PDF</text>
						</view>
						<view class="folder-info">
							<text class="folder-name">{{ row.folder.name }}</text>
							<text class="folder-progress">{{ row.folder.progressText }}</text>
						</view>
					</view>
				</template>
			</scroll-view>
			<view v-else-if="libraryLoading || isRefreshing" class="empty-library">
				<text class="empty-text">{{ isRefreshing ? '正在刷新书库…' : '正在加载书库…' }}</text>
				<text class="empty-hint">列表会先显示，缩略图在后台加载</text>
			</view>
			<view v-else class="empty-library">
				<view class="empty-illustration empty-illustration--shelf"></view>
				<text class="empty-text">书架空空如也</text>
				<text class="empty-hint">请在 /storage/emulated/0/MyManga 下</text>
				<text class="empty-hint">创建子文件夹放入图片，或直接放入 PDF 文件</text>
				<text class="empty-quote">每一本好书都在等你发现</text>
			</view>
		</view>

		<!-- 阅读区：横向虚拟 Swiper / 竖向虚拟滚动，大图漫画也尽量流畅 -->
		<template v-else-if="viewMode === 'reader' && imageList.length > 0">
			<view v-if="pdfLoading" class="pdf-loading-overlay">
				<text class="pdf-loading-text">正在渲染 PDF 页面…</text>
			</view>
			<view v-if="showTopControls" class="back-btn" @click="backToLibrary">
				<text class="back-text">← 书库</text>
			</view>
			<!-- 阅读模式切换：右上角对称按钮，点击在横/竖之间切换 -->
			<view v-if="showTopControls" class="reader-mode-toggle" @click="toggleReadMode">
				<text class="reader-mode-toggle-text">{{ readMode === 'vertical' ? '竖向' : '横向' }}</text>
			</view>

			<!-- 横向：虚拟 3 页 Swiper -->
			<swiper
				v-if="readMode === 'horizontal'"
				class="manga-swiper"
				:current="swiperCurrent"
				:duration="swiperDuration"
				:indicator-dots="false"
				@change="onSwiperChange"
				@animationfinish="onSwiperAnimationFinish"
				@touchstart="onReaderTouchStart"
				@touchend="onReaderTouchEnd"
			>
				<swiper-item
				v-for="(pageIdx, slot) in slideIndices"
				:key="'slide-' + slot"
				v-memo="[isPortrait, areaStyle, viewStyle, pageIdx, horizontalPageSrc(pageIdx)]"
			>
				<!-- 竖屏：movable-view 原生组件布局异常（图片贴右上角/上半部分），
					改用普通 view + image aspectFit，图片完整居中显示。
					横屏：保持 movable-view，保留双指缩放功能。 -->
				<view v-if="isPortrait" class="manga-page-portrait" :style="areaStyle">
					<image
						v-if="horizontalPageSrc(pageIdx)"
						class="manga-image-portrait"
						:src="horizontalPageSrc(pageIdx)"
						mode="aspectFit"
					/>
					<view v-else class="horizontal-page-placeholder" :style="areaStyle">
						<text class="pdf-page-loading-text">加载中…</text>
					</view>
				</view>
				<movable-area v-else class="movable-area" :style="areaStyle">
					<movable-view
					class="movable-view"
					direction="all"
					:scale="true"
					:scale-min="1"
					:scale-max="4"
					:style="viewStyle"
				>
				<view class="manga-image-wrap" :style="viewStyle">
					<image
						v-if="horizontalPageSrc(pageIdx)"
						class="manga-image"
						:src="horizontalPageSrc(pageIdx)"
						mode="aspectFit"
					/>
					<view v-else class="horizontal-page-placeholder" :style="areaStyle">
						<text class="pdf-page-loading-text">加载中…</text>
					</view>
				</view>
				</movable-view>
				</movable-area>
			</swiper-item>
			</swiper>

			<!-- 竖向：全页列表 + scroll-into-view 恢复进度（避免虚拟滚动黑屏） -->
			<scroll-view
				v-else
				class="vertical-reader"
				:key="'vr-' + currentManga.path"
				scroll-y
				:scroll-top="verticalScrollTopActive ? verticalScrollTopBinding : undefined"
				:scroll-into-view="verticalScrollIntoView"
				:scroll-with-animation="verticalScrollAnimated"
				@touchstart="onVerticalReaderTouchStart"
				@touchend="onReaderTouchEnd"
				@scroll="onVerticalScroll"
			>
				<!-- 顶部占位：渲染窗口之前的所有页（撑出 scroll 长度，避免定位偏差） -->
				<view
					v-if="verticalTopPlaceholderHeight > 0"
					class="vertical-placeholder-top"
					:style="{ height: verticalTopPlaceholderHeight + 'px' }"
				></view>
				<view
			v-for="pageIdx in verticalPageIndices"
			:key="'vpage-' + pageIdx"
			class="vertical-page"
			:id="'vpage-' + pageIdx"
			v-memo="[pageIdx, verticalPageSrc(pageIdx), estimatedPageHeight]"
		>
					<image
						v-if="verticalPageSrc(pageIdx)"
						class="vertical-image"
						:src="verticalPageSrc(pageIdx)"
						mode="widthFix"
						@load="onVerticalImageLoad($event, pageIdx)"
					/>
					<view
						v-else
						class="vertical-page-placeholder"
						:style="{ minHeight: estimatedPageHeight + 'px' }"
					>
						<text class="pdf-page-loading-text">加载中…</text>
					</view>
				</view>
				<!-- 底部占位：渲染窗口之后的所有页 -->
				<view
					v-if="verticalBottomPlaceholderHeight > 0"
					class="vertical-placeholder-bottom"
					:style="{ height: verticalBottomPlaceholderHeight + 'px' }"
				></view>
			</scroll-view>

			<view v-if="showBottomControls" class="progress-bar" @click="openPageJump">
				<view class="progress-capsule">
					<text class="progress-text">
						{{ displayPageIndex + 1 }} / {{ imageList.length }}
					</text>
					<view class="progress-micro-line" :style="{ width: (((displayPageIndex + 1) / imageList.length) * 100) + '%' }"></view>
				</view>
			</view>
		</template>

		<view v-if="showPageJumpModal" class="page-jump-overlay" @click="closePageJump">
			<view class="page-jump-panel" @click.stop>
				<text class="page-jump-title">跳转到页</text>
				<input
					class="page-jump-input"
					type="number"
					v-model="pageJumpInput"
					:focus="showPageJumpModal"
					:placeholder="'1 - ' + imageList.length"
				/>
				<view class="page-jump-actions">
					<text class="page-jump-btn page-jump-cancel" @click="closePageJump">取消</text>
					<text class="page-jump-btn page-jump-confirm" @click="confirmPageJump">确定</text>
				</view>
			</view>
		</view>

		<!-- 长按漫画：居中操作弹窗（重命名 / 删除） -->
		<view v-if="showMangaActionSheet" class="manga-action-overlay" @click="closeMangaActionSheet">
			<view class="manga-action-panel" @click.stop>
				<text class="manga-action-title">漫画操作</text>
				<view class="manga-action-item" @click="onMangaActionRename">
					<text class="manga-action-text">重命名漫画</text>
				</view>
				<view class="manga-action-item" @click="onMangaActionDelete">
					<text class="manga-action-text manga-action-danger">删除漫画</text>
				</view>
				<view class="manga-action-item manga-action-cancel-item" @click="closeMangaActionSheet">
					<text class="manga-action-text manga-action-cancel-text">取消</text>
				</view>
			</view>
		</view>
	</view>
</template>

<script setup>
import { ref, shallowRef, triggerRef, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { onShow, onBackPress } from '@dcloudio/uni-app'
import {
	isPdfSupported,
	getPdfPageCount,
	getPdfPageSize,
	renderPdfPage,
	renderPdfThumbnail,
	getPdfPageCachePath,
	getPdfThumbCachePath,
	getPdfCacheDir,
	fileExists,
	getFileLastModified,
	fileUrlFromPath,
	pathFromFileUrl,
	importAndroid,
	invalidatePdfRenderer,
	closeAllPdfRenderers,
	prunePdfPageCache,
	clearPdfPageCache,
	tryGetFolderThumbUrl,
	generateFolderThumb,
	clearFolderThumbCache
} from '../../utils/pdfNative.js'
import { mark, measure, lap } from '../../utils/perf.js'

// ==================== 常量配置 ====================
/** 漫画根目录绝对路径 */
const MANGA_DIR_ABS = '/storage/emulated/0/MyManga'
/** 阅读进度 Storage 前缀（后接文件夹路径，每部漫画独立记录） */
const PROGRESS_KEY_PREFIX = 'MangaReader_Progress_'
/** 标记用户已去系统设置页授权 */
const PENDING_AUTH_KEY = 'MangaReader_PendingStorageAuth'
/** 已成功读取过 MyManga 时写入，下次启动跳过权限等待 */
const STORAGE_GRANTED_KEY = 'MangaReader_StorageGranted'
/** 支持的图片扩展名（含常见变体） */
const IMAGE_EXT = [
	'.jpg', '.jpeg', '.jpe', '.jfif',
	'.png', '.gif', '.webp', '.bmp',
	'.tif', '.tiff', '.avif', '.heic', '.heif'
]
/** 文件夹元信息缓存 Storage 前缀（仅存页数 + 修改时间，体积小） */
const FOLDER_META_KEY_PREFIX = 'MangaReader_FolderMeta_'
/** PDF 元信息缓存 Storage 前缀 */
const PDF_META_KEY_PREFIX = 'MangaReader_PdfMeta_'
/** PDF 单页渲染宽度：从 1440 降到 1080（手机屏宽通常 1080-1200，再高无明显视觉收益但渲染耗时翻倍） */
const PDF_RENDER_WIDTH = 1080
/** PDF 缩略图宽度 */
const PDF_THUMB_WIDTH = 240
/** 文件夹封面缩略图宽度（适配高 DPI 屏，100rpx 容器 @3x ≈ 432px，360 兼顾清晰与体积） */
const FOLDER_THUMB_WIDTH = 360
/** 观看历史 Storage key（最近阅读的漫画列表） */
const HISTORY_KEY = 'MangaReader_WatchHistory'
/** 观看历史最多保留条数 */
const MAX_HISTORY = 70
/** 从设置返回后权限重试间隔（毫秒） */
const PERMISSION_RETRY_DELAYS = [200, 600, 1200, 2000]
/** 虚拟 Swiper 预加载相邻页数量 */
const PRELOAD_RANGE = 5
/** 竖向阅读：PDF 预加载范围（页） */
const VERTICAL_PRELOAD_RANGE = 8
/** 竖向：窗口化渲染时当前页之前保留多少页（缓冲）
 *  增大到 5：避免用户稍微向上滚就触发 prepend，减少顶部占位频繁变化导致的 scrollTop 错乱 */
const VERTICAL_WINDOW_BEFORE = 5
/** 竖向：窗口化渲染时当前页之后保留多少页 */
const VERTICAL_WINDOW_AFTER = 12
/** 竖向：窗口内最大渲染页数（绝对上限，防极端情况）
 *  增大到 32：配合 BEFORE/AFTER 调整，减少裁剪 from 的频率 */
const VERTICAL_WINDOW_MAX = 32
/** 竖向：未加载页的高度估算（普通分页约 √2 页宽比） */
const VERTICAL_PAGE_ASPECT = 1.414
/** 竖向：每部漫画缓存的统一页高（恢复进度时 scroll 计算用）
 *  v2：去掉 minHeight: 100vh 后页高记录方式变化（图片实际高度 vs 原 max(图片,屏幕)），
 *  旧缓存里的 pageHeight / scrollTop 与新逻辑不匹配，用版本号让旧缓存自动失效触发重测 */
const VERTICAL_LAYOUT_KEY_PREFIX = 'MangaReader_VerticalLayout_v2_'
/** 竖向：向上滚动时每次前置加载的页数 */
const VERTICAL_PREPEND_BATCH = 12
/** 竖向：触发前置加载的 scrollTop 阈值（px） */
const VERTICAL_PREPEND_THRESHOLD = 160
/** 阅读模式 Storage key */
const READ_MODE_KEY = 'MangaReader_ReadMode'
/** 图片路径列表持久化缓存前缀（大目录二次打开免全量扫描） */
const PATH_LIST_KEY_PREFIX = 'MangaReader_PathList_'
/** 图片路径列表缓存版本：升级排序算法后用版本号让旧缓存 key 自动失效，触发重扫 */
const PATH_LIST_KEY_VERSION = 2
/** 书库列表快照（启动时秒开） */
const LIBRARY_SNAPSHOT_KEY = 'MangaReader_LibrarySnapshot'
/** 后台补全：每次只处理 1 条，且仅在用户无操作空闲时运行 */
const ENRICH_BATCH_SIZE = 1
/** 用户无操作多久后才开始补全剩余缩略图 */
const ENRICH_IDLE_MS = 2800
/** 两条补全之间的间隔（毫秒）— 后台慢速补全用 */
const ENRICH_BATCH_GAP = 320
/** 立即补全：文件夹类型单批并行处理条数（File 操作很快，一条 ~3-8ms） */
const ENRICH_IMMEDIATE_FOLDER_BATCH = 8
/** 立即补全：PDF 类型单批条数（PdfRenderer 渲染慢，串行 1 条） */
const ENRICH_IMMEDIATE_PDF_BATCH = 1
/** 立即补全：批次之间的间隔（毫秒）— 比后台补全短，让可见封面更快出现 */
const ENRICH_IMMEDIATE_GAP = 60
/** 启动后优先补全可见区缩略图的数量 */
const ENRICH_INITIAL_VISIBLE = 28
/** 启动后优先补全缩略图的延迟（毫秒） */
const ENRICH_INITIAL_DELAY_MS = 280
/** 用户主动操作后暂停补全时长 */
const ENRICH_PAUSE_ON_ACTIVITY_MS = 8000
/** 每补全多少条才写一次快照 */
const ENRICH_SNAPSHOT_EVERY = 12
/** 子目录 PDF 后台扫描延迟 */
const SUBFOLDER_PDF_DELAY = 5000
/** 书库筛选模式 Storage key */
const LIBRARY_FILTER_KEY = 'MangaReader_LibraryFilter'

// ==================== 响应式状态 ====================
const viewMode = ref('library')       // library | reader
// shallowRef：写入均为整体替换或下标整体替换，无需对条目内部字段做深度代理；
// 下标赋值后需手动 triggerRef 触发响应式更新（见 setMangaFolderAt）
const mangaFolders = shallowRef([])
const watchHistory = shallowRef([])          // 观看历史（最近阅读）
const currentManga = shallowRef(null)        // 当前阅读的漫画文件夹
const imageList = ref([])             // 当前漫画的图片路径
const currentIndex = ref(0)
/** 底部页码即时显示（滑动过程中立即更新，不等待防抖） */
const displayPageIndex = ref(0)
const statusMessage = ref('')
const needOpenSettings = ref(false)
const hasScannedFolders = ref(false)
const pdfLoading = ref(false)
const isRefreshing = ref(false)
const libraryLoading = ref(false)
/** 书库已可交互（快照/历史已恢复或扫描完成） */
const libraryReady = ref(false)
const readMode = ref('horizontal')
const librarySearchQuery = ref('')
/** 搜索关键词防抖副本：input 实时绑定 librarySearchQuery（受控组件），但过滤计算只跟 debounced 值，
 *  避免每次按键都触发 O(n) filter + sort（大书库连续输入会明显卡顿） */
const librarySearchQueryDebounced = ref('')
let _searchDebounceTimer = null
const libraryFilter = ref('all')
/** 书库列表 scroll 位置（onLibraryScroll 持续更新，同时作为返回书库时的恢复值） */
let libraryScrollTop = 0
/** scroll-top 绑定值（始终绑定；仅在 backToLibrary 时主动改写以恢复位置） */
const libraryScrollTopBinding = ref(0)
const showPageJumpModal = ref(false)
/** 长按漫画弹出的居中操作弹窗（重命名 / 删除） */
const showMangaActionSheet = ref(false)
/** 玻璃性能护栏：列表滚动中为 true，卡片临时退回纯色（backdrop-filter
 *  逐帧重栅化是 WebView 滚动掉帧主因），停止 200ms 后恢复玻璃 */
const isLibraryScrolling = ref(false)
let _glassGuardTimer = null
const mangaActionFolder = ref(null)
/** 阅读器顶部按钮（退出 / 横竖切换）：点击屏幕上 1/4 区域切换显示 */
const showTopControls = ref(false)
/** 阅读器底部页码：点击屏幕下 1/4 区域切换显示 */
const showBottomControls = ref(false)
const pageJumpInput = ref('')
const verticalScrollAnimated = ref(false)
const verticalScrollIntoView = ref('')
/** 竖向 scroll-top（始终绑定；仅在定位/滑动停止时更新，滚动中不回写以免抽动） */
const verticalScrollTopBinding = ref(0)
const verticalScrollTopActive = ref(false)
const verticalRenderFrom = ref(0)
/** 竖向渲染窗口上界（exclusive）：仅渲染 [from, to) 区间，避免大书一次性塞数百个 image 节点 */
const verticalRenderTo = ref(0)
const estimatedPageHeight = ref(800)
// shallowRef + 版本号 ref：滚动时 setPageHeight 频繁下标赋值，shallowRef 不触发深度追踪；
// computed 显式依赖 pageHeightsVersion，仅在我们主动 bump 版本时重算
const pageHeights = shallowRef({})
// 模板从不直接读 readerSrcCache，仅通过 readerPageSrc() 函数访问 + pdfRenderTick 触发重渲，
// 用普通对象省去 reactive proxy 开销
let readerSrcCache = {}
// 竖向页高前缀和缓存：避免每次 onVerticalScroll 都 O(n) 线性累加
// _prefixSum[i] = 前 i 页累计高度（_prefixSum[0] = 0）
let _prefixSum = null        // number[] | null
let _prefixSumVersion = -1   // 上次构建时的 pageHeightsVersion
const pageHeightsVersion = ref(0)  // 每次 pageHeights / estimatedPageHeight / imageList 变化时 ++

let isFirstShow = true
let checkingLock = false
let enrichTimer = null
let enrichCancelToken = 0
let enrichPausedUntil = 0
let lastUserActivity = 0
let enrichItemsSinceSnapshot = 0
let verticalScrollSaveTimer = null
let verticalScrollRaf = null
let lastVerticalScrollTop = 0
/** 音量键监听器引用，便于移除 */
let volumeUpHandler = null
let volumeDownHandler = null
/** 翻页节流，避免长按音量键连续跳页过快 */
let pageTurnLock = false
/** 虚拟 Swiper 程序化重置中，忽略 @change 避免误改页码与闪烁 */
let swiperResetting = false
/** reset 期间被屏蔽的滑动意图，reset 完成后补发，避免快速连翻时第二次滑动被丢弃 */
let pendingSwipePos = null
/** 自动归位定时器：补发后 swiper 停在边缘槽，用户若 300ms 内无新滑动则自动归位到中间槽 */
let autoCenterTimer = null
const AUTO_CENTER_DELAY = 300
const pendingPageHeights = {}
/** 当前漫画已量到的统一页高（普通分页各页尺寸相同） */
let verticalUniformHeight = 0
/** 打开漫画后定位到进度页的保护期，避免 scrollTop=0 误写进度 */
let readerLocatingUntil = 0
let readerLocatingTarget = 0
let verticalLocateTimers = []
/** 程序化定位 scroll 期间，忽略 scroll 事件写页码 */
let verticalScrollSuppress = false
/** 竖向 DOM 定位完成时刻 */
let verticalLocateFinishedAt = 0
let verticalHeightFlushTimer = null
let verticalScrollEndTimer = null
/** 重进时从缓存恢复的 scrollTop */
let verticalResumeScrollTop = 0
/** 竖向重进定位中：禁止 scrollTop=0 把页码/进度写回第 1 页 */
let verticalRestorePending = false
let verticalPrependLock = false
/** binding 设置时刻：用于 onVerticalScroll 判断 scroll-view 是否已同步到 binding 值
 *  超时（300ms）后强制释放，防止 scroll-view 因边界情况不报告接近值而卡死 */
let _bindingSetAt = 0
/** 内存缓存：文件夹路径 → 图片列表 + 目录修改时间 */
const imageListCache = new Map()
/** PDF 页渲染中的页码集合，避免重复渲染 */
const pdfRenderingPages = new Set()
/** PDF 页渲染版本号，用于触发视图更新 */
const pdfRenderTick = ref(0)
/** PDF 渲染取消令牌：backToLibrary 时 ++，renderPdfPagesRange 循环中检查，
 *  避免返回书库后异步渲染回调还在写 imageList / pdfRenderTick 导致
 *  "Cannot read property 'path' of null" 和 view 层 "children" 错误 */
let _pdfRenderToken = 0
/** 虚拟 Swiper 当前指示器位置（0/1/2） */
const swiperCurrent = ref(0)
/** 虚拟 Swiper 三个槽位对应的实际页码 */
const slideIndices = ref([0, 1, 2])
/** 翻页动画时长，重置虚拟 Swiper 时临时设为 0 */
const swiperDuration = ref(200)

const windowWidth = ref(375)
const windowHeight = ref(667)
/** 是否竖屏（设备物理方向）：竖屏下 movable-view 原生组件布局异常，
 *  横向阅读模式改用普通 view 渲染，规避图片贴右上角/上半部分的问题。 */
const isPortrait = computed(() => windowHeight.value > windowWidth.value)

const areaStyle = computed(() => ({
	width: windowWidth.value + 'px',
	height: windowHeight.value + 'px'
}))

const viewStyle = computed(() => ({
	width: windowWidth.value + 'px',
	height: windowHeight.value + 'px'
}))

const verticalPageIndices = computed(() => {
	const total = imageList.value.length
	if (total === 0) return []
	const from = Math.max(0, Math.min(verticalRenderFrom.value, total))
	// to 为 0 时（未初始化）退化为旧逻辑：渲染到末尾
	let to = verticalRenderTo.value
	if (to <= 0 || to > total) to = total
	if (to < from) to = from
	const pages = []
	for (let i = from; i < to; i++) pages.push(i)
	return pages
})

/** 顶部占位高度：渲染窗口之前所有页的总高度（用于撑出 scroll 长度） */
const verticalTopPlaceholderHeight = computed(() => {
	void pageHeightsVersion.value  // 页高变化时强制重算（pageHeights 是 shallowRef，下标赋值不触发追踪）
	const from = verticalRenderFrom.value
	if (from <= 0) return 0
	return sumPageHeights(0, from - 1)
})

/** 底部占位高度：渲染窗口之后所有页的总高度 */
const verticalBottomPlaceholderHeight = computed(() => {
	void pageHeightsVersion.value  // 同上
	const total = imageList.value.length
	const to = verticalRenderTo.value
	if (to <= 0 || to >= total) return 0
	return sumPageHeights(to, total - 1)
})

const filteredMangaFolders = computed(() => {
	let list = mangaFolders.value
	// 用防抖后的值：连续输入时不会每个按键都重跑 filter + sort
	const q = librarySearchQueryDebounced.value.trim().toLowerCase()
	if (q) {
		list = list.filter((item) => String(item.name).toLowerCase().includes(q))
	}
	if (libraryFilter.value === 'all') return list
	return list.filter((item) => matchesLibraryFilter(item, libraryFilter.value))
})

const libraryDisplayRows = computed(() => buildLibraryDisplayRows(filteredMangaFolders.value))

const canShowLibrary = computed(() => {
	return libraryReady.value || mangaFolders.value.length > 0 || watchHistory.value.length > 0
})

const showBlockingStatus = computed(() => {
	return !!statusMessage.value && !canShowLibrary.value
})

/** shallowRef 数组下标整体替换后手动触发响应式更新
 *  适用于 enrich / rename / backToLibrary 等单条更新场景 */
function setMangaFolderAt(idx, item) {
	mangaFolders.value[idx] = item
	triggerRef(mangaFolders)
}

/** 写入观看历史并预计算 missing 标志
 *  模板里直接调 isMangaPathAvailable 会在每次重渲时对每条历史做 Java File.exists()，
 *  改为写入时一次性标注，模板只读 item.missing 字段 */
function setWatchHistory(list) {
	const trimmed = list.slice(0, MAX_HISTORY)
	watchHistory.value = trimmed.map((item) => ({ ...item, missing: !isMangaPathAvailable(item) }))
}

// ==================== 生命周期 ====================
/** 启动打点起点：<script setup> 模块加载时刻（早于 onMounted，是更保守的起点） */
const _bootT0 = lap('boot.onMounted')

onMounted(() => {
	initScreen()
	loadReadMode()
	loadWatchHistoryImmediate()
	setImmersive()
	registerAppResumeListener()
	// 监听屏幕旋转，更新 windowWidth/Height（影响 areaStyle/viewStyle/isPortrait）
	uni.onWindowResize(onWindowResize)
	lastUserActivity = Date.now()
	bootstrapApp()
})

function bootstrapApp() {
	const pendingAuth = !!uni.getStorageSync(PENDING_AUTH_KEY)
	const wasGranted = !!uni.getStorageSync(STORAGE_GRANTED_KEY)

	// 已授权：先恢复上次书库快照与历史，立即可点；扫描放后台
	if (wasGranted) {
		restoreLibrarySnapshot()
		libraryReady.value = mangaFolders.value.length > 0 || watchHistory.value.length > 0
		viewMode.value = 'library'
		statusMessage.value = ''
		// [perf] 启动 → 书库可见耗时（快照路径）
		lap('library visible (snapshot)', _bootT0)
		scheduleEnrichWhenIdle()
		scheduleInitialCoverEnrich()
		// 不在启动 600ms 同步调 pruneMissingMangaFromLibrary：那会阻塞主线程遍历整库
		// 缺失项延迟到 scanAndLoadFolders 完成后分批异步处理；点击时再 isMangaPathAvailable 兜底
	}

	if (wasGranted && probeDirectoryAccessNative()) {
		needOpenSettings.value = false
		void startPermissionAndScan({ fastPath: true })
		return
	}

	if (!wasGranted) {
		statusMessage.value = '正在请求存储权限…'
	}
	void startPermissionAndScan({ withRetry: pendingAuth })
}

onUnmounted(() => {
	disableVolumeKeys()
	uni.offWindowResize(onWindowResize)
	// #ifdef APP-PLUS
	plus.globalEvent.removeEventListener('resume', onAppResume)
	// #endif

	// 释放所有缓存的 PdfRenderer native 资源
	closeAllPdfRenderers()

	// 清理所有挂起的定时器，避免组件卸载后回调仍执行写状态
	cancelEnrich()
	if (_searchDebounceTimer) { clearTimeout(_searchDebounceTimer); _searchDebounceTimer = null }
	if (_snapshotSaveTimer) { clearTimeout(_snapshotSaveTimer); _snapshotSaveTimer = null }
	if (_preloadRecentTimer) { clearTimeout(_preloadRecentTimer); _preloadRecentTimer = null }
	if (verticalScrollSaveTimer) { clearTimeout(verticalScrollSaveTimer); verticalScrollSaveTimer = null }
	if (verticalScrollRaf) { clearTimeout(verticalScrollRaf); verticalScrollRaf = null }
	if (verticalHeightFlushTimer) { clearTimeout(verticalHeightFlushTimer); verticalHeightFlushTimer = null }
	if (verticalScrollEndTimer) { clearTimeout(verticalScrollEndTimer); verticalScrollEndTimer = null }
	if (autoCenterTimer) { clearTimeout(autoCenterTimer); autoCenterTimer = null }
	if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
	clearVerticalLocateTimers()
})

/** 进入/离开阅读模式时，开关音量键翻页；PDF 模式下预渲染相邻页 */
watch(viewMode, (mode) => {
	if (mode === 'reader') {
		enableVolumeKeys()
		cancelEnrich()
	} else {
		disableVolumeKeys()
		scheduleEnrichWhenIdle()
		scheduleInitialCoverEnrich()
	}
})

watch(currentIndex, (idx) => {
	if (viewMode.value !== 'reader') return
	if (readMode.value === 'horizontal') {
		displayPageIndex.value = idx
		preloadReaderPagesAround(idx)
	}
})

/** 阅读中切换横/竖模式：重新初始化对应模式的渲染状态，保持当前页码 */
watch(readMode, (mode) => {
	if (viewMode.value !== 'reader') return
	if (imageList.value.length === 0) return
	// 复用进入阅读的初始化逻辑：清缓存、重置页高、初始化 swiper/竖向窗口、定位
	enterReaderAtPage(currentIndex.value)
})

/** 阅读界面拦截系统返回键 / 侧滑返回，回到书库而非退出 App */
onBackPress(() => {
	if (viewMode.value === 'reader') {
		backToLibrary()
		return true
	}
	return false
})

function onAppResume() {
	if (viewMode.value === 'reader') return
	if (hasScannedFolders.value) return

	// 已授权过则直接重新扫描，不再走权限等待
	if (uni.getStorageSync(STORAGE_GRANTED_KEY) && probeDirectoryAccessNative()) {
		loadWatchHistoryImmediate()
		restoreLibrarySnapshot()
		statusMessage.value = ''
		needOpenSettings.value = false
		void startPermissionAndScan({ fastPath: true })
		return
	}

	const pendingAuth = !!uni.getStorageSync(PENDING_AUTH_KEY)
	if (pendingAuth || needOpenSettings.value) {
		void startPermissionAndScan({ withRetry: true })
	}
}

function registerAppResumeListener() {
	// #ifdef APP-PLUS
	plus.globalEvent.addEventListener('resume', onAppResume)
	// #endif
}

onShow(() => {
	if (isFirstShow) {
		isFirstShow = false
		return
	}
	if (viewMode.value === 'reader') return
	if (hasScannedFolders.value) return

	// 从后台被杀死后恢复：已授权则直接扫书库
	if (uni.getStorageSync(STORAGE_GRANTED_KEY) && probeDirectoryAccessNative()) {
		loadWatchHistoryImmediate()
		restoreLibrarySnapshot()
		statusMessage.value = ''
		needOpenSettings.value = false
		void startPermissionAndScan({ fastPath: true })
		return
	}

	const pendingAuth = !!uni.getStorageSync(PENDING_AUTH_KEY)
	if (pendingAuth || needOpenSettings.value) {
		void startPermissionAndScan({ withRetry: true })
	}
})

// ==================== 沉浸式全屏 ====================
function initScreen() {
	const info = uni.getSystemInfoSync()
	windowWidth.value = info.windowWidth
	windowHeight.value = info.windowHeight
	estimatedPageHeight.value = Math.max(240, Math.round(info.windowWidth * VERTICAL_PAGE_ASPECT))
}

/** 屏幕旋转回调：更新 windowWidth/Height，让 areaStyle/viewStyle/isPortrait 跟随旋转 */
function onWindowResize(res) {
	// res.size: { windowWidth, windowHeight }
	const w = res?.size?.windowWidth
	const h = res?.size?.windowHeight
	if (w > 0 && h > 0) {
		windowWidth.value = w
		windowHeight.value = h
		estimatedPageHeight.value = Math.max(240, Math.round(w * VERTICAL_PAGE_ASPECT))
	}
}

const libraryFilterOptions = [
	{ id: 'all', label: '全部' },
	{ id: 'unread', label: '未读' },
	{ id: 'reading', label: '在读' },
	{ id: 'finished', label: '已读完' }
]

function loadReadMode() {
	const saved = uni.getStorageSync(READ_MODE_KEY)
	readMode.value = saved === 'vertical' ? 'vertical' : 'horizontal'
	const savedFilter = uni.getStorageSync(LIBRARY_FILTER_KEY)
	if (['all', 'unread', 'reading', 'finished'].includes(savedFilter)) {
		libraryFilter.value = savedFilter
	}
}

function setLibraryFilter(id) {
	if (libraryFilter.value === id) return
	libraryFilter.value = id
	uni.setStorageSync(LIBRARY_FILTER_KEY, id)
	libraryScrollTop = 0
	libraryScrollTopBinding.value = 0
}

function onLibrarySearchInput() {
	libraryScrollTop = 0
	libraryScrollTopBinding.value = 0
	// 150ms 防抖：连续输入时只在停顿后触发一次 filter + sort
	if (_searchDebounceTimer) clearTimeout(_searchDebounceTimer)
	_searchDebounceTimer = setTimeout(() => {
		_searchDebounceTimer = null
		librarySearchQueryDebounced.value = librarySearchQuery.value
	}, 150)
}

function getLibraryItemStepPx() {
	const rpx = windowWidth.value / 750
	return Math.max(88, Math.round((140 + 40 + 16) * rpx))
}

function onLibraryScroll(e) {
	libraryScrollTop = e.detail?.scrollTop || 0
	// 长按误触修复：记录滚动时间戳；若此时已有长按定时器，立即清除（覆盖惯性未停的边界）
	lastLibraryScrollTime = Date.now()
	if (longPressTimer) {
		clearTimeout(longPressTimer)
		longPressTimer = null
	}
	// 玻璃护栏：滚动开始切纯色卡片，停止 200ms 后恢复玻璃
	if (!isLibraryScrolling.value) isLibraryScrolling.value = true
	if (_glassGuardTimer) clearTimeout(_glassGuardTimer)
	_glassGuardTimer = setTimeout(() => {
		_glassGuardTimer = null
		isLibraryScrolling.value = false
	}, 200)
}

function getSectionLetter(name) {
	const trimmed = String(name || '').trim()
	if (!trimmed) return '#'
	const ch = trimmed.charAt(0).toUpperCase()
	if (/[A-Z0-9]/.test(ch)) return ch
	return ch
}

function buildLibraryDisplayRows(folders) {
	const sorted = [...folders].sort((a, b) => naturalCompare(a.name, b.name))
	const groups = new Map()
	for (const folder of sorted) {
		const letter = getSectionLetter(folder.name)
		if (!groups.has(letter)) groups.set(letter, [])
		groups.get(letter).push(folder)
	}
	const letters = [...groups.keys()].sort((a, b) => {
		if (a === '#') return 1
		if (b === '#') return -1
		return naturalCompare(a, b)
	})
	const rows = []
	for (const letter of letters) {
		rows.push({ type: 'header', key: 'header-' + letter, letter })
		for (const folder of groups.get(letter)) {
			rows.push({ type: 'item', key: folder.path, folder })
		}
	}
	return rows
}

function matchesLibraryFilter(item, filter) {
	const count = item.imageCount
	if (count <= 0) return filter === 'unread'
	const idx = getSavedProgressIndex(item.path)
	if (filter === 'unread') return idx < 0
	if (filter === 'reading') return idx >= 0 && idx < count - 1
	if (filter === 'finished') return idx >= count - 1
	return true
}

function isMangaPathAvailable(item) {
	if (!item?.path) return false
	// #ifdef APP-PLUS
	try {
		const abs = item.path.startsWith('file://')
			? pathFromFileUrl(item.path)
			: item.path
		const File = importAndroid('java.io.File')
		const f = new File(abs)
		if (item.type === 'pdf') return f.isFile()
		return f.isDirectory()
	} catch (e) {
		return false
	}
	// #endif
	return true
}

function sortEnrichIndicesByVisibility(indices) {
	if (indices.length <= 1) return indices
	const step = getLibraryItemStepPx()
	const viewH = windowHeight.value || 667
	const start = Math.max(0, Math.floor(libraryScrollTop / step) - 6)
	const end = Math.ceil((libraryScrollTop + viewH) / step) + 6
	return indices.slice().sort((a, b) => {
		const aVis = a >= start && a <= end
		const bVis = b >= start && b <= end
		if (aVis !== bVis) return aVis ? -1 : 1
		return a - b
	})
}

async function onLibraryPullRefresh() {
	if (isRefreshing.value) return
	await refreshFolders()
}

function openPageJump() {
	pageJumpInput.value = String(displayPageIndex.value + 1)
	showPageJumpModal.value = true
}

function closePageJump() {
	showPageJumpModal.value = false
}

function confirmPageJump() {
	const total = imageList.value.length
	if (total <= 0) return
	let n = parseInt(String(pageJumpInput.value).trim(), 10)
	if (Number.isNaN(n) || n < 1 || n > total) {
		uni.showToast({ title: `请输入 1-${total}`, icon: 'none' })
		return
	}
	closePageJump()
	goToPage(n - 1)
}

function removeMissingManga(path) {
	if (!path) return
	mangaFolders.value = mangaFolders.value.filter((f) => f.path !== path)
	const hist = loadWatchHistoryFromStorage().filter((h) => h.path !== path)
	saveWatchHistoryToStorage(hist)
	setWatchHistory(hist)
	saveLibrarySnapshot(mangaFolders.value)
}

// ==================== 长按操作：重命名 / 删除 ====================
// 自定义长按检测：默认 @longpress 约 350-500ms 太慢，改为 200ms 触发
let longPressTimer = null
let longPressStartX = 0
let longPressStartY = 0
let longPressTriggered = false
const LONG_PRESS_DELAY = 200
const LONG_PRESS_MOVE_THRESHOLD = 10
// 长按误触修复：列表滚动状态感知
let lastLibraryScrollTime = 0
const SCROLL_SETTLE_DELAY = 300

function onItemTouchStart(folder, e) {
	longPressTriggered = false
	const touch = e.touches && e.touches[0]
	if (!touch) return
	// 长按误触修复：列表刚在滚动（< SCROLL_SETTLE_DELAY），本次触摸很可能是"刹车"而非长按，直接抑制
	if (Date.now() - lastLibraryScrollTime < SCROLL_SETTLE_DELAY) {
		longPressStartX = 0
		longPressStartY = 0
		return
	}
	longPressStartX = touch.clientX
	longPressStartY = touch.clientY
	longPressTimer = setTimeout(() => {
		longPressTimer = null
		longPressTriggered = true
		// 震动反馈（短振动），与系统长按手感一致
		// #ifdef APP-PLUS
		try { uni.vibrateShort() } catch (e) { /* 忽略 */ }
		// #endif
		onMangaLongPress(folder)
	}, LONG_PRESS_DELAY)
}

function onItemTouchMove(e) {
	if (!longPressTimer) return
	const touch = e.touches && e.touches[0]
	if (!touch) return
	const dx = touch.clientX - longPressStartX
	const dy = touch.clientY - longPressStartY
	if (dx * dx + dy * dy > LONG_PRESS_MOVE_THRESHOLD * LONG_PRESS_MOVE_THRESHOLD) {
		clearTimeout(longPressTimer)
		longPressTimer = null
	}
}

function onItemTouchEnd() {
	if (longPressTimer) {
		clearTimeout(longPressTimer)
		longPressTimer = null
	}
}

/** 点击：长按刚触发时吞掉本次 click，避免误打开漫画 */
function onItemClick(folder) {
	if (longPressTriggered) {
		longPressTriggered = false
		return
	}
	openManga(folder)
}

/** 长按漫画条目：弹出居中操作弹窗（重命名 / 删除） */
function onMangaLongPress(folder) {
	mangaActionFolder.value = folder
	showMangaActionSheet.value = true
}

/** 关闭长按操作弹窗（点击遮罩 / 取消时调用） */
function closeMangaActionSheet() {
	showMangaActionSheet.value = false
	mangaActionFolder.value = null
}

/** 长按弹窗：选择重命名 */
function onMangaActionRename() {
	const folder = mangaActionFolder.value
	showMangaActionSheet.value = false
	mangaActionFolder.value = null
	if (folder) confirmRenameManga(folder)
}

/** 长按弹窗：选择删除 */
function onMangaActionDelete() {
	const folder = mangaActionFolder.value
	showMangaActionSheet.value = false
	mangaActionFolder.value = null
	if (folder) confirmDeleteManga(folder)
}

/** 删除二次确认 */
function confirmDeleteManga(folder) {
	uni.showModal({
		title: '删除漫画',
		content: `将永久删除本地文件：「${folder.name}」，且不可恢复。是否继续？`,
		confirmText: '删除',
		confirmColor: '#FF453A',
		cancelText: '取消',
		success: (res) => {
			if (res.confirm) {
				deleteManga(folder)
			}
		}
	})
}

/** 递归删除 Java File（java.io.File 无内置递归删除，需自己实现） */
function deleteFileRecursively(javaFile) {
	if (!javaFile.exists()) return true
	if (javaFile.isDirectory()) {
		const children = javaFile.listFiles()
		if (children) {
			const len = children.length
			for (let i = 0; i < len; i++) {
				if (!deleteFileRecursively(children[i])) return false
			}
		}
	}
	return javaFile.delete()
}

/** 真删除：本地文件 + 列表引用 + 历史 + 进度 + 元信息缓存 */
function deleteManga(folder) {
	if (!folder || !folder.path) return
	// 阅读中的当前项禁止删除（避免阅读器崩）
	if (currentManga.value && currentManga.value.path === folder.path) {
		uni.showToast({ title: '请先退出阅读再删除', icon: 'none' })
		return
	}

	// #ifdef APP-PLUS
	uni.showLoading({ title: '删除中…', mask: true })
	try {
		// PDF 删除前先关闭缓存的 renderer，避免文件被占用导致删除失败
		if (folder.type === 'pdf') {
			invalidatePdfRenderer(folder.path)
		}
		const File = importAndroid('java.io.File')
		const file = new File(folder.path)
		const exists = file.exists()
		let ok = true
		if (exists) {
			// 同步递归删除：大目录可能阻塞主线程数百 ms，但删除是低频操作可接受
			ok = deleteFileRecursively(file)
		}

		if (!ok) {
			uni.hideLoading()
			uni.showToast({ title: '删除失败，请检查权限', icon: 'none' })
			return
		}

		// 复用现有清理：mangaFolders 过滤 + watchHistory 清理 + 快照持久化
		removeMissingManga(folder.path)
		// 额外清理 Storage：进度、PDF / 文件夹 元信息
		uni.removeStorageSync(getProgressKey(folder.path))
		uni.removeStorageSync(getFolderMetaKey(folder.path))
		if (folder.type === 'pdf') {
			uni.removeStorageSync(getPdfMetaKey(folder.path))
			// 清理该 PDF 的所有页缓存文件，避免删除后磁盘残留
			clearPdfPageCache(folder.path)
		} else {
			// 清理该文件夹下的缩略图缓存，避免删除后磁盘残留
			clearFolderThumbCache(folder.path)
		}

		uni.hideLoading()
		uni.showToast({ title: `已删除 ${folder.name}`, icon: 'none' })
	} catch (e) {
		uni.hideLoading()
		uni.showToast({ title: '删除失败：' + (e && e.message ? e.message : String(e)), icon: 'none' })
	}
	// #endif
	// #ifndef APP-PLUS
	uni.showToast({ title: '仅 App 端支持删除本地文件', icon: 'none' })
	// #endif
}

// ==================== 长按重命名漫画 ====================
/** 重命名弹窗：预填原名（PDF 去掉 .pdf 后缀方便编辑） */
function confirmRenameManga(folder) {
	let defaultName = folder.name || ''
	if (folder.type === 'pdf' && defaultName.toLowerCase().endsWith('.pdf')) {
		defaultName = defaultName.slice(0, -4)
	}
	uni.showModal({
		title: '重命名漫画',
		editable: true,
		placeholderText: '请输入新名称',
		content: defaultName,
		confirmText: '确定',
		cancelText: '取消',
		success: (res) => {
			if (res.confirm) {
				const newName = (res.content || '').trim()
				renameManga(folder, newName)
			}
		}
	})
}

/** 校验新名：非空 / 无非法字符 / 与原名不同；返回 { fileName } 或错误字符串 */
function validateNewName(folder, rawName) {
	if (!rawName) return '名称不能为空'
	if (/[\\/:*?"<>|]/.test(rawName)) return '名称不能包含 \\ / : * ? " < > |'
	// PDF 固定补 .pdf 后缀（用户输入"新名"或"新名.pdf"都按 .pdf 处理）
	let fileName = rawName
	if (folder.type === 'pdf') {
		fileName = rawName.toLowerCase().endsWith('.pdf') ? rawName : rawName + '.pdf'
	}
	if (fileName === folder.name) return '新名称与原名称相同'
	return { fileName }
}

/** 重命名：本地文件 + 所有按 path 索引的缓存迁移/清理 + 列表/历史更新 */
function renameManga(folder, rawName) {
	if (!folder || !folder.path) return
	// 阅读中的当前项禁止重命名（避免阅读器访问失效路径）
	if (currentManga.value && currentManga.value.path === folder.path) {
		uni.showToast({ title: '请先退出阅读再重命名', icon: 'none' })
		return
	}
	const check = validateNewName(folder, rawName)
	if (typeof check === 'string') {
		uni.showToast({ title: check, icon: 'none' })
		return
	}
	const fileName = check.fileName

	// #ifdef APP-PLUS
	uni.showLoading({ title: '重命名中…', mask: true })
	try {
		// PDF 重命名前关闭缓存的 renderer，避免文件被占用导致 rename 失败
		if (folder.type === 'pdf') {
			invalidatePdfRenderer(folder.path)
		}
		const File = importAndroid('java.io.File')
		const oldFile = new File(folder.path)
		if (!oldFile.exists()) {
			uni.hideLoading()
			uni.showToast({ title: '原文件不存在', icon: 'none' })
			return
		}
		const parent = oldFile.getParent()
		const newPath = parent + '/' + fileName
		// 同目录重名校验（新路径与旧路径相同时已在 validateNewName 拦截）
		if (new File(newPath).exists()) {
			uni.hideLoading()
			uni.showToast({ title: '已存在同名：' + fileName, icon: 'none' })
			return
		}
		// 同盘 rename 是元数据操作，通常 < 50ms
		const ok = oldFile.renameTo(new File(newPath))
		if (!ok) {
			uni.hideLoading()
			uni.showToast({ title: '重命名失败，文件可能被占用', icon: 'none' })
			return
		}

		const oldPath = folder.path

		// 1. 进度缓存迁移（key 换新 path，值不变）
		const oldProg = uni.getStorageSync(getProgressKey(oldPath))
		if (oldProg !== '' && oldProg !== null && oldProg !== undefined) {
			uni.setStorageSync(getProgressKey(newPath), oldProg)
		}
		uni.removeStorageSync(getProgressKey(oldPath))

		// 2. 文件夹元信息迁移（mtime/count 不变，coverPath 失效留空让 enrich 重扫）
		const oldFolderMeta = uni.getStorageSync(getFolderMetaKey(oldPath))
		if (oldFolderMeta) {
			uni.setStorageSync(getFolderMetaKey(newPath), {
				...oldFolderMeta,
				coverPath: ''
			})
		}
		uni.removeStorageSync(getFolderMetaKey(oldPath))

		// 3. 图片路径列表缓存：直接删（内含旧绝对路径，已失效）
		uni.removeStorageSync(getPathListKey(oldPath))
		imageListCache.delete(oldPath)
		// 清理旧路径的文件夹缩略图缓存（新路径会由 enrich 重新生成）
		if (folder.type !== 'pdf') {
			clearFolderThumbCache(oldPath)
		}

		// 4. PDF 元信息迁移 + 旧渲染缓存目录删除
		if (folder.type === 'pdf') {
			const oldPdfMeta = uni.getStorageSync(getPdfMetaKey(oldPath))
			if (oldPdfMeta) {
				// mtime 不变（rename 不改 lastModified），coverPath 失效留空让 enrich 重渲染
				uni.setStorageSync(getPdfMetaKey(newPath), {
					...oldPdfMeta,
					coverPath: ''
				})
			}
			uni.removeStorageSync(getPdfMetaKey(oldPath))
			// 删除旧 PDF 缓存目录（含 thumb.jpg 和 page_*.jpg，避免残留占空间）
			try {
				const cacheDirFile = new File(getPdfCacheDir(oldPath))
				deleteFileRecursively(cacheDirFile)
			} catch (e) { /* 缓存删除失败不影响功能 */ }
		}

		// 5. 列表条目更新（同步获取 folder 新封面，pdf 留空让 enrich 异步渲染）
		const idx = mangaFolders.value.findIndex((f) => f.path === oldPath)
		if (idx >= 0) {
			const item = mangaFolders.value[idx]
			let newCoverPath = ''
			if (item.type !== 'pdf') {
				try {
					const firstImg = getFirstImagePathNative(newPath)
					if (firstImg) {
						// 优先用缩略图缓存，未命中用原图占位并异步生成
						const thumbUrl = tryGetFolderThumbUrl(firstImg, FOLDER_THUMB_WIDTH)
						newCoverPath = thumbUrl || firstImg
						if (!thumbUrl) scheduleFolderThumbRender(newPath, firstImg)
					}
				} catch (e) { /* 忽略，enrich 会补 */ }
			}
			setMangaFolderAt(idx, buildLibraryItem(
				fileName,
				newPath,
				{ imageCount: item.imageCount, coverPath: newCoverPath },
				item.type || 'folder'
			))
		}

		// 6. 观看历史更新（path + name 同步换新）
		const hist = loadWatchHistoryFromStorage()
		const histIdx = hist.findIndex((h) => h.path === oldPath)
		if (histIdx >= 0) {
			hist[histIdx] = {
				...hist[histIdx],
				path: newPath,
				name: fileName
			}
			saveWatchHistoryToStorage(hist)
	}
	setWatchHistory(loadWatchHistoryFromStorage())

	// 7. 快照持久化
		saveLibrarySnapshot(mangaFolders.value)

		uni.hideLoading()
		uni.showToast({ title: `已重命名为 ${fileName}`, icon: 'none' })
	} catch (e) {
		uni.hideLoading()
		uni.showToast({ title: '重命名失败：' + (e && e.message ? e.message : String(e)), icon: 'none' })
	}
	// #endif
	// #ifndef APP-PLUS
	uni.showToast({ title: '仅 App 端支持重命名本地文件', icon: 'none' })
	// #endif
}

function pruneMissingMangaFromLibrary(showToast = false) {
	// #ifdef APP-PLUS
	const before = mangaFolders.value.length
	// 分批异步检查，避免大书库时一次同步 File I/O 阻塞主线程
	// 每批 24 条，用 setTimeout(0) 让出主线程
	const removed = new Set()
	const BATCH = 24
	let cursor = 0
	const arr = mangaFolders.value.slice()
	return new Promise((resolve) => {
		function checkBatch() {
			const end = Math.min(cursor + BATCH, arr.length)
			for (let i = cursor; i < end; i++) {
				const item = arr[i]
				if (!item || isMangaPathAvailable(item)) continue
				removed.add(item.path)
			}
			cursor = end
			if (cursor < arr.length) {
				setTimeout(checkBatch, 0)
				return
			}
			finish()
		}
		function finish() {
			if (removed.size === 0) {
				refreshWatchHistory(true)
				resolve(0)
				return
			}
			const list = arr.filter((f) => !removed.has(f.path))
			mangaFolders.value = list
			refreshWatchHistory(true)
			saveLibrarySnapshot(list)
			if (showToast) {
				uni.showToast({
					title: `已移除 ${removed.size} 本缺失漫画`,
					icon: 'none'
				})
			}
			resolve(removed.size)
		}
		if (arr.length === 0) {
			finish()
		} else {
			checkBatch()
		}
	})
	// #endif
	// #ifndef APP-PLUS
	return Promise.resolve(0)
	// #endif
}

function promptMissingManga(item) {
	uni.showModal({
		title: '漫画不存在',
		content: `「${item.name}」已删除或移动，是否从书库记录中移除？`,
		confirmText: '移除',
		success(res) {
			if (res.confirm) removeMissingManga(item.path)
		}
	})
}

function setReadMode(mode) {
	if (mode !== 'horizontal' && mode !== 'vertical') return
	if (readMode.value === mode) return
	readMode.value = mode
	uni.setStorageSync(READ_MODE_KEY, mode)
	uni.showToast({
		title: mode === 'vertical' ? '已切换为竖向阅读' : '已切换为横向阅读',
		icon: 'none'
	})
}

/** 阅读界面右上角按钮：在横向/竖向之间切换 */
function toggleReadMode() {
	setReadMode(readMode.value === 'vertical' ? 'horizontal' : 'vertical')
}

function clearReaderSrcCache() {
	readerSrcCache = {}
}

/** 带缓存的图片地址，避免模板重复计算
 *  readerSrcCache 是普通对象（非响应式），靠 pdfRenderTick 触发模板重渲 */
function readerPageSrc(pageIdx) {
	if (pageIdx == null || pageIdx < 0) return ''
	void pdfRenderTick.value
	const cached = readerSrcCache[pageIdx]
	if (cached !== undefined) return cached
	const src = getReaderImageSrc(pageIdx)
	if (src) {
		readerSrcCache[pageIdx] = src
	}
	return src || ''
}

function invalidateReaderSrcCache(pageIdx) {
	if (pageIdx == null) {
		clearReaderSrcCache()
		return
	}
	delete readerSrcCache[pageIdx]
}

function setImmersive() {
	// #ifdef APP-PLUS
	plus.navigator.setFullscreen(true)
	// #endif
}

// ==================== 进度 Storage（按文件夹隔离） ====================

/** 根据文件夹绝对路径生成独立的 Storage key */
function getProgressKey(folderAbsPath) {
	return PROGRESS_KEY_PREFIX + folderAbsPath.replace(/\//g, '_')
}

/** 读取某部漫画的已存页码索引 */
function getSavedProgressIndex(folderAbsPath) {
	const saved = uni.getStorageSync(getProgressKey(folderAbsPath))
	if (saved === '' || saved === null || saved === undefined) return -1
	const idx = Number(saved)
	return Number.isNaN(idx) ? -1 : idx
}

/** 打开漫画时的起始页：Storage 进度优先，其次观看历史 */
function resolveStartPageIndex(itemPath, pageCount) {
	if (!itemPath || pageCount <= 0) return 0

	const saved = getSavedProgressIndex(itemPath)
	if (saved >= 0 && saved < pageCount) return saved

	const hist = loadWatchHistoryFromStorage().find((h) => h.path === itemPath)
	if (hist && hist.pageIndex >= 0 && hist.pageIndex < pageCount) {
		return hist.pageIndex
	}
	return 0
}

function beginReaderLocate(pageIdx) {
	readerLocatingTarget = pageIdx
	readerLocatingUntil = Date.now() + (pageIdx > 0 ? 1500 : 600)
}

function isReaderLocating() {
	return Date.now() < readerLocatingUntil
}

/** 生成书库列表中显示的进度文案 */
function buildProgressText(itemPath, imageCount, type = 'folder') {
	if (type === 'pdf' && imageCount < 0) return 'PDF · 点击阅读'
	if (imageCount < 0) return '点击阅读'
	if (imageCount === 0) return type === 'pdf' ? 'PDF 无法打开' : '文件夹内无图片'
	const idx = getSavedProgressIndex(itemPath)
	if (idx < 0) return `共 ${imageCount} 页 · 未读`
	if (idx >= imageCount - 1) return `共 ${imageCount} 页 · 已读完`
	return `读到第 ${idx + 1} / ${imageCount} 页`
}

// ==================== 观看历史 ====================

/** 观看历史内存缓存：避免每次读取都走同步 Storage IO
 *  调用点很多（启动、刷新、删除缺失项、打开漫画、加入历史），每次 getStorageSync 在大书库场景累计开销明显。
 *  写入时同步更新缓存，保证后续读取零 IO。 */
let _historyCache = null

/** 从 Storage 读取观看历史（首次后命中内存缓存） */
function loadWatchHistoryFromStorage() {
	if (_historyCache) return _historyCache
	const raw = uni.getStorageSync(HISTORY_KEY)
	_historyCache = Array.isArray(raw) ? raw : []
	return _historyCache
}

/** 写入观看历史到 Storage（同时更新内存缓存）
 *  内存缓存同步更新保证后续读取零 IO；Storage 异步写入避免阻塞主线程 */
function saveWatchHistoryToStorage(list) {
	const trimmed = list.slice(0, MAX_HISTORY)
	_historyCache = trimmed
	uni.setStorage({ key: HISTORY_KEY, data: trimmed })
}

/** 启动时立即显示观看历史（不等待目录扫描） */
function loadWatchHistoryImmediate() {
	setWatchHistory(loadWatchHistoryFromStorage())
	if (watchHistory.value.length > 0) {
		libraryReady.value = true
	}
}

/** 刷新响应式观看历史；扫描完成后过滤已删除条目 */
function refreshWatchHistory(filterMissing = false) {
	let list = loadWatchHistoryFromStorage()
	if (filterMissing) {
		const folderPaths = new Set(mangaFolders.value.map((f) => f.path))
		const filtered = list.filter((item) => {
			if (folderPaths.has(item.path)) return true
			return isMangaPathAvailable(item)
		})
		if (filtered.length !== list.length) {
			saveWatchHistoryToStorage(filtered)
		}
		list = filtered
	}
	setWatchHistory(list)
}

// 快照写节流：避免 enrich 每条都触发一次同步 JSON.stringify + setStorageSync
let _snapshotSaveTimer = null
let _snapshotPendingItems = null

function saveLibrarySnapshot(items) {
	if (!items || items.length === 0) return
	_snapshotPendingItems = items
	if (_snapshotSaveTimer) return  // 已有定时任务，复用
	_snapshotSaveTimer = setTimeout(() => {
		_snapshotSaveTimer = null
		const payload = _snapshotPendingItems
		_snapshotPendingItems = null
		if (!payload || payload.length === 0) return
		// 用异步版本，不阻塞主线程
		uni.setStorage({
			key: LIBRARY_SNAPSHOT_KEY,
			data: {
				savedAt: Date.now(),
				items: payload.map((item) => ({
					type: item.type || 'folder',
					name: item.name,
					path: item.path,
					imageCount: item.imageCount,
					coverPath: item.coverPath || '',
					progressText: item.progressText
				}))
			},
			fail: () => { /* 忽略写入失败，下次再写 */ }
		})
	}, 200)
}

function restoreLibrarySnapshot() {
	const snap = uni.getStorageSync(LIBRARY_SNAPSHOT_KEY)
	if (snap && Array.isArray(snap.items) && snap.items.length > 0) {
		mangaFolders.value = snap.items
		libraryReady.value = true
	}
}

/** 合并扫描结果与快照/当前列表，避免刷新后元信息回退 */
function mergeLibraryItem(scanned, existing) {
	if (!existing) return scanned
	const imageCount = scanned.imageCount >= 0 ? scanned.imageCount : existing.imageCount
	const coverPath = scanned.coverPath || existing.coverPath
	const countForText = imageCount >= 0 ? imageCount : existing.imageCount
	return {
		...scanned,
		imageCount,
		coverPath,
		progressText: buildProgressText(scanned.path, countForText, scanned.type)
	}
}

function mergeLibraryLists(existing, scanned) {
	const map = new Map((existing || []).map((e) => [e.path, e]))
	return scanned.map((s) => mergeLibraryItem(s, map.get(s.path)))
}

function noteUserActivity() {
	lastUserActivity = Date.now()
}

/** 用户主动操作（打开漫画、刷新等）时暂停后台补全 */
function pauseEnrichForUserAction() {
	lastUserActivity = Date.now()
	enrichPausedUntil = Math.max(enrichPausedUntil, Date.now() + ENRICH_PAUSE_ON_ACTIVITY_MS)
	cancelEnrich()
}

function cancelEnrich() {
	enrichCancelToken++
	if (enrichTimer) {
		clearTimeout(enrichTimer)
		enrichTimer = null
	}
}

function scheduleEnrichWhenIdle() {
	if (enrichTimer) {
		clearTimeout(enrichTimer)
		enrichTimer = null
	}
	enrichTimer = setTimeout(() => {
		enrichTimer = null
		const idleFor = Date.now() - lastUserActivity
		if (idleFor < ENRICH_IDLE_MS || Date.now() < enrichPausedUntil) {
			scheduleEnrichWhenIdle()
			return
		}
		if (viewMode.value !== 'library') {
			scheduleEnrichWhenIdle()
			return
		}
		enrichFolderMetaInBackground()
	}, ENRICH_IDLE_MS)
}

function scheduleInitialCoverEnrich() {
	setTimeout(() => {
		if (viewMode.value !== 'library') return
		enrichLibraryCoversImmediate(ENRICH_INITIAL_VISIBLE)
	}, ENRICH_INITIAL_DELAY_MS)
}

/**
 * 启动/扫描后尽快补全可见区缩略图（不等长时间空闲）
 * 优化：文件夹类型 File 操作很快（~3-8ms），单批连处理多条再让出；
 *      PDF 类型渲染慢，串行 1 条 + 较短间隔。
 * 原 320ms × 28 ≈ 9s → 现在可见区封面 ~1s 内基本补完
 */
function enrichLibraryCoversImmediate(maxCount = ENRICH_INITIAL_VISIBLE) {
	// #ifdef APP-PLUS
	if (viewMode.value !== 'library') return

	const indices = []
	mangaFolders.value.forEach((folder, i) => {
		if (needsEnrich(folder)) indices.push(i)
	})
	if (indices.length === 0) return

	const sorted = sortEnrichIndicesByVisibility(indices)
	const batch = sorted.slice(0, maxCount)
	let ptr = 0

	function enrichBatch() {
		if (viewMode.value !== 'library' || ptr >= batch.length) {
			scheduleEnrichWhenIdle()
			return
		}
		// 取下一条，按类型决定本批连处理几条
		const first = mangaFolders.value[batch[ptr]]
		const isPdf = first && first.type === 'pdf'
		const step = isPdf ? ENRICH_IMMEDIATE_PDF_BATCH : ENRICH_IMMEDIATE_FOLDER_BATCH
		let processed = 0
		while (processed < step && ptr < batch.length) {
			const idx = batch[ptr++]
			try {
				const folder = mangaFolders.value[idx]
				if (folder && needsEnrich(folder)) {
					// shallowRef 下标赋值需手动 triggerRef
					setMangaFolderAt(idx, enrichSingleItem(folder))
				}
			} catch (e) {
				// 单条失败跳过
			}
			processed++
		}
		setTimeout(enrichBatch, ENRICH_IMMEDIATE_GAP)
	}

	enrichBatch()
	// #endif
}

function pauseEnrichBriefly(ms = ENRICH_PAUSE_ON_ACTIVITY_MS) {
	pauseEnrichForUserAction()
	enrichPausedUntil = Math.max(enrichPausedUntil, Date.now() + ms)
	scheduleEnrichWhenIdle()
}

/** 仅读 Storage 中的文件夹元信息（快速，不做 native mtime 校验） */
function getStoredFolderMeta(folderAbsPath) {
	const stored = uni.getStorageSync(getFolderMetaKey(folderAbsPath))
	if (!stored) return null
	if (stored.imageCount >= 0 || stored.coverPath) return stored
	return null
}

/** 仅读 Storage 中的 PDF 元信息（快速） */
function getStoredPdfMeta(pdfAbsPath) {
	const stored = uni.getStorageSync(getPdfMetaKey(pdfAbsPath))
	if (!stored) return null
	if (stored.imageCount >= 0 || stored.coverPath) return stored
	return null
}

/** 记录或更新某部漫画的观看历史（最近阅读的排在最前） */
function addToWatchHistory(mangaInfo) {
	if (!mangaInfo?.path) return

	const entry = {
		path: mangaInfo.path,
		name: mangaInfo.name,
		type: mangaInfo.type || (String(mangaInfo.path).toLowerCase().endsWith('.pdf') ? 'pdf' : 'folder'),
		pageIndex: mangaInfo.pageIndex,
		imageCount: mangaInfo.imageCount,
		coverPath: mangaInfo.coverPath || '',
		lastReadTime: Date.now()
	}

	let list = loadWatchHistoryFromStorage().filter((item) => item.path !== entry.path)
	list.unshift(entry)
	saveWatchHistoryToStorage(list)
	setWatchHistory(list)
}

/** 清空观看历史 */
function clearWatchHistory() {
	uni.showModal({
		title: '清空历史',
		content: '确定清空所有观看历史吗？阅读进度不会丢失。',
		success(res) {
			if (res.confirm) {
				saveWatchHistoryToStorage([])
				watchHistory.value = []
			}
		}
	})
}

/** 历史卡片上的进度文案 */
function formatHistoryProgress(item) {
	if (!item.imageCount || item.imageCount <= 0) return '继续阅读'
	if (item.pageIndex >= item.imageCount - 1) return `已读完 · 共 ${item.imageCount} 页`
	return `第 ${item.pageIndex + 1} / ${item.imageCount} 页`
}

/** 历史卡片上的时间文案 */
function formatHistoryTime(timestamp) {
	if (!timestamp) return ''
	const diff = Date.now() - timestamp
	if (diff < 60 * 1000) return '刚刚'
	if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`
	if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`
	if (diff < 2 * 24 * 60 * 60 * 1000) return '昨天'
	return `${Math.floor(diff / 86400000)} 天前`
}

/** 从历史记录打开漫画，自动跳到上次阅读页 */
function openFromHistory(item) {
	if (!isMangaPathAvailable(item)) {
		promptMissingManga(item)
		return
	}
	const folder = mangaFolders.value.find((f) => f.path === item.path)
	if (folder) {
		openManga(folder)
		return
	}
	openManga({
		name: item.name,
		path: item.path,
		type: item.type || (String(item.path).toLowerCase().endsWith('.pdf') ? 'pdf' : 'folder'),
		imageCount: item.imageCount >= 0 ? item.imageCount : -1,
		coverPath: item.coverPath || ''
	})
}

// ==================== 权限申请 ====================

function getAndroidSdkInt() {
	// #ifdef APP-PLUS
	const Build = importAndroid('android.os.Build')
	return Build.VERSION.SDK_INT
	// #endif
	// #ifndef APP-PLUS
	return 0
	// #endif
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

function hasManageExternalStorage() {
	// #ifdef APP-PLUS
	try {
		const Environment = importAndroid('android.os.Environment')
		return !!plus.android.invoke(Environment, 'isExternalStorageManager')
	} catch (e) {
		console.error('检查 MANAGE_EXTERNAL_STORAGE 失败', e)
		return false
	}
	// #endif
	// #ifndef APP-PLUS
	return false
	// #endif
}

function probeDirectoryAccessNative() {
	// #ifdef APP-PLUS
	try {
		const File = importAndroid('java.io.File')
		const dir = new File(MANGA_DIR_ABS)
		return dir.exists() && dir.isDirectory() && dir.canRead()
	} catch (e) {
		return false
	}
	// #endif
	// #ifndef APP-PLUS
	return false
	// #endif
}

async function hasStorageAccess() {
	const sdkInt = getAndroidSdkInt()
	if (sdkInt >= 30 && hasManageExternalStorage()) return true
	return probeDirectoryAccessNative()
}

async function waitForStorageAccess() {
	for (const delay of PERMISSION_RETRY_DELAYS) {
		if (await hasStorageAccess()) return true
		await sleep(delay)
	}
	return false
}

function markStorageGranted() {
	uni.setStorageSync(STORAGE_GRANTED_KEY, true)
	uni.removeStorageSync(PENDING_AUTH_KEY)
	needOpenSettings.value = false
}

function clearStorageGrantedFlag() {
	uni.removeStorageSync(STORAGE_GRANTED_KEY)
}

function openAllFilesAccessSettings() {
	// #ifdef APP-PLUS
	try {
		const main = plus.android.runtimeMainActivity()
		const Intent = importAndroid('android.content.Intent')
		const Uri = importAndroid('android.net.Uri')

		const intent = new Intent('android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION')
		const uri = Uri.parse('package:' + main.getPackageName())
		intent.setData(uri)
		main.startActivity(intent)
		uni.setStorageSync(PENDING_AUTH_KEY, true)
		needOpenSettings.value = true
		statusMessage.value = '请在系统设置中开启「允许访问所有文件」，然后返回 App'
	} catch (e) {
		try {
			const Intent = importAndroid('android.content.Intent')
			const Settings = importAndroid('android.provider.Settings')
			const main = plus.android.runtimeMainActivity()
			const intent = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)
			main.startActivity(intent)
			uni.setStorageSync(PENDING_AUTH_KEY, true)
			needOpenSettings.value = true
			statusMessage.value = '请在系统设置中开启「允许访问所有文件」，然后返回 App'
		} catch (e2) {
			uni.showToast({ title: '无法打开设置页', icon: 'none' })
		}
	}
	// #endif
}

function requestLegacyStoragePermission() {
	return new Promise((resolve) => {
		// #ifdef APP-PLUS
		plus.android.requestPermissions(
			['android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE'],
			(result) => {
				resolve(
					result.granted &&
					result.granted.includes('android.permission.READ_EXTERNAL_STORAGE')
				)
			},
			() => resolve(false)
		)
		// #endif
		// #ifndef APP-PLUS
		resolve(false)
		// #endif
	})
}

async function startPermissionAndScan(options = {}) {
	if (checkingLock) return
	checkingLock = true

	try {
		// #ifdef APP-PLUS
		const sdkInt = getAndroidSdkInt()

		// 快速路径：此前已成功访问，且目录仍可读
		if (options.fastPath) {
			if (probeDirectoryAccessNative() || await hasStorageAccess()) {
				markStorageGranted()
				statusMessage.value = ''
				void scanAndLoadFolders(options.forceScan, { silent: true })
			} else {
				clearStorageGrantedFlag()
				statusMessage.value = '需要存储权限才能读取 MyManga 目录'
				needOpenSettings.value = sdkInt >= 30
			}
			return
		}

		if (sdkInt >= 30) {
			let granted = await hasStorageAccess()
			if (!granted && options.withRetry) {
				statusMessage.value = '正在确认授权状态…'
				granted = await waitForStorageAccess()
			}
			if (granted) {
				markStorageGranted()
				statusMessage.value = ''
				void scanAndLoadFolders(options.forceScan, { silent: options.silent })
			} else {
				clearStorageGrantedFlag()
				needOpenSettings.value = true
				statusMessage.value = '需要「所有文件访问」权限才能读取 MyManga 目录'
			}
		} else if (sdkInt >= 23) {
			let granted = probeDirectoryAccessNative()
			if (!granted) granted = await requestLegacyStoragePermission()
			if (granted || probeDirectoryAccessNative()) {
				markStorageGranted()
				statusMessage.value = ''
				void scanAndLoadFolders(options.forceScan, { silent: options.silent })
			} else {
				clearStorageGrantedFlag()
				statusMessage.value = '存储权限被拒绝，无法读取本地漫画'
				needOpenSettings.value = false
			}
		} else {
			markStorageGranted()
			statusMessage.value = ''
			void scanAndLoadFolders(options.forceScan, { silent: options.silent })
		}
		// #endif

		// #ifndef APP-PLUS
		statusMessage.value = '请在 App 真机/模拟器环境中运行'
		// #endif
	} finally {
		checkingLock = false
	}
}

// ==================== 目录扫描（原生 File API） ====================

function isImageFile(name) {
	const lower = name.toLowerCase()
	// 支持 .jpg / .JPEG，以及无扩展名时按 MIME 较难判断，此处仅扩展名
	if (IMAGE_EXT.some((ext) => lower.endsWith(ext))) return true
	return false
}

function naturalCompare(a, b) {
	// Android ICU 实现不一致，localeCompare 的 numeric 选项可能静默失效，
	// 导致不补零的数字文件名（1, 2, ..., 10）被排成 1, 10, 2, 3, ... 这种乱序。
	// 这里手动切分数字块按数值比较，字符串块用 localeCompare（不带 numeric）。
	// split(/(\d+)/) 捕获括号让数字块落在奇数索引（1,3,5...），非数字块在偶数索引（0,2,4...）。
	const sa = String(a)
	const sb = String(b)
	const aParts = sa.split(/(\d+)/)
	const bParts = sb.split(/(\d+)/)
	const len = Math.min(aParts.length, bParts.length)
	for (let i = 0; i < len; i++) {
		const ap = aParts[i]
		const bp = bParts[i]
		if (i % 2 === 1) {
			// 数字块：按数值比较（不补零也能正确排序，10 排在 2 之后）
			const an = parseInt(ap, 10)
			const bn = parseInt(bp, 10)
			if (an !== bn) return an < bn ? -1 : 1
		} else {
			// 字符串块：localeCompare 不带 numeric（保持中文友好）
			const r = ap.localeCompare(bp, undefined, { sensitivity: 'base' })
			if (r !== 0) return r
		}
	}
	// 公共前缀相同：更长的排在后面
	return aParts.length - bParts.length
}

/** 校验目录可读，不可读则抛出带 code 的错误 */
function assertDirectoryReadable(dirAbsPath) {
	// #ifdef APP-PLUS
	const File = importAndroid('java.io.File')
	const dir = new File(dirAbsPath)

	if (!dir.exists()) {
		const err = new Error('DIR_NOT_EXISTS')
		err.code = 'DIR_NOT_EXISTS'
		throw err
	}
	if (!dir.isDirectory()) {
		const err = new Error('NOT_DIRECTORY')
		err.code = 'NOT_DIRECTORY'
		throw err
	}
	if (!dir.canRead()) {
		const err = new Error('NO_READ_PERMISSION')
		err.code = 'NO_READ_PERMISSION'
		throw err
	}
	return dir
	// #endif
}

/** 获取文件夹最后修改时间，用于缓存失效判断 */
function getFolderLastModified(dirAbsPath) {
	// #ifdef APP-PLUS
	try {
		const File = importAndroid('java.io.File')
		return Number(new File(dirAbsPath).lastModified())
	} catch (e) {
		return 0
	}
	// #endif
	return 0
}

function getFolderMetaKey(folderAbsPath) {
	return FOLDER_META_KEY_PREFIX + folderAbsPath.replace(/\//g, '_')
}

function getPathListKey(folderAbsPath) {
	return PATH_LIST_KEY_PREFIX + 'v' + PATH_LIST_KEY_VERSION + '_' + folderAbsPath.replace(/\//g, '_')
}

function savePathListCache(folderAbsPath, paths, mtime) {
	// 异步写入：大目录 paths 数组可能很大，同步 setStorageSync 会阻塞主线程
	uni.setStorage({
		key: getPathListKey(folderAbsPath),
		data: { mtime, paths }
	})
}

function getPathListCache(folderAbsPath) {
	const mtime = getFolderLastModified(folderAbsPath)
	const mem = imageListCache.get(folderAbsPath)
	if (mem && mem.mtime === mtime) return mem.paths

	const stored = uni.getStorageSync(getPathListKey(folderAbsPath))
	if (stored && stored.mtime === mtime && Array.isArray(stored.paths)) {
		imageListCache.set(folderAbsPath, { mtime, paths: stored.paths })
		return stored.paths
	}
	return null
}

/** 打开漫画时优先走缓存，不做同步 mtime 校验（后台再校验） */
function getPathListCacheFast(folderAbsPath) {
	const mem = imageListCache.get(folderAbsPath)
	if (mem?.paths?.length) return mem.paths

	const stored = uni.getStorageSync(getPathListKey(folderAbsPath))
	if (stored?.paths?.length) {
		imageListCache.set(folderAbsPath, { mtime: stored.mtime || 0, paths: stored.paths })
		return stored.paths
	}
	return null
}

function validatePathListCacheAsync(folderAbsPath) {
	setTimeout(() => {
		try {
			const mtime = getFolderLastModified(folderAbsPath)
			const mem = imageListCache.get(folderAbsPath)
			if (mem && mem.mtime !== mtime) {
				imageListCache.delete(folderAbsPath)
			}
		} catch (e) {
			// ignore
		}
	}, 0)
}

/** 读取文件夹元信息缓存（页数 + 封面 + mtime） */
function getFolderMeta(folderAbsPath) {
	const mtime = getFolderLastModified(folderAbsPath)
	const mem = imageListCache.get(folderAbsPath)
	if (mem && mem.mtime === mtime) {
		return {
			mtime,
			imageCount: mem.paths.length,
			coverPath: mem.paths[0] || ''
		}
	}
	const stored = uni.getStorageSync(getFolderMetaKey(folderAbsPath))
	if (stored && stored.mtime === mtime && stored.imageCount >= 0) {
		return stored
	}
	return null
}

/** 写入文件夹元信息缓存 */
function saveFolderMeta(folderAbsPath, imageCount, mtime, coverPath = '') {
	const meta = { mtime, imageCount, coverPath }
	// 异步写入，避免阻塞主线程
	uni.setStorage({
		key: getFolderMetaKey(folderAbsPath),
		data: meta
	})
}

/** 快速统计文件夹内图片数量（不全量排序/建路径，用于书库补全） */
function countImagesInFolderNative(folderAbsPath) {
	// #ifdef APP-PLUS
	try {
		const dir = assertDirectoryReadable(folderAbsPath)
		const files = dir.listFiles()
		if (!files) return 0
		let count = 0
		const len = files.length
		for (let i = 0; i < len; i++) {
			const file = files[i]
			if (file.isFile() && isImageFile(String(file.getName()))) count++
		}
		return count
	} catch (e) {
		return -1
	}
	// #endif
	return -1
}

/** 快速获取文件夹封面（自然排序后的第一张图，不全量扫描路径列表） */
function getFirstImagePathNative(folderAbsPath) {
	// #ifdef APP-PLUS
	try {
		const dir = assertDirectoryReadable(folderAbsPath)
		const files = dir.listFiles()
		if (!files) return ''

		let firstName = ''
		const len = files.length
		for (let i = 0; i < len; i++) {
			const file = files[i]
			if (!file.isFile()) continue
			const name = String(file.getName())
			if (!isImageFile(name)) continue
			if (!firstName || naturalCompare(name, firstName) < 0) {
				firstName = name
			}
		}
		if (!firstName) return ''
		return 'file://' + folderAbsPath + '/' + firstName
	} catch (e) {
		return ''
	}
	// #endif
	return ''
}

/** 组装书库条目（文件夹漫画 / PDF 文件） */
function buildLibraryItem(name, path, meta, type = 'folder') {
	const imageCount = meta ? meta.imageCount : -1
	const coverPath = meta?.coverPath || ''
	return {
		type,
		name,
		path,
		imageCount,
		coverPath,
		progressText: buildProgressText(path, imageCount, type)
	}
}

/** @deprecated 兼容旧调用 */
function buildFolderItem(name, path, meta) {
	return buildLibraryItem(name, path, meta, 'folder')
}

// ==================== PDF 元信息与渲染 ====================

function getPdfMetaKey(pdfAbsPath) {
	return PDF_META_KEY_PREFIX + pdfAbsPath.replace(/\//g, '_')
}

function savePdfMeta(pdfAbsPath, meta) {
	uni.setStorageSync(getPdfMetaKey(pdfAbsPath), meta)
}

/** 读取 PDF 元信息（页数 + 缩略图），优先用缓存 */
function getPdfMeta(pdfAbsPath) {
	const mtime = getFileLastModified(pdfAbsPath)
	const stored = uni.getStorageSync(getPdfMetaKey(pdfAbsPath))
	if (stored && stored.mtime === mtime && stored.imageCount > 0) {
		const thumbPath = pathFromFileUrl(stored.coverPath || '')
		if (thumbPath && fileExists(thumbPath)) return stored
	}
	return null
}

/** 获取 PDF 完整元信息，必要时渲染缩略图 */
function resolvePdfMeta(pdfAbsPath) {
	const cached = getPdfMeta(pdfAbsPath)
	if (cached) return cached

	const mtime = getFileLastModified(pdfAbsPath)
	const pageCount = getPdfPageCount(pdfAbsPath)
	if (pageCount <= 0) {
		return { mtime, imageCount: 0, coverPath: '' }
	}

	let coverPath = ''
	const thumbCache = getPdfThumbCachePath(pdfAbsPath)
	if (fileExists(thumbCache)) {
		coverPath = fileUrlFromPath(thumbCache)
	} else if (isPdfSupported()) {
		coverPath = renderPdfThumbnail(pdfAbsPath, PDF_THUMB_WIDTH)
	}

	const meta = { mtime, imageCount: pageCount, coverPath }
	savePdfMeta(pdfAbsPath, meta)
	return meta
}

/** 获取 PDF 某页图片 URL，缓存命中直接返回 */
function getPdfPageUrl(pdfAbsPath, pageIndex) {
	const cachePath = getPdfPageCachePath(pdfAbsPath, pageIndex)
	if (fileExists(cachePath)) {
		return fileUrlFromPath(cachePath)
	}
	return ''
}

/** 渲染 PDF 指定页并更新 imageList */
function renderPdfPageSync(pdfAbsPath, pageIndex) {
	if (pageIndex < 0 || pageIndex >= imageList.value.length) return ''

	const existing = getPdfPageUrl(pdfAbsPath, pageIndex)
	if (existing) {
		imageList.value[pageIndex] = existing
		return existing
	}

	if (pdfRenderingPages.has(pageIndex)) return ''

	pdfRenderingPages.add(pageIndex)
	try {
		const cachePath = getPdfPageCachePath(pdfAbsPath, pageIndex)
		const ok = renderPdfPage(pdfAbsPath, pageIndex, cachePath, PDF_RENDER_WIDTH)
		if (ok && fileExists(cachePath)) {
			const url = fileUrlFromPath(cachePath)
			imageList.value[pageIndex] = url
			invalidateReaderSrcCache(pageIndex)
			// 竖向模式：预记录页高，避免等 @load 回调造成的 CLS
			// 显示高度 = pdfPageHeight * (windowWidth / pdfPageWidth)，与渲染目标宽度无关
			if (readMode.value === 'vertical' && !pageHeights.value[pageIndex]) {
				const size = getPdfPageSize(pdfAbsPath, pageIndex)
				if (size && size.width > 0 && size.height > 0) {
					const displayH = Math.max(80, Math.round(size.height * (windowWidth.value / size.width)))
					setPageHeight(pageIndex, displayH)
				}
			}
			pdfRenderTick.value++
			return url
		}
	} finally {
		pdfRenderingPages.delete(pageIndex)
	}
	return ''
}

/** 异步预渲染 PDF 页码范围（当前页优先，再向两侧扩展）
 *  带 cancelToken：backToLibrary 时 _pdfRenderToken++，循环中检测到令牌变化即中止，
 *  避免返回书库后还在写 imageList / pdfRenderTick 触发 view 层错误 */
async function renderPdfPagesRange(pdfAbsPath, fromIdx, toIdx, priorityIdx = null) {
	const token = _pdfRenderToken
	const center = priorityIdx != null ? priorityIdx : Math.floor((fromIdx + toIdx) / 2)
	const order = [center]
	for (let d = 1; d <= toIdx - fromIdx + 1; d++) {
		if (center - d >= fromIdx) order.push(center - d)
		if (center + d <= toIdx) order.push(center + d)
	}
	const seen = new Set()
	// 先 yield 一帧，让 UI 把"加载中"占位画出来再开始阻塞渲染
	await new Promise((resolve) => setTimeout(resolve, 0))
	for (const i of order) {
		if (token !== _pdfRenderToken) return  // 已被取消（返回书库 / 重新进入）
		if (i < fromIdx || i > toIdx || seen.has(i)) continue
		seen.add(i)
		if (!imageList.value[i] || !fileExists(pathFromFileUrl(imageList.value[i]))) {
			renderPdfPageSync(pdfAbsPath, i)
		}
		await new Promise((resolve) => setTimeout(resolve, 0))
	}
	if (token === _pdfRenderToken) pdfRenderTick.value++
}

function preloadReaderPagesAround(centerIdx) {
	if (!currentManga.value || viewMode.value !== 'reader') return
	const total = imageList.value.length
	if (total === 0 || centerIdx < 0) return

	if (currentManga.value.type === 'pdf') {
		const range = readMode.value === 'vertical'
			? VERTICAL_PRELOAD_RANGE + 4
			: PRELOAD_RANGE + 3
		const from = Math.max(0, centerIdx - range)
		const to = Math.min(total - 1, centerIdx + range)
		// 捕获当前 path，避免回调执行时 currentManga.value 已被 backToLibrary 置 null
		const pdfPath = currentManga.value.path
		setTimeout(() => {
			// 回调执行前再次检查：返回书库后 currentManga.value 为 null
			if (!currentManga.value || viewMode.value !== 'reader') return
			renderPdfPagesRange(pdfPath, from, to, centerIdx)
		}, 0)
		return
	}

	// 图片文件夹：预热缓存，相邻页优先
	for (let d = 0; d <= PRELOAD_RANGE + 2; d++) {
		if (centerIdx - d >= 0) readerPageSrc(centerIdx - d)
		if (d > 0 && centerIdx + d < total) readerPageSrc(centerIdx + d)
	}
}

function preloadPdfPagesAround(centerIdx) {
	preloadReaderPagesAround(centerIdx)
}

/** 横向 Swiper 槽位图片（三槽始终尝试加载，占位保证可滑动） */
function horizontalPageSrc(pageIdx) {
	if (pageIdx == null || pageIdx < 0) return ''
	if (currentManga.value?.type !== 'pdf') {
		return imageList.value[pageIdx] || ''
	}
	return readerPageSrc(pageIdx)
}

/** 竖向窗口内图片地址 */
function verticalPageSrc(pageIdx) {
	if (pageIdx == null || pageIdx < 0) return ''
	if (currentManga.value?.type !== 'pdf') {
		return imageList.value[pageIdx] || ''
	}
	return readerPageSrc(pageIdx)
}

function getPageHeight(pageIdx) {
	const h = pageHeights.value[pageIdx]
	if (h && h > 0) return h
	// vertical-page 不再设 minHeight: 100vh，未加载页高度等于 placeholder 的 estimatedPageHeight。
	// fallback 用估算高度，保证前缀和与实际 DOM 一致，scroll 定位准确。
	if (verticalUniformHeight > 0) return verticalUniformHeight
	return estimatedPageHeight.value
}

function adoptUniformPageHeight(height) {
	if (height <= 0) return
	if (verticalUniformHeight === 0) {
		verticalUniformHeight = height
		estimatedPageHeight.value = height
		// estimatedPageHeight 变化影响所有未测量页的高度，前缀和失效
		pageHeightsVersion.value++
	}
}

function setPageHeight(pageIdx, height) {
	if (height <= 0) return
	adoptUniformPageHeight(height)
	const old = pageHeights.value[pageIdx]
	if (old && Math.abs(old - height) < 4) return
	// 批量写入，避免滚动过程中频繁触发整列表重排
	pendingPageHeights[pageIdx] = height
	if (verticalHeightFlushTimer) return
	verticalHeightFlushTimer = setTimeout(flushPendingPageHeights, 120)
}

function flushPendingPageHeights() {
	verticalHeightFlushTimer = null
	const keys = Object.keys(pendingPageHeights)
	if (keys.length === 0) return
	// shallowRef 下标赋值不触发响应式，靠 pageHeightsVersion 显式 bump
	for (const k of keys) {
		pageHeights.value[k] = pendingPageHeights[k]
		delete pendingPageHeights[k]
	}
	// 页高变化，前缀和缓存失效
	pageHeightsVersion.value++
}

function resetPageHeights() {
	pageHeights.value = {}
	verticalUniformHeight = 0
	if (verticalHeightFlushTimer) {
		clearTimeout(verticalHeightFlushTimer)
		verticalHeightFlushTimer = null
	}
	for (const key of Object.keys(pendingPageHeights)) {
		delete pendingPageHeights[key]
	}
	// 清空前缀和缓存
	_prefixSum = null
	pageHeightsVersion.value++
}

/** 获取/构建前缀和数组：_prefixSum[i] = 前 i 页累计高度（第 i 页顶部的 scrollTop） */
function getPageHeightPrefixSum() {
	const total = imageList.value.length
	const v = pageHeightsVersion.value
	if (_prefixSum && _prefixSumVersion === v && _prefixSum.length === total + 1) {
		return _prefixSum
	}
	_prefixSumVersion = v
	const arr = new Array(total + 1)
	arr[0] = 0
	for (let i = 0; i < total; i++) {
		arr[i + 1] = arr[i] + getPageHeight(i)
	}
	_prefixSum = arr
	return arr
}

function getVerticalLayoutKey(path) {
	return VERTICAL_LAYOUT_KEY_PREFIX + path.replace(/\//g, '_')
}

/** 退出阅读器时走异步 uni.setStorage，避免大目录页高 JSON 阻塞 viewMode 切换 */
function saveVerticalLayoutCache(path, pageIdx = 0) {
	if (!path) return
	const scrollTop = lastVerticalScrollTop > 0 ? lastVerticalScrollTop : getPageTop(pageIdx)
	if (pageIdx <= 0 && scrollTop <= 0) return
	const data = {
		pageHeight: verticalUniformHeight,
		pageIndex: pageIdx,
		scrollTop
	}
	uni.setStorage({ key: getVerticalLayoutKey(path), data })
}

function restoreVerticalLayoutCache(path, expectedPageIdx = 0) {
	verticalResumeScrollTop = 0
	if (!path) return
	const cached = uni.getStorageSync(getVerticalLayoutKey(path))
	if (!cached) return
	if (cached.pageHeight > 0) {
		verticalUniformHeight = cached.pageHeight
		estimatedPageHeight.value = cached.pageHeight
	}
	if (cached.scrollTop > 0 && expectedPageIdx > 0) {
		verticalResumeScrollTop = cached.scrollTop
		return
	}
	if (cached.scrollTop > 0 && cached.pageIndex != null) {
		if (Math.abs(Number(cached.pageIndex) - expectedPageIdx) <= 3) {
			verticalResumeScrollTop = cached.scrollTop
		}
	}
}

function clearVerticalLocateTimers() {
	verticalLocateTimers.forEach((id) => clearTimeout(id))
	verticalLocateTimers = []
	// prepend 锁的释放也挂在 verticalLocateTimers 上（见 maybePrependVerticalPages），
	// 定时器被清掉时必须同步释放锁，否则跳页/重进会让锁永久卡住。
	verticalPrependLock = false
}

function scheduleVerticalLocate(fn, ms) {
	const id = setTimeout(fn, ms)
	verticalLocateTimers.push(id)
	return id
}

/** 用前缀和 O(1) 计算区间高度和：sumPageHeights(from, to) = prefixSum[to+1] - prefixSum[from] */
function sumPageHeights(fromIdx, toIdx) {
	if (toIdx < fromIdx) return 0
	const ps = getPageHeightPrefixSum()
	const hi = Math.min(toIdx + 1, ps.length - 1)
	const lo = Math.min(fromIdx, ps.length - 1)
	return ps[hi] - ps[lo]
}

function getPageTop(pageIdx) {
	return sumPageHeights(0, pageIdx - 1)
}

/** 计算指定页顶部在 scroll-view 内容中的绝对 scrollTop（包含顶部占位） */
function getLocalScrollTopForPage(pageIdx) {
	return sumPageHeights(0, pageIdx - 1)
}

/** scrollTop 为绝对位置（包含顶部占位）；用前缀和二分查找 O(log n) 返回当前所在页 */
function getPageFromScrollTop(scrollTop) {
	const total = imageList.value.length
	if (total <= 0) return 0
	const ps = getPageHeightPrefixSum()
	// scrollTop 落在 [ps[i], ps[i+1]) 区间内 → 当前页为 i
	// 二分查找最大的 i 使 ps[i] <= scrollTop
	let lo = 0, hi = total
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1
		if (ps[mid] <= scrollTop) lo = mid
		else hi = mid - 1
	}
	return Math.min(lo, total - 1)
}

/** 初始化竖向渲染窗口（from / to）
 *  关键修复：from = pageIdx - BEFORE，让目标页之前有缓冲页，
 *  避免用户稍微向上滚就落入顶部占位区域触发 prepend（prepend 会改变顶部占位，
 *  旧逻辑没相应调整 scrollTop，导致跳到第一页） */
function initVerticalWindow(pageIdx) {
	const total = imageList.value.length
	if (total === 0) {
		verticalRenderFrom.value = 0
		verticalRenderTo.value = 0
		return
	}
	const center = Math.max(0, Math.min(pageIdx, total - 1))
	const windowSize = Math.min(
		VERTICAL_WINDOW_MAX,
		VERTICAL_WINDOW_BEFORE + VERTICAL_WINDOW_AFTER + 4
	)
	// 以 pageIdx 为中心，前面留 BEFORE 页缓冲
	let from = Math.max(0, center - VERTICAL_WINDOW_BEFORE)
	let to = Math.min(total, from + windowSize)
	if (to - from < Math.min(windowSize, VERTICAL_WINDOW_AFTER + 2) && from > 0) {
		// 用户在末尾附近，向前扩 from
		from = Math.max(0, to - windowSize)
	}
	verticalRenderFrom.value = from
	verticalRenderTo.value = to
}

/**
 * 滚动过程中动态调整渲染窗口：
 * - 当前页接近 to 时向下扩窗
 * - 仅当窗口超过 VERTICAL_WINDOW_MAX 时才裁剪 from（避免频繁裁剪）
 *
 * 关键修复：裁剪 from 后顶部占位会增加 addedHeight，
 * 必须把 scrollTop 也加上 addedHeight，否则用户会落入顶部占位区域内，
 * 下次 onVerticalScroll 会误判为"接近顶部"触发 prepend，
 * prepend 后顶部占位消失，scrollTop 落到第一页 → 跳到第一页 bug。
 */
function maybeAdvanceVerticalWindow(scrollTop) {
	if (verticalPrependLock) return
	const total = imageList.value.length
	if (total === 0) return
	const from = verticalRenderFrom.value
	const to = verticalRenderTo.value
	if (to <= 0) return  // 未启用窗口化

	const current = getPageFromScrollTop(scrollTop)

	// 扩展 to（向下）
	const desiredTo = Math.min(total, current + VERTICAL_WINDOW_AFTER + 2)
	if (desiredTo > to) {
		verticalRenderTo.value = desiredTo
	}

	// 裁剪 from：仅在窗口超过 VERTICAL_WINDOW_MAX 且当前页距 from 较远时才裁
	const windowSize = verticalRenderTo.value - from
	if (windowSize > VERTICAL_WINDOW_MAX && current - from > VERTICAL_WINDOW_BEFORE + 2) {
		const desiredFrom = Math.max(0, current - VERTICAL_WINDOW_BEFORE)
		if (desiredFrom > from) {
			// 顶部占位 verticalTopPlaceholderHeight 用同样的 getPageHeight 计算，
			// 被裁掉的页高之和 == 占位新增高度，当前页在内容中的绝对偏移不变，
			// scrollTop 无需任何调整。
			// 旧实现 applyVerticalScrollTopBinding(scrollTop + addedHeight) 会把
			// scrollTop 强行改到 S+H 触发程序化滚动；一旦机型/时序导致 binding 未同步，
			// onVerticalScroll 在 300ms 超时后按错误 scrollTop 释放，页码被写回 0/第 1 页。
			verticalRenderFrom.value = desiredFrom
		}
	}
}

/**
 * 向上滚到渲染区顶部附近时，向前 prepend 一批页。
 *
 * 顶部占位减少的高度 == 新移入渲染区的页高之和（都用 getPageHeight 计算），
 * 几何位置天然保留，scrollTop 无需调整。
 * 旧实现 applyVerticalScrollTopBinding(scrollTop - addedHeight) 会触发程序化滚动，
 * binding 未同步时（300ms 超时）按错误 scrollTop 释放 → 跳到第 1 页。
 */
function maybePrependVerticalPages(scrollTop) {
	if (verticalPrependLock || verticalRenderFrom.value <= 0) return

	// scrollTop 为绝对位置；判断是否在渲染窗口顶部附近需减去顶部占位
	const curFrom = verticalRenderFrom.value
	const topPlaceholder = curFrom > 0 ? sumPageHeights(0, curFrom - 1) : 0
	const localScrollTop = scrollTop - topPlaceholder
	if (localScrollTop > VERTICAL_PREPEND_THRESHOLD) return

	const batch = Math.min(VERTICAL_PREPEND_BATCH, curFrom)
	if (batch <= 0) return

	verticalPrependLock = true
	const newFrom = curFrom - batch
	verticalRenderFrom.value = newFrom
	// 锁仅用于等待 DOM 更新 + scroll-view 稳定，避免连续 scroll 事件里重复 prepend；
	// 原本依赖 binding 同步释放，去掉 scrollTop 绑定后改用定时器释放。
	scheduleVerticalLocate(() => { verticalPrependLock = false }, 200)
}

function onVerticalImageLoad(e, pageIdx) {
	// 返回书库后 image 可能还在异步加载，@load 仍会触发：丢弃，避免写脏 pageHeights
	if (!currentManga.value || viewMode.value !== 'reader') return
	const detail = e.detail || {}
	const h = Number(detail.height)
	const w = Number(detail.width)
	if (h <= 0 || w <= 0) return

	// widthFix 下 detail 通常已是布局宽高；兜底按屏宽等比换算
	const scaledH = w > 0 && Math.abs(w - windowWidth.value) > 2
		? Math.max(80, Math.round(h * (windowWidth.value / w)))
		: Math.max(80, Math.round(h))

	// vertical-page 不再设 minHeight: 100vh，pageHeight 直接记录图片实际高度。
	// page 高度 = 图片高度，相邻图片紧挨着无黑色空白。
	setPageHeight(pageIdx, scaledH)

	// 定位已完成：早退，不再触发定位校准
	if (!verticalScrollSuppress && !verticalRestorePending) return
	// 非目标页 load：早退
	if (pageIdx !== readerLocatingTarget) return
	// 定位已超时（readerLocatingUntil 已过）：清掉残余 pending 标志，避免后续图片 load 持续空转 scheduleVerticalLocate
	if (!isReaderLocating()) {
		verticalScrollSuppress = false
		verticalRestorePending = false
		return
	}
	scheduleVerticalLocate(() => verifyVerticalRestoreByDom(readerLocatingTarget, 0), 80)
}

/** 阅读区图片地址（文件夹直接读路径，PDF 读渲染缓存） */
function getReaderImageSrc(pageIdx) {
	if (pageIdx == null || pageIdx < 0) return ''
	void pdfRenderTick.value
	const src = imageList.value[pageIdx]
	if (src) return src
	const nearPage = Math.abs(pageIdx - currentIndex.value) <= PRELOAD_RANGE + 3
	const nearVertical = readMode.value === 'vertical'
		&& Math.abs(pageIdx - currentIndex.value) <= VERTICAL_PRELOAD_RANGE + 6
	if (currentManga.value?.type === 'pdf' && (nearPage || nearVertical)) {
		const pdfPath = currentManga.value.path
		if (!pdfRenderingPages.has(pageIdx)) {
			setTimeout(() => renderPdfPageSync(pdfPath, pageIdx), 0)
		}
	}
	return ''
}

function isPdfFile(name) {
	return String(name).toLowerCase().endsWith('.pdf')
}

/** 去掉 .pdf 扩展名作为显示名 */
function pdfDisplayName(fileName) {
	return String(fileName).replace(/\.pdf$/i, '')
}

/** 扫描指定文件夹内的图片，返回 file:// 路径数组（原始扫描，不走缓存） */
function scanImagesInFolderNative(folderAbsPath) {
	// #ifdef APP-PLUS
	const dir = assertDirectoryReadable(folderAbsPath)
	// 关键优化：用 File.list() 拿文件名数组，而不是 listFiles() 拿 File 对象数组。
	// listFiles() 每个元素都要反射调 getName()/getAbsolutePath()，大目录累计开销大；
	// list() 只返回字符串数组，路径用 folderAbsPath + '/' + name 拼接，零反射。
	const names = dir.list()
	if (!names) return []

	const result = []
	const len = names.length
	const prefix = folderAbsPath.endsWith('/') ? folderAbsPath : folderAbsPath + '/'
	for (let i = 0; i < len; i++) {
		const name = String(names[i])
		if (isImageFile(name)) {
			result.push({
				name,
				path: 'file://' + prefix + name
			})
		}
	}

	result.sort((a, b) => naturalCompare(a.name, b.name))
	const paths = result.map((item) => item.path)
	const mtime = getFolderLastModified(folderAbsPath)
	imageListCache.set(folderAbsPath, { mtime, paths })
	// coverPath 交由 enrich 管理（缩略图缓存），此处不持久化原图路径避免覆盖已有缩略图
	saveFolderMeta(folderAbsPath, paths.length, mtime, '')
	savePathListCache(folderAbsPath, paths, mtime)
	return paths
	// #endif
	// #ifndef APP-PLUS
	return []
	// #endif
}

/** 带缓存的图片列表获取：目录未变则直接返回，打开漫画几乎无等待 */
function getImagesInFolder(folderAbsPath) {
	const fast = getPathListCacheFast(folderAbsPath)
	if (fast) return fast
	const cached = getPathListCache(folderAbsPath)
	if (cached) return cached
	return scanImagesInFolderNative(folderAbsPath)
}

/** 扫描 MyManga 下的子文件夹与 PDF（极速：只列目录名，元信息读缓存，子目录 PDF 后台补） */
function listMangaFoldersFastNative() {
	// #ifdef APP-PLUS
	const t = lap('scan folders')
	const dir = assertDirectoryReadable(MANGA_DIR_ABS)
	const files = dir.listFiles()
	if (!files) return []

	const items = []
	const len = files.length
	for (let i = 0; i < len; i++) {
		const file = files[i]
		const name = String(file.getName())
		if (name.startsWith('.')) continue

		if (file.isDirectory()) {
			const path = String(file.getAbsolutePath())
			const stored = getStoredFolderMeta(path)
			items.push(buildLibraryItem(name, path, stored, 'folder'))
		} else if (file.isFile() && isPdfFile(name)) {
			const path = String(file.getAbsolutePath())
			const stored = getStoredPdfMeta(path)
			items.push(buildLibraryItem(pdfDisplayName(name), path, stored, 'pdf'))
		}
	}

	items.sort((a, b) => naturalCompare(a.name, b.name))
	lap('scan folders', t, `(${items.length} items)`)
	return items
	// #endif
	// #ifndef APP-PLUS
	return []
	// #endif
}

/** 后台扫描各子文件夹内的 PDF 并合并进书库（分步执行，不阻塞点击） */
function collectSubfolderPdfsInBackground() {
	// #ifdef APP-PLUS
	setTimeout(() => {
		if (Date.now() - lastUserActivity < ENRICH_IDLE_MS) {
			setTimeout(collectSubfolderPdfsInBackground, ENRICH_IDLE_MS)
			return
		}

		try {
			const dir = assertDirectoryReadable(MANGA_DIR_ABS)
			const files = dir.listFiles()
			if (!files) return

			const existing = new Set(mangaFolders.value.map((f) => f.path))
			const additions = []
			const len = files.length
			let dirIdx = 0

			function scanNextSubfolder() {
				if (dirIdx >= len) {
					if (additions.length === 0) return
					const merged = mangaFolders.value.concat(additions)
					merged.sort((a, b) => naturalCompare(a.name, b.name))
					mangaFolders.value = merged
					setTimeout(() => saveLibrarySnapshot(merged), 0)
					scheduleEnrichWhenIdle()
					return
				}

				if (Date.now() - lastUserActivity < 2000) {
					setTimeout(scanNextSubfolder, 400)
					return
				}

				const file = files[dirIdx++]
				if (!file.isDirectory()) {
					setTimeout(scanNextSubfolder, 0)
					return
				}
				const dirName = String(file.getName())
				if (dirName.startsWith('.')) {
					setTimeout(scanNextSubfolder, 0)
					return
				}

				try {
					const subFiles = file.listFiles()
					if (subFiles) {
						for (let j = 0; j < subFiles.length; j++) {
							const sub = subFiles[j]
							if (!sub.isFile()) continue
							const subName = String(sub.getName())
							if (!isPdfFile(subName)) continue
							const path = String(sub.getAbsolutePath())
							if (existing.has(path)) continue
							const meta = getStoredPdfMeta(path)
							additions.push(buildLibraryItem(dirName + '/' + pdfDisplayName(subName), path, meta, 'pdf'))
							existing.add(path)
						}
					}
				} catch (e) {
					// 单个子目录失败跳过
				}

				setTimeout(scanNextSubfolder, 48)
			}

			scanNextSubfolder()
		} catch (e) {
			console.error('后台扫描子目录 PDF 失败', e)
		}
	}, SUBFOLDER_PDF_DELAY)
	// #endif
}

/** 判断书库条目是否仍需补全封面/页数 */
function needsEnrich(folder) {
	if (!folder) return false
	if (folder.type === 'pdf') return folder.imageCount < 0 || !folder.coverPath
	return folder.imageCount < 0 || !folder.coverPath
}

/** 补全单条书库元信息（优先 Storage，尽量少做 native I/O）
 *  PDF 类型：封面渲染（200-800ms）改为异步，先返回占位条目，渲染完成后回写列表 */
function enrichSingleItem(folder) {
	if (folder.type === 'pdf') {
		return enrichPdfItem(folder)
	}

	const stored = getStoredFolderMeta(folder.path)
	if (stored?.coverPath && stored.imageCount >= 0) {
		// 旧数据迁移：stored.coverPath 可能是原图（非缩略图缓存），尝试用缩略图替换
		if (!stored.coverPath.includes('folder_thumb/')) {
			const thumbUrl = tryGetFolderThumbUrl(stored.coverPath, FOLDER_THUMB_WIDTH)
			if (thumbUrl) {
				// 缩略图已生成（上次异步生成完成），更新 meta 并返回
				const mtime = getFolderLastModified(folder.path)
				saveFolderMeta(folder.path, stored.imageCount, mtime, thumbUrl)
				return buildLibraryItem(folder.name, folder.path, { ...stored, coverPath: thumbUrl }, 'folder')
			}
			// 缩略图未生成：触发异步生成，先用原图返回（下次 enrich 重试）
			scheduleFolderThumbRender(folder.path, stored.coverPath)
		}
		return buildLibraryItem(folder.name, folder.path, stored, 'folder')
	}

	let coverPath = folder.coverPath || stored?.coverPath || ''
	let imageCount = folder.imageCount >= 0 ? folder.imageCount : (stored?.imageCount ?? -1)

	// 优先补封面（用户可见）；页数缺失可下次再补
	if (!coverPath) {
		const firstImg = getFirstImagePathNative(folder.path)
		if (firstImg) {
			// 优先用缩略图缓存（命中则避免大图解码，提升书库滚动流畅度）
			const thumbUrl = tryGetFolderThumbUrl(firstImg, FOLDER_THUMB_WIDTH)
			if (thumbUrl) {
				coverPath = thumbUrl
			} else {
				// 未命中：用原图占位，异步生成缩略图（下次进入即命中缓存）
				coverPath = firstImg
				scheduleFolderThumbRender(folder.path, firstImg)
			}
		}
	} else if (imageCount < 0) {
		imageCount = countImagesInFolderNative(folder.path)
	}

	// 原图占位不持久化 coverPath，让下次 enrich 重试缩略图生成；
	// 缩略图生成成功后 updateFolderCoverInLibrary 会回写缩略图路径
	const isThumbCache = !coverPath || coverPath.includes('folder_thumb/')
	const savedCoverPath = isThumbCache ? coverPath : ''
	const mtime = getFolderLastModified(folder.path)
	const effectiveImageCount = imageCount >= 0 ? imageCount : (stored?.imageCount ?? -1)
	if (effectiveImageCount >= 0) {
		saveFolderMeta(folder.path, effectiveImageCount, mtime, savedCoverPath)
	}
	return buildLibraryItem(folder.name, folder.path, {
		imageCount: imageCount >= 0 ? imageCount : (stored?.imageCount ?? -1),
		coverPath
	}, 'folder')
}

/** PDF 补全：先返回页数（getPdfPageCount ~20-50ms 可接受同步），封面渲染异步回写
 *  原 enrichSingleItem 同步渲染封面会阻塞主线程 200-800ms，多个 PDF 首屏可见时累计卡顿明显 */
function enrichPdfItem(folder) {
	const stored = getStoredPdfMeta(folder.path)
	if (stored?.coverPath && stored.imageCount >= 0) {
		return buildLibraryItem(folder.name, folder.path, stored, 'pdf')
	}

	let imageCount = folder.imageCount >= 0 ? folder.imageCount : (stored?.imageCount ?? -1)
	let coverPath = folder.coverPath || stored?.coverPath || ''

	// 页数缺失：getPdfPageCount 同步调用（~20-50ms，比渲染快得多，可接受）
	if (imageCount < 0) {
		imageCount = getPdfPageCount(folder.path)
	}

	// 封面缺失：优先用已缓存缩略图；否则异步渲染，先返回占位
	if (!coverPath) {
		const thumbCache = getPdfThumbCachePath(folder.path)
		if (fileExists(thumbCache)) {
			coverPath = fileUrlFromPath(thumbCache)
		} else if (isPdfSupported() && imageCount > 0) {
			// 异步渲染封面，不阻塞当前批次
			schedulePdfThumbnailRender(folder.path)
		}
	}

	const meta = {
		mtime: getFileLastModified(folder.path),
		imageCount: imageCount >= 0 ? imageCount : 0,
		coverPath
	}
	if (meta.imageCount > 0) savePdfMeta(folder.path, meta)
	return buildLibraryItem(folder.name, folder.path, meta, 'pdf')
}

/** 异步渲染 PDF 缩略图并回写列表（不阻塞主线程） */
function schedulePdfThumbnailRender(pdfAbsPath) {
	// #ifdef APP-PLUS
	setTimeout(() => {
		try {
			const _t = lap('pdf thumb render')
			const coverPath = renderPdfThumbnail(pdfAbsPath, PDF_THUMB_WIDTH)
			lap('pdf thumb render', _t)
			if (coverPath) {
				updatePdfCoverInLibrary(pdfAbsPath, coverPath)
			}
		} catch (e) {
			console.error('异步渲染 PDF 缩略图失败', pdfAbsPath, e)
		}
	}, 0)
	// #endif
}

/** 渲染完成后回写书库列表中的封面 */
function updatePdfCoverInLibrary(pdfAbsPath, coverPath) {
	const idx = mangaFolders.value.findIndex((f) => f.path === pdfAbsPath)
	if (idx < 0) return
	const item = mangaFolders.value[idx]
	const meta = {
		mtime: getFileLastModified(pdfAbsPath),
		imageCount: item.imageCount,
		coverPath
	}
	savePdfMeta(pdfAbsPath, meta)
	setMangaFolderAt(idx, buildLibraryItem(item.name, pdfAbsPath, meta, 'pdf'))
}

/** 异步生成文件夹缩略图并回写列表（不阻塞主线程）
 *  首次进入书库时缩略图缓存未命中，先用原图占位，生成完成后回写为缩略图路径 */
function scheduleFolderThumbRender(folderAbsPath, srcFileUrl) {
	// #ifdef APP-PLUS
	setTimeout(() => {
		try {
			const thumbUrl = generateFolderThumb(srcFileUrl, FOLDER_THUMB_WIDTH)
			if (thumbUrl) {
				updateFolderCoverInLibrary(folderAbsPath, thumbUrl)
			}
		} catch (e) {
			console.error('异步生成文件夹缩略图失败', folderAbsPath, e)
		}
	}, 0)
	// #endif
}

/** 文件夹缩略图生成完成后回写书库列表中的封面 */
function updateFolderCoverInLibrary(folderAbsPath, coverPath) {
	const idx = mangaFolders.value.findIndex((f) => f.path === folderAbsPath)
	if (idx < 0) return
	const item = mangaFolders.value[idx]
	const imageCount = item.imageCount
	const mtime = getFolderLastModified(folderAbsPath)
	saveFolderMeta(folderAbsPath, imageCount, mtime, coverPath)
	setMangaFolderAt(idx, buildLibraryItem(item.name, folderAbsPath, {
		imageCount,
		coverPath
	}, 'folder'))
}

/** 后台补全书库各条目的页数与封面（仅空闲时、逐条、可随时被用户操作打断） */
function enrichFolderMetaInBackground() {
	// #ifdef APP-PLUS
	const token = ++enrichCancelToken

	if (Date.now() - lastUserActivity < ENRICH_IDLE_MS || Date.now() < enrichPausedUntil) {
		scheduleEnrichWhenIdle()
		return
	}
	if (viewMode.value !== 'library') return

	const indices = []
	mangaFolders.value.forEach((folder, i) => {
		if (needsEnrich(folder)) indices.push(i)
	})
	if (indices.length === 0) return

	const sortedIndices = sortEnrichIndicesByVisibility(indices)

	let ptr = 0

	function enrichBatch() {
		if (token !== enrichCancelToken) return
		if (Date.now() - lastUserActivity < ENRICH_IDLE_MS || Date.now() < enrichPausedUntil) {
			scheduleEnrichWhenIdle()
			return
		}
		if (viewMode.value !== 'library') return

		const batchEnd = Math.min(ptr + ENRICH_BATCH_SIZE, sortedIndices.length)
		let changed = false

		for (let p = ptr; p < batchEnd; p++) {
			const idx = sortedIndices[p]
			const folder = mangaFolders.value[idx]
			if (!folder || !needsEnrich(folder)) continue
			try {
				// shallowRef 下标赋值需手动 triggerRef
				setMangaFolderAt(idx, enrichSingleItem(folder))
				changed = true
				enrichItemsSinceSnapshot++
			} catch (e) {
				// 单条失败跳过
			}
		}

		if (changed) {
			if (enrichItemsSinceSnapshot >= ENRICH_SNAPSHOT_EVERY || ptr + ENRICH_BATCH_SIZE >= sortedIndices.length) {
				enrichItemsSinceSnapshot = 0
				setTimeout(() => saveLibrarySnapshot(mangaFolders.value), 0)
			}
		}

		ptr = batchEnd
		if (ptr < sortedIndices.length) {
			enrichTimer = setTimeout(() => {
				enrichTimer = null
				enrichBatch()
			}, ENRICH_BATCH_GAP)
		} else {
			scheduleEnrichWhenIdle()
			// 所有缩略图补完后，顺势预热最近阅读的漫画路径列表（仅空闲时执行）
			schedulePreloadRecent()
		}
	}

	enrichBatch()
	// #endif
}

/**
 * 后台预热最近阅读的漫画的图片路径列表（仅预热 folder 类型，PDF 无需扫描）。
 * 命中后用户点击该漫画时 getPathListCacheFast 直接命中内存，免扫描免读 Storage，瞬间进入阅读器。
 * 仅在书库视图 + 用户空闲时运行，用户一操作即取消。
 * 仅预热 watchHistory 前 3 本且 type !== 'pdf' 的漫画。
 */
function preloadRecentMangaPathLists() {
	// #ifdef APP-PLUS
	if (viewMode.value !== 'library') return
	if (Date.now() - lastUserActivity < ENRICH_IDLE_MS) {
		schedulePreloadRecent()
		return
	}

	const history = watchHistory.value && watchHistory.value.length
		? watchHistory.value
		: loadWatchHistoryFromStorage()
	if (!history || history.length === 0) return

	const targets = []
	for (const item of history) {
		if (targets.length >= 3) break
		if (!item || !item.path) continue
		if (item.type === 'pdf') continue
		if (imageListCache.has(item.path)) continue
		targets.push(item.path)
	}
	if (targets.length === 0) return

	let ptr = 0
	function preloadNext() {
		if (viewMode.value !== 'library') return
		if (Date.now() - lastUserActivity < ENRICH_IDLE_MS) {
			schedulePreloadRecent()
			return
		}
		if (ptr >= targets.length) return
		const path = targets[ptr++]
		try {
			// 已有缓存（可能在循环中被另一路径预热过）则跳过
			if (imageListCache.has(path)) {
				preloadNext()
				return
			}
			getImagesInFolder(path)
		} catch (e) {
			// 单本失败跳过
		}
		// 串行 + 间隔，避免连续扫描多本漫画占用 IO
		setTimeout(preloadNext, ENRICH_BATCH_GAP)
	}

	preloadNext()
	// #endif
}

let _preloadRecentTimer = null
function schedulePreloadRecent() {
	if (_preloadRecentTimer) clearTimeout(_preloadRecentTimer)
	_preloadRecentTimer = setTimeout(() => {
		_preloadRecentTimer = null
		preloadRecentMangaPathLists()
	}, ENRICH_IDLE_MS)
}


/** 权限通过后扫描子文件夹，进入书库视图 */
async function scanAndLoadFolders(force = false, options = {}) {
	if (hasScannedFolders.value && !force && mangaFolders.value.length > 0) return

	const hasVisibleList = mangaFolders.value.length > 0
	if (!hasVisibleList) libraryLoading.value = true
	if (!options.silent) {
		statusMessage.value = ''
		viewMode.value = 'library'
	}
	needOpenSettings.value = false

	// 已有快照时零延迟扫描；否则让出一帧再扫
	await new Promise((resolve) => setTimeout(resolve, hasVisibleList ? 0 : 16))

	try {
		const folders = await new Promise((resolve, reject) => {
			setTimeout(() => {
				try {
					resolve(listMangaFoldersFastNative())
				} catch (e) {
					reject(e)
				}
			}, 0)
		})

		const merged = mergeLibraryLists(mangaFolders.value, folders)
		mangaFolders.value = merged
		// 扫描结果本身就是磁盘实际状态，merged 只含目录里存在的项，不需要再调 prune（避免一遍同步 File I/O）
		// 只刷新历史（同步历史里的删除项）
		refreshWatchHistory(true)
		setTimeout(() => saveLibrarySnapshot(mangaFolders.value), 0)
		hasScannedFolders.value = true
		libraryReady.value = true
		viewMode.value = 'library'
		statusMessage.value = ''
		markStorageGranted()
		refreshWatchHistory(true)
		setTimeout(() => collectSubfolderPdfsInBackground(), SUBFOLDER_PDF_DELAY)
		scheduleEnrichWhenIdle()
		scheduleInitialCoverEnrich()
	} catch (err) {
		console.error('扫描文件夹失败', err)
		handleScanError(err)
	} finally {
		libraryLoading.value = false
	}
}

function handleScanError(err) {
	if (err.code === 'DIR_NOT_EXISTS') {
		statusMessage.value =
			'MyManga 文件夹不存在\n请在手机内部存储根目录创建：\n/storage/emulated/0/MyManga'
	} else if (err.code === 'NO_READ_PERMISSION') {
		needOpenSettings.value = getAndroidSdkInt() >= 30
		statusMessage.value = getAndroidSdkInt() >= 30
			? '需要「所有文件访问」权限才能读取 MyManga 目录'
			: '存储权限不足，无法读取 MyManga 目录'
	} else {
		statusMessage.value = '无法访问 MyManga 目录\n请确认文件夹存在'
	}
}

/** 手动刷新书库（保留当前列表可见，后台更新，不弹阻塞 toast） */
async function refreshFolders() {
	if (isRefreshing.value) return

	pauseEnrichForUserAction()
	isRefreshing.value = true

	try {
		if (!probeDirectoryAccessNative() && !(await hasStorageAccess())) {
			uni.showToast({ title: '无法访问 MyManga 目录', icon: 'none', duration: 1200 })
			statusMessage.value = '需要存储权限才能读取 MyManga 目录'
			needOpenSettings.value = getAndroidSdkInt() >= 30
			return
		}

		hasScannedFolders.value = false
		imageListCache.clear()
		await scanAndLoadFolders(true, { silent: true })
		// prune 现在分批异步；不阻塞 finally，让 isRefreshing 尽快复位
		void pruneMissingMangaFromLibrary(true)
	} catch (err) {
		console.error('刷新书库失败', err)
		uni.showToast({ title: '刷新失败', icon: 'none', duration: 1200 })
	} finally {
		isRefreshing.value = false
		scheduleEnrichWhenIdle()
	}
}

// ==================== 书库 ↔ 阅读 切换 ====================

/** 打开书库条目：图片文件夹或 PDF（正文图片点开后再加载） */
async function openManga(item) {
	const _t = lap('open manga')
	pauseEnrichForUserAction()

	if (!isMangaPathAvailable(item)) {
		promptMissingManga(item)
		return
	}

	if (item.type === 'pdf') {
		await openPdf(item)
		lap('open manga', _t, '(pdf)')
		return
	}

	if (item.imageCount === 0) {
		uni.showToast({ title: '该文件夹内没有图片', icon: 'none' })
		return
	}

	const fastPaths = getPathListCacheFast(item.path)
	if (fastPaths && fastPaths.length > 0) {
		enterMangaReader(item, fastPaths)
		validatePathListCacheAsync(item.path)
		lap('open manga', _t, `(cache hit, ${fastPaths.length} pages)`)
		return
	}

	uni.showLoading({ title: '加载漫画…', mask: true })
	try {
		const paths = await new Promise((resolve, reject) => {
			setTimeout(() => {
				try {
					resolve(getImagesInFolder(item.path))
				} catch (e) {
					reject(e)
				}
			}, 0)
		})

		if (paths.length === 0) {
			uni.showToast({ title: '该文件夹内没有图片', icon: 'none' })
			return
		}

		enterMangaReader(item, paths)
		lap('open manga', _t, `(scan, ${paths.length} pages)`)
	} catch (err) {
		console.error('加载漫画失败', err)
		uni.showToast({ title: '加载失败', icon: 'none' })
	} finally {
		uni.hideLoading()
	}
}

function enterMangaReader(item, paths) {
	const startIdx = resolveStartPageIndex(item.path, paths.length)

	currentManga.value = { ...item, type: 'folder', imageCount: paths.length }
	imageList.value = paths
	currentIndex.value = startIdx
	displayPageIndex.value = startIdx
	viewMode.value = 'reader'
	// 进入阅读器：控件默认隐藏（方案 A）
	showTopControls.value = false
	showBottomControls.value = false
	beginReaderLocate(startIdx)
	enterReaderAtPage(startIdx)
	addToWatchHistory({
		path: item.path,
		name: item.name,
		type: 'folder',
		pageIndex: startIdx,
		imageCount: paths.length,
		coverPath: paths[0] || item.coverPath || ''
	})
}

/** 打开 PDF：渲染为图片页后进入阅读器 */
async function openPdf(item) {
	if (!isPdfSupported()) {
		uni.showToast({ title: '当前系统不支持 PDF 阅读', icon: 'none' })
		return
	}

	const meta = getPdfMeta(item.path) || getStoredPdfMeta(item.path) || resolvePdfMeta(item.path)
	const pageCount = meta?.imageCount > 0 ? meta.imageCount : item.imageCount
	if (!pageCount || pageCount <= 0) {
		uni.showToast({ title: '无法读取该 PDF', icon: 'none' })
		return
	}

	const startIdx = resolveStartPageIndex(item.path, pageCount)

	currentManga.value = {
		...item,
		type: 'pdf',
		imageCount: pageCount,
		coverPath: meta?.coverPath || item.coverPath || ''
	}
	imageList.value = new Array(pageCount).fill('')
	currentIndex.value = startIdx
	displayPageIndex.value = startIdx
	viewMode.value = 'reader'
	// 进入阅读器：控件默认隐藏（方案 A）
	showTopControls.value = false
	showBottomControls.value = false
	beginReaderLocate(startIdx)
	enterReaderAtPage(startIdx)

	pdfLoading.value = true
	try {
		const range = readMode.value === 'vertical' ? VERTICAL_PRELOAD_RANGE + 4 : PRELOAD_RANGE + 3
		const from = Math.max(0, startIdx - range)
		const to = Math.min(pageCount - 1, startIdx + range)
		await renderPdfPagesRange(item.path, from, to, startIdx)

		addToWatchHistory({
			path: item.path,
			name: item.name,
			type: 'pdf',
			pageIndex: startIdx,
			imageCount: pageCount,
			coverPath: meta?.coverPath || item.coverPath || ''
		})
	} catch (err) {
		console.error('加载 PDF 失败', err)
		uni.showToast({ title: 'PDF 加载失败', icon: 'none' })
		viewMode.value = 'library'
	} finally {
		pdfLoading.value = false
	}
}

/** 返回书库，保存当前漫画进度并刷新列表显示 */
function backToLibrary() {
	pauseEnrichForUserAction()
	disableVolumeKeys()
	closePageJump()
	showPageJumpModal.value = false
	// 记录进入阅读器前的书库滚动位置，返回后用它恢复
	// （onLibraryScroll 持续更新 libraryScrollTop；进阅读器时 scroll-view 被销毁，需在切回前捕获）
	const restoreTop = libraryScrollTop
	if (currentManga.value) {
		flushPendingPageHeights()
		const scrollPage = lastVerticalScrollTop > 0
			? getPageFromScrollTop(lastVerticalScrollTop)
			: 0
		const progressIdx = readMode.value === 'vertical'
			? Math.max(currentIndex.value, displayPageIndex.value, scrollPage)
			: currentIndex.value
		saveProgress(progressIdx, true)
		if (readMode.value === 'vertical' && currentManga.value.path) {
			saveVerticalLayoutCache(currentManga.value.path, progressIdx)
		}
		const count = imageList.value.length
		const coverPath = currentManga.value.type === 'pdf'
			? (currentManga.value.coverPath || getPdfPageUrl(currentManga.value.path, 0))
			: (imageList.value[0] || currentManga.value.coverPath || '')
		addToWatchHistory({
			path: currentManga.value.path,
			name: currentManga.value.name,
			type: currentManga.value.type || 'folder',
			pageIndex: progressIdx,
			imageCount: count,
			coverPath
		})
		const idx = mangaFolders.value.findIndex((f) => f.path === currentManga.value.path)
		if (idx >= 0) {
			const item = mangaFolders.value[idx]
			setMangaFolderAt(idx, buildLibraryItem(
				item.name,
				currentManga.value.path,
				{ imageCount: count, coverPath },
				item.type || 'folder'
			))
		}
	}

	// 切回书库前预设 scroll-top，让新挂载的 scroll-view 初始即定位到目标值
	libraryScrollTopBinding.value = restoreTop
	viewMode.value = 'library'
	imageList.value = []
	currentIndex.value = 0
	displayPageIndex.value = 0
	currentManga.value = null
	pdfLoading.value = false
	pdfRenderingPages.clear()
	// 取消所有 pending 的 PDF 异步渲染，避免回调访问已置空的 currentManga.value
	_pdfRenderToken++
	// 关闭所有缓存的 PdfRenderer，释放 native 资源（pfd + renderer）
	// 阅读器退出后再进同一 PDF 仍会重新打开，但避免了书库视图下长期持有文件描述符
	closeAllPdfRenderers()
	clearReaderSrcCache()
	resetPageHeights()
	clearVerticalLocateTimers()
	readerLocatingUntil = 0
	readerLocatingTarget = 0
	verticalLocateFinishedAt = 0
	verticalResumeScrollTop = 0
	verticalScrollIntoView.value = ''
	verticalScrollTopActive.value = false
	verticalScrollTopBinding.value = 0
	verticalScrollSuppress = false
	verticalRestorePending = false
	verticalRenderFrom.value = 0
	verticalRenderTo.value = 0
	verticalPrependLock = false
	if (verticalScrollEndTimer) {
		clearTimeout(verticalScrollEndTimer)
		verticalScrollEndTimer = null
	}
	if (verticalScrollSaveTimer) {
		clearTimeout(verticalScrollSaveTimer)
		verticalScrollSaveTimer = null
	}
	if (verticalScrollRaf) {
		clearTimeout(verticalScrollRaf)
		verticalScrollRaf = null
	}
	slideIndices.value = [0, 1, 2]
	swiperCurrent.value = 0
	pendingSwipePos = null
	if (autoCenterTimer) {
		clearTimeout(autoCenterTimer)
		autoCenterTimer = null
	}

	// 二次滚动保证生效：uni-app 对 scroll-view 初始 scroll-top 常不响应
	// 用 0 → restoreTop 的值变化触发实际滚动（极短闪动可接受）
	if (restoreTop > 0) {
		libraryScrollTopBinding.value = 0
		nextTick(() => {
			libraryScrollTopBinding.value = restoreTop
		})
	}
	// 返回书库后顺势预热最近阅读的漫画（仅空闲时执行，不抢占 scroll 恢复）
	schedulePreloadRecent()
}

// ==================== 翻页（滑动 / 音量键 / 循环阅读） ====================

/** 保存当前漫画阅读进度
 *  force=true（退出阅读器时）走异步 uni.setStorage，避免大目录下同步 IO 阻塞 viewMode 切换
 *  force=false（翻页时）仍走同步，保证进度即时落盘 */
function saveProgress(idx, force = false) {
	if (!currentManga.value) return
	if (!force && readerLocatingTarget > 0 && idx < readerLocatingTarget) {
		if (isReaderLocating() || verticalRestorePending || verticalScrollSuppress) return
	}
	const key = getProgressKey(currentManga.value.path)
	if (force) {
		uni.setStorage({ key, data: idx })
	} else {
		uni.setStorageSync(key, idx)
	}
}

/** 跳转到指定页（统一入口，支持读完循环回第一页） */
function goToPage(idx) {
	const total = imageList.value.length
	if (total === 0) return

	let target = idx
	if (target >= total) target = 0
	if (target < 0) target = total - 1

	// PDF：跳页距离 > 100 时触发缓存清理，避免长期翻阅后磁盘膨胀
	// 异步执行不阻塞跳页动画
	if (currentManga.value?.type === 'pdf') {
		const jumpDist = Math.abs(target - currentIndex.value)
		if (jumpDist > 100) {
			const pdfPath = currentManga.value.path
			const keepFrom = Math.max(0, target - 100)
			setTimeout(() => {
				if (currentManga.value?.path === pdfPath) {
					prunePdfPageCache(pdfPath, keepFrom)
				}
			}, 500)
		}
	}

	currentIndex.value = target
	displayPageIndex.value = target
	saveProgress(target, true)

	if (readMode.value === 'vertical') {
		scrollVerticalToPage(target, true)
		return
	}

	swiperResetting = true
	swiperDuration.value = 0
	setupVirtualSwiper(target)
	nextTick(() => {
		swiperResetting = false
		swiperDuration.value = 200
	})
}

/** 下一页：末页后继续操作则回到第一页 */
function goToNextPage() {
	if (pageTurnLock || viewMode.value !== 'reader') return
	pageTurnLock = true
	setTimeout(() => { pageTurnLock = false }, 180)

	const total = imageList.value.length
	if (total === 0) return
	goToPage(currentIndex.value >= total - 1 ? 0 : currentIndex.value + 1)
}

/** 上一页：已在首页则保持不动 */
function goToPrevPage() {
	if (pageTurnLock || viewMode.value !== 'reader') return
	pageTurnLock = true
	setTimeout(() => { pageTurnLock = false }, 180)

	if (currentIndex.value <= 0) return
	goToPage(currentIndex.value - 1)
}

/** 开启音量键翻页（音量- 下一页，音量+ 上一页，并阻止系统调音量） */
function enableVolumeKeys() {
	// #ifdef APP-PLUS
	disableVolumeKeys()
	plus.key.setVolumeButtonEnabled(false)
	volumeDownHandler = () => goToNextPage()
	volumeUpHandler = () => goToPrevPage()
	plus.key.addEventListener('volumedownbutton', volumeDownHandler, false)
	plus.key.addEventListener('volumeupbutton', volumeUpHandler, false)
	// #endif
}

/** 关闭音量键翻页，恢复系统音量键默认行为 */
function disableVolumeKeys() {
	// #ifdef APP-PLUS
	if (volumeDownHandler) {
		plus.key.removeEventListener('volumedownbutton', volumeDownHandler)
		volumeDownHandler = null
	}
	if (volumeUpHandler) {
		plus.key.removeEventListener('volumeupbutton', volumeUpHandler)
		volumeUpHandler = null
	}
	plus.key.setVolumeButtonEnabled(true)
	// #endif
}

// ==================== 竖向阅读（全页列表 + scroll-into-view） ====================

/** 进入阅读器并定位到指定页 */
function enterReaderAtPage(pageIdx) {
	clearReaderSrcCache()
	resetPageHeights()
	clearVerticalLocateTimers()
	verticalScrollSuppress = false
	verticalRestorePending = false
	verticalPrependLock = false
	displayPageIndex.value = pageIdx
	currentIndex.value = pageIdx
	if (verticalScrollSaveTimer) {
		clearTimeout(verticalScrollSaveTimer)
		verticalScrollSaveTimer = null
	}
	if (readMode.value === 'vertical') {
		if (currentManga.value?.path) {
			restoreVerticalLayoutCache(currentManga.value.path, pageIdx)
		}
		initVerticalWindow(pageIdx)
		// 顶部占位存在时，scrollTop=0 会落到占位上而非目标页；先绑定到目标页的绝对 scrollTop
		const absTop = getLocalScrollTopForPage(pageIdx)
		lastVerticalScrollTop = absTop
		verticalScrollIntoView.value = ''
		verticalScrollTopActive.value = true
		verticalScrollTopBinding.value = absTop
		beginReaderLocate(pageIdx)
		nextTick(() => {
			preloadReaderPagesAround(pageIdx)
			// 释放 scroll-top 绑定，让 scroll-into-view / 后续滚动可以接管
			verticalScrollTopActive.value = false
			if (pageIdx > 0) {
				scheduleVerticalLocate(() => verifyVerticalRestoreByDom(pageIdx, 0), 120)
			}
		})
		return
	}
	setupVirtualSwiper(pageIdx)
	preloadReaderPagesAround(pageIdx)
}

function onVerticalReaderTouchStart(e) {
	// 1. 原有逻辑：释放 scroll-top 绑定
	if (verticalScrollTopActive.value) {
		releaseVerticalScrollTopBinding()
	}
	// 2. 控件显隐逻辑：记录触摸起点，touchend 时判断 tap
	onReaderTouchStart(e)
}

// ==================== 阅读器控件显隐（点击上/下 1/4 区域切换） ====================
let readerTouchStartX = 0
let readerTouchStartY = 0
const READER_TAP_MOVE_THRESHOLD = 10

function onReaderTouchStart(e) {
	const touch = e.touches && e.touches[0]
	if (!touch) return
	readerTouchStartX = touch.clientX
	readerTouchStartY = touch.clientY
}

function onReaderTouchEnd(e) {
	const touch = e.changedTouches && e.changedTouches[0]
	if (!touch) return
	const dx = touch.clientX - readerTouchStartX
	const dy = touch.clientY - readerTouchStartY
	// 移动距离超过阈值视为滑动，不触发显隐切换
	if (dx * dx + dy * dy > READER_TAP_MOVE_THRESHOLD * READER_TAP_MOVE_THRESHOLD) return
	const y = touch.clientY
	const h = windowHeight.value
	if (h <= 0) return
	if (y < h * 0.25) {
		// 点击上 1/4：切换顶部控件，关闭底部
		showTopControls.value = !showTopControls.value
		showBottomControls.value = false
	} else if (y > h * 0.75) {
		// 点击下 1/4：切换底部控件，关闭顶部
		showBottomControls.value = !showBottomControls.value
		showTopControls.value = false
	} else {
		// 中间 1/2：两个都隐藏
		showTopControls.value = false
		showBottomControls.value = false
	}
}

function releaseVerticalScrollTopBinding() {
	verticalScrollTopActive.value = false
	// 同步释放 prependLock：用户主动触摸说明要接管滚动，
	// prepend binding 期间被设的 lock 也应一起释放，否则后续 prepend 被永久锁住
	verticalPrependLock = false
}

function applyVerticalScrollTopBinding(top) {
	verticalScrollTopActive.value = true
	verticalScrollTopBinding.value = Math.max(0, top)
	lastVerticalScrollTop = Math.max(0, top)
	_bindingSetAt = Date.now()
}

function finishVerticalRestore(target, scrollTop) {
	verticalScrollIntoView.value = ''
	verticalScrollAnimated.value = false
	verticalScrollSuppress = false
	verticalRestorePending = false
	currentIndex.value = target
	displayPageIndex.value = target
	verticalLocateFinishedAt = Date.now()
	readerLocatingUntil = Date.now() + 400
	lastVerticalScrollTop = Math.max(0, scrollTop)
}

function tryCompleteVerticalRestoreFromScroll() {
	if (!verticalRestorePending || readerLocatingTarget <= 0) return false
	const page = getPageFromScrollTop(lastVerticalScrollTop)
	if (page < readerLocatingTarget) return false
	finishVerticalRestore(readerLocatingTarget, lastVerticalScrollTop)
	return true
}

function verifyVerticalRestoreByDom(target, attempt = 0) {
	uni.createSelectorQuery()
		.select('#vpage-' + target)
		.boundingClientRect()
		.select('.vertical-reader')
		.boundingClientRect()
		.select('.vertical-reader')
		.scrollOffset()
		.exec((res) => {
			const pageRect = res[0]
			const containerRect = res[1]
			const scroll = res[2]
			if (pageRect && containerRect && pageRect.height > 0) {
				const relTop = pageRect.top - containerRect.top
				if (relTop >= -32 && relTop < containerRect.height * 0.92) {
					finishVerticalRestore(target, scroll?.scrollTop ?? lastVerticalScrollTop)
					return
				}
			}
			if (attempt >= 12) {
				finishVerticalRestore(target, lastVerticalScrollTop)
				return
			}
			verticalScrollIntoView.value = ''
			nextTick(() => {
				verticalScrollIntoView.value = 'vpage-' + target
				scheduleVerticalLocate(
					() => verifyVerticalRestoreByDom(target, attempt + 1),
					100 + attempt * 45
				)
			})
		})
}

function scrollVerticalToPage(pageIdx, animated = false) {
	clearVerticalLocateTimers()
	const total = imageList.value.length
	if (total <= 0) return
	const target = Math.max(0, Math.min(total - 1, pageIdx))
	verticalScrollAnimated.value = animated
	beginReaderLocate(target)
	currentIndex.value = target
	displayPageIndex.value = target
	preloadReaderPagesAround(target)

	verticalScrollIntoView.value = ''
	verticalScrollSuppress = true
	verticalRestorePending = false

	// 若目标在当前窗口外，重置窗口到目标附近
	if (target < verticalRenderFrom.value || target >= verticalRenderTo.value) {
		initVerticalWindow(target)
	}

	// 目标页的绝对 scrollTop（包含顶部占位高度）
	const absTop = getLocalScrollTopForPage(target)
	lastVerticalScrollTop = absTop
	applyVerticalScrollTopBinding(absTop)
	scheduleVerticalLocate(() => {
		verticalScrollSuppress = false
		readerLocatingUntil = Date.now() + 300
	}, animated ? 320 : 120)
}

function onVerticalScroll(e) {
	lastVerticalScrollTop = e.detail.scrollTop

	// binding 期间（enterReaderAtPage / scrollVerticalToPage 程序化定位 scrollTop）：
	// 必须等 scroll-view 报告的 scrollTop 真正接近 binding 值才释放，
	// 否则未同步的 scrollTop 会误触发 prepend/advance 连锁反应。
	// 注：trim/prepend 不再使用 binding，因为顶部占位已天然保留几何位置。
	if (verticalScrollTopActive.value) {
		const target = verticalScrollTopBinding.value
		// 已同步（差值 ≤ 5px）或超时（300ms）才释放
		if (Math.abs(e.detail.scrollTop - target) <= 5 || Date.now() - _bindingSetAt > 300) {
			verticalScrollTopActive.value = false
			verticalPrependLock = false
			lastVerticalScrollTop = e.detail.scrollTop
		}
		// 无论是否释放，这一帧都不处理 prepend/advance，避免 binding 未生效时误触发
		return
	}

	if (verticalScrollSuppress || verticalRestorePending) {
		tryCompleteVerticalRestoreFromScroll()
		if (verticalScrollSuppress || verticalRestorePending) return
	}

	if (isReaderLocating()) return

	// 定位保护期内不调整渲染窗口：进入/跳页时 scrollTop 可能短暂为 0，
	// 此时若触发 prepend 会把 from 一路拉回 0，干扰 verifyVerticalRestoreByDom 定位，
	// 也容易把页码写回第 1 页。
	if (!verticalPrependLock) {
		maybePrependVerticalPages(lastVerticalScrollTop)
		maybeAdvanceVerticalWindow(lastVerticalScrollTop)
	}

	displayPageIndex.value = getPageFromScrollTop(lastVerticalScrollTop)

	if (verticalScrollRaf) return
	// 节流 32ms（约 30 帧/秒）：让窗口调整/预加载更跟手，减少快速滚动时窗口来不及扩展导致的黑屏
	verticalScrollRaf = setTimeout(() => {
		verticalScrollRaf = null
		handleVerticalScrollUpdate(lastVerticalScrollTop)
	}, 32)
}

function handleVerticalScrollUpdate(scrollTop) {
	if (verticalScrollSuppress || verticalRestorePending || isReaderLocating()) return
	const total = imageList.value.length
	if (total <= 0) return

	const clamped = getPageFromScrollTop(scrollTop)

	if (clamped !== currentIndex.value) {
		currentIndex.value = clamped
		if (verticalScrollSaveTimer) clearTimeout(verticalScrollSaveTimer)
		verticalScrollSaveTimer = setTimeout(() => {
			if (!isReaderLocating() && !verticalRestorePending) saveProgress(clamped)
		}, 300)
		preloadReaderPagesAround(clamped)
	}
}

// ==================== 虚拟 Swiper（仅 3 个 swiper-item，避免数百页卡顿） ====================

/** 根据当前页码初始化虚拟 Swiper 三个槽位 */
function setupVirtualSwiper(pageIdx) {
	const total = imageList.value.length
	if (total <= 0) return

	if (total === 1) {
		slideIndices.value = [0]
		swiperCurrent.value = 0
		return
	}
	if (total === 2) {
		slideIndices.value = [0, 1]
		swiperCurrent.value = pageIdx
		return
	}

	// 首页：槽位 [0,1,2]，指示器在 0
	if (pageIdx <= 0) {
		slideIndices.value = [0, 1, 2]
		swiperCurrent.value = 0
		return
	}
	// 末页：槽位 [n-2,n-1,n]，指示器在 2
	if (pageIdx >= total - 1) {
		slideIndices.value = [total - 3, total - 2, total - 1]
		swiperCurrent.value = 2
		return
	}
	// 中间页：指示器在 1
	slideIndices.value = [pageIdx - 1, pageIdx, pageIdx + 1]
	swiperCurrent.value = 1
}

/** 滑动翻页：根据虚拟槽位偏移更新实际页码 */
function onSwiperChange(e) {
	if (swiperResetting) {
		// reset 期间用户滑动被屏蔽，记录意图待 reset 完成后补发
		pendingSwipePos = e.detail.current
		return
	}
	// 用户主动滑动时取消挂起的自动归位（新滑动到来，归位不再必要）
	if (autoCenterTimer) {
		clearTimeout(autoCenterTimer)
		autoCenterTimer = null
	}
	const _t = lap('page turn response')
	applyHorizontalSwipe(e.detail.current)
	lap('page turn response', _t, `→ page ${currentIndex.value + 1}`)
}

function applyHorizontalSwipe(pos) {
	const total = imageList.value.length
	if (total <= 2) {
		currentIndex.value = pos
		displayPageIndex.value = pos
		saveProgress(pos)
		swiperCurrent.value = pos
		return
	}

	const prevPos = swiperCurrent.value
	if (pos === prevPos) return

	if (pos > prevPos) {
		currentIndex.value = currentIndex.value >= total - 1 ? 0 : currentIndex.value + 1
	} else if (currentIndex.value > 0) {
		currentIndex.value--
	}
	displayPageIndex.value = currentIndex.value
	saveProgress(currentIndex.value)
	swiperCurrent.value = pos
}

/**
 * 动画结束后将虚拟 Swiper 归位到中间槽。
 * 先让中间槽显示当前页再跳转，避免可见区域短暂切到错误页码。
 *
 * 关键修复：用 setTimeout(16) 代替 nextTick 恢复 duration/resetting。
 * nextTick 时机太早，swiper 内部还没真正消化槽位变化 + current 跳变，
 * 此时恢复 duration 会导致下次滑动出现残影/抽搐。
 * 16ms（一帧）足够让 swiper 完成布局，又不至于让用户感觉到延迟。
 */
function onSwiperAnimationFinish() {
	const total = imageList.value.length
	if (total <= 2) return

	const idx = currentIndex.value
	const pos = swiperCurrent.value

	swiperResetting = true
	swiperDuration.value = 0

	if (idx <= 0) {
		slideIndices.value = [0, 1, 2]
		swiperCurrent.value = 0
	} else if (idx >= total - 1) {
		slideIndices.value = [total - 3, total - 2, total - 1]
		swiperCurrent.value = 2
	} else if (pos === 1) {
		slideIndices.value = [idx - 1, idx, idx + 1]
	} else {
		// 从边缘槽（0 或 2）归位：分两步更新避免 swiper current 跳变时闪烁。
		// 旧实现同时设置 slideIndices 和 swiperCurrent，Vue 批处理后 DOM 更新时序不确定，
		// swiper 原生组件 current 从 0/2 跳到 1 时，若 slot 1 内容尚未更新到 idx，
		// 会短暂显示旧内容（页码 idx-1 或 idx+1），表现为屏幕闪烁。
		// 音量键翻页不闪是因为 setupVirtualSwiper 直接把 swiperCurrent 设为 1，无跳变过程。
		//
		// 修复：先把中间槽内容设为 idx（用户看到的边缘槽内容不变），等 DOM 更新后
		// 再跳 swiperCurrent + 重排窗口，保证跳变时 slot 1 已是 idx，视觉无跳变。
		const tempIndices = [...slideIndices.value]
		tempIndices[1] = idx
		slideIndices.value = tempIndices
		nextTick(() => {
			swiperCurrent.value = 1
			slideIndices.value = [idx - 1, idx, idx + 1]
			setTimeout(finishSwiperReset, 16)
		})
		return
	}

	setTimeout(finishSwiperReset, 16)
}

function finishSwiperReset() {
	swiperResetting = false
	swiperDuration.value = 200
	preloadReaderPagesAround(currentIndex.value)
	// 补发 reset 期间被屏蔽的滑动意图
	if (pendingSwipePos !== null) {
		const pos = pendingSwipePos
		pendingSwipePos = null
		applyHorizontalSwipe(pos)
		// 补发后 swiper 停在用户滑到的槽（0/1/2）。
		// 旧实现会立刻调 onSwiperAnimationFinish() 强制归位到中间槽，把用户的滑动撤销了
		// （表现为"滑了一下又弹回，没进入第二页"）。
		// 现改为延迟自动归位：若用户 300ms 内无新滑动，才把窗口重排到中间槽；
		// 新滑动到来时 onSwiperChange 会取消这个定时器，归位不再执行。
		if (swiperCurrent.value !== 1 && imageList.value.length > 2) {
			if (autoCenterTimer) clearTimeout(autoCenterTimer)
			autoCenterTimer = setTimeout(() => {
				autoCenterTimer = null
				if (!swiperResetting && viewMode.value === 'reader') {
					onSwiperAnimationFinish()
				}
			}, AUTO_CENTER_DELAY)
		}
	}
}
</script>

<style scoped>
/* ════════════════════════════════════════════════════════════════
 * Cool Liquid Glass — iOS 冷色液态玻璃美学
 * 设计方向：iOS 26 液态玻璃 × 冷蓝黑夜色；玻璃只上「悬浮控件层」，
 * 内容层（列表文字、阅读页）保持纯色（官方材质规则）
 * 品牌：iOS systemBlue #0A84FF 作为强调色，克制点缀
 * 玻璃近似：blur + saturate + 白膜 + 内描边；
 * 折射/透镜（feDisplacementMap）不做 — Android WebView 有 alpha
 * 预乘陷阱且逐帧重采样掉帧，用「白膜+描边+高光」近似玻璃质感
 * 阅读器图片区域保持纯黑以保证最大对比度
 * ════════════════════════════════════════════════════════════════ */
.reader-page {
	/* ── 色彩 Tonal Surface 层级（冷蓝底调）── */
	--surface-0: #0C0D10;
	--surface-1: #15161A;
	--surface-2: #1D1F24;
	--surface-3: #26282E;
	--surface-4: #303239;
	/* ── 品牌色阶（iOS systemBlue 深色模式）── */
	--brand: #0A84FF;
	--brand-light: #64A8FF;
	--brand-dark: #0A6FD6;
	--brand-deep: rgba(10, 132, 255, 0.18);
	/* ── 文字（iOS label 体系）── */
	--text-primary: #F5F5F7;
	--text-secondary: #98989F;
	--text-weak: #666670;
	--text-disabled: #48484E;
	--icon-neutral: #8E8E93;
	/* ── 液态玻璃令牌（Liquid Glass 近似）── */
	--glass-blur-s: 8px;   /* 列表卡片（轻） */
	--glass-blur-m: 12px;  /* 搜索框 / Chip / 小控件 */
	--glass-blur-l: 18px;  /* 弹窗大面板 */
	--glass-bg: rgba(255, 255, 255, 0.08);
	--glass-bg-strong: rgba(255, 255, 255, 0.12);
	/* clear 变体：35% 黑色调暗层（HIG 唯一量化规则：覆盖明亮内容必须调暗，
	   白底漫画页上保证白字可读） */
	--glass-bg-clear: rgba(18, 19, 24, 0.35);
	--glass-border: rgba(255, 255, 255, 0.14);
	--glass-highlight: rgba(255, 255, 255, 0.10);
	/* ── 功能色（iOS system colors 深色模式）── */
	--success: #30D158;
	--warning: #FFD60A;
	--error: #FF453A;
	/* ── 圆角（全 App 统一三档）── */
	--radius-sm: 16rpx;
	--radius-md: 24rpx;
	--radius-lg: 40rpx;
	/* ── 字体（iOS 风：全无衬线，PingFang 优先）── */
	--font-sans: "PingFang SC", "Noto Sans CJK SC", "Helvetica Neue", Helvetica, sans-serif;
	width: 100vw;
	height: 100vh;
	background-color: var(--surface-0);
	position: relative;
	overflow: hidden;
	font-family: var(--font-sans);
}

.status-overlay {
	width: 100%;
	height: 100%;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 80rpx;
	box-sizing: border-box;
}

.status-banner {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16rpx;
	margin-bottom: 24rpx;
	padding: 20rpx 24rpx;
	border-radius: var(--radius-md);
	background-color: rgba(255, 214, 10, 0.10);
	border: 1rpx solid rgba(255, 214, 10, 0.28);
}

.status-banner-text {
	flex: 1;
	color: rgba(255, 214, 10, 0.95);
	font-size: 24rpx;
	line-height: 1.5;
}

.status-banner-btn {
	flex-shrink: 0;
	margin: 0;
	padding: 10rpx 24rpx;
	font-size: 24rpx;
	line-height: 1.4;
	color: var(--text-primary);
	background-color: var(--brand);
	border: none;
	border-radius: var(--radius-md);
}

.status-text {
	color: var(--text-secondary);
	font-size: 28rpx;
	text-align: center;
	line-height: 1.8;
	white-space: pre-line;
}

.settings-btn {
	margin-top: 48rpx;
	padding: 0 56rpx;
	height: 96rpx;
	line-height: 96rpx;
	font-size: 30rpx;
	font-weight: 500;
	color: var(--text-primary);
	background-color: var(--brand);
	border: none;
	border-radius: 999rpx;
	/* iOS 实心按钮：中性投影，不用品牌色辉光 */
	box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.30);
}

/* 书库列表 */
.library-view {
	width: 100%;
	height: 100%;
	display: flex;
	flex-direction: column;
	padding: 80rpx 32rpx 40rpx;
	box-sizing: border-box;
	background:
		radial-gradient(ellipse 90% 40% at 50% 0%, rgba(10, 132, 255, 0.045) 0%, transparent 70%),
		var(--surface-0);
}

.library-header {
	margin-bottom: 32rpx;
}

.library-title {
	display: block;
	/* iOS Large Title：34pt 粗体无衬线、字距收紧 */
	color: var(--text-primary);
	font-size: 68rpx;
	font-weight: 700;
	letter-spacing: 0;
	line-height: 1.15;
}

/* 阅读界面右上角的横/竖切换按钮（与左上角"← 书库"对称） */
.reader-mode-toggle {
	position: fixed;
	top: 52rpx;
	right: 24rpx;
	z-index: 100;
	padding: 28rpx 32rpx;
	min-height: 88rpx;
	display: flex;
	align-items: center;
	/* 液态玻璃 clear 变体：35% 调暗层 + 模糊（HIG：覆盖明亮内容必须调暗；
	   真机验证若翻页卡顿则回退纯色 rgba(28,29,34,0.94)） */
	background-color: var(--glass-bg-clear);
	border: 1rpx solid var(--glass-border);
	border-radius: 999rpx;
	-webkit-backdrop-filter: blur(14px) saturate(150%);
	backdrop-filter: blur(14px) saturate(150%);
	box-shadow: 0 4rpx 18rpx rgba(0, 0, 0, 0.35), inset 0 1rpx 0 var(--glass-highlight);
	transform: translateZ(0);
	transition: transform 120ms ease-out, background-color 120ms ease-out;
}

.reader-mode-toggle:active {
	transform: scale(0.94);
	/* 按压态保持调暗（比静止态亮一档做反馈），白底页上文字仍可读 */
	background-color: rgba(40, 42, 50, 0.45);
}

.reader-mode-toggle-text {
	color: var(--text-primary);
	font-size: 26rpx;
	font-weight: 500;
}

.library-toolbar {
	margin-bottom: 28rpx;
}

.search-wrap {
	position: relative;
	width: 100%;
	margin-bottom: 24rpx;
}

.search-icon {
	position: absolute;
	left: 26rpx;
	top: 50%;
	width: 30rpx;
	height: 30rpx;
	transform: translateY(-50%);
	background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23666670' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='11' cy='11' r='7'/><path d='M16.5 16.5L21 21'/></svg>");
	background-size: contain;
	background-repeat: no-repeat;
	background-position: center;
	pointer-events: none;
}

.library-search-input {
	width: 100%;
	height: 88rpx;
	padding: 0 28rpx 0 72rpx;
	/* 降级底色：无 backdrop-filter 时保持可读的半透明面 */
	background-color: rgba(255, 255, 255, 0.10);
	border: 1rpx solid var(--glass-border);
	border-radius: var(--radius-md);
	color: var(--text-primary);
	font-size: 28rpx;
	box-sizing: border-box;
}

/* 液态玻璃：搜索槽（悬浮控件层） */
@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
	.library-search-input {
		background-color: var(--glass-bg);
		-webkit-backdrop-filter: blur(var(--glass-blur-m)) saturate(160%);
		backdrop-filter: blur(var(--glass-blur-m)) saturate(160%);
		box-shadow: inset 0 1rpx 0 var(--glass-highlight);
	}
}

.search-placeholder {
	color: #666670;
}

.library-filter-scroll {
	white-space: nowrap;
	width: 100%;
}

.library-filter-chip {
	display: inline-block;
	color: var(--icon-neutral);
	font-size: 24rpx;
	font-weight: 500;
	padding: 12rpx 32rpx;
	margin-right: 16rpx;
	border-radius: 999rpx;
	/* 降级底色 */
	background-color: rgba(255, 255, 255, 0.07);
	border: 1rpx solid rgba(255, 255, 255, 0.10);
	transition: all 180ms ease-out;
}

/* 液态玻璃：筛选 Chip（悬浮控件层） */
@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
	.library-filter-chip {
		background-color: rgba(255, 255, 255, 0.07);
		-webkit-backdrop-filter: blur(var(--glass-blur-m)) saturate(150%);
		backdrop-filter: blur(var(--glass-blur-m)) saturate(150%);
	}
}

.library-filter-active {
	color: var(--brand-light);
	background-color: var(--brand-deep);
	border-color: rgba(10, 132, 255, 0.45);
	font-weight: 600;
}

@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
	.library-filter-active {
		-webkit-backdrop-filter: blur(var(--glass-blur-m)) saturate(180%);
		backdrop-filter: blur(var(--glass-blur-m)) saturate(180%);
	}
}

.library-section-header {
	padding: 20rpx 8rpx 8rpx;
	display: flex;
	align-items: center;
}

.library-section-letter {
	color: var(--brand);
	font-size: 34rpx;
	font-weight: 600;
	letter-spacing: 2rpx;
	line-height: 1;
}

.history-card-missing {
	opacity: 0.55;
}

.history-missing-badge {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	text-align: center;
	font-size: 18rpx;
	color: #fff;
	background-color: rgba(255, 69, 58, 0.88);
	padding: 4rpx 0;
	border-radius: 0 0 var(--radius-sm) var(--radius-sm);
}

.vertical-zoom-area {
	overflow: hidden;
	background-color: #000;
}

.vertical-zoom-view {
	display: flex;
	align-items: flex-start;
	justify-content: center;
}

.page-jump-overlay {
	position: fixed;
	left: 0;
	right: 0;
	top: 0;
	bottom: 0;
	z-index: 300;
	background-color: rgba(0, 0, 0, 0.6);
	display: flex;
	align-items: center;
	justify-content: center;
	animation: overlay-fade 200ms ease-out;
}

.page-jump-panel {
	width: 560rpx;
	padding: 48rpx 36rpx 32rpx;
	/* 降级底色：无 backdrop-filter 时的高不透明冷色面板 */
	background-color: rgba(28, 29, 34, 0.92);
	border: 1rpx solid var(--glass-border);
	border-radius: var(--radius-lg);
	/* 阴影模糊半径从 80rpx 降到 48rpx：栅化区域减少约 64%，
	   视觉差异在暗背景 + 0.6 黑遮罩下几乎不可见 */
	box-shadow: 0 16rpx 48rpx rgba(0, 0, 0, 0.5);
	will-change: transform, opacity;
	animation: panel-pop 240ms cubic-bezier(0.16, 1, 0.3, 1);
}

/* 液态玻璃：页码跳转弹窗（大面板 blur 18px） */
@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
	.page-jump-panel {
		background-color: var(--glass-bg-strong);
		-webkit-backdrop-filter: blur(var(--glass-blur-l)) saturate(160%);
		backdrop-filter: blur(var(--glass-blur-l)) saturate(160%);
		box-shadow: 0 16rpx 48rpx rgba(0, 0, 0, 0.5), inset 0 1rpx 0 var(--glass-highlight);
	}
}

.page-jump-title {
	color: var(--text-primary);
	font-size: 34rpx;
	font-weight: 600;
	margin-bottom: 28rpx;
	display: block;
}

.page-jump-input {
	width: 100%;
	height: 88rpx;
	padding: 0 24rpx;
	/* 玻璃面板内的输入槽：半透明白，与面板自然融合 */
	background-color: rgba(255, 255, 255, 0.10);
	border: 1rpx solid rgba(255, 255, 255, 0.10);
	border-radius: var(--radius-md);
	color: var(--text-primary);
	font-size: 32rpx;
	box-sizing: border-box;
	margin-bottom: 32rpx;
}

.page-jump-actions {
	display: flex;
	flex-direction: row;
	justify-content: flex-end;
	gap: 24rpx;
}

.page-jump-btn {
	font-size: 28rpx;
	padding: 20rpx 32rpx;
	min-height: 88rpx;
	display: flex;
	align-items: center;
	transition: opacity 120ms ease-out;
}

.page-jump-btn:active {
	opacity: 0.6;
}

.page-jump-cancel {
	color: var(--text-secondary);
}

.page-jump-confirm {
	color: var(--brand);
	font-weight: 600;
}

@keyframes overlay-fade {
	from { opacity: 0; }
	to { opacity: 1; }
}

@keyframes panel-pop {
	0% { opacity: 0; transform: scale(0.92) translateY(8rpx); }
	100% { opacity: 1; transform: scale(1) translateY(0); }
}

/* 长按漫画：居中操作弹窗（重命名 / 删除） */
.manga-action-overlay {
	position: fixed;
	left: 0;
	right: 0;
	top: 0;
	bottom: 0;
	z-index: 300;
	background-color: rgba(0, 0, 0, 0.6);
	display: flex;
	align-items: center;
	justify-content: center;
	animation: overlay-fade 200ms ease-out;
}

.manga-action-panel {
	width: 560rpx;
	padding: 32rpx 0 0;
	/* 降级底色：无 backdrop-filter 时的高不透明冷色面板 */
	background-color: rgba(28, 29, 34, 0.92);
	border: 1rpx solid var(--glass-border);
	border-radius: var(--radius-lg);
	overflow: hidden;
	/* 同 .page-jump-panel：阴影模糊半径从 80rpx 降到 48rpx */
	box-shadow: 0 16rpx 48rpx rgba(0, 0, 0, 0.5);
	will-change: transform, opacity;
	animation: panel-pop 240ms cubic-bezier(0.16, 1, 0.3, 1);
}

/* 液态玻璃：长按操作弹窗（大面板 blur 18px） */
@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
	.manga-action-panel {
		background-color: var(--glass-bg-strong);
		-webkit-backdrop-filter: blur(var(--glass-blur-l)) saturate(160%);
		backdrop-filter: blur(var(--glass-blur-l)) saturate(160%);
		box-shadow: 0 16rpx 48rpx rgba(0, 0, 0, 0.5), inset 0 1rpx 0 var(--glass-highlight);
	}
}

.manga-action-title {
	color: var(--text-weak);
	font-size: 26rpx;
	display: block;
	text-align: center;
	margin-bottom: 16rpx;
}

.manga-action-item {
	padding: 32rpx;
	min-height: 88rpx;
	display: flex;
	align-items: center;
	justify-content: center;
	border-top: 1rpx solid rgba(245, 245, 247, 0.06);
	transition: background-color 120ms ease-out;
}

.manga-action-item:active {
	/* 玻璃面板内的按压态：半透明白（iOS 菜单高亮惯例），不破坏面板玻璃质感 */
	background-color: rgba(255, 255, 255, 0.08);
}

.manga-action-text {
	color: var(--text-primary);
	font-size: 32rpx;
	display: block;
	text-align: center;
}

.manga-action-danger {
	color: var(--error);
}

.manga-action-cancel-item {
	margin-top: 12rpx;
	border-top: 1rpx solid rgba(245, 245, 247, 0.10);
}

.manga-action-cancel-text {
	color: var(--text-secondary);
}

/* 观看历史 */
.history-section {
	margin-bottom: 36rpx;
}

.history-section-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 20rpx;
}

.history-section-title {
	color: var(--brand);
	font-size: 22rpx;
	font-weight: 600;
	letter-spacing: 3rpx;
}

.history-clear {
	color: var(--text-secondary);
	font-size: 24rpx;
	padding: 24rpx 28rpx;
	margin: -12rpx -16rpx;
	min-height: 88rpx;
	display: flex;
	align-items: center;
	transition: color 150ms ease-out, opacity 150ms ease-out;
}

.history-clear:active {
	color: var(--brand);
	opacity: 0.7;
}

.history-scroll {
	white-space: nowrap;
	width: 100%;
}

.history-card {
	display: inline-flex;
	flex-direction: column;
	width: 128rpx;
	margin-right: 20rpx;
	vertical-align: top;
	/* 错峰动画（每张卡片 60ms 延迟）：提前声明合成层，避免首帧 transform 触发懒提升 */
	will-change: transform, opacity;
	/* 封面图加载/状态变化不影响其它卡片 */
	contain: layout style paint;
	animation: history-slide 360ms ease-out both;
}

.history-card:nth-child(1) { animation-delay: 0ms; }
.history-card:nth-child(2) { animation-delay: 60ms; }
.history-card:nth-child(3) { animation-delay: 120ms; }
.history-card:nth-child(4) { animation-delay: 180ms; }
.history-card:nth-child(5) { animation-delay: 240ms; }
.history-card:nth-child(6) { animation-delay: 300ms; }

.history-card:active {
	opacity: 0.75;
}

.history-cover-wrap {
	margin-bottom: 12rpx;
	position: relative;
}

.history-cover {
	width: 128rpx;
	height: 176rpx;
	border-radius: var(--radius-sm);
	background-color: var(--surface-2);
	box-shadow: 0 6rpx 16rpx rgba(0, 0, 0, 0.35);
}

.history-cover-placeholder {
	display: flex;
	align-items: center;
	justify-content: center;
}

.history-name {
	color: var(--text-primary);
	font-size: 24rpx;
	font-weight: 500;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	margin-bottom: 4rpx;
}

.history-progress {
	color: var(--brand-light);
	font-size: 20rpx;
	margin-bottom: 2rpx;
}

.history-time {
	color: var(--text-weak);
	font-size: 20rpx;
}

@keyframes history-slide {
	from { opacity: 0; transform: translateX(24rpx); }
	to { opacity: 1; transform: translateX(0); }
}

.folder-list {
	flex: 1;
	height: 0;
}

.folder-item {
	display: flex;
	flex-direction: row;
	align-items: center;
	padding: 20rpx 28rpx;
	margin-bottom: 12rpx;
	/* 降级底色：无 backdrop-filter 时的纯色卡片 */
	background-color: var(--surface-1);
	border-radius: var(--radius-md);
	transition: transform 120ms ease-out, background-color 120ms ease-out;
	will-change: transform, opacity;
	/* 隔离单条目 :active 状态变化引起的重绘范围，长列表滚动更顺滑 */
	contain: layout style paint;
	animation: folder-reveal 280ms ease-out both;
}

/* 液态玻璃：列表卡片（轻玻璃 blur 8px + 白膜）
 * 性能护栏：scrolling 态（见 .folder-list-scrolling）退回纯色，
 * 避免 WebView 逐帧重栅化 backdrop 导致滚动掉帧 */
@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
	.folder-item {
		background-color: var(--glass-bg);
		border: 1rpx solid var(--glass-border);
		-webkit-backdrop-filter: blur(var(--glass-blur-s)) saturate(150%);
		backdrop-filter: blur(var(--glass-blur-s)) saturate(150%);
		box-shadow: inset 0 1rpx 0 var(--glass-highlight);
	}
	/* 滚动中：玻璃 → 纯色（一次性切换，滚动期间零 blur 开销） */
	.folder-list-scrolling .folder-item {
		background-color: var(--surface-1);
		border-color: transparent;
		-webkit-backdrop-filter: none;
		backdrop-filter: none;
		box-shadow: none;
	}
}

.folder-item:active {
	background-color: var(--surface-2);
	transform: scale(0.992);
}

@keyframes folder-reveal {
	from { opacity: 0; transform: translateY(8rpx); }
	to { opacity: 1; transform: translateY(0); }
}

.folder-cover-wrap {
	flex-shrink: 0;
	margin-right: 24rpx;
	position: relative;
}

.folder-type-badge {
	position: absolute;
	right: 4rpx;
	bottom: 4rpx;
	padding: 2rpx 10rpx;
	background-color: rgba(255, 69, 58, 0.92);
	color: #fff;
	font-size: 18rpx;
	border-radius: 8rpx;
	line-height: 1.4;
}

.folder-cover {
	width: 100rpx;
	height: 140rpx;
	border-radius: var(--radius-sm);
	background-color: var(--surface-2);
	box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.30);
}

.folder-cover-placeholder {
	display: flex;
	align-items: center;
	justify-content: center;
}

.cover-placeholder-icon {
	width: 56rpx;
	height: 56rpx;
	background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48' fill='none' stroke='%2348484E' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M24 13L24 37'/><path d='M24 13C20 10 13 9 7 11L7 35C13 33 20 34 24 37'/><path d='M24 13C28 10 35 9 41 11L41 35C35 33 28 34 24 37'/></svg>");
	background-size: contain;
	background-repeat: no-repeat;
	background-position: center;
}

.cover-placeholder-icon--pdf {
	background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48' fill='none' stroke='%2348484E' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M12 6L30 6L38 14L38 42L12 42Z'/><path d='M30 6L30 14L38 14'/><path d='M18 24L32 24'/><path d='M18 30L32 30'/><path d='M18 36L28 36'/></svg>");
}

.folder-info {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
}

.folder-name {
	color: var(--text-primary);
	font-size: 30rpx;
	font-weight: 600;
	margin-bottom: 8rpx;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.folder-progress {
	color: var(--text-secondary);
	font-size: 24rpx;
}

/* 空状态：线描插图 + 主标题 + 辅助说明 + Serif 引导语
 * 插图颜色硬编码为 #48484E（= --text-disabled），SVG data URI 不能引用 CSS 变量。
 * 呼吸动画 4s 一个周期、位移 8rpx（≈4dp），暗示「空间是活的、在等你」。 */
.empty-library {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 48rpx 32rpx;
}

.empty-illustration {
	width: 200rpx;
	height: 200rpx;
	margin-bottom: 40rpx;
	background-size: contain;
	background-repeat: no-repeat;
	background-position: center;
	/* 缓慢呼吸：4s 一周期，位移 ≈4dp，给空页面注入「等待」的生机 */
	animation: empty-breath 4s ease-in-out infinite;
	will-change: transform;
}

.empty-illustration--shelf {
	background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120' fill='none' stroke='%2348484E' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'><path d='M20 32 L20 88 M20 32 L100 32 M100 32 L100 88 M20 88 L100 88'/><path d='M20 60 L100 60'/><rect x='32' y='38' width='6' height='18' rx='1'/><rect x='44' y='38' width='5' height='18' rx='1'/><rect x='34' y='66' width='5' height='18' rx='1'/><rect x='48' y='68' width='5' height='16' rx='1' transform='rotate(15 50 76)'/><circle cx='78' cy='100' r='6'/><path d='M82 104 L90 112'/></svg>");
}

.empty-illustration--search {
	background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120' fill='none' stroke='%2348484E' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'><circle cx='50' cy='50' r='24'/><path d='M68 68 L86 86'/><path d='M44 46 Q50 40 56 46 Q60 52 50 56'/><circle cx='50' cy='62' r='0.9' fill='%2348484E' stroke='none'/></svg>");
}

@keyframes empty-breath {
	0%, 100% { transform: translateY(0); }
	50%      { transform: translateY(-8rpx); }
}

.empty-text {
	color: var(--text-secondary);
	font-size: 34rpx;
	font-weight: 500;
	margin-bottom: 20rpx;
}

.empty-hint {
	color: var(--text-weak);
	font-size: 26rpx;
	line-height: 1.8;
	text-align: center;
	margin-bottom: 4rpx;
}

.empty-quote {
	margin-top: 24rpx;
	color: var(--text-disabled);
	font-size: 26rpx;
	letter-spacing: 1rpx;
}

/* 阅读区 */
.back-btn {
	position: fixed;
	top: 52rpx;
	left: 24rpx;
	z-index: 100;
	padding: 28rpx 32rpx;
	min-height: 88rpx;
	display: flex;
	align-items: center;
	/* 液态玻璃 clear 变体：35% 调暗层 + 模糊。此前的纯色方案是为常驻显示期
	   规避 WebView 逐帧离栅化；现控件改为点击显示（页面静止时才出现），
	   重上玻璃。真机验证若翻页卡顿则回退纯色 rgba(28,29,34,0.94)。 */
	background-color: var(--glass-bg-clear);
	border: 1rpx solid var(--glass-border);
	border-radius: 999rpx;
	-webkit-backdrop-filter: blur(14px) saturate(150%);
	backdrop-filter: blur(14px) saturate(150%);
	box-shadow: 0 4rpx 18rpx rgba(0, 0, 0, 0.35), inset 0 1rpx 0 var(--glass-highlight);
	/* 提升为独立合成层：固定定位控件不再随主内容一起重绘 */
	transform: translateZ(0);
	transition: transform 120ms ease-out, background-color 120ms ease-out;
}

.back-btn:active {
	transform: scale(0.94);
	/* 按压态保持调暗（同 .reader-mode-toggle） */
	background-color: rgba(40, 42, 50, 0.45);
}

.back-text {
	color: var(--text-primary);
	font-size: 26rpx;
	font-weight: 500;
}

.manga-swiper {
	width: 100%;
	height: 100%;
}

.vertical-reader-hidden {
	opacity: 0;
	pointer-events: none;
}

.vertical-locate-overlay {
	position: fixed;
	left: 0;
	right: 0;
	top: 0;
	bottom: 0;
	z-index: 150;
	display: flex;
	align-items: center;
	justify-content: center;
	background-color: #000;
}

.vertical-locate-text {
	color: var(--text-secondary);
	font-size: 28rpx;
}

.vertical-reader {
	width: 100%;
	height: 100%;
	background-color: #000;
}

.vertical-spacer {
	width: 100%;
	flex-shrink: 0;
}

.vertical-page {
	width: 100%;
	margin: 0;
	padding: 0;
	line-height: 0;
	font-size: 0;
	flex-shrink: 0;
	/* page 高度 = 图片实际高度，相邻图片紧挨无黑边，符合连续阅读习惯。 */
	/* 隔离重绘范围：单页 image load 触发的高度变化不会让上下相邻页一起 reflow/repaint，
	   对竖向阅读器长列表滚动性能提升明显。 */
	contain: layout style paint;
}

.vertical-image {
	width: 100%;
	display: block;
	vertical-align: top;
	flex-shrink: 0;
	/* 提升为独立合成层：长列表滚动时图片不再随主内容一起重绘，
	   配合 .vertical-page 的 contain 隔离，进一步减少滚动抖动。 */
	transform: translateZ(0);
}

.vertical-page-placeholder {
	width: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	background-color: rgba(245, 245, 247, 0.025);
}

.movable-area {
	background-color: #000;
	overflow: hidden;
}

.movable-view {
	display: flex;
	align-items: center;
	justify-content: center;
}

.manga-image-wrap {
	display: flex;
	align-items: center;
	justify-content: center;
}

.manga-image {
	width: 100%;
	height: 100%;
	display: block;
}

/* 竖屏横向阅读模式：普通 view 容器，图片 aspectFit 完整居中显示。
 * 不用 movable-view（原生组件竖屏下布局异常，图片会贴右上角/上半部分）。 */
.manga-page-portrait {
	display: flex;
	align-items: center;
	justify-content: center;
	background-color: #000;
	overflow: hidden;
}

.manga-image-portrait {
	width: 100%;
	height: 100%;
	display: block;
}

.progress-bar {
	position: fixed;
	left: 0;
	right: 0;
	bottom: 40rpx;
	display: flex;
	justify-content: center;
	pointer-events: auto;
	z-index: 99;
	/* 点击底部区域弹出时 transform/opacity 同时变化，提前合成层避免首帧卡顿 */
	will-change: transform, opacity;
	animation: progress-rise 280ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.progress-capsule {
	position: relative;
	overflow: hidden;
	/* 液态玻璃 clear 变体：35% 调暗层（同 .back-btn，真机验证可回退） */
	background-color: var(--glass-bg-clear);
	border: 1rpx solid var(--glass-border);
	border-radius: 999rpx;
	padding: 20rpx 48rpx;
	min-height: 88rpx;
	display: flex;
	align-items: center;
	-webkit-backdrop-filter: blur(14px) saturate(150%);
	backdrop-filter: blur(14px) saturate(150%);
	box-shadow: 0 4rpx 18rpx rgba(0, 0, 0, 0.35), inset 0 1rpx 0 var(--glass-highlight);
}

/* 降级：WebView 完全不支持 backdrop-filter（含 -webkit- 前缀）时，
 * 阅读器三个控件回退高不透明纯色，保证文字在漫画内容上仍可读。
 * 条件与正向玻璃规则对称（or -webkit-）：仅支持前缀的老引擎不触发降级，
 * 走基础规则里的 -webkit-backdrop-filter 正常渲染玻璃 */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
	.back-btn,
	.reader-mode-toggle,
	.progress-capsule {
		background-color: rgba(28, 29, 34, 0.94);
	}
}

.progress-text {
	position: relative;
	z-index: 1;
	/* clear 玻璃（白膜仅 5%）下方是可变的漫画内容，亮色页面上灰字对比度不足，
	   页码必须用一级白（同 .back-text）保证任意背景下可读 */
	color: var(--text-primary);
	font-weight: 500;
	font-size: 26rpx;
	max-width: 80vw;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.progress-micro-line {
	position: absolute;
	left: 0;
	bottom: 0;
	height: 4rpx;
	background-color: var(--brand);
	transition: width 240ms cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes progress-rise {
	from { opacity: 0; transform: translateY(16rpx); }
	to { opacity: 1; transform: translateY(0); }
}

.pdf-loading-overlay {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	z-index: 200;
	display: flex;
	align-items: center;
	justify-content: center;
	background-color: rgba(0, 0, 0, 0.55);
	pointer-events: none;
}

.pdf-loading-text {
	color: var(--text-primary);
	font-size: 28rpx;
}

.pdf-page-loading {
	width: 100%;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	background-color: #000;
}

.pdf-page-loading-text {
	color: var(--text-weak);
	font-size: 26rpx;
}

.horizontal-page-placeholder {
	width: 100%;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	background-color: #000;
}

/* ═══ 无障碍：尊重用户的减少动画偏好 ═══
 * 当系统开启「减少动态效果」时，禁用所有装饰性动画，
 * 仅保留必要的过渡（颜色/透明度），确保前庭敏感用户的安全。 */
@media (prefers-reduced-motion: reduce) {
	.history-card,
	.folder-item,
	.page-jump-panel,
	.manga-action-panel,
	.page-jump-overlay,
	.manga-action-overlay,
	.progress-bar,
	.empty-illustration {
		animation: none !important;
	}
	.folder-item:active,
	.back-btn:active,
	.reader-mode-toggle:active,
	.history-clear:active,
	.page-jump-btn:active {
		transform: none !important;
	}
	.progress-micro-line {
		transition: none !important;
	}
}
</style>
