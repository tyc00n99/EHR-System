/**
 * Names for downloaded note PDFs (Sept 29, 2026, the user's pick "1" of three): plain words a person
 * recognises in Downloads or as an email attachment, the same text as the PDF's own title.
 *
 *   Service note - Harold Lindqvist - Sep 9, 2026
 *   Service notes - Harold Lindqvist - Sep 6 to Sep 19, 2026
 *   Service notes - 3 clients - Dec 28, 2025 to Jan 3, 2026
 */
const md = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const mdy = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const at = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** "Sep 9, 2026", "Sep 6 to Sep 19, 2026", or "Dec 28, 2025 to Jan 3, 2026". */
export function spanLabel(from: string, to: string): string {
  if (from === to) return mdy.format(at(from));
  return from.slice(0, 4) === to.slice(0, 4) ? `${md.format(at(from))} to ${mdy.format(at(to))}` : `${mdy.format(at(from))} to ${mdy.format(at(to))}`;
}

export function notesDocName({ clients, from, to, count }: { clients: string[]; from: string; to: string; count: number }): string {
  const who = clients.length === 1 ? clients[0] : `${clients.length} clients`;
  return `${count === 1 ? "Service note" : "Service notes"} - ${who} - ${spanLabel(from, to)}`;
}

/**
 * A Content-Disposition header carrying the name. `filename` is kept to plain ASCII (accents folded,
 * characters no file system accepts removed) because older browsers and our DownloadButton read that one;
 * `filename*` carries the exact name for everything that understands it.
 */
export function pdfDisposition(kind: "inline" | "attachment", name: string): string {
  const clean = name.replace(/[\\/:*?"<>|]+/g, "").trim();
  const ascii = clean.normalize("NFKD").replace(/[^\x20-\x7e]/g, "");
  return `${kind}; filename="${ascii}.pdf"; filename*=UTF-8''${encodeURIComponent(`${clean}.pdf`)}`;
}
