use serde_json::Value;
use std::path::Path;
use std::sync::Mutex;

static JOURNAL: Mutex<()> = Mutex::new(());

fn read(path: &Path) -> Result<Vec<Value>, String> {
    match std::fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|e| e.to_string()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(vec![]),
        Err(e) => Err(e.to_string()),
    }
}

pub(crate) fn list(path: &Path) -> Result<Vec<Value>, String> {
    let _guard = JOURNAL.lock().map_err(|e| e.to_string())?;
    read(path)
}

pub(crate) fn append(path: &Path, event: Value) -> Result<(), String> {
    let _guard = JOURNAL.lock().map_err(|e| e.to_string())?;
    let valid = ["id", "group", "document", "time", "type"]
        .iter()
        .all(|key| {
            event
                .get(key)
                .and_then(Value::as_str)
                .is_some_and(|v| !v.is_empty())
        });
    let kind = event.get("type").and_then(Value::as_str).unwrap_or("");
    if !valid
        || ![
            "request", "response", "decision", "applied", "error", "undo", "redo",
        ]
        .contains(&kind)
        || serde_json::to_vec(&event).map_err(|e| e.to_string())?.len() > 1_000_000
    {
        return Err("invalid rewrite journal event".into());
    }
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let mut events = read(path)?;
    if events.iter().any(|e| e.get("id") == event.get("id")) {
        return Ok(());
    }
    events.push(event);
    crate::atomic::write_secret_sync(
        path,
        serde_json::to_vec(&events).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn path() -> std::path::PathBuf {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "textus-rewrite-test-{}-{stamp}.json",
            std::process::id()
        ))
    }
    #[test]
    fn concurrent_events_are_retained_and_retries_are_idempotent() {
        let path = path();
        let threads = (0..30)
            .map(|i| {
                let path = path.clone();
                std::thread::spawn(move || {
                    append(
                        &path,
                        json!({"id": i.to_string(), "document":"d", "group":"g", "time":"2026-11-02T00:00:00Z", "type":"response", "text":format!("Version {i}")}),
                    )
                    .unwrap()
                })
            })
            .collect::<Vec<_>>();
        for thread in threads {
            thread.join().unwrap();
        }
        append(&path, json!({"id":"0", "document":"d", "group":"g", "time":"2026-11-02T00:00:00Z", "type":"response"})).unwrap();
        assert_eq!(list(&path).unwrap().len(), 30);
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn corrupted_history_is_never_overwritten() {
        let path = path();
        std::fs::write(&path, b"corrupt").unwrap();
        assert!(append(&path, json!({"id":"x", "document":"d", "group":"g", "time":"2026-11-02T00:00:00Z", "type":"response"})).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"corrupt");
        std::fs::remove_file(path).unwrap();
    }
}
