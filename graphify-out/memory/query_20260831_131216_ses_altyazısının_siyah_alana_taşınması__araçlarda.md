---
type: "implementation"
date: "2026-08-31T13:12:16.176721+00:00"
question: "Ses altyazısının siyah alana taşınması, araçlarda font ölçeği ve video tipi gerçek timeline IN/OUT"
contributor: "graphify"
outcome: "useful"
source_nodes: ["initCustomSubtitleOverlay", "applyCustomSubtitleOverlayStyle", "initCustomVideoControls", "initFrameControls", "mediaViewer"]
---

# Q: Ses altyazısının siyah alana taşınması, araçlarda font ölçeği ve video tipi gerçek timeline IN/OUT

## Answer

Ses altyazısı için explicit data-subtitle-overlay-host sahnesi oluşturuldu; initCustomSubtitleOverlay bu hostu seçiyor, ses için custom overlay zorunlu ve ölçek genişlik tabanlı. Ses Araçları native audio controls yerine videonun initCustomVideoControls/customSeekRange bileşenini kullanıyor; customMarkInTick/customMarkOutTick aynı video vurgu CSS'iyle timeline üzerinde gösteriliyor.

## Outcome

- Signal: useful

## Source Nodes

- initCustomSubtitleOverlay
- applyCustomSubtitleOverlayStyle
- initCustomVideoControls
- initFrameControls
- mediaViewer