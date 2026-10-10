import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/etiquetas")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: EtiquetasPage,
});

type State =
  | { kind: "idle" }
  | { kind: "working"; text: string }
  | { kind: "done"; url: string; name: string }
  | { kind: "error"; text: string };

function EtiquetasPage() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handle(file: File) {
    if (state.kind === "done") URL.revokeObjectURL(state.url);
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
      setState({ kind: "error", text: "Envie um arquivo PDF." });
      return;
    }
    setState({ kind: "working", text: "Lendo o PDF e identificando as etiquetas..." });
    try {
      // Carregado só aqui: a loja não paga nenhum KB por esta ferramenta.
      const [pdfjs, worker, organizer, renderer] = await Promise.all([
        import("pdfjs-dist"),
        import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
        import("@/lib/admin/label-organizer"),
        import("@/lib/admin/label-organizer-render"),
      ]);
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      const data = new Uint8Array(await file.arrayBuffer());
      const render = await renderer.createPdfjsRenderer(pdfjs, data);
      const { bytes, count } = await organizer.organizeLabels(data, render);
      setState({
        kind: "working",
        text: `${count} etiqueta${count === 1 ? "" : "s"} identificada${count === 1 ? "" : "s"}. Gerando o PDF...`,
      });
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      setState({ kind: "done", url, name: file.name.replace(/\.pdf$/i, "") + "-100x150.pdf" });
    } catch (e) {
      const text =
        e instanceof Error && e.name === "LabelDetectionError"
          ? e.message
          : "Não consegui ler este PDF. Nenhum arquivo foi gerado.";
      setState({ kind: "error", text });
    }
  }

  return (
    <AdminShell>
      <div className="mb-6 max-w-2xl">
        <h1 className="text-xl font-semibold">Organizador de Etiquetas PDF</h1>
        <p className="text-sm text-muted-foreground">
          Envie o PDF com as etiquetas (uma ou várias por folha). Devolvo um PDF com uma etiqueta
          por página, em 100 × 150 mm, na mesma ordem. É só recorte: nada é redesenhado. O arquivo
          é processado no seu computador e não é enviado para a internet.
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files[0];
          if (f) void handle(f);
        }}
        className={`max-w-2xl rounded-lg border-2 border-dashed p-10 text-center ${
          over ? "border-primary bg-accent" : "border-border"
        }`}
      >
        <p className="mb-4 text-sm text-muted-foreground">Arraste o PDF aqui</p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handle(f);
            e.target.value = "";
          }}
        />
        <Button onClick={() => inputRef.current?.click()} disabled={state.kind === "working"}>
          ENVIAR PDF
        </Button>
      </div>

      <div className="mt-6 max-w-2xl text-sm" aria-live="polite">
        {state.kind === "working" && <p className="text-muted-foreground">{state.text}</p>}
        {state.kind === "error" && <p className="text-red-600">{state.text}</p>}
        {state.kind === "done" && (
          <div>
            <p className="mb-3 font-medium">Segue aqui, pode baixar.</p>
            <Button asChild>
              <a href={state.url} download={state.name}>
                Baixar PDF
              </a>
            </Button>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
