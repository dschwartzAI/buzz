use tauri::State;

use crate::{
    app_state::AppState,
    relay::{query_relay, submit_event_with_keys},
};

/// Resolve a message-level action assigned to the signed-in desktop user.
///
/// The request is re-fetched before publishing so callers cannot resolve an
/// action assigned to another pubkey or substitute a request from a different
/// channel.
#[tauri::command]
pub async fn resolve_message_action(
    channel_id: String,
    request_event_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let channel_uuid = uuid::Uuid::parse_str(&channel_id)
        .map_err(|_| format!("invalid channel UUID: {channel_id}"))?;
    let request_id = nostr::EventId::from_hex(&request_event_id)
        .map_err(|error| format!("invalid action request event ID: {error}"))?;

    let requests = query_relay(
        &state,
        &[serde_json::json!({
            "ids": [request_id.to_hex()],
            "kinds": [buzz_core_pkg::kind::KIND_MESSAGE_ACTION_REQUEST],
            "limit": 1,
        })],
    )
    .await?;
    let request = requests
        .first()
        .ok_or_else(|| format!("action request {request_event_id} not found"))?;

    let keys = state
        .keys
        .lock()
        .map_err(|error| error.to_string())?
        .clone();
    let my_pubkey = keys.public_key().to_hex();
    let assigned_to_me = request.tags.iter().any(|tag| {
        let values = tag.as_slice();
        values.first().map(String::as_str) == Some("p")
            && values
                .get(1)
                .is_some_and(|pubkey| pubkey.eq_ignore_ascii_case(&my_pubkey))
    });
    if !assigned_to_me {
        return Err("only the assigned recipient can resolve this action".to_string());
    }

    let request_channel_matches = request.tags.iter().any(|tag| {
        let values = tag.as_slice();
        values.first().map(String::as_str) == Some("h")
            && values.get(1).map(String::as_str) == Some(channel_id.as_str())
    });
    if !request_channel_matches {
        return Err("channel does not match the action request".to_string());
    }

    let builder =
        buzz_sdk_pkg::build_message_action_resolution(channel_uuid, &request_event_id, "Resolved")
            .map_err(|error| format!("failed to build action resolution: {error}"))?;
    submit_event_with_keys(builder, &state, &keys, None).await?;
    Ok(())
}
