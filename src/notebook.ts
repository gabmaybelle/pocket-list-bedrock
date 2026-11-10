// The notebook item and the commands: how you open your list on Bedrock, where a script can't see
// keys (the Java edition opens on K). Use the notebook to open the list screen; sneak and use it to
// show or hide the HUD (Java's toggle key). /pocket_list:open and /pocket_list:toggle do the same, for
// anyone, with cheats off too.
import { ButtonState, CommandPermissionLevel, CustomCommandOrigin, CustomCommandStatus, InputButton, Player, system, world } from "@minecraft/server";
import { NS, dataOf, saveData } from "./store.js";
import { openMenu } from "./forms.js";
import { refresh } from "./hud.js";
import { counted } from "./count.js";

export const NOTEBOOK = `${NS}:notebook`;

export function toggleHud(player: Player) {
  const data = dataOf(player);
  data.hud = !data.hud;
  saveData(player);
  refresh(player, counted(player));
  player.sendMessage(data.hud ? "§ePocket List shown." : "§ePocket List hidden. Sneak and use the notebook, or /pocket_list:toggle, to show it again.");
}

export function open(player: Player) {
  openMenu(player).catch((e) => console.warn(`Pocket List: list screen: ${e}`));
}

world.afterEvents.itemUse.subscribe(({ itemStack, source }) => {
  if (itemStack.typeId !== NOTEBOOK || !(source instanceof Player)) return;
  // The sneak button as the player holds it now (isSneaking can lag a tick behind the input).
  if (source.inputInfo.getButtonState(InputButton.Sneak) === ButtonState.Pressed) toggleHud(source);
  else open(source);
});

function asPlayer(origin: CustomCommandOrigin): Player | undefined {
  const who = origin.sourceEntity ?? origin.initiator;
  return who instanceof Player ? who : undefined;
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    { name: `${NS}:open`, description: "Opens your Pocket List.", permissionLevel: CommandPermissionLevel.Any, cheatsRequired: false },
    (origin) => {
      const player = asPlayer(origin);
      if (!player) return { status: CustomCommandStatus.Failure, message: "Pocket List: open this as a player in the game." };
      system.run(() => open(player));
      return { status: CustomCommandStatus.Success };
    },
  );
  customCommandRegistry.registerCommand(
    { name: `${NS}:toggle`, description: "Shows or hides your Pocket List in the corner of the screen.", permissionLevel: CommandPermissionLevel.Any, cheatsRequired: false },
    (origin) => {
      const player = asPlayer(origin);
      if (!player) return { status: CustomCommandStatus.Failure, message: "Pocket List: run this as a player in the game." };
      system.run(() => toggleHud(player));
      return { status: CustomCommandStatus.Success };
    },
  );
});
