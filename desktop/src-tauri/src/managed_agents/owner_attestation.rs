use sha2::{Digest, Sha256};

use super::{ManagedAgentOwnerAttestation, ManagedAgentRecord};

pub(crate) fn owner_attestation_summary(
    record: &ManagedAgentRecord,
) -> ManagedAgentOwnerAttestation {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    summarize_auth_tag(&record.pubkey, record.auth_tag.as_deref(), now)
}

fn summarize_auth_tag(
    agent_pubkey: &str,
    auth_tag: Option<&str>,
    now: u64,
) -> ManagedAgentOwnerAttestation {
    let Some(auth_tag) = auth_tag.map(str::trim).filter(|value| !value.is_empty()) else {
        return ManagedAgentOwnerAttestation {
            state: "missing".to_string(),
            owner_pubkey: None,
            conditions: None,
            expires_at: None,
            fingerprint: None,
        };
    };
    let fingerprint = hex::encode(Sha256::digest(auth_tag.as_bytes()))
        .chars()
        .take(12)
        .collect::<String>();
    let Ok(agent_pubkey) = nostr::PublicKey::from_hex(agent_pubkey) else {
        return ManagedAgentOwnerAttestation {
            state: "invalid".to_string(),
            owner_pubkey: None,
            conditions: None,
            expires_at: None,
            fingerprint: Some(fingerprint),
        };
    };
    let Ok(owner_pubkey) = buzz_sdk_pkg::nip_oa::verify_auth_tag(auth_tag, &agent_pubkey) else {
        return ManagedAgentOwnerAttestation {
            state: "invalid".to_string(),
            owner_pubkey: None,
            conditions: None,
            expires_at: None,
            fingerprint: Some(fingerprint),
        };
    };
    let parts = serde_json::from_str::<Vec<String>>(auth_tag).unwrap_or_default();
    let conditions = parts.get(2).cloned().unwrap_or_default();
    let expires_at = conditions
        .split('&')
        .find_map(|clause| clause.strip_prefix("created_at<"))
        .and_then(|value| value.parse::<u64>().ok());
    ManagedAgentOwnerAttestation {
        state: match expires_at {
            Some(expiry) if expiry <= now => "expired".to_string(),
            Some(_) => "bounded".to_string(),
            None => "unbounded".to_string(),
        },
        owner_pubkey: Some(owner_pubkey.to_hex()),
        conditions: Some(conditions),
        expires_at,
        fingerprint: Some(fingerprint),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_and_malformed_credentials_are_redacted() {
        let missing = summarize_auth_tag(&"a".repeat(64), None, 1_000);
        assert_eq!(missing.state, "missing");
        assert_eq!(missing.fingerprint, None);

        let malformed = summarize_auth_tag(&"a".repeat(64), Some("not-a-tag"), 1_000);
        assert_eq!(malformed.state, "invalid");
        assert!(malformed.fingerprint.is_some());
        assert_eq!(malformed.conditions, None);
    }
}
