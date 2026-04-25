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

export const extractPdfText = async (filePath: string): Promise<PdfExtractResult> => {
  return await invoke<PdfExtractResult>('extract_pdf_text', { filePath })
}

export const parseTxtFile = async (filePath: string): Promise<TxtParseResult> => {
  return await invoke<TxtParseResult>('parse_txt_file', { filePath })
}

export const parseMdFile = async (filePath: string): Promise<MdParseResult> => {
  return await invoke<MdParseResult>('parse_md_file', { filePath })
}
