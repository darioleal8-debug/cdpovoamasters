export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-cdpovoa-blue to-cdpovoa-blue-mid">
      {/* Padrão decorativo de fundo */}
      <div
        className="fixed inset-0 opacity-[0.04]"
        style={{
          backgroundImage: "repeating-linear-gradient(90deg, white 0px, white 1px, transparent 1px, transparent 64px)",
        }}
      />
      <div className="relative flex min-h-screen items-center justify-center p-4">
        {children}
      </div>
    </div>
  );
}
