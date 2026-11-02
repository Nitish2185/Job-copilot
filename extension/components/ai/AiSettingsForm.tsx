import {
  AI_PROVIDER_IDS,
  AI_PROVIDERS,
  DEFAULT_GEMINI_MODEL,
  SUGGESTED_GEMINI_MODELS,
  type AiProviderId,
} from "@job-copilot/shared";
import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { ErrorMessage } from "@/components/ui/States";
import { hostPattern } from "@/lib/ai/hostPattern";
import { sendMessage } from "@/lib/messaging/client";
import { loadSecrets, loadSettings, saveAiProvider, updateSecrets } from "@/lib/settings/settings";

interface ProviderDraft {
  provider: AiProviderId;
  baseUrl: string;
  model: string;
  key: string;
  hasSavedKey: boolean;
}

function defaultsFor(provider: AiProviderId): Pick<ProviderDraft, "baseUrl" | "model"> {
  return {
    baseUrl: AI_PROVIDERS[provider].baseUrl,
    model: provider === "gemini" ? DEFAULT_GEMINI_MODEL : "",
  };
}

/**
 * Asks for access to the providers' sites in one prompt. Must be the first await in a
 * click handler: Firefox only shows the prompt during the user's click.
 */
async function ensureHostPermission(baseUrls: string[]): Promise<string | null> {
  const origins = baseUrls.map(hostPattern);
  if (origins.some((o) => o === null))
    return "Enter the provider's address, such as https://example.com/v1.";
  try {
    const granted = await browser.permissions.request({ origins: origins as string[] });
    return granted ? null : "Permission to reach this provider was not granted.";
  } catch {
    return "This browser did not allow access to that address.";
  }
}

function ProviderFields({
  idPrefix,
  draft,
  onChange,
  models,
}: {
  idPrefix: string;
  draft: ProviderDraft;
  onChange: (next: ProviderDraft) => void;
  models: string[];
}) {
  const info = AI_PROVIDERS[draft.provider];
  const suggestions = draft.provider === "gemini" ? [...SUGGESTED_GEMINI_MODELS] : [];
  const options = [...new Set([...suggestions, ...models])];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field id={`${idPrefix}-provider`} label="Provider">
        <select
          id={`${idPrefix}-provider`}
          className={inputClass}
          value={draft.provider}
          onChange={(e) => {
            const provider = e.target.value as AiProviderId;
            onChange({ ...draft, provider, ...defaultsFor(provider), key: "", hasSavedKey: false });
          }}
        >
          {AI_PROVIDER_IDS.map((p) => (
            <option key={p} value={p}>
              {AI_PROVIDERS[p].label}
            </option>
          ))}
        </select>
      </Field>
      <Field
        id={`${idPrefix}-key`}
        label={info.needsKey ? "API key" : "API key (not needed)"}
        hint={
          draft.hasSavedKey
            ? "A key is saved on this device. Type a new one to replace it."
            : undefined
        }
      >
        <input
          id={`${idPrefix}-key`}
          type="password"
          autoComplete="off"
          className={inputClass}
          value={draft.key}
          placeholder={draft.hasSavedKey ? "••••••••" : ""}
          onChange={(e) => {
            onChange({ ...draft, key: e.target.value });
          }}
        />
      </Field>
      {(draft.provider === "custom" || draft.provider === "ollama") && (
        <Field id={`${idPrefix}-base`} label="Address (OpenAI-compatible)">
          <input
            id={`${idPrefix}-base`}
            className={inputClass}
            value={draft.baseUrl}
            onChange={(e) => {
              onChange({ ...draft, baseUrl: e.target.value });
            }}
          />
        </Field>
      )}
      <Field id={`${idPrefix}-model`} label="Model">
        <input
          id={`${idPrefix}-model`}
          list={`${idPrefix}-models`}
          className={inputClass}
          value={draft.model}
          onChange={(e) => {
            onChange({ ...draft, model: e.target.value });
          }}
        />
        <datalist id={`${idPrefix}-models`}>
          {options.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </Field>
    </div>
  );
}

/** AI provider setup (onboarding step 2 and Settings). Keys stay on this device. */
export function AiSettingsForm({ onSaved }: { onSaved?: (ok: boolean) => void }) {
  const [main, setMain] = useState<ProviderDraft>({
    provider: "gemini",
    ...defaultsFor("gemini"),
    key: "",
    hasSavedKey: false,
  });
  const [fallbackOn, setFallbackOn] = useState(false);
  const [fallback, setFallback] = useState<ProviderDraft>({
    provider: "groq",
    ...defaultsFor("groq"),
    key: "",
    hasSavedKey: false,
  });
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string }>();

  useEffect(() => {
    void Promise.all([loadSettings(), loadSecrets()]).then(([settings, secrets]) => {
      const ai = settings.ai;
      setMain({
        provider: ai.provider,
        baseUrl: ai.baseUrl,
        model: ai.model,
        key: "",
        hasSavedKey: Boolean(secrets.aiKeys[ai.provider]),
      });
      if (ai.fallback) {
        setFallbackOn(true);
        setFallback({
          ...ai.fallback,
          key: "",
          hasSavedKey: Boolean(secrets.aiKeys[ai.fallback.provider]),
        });
      }
    });
  }, []);

  const loadModels = async () => {
    setResult(undefined);
    const denied = await ensureHostPermission([main.baseUrl]);
    if (denied) {
      setResult({ ok: false, text: denied });
      return;
    }
    try {
      if (main.key)
        await updateSecrets({
          aiKeys: { ...(await loadSecrets()).aiKeys, [main.provider]: main.key.trim() },
        });
      const list = await sendMessage("ai/listModels", {
        provider: main.provider,
        baseUrl: main.baseUrl,
      });
      setModels(list.models);
      setResult({ ok: true, text: `${String(list.models.length)} models available.` });
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : "Could not load models." });
    }
  };

  const saveAndTest = async () => {
    setBusy(true);
    setResult(undefined);
    try {
      const denied = await ensureHostPermission(
        fallbackOn ? [main.baseUrl, fallback.baseUrl] : [main.baseUrl],
      );
      if (denied) throw new Error(denied);
      if (fallbackOn && !fallback.model.trim())
        throw new Error("Choose a model for the second provider.");
      const keys = { ...(await loadSecrets()).aiKeys };
      if (main.key) keys[main.provider] = main.key.trim();
      if (fallbackOn && fallback.key) keys[fallback.provider] = fallback.key.trim();
      await updateSecrets({ aiKeys: keys });
      await saveAiProvider({
        provider: main.provider,
        baseUrl: main.baseUrl,
        model: main.model.trim(),
        ...(fallbackOn && {
          fallback: {
            provider: fallback.provider,
            baseUrl: fallback.baseUrl,
            model: fallback.model.trim(),
          },
        }),
      });
      setMain({ ...main, key: "", hasSavedKey: Boolean(keys[main.provider]) });
      const test = await sendMessage("ai/test", {
        provider: main.provider,
        baseUrl: main.baseUrl,
        model: main.model.trim(),
      });
      setResult(
        test.ok
          ? { ok: true, text: "Saved. The AI provider answered." }
          : { ok: false, text: `Saved, but the test failed: ${test.error ?? "unknown error"}` },
      );
      onSaved?.(test.ok);
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  };

  const keyUrl = AI_PROVIDERS[main.provider].keyUrl;
  return (
    <div className="space-y-4">
      {main.provider === "gemini" && keyUrl && (
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-400">
          <li>
            Open{" "}
            <a
              href={keyUrl}
              target="_blank"
              rel="noreferrer"
              className="text-blue-700 underline dark:text-blue-400"
            >
              Google AI Studio
            </a>{" "}
            and sign in with a Google account.
          </li>
          <li>Create an API key (the free tier is enough).</li>
          <li>Paste it below and press “Save and test”.</li>
        </ol>
      )}
      <ProviderFields idPrefix="ai-main" draft={main} onChange={setMain} models={models} />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={fallbackOn}
          onChange={(e) => {
            setFallbackOn(e.target.checked);
          }}
        />
        Use a second provider when this one is rate-limited
      </label>
      {fallbackOn && (
        <ProviderFields
          idPrefix="ai-fallback"
          draft={fallback}
          onChange={setFallback}
          models={[]}
        />
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          onClick={() => void saveAndTest()}
          disabled={busy || !main.model.trim()}
        >
          {busy ? "Testing..." : "Save and test"}
        </Button>
        <Button onClick={() => void loadModels()}>Load model list</Button>
      </div>
      {result &&
        (result.ok ? (
          <p role="status" className="text-sm text-green-700 dark:text-green-400">
            {result.text}
          </p>
        ) : (
          <ErrorMessage>{result.text}</ErrorMessage>
        ))}
    </div>
  );
}
