// =============================================================================
// progression — ачивки и разблокировки сайдгрейдов (GDD §8).
//
// • Сайдгрейды, НЕ апгрейды ("не лучше, просто иначе"): база выдаётся сразу,
//   остальное открывается за достижения = больше ОТВЕТОВ, не больше силы.
// • Раздельные пулы D и V (§8): прогресс по D зарабатывается только игрой за D
//   (чинит перекос популяции до матча). Очки сбрасываются каждую сессию (рогалик).
// • Ачивки — по навыку, БЕЗ гринда: никаких "выживи N минут" (§8 запрещает —
//   толкают к крысятничеству). Триггеры — на личное мастерство в сессии.
//
// Чисто браузерный слой: сим-петли используют распределение билдов, не ачивки.
// =============================================================================

// Базовые билды (с нуля) и разблокируемые сайдгрейды по фракциям.
export const BUILDS = {
  D: {
    base: { weapon: 'shot', provoker: false }, // §9: сток D — безопасный дальний выстрел
    weapons: ['shot', 'pulse'],                // pulse — сайдгрейд (горизонтален, §8)
    canAggro: true,                            // аггро-роль — разблокируемая
  },
  V: {
    base: { heal: 'area' },                    // §9: сток V легче — надёжный охват
    heals: ['area', 'single'],                 // single — ситуативный ответ (анти-глушитель §3)
  },
};

// Ачивки. unlocks: ключ сайдгрейда ('pulse'|'aggro'|'single') или null (бейдж).
export const ACHIEVEMENTS = [
  { id: 'd-first', faction: 'D', title: 'Первая кровь', desc: 'Убить врага', unlocks: null,
    check: (p) => p.kills >= 1 },
  { id: 'd-destroyer', faction: 'D', title: 'Разрушитель', desc: 'Нанести 1200 урона за сессию', unlocks: 'pulse',
    check: (p) => p.totalDamageDone >= 1200 },
  { id: 'd-tank', faction: 'D', title: 'Танк без щита', desc: 'Убить 2 толстяков за сессию', unlocks: 'aggro',
    check: (p) => p.fatKills >= 2 },
  { id: 'v-first', faction: 'V', title: 'Луч жизни', desc: 'Отлечить 100 HP', unlocks: null,
    check: (p) => p.totalHealDone >= 100 },
  { id: 'v-medic', faction: 'V', title: 'Поток', desc: 'Отлечить 700 эффективных HP за сессию', unlocks: 'single',
    check: (p) => p.totalHealDone >= 700 },
];

const STORE_KEY = 'dv-progression-v1';

export function emptyProgress() {
  return { achieved: [], unlocked: { D: [], V: [] } };
}

export function loadProgress() {
  try {
    const raw = typeof localStorage !== 'undefined' && localStorage.getItem(STORE_KEY);
    if (!raw) return emptyProgress();
    const p = JSON.parse(raw);
    return {
      achieved: p.achieved || [],
      unlocked: { D: p.unlocked?.D || [], V: p.unlocked?.V || [] },
    };
  } catch { return emptyProgress(); }
}

export function saveProgress(progress) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORE_KEY, JSON.stringify(progress));
  } catch { /* приватный режим / нет хранилища — молча */ }
}

export function resetProgress() {
  try { if (typeof localStorage !== 'undefined') localStorage.removeItem(STORE_KEY); } catch {}
  return emptyProgress();
}

// Новые ачивки для игрока данной фракции, ещё не полученные. Не мутирует progress.
export function checkNewAchievements(player, faction, progress) {
  const out = [];
  for (const a of ACHIEVEMENTS) {
    if (a.faction !== faction || progress.achieved.includes(a.id)) continue;
    if (a.check(player)) out.push(a);
  }
  return out;
}

// Зачесть ачивку: пометить полученной и разблокировать сайдгрейд (если есть).
export function applyAchievement(a, progress) {
  if (!progress.achieved.includes(a.id)) progress.achieved.push(a.id);
  if (a.unlocks && !progress.unlocked[a.faction].includes(a.unlocks)) {
    progress.unlocked[a.faction].push(a.unlocks);
  }
}

// Доступные билды фракции = база + разблокированное.
export function availableBuilds(faction, progress) {
  const u = progress.unlocked[faction] || [];
  if (faction === 'D') {
    return {
      weapons: BUILDS.D.weapons.filter((w) => w === 'shot' || u.includes(w)),
      canAggro: u.includes('aggro'),
    };
  }
  return { heals: BUILDS.V.heals.filter((h) => h === 'area' || u.includes(h)) };
}
