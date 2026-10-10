# Etiqueta 100x150 — Organizador de Etiquetas PDF

Ferramenta que recebe um PDF com etiquetas de envio (uma ou várias por folha) e devolve um PDF **100 × 150 mm, retrato,
uma etiqueta por página, na ordem original**. É **só recorte e reorganização**: nada é redesenhado.

Nasceu no site da Alna (`site-alna`, rota `/admin/etiquetas`). Este repositório guarda o conhecimento e o código de referência.

## Regras do dono (inegociáveis)
- Não recriar etiquetas, QR ou códigos de barras; não alterar textos, logos, fontes, cores ou proporções.
- Não converter em imagem de baixa resolução; preservar o vetor do PDF original.
- Não trocar a ordem (página a página, de cima para baixo, esquerda para a direita).
- Saída: cada página exatamente 100 × 150 mm. 4 etiquetas na entrada = 4 páginas na saída.
- Se a proporção da etiqueta for diferente, redimensionar proporcionalmente, centralizar, margens brancas; nunca cortar/deformar.
- Na dúvida sobre os limites das etiquetas: **interromper e avisar** em vez de gerar arquivo errado.
- Mensagem exibida após sucesso: somente **"Segue aqui, pode baixar."** + botão de download.
- Interface: título "Organizador de Etiquetas PDF", botão ENVIAR PDF, arrastar e soltar, indicador de processamento, contagem de etiquetas.

## Como funciona
1. **Achar as etiquetas** (`src/label-organizer.ts`, `detectBoxes`): cada página é renderizada (pdf.js, 2 px/pt) **apenas para enxergar** onde há tinta.
   Faixas brancas ≥ 4 pt separam as etiquetas: primeiro em linhas (cima→baixo) e, em cada linha, em colunas (esquerda→direita).
   A borda de cada etiqueta é contínua, então espaços em branco internos (ex.: entre o cabeçalho e o QR) nunca a dividem.
   A imagem **não** vai para o PDF final.
2. **Recortar sem perder qualidade**: `pdf-lib` → `embedPage(paginaOriginal, boundingBox)` + `drawPage`. Isso mantém texto, QR e logos vetoriais/originais.
   Escala = `min((100−2)/w, (150−2)/h)` (1 mm de folga branca por lado), centralizado. Para etiquetas de 89,2 × 148,7 mm a escala é ≈ 0,995 (praticamente 1:1).
3. **Validar antes de entregar**: nenhuma etiqueta < 80 pt (elemento perdido = erro); todas com tamanho parecido (±10 % da mediana);
   páginas rotacionadas são recusadas; nº de páginas = nº de etiquetas; cada página 100 × 150 mm.
4. **Interface** (`src/main.ts` + `index.html`): projeto independente (Vite + TypeScript), tudo no navegador (nada vai para a internet);
   não depende do site-alna.

## Exemplo e testes
`tests/fixtures/etiquetas-3-mais-1.pdf`: Mercado Livre Full (Envio 78813954), A4 paisagem, **3 etiquetas na página 1 + 1 na página 2**
(cada uma 89,2 × 148,7 mm; esquerdas em 30 / 295,1 / 560,2 pt; topo 30,08 pt).
Resultado esperado e testado: 4 páginas 100 × 150 mm, volumes /1 /2 /3 /4 nessa ordem, texto ainda selecionável (não virou imagem).
Rodar: `bun test tests/label-organizer.test.ts` (precisa de `pdf-lib`, `pdfjs-dist`, e `@napi-rs/canvas` como dev dependency para o pdf.js no Node).

## Lições / armadilhas
- pdfjs-dist 6.x: usar `doc.canvasFactory.create(w, h)` e `page.render({ canvas, canvasContext, viewport })`; no Node usar `pdfjs-dist/legacy/build/pdf.mjs`.
  No navegador (Vite): `import("pdfjs-dist/build/pdf.worker.min.mjs?url")` para o worker.
- Com `noUncheckedIndexedAccess`, indexações precisam de `?? / !`; `Error.name` exige `override`.
- Um protótipo anterior com grade fixa de 3 colunas funcionava só para este modelo; a detecção por faixas brancas é genérica.
- Etiquetas **sem borda** e com grandes vazios internos podem ser divididas errado: as validações (tamanho mínimo/uniformidade) existem para recusar esses casos.
- Página com `/Rotate` ≠ 0 é recusada (coordenadas do render e do `embedPage` não coincidem).
- O PDF de exemplo é de uso interno; não contém dados pessoais de clientes (só nº de envio e centro logístico).

## Pendências / ideias
- Testar com etiquetas de outros marketplaces (Shopee, Correios, Melhor Envio) e com 2×2 por folha.
- Tela testada só até o início do processamento no navegador de teste (painel oculto trava o pdf.js); testar com o PDF real numa janela aberta.

## Rodar
```
bun install
bun run dev      # abre a ferramenta em http://localhost:5173
bun test         # testes com o PDF de exemplo
bun run build    # gera dist/ (site estático, pode ser hospedado em qualquer lugar)
```

## Atalho no Windows
`Abrir-Etiquetas.bat` liga a ferramenta e abre o navegador sozinho (duplo clique). Há um atalho "Etiquetas 100x150" na Área de Trabalho apontando para ele.
Fechar a janela preta desliga a ferramenta.
