// Organizador de Etiquetas PDF — só recorta e reorganiza.
// Nada é redesenhado: cada etiqueta original é embutida (vetorial, com QR/código de barras
// intactos) numa página de 100 x 150 mm, uma por página, na ordem original de leitura.
import { PDFDocument } from "pdf-lib";

const PT_PER_MM = 72 / 25.4;
export const OUT_W = 100 * PT_PER_MM;
export const OUT_H = 150 * PT_PER_MM;
const SAFETY_MARGIN = 1 * PT_PER_MM; // folga branca para a borda não ser cortada na impressão
const MIN_GAP_PT = 4; // faixa branca mínima que separa duas etiquetas
const MIN_SIZE_PT = 80; // etiqueta menor que isso é tratada como detecção insegura
const INK_THRESHOLD = 250; // pixel com algum canal abaixo disso conta como "tinta"
const PAD_PT = 1;

/** Caixa em pontos PDF, origem no topo-esquerda da página (como a imagem renderizada). */
export type Box = { left: number; top: number; right: number; bottom: number };

/** Imagem renderizada da página: `ink[i]=1` onde há conteúdo. `scale` = pixels por ponto. */
export type PageInk = { ink: Uint8Array; width: number; height: number; scale: number };
export type PageRenderer = (pageIndex: number) => Promise<PageInk>;

export class LabelDetectionError extends Error {
  override name = "LabelDetectionError";
}

/** Converte RGBA (getImageData) em mapa de tinta. */
export function inkFromRgba(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number) {
  const ink = new Uint8Array(width * height);
  for (let i = 0; i < ink.length; i++) {
    if (rgba[i * 4 + 3] === 0) continue; // transparente = branco
    if (
      (rgba[i * 4] ?? 255) < INK_THRESHOLD ||
      (rgba[i * 4 + 1] ?? 255) < INK_THRESHOLD ||
      (rgba[i * 4 + 2] ?? 255) < INK_THRESHOLD
    ) {
      ink[i] = 1;
    }
  }
  return ink;
}

/** Intervalos [início, fim) de posições com tinta, separados por faixas brancas >= minGap. */
function splitRuns(hasInk: boolean[], minGap: number): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  let start = -1;
  let lastInk = -1;
  for (let i = 0; i < hasInk.length; i++) {
    if (!hasInk[i]) continue;
    if (start === -1) start = i;
    else if (i - lastInk - 1 >= minGap) {
      runs.push([start, lastInk + 1]);
      start = i;
    }
    lastInk = i;
  }
  if (start !== -1) runs.push([start, lastInk + 1]);
  return runs;
}

/**
 * Acha cada etiqueta de uma página: separa por faixas brancas, primeiro em linhas
 * (de cima para baixo) e, dentro de cada linha, em colunas (da esquerda para a direita).
 * Como a borda de cada etiqueta é contínua, o espaço em branco interno nunca a divide.
 */
export function detectBoxes(page: PageInk): Box[] {
  const { ink, width, height, scale } = page;
  const minGap = Math.max(1, Math.round(MIN_GAP_PT * scale));

  const rowHas: boolean[] = new Array(height).fill(false);
  for (let y = 0; y < height; y++) {
    const off = y * width;
    for (let x = 0; x < width; x++) {
      if (ink[off + x]) {
        rowHas[y] = true;
        break;
      }
    }
  }

  const boxes: Box[] = [];
  for (const [y0, y1] of splitRuns(rowHas, minGap)) {
    const colHas: boolean[] = new Array(width).fill(false);
    for (let y = y0; y < y1; y++) {
      const off = y * width;
      for (let x = 0; x < width; x++) if (ink[off + x]) colHas[x] = true;
    }
    for (const [x0, x1] of splitRuns(colHas, minGap)) {
      boxes.push({ left: x0 / scale, top: y0 / scale, right: x1 / scale, bottom: y1 / scale });
    }
  }
  return boxes;
}

function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

export type OrganizeResult = { bytes: Uint8Array; count: number };

export async function organizeLabels(
  input: ArrayBuffer | Uint8Array,
  renderPage: PageRenderer,
): Promise<OrganizeResult> {
  const src = await PDFDocument.load(input, { ignoreEncryption: false });
  const pages = src.getPages();
  if (pages.length === 0) throw new LabelDetectionError("O PDF não tem páginas.");

  // 1) Detecta as etiquetas de todas as páginas, na ordem de leitura.
  const found: Array<{ pageIndex: number; box: Box; pageW: number; pageH: number }> = [];
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]!;
    if (page.getRotation().angle !== 0) {
      throw new LabelDetectionError(
        `A página ${i + 1} está rotacionada; não é seguro recortar. Gire o PDF para a posição normal e envie de novo.`,
      );
    }
    const { width: pageW, height: pageH } = page.getSize();
    const rendered = await renderPage(i);
    const boxes = detectBoxes(rendered);
    for (const b of boxes) {
      if (b.right - b.left < MIN_SIZE_PT || b.bottom - b.top < MIN_SIZE_PT) {
        throw new LabelDetectionError(
          `Na página ${i + 1} há um elemento pequeno que não parece uma etiqueta completa. Não consegui identificar os limites com segurança.`,
        );
      }
      found.push({ pageIndex: i, box: b, pageW, pageH });
    }
  }
  if (found.length === 0) throw new LabelDetectionError("Não encontrei nenhuma etiqueta no PDF.");

  // 2) Todas as etiquetas de um mesmo arquivo devem ter tamanho parecido; senão, algo foi mal detectado.
  const mw = median(found.map((f) => f.box.right - f.box.left));
  const mh = median(found.map((f) => f.box.bottom - f.box.top));
  for (const f of found) {
    const w = f.box.right - f.box.left;
    const h = f.box.bottom - f.box.top;
    if (Math.abs(w - mw) / mw > 0.1 || Math.abs(h - mh) / mh > 0.1) {
      throw new LabelDetectionError(
        `As etiquetas da página ${f.pageIndex + 1} têm tamanhos diferentes entre si. Não consegui identificar os limites com segurança.`,
      );
    }
  }

  // 3) Embute cada recorte (vetorial) numa página 100 x 150 mm, proporcional e centralizado.
  const out = await PDFDocument.create();
  for (const f of found) {
    const w = f.box.right - f.box.left + 2 * PAD_PT;
    const h = f.box.bottom - f.box.top + 2 * PAD_PT;
    const embedded = await out.embedPage(pages[f.pageIndex]!, {
      left: Math.max(0, f.box.left - PAD_PT),
      right: Math.min(f.pageW, f.box.right + PAD_PT),
      bottom: Math.max(0, f.pageH - f.box.bottom - PAD_PT),
      top: Math.min(f.pageH, f.pageH - f.box.top + PAD_PT),
    });
    const k = Math.min((OUT_W - 2 * SAFETY_MARGIN) / w, (OUT_H - 2 * SAFETY_MARGIN) / h);
    const dw = w * k;
    const dh = h * k;
    const page = out.addPage([OUT_W, OUT_H]);
    page.drawPage(embedded, { x: (OUT_W - dw) / 2, y: (OUT_H - dh) / 2, width: dw, height: dh });
  }

  // 4) Validação final antes de entregar.
  const bytes = await out.save();
  const check = await PDFDocument.load(bytes);
  if (check.getPageCount() !== found.length) {
    throw new LabelDetectionError("A quantidade de páginas geradas não confere com as etiquetas.");
  }
  for (const p of check.getPages()) {
    const { width, height } = p.getSize();
    if (Math.abs(width - OUT_W) > 0.01 || Math.abs(height - OUT_H) > 0.01) {
      throw new LabelDetectionError("Uma página gerada não tem 100 x 150 mm.");
    }
  }
  return { bytes, count: found.length };
}
