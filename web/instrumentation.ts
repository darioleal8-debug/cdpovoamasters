export async function register() {
  // Strip BOM (U+FEFF) that Windows editors / Vercel dashboard silently prepend
  // when env vars are copy-pasted. Affects any key used as an HTTP header value.
  for (const key of Object.keys(process.env)) {
    const val = process.env[key];
    if (val?.startsWith("﻿")) {
      process.env[key] = val.replace(/^﻿/, "").trim();
    }
  }
}
