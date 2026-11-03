import { describe, expect, it } from "vitest";
import { searchLinks, searchQuery } from "@/lib/jobs/searchLinks";

const base = {
  role: "Full Stack Developer",
  skills: ["React", "Node.js"],
  city: "Pune, Maharashtra, India",
  years: 4.4,
  indeedCountry: "in",
};

describe("search links", () => {
  it("builds Naukri, Indeed and LinkedIn searches in their documented formats", () => {
    expect(searchLinks(base)).toEqual([
      {
        site: "Naukri",
        url: "https://www.naukri.com/full-stack-developer-jobs-in-pune?experience=4",
      },
      { site: "Indeed", url: "https://in.indeed.com/jobs?q=Full+Stack+Developer&l=Pune&fromage=1" },
      {
        site: "LinkedIn",
        url: "https://www.linkedin.com/jobs/search/?keywords=Full+Stack+Developer&location=Pune&f_TPR=r86400",
      },
    ]);
  });

  it("falls back to skills, works without a city and uses www for the US", () => {
    const links = searchLinks({ ...base, role: "", city: "", indeedCountry: "us" });
    expect(searchQuery({ ...base, role: "" })).toBe("React Node.js");
    expect(links[0]?.url).toBe("https://www.naukri.com/react-node-js-jobs?experience=4");
    expect(links[1]?.url).toBe("https://www.indeed.com/jobs?q=React+Node.js&fromage=1");
  });

  it("keeps C++ and C# readable in the Naukri path", () => {
    expect(searchLinks({ ...base, role: "C++ Developer" })[0]?.url).toContain(
      "c-plus-plus-developer",
    );
    expect(searchLinks({ ...base, role: "C# Developer" })[0]?.url).toContain("c-sharp-developer");
  });
});
