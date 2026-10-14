import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
const read = (f: string) => readFileSync(path.join(__dirname, "..", "..", f), "utf8");

describe("títulos sem sufixo duplicado (UX-28)", () => {
  it("login e pedir acesso não repetem '— hoophub' (o template já o acrescenta)", () => {
    expect(read("app/(auth)/login/page.tsx")).not.toMatch(/title: "[^"]*— hoophub"/);
    expect(read("app/pedir-acesso/layout.tsx")).not.toMatch(/title: "[^"]*— hoophub"/);
  });
  it("a landing usa título absoluto (não passa pelo template)", () => {
    expect(read("app/(dashboard)/page.tsx")).toMatch(/title: \{ absolute: "hoophub — /);
  });
});
