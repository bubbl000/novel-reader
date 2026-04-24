use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use rayon::prelude::*;

const NOVEL_EXTENSIONS: &[&str] = &["pdf", "txt", "md", "markdown"];

const MAX_SCAN_DEPTH: usize = 20;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookCandidate {
    pub path: String,
    pub title: String,
    pub source_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub books: Vec<BookCandidate>,
    pub error: Option<String>,
}

pub fn scan_book_directory(directory: &str) -> ScanResult {
    let path = PathBuf::from(directory);

    if !path.exists() || !path.is_dir() {
        return ScanResult {
            books: Vec::new(),
            error: Some(format!("目录不存在或无效: {}", directory)),
        };
    }

    let mut books = Vec::new();
    let _visited: HashSet<String> = HashSet::new();

    if let Ok(entries) = fs::read_dir(&path) {
        let entry_paths: Vec<_> = entries
            .filter_map(|e| e.ok().map(|entry| entry.path()))
            .collect();

        let results: Vec<_> = entry_paths
            .par_iter()
            .filter_map(|entry_path| {
                let mut sub_books = Vec::new();
                let mut sub_visited = HashSet::new();

                if entry_path.is_dir() {
                    let _ = scan_directory_recursive(
                        entry_path, &mut sub_books, &mut sub_visited, 1
                    );
                } else if entry_path.is_file() {
                    process_file_entry(entry_path, &mut sub_books);
                }

                Some(sub_books)
            })
            .collect();

        for sub_books in results {
            books.extend(sub_books);
        }
    }

    ScanResult {
        books,
        error: None,
    }
}

fn process_file_entry(
    path: &Path,
    books: &mut Vec<BookCandidate>,
) {
    if let Some(ext) = path.extension() {
        let ext_lower = ext.to_string_lossy().to_lowercase();

        if NOVEL_EXTENSIONS.contains(&ext_lower.as_str()) {
            let title = path
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();

            let source_type = match ext_lower.as_str() {
                "pdf" => "pdf",
                "txt" => "txt",
                "md" | "markdown" => "md",
                _ => "unknown",
            };

            books.push(BookCandidate {
                path: path.to_string_lossy().to_string(),
                title,
                source_type: source_type.to_string(),
            });
        }
    }
}

fn scan_directory_recursive(
    dir: &Path,
    books: &mut Vec<BookCandidate>,
    visited: &mut HashSet<String>,
    current_depth: usize,
) -> Result<(), String> {
    if current_depth >= MAX_SCAN_DEPTH {
        return Ok(());
    }

    let canonical = match fs::canonicalize(dir) {
        Ok(c) => c.to_string_lossy().to_string(),
        Err(e) => return Err(format!("无法解析路径 {}: {}", dir.display(), e)),
    };

    if visited.contains(&canonical) {
        return Ok(());
    }
    visited.insert(canonical);

    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(e) => return Err(format!("无法读取目录: {}", e)),
    };

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        let path = entry.path();

        if let Ok(metadata) = fs::symlink_metadata(&path) {
            if metadata.file_type().is_symlink() {
                continue;
            }
        }

        if path.is_dir() {
            scan_directory_recursive(&path, books, visited, current_depth + 1)?;
        } else if path.is_file() {
            process_file_entry(&path, books);
        }
    }

    Ok(())
}
