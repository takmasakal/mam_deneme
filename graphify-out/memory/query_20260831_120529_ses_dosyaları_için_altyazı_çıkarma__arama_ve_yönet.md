---
type: "query"
date: "2026-08-31T12:05:29.610483+00:00"
question: "Ses dosyaları için altyazı çıkarma, arama ve yönetim desteği nasıl eklenir?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["queueSubtitleGenerationJob()", "transcribeMediaToVtt()", "saveAssetSubtitleMetadata()", "syncSubtitleCueIndexForAssetRow()", "renderSubtitleRecords()", "initAssetPlayer()"]
---

# Q: Ses dosyaları için altyazı çıkarma, arama ve yönetim desteği nasıl eklenir?

## Answer

Expanded from original query via graph vocab: [audio, subtitle, transcribe, search, admin, record, asset, media, index, border, color, video]. Graph traversal showed queueSubtitleGenerationJob and transcribeMediaToVtt already accept generic media input, while textProcessing routes rejected non-video assets. The implementation adds an audio-aware subtitle media gate, reuses saveAssetSubtitleMetadata and syncSubtitleCueIndexForAssetRow, renders and initializes existing subtitle tools for audio assets, and marks audio subtitle admin rows with a distinct border class.

## Outcome

- Signal: useful

## Source Nodes

- queueSubtitleGenerationJob()
- transcribeMediaToVtt()
- saveAssetSubtitleMetadata()
- syncSubtitleCueIndexForAssetRow()
- renderSubtitleRecords()
- initAssetPlayer()