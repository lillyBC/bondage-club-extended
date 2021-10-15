import { registerModule } from "./moduleManager";

import { ModuleAuthority } from "./modules/authority";
import { ModuleChatroom } from "./modules/chatroom";
import { ModuleClubUtils } from "./modules/clubUtils";
import { ModuleCommands } from "./modules/commands";
import { ModuleConditions } from "./modules/conditions";
import { ModuleConsole } from "./modules/console";
import { ModuleCurses } from "./modules/curses";
import { ModuleGUI } from "./modules/gui";
import { ModuleLog } from "./modules/log";
import { ModuleMessaging } from "./modules/messaging";
import { ModuleMiscPatches } from "./modules/miscPatches";
import { ModulePresets } from "./modules/presets";
import { ModuleRules } from "./modules/rules";
import { ModuleSpeech } from "./modules/speech";
import { ModuleStorage } from "./modules/storage";
import { ModuleVersionCheck } from "./modules/versionCheck";
import { ModuleWardrobe } from "./modules/wardrobe";

registerModule(new ModuleAuthority());
registerModule(new ModuleChatroom());
registerModule(new ModuleClubUtils());
registerModule(new ModuleCommands());
registerModule(new ModuleConditions());
registerModule(new ModuleConsole());
registerModule(new ModuleCurses());
registerModule(new ModuleGUI());
registerModule(new ModuleLog());
registerModule(new ModuleMessaging());
registerModule(new ModuleMiscPatches());
registerModule(new ModulePresets());
registerModule(new ModuleRules());
registerModule(new ModuleSpeech());
registerModule(new ModuleStorage());
registerModule(new ModuleVersionCheck());
registerModule(new ModuleWardrobe());
