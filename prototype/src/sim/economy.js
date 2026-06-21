// =============================================================================
// economy — валюта как стержень всех механик (GDD §5) + ноды = движок баланса (§4).
//
// • Убийство врага платит ДОБИВШЕМУ (валюта с врагов, §4 таблица).
// • V платится за ЭФФЕКТИВНЫЙ хил D — за HP, реально отыгранные после урона,
//   оверхил по полному союзнику = 0 (§5). Поэтому фарм невозможен, а экстренный
//   хил никогда не блокируется (нет CD на касте).
// • Бонус тёмного мира множит ЛЮБУЮ выплату и достаётся всем, включая V (§5).
// • Ноды: покупка тратит валюту, даёт личную силу И двигает канат вложенным очком (§4).
// =============================================================================

export function darkBonus(world) {
  return 1 + world.darkness * world.cfg.economy.darkCurrencyGain;
}

// Выплата за убийство врага (идёт добившему).
export function payKill(world, killer) {
  if (!killer || killer.kind !== 'player') return;
  // §5/§8: доход V с убийств урезается (его деньги — хил, а не урон)
  const vFactor = killer.faction === 'V' ? world.cfg.economy.vKillFactor : 1;
  const amount = world.cfg.economy.killBase * darkBonus(world) * vFactor;
  killer.currency += amount;
  killer.incomeTotal += amount;
  killer.incomeKill += amount;
  killer.kills += 1;
  world.totalEarned += amount; // «общие очки» популяции (триггер босса §босс)
}

// Выплата V за эффективный хил. effectiveHP — реально восстановленные HP (без оверхила).
export function payEffectiveHeal(world, healer, effectiveHP) {
  if (effectiveHP <= 0) return; // оверхил = ноль награды → фарма нет, экстренный хил свободен
  const amount = effectiveHP * world.cfg.economy.healPayPerHP * darkBonus(world);
  healer.currency += amount;
  healer.incomeTotal += amount;
  healer.incomeHeal += amount;
  healer.totalHealDone += effectiveHP;
  world.stats.vIncomeAccum += amount; // для телеметрии (доход V во времени)
  world.totalEarned += amount;        // «общие очки» популяции (триггер босса §босс)
}

// Может ли игрок купить ноду прямо сейчас.
export function canBuyNode(world, player) {
  return player.currency >= world.cfg.nodes.cost;
}

// Купить ноду. D — урон + тёмное очко; V — сила хила + светлое очко (§4).
// Возвращает true, если покупка состоялась.
export function buyNode(world, player) {
  if (!canBuyNode(world, player)) return false;
  const n = world.cfg.nodes;
  player.currency -= n.cost;
  player.nodesBought += 1;

  if (player.faction === 'D') {
    player.shotDamage += n.dDamageStep;   // личная сила D (растёт у самого D)
    world.darkInvested += n.dDarkPoints;  // голос за тьму
  } else {
    player.healPower += n.vHealStep;      // личная сила V (растёт у самого V)
    world.lightInvested += n.vLightPoints;// голос за свет
  }
  return true;
}
