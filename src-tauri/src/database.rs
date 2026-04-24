use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::fs;
use parking_lot::Mutex;

pub struct AppState {
    pub db_conn: Mutex<Connection>,
}

impl AppState {
    pub fn new(db_path: &PathBuf) -> Result<Self, String> {
        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("无法创建数据库目录: {}", e))?;
        }

        let conn = Connection::open(db_path)
            .map_err(|e| format!("无法打开数据库: {}", e))?;

        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .map_err(|e| format!("设置 PRAGMA 失败: {}", e))?;

        Ok(Self {
            db_conn: Mutex::new(conn),
        })
    }

    pub fn with_conn<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Connection) -> Result<T, rusqlite::Error>,
    {
        let conn = self.db_conn.lock();
        f(&conn).map_err(|e| format!("数据库操作失败: {}", e))
    }

    pub fn with_transaction<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&rusqlite::Transaction) -> Result<T, rusqlite::Error>,
    {
        let mut conn = self.db_conn.lock();
        let tx = conn.transaction()
            .map_err(|e| format!("开启事务失败: {}", e))?;

        let result = f(&tx);
        match result {
            Ok(val) => {
                tx.commit().map_err(|e| format!("提交事务失败: {}", e))?;
                Ok(val)
            }
            Err(e) => {
                let _ = tx.rollback();
                Err(format!("事务执行失败: {}", e))
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookMetadata {
    pub id: Option<i64>,
    pub path: String,
    pub title: String,
    pub author: Option<String>,
    pub source_type: String,
    pub page_count: Option<i64>,
    pub word_count: Option<i64>,
    pub chapter_count: Option<i64>,
    pub encoding: Option<String>,
    pub last_opened: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub current_page: i64,
    #[serde(default)]
    pub total_pages: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chapter {
    pub id: Option<i64>,
    pub book_id: i64,
    pub chapter_number: i64,
    pub title: String,
    pub start_offset: Option<i64>,
    pub end_offset: Option<i64>,
    pub level: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadingProgress {
    pub id: Option<i64>,
    pub book_id: i64,
    pub current_page: i64,
    pub total_pages: i64,
    pub current_chapter: Option<i64>,
    pub chapter_offset: Option<i64>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bookmark {
    pub id: Option<i64>,
    pub book_id: i64,
    pub chapter_id: Option<i64>,
    pub offset: Option<i64>,
    pub title: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Highlight {
    pub id: Option<i64>,
    pub book_id: i64,
    pub chapter_id: Option<i64>,
    pub start_offset: i64,
    pub end_offset: i64,
    pub text_content: Option<String>,
    pub note: Option<String>,
    pub color: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FavoriteEntry {
    pub id: Option<i64>,
    pub book_id: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: Option<i64>,
    pub name: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookTag {
    pub id: Option<i64>,
    pub book_id: i64,
    pub tag_id: i64,
}

pub fn get_db_path() -> PathBuf {
    let app_data = if cfg!(target_os = "windows") {
        std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string())
    } else if cfg!(target_os = "macos") {
        format!("{}/Library/Application Support", dirs::home_dir().unwrap_or_default().to_string_lossy())
    } else {
        dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .to_string_lossy()
            .to_string()
    };

    PathBuf::from(app_data).join("novel-reader").join("novel.db")
}

pub fn init_database_schema() -> Result<(), String> {
    let db_path = get_db_path();

    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("无法创建数据库目录: {}", e))?;
    }

    let conn = Connection::open(&db_path)
        .map_err(|e| format!("无法打开数据库: {}", e))?;

    conn.execute_batch(
        "
        PRAGMA journal_mode=WAL;
        PRAGMA foreign_keys=ON;
        PRAGMA user_version=3;

        CREATE TABLE IF NOT EXISTS book_metadata (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            author TEXT,
            source_type TEXT NOT NULL,
            page_count INTEGER,
            word_count INTEGER,
            chapter_count INTEGER,
            encoding TEXT,
            last_opened TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS chapters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id INTEGER NOT NULL,
            chapter_number INTEGER NOT NULL,
            title TEXT NOT NULL,
            start_offset INTEGER,
            end_offset INTEGER,
            level INTEGER,
            FOREIGN KEY (book_id) REFERENCES book_metadata(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS reading_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id INTEGER NOT NULL UNIQUE,
            current_page INTEGER NOT NULL DEFAULT 0,
            total_pages INTEGER NOT NULL DEFAULT 0,
            current_chapter INTEGER,
            chapter_offset INTEGER,
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (book_id) REFERENCES book_metadata(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS bookmarks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id INTEGER NOT NULL,
            chapter_id INTEGER,
            offset INTEGER,
            title TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (book_id) REFERENCES book_metadata(id) ON DELETE CASCADE,
            FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS highlights (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id INTEGER NOT NULL,
            chapter_id INTEGER,
            start_offset INTEGER NOT NULL,
            end_offset INTEGER NOT NULL,
            text_content TEXT,
            note TEXT,
            color TEXT NOT NULL DEFAULT '#CBE93A',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (book_id) REFERENCES book_metadata(id) ON DELETE CASCADE,
            FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS favorites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id INTEGER NOT NULL UNIQUE,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (book_id) REFERENCES book_metadata(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
        );

        CREATE TABLE IF NOT EXISTS book_tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            UNIQUE(book_id, tag_id),
            FOREIGN KEY (book_id) REFERENCES book_metadata(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        );
        ",
    ).map_err(|e| format!("无法创建表: {}", e))?;

    let current_version: i32 = conn.pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|e| format!("查询数据库版本失败: {}", e))?;

    if current_version < 1 {
        conn.execute_batch(
            "
            CREATE INDEX IF NOT EXISTS idx_book_metadata_title ON book_metadata(title);
            CREATE INDEX IF NOT EXISTS idx_book_metadata_source_type ON book_metadata(source_type);
            CREATE INDEX IF NOT EXISTS idx_favorites_created_at ON favorites(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_chapters_book_id ON chapters(book_id, chapter_number);
            CREATE INDEX IF NOT EXISTS idx_bookmarks_book_id ON bookmarks(book_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_highlights_book_id ON highlights(book_id);
            PRAGMA user_version=1;
            ",
        ).map_err(|e| format!("版本 1 迁移失败: {}", e))?;
    }

    if current_version < 2 {
        conn.execute_batch(
            "
            CREATE INDEX IF NOT EXISTS idx_book_metadata_updated_at ON book_metadata(updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_book_metadata_last_opened ON book_metadata(last_opened DESC)
            WHERE last_opened IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_book_metadata_author ON book_metadata(author);
            PRAGMA user_version=2;
            ",
        ).map_err(|e| format!("版本 2 迁移失败: {}", e))?;
    }

    if current_version < 3 {
        conn.execute_batch(
            "
            CREATE INDEX IF NOT EXISTS idx_reading_progress_book_id ON reading_progress(book_id);
            PRAGMA user_version=3;
            ",
        ).map_err(|e| format!("版本 3 迁移失败: {}", e))?;
    }

    Ok(())
}

fn row_to_book_metadata(row: &rusqlite::Row) -> rusqlite::Result<BookMetadata> {
    Ok(BookMetadata {
        id: Some(row.get(0)?),
        path: row.get(1)?,
        title: row.get(2)?,
        author: row.get(3)?,
        source_type: row.get(4)?,
        page_count: row.get(5)?,
        word_count: row.get(6)?,
        chapter_count: row.get(7)?,
        encoding: row.get(8)?,
        last_opened: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
        current_page: row.get(12).unwrap_or(0),
        total_pages: row.get(13).unwrap_or(0),
    })
}

pub fn batch_upsert_book_metadata(state: &AppState, books: &[BookMetadata]) -> Result<Vec<i64>, String> {
    state.with_transaction(|tx| {
        let mut stmt = tx.prepare(
            "INSERT INTO book_metadata (path, title, author, source_type, page_count, word_count, chapter_count, encoding, last_opened, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(path) DO UPDATE SET
                 title = excluded.title,
                 author = excluded.author,
                 source_type = excluded.source_type,
                 page_count = excluded.page_count,
                 word_count = excluded.word_count,
                 chapter_count = excluded.chapter_count,
                 encoding = excluded.encoding,
                 updated_at = excluded.updated_at
             RETURNING id"
        )?;

        let mut ids = Vec::with_capacity(books.len());

        for book in books {
            let id: i64 = stmt.query_row(params![
                book.path,
                book.title,
                book.author,
                book.source_type,
                book.page_count,
                book.word_count,
                book.chapter_count,
                book.encoding,
                book.last_opened,
                book.created_at,
                book.updated_at,
            ], |row| row.get(0))?;
            ids.push(id);
        }

        Ok(ids)
    })
}

pub fn upsert_book_metadata(state: &AppState, book: &BookMetadata) -> Result<i64, String> {
    state.with_conn(|conn| {
        conn.execute(
            "INSERT INTO book_metadata (path, title, author, source_type, page_count, word_count, chapter_count, encoding, last_opened, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(path) DO UPDATE SET
                 title = excluded.title,
                 author = excluded.author,
                 source_type = excluded.source_type,
                 page_count = excluded.page_count,
                 word_count = excluded.word_count,
                 chapter_count = excluded.chapter_count,
                 encoding = excluded.encoding,
                 updated_at = excluded.updated_at",
            params![
                book.path,
                book.title,
                book.author,
                book.source_type,
                book.page_count,
                book.word_count,
                book.chapter_count,
                book.encoding,
                book.last_opened,
                book.created_at,
                book.updated_at,
            ],
        )?;

        conn.query_row(
            "SELECT id FROM book_metadata WHERE path = ?1",
            params![book.path],
            |row| row.get(0),
        )
    })
}

pub fn get_book_by_path(state: &AppState, path: &str) -> Result<Option<BookMetadata>, String> {
    state.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT b.id, b.path, b.title, b.author, b.source_type, b.page_count,
                    b.word_count, b.chapter_count, b.encoding, b.last_opened,
                    b.created_at, b.updated_at,
                    COALESCE(r.current_page, 0) as current_page,
                    COALESCE(r.total_pages, 0) as total_pages
             FROM book_metadata b
             LEFT JOIN reading_progress r ON b.id = r.book_id
             WHERE b.path = ?1"
        )?;

        Ok(stmt.query_row(params![path], row_to_book_metadata).ok())
    })
}

pub fn get_book_id_by_path(state: &AppState, path: &str) -> Result<Option<i64>, String> {
    state.with_conn(|conn| {
        Ok(conn.query_row(
            "SELECT id FROM book_metadata WHERE path = ?1",
            params![path],
            |row| row.get(0),
        ).ok())
    })
}

pub fn count_books_in_folder(state: &AppState, folder_path: &str) -> Result<usize, String> {
    let conn_guard = state.db_conn.lock();

    let normalized_path = folder_path.replace('/', "\\");
    let pattern = format!("{}%", normalized_path.trim_end_matches('\\').trim_end_matches('/'));

    let count: i64 = conn_guard.query_row(
        "SELECT COUNT(*) FROM book_metadata WHERE path LIKE ?1",
        params![pattern],
        |row| row.get(0),
    ).map_err(|e| format!("统计书籍失败: {}", e))?;

    Ok(count as usize)
}

pub fn get_all_books(state: &AppState) -> Result<Vec<BookMetadata>, String> {
    state.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT b.id, b.path, b.title, b.author, b.source_type, b.page_count,
                    b.word_count, b.chapter_count, b.encoding, b.last_opened,
                    b.created_at, b.updated_at,
                    COALESCE(r.current_page, 0) as current_page,
                    COALESCE(r.total_pages, 0) as total_pages
             FROM book_metadata b
             LEFT JOIN reading_progress r ON b.id = r.book_id
             ORDER BY b.title ASC"
        )?;

        let books: Vec<BookMetadata> = stmt.query_map(params![], row_to_book_metadata)?
            .filter_map(|r| r.ok())
            .collect();

        Ok(books)
    })
}

pub fn update_book_last_opened(state: &AppState, book_id: i64) -> Result<(), String> {
    state.with_conn(|conn| {
        conn.execute(
            "UPDATE book_metadata SET last_opened = datetime('now'), updated_at = datetime('now') WHERE id = ?1",
            params![book_id],
        )?;
        Ok(())
    })
}

pub fn save_reading_progress(state: &AppState, book_id: i64, current_page: i64, total_pages: i64, current_chapter: Option<i64>, chapter_offset: Option<i64>) -> Result<(), String> {
    state.with_conn(|conn| {
        conn.execute(
            "INSERT INTO reading_progress (book_id, current_page, total_pages, current_chapter, chapter_offset, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
             ON CONFLICT(book_id) DO UPDATE SET
                current_page = excluded.current_page,
                total_pages = excluded.total_pages,
                current_chapter = excluded.current_chapter,
                chapter_offset = excluded.chapter_offset,
                updated_at = excluded.updated_at",
            params![book_id, current_page, total_pages, current_chapter, chapter_offset],
        )?;
        Ok(())
    })
}

pub fn get_reading_progress(state: &AppState, book_id: i64) -> Result<Option<ReadingProgress>, String> {
    state.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, book_id, current_page, total_pages, current_chapter, chapter_offset, updated_at
             FROM reading_progress WHERE book_id = ?1"
        )?;

        Ok(stmt.query_row(params![book_id], |row| {
            Ok(ReadingProgress {
                id: Some(row.get(0)?),
                book_id: row.get(1)?,
                current_page: row.get(2)?,
                total_pages: row.get(3)?,
                current_chapter: row.get(4)?,
                chapter_offset: row.get(5)?,
                updated_at: row.get(6)?,
            })
        }).ok())
    })
}

pub fn save_chapters(state: &AppState, book_id: i64, chapters: &[Chapter]) -> Result<(), String> {
    state.with_conn(|conn| {
        conn.execute("DELETE FROM chapters WHERE book_id = ?1", params![book_id])?;

        let mut stmt = conn.prepare(
            "INSERT INTO chapters (book_id, chapter_number, title, start_offset, end_offset, level)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
        )?;

        for chapter in chapters {
            stmt.execute(params![
                book_id,
                chapter.chapter_number,
                chapter.title,
                chapter.start_offset,
                chapter.end_offset,
                chapter.level,
            ])?;
        }

        Ok(())
    })
}

pub fn get_chapters(state: &AppState, book_id: i64) -> Result<Vec<Chapter>, String> {
    state.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, book_id, chapter_number, title, start_offset, end_offset, level
             FROM chapters WHERE book_id = ?1
             ORDER BY chapter_number ASC"
        )?;

        let chapters: Vec<Chapter> = stmt.query_map(params![book_id], |row| {
            Ok(Chapter {
                id: Some(row.get(0)?),
                book_id: row.get(1)?,
                chapter_number: row.get(2)?,
                title: row.get(3)?,
                start_offset: row.get(4)?,
                end_offset: row.get(5)?,
                level: row.get(6)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

        Ok(chapters)
    })
}

pub fn add_bookmark(state: &AppState, book_id: i64, chapter_id: Option<i64>, offset: Option<i64>, title: &str) -> Result<i64, String> {
    state.with_conn(|conn| {
        conn.execute(
            "INSERT INTO bookmarks (book_id, chapter_id, offset, title, created_at) VALUES (?1, ?2, ?3, ?4, datetime('now'))",
            params![book_id, chapter_id, offset, title],
        )?;
        Ok(conn.last_insert_rowid())
    })
}

pub fn get_bookmarks(state: &AppState, book_id: i64) -> Result<Vec<Bookmark>, String> {
    state.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, book_id, chapter_id, offset, title, created_at
             FROM bookmarks WHERE book_id = ?1
             ORDER BY created_at DESC"
        )?;

        let bookmarks: Vec<Bookmark> = stmt.query_map(params![book_id], |row| {
            Ok(Bookmark {
                id: Some(row.get(0)?),
                book_id: row.get(1)?,
                chapter_id: row.get(2)?,
                offset: row.get(3)?,
                title: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

        Ok(bookmarks)
    })
}

pub fn delete_bookmark(state: &AppState, bookmark_id: i64) -> Result<(), String> {
    state.with_conn(|conn| {
        conn.execute("DELETE FROM bookmarks WHERE id = ?1", params![bookmark_id])?;
        Ok(())
    })
}

pub fn add_highlight(state: &AppState, book_id: i64, chapter_id: Option<i64>, start_offset: i64, end_offset: i64, text_content: Option<&str>, note: Option<&str>, color: &str) -> Result<i64, String> {
    state.with_conn(|conn| {
        conn.execute(
            "INSERT INTO highlights (book_id, chapter_id, start_offset, end_offset, text_content, note, color, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))",
            params![book_id, chapter_id, start_offset, end_offset, text_content, note, color],
        )?;
        Ok(conn.last_insert_rowid())
    })
}

pub fn get_highlights(state: &AppState, book_id: i64) -> Result<Vec<Highlight>, String> {
    state.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, book_id, chapter_id, start_offset, end_offset, text_content, note, color, created_at
             FROM highlights WHERE book_id = ?1
             ORDER BY start_offset ASC"
        )?;

        let highlights: Vec<Highlight> = stmt.query_map(params![book_id], |row| {
            Ok(Highlight {
                id: Some(row.get(0)?),
                book_id: row.get(1)?,
                chapter_id: row.get(2)?,
                start_offset: row.get(3)?,
                end_offset: row.get(4)?,
                text_content: row.get(5)?,
                note: row.get(6)?,
                color: row.get(7)?,
                created_at: row.get(8)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

        Ok(highlights)
    })
}

pub fn delete_highlight(state: &AppState, highlight_id: i64) -> Result<(), String> {
    state.with_conn(|conn| {
        conn.execute("DELETE FROM highlights WHERE id = ?1", params![highlight_id])?;
        Ok(())
    })
}

pub fn add_to_favorites(state: &AppState, book_id: i64) -> Result<(), String> {
    state.with_conn(|conn| {
        conn.execute(
            "INSERT INTO favorites (book_id, created_at) VALUES (?1, datetime('now'))
             ON CONFLICT(book_id) DO NOTHING",
            params![book_id],
        )?;
        Ok(())
    })
}

pub fn remove_from_favorites(state: &AppState, book_id: i64) -> Result<(), String> {
    state.with_conn(|conn| {
        conn.execute("DELETE FROM favorites WHERE book_id = ?1", params![book_id])?;
        Ok(())
    })
}

pub fn is_favorite(state: &AppState, book_id: i64) -> Result<bool, String> {
    state.with_conn(|conn| {
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM favorites WHERE book_id = ?1",
            params![book_id],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    })
}

pub fn get_favorite_books(state: &AppState) -> Result<Vec<BookMetadata>, String> {
    state.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT b.id, b.path, b.title, b.author, b.source_type, b.page_count,
                    b.word_count, b.chapter_count, b.encoding, b.last_opened,
                    b.created_at, b.updated_at,
                    COALESCE(r.current_page, 0) as current_page,
                    COALESCE(r.total_pages, 0) as total_pages
             FROM book_metadata b
             INNER JOIN favorites f ON b.id = f.book_id
             LEFT JOIN reading_progress r ON b.id = r.book_id
             ORDER BY f.created_at DESC"
        )?;

        let books: Vec<BookMetadata> = stmt.query_map(params![], row_to_book_metadata)?
            .filter_map(|r| r.ok())
            .collect();

        Ok(books)
    })
}

pub fn add_tag_to_book(state: &AppState, book_id: i64, tag_name: &str) -> Result<(), String> {
    state.with_conn(|conn| {
        conn.execute("INSERT INTO tags (name) VALUES (?1) ON CONFLICT(name) DO NOTHING", params![tag_name])?;

        let tag_id: i64 = conn.query_row("SELECT id FROM tags WHERE name = ?1", params![tag_name], |row| row.get(0))?;

        conn.execute("INSERT INTO book_tags (book_id, tag_id) VALUES (?1, ?2) ON CONFLICT DO NOTHING", params![book_id, tag_id])?;

        Ok(())
    })
}

pub fn remove_tag_from_book(state: &AppState, book_id: i64, tag_id: i64) -> Result<(), String> {
    state.with_conn(|conn| {
        conn.execute("DELETE FROM book_tags WHERE book_id = ?1 AND tag_id = ?2", params![book_id, tag_id])?;
        Ok(())
    })
}

pub fn get_book_tags(state: &AppState, book_id: i64) -> Result<Vec<Tag>, String> {
    state.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT t.id, t.name
             FROM tags t
             INNER JOIN book_tags bt ON t.id = bt.tag_id
             WHERE bt.book_id = ?1
             ORDER BY t.name ASC"
        )?;

        let tags: Vec<Tag> = stmt.query_map(params![book_id], |row| {
            Ok(Tag { id: Some(row.get(0)?), name: row.get(1)?, count: 0 })
        })?
        .filter_map(|r| r.ok())
        .collect();

        Ok(tags)
    })
}

pub fn get_all_tags(state: &AppState) -> Result<Vec<Tag>, String> {
    state.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT t.id, t.name, COUNT(bt.book_id) as count
             FROM tags t
             LEFT JOIN book_tags bt ON t.id = bt.tag_id
             GROUP BY t.id, t.name
             ORDER BY name ASC"
        )?;

        let tags: Vec<Tag> = stmt.query_map(params![], |row| {
            Ok(Tag { id: Some(row.get(0)?), name: row.get(1)?, count: row.get(2)? })
        })?
        .filter_map(|r| r.ok())
        .collect();

        Ok(tags)
    })
}

pub fn delete_tag_by_name(state: &AppState, tag_name: &str) -> Result<(), String> {
    state.with_conn(|conn| {
        conn.execute("DELETE FROM book_tags WHERE tag_id IN (SELECT id FROM tags WHERE name = ?1)", params![tag_name])?;
        conn.execute("DELETE FROM tags WHERE name = ?1", params![tag_name])?;
        Ok(())
    })
}

pub fn get_books_by_tag(state: &AppState, tag_name: &str) -> Result<Vec<BookMetadata>, String> {
    state.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT b.id, b.path, b.title, b.author, b.source_type, b.page_count,
                    b.word_count, b.chapter_count, b.encoding, b.last_opened,
                    b.created_at, b.updated_at,
                    COALESCE(r.current_page, 0) as current_page,
                    COALESCE(r.total_pages, 0) as total_pages
             FROM book_metadata b
             INNER JOIN book_tags bt ON b.id = bt.book_id
             INNER JOIN tags t ON bt.tag_id = t.id
             LEFT JOIN reading_progress r ON b.id = r.book_id
             WHERE t.name = ?1
             ORDER BY b.title ASC"
        )?;

        let books: Vec<BookMetadata> = stmt.query_map(params![tag_name], row_to_book_metadata)?
            .filter_map(|r| r.ok())
            .collect();

        Ok(books)
    })
}
