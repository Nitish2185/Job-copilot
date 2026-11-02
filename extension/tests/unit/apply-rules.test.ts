import { describe, expect, it } from "vitest";
import { normalizeQuestion } from "@/lib/answers/answerBank";
import type { FieldKind } from "@/lib/apply/fields/discover";
import { classifyField, isSensitiveKey } from "@/lib/apply/fields/rules";

const classify = (
  label: string,
  kind: FieldKind = "text",
  extra: { name?: string; autocomplete?: string } = {},
) => classifyField({ question: normalizeQuestion(label), kind, ...extra });

const CASES: [label: string, key: string, kind?: FieldKind][] = [
  // Names and contact
  ["First Name*", "first_name"],
  ["First name", "first_name"],
  ["Given name", "first_name"],
  ["Last Name *", "last_name"],
  ["Surname", "last_name"],
  ["Family name", "last_name"],
  ["Full Name", "full_name"],
  ["Name", "full_name"],
  ["Your name", "full_name"],
  ["Legal name", "full_name"],
  ["Candidate Name", "full_name"],
  ["Preferred name", "preferred_name"],
  ["Preferred First Name", "preferred_name"],
  ["Email", "email"],
  ["Email address", "email"],
  ["E-mail ID", "email"],
  ["Your email", "email", "email"],
  ["Phone", "phone"],
  ["Phone number", "phone"],
  ["Mobile Number", "phone"],
  ["Contact number", "phone"],
  ["WhatsApp number", "phone"],
  ["Cell phone", "phone"],
  ["Telephone", "phone", "tel"],
  ["Country code", "phone_country_code"],
  ["Dialing code", "phone_country_code"],
  ["ISD code", "phone_country_code"],
  // Location
  ["Address", "address_line"],
  ["Street address", "address_line"],
  ["City", "city"],
  ["Town/City", "city"],
  ["State", "state"],
  ["State/Province", "state"],
  ["Country", "country"],
  ["Country of residence", "country"],
  ["Postal code", "postal_code"],
  ["ZIP code", "postal_code"],
  ["PIN code", "postal_code"],
  ["Pincode", "postal_code"],
  ["Current Location", "current_location"],
  ["Current city", "current_location"],
  ["Location", "current_location"],
  ["Where are you currently based?", "current_location"],
  // Links
  ["LinkedIn Profile", "linkedin"],
  ["LinkedIn URL", "linkedin"],
  ["Linkedin", "linkedin"],
  ["GitHub", "github"],
  ["Github profile URL", "github"],
  ["Portfolio", "portfolio"],
  ["Portfolio link", "portfolio"],
  ["Website", "website"],
  ["Personal website", "website"],
  ["Blog", "website"],
  ["Other website", "website"],
  ["Twitter URL", "twitter"],
  // Employment
  ["Current Company", "current_company"],
  ["Current employer", "current_company"],
  ["Most recent employer", "current_company"],
  ["Company name", "current_company"],
  ["Current organization", "current_company"],
  ["Current Job Title", "current_title"],
  ["Current designation", "current_title"],
  ["Current role", "current_title"],
  ["Title", "current_title"],
  ["Total experience", "total_experience_years"],
  ["Total Experience (in years)", "total_experience_years"],
  ["Total experience in years", "total_experience_years"],
  ["Years of experience", "total_experience_years"],
  ["Years of professional experience", "total_experience_years"],
  ["Overall experience", "total_experience_years"],
  ["Relevant experience", "total_experience_years"],
  ["Total IT experience", "total_experience_years"],
  ["How many years of experience do you have?", "total_experience_years"],
  ["Total experience (months)", "total_experience_months"],
  ["Months of experience", "total_experience_months"],
  // Skill years
  ["How many years of experience do you have with React?", "skill_years:react"],
  ["Years of experience in Python", "skill_years:python"],
  ["Years of experience with Kubernetes", "skill_years:kubernetes"],
  ["How many years of work experience do you have using Node.js?", "skill_years:nodejs"],
  ["Experience in Java (years)", "skill_years:java"],
  ["How many years have you worked with TypeScript?", "skill_years:typescript"],
  ["Years of hands-on experience in AWS", "skill_years:aws"],
  ["Relevant experience in Go (in years)", "skill_years:go"],
  // Indian forms: CTC and notice
  ["Current CTC", "current_ctc"],
  ["Current CTC (in LPA)", "current_ctc"],
  ["Current CTC (Lakhs per annum)", "current_ctc"],
  ["CTC", "current_ctc"],
  ["Current salary", "current_ctc"],
  ["Current annual salary", "current_ctc"],
  ["Present CTC", "current_ctc"],
  ["Current compensation", "current_ctc"],
  ["Last drawn salary", "current_ctc"],
  ["Expected CTC", "expected_ctc"],
  ["Expected CTC (in LPA)", "expected_ctc"],
  ["ECTC", "expected_ctc"],
  ["Expected package", "expected_ctc"],
  ["What is your expected CTC?", "expected_ctc"],
  ["Salary expectations", "salary_expectation"],
  ["Desired salary", "salary_expectation"],
  ["Expected salary", "salary_expectation"],
  ["Compensation expectations", "salary_expectation"],
  ["What are your salary requirements?", "salary_expectation"],
  ["Minimum salary", "salary_expectation"],
  ["Salary currency", "salary_currency"],
  ["Notice period", "notice_period"],
  ["Notice Period (in days)", "notice_period"],
  ["What is your notice period?", "notice_period"],
  ["Are you an immediate joiner?", "notice_period"],
  ["How soon can you join?", "notice_period"],
  ["Are you currently serving notice period?", "serving_notice"],
  ["Are you serving your notice?", "serving_notice"],
  ["Last working day", "last_working_day"],
  ["LWD", "last_working_day"],
  ["Earliest start date", "start_date"],
  ["When can you start?", "start_date"],
  ["Start date", "start_date"],
  ["Available to start from", "start_date"],
  // Authorization and relocation
  ["Are you legally authorized to work in the United States?", "work_authorization:US"],
  ["Are you authorised to work in the UK?", "work_authorization:GB"],
  ["Are you eligible to work in India?", "work_authorization:IN"],
  ["Do you have the right to work in Germany?", "work_authorization:DE"],
  ["Are you legally eligible to work in Canada", "work_authorization:CA"],
  ["Work authorization", "work_authorization"],
  ["Are you a U.S. citizen or permanent resident?", "work_authorization:US"],
  [
    "Will you now or in the future require sponsorship for employment visa status (e.g. H-1B visa status)?",
    "sponsorship",
  ],
  ["Do you require visa sponsorship?", "sponsorship"],
  ["Will you need a visa to work here?", "sponsorship"],
  ["Are you willing to relocate?", "relocate"],
  ["Open to relocation", "relocate"],
  ["Are you willing to relocate to Bengaluru?", "relocate"],
  ["Are you comfortable working from the office 5 days a week?", "willing_onsite"],
  ["Are you open to working onsite?", "willing_onsite"],
  ["Can you commute to our office?", "willing_onsite"],
  ["Are you okay with a hybrid work model?", "willing_hybrid"],
  // Diversity
  ["Gender", "gender"],
  ["What is your gender?", "gender"],
  ["Sex", "gender"],
  ["Pronouns", "pronouns"],
  ["Race", "race_ethnicity"],
  ["Ethnicity", "race_ethnicity"],
  ["Please identify your race", "race_ethnicity"],
  ["Are you Hispanic/Latino?", "hispanic_latino"],
  ["Veteran Status", "veteran_status"],
  ["Are you a protected veteran?", "veteran_status"],
  ["Disability Status", "disability_status"],
  ["Do you have a disability?", "disability_status"],
  ["Date of birth", "date_of_birth"],
  ["DOB", "date_of_birth"],
  ["Birth date", "date_of_birth"],
  // Education
  ["Degree", "education_degree"],
  ["Highest qualification", "education_degree"],
  ["Field of study", "education_degree"],
  ["School", "education_institution"],
  ["University", "education_institution"],
  ["College name", "education_institution"],
  ["Graduation year", "graduation_year"],
  ["Year of passing", "graduation_year"],
  ["GPA", "gpa"],
  ["CGPA", "gpa"],
  ["Percentage", "gpa"],
  // Source and referral
  ["How did you hear about us?", "how_did_you_hear"],
  ["How did you hear about this job?", "how_did_you_hear"],
  ["Where did you find this job?", "how_did_you_hear"],
  ["Source", "unknown"],
  ["Referral name", "referral_name"],
  ["Who referred you?", "referral_name"],
  // Files and letters
  ["Resume/CV", "resume_file", "file"],
  ["Attach your CV", "resume_file", "file"],
  ["Cover Letter", "cover_letter_file", "file"],
  ["Cover letter", "cover_letter_text", "textarea"],
  ["Why do you want to work here?", "cover_letter_text", "textarea"],
  ["Additional information", "cover_letter_text", "textarea"],
  // Consent and attestations
  ["I have read and agree to the privacy notice", "privacy_acknowledgement", "checkbox"],
  ["I consent to the processing of my personal data", "privacy_acknowledgement", "checkbox"],
  ["Do you consent to a background check?", "background_check_consent"],
  ["Have you ever been convicted of a crime?", "background_check_consent"],
  ["Do you have a criminal record?", "background_check_consent"],
  ["I certify that the information provided is true and complete", "legal_attestation", "checkbox"],
  ["Are you subject to any agreement that would restrict your work?", "legal_attestation"],
  // Unknown questions stay unknown
  ["What is your favourite programming language and why?", "unknown", "textarea"],
  ["Anything else we should know?", "unknown", "textarea"],
  ["Describe a challenging project", "unknown", "textarea"],
];

describe("classifyField (spec 16.3)", () => {
  it("has at least 150 real-world questions", () => {
    expect(CASES.length).toBeGreaterThanOrEqual(150);
  });

  it.each(CASES)("%s -> %s", (label, key, kind) => {
    expect(classify(label, kind)).toBe(key);
  });

  it("uses autocomplete and name attributes when the label says nothing", () => {
    expect(classify("", "text", { autocomplete: "given-name" })).toBe("first_name");
    expect(classify("Field 3", "text", { autocomplete: "section-a postal-code" })).toBe(
      "postal_code",
    );
    expect(classify("Answer", "text", { name: "candidate[linkedin_url]" })).toBe("linkedin");
  });

  it("marks sensitive keys", () => {
    for (const key of [
      "work_authorization:US",
      "sponsorship",
      "current_ctc",
      "notice_period",
      "date_of_birth",
      "legal_attestation",
    ]) {
      expect(isSensitiveKey(key)).toBe(true);
    }
    expect(isSensitiveKey("first_name")).toBe(false);
  });
});
