// Minimal markdown-to-HTML for server-rendered news articles.
// Content comes exclusively from admin-controlled DB rows — dangerouslySetInnerHTML is safe here.
// Handles: h2, h3, bold, italic, links, unordered lists, tables, paragraphs.

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(text: string): string {
  let s = esc(text);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  s = s.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" style="color:#B26016;text-decoration:underline;text-underline-offset:3px">$1</a>'
  );
  s = s.replace(
    /`([^`]+)`/g,
    '<code style="background:#F3F4F6;border-radius:4px;padding:2px 6px;font-size:0.875em;font-family:ui-monospace,monospace">$1</code>'
  );
  return s;
}

function isTableSep(line: string): boolean {
  return /^\|[-|:\s]+\|$/.test(line.trim());
}

function parseTable(lines: string[]): string {
  const dataLines = lines.filter((l) => !isTableSep(l));
  if (dataLines.length === 0) return "";
  const [header, ...body] = dataLines;
  const cells = (row: string) =>
    row
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());

  const thRow = cells(header)
    .map(
      (c) =>
        `<th style="padding:10px 14px;text-align:left;font-size:13px;font-weight:600;border-bottom:1px solid #FDDCB0;white-space:nowrap">${inline(c)}</th>`
    )
    .join("");

  const trs = body
    .map((row) => {
      const tds = cells(row)
        .map(
          (c) =>
            `<td style="padding:9px 14px;font-size:14px;border-bottom:1px solid #F3F4F6">${inline(c)}</td>`
        )
        .join("");
      return `<tr>${tds}</tr>`;
    })
    .join("");

  return `<div style="overflow-x:auto;margin:16px 0"><table style="width:100%;border-collapse:collapse;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden"><thead><tr style="background:#FFF7ED">${thRow}</tr></thead><tbody>${trs}</tbody></table></div>`;
}

export function markdownToHtml(md: string): string {
  const lines = md.split("\n");
  const blocks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    if (t.startsWith("### ")) {
      blocks.push(
        `<h3 style="font-size:18px;font-weight:700;color:#111111;margin:24px 0 8px">${inline(t.slice(4))}</h3>`
      );
      i++;
      continue;
    }

    if (t.startsWith("## ")) {
      blocks.push(
        `<h2 style="font-size:22px;font-weight:800;color:#111111;margin:32px 0 12px">${inline(t.slice(3))}</h2>`
      );
      i++;
      continue;
    }

    if (t.startsWith("|")) {
      const tbl: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tbl.push(lines[i]);
        i++;
      }
      blocks.push(parseTable(tbl));
      continue;
    }

    if (t.startsWith("- ") || t.startsWith("* ")) {
      const items: string[] = [];
      while (
        i < lines.length &&
        (lines[i].trim().startsWith("- ") || lines[i].trim().startsWith("* "))
      ) {
        const content = lines[i].trim().slice(2);
        items.push(
          `<li style="margin-left:20px;font-size:15px;line-height:1.7;color:#374151">${inline(content)}</li>`
        );
        i++;
      }
      blocks.push(
        `<ul style="list-style:disc;margin:12px 0">${items.join("")}</ul>`
      );
      continue;
    }

    if (t === "") {
      i++;
      continue;
    }

    // Paragraph — consume consecutive non-special lines
    const pLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].trim().startsWith("#") &&
      !lines[i].trim().startsWith("|") &&
      !lines[i].trim().startsWith("- ") &&
      !lines[i].trim().startsWith("* ")
    ) {
      pLines.push(inline(lines[i].trim()));
      i++;
    }
    if (pLines.length > 0) {
      blocks.push(
        `<p style="font-size:15px;line-height:1.75;color:#374151;margin:12px 0">${pLines.join("<br />")}</p>`
      );
    }
  }

  return blocks.join("\n");
}
