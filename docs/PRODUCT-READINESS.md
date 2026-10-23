# HAVEN® — estado do produto e critérios de aceitação

Documento de entrega da ronda **FINAL PRODUCT ELEVATION**. Cada sistema tem
critérios de aceitação explícitos e um estado. Os estados são:

- **A — Aprovado e verificado**: existe, está ligado ao fluxo real e foi
  executado nesta ronda com evidência reproduzível.
- **B — Implementado, não verificado**: o código existe e os testes passam, mas
  a verificação visual/em dispositivo não foi possível neste ambiente.
- **C — Parcial**: funciona em parte, com lacunas conhecidas e descritas.
- **D — Falhado**: foi tentado e não cumpre.
- **E — Não implementado**.

> **Limitação do ambiente, declarada de início.** Não há browser com GPU nem
> Chromium neste sandbox (o CDN do Playwright está bloqueado e o `headless-gl`
> falha a compilação nativa). Por isso **nenhum pixel WebGL foi validado**. As
> imagens em `docs/` são produzidas por um rasterizador CPU que aplica as mesmas
> transformações e a mesma geometria dos módulos que a cena usa; provam
> colocação, escala, geometria e comportamento, não o trajeto WebGL, as sombras
> ou a exposição final.

## Como reproduzir

```bash
npm run dev                                  # cena em /, painéis Residents e Perf
npx tsx scripts/check-product.ts             # 20 verificações HTTP do produto
npx tsx scripts/probe-residents.ts 13        # 13 min de simulação, medidas
npx tsx scripts/bench-residents.ts           # custo de CPU por frame
npx tsx scripts/render-residents.ts          # imagens de docs/ (CPU)
npm run audit:3d                             # integridade espacial/geométrica
npm run smoke                                # fluxos de dados (SQLite)
npx vitest run                               # 315 testes
npm run build                                # produção
```

---

## 1. Site público

| Critério | Estado | Evidência |
| --- | --- | --- |
| `/`, `/properties`, `/visit`, `/login` respondem 200 | **A** | `check-product.ts` |
| As 11 residências publicadas têm ficha própria com código, preço e plano | **A** | 11 páginas 200 com `€` e código |
| H05 e H13 (rascunho, por desenho) não aparecem ao público | **A** | 404 nas duas fichas; a home explica-o |
| Nenhum `NaN`/`undefined` no HTML de qualquer página | **A** | `check-product.ts` |
| Marcação sem links mortos (`#condominium`, `#typologies` existem) | **A** | inspeção de `page.tsx` |
| Formulários de contacto e de visita validam e gravam | **A** | `smoke` |
| Composição visual em desktop e telemóvel | **B** | classes responsivas presentes; sem captura de ecrã |

## 2. Administração

| Critério | Estado | Evidência |
| --- | --- | --- |
| `/admin*` exige sessão (307 → `/login`) | **A** | `check-product.ts` |
| `/api/admin/leads/export` devolve 401 sem sessão | **A** | `check-product.ts` |
| CRUD de imóveis, leads, visitas, media e definições | **A** | `smoke` |
| Editor de masterplan e de interiores ligados a dados reais | **B** | código revisto; não navegado em browser |
| Papéis (admin/manager/viewer) aplicados nas rotas | **B** | `can()` usado nas páginas; não exercitado por UI |

## 3. Masterplan 3D e integridade arquitectónica

| Critério | Estado | Evidência |
| --- | --- | --- |
| 13 casas, 13 lotes, 8 piscinas, 13 alpendres | **A** | `audit:3d` |
| Sem achados críticos ou altos (implantação, sobreposição, contacto com o solo, pé-direito, acessos) | **A** | `audit:3d` |
| Orçamento: 213 draw calls nos lotes, 49 608 triângulos, 54 árvores, 307 flores | **A** | `audit:3d` |
| Um caminho pedonal atravessa o lote H13 (`path/ring-outer`) | **C** | achado **médio** pré-existente, não corrigido em silêncio |
| Casas com telhado, beiral, rufo, peitoril e embasamento coerentes | **B** | `docs/houses-before-after-three-quarter.png`, `docs/site-house.png` |
| Cena WebGL no ecrã (sombras, materiais, exposição) | **E** | sem GPU no ambiente |

## 4. População e vida autónoma

| Critério | Estado | Evidência |
| --- | --- | --- |
| 20 habitantes montados na cena principal, mesmo sem abrir painéis | **A** | `<Residents count={20}>` no `SiteScene`; teste de montagem R3F |
| 22 peças por corpo, 11 draw calls, matrizes e cores por instância escritas todos os frames | **A** | `tests/resident-body.test.ts`, `tests/residents-render.test.ts` |
| Ninguém nasce dentro de outra pessoa | **A** | `declutterSpawns` + teste com 5 sementes |
| Percursos na rede pedonal; pior desvio 0,50 m em 13 min | **A** | `probe-residents.ts` |
| Conversas começam e terminam (34/34); reuniões inalcançáveis 0 | **A** | `probe-residents.ts` |
| Sem encravamentos permanentes (2 recuperações em 13 min) | **A** | `probe-residents.ts` |
| Seleção por clique aponta para o habitante certo | **A** | `residentAtInstance()` + teste |
| O estado sobrevive a remontagem e a mudanças de câmara | **A** | `tests/residents-render.test.ts` |
| Entradas nas casas (ir até à porta) | **C** | aproximações de porta existem na rede; não há animação de entrada |
| Habitantes vistos no ecrã | **E** | `docs/residents-*.png` são CPU, não WebGL |

## 5. Qualidade visual

| Critério | Estado | Evidência |
| --- | --- | --- |
| Materiais e geometria sem duplicação por render | **A** | materiais e geometrias em `useMemo`; merge por material |
| Sem efeitos que escondam defeitos (bloom, exposição excessiva) | **A** | `materials.ts` sem pós-processamento |
| Câmaras previsíveis (aérea, três-quartos, fachada, interior) | **B** | presets no código; sem captura |
| Sombras, reflexos e luz nocturna | **E** | requer WebGL |

## 6. Desempenho e compatibilidade

| Critério | Estado | Evidência |
| --- | --- | --- |
| Custo de CPU dos habitantes com animações activas | **A** | 0,063 ms simulação + 0,100 ms corpos = **0,16 ms/frame** |
| Sem `setState` por frame; HUD a 4 Hz | **A** | `resident-store.ts` |
| `dpr` limitado e modo de qualidade reduzida | **A** | `CondominiumExperience.tsx` |
| Custo de GPU e FPS reais | **E** | sem GPU |
| Ecrãs pequenos | **C** | breakpoints e gaveta inferiores; não testado em dispositivo |

## 7. Defeitos corrigidos nesta ronda

1. **Clique no habitante errado** — o peito tem duas instâncias por corpo e o
   `instanceId` era usado como índice de pessoa. Agora `residentAtInstance()`.
2. **Orientação inicial em graus lida como radianos** — o inventário guarda
   `rotationY` em graus (as casas convertem); os habitantes recebiam o valor
   cru. Corrigido no componente e nos scripts.

## 8. Problemas conhecidos e não resolvidos

- `path/ring-outer` atravessa o lote H13 — achado médio do `audit:3d`.
- Trânsito automóvel em movimento: **não implementado** (os carros estão
  estacionados nos alpendres).
- Sem animação de entrada nas casas: os habitantes aproximam-se das portas e
  viram-se, mas não atravessam a soleira.
- Sem validação WebGL, sem capturas de ecrã reais, sem teste em dispositivos.
