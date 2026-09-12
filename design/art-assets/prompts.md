# 首批场景完整提示词

后续批次记录：

- [设备提示词](equipment/prompts.md)。
- [17 类商品完整提示词、生成来源及尺寸](goods/manifest.json)：以腌缸插画为纸纹和线描参考，内置 imagegen 逐张生成。
- [4 张住房完整提示词、生成来源及尺寸](scenes/housing-manifest.json)：空院参考第一批生活小院，其余住房沿用空院风格，内置 imagegen 逐张生成。

WebP 仅作尺寸与编码派生，不改变画面内容，不覆盖 PNG 原图。

制作日期：2026-09-12。工具：内置 imagegen；未使用 CLI/API 回退。生成顺序：汴河、街巷、早市、夜市、茶馆、小院；随后定向修正茶馆书页。

所有正式结果均原样复制到 scenes/。本文件记录实际提交的英文提示词。参考图用于统一视觉风格，不要求复制场景构图。

## 汴河主视觉 — bianhe-hero-v1.png

正式文件：[scenes/bianhe-hero-v1.png](scenes/bianhe-hero-v1.png)

参考：无，作为整套风格基准。

生成原始路径：`/Users/zhouchen/.codex/generated_images/01a0950f-9327-7422-a6c5-3e464a431d5d/exec-326923af-26a8-4b07-bc7a-f2c042e05eba.png`

```text
Create one finished standalone environment illustration for the historical life-and-trading game 《汴梁归途》. Northern Song Bianjing everyday life, Song painting inspired fine ink outlines and restrained pale mineral color washes on warm ivory paper, subtle natural paper grain, elegant observational human detail, muted indigo teal, soft sage, warm earth and sparse cinnabar accents. Hand-painted flat illustrative depth, not photographic, not 3D, not anime. Landscape 3:2 composition, target 1536x1024 pixels. Fully composed rectangular painting, no decorative border. Small believable people, structurally coherent architecture and objects. Keep important subjects complete with generous crop-safe margins; readable as a small scene card as well as a wide crop. No text, no readable signs or calligraphy, no lettering, logo, watermark, UI, modern objects or modern clothing. Historical atmosphere rather than museum reconstruction.
Scene: A graceful wide view along the Bian River, timber cargo boats with folded cloth sails, modest riverside tiled shops, an arched bridge in the middle distance and small merchants carrying baskets on the quay. Quiet living trading city, gentle morning haze. River gives the composition breathing space, architecture concentrated along banks, lively but not crowded. This is the anchor image for a coordinated six-scene collection.
```

## 街巷 — street-v1.png

正式文件：[scenes/street-v1.png](scenes/street-v1.png)

参考：[汴河主视觉](scenes/bianhe-hero-v1.png)，仅作风格参考。

生成原始路径：`/Users/zhouchen/.codex/generated_images/01a0950f-9327-7422-a6c5-3e464a431d5d/exec-5f6e67d2-e941-4fe1-8b85-39c14f1798fb.png`

```text
Create one finished standalone environment illustration for the historical life-and-trading game 《汴梁归途》. Northern Song Bianjing everyday life, Song painting inspired fine ink outlines and restrained pale mineral color washes on warm ivory paper, subtle natural paper grain, elegant observational human detail, muted indigo teal, soft sage, warm earth and sparse cinnabar accents. Hand-painted flat illustrative depth, not photographic, not 3D, not anime. Landscape 3:2 composition, target 1536x1024 pixels. Fully composed rectangular painting, no decorative border. Small believable people, structurally coherent architecture and objects. Keep important subjects complete with generous crop-safe margins; readable as a small scene card as well as a wide crop. No text, no readable signs or calligraphy, no lettering, logo, watermark, UI, modern objects or modern clothing. Historical atmosphere rather than museum reconstruction.
Reference image: style reference only. Match its paper, fine linework, subdued palette and human rendering. Create an entirely new scene, not a river variation.
Scene: An intimate walkable Bianjing neighborhood lane, modest tiled timber storefronts, baskets outside shops, a few pedestrians and two workers studying a wooden hiring notice board holding blank unmarked paper sheets. Everyday livelihood and available work, soft daylight. Street recedes naturally through the scene. No readable writing anywhere.
```

## 早市 — morning-market-v1.png

正式文件：[scenes/morning-market-v1.png](scenes/morning-market-v1.png)

参考：[汴河主视觉](scenes/bianhe-hero-v1.png)，仅作风格参考。

生成原始路径：`/Users/zhouchen/.codex/generated_images/01a0950f-9327-7422-a6c5-3e464a431d5d/exec-80d7881e-78b3-4cc8-b5e9-01426bb0d59a.png`

```text
Create one finished standalone environment illustration for the historical life-and-trading game 《汴梁归途》. Northern Song Bianjing everyday life, Song painting inspired fine ink outlines and restrained pale mineral color washes on warm ivory paper, subtle natural paper grain, elegant observational human detail, muted indigo teal, soft sage, warm earth and sparse cinnabar accents. Hand-painted flat illustrative depth, not photographic, not 3D, not anime. Landscape 3:2 composition, target 1536x1024 pixels. Fully composed rectangular painting, no decorative border. Small believable people, structurally coherent architecture and objects. Keep important subjects complete with generous crop-safe margins; readable as a small scene card as well as a wide crop. No text, no readable signs or calligraphy, no lettering, logo, watermark, UI, modern objects or modern clothing. Historical atmosphere rather than museum reconstruction.
Reference image: style reference only. Match its paper, fine linework, subdued palette and human rendering. Create an entirely new scene, not a river variation.
Scene: Early morning open market: grain sacks and scoops, shallow baskets of millet and wheat, folded bolts of plain cloth on wooden counters, a few vendors and customers exchanging goods. Gentle cool morning light with pale warm highlights. Clearly a practical provisions market, lively but uncluttered.
```

## 夜市 — night-market-v1.png

正式文件：[scenes/night-market-v1.png](scenes/night-market-v1.png)

参考：[汴河主视觉](scenes/bianhe-hero-v1.png)，仅作风格参考。

生成原始路径：`/Users/zhouchen/.codex/generated_images/01a0950f-9327-7422-a6c5-3e464a431d5d/exec-bbe45740-00be-4525-be5d-5084da01175b.png`

```text
Create one finished standalone environment illustration for the historical life-and-trading game 《汴梁归途》. Northern Song Bianjing everyday life, Song painting inspired fine ink outlines and restrained pale mineral color washes on warm ivory paper, subtle natural paper grain, elegant observational human detail, muted indigo teal, soft sage, warm earth and sparse cinnabar accents. Hand-painted flat illustrative depth, not photographic, not 3D, not anime. Landscape 3:2 composition, target 1536x1024 pixels. Fully composed rectangular painting, no decorative border. Small believable people, structurally coherent architecture and objects. Keep important subjects complete with generous crop-safe margins; readable as a small scene card as well as a wide crop. No text, no readable signs or calligraphy, no lettering, logo, watermark, UI, modern objects or modern clothing. Historical atmosphere rather than museum reconstruction.
Reference image: style reference only. Match its paper, fine linework, subdued palette and human rendering. Create an entirely new scene, not a river variation.
Scene: An early evening Bianjing night market, several modest food stalls and cloth awnings, small warm amber paper lanterns without writing, cooking pots with a little steam and pedestrians browsing. Muted dusk indigo sky, retain warm ivory paper and fine visible ink detail rather than dark cinematic rendering. Welcoming quiet evening trading, no neon.
```

## 茶馆 — teahouse-v1.png

正式文件：[scenes/teahouse-v1.png](scenes/teahouse-v1.png)

参考：[汴河主视觉](scenes/bianhe-hero-v1.png)，仅作风格参考。

生成原始路径：`/Users/zhouchen/.codex/generated_images/01a0950f-9327-7422-a6c5-3e464a431d5d/exec-4761b8a4-3985-44e6-a80b-0e8e3a3d991c.png`

```text
Create one finished standalone environment illustration for the historical life-and-trading game 《汴梁归途》. Northern Song Bianjing everyday life, Song painting inspired fine ink outlines and restrained pale mineral color washes on warm ivory paper, subtle natural paper grain, elegant observational human detail, muted indigo teal, soft sage, warm earth and sparse cinnabar accents. Hand-painted flat illustrative depth, not photographic, not 3D, not anime. Landscape 3:2 composition, target 1536x1024 pixels. Fully composed rectangular painting, no decorative border. Small believable people, structurally coherent architecture and objects. Keep important subjects complete with generous crop-safe margins; readable as a small scene card as well as a wide crop. No text, no readable signs or calligraphy, no lettering, logo, watermark, UI, modern objects or modern clothing. Historical atmosphere rather than museum reconstruction.
Reference image: style reference only. Match its paper, fine linework, subdued palette and human rendering. Create an entirely new scene, not a river variation.
Scene: Interior of a modest Song-era neighborhood teahouse, timber posts and open lattice windows, simple wooden tables and stools, small ceramic tea bowls, an ewer and kettle, a host pouring tea while a few patrons in plain robes converse. A glimpse of the street through the open side. Calm intimate everyday exchange of news, ample uncluttered floor and tabletop space.
```

茶馆初稿（编辑输入）：`/Users/zhouchen/.codex/generated_images/01a0950f-9327-7422-a6c5-3e464a431d5d/exec-1bbaf8c2-9438-432c-ac48-adc64e599a74.png`。该初稿未作为正式素材归档；仅在生成目录保留。正式文件为以下编辑后的结果。

```text
Edit this exact teahouse illustration. Change only the pages of the open book held by the seated man on the far left: remove all printed marks, lettering and calligraphy so both pages are clean blank warm ivory paper, preserving the book shape and shading. Preserve every other element, all people, furniture, composition, paper texture, ink lines, colors and dimensions. No text anywhere. Output the complete 1536x1024 illustration.
```

## 生活小院 — courtyard-v1.png

正式文件：[scenes/courtyard-v1.png](scenes/courtyard-v1.png)

参考：[汴河主视觉](scenes/bianhe-hero-v1.png)，仅作风格参考。

生成原始路径：`/Users/zhouchen/.codex/generated_images/01a0950f-9327-7422-a6c5-3e464a431d5d/exec-444b977b-a6dc-470c-9341-69f01cdde393.png`

```text
Create one finished standalone environment illustration for the historical life-and-trading game 《汴梁归途》. Northern Song Bianjing everyday life, Song painting inspired fine ink outlines and restrained pale mineral color washes on warm ivory paper, subtle natural paper grain, elegant observational human detail, muted indigo teal, soft sage, warm earth and sparse cinnabar accents. Hand-painted flat illustrative depth, not photographic, not 3D, not anime. Landscape 3:2 composition, target 1536x1024 pixels. Fully composed rectangular painting, no decorative border. Small believable people, structurally coherent architecture and objects. Keep important subjects complete with generous crop-safe margins; readable as a small scene card as well as a wide crop. No text, no readable signs or calligraphy, no lettering, logo, watermark, UI, modern objects or modern clothing. Historical atmosphere rather than museum reconstruction.
Reference image: style reference only. Match its paper, fine linework, subdued palette and human rendering. Create an entirely new scene, not a river variation.
Scene: A modest inhabited small domestic courtyard, a simple one-story tiled timber house, small chicken shelter, three hens naturally pecking near a shallow grain bowl, water jar, bamboo basket and neatly stacked firewood, modest kitchen utensils near a doorway. A leafy branch offers shade. Peaceful humble livelihood in gentle afternoon daylight, no palace or luxurious garden.
```
