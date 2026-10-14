import { Suspense } from "react";
import { DocumentosClient } from "./documentos-client";

export const metadata = { title: "Documentos" };

export default function DocumentosPage() {
  return (
    <Suspense>
      <DocumentosClient />
    </Suspense>
  );
}
