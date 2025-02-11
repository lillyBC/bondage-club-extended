import { ChatroomCharacter, getChatroomCharacter, getPlayerCharacter } from "../characters";
import { moduleInitPhase } from "../moduleManager";
import { BaseModule } from "./_BaseModule";
import { hookFunction } from "../patching";
import { isObject, uuidv4 } from "../utils";
import { firstTimeInit } from "./storage";
import { ModuleInitPhase } from "../constants";
import { BCX_setTimeout } from "../BCXContext";

export const hiddenMessageHandlers: Map<keyof BCX_messages, (sender: number, message: any) => void> = new Map();
export const hiddenBeepHandlers: Map<keyof BCX_beeps, (sender: number, message: any) => void> = new Map();

export type queryResolveFunction<T extends keyof BCX_queries> = {
	(ok: true, data: BCX_queries[T][1]): void;
	(ok: false, error?: any): void;
};

export const queryHandlers: {
	[K in keyof BCX_queries]?: (sender: ChatroomCharacter, resolve: queryResolveFunction<K>, data: BCX_queries[K][0]) => void;
} = {};

export const changeHandlers: ((source: number) => void)[] = [];

export function sendHiddenMessage<T extends keyof BCX_messages>(type: T, message: BCX_messages[T], Target: number | null = null) {
	if (!ServerPlayerIsInChatRoom() || firstTimeInit)
		return;
	ServerSend("ChatRoomChat", {
		Content: "BCXMsg",
		Type: "Hidden",
		Target,
		Dictionary: { type, message }
	});
}

export function sendHiddenBeep<T extends keyof BCX_beeps>(type: T, message: BCX_beeps[T], target: number, asLeashBeep: boolean = false) {
	ServerSend("AccountBeep", {
		MemberNumber: target,
		BeepType: asLeashBeep ? "Leash" : "BCX",
		Message: {
			BCX: { type, message }
		}
	});
}

interface IPendingQuery {
	target: number;
	resolve: (data: any) => void;
	reject: (data: any) => void;
	timeout: number;
}

const pendingQueries: Map<string, IPendingQuery> = new Map();

export function sendQuery<T extends keyof BCX_queries>(type: T, data: BCX_queries[T][0], target: number, timeout: number = 10_000): Promise<BCX_queries[T][1]> {
	if (firstTimeInit) {
		return Promise.reject("Unavailable during init");
	}

	return new Promise((resolve, reject) => {
		const id = uuidv4();
		const info: IPendingQuery = {
			target,
			resolve,
			reject,
			timeout: BCX_setTimeout(() => {
				console.warn("BCX: Query timed out", target, type);
				pendingQueries.delete(id);
				reject("Timed out");
			}, timeout)
		};
		pendingQueries.set(id, info);

		sendHiddenMessage("query", {
			id,
			query: type,
			data
		}, target);

	});
}

hiddenMessageHandlers.set("query", (sender, message: BCX_message_query) => {
	if (!isObject(message) ||
		typeof message.id !== "string" ||
		typeof message.query !== "string"
	) {
		console.warn(`BCX: Invalid query`, sender, message);
		return;
	}

	const character = getChatroomCharacter(sender);
	if (!character || !character.hasAccessToPlayer()) {
		return sendHiddenMessage("queryAnswer", {
			id: message.id,
			ok: false
		});
	}

	const handler = queryHandlers[message.query] as (sender: ChatroomCharacter, resolve: queryResolveFunction<keyof BCX_queries>, data: any) => void;
	if (!handler) {
		console.warn("BCX: Query no handler", sender, message);
		return sendHiddenMessage("queryAnswer", {
			id: message.id,
			ok: false
		});
	}

	handler(character, (ok, data) => {
		sendHiddenMessage("queryAnswer", {
			id: message.id,
			ok,
			data
		}, sender);
	}, message.data);
});

hiddenMessageHandlers.set("queryAnswer", (sender, message: BCX_message_queryAnswer) => {
	if (!isObject(message) ||
		typeof message.id !== "string" ||
		typeof message.ok !== "boolean"
	) {
		console.warn(`BCX: Invalid queryAnswer`, sender, message);
		return;
	}

	const info = pendingQueries.get(message.id);
	if (!info) {
		console.warn(`BCX: Response to unknown query`, sender, message);
		return;
	}

	if (info.target !== info.target) {
		console.warn(`BCX: Response to query not from target`, sender, message, info);
		return;
	}

	clearTimeout(info.timeout);
	pendingQueries.delete(message.id);

	if (message.ok) {
		info.resolve(message.data);
	} else {
		info.reject(message.data);
	}
});

hiddenMessageHandlers.set("somethingChanged", (sender) => {
	changeHandlers.forEach(h => h(sender));
});

export function notifyOfChange(): void {
	if (moduleInitPhase !== ModuleInitPhase.ready)
		return;
	sendHiddenMessage("somethingChanged", undefined);
	const player = getPlayerCharacter().MemberNumber;
	changeHandlers.forEach(h => h(player));
}

export class ModuleMessaging extends BaseModule {
	load() {
		hookFunction("ChatRoomMessage", 10, (args, next) => {
			const data = args[0];

			if (data?.Type === "Hidden" && data.Content === "BCXMsg" && typeof data.Sender === "number") {
				if (data.Sender === Player.MemberNumber || firstTimeInit)
					return;
				if (!isObject(data.Dictionary)) {
					console.warn("BCX: Hidden message no Dictionary", data);
					return;
				}
				const { type, message } = data.Dictionary;
				if (typeof type === "string") {
					const handler = hiddenMessageHandlers.get(type as keyof BCX_messages);
					if (handler === undefined) {
						console.warn("BCX: Hidden message no handler", data.Sender, type, message);
					} else {
						handler(data.Sender, message);
					}
				}
				return;
			}

			return next(args);
		});

		hookFunction("ServerAccountBeep", 10, (args, next) => {
			const data = args[0];

			if (typeof data?.BeepType === "string" && ["Leash", "BCX"].includes(data.BeepType) && isObject(data.Message?.BCX)) {
				const { type, message } = data.Message.BCX;
				if (typeof type === "string") {
					const handler = hiddenBeepHandlers.get(type as keyof BCX_beeps);
					if (handler === undefined) {
						console.warn("BCX: Hidden beep no handler", data.MemberNumber, type, message);
					} else {
						handler(data.MemberNumber, message);
					}
				}
				return;
			} else {
				return next(args);
			}
		});
	}

	unload() {
		hiddenBeepHandlers.clear();
		hiddenMessageHandlers.clear();
	}
}
