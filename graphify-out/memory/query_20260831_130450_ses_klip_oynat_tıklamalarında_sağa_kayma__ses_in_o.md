---
type: "implementation"
date: "2026-08-31T13:04:50.773629+00:00"
question: "Ses klip oynat tıklamalarında sağa kayma, ses IN/OUT timeline işaretleri ve fazla siyah player boşluğu"
contributor: "graphify"
outcome: "useful"
source_nodes: ["mediaViewer", "initFrameControls", "ensureDetailPanelMinWidth", "measureClipsPanelRequiredWidth"]
---

# Q: Ses klip oynat tıklamalarında sağa kayma, ses IN/OUT timeline işaretleri ve fazla siyah player boşluğu

## Answer

Ses varlıklarında renderCuts scrollIntoView ve detay paneli genişletme çağrıları devre dışı bırakıldı; video davranışı korundu. Ses araçları kontrol çubuğuna markInTick/markOutTick rayı eklendi. Genel 420px viewer yüksekliğini ezen ses özel CSS ile player yüksekliği otomatik, altyazı sahnesi 72px ve audio kontrolü 54px yapıldı; resize/overflow kapatıldı.

## Outcome

- Signal: useful

## Source Nodes

- mediaViewer
- initFrameControls
- ensureDetailPanelMinWidth
- measureClipsPanelRequiredWidth