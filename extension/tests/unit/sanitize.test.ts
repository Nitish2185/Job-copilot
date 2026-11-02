// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "@/lib/jobs/sanitize";

describe("sanitizeHtml", () => {
  it("removes scripts, handlers, forms, images and styles", () => {
    const html = sanitizeHtml(
      '<p style="color:red" onclick="x()">Hi<script>alert(1)</script></p><img src=x onerror=alert(1)><form><input></form><iframe src="https://evil"></iframe>',
    );
    expect(html).toBe("<p>Hi</p>");
  });

  it("keeps structure and makes links open safely in a new tab", () => {
    const html = sanitizeHtml(
      '<h3>Role</h3><ul><li>Go</li></ul><a href="https://acme.com">Acme</a><a href="javascript:alert(1)">bad</a>',
    );
    expect(html).toContain("<h3>Role</h3><ul><li>Go</li></ul>");
    expect(html).toContain(
      '<a href="https://acme.com" target="_blank" rel="noopener noreferrer">Acme</a>',
    );
    expect(html).not.toContain("javascript:");
  });
});
