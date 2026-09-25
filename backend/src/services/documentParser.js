import JSZip from 'jszip';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { isReadableEducationalText, readableWordCount } from '../../../shared/learningEngine.js';

const require = createRequire(import.meta.url);
let pdfParse = null;
try {
  pdfParse = require('pdf-parse');
} catch {
  pdfParse = null;
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

async function extractPdf(buffer) {
  if (pdfParse) {
    try {
      const parsed = await pdfParse(buffer);
      const text = String(parsed?.text || '').trim();
      if (isReadableEducationalText(text)) return text;
    } catch {
      // Fall through to the lightweight extractor.
    }
  }
  return extractPdfText(buffer);
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

function extractPlainText(buffer, ext) {
  const text = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer || '');
  if (ext === '.html' || ext === '.htm') return stripXml(text);
  if (ext === '.rtf') return text.replace(/\\par[d]?/g, '\n').replace(/\\'[0-9a-fA-F]{2}/g, ' ').replace(/\\[a-z]+\d* ?/g, '').replace(/[{}]/g, ' ').replace(/\s+/g, ' ').trim();
  return text;
}

export async function parseUploadedDocument({ fileName, mimeType, contentBase64 }) {
  const name = fileName || 'upload';
  const ext = extensionOf(name);
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    return {
      ok: false,
      fileName: name,
      error: `“${name}” is not a supported learning file. Upload PDF, Word, PowerPoint, OpenDocument, TXT, MD, HTML, CSV, or RTF.`,
    };
  }

  let buffer;
  try {
    buffer = Buffer.from(contentBase64, 'base64');
  } catch {
    return { ok: false, fileName: name, error: `The file “${name}” could not be read from the upload.` };
  }

  if (!buffer.length) {
    return { ok: false, fileName: name, error: `“${name}” was empty, so it could not be analysed.` };
  }

  try {
    let text = '';
    if (ext === '.pdf') text = await extractPdf(buffer);
    else if (ZIP_EXTENSIONS.includes(ext)) text = await extractZipDocument(buffer, ext);
    else if (TEXT_EXTENSIONS.includes(ext)) text = extractPlainText(buffer, ext);
    else if (ext === '.doc' || ext === '.ppt') {
      const recovered = buffer.toString('utf8').replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ').replace(/\s{2,}/g, ' ').trim();
      if (!isReadableEducationalText(recovered)) {
        return {
          ok: false,
          fileName: name,
          error: `“${name}” looks like an older binary Office file. I could not extract selectable text. Please save it as .docx, .pptx, or PDF and upload again.`,
        };
      }
      text = recovered;
    }

    const cleaned = String(text || '').replace(/\u0000/g, ' ').trim();
    if (!isReadableEducationalText(cleaned) || readableWordCount(cleaned) < 16) {
      return {
        ok: false,
        fileName: name,
        fileType: ext.replace('.', '').toUpperCase(),
        error: `I opened “${name}” but could not extract enough readable text. This often happens with scanned PDFs, image-only slides, or encoded fonts. Please upload a Word, PowerPoint, TXT, or text-based PDF file.`,
      };
    }

    return {
      ok: true,
      fileName: name,
      fileType: ext.replace('.', '').toUpperCase(),
      mimeType: mimeType || '',
      wordCount: readableWordCount(cleaned),
      text: cleaned,
    };
  } catch (error) {
    return {
      ok: false,
      fileName: name,
      error: `I could not process “${name}”: ${error.message || 'unsupported or unreadable file'}. I did not analyse this file.`,
    };
  }
}
