import { loadSecrets, loadSettings } from "../settings/settings";
import { providerNeedsKey } from "./providers";

/** True when the chosen AI provider can be called (it has a key, or needs none). */
export async function isAiConfigured(): Promise<boolean> {
  const [settings, secrets] = await Promise.all([loadSettings(), loadSecrets()]);
  return !providerNeedsKey(settings.ai.provider) || Boolean(secrets.aiKeys[settings.ai.provider]);
}
