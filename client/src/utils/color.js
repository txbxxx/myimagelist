/**
 * 色彩工具
 * --------------------------------
 * 主要用来根据背景色自动选可读的文字色（WCAG 对比度）。
 */

/**
 * 把 hex 颜色转成 [r, g, b] 0-255
 * @param {string} hex  #RGB / #RRGGBB
 */
function hexToRgb(hex) {
  let h = String(hex || '').trim().replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/**
 * WCAG 相对亮度（0-1，0 = 全黑，1 = 全白）
 * @param {string} hex
 * @returns {number|null}
 */
export function relativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG 对比度（1-21）
 * @param {string} hex1
 * @param {string} hex2
 * @returns {number|null}
 */
export function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  if (l1 == null || l2 == null) return null;
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * 给定背景色，返回对深色或浅色文字的对比度
 * - 深色基准用 --cartoon-ink (#2E2019)，比 brown-deep 更深
 *   原因：浅糖果色底上（如 #FDFFB6 / #FFE0EC）#2E2019 比 #3E2723 对比度高约 2 级，
 *   即使在最浅的色板上也能稳过 WCAG AA 4.5:1
 */
export function contrastWithDark(hex)  { return contrastRatio(hex, '#2E2019'); }  // --cartoon-ink
export function contrastWithLight(hex) { return contrastRatio(hex, '#FFFFFF'); }

/**
 * 给定背景色，挑可读的文字色（白或深褐）
 * - 默认 AA 标准 4.5:1
 * - 取对比度更高的那个文字色
 * @param {string} bgHex
 * @param {number} [minRatio=4.5]
 * @returns {string}  '#FFFFFF' or '#2E2019'
 */
export function readableTextColor(bgHex, minRatio = 4.5) {
  const dark  = contrastWithDark(bgHex)  ?? 0;
  const light = contrastWithLight(bgHex) ?? 0;
  // 都达不到 AA → 选相对更亮的（白底深褐也凑合能看）
  if (dark < minRatio && light < minRatio) {
    return light > dark ? '#FFFFFF' : '#2E2019';
  }
  return dark >= light ? '#2E2019' : '#FFFFFF';
}

/**
 * 校验颜色是否通过对比度
 * @returns {boolean}
 */
export function isAccessible(bgHex, fgHex, minRatio = 4.5) {
  const r = contrastRatio(bgHex, fgHex);
  return r != null && r >= minRatio;
}
