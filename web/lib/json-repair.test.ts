import { describe, expect, it } from "vitest";
import { fixStrayQuotes, parseLooseJSON } from "./json-repair";

describe("parseLooseJSON", () => {
  it("aceita JSON válido sem alterações", () => {
    expect(parseLooseJSON('{"a":1,"b":"x,\\"}"}')).toEqual({ a: 1, b: 'x,"}' });
  });

  it("repara a aspa solta vista no DeepSeek (teams → players)", () => {
    const bad = '{"teams":{"A":{"name":"GD André Soares"},"B":{"name":"Enesse"},"},"players":[{"team":"A","number":0}]}';
    expect(parseLooseJSON(bad)).toEqual({
      teams: { A: { name: "GD André Soares" }, B: { name: "Enesse" } },
      players: [{ team: "A", number: 0 }],
    });
  });

  it("repara aspa solta antes de ]", () => {
    expect(parseLooseJSON('{"x":[1,2,"]}')).toEqual({ x: [1, 2] });
  });

  it("repara vírgulas finais", () => {
    expect(parseLooseJSON('{"x":[1,2,],}')).toEqual({ x: [1, 2] });
  });

  it("não mexe em ,\"} dentro de strings", () => {
    expect(fixStrayQuotes('{"s":"a,\\"}"}')).toBe('{"s":"a,\\"}"}');
    expect(fixStrayQuotes('{"s":"a,}"}')).toBe('{"s":"a,}"}');
  });

  it("devolve undefined para lixo", () => {
    expect(parseLooseJSON("isto não é json")).toBeUndefined();
  });
});
