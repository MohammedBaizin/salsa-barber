"use client";

/** Last-resort error page: its own document with inline styles (the root layout and CSS may have failed). */
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en-GB">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0b",
          color: "#f5f3ee",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <main>
          <h1 style={{ fontSize: "2rem", margin: 0 }}>Something went wrong</h1>
          <p style={{ marginTop: "1rem", color: "#a8a49c" }}>Please try again, or call Salsa Barber on 0151 309 4681.</p>
          <p style={{ marginTop: "2rem", display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => retry()}
              style={{ minHeight: 44, padding: "0 1.25rem", borderRadius: 999, border: "none", background: "#ffc20e", color: "#0a0a0b", fontWeight: 700, fontSize: "1rem", cursor: "pointer" }}
            >
              Try again
            </button>
            <a
              href="tel:+441513094681"
              style={{ minHeight: 44, display: "inline-flex", alignItems: "center", padding: "0 1.25rem", borderRadius: 999, border: "2px solid #f5f3ee", color: "#f5f3ee", fontWeight: 700, textDecoration: "none" }}
            >
              Call the shop
            </a>
          </p>
        </main>
      </body>
    </html>
  );
}
