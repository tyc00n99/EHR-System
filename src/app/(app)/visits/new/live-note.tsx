"use client";

import localFont from "next/font/local";
import { cx } from "@/components/kit";

// The printed note's face, so the preview reads like the page it becomes (Charter, as in the PDF).
const charter = localFont({ src: [{ path: "../../../../fonts/Charter-regular.ttf", weight: "400" }, { path: "../../../../fonts/Charter-bold.ttf", weight: "700" }] });
const script = localFont({ src: "../../../../fonts/GreatVibes-Regular.ttf" });

export interface LiveNoteData {
  org: string; license: string | null;
  client: string; pmi: string; dob: string | null;
  setting: string; service: string; code: string;
  date: string; inTime: string; outTime: string; hours: string;
  caregiver: string; renderingId: string;
  narrative: string; supports: string[];
  outcomes: { prompt: string; goal: string; answer: string }[];
  worked: string[];
  level: string; activities: string[];
  meds: { label: string; status: string }[];
  incident: string;
  reason: string;
  focus: string | null;
}

const LABEL = "text-[7.5px] font-bold uppercase tracking-[0.16em]";
const SECTION = "mb-1.5 mt-4 text-[8px] font-bold uppercase tracking-[0.18em] text-[#223a7a]";
const EMPTY = "italic text-[#b0b0b0]";
const fmtTime = (t: string) => { if (!/^\d{2}:\d{2}$/.test(t)) return ""; const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
const fmtDate = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}` : "");

/**
 * The note as it will print, drawn from the form as it is typed (Sept 29, 2026, the user's "format 3").
 * It mirrors `notes-pdf.tsx` — same order, labels and two columns — at screen size; the section being
 * edited is lit so the eye can find it. Empty parts say what goes there instead of leaving a gap.
 */
export function LiveNote({ d }: { d: LiveNoteData }) {
  const lit = (key: string) => cx("rounded-sm transition-colors", d.focus === key && "bg-[#fff4c2] shadow-[0_0_0_3px_#fff4c2]");
  const fact = (k: string, v: React.ReactNode) => (
    <div className="grid grid-cols-[84px_1fr] items-baseline gap-2 border-b border-[#ececec] py-[5px]"><span className={LABEL}>{k}</span><span className="text-[12px]">{v}</span></div>
  );
  return (
    <div className={cx(charter.className, "mx-auto w-full max-w-[680px] bg-white px-10 py-9 text-black shadow-[0_2px_14px_rgba(0,0,0,0.12)]")}>
      <div className="flex items-end justify-between border-b-[1.5px] border-black pb-1.5">
        <div className="text-[21px] font-bold">Daily Service Note</div>
        <div className="text-[7.5px] font-bold uppercase tracking-[0.2em]">{d.org}{d.license ? ` · 245D license ${d.license}` : ""}</div>
      </div>

      <div className={cx("mt-2 grid grid-cols-2 gap-x-7 border-b border-[#d8d8d8] pb-2", lit("visit"))}>
        <div>
          {fact("Client", d.client ? <><b>{d.client}</b><span className="text-[10px]"> · PMI {d.pmi}</span></> : <span className={EMPTY}>Choose the client</span>)}
          {fact("Date of birth", d.dob ? fmtDate(d.dob) : "—")}
          {fact("Setting", d.setting)}
          {fact("Service", d.service ? <>{d.service}, <b>{d.code}</b></> : <span className={EMPTY}>Choose the service</span>)}
        </div>
        <div>
          {fact("Date · time", d.date && d.inTime && d.outTime ? <><b>{fmtDate(d.date)}</b> · {fmtTime(d.inTime)} – {fmtTime(d.outTime)}</> : <span className={EMPTY}>Date and times</span>)}
          {fact("Hours · units", d.hours ? <b>{d.hours}</b> : "—")}
          {fact("Caregiver", d.caregiver ? <>{d.caregiver}<span className="text-[10px]"> · {d.renderingId}</span></> : <span className={EMPTY}>Choose the caregiver</span>)}
        </div>
      </div>

      <div className="grid grid-cols-[1.55fr_1fr] gap-6">
        <div>
          <div className={SECTION}>Service narrative</div>
          <p className={cx("whitespace-pre-line text-[13px] leading-[1.55]", lit("narrative"))}>{d.narrative || <span className={EMPTY}>What happened during the visit appears here as you type it.</span>}</p>
          <div className={SECTION}>Supports provided</div>
          <div className={cx("flex flex-wrap gap-1", lit("supports"))}>{d.supports.length ? d.supports.map((s) => <span key={s} className="rounded-full bg-[#f1f1f1] px-2 py-0.5 text-[9.5px] font-bold">{s}</span>) : <span className={cx(EMPTY, "text-[11px]")}>None chosen</span>}</div>
          <div className={SECTION}>Support plan outcomes{d.outcomes.length + d.worked.length ? ` · ${d.outcomes.length + d.worked.length} addressed` : ""}</div>
          <div className={lit("outcomes")}>
            {d.outcomes.length + d.worked.length === 0 ? <span className={cx(EMPTY, "text-[11px]")}>No outcomes answered</span> : (<>
              {d.worked.map((w) => <div key={w} className="flex gap-2 py-0.5 text-[11.5px]"><span className="w-7 shrink-0 text-[8px] font-bold text-[#15803d]">•</span><span>{w}<span className="block text-[9.5px] text-[#666]">Worked on during this visit.</span></span></div>)}
              {d.outcomes.map((o) => <div key={o.prompt} className="flex gap-2 py-0.5 text-[11.5px]"><span className={cx("w-7 shrink-0 pt-[2px] text-[8px] font-bold", o.answer === "yes" ? "text-[#15803d]" : "text-[#b42318]")}>{o.answer === "yes" ? "YES" : "NO"}</span><span>{o.prompt}<span className="block text-[9.5px] text-[#666]">{o.goal}</span></span></div>)}
            </>)}
          </div>
        </div>
        <div className="border-l border-[#dcdcdc] pl-4">
          <div className={SECTION}>Level of assistance</div>
          <div className={cx("text-[12px]", lit("level"))}>{d.level || <span className={EMPTY}>Not chosen</span>}</div>
          <div className={SECTION}>Daily activities</div>
          <div className={lit("activities")}>{d.activities.length ? d.activities.map((a) => <div key={a} className="text-[10.5px] leading-snug">• {a}</div>) : <span className={cx(EMPTY, "text-[11px]")}>None chosen</span>}</div>
          <div className={SECTION}>Medication administration</div>
          <div className={lit("meds")}>{d.meds.length ? d.meds.map((m) => <div key={m.label} className={cx("text-[10.5px]", m.status && m.status !== "given" && "text-[#b42318]")}>{m.label}{m.status ? ` · ${m.status}` : ""}</div>) : <span className={cx(EMPTY, "text-[11px]")}>None recorded</span>}</div>
          <div className={SECTION}>Incidents</div>
          <div className={cx("text-[12px]", d.incident && "text-[#b42318]", lit("incident"))}>{d.incident || "None reported"}</div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-6 border-t border-[#d8d8d8] pt-3">
        {[["Caregiver", d.caregiver], ["Client", d.client]].map(([who, name]) => (
          <div key={who} className="border-l-2 border-[#dcdcdc] pl-2">
            <div className="text-[7px] font-bold tracking-[0.1em] text-[#bbb]">AWAITING SIGNATURE · {who.toUpperCase()}</div>
            <div className={cx(script.className, "text-[24px] leading-tight text-[#dcdcdc]")}>{name || " "}</div>
          </div>
        ))}
      </div>

      <div className={cx("mt-4 flex items-center gap-2 rounded bg-[#f4f4f4] px-3 py-1.5", lit("reason"))}>
        <span className="text-[6.5px] font-bold uppercase tracking-[0.12em] text-[#888]">Visit verification</span>
        <span className="text-[10.5px] font-bold">Manual entry · {d.reason || <span className={EMPTY}>why it was entered manually</span>}</span>
      </div>
    </div>
  );
}
