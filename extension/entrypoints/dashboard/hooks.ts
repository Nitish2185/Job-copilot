import type { Preferences, Profile } from "@job-copilot/shared";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { getDb } from "@/lib/db/db";
import { sendMessage } from "@/lib/messaging/client";
import type { ScoringQuota } from "@/lib/messaging/protocol";
import { loadPreferences, loadProfile } from "@/lib/profile/store";

/** The saved profile (an empty one before the first save); undefined while loading. */
export function useProfile(): Profile | undefined {
  return useLiveQuery(() => loadProfile(getDb()), []);
}

/** Saved preferences, or defaults for the profile's country; undefined while loading. */
export function usePreferences(country: string | undefined): Preferences | undefined {
  return useLiveQuery(
    () => (country === undefined ? undefined : loadPreferences(getDb(), country)),
    [country],
  );
}

/** Today's AI scoring quota; `refresh` asks again (e.g. after scoring). */
export function useScoringQuota(): { quota: ScoringQuota | undefined; refresh: () => void } {
  const [quota, setQuota] = useState<ScoringQuota>();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    sendMessage("match/quota", {}).then(setQuota, () => {
      setQuota(undefined);
    });
  }, [tick]);
  return {
    quota,
    refresh: () => {
      setTick((t) => t + 1);
    },
  };
}

/** Whether an AI provider is set up (undefined while asking the background). */
export function useAiConfigured(): boolean | undefined {
  const [configured, setConfigured] = useState<boolean>();
  useEffect(() => {
    sendMessage("ai/status", {}).then(
      (status) => {
        setConfigured(status.configured);
      },
      () => {
        setConfigured(false);
      },
    );
  }, []);
  return configured;
}
