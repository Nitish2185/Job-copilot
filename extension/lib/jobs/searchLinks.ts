/**
 * Search links (spec 13.6): searches on Naukri, Indeed and LinkedIn built from
 * the user's roles, skills, place and experience. They open only when the user
 * clicks one; Job Copilot never loads these sites by itself.
 */
export interface SearchInput {
  role: string;
  skills: readonly string[];
  city: string;
  years: number;
  /** Indeed country subdomain ("in" -> in.indeed.com; "us" -> www.indeed.com). */
  indeedCountry: string;
}

export interface SearchLink {
  site: "Naukri" | "Indeed" | "LinkedIn";
  url: string;
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, "-")
    .replace(/\+/g, "-plus")
    .replace(/#/g, "-sharp")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

/** "Pune, Maharashtra, India" -> "Pune". */
const cityOf = (place: string) => place.split(",")[0]?.trim() ?? "";

export function searchQuery(input: SearchInput): string {
  const role = input.role.trim();
  if (role) return role;
  return input.skills.slice(0, 2).join(" ") || "software developer";
}

export function searchLinks(input: SearchInput): SearchLink[] {
  const query = searchQuery(input);
  const city = cityOf(input.city);
  const years = Math.max(0, Math.floor(input.years));

  const naukri = new URL(
    `https://www.naukri.com/${slug(query)}-jobs${city ? `-in-${slug(city)}` : ""}`,
  );
  naukri.searchParams.set("experience", String(years));

  const country = input.indeedCountry.trim().toLowerCase();
  const host = !country || country === "us" || country === "www" ? "www" : country;
  const indeed = new URL(`https://${host}.indeed.com/jobs`);
  indeed.searchParams.set("q", query);
  if (city) indeed.searchParams.set("l", city);
  indeed.searchParams.set("fromage", "1");

  const linkedin = new URL("https://www.linkedin.com/jobs/search/");
  linkedin.searchParams.set("keywords", query);
  if (city) linkedin.searchParams.set("location", city);
  linkedin.searchParams.set("f_TPR", "r86400");

  return [
    { site: "Naukri", url: naukri.href },
    { site: "Indeed", url: indeed.href },
    { site: "LinkedIn", url: linkedin.href },
  ];
}
