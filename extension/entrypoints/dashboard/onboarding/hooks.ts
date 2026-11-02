import type { Preferences, Profile } from "@job-copilot/shared";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { getDb } from "@/lib/db/db";
import { sendMessage } from "@/lib/messaging/client";
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
