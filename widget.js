// ========= НАСТРОЙКИ =========
const PAGE_SIZE = 5;         // по 5 плиток на страницу
const SHUFFLE_WINDOW_MS = 10 * 60 * 1000; // каждые 10 минут новый порядок

// ========= УТИЛИТЫ =========
// Детерминированный генератор (mulberry32)
function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
// Перемешивание Фишера-Йетса на основе PRNG
function shuffleDeterministic(arr, seed) {
  const rng = mulberry32(seed);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// Окно (слот) времени по 10 минут
function getTimeWindowSeed() {
  return Math.floor(Date.now() / SHUFFLE_WINDOW_MS);
}

// ========= СОСТОЯНИЕ =========
let rawBooks = [];
let viewBooks = [];
let currentPage = 1;
let totalPages = 1;
let currentWindowSeed = getTimeWindowSeed();

// ========= ЭЛЕМЕНТЫ =========
const listEl = document.getElementById('books-list');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const pageIndicator = document.getElementById('pageIndicator');

// ========= РЕНДЕР =========
function render() {
  // Пагинация
  totalPages = Math.max(1, Math.ceil(viewBooks.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageItems = viewBooks.slice(start, end);

  // Очистка
  listEl.innerHTML = '';

  // Вставка карточек
  for (const b of pageItems) {
    listEl.appendChild(createBookCard(b));
  }

  // Обновить кнопки пагинации
  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = currentPage >= totalPages;
  pageIndicator.textContent = `${currentPage} / ${totalPages}`;
}

function createBookCard(book) {
  const card = document.createElement('article');
  card.className = 'book-card';

  // Внутренний контейнер
  const inner = document.createElement('div');
  inner.className = 'book-inner';

  // Левая колонка — обложка
  const coverBox = document.createElement('div');
  coverBox.className = 'book-cover';
  const img = document.createElement('img');
  img.loading = 'lazy';
  img.alt = `Обложка: ${book.title || 'книга'}`;
  img.src = book.cover;
  coverBox.appendChild(img);

  // Правая колонка — контент
  const content = document.createElement('div');
  content.className = 'book-content';

  // Теги (вверху, по центру)
  const tags = Array.isArray(book.tags) ? book.tags.slice(0,3) : [];
  const tagsWrap = document.createElement('div');
  tagsWrap.className = 'book-tags';
  tags.forEach(t => {
    const chip = document.createElement('span');
    chip.className = 'tag';
    chip.textContent = t;
    tagsWrap.appendChild(chip);
  });

  // Название (опционально, но логично)
  if (book.title) {
    const h3 = document.createElement('div');
    h3.className = 'book-title';
    h3.textContent = book.title;
    content.appendChild(h3);
  }

  // Аннотация
  if (book.annotation) {
    const p = document.createElement('p');
    p.className = 'book-annotation';
    p.textContent = book.annotation;
    content.appendChild(p);
  }

  // Кнопка "Читать"
  if (book.readUrl) {
    const a = document.createElement('a');
    a.className = 'read-btn';
    a.href = book.readUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'Читать';
    content.appendChild(a);
  }

  // Разделитель
  const divider = document.createElement('div');
  divider.className = 'book-divider';

  // Спойлер
  const spoilerBtn = document.createElement('button');
  spoilerBtn.type = 'button';
  spoilerBtn.className = 'spoiler-toggle';
  spoilerBtn.setAttribute('aria-expanded', 'false');
  spoilerBtn.textContent = 'Тэсса рекомендует, потому что…';

  const spoiler = document.createElement('div');
  spoiler.className = 'spoiler-content';
  const reason = document.createElement('div');
  reason.className = 'reason';
  reason.textContent = book.reason || '';
  spoiler.appendChild(reason);

  // Сборка
  inner.appendChild(coverBox);
  inner.appendChild(content);

  // Вставляем элементы в карточку
  card.appendChild(tagsWrap);
  card.appendChild(inner);
  card.appendChild(divider);
  card.appendChild(spoilerBtn);
  card.appendChild(spoiler);

  // Логика спойлера
  spoilerBtn.addEventListener('click', () => {
    const isOpen = spoiler.classList.contains('open');
    spoiler.classList.toggle('open', !isOpen);
    spoilerBtn.setAttribute('aria-expanded', String(!isOpen));
  });

  return card;
}

// ========= ЛОГИКА ДАННЫХ =========
function applyShuffle() {
  // seed из окна времени → детерминированный порядок на 10 минут
  const seed = currentWindowSeed; 
  // Чтобы seed был более «разнообразным», можно немного «посолить»
  const salted = seed ^ 0x9E3779B9;
  viewBooks = shuffleDeterministic(rawBooks, salted);
}

async function loadData() {
  const res = await fetch('./books.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Не удалось загрузить books.json');
  rawBooks = await res.json();
  applyShuffle();
  render();
}

// ========= ПАГИНАЦИЯ: обработчики =========
prevBtn.addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage -= 1;
    render();
  }
});
nextBtn.addEventListener('click', () => {
  if (currentPage < totalPages) {
    currentPage += 1;
    render();
  }
});

// ========= АВТО-ОБНОВЛЕНИЕ ПОРЯДКА КАЖДЫЕ 10 МИН =========
setInterval(() => {
  const nowSeed = getTimeWindowSeed();
  if (nowSeed !== currentWindowSeed) {
    currentWindowSeed = nowSeed;
    const currentIndex = (currentPage - 1) * PAGE_SIZE;
    applyShuffle();
    // Сопоставим текущую страницу с новым порядком (оставим номер)
    const maxPage = Math.max(1, Math.ceil(viewBooks.length / PAGE_SIZE));
    currentPage = Math.min(currentPage, maxPage);
    render();
  }
}, 10000); // проверяем раз в 10 секунд; смена — раз в 10 минут

// ========= СТАРТ =========
loadData().catch(err => {
  console.error(err);
  listEl.innerHTML = `<p style="color:#f77">Ошибка загрузки данных.</p>`;
});

