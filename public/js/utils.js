/**
 * Shared Frontend Utilities: XSS-safe escaping, debounce, image URL builder, time parsing, toasts.
 */

export const FALLBACK_COVER = 'assets/cover-fallback.svg';

const API_BASE =
  window.location.protocol === 'file:'
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

export function parseVietnameseTime(timeStr) {
  if (!timeStr) return 0;
  const s = String(timeStr).toLowerCase().trim();
  const now = Date.now();

  if (s.includes('vừa') || s.includes('mới')) return now;

  let m = s.match(/(\d+)\s*giây/);
  if (m) return now - parseInt(m[1], 10) * 1000;

  m = s.match(/(\d+)\s*phút/);
  if (m) return now - parseInt(m[1], 10) * 60 * 1000;

  m = s.match(/(\d+)\s*(?:giờ|tiếng)/);
  if (m) return now - parseInt(m[1], 10) * 3600 * 1000;

  if (s.includes('hôm qua')) return now - 24 * 3600 * 1000;
  if (s.includes('hôm kia')) return now - 48 * 3600 * 1000;

  m = s.match(/(\d+)\s*ngày/);
  if (m) return now - parseInt(m[1], 10) * 24 * 3600 * 1000;

  m = s.match(/(\d+)\s*tuần/);
  if (m) return now - parseInt(m[1], 10) * 7 * 24 * 3600 * 1000;

  m = s.match(/(\d+)\s*tháng/);
  if (m) return now - parseInt(m[1], 10) * 30 * 24 * 3600 * 1000;

  m = s.match(/(\d+)\s*năm/);
  if (m) return now - parseInt(m[1], 10) * 365 * 24 * 3600 * 1000;

  m = s.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) {
    const d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
    return d.getTime() || 0;
  }

  const parsed = Date.parse(timeStr);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function showToast(message, options = {}) {
  const { duration = 3000, actionText = '', onAction = null } =
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
    setTimeout(() => toast.remove(), 260);
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
