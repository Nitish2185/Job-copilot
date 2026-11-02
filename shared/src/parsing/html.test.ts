import { describe, expect, it } from "vitest";
import { z } from "zod";
import data from "../../testcases/html.cases.json";
import { goldenCases } from "../testcases";
import { htmlToText, plainText } from "./html";

const cases = goldenCases(z.object({ html: z.string(), text: z.string() }), data);

describe("htmlToText golden cases", () => {
  it.each(cases.map((c) => [c.html.slice(0, 50), c] as const))("%j", (_label, c) => {
    expect(htmlToText(c.html)).toBe(c.text);
  });
});

describe("plainText", () => {
  it("collapses whitespace per line and drops empty lines", () => {
    expect(plainText("A  World\r\n \r\n Changing\tCompany ")).toBe("A World\nChanging Company");
  });
});
