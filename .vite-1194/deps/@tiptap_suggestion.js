import "./@tiptap_pm_state.js";
import { a as PluginKey, i as Plugin } from "./dist-CrIvfOQu.js";
import { H as escapeForRegEx } from "./dist-BgYMzsBB.js";
import { Decoration, DecorationSet } from "./@tiptap_pm_view.js";
import { a as flip, i as computePosition, l as offset, r as autoUpdate } from "./floating-ui.dom-BsrkDKcO.js";
// ../DnD helper/node_modules/@tiptap/suggestion/dist/index.js
function findSuggestionMatch(config) {
	var _$position$nodeBefore;
	const { char, allowSpaces: allowSpacesOption, allowToIncludeChar, allowedPrefixes, startOfLine, $position } = config;
	const allowSpaces = allowSpacesOption && !allowToIncludeChar;
	const escapedChar = escapeForRegEx(char);
	const suffix = new RegExp(`\\s${escapedChar}$`);
	const prefix = startOfLine ? "^" : "";
	const finalEscapedChar = allowToIncludeChar ? "" : escapedChar;
	const regexp = allowSpaces ? new RegExp(`${prefix}${escapedChar}.*?(?=\\s${finalEscapedChar}|$)`, "gm") : new RegExp(`${prefix}(?:^)?${escapedChar}[^\\s${finalEscapedChar}]*`, "gm");
	const text = ((_$position$nodeBefore = $position.nodeBefore) === null || _$position$nodeBefore === void 0 ? void 0 : _$position$nodeBefore.isText) && $position.nodeBefore.text;
	if (!text) return null;
	const textFrom = $position.pos - text.length;
	const match = Array.from(text.matchAll(regexp)).pop();
	if (!match || match.input === void 0 || match.index === void 0) return null;
	const matchPrefix = match.input.slice(Math.max(0, match.index - 1), match.index);
	const matchPrefixIsAllowed = new RegExp(`^[${allowedPrefixes === null || allowedPrefixes === void 0 ? void 0 : allowedPrefixes.map(escapeForRegEx).join("")}\0]?$`).test(matchPrefix);
	if (allowedPrefixes !== null && !matchPrefixIsAllowed) return null;
	const from = textFrom + match.index;
	let to = from + match[0].length;
	if (allowSpaces && suffix.test(text.slice(to - 1, to + 1))) {
		match[0] += " ";
		to += 1;
	}
	if (from < $position.pos && to >= $position.pos) return {
		range: {
			from,
			to
		},
		query: match[0].slice(char.length),
		text: match[0]
	};
	return null;
}
/**
* Returns true if the transaction inserted any whitespace or newline character.
* Used to determine when a dismissed suggestion should become active again.
*/
function hasInsertedWhitespace(transaction) {
	if (!transaction.docChanged) return false;
	return transaction.steps.some((step) => {
		const slice = step.slice;
		if (!(slice === null || slice === void 0 ? void 0 : slice.content)) return false;
		const inserted = slice.content.textBetween(0, slice.content.size, "\n");
		return /\s/.test(inserted);
	});
}
/**
* Gets the DOM rectangle corresponding to the current editor cursor anchor position.
* Calculates screen coordinates based on Tiptap's cursor position and converts to a DOMRect object.
*/
function getAnchorClientRect(editor) {
	return () => {
		const pos = editor.state.selection.$anchor.pos;
		const { top, right, bottom, left } = editor.view.coordsAtPos(pos);
		try {
			return new DOMRect(left, top, right - left, bottom - top);
		} catch {
			return null;
		}
	};
}
/**
* Creates a clientRect callback for a given decoration node.
* Returns the anchor rect when no decoration node is present.
* Uses the pluginKey's state to resolve the current decoration node on demand.
*/
function clientRectFor(editor, view, decorationNode, pluginKey) {
	if (!decorationNode) return getAnchorClientRect(editor);
	return () => {
		const state = pluginKey.getState(editor.state);
		const decorationId = state === null || state === void 0 ? void 0 : state.decorationId;
		const currentDecorationNode = view.dom.querySelector(`[data-decoration-id="${decorationId}"]`);
		return (currentDecorationNode === null || currentDecorationNode === void 0 ? void 0 : currentDecorationNode.getBoundingClientRect()) || null;
	};
}
/**
* Determines whether a dismissed suggestion should stay dismissed.
* Returns `true` (keep dismissed) or `false` (allow reactivation).
*/
function shouldKeepDismissed({ match, dismissedRange, state, transaction, editor, shouldResetDismissed, effectiveAllowSpaces }) {
	if (shouldResetDismissed === null || shouldResetDismissed === void 0 ? void 0 : shouldResetDismissed({
		editor,
		state,
		range: dismissedRange,
		match,
		transaction,
		allowSpaces: effectiveAllowSpaces
	})) return false;
	if (effectiveAllowSpaces) return match.range.from === dismissedRange.from;
	return match.range.from === dismissedRange.from && !hasInsertedWhitespace(transaction);
}
/**
* Dispatch an exit of the suggestion plugin by dispatching a metadata-only
* transaction to clear the plugin state. The renderer's onExit hook is NOT
* called here — it fires via the plugin view's stopped transition, which
* builds SuggestionProps consistently with the normal lifecycle.
*
* This prevents a double onExit call (one from dispatchExit, one from the
* view's update) and keeps exitSuggestion consistent with Escape-triggered
* exits.
*/
function dispatchExit({ view, pluginKeyRef }) {
	const tr = view.state.tr.setMeta(pluginKeyRef, { exit: true });
	view.dispatch(tr);
}
/**
* Creates the `props` object for the suggestion ProseMirror plugin.
* Contains `handleKeyDown` for keyboard handling and `decorations`
* for rendering the suggestion highlight.
*/
function createSuggestionProps({ pluginKey, decorationTag, decorationClass, decorationContent, decorationEmptyClass, renderer, dispatchExit }) {
	return {
		/**
		* Call the keydown hook if suggestion is active.
		*/
		handleKeyDown(view, event) {
			var _renderer$onKeyDown2;
			const state = pluginKey.getState(view.state);
			if (!state.active) return false;
			if (event.key === "Escape" || event.key === "Esc") {
				var _renderer$onKeyDown;
				renderer === null || renderer === void 0 || (_renderer$onKeyDown = renderer.onKeyDown) === null || _renderer$onKeyDown === void 0 || _renderer$onKeyDown.call(renderer, {
					view,
					event,
					range: state.range
				});
				dispatchExit(view);
				return true;
			}
			return (renderer === null || renderer === void 0 || (_renderer$onKeyDown2 = renderer.onKeyDown) === null || _renderer$onKeyDown2 === void 0 ? void 0 : _renderer$onKeyDown2.call(renderer, {
				view,
				event,
				range: state.range
			})) || false;
		},
		/**
		* Setup decorator on the currently active suggestion.
		*/
		decorations(state) {
			const { active, range, decorationId, query } = pluginKey.getState(state);
			if (!active) return null;
			const isEmpty = !(query === null || query === void 0 ? void 0 : query.length);
			const classNames = [decorationClass];
			if (isEmpty) classNames.push(decorationEmptyClass);
			return DecorationSet.create(state.doc, [Decoration.inline(range.from, range.to, {
				nodeName: decorationTag,
				class: classNames.join(" "),
				"data-decoration-id": decorationId || void 0,
				"data-decoration-content": decorationContent
			})]);
		}
	};
}
/**
* Creates the `state` object for the suggestion ProseMirror plugin.
* Contains `init()` and `apply()` for managing the plugin's internal state
* across transactions.
*/
function createSuggestionState({ editor, char, effectiveAllowSpaces, allowToIncludeChar, allowedPrefixes, startOfLine, findSuggestionMatch, allow, shouldShow, shouldKeepDismissed, pluginKey }) {
	return {
		/**
		* Initialize the plugin's internal state.
		*/
		init() {
			return {
				active: false,
				range: {
					from: 0,
					to: 0
				},
				query: null,
				text: null,
				composing: false,
				dismissedRange: null
			};
		},
		/**
		* Apply changes to the plugin state from a view transaction.
		*/
		apply(transaction, prev, _oldState, state) {
			const { isEditable } = editor;
			const { composing } = editor.view;
			const { selection } = transaction;
			const { empty, from } = selection;
			const next = { ...prev };
			const meta = transaction.getMeta(pluginKey);
			if (meta && meta.exit) {
				next.active = false;
				next.decorationId = null;
				next.range = {
					from: 0,
					to: 0
				};
				next.query = null;
				next.text = null;
				next.dismissedRange = prev.active ? { ...prev.range } : prev.dismissedRange;
				return next;
			}
			next.composing = composing;
			if (transaction.docChanged && next.dismissedRange !== null) next.dismissedRange = {
				from: transaction.mapping.map(next.dismissedRange.from),
				to: transaction.mapping.map(next.dismissedRange.to)
			};
			if (isEditable && (empty || editor.view.composing)) {
				if ((from < prev.range.from || from > prev.range.to) && !composing && !prev.composing) next.active = false;
				const match = findSuggestionMatch({
					char,
					allowSpaces: effectiveAllowSpaces,
					allowToIncludeChar,
					allowedPrefixes,
					startOfLine,
					$position: selection.$from
				});
				const decorationId = `id_${Math.floor(Math.random() * 4294967295)}`;
				if (match && allow({
					editor,
					state,
					range: match.range,
					isActive: prev.active
				}) && (!shouldShow || shouldShow({
					editor,
					range: match.range,
					query: match.query,
					text: match.text,
					transaction
				}))) {
					if (next.dismissedRange !== null && !shouldKeepDismissed({
						match,
						dismissedRange: next.dismissedRange,
						state,
						transaction
					})) next.dismissedRange = null;
					if (next.dismissedRange === null) {
						next.active = true;
						next.decorationId = prev.decorationId || decorationId;
						next.range = match.range;
						next.query = match.query;
						next.text = match.text;
					} else next.active = false;
				} else {
					if (!match) next.dismissedRange = null;
					next.active = false;
				}
			} else next.active = false;
			if (!next.active) {
				next.decorationId = null;
				next.range = {
					from: 0,
					to: 0
				};
				next.query = null;
				next.text = null;
			}
			return next;
		}
	};
}
function createSuggestionAsyncRequestManager({ editor, items }) {
	let abortController = null;
	let debounceTimer = null;
	let debounceResolve = null;
	const clearDebounceTimer = () => {
		if (debounceTimer !== null) {
			clearTimeout(debounceTimer);
			debounceTimer = null;
		}
		debounceResolve === null || debounceResolve === void 0 || debounceResolve();
		debounceResolve = null;
	};
	const waitForDebounce = (delay) => {
		return new Promise((resolve) => {
			debounceResolve = resolve;
			debounceTimer = setTimeout(() => {
				debounceTimer = null;
				const pendingResolve = debounceResolve;
				debounceResolve = null;
				pendingResolve === null || pendingResolve === void 0 || pendingResolve();
			}, delay);
		});
	};
	const abort = () => {
		abortController === null || abortController === void 0 || abortController.abort();
		clearDebounceTimer();
		abortController = null;
	};
	const fetch = async (query, debounce) => {
		abort();
		abortController = new AbortController();
		const controller = abortController;
		if (debounce > 0) await waitForDebounce(debounce);
		if (abortController !== controller || controller.signal.aborted) return { status: "aborted" };
		try {
			const result = await items({
				editor,
				query,
				signal: controller.signal
			});
			if (abortController !== controller || controller.signal.aborted) return { status: "aborted" };
			return {
				status: "resolved",
				items: result
			};
		} catch {
			if (abortController !== controller || controller.signal.aborted) return { status: "aborted" };
			return { status: "error" };
		}
	};
	return {
		abort,
		fetch
	};
}
function createSuggestionFloatingUiConfig({ placement, offset: offset$1, flip: flip$1, floatingUi }) {
	var _offset$mainAxis, _offset$crossAxis, _floatingUi$middlewar, _floatingUi$strategy;
	const middleware = [offset({
		mainAxis: (_offset$mainAxis = offset$1.mainAxis) !== null && _offset$mainAxis !== void 0 ? _offset$mainAxis : 4,
		crossAxis: (_offset$crossAxis = offset$1.crossAxis) !== null && _offset$crossAxis !== void 0 ? _offset$crossAxis : 0
	})];
	if (flip$1) middleware.push(flip());
	if (floatingUi === null || floatingUi === void 0 || (_floatingUi$middlewar = floatingUi.middleware) === null || _floatingUi$middlewar === void 0 ? void 0 : _floatingUi$middlewar.length) middleware.push(...floatingUi.middleware);
	return {
		placement,
		strategy: (_floatingUi$strategy = floatingUi === null || floatingUi === void 0 ? void 0 : floatingUi.strategy) !== null && _floatingUi$strategy !== void 0 ? _floatingUi$strategy : "absolute",
		middleware
	};
}
/**
* Resolves a container option (selector or element) to a mount target,
* falling back to `document.body` when it can't be resolved.
*/
function resolveContainer(container) {
	if (container instanceof HTMLElement) return container;
	if (typeof container === "string") try {
		const found = document.querySelector(container);
		if (found) return found;
	} catch {
		return document.body;
	}
	return document.body;
}
/**
* Builds the `mount` function handed to the renderer on `SuggestionProps`.
*
* Mounts the popup into the container, then wires Floating UI's `autoUpdate`
* against a virtual reference that re-reads the live cursor rect, so the popup
* stays anchored across scroll, resize, and layout shifts without the consumer
* attaching any listeners. The returned `unmount` tears all of that down.
*/
function createMount({ getReferenceRect, contextElement, config, container, dismissOnOutsideClick, dismiss }) {
	return (element, options = {}) => {
		const reference = {
			getBoundingClientRect: () => {
				var _getReferenceRect;
				return (_getReferenceRect = getReferenceRect()) !== null && _getReferenceRect !== void 0 ? _getReferenceRect : new DOMRect();
			},
			contextElement
		};
		let positioned = false;
		const mountedByUs = !element.isConnected;
		if (mountedByUs) resolveContainer(container).appendChild(element);
		if (!options.onPosition) {
			element.style.visibility = "hidden";
			element.style.width = "max-content";
		}
		const update = () => {
			computePosition(reference, element, {
				placement: config.placement,
				strategy: config.strategy,
				middleware: config.middleware
			}).then(({ x, y, placement, strategy }) => {
				if (options.onPosition) {
					options.onPosition({
						x,
						y,
						placement,
						strategy
					});
					return;
				}
				Object.assign(element.style, {
					position: strategy,
					left: `${x}px`,
					top: `${y}px`
				});
				if (!positioned) {
					positioned = true;
					element.style.visibility = "";
				}
			});
		};
		const cleanupAutoUpdate = autoUpdate(reference, element, update, options.autoUpdate);
		let onOutsidePointerDown;
		if (dismissOnOutsideClick) {
			onOutsidePointerDown = (event) => {
				const target = event.target;
				if (!(target instanceof Node) || element.contains(target) || contextElement.contains(target)) return;
				dismiss();
			};
			document.addEventListener("pointerdown", onOutsidePointerDown, true);
		}
		return () => {
			cleanupAutoUpdate();
			if (onOutsidePointerDown) document.removeEventListener("pointerdown", onOutsidePointerDown, true);
			if (mountedByUs) element.remove();
		};
	};
}
/**
* Creates the `view` object for the suggestion ProseMirror plugin.
*
* Manages the async lifecycle: tracks state transitions, calls renderer hooks,
* fetches items with debounce and AbortController support.
*
* 1. Tracks plugin state transitions (started, updated, stopped) to determine when to call renderer hooks.
* 2. Calls `onBeforeStart`, `onBeforeUpdate`, `onStart` before fetching to allow the renderer to prepare for first render
* 3. Manages async fetching of suggestion items with support for debouncing and aborting in-flight requests
* 4. Calls `onUpdate` after fetching new items to update the renderer with the latest data
* 5. At the end calls a final `onExit` or `onUpdate` to allow the renderer to clean up or finalize the state
*/
function createSuggestionView({ editor, pluginKey, items, renderer, minQueryLength, debounce, initialItems, placement, offset: offsetOption, container, flip, floatingUi, dismissOnOutsideClick, command, clientRectFor, dispatchExit }) {
	let props;
	const asyncRequest = createSuggestionAsyncRequestManager({
		editor,
		items
	});
	const floatingUiConfig = createSuggestionFloatingUiConfig({
		placement,
		offset: offsetOption,
		flip,
		floatingUi
	});
	function dispatchStateUpdate(state, dispatchProps) {
		switch (state) {
			case "started":
				var _renderer$onStart;
				renderer === null || renderer === void 0 || (_renderer$onStart = renderer.onStart) === null || _renderer$onStart === void 0 || _renderer$onStart.call(renderer, dispatchProps);
				break;
			case "updated":
				var _renderer$onUpdate;
				renderer === null || renderer === void 0 || (_renderer$onUpdate = renderer.onUpdate) === null || _renderer$onUpdate === void 0 || _renderer$onUpdate.call(renderer, dispatchProps);
				break;
			case "stopped":
				var _renderer$onExit;
				renderer === null || renderer === void 0 || (_renderer$onExit = renderer.onExit) === null || _renderer$onExit === void 0 || _renderer$onExit.call(renderer, dispatchProps);
		}
	}
	return {
		update: async (view, prevState) => {
			var _offsetOption$mainAxi, _offsetOption$crossAx;
			const prev = pluginKey.getState(prevState);
			const next = pluginKey.getState(view.state);
			if (!prev || !next) return;
			let currentState = null;
			const queryChanged = prev.query !== next.query;
			const textChanged = prev.text !== next.text;
			const rangeChanged = prev.range.from !== next.range.from || prev.range.to !== next.range.to;
			const effectiveQueryChanged = queryChanged || textChanged || rangeChanged;
			if (!prev.active && next.active) currentState = "started";
			else if (prev.active && !next.active) currentState = "stopped";
			else if (next.active && effectiveQueryChanged) currentState = "updated";
			else return;
			const state = currentState === "stopped" ? prev : next;
			const decorationNode = view.dom.querySelector(`[data-decoration-id="${state.decorationId}"]`);
			const clientRect = clientRectFor(view, decorationNode);
			const exceedsMinQueryLength = minQueryLength === 0 || (state.query ? state.query.length >= minQueryLength : false);
			const willFetch = (currentState === "started" || currentState === "updated") && exceedsMinQueryLength;
			props = {
				editor,
				range: state.range,
				query: state.query || "",
				text: state.text || "",
				items: initialItems !== null && initialItems !== void 0 ? initialItems : [],
				command: (commandProps) => {
					return command({
						editor,
						range: state.range,
						props: commandProps
					});
				},
				decorationNode,
				clientRect,
				loading: willFetch,
				placement,
				offset: {
					mainAxis: (_offsetOption$mainAxi = offsetOption.mainAxis) !== null && _offsetOption$mainAxi !== void 0 ? _offsetOption$mainAxi : 4,
					crossAxis: (_offsetOption$crossAx = offsetOption.crossAxis) !== null && _offsetOption$crossAx !== void 0 ? _offsetOption$crossAx : 0
				},
				container,
				flip,
				floatingUi: floatingUiConfig,
				mount: createMount({
					getReferenceRect: clientRect,
					contextElement: view.dom,
					config: floatingUiConfig,
					container,
					dismissOnOutsideClick,
					dismiss: () => dispatchExit(editor.view)
				})
			};
			if (currentState === "started") {
				var _renderer$onBeforeSta;
				renderer === null || renderer === void 0 || (_renderer$onBeforeSta = renderer.onBeforeStart) === null || _renderer$onBeforeSta === void 0 || _renderer$onBeforeSta.call(renderer, props);
			}
			if (currentState === "updated") {
				var _renderer$onBeforeUpd;
				renderer === null || renderer === void 0 || (_renderer$onBeforeUpd = renderer.onBeforeUpdate) === null || _renderer$onBeforeUpd === void 0 || _renderer$onBeforeUpd.call(renderer, props);
			}
			if (currentState === "started") dispatchStateUpdate(currentState, props);
			if (currentState === "started" || currentState === "updated") {
				if (!willFetch) {
					asyncRequest.abort();
					props = {
						...props,
						items: initialItems !== null && initialItems !== void 0 ? initialItems : [],
						loading: false
					};
				} else {
					props = {
						...props,
						items: initialItems !== null && initialItems !== void 0 ? initialItems : [],
						loading: true
					};
					currentState = "updated";
					dispatchStateUpdate(currentState, props);
					const result = await asyncRequest.fetch(state.query || "", debounce);
					if (result.status === "aborted") return;
					const currentPluginState = pluginKey.getState(view.state);
					if (!(currentPluginState === null || currentPluginState === void 0 ? void 0 : currentPluginState.active)) {
						asyncRequest.abort();
						return;
					}
					props = result.status === "resolved" ? {
						...props,
						items: result.items,
						loading: false
					} : {
						...props,
						loading: false
					};
				}
			}
			if (currentState === "stopped") {
				asyncRequest.abort();
				dispatchStateUpdate(currentState, props);
				props = void 0;
				return;
			}
			if (currentState === "updated") dispatchStateUpdate(currentState, props);
		},
		destroy: () => {
			var _renderer$onExit2;
			asyncRequest.abort();
			if (!props) return;
			renderer === null || renderer === void 0 || (_renderer$onExit2 = renderer.onExit) === null || _renderer$onExit2 === void 0 || _renderer$onExit2.call(renderer, props);
		}
	};
}
var SuggestionPluginKey = new PluginKey("suggestion");
/**
* This utility allows you to create suggestions.
* @see https://tiptap.dev/api/utilities/suggestion
*/
function Suggestion({ pluginKey = SuggestionPluginKey, editor, char = "@", allowSpaces = false, allowToIncludeChar = false, allowedPrefixes = [" "], startOfLine = false, decorationTag = "span", decorationClass = "suggestion", decorationContent = "", decorationEmptyClass = "is-empty", command = () => null, items = () => [], minQueryLength = 0, debounce = 0, initialItems, placement = "bottom-start", offset: offsetOption = {}, container, flip = true, floatingUi, dismissOnOutsideClick = true, render = () => ({}), allow = () => true, findSuggestionMatch: findSuggestionMatch$1 = findSuggestionMatch, shouldShow, shouldResetDismissed }) {
	const renderer = render === null || render === void 0 ? void 0 : render();
	const effectiveAllowSpaces = allowSpaces && !allowToIncludeChar;
	const clientRectFor$1 = (view, decorationNode) => clientRectFor(editor, view, decorationNode, pluginKey);
	function shouldKeepDismissed$1(props) {
		return shouldKeepDismissed({
			...props,
			editor,
			shouldResetDismissed,
			effectiveAllowSpaces
		});
	}
	const dispatchExit$1 = (view) => dispatchExit({
		view,
		pluginKeyRef: pluginKey
	});
	return new Plugin({
		key: pluginKey,
		view: () => createSuggestionView({
			editor,
			pluginKey,
			items,
			renderer,
			minQueryLength,
			debounce,
			initialItems,
			placement,
			offset: offsetOption,
			container,
			flip,
			floatingUi,
			dismissOnOutsideClick,
			command,
			clientRectFor: clientRectFor$1,
			dispatchExit: dispatchExit$1
		}),
		state: createSuggestionState({
			editor,
			char,
			effectiveAllowSpaces,
			allowToIncludeChar,
			allowedPrefixes,
			startOfLine,
			findSuggestionMatch: findSuggestionMatch$1,
			allow,
			shouldShow,
			shouldKeepDismissed: shouldKeepDismissed$1,
			pluginKey
		}),
		props: createSuggestionProps({
			pluginKey,
			decorationTag,
			decorationClass,
			decorationContent,
			decorationEmptyClass,
			renderer,
			dispatchExit: dispatchExit$1
		})
	});
}
/**
* Programmatically exit a suggestion plugin by dispatching a metadata-only
* transaction. This is the safe, recommended API to remove suggestion
* decorations without touching the document or causing mapping errors.
*/
function exitSuggestion(view, pluginKeyRef = SuggestionPluginKey) {
	const tr = view.state.tr.setMeta(pluginKeyRef, { exit: true });
	view.dispatch(tr);
}
var src_default = Suggestion;
export { Suggestion, SuggestionPluginKey, src_default as default, exitSuggestion, findSuggestionMatch };
