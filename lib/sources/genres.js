/**
 * Canonical Genres Catalog synced between Backend Sources and Frontend UI.
 */

const GENRES = [
  { slug: 'action', qqSlug: 'action-26', name: 'Action' },
  { slug: 'manhwa', qqSlug: 'manhwa-49', name: 'Manhwa' },
  { slug: 'manhua', qqSlug: 'manhua-35', name: 'Manhua' },
  { slug: 'manga', qqSlug: 'manga-469', name: 'Manga' },
  { slug: 'chuyen-sinh', qqSlug: 'chuyen-sinh-91', name: 'Chuyển Sinh' },
  { slug: 'xuyen-khong', qqSlug: 'xuyen-khong-88', name: 'Xuyên Không' },
  { slug: 'co-dai', qqSlug: 'co-dai-90', name: 'Cổ Đại' },
  { slug: 'ngon-tinh', qqSlug: 'ngon-tinh-87', name: 'Ngôn Tình' },
  { slug: 'romance', qqSlug: 'romance-36', name: 'Romance' },
  { slug: 'comedy', qqSlug: 'comedy-28', name: 'Comedy' },
  { slug: 'adventure', qqSlug: 'adventure-27', name: 'Adventure' },
  { slug: 'fantasy', qqSlug: 'fantasy-30', name: 'Fantasy' },
  { slug: 'shounen', qqSlug: 'shounen-31', name: 'Shounen' },
  { slug: 'truyen-mau', qqSlug: 'truyen-mau-92', name: 'Truyện Màu' },
  { slug: 'webtoon', qqSlug: 'webtoon-55', name: 'Webtoon' },
  { slug: 'martial-arts', qqSlug: 'martial-arts-41', name: 'Võ Thuật' },
  { slug: 'huyen-huyen', qqSlug: 'huyen-huyen-468', name: 'Huyền Huyễn' },
  { slug: 'isekai', qqSlug: 'isekai-85', name: 'Isekai' },
  { slug: 'trong-sinh', qqSlug: 'trong-sinh-82', name: 'Trọng Sinh' },
  { slug: 'mystery', qqSlug: 'mystery-39', name: 'Mystery' },
  { slug: 'supernatural', qqSlug: 'supernatural-32', name: 'Supernatural' },
  { slug: 'sports', qqSlug: 'sports-57', name: 'Sports' },
  { slug: 'slice-of-life', qqSlug: 'slice-of-life-46', name: 'Slice of Life' },
  { slug: 'school-life', qqSlug: 'school-life-37', name: 'School Life' },
  { slug: 'sci-fi', qqSlug: 'sci-fi-43', name: 'Sci-fi' },
  { slug: 'seinen', qqSlug: 'seinen-42', name: 'Seinen' },
  { slug: 'psychological', qqSlug: 'psychological-40', name: 'Psychological' },
  { slug: 'harem', qqSlug: 'harem-47', name: 'Harem' },
  { slug: 'drama', qqSlug: 'drama-29', name: 'Drama' },
  { slug: 'historical', qqSlug: 'historical-51', name: 'Historical' },
  { slug: 'horror', qqSlug: 'horror-44', name: 'Horror' },
  { slug: 'magic', qqSlug: 'magic-58', name: 'Magic' },
  { slug: 'demons', qqSlug: 'demons-99', name: 'Demons' },
  { slug: 'detective', qqSlug: 'detective-100', name: 'Detective' },
  { slug: 'anime', qqSlug: 'anime-62', name: 'Anime' },
  { slug: 'comic', qqSlug: 'comic-60', name: 'Comic' },
  { slug: 'doujinshi', qqSlug: 'doujinshi-96', name: 'Doujinshi' },
  { slug: 'gender-bender', qqSlug: 'gender-bender-45', name: 'Gender Bender' },
  { slug: 'josei', qqSlug: 'josei-54', name: 'Josei' },
  { slug: 'mafia', qqSlug: 'mafia-69', name: 'Mafia' },
  { slug: 'military', qqSlug: 'military-101', name: 'Military' },
  { slug: 'one-shot', qqSlug: 'one-shot-95', name: 'One Shot' },
  { slug: 'shoujo', qqSlug: 'shoujo-38', name: 'Shoujo' },
  { slug: 'shoujo-ai', qqSlug: 'shoujo-ai-98', name: 'Shoujo Ai' },
  { slug: 'shounen-ai', qqSlug: 'shounen-ai-86', name: 'Shounen Ai' },
  { slug: 'tragedy', qqSlug: 'tragedy-52', name: 'Tragedy' }
];

const GENRE_MAP = Object.fromEntries(GENRES.map((g) => [g.slug, g.qqSlug]));

// Map any legacy frontend slugs not directly in TruyenQQ list
GENRE_MAP.mecha = 'sci-fi-43';

exports.GENRES = GENRES;
exports.GENRE_MAP = GENRE_MAP;
