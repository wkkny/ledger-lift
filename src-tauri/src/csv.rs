//! CSV text for the entries an owner has reviewed.

use crate::entries::Entry;

const HEADER: [&str; 4] = ["Date", "Item or description", "Quantity", "Amount"];

fn quote(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

fn line<'a>(values: impl IntoIterator<Item = &'a str>) -> String {
    values.into_iter().map(quote).collect::<Vec<_>>().join(",")
}

/// Every value is quoted, lines end in CRLF, and a byte-order mark lets Excel read accents correctly.
pub fn to_csv(entries: &[Entry]) -> String {
    let mut lines = vec![line(HEADER)];
    lines.extend(
        entries
            .iter()
            .map(|entry| line([entry.date.as_str(), &entry.item, &entry.quantity, &entry.amount])),
    );
    format!("\u{feff}{}", lines.join("\r\n"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(item: &str) -> Entry {
        Entry {
            date: "5/10".into(),
            item: item.into(),
            quantity: "2".into(),
            amount: "100".into(),
            uncertain_fields: vec![],
        }
    }

    #[test]
    fn writes_a_header_and_one_line_per_entry() {
        let csv = to_csv(&[entry("Rice"), entry("Salt")]);
        let lines: Vec<&str> = csv.trim_start_matches('\u{feff}').split("\r\n").collect();
        assert_eq!(lines[0], r#""Date","Item or description","Quantity","Amount""#);
        assert_eq!(lines[1], r#""5/10","Rice","2","100""#);
        assert_eq!(lines.len(), 3);
    }

    #[test]
    fn starts_with_a_byte_order_mark() {
        assert!(to_csv(&[]).starts_with('\u{feff}'));
    }

    #[test]
    fn quotes_commas_and_doubles_embedded_quotes() {
        let csv = to_csv(&[entry(r#"Oil, "extra" virgin"#)]);
        assert!(csv.contains(r#""Oil, ""extra"" virgin""#));
    }

    #[test]
    fn keeps_line_breaks_inside_a_value_quoted() {
        let csv = to_csv(&[entry("Rice\nbag")]);
        assert!(csv.contains("\"Rice\nbag\""));
    }
}
