// Builds the fictional sample resume fixtures (PDF and DOCX) used by tests.
// The person, companies and contact details are made up.
//   node extension/tests/fixtures/make-resume-fixtures.mjs
import { writeFileSync } from "node:fs";
import { crc32 } from "node:zlib";

const LINES = [
  "Aarav Mehta",
  "aarav.mehta@example.com | +91 99999 01234 | Pune, India",
  "github.com/aarav-dev | linkedin.com/in/aarav-mehta-example",
  "",
  "Summary",
  "Full-stack developer with 4 years of experience building React and Node.js applications.",
  "",
  "Experience",
  "Software Engineer, Example Fintech Pvt Ltd (Jul 2022 - Present)",
  "- Built payment dashboards with React, TypeScript and Node.js",
  "- Reduced API latency by 30% using Redis caching",
  "Junior Developer, Sample Labs (Jun 2020 - Jun 2022)",
  "- Developed REST APIs in Express and MongoDB",
  "",
  "Education",
  "B.Tech Computer Science, Example Institute of Technology, 2016 - 2020",
  "",
  "Projects",
  "Job Board - a job listing app built with Next.js and PostgreSQL",
  "",
  "Skills",
  "JavaScript, TypeScript, React, Node.js, Express, MongoDB, PostgreSQL, Redis, Docker",
];

const dir = new URL(".", import.meta.url);

function buildPdf() {
  const escape = (s) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const text = LINES.map((l) => `(${escape(l)}) Tj T*`).join("\n");
  const stream = `BT\n/F1 11 Tf\n14 TL\n50 750 Td\n${text}\nET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/** Minimal ZIP writer (stored entries, no compression). */
function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const data = Buffer.from(content, "utf8");
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc >>> 0, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

function buildDocx() {
  const xmlEscape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const paragraphs = LINES.map(
    (l) => `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(l)}</w:t></w:r></w:p>`,
  ).join("");
  return zip([
    [
      "[Content_Types].xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ],
    [
      "_rels/.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ],
    [
      "word/document.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}</w:body></w:document>`,
    ],
  ]);
}

writeFileSync(new URL("resume-fictional.pdf", dir), buildPdf());
writeFileSync(new URL("resume-fictional.docx", dir), buildDocx());
writeFileSync(new URL("resume-fictional.txt", dir), `${LINES.join("\n")}\n`);
console.log("wrote resume-fictional.pdf, .docx and .txt");
