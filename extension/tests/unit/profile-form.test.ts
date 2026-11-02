import { describe, expect, it } from "vitest";
import { formToProfile, profileToForm } from "@/lib/profile/form";
import { emptyProfile } from "@/lib/profile/profile";

const now = new Date("2026-11-02T06:00:00Z");

describe("profile form mapping", () => {
  it("round-trips a profile through the form", () => {
    const values = profileToForm(emptyProfile(now));
    values.fullName = "Aarav Mehta";
    values.country = "in";
    values.linkedinUrl = "linkedin.com/in/aarav-mehta-example";
    values.skills = [
      { name: "React", years: "3", level: "advanced" },
      { name: "Golang", years: "", level: "" },
      { name: "React.js", years: "1", level: "" },
    ];
    values.experience = [
      {
        id: "",
        company: "Example Fintech",
        title: "Engineer",
        location: "",
        startDate: "2022-07",
        endDate: "",
        current: true,
        bullets: "- Built dashboards\n\n• Cut latency by 30%",
      },
    ];
    values.projects = [
      {
        id: "",
        name: "Job Board",
        description: "Listings app",
        bullets: "Search\nAlerts",
        techStack: "Next.js, PostgreSQL",
        repo: "github.com/aarav-dev/job-board",
        live: "",
        included: true,
        highlight: false,
      },
    ];
    values.achievements = "Hackathon winner\n";

    const result = formToProfile(values, emptyProfile(now), now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p = result.profile;
    expect(p.basics).toMatchObject({
      fullName: "Aarav Mehta",
      country: "IN",
      linkedinUrl: "https://linkedin.com/in/aarav-mehta-example",
    });
    expect(p.skills.map((s) => [s.id, s.years, s.level])).toEqual([
      ["react", 3, "advanced"],
      ["go", undefined, undefined],
    ]);
    expect(p.experience[0]).toMatchObject({
      endDate: null,
      bullets: ["Built dashboards", "Cut latency by 30%"],
    });
    expect(p.projects[0]).toMatchObject({
      techStack: ["nextjs", "postgresql"],
      links: { repo: "https://github.com/aarav-dev/job-board" },
      source: "manual",
    });
    expect(p.totalExperienceMonths).toBe(53);
    expect(p.achievements).toEqual(["Hackathon winner"]);

    const back = profileToForm(p);
    expect(back.experience[0]?.current).toBe(true);
    expect(back.projects[0]?.techStack).toBe("Next.js, PostgreSQL");
  });

  it("uses the total experience the user typed", () => {
    const values = { ...profileToForm(emptyProfile(now)), totalExperienceYears: "4.5" };
    const result = formToProfile(values, emptyProfile(now), now);
    expect(result.ok && result.profile.totalExperienceMonths).toBe(54);
  });

  it("explains invalid fields in plain words", () => {
    const values = profileToForm(emptyProfile(now));
    values.experience = [
      {
        id: "",
        company: "Acme",
        title: "Dev",
        location: "",
        startDate: "July 2022",
        endDate: "",
        current: true,
        bullets: "",
      },
    ];
    values.country = "India";
    const result = formToProfile(values, emptyProfile(now), now);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContain("experience #1: check the start date (YYYY-MM)");
      expect(result.issues).toContain("Basics: check the country (2-letter code such as IN)");
    }
  });
});
