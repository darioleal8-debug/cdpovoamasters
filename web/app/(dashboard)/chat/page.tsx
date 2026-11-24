import { redirect } from "next/navigation";

// O chat foi substituído pelos Comunicados (links e ícones antigos continuam a funcionar).
export default function ChatRedirect() {
  redirect("/comunicados");
}
