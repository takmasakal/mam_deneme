---
type: "implementation"
date: "2026-08-31T13:27:24.674129+00:00"
question: "Ses klipleri açılınca sayfa genişliği büyümesin, üst boşluk ve altyazı ebat artı eksi kontrolü"
contributor: "graphify"
outcome: "useful"
source_nodes: ["videoToolsPageMarkup", "applySubtitleStyleSettings", "initAssetPlayer", "initCollapsibleSections"]
---

# Q: Ses klipleri açılınca sayfa genişliği büyümesin, üst boşluk ve altyazı ebat artı eksi kontrolü

## Answer

Ses araçları sayfasına audio-tools-page-body sınıfı eklendi; klip timecode/action satırları wrap edilip tüm klip containerları width/max-width 100 ve min-width 0 ile sınırlandı. Sayfa gövdesine üst padding eklendi. Altyazı başlığına eksi/artı kontrolü kondu; subtitleStyleSettings.fontSize 2px adımlarla 12-64 aralığında değiştirilip localStorage'da saklanıyor ve açık overlayler anında sync ediliyor.

## Outcome

- Signal: useful

## Source Nodes

- videoToolsPageMarkup
- applySubtitleStyleSettings
- initAssetPlayer
- initCollapsibleSections