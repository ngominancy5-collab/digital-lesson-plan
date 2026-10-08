function cleanField(value, { firstSentence = false } = {}) {
  const trimmed = String(value || '').replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;
  if (firstSentence) {
    const sentence = trimmed.match(/^(.{2,90}?)\.\s+[A-Z]/);
    if (sentence) return sentence[1].trim();
  }
  return trimmed.slice(0, 180);
}

function labeled(text, label) {
  const match = String(text || '').match(new RegExp(`(?:^|[\\n\\r])\\s*(?:${label})\\s*[:\\-]\\s*([^\\n\\r]+)`, 'i'))
    || String(text || '').match(new RegExp(`(?:${label})\\s*[:\\-]\\s*([^\\n\\r]+)`, 'i'));
  return match?.[1] || '';
}

function sectionAfter(lines, heading) {
  const start = lines.findIndex((line) => heading.test(line));
  if (start < 0) return [];
  const items = [];
  for (const line of lines.slice(start + 1)) {
    if (/^(course|learning objectives|objectives|assessment|references)\b/i.test(line) && items.length) break;
    const cleaned = line.replace(/^[\d]+[.)\-]\s*/, '').replace(/^[-*•]\s*/, '').trim();
    if (cleaned) items.push(cleaned);
    if (items.length >= 24) break;
  }
  return items;
}

export function analyzeCourseOutline(text) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const codeInText = String(text || '').match(/\b([A-Z]{2,8}\s?-?\d{3,4}[A-Z]?)\b/);
  return {
    courseName: cleanField(labeled(text, 'course\\s*name|course\\s*title|module\\s*title'), { firstSentence: true }),
    courseCode: cleanField(labeled(text, 'course\\s*code|module\\s*code'))
      || (codeInText ? codeInText[1].replace(/\s+/g, '') : null),
    description: cleanField(labeled(text, 'course\\s*description|description|overview'), { firstSentence: true }),
    topics: sectionAfter(lines, /^(topics?|course\s*outline|outline|syllabus|units?)\b/i),
    objectives: sectionAfter(lines, /^(learning\s*objectives?|objectives?|learning\s*outcomes?)\b/i),
  };
}
