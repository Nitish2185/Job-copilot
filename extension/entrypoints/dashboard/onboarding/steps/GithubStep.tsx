import type { Profile, Project } from "@job-copilot/shared";
import { useEffect, useState } from "react";
import { ProfileEditor } from "@/components/profile/ProfileEditor";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { ErrorMessage, Loading } from "@/components/ui/States";
import { skillIdsFor } from "@/lib/ai/skillIds";
import { sendMessage } from "@/lib/messaging/client";
import { loadSecrets, updateSecrets } from "@/lib/settings/settings";
import {
  mergeProjects,
  projectFromRepo,
  tickedByDefault,
  type GithubDeps,
  type GithubRepo,
} from "@/lib/sources/github";
import { listReposCached, repoDetailsCached } from "@/lib/sources/githubCache";
import { StepFooter, type StepProps } from "../StepFooter";
import { useAiConfigured, useProfile } from "../../hooks";

function RepoRow({
  repo,
  checked,
  onToggle,
}: {
  repo: GithubRepo;
  checked: boolean;
  onToggle: () => void;
}) {
  const id = `repo-${repo.fullName.replace(/[^A-Za-z0-9-]/g, "-")}`;
  return (
    <li className="flex items-start gap-3 py-2">
      <input id={id} type="checkbox" className="mt-1" checked={checked} onChange={onToggle} />
      <label htmlFor={id} className="min-w-0 flex-1 text-sm">
        <span className="font-medium">{repo.name}</span> {repo.isFork && <Badge>Fork</Badge>}{" "}
        {repo.archived && <Badge>Archived</Badge>}
        {repo.description && (
          <span className="block text-stone-600 dark:text-stone-400">{repo.description}</span>
        )}
        <span className="block text-xs text-stone-500">
          {[
            repo.language,
            `${String(repo.stars)} stars`,
            repo.pushedAt && `last push ${repo.pushedAt.slice(0, 10)}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </label>
    </li>
  );
}

/** Step 4: import projects from GitHub (spec 10, step 4). */
export function GithubStep({ next, back }: StepProps) {
  const profile = useProfile();
  const aiConfigured = useAiConfigured();
  const [username, setUsername] = useState<string>();
  const [token, setToken] = useState("");
  const [savedToken, setSavedToken] = useState<string>();
  const [repos, setRepos] = useState<GithubRepo[]>();
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [remaining, setRemaining] = useState<number>();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [review, setReview] = useState<Profile>();

  useEffect(() => {
    void loadSecrets().then((s) => {
      setSavedToken(s.githubToken);
    });
  }, []);

  if (!profile) return <Loading />;
  const name = username ?? profile.basics.githubUsername ?? "";

  const deps = (): GithubDeps => {
    const t = token.trim() || savedToken;
    return { fetch: (input, init) => fetch(input, init), ...(t && { token: t }) };
  };

  const findRepos = async (refresh: boolean) => {
    setError(undefined);
    setBusy("Looking up your repositories...");
    try {
      if (token.trim()) {
        await updateSecrets({ githubToken: token.trim() });
        setSavedToken(token.trim());
        setToken("");
      }
      const result = await listReposCached(deps(), name.trim(), { refresh });
      setRepos(result.repos);
      setRemaining(result.remaining);
      setTicked(new Set(result.repos.filter(tickedByDefault).map((r) => r.fullName)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach GitHub.");
    } finally {
      setBusy(undefined);
    }
  };

  const importTicked = async () => {
    const chosen = (repos ?? []).filter((r) => ticked.has(r.fullName));
    const imported: Project[] = [];
    let aiFailures = 0;
    setError(undefined);
    try {
      for (const [i, repo] of chosen.entries()) {
        setBusy(`Reading ${repo.name} (${String(i + 1)} of ${String(chosen.length)})...`);
        const details = await repoDetailsCached(deps(), repo);
        let project = projectFromRepo(repo, details, new Date());
        if (aiConfigured) {
          try {
            const described = await sendMessage("ai/describeProject", {
              name: repo.name,
              ...(repo.description && { description: repo.description }),
              languages: details.languages,
              topics: repo.topics,
              readmeExcerpt: details.readmeExcerpt,
            });
            project = {
              ...project,
              description: described.description,
              bullets: described.bullets,
              techStack: [...new Set([...project.techStack, ...skillIdsFor(described.techStack)])],
            };
          } catch {
            aiFailures++;
          }
        }
        imported.push(project);
      }
      setNotice(
        aiFailures > 0
          ? `The AI could not describe ${String(aiFailures)} project(s); they are filled from GitHub instead.`
          : undefined,
      );
      setReview({ ...profile, projects: mergeProjects(profile.projects, imported) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the repositories.");
    } finally {
      setBusy(undefined);
    }
  };

  if (busy) return <Loading label={busy} />;

  if (review) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-stone-600 dark:text-stone-400">
          Check each project. Untick “Real project” for practice or tutorial repos, and tick “Always
          include” for your best work.
        </p>
        {notice && <p className="text-sm text-amber-700 dark:text-amber-300">{notice}</p>}
        <ProfileEditor
          profile={review}
          sections={["projects"]}
          submitLabel="Save projects and continue"
          onSaved={next}
        />
        <StepFooter
          back={() => {
            setReview(undefined);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="github-username" label="GitHub username">
          <input
            id="github-username"
            className={inputClass}
            value={name}
            onChange={(e) => {
              setUsername(e.target.value);
            }}
          />
        </Field>
        <Field
          id="github-token"
          label="Personal access token (optional)"
          hint={
            savedToken
              ? "A token is saved on this device."
              : "Raises GitHub's limit of 60 requests an hour. It needs no scopes for public repos."
          }
        >
          <input
            id="github-token"
            type="password"
            autoComplete="off"
            className={inputClass}
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
            }}
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void findRepos(false)} disabled={name.trim() === ""}>
          Find my repositories
        </Button>
        {repos && (
          <Button variant="ghost" onClick={() => void findRepos(true)}>
            Refresh from GitHub
          </Button>
        )}
        {remaining !== undefined && (
          <span className="text-xs text-stone-500">
            {String(remaining)} GitHub requests left this hour
          </span>
        )}
      </div>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {repos?.length === 0 && (
        <p className="text-sm">No public repositories found for this user.</p>
      )}
      {repos && repos.length > 0 && (
        <ul className="divide-y divide-stone-200 rounded-md border border-stone-200 px-3 dark:divide-stone-800 dark:border-stone-800">
          {repos.map((repo) => (
            <RepoRow
              key={repo.fullName}
              repo={repo}
              checked={ticked.has(repo.fullName)}
              onToggle={() => {
                const nextTicked = new Set(ticked);
                if (!nextTicked.delete(repo.fullName)) nextTicked.add(repo.fullName);
                setTicked(nextTicked);
              }}
            />
          ))}
        </ul>
      )}
      <StepFooter back={back}>
        <Button variant="ghost" onClick={next}>
          Skip
        </Button>
        {repos && (
          <Button
            variant="primary"
            disabled={ticked.size === 0}
            onClick={() => void importTicked()}
          >
            Import {String(ticked.size)} project{ticked.size === 1 ? "" : "s"}
          </Button>
        )}
      </StepFooter>
    </div>
  );
}
