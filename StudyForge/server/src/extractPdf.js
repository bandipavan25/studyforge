import { PDFParse } from "pdf-parse";

export async function extractPdfText(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const pages = (Array.isArray(result.pages) ? result.pages : [])
      .map((page, index) => ({
        page: page.num ?? page.pageNumber ?? index + 1,
        text: (page.text || "").trim(),
      }))
      .filter((page) => page.text.length > 0);

    const text = pages.length
      ? pages.map((p) => `--- Page ${p.page} ---\n${p.text}`).join("\n\n")
      : (result.text || "").trim();

    if (!text) {
      const error = new Error("No readable text was found. This PDF may be scanned images only.");
      error.status = 400;
      throw error;
    }
    return { text, pageCount: pages.length || result.total || 1 };
  } finally {
    await parser.destroy();
  }
}
