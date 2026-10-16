//! Turning the model's streamed JSON into cleaned ledger entries.

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const FIELDS: [&str; 4] = ["date", "item", "quantity", "amount"];
const MAX_FIELD_CHARS: usize = 500;

/// One sale read from a ledger page. `uncertain_fields` names the fields the model could not read.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub date: String,
    pub item: String,
    pub quantity: String,
    pub amount: String,
    #[serde(default)]
    pub uncertain_fields: Vec<String>,
}

fn field_text(value: Option<&Value>) -> String {
    let text = match value {
        Some(Value::String(text)) => text.clone(),
        Some(Value::Number(number)) => number.to_string(),
        _ => String::new(),
    };
    text.chars().take(MAX_FIELD_CHARS).collect()
}

/// Cleans one model-produced object. Returns `None` if it is not an object.
pub fn clean_entry(value: &Value) -> Option<Entry> {
    let object = value.as_object()?;
    let uncertain_fields = object
        .get("uncertain_fields")
        .and_then(Value::as_array)
        .map(|names| {
            FIELDS
                .iter()
                .filter(|field| names.iter().any(|name| name.as_str() == Some(**field)))
                .map(|field| field.to_string())
                .collect()
        })
        .unwrap_or_default();
    Some(Entry {
        date: field_text(object.get("date")),
        item: field_text(object.get("item")),
        quantity: field_text(object.get("quantity")),
        amount: field_text(object.get("amount")),
        uncertain_fields,
    })
}

/// Incrementally reads entry objects out of a streamed `{"entries": [ {...}, {...} ]}` document,
/// so each row can be shown as soon as the model finishes writing it.
#[derive(Default)]
pub struct EntryStream {
    buffer: String,
    scanned: usize,
    depth: usize,
    in_string: bool,
    escaped: bool,
    /// Nesting depth of the entries array, set when the first `[` is seen.
    array_depth: Option<usize>,
    entry_start: Option<usize>,
}

impl EntryStream {
    /// Adds streamed text and returns every entry completed by it.
    pub fn push(&mut self, text: &str) -> Vec<Entry> {
        self.buffer.push_str(text);
        let mut entries = Vec::new();
        let bytes = self.buffer.as_bytes();
        while self.scanned < bytes.len() {
            let index = self.scanned;
            let byte = bytes[index];
            self.scanned += 1;
            if self.in_string {
                if self.escaped {
                    self.escaped = false;
                } else if byte == b'\\' {
                    self.escaped = true;
                } else if byte == b'"' {
                    self.in_string = false;
                }
                continue;
            }
            match byte {
                b'"' => self.in_string = true,
                b'[' => {
                    self.depth += 1;
                    if self.array_depth.is_none() {
                        self.array_depth = Some(self.depth);
                    }
                }
                b']' => self.depth = self.depth.saturating_sub(1),
                b'{' => {
                    self.depth += 1;
                    if self.array_depth.is_some_and(|array| self.depth == array + 1) {
                        self.entry_start = Some(index);
                    }
                }
                b'}' => {
                    let closes_entry = self.array_depth.is_some_and(|array| self.depth == array + 1);
                    if closes_entry
                        && let Some(start) = self.entry_start.take()
                        && let Some(entry) = serde_json::from_str::<Value>(&self.buffer[start..=index])
                            .ok()
                            .as_ref()
                            .and_then(clean_entry)
                    {
                        entries.push(entry);
                    }
                    self.depth = self.depth.saturating_sub(1);
                }
                _ => {}
            }
        }
        entries
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn entry(date: &str, item: &str, quantity: &str, amount: &str) -> Entry {
        Entry {
            date: date.into(),
            item: item.into(),
            quantity: quantity.into(),
            amount: amount.into(),
            uncertain_fields: vec![],
        }
    }

    const PAGE: &str = r#"{"entries": [
        {"date": "5/10", "item": "Rice 5kg", "quantity": "1", "amount": "1450", "uncertain_fields": []},
        {"date": "5/10", "item": "Salt", "quantity": "3", "amount": "180", "uncertain_fields": ["amount"]}
    ]}"#;

    #[test]
    fn emits_entries_from_a_complete_document() {
        let mut stream = EntryStream::default();
        let entries = stream.push(PAGE);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0], entry("5/10", "Rice 5kg", "1", "1450"));
        assert_eq!(entries[1].uncertain_fields, vec!["amount"]);
    }

    #[test]
    fn emits_each_entry_as_soon_as_its_closing_brace_arrives() {
        let mut stream = EntryStream::default();
        let mut seen = Vec::new();
        for chunk in PAGE.as_bytes().chunks(7) {
            let produced = stream.push(std::str::from_utf8(chunk).unwrap());
            seen.push(produced.len());
        }
        assert_eq!(seen.iter().sum::<usize>(), 2);
        assert!(seen.iter().all(|count| *count <= 1), "an entry was emitted twice or batched wrongly");
    }

    #[test]
    fn braces_and_quotes_inside_strings_do_not_confuse_the_scanner() {
        let mut stream = EntryStream::default();
        let entries = stream.push(
            r#"{"entries": [{"date": "1/2", "item": "Tea \"loose\" {2 for 1}", "quantity": "1", "amount": "5", "uncertain_fields": []}]}"#,
        );
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].item, r#"Tea "loose" {2 for 1}"#);
    }

    #[test]
    fn a_truncated_entry_is_never_emitted() {
        let mut stream = EntryStream::default();
        let entries = stream.push(r#"{"entries": [{"date": "1/2", "item": "Rice", "quantity": "1", "am"#);
        assert!(entries.is_empty());
    }

    #[test]
    fn a_top_level_array_also_works() {
        let mut stream = EntryStream::default();
        let entries = stream.push(r#"[{"date": "1/2", "item": "Rice", "quantity": "1", "amount": "5"}]"#);
        assert_eq!(entries, vec![entry("1/2", "Rice", "1", "5")]);
    }

    #[test]
    fn an_empty_entries_list_yields_nothing() {
        let mut stream = EntryStream::default();
        assert!(stream.push(r#"{"entries": []}"#).is_empty());
    }

    #[test]
    fn numbers_become_text_and_missing_fields_become_empty() {
        let cleaned = clean_entry(&json!({"date": "1/2", "item": "Rice", "quantity": 2, "amount": null})).unwrap();
        assert_eq!(cleaned.quantity, "2");
        assert_eq!(cleaned.amount, "");
    }

    #[test]
    fn unknown_uncertain_fields_are_dropped_and_long_values_are_cut() {
        let cleaned = clean_entry(&json!({
            "item": "x".repeat(900),
            "uncertain_fields": ["item", "colour", 7]
        }))
        .unwrap();
        assert_eq!(cleaned.uncertain_fields, vec!["item"]);
        assert_eq!(cleaned.item.chars().count(), 500);
    }

    #[test]
    fn non_objects_are_not_entries() {
        assert!(clean_entry(&json!("rice")).is_none());
    }
}
