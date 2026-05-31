// Дополнительные embind-биндинги, которые добавляют в CanvasKit PDF-бэкенд Skia
// (SkPDF). Стандартная сборка canvaskit-wasm их НЕ содержит, поэтому их нужно
// прикомпилировать к canvaskit_bindings.cpp (см. scripts/build-canvaskit-pdf.sh).
//
// Экспортируемый JS-API (его и ожидает src/pdf/exportPdf.ts):
//
//   const doc    = CanvasKit.MakePDFDocument();
//   const canvas = doc.beginPage(width, height); // обычный CanvasKit.Canvas
//   // ...рисуем тем же кодом, что и на экран...
//   doc.endPage();
//   const bytes  = doc.close();                   // Uint8Array с PDF
//
// Идея: SkCanvas страницы PDF — это такой же SkCanvas, что и у экранной
// поверхности. Значит, наш SkiaTarget рисует в PDF тем же кодом, и вывод
// получается векторным «бесплатно».

#include <emscripten.h>
#include <emscripten/bind.h>
#include <emscripten/val.h>

#include "include/core/SkCanvas.h"
#include "include/core/SkData.h"
#include "include/core/SkDocument.h"
#include "include/core/SkRefCnt.h"
#include "include/core/SkStream.h"
#include "include/docs/SkPDFDocument.h"

using namespace emscripten;

// Лёгкая обёртка над SkPDF-документом и потоком в память.
class PDFDocumentJS {
 public:
  PDFDocumentJS() {
    SkPDF::Metadata metadata;
    metadata.fTitle = SkString("PixiJS -> Skia -> PDF");
    metadata.fCreator = SkString("pixi-skia-pdf");
    fDocument = SkPDF::MakeDocument(&fStream, metadata);
  }

  // Начинает новую страницу и возвращает её SkCanvas (тип CanvasKit.Canvas в JS).
  SkCanvas* beginPage(SkScalar width, SkScalar height) {
    return fDocument ? fDocument->beginPage(width, height) : nullptr;
  }

  void endPage() {
    if (fDocument) fDocument->endPage();
  }

  // Закрывает документ и возвращает PDF как Uint8Array (копия, безопасная для JS).
  val close() {
    if (fDocument) {
      fDocument->close();
      fDocument.reset();
    }
    sk_sp<SkData> data = fStream.detachAsData();
    val view = typed_memory_view(data->size(), data->bytes());
    // new Uint8Array(view) копирует данные синхронно, до освобождения SkData.
    return val::global("Uint8Array").new_(view);
  }

 private:
  SkDynamicMemoryWStream fStream;
  sk_sp<SkDocument> fDocument;
};

static PDFDocumentJS* MakePDFDocument() { return new PDFDocumentJS(); }

EMSCRIPTEN_BINDINGS(SkiaPDFBackend) {
  class_<PDFDocumentJS>("PDFDocumentJS")
      .function("beginPage", &PDFDocumentJS::beginPage, allow_raw_pointers())
      .function("endPage", &PDFDocumentJS::endPage)
      .function("close", &PDFDocumentJS::close);

  function("MakePDFDocument", &MakePDFDocument, allow_raw_pointers());
}
