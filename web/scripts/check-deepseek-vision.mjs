#!/usr/bin/env node
/**
 * Verifica se o modelo DeepSeek configurado aceita imagens (antes de ativar a importação de boletins).
 *
 *   DEEPSEEK_API_KEY=... DEEPSEEK_VISION_MODEL=deepseek-flash node scripts/check-deepseek-vision.mjs [foto.jpg]
 *
 * Sem ficheiro, envia uma imagem gerada com o texto "53-55". Com ficheiro (ex.: a folha de teste
 * PowerTogether vs Matosinhos), pede o resultado final e os parciais.
 */
import { readFileSync } from "node:fs";
import sharp from "sharp";

const key = process.env.DEEPSEEK_API_KEY;
const model = process.env.DEEPSEEK_VISION_MODEL || "deepseek-flash";
if (!key) {
  console.error("Defina DEEPSEEK_API_KEY.");
  process.exit(2);
}

const file = process.argv[2];
const image = file
  ? await sharp(readFileSync(file)).rotate().resize({ width: 3000, height: 3000, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer()
  : await sharp(Buffer.from('<svg width="400" height="160"><rect width="400" height="160" fill="white"/><text x="40" y="100" font-size="72" font-family="sans-serif">53-55</text></svg>')).jpeg().toBuffer();

const question = file
  ? 'Esta é uma folha de jogo de basquetebol. Devolve JSON {"finalScore":{"A":0,"B":0},"periodScores":[{"period":1,"A":0,"B":0}],"teams":{"A":"","B":""}}.'
  : 'Que texto aparece na imagem? Responde em JSON {"text": "..."}.';

const started = Date.now();
const res = await fetch("https://api.deepseek.com/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
  body: JSON.stringify({
    model,
    messages: [{
      role: "user",
      content: [
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image.toString("base64")}` } },
        { type: "text", text: question },
      ],
    }],
    response_format: { type: "json_object" },
    thinking: { type: "disabled" },
    temperature: 0,
    max_tokens: 1024,
  }),
});
const body = await res.text();
console.log(`modelo=${model} HTTP ${res.status} em ${Date.now() - started} ms`);
if (!res.ok) {
  console.error(body.slice(0, 600));
  console.error("\n✖ O modelo não aceitou o pedido com imagem. Configure DEEPSEEK_VISION_MODEL com um modelo DeepSeek com visão.");
  process.exit(1);
}
const json = JSON.parse(body);
console.log("resposta:", json.choices?.[0]?.message?.content);
console.log("uso:", JSON.stringify(json.usage));
console.log("\n✓ O modelo aceita imagens. Confirme acima que a leitura está correta.");
