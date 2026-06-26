const state = {
  dictionary: {},
  customDictionary: {},
  activeCategory: 'すべて',
  lastResult: null
};

document.addEventListener('DOMContentLoaded', async () => {
  try {
    state.dictionary = await loadDictionary();
    bindTranslatorEvents();
    renderCategoryFilters();
    renderDictionary();
  } catch (error) {
    showError(error.message);
  }
});

async function loadDictionary(url = './data/dictionary.json') {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`辞書を読み込めませんでした: ${response.status}`);
  }
  return response.json();
}

function getAllEntries() {
  return { ...state.dictionary, ...state.customDictionary };
}

function bindTranslatorEvents() {
  const translateButton = document.querySelector('#translateButton');
  const sampleButton = document.querySelector('#sampleButton');
  const sourceText = document.querySelector('#sourceText');
  const customForm = document.querySelector('#customForm');

  translateButton?.addEventListener('click', () => {
    const result = buildBuchoTranslation(sourceText.value, state.dictionary, state.customDictionary);
    state.lastResult = result;
    renderResult(result);
  });

  sampleButton?.addEventListener('click', () => {
    sourceText.value = 'AIエージェントのPoCで、バックログ整理とワークフロー自動化を進めたい。DXの一環として、KPIを置きながら現場の確認漏れを減らす。';
    sourceText.focus();
  });

  document.querySelectorAll('.copy-button').forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.dataset.copyTarget;
      const target = document.querySelector(`#${targetId}`);
      copyToClipboard(target?.textContent || '');
    });
  });

  customForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const entry = readCustomEntry();
    const added = addCustomEntry(entry);
    const message = document.querySelector('#customMessage');
    if (!added) {
      if (message) message.textContent = '元の語と部長訳は必須よ。そこだけは稟議より厳しめ。';
      return;
    }
    customForm.reset();
    if (message) message.textContent = `${entry.term} をこの場の辞書に追加したわ。`;
    renderCategoryFilters();
    renderDictionary();
    if (sourceText.value.trim()) {
      const result = buildBuchoTranslation(sourceText.value, state.dictionary, state.customDictionary);
      state.lastResult = result;
      renderResult(result);
    }
  });
}

function normalizeTerm(term) {
  return String(term).trim().toLowerCase();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findMatches(inputText, dictionary, customDictionary = {}) {
  if (!inputText.trim()) return [];
  const mergedEntries = [
    ...Object.entries(customDictionary).map(([term, entry]) => ({ term, entry, source: 'custom' })),
    ...Object.entries(dictionary).map(([term, entry]) => ({ term, entry, source: 'official' }))
  ];
  const sortedEntries = mergedEntries.sort((a, b) => b.term.length - a.term.length);
  const matches = [];
  const seen = new Set();

  sortedEntries.forEach(({ term, entry, source }) => {
    const flags = /^[a-z0-9]+$/i.test(term) ? 'i' : '';
    const pattern = new RegExp(escapeRegExp(term), flags);
    if (pattern.test(inputText)) {
      const key = normalizeTerm(term);
      if (!seen.has(key)) {
        seen.add(key);
        matches.push({ term, entry, source });
      }
    }
  });

  return matches;
}

function translateText(inputText, matches) {
  return matches
    .slice()
    .sort((a, b) => b.term.length - a.term.length)
    .reduce((text, match) => {
      const flags = /^[a-z0-9]+$/i.test(match.term) ? 'gi' : 'g';
      return text.replace(new RegExp(escapeRegExp(match.term), flags), match.entry.translation);
    }, inputText);
}

function buildExecutiveSummary(matches) {
  if (matches.length === 0) {
    return 'つまり、まだ辞書にない言葉も含めて、部長が判断できる業務上の変化へ言い換える話です。';
  }
  const phrases = matches.slice(0, 2).map((match) => match.entry.summaryPhrase);
  if (phrases.length === 1) {
    return `つまり、${phrases[0]}です。`;
  }
  return `つまり、${phrases[0]}を進めながら、${phrases[1]}です。`;
}

function buildApprovalEffect(matches) {
  const priorityWords = ['属人化', '確認漏れ', '一次切り分け', 'お試し導入'];
  const effects = matches
    .map((match) => match.entry.effect)
    .filter(Boolean)
    .sort((a, b) => priorityScore(b, priorityWords) - priorityScore(a, priorityWords));
  const selected = [...new Set(effects)].slice(0, 3);
  if (selected.length === 0) {
    return '対象業務を小さく区切って確認し、属人化・確認漏れ・手戻りの有無を見ながら導入判断できます。';
  }
  return selected.join('');
}

function priorityScore(text, words) {
  return words.reduce((score, word, index) => {
    return text.includes(word) ? score + words.length - index : score;
  }, 0);
}

function buildObjectionAnswers(matches) {
  const commonObjections = [
    {
      question: '費用対効果は',
      answer: 'まず対象業務を絞り、削減時間、確認漏れ件数、手戻り回数を見て継続判断します。'
    },
    {
      question: '現場が使えるのか',
      answer: 'いきなり全社展開せず、普段の手順に近い範囲から試して、使いにくい点を先に直します。'
    },
    {
      question: '責任所在はどうするのか',
      answer: '仕組みは確認支援に限定し、承認や最終判断は従来どおり担当者と責任者が持ちます。'
    },
    {
      question: '止められるのか',
      answer: '試行範囲を限定し、元に戻す手順を用意してから始めます。'
    }
  ];
  const termObjections = matches.flatMap((match) => match.entry.objections || []);
  return uniqueObjections([...termObjections, ...commonObjections]).slice(0, 3);
}

function uniqueObjections(objections) {
  const seen = new Set();
  return objections.filter((item) => {
    const key = `${item.question}:${item.answer}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildBuchoTranslation(inputText, dictionary, customDictionary = {}) {
  const trimmedText = inputText.trim();
  const matches = findMatches(trimmedText, dictionary, customDictionary);
  const translatedText = trimmedText ? translateText(trimmedText, matches) : '';

  return {
    translatedText,
    matchedTerms: matches,
    executiveSummary: buildExecutiveSummary(matches),
    approvalEffect: buildApprovalEffect(matches),
    objections: buildObjectionAnswers(matches),
    isEmpty: !trimmedText
  };
}

function renderResult(result) {
  const resultArea = document.querySelector('#resultArea');
  const resultEmpty = document.querySelector('#resultEmpty');
  if (!resultArea || !resultEmpty) return;

  if (result.isEmpty) {
    resultArea.hidden = true;
    resultEmpty.hidden = false;
    resultEmpty.textContent = '文章を入れてから部長訳してちょうだい。空の稟議はさすがに通らないわ。';
    return;
  }

  resultArea.hidden = false;
  resultEmpty.hidden = true;

  setText('#executiveSummary', result.executiveSummary);
  setText('#approvalEffect', result.approvalEffect);
  setText('#translatedText', result.translatedText || '辞書語は未検出ですが、元の文章はそのまま残しています。');
  renderObjections(result.objections);
  renderMatchedTerms(result.matchedTerms);
}

function renderObjections(objections) {
  const container = document.querySelector('#objectionList');
  if (!container) return;
  container.replaceChildren();
  objections.forEach((item) => {
    const block = document.createElement('div');
    block.className = 'objection';
    const question = document.createElement('p');
    question.textContent = `Q. ${item.question}`;
    const answer = document.createElement('p');
    answer.textContent = `A. ${item.answer}`;
    block.append(question, answer);
    container.appendChild(block);
  });
}

function renderMatchedTerms(matches) {
  const container = document.querySelector('#matchedTerms');
  if (!container) return;
  container.replaceChildren();
  if (matches.length === 0) {
    const message = document.createElement('p');
    message.textContent = '辞書登録語はまだ見つかっていません。必要なら下のフォームで追加できます。';
    container.appendChild(message);
    return;
  }
  matches.forEach((match) => {
    const chip = document.createElement('span');
    chip.className = 'term-chip';
    chip.textContent = `${match.term} → ${match.entry.translation}`;
    container.appendChild(chip);
  });
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

async function copyToClipboard(text) {
  if (!text.trim()) return;
  await navigator.clipboard.writeText(text);
}

function showError(message) {
  const resultEmpty = document.querySelector('#resultEmpty');
  if (resultEmpty) resultEmpty.textContent = message;
}

function renderCategoryFilters() {
  const container = document.querySelector('#categoryFilters');
  if (!container) return;
  const categories = ['すべて', ...new Set(Object.values(getAllEntries()).map((entry) => entry.category))];
  container.replaceChildren();
  categories.forEach((category) => {
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
  const entries = Object.entries(getAllEntries()).filter(([, entry]) => {
    return state.activeCategory === 'すべて' || entry.category === state.activeCategory;
  });
  grid.replaceChildren();
  entries.forEach(([term, entry]) => {
    const card = document.createElement('article');
    card.className = 'dictionary-card';

    const category = document.createElement('span');
    category.className = 'dictionary-card__category';
    category.textContent = entry.category;

    const terms = document.createElement('div');
    terms.className = 'dictionary-card__terms';

    const from = document.createElement('span');
    from.className = 'dictionary-card__from';
    from.textContent = term;

    const arrow = document.createElement('span');
    arrow.className = 'dictionary-card__arrow';
    arrow.textContent = '→';

    const to = document.createElement('span');
    to.textContent = entry.translation;

    const example = document.createElement('p');
    example.textContent = entry.example;

    const summary = document.createElement('p');
    summary.className = 'dictionary-card__summary';
    summary.textContent = entry.summaryPhrase;

    terms.append(from, arrow, to);
    card.append(category, terms, summary, example);
    grid.appendChild(card);
  });
}

function readCustomEntry() {
  const term = document.querySelector('#customTerm')?.value.trim() || '';
  const translation = document.querySelector('#customTranslation')?.value.trim() || '';
  const example = document.querySelector('#customExample')?.value.trim() || '';
  const category = document.querySelector('#customCategory')?.value || '組織';
  return { term, translation, example, category };
}

function addCustomEntry(entry) {
  if (!entry.term || !entry.translation) return false;
  state.customDictionary[entry.term] = {
    translation: entry.translation,
    訳: entry.translation,
    summaryPhrase: `${entry.translation}として社内で説明しやすくする話`,
    effect: `${entry.translation}として整理し、関係者の認識ずれと確認漏れを減らせます。`,
    category: entry.category,
    カテゴリ: entry.category,
    example: entry.example || `${entry.term} → ${entry.translation}`,
    例文: entry.example || `${entry.term} → ${entry.translation}`,
    objections: [
      {
        question: '現場が使えるのか',
        answer: '現場の言い方に合わせて追加した辞書語なので、まず関係部署の説明文から試します。'
      }
    ]
  };
  return true;
}
