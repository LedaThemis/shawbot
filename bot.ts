import mineflayer, { BotOptions, EquipmentDestination, Player } from 'mineflayer';
import { pathfinder, Movements, goals } from 'mineflayer-pathfinder';
import { plugin as pvp } from 'mineflayer-pvp';
import { plugin as autoeat } from 'mineflayer-auto-eat';
import type { Vec3 } from 'vec3';
if (process.argv.length < 4 || process.argv.length > 6) {
  console.log('Usage : npm start -- <host> <port> [<name>] [<password>]');
  process.exit(1);
}
import dns from 'dns';

type StoreType = { followTarget: Player | null };
type OptionsType = {
  botConfig: BotOptions;
  VALID_EQUIP_DESTINATIONS: string[];
  VALID_PLUGINS: string[];
  VALID_PLUGIN_ACTIONS: string[];
  store: StoreType;
};

const HOSTNAME = process.argv[2];

function main() {
  // Resolve hostname into ip address
  dns.lookup(HOSTNAME, (err, address) => {
    console.log(`INFO: Resolving ${HOSTNAME}`);
    if (err) {
      console.error(`ERROR: Failed to resolve ${HOSTNAME}`);
      return;
    }

    console.log(`INFO: Resolved ${HOSTNAME} to ${address}`);

    const options: OptionsType = {
      botConfig: {
        host: address,
        port: parseInt(process.argv[3]),
        username: process.argv[4] ?? 'Shawbot',
        hideErrors: false,
      },
      VALID_EQUIP_DESTINATIONS: ['hand', 'head', 'torso', 'legs', 'feet', 'off-hand'],
      VALID_PLUGINS: ['autoeat'],
      VALID_PLUGIN_ACTIONS: ['start', 'stop'],
      store: {
        followTarget: null,
      },
    };

    console.log(options.botConfig);

    // Create bot
    createBot(options);
  });

  const createBot = (options: OptionsType) => {
    const { botConfig, VALID_EQUIP_DESTINATIONS, VALID_PLUGINS, VALID_PLUGIN_ACTIONS, store } = options;
    const bot = mineflayer.createBot(botConfig);

    const RANGE_GOAL = 1; // get within this radius of the player

    bot.loadPlugin(pathfinder);
    console.log('INFO: Loaded `pathfinder` plugin.');
    bot.loadPlugin(pvp);
    console.log('INFO: Loaded `pvp` plugin.');
    bot.loadPlugin(autoeat);
    console.log('INFO: Loaded `autoeat` plugin.');

    bot.once('spawn', () => {
      console.log('INFO: Spawned');

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
        if (message.startsWith('plugin')) {
          const pluginName = message.split(' ')[1];
          const pluginAction = message.split(' ')[2];

          if (!VALID_PLUGINS.includes(pluginName)) {
            bot.chat(`Unknown plugin. (${VALID_PLUGINS.join(', ')})`);
            return;
          }

          if (!VALID_PLUGIN_ACTIONS.includes(pluginAction)) {
            bot.chat(`Invalid plugin action. (${VALID_PLUGIN_ACTIONS.join(', ')})`);
            return;
          }

          switch (pluginName) {
            case 'autoeat':
              switch (pluginAction) {
                case 'start':
                  bot.autoEat.enable();
                  break;
                case 'stop':
                  bot.autoEat.disable();
                  break;
              }
          }

          bot.chat(`Successfully applied ${pluginAction} to ${pluginName}.`);
        }

        if (message === 'come') {
          const player = bot.players[username];

          console.log({ player });

          if (!player || !player.entity) {
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

        if (message.startsWith('attack')) {
          const targetUsername = message.split(' ')[1];
          const target = bot.players[targetUsername];

          if (!target) {
            bot.chat(`Could not find ${targetUsername}.`);
            return;
          }

          if (!target.entity) {
            bot.chat(`I can't see ${targetUsername}.`);
            return;
          }

          bot.chat(`Attacking ${targetUsername}!`);
          bot.pvp.attack(target.entity);
        }

        if (message === 'stop attack') {
          if (!bot.pvp.target) {
            bot.chat(`Not attacking anyone currently.`);
            return;
          }

          const previousTarget = bot.pvp.target;

          // TODO: There might be some considerations when using `guard` and `stop attack`
          bot.pvp.stop().then(() => {
            bot.chat(`Successfully stopped attacking ${previousTarget.username ?? previousTarget.displayName ?? previousTarget.name}.`);
          });
        }

        if (message.startsWith('toss')) {
          const itemName = message.split(' ')[1];
          const itemCount = parseInt(message.split(' ')[2] ?? 1);

          const item = bot.inventory.findInventoryItem(itemName, null, false);

          if (!item) {
            bot.chat(`I don't have ${itemName} on me.`);
            return;
          }

          if (Number.isNaN(itemCount)) {
            bot.chat(`Please provide a valid number.`);
            return;
          }

          if (itemCount > item.count) {
            bot.chat(`I only have ${item.count} of ${item.name} not ${itemCount}.`);
            return;
          }

          // TODO: If you equip an item to an unreasonable destination it disappears from inventory?

          bot.toss(item.type, null, itemCount).then(() => {
            bot.chat(`Succesfully tossed ${itemCount} ${itemName}.`);
          });
        }

        if (message.startsWith('follow')) {
          const targetUsername = message.split(' ')[1] ?? username;
          const target = bot.players[targetUsername];

          if (!target) {
            bot.chat(`Could not find ${targetUsername}.`);
            return;
          }

          if (!target.entity) {
            bot.chat(`I can't see ${targetUsername}.`);
            return;
          }

          store.followTarget = target;

          bot.chat(`Following ${targetUsername}!`);
        }

        if (message === 'stop follow') {
          if (!store.followTarget) {
            bot.chat(`Not following anyone currently.`);
            return;
          }

          const previousTarget = store.followTarget;
          store.followTarget = null;

          bot.chat(`Successfully stopped following ${previousTarget.username ?? previousTarget.displayName}.`);
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

      bot.on('physicsTick', () => {
        if (!store.followTarget) return;

        bot.pathfinder.setMovements(new Movements(bot));
        bot.pathfinder.setGoal(new goals.GoalNear(store.followTarget.entity.position.x, store.followTarget.entity.position.y, store.followTarget.entity.position.z, RANGE_GOAL));
      });

      // AUTO EAT
      bot.on('autoeat_started', (item, offhand) => {
        console.log(`Eating ${item.name} in ${offhand ? 'offhand' : 'hand'}`);
      });

      bot.on('autoeat_finished', (item, offhand) => {
        console.log(`Finished eating ${item.name} in ${offhand ? 'offhand' : 'hand'}`);
      });

      bot.on('autoeat_error', console.error);

      bot.once('end', () => {
        bot.removeAllListeners();
        // TODO: Might wanna add a setTimeout
        main();
      });
    });
  };
}

main();