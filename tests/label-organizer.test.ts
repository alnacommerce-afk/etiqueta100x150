import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
// @ts-expect-error build legado do pdf.js para Node
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

import {
  LabelDetectionError,
  OUT_H,
  OUT_W,
  detectBoxes,
  organizeLabels,
} from "../src/lib/admin/label-organizer";
import { createPdfjsRenderer } from "../src/lib/admin/label-organizer-render";

const fixture = new Uint8Array(readFileSync("tests/fixtures/etiquetas-3-mais-1.pdf"));

describe("Organizador de Etiquetas PDF", () => {
  test("3 etiquetas na página 1 + 1 na página 2 => 4 páginas 100x150 mm, na ordem", async () => {
    const render = await createPdfjsRenderer(pdfjs, fixture);
    const { bytes, count } = await organizeLabels(fixture, render);
    expect(count).toBe(4);

    const out = await PDFDocument.load(bytes);
    expect(out.getPageCount()).toBe(4);
    for (const p of out.getPages()) {
      expect(p.getWidth()).toBeCloseTo(OUT_W, 2);
      expect(p.getHeight()).toBeCloseTo(OUT_H, 2);
      expect(p.getHeight()).toBeGreaterThan(p.getWidth()); // retrato
    }

    // Ordem original: cada página de saída referencia a página de origem certa (1,1,1,2),
    // e o texto de cada etiqueta é o do volume esperado (/1 /2 /3 /4).
    const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise;
    const vols: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const tc = await (await pdf.getPage(i)).getTextContent();
      const text = tc.items.map((t: { str: string }) => t.str).join(" ");
      const m = text.match(/Envio: 78813954\/(\d)/);
      expect(m).not.toBeNull();
      vols.push(m![1]);
      // uma etiqueta só por página
      expect(new Set(text.match(/78813954\/\d/g)).size).toBe(1);
    }
    expect(vols).toEqual(["1", "2", "3", "4"]);
  });

  test("não recria nada: QR/texto continuam vetoriais (sem imagem rasterizada da página)", async () => {
    const render = await createPdfjsRenderer(pdfjs, fixture);
    const { bytes } = await organizeLabels(fixture, render);
    const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise;
    const tc = await (await pdf.getPage(1)).getTextContent();
    expect(tc.items.length).toBeGreaterThan(5); // texto selecionável = não virou imagem
  });

  test("detectBoxes acha 3 caixas lado a lado em ordem esquerda -> direita", () => {
    const w = 300;
    const h = 200;
    const ink = new Uint8Array(w * h);
    const rect = (x0: number, x1: number) => {
      for (let x = x0; x < x1; x++) {
        ink[20 * w + x] = 1;
        ink[180 * w + x] = 1;
      }
      for (let y = 20; y <= 180; y++) {
        ink[y * w + x0] = 1;
        ink[y * w + x1 - 1] = 1;
      }
    };
    rect(10, 90);
    rect(110, 190);
    rect(210, 290);
    const boxes = detectBoxes({ ink, width: w, height: h, scale: 1 });
    expect(boxes.map((b) => b.left)).toEqual([10, 110, 210]);
    expect(boxes.every((b) => b.top === 20 && b.bottom === 181)).toBe(true);
  });

  test("PDF sem etiquetas identificáveis interrompe em vez de gerar arquivo errado", async () => {
    const blank = await PDFDocument.create();
    blank.addPage([300, 300]);
    const bytes = await blank.save();
    const render = await createPdfjsRenderer(pdfjs, bytes);
    await expect(organizeLabels(bytes, render)).rejects.toBeInstanceOf(LabelDetectionError);
  });
});
