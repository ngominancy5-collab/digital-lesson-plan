import JSZip from 'jszip';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { isReadableEducationalText, readableWordCount } from '../../../shared/learningEngine.js';

const require = createRequire(import.meta.url);
let PDFParse = null;
try {
  PDFParse = require('pdf-parse').PDFParse;
} catch {
  PDFParse = null;
}

const TEXT_EXTENSIONS = ['.txt', '.md', '.csv', '.html', '.htm', '.rtf'];
const ZIP_EXTENSIONS = ['.docx', '.pptx', '.odt', '.odp', '.xlsx'];

export const SUPPORTED_EXTENSIONS = [...TEXT_EXTENSIONS, ...ZIP_EXTENSIONS, '.pdf', '.doc', '.ppt'];

function extensionOf(fileName = '') {
  const match = String(fileName).toLowerCase().match(/(\.[a-z0-9]+)$/);
  return match ? match[1] : '';
}

function stripXml(xml) {
  return String(xml || '')
    .replace(/<a:t[^>]*>/g, ' ')
    .replace(/<w:tab[^/]*\/>/g, ' ')
    .replace(/<\/(w:p|a:p|text:p)[^>]*>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function decodePdfLiteral(value) {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\t/g, ' ')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\(\d{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
}

function decodeHexPdfString(hex) {
  const clean = String(hex || '').replace(/\s+/g, '');
  if (!clean || clean.length % 2) return '';
  const bytes = Buffer.from(clean, 'hex');
  let offset = 0;
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) offset = 2;
  const looksUtf16 = offset > 0 || (bytes.length >= 4 && bytes[0] === 0x00 && bytes[2] === 0x00);
  if (looksUtf16) {
    const chars = [];
    for (let i = offset; i + 1 < bytes.length; i += 2) {
      chars.push(String.fromCharCode((bytes[i] << 8) + bytes[i + 1]));
    }
    return chars.join('');
  }
  return bytes.toString('utf8');
}

function extractPdfText(buffer) {
  const raw = Buffer.isBuffer(buffer) ? buffer.toString('latin1') : String(buffer || '');
  const chunks = [];
  const streamRe = /stream\r?\n([\s\S]*?)endstream/g;
  let match = streamRe.exec(raw);
  while (match) {
    const data = Buffer.from(match[1], 'latin1');
    let decoded = '';
    try {
      decoded = zlib.inflateSync(data).toString('utf8');
    } catch {
      try {
        decoded = zlib.inflateRawSync(data).toString('utf8');
      } catch {
        decoded = data.toString('latin1');
      }
    }
    chunks.push(decoded);
    match = streamRe.exec(raw);
  }

  const source = `${raw}\n${chunks.join('\n')}`;
  const literals = [...source.matchAll(/\((?:\\.|[^\\)]){2,}\)/g)]
    .map((item) => decodePdfLiteral(item[0].slice(1, -1)))
    .filter((item) => /[A-Za-z]{3,}/.test(item) && !/^[\x00-\x08]+$/.test(item));

  const hexStrings = [...source.matchAll(/<([0-9A-Fa-f\s]{4,})>/g)]
    .map((item) => decodeHexPdfString(item[1]))
    .filter((item) => /[A-Za-z]{2,}/.test(item));

  const tjBlocks = [...source.matchAll(/\[(.*?)\]\s*TJ/g)].map((item) => item[1]);
  tjBlocks.forEach((block) => {
    [...block.matchAll(/\((?:\\.|[^\\)])*\)/g)].forEach((item) => {
      const text = decodePdfLiteral(item[0].slice(1, -1));
      if (/[A-Za-z]{2,}/.test(text)) literals.push(text);
    });
  });

  return [...literals, ...hexStrings].join(' ').replace(/[ \t]{2,}/g, ' ').replace(/\s+\n/g, '\n').trim();
}

function normalizePdfText(value) {
  return String(value || '')
    .replace(/\u0000/g, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function pdfFailure(error) {
  const message = String(error?.message || error?.name || '');
  if (/password/i.test(message) || error?.name === 'PasswordException') {
    const failure = new Error('This PDF is password-protected.');
    failure.code = 'password';
    throw failure;
  }
  const failure = new Error('This PDF could not be read. The file may be damaged.');
  failure.code = 'corrupt';
  throw failure;
}

async function ocrWeakPages(parser, pageNumbers) {
  if (!pageNumbers.length || process.env.PLANWISE_OCR === '0') return {};
  let createWorker;
  try {
    ({ createWorker } = await import('tesseract.js'));
  } catch {
    return {};
  }
  let shots;
  try {
    shots = await parser.getScreenshot({
      partial: pageNumbers.slice(0, 8),
      imageBuffer: true,
      scale: 1.5,
    });
  } catch {
    return {};
  }
  const worker = await createWorker('eng');
  const found = {};
  try {
    // One worker is reused for all weak pages (init once). Generate never re-OCRs — text is stored on Document.
    for (const page of shots.pages || []) {
      if (!page?.data) continue;
      const result = await worker.recognize(Buffer.from(page.data));
      const text = normalizePdfText(result?.data?.text || '');
      if (text) found[page.pageNumber || page.num] = text;
    }
  } finally {
    await worker.terminate();
  }
  return found;
}

async function extractPdf(buffer) {
  if (!PDFParse) pdfFailure(new Error('PDF parser is unavailable.'));
  let parser = null;
  try {
    parser = new PDFParse({ data: new Uint8Array(buffer) });
    const pageLimit = 40;
    const result = await parser.getText({ first: pageLimit });
    const pages = (result.pages || []).map((page) => ({
      num: page.num,
      text: normalizePdfText(page.text),
    }));
    const weak = pages.filter((page) => readableWordCount(page.text) < 8).map((page) => page.num);
    const ocr = weak.length ? await ocrWeakPages(parser, weak) : {};
    pages.forEach((page) => {
      if (ocr[page.num]) page.text = [page.text, ocr[page.num]].filter(Boolean).join('\n');
    });
    const unreadPages = pages.filter((page) => readableWordCount(page.text) < 8).map((page) => page.num);
    const combined = pages
      .filter((page) => page.text)
      .map((page) => `--- Page ${page.num} ---\n${page.text}`)
      .join('\n\n')
      || normalizePdfText(result.text);
    return {
      text: combined,
      unreadPages,
      pageCount: result.total || pages.length,
      truncated: (result.total || pages.length) > pageLimit,
      usedOcr: Object.keys(ocr).length > 0,
    };
  } catch (error) {
    if (error?.code === 'password' || error?.code === 'corrupt') throw error;
    const fallback = normalizePdfText(extractPdfText(buffer));
    if (isReadableEducationalText(fallback)) {
      return { text: fallback, unreadPages: [], pageCount: 0, usedOcr: false };
    }
    pdfFailure(error);
  } finally {
    await parser?.destroy?.().catch(() => {});
  }
  return { text: '', unreadPages: [], pageCount: 0, usedOcr: false };
}

async function extractZipDocument(buffer, ext) {
  const zip = await JSZip.loadAsync(buffer);
  const files = Object.keys(zip.files);

  if (ext === '.docx') {
    const doc = zip.file('word/document.xml');
    if (!doc) throw new Error('This Word file does not contain readable document.xml content.');
    return stripXml(await doc.async('string'));
  }

  if (ext === '.pptx') {
    const slides = files.filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name)).sort();
    if (!slides.length) throw new Error('This PowerPoint file does not contain readable slides.');
    const texts = [];
    for (const name of slides) {
      texts.push(stripXml(await zip.file(name).async('string')));
    }
    return texts.filter(Boolean).join('\n\n');
  }

  if (ext === '.odt' || ext === '.odp') {
    const content = zip.file('content.xml');
    if (!content) throw new Error('This OpenDocument file does not contain readable content.');
    return stripXml(await content.async('string'));
  }

  if (ext === '.xlsx') {
    const shared = zip.file('xl/sharedStrings.xml');
    if (!shared) throw new Error('This spreadsheet does not contain readable shared strings.');
    return stripXml(await shared.async('string'));
  }

  throw new Error('Unsupported compressed document type.');
}

const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

export function isOleCompound(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 8 && buffer.subarray(0, 8).equals(OLE_MAGIC);
}

export function isZipDocument(buffer) {
  return Buffer.isBuffer(buffer)
    && buffer.length >= 4
    && buffer[0] === 0x50
    && buffer[1] === 0x4b
    && (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07);
}

async function extractLegacyDoc(buffer, name) {
  if (isZipDocument(buffer)) {
    return {
      error: `“${name}” is a newer Word file.`,
      detail: 'Upload it as DOCX.',
    };
  }
  if (!isOleCompound(buffer)) {
    return {
      error: `“${name}” is not a Word 97–2003 document.`,
      detail: 'Upload a real DOC file, or save it as DOCX.',
    };
  }
  const imported = await import('word-extractor');
  const WordExtractor = imported.default || imported;
  const extracted = await new WordExtractor().extract(buffer);
  return { text: String(extracted.getBody?.() || '') };
}

function extractPlainText(buffer, ext) {
  const text = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer || '');
  if (ext === '.html' || ext === '.htm') return stripXml(text);
  if (ext === '.rtf') return text.replace(/\\par[d]?/g, '\n').replace(/\\'[0-9a-fA-F]{2}/g, ' ').replace(/\\[a-z]+\d* ?/g, '').replace(/[{}]/g, ' ').replace(/\s+/g, ' ').trim();
  return text;
}

export async function parseUploadedDocument({ fileName, mimeType, contentBase64, filePath }) {
  const name = fileName || 'upload';
  const ext = extensionOf(name);
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    return {
      ok: false,
      fileName: name,
      error: `“${name}” is not supported.`,
      detail: 'Upload a PDF, Word, PowerPoint, TXT, or similar text file.',
    };
  }

  let buffer;
  try {
    buffer = Buffer.from(contentBase64, 'base64');
  } catch {
    return { ok: false, fileName: name, error: `Could not read “${name}”.`, detail: 'The upload did not contain a readable file.' };
  }

  if (!buffer.length) {
    return { ok: false, fileName: name, error: `“${name}” is empty.`, detail: 'Choose a file that contains text.' };
  }

  const maxBytes = Number(process.env.MAX_UPLOAD_BYTES || 15 * 1024 * 1024);
  if (buffer.length > maxBytes) {
    return { ok: false, fileName: name, error: `“${name}” is too large.`, detail: 'The limit is 15 MB.' };
  }

  try {
    let text = '';
    let warning = '';
    if (ext === '.pdf') {
      const pdf = await extractPdf(buffer);
      text = pdf.text;
      if (pdf.unreadPages?.length) {
        warning = `Pages ${pdf.unreadPages.join(', ')} had no readable text.`;
      }
      if (pdf.truncated) {
        warning = [warning, 'Only the first 40 pages were read.'].filter(Boolean).join(' ');
      }
    } else if (ZIP_EXTENSIONS.includes(ext)) text = await extractZipDocument(buffer, ext);
    else if (TEXT_EXTENSIONS.includes(ext)) text = extractPlainText(buffer, ext);
    else if (ext === '.doc') {
      const legacy = await extractLegacyDoc(buffer, name);
      if (legacy.error) return { ok: false, fileName: name, fileType: 'DOC', error: legacy.error, detail: legacy.detail || '' };
      text = legacy.text;
    } else if (ext === '.ppt') {
      const recovered = buffer.toString('utf8').replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ').replace(/\s{2,}/g, ' ').trim();
      if (!isReadableEducationalText(recovered)) {
        return {
          ok: false,
          fileName: name,
          error: `Could not read “${name}”.`,
          detail: 'Save this older PowerPoint file as PPTX or PDF, then upload it again.',
        };
      }
      text = recovered;
    }

    const cleaned = String(text || '').replace(/\u0000/g, ' ').trim();
    if (readableWordCount(cleaned) < 8) {
      return {
        ok: false,
        fileName: name,
        fileType: ext.replace('.', '').toUpperCase(),
        error: `Could not read “${name}”.`,
        detail: warning || 'No readable text was found in this file.',
      };
    }

    return {
      ok: true,
      fileName: name,
      fileType: ext.replace('.', '').toUpperCase(),
      mimeType: mimeType || '',
      wordCount: readableWordCount(cleaned),
      text: warning ? `${cleaned}\n\nNote: ${warning}` : cleaned,
      ...(warning ? { warning } : {}),
    };
  } catch (error) {
    const raw = String(error?.message || '');
    const safe = /node_modules|\\|[A-Za-z]:\\|\/users\//i.test(raw)
      ? 'The file could not be processed.'
      : (raw || 'The file could not be processed.');
    const detail = error.code === 'password'
      ? 'Remove the password and upload the PDF again.'
      : safe;
    return {
      ok: false,
      fileName: name,
      error: `Could not read “${name}”.`,
      detail,
    };
  }
}
