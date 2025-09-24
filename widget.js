// === Настройки ===
const SHUFFLE_WINDOW_MS = 10 * 60 * 1000; // каждые 10 минут новый порядок
const MOBILE_MQ = window.matchMedia('(max-width: 480px)');

// Режимы и параметры из URL/DOM
const params = new URLSearchParams(window.location.search);
const rootEl = document.getElementById('widget-root');
const SINGLE_MODE = params.has('single') || rootEl?.dataset.mode === 'single';

// Если хочешь управлять кол-вом карточек из HTML (data-page-size), оставим поддержку,
// но в одиночном режиме всегда 1.
const DATA_PAGE_SIZE = parseInt(rootEl?.dataset.pageSize || '', 10);
const DEFAULT_PAGE_SIZE = Number.isFinite(DATA_PAGE_SIZE) && DATA_PAGE_SIZE > 0 ? DATA_PAGE_SIZE : 5;
const PAGE_SIZE = SINGLE_MODE ? 1 : DEFAULT_PAGE_SIZE;

// === Утилиты ===
function mulberry32(seed){
  return function(){
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function shuffleDeterministic(arr, seed){
  const rng = mulberry32(seed);
  const a = arr.slice();
  for(let i = a.length - 1; i > 0; i--){
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function getTimeWindowSeed(){ return Math.floor(Date.now() / SHUFFLE_WINDOW_MS); }

// === Состояние ===
let rawBooks = [];
let viewBooks = [];
let currentPage = 1;
let totalPages = 1;
let currentWindowSeed = getTimeWindowSeed();

// === Элементы ===
const listEl = document.getElementById('books-list');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const pageIndicator = document.getElementById('pageIndicator');
const pagerEl = document.querySelector('.pager');

// Прячем пагинацию в одиночном режиме
if (SINGLE_MODE && pagerEl) pagerEl.style.display = 'none';

// === Рендер ===
function render(){
  totalPages = Math.max(1, Math.ceil(viewBooks.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageItems = viewBooks.slice(start, end);

  listEl.innerHTML = '';
  for (const b of pageItems) listEl.appendChild(createBookCard(b));

  if (!SINGLE_MODE) {
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;
    pageIndicator.textContent = `${currentPage} / ${totalPages}`;
  }
}

function createBookCard(book){
  const card = document.createElement('article');
  card.className = 'book-card';

  // Теги
  const tagsWrap = document.createElement('div');
  tagsWrap.className = 'book-tags';
  (Array.isArray(book.tags) ? book.tags.slice(0,3) : []).forEach(t => {
    const chip = document.createElement('span');
    chip.className = 'tag';
    chip.textContent = t;
    tagsWrap.appendChild(chip);
  });

  // Базовая сетка
  const inner = document.createElement('div');
  inner.className = 'book-inner';

  // Обложка (десктопная колонка слева)
  const coverBox = document.createElement('div');
  coverBox.className = 'book-cover';
  const img = document.createElement('img');
  img.loading = 'lazy';
  img.alt = `Обложка: ${book.title || 'книга'}`;
  img.src = book.cover;
  if (book.srcset) img.setAttribute('srcset', book.srcset);
  if (book.sizes)  img.setAttribute('sizes',  book.sizes);
  coverBox.appendChild(img);

  // Контент
  const content = document.createElement('div');
  content.className = 'book-content';

  if (book.title){
    const h3 = document.createElement('div');
    h3.className = 'book-title';
    h3.textContent = book.title;
    content.appendChild(h3);
  }
  // Автор (новое поле)
  if (book.author){
    const author = document.createElement('div');
    author.className = 'book-author';
    author.textContent = book.author;
    content.appendChild(author);
  }
  if (book.annotation){
    const p = document.createElement('p');
    p.className = 'book-annotation';
    p.textContent = book.annotation;
    content.appendChild(p);
  }
  if (book.readUrl){
    const a = document.createElement('a');
    a.className = 'read-btn';
    a.href = book.readUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'Читать';
    content.appendChild(a);
  }

  // Мобильная компоновка: обложка внутрь контента + float
  if (MOBILE_MQ.matches) {
    const floatCover = document.createElement('div');
    floatCover.className = 'cover-float';
    const img2 = img.cloneNode(true);
    floatCover.appendChild(img2);
    content.prepend(floatCover);
    card.classList.add('mobile-flow');
  } else {
    // Десктопная: две колонки
    inner.appendChild(coverBox);
  }

  inner.appendChild(content);

  // Спойлер
  const divider = document.createElement('div');
  divider.className = 'book-divider';
  const spoilerBtn = document.createElement('button');
  spoilerBtn.type = 'button';
  spoilerBtn.className = 'spoiler-toggle';
  spoilerBtn.setAttribute('aria-expanded', 'false');
  spoilerBtn.innerHTML = `<span class="chev" aria-hidden="true"></span><span class="label">Тэсса рекомендует, потому что…</span>`;
  const spoiler = document.createElement('div');
  spoiler.className = 'spoiler-content';
  const reason = document.createElement('div');
  reason.className = 'reason';
  reason.textContent = book.reason || '';
  spoiler.appendChild(reason);

  // Сборка карточки
  card.appendChild(tagsWrap);
  card.appendChild(inner);
  card.appendChild(divider);
  card.appendChild(spoilerBtn);
  card.appendChild(spoiler);

  // Спойлер закрыт по умолчанию
  spoiler.classList.remove('open');
  spoilerBtn.setAttribute('aria-expanded','false');
  spoilerBtn.addEventListener('click',()=>{
    const expanded = spoilerBtn.getAttribute('aria-expanded') === 'true';
    spoilerBtn.setAttribute('aria-expanded', String(!expanded));
    spoiler.classList.toggle('open', !expanded);
  });

  return card;
}

// === Данные ===
function applyShuffle(){
  const seed = getTimeWindowSeed() ^ 0x9E3779B9;
  viewBooks = shuffleDeterministic(rawBooks, seed);
}
async function loadData(){
  const res = await fetch('./books.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Не удалось загрузить books.json');
  rawBooks = await res.json();
  applyShuffle();
  render();
}

// === Пагинация ===
function scrollTopSmooth(){
  rootEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
if (!SINGLE_MODE) {
  prevBtn.addEventListener('click', () => {
    if (currentPage > 1) { currentPage -= 1; render(); scrollTopSmooth(); }
  });
  nextBtn.addEventListener('click', () => {
    if (currentPage < totalPages) { currentPage += 1; render(); scrollTopSmooth(); }
  });
}

// Переключение компоновки при изменении ширины/ориентации
MOBILE_MQ.addEventListener?.('change', () => {
  const keepPage = currentPage;
  render();
  currentPage = Math.min(keepPage, Math.max(1, Math.ceil(viewBooks.length / PAGE_SIZE)));
});

// === Автообновление порядка ===
setInterval(() => {
  const nowSeed = getTimeWindowSeed();
  if (nowSeed !== currentWindowSeed) {
    currentWindowSeed = nowSeed;
    const keepPage = currentPage;
    applyShuffle();
    currentPage = Math.min(keepPage, Math.max(1, Math.ceil(viewBooks.length / PAGE_SIZE)));
    render();
  }
}, 10000);

// === Старт ===
loadData().catch(err => {
  console.error(err);
  listEl.innerHTML = `<p style="color:#f77">Ошибка загрузки данных.</p>`;
});
