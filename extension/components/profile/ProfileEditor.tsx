import type { Profile } from "@job-copilot/shared";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useFieldArray, useForm, type UseFormRegister } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Field, Section, inputClass } from "@/components/ui/Field";
import { ErrorMessage } from "@/components/ui/States";
import { getDb } from "@/lib/db/db";
import { formToProfile, profileToForm, type ProfileFormValues } from "@/lib/profile/form";
import { saveProfile } from "@/lib/profile/store";

/** "experience[1].startDate" (AI paths) -> "experience.1.startDate" (form names). */
function toFormName(path: string): string {
  return path.replace(/\[(\d+)\]/g, ".$1");
}

function TextField({
  name,
  label,
  register,
  uncertain,
  hint,
  type = "text",
  className,
}: {
  name: string;
  label: string;
  register: UseFormRegister<ProfileFormValues>;
  uncertain: ReadonlySet<string>;
  hint?: string;
  type?: string;
  className?: string;
}) {
  const id = `profile-${name.replace(/\./g, "-")}`;
  return (
    <Field id={id} label={label} hint={hint} highlight={uncertain.has(name)} className={className}>
      <input
        id={id}
        type={type}
        className={inputClass}
        {...register(name as keyof ProfileFormValues)}
      />
    </Field>
  );
}

function TextArea({
  name,
  label,
  register,
  uncertain,
  hint,
  rows = 3,
}: {
  name: string;
  label: string;
  register: UseFormRegister<ProfileFormValues>;
  uncertain: ReadonlySet<string>;
  hint?: string;
  rows?: number;
}) {
  const id = `profile-${name.replace(/\./g, "-")}`;
  return (
    <Field id={id} label={label} hint={hint} highlight={uncertain.has(name)}>
      <textarea
        id={id}
        rows={rows}
        className={inputClass}
        {...register(name as keyof ProfileFormValues)}
      />
    </Field>
  );
}

export type EditorSection =
  "basics" | "about" | "skills" | "experience" | "projects" | "education" | "more";

export interface ProfileEditorProps {
  profile: Profile;
  /** Sections to show (default: all). Hidden sections keep their saved values. */
  sections?: readonly EditorSection[];
  /** JSON paths the AI was unsure about. */
  uncertainFields?: readonly string[];
  submitLabel?: string;
  /** Runs on the checked profile just before it is saved (e.g. to attach the resume file). */
  beforeSave?: (profile: Profile) => Promise<Profile>;
  onSaved: (profile: Profile) => void;
}

/** Full profile form (spec 10, step 3 and 10.1). Every save bumps the profile version. */
export function ProfileEditor({
  profile,
  uncertainFields = [],
  sections,
  submitLabel = "Save profile",
  beforeSave,
  onSaved,
}: ProfileEditorProps) {
  const show = (section: EditorSection) => !sections || sections.includes(section);
  const uncertain = new Set(uncertainFields.map(toFormName));
  const { register, control, handleSubmit, formState } = useForm<ProfileFormValues>({
    defaultValues: profileToForm(profile),
  });
  const skills = useFieldArray({ control, name: "skills" });
  const experience = useFieldArray({ control, name: "experience" });
  const education = useFieldArray({ control, name: "education" });
  const projects = useFieldArray({ control, name: "projects" });
  const certifications = useFieldArray({ control, name: "certifications" });
  const languages = useFieldArray({ control, name: "languages" });
  const [issues, setIssues] = useState<string[]>([]);

  const submit = handleSubmit(async (values) => {
    const result = formToProfile(values, profile, new Date());
    if (!result.ok) {
      setIssues(result.issues);
      return;
    }
    setIssues([]);
    const ready = beforeSave ? await beforeSave(result.profile) : result.profile;
    onSaved(await saveProfile(getDb(), ready));
  });

  const field = { register, uncertain };

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4" aria-label="Profile">
      {uncertain.size > 0 && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Fields marked “please check” were hard to read from your resume. Review them before
          saving.
        </p>
      )}

      {show("basics") && (
        <Section title="Basics" description="Used to fill application forms. Never sent to the AI.">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField name="fullName" label="Full name" {...field} />
            <TextField name="email" label="Email" type="email" {...field} />
            <TextField name="phone" label="Phone" {...field} />
            <TextField name="city" label="City" {...field} />
            <TextField name="state" label="State" {...field} />
            <TextField
              name="country"
              label="Country code"
              hint="Two letters, e.g. IN or US"
              {...field}
            />
            <TextField name="linkedinUrl" label="LinkedIn" {...field} />
            <TextField name="githubUsername" label="GitHub username" {...field} />
            <TextField name="portfolioUrl" label="Portfolio" {...field} />
          </div>
        </Section>
      )}

      {show("about") && (
        <Section title="About you">
          <TextField
            name="headline"
            label="Headline"
            hint="e.g. Full-stack developer (MERN, Go)"
            {...field}
          />
          <TextArea name="summary" label="Summary" rows={4} {...field} />
          <TextField
            name="totalExperienceYears"
            label="Total experience (years)"
            hint="Leave empty to compute it from your experience dates."
            {...field}
          />
        </Section>
      )}

      {show("skills") && (
        <Section title="Skills">
          {skills.fields.map((item, i) => (
            <div key={item.id} className="flex items-end gap-2">
              <TextField
                name={`skills.${String(i)}.name`}
                label="Skill"
                className="flex-1"
                {...field}
              />
              <TextField
                name={`skills.${String(i)}.years`}
                label="Years"
                className="w-20"
                {...field}
              />
              <Field id={`skill-level-${String(i)}`} label="Level" className="w-36">
                <select
                  id={`skill-level-${String(i)}`}
                  className={inputClass}
                  {...register(`skills.${i}.level`)}
                >
                  <option value="">Not set</option>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                  <option value="expert">Expert</option>
                </select>
              </Field>
              <Button
                variant="ghost"
                aria-label={`Remove skill ${String(i + 1)}`}
                onClick={() => {
                  skills.remove(i);
                }}
              >
                <Trash2 size={16} />
              </Button>
            </div>
          ))}
          <Button
            onClick={() => {
              skills.append({ name: "", years: "", level: "" });
            }}
          >
            <Plus size={16} /> Add skill
          </Button>
        </Section>
      )}

      {show("experience") && (
        <Section title="Experience">
          {experience.fields.map((item, i) => (
            <div
              key={item.id}
              className="space-y-2 rounded-md border border-slate-200 p-3 dark:border-slate-800"
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <TextField name={`experience.${String(i)}.title`} label="Job title" {...field} />
                <TextField name={`experience.${String(i)}.company`} label="Company" {...field} />
                <TextField name={`experience.${String(i)}.location`} label="Location" {...field} />
                <div className="grid grid-cols-2 gap-2">
                  <TextField
                    name={`experience.${String(i)}.startDate`}
                    label="Start (YYYY-MM)"
                    {...field}
                  />
                  <TextField
                    name={`experience.${String(i)}.endDate`}
                    label="End (YYYY-MM)"
                    {...field}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" {...register(`experience.${i}.current`)} /> I work here now
              </label>
              <TextArea
                name={`experience.${String(i)}.bullets`}
                label="What you did (one point per line)"
                rows={4}
                {...field}
              />
              <Button
                variant="ghost"
                onClick={() => {
                  experience.remove(i);
                }}
              >
                <Trash2 size={16} /> Remove this role
              </Button>
            </div>
          ))}
          <Button
            onClick={() => {
              experience.append({
                id: "",
                company: "",
                title: "",
                location: "",
                startDate: "",
                endDate: "",
                current: false,
                bullets: "",
              });
            }}
          >
            <Plus size={16} /> Add role
          </Button>
        </Section>
      )}

      {show("projects") && (
        <Section
          title="Projects"
          description="Only projects marked “Real project” are used in tailored resumes."
        >
          {projects.fields.map((item, i) => (
            <div
              key={item.id}
              className="space-y-2 rounded-md border border-slate-200 p-3 dark:border-slate-800"
              data-testid="project-row"
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <TextField name={`projects.${String(i)}.name`} label="Name" {...field} />
                <TextField
                  name={`projects.${String(i)}.techStack`}
                  label="Tech stack (comma separated)"
                  {...field}
                />
                <TextField name={`projects.${String(i)}.repo`} label="Repository link" {...field} />
                <TextField name={`projects.${String(i)}.live`} label="Live link" {...field} />
              </div>
              <TextArea
                name={`projects.${String(i)}.description`}
                label="Description (1-3 sentences)"
                rows={2}
                {...field}
              />
              <TextArea
                name={`projects.${String(i)}.bullets`}
                label="Facts (one per line)"
                rows={3}
                {...field}
              />
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" {...register(`projects.${i}.included`)} /> Real project
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" {...register(`projects.${i}.highlight`)} /> Always include
                  in tailored resumes
                </label>
                <Button
                  variant="ghost"
                  onClick={() => {
                    projects.remove(i);
                  }}
                >
                  <Trash2 size={16} /> Remove
                </Button>
              </div>
            </div>
          ))}
          <Button
            onClick={() => {
              projects.append({
                id: "",
                name: "",
                description: "",
                bullets: "",
                techStack: "",
                repo: "",
                live: "",
                included: true,
                highlight: false,
              });
            }}
          >
            <Plus size={16} /> Add project
          </Button>
        </Section>
      )}

      {show("education") && (
        <Section title="Education">
          {education.fields.map((item, i) => (
            <div
              key={item.id}
              className="grid gap-2 rounded-md border border-slate-200 p-3 sm:grid-cols-3 dark:border-slate-800"
            >
              <TextField
                name={`education.${String(i)}.institution`}
                label="Institution"
                {...field}
              />
              <TextField name={`education.${String(i)}.degree`} label="Degree" {...field} />
              <TextField name={`education.${String(i)}.field`} label="Field" {...field} />
              <TextField name={`education.${String(i)}.startYear`} label="Start year" {...field} />
              <TextField name={`education.${String(i)}.endYear`} label="End year" {...field} />
              <TextField name={`education.${String(i)}.grade`} label="Grade" {...field} />
              <Button
                variant="ghost"
                onClick={() => {
                  education.remove(i);
                }}
              >
                <Trash2 size={16} /> Remove
              </Button>
            </div>
          ))}
          <Button
            onClick={() => {
              education.append({
                id: "",
                institution: "",
                degree: "",
                field: "",
                startYear: "",
                endYear: "",
                grade: "",
              });
            }}
          >
            <Plus size={16} /> Add education
          </Button>
        </Section>
      )}

      {show("more") && (
        <Section title="Certifications and languages">
          {certifications.fields.map((item, i) => (
            <div key={item.id} className="flex items-end gap-2">
              <TextField
                name={`certifications.${String(i)}.name`}
                label="Certification"
                className="flex-1"
                {...field}
              />
              <TextField name={`certifications.${String(i)}.issuer`} label="Issuer" {...field} />
              <TextField
                name={`certifications.${String(i)}.year`}
                label="Year"
                className="w-24"
                {...field}
              />
              <Button
                variant="ghost"
                aria-label="Remove certification"
                onClick={() => {
                  certifications.remove(i);
                }}
              >
                <Trash2 size={16} />
              </Button>
            </div>
          ))}
          <Button
            onClick={() => {
              certifications.append({ id: "", name: "", issuer: "", year: "" });
            }}
          >
            <Plus size={16} /> Add certification
          </Button>
          {languages.fields.map((item, i) => (
            <div key={item.id} className="flex items-end gap-2">
              <TextField
                name={`languages.${String(i)}.name`}
                label="Language"
                className="flex-1"
                {...field}
              />
              <TextField
                name={`languages.${String(i)}.proficiency`}
                label="Proficiency"
                {...field}
              />
              <Button
                variant="ghost"
                aria-label="Remove language"
                onClick={() => {
                  languages.remove(i);
                }}
              >
                <Trash2 size={16} />
              </Button>
            </div>
          ))}
          <Button
            onClick={() => {
              languages.append({ name: "", proficiency: "" });
            }}
          >
            <Plus size={16} /> Add language
          </Button>
          <TextArea name="achievements" label="Achievements (one per line)" {...field} />
        </Section>
      )}

      {issues.length > 0 && (
        <ErrorMessage>
          <p className="font-medium">Please fix these before saving:</p>
          <ul className="mt-1 list-disc pl-5">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </ErrorMessage>
      )}
      <div className="sticky bottom-0 bg-slate-50 py-3 dark:bg-slate-950">
        <Button type="submit" variant="primary" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
