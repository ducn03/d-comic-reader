/**
 * Shared Frontend Utilities: XSS-safe escaping, debounce, image URL builder,
 * precision-aware Vietnamese time parsing & formatting, toasts, and spinner.
 */

export const FALLBACK_COVER = 'assets/cover-fallback.svg';

const API_BASE =
  typeof window !== 'undefined' && window.location?.protocol === 'file:'
    ? 'http://localhost:3000/api/manga'
    : '/api/manga';

export function getApiBase() {
  return API_BASE;
}

/**
 * Escapes HTML special characters to prevent XSS when interpolating scraped strings.
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function debounce(fn, delayMs = 200) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}

export function getProxyImageUrl(rawUrl) {
  if (!rawUrl) return FALLBACK_COVER;
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
    if (
      rawUrl.includes('khotruyen.site') ||
      rawUrl.includes('img.otruyenapi.com') ||
      rawUrl.includes('storage/thumbnails')
    ) {
      return rawUrl;
    }
  }
  return `${API_BASE}?endpoint=image&url=${encodeURIComponent(rawUrl)}`;
}

function localMidnight(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function isSameLocalDay(tsA, tsB) {
  if (!tsA || !tsB) return false;
  const a = new Date(tsA);
  const b = new Date(tsB);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Parses Vietnamese relative/date chapter timestamps and returns { ts, precision }:
 * - 'exact': second/minute/hour precision (from Home/Genre feeds)
 * - 'day': day-level precision (from dd/mm/yyyy or day/week/month strings)
 * - 'none': unparseable or missing
 */
export function parseVietnameseTimeWithPrecision(timeStr, nowMs = Date.now()) {
  if (!timeStr) return { ts: 0, precision: 'none' };
  const s = String(timeStr).toLowerCase().trim();
  if (!s) return { ts: 0, precision: 'none' };

  if (s.includes('vừa') || s.includes('mới')) {
    return { ts: nowMs, precision: 'exact' };
  }

  let m = s.match(/(\d+)\s*giây/);
  if (m) return { ts: nowMs - parseInt(m[1], 10) * 1000, precision: 'exact' };

  m = s.match(/(\d+)\s*phút/);
  if (m) return { ts: nowMs - parseInt(m[1], 10) * 60000, precision: 'exact' };

  m = s.match(/(\d+)\s*(?:giờ|tiếng)/);
  if (m) return { ts: nowMs - parseInt(m[1], 10) * 3600000, precision: 'exact' };

  if (s.includes('hôm nay')) {
    return { ts: localMidnight(nowMs), precision: 'day' };
  }
  if (s.includes('hôm qua')) {
    return { ts: localMidnight(nowMs - 86400000), precision: 'day' };
  }
  if (s.includes('hôm kia')) {
    return { ts: localMidnight(nowMs - 2 * 86400000), precision: 'day' };
  }

  m = s.match(/(\d+)\s*ngày/);
  if (m) {
    return { ts: localMidnight(nowMs - parseInt(m[1], 10) * 86400000), precision: 'day' };
  }

  m = s.match(/(\d+)\s*tuần/);
  if (m) {
    return { ts: localMidnight(nowMs - parseInt(m[1], 10) * 7 * 86400000), precision: 'day' };
  }

  m = s.match(/(\d+)\s*tháng/);
  if (m) {
    return { ts: localMidnight(nowMs - parseInt(m[1], 10) * 30 * 86400000), precision: 'day' };
  }

  m = s.match(/(\d+)\s*năm/);
  if (m) {
    return { ts: localMidnight(nowMs - parseInt(m[1], 10) * 365 * 86400000), precision: 'day' };
  }

  // ISO YYYY-MM-DD
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    const ts = d.getTime();
    return Number.isNaN(ts) ? { ts: 0, precision: 'none' } : { ts, precision: 'day' };
  }

  // dd/mm/yyyy or dd-mm-yyyy
  m = s.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) {
    const d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
    const ts = d.getTime();
    return Number.isNaN(ts) ? { ts: 0, precision: 'none' } : { ts, precision: 'day' };
  }

  const parsed = Date.parse(timeStr);
  return Number.isNaN(parsed)
    ? { ts: 0, precision: 'none' }
    : { ts: parsed, precision: 'day' };
}

export function parseVietnameseTime(timeStr, nowMs = Date.now()) {
  return parseVietnameseTimeWithPrecision(timeStr, nowMs).ts;
}

/**
 * Formats a stored epoch timestamp dynamically so relative labels naturally age over time.
 */
export function formatChapterTimeLabel(chapterUpdatedAt, precision = 'day', fallbackRaw = '', nowMs = Date.now()) {
  const ts = Number(chapterUpdatedAt) || 0;
  if (ts <= 0) return fallbackRaw || 'Chưa rõ';

  const diff = Math.max(0, nowMs - ts);
  if (precision === 'exact' && diff < 86400000) {
    if (diff < 60000) return 'Vừa xong';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} phút trước`;
    return `${Math.floor(diff / 3600000)} giờ trước`;
  }

  if (isSameLocalDay(ts, nowMs)) return 'Hôm nay';
  if (isSameLocalDay(ts, nowMs - 86400000)) return 'Hôm qua';

  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export function showToast(message, options = {}) {
  const { duration = 2800, actionText = '', onAction = null } =
    typeof options === 'number' ? { duration: options } : options;

  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';

  const msgSpan = document.createElement('span');
  msgSpan.textContent = message;
  toast.appendChild(msgSpan);

  if (actionText && typeof onAction === 'function') {
    const actionBtn = document.createElement('button');
    actionBtn.className = 'toast-action-btn';
    actionBtn.textContent = actionText;
    actionBtn.onclick = () => {
      onAction();
      toast.remove();
    };
    toast.appendChild(actionBtn);
  }

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 240);
  }, duration);
}

export function showSpinner(text = 'Đang tải dữ liệu...') {
  const el = document.getElementById('global-spinner');
  const txt = document.getElementById('spinner-text');
  if (txt) txt.textContent = text;
  if (el) el.classList.remove('hidden');
}

export function hideSpinner() {
  const el = document.getElementById('global-spinner');
  if (el) el.classList.add('hidden');
}
