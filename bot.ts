// This is an example that uses mineflayer-pathfinder to showcase how simple it is to walk to goals

import mineflayer, { EquipmentDestination } from 'mineflayer';
import { pathfinder, Movements, goals } from 'mineflayer-pathfinder';
import { plugin as pvp } from 'mineflayer-pvp';
import type { Vec3 } from 'vec3';
if (process.argv.length < 4 || process.argv.length > 6) {
  console.log('Usage : node gps.js <host> <port> [<name>] [<password>]');
  process.exit(1);
}

const botConfig = {
  host: process.argv[2],
  port: parseInt(process.argv[3]),
  username: process.argv[4] ?? 'gps',
  hideErrors: false,
};

console.log(botConfig);

const VALID_EQUIP_DESTINATIONS = ['hand', 'head', 'torso', 'legs', 'feet', 'off-hand'];

const bot = mineflayer.createBot(botConfig);

const RANGE_GOAL = 1; // get within this radius of the player

bot.loadPlugin(pathfinder);
console.log('INFO: Loaded `pathfinder` plugin.');
bot.loadPlugin(pvp);
console.log('INFO: Loaded `pvp` plugin.');

bot.once('spawn', () => {
  console.log('INFO: Spawned');
  const defaultMove = new Movements(bot);
  // Listen for player commands

  let guardPos: Vec3 | null = null;

  // Assign the given location to be guarded
  function guardArea(pos: Vec3) {
    guardPos = pos;

    // We we are not currently in combat, move to the guard pos
    if (!bot.pvp.target) {
      moveToGuardPos();
    }
  }

  // Cancel all pathfinder and combat
  function stopGuarding() {
    guardPos = null;
    bot.pvp.stop();
    bot.pathfinder.setGoal(null);
  }

  // Pathfinder to the guard position
  function moveToGuardPos() {
    if (!guardPos) return;

    bot.pathfinder.setMovements(new Movements(bot));
    bot.pathfinder.setGoal(new goals.GoalNear(guardPos.x, guardPos.y, guardPos.z, RANGE_GOAL));
  }

  bot.on('chat', (username, message) => {
    // Guard the location the player is standing
    if (message === 'come') {
      const player = bot.players[username];

      console.log({ player });

      if (!player.entity) {
        bot.chat("I can't see you.");
        return;
      }

      bot.chat(`Coming to @${player.displayName}!`);
      bot.pathfinder.setMovements(new Movements(bot));
      bot.pathfinder.setGoal(new goals.GoalNear(player.entity.position.x, player.entity.position.y, player.entity.position.z, RANGE_GOAL));
    }

    if (message === 'inventory') {
      const items = bot.inventory.items();
      const inventoryMessage = `I have ${items.length === 0 ? 'nothing.' : '\n\n' + items.map((item) => `${item.name} (${item.count})`).join('\n')}`;
      bot.chat(inventoryMessage);
    }

    if (message.startsWith('equip')) {
      const itemName = message.split(' ')[1];
      const destination = message.split(' ')[2] ?? 'hand';

      if (!VALID_EQUIP_DESTINATIONS.includes(destination)) {
        bot.chat(`${destination} is not a valid destination. (${VALID_EQUIP_DESTINATIONS.join(', ')})`);
        return;
      }

      const item = bot.inventory.findInventoryItem(itemName, null, false);

      if (!item) {
        bot.chat(`I don't have ${itemName} on me.`);
        return;
      }

      // TODO: If you equip an item to an unreasonable destination it disappears from inventory?

      bot.equip(item, destination as EquipmentDestination).then(() => {
        // If defined and the name is equal to equipped
        if (bot.heldItem && bot.heldItem.name === item.name) {
          bot.chat(`Succesfully equipped ${itemName} to ${destination}.`);
        } else {
          bot.chat(`Failed to equip ${itemName} to ${destination}.`);
        }
      });
    }

    if (message.startsWith('unequip')) {
      const destination = message.split(' ')[1] ?? 'hand';

      if (!VALID_EQUIP_DESTINATIONS.includes(destination)) {
        bot.chat(`${destination} is not a valid destination. (${VALID_EQUIP_DESTINATIONS.join(', ')})`);
        return;
      }

      if (!bot.heldItem) {
        bot.chat(`I don't have anything equipped on ${destination}.`);
        return;
      }

      const pastHeldItemName = bot.heldItem.name;

      bot.unequip(destination as EquipmentDestination).then(() => {
        // If defined and the name is equal to equipped
        if (!bot.heldItem) {
          bot.chat(`Succesfully unequipped ${pastHeldItemName} from ${destination}.`);
        } else {
          bot.chat(`Failed to unequip ${pastHeldItemName} from ${destination}.`);
        }
      });
    }

    if (message === 'guard') {
      const player = bot.players[username];

      console.log({ player });

      if (!player.entity) {
        bot.chat("I can't see you.");
        return;
      }

      bot.chat(`I will be guarding @${player.displayName}`);
      guardArea(player.entity.position);
    }

    // Stop guarding
    if (message === 'stop guarding') {
      bot.chat('I will no longer guard this area.');
      stopGuarding();
    }
  });

  // Check for new enemies to attack
  bot.on('physicsTick', () => {
    if (!guardPos) return; // Do nothing if bot is not guarding anything

    // Only look for mobs within 16 blocks
    const entity = bot.nearestEntity((e) => (e.type as string) === 'hostile' && e.position.distanceTo(bot.entity.position) < 16);

    if (entity && bot.pvp.target === undefined) {
      // Start attacking
      console.log('Attacking', entity.id);
      bot.pvp.attack(entity).then(() => {});
    }

    // Go back to guard position
    if (!entity && bot.pvp.target === undefined && guardPos) {
      moveToGuardPos();
    }
  });

  // AUTO EAT
  bot.on('autoeat_started', (item, offhand) => {
    console.log(`Eating ${item.name} in ${offhand ? 'offhand' : 'hand'}`);
  });

  bot.on('autoeat_finished', (item, offhand) => {
    console.log(`Finished eating ${item.name} in ${offhand ? 'offhand' : 'hand'}`);
  });

  bot.on('autoeat_error', console.error);
});
