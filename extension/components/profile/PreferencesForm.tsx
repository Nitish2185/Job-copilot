import type { Preferences } from "@job-copilot/shared";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useFieldArray, useForm, useWatch, type UseFormRegister } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Field, Section, inputClass } from "@/components/ui/Field";
import { ErrorMessage } from "@/components/ui/States";
import { getDb } from "@/lib/db/db";
import {
  CTC_CURRENCIES,
  formToPreferences,
  preferencesToForm,
  type PreferencesFormValues,
} from "@/lib/profile/preferencesForm";
import { savePreferences } from "@/lib/profile/store";

type Name = Parameters<UseFormRegister<PreferencesFormValues>>[0];

const fieldId = (name: string) => `prefs-${name.replace(/\./g, "-")}`;

function Text({
  name,
  label,
  hint,
  type = "text",
  placeholder,
  list,
  register,
}: {
  name: Name;
  label: string;
  hint?: string;
  type?: string;
  placeholder?: string;
  list?: string;
  register: UseFormRegister<PreferencesFormValues>;
}) {
  const id = fieldId(name);
  return (
    <Field id={id} label={label} hint={hint}>
      <input
        id={id}
        type={type}
        list={list}
        placeholder={placeholder}
        className={inputClass}
        {...register(name)}
      />
    </Field>
  );
}

function Check({
  name,
  label,
  register,
}: {
  name: Name;
  label: string;
  register: UseFormRegister<PreferencesFormValues>;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" {...register(name)} />
      {label}
    </label>
  );
}

function Select({
  name,
  label,
  hint,
  options,
  register,
}: {
  name: Name;
  label: string;
  hint?: string;
  options: readonly (readonly [value: string, label: string])[];
  register: UseFormRegister<PreferencesFormValues>;
}) {
  const id = fieldId(name);
  return (
    <Field id={id} label={label} hint={hint}>
      <select id={id} className={inputClass} {...register(name)}>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </Field>
  );
}

const AUTH_STATUS: [string, string][] = [
  ["citizen", "Citizen"],
  ["permanent_resident", "Permanent resident"],
  ["work_visa", "Work visa"],
  ["needs_sponsorship", "Needs sponsorship"],
  ["other", "Other"],
];

const JOB_TYPES: [Preferences["jobTypes"][number], string][] = [
  ["full_time", "Full-time"],
  ["contract", "Contract"],
  ["internship", "Internship"],
  ["part_time", "Part-time"],
];

const EEO_FIELDS: [keyof PreferencesFormValues["eeo"], string, string[]][] = [
  ["gender", "Gender", ["Male", "Female", "Non-binary", "Decline to self-identify"]],
  [
    "raceEthnicity",
    "Race or ethnicity",
    [
      "Asian",
      "Black or African American",
      "White",
      "Two or more races",
      "Decline to self-identify",
    ],
  ],
  ["hispanicLatino", "Hispanic or Latino", ["Yes", "No", "Decline to self-identify"]],
  ["veteranStatus", "Veteran status", ["I am not a protected veteran", "I don't wish to answer"]],
  [
    "disabilityStatus",
    "Disability status",
    ["No, I do not have a disability", "Yes, I have a disability", "I do not want to answer"],
  ],
  ["pronouns", "Pronouns", ["he/him", "she/her", "they/them"]],
];

export interface PreferencesFormProps {
  preferences: Preferences;
  /** Default currency for CTC fields, e.g. INR when the profile country is IN. */
  currency: string;
  /** "ask-once" is onboarding step 6, "jobs" is step 7, "all" is the Profile page. */
  part?: "ask-once" | "jobs" | "all";
  submitLabel?: string;
  onSaved: (preferences: Preferences) => void;
}

/** The "ask once" answers and job preferences (spec 10, steps 6 and 7). */
export function PreferencesForm({
  preferences,
  currency,
  part = "all",
  submitLabel = "Save",
  onSaved,
}: PreferencesFormProps) {
  const initial = preferencesToForm(preferences);
  const { register, control, handleSubmit, formState } = useForm<PreferencesFormValues>({
    defaultValues: { ...initial, ctcCurrency: initial.ctcCurrency || currency },
  });
  const auth = useFieldArray({ control, name: "workAuthorization" });
  const [issues, setIssues] = useState<string[]>([]);
  const servingNotice = useWatch({ control, name: "servingNotice" });
  const ctcCurrency = useWatch({ control, name: "ctcCurrency" }) || currency;
  const inr = ctcCurrency === "INR";
  const amountHint = inr
    ? 'Yearly, in rupees: "12 LPA", "12.5 lakh" or "1200000".'
    : `Yearly amount in ${ctcCurrency}, e.g. "120000" or "120k".`;
  const amountExample = inr ? "e.g. 12 LPA" : "e.g. 120000";

  const submit = handleSubmit(async (values) => {
    const result = formToPreferences(values, currency);
    if (!result.ok) {
      setIssues(result.issues);
      return;
    }
    setIssues([]);
    onSaved(await savePreferences(getDb(), result.preferences));
  });

  const askOnce = part !== "jobs";
  const jobs = part !== "ask-once";

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4" aria-label="Preferences">
      {askOnce && (
        <>
          <Section
            title="Work authorization"
            description="Answers “Are you authorized to work in …?” and visa sponsorship questions."
          >
            {auth.fields.map((item, i) => (
              <div key={item.id} className="grid items-end gap-3 sm:grid-cols-[8rem_1fr_1fr_auto]">
                <Text
                  name={`workAuthorization.${i}.countryCode`}
                  label="Country code"
                  placeholder="IN"
                  register={register}
                />
                <Select
                  name={`workAuthorization.${i}.status`}
                  label="Status"
                  options={AUTH_STATUS}
                  register={register}
                />
                <Text name={`workAuthorization.${i}.note`} label="Note" register={register} />
                <Button
                  aria-label={`Remove country ${String(i + 1)}`}
                  onClick={() => {
                    auth.remove(i);
                  }}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            ))}
            <Button
              onClick={() => {
                auth.append({ countryCode: "", status: "citizen", note: "" });
              }}
            >
              <Plus className="size-4" aria-hidden /> Add a country
            </Button>
            <Check name="needsSponsorship" label="I need visa sponsorship" register={register} />
          </Section>

          <Section title="Notice period" description="Answers notice period and joining questions.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Text
                name="noticePeriodDays"
                label="Notice period (days)"
                type="number"
                register={register}
              />
              <Text
                name="earliestStartDate"
                label="Earliest start date (optional)"
                type="date"
                register={register}
              />
            </div>
            <Check
              name="noticeNegotiable"
              label="My notice period is negotiable"
              register={register}
            />
            <Check name="servingNotice" label="I am serving my notice now" register={register} />
            {servingNotice && (
              <Text
                name="lastWorkingDay"
                label="Last working day"
                type="date"
                register={register}
              />
            )}
          </Section>

          <Section
            title="Salary"
            description="Fills current and expected CTC fields. Choose whether to share them automatically."
          >
            <Select
              name="ctcCurrency"
              label="Currency"
              options={CTC_CURRENCIES}
              register={register}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <Text
                name="currentCtc"
                label="Current CTC"
                placeholder={amountExample}
                register={register}
              />
              <Text
                name="expectedCtcMin"
                label="Expected CTC"
                placeholder={inr ? "e.g. 18 LPA" : "e.g. 150000"}
                register={register}
              />
              <Text
                name="expectedCtcMax"
                label="Expected CTC, maximum (optional)"
                placeholder={inr ? "e.g. 22 LPA" : "e.g. 170000"}
                register={register}
              />
            </div>
            <p className="-mt-2 text-sm text-stone-600 dark:text-stone-400">{amountHint}</p>
            <Select
              name="salaryDisclosure"
              label="When a form asks about salary"
              options={[
                ["ask_each_time", "Ask me each time"],
                ["share", "Fill it in for me"],
              ]}
              register={register}
            />
          </Section>

          <Section title="Other questions" description="Used only when an application form asks.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Text
                name="howDidYouHearDefault"
                label="“How did you hear about us?”"
                placeholder="Company website"
                register={register}
              />
              <Text
                name="dateOfBirth"
                label="Date of birth (optional)"
                type="date"
                hint="Leave empty to skip. Filled only when a form asks for it."
                register={register}
              />
            </div>
            <Check name="willingToRelocate" label="I am willing to relocate" register={register} />
          </Section>

          <Section
            title="Voluntary diversity questions"
            description="All optional. Leave a field empty and Job Copilot answers “decline to self-identify”."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {EEO_FIELDS.map(([key, label, options]) => (
                <div key={key}>
                  <Text
                    name={`eeo.${key}`}
                    label={label}
                    list={`eeo-${key}-options`}
                    placeholder="Decline to answer"
                    register={register}
                  />
                  <datalist id={`eeo-${key}-options`}>
                    {options.map((o) => (
                      <option key={o} value={o} />
                    ))}
                  </datalist>
                </div>
              ))}
            </div>
          </Section>
        </>
      )}

      {jobs && (
        <Section title="Jobs you want" description="Used to filter and score matches.">
          <Text
            name="desiredRoles"
            label="Desired roles"
            hint="Separate with commas, e.g. Frontend Developer, Backend Developer (Go)"
            register={register}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              name="experienceLevel"
              label="Experience level"
              options={[
                ["intern", "Intern"],
                ["junior", "Junior"],
                ["mid", "Mid-level"],
                ["senior", "Senior"],
                ["lead", "Lead"],
              ]}
              register={register}
            />
            <Select
              name="remotePreference"
              label="Remote or office"
              options={[
                ["any", "Any"],
                ["remote", "Remote"],
                ["hybrid", "Hybrid"],
                ["onsite", "In the office"],
              ]}
              register={register}
            />
            <Text
              name="countries"
              label="Countries"
              hint="Two-letter codes separated by commas, e.g. IN, US"
              register={register}
            />
            <Text
              name="preferredLocations"
              label="Cities"
              hint="Separate with commas, e.g. Bengaluru, Pune"
              register={register}
            />
            <Text
              name="minSalary"
              label={`Minimum salary (optional, ${ctcCurrency})`}
              placeholder={amountExample}
              hint={amountHint}
              register={register}
            />
          </div>
          <fieldset>
            <legend className="mb-1 text-xs font-medium text-stone-600 dark:text-stone-400">
              Job types
            </legend>
            <div className="flex flex-wrap gap-4">
              {JOB_TYPES.map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" value={value} {...register("jobTypes")} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <Text
              name="excludeTitleKeywords"
              label="Hide titles with these words"
              hint="e.g. sales, manager"
              register={register}
            />
            <Text
              name="hiddenCompanies"
              label="Hide these companies"
              hint="Separate with commas"
              register={register}
            />
          </div>
        </Section>
      )}

      {issues.length > 0 && (
        <ErrorMessage>
          <ul className="list-disc pl-4">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </ErrorMessage>
      )}
      <Button type="submit" variant="primary" disabled={formState.isSubmitting}>
        {submitLabel}
      </Button>
    </form>
  );
}
