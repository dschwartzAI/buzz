use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, State};

use crate::{
    app_state::AppState,
    managed_agents::{
        build_managed_agent_summary, load_managed_agents, load_personas, provider_update_auth,
        resolve_provider_binary, save_managed_agents, BackendKind, ManagedAgentRecord,
        ManagedAgentSummary,
    },
};

const MIN_TTL_SECONDS: u64 = 5 * 60;
const MAX_TTL_SECONDS: u64 = 31 * 24 * 60 * 60;

#[derive(Clone)]
struct ProviderTarget {
    provider_id: String,
    provider_config: serde_json::Value,
    backend_agent_id: String,
    pubkey: String,
    prior_auth_tag: Option<String>,
}

fn now_unix() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .map_err(|error| format!("system clock is before Unix epoch: {error}"))
}

fn provider_target(record: &ManagedAgentRecord) -> Result<ProviderTarget, String> {
    let BackendKind::Provider { id, config } = &record.backend else {
        return Err("owner attestation lifecycle is available only for provider agents".into());
    };
    let backend_agent_id = record
        .backend_agent_id
        .clone()
        .ok_or_else(|| "provider agent has no deployed backend_agent_id".to_string())?;
    Ok(ProviderTarget {
        provider_id: id.clone(),
        provider_config: config.clone(),
        backend_agent_id,
        pubkey: record.pubkey.clone(),
        prior_auth_tag: record.auth_tag.clone(),
    })
}

fn mint_bounded_auth_tag(
    state: &AppState,
    agent_pubkey: &str,
    ttl_seconds: u64,
) -> Result<String, String> {
    if !(MIN_TTL_SECONDS..=MAX_TTL_SECONDS).contains(&ttl_seconds) {
        return Err(format!(
            "attestation lifetime must be between {MIN_TTL_SECONDS} and {MAX_TTL_SECONDS} seconds"
        ));
    }
    let expires_at = now_unix()?
        .checked_add(ttl_seconds)
        .ok_or_else(|| "attestation expiry overflow".to_string())?;
    let owner_keys = state.signing_keys()?;
    let compat_owner = nostr::Keys::parse(&owner_keys.secret_key().to_secret_hex())
        .map_err(|error| format!("failed to bridge owner keys: {error}"))?;
    let compat_agent = nostr::PublicKey::from_hex(agent_pubkey)
        .map_err(|error| format!("invalid managed agent pubkey: {error}"))?;
    buzz_sdk_pkg::nip_oa::compute_auth_tag(
        &compat_owner,
        &compat_agent,
        &format!("created_at<{expires_at}"),
    )
    .map_err(|error| format!("failed to compute owner attestation: {error}"))
}

fn invoke_provider_update(target: &ProviderTarget, auth_tag: Option<String>) -> Result<(), String> {
    let binary = resolve_provider_binary(&target.provider_id)?;
    provider_update_auth(
        &binary,
        &target.backend_agent_id,
        &target.pubkey,
        auth_tag.as_deref(),
        &target.provider_config,
    )
    .map(|_| ())
}

async fn update_owner_attestation(
    pubkey: String,
    auth_tag: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<ManagedAgentSummary, String> {
    let target = {
        let _store_guard = state
            .managed_agents_store_lock
            .lock()
            .map_err(|error| error.to_string())?;
        let records = load_managed_agents(&app)?;
        let record = records
            .iter()
            .find(|record| record.pubkey == pubkey)
            .ok_or_else(|| format!("agent {pubkey} not found"))?;
        provider_target(record)?
    };

    let provider_request_target = target.clone();
    let provider_auth_tag = auth_tag.clone();
    tokio::task::spawn_blocking(move || {
        invoke_provider_update(&provider_request_target, provider_auth_tag)
    })
    .await
    .map_err(|error| format!("provider auth_update task failed: {error}"))??;

    let save_result = (|| -> Result<ManagedAgentSummary, String> {
        let _store_guard = state
            .managed_agents_store_lock
            .lock()
            .map_err(|error| error.to_string())?;
        let mut records = load_managed_agents(&app)?;
        let record = records
            .iter_mut()
            .find(|record| record.pubkey == pubkey)
            .ok_or_else(|| format!("agent {pubkey} disappeared during auth_update"))?;
        let current_target = provider_target(record)?;
        if current_target.provider_id != target.provider_id
            || current_target.backend_agent_id != target.backend_agent_id
        {
            return Err("provider identity changed during auth_update".to_string());
        }
        record.auth_tag = auth_tag;
        record.updated_at = crate::util::now_iso();
        record.last_error = None;
        save_managed_agents(&app, &records)?;
        let runtimes = state
            .managed_agent_processes
            .lock()
            .map_err(|error| error.to_string())?;
        let personas = load_personas(&app).unwrap_or_default();
        let record = records
            .iter()
            .find(|record| record.pubkey == pubkey)
            .ok_or_else(|| format!("agent {pubkey} disappeared after auth_update"))?;
        build_managed_agent_summary(
            &app,
            record,
            &runtimes,
            &personas,
            &crate::managed_agents::load_global_agent_config(&app).unwrap_or_default(),
        )
    })();

    match save_result {
        Ok(summary) => Ok(summary),
        Err(save_error) => {
            let rollback_target = target.clone();
            let rollback_tag = target.prior_auth_tag.clone();
            let rollback = tokio::task::spawn_blocking(move || {
                invoke_provider_update(&rollback_target, rollback_tag)
            })
            .await
            .map_err(|error| format!("provider rollback task failed: {error}"))
            .and_then(|result| result);
            match rollback {
                Ok(()) => Err(format!(
                    "could not save owner attestation; provider was rolled back: {save_error}"
                )),
                Err(rollback_error) => Err(format!(
                    "could not save owner attestation and provider rollback failed: {save_error}; {rollback_error}"
                )),
            }
        }
    }
}

#[tauri::command]
pub async fn attest_managed_agent_owner(
    pubkey: String,
    ttl_seconds: u64,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<ManagedAgentSummary, String> {
    let auth_tag = mint_bounded_auth_tag(&state, &pubkey, ttl_seconds)?;
    update_owner_attestation(pubkey, Some(auth_tag), app, state).await
}

#[tauri::command]
pub async fn revoke_managed_agent_owner_attestation(
    pubkey: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<ManagedAgentSummary, String> {
    update_owner_attestation(pubkey, None, app, state).await
}
