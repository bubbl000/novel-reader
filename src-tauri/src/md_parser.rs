use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use pulldown_cmark::{Parser, Options, Event, Tag, TagEnd};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MdChapter {
    pub chapter_number: usize,
    pub title: String,
    pub level: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MdParseResult {
    pub html_content: String,
    pub chapters: Vec<MdChapter>,
    pub title: String,
    pub total_chars: usize,
}

pub fn parse_md_file(file_path: &str) -> Result<MdParseResult, String> {
    let path = Path::new(file_path);
    if !path.exists() {
        return Err(format!("文件不存在: {}", file_path));
    }

    let raw_bytes = fs::read(path)
        .map_err(|e| format!("无法读取文件 {}: {}", file_path, e))?;

    let (text, _encoding) = decode_md_bytes(&raw_bytes);

    let title = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "未知文档".to_string());

    let chapters = extract_md_chapters(&text);

    let mut html_output = String::new();
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);

    let parser = Parser::new_ext(&text, options);
    pulldown_cmark::html::push_html(&mut html_output, parser);

    let total_chars = text.chars().count();

    Ok(MdParseResult {
        html_content: html_output,
        chapters,
        title,
        total_chars,
    })
}

fn decode_md_bytes(raw: &[u8]) -> (String, String) {
    if raw.starts_with(&[0xEF, 0xBB, 0xBF]) {
        return (String::from_utf8_lossy(raw).to_string(), "UTF-8-BOM".to_string());
    }

    if let Ok(text) = String::from_utf8(raw.to_vec()) {
        return (text, "UTF-8".to_string());
    }

    let mut detector = chardetng::EncodingDetector::new();
    detector.feed(raw, true);
    let enc = detector.guess(None, true);

    let (decoded, _, _) = enc.decode(raw);
    (decoded.to_string(), enc.name().to_string())
}

fn extract_md_chapters(text: &str) -> Vec<MdChapter> {
    let mut chapters = Vec::new();
    let mut chapter_number = 0;

    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);

    let parser = Parser::new_ext(text, options);
    let mut current_level: Option<usize> = None;
    let mut current_title = String::new();

    for event in parser {
        match event {
            Event::Start(Tag::Heading { level, .. }) => {
                current_level = Some(level as usize);
                current_title.clear();
            }
            Event::Text(t) => {
                if current_level.is_some() {
                    current_title.push_str(&t);
                }
            }
            Event::End(TagEnd::Heading(_)) => {
                if let Some(level) = current_level.take() {
                    chapter_number += 1;
                    chapters.push(MdChapter {
                        chapter_number,
                        title: current_title.trim().to_string(),
                        level,
                    });
                }
                current_title.clear();
            }
            _ => {}
        }
    }

    chapters
}

pub fn parse_md_to_html(text: &str) -> String {
    let mut html_output = String::new();
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);

    let parser = Parser::new_ext(text, options);
    pulldown_cmark::html::push_html(&mut html_output, parser);

    html_output
}
