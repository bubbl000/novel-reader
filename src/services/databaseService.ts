import { invoke } from '@tauri-apps/api/core'

export interface BookMetadata {
  id?: number
  path: string
  title: string
  author?: string
  source_type: string
  page_count?: number
  word_count?: number
  chapter_count?: number
  encoding?: string
  last_opened?: string
  created_at?: string
  updated_at?: string
  current_page?: number
  total_pages?: number
}

export interface Chapter {
  id?: number
  book_id: number
  chapter_number: number
  title: string
  start_offset?: number
  end_offset?: number
  level?: number
}

export interface ReadingProgress {
  id?: number
  book_id: number
  current_page: number
  total_pages: number
  current_chapter?: number
  chapter_offset?: number
  updated_at?: string
}

export interface Bookmark {
  id?: number
  book_id: number
  chapter_id?: number
  offset?: number
  title: string
  created_at: string
}

export interface Highlight {
  id?: number
  book_id: number
  chapter_id?: number
  start_offset: number
  end_offset: number
  text_content?: string
  note?: string
  color: string
  created_at: string
}

export interface Tag {
  id?: number
  name: string
}

export interface PdfTextPage {
  page_number: number
  text: string
}

export interface PdfExtractResult {
  pages: PdfTextPage[]
  total_pages: number
  title: string
}

export interface TxtChapter {
  chapter_number: number
  title: string
  start_offset: number
  end_offset: number
}

export interface TxtParseResult {
  text: string
  chapters: TxtChapter[]
  title: string
  encoding: string
  total_chars: number
}

export interface MdChapter {
  chapter_number: number
  title: string
  level: number
}

export interface MdParseResult {
  html_content: string
  chapters: MdChapter[]
  title: string
  total_chars: number
}

export const initDatabase = async (): Promise<void> => {
  await invoke('init_db')
}

export const saveBookMetadata = async (book: BookMetadata): Promise<number> => {
  return await invoke<number>('save_book_metadata', { book })
}

export const batchSaveBookMetadata = async (books: BookMetadata[]): Promise<number[]> => {
  return await invoke<number[]>('batch_save_book_metadata', { books })
}

export const getAllBooksMetadata = async (): Promise<BookMetadata[]> => {
  return await invoke<BookMetadata[]>('get_all_books_metadata')
}

export const getBookIdByPath = async (path: string): Promise<number | null> => {
  return await invoke<number | null>('get_book_id_by_path', { path })
}

export const getBookByPath = async (path: string): Promise<BookMetadata | null> => {
  return await invoke<BookMetadata | null>('get_book_by_path', { path })
}

export const updateBookLastOpened = async (bookId: number): Promise<void> => {
  await invoke('update_book_last_opened', { bookId })
}

export const saveReadingProgress = async (
  bookId: number,
  currentPage: number,
  totalPages: number,
  currentChapter?: number,
  chapterOffset?: number,
): Promise<void> => {
  await invoke('save_reading_progress', { bookId, currentPage, totalPages, currentChapter, chapterOffset })
}

export const getReadingProgress = async (bookId: number): Promise<ReadingProgress | null> => {
  return await invoke<ReadingProgress | null>('get_reading_progress', { bookId })
}

export const saveChapters = async (bookId: number, chapters: Chapter[]): Promise<void> => {
  await invoke('save_chapters', { bookId, chapters })
}

export const getChapters = async (bookId: number): Promise<Chapter[]> => {
  return await invoke<Chapter[]>('get_chapters', { bookId })
}

export const addBookmark = async (bookId: number, chapterId: number | null, offset: number | null, title: string): Promise<number> => {
  return await invoke<number>('add_bookmark', { bookId, chapterId, offset, title })
}

export const getBookmarks = async (bookId: number): Promise<Bookmark[]> => {
  return await invoke<Bookmark[]>('get_bookmarks', { bookId })
}

export const deleteBookmark = async (bookmarkId: number): Promise<void> => {
  await invoke('delete_bookmark', { bookmarkId })
}

export const addHighlight = async (
  bookId: number,
  chapterId: number | null,
  startOffset: number,
  endOffset: number,
  textContent: string | null,
  note: string | null,
  color: string,
): Promise<number> => {
  return await invoke<number>('add_highlight', { bookId, chapterId, startOffset, endOffset, textContent, note, color })
}

export const getHighlights = async (bookId: number): Promise<Highlight[]> => {
  return await invoke<Highlight[]>('get_highlights', { bookId })
}

export const deleteHighlight = async (highlightId: number): Promise<void> => {
  await invoke('delete_highlight', { highlightId })
}

export const addToFavorites = async (bookId: number): Promise<void> => {
  await invoke('add_to_favorites', { bookId })
}

export const removeFromFavorites = async (bookId: number): Promise<void> => {
  await invoke('remove_from_favorites', { bookId })
}

export const isFavorite = async (bookId: number): Promise<boolean> => {
  return await invoke<boolean>('is_favorite', { bookId })
}

export const getFavoriteBooks = async (): Promise<BookMetadata[]> => {
  return await invoke<BookMetadata[]>('get_favorite_books')
}

export const addTagToBook = async (bookId: number, tagName: string): Promise<void> => {
  await invoke('add_tag_to_book', { bookId, tagName })
}

export const removeTagFromBook = async (bookId: number, tagId: number): Promise<void> => {
  await invoke('remove_tag_from_book', { bookId, tagId })
}

export const getBookTags = async (bookId: number): Promise<Tag[]> => {
  return await invoke<Tag[]>('get_book_tags', { bookId })
}

export const getAllTags = async (): Promise<Tag[]> => {
  return await invoke<Tag[]>('get_all_tags')
}

export const extractPdfText = async (filePath: string): Promise<PdfExtractResult> => {
  return await invoke<PdfExtractResult>('extract_pdf_text', { filePath })
}

export const parseTxtFile = async (filePath: string): Promise<TxtParseResult> => {
  return await invoke<TxtParseResult>('parse_txt_file', { filePath })
}

export const parseMdFile = async (filePath: string): Promise<MdParseResult> => {
  return await invoke<MdParseResult>('parse_md_file', { filePath })
}

export const readFileText = async (filePath: string): Promise<string> => {
  return await invoke<string>('read_file_text', { filePath })
}

export interface SearchResult {
  page_number: number
  snippet: string
  match_start: number
  match_end: number
}

export interface SearchResults {
  results: SearchResult[]
  total_matches: number
}

export const searchInPdf = async (filePath: string, query: string, maxResults?: number): Promise<SearchResults> => {
  return await invoke<SearchResults>('search_in_pdf', { filePath, query, maxResults })
}

export const searchInTxt = async (filePath: string, query: string, maxResults?: number): Promise<SearchResults> => {
  return await invoke<SearchResults>('search_in_txt', { filePath, query, maxResults })
}

export const searchInMd = async (filePath: string, query: string, maxResults?: number): Promise<SearchResults> => {
  return await invoke<SearchResults>('search_in_md', { filePath, query, maxResults })
}

export interface ReadingSession {
  id?: number
  book_id: number
  start_time: string
  end_time?: string
  duration_seconds: number
  pages_read: number
}

export interface ReadingStats {
  total_sessions: number
  total_duration_seconds: number
  total_pages_read: number
  average_session_duration: number
  longest_session: number
}

export const startReadingSession = async (bookId: number): Promise<number> => {
  return await invoke<number>('start_reading_session', { bookId })
}

export const endReadingSession = async (sessionId: number, pagesRead: number): Promise<void> => {
  await invoke('end_reading_session', { sessionId, pagesRead })
}

export const getReadingStats = async (bookId: number): Promise<ReadingStats> => {
  return await invoke<ReadingStats>('get_reading_stats', { bookId })
}

export const getRecentSessions = async (bookId: number, limit?: number): Promise<ReadingSession[]> => {
  return await invoke<ReadingSession[]>('get_recent_sessions', { bookId, limit })
}
