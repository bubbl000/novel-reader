use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub page_number: usize,
    pub snippet: String,
    pub match_start: usize,
    pub match_end: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResults {
    pub results: Vec<SearchResult>,
    pub total_matches: usize,
}

pub fn search_in_pdf_text(
    pages: &[(usize, String)],
    query: &str,
    max_results: usize,
) -> SearchResults {
    let query_lower = query.to_lowercase();
    let mut results = Vec::new();
    let mut total_matches = 0;

    for (page_num, text) in pages {
        let text_lower = text.to_lowercase();
        let mut start = 0;

        while let Some(pos) = text_lower[start..].find(&query_lower) {
            let abs_pos = start + pos;
            total_matches += 1;

            if results.len() < max_results {
                let snippet_start = abs_pos.saturating_sub(40);
                let snippet_end = (abs_pos + query.len() + 40).min(text.len());
                let snippet = format!(
                    "...{}...",
                    &text[snippet_start..snippet_end]
                );

                results.push(SearchResult {
                    page_number: *page_num,
                    snippet,
                    match_start: abs_pos,
                    match_end: abs_pos + query.len(),
                });
            }

            start = abs_pos + 1;

            if start >= text.len() {
                break;
            }
        }
    }

    SearchResults {
        results,
        total_matches,
    }
}

pub fn search_in_text(text: &str, query: &str, max_results: usize) -> SearchResults {
    let query_lower = query.to_lowercase();
    let text_lower = text.to_lowercase();
    let mut results = Vec::new();
    let mut total_matches = 0;
    let mut start = 0;

    while let Some(pos) = text_lower[start..].find(&query_lower) {
        let abs_pos = start + pos;
        total_matches += 1;

        if results.len() < max_results {
            let snippet_start = abs_pos.saturating_sub(40);
            let snippet_end = (abs_pos + query.len() + 40).min(text.len());
            let snippet = format!(
                "...{}...",
                &text[snippet_start..snippet_end]
            );

            results.push(SearchResult {
                page_number: 0,
                snippet,
                match_start: abs_pos,
                match_end: abs_pos + query.len(),
            });
        }

        start = abs_pos + 1;

        if start >= text.len() {
            break;
        }
    }

    SearchResults {
        results,
        total_matches,
    }
}
