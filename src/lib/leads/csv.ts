/**
 * Minimal RFC4180-ish CSV reader.
 *
 * Written by hand rather than pulled in as a dependency because the only hard
 * requirement is "read a spreadsheet an admin exported from another CRM", and
 * that export is almost always quoted-comma, CRLF, BOM-prefixed, and has an
 * embedded newline in at least one Notes cell.
 */

/** Strip a UTF-8 BOM — Excel writes one and it corrupts the first header. */
export function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

export function detectDelimiter(sample: string): string {
  const line = sample.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = -1;
  for (const d of candidates) {
    // Count only delimiters outside quotes.
    let count = 0;
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') inQ = !inQ;
      else if (ch === d && !inQ) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

/** Parse a delimited file into a header row plus record objects. */
export function parseDelimited(text: string, delimiter?: string): Record<string, string>[] {
  const clean = stripBom(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const d = delimiter ?? detectDelimiter(clean);

  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];

    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === d) {
      record.push(field);
      field = "";
    } else if (ch === "\n") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || record.length) {
    record.push(field);
    records.push(record);
  }

  const nonEmpty = records.filter((r) => r.some((c) => c.trim() !== ""));
  if (!nonEmpty.length) return [];

  const headers = nonEmpty[0].map((h, i) => h.trim() || `Column ${i + 1}`);

  const rows: Record<string, string>[] = [];
  for (let r = 1; r < nonEmpty.length; r++) {
    const cells = nonEmpty[r];
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = (cells[c] ?? "").trim();
    }
    rows.push(obj);
  }
  return rows;
}

export function parseCsv(text: string): Record<string, string>[] {
  return parseDelimited(text, ",");
}
