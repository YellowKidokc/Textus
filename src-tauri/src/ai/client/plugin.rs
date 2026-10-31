//! A plugin's model request (ai.request): the instructions and prompt its
//! manifest names, and nothing the agent would add - no project instructions,
//! library, style profile, memories, skills, document or tools. The cost
//! preview the plugin showed was built from the same manifest.

use super::call;
use crate::ai::catalog;
use crate::ai::route;
use crate::commands::args::Args;
use aicompat::providers::anthropic;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

/// ai_plugin_request's inputs, generated into the bindings to type that call.
#[derive(Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct PluginRequest {
    provider: String,
    model: Option<String>,
    instructions: String,
    prompt: String,
    /// The reply's cap: enforced where the provider's single call takes one
    /// (`enforces_output_limit`), asked for in the prompt elsewhere.
    max_output_tokens: Option<u32>,
    /// For ai_cancel.
    request_id: String,
}

/// Token counts as the provider reported them.
#[derive(Serialize, Clone, Copy)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct PluginUsage {
    input_tokens: u32,
    output_tokens: u32,
    cache_read_input_tokens: u32,
    cache_creation_input_tokens: u32,
}

#[derive(Serialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct PluginReply {
    text: String,
    /// Whether the provider held the reply to max_output_tokens.
    output_limit_enforced: bool,
    /// None where the single call doesn't return usage.
    usage: Option<PluginUsage>,
}

/// Whether `provider`'s single call takes a reply cap and returns usage.
/// Keep in step with ENFORCES_OUTPUT_LIMIT in src/plugins/host/broker-ai.ts.
pub(crate) fn enforces_output_limit(provider: &str) -> bool {
    catalog::find(provider).is_some_and(|entry| entry.dialect == "anthropic-messages")
}

#[tauri::command]
pub async fn ai_plugin_request(
    app: AppHandle,
    request: Args<PluginRequest>,
) -> Result<PluginReply, String> {
    let Args(PluginRequest {
        provider,
        model,
        instructions,
        prompt,
        max_output_tokens,
        request_id,
    }) = request;
    crate::ai::ensure_on(&app)?;
    crate::ai::cancel::cancellable(request_id, async {
        if enforces_output_limit(&provider) {
            let auth = route::resolve_anthropic_auth(&app).await?;
            let (text, usage) = anthropic::call_completion_capped(
                &auth,
                instructions,
                prompt,
                model.as_deref(),
                max_output_tokens,
            )
            .await?;
            let count = |n: u64| u32::try_from(n).unwrap_or(u32::MAX);
            return Ok(PluginReply {
                text,
                output_limit_enforced: max_output_tokens.is_some(),
                usage: Some(PluginUsage {
                    input_tokens: count(usage.input_tokens),
                    output_tokens: count(usage.output_tokens),
                    cache_read_input_tokens: count(usage.cache_read_input_tokens),
                    cache_creation_input_tokens: count(usage.cache_creation_input_tokens),
                }),
            });
        }
        let text = call(&app, &provider, instructions, prompt, model.as_deref()).await?;
        Ok(PluginReply {
            text,
            output_limit_enforced: false,
            usage: None,
        })
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::enforces_output_limit;

    #[test]
    fn only_the_messages_api_enforces_a_reply_cap() {
        assert!(enforces_output_limit("anthropic"));
        assert!(!enforces_output_limit("openai"));
        assert!(!enforces_output_limit("custom"));
        assert!(!enforces_output_limit("no-such-provider"));
    }
}
