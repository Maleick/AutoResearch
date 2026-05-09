import { resolve } from "path";
import { fileURLToPath } from "url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");

const importBadge = async () => await import(resolve(REPO_ROOT, "dist/badge.js"));

describe("badge rendering", () => {
  it("renders deterministic SVG output", async () => {
    const mod = await importBadge();
    const svg = mod.renderBadgeSvg("score", "8/10", "#97ca00");
    expect(svg).toBe('<svg xmlns="http://www.w3.org/2000/svg" width="85" height="20" role="img" aria-label="score: 8/10"><linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".7"/><stop offset=".1" stop-color="#aaa" stop-opacity=".1"/><stop offset=".9" stop-color="#000" stop-opacity=".3"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></linearGradient><clipPath id="r"><rect width="85" height="20" rx="3" fill="#fff"/></clipPath><g clip-path="url(#r)"><rect width="45" height="20" fill="#555"/><rect x="45" width="40" height="20" fill="#97ca00"/><rect width="85" height="20" fill="url(#s)"/></g><g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11"><text x="22" y="15" fill="#010101" fill-opacity=".3">score</text><text x="22" y="14">score</text><text x="65" y="15" fill="#010101" fill-opacity=".3">8/10</text><text x="65" y="14">8/10</text></g></svg>');
    expect(mod.renderBadgeSvg("score", "8/10", "#97ca00")).toBe(svg);
  });
});
