#!/usr/bin/env node
/**
 * extract-quiz-data.js
 * chie-game-go のゲームデータから、Web クイズページ用の最適化 JSON を生成する。
 *
 * 出力:
 *   public/assets/data/quiz-inga.json   — シナリオ型因果クイズ (event mode)
 *   public/assets/data/quiz-ichimon.json — 一問一答 (test mode + 用語クイズ)
 *   public/assets/data/quiz-chain.json  — 因果チェーン学習
 */
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../chie-game-go/assets/data');
const OUT = path.resolve(__dirname, '../public/assets/data');
fs.mkdirSync(OUT, { recursive: true });

// ── Era Mapping ──────────────────────────────────────────────
const ERA_KEY = {
  E00_Any: 'all', E02_AsukaNara: 'asuka_nara',
  E03_Heian: 'heian', E04_Kamakura: 'kamakura',
  E05_Muromachi: 'muromachi',
  E06_Sengoku: 'sengoku', E06_SengokuEarly: 'sengoku',
  E07_SengokuMid: 'sengoku', E08_SengokuLate: 'sengoku',
  E09_AzuchiMomoyama: 'azuchi',
  E10_EdoEarly: 'edo', E11_EdoMid: 'edo',
  E12_EdoLate: 'edo', E14_EdoGeneral: 'edo',
  E15_Bakumatsu: 'bakumatsu', E16_Final: 'bakumatsu',
};
const ERA_LABELS = [
  { id: 'asuka_nara', name: '飛鳥・奈良', color: '#4a7c59' },
  { id: 'heian',      name: '平安',       color: '#8b5cf6' },
  { id: 'kamakura',   name: '鎌倉',       color: '#3b82f6' },
  { id: 'muromachi',  name: '室町',       color: '#6366f1' },
  { id: 'sengoku',    name: '戦国',       color: '#ef4444' },
  { id: 'azuchi',     name: '安土桃山',   color: '#f59e0b' },
  { id: 'edo',        name: '江戸',       color: '#0ea5e9' },
  { id: 'bakumatsu',  name: '幕末',       color: '#f97316' },
];

function mapEra(eraId) { return ERA_KEY[eraId] || 'all'; }

function extractTag(text) {
  const m = text.match(/^【(.+?)】/);
  return m ? m[1] : '';
}

// ── Read Source Data ─────────────────────────────────────────
function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(SRC, relPath), 'utf8'));
}

// Event files (main per-era, no sub-files to avoid duplicates)
const EVENT_FILES = [
  'events/E02_AsukaNara.json',
  'events/E03_Heian.json',
  'events/E04_Kamakura.json',
  'events/E05_Muromachi.json',
  'events/E06_Sengoku.json',
  'events/E09_AzuchiMomoyama.json',
  'events/E14_EdoGeneral.json',
  'events/E15_Bakumatsu.json',
];

const seenIds = new Set();
const allEvents = [];
for (const f of EVENT_FILES) {
  const data = readJson(f);
  for (const item of data.items) {
    if (seenIds.has(item.id)) continue;
    seenIds.add(item.id);
    // Only include events that have both test and event modes with choices
    const hasTest = item.test && item.test.choices && item.test.choices.length >= 4;
    const hasEvent = item.event && item.event.choices && item.event.choices.length >= 4;
    if (hasTest || hasEvent) allEvents.push(item);
  }
}

const learningCore = readJson('learning_core.json');
const termsData = readJson('terms.json');
const combosData = readJson('combos.json');

// Build term lookup
const termLookup = {};
for (const t of learningCore.items) {
  termLookup[t.id] = t;
}
// Enrich with terms.json gloss where learning_core is missing
for (const t of termsData.items) {
  if (termLookup[t.id]) {
    termLookup[t.id]._gloss = t.gloss_1line || t.one_liner || '';
  }
}

const cardsData = readJson('cards.json');

// Build card → term_id lookup, and check which term_ids have images
const cardByIdPrefix = {};
for (const c of cardsData.items) {
  if (c.term_id) cardByIdPrefix[c.id] = c.term_id;
}
// Build set of term_ids that have card images
const cardImageDir = path.resolve(__dirname, '../public/assets/img/cards');
const cardImageSet = new Set();
try {
  for (const f of fs.readdirSync(cardImageDir)) {
    if (f.endsWith('.webp')) cardImageSet.add(f.replace('.webp', ''));
  }
} catch(e) { /* no card images yet */ }

// Resolve related_cards → term_ids with images
function resolveCardImages(relatedCards) {
  if (!relatedCards || !relatedCards.length) return [];
  const result = [];
  for (const rc of relatedCards) {
    const cardId = rc.split(' ')[0]; // "H002 摂関政治" → "H002"
    const termId = cardByIdPrefix[cardId];
    if (termId && cardImageSet.has(termId)) {
      result.push(termId);
    }
  }
  return result.slice(0, 3); // max 3 images
}

console.log(`Events loaded: ${allEvents.length}`);
console.log(`Terms loaded: ${learningCore.items.length}`);
console.log(`Combos loaded: ${combosData.items.length}`);
console.log(`Card images available: ${cardImageSet.size}`);

// ── 1. quiz-inga.json (Scenario Quiz) ───────────────────────
const ingaItems = [];
for (const ev of allEvents) {
  if (!ev.event || !ev.event.choices || ev.event.choices.length < 4) continue;
  const e = ev.event;
  ingaItems.push({
    id: ev.id,
    title: ev.title_ja,
    era: mapEra(ev.era_id),
    scenario: e.scenario,
    choices: e.choices.map(c => ({
      text: c.title_ja,
      feedback: c.result_text_ja,
      tag: extractTag(c.result_text_ja),
    })),
    answer: e.best_choice_index,
    facts: e.anchor_facts_ja || [],
    remember: e.remember_ja || '',
    keywords: (ev.keywords || []).slice(0, 3),
    imgs: resolveCardImages(ev.related_cards),
  });
}

const ingaEras = ERA_LABELS.map(e => ({
  ...e,
  count: ingaItems.filter(q => q.era === e.id).length,
})).filter(e => e.count > 0);

const ingaOut = { eras: ingaEras, items: ingaItems };
fs.writeFileSync(path.join(OUT, 'quiz-inga.json'), JSON.stringify(ingaOut));
console.log(`quiz-inga.json: ${ingaItems.length} questions (${(Buffer.byteLength(JSON.stringify(ingaOut)) / 1024).toFixed(0)} KB)`);

// ── 2. quiz-ichimon.json (Test Quiz + Term Quiz) ────────────
const testItems = [];
for (const ev of allEvents) {
  if (!ev.test || !ev.test.choices || ev.test.choices.length < 4) continue;
  const t = ev.test;
  testItems.push({
    id: ev.id,
    title: ev.title_ja,
    era: mapEra(ev.era_id),
    question: t.question,
    choices: t.choices.map(c => ({
      text: c.title_ja,
      feedback: c.result_text_ja,
      tag: extractTag(c.result_text_ja),
    })),
    answer: t.correct_answer_index,
    explanation: t.explanation,
    hints: t.hints ? { l1: t.hints.level_1 || '', l2: t.hints.level_2 || '' } : null,
    keywords: (ev.keywords || []).slice(0, 3),
    imgs: resolveCardImages(ev.related_cards),
  });
}

// Term quiz data
const termItems = [];
for (const t of learningCore.items) {
  // Skip stubs and items without proper data
  if (t.status && t.status.is_stub) continue;
  if (!t.summary_ja || !t.word_ja) continue;
  const hasImg = cardImageSet.has(t.id);
  termItems.push({
    id: t.id,
    word: t.word_ja,
    reading: t.reading_kana || '',
    era: mapEra(t.era_id),
    summary: t.summary_ja,
    detail: t.detail_ja || '',
    weight: t.exam_weight || 3,
    keyPoints: t.key_points || [],
    confusionPoints: t.confusion_points || [],
    causalChain: t.causal_chain || [],
    related: (t.related && t.related.term_ids) || [],
    img: hasImg ? 1 : 0,
  });
}

const ichimonEras = ERA_LABELS.map(e => ({
  ...e,
  eventCount: testItems.filter(q => q.era === e.id).length,
  termCount: termItems.filter(q => q.era === e.id).length,
}));
// Add 'all' era for terms
const allEraTerms = termItems.filter(q => q.era === 'all').length;

const ichimonOut = { eras: ichimonEras, events: testItems, terms: termItems };
fs.writeFileSync(path.join(OUT, 'quiz-ichimon.json'), JSON.stringify(ichimonOut));
console.log(`quiz-ichimon.json: ${testItems.length} test questions + ${termItems.length} terms (${(Buffer.byteLength(JSON.stringify(ichimonOut)) / 1024).toFixed(0)} KB)`);

// ── 3. quiz-chain.json (Causal Chains) ──────────────────────
const chainItems = [];
for (const c of combosData.items) {
  if (c.disabled) continue;
  if (!c.term_sequence || c.term_sequence.length < 2) continue;

  const steps = c.term_sequence.map(tid => {
    const term = termLookup[tid];
    if (!term) return { id: tid, word: tid, summary: '' };
    return {
      id: tid,
      word: term.word_ja,
      reading: term.reading_kana || '',
      summary: term.summary_ja || term._gloss || '',
      img: cardImageSet.has(tid) ? 1 : 0,
    };
  }).filter(s => s.word !== s.id); // exclude unresolved

  if (steps.length < 2) continue;

  chainItems.push({
    id: c.id,
    name: c.name_ja,
    era: mapEra(c.era_id),
    importance: c.importance || 3,
    ordered: c.ordered !== false,
    type: c.relation_type || c.type || '',
    genre: c._normalized_genre || '',
    steps,
  });
}

const chainEras = ERA_LABELS.map(e => ({
  ...e,
  count: chainItems.filter(q => q.era === e.id).length,
})).filter(e => e.count > 0);

const chainOut = { eras: chainEras, items: chainItems };
fs.writeFileSync(path.join(OUT, 'quiz-chain.json'), JSON.stringify(chainOut));
console.log(`quiz-chain.json: ${chainItems.length} chains (${(Buffer.byteLength(JSON.stringify(chainOut)) / 1024).toFixed(0)} KB)`);

console.log('\nDone! Files written to', OUT);
