"use client";

import Link from "next/link";

const pageStyle = {
  alignItems: "center",
  background: "#f7f8fa",
  color: "#0b1f44",
  display: "flex",
  fontFamily: "Arial, sans-serif",
  justifyContent: "center",
  margin: 0,
  minHeight: "100vh",
  padding: "24px",
} as const;

const cardStyle = {
  background: "#ffffff",
  borderRadius: "24px",
  boxShadow: "0 12px 40px rgba(11, 31, 68, 0.10)",
  maxWidth: "560px",
  padding: "32px 24px",
  textAlign: "center",
  width: "100%",
} as const;

const actionStyle = {
  alignItems: "center",
  background: "#f36f21",
  border: 0,
  borderRadius: "999px",
  color: "#ffffff",
  cursor: "pointer",
  display: "inline-flex",
  fontSize: "16px",
  fontWeight: 700,
  justifyContent: "center",
  marginTop: "24px",
  minHeight: "48px",
  padding: "12px 24px",
  width: "100%",
} as const;

export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body style={pageStyle}>
        <title>Something went wrong | Dovid Logistics</title>
        <main style={cardStyle}>
          <p style={{ color: "#f36f21", fontSize: "14px", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Dovid Logistics</p>
          <h1 style={{ fontSize: "30px", lineHeight: 1.2, margin: "16px 0 0" }}>We could not open the app</h1>
          <p style={{ color: "#526174", fontSize: "16px", lineHeight: 1.7, margin: "16px 0 0" }}>
            Your information is safe. Check your connection and try again.
          </p>
          <button type="button" onClick={retry} style={actionStyle}>Try again</button>
          <Link href="/" style={{ color: "#0b1f44", display: "inline-flex", fontWeight: 700, marginTop: "18px", minHeight: "44px", padding: "12px" }}>Return to the homepage</Link>
        </main>
      </body>
    </html>
  );
}
