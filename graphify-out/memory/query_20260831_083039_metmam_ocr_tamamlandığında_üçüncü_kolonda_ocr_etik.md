---
type: "query"
date: "2026-08-31T08:30:39.159277+00:00"
question: "MetMAM OCR tamamlandığında üçüncü kolonda OCR etiketi neden otomatik görünmüyor ve nasıl düzeltilir?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["queueVideoOcrJob()", "saveAssetVideoOcrMetadata()", "saveAssetSubtitleMetadata()", "detailArtifactBadges()"]
---

# Q: MetMAM OCR tamamlandığında üçüncü kolonda OCR etiketi neden otomatik görünmüyor ve nasıl düzeltilir?

## Answer

Expanded from original query via graph vocab: [ocr, subtitle, active, extract, metadata, video, badge, column, status, completed, enabled, artifact]. queueVideoOcrJob completed the persisted media job but did not persist the active OCR URL into asset dc_metadata; the browser save call or Active PATCH later set videoOcrUrl. The fix calls saveAssetVideoOcrMetadata with a freshly loaded asset row before persisting the completed job, preserving concurrent metadata and making the OCR badge state available atomically with completion.

## Outcome

- Signal: useful

## Source Nodes

- queueVideoOcrJob()
- saveAssetVideoOcrMetadata()
- saveAssetSubtitleMetadata()
- detailArtifactBadges()