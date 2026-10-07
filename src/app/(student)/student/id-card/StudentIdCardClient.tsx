"use client";

import { useState } from "react";
import { displaySectionName } from "@/lib/class-section-label";

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
  @page{size:A4 portrait;margin:0;}
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
  html,body{width:210mm!important;height:297mm!important;margin:0!important;padding:0!important;overflow:hidden!important;background:#fff!important;}
  body *{visibility:hidden!important;}
  #student-print-sheet,#student-print-sheet *{visibility:visible!important;}
  #student-print-sheet{
    position:fixed!important;
    inset:0!important;
    z-index:2147483647!important;
    box-sizing:border-box!important;
    width:210mm!important;
    height:297mm!important;
    margin:0!important;
    padding:15mm!important;
    display:flex!important;
    align-items:flex-start!important;
    justify-content:center!important;
    overflow:hidden!important;
    background:#fff!important;
  }
  #student-print-sheet .idc-card-stack{display:block!important;width:${W}px!important;height:${H * 2 + 24}px!important;}
  #student-print-sheet .idc-scene{width:${W}px!important;height:${H * 2 + 24}px!important;cursor:default!important;perspective:none!important;}
  #student-print-sheet .idc-inner{position:static!important;display:flex!important;width:${W}px!important;height:${H * 2 + 24}px!important;flex-direction:column!important;gap:24px!important;transform:none!important;transition:none!important;}
  #student-print-sheet .idc-face{position:relative!important;inset:auto!important;display:flex!important;flex:0 0 ${H}px!important;width:${W}px!important;height:${H}px!important;transform:none!important;backface-visibility:visible!important;-webkit-backface-visibility:visible!important;break-inside:avoid!important;page-break-inside:avoid!important;}
  #student-print-sheet .print-hide{display:none!important;}
}
`;

type Props = {
  student: {
    id: number;
    name: string;
    fatherName: string | null;
    phone: string | null;
    emergencyContact: string | null;
    profilePictureUrl: string | null;
    loginRollNumber: string;
    classRollNumber: string;
    className: string;
    sectionName: string;
  };
  institution: {
    name: string;
    logoKey: string;
    signatureKey: string | null;
  };
};

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

export function StudentIdCardClient({ student, institution }: Props) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div id="student-print-sheet">
      <style>{FLIP_CSS}</style>

      <div className="idc-card-stack" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <div
          className="idc-scene"
          style={{ width: W, height: H }}
          onClick={() => setFlipped((f) => !f)}
          title={flipped ? "Click to see front" : "Click to see back"}
        >
          <div className={`idc-inner${flipped ? " idc-flipped" : ""}`}>

            {/* FRONT */}
            <div className="idc-face" style={{ background: NAVY, backgroundImage: TEXTURE, fontFamily: FONT, color: "#fff", display: "flex", flexDirection: "column" }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: GOLD, zIndex: 1 }} />

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

              <div style={{ flex: 1, display: "flex", padding: "12px 14px 12px 17px" }}>
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
                <div style={{ flex: 1, overflow: "hidden" }}>
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
                <div style={{ display: "flex", gap: 1.5, alignItems: "flex-end", opacity: 0.2 }}>
                  {[10, 16, 10, 20, 12, 18, 10, 14, 20, 10, 16, 12].map((h, i) => (
                    <div key={i} style={{ width: 2, height: h, background: "#fff", borderRadius: 1 }} />
                  ))}
                </div>
              </div>
            </div>

            {/* BACK */}
            <div className="idc-face idc-back" style={{ background: LIGHT, fontFamily: FONT, border: `1px solid ${RULE}`, display: "flex", flexDirection: "column" }}>
              <div style={{ height: 3, background: GOLD, flexShrink: 0 }} />
              <div style={{ background: NAVY, padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <span style={{ fontSize: 7.5, fontWeight: 700, color: CREAM, letterSpacing: "0.1em", textTransform: "uppercase" as const }}>{student.name}</span>
                <span style={{ fontSize: 7, color: GOLD, letterSpacing: "0.06em" }}>{student.loginRollNumber.split('@')[0]}</span>
              </div>
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
        <div className="print-hide" style={{ fontSize: 10, color: "#aaa", letterSpacing: "0.04em" }}>
          {flipped ? "Back" : "Front"} · click to flip
        </div>

        {/* Print button */}
        <button
          className="print-hide mt-2 inline-flex items-center gap-2 rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          onClick={() => window.print()}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
          Print / Save as PDF
        </button>
      </div>
    </div>
  );
}
