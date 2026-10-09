export function StudentCardQr({ image }: { image: string }) {
  return (
    <div style={{ flexShrink: 0, width: 96, textAlign: "center" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt="Scan to verify this student" width={96} height={96} style={{ display: "block", background: "#fff" }} />
      <span style={{ display: "block", marginTop: 2, fontSize: 7, color: "#635b50" }}>Scan to verify</span>
    </div>
  );
}
