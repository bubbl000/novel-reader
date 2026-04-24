use serde::{Deserialize, Serialize};
use rusqlite::params;
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadingSession {
    pub id: Option<i64>,
    pub book_id: i64,
    pub start_time: String,
    pub end_time: Option<String>,
    pub duration_seconds: i64,
    pub pages_read: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadingStats {
    pub total_sessions: i64,
    pub total_duration_seconds: i64,
    pub total_pages_read: i64,
    pub average_session_duration: f64,
    pub longest_session: i64,
}

pub fn start_reading_session(
    conn: &rusqlite::Connection,
    book_id: i64,
) -> Result<i64, String> {
    conn.execute(
        "INSERT INTO reading_sessions (book_id, start_time, duration_seconds, pages_read, created_at)
         VALUES (?1, datetime('now'), 0, 0, datetime('now'))",
        params![book_id],
    ).map_err(|e| format!("创建阅读会话失败: {}", e))?;

    Ok(conn.last_insert_rowid())
}

pub fn end_reading_session(
    conn: &rusqlite::Connection,
    session_id: i64,
    pages_read: i64,
) -> Result<(), String> {
    conn.execute(
        "UPDATE reading_sessions SET end_time = datetime('now'), duration_seconds = 
         CAST((julianday('now') - julianday(start_time)) * 86400 AS INTEGER),
         pages_read = ?1
         WHERE id = ?2",
        params![pages_read, session_id],
    ).map_err(|e| format!("更新阅读会话失败: {}", e))?;

    Ok(())
}

pub fn get_reading_stats(
    conn: &rusqlite::Connection,
    book_id: i64,
) -> Result<ReadingStats, String> {
    let total_sessions: i64 = conn.query_row(
        "SELECT COUNT(*) FROM reading_sessions WHERE book_id = ?1",
        params![book_id],
        |row| row.get(0),
    ).map_err(|e| format!("查询阅读统计失败: {}", e))?;

    let total_duration: i64 = conn.query_row(
        "SELECT COALESCE(SUM(duration_seconds), 0) FROM reading_sessions WHERE book_id = ?1",
        params![book_id],
        |row| row.get(0),
    ).map_err(|e| format!("查询总时长失败: {}", e))?;

    let total_pages: i64 = conn.query_row(
        "SELECT COALESCE(SUM(pages_read), 0) FROM reading_sessions WHERE book_id = ?1",
        params![book_id],
        |row| row.get(0),
    ).map_err(|e| format!("查询总页数失败: {}", e))?;

    let longest: i64 = conn.query_row(
        "SELECT COALESCE(MAX(duration_seconds), 0) FROM reading_sessions WHERE book_id = ?1",
        params![book_id],
        |row| row.get(0),
    ).map_err(|e| format!("查询最长会话失败: {}", e))?;

    let avg = if total_sessions > 0 {
        total_duration as f64 / total_sessions as f64
    } else {
        0.0
    };

    Ok(ReadingStats {
        total_sessions,
        total_duration_seconds: total_duration,
        total_pages_read: total_pages,
        average_session_duration: avg,
        longest_session: longest,
    })
}

pub fn get_recent_sessions(
    conn: &rusqlite::Connection,
    book_id: i64,
    limit: i64,
) -> Result<Vec<ReadingSession>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, book_id, start_time, end_time, duration_seconds, pages_read
         FROM reading_sessions WHERE book_id = ?1
         ORDER BY start_time DESC LIMIT ?2"
    ).map_err(|e| format!("准备查询失败: {}", e))?;

    let sessions = stmt.query_map(params![book_id, limit], |row| {
        Ok(ReadingSession {
            id: Some(row.get(0)?),
            book_id: row.get(1)?,
            start_time: row.get(2)?,
            end_time: row.get(3)?,
            duration_seconds: row.get(4)?,
            pages_read: row.get(5)?,
        })
    }).map_err(|e| format!("查询阅读会话失败: {}", e))?
    .filter_map(|r| r.ok())
    .collect();

    Ok(sessions)
}
