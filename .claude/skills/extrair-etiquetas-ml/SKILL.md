---
name: extrair-etiquetas-ml
description: Lê um PDF de "Lista de produtos e instruções de preparação" de envio do Mercado Livre (Full/Inbound, "Frete #...") e gera um Excel .xlsx com as colunas Código ML, quantidade e SKU, na ordem do documento. Use sempre que o usuário enviar esse tipo de PDF (ex.: Inbound-XXXXXXXX-preparation-instructions.pdf) ou pedir a planilha de produtos de um envio ML.
---

# Extrair produtos de PDF de preparação do Mercado Livre → Excel

Fluxo automático: o usuário só envia o PDF; não peça instruções de novo.

## Executar

```
python -I .claude/skills/extrair-etiquetas-ml/scripts/extrair_etiquetas_ml.py "CAMINHO/arquivo.pdf" [-o saida.xlsx]
```

Dependências: `pip install -r .claude/skills/extrair-etiquetas-ml/requirements.txt` (pymupdf, openpyxl). Sem `-o`, o .xlsx é gravado ao lado do PDF com o mesmo nome. Se o PDF veio de pasta não confiável, copie-o para uma pasta própria e rode com `-I`.

Exit code: `0` = OK; `1` = INCOMPLETO (o arquivo sai com sufixo `_INCOMPLETA.xlsx`); `2` = PDF não encontrado.

## Regras (prioridade máxima: fidelidade)

- Nunca inventar, completar, deduzir ou corrigir Código ML, SKU ou quantidade. Nunca usar título/descrição para adivinhar SKU. Não confundir Código ML, código universal e SKU.
- Excel com exatamente 3 colunas, nesta ordem: `Código ML | quantidade | SKU`; uma planilha, cabeçalho na linha 1, uma linha por produto, ordem original, sem totais/descrição/extras; quantidade inteira; códigos/SKUs como texto, idênticos ao PDF. Não eliminar linhas: o **SKU pode se repetir** (são anúncios diferentes com o mesmo SKU), mas o **Código ML não pode** — Código ML repetido gera ERRO (arquivo `_INCOMPLETA`) e deve ser avisado ao usuário antes de entregar o resultado.
- A quantidade é associada ao produto pela **posição** (coluna UNIDADES × faixa vertical da linha), nunca por ordem do texto bruto — no PDF real a ordem do texto não coincide com a da tabela.
- Os totais ("Produtos do envio" e "Total de unidades") vêm do próprio PDF e são comparados com o extraído. Divergência = erro a investigar; **nunca** ajustar números para fechar a conta.

## Depois de rodar

1. Se `STATUS: OK`: informe nome/caminho do .xlsx (link clicável), nº de produtos, total de unidades (do PDF) e os AVISOs, se houver. Não mostre o código-fonte.
2. Se `STATUS: INCOMPLETO` ou houver ERRO/AVISO: não declare sucesso. Relate página, produto/posição e campo não confirmado. Investigue: renderize a região (`pymupdf` → `page.get_pixmap(clip=...)`) e leia a imagem; se o campo continuar ilegível, peça um PDF melhor. A planilha `_INCOMPLETA` só serve para conferência e deve ser identificada assim.
3. Páginas sem texto digital: o script tenta OCR (PyMuPDF + Tesseract, que precisa estar instalado) e avisa que a leitura é por OCR — confira visualmente todos os campos antes de dar como validado.
4. Informe também avisos de Código ML fora do padrão (4 letras + 5 dígitos), SKU em várias linhas ou com caracteres incomuns.

## Testes

```
python -m unittest discover -s .claude/skills/extrair-etiquetas-ml/tests -v
```
(opcional: `ML_PDF_REFERENCIA=caminho/Inbound-79427953-preparation-instructions.pdf` testa também o PDF real: 13 produtos, 235 unidades, primeira linha `EHAO37040 | 25 | ROL_MAS_M`.)
