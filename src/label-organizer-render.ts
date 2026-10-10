// Renderiza cada página só para ENXERGAR onde há conteúdo (achar as bordas das etiquetas).
// A imagem não vai para o PDF final: o recorte usa o PDF original, em vetor.
import { inkFromRgba, type PageRenderer } from "./label-organizer";

const SCALE = 2; // 2 px por ponto: acha até traços finos de borda

type PdfjsModule = typeof import("pdfjs-dist");

export async function createPdfjsRenderer(
  pdfjs: PdfjsModule,
  data: Uint8Array,
): Promise<PageRenderer> {
  // pdf.js consome o buffer; passa uma cópia para não afetar o original.
  const doc = await pdfjs.getDocument({ data: data.slice() }).promise;
  return async (pageIndex) => {
    const page = await doc.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: SCALE });
    const width = Math.ceil(viewport.width);
    const height = Math.ceil(viewport.height);
    const { canvas, context } = (
      doc as unknown as {
        canvasFactory: {
          create(w: number, h: number): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D };
        };
      }
    ).canvasFactory.create(width, height);
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    const rgba = context.getImageData(0, 0, width, height).data;
    page.cleanup();
    return { ink: inkFromRgba(rgba, width, height), width, height, scale: SCALE };
  };
}
