/** A plain cover letter PDF with the same bundled font as the resume (spec 15.1). */
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { FONT_FAMILY, type PageSize } from "./setup";

const s = StyleSheet.create({
  page: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    lineHeight: 1.45,
    paddingVertical: 56,
    paddingHorizontal: 60,
    color: "#111111",
  },
  name: { fontSize: 16, fontWeight: 700 },
  contact: { color: "#333333", marginTop: 2 },
  date: { marginTop: 18, marginBottom: 14, color: "#333333" },
  paragraph: { marginBottom: 10 },
});

export interface CoverLetterPdfProps {
  fullName: string;
  contact: string;
  date: string;
  text: string;
  pageSize: PageSize;
}

export function CoverLetterPdf({ fullName, contact, date, text, pageSize }: CoverLetterPdfProps) {
  return (
    <Document title={`${fullName} - Cover letter`} author={fullName} creator="Job Copilot">
      <Page size={pageSize} style={s.page}>
        <Text style={s.name}>{fullName}</Text>
        {contact !== "" && <Text style={s.contact}>{contact}</Text>}
        <Text style={s.date}>{date}</Text>
        <View>
          {text
            .split(/\n\s*\n/)
            .map((p) => p.trim())
            .filter((p) => p !== "")
            .map((p, i) => (
              <Text key={i} style={s.paragraph}>
                {p}
              </Text>
            ))}
        </View>
      </Page>
    </Document>
  );
}
