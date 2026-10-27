import { describe, it, expect } from "vitest";
import { pickNextTraining } from "./pick-next-training";

// 2026-10-27: Lisbon = UTC+0 (horário de inverno, após mudança a 25/10)
// Deadlines calculadas por getAttendanceDeadline:
//   t26 (end=23:00) → deadline = 2026-10-27T02:00:00Z  (23:00 + 3h)
//   t27 (sem end)   → deadline = 2026-10-28T02:30:00Z  (22:00 + 90 + 180 min)

const base = {
  location: null as string | null,
  type: null as string | null,
  notes: null as string | null,
  rsvp_deadline_hours: null as number | null,
  deleted_at: null as string | null,
};

const t26 = { ...base, id: "t26", date: "2026-10-26", start_time: "21:30", end_time: "23:00" };
const t27 = { ...base, id: "t27", date: "2026-10-27", start_time: "22:00", end_time: null };

describe("pickNextTraining", () => {
  it("treino de ontem cujo deadline passou → devolve o próximo", () => {
    // 2026-10-27 20:10 UTC (Lisbon) — deadline de t26 = 02:00 já fechou
    const now = new Date("2026-10-27T20:10:00Z");
    expect(pickNextTraining([t26, t27], now)?.id).toBe("t27");
  });

  it("treino de ontem dentro da janela → devolve-o", () => {
    // 2026-10-27 01:30 UTC — deadline de t26 = 02:00 ainda aberta
    const now = new Date("2026-10-27T01:30:00Z");
    expect(pickNextTraining([t26, t27], now)?.id).toBe("t26");
  });

  it("treino de hoje antes do início → devolve-o (janela abre ao início)", () => {
    // 2026-10-27 20:10 UTC — t27 começa 22:00, deadline 2026-10-28 02:30
    const now = new Date("2026-10-27T20:10:00Z");
    expect(pickNextTraining([t27], now)?.id).toBe("t27");
  });

  it("treino com deleted_at preenchido → ignorado", () => {
    const deleted = { ...t26, id: "del", deleted_at: "2026-10-26T10:00:00Z" };
    // 01:30 → janela de t26 ainda aberta, mas como deleted é ignorado
    const now = new Date("2026-10-27T01:00:00Z");
    expect(pickNextTraining([deleted, t27], now)?.id).toBe("t27");
  });

  it("dois treinos no mesmo dia → devolve o de start_time mais cedo ainda aberto", () => {
    // a: 19:00–20:30 → deadline 23:30 UTC
    // b: 22:00, sem fim → deadline 2026-10-28 02:30 UTC
    const a = { ...base, id: "ta", date: "2026-10-27", start_time: "19:00", end_time: "20:30" };
    const b = { ...base, id: "tb", date: "2026-10-27", start_time: "22:00", end_time: null };
    // now = 21:00 UTC → ambos abertos; deve devolver o mais cedo (ta)
    const now = new Date("2026-10-27T21:00:00Z");
    expect(pickNextTraining([a, b], now)?.id).toBe("ta");
  });

  it("lista vazia → null", () => {
    expect(pickNextTraining([], new Date())).toBeNull();
  });

  it("todos os treinos passados → null", () => {
    // far future now
    const now = new Date("2026-11-01T00:00:00Z");
    expect(pickNextTraining([t26, t27], now)).toBeNull();
  });
});
