# Назовём — Спецификация

Выбор имени для ребёнка всей семьёй. Каждый участник голосует тайно, результаты открываются когда все закончили.

---

## Продукт

**Название:** Назовём  
**URL:** GitHub Pages (ветка `gh-pages`)  
**Firebase project:** `names-roulette`

### Сценарий использования

1. Один из родителей создаёт голосование и получает ссылку
2. Делится ссылкой с семьёй (партнёр, бабушки, etc.)
3. Каждый заходит по ссылке, голосует по именам (❤️ / 👍 / 😐 / 👎 / ❌)
4. Прогресс виден у администратора, сами голоса скрыты
5. Когда все проголосовали — администратор закрывает голосование
6. Все видят итоговый рейтинг имён

---

## Текущая архитектура (монолит, до рефакторинга)

Всё приложение — один файл `index.html` (~1900 строк). CSS, JS и HTML вперемешку, без сборки.

**Проблемы:**
- `mount(innerHTML)` полностью сносит DOM при каждом переходе → мигание UI
- Глобальный `state` объект без реактивности
- Нет HMR — разработка через перезагрузку страницы
- Сложно поддерживать: добавление фич создаёт регрессии

### Реализованные фичи (актуально на 2026-06)

- **Датасет:** 243 женских имени, каждое с полями `meaning`, `origin`, `nicknames`, `funFact`, `popularity` (`data/names_enriched.json`)
- **Картинки:** AI-генерированные обложки для всех 243 имён (`data/images/*.jpg`, 512×512, ~60KB каждое), стиль привязан к происхождению
- **Фильтр по происхождению:** при создании голосования можно выбрать категории (Греческие, Латинские, Славянские, Арабские и Восточные, Семитские, Европейские); выбранные группы сохраняются как `nameGroups` в space
- **Свайп-UX:** Tinder-стиль — два DOM-элемента (`card-current`, `card-next`), fly-анимации (right/down/left/up), тач-свайп с порогом 50px, drag-поворот карточки
- **История / возврат:** кнопка "назад" возвращает предыдущую карточку с выделением прежней оценки (`state.pendingReview`); кнопка "Вперёд →" засчитывает ту же оценку без изменений
- **IDB v3:** очищает кэш имён при обновлении схемы (`oldVersion < 3`)

---

## Целевая архитектура (Vue 3 + Vite)

### Обоснование выбора

Оценивались: Vue 3, Preact, Solid.js, Lit, vanilla ES modules.

Вывод (подтверждён deep-research + adversarial review):
- Firebase SDK (~150KB gzip) доминирует в бандле независимо от фреймворка — разница между Vue (~22KB) и Preact (~3KB) составляет ~13% от Firebase, не является решающей
- Все альтернативы (Preact, Solid, Lit + Vite) также требуют build step — переход на Vue не увеличивает инфраструктурную сложность
- **View Transitions API** поддерживается нативно в Chrome, Firefox 127+, Safari 18 (mid-2026 — повсеместная поддержка). Vue Router 4.2+ интегрируется с ним через `viewTransition: true`
- Специфические цифры "Vue в 4x больше Solid" не прошли adversarial verification — считаются неподтверждёнными

### Стек

| Слой | Технология | Причина |
|---|---|---|
| UI фреймворк | Vue 3 (Composition API) | Компонентная модель, реактивность, экосистема |
| Сборка | Vite | HMR <50ms — основная причина введения build step |
| Роутинг | Vue Router 4 (hash mode) | `viewTransition: true` → нативный браузерный API переходов |
| State | Composables + `ref()` / `reactive()` | Только UI-кэш; Pinia подключать при явной боли от prop drilling |
| Хранилище | IndexedDB (idb@7, CDN) | Не меняется. Source of truth для всех данных |
| Firebase | SDK v10.12.0 (ES modules, CDN) | Не меняется |
| Тесты | Playwright (E2E), Vitest (unit) | E2E тесты уже есть |

### Принцип работы с данными

```
IndexedDB (source of truth)
    ↑ write-first          ↓ read-on-mount
Vue reactive refs  ←──────  loaded into memory
    ↓ render               ↑ update ref
Firestore sync (outbox)  ──→  drainOutbox()
```

Vue-компоненты **не хранят** первичные данные — только реактивный кэш того, что прочитано из IDB. Все мутации пишутся в IDB первыми.

### Фикс мигания: View Transitions API

```js
// router/index.js
const router = createRouter({
  history: createWebHashHistory(),
  routes,
})
router.options.scrollBehavior = () => ({ top: 0 })
```

```vue
<!-- App.vue -->
<RouterView v-slot="{ Component }">
  <Transition name="view" mode="out-in">
    <component :is="Component" :key="$route.path" />
  </Transition>
</RouterView>
```

Дополнительно включить View Transitions API в Vue Router:
```js
// router/index.js — для поддерживаемых браузеров
router.beforeEach((to, from) => {
  if (!document.startViewTransition) return
  return new Promise(resolve => {
    document.startViewTransition(resolve)
  })
})
```

```css
/* Fallback для браузеров без View Transitions API */
.view-enter-active, .view-leave-active { transition: opacity .15s ease }
.view-enter-from, .view-leave-to       { opacity: 0 }
```

### Структура файлов

```
src/
  views/
    LoginView.vue         # renderLogin()
    HomeView.vue          # renderHome() + табы "Мои голосования" / "Участвую"
    NewSpaceView.vue      # renderNewSpace()
    VotingView.vue        # renderVoting() + две карточки + свайп
    AdminView.vue         # renderAdmin() + участники + закрытие
    HistoryView.vue       # renderHistory()
    ResultsView.vue       # renderResults()
  components/
    NavBar.vue            # navHtml() + 🐞 кнопка + SyncDot
    NameCard.vue          # buildCardWrap() + анимация свайпа
    SpaceCard.vue         # participatingSpaceCardHtml()
    AdminSpaceCard.vue    # adminSpaceCardHtml() — клик → /admin
    RatingGrid.vue        # кнопки ❤️👍😐👎❌
    SyncDot.vue           # setSyncStatus()
  composables/
    useCardSwipe.js       # flyAndAdvance() → Vue composable (критично: сохранить тайминги)
    useSync.js            # syncSpacesFromFirestore + 30s interval
  services/
    db.js                 # dbGetSpace, dbSaveSpace, dbGetVotes, dbSaveVote, ...
    sync.js               # drainOutbox(), syncSpacesFromFirestore()
    auth.js               # signIn, signOut, onAuthStateChanged
    logger.js             # LOG_BUFFER, L(), safeUid()
    names.js              # loadNames(), ALL_NAMES
  firebase/
    config.js             # FB_CONFIG, fbApp, fbAuth, fbDb
  router/
    index.js              # routes, auth guard, View Transitions hook
  App.vue                 # <RouterView> + <Transition name="view">
  main.js                 # createApp(), init()
  style.css               # весь CSS из index.html
index.html                # минимальная оболочка (<div id="app">)
vite.config.js
.github/workflows/
  deploy.yml              # npm run build → gh-pages ветка
```

---

## Роуты

| Hash | Компонент | Описание |
|---|---|---|
| `#/` | HomeView | Список голосований (табы: Мои / Участвую) |
| `#/new` | NewSpaceView | Создание нового голосования |
| `#/space/:id` | VotingView | Голосование по именам |
| `#/space/:id/admin` | AdminView | Панель администратора |
| `#/space/:id/history` | HistoryView | История голосов текущего пользователя |
| `#/space/:id/results` | ResultsView | Итоговый рейтинг (после закрытия) |
| `#/login` | LoginView | Вход через Google |

Auth guard: все роуты кроме `/login` требуют авторизации.
Lazy loading: все views грузятся через `() => import(...)` — стартовый бандл минимален.

---

## Данные

### IndexedDB (local-first, source of truth)

| Store | Ключ | Содержимое |
|---|---|---|
| `spaces` | `id` | Голосование: id, title, creatorUid, status, gender, nameGroups, joinedUids, _progress, _memberCount, _avgProgress |
| `votes` | `${spaceId}::${name}` | Голос: spaceId, name, score (1–5), updatedAt |
| `outbox` | autoIncrement | Задание для синхронизации: type, payload |
| `names` | `name` | Имя из датасета (243 записей, кэш — очищается при IDB upgrade) |

**`nameGroups`** — массив ключей категорий (`['slavic','greek',...]`) или `['all']` для всех имён. Определяет какие имена участвуют в голосовании. Константа `ORIGIN_GROUPS` в `index.html` маппит ключ → список значений поля `origin` из датасета.

**Outbox types:**
- `VOTE` — голос за имя
- `SPACE_CREATE` — создание голосования
- `SPACE_JOIN` — присоединение по ссылке
- `SPACE_CLOSE` — закрытие голосования
- `USER_SPACE_LINK` — запись в `users/{uid}/spaces/{spaceId}` для cross-device sync

### Firestore

```
spaces/{spaceId}
  → creatorUid, name, status, createdAt, joinedUids
  members/{uid}
    → displayName, photoURL, joinedAt
  votes/{uid}
    → votes: { [name]: score }

users/{uid}/spaces/{spaceId}
  → at: Timestamp  (для cross-device sync)
```

### Правила безопасности Firestore

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /spaces/{spaceId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.creatorUid;
      allow update: if request.auth != null && request.auth.uid == resource.data.creatorUid;
      allow delete: if false;
      match /members/{memberId} {
        allow read: if request.auth != null && (
          request.auth.uid == memberId ||
          request.auth.uid == get(/databases/$(database)/documents/spaces/$(spaceId)).data.creatorUid
        );
        allow write: if request.auth != null && request.auth.uid == memberId;
      }
      match /votes/{voterId} {
        allow read: if request.auth != null && (
          request.auth.uid == voterId ||
          request.auth.uid == get(/databases/$(database)/documents/spaces/$(spaceId)).data.creatorUid ||
          get(/databases/$(database)/documents/spaces/$(spaceId)).data.status == 'closed'
        );
        allow write: if request.auth != null && request.auth.uid == voterId;
      }
    }
    match /users/{uid}/spaces/{spaceId} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

---

## Cross-device sync

`syncSpacesFromFirestore(uid)` вызывается при заходе на главную, затем каждые 30 секунд.

**Шаг 1** — голосования созданные этим пользователем:
```js
query(collection(fbDb, 'spaces'), where('creatorUid', '==', uid))
```

**Шаг 2** — голосования к которым присоединились с другого устройства:
```js
getDocs(collection(fbDb, 'users', uid, 'spaces'))
```

**Шаг 3** — прогресс голосования (количество проголосованных имён) для всех голосований:
```js
getDoc(doc(fbDb, 'spaces', spaceId, 'votes', uid))
```

При входе в VotingView — дополнительная синхронизация голосов из Firestore в IDB.

**Управление подписками:** любой `onSnapshot` в Vue-компонентах отписывается в `onUnmounted` во избежание утечек памяти при навигации.

---

## Логирование (LDD)

```js
// logger.js
const LOG_BUFFER = []
const safeUid = uid => uid ? uid.slice(0, 8) + '…' : 'none'

function L(anchor, ...args) {
  // форматирует строку [HH:MM:SS.mmm][anchor] args...
  // пишет в LOG_BUFFER (кольцо 500 записей)
  // console.debug с синим цветом
}
```

**PII-safe:** UID усекаются до 8 символов, имена и email не логируются.

🐞 кнопка в NavBar копирует `LOG_BUFFER.join('\n')` в буфер обмена.

---

## Голосование — UI механика

**Два DOM-элемента** в VotingView: `card-current` и `card-next`. При переходе:
1. `card-current` улетает (fly анимация — направление зависит от оценки)
2. `card-next` поднимается на место (rise transition)
3. Следующее имя рендерится в фоне

В новой архитектуре: composable `useCardSwipe()` сохраняет те же тайминги анимации. CSS transitions на `:style` биндинге вместо imperativного `requestAnimationFrame`.

**Оценки:**
```
❤️ = 5  Обожаю      → card летит вправо
👍 = 4  Нравится    → card летит вправо
😐 = 3  Нейтрально  → card летит вниз
👎 = 2  Скорее нет  → card летит вниз
❌ = 1  Точно нет   → card летит вниз
```

**Кнопки рейтинга:** класс `.active` добавляется только когда карточка в режиме `pendingReview` (возврат назад). После свайпа вперёд — `.active` снимается принудительно.

---

## E2E тесты

Playwright тесты в `tests/roulette.spec.js`. Используют фейкового пользователя через query param:
```
?e2e_user=BASE64_JSON
```

**Фаза 0 (перед миграцией):** добавить `data-testid` атрибуты на все интерактивные элементы в текущем `index.html` и обновить Playwright-селекторы. После этого структурные изменения DOM при миграции не сломают тесты.

**Текущие CSS-селекторы (→ заменить на data-testid):**
`.home-create`, `.space-card`, `.name-card`, `.r-btn`, `#btn-next`, `.nav-back`, `.progress-text`, `.hist-item`, `.admin-view`, `.share-url`

---

## Деплой

### Сейчас
- Ручной: пуш `index.html` напрямую в `main`
- GitHub Pages обслуживает `main` ветку (публичный репозиторий)

### После рефакторинга
```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci && npm run build
      - uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

`vite.config.js` — `base: '/names-roulette/'` (или кастомный домен).

---

## План миграции (риск-минимизированный)

Каждая фаза независимо тестируема. Приложение в `main` работает на протяжении всей миграции.

| Фаза | Содержание | Риск | Оценка |
|---|---|---|---|
| **0** | `data-testid` в `index.html` + обновить Playwright-селекторы | Низкий | 0.5 дня |
| **1** | Vite scaffold + `style.css` + GitHub Actions | Нулевой | 0.5 дня |
| **2** | Сервисы: `db.js`, `sync.js`, `auth.js`, `logger.js`, `names.js`, `firebase/config.js` — чистые модули без UI | Низкий | 1 день |
| **3** | Vue Router + App.vue + View Transitions + auth guard | Средний | 0.5 дня |
| **4** | HomeView + NavBar + SpaceCard + AdminSpaceCard | Низкий | 1 день |
| **5** | VotingView + NameCard + `useCardSwipe` (самая хрупкая часть) | Высокий | 1.5 дня |
| **6** | LoginView + NewSpaceView + AdminView + HistoryView + ResultsView | Низкий | 1 день |
| **7** | QA: E2E full suite + мобильная проверка + onSnapshot утечки | Средний | 1 день |
| **Итого** | | | **~7 дней** |

**Фаза 5 — особая осторожность:** `useCardSwipe` содержит тайминги анимации и touch-обработку. Сначала реализовать с точно теми же значениями `duration`, `easing`, `threshold` что в текущем `flyAndAdvance()`, только потом улучшать.

**Что не меняется:** Firebase конфиг, структура Firestore, схема IndexedDB, правила безопасности, датасет имён, E2E параметры fake-пользователя.
