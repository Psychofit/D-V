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
    nodesBought: 0,
    // накопительная статистика для телеметрии:
    totalHealDone: 0,        // эффективный хил (только V)
    totalDamageDone: 0,
    kills: 0,
    alive: true,
    controlled: false,       // захвачен человеком (браузер)
    aim: { x: 1, y: 0 },     // направление прицела (для управляемого режима)
    wantShoot: false,
  };
}

export function makeEnemy(world, pos) {
  const cfg = world.cfg.enemy;
  return {
    id: world.nextId++,
    kind: 'enemy',
    type: 'melee',
    pos: { ...pos },
    vel: { x: 0, y: 0 },
    hp: cfg.hp,
    maxHp: cfg.hp,
    radius: cfg.radius,
    speed: cfg.speed,
    attackCooldown: 0,
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
