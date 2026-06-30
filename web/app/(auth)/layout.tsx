import { PLATFORM_THEME as T } from "@/lib/platform-theme";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: T.backgroundGradient }}>
      {/* Grelha decorativa */}
      <div
        className="fixed inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, white 0px, white 1px, transparent 1px, transparent 64px)",
        }}
      />
      <div className="relative flex min-h-screen items-center justify-center p-4">
        {children}
      </div>
    </div>
  );
}
