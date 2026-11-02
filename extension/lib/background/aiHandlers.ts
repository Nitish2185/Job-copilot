/** Background handlers for AI messages. Keys are read from local storage, never sent in messages. */
import { createChatClient, providerNeedsKey, type ProviderConfig } from "../ai/providers";
import { runTask } from "../ai/runner";
import { buildRuntime, getScheduler } from "../ai/runtime";
import { describeProjectTask } from "../ai/tasks/describeProject";
import { extractProfileTask } from "../ai/tasks/extractProfile";
import type { Handlers } from "../messaging/server";
import { loadSecrets, loadSettings } from "../settings/settings";

export const aiHandlers: Handlers = {
  "ai/status": async () => {
    const [settings, secrets] = await Promise.all([loadSettings(), loadSecrets()]);
    const usage = await getScheduler(settings.ai).status();
    const { resumesAt, date: _date, ...counts } = usage;
    return {
      configured:
        !providerNeedsKey(settings.ai.provider) || Boolean(secrets.aiKeys[settings.ai.provider]),
      provider: settings.ai.provider,
      model: settings.ai.model,
      usage: { ...counts, ...(resumesAt && { resumesAt: resumesAt.toISOString() }) },
    };
  },

  "ai/test": async ({ provider, baseUrl, model }) => {
    const [settings, secrets] = await Promise.all([loadSettings(), loadSecrets()]);
    const key = secrets.aiKeys[provider];
    if (providerNeedsKey(provider) && !key) return { ok: false, error: "Add an API key first." };
    const config: ProviderConfig = { provider, baseUrl, model };
    try {
      // One tiny request, counted against the daily budget like any other.
      await getScheduler(settings.ai).run("user", () =>
        createChatClient(config, key).complete({
          model,
          messages: [{ role: "user", content: 'Reply with this JSON: {"ok": true}' }],
        }),
      );
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  },

  "ai/listModels": async ({ provider, baseUrl }) => {
    const secrets = await loadSecrets();
    const client = createChatClient({ provider, baseUrl, model: "" }, secrets.aiKeys[provider]);
    return { models: await client.listModels() };
  },

  "ai/extractProfile": async ({ resumeText, fullName }) => {
    const rt = await buildRuntime();
    // During onboarding no profile is saved yet, so the confirmed name comes with the request.
    const identity = fullName?.trim() ? { ...rt.identity, fullName: fullName.trim() } : rt.identity;
    const result = await runTask({ ...rt, identity }, extractProfileTask, { resumeText });
    return { draft: result.value, model: result.model };
  },

  "ai/describeProject": async (input) => {
    const result = await runTask(await buildRuntime(), describeProjectTask, input);
    return result.value;
  },
};
