use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct Criterion {
    pub(crate) name: String,
    pub(crate) instruction: String,
}

/// Keep in step with ai/paragraph-scores.ts and platform/ipc.ts.
#[derive(Deserialize)]
pub struct ScoreRequest {
    pub(crate) provider: String,
    pub(crate) model: Option<String>,
    pub(crate) paragraph: String,
    pub(crate) criteria: Vec<Criterion>,
}

#[derive(Serialize, Deserialize)]
pub struct ParagraphScore {
    pub(crate) name: String,
    score: Option<f64>,
    reason: String,
}

pub(crate) fn validate(request: &ScoreRequest) -> Result<(), String> {
    if request.paragraph.trim().is_empty() || request.paragraph.len() > 100_000 {
        return Err("paragraph must contain 1–100000 bytes".into());
    }
    if request.criteria.is_empty() || request.criteria.len() > 20 {
        return Err("choose 1–20 criteria".into());
    }
    let mut names = std::collections::HashSet::new();
    for c in &request.criteria {
        if c.name.trim().is_empty()
            || c.name.chars().count() > 80
            || c.instruction.trim().is_empty()
            || c.instruction.chars().count() > 2000
            || !names.insert(c.name.trim())
        {
            return Err("criteria need unique names and nonempty instructions".into());
        }
    }
    Ok(())
}

pub(crate) fn parse(raw: &str, criteria: &[Criterion]) -> Result<Vec<ParagraphScore>, String> {
    let raw = raw
        .trim()
        .strip_prefix("```json")
        .or_else(|| raw.trim().strip_prefix("```"))
        .unwrap_or(raw.trim())
        .trim()
        .trim_end_matches("```")
        .trim();
    let scores: Vec<ParagraphScore> = serde_json::from_str(raw).map_err(|e| e.to_string())?;
    if scores.len() != criteria.len()
        || scores.iter().zip(criteria).any(|(s, c)| {
            s.name != c.name
                || s.reason.trim().is_empty()
                || s.score
                    .is_some_and(|n| !n.is_finite() || !(0.0..=100.0).contains(&n))
        })
    {
        return Err("provider returned invalid paragraph scores".into());
    }
    Ok(scores)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bounds_requests_and_rejects_duplicate_criteria() {
        let mut request = ScoreRequest {
            provider: "openai".into(),
            model: None,
            paragraph: "A paragraph.".into(),
            criteria: (0..20)
                .map(|i| Criterion {
                    name: format!("Criterion {i}"),
                    instruction: "Evaluate the prose".into(),
                })
                .collect(),
        };
        assert!(validate(&request).is_ok());
        request.criteria.push(Criterion {
            name: "Extra".into(),
            instruction: "Check".into(),
        });
        assert!(validate(&request).is_err());
        request.criteria.pop();
        request.criteria[1].name = request.criteria[0].name.clone();
        assert!(validate(&request).is_err());
        request.criteria.truncate(1);
        request.paragraph.clear();
        assert!(validate(&request).is_err());
    }
    #[test]
    fn rejects_missing_extra_and_out_of_range_results() {
        let criteria = vec![Criterion {
            name: "Clarity".into(),
            instruction: "Clear prose".into(),
        }];
        assert!(parse("[]", &criteria).is_err());
        assert!(parse(
            r#"[{"name":"Clarity","score":101,"reason":"x"}]"#,
            &criteria
        )
        .is_err());
        assert!(parse(r#"[{"name":"Other","score":50,"reason":"x"}]"#, &criteria).is_err());
        assert!(parse(
            r#"[{"name":"Clarity","score":null,"reason":"No evidence"}]"#,
            &criteria
        )
        .is_ok());
    }
}
