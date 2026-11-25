import { MasterLayout } from "@/components/hoophub/master-layout";

export const dynamic = "force-dynamic";

// Gestão HoopHub: área restrita ao Master Admin, com a barra de secções comum
export default function Layout({ children }: { children: React.ReactNode }) {
  return <MasterLayout>{children}</MasterLayout>;
}
