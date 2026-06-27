const CATEGORIES = [
  'ビジネス横文字',
  'ITっぽい横文字',
  '意識高め横文字',
  'ふわっとした言葉'
];

const state = {
  dictionary: {},
  activeCategory: 'すべて',
  searchQuery: '',
  lastResult: null
};

document.addEventListener('DOMContentLoaded', async () => {
  try {
    state.dictionary = await loadDictionary();
    bindEvents();
    renderDictionaryCount();
    renderCategoryFilters();
    renderDictionary();
  } catch (error) {
    setText('#toolMessage', `${error.message} ローカル確認では簡易サーバー経由で開いてちょうだい。`);
  }
});

async function loadDictionary(url = './data/dictionary.json') {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`辞書を読み込めませんでした: ${response.status}`);
  }
  return response.json();
}

function bindEvents() {
  const translateButton = document.querySelector('#translateButton');
  const retryButton = document.querySelector('#retryButton');
  const clearButton = document.querySelector('#clearButton');
  const copyButton = document.querySelector('#copyButton');
  const summaryButton = document.querySelector('#summaryButton');
  const openDictionaryButton = document.querySelector('#openDictionaryButton');
  const closeDictionaryButton = document.querySelector('#closeDictionaryButton');
  const dictionaryDialog = document.querySelector('#dictionaryDialog');
  const dictionarySearch = document.querySelector('#dictionarySearch');

  translateButton?.addEventListener('click', translateCurrentText);
  retryButton?.addEventListener('click', translateCurrentText);
  clearButton?.addEventListener('click', clearTool);
  copyButton?.addEventListener('click', copyTranslatedText);
  summaryButton?.addEventListener('click', renderSummary);

  openDictionaryButton?.addEventListener('click', () => {
    if (typeof dictionaryDialog?.showModal === 'function') {
      dictionaryDialog.showModal();
      dictionarySearch?.focus();
      return;
    }
    dictionaryDialog?.setAttribute('open', '');
  });

  closeDictionaryButton?.addEventListener('click', () => {
    dictionaryDialog?.close();
  });

  dictionaryDialog?.addEventListener('click', (event) => {
    if (event.target === dictionaryDialog) {
      dictionaryDialog.close();
    }
  });

  dictionarySearch?.addEventListener('input', (event) => {
    state.searchQuery = event.target.value.trim().toLowerCase();
    renderDictionary();
  });
}

function translateCurrentText() {
  const sourceText = document.querySelector('#sourceText')?.value || '';
  const result = buildTranslation(sourceText, state.dictionary);
  state.lastResult = result;
  renderResult(result);
}

function buildTranslation(inputText, dictionary) {
  const originalText = inputText.trim();
  const matches = findMatches(originalText, dictionary);
  const translatedText = buildAnnotatedText(originalText, matches);

  return {
    originalText,
    translatedText,
    matches,
    isEmpty: originalText.length === 0
  };
}

function findMatches(inputText, dictionary) {
  if (!inputText) return [];

  return Object.entries(dictionary)
    .map(([term, entry]) => ({ term, entry }))
    .sort((a, b) => b.term.length - a.term.length)
    .filter(({ term }) => makeTermRegExp(term).test(inputText));
}

function buildAnnotatedText(inputText, matches) {
  const fragments = buildAnnotatedFragments(inputText, matches);
  return fragments.map((fragment) => {
    if (fragment.type !== 'hit') return fragment.text;
    return `${fragment.text}（${fragment.translation}）`;
  }).join('');
}

function makeTermRegExp(term, global = false) {
  const flags = `${global ? 'g' : ''}${/^[a-z0-9]+$/i.test(term) ? 'i' : ''}`;
  return new RegExp(escapeRegExp(term), flags);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderResult(result) {
  const resultSection = document.querySelector('#resultSection');
  const summaryText = document.querySelector('#summaryText');

  setText('#copyStatus', '');
  setText('#toolMessage', '');
  if (summaryText) summaryText.hidden = true;

  if (result.isEmpty) {
    if (resultSection) resultSection.hidden = true;
    setText('#toolMessage', '文章を貼ってから押してちょうだい。空っぽだとほどけないわ。');
    return;
  }

  if (resultSection) resultSection.hidden = false;
  renderHighlightedText('#originalText', result.originalText, result.matches, 'source');
  renderAnnotatedText('#translatedText', result.originalText, result.matches);

  if (result.matches.length === 0) {
    setText('#toolMessage', '辞書にある横文字は見つからなかったわ。文章はそのまま表示しているわよ。');
  } else {
    setText('#toolMessage', `${result.matches.length}語をわかる日本語にしたわ。`);
  }
}

function renderHighlightedText(selector, text, matches, mode) {
  const container = document.querySelector(selector);
  if (!container) return;

  container.replaceChildren();
  if (!text) return;

  const targets = mode === 'source'
    ? matches.map((match) => ({ term: match.term, label: match.term }))
    : matches.map((match) => ({ term: match.entry['訳'], label: match.entry['訳'] }));

  appendHighlightedFragments(container, text, targets, mode);
}

function renderAnnotatedText(selector, text, matches) {
  const container = document.querySelector(selector);
  if (!container) return;

  container.replaceChildren();
  appendAnnotatedFragments(container, text, matches);
}

function appendAnnotatedFragments(container, text, matches) {
  const fragments = buildAnnotatedFragments(text, matches);

  fragments.forEach((fragment) => {
    if (fragment.type !== 'hit') {
      container.appendChild(document.createTextNode(fragment.text));
      return;
    }

    const mark = document.createElement('mark');
    mark.className = 'highlight-translated';
    mark.textContent = fragment.text;

    const note = document.createElement('span');
    note.className = 'translation-note';
    note.textContent = `（${fragment.translation}）`;

    container.append(mark, note);
  });
}

function buildAnnotatedFragments(text, matches) {
  const sortedMatches = matches
    .filter((match) => match.term)
    .sort((a, b) => b.term.length - a.term.length);

  const fragments = [];
  let cursor = 0;

  while (cursor < text.length) {
    const hit = findNextMatch(text, sortedMatches, cursor);
    if (!hit) {
      fragments.push({ type: 'text', text: text.slice(cursor) });
      break;
    }

    if (hit.index > cursor) {
      fragments.push({ type: 'text', text: text.slice(cursor, hit.index) });
    }

    const matchedText = text.slice(hit.index, hit.index + hit.match.term.length);
    fragments.push({
      type: 'hit',
      text: matchedText,
      translation: hit.match.entry['訳']
    });
    cursor = hit.index + hit.match.term.length;
  }

  return fragments;
}

function appendHighlightedFragments(container, text, targets, mode) {
  const sortedTargets = targets
    .filter((target) => target.term)
    .sort((a, b) => b.term.length - a.term.length);

  let cursor = 0;
  while (cursor < text.length) {
    const hit = findNextTarget(text, sortedTargets, cursor);
    if (!hit) {
      container.appendChild(document.createTextNode(text.slice(cursor)));
      break;
    }

    if (hit.index > cursor) {
      container.appendChild(document.createTextNode(text.slice(cursor, hit.index)));
    }

    const mark = document.createElement('mark');
    mark.className = mode === 'source' ? 'highlight-source' : 'highlight-translated';
    mark.textContent = text.slice(hit.index, hit.index + hit.term.length);
    container.appendChild(mark);
    cursor = hit.index + hit.term.length;
  }
}

function findNextTarget(text, targets, startIndex) {
  let nextHit = null;

  targets.forEach((target) => {
    const lowerText = text.toLowerCase();
    const lowerTerm = target.term.toLowerCase();
    const index = lowerText.indexOf(lowerTerm, startIndex);
    if (index === -1) return;
    if (!nextHit || index < nextHit.index || (index === nextHit.index && target.term.length > nextHit.term.length)) {
      nextHit = { index, term: text.slice(index, index + target.term.length) };
    }
  });

  return nextHit;
}

function findNextMatch(text, matches, startIndex) {
  let nextHit = null;
  const lowerText = text.toLowerCase();

  matches.forEach((match) => {
    const lowerTerm = match.term.toLowerCase();
    const index = lowerText.indexOf(lowerTerm, startIndex);
    if (index === -1) return;
    if (!nextHit || index < nextHit.index || (index === nextHit.index && match.term.length > nextHit.match.term.length)) {
      nextHit = { index, match };
    }
  });

  return nextHit;
}

async function copyTranslatedText() {
  const text = state.lastResult?.translatedText || '';
  if (!text.trim()) {
    setText('#copyStatus', 'コピーする文章がまだないわ。');
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    setText('#copyStatus', 'コピーしたわ。');
  } catch (error) {
    setText('#copyStatus', 'コピーに失敗したわ。ブラウザの権限を確認してちょうだい。');
  }
}

function renderSummary() {
  const summaryText = document.querySelector('#summaryText');
  if (!summaryText) return;

  const matches = state.lastResult?.matches || [];
  if (!state.lastResult || state.lastResult.isEmpty) {
    summaryText.hidden = false;
    summaryText.replaceChildren(document.createTextNode('つまり：先に文章を貼るところからお願いね。'));
    return;
  }

  summaryText.hidden = false;
  summaryText.replaceChildren();

  if (matches.length === 0) {
    summaryText.textContent = 'つまり：新しい言葉を増やさず、そのまま読める文章でした。';
    return;
  }

  summaryText.appendChild(document.createTextNode('つまり：'));
  appendAnnotatedFragments(summaryText, state.lastResult.originalText, matches);
}

function clearTool() {
  const sourceText = document.querySelector('#sourceText');
  const resultSection = document.querySelector('#resultSection');
  const summaryText = document.querySelector('#summaryText');

  if (sourceText) {
    sourceText.value = '';
    sourceText.focus();
  }
  if (resultSection) resultSection.hidden = true;
  if (summaryText) summaryText.hidden = true;
  state.lastResult = null;
  setText('#toolMessage', '');
  setText('#copyStatus', '');
}

function renderDictionaryCount() {
  setText('#dictionaryCount', `登録語数：${Object.keys(state.dictionary).length}語`);
}

function renderCategoryFilters() {
  const container = document.querySelector('#categoryFilters');
  if (!container) return;

  container.replaceChildren();
  ['すべて', ...CATEGORIES].forEach((category) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = category === state.activeCategory ? 'filter-button is-active' : 'filter-button';
    button.textContent = category;
    button.addEventListener('click', () => {
      state.activeCategory = category;
      renderCategoryFilters();
      renderDictionary();
    });
    container.appendChild(button);
  });
}

function renderDictionary() {
  const grid = document.querySelector('#dictionaryGrid');
  if (!grid) return;

  const entries = Object.entries(state.dictionary).filter(([term, entry]) => {
    const matchesCategory = state.activeCategory === 'すべて' || entry['カテゴリ'] === state.activeCategory;
    const haystack = `${term} ${entry['訳']} ${entry['例文']} ${entry['カテゴリ']}`.toLowerCase();
    const matchesSearch = !state.searchQuery || haystack.includes(state.searchQuery);
    return matchesCategory && matchesSearch;
  });

  grid.replaceChildren();
  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'dictionary-empty';
    empty.textContent = '該当する言葉は見つからなかったわ。';
    grid.appendChild(empty);
    return;
  }

  entries.forEach(([term, entry]) => {
    const card = document.createElement('article');
    card.className = 'dictionary-card';

    const category = document.createElement('span');
    category.className = 'dictionary-card__category';
    category.textContent = entry['カテゴリ'];

    const title = document.createElement('h3');
    title.textContent = term;

    const translation = document.createElement('p');
    translation.className = 'dictionary-card__translation';
    translation.textContent = entry['訳'];

    const example = document.createElement('p');
    example.className = 'dictionary-card__example';
    example.textContent = entry['例文'];

    card.append(category, title, translation, example);
    grid.appendChild(card);
  });
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}
