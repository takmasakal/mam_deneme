---
type: "implementation"
date: "2026-08-31T12:50:45.985946+00:00"
question: "Ses araçlarına sağ üst çarktan tam sayfa geçiş, detay player pause, üst siyah altyazı alanı, butonların kaldırılması ve sağ volume paneli"
contributor: "graphify"
outcome: "useful"
source_nodes: ["openVideoToolsPage", "videoToolsPageMarkup", "mediaViewer", "setPanelVideoToolsButtonState", "initAssetPlayer"]
---

# Q: Ses araçlarına sağ üst çarktan tam sayfa geçiş, detay player pause, üst siyah altyazı alanı, butonların kaldırılması ve sağ volume paneli

## Answer

Video araçlarının view=video-tools tam sayfa akışı ses varlıklarını da kabul edecek şekilde genişletildi. Panel çarkı ses varlığında Ses Araçları etiketiyle açılıyor ve yönlendirmeden önce player pause ediliyor. Ses detay oynatıcısına üst siyah altyazı sahnesi eklendi; inline kontrol butonları kaldırıldı. Tam sayfa ses araçlarında oynatıcı sol, kanal/volume paneli sağ kolon yerleşimine alındı.

## Outcome

- Signal: useful

## Source Nodes

- openVideoToolsPage
- videoToolsPageMarkup
- mediaViewer
- setPanelVideoToolsButtonState
- initAssetPlayer