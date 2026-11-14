import { En as posToDOMRect, ln as isTextSelection, s as Extension, wt as getTextSerializersFromSchema, xt as getText } from "./dist-BgYMzsBB.js";
import { a as flip, d as size, i as computePosition, l as offset, n as autoPlacement, o as hide, s as inline, t as arrow, u as shift } from "./floating-ui.dom-BsrkDKcO.js";
import { a as PluginKey, i as Plugin, r as NodeSelection } from "./dist-CrIvfOQu.js";
import "./@tiptap_pm_state.js";
import { t as CellSelection } from "./tables-BQHYV5Ky.js";
import { Ft as onMounted, Kn as ref, Ot as nextTick, jt as onBeforeUnmount, nt as defineComponent, pt as h } from "./vue.runtime.esm-bundler-Bwv4pGxO.js";
// ../DnD helper/node_modules/@tiptap/extension-bubble-menu/dist/index.js
function combineDOMRects(rect1, rect2) {
	const top = Math.min(rect1.top, rect2.top);
	const bottom = Math.max(rect1.bottom, rect2.bottom);
	const left = Math.min(rect1.left, rect2.left);
	const width = Math.max(rect1.right, rect2.right) - left;
	const height = bottom - top;
	return new DOMRect(left, top, width, height);
}
var BubbleMenuView = class {
	get middlewares() {
		const middlewares = [];
		if (this.floatingUIOptions.flip) middlewares.push(flip(typeof this.floatingUIOptions.flip !== "boolean" ? this.floatingUIOptions.flip : void 0));
		if (this.floatingUIOptions.shift) middlewares.push(shift(typeof this.floatingUIOptions.shift !== "boolean" ? this.floatingUIOptions.shift : void 0));
		if (this.floatingUIOptions.offset) middlewares.push(offset(typeof this.floatingUIOptions.offset !== "boolean" ? this.floatingUIOptions.offset : void 0));
		if (this.floatingUIOptions.arrow) middlewares.push(arrow(this.floatingUIOptions.arrow));
		if (this.floatingUIOptions.size) middlewares.push(size(typeof this.floatingUIOptions.size !== "boolean" ? this.floatingUIOptions.size : void 0));
		if (this.floatingUIOptions.autoPlacement) middlewares.push(autoPlacement(typeof this.floatingUIOptions.autoPlacement !== "boolean" ? this.floatingUIOptions.autoPlacement : void 0));
		if (this.floatingUIOptions.hide) middlewares.push(hide(typeof this.floatingUIOptions.hide !== "boolean" ? this.floatingUIOptions.hide : void 0));
		if (this.floatingUIOptions.inline) middlewares.push(inline(typeof this.floatingUIOptions.inline !== "boolean" ? this.floatingUIOptions.inline : void 0));
		return middlewares;
	}
	get virtualElement() {
		var _this$getReferencedVi, _this$view;
		const { selection } = this.editor.state;
		const referencedVirtualElement = (_this$getReferencedVi = this.getReferencedVirtualElement) === null || _this$getReferencedVi === void 0 ? void 0 : _this$getReferencedVi.call(this);
		if (referencedVirtualElement) return referencedVirtualElement;
		if (!((_this$view = this.view) === null || _this$view === void 0 || (_this$view = _this$view.dom) === null || _this$view === void 0 ? void 0 : _this$view.parentNode)) return;
		const domRect = posToDOMRect(this.view, selection.from, selection.to);
		let virtualElement = {
			getBoundingClientRect: () => domRect,
			getClientRects: () => [domRect]
		};
		if (selection instanceof NodeSelection) {
			let node = this.view.nodeDOM(selection.from);
			const nodeViewWrapper = node.dataset.nodeViewWrapper ? node : node.querySelector("[data-node-view-wrapper]");
			if (nodeViewWrapper) node = nodeViewWrapper;
			if (node) virtualElement = {
				getBoundingClientRect: () => node.getBoundingClientRect(),
				getClientRects: () => [node.getBoundingClientRect()]
			};
		}
		if (selection instanceof CellSelection) {
			const { $anchorCell, $headCell } = selection;
			const from = $anchorCell ? $anchorCell.pos : $headCell.pos;
			const to = $headCell ? $headCell.pos : $anchorCell.pos;
			const fromDOM = this.view.nodeDOM(from);
			const toDOM = this.view.nodeDOM(to);
			if (!fromDOM || !toDOM) return;
			const clientRect = fromDOM === toDOM ? fromDOM.getBoundingClientRect() : combineDOMRects(fromDOM.getBoundingClientRect(), toDOM.getBoundingClientRect());
			virtualElement = {
				getBoundingClientRect: () => clientRect,
				getClientRects: () => [clientRect]
			};
		}
		return virtualElement;
	}
	constructor({ editor, element, view, pluginKey = "bubbleMenu", updateDelay = 250, resizeDelay = 60, shouldShow, appendTo, getReferencedVirtualElement, options }) {
		var _options$scrollTarget;
		this.preventHide = false;
		this.isVisible = false;
		this.scrollTarget = window;
		this.floatingUIOptions = {
			strategy: "absolute",
			placement: "top",
			offset: 8,
			flip: {},
			shift: {},
			arrow: false,
			size: false,
			autoPlacement: false,
			hide: false,
			inline: false,
			onShow: void 0,
			onHide: void 0,
			onUpdate: void 0,
			onDestroy: void 0
		};
		this.shouldShow = ({ view, state, from, to }) => {
			const { doc, selection } = state;
			const { empty } = selection;
			const isEmptyTextBlock = !doc.textBetween(from, to).length && isTextSelection(state.selection);
			const isChildOfMenu = this.element.contains(document.activeElement);
			if (!(view.hasFocus() || isChildOfMenu) || empty || isEmptyTextBlock || !this.editor.isEditable) return false;
			return true;
		};
		this.mousedownHandler = () => {
			this.preventHide = true;
		};
		this.dragstartHandler = () => {
			this.hide();
		};
		this.compositionEndHandler = () => {
			clearTimeout(this.compositionEndTimer);
			this.compositionEndTimer = window.setTimeout(() => {
				if (this.editor.isDestroyed) return;
				this.update(this.view);
			});
		};
		this.resizeHandler = () => {
			if (this.resizeDebounceTimer) clearTimeout(this.resizeDebounceTimer);
			this.resizeDebounceTimer = window.setTimeout(() => {
				this.updatePosition();
			}, this.resizeDelay);
		};
		this.focusHandler = () => {
			setTimeout(() => this.update(this.editor.view));
		};
		this.blurHandler = ({ event }) => {
			var _this$element$parentN;
			if (this.editor.isDestroyed) {
				this.destroy();
				return;
			}
			if (this.preventHide) {
				this.preventHide = false;
				return;
			}
			if ((event === null || event === void 0 ? void 0 : event.relatedTarget) && ((_this$element$parentN = this.element.parentNode) === null || _this$element$parentN === void 0 ? void 0 : _this$element$parentN.contains(event.relatedTarget))) return;
			if ((event === null || event === void 0 ? void 0 : event.relatedTarget) === this.editor.view.dom) return;
			this.hide();
		};
		this.handleDebouncedUpdate = (view, oldState) => {
			const selectionChanged = !(oldState === null || oldState === void 0 ? void 0 : oldState.selection.eq(view.state.selection));
			const docChanged = !(oldState === null || oldState === void 0 ? void 0 : oldState.doc.eq(view.state.doc));
			if (!selectionChanged && !docChanged) return;
			if (this.updateDebounceTimer) clearTimeout(this.updateDebounceTimer);
			this.updateDebounceTimer = window.setTimeout(() => {
				this.updateHandler(view, selectionChanged, docChanged, oldState);
			}, this.updateDelay);
		};
		this.updateHandler = (view, selectionChanged, docChanged, oldState) => {
			const { composing } = view;
			if (composing || !selectionChanged && !docChanged) return;
			if (!this.getShouldShow(oldState)) {
				this.hide();
				return;
			}
			this.show();
			this.updatePosition();
		};
		this.transactionHandler = ({ transaction: tr }) => {
			const meta = tr.getMeta(this.pluginKey);
			if (meta === "updatePosition") this.updatePosition();
			else if (meta && typeof meta === "object" && meta.type === "updateOptions") this.updateOptions(meta.options);
			else if (meta === "hide") this.hide();
			else if (meta === "show") {
				this.updatePosition();
				this.show();
			}
		};
		this.editor = editor;
		this.element = element;
		this.view = view;
		this.pluginKey = pluginKey;
		this.updateDelay = updateDelay;
		this.resizeDelay = resizeDelay;
		this.appendTo = appendTo;
		this.scrollTarget = (_options$scrollTarget = options === null || options === void 0 ? void 0 : options.scrollTarget) !== null && _options$scrollTarget !== void 0 ? _options$scrollTarget : window;
		this.getReferencedVirtualElement = getReferencedVirtualElement;
		this.floatingUIOptions = {
			...this.floatingUIOptions,
			...options
		};
		this.element.tabIndex = 0;
		if (shouldShow) this.shouldShow = shouldShow;
		this.element.addEventListener("mousedown", this.mousedownHandler, { capture: true });
		this.view.dom.addEventListener("dragstart", this.dragstartHandler);
		this.editor.on("focus", this.focusHandler);
		this.editor.on("blur", this.blurHandler);
		this.editor.on("transaction", this.transactionHandler);
		window.addEventListener("resize", this.resizeHandler);
		this.scrollTarget.addEventListener("scroll", this.resizeHandler);
		this.view.dom.addEventListener("compositionend", this.compositionEndHandler);
		this.update(view, view.state);
		if (this.getShouldShow()) {
			this.show();
			this.updatePosition();
		}
	}
	updatePosition() {
		if (!this.isVisible) return;
		const virtualElement = this.virtualElement;
		if (!virtualElement) return;
		computePosition(virtualElement, this.element, {
			placement: this.floatingUIOptions.placement,
			strategy: this.floatingUIOptions.strategy,
			middleware: this.middlewares
		}).then(({ x, y, strategy, middlewareData }) => {
			var _middlewareData$hide, _middlewareData$hide2;
			if (!this.isVisible || this.editor.isDestroyed || !this.element.isConnected) return;
			if (((_middlewareData$hide = middlewareData.hide) === null || _middlewareData$hide === void 0 ? void 0 : _middlewareData$hide.referenceHidden) || ((_middlewareData$hide2 = middlewareData.hide) === null || _middlewareData$hide2 === void 0 ? void 0 : _middlewareData$hide2.escaped)) {
				this.element.style.visibility = "hidden";
				return;
			}
			this.element.style.visibility = "visible";
			this.element.style.width = "max-content";
			this.element.style.position = strategy;
			this.element.style.left = `${x}px`;
			this.element.style.top = `${y}px`;
			if (this.isVisible && this.floatingUIOptions.onUpdate) this.floatingUIOptions.onUpdate();
		});
	}
	update(view, oldState) {
		const { state } = view;
		const hasValidSelection = state.selection.from !== state.selection.to;
		if (this.updateDelay > 0 && hasValidSelection) {
			this.handleDebouncedUpdate(view, oldState);
			return;
		}
		const selectionChanged = !(oldState === null || oldState === void 0 ? void 0 : oldState.selection.eq(view.state.selection));
		const docChanged = !(oldState === null || oldState === void 0 ? void 0 : oldState.doc.eq(view.state.doc));
		this.updateHandler(view, selectionChanged, docChanged, oldState);
	}
	getShouldShow(oldState) {
		var _this$shouldShow;
		const { state } = this.view;
		const { selection } = state;
		const { ranges } = selection;
		const from = Math.min(...ranges.map((range) => range.$from.pos));
		const to = Math.max(...ranges.map((range) => range.$to.pos));
		return ((_this$shouldShow = this.shouldShow) === null || _this$shouldShow === void 0 ? void 0 : _this$shouldShow.call(this, {
			editor: this.editor,
			element: this.element,
			view: this.view,
			state,
			oldState,
			from,
			to
		})) || false;
	}
	show() {
		var _ref;
		if (this.isVisible) return;
		this.element.style.visibility = "visible";
		this.element.style.opacity = "1";
		const appendToElement = typeof this.appendTo === "function" ? this.appendTo() : this.appendTo;
		(_ref = appendToElement !== null && appendToElement !== void 0 ? appendToElement : this.view.dom.parentElement) === null || _ref === void 0 || _ref.appendChild(this.element);
		if (this.floatingUIOptions.onShow) this.floatingUIOptions.onShow();
		this.isVisible = true;
	}
	hide() {
		if (!this.isVisible) return;
		this.element.style.visibility = "hidden";
		this.element.style.opacity = "0";
		this.element.remove();
		if (this.floatingUIOptions.onHide) this.floatingUIOptions.onHide();
		this.isVisible = false;
	}
	updateOptions(newProps) {
		if (newProps.updateDelay !== void 0) this.updateDelay = newProps.updateDelay;
		if (newProps.resizeDelay !== void 0) this.resizeDelay = newProps.resizeDelay;
		if (newProps.appendTo !== void 0) this.appendTo = newProps.appendTo;
		if (newProps.getReferencedVirtualElement !== void 0) this.getReferencedVirtualElement = newProps.getReferencedVirtualElement;
		if (newProps.shouldShow !== void 0) {
			if (newProps.shouldShow) this.shouldShow = newProps.shouldShow;
		}
		if (newProps.options !== void 0) {
			var _newProps$options$scr;
			const newScrollTarget = (_newProps$options$scr = newProps.options.scrollTarget) !== null && _newProps$options$scr !== void 0 ? _newProps$options$scr : window;
			if (newScrollTarget !== this.scrollTarget) {
				this.scrollTarget.removeEventListener("scroll", this.resizeHandler);
				this.scrollTarget = newScrollTarget;
				this.scrollTarget.addEventListener("scroll", this.resizeHandler);
			}
			this.floatingUIOptions = {
				...this.floatingUIOptions,
				...newProps.options
			};
		}
	}
	destroy() {
		this.hide();
		this.element.removeEventListener("mousedown", this.mousedownHandler, { capture: true });
		this.view.dom.removeEventListener("dragstart", this.dragstartHandler);
		window.removeEventListener("resize", this.resizeHandler);
		this.scrollTarget.removeEventListener("scroll", this.resizeHandler);
		this.editor.off("focus", this.focusHandler);
		this.editor.off("blur", this.blurHandler);
		this.editor.off("transaction", this.transactionHandler);
		this.view.dom.removeEventListener("compositionend", this.compositionEndHandler);
		clearTimeout(this.compositionEndTimer);
		clearTimeout(this.updateDebounceTimer);
		if (this.floatingUIOptions.onDestroy) this.floatingUIOptions.onDestroy();
	}
};
var BubbleMenuPlugin = (options) => {
	return new Plugin({
		key: typeof options.pluginKey === "string" ? new PluginKey(options.pluginKey) : options.pluginKey,
		view: (view) => new BubbleMenuView({
			view,
			...options
		})
	});
};
Extension.create({
	name: "bubbleMenu",
	addOptions() {
		return {
			element: null,
			pluginKey: "bubbleMenu",
			updateDelay: void 0,
			appendTo: void 0,
			shouldShow: null
		};
	},
	addProseMirrorPlugins() {
		if (!this.options.element) return [];
		return [BubbleMenuPlugin({
			pluginKey: this.options.pluginKey,
			editor: this.editor,
			element: this.options.element,
			updateDelay: this.options.updateDelay,
			options: this.options.options,
			appendTo: this.options.appendTo,
			getReferencedVirtualElement: this.options.getReferencedVirtualElement,
			shouldShow: this.options.shouldShow
		})];
	}
});
// ../DnD helper/node_modules/@tiptap/extension-floating-menu/dist/index.js
var FloatingMenuView = class {
	getTextContent(node) {
		return getText(node, { textSerializers: getTextSerializersFromSchema(this.editor.schema) });
	}
	get middlewares() {
		const middlewares = [];
		if (this.floatingUIOptions.flip) middlewares.push(flip(typeof this.floatingUIOptions.flip !== "boolean" ? this.floatingUIOptions.flip : void 0));
		if (this.floatingUIOptions.shift) middlewares.push(shift(typeof this.floatingUIOptions.shift !== "boolean" ? this.floatingUIOptions.shift : void 0));
		if (this.floatingUIOptions.offset) middlewares.push(offset(typeof this.floatingUIOptions.offset !== "boolean" ? this.floatingUIOptions.offset : void 0));
		if (this.floatingUIOptions.arrow) middlewares.push(arrow(this.floatingUIOptions.arrow));
		if (this.floatingUIOptions.size) middlewares.push(size(typeof this.floatingUIOptions.size !== "boolean" ? this.floatingUIOptions.size : void 0));
		if (this.floatingUIOptions.autoPlacement) middlewares.push(autoPlacement(typeof this.floatingUIOptions.autoPlacement !== "boolean" ? this.floatingUIOptions.autoPlacement : void 0));
		if (this.floatingUIOptions.hide) middlewares.push(hide(typeof this.floatingUIOptions.hide !== "boolean" ? this.floatingUIOptions.hide : void 0));
		if (this.floatingUIOptions.inline) middlewares.push(inline(typeof this.floatingUIOptions.inline !== "boolean" ? this.floatingUIOptions.inline : void 0));
		return middlewares;
	}
	constructor({ editor, element, view, pluginKey = "floatingMenu", updateDelay = 250, resizeDelay = 60, options, appendTo, shouldShow }) {
		var _options$scrollTarget;
		this.preventHide = false;
		this.isVisible = false;
		this.scrollTarget = window;
		this.shouldShow = ({ view, state }) => {
			const { selection } = state;
			const { $anchor, empty } = selection;
			const isRootDepth = $anchor.depth === 1;
			const isEmptyTextBlock = $anchor.parent.isTextblock && !$anchor.parent.type.spec.code && !$anchor.parent.textContent && $anchor.parent.childCount === 0 && !this.getTextContent($anchor.parent);
			if (!view.hasFocus() || !empty || !isRootDepth || !isEmptyTextBlock || !this.editor.isEditable) return false;
			return true;
		};
		this.floatingUIOptions = {
			strategy: "absolute",
			placement: "right",
			offset: 8,
			flip: {},
			shift: {},
			arrow: false,
			size: false,
			autoPlacement: false,
			hide: false,
			inline: false
		};
		this.updateHandler = (view, selectionChanged, docChanged, oldState) => {
			const { composing } = view;
			if (composing || !selectionChanged && !docChanged) return;
			if (!this.getShouldShow(oldState)) {
				this.hide();
				return;
			}
			this.updatePosition();
			this.show();
		};
		this.mousedownHandler = () => {
			this.preventHide = true;
		};
		this.compositionEndHandler = () => {
			clearTimeout(this.compositionEndTimer);
			this.compositionEndTimer = window.setTimeout(() => {
				if (this.editor.isDestroyed) return;
				this.update(this.view);
			});
		};
		this.focusHandler = () => {
			setTimeout(() => this.update(this.editor.view));
		};
		this.blurHandler = ({ event }) => {
			var _this$element$parentN;
			if (this.preventHide) {
				this.preventHide = false;
				return;
			}
			if ((event === null || event === void 0 ? void 0 : event.relatedTarget) && ((_this$element$parentN = this.element.parentNode) === null || _this$element$parentN === void 0 ? void 0 : _this$element$parentN.contains(event.relatedTarget))) return;
			if ((event === null || event === void 0 ? void 0 : event.relatedTarget) === this.editor.view.dom) return;
			this.hide();
		};
		this.transactionHandler = ({ transaction: tr }) => {
			const meta = tr.getMeta(this.pluginKey);
			if (meta === "updatePosition") this.updatePosition();
			else if (meta && typeof meta === "object" && meta.type === "updateOptions") this.updateOptions(meta.options);
			else if (meta === "hide") this.hide();
			else if (meta === "show") {
				this.updatePosition();
				this.show();
			}
		};
		this.resizeHandler = () => {
			if (this.resizeDebounceTimer) clearTimeout(this.resizeDebounceTimer);
			this.resizeDebounceTimer = window.setTimeout(() => {
				this.updatePosition();
			}, this.resizeDelay);
		};
		this.editor = editor;
		this.element = element;
		this.view = view;
		this.pluginKey = pluginKey;
		this.updateDelay = updateDelay;
		this.resizeDelay = resizeDelay;
		this.appendTo = appendTo;
		this.scrollTarget = (_options$scrollTarget = options === null || options === void 0 ? void 0 : options.scrollTarget) !== null && _options$scrollTarget !== void 0 ? _options$scrollTarget : window;
		this.floatingUIOptions = {
			...this.floatingUIOptions,
			...options
		};
		this.element.tabIndex = 0;
		if (shouldShow) this.shouldShow = shouldShow;
		this.element.addEventListener("mousedown", this.mousedownHandler, { capture: true });
		this.editor.on("focus", this.focusHandler);
		this.editor.on("blur", this.blurHandler);
		this.editor.on("transaction", this.transactionHandler);
		window.addEventListener("resize", this.resizeHandler);
		this.scrollTarget.addEventListener("scroll", this.resizeHandler);
		this.view.dom.addEventListener("compositionend", this.compositionEndHandler);
		this.update(view, view.state);
		if (this.getShouldShow()) {
			this.show();
			this.updatePosition();
		}
	}
	getShouldShow(oldState) {
		var _this$shouldShow;
		const { state } = this.view;
		const { selection } = state;
		const { ranges } = selection;
		const from = Math.min(...ranges.map((range) => range.$from.pos));
		const to = Math.max(...ranges.map((range) => range.$to.pos));
		return (_this$shouldShow = this.shouldShow) === null || _this$shouldShow === void 0 ? void 0 : _this$shouldShow.call(this, {
			editor: this.editor,
			view: this.view,
			state,
			oldState,
			from,
			to
		});
	}
	updateOptions(newProps) {
		if (newProps.updateDelay !== void 0) this.updateDelay = newProps.updateDelay;
		if (newProps.resizeDelay !== void 0) this.resizeDelay = newProps.resizeDelay;
		if (newProps.appendTo !== void 0) this.appendTo = newProps.appendTo;
		if (newProps.shouldShow !== void 0) {
			if (newProps.shouldShow) this.shouldShow = newProps.shouldShow;
		}
		if (newProps.options !== void 0) {
			var _newProps$options$scr;
			const newScrollTarget = (_newProps$options$scr = newProps.options.scrollTarget) !== null && _newProps$options$scr !== void 0 ? _newProps$options$scr : window;
			if (newScrollTarget !== this.scrollTarget) {
				this.scrollTarget.removeEventListener("scroll", this.resizeHandler);
				this.scrollTarget = newScrollTarget;
				this.scrollTarget.addEventListener("scroll", this.resizeHandler);
			}
			this.floatingUIOptions = {
				...this.floatingUIOptions,
				...newProps.options
			};
		}
	}
	updatePosition() {
		var _this$view;
		if (!((_this$view = this.view) === null || _this$view === void 0 || (_this$view = _this$view.dom) === null || _this$view === void 0 ? void 0 : _this$view.parentNode)) return;
		const { selection } = this.editor.state;
		const domRect = posToDOMRect(this.view, selection.from, selection.to);
		computePosition({
			getBoundingClientRect: () => domRect,
			getClientRects: () => [domRect]
		}, this.element, {
			placement: this.floatingUIOptions.placement,
			strategy: this.floatingUIOptions.strategy,
			middleware: this.middlewares
		}).then(({ x, y, strategy, middlewareData }) => {
			var _middlewareData$hide, _middlewareData$hide2;
			if (((_middlewareData$hide = middlewareData.hide) === null || _middlewareData$hide === void 0 ? void 0 : _middlewareData$hide.referenceHidden) || ((_middlewareData$hide2 = middlewareData.hide) === null || _middlewareData$hide2 === void 0 ? void 0 : _middlewareData$hide2.escaped)) {
				this.element.style.visibility = "hidden";
				return;
			}
			this.element.style.visibility = "visible";
			this.element.style.width = "max-content";
			this.element.style.position = strategy;
			this.element.style.left = `${x}px`;
			this.element.style.top = `${y}px`;
			if (this.isVisible && this.floatingUIOptions.onUpdate) this.floatingUIOptions.onUpdate();
		});
	}
	update(view, oldState) {
		const selectionChanged = !(oldState === null || oldState === void 0 ? void 0 : oldState.selection.eq(view.state.selection));
		const docChanged = !(oldState === null || oldState === void 0 ? void 0 : oldState.doc.eq(view.state.doc));
		this.updateHandler(view, selectionChanged, docChanged, oldState);
	}
	show() {
		var _ref;
		if (this.isVisible) return;
		this.element.style.visibility = "visible";
		this.element.style.opacity = "1";
		const appendToElement = typeof this.appendTo === "function" ? this.appendTo() : this.appendTo;
		(_ref = appendToElement !== null && appendToElement !== void 0 ? appendToElement : this.view.dom.parentElement) === null || _ref === void 0 || _ref.appendChild(this.element);
		if (this.floatingUIOptions.onShow) this.floatingUIOptions.onShow();
		this.isVisible = true;
	}
	hide() {
		if (!this.isVisible) return;
		this.element.style.visibility = "hidden";
		this.element.style.opacity = "0";
		this.element.remove();
		if (this.floatingUIOptions.onHide) this.floatingUIOptions.onHide();
		this.isVisible = false;
	}
	destroy() {
		this.hide();
		this.element.removeEventListener("mousedown", this.mousedownHandler, { capture: true });
		window.removeEventListener("resize", this.resizeHandler);
		this.scrollTarget.removeEventListener("scroll", this.resizeHandler);
		this.editor.off("focus", this.focusHandler);
		this.editor.off("blur", this.blurHandler);
		this.editor.off("transaction", this.transactionHandler);
		this.view.dom.removeEventListener("compositionend", this.compositionEndHandler);
		clearTimeout(this.compositionEndTimer);
		if (this.floatingUIOptions.onDestroy) this.floatingUIOptions.onDestroy();
	}
};
var FloatingMenuPlugin = (options) => {
	return new Plugin({
		key: typeof options.pluginKey === "string" ? new PluginKey(options.pluginKey) : options.pluginKey,
		view: (view) => new FloatingMenuView({
			view,
			...options
		})
	});
};
Extension.create({
	name: "floatingMenu",
	addOptions() {
		return {
			element: null,
			options: {},
			pluginKey: "floatingMenu",
			updateDelay: void 0,
			resizeDelay: void 0,
			appendTo: void 0,
			shouldShow: null
		};
	},
	addCommands() {
		return { updateFloatingMenuPosition: () => ({ tr, dispatch }) => {
			if (dispatch) tr.setMeta(this.options.pluginKey, "updatePosition");
			return true;
		} };
	},
	addProseMirrorPlugins() {
		if (!this.options.element) return [];
		return [FloatingMenuPlugin({
			pluginKey: this.options.pluginKey,
			editor: this.editor,
			element: this.options.element,
			updateDelay: this.options.updateDelay,
			resizeDelay: this.options.resizeDelay,
			options: this.options.options,
			appendTo: this.options.appendTo,
			shouldShow: this.options.shouldShow
		})];
	}
});
// ../DnD helper/node_modules/@tiptap/vue-3/dist/menus/index.js
var BubbleMenu = defineComponent({
	name: "BubbleMenu",
	inheritAttrs: false,
	props: {
		pluginKey: {
			type: [String, Object],
			default: void 0
		},
		editor: {
			type: Object,
			required: true
		},
		updateDelay: {
			type: Number,
			default: void 0
		},
		resizeDelay: {
			type: Number,
			default: void 0
		},
		options: {
			type: Object,
			default: () => ({})
		},
		appendTo: {
			type: [Object, Function],
			default: void 0
		},
		shouldShow: {
			type: Function,
			default: null
		},
		getReferencedVirtualElement: {
			type: Function,
			default: void 0
		}
	},
	setup(props, { slots, attrs }) {
		var _props$pluginKey;
		const root = ref(null);
		const resolvedPluginKey = (_props$pluginKey = props.pluginKey) !== null && _props$pluginKey !== void 0 ? _props$pluginKey : new PluginKey("bubbleMenu");
		onMounted(() => {
			const { editor, options, resizeDelay, appendTo, shouldShow, getReferencedVirtualElement, updateDelay } = props;
			const el = root.value;
			if (!el) return;
			el.style.visibility = "hidden";
			el.style.position = "absolute";
			el.remove();
			nextTick(() => {
				editor.registerPlugin(BubbleMenuPlugin({
					editor,
					element: el,
					options,
					pluginKey: resolvedPluginKey,
					resizeDelay,
					appendTo,
					shouldShow,
					getReferencedVirtualElement,
					updateDelay
				}));
			});
		});
		onBeforeUnmount(() => {
			const { editor } = props;
			editor.unregisterPlugin(resolvedPluginKey);
		});
		return () => {
			var _slots$default;
			return h("div", {
				ref: root,
				...attrs
			}, (_slots$default = slots.default) === null || _slots$default === void 0 ? void 0 : _slots$default.call(slots));
		};
	}
});
var FloatingMenu = defineComponent({
	name: "FloatingMenu",
	inheritAttrs: false,
	props: {
		pluginKey: {
			type: null,
			default: void 0
		},
		editor: {
			type: Object,
			required: true
		},
		updateDelay: {
			type: Number,
			default: void 0
		},
		resizeDelay: {
			type: Number,
			default: void 0
		},
		options: {
			type: Object,
			default: () => ({})
		},
		appendTo: {
			type: [Object, Function],
			default: void 0
		},
		shouldShow: {
			type: Function,
			default: null
		}
	},
	setup(props, { slots, attrs }) {
		var _props$pluginKey;
		const root = ref(null);
		const resolvedPluginKey = (_props$pluginKey = props.pluginKey) !== null && _props$pluginKey !== void 0 ? _props$pluginKey : new PluginKey("floatingMenu");
		onMounted(() => {
			const { editor, updateDelay, resizeDelay, options, appendTo, shouldShow } = props;
			const el = root.value;
			if (!el) return;
			el.style.visibility = "hidden";
			el.style.position = "absolute";
			el.remove();
			editor.registerPlugin(FloatingMenuPlugin({
				pluginKey: resolvedPluginKey,
				editor,
				element: el,
				updateDelay,
				resizeDelay,
				options,
				appendTo,
				shouldShow
			}));
		});
		onBeforeUnmount(() => {
			const { editor } = props;
			editor.unregisterPlugin(resolvedPluginKey);
		});
		return () => {
			var _slots$default;
			return h("div", {
				ref: root,
				...attrs
			}, (_slots$default = slots.default) === null || _slots$default === void 0 ? void 0 : _slots$default.call(slots));
		};
	}
});
export { BubbleMenu, FloatingMenu };
