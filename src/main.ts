import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import { organizeLabels } from "./label-organizer";
import { createPdfjsRenderer } from "./label-organizer-render";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const drop = document.getElementById("drop")!;
const input = document.getElementById("file") as HTMLInputElement;
const pick = document.getElementById("pick") as HTMLButtonElement;
const status = document.getElementById("status")!;
let lastUrl: string | null = null;

function show(cls: string, text: string) {
  status.innerHTML = "";
  const p = document.createElement("p");
  p.className = cls;
  p.textContent = text;
  status.append(p);
  return p;
}

async function handle(file: File) {
  if (lastUrl) URL.revokeObjectURL(lastUrl);
  lastUrl = null;
  if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
    show("err", "Envie um arquivo PDF.");
    return;
  }
  pick.disabled = true;
  show("busy", "Lendo o PDF e identificando as etiquetas...");
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const render = await createPdfjsRenderer(pdfjs, data);
    const { bytes } = await organizeLabels(data, render);
    lastUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
    status.innerHTML = "";
    const msg = document.createElement("p");
    msg.className = "ok";
    msg.textContent = "Segue aqui, pode baixar.";
    const a = document.createElement("a");
    a.className = "dl";
    a.href = lastUrl;
    a.download = file.name.replace(/\.pdf$/i, "") + "-100x150.pdf";
    a.textContent = "Baixar PDF";
    status.append(msg, a);
  } catch (e) {
    const known = e instanceof Error && e.name === "LabelDetectionError";
    show("err", known ? (e as Error).message : "Não consegui ler este PDF. Nenhum arquivo foi gerado.");
  } finally {
    pick.disabled = false;
  }
}

pick.onclick = () => input.click();
input.onchange = () => {
  const f = input.files?.[0];
  if (f) void handle(f);
  input.value = "";
};
drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
drop.ondragleave = () => drop.classList.remove("over");
drop.ondrop = (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  const f = e.dataTransfer?.files[0];
  if (f) void handle(f);
};
