use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TxtChapter {
    pub chapter_number: usize,
    pub title: String,
    pub start_offset: usize,
    pub end_offset: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TxtParseResult {
    pub text: String,
    pub chapters: Vec<TxtChapter>,
    pub title: String,
    pub encoding: String,
    pub total_chars: usize,
}

static CHAPTER_PATTERNS: &[&str] = &[
    r"^第[零一二三四五六七八九十百千万\d]+[章节回卷集部篇]",
    r"^Chapter\s+\d+",
    r"^CHAPTER\s+\d+",
    r"^卷[零一二三四五六七八九十百千万\d]+",
    r"^序[章言幕]",
    r"^引[子言]",
    r"^尾声",
    r"^楔子",
    r"^后记",
];

pub fn parse_txt_file(file_path: &str) -> Result<TxtParseResult, String> {
    let path = Path::new(file_path);
    if !path.exists() {
        return Err(format!("文件不存在: {}", file_path));
    }

    let raw_bytes = fs::read(path)
        .map_err(|e| format!("无法读取文件 {}: {}", file_path, e))?;

    let (text, encoding_name) = decode_bytes(&raw_bytes);

    let title = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "未知文本".to_string());

    let chapters = detect_chapters(&text);
    let total_chars = text.chars().count();

    Ok(TxtParseResult {
        text,
        chapters,
        title,
        encoding: encoding_name,
        total_chars,
    })
}

fn decode_bytes(raw: &[u8]) -> (String, String) {
    if raw.starts_with(&[0xEF, 0xBB, 0xBF]) {
        return (String::from_utf8_lossy(raw).to_string(), "UTF-8-BOM".to_string());
    }

    if let Ok(text) = String::from_utf8(raw.to_vec()) {
        return (text, "UTF-8".to_string());
    }

    let mut detector = chardetng::EncodingDetector::new();
    detector.feed(raw, true);
    let enc = detector.guess(None, true);

    let (decoded, _encoding_used, _had_errors) = enc.decode(raw);
    (decoded.to_string(), enc.name().to_string())
}

fn detect_chapters(text: &str) -> Vec<TxtChapter> {
    let mut chapters = Vec::new();
    let mut chapter_starts: Vec<(usize, String)> = Vec::new();

    let pattern = regex::Regex::new(&format!("({})", CHAPTER_PATTERNS.join("|"))).unwrap();

    for (line_idx, line) in text.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        if pattern.is_match(trimmed) {
            let byte_offset = text
                .lines()
                .take(line_idx)
                .map(|l| l.len() + 1)
                .sum::<usize>();

            chapter_starts.push((byte_offset, trimmed.to_string()));
        }
    }

    if chapter_starts.is_empty() {
        return Vec::new();
    }

    let total_len = text.len();

    for (idx, (offset, title)) in chapter_starts.iter().enumerate() {
        let end_offset = if idx + 1 < chapter_starts.len() {
            chapter_starts[idx + 1].0
        } else {
            total_len
        };

        chapters.push(TxtChapter {
            chapter_number: idx + 1,
            title: title.clone(),
            start_offset: *offset,
            end_offset,
        });
    }

    chapters
}


