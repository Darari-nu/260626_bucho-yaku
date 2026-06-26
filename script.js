const state = {
  dictionary: {},
  customDictionary: {},
  activeCategory: 'すべて'
};

document.addEventListener('DOMContentLoaded', async () => {
  state.dictionary = await loadDictionary();
  renderCategoryFilters();
  renderDictionary();
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

function renderCategoryFilters() {
  const container = document.querySelector('#categoryFilters');
  if (!container) return;
  const categories = ['すべて', ...new Set(Object.values(getAllEntries()).map((entry) => entry.category))];
  container.replaceChildren();
  categories.forEach((category) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'filter-button';
    button.textContent = category;
    button.addEventListener('click', () => {
      state.activeCategory = category;
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

    terms.append(from, arrow, to);
    card.append(category, terms, example);
    grid.appendChild(card);
  });
}
