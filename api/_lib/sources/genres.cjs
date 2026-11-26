/**
 * Canonical Genres Catalog synced between Backend Sources and Frontend UI.
 */

const GENRES = [
  { slug: 'action', qqSlug: 'action-26', name: 'Action', icon: '⚔️' },
  { slug: 'manhwa', qqSlug: 'manhwa-49', name: 'Manhwa', icon: '🇰🇷' },
  { slug: 'manhua', qqSlug: 'manhua-35', name: 'Manhua', icon: '🇨🇳' },
  { slug: 'manga', qqSlug: 'manga-469', name: 'Manga', icon: '🇯🇵' },
  { slug: 'chuyen-sinh', qqSlug: 'chuyen-sinh-91', name: 'Chuyển Sinh', icon: '✨' },
  { slug: 'xuyen-khong', qqSlug: 'xuyen-khong-88', name: 'Xuyên Không', icon: '🚀' },
  { slug: 'co-dai', qqSlug: 'co-dai-90', name: 'Cổ Đại', icon: '🏯' },
  { slug: 'ngon-tinh', qqSlug: 'ngon-tinh-87', name: 'Ngôn Tình', icon: '💕' },
  { slug: 'romance', qqSlug: 'romance-36', name: 'Romance', icon: '💖' },
  { slug: 'comedy', qqSlug: 'comedy-28', name: 'Comedy', icon: '😂' },
  { slug: 'adventure', qqSlug: 'adventure-27', name: 'Adventure', icon: '🧭' },
  { slug: 'fantasy', qqSlug: 'fantasy-30', name: 'Fantasy', icon: '🧙' },
  { slug: 'shounen', qqSlug: 'shounen-31', name: 'Shounen', icon: '⚡' },
  { slug: 'truyen-mau', qqSlug: 'truyen-mau-92', name: 'Truyện Màu', icon: '🎨' },
  { slug: 'webtoon', qqSlug: 'webtoon-55', name: 'Webtoon', icon: '📱' },
  { slug: 'martial-arts', qqSlug: 'martial-arts-41', name: 'Võ Thuật', icon: '🥋' },
  { slug: 'huyen-huyen', qqSlug: 'huyen-huyen-468', name: 'Huyền Huyễn', icon: '🐉' },
  { slug: 'isekai', qqSlug: 'isekai-85', name: 'Isekai', icon: '🌌' },
  { slug: 'trong-sinh', qqSlug: 'trong-sinh-82', name: 'Trọng Sinh', icon: '🔄' },
  { slug: 'mystery', qqSlug: 'mystery-39', name: 'Mystery', icon: '🔍' },
  { slug: 'supernatural', qqSlug: 'supernatural-32', name: 'Supernatural', icon: '🔮' },
  { slug: 'sports', qqSlug: 'sports-57', name: 'Sports', icon: '⚽' },
  { slug: 'slice-of-life', qqSlug: 'slice-of-life-46', name: 'Slice of Life', icon: '☕' },
  { slug: 'school-life', qqSlug: 'school-life-37', name: 'School Life', icon: '🏫' },
  { slug: 'sci-fi', qqSlug: 'sci-fi-43', name: 'Sci-fi', icon: '🛸' },
  { slug: 'seinen', qqSlug: 'seinen-42', name: 'Seinen', icon: '🍷' },
  { slug: 'psychological', qqSlug: 'psychological-40', name: 'Psychological', icon: '🧠' },
  { slug: 'harem', qqSlug: 'harem-47', name: 'Harem', icon: '🌸' },
  { slug: 'drama', qqSlug: 'drama-29', name: 'Drama', icon: '🎭' },
  { slug: 'historical', qqSlug: 'historical-51', name: 'Historical', icon: '📜' },
  { slug: 'horror', qqSlug: 'horror-44', name: 'Horror', icon: '👻' },
  { slug: 'magic', qqSlug: 'magic-58', name: 'Magic', icon: '🪄' },
  { slug: 'demons', qqSlug: 'demons-99', name: 'Demons', icon: '😈' },
  { slug: 'detective', qqSlug: 'detective-100', name: 'Detective', icon: '🕵️' },
  { slug: 'anime', qqSlug: 'anime-62', name: 'Anime', icon: '🎬' },
  { slug: 'comic', qqSlug: 'comic-60', name: 'Comic', icon: '💬' },
  { slug: 'doujinshi', qqSlug: 'doujinshi-96', name: 'Doujinshi', icon: '📘' },
  { slug: 'gender-bender', qqSlug: 'gender-bender-45', name: 'Gender Bender', icon: '⚧️' },
  { slug: 'josei', qqSlug: 'josei-54', name: 'Josei', icon: '💐' },
  { slug: 'mafia', qqSlug: 'mafia-69', name: 'Mafia', icon: '🕶️' },
  { slug: 'military', qqSlug: 'military-101', name: 'Military', icon: '🎖️' },
  { slug: 'one-shot', qqSlug: 'one-shot-95', name: 'One Shot', icon: '1️⃣' },
  { slug: 'shoujo', qqSlug: 'shoujo-38', name: 'Shoujo', icon: '🌷' },
  { slug: 'shoujo-ai', qqSlug: 'shoujo-ai-98', name: 'Shoujo Ai', icon: '💞' },
  { slug: 'shounen-ai', qqSlug: 'shounen-ai-86', name: 'Shounen Ai', icon: '💠' },
  { slug: 'tragedy', qqSlug: 'tragedy-52', name: 'Tragedy', icon: '🥀' }
];

const GENRE_MAP = Object.fromEntries(GENRES.map((g) => [g.slug, g.qqSlug]));

// Map any legacy frontend slugs not directly in TruyenQQ list
GENRE_MAP.mecha = 'sci-fi-43';

module.exports = {
  GENRES,
  GENRE_MAP
};
