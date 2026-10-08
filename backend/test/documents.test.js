import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { isOleCompound, isZipDocument, parseUploadedDocument } from '../src/services/documentParser.js';

const require = createRequire(import.meta.url);
const PDFDocument = require('pdfkit');
const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

function asUpload(name, bytes) {
  return parseUploadedDocument({
    fileName: name,
    contentBase64: Buffer.from(bytes).toString('base64'),
  });
}

// word97-sample.doc is a real Word 97-2003 OLE file (compound-file header D0 CF 11 E0).
test('a real Word 97-2003 document extracts its text', async () => {
  const bytes = await fs.readFile(path.join(fixtures, 'word97-sample.doc'));
  assert.equal(isOleCompound(bytes), true);
  assert.equal(isZipDocument(bytes), false);
  const parsed = await asUpload('word97-sample.doc', bytes);
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal(parsed.fileType, 'DOC');
  assert.match(parsed.text, /A second test of reviewing/);
  assert.match(parsed.text, /This text has been inserted/);
});

test('a textless OLE document is rejected', async () => {
  const bytes = Buffer.alloc(4096);
  bytes.writeUInt32LE(0xe011cfd0, 0);
  bytes.writeUInt32LE(0xe11ab1a1, 4);
  assert.equal(isOleCompound(bytes), true);
  const parsed = await asUpload('empty.doc', bytes);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /could not process|could not extract enough readable text/i);
});

test('a corrupted .doc and a misnamed .docx are rejected', async () => {
  const corrupt = Buffer.from('this is not a word document, just plain bytes pretending to be one');
  const corruptResult = await asUpload('notes.doc', corrupt);
  assert.equal(corruptResult.ok, false);
  assert.match(corruptResult.error, /not a Word 97/);

  const real = await fs.readFile(path.join(fixtures, 'word97-sample.doc'));
  const damaged = Buffer.from(real);
  damaged.fill(0x11, 512);
  const damagedResult = await asUpload('damaged.doc', damaged);
  assert.equal(damagedResult.ok, false);
  assert.match(damagedResult.error, /could not process|not a Word 97|could not extract/i);

  const zip = new JSZip();
  zip.file('word/document.xml', '<w:document><w:body><w:p><w:r><w:t>This is docx text and should not be read as a legacy doc.</w:t></w:r></w:p></w:body></w:document>');
  const docx = await zip.generateAsync({ type: 'nodebuffer' });
  const renamed = await asUpload('lesson.doc', docx);
  assert.equal(renamed.ok, false);
  assert.match(renamed.error, /newer Word file/);
});

test('txt, docx, and pdf extraction still works', async () => {
  const txt = await asUpload('notes.txt', Buffer.from('Course name: Algebra. This text file explains linear equations, graphs, and classroom examples for secondary school mathematics lessons.'));
  assert.equal(txt.ok, true, txt.error);
  assert.match(txt.text, /Algebra/);

  const zip = new JSZip();
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:r><w:t>Course name: Chemistry Basics. This outline introduces atoms, bonding, and classroom experiments for secondary school science lessons with enough words to read.</w:t></w:r></w:p>
</w:body></w:document>`);
  const docx = await zip.generateAsync({ type: 'nodebuffer' });
  const word = await asUpload('chemistry.docx', docx);
  assert.equal(word.ok, true, word.error);
  assert.match(word.text, /Chemistry Basics/);

  const pdf = await new Promise((resolve) => {
    const doc = new PDFDocument();
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.text('Course name: Biology of Cells. This paragraph explains cell membranes, mitochondria, and how teachers describe organelle structure to first year students using clear classroom language.');
    doc.end();
  });
  const parsedPdf = await asUpload('biology.pdf', pdf);
  assert.equal(parsedPdf.ok, true, parsedPdf.error);
  assert.match(parsedPdf.text, /Biology of Cells/);
});
