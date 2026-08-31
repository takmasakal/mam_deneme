---
type: "implementation"
date: "2026-08-31T12:32:49.951157+00:00"
question: "Ses dosyaları için video araçlarına benzer ses araçları penceresi; klip, altyazı, kanallar; üçüncü kolonda Shift+A bindirme ve admin border"
contributor: "graphify"
outcome: "useful"
source_nodes: ["mediaViewer", "initAssetPlayer", "initFrameControls", "initCustomSubtitleOverlay", "renderSubtitleRecords"]
---

# Q: Ses dosyaları için video araçlarına benzer ses araçları penceresi; klip, altyazı, kanallar; üçüncü kolonda Shift+A bindirme ve admin border

## Answer

mediaViewer ses araçları modu eklendi; initFrameControls, initVideoSubtitleTools, initAudioTools ve initCustomSubtitleOverlay mevcut akışları ses modalında birleştirildi. Detay görünümünde oynatıcı, altyazı bindirme anahtarı ve Ses Araçları düğmesi bırakıldı. Admin gruplamasına assetType taşındı.

## Outcome

- Signal: useful

## Source Nodes

- mediaViewer
- initAssetPlayer
- initFrameControls
- initCustomSubtitleOverlay
- renderSubtitleRecords