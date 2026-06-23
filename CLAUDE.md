# names-roulette — инструкции для агента

## Правило: код — единственный источник правды

**Не сохранять ничего в личную память агента** (`~/.claude/projects/.../memory/`). Любое решение должно быть в проекте:
- **Почему что-то устроено так** → `// @invariant` / `// @purpose` в коде
- **Неочевидные места** → ссылка в этом файле (CLAUDE.md) с пояснением
- **Архитектурные решения** → `// @file:` + `#region START/END` с `// purpose:` в коде
- **Требования** → спецификация в файлах проекта

Любой агент, читающий код, должен понять ЧТО и ПОЧЕМУ без внешней памяти.

## Деплой

**GitHub Actions заблокирован** из-за billing issue на аккаунте RubaXa. Не пытаться его включать.

Деплой делается вручную через ветку `gh-pages`:

```bash
npm run build
git checkout --orphan gh-pages-deploy
git reset --hard
cp -r dist/* .
git add -f index.html assets/ chart.html
git commit -m "Deploy"
git push origin gh-pages-deploy:gh-pages --force
git branch -D gh-pages-deploy
git clean -fd
git checkout main
```

> `git clean -fd` нужен перед `checkout main` — иначе `chart.html` (untracked после cp) блокирует переключение ветки.

**Делать это при каждом коммите в main**, который меняет исходники (`src/`, `public/`, `index.html`, `vite.config.js`).

GitHub Pages настроен на ветку `gh-pages`, папка `/ (root)`.
Сайт: https://rubaxa.github.io/secret-stork/

## Стек

- Vue 3 + Vite 8, hash-роутер (`createWebHashHistory`)
- Firebase CDN (не npm), `base: '/secret-stork/'`
- IndexedDB (idb@8) — local-first, Firebase — синхронизация
- E2E: Playwright (порт 4173), unit: Vitest

## Неочевидные места

- [`src/firebase/config.js:1`](src/firebase/config.js) — Firebase грузится с CDN (gstatic), а не npm. Причина: GitHub Pages, нет серверного бандлера. Регион Firestore и авторизованный домен настроены только в Firebase Console (не в коде).

## ResultsView — архитектурные решения

[`src/views/ResultsView.vue`](src/views/ResultsView.vue) — три переключаемых режима визуализации (`vizMode`):

| Режим | Что показывает |
|---|---|
| `likert` | Расходящийся бар: негативные голоса влево, позитивные вправо, сегмент = участник |
| `heat` | Таблица: строки = имена, столбцы = участники, ячейка = эмодзи на цветном фоне |
| `strip` | Точечный график: ось 1–5, цветная точка на позиции каждого участника |

**Четыре слайдера штрафов** (0–100% каждый) — влияют только на порядок сортировки; ячейки всегда показывают сырые оценки:

| Слайдер | Формула | Что затрагивает |
|---|---|---|
| Популярность | `(p/100) * popularity * 2.0` | Анна (0.95), Мария (0.88) |
| Вето-голос | `(p/100) * dissentCount * 0.8` | Имена с оценкой «1» от любого участника |
| Разброс мнений | `(p/100) * sigma * 0.9` | [1,5,1,5] хуже [3,3,4,4] |
| Длина имени | `(p/100) * max(0,\|len−6\|) * 0.28` | Ия (2 буквы), Анастасия (9 букв) |

`score = avg − pPop − pDis − pSig − pLen` (не ниже 0). Цветные чипсы (`pchip-ab`) отображаются только в режимах `likert` и `strip` (не в `heat`) — показывают вклад каждого штрафа над именем строки. Контейнер `.pchips-row` всегда отрисовывается с `min-height: 13px` для равной высоты строк.

**Данные:** `allVotes = { uid: { name: score } }` — загружается из Firestore `spaces/{id}/votes`, **не из IDB**. IDB хранит только голоса текущего пользователя для процесса голосования.

**Vue 3 fragment:** компонент не имеет внешнего `<div>`, чтобы `.results-view.view` был прямым flex-ребёнком `#app` — иначе `overflow-y:auto` не активируется.

## VotingView — архитектурные решения

[`src/views/VotingView.vue`](src/views/VotingView.vue)

**Vue 3 fragment:** нет внешнего `<div>` wrapper — `<NavBar>`, `.done-view`, `.voting-view` и `.loading-screen` являются прямыми flex-детьми `#app`. Без этого `flex:1` на `.view` не работает и карточка голосования сжимается.

**`isLoaded` guard:** при входе в `onMounted` имена загружаются до того, как `shuffledQueue` заполнен. На этом кадре `votingQueue.length === 0` и `total > 0` — без guard `isDone` было бы `true` на одну отрисовку, вызывая флеш «Вы оценили все N имён!». Исправлено: `isDone = computed(() => isLoaded.value && total.value > 0 && votingQueue.value.length === 0)`, где `isLoaded.value = true` устанавливается только после `shuffledQueue.value = shuffle(...)`.

## HomeView — неочевидное

[`src/views/HomeView.vue`](src/views/HomeView.vue) использует собственный inline `<nav>`, а **не** компонент `<NavBar>`. Это намеренно: домашняя страница имеет уникальную навигацию с табами и не нуждается в `backPath` или `SyncDot`.

## Тесты перед деплоем

```bash
npm run build && npx playwright test --config=playwright.config.js
```

21/21 должны быть зелёными.
