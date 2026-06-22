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
git checkout main
git branch -D gh-pages-deploy
```

**Делать это при каждом коммите в main**, который меняет исходники (`src/`, `public/`, `index.html`, `vite.config.js`).

GitHub Pages настроен на ветку `gh-pages`, папка `/ (root)`.
Сайт: https://rubaxa.github.io/secret-stork/

## Стек

- Vue 3 + Vite 8, hash-роутер (`createWebHashHistory`)
- Firebase CDN (не npm), `base: '/names-roulette/'`
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

**Слайдер штрафа** (`penalty`, 0–2): уменьшает эффективный score только для оценок ≤ 2 по формуле `max(0, score - penalty)`. Влияет только на сортировку — сырые оценки в ячейках не трогает.

**Данные:** `allVotes = { uid: { name: score } }` — загружается из Firestore `spaces/{id}/votes`, **не из IDB**. IDB хранит только голоса текущего пользователя для процесса голосования.

**Скролл:** компонент использует Vue 3 fragment (нет внешнего `<div>`), чтобы `.results-view.view` был прямым flex-ребёнком `#app` — иначе `overflow-y:auto` не активируется.

## Тесты перед деплоем

```bash
npm run build && npx playwright test --config=playwright.config.js
```

21/21 должны быть зелёными.
