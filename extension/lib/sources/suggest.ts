import type { Company } from "@job-copilot/shared";
import { REPO_URL } from "@job-copilot/shared/config";

/** Pre-filled GitHub issue for adding a company to the shared feed; the user submits it. */
export function suggestionUrl(company: Company): string {
  const entry = JSON.stringify({
    name: company.name,
    platform: company.platform,
    token: company.token,
    ...(company.variant && { variant: company.variant }),
    region: [],
  });
  const params = new URLSearchParams({
    title: `Add ${company.name} to the shared feed`,
    body: `Please add this company to crawler/companies.json:\n\n\`\`\`json\n${entry}\n\`\`\`\n`,
  });
  return `${REPO_URL}/issues/new?${params.toString()}`;
}
