/** describeProject (spec 11.7 #2): repo metadata + README -> description, bullets, tech stack. */
import { z } from "zod";
import { CACHE_TTL } from "../cache";
import { NO_INVENTION_RULE, UNTRUSTED_DATA_RULE, clip } from "../prompts/common";
import type { AiTask } from "../runner";

export const ProjectDescriptionSchema = z.object({
  description: z.string().min(1).max(400),
  bullets: z.array(z.string().min(1).max(220)).min(2).max(4),
  techStack: z.array(z.string().min(1)).max(15),
});
export type ProjectDescription = z.infer<typeof ProjectDescriptionSchema>;

export interface DescribeProjectInput {
  name: string;
  description?: string;
  languages: Record<string, number>;
  topics: string[];
  readmeExcerpt: string;
}

export const describeProjectTask: AiTask<DescribeProjectInput, ProjectDescription> = {
  id: "describeProject",
  promptVersion: 1,
  schema: ProjectDescriptionSchema,
  cacheTtlMs: CACHE_TTL.describeProject,
  redactInput: true,
  priority: "user",
  buildMessages: (input) => [
    {
      role: "system",
      content: [
        "You describe a software project for a resume.",
        UNTRUSTED_DATA_RULE,
        NO_INVENTION_RULE,
        "description: 1-3 plain sentences on what it does. bullets: 2-4 short factual points about features or implementation, each supported by the input; no made-up numbers or users. techStack: languages, frameworks and tools the input shows.",
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        name: input.name,
        description: input.description ?? "",
        languages: input.languages,
        topics: input.topics,
        readme: `<readme>${clip(input.readmeExcerpt, 2000)}</readme>`,
      }),
    },
  ],
};
