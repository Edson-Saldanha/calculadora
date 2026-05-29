# Conversor de Etiquetas Shopee (Value)

Ferramenta web para converter PDFs A4 de etiquetas Shopee em um PDF final 100x150mm,
pronto para impressao em impressora termica, preservando vetores (QR e barcode nítidos).

## Principais recursos
- Dois modos: "Etiqueta com checklist" e "Etiqueta padrão".
- Processamento no navegador com pdf-lib (sem rasterizacao).
- Status e progresso com ETA e cancelamento.
- Pre-visualizacao com miniaturas e visualizador.
- Auto impressao (opcional) e pagina de teste 100x150mm.
- Download rapido do PDF final.

## Como usar
1. Abra `index.html` em um servidor local (recomendado).
2. Selecione o PDF de entrada.
3. Escolha o modo desejado.
4. Clique em "Gerar etiquetas".
5. Baixe o PDF 100x150 ou imprima.

### Servidor local (recomendado)
No Windows, voce pode usar o Python:

```
python -m http.server 5500
```

Depois acesse `http://localhost:5500` no navegador.

> Abrir o arquivo direto (file://) costuma funcionar, mas alguns navegadores
> podem bloquear o worker/preview. O servidor local garante tudo funcionando.

## Regras de saida
- Paginas finais em 100x150mm, 1 etiqueta por pagina.
- Modo "Etiqueta padrão": 4 etiquetas por pagina de entrada (2x2).
- Modo "Etiqueta com checklist": 2 etiquetas por pagina (topo 150mm).

## Estrutura do projeto
- `index.html`
- `etiquetas.js`
- `src/styles/base.css`
- `src/styles/components.css`
- `vendor/pdf-lib.min.js`

## Dicas de impressao
- Use escala 100% (nao ajustar/encaixar na pagina).
- Selecione papel 100x150mm na impressora termica.
- Use a "pagina de teste 100x150" para conferir margens.

## Solucao de problemas
- "Arquivo invalido": verifique se o arquivo e um PDF valido.
- "PDF protegido por senha": desbloqueie e envie novamente.
- "Falha ao gerar": tente novamente; para PDFs grandes, use servidor local.

Desenvolvido por iury
