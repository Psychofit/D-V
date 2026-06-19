// =============================================================================
// entities — фабрики сущностей симуляции. Всё это простые объекты-данные;
// логика живёт в combat/ai/economy. Так ядро остаётся чистым и переносимым
// (один и тот же код в браузере и в headless-Node).
// =============================================================================

export function makePlayer(world, faction, pos) {
  const cfg = world.cfg[faction];
  return {
    id: world.nextId++,
    kind: 'player',
    faction,                 // 'D' | 'V'
    pos: { ...pos },
    vel: { x: 0, y: 0 },
    hp: cfg.hp,
    maxHp: cfg.hp,
    radius: cfg.radius,
    speed: cfg.speed,
    // Апгрейдимые личные статы — растут от собственных нод игрока (§4):
    shotDamage: faction === 'D' ? cfg.shotDamage : 0, // используется D
    healPower: faction === 'V' ? cfg.healPower : 0,    // используется V (хил/урон)
    shotCooldown: 0,
    currency: 0,
    incomeTotal: 0,          // валовой заработок за сессию (до трат) — сигнал для выбора фракции §5
    incomeKill: 0,           // из них с убийств врагов
    incomeHeal: 0,           // из них с эффективного хила (только V; "симбиозный" доход §5)
    nodesBought: 0,
    // накопительная статистика для телеметрии:
    totalHealDone: 0,        // эффективный хил (только V)
    totalDamageDone: 0,
    kills: 0,
    alive: true,
    controlled: false,       // захвачен человеком (браузер)
    provoker: false,         // взял аггро-роль §7 (стягивает V-целящих врагов на себя)
    aim: { x: 1, y: 0 },     // направление прицела (для управляемого режима)
    wantShoot: false,
    pulseFx: null,           // транзиентный след пульса D (для рендера)
  };
}

// Типы врага (§3): 'swarm' рой · 'fat' толстяк · 'hunter' охотник · 'ranged' дальнобой.
// Боевые статы копируются на сущность, чтобы combat/ai не разветвлялись по типу.
const ENEMY_CFG = {
  swarm: 'enemy', fat: 'enemyFat', hunter: 'enemyHunter',
  ranged: 'enemyRanged', suppressor: 'enemySuppressor',
};

export function makeEnemy(world, pos, type = 'swarm') {
  const cfg = world.cfg[ENEMY_CFG[type] || 'enemy'];
  return {
    id: world.nextId++,
    kind: 'enemy',
    type,
    pos: { ...pos },
    vel: { x: 0, y: 0 },
    hp: cfg.hp,
    maxHp: cfg.hp,
    radius: cfg.radius,
    speed: cfg.speed,
    contactDamage: cfg.contactDamage,
    attackInterval: cfg.attackInterval,
    attackRange: cfg.attackRange ?? 22,
    damageDarkGain: cfg.damageDarkGain,
    attackSpeedDarkGain: cfg.attackSpeedDarkGain,
    speedDarkGain: cfg.speedDarkGain,
    attackKind: cfg.attackKind ?? 'melee',       // 'melee' | 'ranged'
    targetPref: cfg.targetPref ?? 'nearest',     // 'nearest' | 'healer'(V)
    fireRange: cfg.fireRange ?? 0,               // для дальнобоя
    projectileSpeed: cfg.projectileSpeed ?? 0,
    projectileRadius: cfg.projectileRadius ?? 5,
    suppressRadius: cfg.suppressRadius ?? 0,     // для глушителя (§3)
    suppressRadiusDarkGain: cfg.suppressRadiusDarkGain ?? 0,
    healSuppressFactor: cfg.healSuppressFactor ?? 1,
    standoff: cfg.standoff ?? 0,
    attackCooldown: 0,
    markedUntil: 0,          // метка V (§2): D бьёт сильнее, пока world.time < markedUntil
    targetId: null,
    alive: true,
  };
}

export function makeProjectile(world, { faction, effect, ownerId, pos, vel, power, radius, range }) {
  return {
    id: world.nextId++,
    kind: 'projectile',
    faction,                 // 'D' | 'V'
    effect,                  // 'damage' | 'heal'
    ownerId,
    pos: { ...pos },
    vel: { ...vel },
    power,
    radius,
    traveled: 0,
    range,
    alive: true,
  };
}
