"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import { displaySectionName, formatClassSection } from "@/lib/class-section-label";

type PickerStudent = { id: number; name: string; classRollNumber: string; className: string; sectionName: string };
type CardStudent = PickerStudent & {
  fatherName: string | null;
  phone: string | null;
  emergencyContact: string | null;
  profilePictureUrl: string | null;
  loginRollNumber: string;
};
type CardData = {
  institution: { name: string; logoKey: string; signatureKey: string | null; address: string; contactPhone: string };
  students: CardStudent[];
};

const MAX_SELECTION = 200;
const SEARCH_DEBOUNCE_MS = 300;

const W = 380;
const H = 240;

const NAVY  = "#0E1E3D";
const GOLD  = "#B8963E";
const CREAM = "#F5F0E8";
const LIGHT = "#FAFAF9";
const RULE  = "#E4DDD1";
const MUTED = "#8A8070";
const DARK  = "#1C1612";
const FONT  = "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif";
const TEXTURE = `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 20L20 0' stroke='rgba(255,255,255,0.025)' stroke-width='1'/%3E%3C/svg%3E")`;

const FLIP_CSS = `
.idc-scene{perspective:1200px;cursor:pointer;user-select:none;-webkit-user-select:none;}
.idc-inner{position:relative;width:${W}px;height:${H}px;transform-style:preserve-3d;transition:transform .55s cubic-bezier(.4,0,.2,1);}
.idc-inner.idc-flipped{transform:rotateY(180deg);}
.idc-face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;border-radius:12px;overflow:hidden;}
.idc-back{transform:rotateY(180deg);}
@media print{
  @page{size:A4 portrait;margin:10mm;}
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
  .idc-card{width:${W}px!important;height:${H * 2 + 16}px!important;gap:0!important;break-inside:avoid!important;page-break-inside:avoid!important;}
  .idc-scene{width:${W}px!important;height:${H * 2 + 16}px!important;cursor:default;}
  .idc-inner{position:static!important;display:flex!important;width:${W}px!important;height:${H * 2 + 16}px!important;flex-direction:column!important;gap:16px!important;transform:none!important;}
  .idc-face{position:relative!important;transform:none!important;break-inside:avoid;width:${W}px;height:${H}px;}
  .idc-hint{display:none!important;}
}
`;

function PhoneIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.7 12 19.79 19.79 0 0 1 1.62 3.38 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.37a16 16 0 0 0 5.72 5.72l.94-.94a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function N360Mark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/Logo.png" alt="Nisaab360" style={{ width: 22, height: 22, objectFit: "contain", flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 7.5, fontWeight: 700, color: NAVY, letterSpacing: "0.04em", lineHeight: 1 }}>Nisaab360</div>
        <div style={{ fontSize: 6, color: MUTED, letterSpacing: "0.06em", lineHeight: 1.2 }}>Student Platform</div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 6.5, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 1.5 }}>{label}</div>
      <div style={{ fontSize: 10, fontWeight: 600, color: CREAM }}>{value}</div>
    </div>
  );
}

function ContactRow({ Icon, label, value }: { Icon: () => React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
      <div style={{ paddingTop: 2, flexShrink: 0 }}><Icon /></div>
      <div>
        <div style={{ fontSize: 7, color: MUTED, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 1 }}>{label}</div>
        <div style={{ fontSize: 11, fontWeight: 600, color: DARK }}>{value}</div>
      </div>
    </div>
  );
}

/* ── ID Card with 3-D flip ──────────────────────────────────────────────────── */
export function IdCard({ student, institution }: { student: CardStudent; institution: CardData["institution"] }) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div className="idc-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      {/* Scene wrapper */}
      <div
        className="idc-scene"
        style={{ width: W, height: H }}
        onClick={() => setFlipped((f) => !f)}
        title={flipped ? "Click to see front" : "Click to see back"}
      >
        <div className={`idc-inner${flipped ? " idc-flipped" : ""}`}>

          {/* ── FRONT face ── */}
          <div className="idc-face" style={{ background: NAVY, backgroundImage: TEXTURE, fontFamily: FONT, color: "#fff", display: "flex", flexDirection: "column" }}>
            {/* Gold left-edge bar */}
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: GOLD, zIndex: 1 }} />

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px 10px 17px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              {institution.logoKey && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={institution.logoKey} alt="" style={{ height: 22, width: 22, objectFit: "contain", borderRadius: 3, flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: CREAM, textTransform: "uppercase" as const, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {institution.name}
                </div>
              </div>
              <div style={{ fontSize: 6.5, fontWeight: 600, color: GOLD, letterSpacing: "0.14em", textTransform: "uppercase" as const, flexShrink: 0 }}>Student ID</div>
            </div>

            {/* Body */}
            <div style={{ flex: 1, display: "flex", padding: "12px 14px 12px 17px" }}>
              {/* Photo */}
              <div style={{ width: 68, height: 85, borderRadius: 6, overflow: "hidden", flexShrink: 0, marginRight: 14, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {student.profilePictureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={student.profilePictureUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                  </svg>
                )}
              </div>
              {/* Info */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", overflow: "hidden" }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", lineHeight: 1.2, marginBottom: 3 }}>{student.name}</div>
                  {student.fatherName && (
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", marginBottom: 10 }}>{student.fatherName}</div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: 7, columnGap: 12 }}>
                    <Field label="Class" value={student.className} />
                    {displaySectionName(student.sectionName) && (
                      <Field label="Section" value={displaySectionName(student.sectionName)} />
                    )}
                    <Field label="Roll No." value={student.classRollNumber} />
                    <Field label="Universal ID" value={student.loginRollNumber.split('@')[0]} />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: "7px 14px 7px 17px", borderTop: "1px solid rgba(255,255,255,0.07)", background: "rgba(0,0,0,0.18)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                {institution.signatureKey ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={institution.signatureKey} alt="Principal Signature" style={{ height: 22, maxWidth: 80, objectFit: "contain", filter: "brightness(0) invert(1)", opacity: 0.7 }} />
                    <div style={{ fontSize: 6, color: "rgba(255,255,255,0.35)", letterSpacing: "0.12em", textTransform: "uppercase" as const }}>Principal</div>
                  </>
                ) : (
                  <>
                    <div style={{ width: 72, borderBottom: "1px solid rgba(255,255,255,0.2)", marginBottom: 2 }} />
                    <div style={{ fontSize: 6, color: "rgba(255,255,255,0.3)", letterSpacing: "0.12em", textTransform: "uppercase" as const }}>Principal</div>
                  </>
                )}
              </div>
              {/* Decorative barcode stripes */}
              <div style={{ display: "flex", gap: 1.5, alignItems: "flex-end", opacity: 0.2 }}>
                {[10, 16, 10, 20, 12, 18, 10, 14, 20, 10, 16, 12].map((h, i) => (
                  <div key={i} style={{ width: 2, height: h, background: "#fff", borderRadius: 1 }} />
                ))}
              </div>
            </div>
          </div>

          {/* ── BACK face ── */}
          <div className="idc-face idc-back" style={{ background: LIGHT, fontFamily: FONT, border: `1px solid ${RULE}`, display: "flex", flexDirection: "column" }}>
            {/* Gold top strip */}
            <div style={{ height: 3, background: GOLD, flexShrink: 0 }} />
            {/* Dark header */}
            <div style={{ background: NAVY, padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <span style={{ fontSize: 7.5, fontWeight: 700, color: CREAM, letterSpacing: "0.1em", textTransform: "uppercase" as const }}>{student.name}</span>
              <span style={{ fontSize: 7, color: GOLD, letterSpacing: "0.06em" }}>{student.loginRollNumber.split('@')[0]}</span>
            </div>
            {/* Body */}
            <div style={{ flex: 1, padding: "14px 16px 12px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <ContactRow Icon={PhoneIcon} label="Student Contact" value={student.phone || "Not provided"} />
                <ContactRow Icon={ShieldIcon} label="Emergency Contact" value={student.emergencyContact || "Not provided"} />
              </div>
              <div style={{ height: 1, background: RULE, margin: "4px 0" }} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <N360Mark />
                <div style={{ fontSize: 14, color: RULE }}>·</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {institution.logoKey && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={institution.logoKey} alt="" style={{ height: 20, maxWidth: 50, objectFit: "contain" }} />
                  )}
                  <div style={{ fontSize: 7.5, fontWeight: 700, color: DARK, maxWidth: 90, textAlign: "right" as const, lineHeight: 1.3 }}>
                    {institution.name}
                  </div>
                </div>
              </div>
            </div>
            {/* Verified strip */}
            <div style={{ padding: "5px 16px", background: CREAM, borderTop: `1px solid ${RULE}`, display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span style={{ fontSize: 7, fontWeight: 700, color: MUTED, letterSpacing: "0.1em", textTransform: "uppercase" as const }}>
                Verified Student — Nisaab360
              </span>
            </div>
          </div>

        </div>
      </div>
      {/* Flip hint */}
      <div className="idc-hint" style={{ fontSize: 10, color: "#aaa", letterSpacing: "0.04em" }}>
        {flipped ? "Back" : "Front"} · click to flip
      </div>
    </div>
  );
}

/* ── Main client component ──────────────────────────────────────────────────── */
export function IdCardsClient({ initialStudentId }: { initialStudentId?: number }) {
  const [query, setQuery] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [results, setResults] = useState<PickerStudent[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<number[]>(initialStudentId ? [initialStudentId] : []);
  const [selectedDetails, setSelectedDetails] = useState<Map<number, PickerStudent>>(new Map());
  const [cardData, setCardData] = useState<CardData | null>(null);
  const [loading, setLoading] = useState(Boolean(initialStudentId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialStudentId) return;
    api.get<CardData>(`/api/institution/students/id-cards?studentIds=${initialStudentId}`)
      .then((data) => {
        setCardData(data);
        const s = data.students[0];
        if (s) setSelectedDetails(new Map([[s.id, { id: s.id, name: s.name, classRollNumber: s.classRollNumber, className: s.className, sectionName: s.sectionName }]]));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load id card"))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!query.trim()) return;
    let ignore = false;
    const timer = setTimeout(() => {
      fetch(`/api/institution/students/picker?${new URLSearchParams({ q: query.trim() })}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { students: PickerStudent[] } | null) => {
          if (ignore) return;
          const rows = data?.students ?? [];
          setResults(rows);
          setHasSearched(true);
          setSelectedDetails((prev) => { const next = new Map(prev); for (const r of rows) next.set(r.id, r); return next; });
        })
        .catch(() => { if (!ignore) setResults([]); })
        .finally(() => { if (!ignore) setSearching(false); });
    }, SEARCH_DEBOUNCE_MS);
    return () => { ignore = true; clearTimeout(timer); };
  }, [query]);

  const toggle = (s: PickerStudent) => {
    setSelected((items) => items.includes(s.id) ? items.filter((i) => i !== s.id) : [...items, s.id]);
    setSelectedDetails((prev) => { if (prev.has(s.id)) return prev; const next = new Map(prev); next.set(s.id, s); return next; });
  };

  const generate = async () => {
    if (!selected.length) return;
    setLoading(true); setError(null);
    try { setCardData(await api.get<CardData>(`/api/institution/students/id-cards?studentIds=${selected.join(",")}`)); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed"); }
    finally { setLoading(false); }
  };

  const selectedList = useMemo(
    () => selected.map((id) => selectedDetails.get(id)).filter((s): s is PickerStudent => Boolean(s)),
    [selected, selectedDetails]
  );
  const selectedStudents = cardData?.students.filter((s) => selected.includes(s.id)) || [];

  return (
    <div className="space-y-6">
      <style>{`
        ${FLIP_CSS}
        @media print {
          html, body { width: 100% !important; min-height: 0 !important; overflow: visible !important; background: white !important; }
          body * { visibility: hidden !important; }
          #print-cards {
            visibility: visible !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            display: grid !important;
            grid-template-columns: ${W}px !important;
            justify-content: center !important;
            align-items: start !important;
            gap: 10mm !important;
            overflow: visible !important;
          }
          #print-cards * {
            visibility: visible !important;
          }
          #print-cards > div {
            width: ${W}px !important;
            height: ${H * 2 + 16}px !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setResults([]); setHasSearched(false); setSearching(Boolean(e.target.value.trim())); }}
          placeholder="Search by name, roll no. or class…"
          className="w-full max-w-sm rounded-md border border-border px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <button
            className="rounded-lg bg-brand-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            disabled={!selected.length || selected.length > MAX_SELECTION || loading}
            onClick={generate}
          >
            {loading ? "Loading…" : `Preview (${selected.length})`}
          </button>
          {cardData && selectedStudents.length > 0 && (
            <button className="rounded-lg border border-brand-300 px-4 py-2 text-sm font-semibold text-brand-800 hover:bg-brand-50" onClick={() => window.print()}>
              Print
            </button>
          )}
        </div>
      </div>

      {selected.length > MAX_SELECTION && <p className="text-sm text-red-600">Select at most {MAX_SELECTION} students.</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {selectedList.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedList.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 border border-brand-200 px-3 py-1 text-xs font-medium text-brand-800">
              {s.name}
              <button type="button" onClick={() => toggle(s)} className="text-brand-400 hover:text-brand-800">&times;</button>
            </span>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-sm border border-border bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-stone-50 text-left">
            <tr><th className="p-3" /><th className="p-3">Student</th><th className="p-3">Class</th><th className="p-3">Roll no.</th></tr>
          </thead>
          <tbody>
            {searching && results.length === 0 && Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-t"><td className="p-3" colSpan={4}><div className="h-4 animate-pulse rounded bg-stone-100" /></td></tr>
            ))}
            {!searching && !query.trim() && (
              <tr><td className="p-4 text-center text-stone-500" colSpan={4}>Type a name, roll no. or class to search.</td></tr>
            )}
            {!searching && query.trim() && hasSearched && results.length === 0 && (
              <tr><td className="p-4 text-center text-stone-500" colSpan={4}>No students found.</td></tr>
            )}
            {results.map((s) => (
              <tr key={s.id} className="border-t hover:bg-stone-50 cursor-pointer" onClick={() => toggle(s)}>
                <td className="p-3"><input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s)} onClick={(e) => e.stopPropagation()} /></td>
                <td className="p-3 font-medium">{s.name}</td>
                <td className="p-3">{formatClassSection(s.className, s.sectionName, " — ")}</td>
                <td className="p-3">{s.classRollNumber}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cardData && selectedStudents.length > 0 && (
        <div>
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-stone-400">Preview — click a card to flip</p>
          <div className="flex flex-wrap gap-10 justify-center">
            {selectedStudents.map((s) => <IdCard key={s.id} student={s} institution={cardData.institution} />)}
          </div>
        </div>
      )}

      <div id="print-cards" style={{ display: "none" }}>
        {selectedStudents.map((s) => (
          <div key={s.id} style={{ display: "inline-block", verticalAlign: "top" }}>
            {cardData && <IdCard student={s} institution={cardData.institution} />}
          </div>
        ))}
      </div>
    </div>
  );
}
