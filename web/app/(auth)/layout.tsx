export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100dvh", background: "var(--ink, #0A1220)" }}>
      {children}
    </div>
  );
}
