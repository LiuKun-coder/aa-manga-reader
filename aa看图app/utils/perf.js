/**
 * 轻量性能打点工具
 *
 * 设计目标：
 * - 零依赖，单文件，可直接 import
 * - 生产环境可关闭（PERF_ENABLED = false），无运行时开销
 * - 输出格式统一：[perf] <label>: <ms>ms [detail...]
 * - 支持 mark/measure 配对，也支持 lap() 单点计时
 *
 * 用法：
 *   import { mark, measure, lap } from '../../utils/perf.js'
 *   mark('scan.start')
 *   // ... 被测代码
 *   measure('scan.total', 'scan.start')  // 输出 [perf] scan.total: 123.4ms
 *
 *   const t = lap('pdf render page 0')   // 输出并返回耗时
 *   // ... 被测代码
 *   lap('pdf render page 0', t)          // 输出 [perf] pdf render page 0: 456.7ms
 */

/** 总开关：发布正式版前可改为 false 彻底关闭 */
const PERF_ENABLED = false

/** 是否使用 performance.now()（更精确），否则回退 Date.now() */
const hasPerfNow = typeof performance !== 'undefined' && typeof performance.now === 'function'

const marks = new Map()

/**
 * 打一个时间戳标记
 * @param {string} label 标签名，后续供 measure 引用
 */
export function mark(label) {
	if (!PERF_ENABLED) return
	marks.set(label, now())
}

/**
 * 测量从某 mark 到现在的耗时并输出
 * @param {string} label 输出标签
 * @param {string} [startLabel] 起始 mark 标签；省略则用 label + '.start'
 * @param {string} [extra] 额外信息（如条目数）
 */
export function measure(label, startLabel, extra) {
	if (!PERF_ENABLED) return
	const start = marks.get(startLabel || label + '.start')
	const end = now()
	if (start == null) {
		console.log(`[perf] ${label}: (no start mark)${extra ? ' ' + extra : ''}`)
		return
	}
	const ms = (end - start).toFixed(1)
	console.log(`[perf] ${label}: ${ms}ms${extra ? ' ' + extra : ''}`)
	marks.delete(startLabel || label + '.start')
}

/**
 * 单次 lap：传入 tag 返回起始时间，再次传入 tag 和起始时间输出耗时
 * @param {string} tag 标签
 * @param {number} [startTs] 起始时间戳；省略表示开始计时
 * @param {string} [extra] 额外信息（如条目数）
 * @returns {number|undefined} 开始计时时返回起始时间戳
 */
export function lap(tag, startTs, extra) {
	if (!PERF_ENABLED) return startTs
	if (startTs == null) {
		return now()
	}
	const ms = (now() - startTs).toFixed(1)
	console.log(`[perf] ${tag}: ${ms}ms${extra ? ' ' + extra : ''}`)
	return undefined
}

/** 获取当前高精度时间戳（ms） */
function now() {
	return hasPerfNow ? performance.now() : Date.now()
}

/** 清除所有 mark（页面切换时调用，避免旧 mark 干扰） */
export function clearMarks() {
	marks.clear()
}

export default { mark, measure, lap, clearMarks }
