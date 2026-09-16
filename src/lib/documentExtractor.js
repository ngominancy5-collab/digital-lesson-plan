import JSZip from 'jszip';

export const ACCEPTED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.odt', '.odp', '.txt', '.md', '.rtf', '.html', '.htm', '.csv'];
export const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.join(',');

function fileExtension(name = '') {
  const match = String(name).toLowerCase().match(/(\.[a-z0-9]+)$/);
  return match ? match[1] : '';
}

function stripXml(xml) {
  return String(xml || '')
    .replace(/<\/(w:p|a:p|text:p)[^>]*>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

async function extractZipText(file, ext) {
  const zip = await JSZip.loadAsync(file);
  if (ext === '.docx') {
    const doc = zip.file('word/document.xml');
    if (!doc) throw new Error('missing document.xml');
    return stripXml(await doc.async('string'));
  }
  if (ext === '.pptx') {
    const slides = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name)).sort();
    const parts = [];
    for (const name of slides) parts.push(stripXml(await zip.file(name).async('string')));
    return parts.join('\n\n');
  }
  const content = zip.file('content.xml');
  if (content) return stripXml(await content.async('string'));
  throw new Error('unsupported office format');
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(new Error('The file could not be read from your device.'));
    reader.readAsDataURL(file);
  });
}

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('The file could not be read as text.'));
    reader.readAsText(file);
  });
}

export async function extractLocalDocument(file, onProgress = () => {}) {
  const ext = fileExtension(file.name);
  if (!ACCEPTED_EXTENSIONS.includes(ext)) {
    throw new Error(`“${file.name}” is not a supported learning file.`);
  }

  onProgress(18);
  if (['.txt', '.md', '.csv', '.html', '.htm', '.rtf'].includes(ext)) {
    const text = await readAsText(file);
    onProgress(70);
    return text;
  }

  if (['.docx', '.pptx', '.odt', '.odp'].includes(ext)) {
    const text = await extractZipText(file, ext);
    onProgress(70);
    return text;
  }

  return '';
}

export { fileExtension, fileToBase64 };
