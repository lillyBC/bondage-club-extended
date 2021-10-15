import { ModuleInitPhase } from "../constants";
import { moduleInitPhase } from "../moduleManager";
import { hookFunction } from "../patching";
import { ChatRoomSendLocal } from "../utilsClub";
import { registerCommand } from "./commands";
import { RulesGetRuleState } from "./rules";
import { BaseModule } from "./_BaseModule";

export interface SpeechMessageInfo {
	readonly type: "Chat" | "Emote" | "Whisper" | "Command";
	readonly target: number | null;
	readonly rawMessage: string;
	readonly originalMessage: string;
	readonly noOOCMessage?: string;
	readonly hasOOC: boolean;
}

export interface SpeechHook {
	allowSend?(info: SpeechMessageInfo): boolean;
	modify?(info: SpeechMessageInfo, message: string): string;
	onSend?(info: SpeechMessageInfo, message: string): void;
}

const speechHooks: SpeechHook[] = [];

export function registerSpeechHook(hook: SpeechHook): void {
	if (moduleInitPhase !== ModuleInitPhase.init) {
		throw new Error("Speech hooks can be registered only during init");
	}
	speechHooks.push(hook);
}

function parseMsg(msg: string): SpeechMessageInfo | null {
	const rawMessage = msg;
	if (msg.startsWith("//")) {
		msg = msg.substr(1);
	} else if (msg.startsWith("/")) {
		return {
			type: "Command",
			rawMessage,
			originalMessage: msg,
			target: null,
			hasOOC: true
		};
	}
	if (msg.startsWith("*") || (Player.ChatSettings?.MuStylePoses && msg.startsWith(":") && msg.length > 3)) {
		// Emotes are handled in `ChatRoomSendEmote`
		return null;
	}
	return {
		type: ChatRoomTargetMemberNumber == null ? "Chat" : "Whisper",
		rawMessage,
		originalMessage: msg,
		target: ChatRoomTargetMemberNumber,
		noOOCMessage: msg.replace(/\([^)]*\)?\s?/gs, ""),
		hasOOC: msg.includes("(")
	};
}

/**
 * @returns The message that should be sent, or `null` if stopped
 */
function processMsg(msg: SpeechMessageInfo): string | null {
	// Don't modify commands this way
	if (msg.type === "Command") {
		return msg.rawMessage;
	}

	if (
		(msg.type === "Chat" || msg.type === "Whisper") &&
		ChatRoomShouldBlockGaggedOOCMessage(msg.originalMessage, ChatRoomCharacter.find(C => C.MemberNumber === ChatRoomTargetMemberNumber))
	) {
		// The message will be blocked by BC, just return it
		return msg.rawMessage;
	}

	// Let hooks block the messsage
	for (const hook of speechHooks) {
		if (hook.allowSend && !hook.allowSend(msg)) {
			return null;
		}
	}

	let message = msg.originalMessage;
	// Let hooks modify the message
	for (const hook of speechHooks) {
		if (hook.modify) {
			message = hook.modify(msg, message);
		}
	}

	// Let hooks react to actual message that will be sent
	for (const hook of speechHooks) {
		if (hook.onSend) {
			hook.onSend(msg, message);
		}
	}

	// Escape '/' if message starts with it
	if (message.startsWith("/")) {
		message = "/" + message;
	}
	return message;
}

//#region Antigarble
let antigarble = 0;

function setAntigarble(value: number): boolean {
	if (![0, 1, 2].includes(value)) {
		throw new Error("Bad antigarble value, expected 0/1/2");
	}
	if (value !== 0) {
		const blockRule = RulesGetRuleState("forbid_antigarble");
		if (blockRule.isEnforced) {
			blockRule.triggerAttempt();
			return false;
		} else if (blockRule.inEffect) {
			blockRule.trigger();
		}
	}
	antigarble = value;
	return true;
}
//#endregion

export class ModuleSpeech extends BaseModule {
	load() {
		hookFunction("ChatRoomSendChat", 5, (args, next) => {
			const chat = document.getElementById("InputChat") as HTMLTextAreaElement | null;
			if (chat) {
				const msg = chat.value.trim();
				if (msg) {
					const info = parseMsg(msg);
					if (info) {
						const msg2 = processMsg(info);
						if (msg2 === null) {
							if (RulesGetRuleState("force_to_retype").isEnforced) {
								chat.value = "";
							}
							return;
						}
						chat.value = msg2;
					}
				}
			}
			return next(args);
		});

		// Even if not modified by hook, the hash is very important
		hookFunction("CommandParse", 0, (args, next) => next(args));

		hookFunction("ChatRoomSendEmote", 5, (args, next) => {
			const rawMessage = args[0] as string;
			let msg = rawMessage;
			if (Player.ChatSettings?.MuStylePoses && msg.startsWith(":")) msg = msg.substring(1);
			else {
				msg = msg.replace(/^\*/, "").replace(/\*$/, "");
				if (msg.startsWith("/me ")) msg = msg.replace("/me ", "");
				if (msg.startsWith("/action ")) msg = msg.replace("/action ", "*");
			}
			msg = msg.trim();
			const msg2 = processMsg({
				type: "Emote",
				rawMessage,
				originalMessage: msg,
				target: ChatRoomTargetMemberNumber,
				noOOCMessage: msg,
				hasOOC: false
			});
			if (msg2 !== null) {
				return next(["*" + msg2]);
			} else if (RulesGetRuleState("force_to_retype").isEnforced) {
				const chat = document.getElementById("InputChat") as HTMLTextAreaElement | null;
				if (chat) {
					chat.value = "";
				}
			}
		});

		//#region Antigarble
		const ANTIGARBLE_LEVELS: Record<string, number> = {
			"0": 0,
			"1": 1,
			"2": 2,
			"normal": 0,
			"both": 1,
			"ungarbled": 2
		};

		const ANTIGARBLE_LEVEL_NAMES: string[] = Object.keys(ANTIGARBLE_LEVELS).filter(k => k.length > 1);

		registerCommand("antigarble", "<level> - set garble prevention to show [normal|both|ungarbled] messages (only affects received messages!)", value => {
			const val = ANTIGARBLE_LEVELS[value || ""];
			if (val !== undefined) {
				if (setAntigarble(val)) {
					ChatRoomSendLocal(`Antigarble set to ${ANTIGARBLE_LEVEL_NAMES[val]}`);
					return true;
				}
				return false;
			}
			ChatRoomSendLocal(`Invalid antigarble level; use ${ANTIGARBLE_LEVEL_NAMES.join("/")}`);
			return false;
		}, value => {
			return ANTIGARBLE_LEVEL_NAMES.filter(k => k.length > 1 && k.startsWith(value));
		});

		hookFunction("SpeechGarble", 0, (args, next) => {
			if (antigarble === 2) return args[1];
			let res = next(args);
			if (typeof res === "string" && res !== args[1] && antigarble === 1) res += ` <> ${args[1]}`;
			return res;
		});
		//#endregion
	}
}
