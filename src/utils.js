export const CARD_BG = [
  ['#FF6B9D','#FF9A5C'],['#7B68EE','#48C0A3'],['#FFD93D','#FF9B44'],['#4FACFE','#00F2FE'],
  ['#43E97B','#38F9D7'],['#FA709A','#FEE140'],['#A18CD1','#FBC2EB'],['#F093FB','#F5576C'],
]

export const RATINGS = [
  { score: 1, emoji: '❌', label: 'Точно нет' },
  { score: 2, emoji: '👎', label: 'Скорее нет' },
  { score: 3, emoji: '😐', label: 'Нейтрально' },
  { score: 4, emoji: '👍', label: 'Нравится' },
  { score: 5, emoji: '❤️', label: 'Обожаю' },
]

export const RATING_COLORS = ['#c0392b', '#e67e22', '#9e9e9e', '#4a90e2', '#e91e63']

export function clampScore(s) {
  return Math.min(Math.max(Math.round(s), 1), RATINGS.length)
}

export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function spaceUrl(spaceId) {
  return location.href.split('#')[0] + '#/space/' + spaceId
}

export function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}
