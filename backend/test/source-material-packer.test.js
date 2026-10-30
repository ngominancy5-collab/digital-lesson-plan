import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearSourcePackCache,
  deriveTopicsFromMaterial,
  packSourceMaterial,
} from '../src/services/ai/sourceMaterialPacker.js';

test('packSourceMaterial prefers headings and topic matches over head-only truncation', () => {
  clearSourcePackCache();
  const filler = Array.from({ length: 40 }, (_, i) => `Filler paragraph ${i + 1} with general remarks about the course and administration.`).join('\n\n');
  const text = [
    '--- Page 1 ---',
    'Welcome to the course handbook.',
    filler,
    '--- Page 8 ---',
    'Chapter 3 File Handling in PHP',
    'Students learn to open, read, and write files using fopen and fread.',
    'Example: fopen("data.txt", "r");',
    '--- Page 9 ---',
    'Unit 4 Logical Operators',
    'AND, OR and NOT control branching decisions in PHP programs.',
  ].join('\n');

  const packed = packSourceMaterial(
    [{ id: 'doc-1', name: 'PHP-notes.pdf', text }],
    { topics: ['File Handling', 'Logical Operators'], totalBudget: 1800 },
  );

  assert.equal(packed.fromCache, false);
  assert.ok(packed.usedChars <= 1800);
  assert.match(packed.materialText, /File Handling in PHP/i);
  assert.match(packed.materialText, /Logical Operators/i);
  assert.ok(!packed.materialText.includes('Filler paragraph 1') || packed.materialText.includes('File Handling'));
});

test('packSourceMaterial reuses cached packs for identical inputs', () => {
  clearSourcePackCache();
  const files = [{ id: 'a', name: 'notes.txt', text: 'Topic: Arrays\n\nArrays store ordered values in PHP.\n\nTopic: Loops\n\nFor loops repeat instructions.' }];
  const first = packSourceMaterial(files, { topics: ['Arrays'], totalBudget: 500 });
  const second = packSourceMaterial(files, { topics: ['Arrays'], totalBudget: 500 });
  assert.equal(first.fromCache, false);
  assert.equal(second.fromCache, true);
  assert.equal(first.materialText, second.materialText);
});

test('packSourceMaterial shares budget across multiple files', () => {
  clearSourcePackCache();
  const files = [
    { id: '1', name: 'one.pdf', text: `${'Alpha content about functions.\n\n'.repeat(30)}Chapter Functions\nDefine reusable blocks.` },
    { id: '2', name: 'two.pdf', text: `${'Beta content about classes.\n\n'.repeat(30)}Chapter Classes\nObjects encapsulate state.` },
  ];
  const packed = packSourceMaterial(files, { topics: ['Functions', 'Classes'], totalBudget: 2000 });
  assert.match(packed.materialText, /Source file: one\.pdf/);
  assert.match(packed.materialText, /Source file: two\.pdf/);
  assert.ok(packed.usedChars <= 2000);
});

test('deriveTopicsFromMaterial extracts heading-like lines', () => {
  const topics = deriveTopicsFromMaterial(`
Source file: demo.pdf
Chapter 1 Introduction to PHP
Some body text
Unit 2 Variables and Types
More body
`);
  assert.ok(topics.some((topic) => /Introduction to PHP/i.test(topic)));
  assert.ok(topics.some((topic) => /Variables and Types/i.test(topic)));
});
