/**
 * ATS-friendly resume PDF (spec 14.5): one column, no tables or images, standard
 * section headings, real selectable text in a bundled open-license font (Lato).
 */
import { Document, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ResumeDocument } from "@job-copilot/shared";
import { monthYear } from "../document";
import { FONT_FAMILY, type PageSize, type ResumeTemplate } from "./setup";

function stylesFor(template: ResumeTemplate, size: number) {
  const compact = template === "compact";
  return StyleSheet.create({
    page: {
      fontFamily: FONT_FAMILY,
      fontSize: size,
      lineHeight: compact ? 1.25 : 1.35,
      paddingVertical: compact ? 26 : 36,
      paddingHorizontal: compact ? 30 : 42,
      color: "#111111",
    },
    name: { fontSize: size + (compact ? 6 : 9), fontWeight: 700 },
    headline: { fontSize: size + 1, marginTop: 1 },
    contact: { marginTop: 2, color: "#333333" },
    link: { color: "#333333", textDecoration: "none" },
    heading: {
      fontSize: size + (compact ? 0.5 : 1.5),
      fontWeight: 700,
      textTransform: "uppercase",
      marginTop: compact ? 7 : 11,
      marginBottom: compact ? 2 : 4,
      paddingBottom: 1.5,
      borderBottomWidth: 0.75,
      borderBottomColor: "#555555",
    },
    item: { marginTop: compact ? 3 : 5 },
    itemTitle: { fontWeight: 700 },
    meta: { color: "#444444" },
    bulletRow: { flexDirection: "row", marginTop: 1 },
    bulletMark: { width: 10 },
    bulletText: { flex: 1 },
  });
}

type Styles = ReturnType<typeof stylesFor>;

function Bullets({ items, s }: { items: readonly string[]; s: Styles }) {
  return (
    <>
      {items.map((text, i) => (
        <View key={i} style={s.bulletRow}>
          <Text style={s.bulletMark}>•</Text>
          <Text style={s.bulletText}>{text}</Text>
        </View>
      ))}
    </>
  );
}

function dates(start: string, end: string | null): string {
  return `${monthYear(start)} – ${end ? monthYear(end) : "Present"}`;
}

export interface ResumePdfProps {
  doc: ResumeDocument;
  template: ResumeTemplate;
  fontSize: number;
  pageSize: PageSize;
}

export function ResumePdf({ doc, template, fontSize, pageSize }: ResumePdfProps) {
  const s = stylesFor(template, fontSize);
  const { basics } = doc;
  const contact = [basics.email, basics.phone, basics.location].filter((v) => v.trim() !== "");
  return (
    <Document title={`${basics.fullName} - Resume`} author={basics.fullName} creator="Job Copilot">
      <Page size={pageSize} style={s.page}>
        <Text style={s.name}>{basics.fullName}</Text>
        {basics.headline && <Text style={s.headline}>{basics.headline}</Text>}
        {contact.length > 0 && <Text style={s.contact}>{contact.join("  |  ")}</Text>}
        {basics.links.length > 0 && (
          <Text style={s.contact}>
            {basics.links.map((l, i) => (
              <Text key={l.url}>
                {i > 0 ? "  |  " : ""}
                <Link src={l.url} style={s.link}>
                  {l.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                </Link>
              </Text>
            ))}
          </Text>
        )}

        {doc.summary.trim() !== "" && (
          <View>
            <Text style={s.heading}>Summary</Text>
            <Text>{doc.summary}</Text>
          </View>
        )}

        {doc.skills.length > 0 && (
          <View>
            <Text style={s.heading}>Skills</Text>
            <Text>{doc.skills.map((sk) => sk.displayName).join(", ")}</Text>
          </View>
        )}

        {doc.experience.length > 0 && (
          <View>
            <Text style={s.heading}>Experience</Text>
            {doc.experience.map((e) => (
              <View key={e.experienceId} style={s.item}>
                <Text>
                  <Text style={s.itemTitle}>{e.title}</Text>, {e.company}
                </Text>
                <Text style={s.meta}>
                  {[e.location, dates(e.startDate, e.endDate)].filter(Boolean).join("  |  ")}
                </Text>
                <Bullets items={e.bullets} s={s} />
              </View>
            ))}
          </View>
        )}

        {doc.projects.length > 0 && (
          <View>
            <Text style={s.heading}>Projects</Text>
            {doc.projects.map((p) => (
              <View key={p.projectId} style={s.item}>
                <Text>
                  <Text style={s.itemTitle}>{p.name}</Text>
                  {p.techStack.length > 0 ? `  |  ${p.techStack.join(", ")}` : ""}
                </Text>
                {p.link && <Text style={s.meta}>{p.link.replace(/^https?:\/\//, "")}</Text>}
                {p.bullets.length > 0 ? (
                  <Bullets items={p.bullets} s={s} />
                ) : (
                  p.description.trim() !== "" && <Text>{p.description}</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {doc.education.length > 0 && (
          <View>
            <Text style={s.heading}>Education</Text>
            {doc.education.map((e, i) => (
              <View key={i} style={s.item}>
                <Text>
                  <Text style={s.itemTitle}>{[e.degree, e.field].filter(Boolean).join(", ")}</Text>,{" "}
                  {e.institution}
                </Text>
                <Text style={s.meta}>
                  {[
                    e.startYear || e.endYear
                      ? [e.startYear, e.endYear].filter(Boolean).join(" – ")
                      : "",
                    e.grade ?? "",
                  ]
                    .filter((v) => v !== "")
                    .join("  |  ")}
                </Text>
              </View>
            ))}
          </View>
        )}

        {doc.certifications.length > 0 && (
          <View>
            <Text style={s.heading}>Certifications</Text>
            <Bullets
              items={doc.certifications.map((c) =>
                [c.name, c.issuer, c.year ? String(c.year) : undefined].filter(Boolean).join(", "),
              )}
              s={s}
            />
          </View>
        )}

        {doc.achievements.length > 0 && (
          <View>
            <Text style={s.heading}>Achievements</Text>
            <Bullets items={doc.achievements} s={s} />
          </View>
        )}
      </Page>
    </Document>
  );
}
