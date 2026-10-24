# 数据生成脚本

这些脚本只在需要更新数据快照时运行，网站本身不依赖它们。都需要联网，并按 iNaturalist 建议的约每秒 1 次请求限速。

| 脚本 | 生成 | 说明 |
| --- | --- | --- |
| `gen_species3.py` | `js/data/species3.js` | 地球视角扩充名录：每个大洲 × 类群取最受欢迎的研究级观测，配中文名、中文维基简介和 IUCN 等级。约 5–10 分钟 |
| `tree_leaf_ranks.py` | `leaf_ranks.json`（中间文件） | 查出生命树每个末端节点在 iNaturalist 中的等级。需要先把 `js/data/tree.js` 的末端节点导出为 `leaves.txt`（每行 `中文名\|学名`） |
| `gen_treeSpecies.py` | `js/data/treeSpecies.js` | 读取 `leaf_ranks.json`，给每个还不到“种”的末端节点挂 2 个代表物种 |

`js/data/sizes.js`（尺度视角的 Wikidata 尺寸快照）是用 SPARQL 查询 P2043（长度）与 P2386（直径）后，再用 wbgetentities 批量取中文名与图片生成的。
运行前请检查脚本开头的 `SITE` 路径。
