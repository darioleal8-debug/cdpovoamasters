import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";

// QUO-19: correr num processo com TZ a oeste de UTC (Açores) — o fuso do processo não muda a meio do vitest
describe("getSeasonMonths (QUO-19)", () => {
  it("não acrescenta um mês fora da época em fusos a oeste de UTC", () => {
    const script = `
      import { getSeasonMonths } from ${JSON.stringify(path.join(__dirname, "payment-utils.ts"))};
      console.log(JSON.stringify(getSeasonMonths({ start_date: "2026-01-01", end_date: "2026-06-30" }).map(m => m.label)));
    `;
    const out = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      env: { ...process.env, TZ: "Atlantic/Azores" },
    }).toString().trim();
    expect(JSON.parse(out)).toEqual(["Jan 2026", "Fev 2026", "Mar 2026", "Abr 2026", "Mai 2026", "Jun 2026"]);
  });
});

import { getSeasonMonths } from "./payment-utils";
describe("getSeasonMonths — época que atravessa o ano", () => {
  it("setembro 2026 a junho 2027 = 10 meses", () => {
    const m = getSeasonMonths({ start_date: "2026-09-01", end_date: "2027-06-30" });
    expect(m.length).toBe(10);
    expect(m[0]).toMatchObject({ month: 9, year: 2026 });
    expect(m[3]).toMatchObject({ month: 12, year: 2026 });
    expect(m[4]).toMatchObject({ month: 1, year: 2027 });
    expect(m.at(-1)).toMatchObject({ month: 6, year: 2027 });
  });
});
