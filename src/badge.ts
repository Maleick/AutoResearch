import { basename, dirname, relative, sep } from "path";

const xmlEscapes: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

const escapeXml = (value: string): string => value.replace(/[&<>"']/g, (char) => xmlEscapes[char]!);

const markdownEscapes: Record<string, string> = {
  "\\": "\\\\",
  "`": "\\`",
  "*": "\\*",
  "_": "\\_",
  "{": "\\{",
  "}": "\\}",
  "[": "\\[",
  "]": "\\]",
  "(": "\\(",
  ")": "\\)",
  "#": "\\#",
  "+": "\\+",
  "-": "\\-",
  ".": "\\.",
  "!": "\\!",
  "|": "\\|",
};

const escapeMarkdown = (value: string): string => value.replace(/[\\`*_{}\[\]()#+\-.!|]/g, (char) => markdownEscapes[char]!);

export function slugifyBadgeToken(value: string): string {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "component";
}

export function pickBadgeColor(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio)) return "#007ec6";
  if (ratio >= 0.9) return "#4c1";
  if (ratio >= 0.75) return "#97ca00";
  if (ratio >= 0.5) return "#dfb317";
  return "#e05d44";
}

export function renderBadgeSvg(label: string, value: string, color: string): string {
  const safeLabel = String(label).trim() || "score";
  const safeValue = String(value).trim() || "—";
  const labelWidth = Math.max(40, 10 + safeLabel.length * 7);
  const valueWidth = Math.max(40, 10 + safeValue.length * 7);
  const totalWidth = labelWidth + valueWidth;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${escapeXml(safeLabel)}: ${escapeXml(safeValue)}"><linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".7"/><stop offset=".1" stop-color="#aaa" stop-opacity=".1"/><stop offset=".9" stop-color="#000" stop-opacity=".3"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></linearGradient><clipPath id="r"><rect width="${totalWidth}" height="20" rx="3" fill="#fff"/></clipPath><g clip-path="url(#r)"><rect width="${labelWidth}" height="20" fill="#555"/><rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${escapeXml(color)}"/><rect width="${totalWidth}" height="20" fill="url(#s)"/></g><g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11"><text x="${Math.floor(labelWidth / 2)}" y="15" fill="#010101" fill-opacity=".3">${escapeXml(safeLabel)}</text><text x="${Math.floor(labelWidth / 2)}" y="14">${escapeXml(safeLabel)}</text><text x="${labelWidth + Math.floor(valueWidth / 2)}" y="15" fill="#010101" fill-opacity=".3">${escapeXml(safeValue)}</text><text x="${labelWidth + Math.floor(valueWidth / 2)}" y="14">${escapeXml(safeValue)}</text></g></svg>`;
}

export function renderBadgeMarkdown(label: string, value: string, svgPath: string, markdownPath: string): string {
  const relativeSvgPath = relative(dirname(markdownPath), svgPath).split(sep).join("/") || basename(svgPath);
  return `![${escapeMarkdown(`${label}: ${value}`)}](${escapeMarkdown(relativeSvgPath)})`;
}
