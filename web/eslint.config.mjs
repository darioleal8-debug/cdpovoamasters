import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Dívida existente (auditoria QUAL-07): como aviso para não bloquear o CI no primeiro dia.
    // Subir para "error" à medida que os ficheiros forem limpos.
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@next/next/no-img-element": "warn",
      "@next/next/no-html-link-for-pages": "warn",
      "react-hooks/exhaustive-deps": "warn",
      // Aspas/apóstrofos em texto JSX: cosmético, não é bug
      "react/no-unescaped-entities": "warn",
    },
  },
];

export default config;
