import { getWhatsNew, formatWhatsNew } from "../src/whats-new.js";

describe("WhatsNew", () => {
  it("returns a result when CHANGELOG.md exists", () => {
    const wn = getWhatsNew();
    if (!wn) return; // skip if no changelog found
    expect(wn.version).toBeDefined();
    expect(typeof wn.version).toBe("string");
    expect(Array.isArray(wn.features)).toBe(true);
    expect(Array.isArray(wn.fixes)).toBe(true);
    expect(Array.isArray(wn.breaking)).toBe(true);
    expect(typeof wn.body).toBe("string");
  });

  it("formatWhatsNew produces output with version", () => {
    const wn = {
      version: "9.9.9",
      title: "9.9.9",
      features: ["add foo"],
      fixes: ["fix bar"],
      breaking: ["remove baz"],
      body: "",
    };
    const out = formatWhatsNew(wn);
    expect(out).toContain("9.9.9");
    expect(out).toContain("add foo");
    expect(out).toContain("fix bar");
    expect(out).toContain("remove baz");
  });

  it("formatWhatsNew escapes terminal control sequences", () => {
    const wn = {
      version: "9.9.9",
      title: "9.9.9",
      features: ["add foo\u001b[31mred\u001b[0m"],
      fixes: ["fix bar\u001b]8;;https://evil.example\u001b\\link"],
      breaking: ["remove baz\u001b[2K"],
      body: "",
    };
    const out = formatWhatsNew(wn);
    expect(out).not.toContain("\u001b");
    expect(out).toContain("add foo\\u001b[31mred\\u001b[0m");
    expect(out).toContain("fix bar\\u001b]8;;https://evil.example\\u001b\\link");
    expect(out).toContain("remove baz\\u001b[2K");
  });

  it("formatWhatsNew handles empty lists", () => {
    const wn = {
      version: "1.0.0",
      title: "1.0.0",
      features: [],
      fixes: [],
      breaking: [],
      body: "",
    };
    const out = formatWhatsNew(wn);
    expect(out).toContain("1.0.0");
    expect(out).not.toContain("Features:");
    expect(out).not.toContain("Fixes:");
    expect(out).not.toContain("BREAKING:");
  });
});
