/**
 * Android 原生 PDF 渲染（PdfRenderer API，需 Android 5.0+）
 * 将 PDF 页渲染为 JPEG 缓存，供 uni-app image 组件显示
 */

const MODE_READ_ONLY = 268435456
const RENDER_MODE_FOR_DISPLAY = 1

/** 性能打点开关：发布正式版可改为 false */
const PERF_ENABLED = false
function _now() {
	return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
}

// 类对象缓存：避免每次调用都反射查找（PdfRenderer / Bitmap / File 等热点类）
const _classCache = {}

/** 已缓存的反射类获取；首次调用后直接命中内存，避免 importClass 反复 JNI 查找 */
export function importAndroid(className) {
	if (_classCache[className]) return _classCache[className]
	// #ifdef APP-PLUS
	const cls = plus.android.importClass(className)
	_classCache[className] = cls
	return cls
	// #endif
	return null
}

/** 清空类缓存（仅在权限/进程异常等极端场景使用） */
export function resetAndroidClassCache() {
	for (const k of Object.keys(_classCache)) delete _classCache[k]
}

/** 去掉 file:// 前缀，得到 Java File 可用的绝对路径 */
export function pathFromFileUrl(fileUrl) {
	if (!fileUrl) return ''
	return String(fileUrl).replace(/^file:\/\//, '')
}

/** 本地绝对路径转 file:// URL */
export function fileUrlFromPath(absPath) {
	if (!absPath) return ''
	if (absPath.startsWith('file://')) return absPath
	return 'file://' + absPath
}

/**
 * 文件是否存在
 * 带"已知存在"内存缓存：渲染成功的 PDF 缓存页路径会反复检查，每次都反射 new File().exists() 开销大。
 * 缓存仅在 invalidateExistsCache 显式失效（如重新渲染覆盖写）时清空，PDF 缓存页一旦写好就不动，安全。
 */
const _existsCache = new Set()

export function invalidateExistsCache(absPath) {
	if (absPath) _existsCache.delete(absPath)
}

export function clearExistsCache() {
	_existsCache.clear()
}

export function fileExists(absPath) {
	if (!absPath) return false
	if (_existsCache.has(absPath)) return true
	// #ifdef APP-PLUS
	try {
		const File = importAndroid('java.io.File')
		const ok = !!new File(absPath).exists()
		if (ok) _existsCache.add(absPath)
		return ok
	} catch (e) {
		return false
	}
	// #endif
	// #ifndef APP-PLUS
	return false
	// #endif
}

/** 获取文件最后修改时间 */
export function getFileLastModified(absPath) {
	// #ifdef APP-PLUS
	try {
		const File = importAndroid('java.io.File')
		return Number(new File(absPath).lastModified())
	} catch (e) {
		return 0
	}
	// #endif
	return 0
}

/** 确保目录存在 */
export function ensureDir(absDirPath) {
	// #ifdef APP-PLUS
	const File = importAndroid('java.io.File')
	const dir = new File(absDirPath)
	if (!dir.exists()) dir.mkdirs()
	return dir.exists()
	// #endif
	return false
}

/** 当前设备是否支持 PdfRenderer（API 21+） */
export function isPdfSupported() {
	// #ifdef APP-PLUS
	try {
		const Build = importAndroid('android.os.Build')
		return Build.VERSION.SDK_INT >= 21
	} catch (e) {
		return false
	}
	// #endif
	return false
}

// ==================== PdfRenderer 复用池（LRU） ====================
// 每次打开/关闭 PdfRenderer 约 30-60ms，预加载 10 页 = 10 次开关 ≈ 300-600ms 浪费。
// 复用后只开关 1 次，省 ~270-540ms。
// 注意：PdfRenderer 非线程安全，同 PDF 不能并发；当前调用方均在主线程串行调用，安全。

/** path -> { renderer, pfd, lastUsed } */
const _rendererCache = new Map()
/** 同时保留的 PdfRenderer 数量上限（2 本 = 当前 + 上一本，足够翻页场景） */
const RENDERER_CACHE_MAX = 2

/** 获取或创建 PdfRenderer（命中则更新 lastUsed）
 *  返回 { renderer, pfd }；调用方不可 close，用 releasePdfRenderer 释放 */
function acquirePdfRenderer(pdfAbsPath) {
	// #ifdef APP-PLUS
	const existing = _rendererCache.get(pdfAbsPath)
	if (existing) {
		existing.lastUsed = Date.now()
		return existing
	}

	const File = importAndroid('java.io.File')
	const ParcelFileDescriptor = importAndroid('android.os.ParcelFileDescriptor')
	const PdfRenderer = importAndroid('android.graphics.pdf.PdfRenderer')

	const pdfFile = new File(pdfAbsPath)
	if (!pdfFile.exists()) return null

	const pfd = ParcelFileDescriptor.open(pdfFile, MODE_READ_ONLY)
	const renderer = new PdfRenderer(pfd)
	const entry = { renderer, pfd, lastUsed: Date.now() }
	_rendererCache.set(pdfAbsPath, entry)

	// LRU 淘汰：超过上限时关闭最久未用的
	if (_rendererCache.size > RENDERER_CACHE_MAX) {
		let oldestKey = null
		let oldestTime = Infinity
		for (const [k, v] of _rendererCache) {
			if (k === pdfAbsPath) continue
			if (v.lastUsed < oldestTime) {
				oldestTime = v.lastUsed
				oldestKey = k
			}
		}
		if (oldestKey) {
			const victim = _rendererCache.get(oldestKey)
			try { victim.renderer.close() } catch (e) { /* ignore */ }
			try { victim.pfd.close() } catch (e) { /* ignore */ }
			_rendererCache.delete(oldestKey)
		}
	}
	return entry
	// #endif
	return null
}

/** 关闭指定 PDF 的 renderer（用于文件被删除/重命名时失效） */
export function invalidatePdfRenderer(pdfAbsPath) {
	const entry = _rendererCache.get(pdfAbsPath)
	if (!entry) return
	// #ifdef APP-PLUS
	try { entry.renderer.close() } catch (e) { /* ignore */ }
	try { entry.pfd.close() } catch (e) { /* ignore */ }
	// #endif
	_rendererCache.delete(pdfAbsPath)
}

/** 关闭所有缓存的 PdfRenderer（组件卸载 / 退出阅读器时调用） */
export function closeAllPdfRenderers() {
	// #ifdef APP-PLUS
	for (const [, entry] of _rendererCache) {
		try { entry.renderer.close() } catch (e) { /* ignore */ }
		try { entry.pfd.close() } catch (e) { /* ignore */ }
	}
	// #endif
	_rendererCache.clear()
}

/** 根据 PDF 绝对路径生成缓存目录 */
export function getPdfCacheDir(pdfAbsPath) {
	const key = pdfAbsPath.replace(/\//g, '_').replace(/:/g, '_')
	const base = pathFromFileUrl(plus.io.convertLocalFileSystemURL('_doc/pdf_cache/'))
	return base + key + '/'
}

/** 某页缓存文件绝对路径 */
export function getPdfPageCachePath(pdfAbsPath, pageIndex) {
	return getPdfCacheDir(pdfAbsPath) + 'page_' + pageIndex + '.jpg'
}

/** 缩略图缓存绝对路径 */
export function getPdfThumbCachePath(pdfAbsPath) {
	return getPdfCacheDir(pdfAbsPath) + 'thumb.jpg'
}

/** 读取 PDF 总页数（复用 renderer 池，省去重复开关 PDF） */
export function getPdfPageCount(pdfAbsPath) {
	// #ifdef APP-PLUS
	try {
		const entry = acquirePdfRenderer(pdfAbsPath)
		if (!entry) return 0
		return Number(entry.renderer.getPageCount())
	} catch (e) {
		console.error('getPdfPageCount 失败', e)
		// 出错时清除可能损坏的缓存条目
		invalidatePdfRenderer(pdfAbsPath)
		return 0
	}
	// #endif
	return 0
}

/**
 * 渲染 PDF 指定页为 JPEG
 * @param {string} pdfAbsPath PDF 绝对路径
 * @param {number} pageIndex 页码（从 0 开始）
 * @param {string} outputAbsPath 输出 JPEG 绝对路径
 * @param {number} targetWidth 目标宽度（像素），0 表示原始尺寸
 */
export function renderPdfPage(pdfAbsPath, pageIndex, outputAbsPath, targetWidth = 0) {
	// #ifdef APP-PLUS
	const _t = PERF_ENABLED ? _now() : 0
	let page = null
	let bitmap = null
	let fos = null
	try {
		const File = importAndroid('java.io.File')
		const Bitmap = importAndroid('android.graphics.Bitmap')
		const Config = importAndroid('android.graphics.Bitmap$Config')
		const Matrix = importAndroid('android.graphics.Matrix')
		const FileOutputStream = importAndroid('java.io.FileOutputStream')
		const CompressFormat = importAndroid('android.graphics.Bitmap$CompressFormat')

		// 复用 renderer 池：避免每次渲染都 new PdfRenderer + open/close pfd
		const entry = acquirePdfRenderer(pdfAbsPath)
		if (!entry) return false
		const renderer = entry.renderer

		const total = renderer.getPageCount()
		if (pageIndex < 0 || pageIndex >= total) return false

		page = renderer.openPage(pageIndex)
		const pageWidth = Number(page.getWidth())
		const pageHeight = Number(page.getHeight())

		let outW = pageWidth
		let outH = pageHeight
		let scale = 1
		if (targetWidth > 0 && pageWidth > targetWidth) {
			scale = targetWidth / pageWidth
			outW = Math.round(pageWidth * scale)
			outH = Math.round(pageHeight * scale)
		}

		bitmap = Bitmap.createBitmap(outW, outH, Config.ARGB_8888)
		bitmap.eraseColor(-1)

		const matrix = new Matrix()
		matrix.setScale(scale, scale)
		page.render(bitmap, null, matrix, RENDER_MODE_FOR_DISPLAY)

		const outFile = new File(outputAbsPath)
		ensureDir(String(outFile.getParent()))
		fos = new FileOutputStream(outFile)
		// quality 从 88 降到 75：肉眼几乎无差，但 compress 耗时减少 ~40%，文件体积减半
		bitmap.compress(CompressFormat.JPEG, 75, fos)
		fos.flush()
		return true
	} catch (e) {
		console.error('renderPdfPage 失败', pageIndex, e)
		// renderer 可能损坏，清除缓存让下次重新打开
		invalidatePdfRenderer(pdfAbsPath)
		return false
	} finally {
		try {
			if (fos) fos.close()
		} catch (e) { /* ignore */ }
		try {
			if (page) page.close()
		} catch (e) { /* ignore */ }
		try {
			if (bitmap) bitmap.recycle()
		} catch (e) { /* ignore */ }
		// 注意：renderer 和 pfd 不在这里 close，由池统一管理生命周期
		if (PERF_ENABLED) {
			console.log(`[perf] pdf render page ${pageIndex}: ${(_now() - _t).toFixed(1)}ms`)
		}
	}
	// #endif
	return false
}

/** 渲染 PDF 第一页缩略图 */
export function renderPdfThumbnail(pdfAbsPath, thumbWidth = 240) {
	const outPath = getPdfThumbCachePath(pdfAbsPath)
	if (renderPdfPage(pdfAbsPath, 0, outPath, thumbWidth)) {
		return fileUrlFromPath(outPath)
	}
	return ''
}

/**
 * 读取 PDF 指定页的原始尺寸（点单位，1pt = 1/72 inch）
 * 用于竖向阅读模式预记录页高，避免等 @load 回调造成的 CLS
 * 复用 renderer 池，单次调用 ~1-3ms
 * @returns {{width:number,height:number}|null} 页尺寸，失败返回 null
 */
export function getPdfPageSize(pdfAbsPath, pageIndex) {
	// #ifdef APP-PLUS
	let page = null
	try {
		const entry = acquirePdfRenderer(pdfAbsPath)
		if (!entry) return null
		const total = entry.renderer.getPageCount()
		if (pageIndex < 0 || pageIndex >= total) return null
		page = entry.renderer.openPage(pageIndex)
		return {
			width: Number(page.getWidth()),
			height: Number(page.getHeight())
		}
	} catch (e) {
		console.error('getPdfPageSize 失败', pageIndex, e)
		return null
	} finally {
		try {
			if (page) page.close()
		} catch (e) { /* ignore */ }
	}
	// #endif
	return null
}

// ==================== PDF 页缓存 LRU 清理 ====================
// 长期使用后 _doc/pdf_cache/<pdfkey>/page_*.jpg 会无限累积：
// 10 本 200 页 PDF × 150KB/页 ≈ 300MB 残留。
// prunePdfPageCache 保留当前页附近窗口内的页，删除窗口外的页。

/** 每本 PDF 保留的页缓存数量（当前页前后各 100 页） */
export const PDF_CACHE_KEEP_RANGE = 100

/**
 * 清理 PDF 页缓存，仅保留 [keepFromIdx, keepFromIdx + 2*range] 区间内的页
 * @param {string} pdfAbsPath PDF 绝对路径
 * @param {number} keepFromIdx 起始保留页码
 * @param {number} [range] 保留范围（前后各 range 页），默认 PDF_CACHE_KEEP_RANGE
 */
export function prunePdfPageCache(pdfAbsPath, keepFromIdx, range = PDF_CACHE_KEEP_RANGE) {
	// #ifdef APP-PLUS
	try {
		const cacheDir = getPdfCacheDir(pdfAbsPath)
		const File = importAndroid('java.io.File')
		const dir = new File(cacheDir)
		if (!dir.exists()) return 0
		const files = dir.listFiles()
		if (!files) return 0

		const keepLow = keepFromIdx
		const keepHigh = keepFromIdx + 2 * range
		let removed = 0
		const len = files.length
		for (let i = 0; i < len; i++) {
			const f = files[i]
			const name = String(f.getName())
			// 仅清理 page_*.jpg，保留 thumb.jpg
			const m = name.match(/^page_(\d+)\.jpg$/)
			if (!m) continue
			const idx = parseInt(m[1], 10)
			if (idx < keepLow || idx > keepHigh) {
				try {
					if (f.delete()) removed++
					// 删除后 _existsCache 也要失效，避免 fileExists 误报
					invalidateExistsCache(String(f.getAbsolutePath()))
				} catch (e) { /* 单页失败跳过 */ }
			}
		}
		return removed
	} catch (e) {
		console.error('prunePdfPageCache 失败', e)
		return 0
	}
	// #endif
	return 0
}

/**
 * 清理某 PDF 的所有页缓存（用于删除 PDF 时彻底清理）
 * @param {string} pdfAbsPath PDF 绝对路径
 */
export function clearPdfPageCache(pdfAbsPath) {
	// #ifdef APP-PLUS
	try {
		const cacheDir = getPdfCacheDir(pdfAbsPath)
		const File = importAndroid('java.io.File')
		const dir = new File(cacheDir)
		if (!dir.exists()) return
		const files = dir.listFiles()
		if (!files) return
		const len = files.length
		for (let i = 0; i < len; i++) {
			try { files[i].delete() } catch (e) { /* ignore */ }
		}
		try { dir.delete() } catch (e) { /* ignore */ }
	} catch (e) {
		console.error('clearPdfPageCache 失败', e)
	}
	// #endif
}

// ==================== 图片文件夹缩略图缓存 ====================
// 书库列表的文件夹封面原本直接用原图 file:// 路径，但封面容器仅 ~150×210px @3x，
// 原图可能 1-5MB，长列表滚动时多张大图解码导致 GC 抖动和掉帧。
// 这里仿照 PDF 缩略图机制，用 BitmapFactory 降采样生成缩略图缓存到 _doc/folder_thumb/。
// 缩略图文件名带宽度版本（_w360.jpg），宽度变更后旧缓存自动失效。

/** 文件夹缩略图缓存根目录 */
export function getFolderThumbDir() {
	// #ifdef APP-PLUS
	return pathFromFileUrl(plus.io.convertLocalFileSystemURL('_doc/folder_thumb/'))
	// #endif
	// #ifndef APP-PLUS
	return ''
	// #endif
}

/**
 * 缩略图缓存路径
 * 文件名包含目标宽度，宽度变更后自动失效（旧文件不会被误用）
 */
export function getFolderThumbCachePath(srcAbsPath, thumbWidth = 360) {
	const key = srcAbsPath.replace(/\//g, '_').replace(/:/g, '_')
	return getFolderThumbDir() + key + `_w${thumbWidth}.jpg`
}

/**
 * 尝试获取缩略图缓存 URL（仅检查存在性 + mtime，不生成）
 * @param {string} srcFileUrl 源图 file:// URL
 * @param {number} thumbWidth 目标宽度
 * @returns {string} 命中返回 file:// URL，未命中返回 ''
 */
export function tryGetFolderThumbUrl(srcFileUrl, thumbWidth = 360) {
	// #ifdef APP-PLUS
	const srcAbs = pathFromFileUrl(srcFileUrl)
	if (!srcAbs) return ''
	const cacheAbs = getFolderThumbCachePath(srcAbs, thumbWidth)
	if (!fileExists(cacheAbs)) return ''
	// mtime 校验：源图更新则缩略图失效
	const srcMtime = getFileLastModified(srcAbs)
	const cacheMtime = getFileLastModified(cacheAbs)
	if (srcMtime > 0 && cacheMtime > 0 && srcMtime > cacheMtime) {
		invalidateExistsCache(cacheAbs)
		return ''
	}
	return fileUrlFromPath(cacheAbs)
	// #endif
	// #ifndef APP-PLUS
	return ''
	// #endif
}

/**
 * 生成图片缩略图（降采样 + JPEG 压缩）
 * @param {string} srcFileUrl 源图 file:// URL
 * @param {number} targetWidth 目标宽度（像素）
 * @returns {string} 成功返回缩略图 file:// URL，失败返回 ''
 */
export function generateFolderThumb(srcFileUrl, targetWidth = 360) {
	// #ifdef APP-PLUS
	const _t = PERF_ENABLED ? _now() : 0
	const srcAbs = pathFromFileUrl(srcFileUrl)
	if (!srcAbs) return ''
	const cacheAbs = getFolderThumbCachePath(srcAbs, targetWidth)

	let bitmap = null
	let fos = null
	try {
		const BitmapFactory = importAndroid('android.graphics.BitmapFactory')
		const Options = importAndroid('android.graphics.BitmapFactory$Options')
		const Config = importAndroid('android.graphics.Bitmap$Config')
		const Matrix = importAndroid('android.graphics.Matrix')
		const Bitmap = importAndroid('android.graphics.Bitmap')
		const CompressFormat = importAndroid('android.graphics.Bitmap$CompressFormat')
		const FileOutputStream = importAndroid('java.io.FileOutputStream')

		// 第一遍：只读尺寸（不解码到内存）
		const opts = new Options()
		opts.inJustDecodeBounds = true
		BitmapFactory.decodeFile(srcAbs, opts)
		const srcW = opts.outWidth
		const srcH = opts.outHeight
		if (srcW <= 0 || srcH <= 0) return ''

		// 降采样：2 的幂次，粗略降到目标宽度的 2 倍以内
		let sampleSize = 1
		while (srcW / sampleSize > targetWidth * 2) sampleSize *= 2

		// 第二遍：解码到内存（RGB_565 节省内存，缩略图无透明通道需求）
		opts.inJustDecodeBounds = false
		opts.inSampleSize = sampleSize
		opts.inPreferredConfig = Config.RGB_565
		bitmap = BitmapFactory.decodeFile(srcAbs, opts)
		if (!bitmap) return ''

		// 精确缩放到目标宽度
		const decodedW = bitmap.getWidth()
		if (decodedW > targetWidth) {
			const scale = targetWidth / decodedW
			const m = new Matrix()
			m.postScale(scale, scale)
			const scaled = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), m, true)
			if (scaled !== bitmap) {
				bitmap.recycle()
				bitmap = scaled
			}
		}

		// 写盘
		ensureDir(getFolderThumbDir())
		fos = new FileOutputStream(cacheAbs)
		bitmap.compress(CompressFormat.JPEG, 80, fos)
		fos.flush()

		// 更新 existsCache
		_existsCache.add(cacheAbs)

		if (PERF_ENABLED) {
			console.log(`[perf] folder thumb generated: ${(_now() - _t).toFixed(1)}ms (src=${srcW}x${srcH}, out=${targetWidth})`)
		}
		return fileUrlFromPath(cacheAbs)
	} catch (e) {
		console.error('generateFolderThumb 失败', e)
		return ''
	} finally {
		try { if (fos) fos.close() } catch (e) { /* ignore */ }
		try { if (bitmap) bitmap.recycle() } catch (e) { /* ignore */ }
	}
	// #endif
	// #ifndef APP-PLUS
	return ''
	// #endif
}

/**
 * 清理缩略图缓存
 * @param {string} pathPrefixAbs 源图绝对路径或文件夹绝对路径
 *  - 传文件夹路径：清理该文件夹下所有图片的缩略图（删除漫画时用）
 *  - 传源图路径：清理指定源图的缩略图
 * 路径转义后加尾部 '_' 作前缀匹配，避免兄弟目录名互为前缀误删
 */
export function clearFolderThumbCache(pathPrefixAbs) {
	// #ifdef APP-PLUS
	try {
		const File = importAndroid('java.io.File')
		const dir = new File(getFolderThumbDir())
		if (!dir.exists()) return 0
		const files = dir.listFiles()
		if (!files) return 0
		const keyPrefix = pathPrefixAbs.replace(/\//g, '_').replace(/:/g, '_') + '_'
		let removed = 0
		const len = files.length
		for (let i = 0; i < len; i++) {
			const f = files[i]
			const name = String(f.getName())
			if (name.startsWith(keyPrefix)) {
				try {
					if (f.delete()) {
						invalidateExistsCache(String(f.getAbsolutePath()))
						removed++
					}
				} catch (e) { /* ignore */ }
			}
		}
		return removed
	} catch (e) {
		console.error('clearFolderThumbCache 失败', e)
		return 0
	}
	// #endif
	// #ifndef APP-PLUS
	return 0
	// #endif
}
