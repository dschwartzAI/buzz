import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { managedAgentsQueryKey } from "@/features/agents/hooks";
import {
  attestManagedAgentOwner,
  revokeManagedAgentOwnerAttestation,
} from "@/shared/api/tauriManagedAgents";
import type { ManagedAgent } from "@/shared/api/types";

export function useOwnerAttestationActions(
  managedAgent: ManagedAgent | undefined,
) {
  const queryClient = useQueryClient();
  const attestMutation = useMutation({
    mutationFn: ({
      pubkey,
      ttlSeconds,
    }: {
      pubkey: string;
      ttlSeconds: number;
    }) => attestManagedAgentOwner(pubkey, ttlSeconds),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: managedAgentsQueryKey });
    },
  });
  const revokeMutation = useMutation({
    mutationFn: (pubkey: string) => revokeManagedAgentOwnerAttestation(pubkey),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: managedAgentsQueryKey });
    },
  });

  const onAttestOwner = React.useCallback(
    async (ttlSeconds: number) => {
      if (managedAgent?.backend.type !== "provider") return false;
      try {
        const updated = await attestMutation.mutateAsync({
          pubkey: managedAgent.pubkey,
          ttlSeconds,
        });
        const fingerprint =
          updated.ownerAttestation.fingerprint ?? "unavailable";
        toast.success(
          `Authorized ${updated.name}; credential fingerprint ${fingerprint}.`,
        );
        return true;
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to authorize owner actions.",
        );
        return false;
      }
    },
    [attestMutation.mutateAsync, managedAgent],
  );

  const onRevokeOwnerAttestation = React.useCallback(async () => {
    if (managedAgent?.backend.type !== "provider") return false;
    try {
      const updated = await revokeMutation.mutateAsync(managedAgent.pubkey);
      toast.success(`Revoked owner authorization for ${updated.name}.`);
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to revoke owner authorization.",
      );
      return false;
    }
  }, [managedAgent, revokeMutation.mutateAsync]);

  return {
    isPending: attestMutation.isPending || revokeMutation.isPending,
    onAttestOwner,
    onRevokeOwnerAttestation,
  };
}
