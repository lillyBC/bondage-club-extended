import { VERSION } from "./config";
import { ConditionsLimit, defaultBCXEffects, ModuleCategory, TOGGLEABLE_MODULES } from "./constants";
import { AccessLevel, checkPermissionAccess, editRole, getPermissionDataFromBundle, getPlayerPermissionSettings, getPlayerRoleData, PermissionData, setPermissionMinAccess, setPermissionSelfAccess } from "./modules/authority";
import { ConditionsCategoryUpdate, ConditionsGetCategoryEnabled, ConditionsGetCategoryPublicData, ConditionsSetLimit, ConditionsUpdate, guard_ConditionsCategoryPublicData } from "./modules/conditions";
import { curseItem, curseLift, curseBatch, curseLiftAll } from "./modules/curses";
import { getVisibleLogEntries, LogAccessLevel, logClear, LogConfig, logConfigSet, LogEntry, logGetAllowedActions, logGetConfig, logMessageDelete, logPraise, LOG_CONFIG_NAMES } from "./modules/log";
import { sendQuery } from "./modules/messaging";
import { getDisabledModules } from "./modules/presets";
import { RulesCreate, RulesDelete } from "./modules/rules";
import { isObject } from "./utils";
import { BaseModule } from "./modules/_BaseModule";
import { hookFunction } from "./patching";
import { announceSelf } from "./modules/chatroom";
import { BCX_setInterval } from "./BCXContext";

import cloneDeep from "lodash-es/cloneDeep";
import isEqual from "lodash-es/isEqual";

export const PLAYER_EFFECT_REBUILD_INTERVAL = 2_000;

export class ChatroomCharacter {
	isPlayer(): this is PlayerCharacter {
		return false;
	}

	BCXVersion: string | null = null;
	Character: Character;
	Effects: BCX_effects;

	typingIndicatorEnable: boolean = true;

	get MemberNumber(): number {
		if (typeof this.Character.MemberNumber !== "number") {
			throw new Error("Character without MemberNumber");
		}
		return this.Character.MemberNumber;
	}

	get Name(): string {
		return this.Character.Name;
	}

	toString(): string {
		return `${this.Name} (${this.MemberNumber})`;
	}

	constructor(character: Character) {
		this.Character = character;
		if (character.ID === 0) {
			this.BCXVersion = VERSION;
		}
		this.Effects = cloneDeep(defaultBCXEffects);
		console.debug(`BCX: Loaded character ${character.Name} (${character.MemberNumber})`);
	}

	getDisabledModules(timeout?: number): Promise<ModuleCategory[]> {
		return sendQuery("disabledModules", undefined, this.MemberNumber, timeout).then(data => {
			if (!Array.isArray(data)) {
				console.error("BCX: Bad data during 'disabledModules' query\n", data);
				throw new Error("Bad data");
			}

			return data.filter(i => TOGGLEABLE_MODULES.includes(i));
		});
	}

	getPermissions(): Promise<PermissionData> {
		return sendQuery("permissions", undefined, this.MemberNumber).then(data => {
			if (!isObject(data) ||
				Object.values(data).some(v =>
					!Array.isArray(v) ||
					typeof v[0] !== "boolean" ||
					typeof v[1] !== "number" ||
					AccessLevel[v[1]] === undefined
				)
			) {
				console.error("BCX: Bad data during 'permissions' query\n", data);
				throw new Error("Bad data");
			}

			return getPermissionDataFromBundle(data);
		});
	}

	getPermissionAccess(permission: BCX_Permissions): Promise<boolean> {
		return sendQuery("permissionAccess", permission, this.MemberNumber).then(data => {
			if (typeof data !== "boolean") {
				console.error("BCX: Bad data during 'permissionAccess' query\n", data);
				throw new Error("Bad data");
			}
			return data;
		}).catch(err => {
			console.error(`BCX: Error while querying permission "${permission}" access for ${this}`, err);
			return false;
		});
	}

	getMyAccessLevel(): Promise<AccessLevel> {
		return sendQuery("myAccessLevel", undefined, this.MemberNumber).then(data => {
			if (typeof data !== "number" || AccessLevel[data] === undefined) {
				console.error("BCX: Bad data during 'myAccessLevel' query\n", data);
				throw new Error("Bad data");
			}
			return data;
		});
	}

	setPermission(permission: BCX_Permissions, type: "self", target: boolean): Promise<boolean>
	setPermission(permission: BCX_Permissions, type: "min", target: AccessLevel): Promise<boolean>
	setPermission(permission: BCX_Permissions, type: "self" | "min", target: boolean | AccessLevel): Promise<boolean> {
		return sendQuery("editPermission", {
			permission,
			edit: type,
			target
		}, this.MemberNumber).then(data => {
			if (typeof data !== "boolean") {
				console.error("BCX: Bad data during 'editPermission' query\n", data);
				throw new Error("Bad data");
			}
			return data;
		});
	}

	getRolesData(): Promise<PermissionRoleBundle> {
		return sendQuery("rolesData", undefined, this.MemberNumber).then(data => {
			if (!isObject(data) ||
				!Array.isArray(data.mistresses) ||
				!data.mistresses.every(i => Array.isArray(i) && i.length === 2 && typeof i[0] === "number" && typeof i[1] === "string") ||
				!Array.isArray(data.owners) ||
				!data.owners.every(i => Array.isArray(i) && i.length === 2 && typeof i[0] === "number" && typeof i[1] === "string") ||
				typeof data.allowAddMistress !== "boolean" ||
				typeof data.allowRemoveMistress !== "boolean" ||
				typeof data.allowAddOwner !== "boolean" ||
				typeof data.allowRemoveOwner !== "boolean"
			) {
				console.error("BCX: Bad data during 'rolesData' query\n", data);
				throw new Error("Bad data");
			}
			return data;
		});
	}

	editRole(role: "owner" | "mistress", action: "add" | "remove", target: number): Promise<boolean> {
		return sendQuery("editRole", {
			type: role,
			action,
			target
		}, this.MemberNumber).then(data => {
			if (typeof data !== "boolean") {
				console.error("BCX: Bad data during 'editRole' query\n", data);
				throw new Error("Bad data");
			}
			return data;
		});
	}

	getLogEntries(): Promise<LogEntry[]> {
		return sendQuery("logData", undefined, this.MemberNumber).then(data => {
			if (
				!Array.isArray(data) ||
				!data.every(e =>
					Array.isArray(e) &&
					e.length === 4 &&
					typeof e[0] === "number" &&
					typeof e[1] === "number" &&
					typeof e[2] === "number"
				)
			) {
				console.error("BCX: Bad data during 'logData' query\n", data);
				throw new Error("Bad data");
			}
			return data;
		});
	}

	logMessageDelete(time: number): Promise<boolean> {
		return sendQuery("logDelete", time, this.MemberNumber).then(data => {
			if (typeof data !== "boolean") {
				console.error("BCX: Bad data during 'logDelete' query\n", data);
				throw new Error("Bad data");
			}
			return data;
		});
	}

	getLogConfig(): Promise<LogConfig> {
		return sendQuery("logConfigGet", undefined, this.MemberNumber).then(data => {
			if (!isObject(data) ||
				Object.values(data).some(v => typeof v !== "number")
			) {
				console.error("BCX: Bad data during 'logConfigGet' query\n", data);
				throw new Error("Bad data");
			}
			for (const k of Object.keys(data) as BCX_LogCategory[]) {
				if (data[k] == null || LOG_CONFIG_NAMES[k] === undefined || LogAccessLevel[data[k]!] === undefined) {
					delete data[k];
				}
			}
			return data;
		});
	}

	setLogConfig(category: BCX_LogCategory, target: LogAccessLevel): Promise<boolean> {
		return sendQuery("logConfigEdit", {
			category,
			target
		}, this.MemberNumber).then(data => {
			if (typeof data !== "boolean") {
				console.error("BCX: Bad data during 'logConfigEdit' query\n", data);
				throw new Error("Bad data");
			}
			return data;
		});
	}

	logClear(): Promise<boolean> {
		return sendQuery("logClear", undefined, this.MemberNumber).then(data => {
			if (typeof data !== "boolean") {
				console.error("BCX: Bad data during 'logClear' query\n", data);
				throw new Error("Bad data");
			}
			return data;
		});
	}

	logPraise(value: -1 | 0 | 1, message: string | null): Promise<boolean> {
		return sendQuery("logPraise", {
			message,
			value
		}, this.MemberNumber).then(data => {
			if (typeof data !== "boolean") {
				console.error("BCX: Bad data during 'logPraise' query\n", data);
				throw new Error("Bad data");
			}
			return data;
		});
	}

	logGetAllowedActions(): Promise<BCX_logAllowedActions> {
		return sendQuery("logGetAllowedActions", undefined, this.MemberNumber).then(data => {
			if (!isObject(data) ||
				typeof data.delete !== "boolean" ||
				typeof data.configure !== "boolean" ||
				typeof data.praise !== "boolean" ||
				typeof data.leaveMessage !== "boolean"
			) {
				console.error("BCX: Bad data during 'logGetAllowedActions' query\n", data);
				throw new Error("Bad data");
			}
			return data;
		});
	}

	curseItem(Group: string, curseProperties: boolean | null): Promise<boolean> {
		return sendQuery("curseItem", { Group, curseProperties }, this.MemberNumber).then(data => {
			if (typeof data !== "boolean") {
				console.error("BCX: Bad data during 'curseItem' query\n", data);
				throw new Error("Bad data");
			}
			return data;
		});
	}

	curseLift(Group: string): Promise<boolean> {
		return sendQuery("curseLift", Group, this.MemberNumber).then(data => {
			if (typeof data !== "boolean") {
				console.error("BCX: Bad data during 'curseLift' query\n", data);
				throw new Error("Bad data");
			}
			return data;
		});
	}

	curseBatch(mode: "items" | "clothes", includingEmpty: boolean): Promise<boolean> {
		return sendQuery("curseBatch", { mode, includingEmpty }, this.MemberNumber).then(data => {
			if (typeof data !== "boolean") {
				console.error("BCX: Bad data during 'curseBatch' query\n", data);
				throw new Error("Bad data");
			}
			return data;
		});
	}

	curseLiftAll(): Promise<boolean> {
		return sendQuery("curseLiftAll", undefined, this.MemberNumber).then(data => {
			if (typeof data !== "boolean") {
				console.error("BCX: Bad data during 'curseLiftAll' query\n", data);
				throw new Error("Bad data");
			}
			return data;
		});
	}

	conditionsGetByCategory<C extends ConditionsCategories>(category: C): Promise<ConditionsCategoryPublicData<C>> {
		return sendQuery("conditionsGet", category, this.MemberNumber).then(data => {
			if (!guard_ConditionsCategoryPublicData(category, data, true)) {
				console.error("BCX: Bad data during 'conditionsGet' query\n", data);
				throw new Error("Bad data");
			}
			return data;
		});
	}

	conditionSetLimit<C extends ConditionsCategories>(category: C, condition: ConditionsCategoryKeys[C], limit: ConditionsLimit): Promise<boolean> {
		return sendQuery("conditionSetLimit", { category, condition, limit }, this.MemberNumber).then(data => {
			if (typeof data !== "boolean") {
				console.error("BCX: Bad data during 'conditionSetLimit' query\n", data);
				throw new Error("Bad data");
			}
			return data;
		});
	}

	conditionUpdate<C extends ConditionsCategories>(category: C, condition: ConditionsCategoryKeys[C], data: ConditionsConditionPublicData<C>): Promise<boolean> {
		return sendQuery("conditionUpdate", { category, condition, data }, this.MemberNumber).then(res => {
			if (typeof res !== "boolean") {
				console.error("BCX: Bad data during 'conditionUpdate' query\n", res);
				throw new Error("Bad data");
			}
			return res;
		});
	}

	conditionCategoryUpdate<C extends ConditionsCategories>(category: C, data: ConditionsCategoryConfigurableData): Promise<boolean> {
		return sendQuery("conditionCategoryUpdate", { category, data }, this.MemberNumber).then(res => {
			if (typeof res !== "boolean") {
				console.error("BCX: Bad data during 'conditionCategoryUpdate' query\n", res);
				throw new Error("Bad data");
			}
			return res;
		});
	}

	ruleCreate(name: BCX_Rule): Promise<boolean> {
		return sendQuery("ruleCreate", name, this.MemberNumber).then(res => {
			if (typeof res !== "boolean") {
				console.error("BCX: Bad data during 'ruleCreate' query\n", res);
				throw new Error("Bad data");
			}
			return res;
		});
	}

	ruleDelete(name: BCX_Rule): Promise<boolean> {
		return sendQuery("ruleDelete", name, this.MemberNumber).then(res => {
			if (typeof res !== "boolean") {
				console.error("BCX: Bad data during 'ruleDelete' query\n", res);
				throw new Error("Bad data");
			}
			return res;
		});
	}

	hasAccessToPlayer(): boolean {
		return ServerChatRoomGetAllowItem(this.Character, Player);
	}

	playerHasAccessToCharacter(): boolean {
		return ServerChatRoomGetAllowItem(Player, this.Character);
	}
}

export class PlayerCharacter extends ChatroomCharacter {
	/** HACK: Otherwise TS wrongly assumes PlayerCharacter to be identical to ChatroomCharacter */
	public readonly playerObject = true;

	override isPlayer(): this is PlayerCharacter {
		return true;
	}

	override getDisabledModules(): Promise<ModuleCategory[]> {
		return Promise.resolve(getDisabledModules());
	}

	override getPermissions(): Promise<PermissionData> {
		return Promise.resolve(getPlayerPermissionSettings());
	}

	override getPermissionAccess(permission: BCX_Permissions): Promise<boolean> {
		return Promise.resolve(checkPermissionAccess(permission, this));
	}

	override getMyAccessLevel(): Promise<AccessLevel.self> {
		return Promise.resolve(AccessLevel.self);
	}

	override setPermission(permission: BCX_Permissions, type: "self", target: boolean): Promise<boolean>
	override setPermission(permission: BCX_Permissions, type: "min", target: AccessLevel): Promise<boolean>
	override setPermission(permission: BCX_Permissions, type: "self" | "min", target: boolean | AccessLevel): Promise<boolean> {
		if (type === "self") {
			if (typeof target !== "boolean") {
				throw new Error("Invalid target value for self permission edit");
			}
			return Promise.resolve(setPermissionSelfAccess(permission, target, this));
		} else {
			if (typeof target !== "number") {
				throw new Error("Invalid target value for min permission edit");
			}
			return Promise.resolve(setPermissionMinAccess(permission, target, this));
		}
	}

	override getRolesData(): Promise<PermissionRoleBundle> {
		return Promise.resolve(getPlayerRoleData(this));
	}

	override editRole(role: "owner" | "mistress", action: "add" | "remove", target: number): Promise<boolean> {
		return Promise.resolve(editRole(role, action, target, this));
	}

	override getLogEntries(): Promise<LogEntry[]> {
		return Promise.resolve(getVisibleLogEntries(this));
	}

	override logMessageDelete(time: number): Promise<boolean> {
		return Promise.resolve(logMessageDelete(time, this));
	}

	override getLogConfig(): Promise<LogConfig> {
		return Promise.resolve(logGetConfig());
	}

	override setLogConfig(category: BCX_LogCategory, target: LogAccessLevel): Promise<boolean> {
		return Promise.resolve(logConfigSet(category, target, this));
	}

	override logClear(): Promise<boolean> {
		return Promise.resolve(logClear(this));
	}

	override logPraise(value: -1 | 0 | 1, message: string | null): Promise<boolean> {
		return Promise.resolve(logPraise(value, message, this));
	}

	override logGetAllowedActions(): Promise<BCX_logAllowedActions> {
		return Promise.resolve(logGetAllowedActions(this));
	}

	override curseItem(Group: string, curseProperties: boolean): Promise<boolean> {
		return Promise.resolve(curseItem(Group, curseProperties, this));
	}

	override curseLift(Group: string): Promise<boolean> {
		return Promise.resolve(curseLift(Group, this));
	}

	override curseBatch(mode: "items" | "clothes", includingEmpty: boolean): Promise<boolean> {
		return Promise.resolve(curseBatch(mode, includingEmpty, this));
	}

	override curseLiftAll(): Promise<boolean> {
		return Promise.resolve(curseLiftAll(this));
	}

	override conditionsGetByCategory<C extends ConditionsCategories>(category: C): Promise<ConditionsCategoryPublicData<C>> {
		if (!ConditionsGetCategoryEnabled(category))
			return Promise.reject("Category is disabled");
		return Promise.resolve(ConditionsGetCategoryPublicData(category, this));
	}

	override conditionSetLimit<C extends ConditionsCategories>(category: C, condition: ConditionsCategoryKeys[C], limit: ConditionsLimit): Promise<boolean> {
		return Promise.resolve(ConditionsSetLimit(category, condition, limit, this));
	}

	override conditionUpdate<C extends ConditionsCategories>(category: C, condition: ConditionsCategoryKeys[C], data: ConditionsConditionPublicData<C>): Promise<boolean> {
		return Promise.resolve(ConditionsUpdate(category, condition, data, this));
	}

	override ruleCreate(name: BCX_Rule): Promise<boolean> {
		return Promise.resolve(RulesCreate(name, this));
	}

	override ruleDelete(name: BCX_Rule): Promise<boolean> {
		return Promise.resolve(RulesDelete(name, this));
	}

	conditionCategoryUpdate<C extends ConditionsCategories>(category: C, data: ConditionsCategoryConfigurableData): Promise<boolean> {
		return Promise.resolve(ConditionsCategoryUpdate(category, data, this));
	}
}

const currentRoomCharacters: ChatroomCharacter[] = [];

function cleanOldCharacters(): void {
	for (let i = currentRoomCharacters.length - 1; i >= 0; i--) {
		if (!currentRoomCharacters[i].isPlayer() && !ChatRoomCharacter.includes(currentRoomCharacters[i].Character)) {
			currentRoomCharacters.splice(i, 1);
		}
	}
}

export function getChatroomCharacter(memberNumber: number): ChatroomCharacter | null {
	if (typeof memberNumber !== "number")
		return null;
	cleanOldCharacters();
	let character = currentRoomCharacters.find(c => c.Character.MemberNumber === memberNumber);
	if (!character) {
		if (Player.MemberNumber === memberNumber) {
			character = new PlayerCharacter(Player);
		} else {
			const BCCharacter = ChatRoomCharacter.find(c => c.MemberNumber === memberNumber);
			if (!BCCharacter) {
				return null;
			}
			character = new ChatroomCharacter(BCCharacter);
		}
		currentRoomCharacters.push(character);
	}
	return character;
}

export function getAllCharactersInRoom(): ChatroomCharacter[] {
	if (!ServerPlayerIsInChatRoom()) {
		return [getPlayerCharacter()];
	}
	return ChatRoomCharacter.map(c => getChatroomCharacter(c.MemberNumber!)).filter(Boolean) as ChatroomCharacter[];
}

export function getPlayerCharacter(): PlayerCharacter {
	let character = currentRoomCharacters.find(c => c.Character === Player) as PlayerCharacter | undefined;
	if (!character) {
		character = new PlayerCharacter(Player);
		currentRoomCharacters.push(character);
	}
	return character;
}

const effectBuilderFunctions: ((PlayerEffects: BCX_effects) => void)[] = [];

export function registerEffectBuilder(builder: (PlayerEffects: BCX_effects) => void): void {
	effectBuilderFunctions.push(builder);
}

export function buildPlayerEffects(): void {
	const effects = cloneDeep(defaultBCXEffects);
	for (const builder of effectBuilderFunctions) {
		builder(effects);
	}
	const player = getPlayerCharacter();
	if (isEqual(effects, player.Effects))
		return;

	player.Effects = effects;
	CharacterRefresh(Player, false);
	announceSelf(false);
}

export class ModuleCharacter extends BaseModule {
	private timer: number | null = null;

	load() {
		hookFunction("CharacterLoadEffect", 0, (args, next) => {
			next(args);
			const C = args[0] as Character;
			const character = typeof C.MemberNumber === "number" && getChatroomCharacter(C.MemberNumber);
			if (character) {
				for (const effect of character.Effects.Effect) {
					if (!C.Effect.includes(effect)) {
						C.Effect.push(effect);
					}
				}
			}
		});
	}

	run() {
		this.timer = BCX_setInterval(buildPlayerEffects, PLAYER_EFFECT_REBUILD_INTERVAL);
	}

	unload() {
		if (this.timer !== null) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}
}
