import { Gn as keydownHandler, Ht as isNodeSelection, Un as redo, Vn as history, Vt as isNodeEmpty, Wn as undo, it as getExtensionField, nt as getChangedRanges, s as Extension, w as callOrReturn } from "./dist-BgYMzsBB.js";
import "./@tiptap_pm_state.js";
import { a as PluginKey, c as TextSelection, i as Plugin, o as Selection$1, r as NodeSelection } from "./dist-CrIvfOQu.js";
import { v as dropPoint } from "./dist-DMR5aO-v.js";
import { Decoration, DecorationSet } from "./@tiptap_pm_view.js";
import { i as Fragment, p as Slice } from "./dist-CL9j1usr.js";
// ../DnD helper/node_modules/prosemirror-dropcursor/dist/index.js
/**
Create a plugin that, when added to a ProseMirror instance,
causes a decoration to show up at the drop position when something
is dragged over the editor.

Nodes may add a `disableDropCursor` property to their spec to
control the showing of a drop cursor inside them. This may be a
boolean or a function, which will be called with a view and a
position, and should return a boolean.
*/
function dropCursor(options = {}) {
	return new Plugin({ view(editorView) {
		return new DropCursorView(editorView, options);
	} });
}
var DropCursorView = class {
	constructor(editorView, options) {
		var _a;
		this.editorView = editorView;
		this.cursorPos = null;
		this.element = null;
		this.timeout = -1;
		this.lastDragEvent = null;
		this.width = (_a = options.width) !== null && _a !== void 0 ? _a : 1;
		this.color = options.color === false ? void 0 : options.color || "black";
		this.class = options.class;
		this.handlers = [
			"dragover",
			"dragend",
			"drop",
			"dragleave"
		].map((name) => {
			let handler = (e) => {
				this[name](e);
			};
			editorView.dom.addEventListener(name, handler);
			return {
				name,
				handler
			};
		});
	}
	destroy() {
		this.setCursor(null);
		this.handlers.forEach(({ name, handler }) => this.editorView.dom.removeEventListener(name, handler));
	}
	update(editorView, prevState) {
		if (this.cursorPos != null && prevState.doc != editorView.state.doc) {
			if (this.lastDragEvent) {
				let target = this.computeTarget(this.lastDragEvent);
				if (target == this.cursorPos) this.updateOverlay();
				else this.setCursor(target);
			} else this.updateOverlay();
		}
	}
	setCursor(pos) {
		if (pos == this.cursorPos) return;
		this.cursorPos = pos;
		if (pos == null) {
			this.element.parentNode.removeChild(this.element);
			this.element = null;
		} else this.updateOverlay();
	}
	updateOverlay() {
		let $pos = this.editorView.state.doc.resolve(this.cursorPos);
		let isBlock = !$pos.parent.inlineContent, rect;
		let editorDOM = this.editorView.dom, editorRect = editorDOM.getBoundingClientRect();
		let scaleX = editorRect.width / editorDOM.offsetWidth, scaleY = editorRect.height / editorDOM.offsetHeight;
		if (isBlock) {
			let before = $pos.nodeBefore, after = $pos.nodeAfter;
			if (before || after) {
				let node = this.editorView.nodeDOM(this.cursorPos - (before ? before.nodeSize : 0));
				if (node) {
					let nodeRect = node.getBoundingClientRect();
					let top = before ? nodeRect.bottom : nodeRect.top;
					if (before && after) top = (top + this.editorView.nodeDOM(this.cursorPos).getBoundingClientRect().top) / 2;
					let halfWidth = this.width / 2 * scaleY;
					rect = {
						left: nodeRect.left,
						right: nodeRect.right,
						top: top - halfWidth,
						bottom: top + halfWidth
					};
				}
			}
		}
		if (!rect) {
			let coords = this.editorView.coordsAtPos(this.cursorPos);
			let halfWidth = this.width / 2 * scaleX;
			rect = {
				left: coords.left - halfWidth,
				right: coords.left + halfWidth,
				top: coords.top,
				bottom: coords.bottom
			};
		}
		let parent = this.editorView.dom.offsetParent;
		if (!this.element) {
			this.element = parent.appendChild(document.createElement("div"));
			if (this.class) this.element.className = this.class;
			this.element.style.cssText = "position: absolute; z-index: 50; pointer-events: none;";
			if (this.color) this.element.style.backgroundColor = this.color;
		}
		this.element.classList.toggle("prosemirror-dropcursor-block", isBlock);
		this.element.classList.toggle("prosemirror-dropcursor-inline", !isBlock);
		let parentLeft, parentTop;
		if (!parent || parent == document.body && getComputedStyle(parent).position == "static") {
			parentLeft = -pageXOffset;
			parentTop = -pageYOffset;
		} else {
			let rect = parent.getBoundingClientRect();
			let parentScaleX = rect.width / parent.offsetWidth, parentScaleY = rect.height / parent.offsetHeight;
			parentLeft = rect.left - parent.scrollLeft * parentScaleX;
			parentTop = rect.top - parent.scrollTop * parentScaleY;
		}
		this.element.style.left = (rect.left - parentLeft) / scaleX + "px";
		this.element.style.top = (rect.top - parentTop) / scaleY + "px";
		this.element.style.width = (rect.right - rect.left) / scaleX + "px";
		this.element.style.height = (rect.bottom - rect.top) / scaleY + "px";
	}
	scheduleRemoval(timeout) {
		clearTimeout(this.timeout);
		this.timeout = setTimeout(() => this.setCursor(null), timeout);
	}
	computeTarget(event) {
		let pos = this.editorView.posAtCoords({
			left: event.clientX,
			top: event.clientY
		});
		let node = pos && pos.inside >= 0 && this.editorView.state.doc.nodeAt(pos.inside);
		let disableDropCursor = node && node.type.spec.disableDropCursor;
		let disabled = typeof disableDropCursor == "function" ? disableDropCursor(this.editorView, pos, event) : disableDropCursor;
		if (!pos || disabled) return null;
		let target = pos.pos;
		if (this.editorView.dragging && this.editorView.dragging.slice) {
			let point = dropPoint(this.editorView.state.doc, target, this.editorView.dragging.slice);
			if (point != null) target = point;
		}
		return target;
	}
	dragover(event) {
		if (!this.editorView.editable) return;
		this.lastDragEvent = event;
		let target = this.computeTarget(event);
		if (target != null) {
			this.setCursor(target);
			this.scheduleRemoval(5e3);
		}
	}
	dragend() {
		this.scheduleRemoval(20);
	}
	drop() {
		this.scheduleRemoval(20);
	}
	dragleave(event) {
		if (!this.editorView.dom.contains(event.relatedTarget)) this.setCursor(null);
	}
};
// ../DnD helper/node_modules/prosemirror-gapcursor/dist/index.js
/**
Gap cursor selections are represented using this class. Its
`$anchor` and `$head` properties both point at the cursor position.
*/
var GapCursor = class GapCursor extends Selection$1 {
	/**
	Create a gap cursor.
	*/
	constructor($pos) {
		super($pos, $pos);
	}
	map(doc, mapping) {
		let $pos = doc.resolve(mapping.map(this.head));
		return GapCursor.valid($pos) ? new GapCursor($pos) : Selection$1.near($pos);
	}
	content() {
		return Slice.empty;
	}
	eq(other) {
		return other instanceof GapCursor && other.head == this.head;
	}
	toJSON() {
		return {
			type: "gapcursor",
			pos: this.head
		};
	}
	/**
	@internal
	*/
	static fromJSON(doc, json) {
		if (typeof json.pos != "number") throw new RangeError("Invalid input for GapCursor.fromJSON");
		return new GapCursor(doc.resolve(json.pos));
	}
	/**
	@internal
	*/
	getBookmark() {
		return new GapBookmark(this.anchor);
	}
	/**
	@internal
	*/
	static valid($pos) {
		let parent = $pos.parent;
		if (parent.inlineContent || !closedBefore($pos) || !closedAfter($pos)) return false;
		let override = parent.type.spec.allowGapCursor;
		if (override != null) return override;
		let deflt = parent.contentMatchAt($pos.index()).defaultType;
		return deflt && deflt.isTextblock;
	}
	/**
	@internal
	*/
	static findGapCursorFrom($pos, dir, mustMove = false) {
		search: for (;;) {
			if (!mustMove && GapCursor.valid($pos)) return $pos;
			let pos = $pos.pos, next = null;
			for (let d = $pos.depth;; d--) {
				let parent = $pos.node(d);
				if (dir > 0 ? $pos.indexAfter(d) < parent.childCount : $pos.index(d) > 0) {
					next = parent.child(dir > 0 ? $pos.indexAfter(d) : $pos.index(d) - 1);
					break;
				} else if (d == 0) return null;
				pos += dir;
				let $cur = $pos.doc.resolve(pos);
				if (GapCursor.valid($cur)) return $cur;
			}
			for (;;) {
				let inside = dir > 0 ? next.firstChild : next.lastChild;
				if (!inside) {
					if (next.isAtom && !next.isText && !NodeSelection.isSelectable(next)) {
						$pos = $pos.doc.resolve(pos + next.nodeSize * dir);
						mustMove = false;
						continue search;
					}
					break;
				}
				next = inside;
				pos += dir;
				let $cur = $pos.doc.resolve(pos);
				if (GapCursor.valid($cur)) return $cur;
			}
			return null;
		}
	}
};
GapCursor.prototype.visible = false;
GapCursor.findFrom = GapCursor.findGapCursorFrom;
Selection$1.jsonID("gapcursor", GapCursor);
var GapBookmark = class GapBookmark {
	constructor(pos) {
		this.pos = pos;
	}
	map(mapping) {
		return new GapBookmark(mapping.map(this.pos));
	}
	resolve(doc) {
		let $pos = doc.resolve(this.pos);
		return GapCursor.valid($pos) ? new GapCursor($pos) : Selection$1.near($pos);
	}
};
function needsGap(type) {
	return type.isAtom || type.spec.isolating || type.spec.createGapCursor;
}
function closedBefore($pos) {
	for (let d = $pos.depth; d >= 0; d--) {
		let index = $pos.index(d), parent = $pos.node(d);
		if (index == 0) {
			if (parent.type.spec.isolating) return true;
			continue;
		}
		for (let before = parent.child(index - 1);; before = before.lastChild) {
			if (before.childCount == 0 && !before.inlineContent || needsGap(before.type)) return true;
			if (before.inlineContent) return false;
		}
	}
	return true;
}
function closedAfter($pos) {
	for (let d = $pos.depth; d >= 0; d--) {
		let index = $pos.indexAfter(d), parent = $pos.node(d);
		if (index == parent.childCount) {
			if (parent.type.spec.isolating) return true;
			continue;
		}
		for (let after = parent.child(index);; after = after.firstChild) {
			if (after.childCount == 0 && !after.inlineContent || needsGap(after.type)) return true;
			if (after.inlineContent) return false;
		}
	}
	return true;
}
/**
Create a gap cursor plugin. When enabled, this will capture clicks
near and arrow-key-motion past places that don't have a normally
selectable position nearby, and create a gap cursor selection for
them. The cursor is drawn as an element with class
`ProseMirror-gapcursor`. You can either include
`style/gapcursor.css` from the package's directory or add your own
styles to make it visible.
*/
function gapCursor() {
	return new Plugin({ props: {
		decorations: drawGapCursor,
		createSelectionBetween(_view, $anchor, $head) {
			return $anchor.pos == $head.pos && GapCursor.valid($head) ? new GapCursor($head) : null;
		},
		handleClick,
		handleKeyDown,
		handleDOMEvents: { beforeinput }
	} });
}
var handleKeyDown = keydownHandler({
	"ArrowLeft": arrow("horiz", -1),
	"ArrowRight": arrow("horiz", 1),
	"ArrowUp": arrow("vert", -1),
	"ArrowDown": arrow("vert", 1)
});
function arrow(axis, dir) {
	const dirStr = axis == "vert" ? dir > 0 ? "down" : "up" : dir > 0 ? "right" : "left";
	return function(state, dispatch, view) {
		let sel = state.selection;
		let $start = dir > 0 ? sel.$to : sel.$from, mustMove = sel.empty;
		if (sel instanceof TextSelection) {
			if (!view.endOfTextblock(dirStr) || $start.depth == 0) return false;
			mustMove = false;
			$start = state.doc.resolve(dir > 0 ? $start.after() : $start.before());
		}
		let $found = GapCursor.findGapCursorFrom($start, dir, mustMove);
		if (!$found) return false;
		if (dispatch) dispatch(state.tr.setSelection(new GapCursor($found)));
		return true;
	};
}
function handleClick(view, pos, event) {
	if (!view || !view.editable) return false;
	let $pos = view.state.doc.resolve(pos);
	if (!GapCursor.valid($pos)) return false;
	let clickPos = view.posAtCoords({
		left: event.clientX,
		top: event.clientY
	});
	if (clickPos && clickPos.inside > -1 && NodeSelection.isSelectable(view.state.doc.nodeAt(clickPos.inside))) return false;
	view.dispatch(view.state.tr.setSelection(new GapCursor($pos)));
	return true;
}
function beforeinput(view, event) {
	if (event.inputType != "insertCompositionText" || !(view.state.selection instanceof GapCursor)) return false;
	let { $from } = view.state.selection;
	let insert = $from.parent.contentMatchAt($from.index()).findWrapping(view.state.schema.nodes.text);
	if (!insert) return false;
	let frag = Fragment.empty;
	for (let i = insert.length - 1; i >= 0; i--) frag = Fragment.from(insert[i].createAndFill(null, frag));
	let tr = view.state.tr.replace($from.pos, $from.pos, new Slice(frag, 0, 0));
	tr.setSelection(TextSelection.near(tr.doc.resolve($from.pos + 1)));
	view.dispatch(tr);
	return false;
}
function drawGapCursor(state) {
	if (!(state.selection instanceof GapCursor)) return null;
	let node = document.createElement("div");
	node.className = "ProseMirror-gapcursor";
	return DecorationSet.create(state.doc, [Decoration.widget(state.selection.head, node, { key: "gapcursor" })]);
}
Extension.create({
	name: "characterCount",
	addOptions() {
		return {
			limit: null,
			autoTrim: true,
			mode: "textSize",
			textCounter: (text) => text.length,
			wordCounter: (text) => text.split(" ").filter((word) => word !== "").length
		};
	},
	addStorage() {
		return {
			characters: () => 0,
			words: () => 0
		};
	},
	onBeforeCreate() {
		this.storage.characters = (options) => {
			const node = (options === null || options === void 0 ? void 0 : options.node) || this.editor.state.doc;
			if (((options === null || options === void 0 ? void 0 : options.mode) || this.options.mode) === "textSize") {
				const text = node.textBetween(0, node.content.size, void 0, " ");
				return this.options.textCounter(text);
			}
			return node.nodeSize;
		};
		this.storage.words = (options) => {
			const node = (options === null || options === void 0 ? void 0 : options.node) || this.editor.state.doc;
			const text = node.textBetween(0, node.content.size, " ", " ");
			return this.options.wordCounter(text);
		};
	},
	addProseMirrorPlugins() {
		let initialEvaluationDone = false;
		return [new Plugin({
			key: new PluginKey("characterCount"),
			appendTransaction: (transactions, oldState, newState) => {
				if (initialEvaluationDone) return;
				const limit = this.options.limit;
				const autoTrim = this.options.autoTrim;
				if (limit === null || limit === void 0 || limit === 0 || autoTrim === false) {
					initialEvaluationDone = true;
					return;
				}
				const initialContentSize = this.storage.characters({ node: newState.doc });
				if (initialContentSize > limit) {
					const over = initialContentSize - limit;
					const from = 0;
					const to = over;
					console.warn(`[CharacterCount] Initial content exceeded limit of ${limit} characters. Content was automatically trimmed.`);
					const tr = newState.tr.deleteRange(from, to);
					initialEvaluationDone = true;
					return tr;
				}
				initialEvaluationDone = true;
			},
			filterTransaction: (transaction, state) => {
				const limit = this.options.limit;
				if (!transaction.docChanged || limit === 0 || limit === null || limit === void 0) return true;
				const oldSize = this.storage.characters({ node: state.doc });
				const newSize = this.storage.characters({ node: transaction.doc });
				if (newSize <= limit) return true;
				if (oldSize > limit && newSize > limit && newSize <= oldSize) return true;
				if (oldSize > limit && newSize > limit && newSize > oldSize) return false;
				if (!transaction.getMeta("paste")) return false;
				const pos = transaction.selection.$head.pos;
				const from = pos - (newSize - limit);
				const to = pos;
				transaction.deleteRange(from, to);
				if (this.storage.characters({ node: transaction.doc }) > limit) return false;
				return true;
			}
		})];
	}
});
/**
* This extension allows you to add a drop cursor to your editor.
* A drop cursor is a line that appears when you drag and drop content
* in-between nodes.
* @see https://tiptap.dev/api/extensions/dropcursor
*/
var Dropcursor = Extension.create({
	name: "dropCursor",
	addOptions() {
		return {
			color: "currentColor",
			width: 1,
			class: void 0
		};
	},
	addProseMirrorPlugins() {
		return [dropCursor(this.options)];
	}
});
Extension.create({
	name: "focus",
	addOptions() {
		return {
			className: "has-focus",
			mode: "all"
		};
	},
	addProseMirrorPlugins() {
		return [new Plugin({
			key: new PluginKey("focus"),
			props: { decorations: ({ doc, selection }) => {
				const { isEditable, isFocused } = this.editor;
				const { anchor } = selection;
				const decorations = [];
				if (!isEditable || !isFocused) return DecorationSet.create(doc, []);
				let maxLevels = 0;
				if (this.options.mode === "deepest") doc.descendants((node, pos) => {
					if (node.isText) return;
					if (!(anchor >= pos && anchor <= pos + node.nodeSize - 1)) return false;
					maxLevels += 1;
				});
				let currentLevel = 0;
				doc.descendants((node, pos) => {
					if (node.isText) return false;
					if (!(anchor >= pos && anchor <= pos + node.nodeSize - 1)) return false;
					currentLevel += 1;
					if (this.options.mode === "deepest" && maxLevels - currentLevel > 0 || this.options.mode === "shallowest" && currentLevel > 1) return this.options.mode === "deepest";
					decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: this.options.className }));
				});
				return DecorationSet.create(doc, decorations);
			} }
		})];
	}
});
/**
* This extension allows you to add a gap cursor to your editor.
* A gap cursor is a cursor that appears when you click on a place
* where no content is present, for example inbetween nodes.
* @see https://tiptap.dev/api/extensions/gapcursor
*/
var Gapcursor = Extension.create({
	name: "gapCursor",
	addProseMirrorPlugins() {
		return [gapCursor()];
	},
	extendNodeSchema(extension) {
		var _callOrReturn;
		const context = {
			name: extension.name,
			options: extension.options,
			storage: extension.storage
		};
		return { allowGapCursor: (_callOrReturn = callOrReturn(getExtensionField(extension, "allowGapCursor", context))) !== null && _callOrReturn !== void 0 ? _callOrReturn : null };
	}
});
/** The default data attribute label */
var DEFAULT_DATA_ATTRIBUTE = "placeholder";
/** The plugin key used to store and read the placeholder decoration set */
var PLUGIN_KEY = new PluginKey("tiptap__placeholder");
/**
* Creates a ProseMirror node decoration that applies a placeholder
* CSS class and data attribute to an empty node.
* @param options.editor - The editor instance
* @param options.pos - The position of the node in the document
* @param options.node - The ProseMirror node
* @param options.isEmptyDoc - Whether the entire document is empty
* @param options.hasAnchor - Whether the selection anchor is within the node
* @param options.dataAttribute - The data attribute name (e.g. `data-placeholder`)
* @param options.classes - CSS classes for empty nodes and the empty editor
* @param options.placeholder - The placeholder text or a function that returns it
* @returns A ProseMirror node decoration with placeholder classes and data attribute
*/
function createPlaceholderDecoration(options) {
	const { editor, placeholder, dataAttribute, pos, node, isEmptyDoc, hasAnchor, classes: { emptyNode, emptyEditor } } = options;
	const classes = [emptyNode];
	if (isEmptyDoc) classes.push(emptyEditor);
	return Decoration.node(pos, pos + node.nodeSize, {
		class: classes.join(" "),
		[dataAttribute]: typeof placeholder === "function" ? placeholder({
			editor,
			node,
			pos,
			hasAnchor
		}) : placeholder
	});
}
function resolveEmptyNodeClass(emptyNodeClass, props) {
	return typeof emptyNodeClass === "function" ? emptyNodeClass(props) : emptyNodeClass;
}
/**
* Scans a document range for empty textblocks that should receive placeholder
* decorations. Used by the slow path and incremental state updates.
*/
function scanRangeForDecorations({ editor, options, dataAttribute, doc, selection, from, to }) {
	const { anchor } = selection;
	const decorations = [];
	const isEmptyDoc = editor.isEmpty;
	doc.nodesBetween(from, to, (node, pos) => {
		const hasAnchor = anchor >= pos && anchor <= pos + node.nodeSize;
		const isEmpty = !node.isLeaf && isNodeEmpty(node);
		if (!node.type.isTextblock) return options.includeChildren;
		if ((hasAnchor || !options.showOnlyCurrent) && isEmpty) decorations.push(createPlaceholderDecoration({
			editor,
			isEmptyDoc,
			dataAttribute,
			hasAnchor,
			placeholder: options.placeholder,
			classes: {
				emptyEditor: options.emptyEditorClass,
				emptyNode: resolveEmptyNodeClass(options.emptyNodeClass, {
					editor,
					node,
					pos,
					hasAnchor
				})
			},
			node,
			pos
		}));
		return options.includeChildren;
	});
	return decorations;
}
/**
* Builds the placeholder decorations for the current document state.
* @param options.editor - The editor instance.
* @param options.options - The resolved placeholder options.
* @param options.dataAttribute - The prepared `data-*` attribute name.
* @param options.doc - The current document node.
* @param options.selection - The current selection.
* @returns A decoration set, or `null` when no placeholders should be shown.
*/
function buildPlaceholderDecorations({ editor, options, dataAttribute, doc, selection }) {
	if (!(editor.isEditable || !options.showOnlyWhenEditable)) return null;
	const { anchor } = selection;
	const decorations = [];
	const isEmptyDoc = editor.isEmpty;
	if (options.showOnlyCurrent && !options.includeChildren) {
		const resolved = doc.resolve(anchor);
		const node = resolved.depth > 0 ? resolved.node(1) : resolved.nodeAfter;
		const nodeStart = resolved.depth > 0 ? resolved.before(1) : anchor;
		if (node && node.type.isTextblock && isNodeEmpty(node)) {
			const hasAnchor = anchor >= nodeStart && anchor <= nodeStart + node.nodeSize;
			decorations.push(createPlaceholderDecoration({
				editor,
				isEmptyDoc,
				dataAttribute,
				hasAnchor,
				placeholder: options.placeholder,
				classes: {
					emptyEditor: options.emptyEditorClass,
					emptyNode: resolveEmptyNodeClass(options.emptyNodeClass, {
						editor,
						node,
						pos: nodeStart,
						hasAnchor
					})
				},
				node,
				pos: nodeStart
			}));
		}
	} else decorations.push(...scanRangeForDecorations({
		editor,
		options,
		dataAttribute,
		doc,
		selection,
		from: 0,
		to: doc.content.size
	}));
	return DecorationSet.create(doc, decorations);
}
/**
* Resolves a document position to the `[from, to)` range of its containing
* top-level block node in absolute document positions.
*/
function resolveTopLevelRange(doc, pos) {
	const resolved = doc.resolve(pos);
	if (resolved.depth === 0) {
		var _resolved$nodeAfter;
		const node = (_resolved$nodeAfter = resolved.nodeAfter) !== null && _resolved$nodeAfter !== void 0 ? _resolved$nodeAfter : resolved.nodeBefore;
		if (!node) return {
			from: pos,
			to: pos
		};
		const nodePos = resolved.nodeAfter ? pos : pos - node.nodeSize;
		return {
			from: nodePos,
			to: nodePos + node.nodeSize
		};
	}
	const topLevelPos = resolved.before(1);
	return {
		from: topLevelPos,
		to: topLevelPos + resolved.node(1).nodeSize
	};
}
/**
* Clamps a top-level block range from `resolveTopLevelRange` to the document
* content, giving the positions used by `Node#nodesBetween` and `Node#forEach`
* offsets.
*
* A top-level node at `Node#forEach` offset `n` already sits at document
* position `n`, so the range must not be shifted: a node decoration spans
* exactly `[n, n + nodeSize]` and has to stay inside the range to be replaced.
*/
function toContentRelativeRange(doc, range) {
	return {
		from: Math.max(0, range.from),
		to: Math.min(doc.content.size, range.to)
	};
}
/**
* Returns the top-level block ranges that intersect a document change range.
* Input `from`/`to` are absolute positions (e.g. from `getChangedRanges`).
* Returned ranges are content-relative, matching `Node#forEach` offsets.
*/
function getTopLevelBlocksInRange(doc, from, to) {
	const ranges = [];
	doc.forEach((node, offset) => {
		const nodeStart = offset;
		const nodeEnd = nodeStart + node.nodeSize;
		const absNodeStart = nodeStart + 1;
		const absNodeEnd = nodeEnd + 1;
		if (absNodeStart < to && absNodeEnd > from) ranges.push({
			from: nodeStart,
			to: nodeEnd
		});
	});
	return ranges;
}
/**
* Sorts ranges by start position and merges overlapping or adjacent ranges.
*/
function mergeRanges(ranges) {
	if (ranges.length === 0) return [];
	const sorted = [...ranges].sort((a, b) => a.from - b.from);
	const merged = [{ ...sorted[0] }];
	for (let i = 1; i < sorted.length; i += 1) {
		const last = merged[merged.length - 1];
		const current = sorted[i];
		if (current.from <= last.to) last.to = Math.max(last.to, current.to);
		else merged.push({ ...current });
	}
	return merged;
}
/**
* Expands a single changed range to the top-level blocks it touches.
* Also resolves blocks at range boundaries so split/merge edits update
* adjacent empty nodes (e.g. a new paragraph after Enter).
*/
function collectBlocksForChange(doc, change) {
	const ranges = getTopLevelBlocksInRange(doc, change.from, change.to);
	ranges.push(toContentRelativeRange(doc, resolveTopLevelRange(doc, change.from)));
	if (change.to > change.from) ranges.push(toContentRelativeRange(doc, resolveTopLevelRange(doc, Math.min(change.to, doc.content.size + 1) - 1)));
	else if (change.from < doc.content.size + 1) ranges.push(toContentRelativeRange(doc, resolveTopLevelRange(doc, Math.min(change.from + 1, doc.content.size))));
	return ranges;
}
/**
* Collects content-relative top-level block ranges that need placeholder
* decorations recomputed after a transaction.
*/
function collectRescanRanges(tr, oldState, newState) {
	const ranges = [];
	if (tr.docChanged) {
		const changes = getChangedRanges(tr);
		for (const change of changes) ranges.push(...collectBlocksForChange(newState.doc, change.newRange));
	}
	if (tr.selectionSet) {
		ranges.push(toContentRelativeRange(newState.doc, resolveTopLevelRange(newState.doc, tr.mapping.map(oldState.selection.anchor))));
		ranges.push(toContentRelativeRange(newState.doc, resolveTopLevelRange(newState.doc, newState.selection.anchor)));
	}
	return mergeRanges(ranges);
}
/** Clamps a content-relative range to `[0, doc.content.size]`. */
function clampRange(from, to, doc) {
	const clampedFrom = Math.max(0, Math.min(from, doc.content.size));
	return {
		from: clampedFrom,
		to: Math.max(clampedFrom, Math.min(to, doc.content.size))
	};
}
/**
* Removes and rebuilds placeholder decorations within the given ranges.
* Only drops decorations fully contained in a range so mapped decorations
* on neighbouring blocks (e.g. at a block boundary) are kept intact.
*/
function updateDecorationsInRanges({ decorations, ranges, editor, options, dataAttribute, doc, selection }) {
	let next = decorations;
	for (const range of ranges) {
		const { from, to } = clampRange(range.from, range.to, doc);
		const existing = next.find(from, to).filter((decoration) => decoration.from >= from && decoration.to <= to);
		if (existing.length) next = next.remove(existing);
		const newDecos = scanRangeForDecorations({
			editor,
			options,
			dataAttribute,
			doc,
			selection,
			from,
			to
		});
		if (newDecos.length) next = next.add(doc, newDecos);
	}
	return next;
}
/**
* Creates the incremental `StateField<DecorationSet>` used by the slow path
* (`showOnlyCurrent: false` or `includeChildren: true`).
*
* Decorations are mapped through each transaction and only recomputed for
* top-level blocks touched by document or selection changes.
* @param options.editor - The editor instance.
* @param options.options - The resolved placeholder options.
* @param options.dataAttribute - The prepared `data-*` attribute name.
* @returns A ProseMirror state field storing the placeholder decoration set.
*/
function createPlaceholderStateField({ editor, options, dataAttribute }) {
	return {
		init(_config, state) {
			const decorations = buildPlaceholderDecorations({
				editor,
				options,
				dataAttribute,
				doc: state.doc,
				selection: state.selection
			});
			return decorations !== null && decorations !== void 0 ? decorations : DecorationSet.empty;
		},
		apply(tr, prev, oldState, newState) {
			if (!tr.docChanged && !tr.selectionSet) return prev;
			return updateDecorationsInRanges({
				decorations: prev.map(tr.mapping, tr.doc),
				ranges: collectRescanRanges(tr, oldState, newState),
				editor,
				options,
				dataAttribute,
				doc: newState.doc,
				selection: newState.selection
			});
		}
	};
}
/**
* Prepares the placeholder attribute by ensuring it is properly formatted.
* @param attr - The placeholder attribute string.
* @returns The prepared placeholder attribute string.
*/
function preparePlaceholderAttribute(attr) {
	return attr.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-]/g, "").replace(/^[0-9-]+/, "").replace(/^-+/, "").toLowerCase();
}
/**
* Creates the ProseMirror plugin that renders placeholder decorations.
* @param options.editor - The editor instance.
* @param options.options - The resolved placeholder options.
* @returns The configured placeholder plugin.
*/
function createPlaceholderPlugin({ editor, options }) {
	const dataAttribute = options.dataAttribute ? `data-${preparePlaceholderAttribute(options.dataAttribute)}` : `data-${DEFAULT_DATA_ATTRIBUTE}`;
	const useResolvedPath = options.showOnlyCurrent && !options.includeChildren;
	return new Plugin({
		key: PLUGIN_KEY,
		...useResolvedPath ? {} : { state: createPlaceholderStateField({
			editor,
			options,
			dataAttribute
		}) },
		props: { decorations: useResolvedPath ? ({ doc, selection }) => buildPlaceholderDecorations({
			editor,
			options,
			dataAttribute,
			doc,
			selection
		}) : (state) => {
			var _PLUGIN_KEY$getState;
			if (options.showOnlyWhenEditable && !editor.isEditable) return DecorationSet.empty;
			return (_PLUGIN_KEY$getState = PLUGIN_KEY.getState(state)) !== null && _PLUGIN_KEY$getState !== void 0 ? _PLUGIN_KEY$getState : DecorationSet.empty;
		} }
	});
}
/**
* This extension allows you to add a placeholder to your editor.
* A placeholder is a text that appears when the editor or a node is empty.
* @see https://www.tiptap.dev/api/extensions/placeholder
*/
var Placeholder = Extension.create({
	name: "placeholder",
	addOptions() {
		return {
			emptyEditorClass: "is-editor-empty",
			emptyNodeClass: "is-empty",
			dataAttribute: DEFAULT_DATA_ATTRIBUTE,
			placeholder: "Write something …",
			showOnlyWhenEditable: true,
			showOnlyCurrent: true,
			includeChildren: false
		};
	},
	addProseMirrorPlugins() {
		return [createPlaceholderPlugin({
			editor: this.editor,
			options: this.options
		})];
	}
});
/**
* Whether the native browser selection should be cleared on blur and restored on focus.
* Only applies to non-empty text selections in an editable editor.
*/
function shouldSyncDomSelection(state, editor) {
	return !state.selection.empty && !isNodeSelection(state.selection) && editor.isEditable;
}
/**
* Whether the selection decoration should be rendered to keep the selection
* visible while the editor is blurred (and not dragging).
*/
function shouldPreserveSelection(state, editor) {
	return shouldSyncDomSelection(state, editor) && !editor.isFocused && !editor.view.dragging;
}
function clearDomSelection() {
	var _window$getSelection;
	(_window$getSelection = window.getSelection()) === null || _window$getSelection === void 0 || _window$getSelection.removeAllRanges();
}
/**
* Sync the native selection from the editor state.
* @see https://prosemirror.net/docs/ref/#view.EditorView.focus
*/
function restoreDomSelection(view) {
	view.focus();
}
Extension.create({
	name: "selection",
	addOptions() {
		return { className: "selection" };
	},
	addProseMirrorPlugins() {
		const { editor, options } = this;
		return [new Plugin({
			key: new PluginKey("selection"),
			props: {
				decorations(state) {
					if (!shouldPreserveSelection(state, editor)) return null;
					return DecorationSet.create(state.doc, [Decoration.inline(state.selection.from, state.selection.to, { class: options.className })]);
				},
				handleDOMEvents: {
					blur(view) {
						if (!shouldSyncDomSelection(view.state, editor)) return false;
						clearDomSelection();
						return false;
					},
					focus(view) {
						if (!shouldSyncDomSelection(view.state, editor)) return false;
						requestAnimationFrame(() => {
							if (!editor.isDestroyed && view.hasFocus()) restoreDomSelection(view);
						});
						return false;
					}
				}
			}
		})];
	}
});
function nodeEqualsType({ types, node }) {
	return node && Array.isArray(types) && types.includes(node.type) || (node === null || node === void 0 ? void 0 : node.type) === types;
}
/**
* This extension allows you to add an extra node at the end of the document.
* @see https://www.tiptap.dev/api/extensions/trailing-node
*/
var TrailingNode = Extension.create({
	name: "trailingNode",
	addOptions() {
		return {
			node: void 0,
			notAfter: []
		};
	},
	addProseMirrorPlugins() {
		var _this$editor$schema$t;
		const plugin = new PluginKey(this.name);
		const defaultNode = this.options.node || ((_this$editor$schema$t = this.editor.schema.topNodeType.contentMatch.defaultType) === null || _this$editor$schema$t === void 0 ? void 0 : _this$editor$schema$t.name) || "paragraph";
		const disabledNodes = Object.entries(this.editor.schema.nodes).map(([, value]) => value).filter((node) => (this.options.notAfter || []).concat(defaultNode).includes(node.name));
		return [new Plugin({
			key: plugin,
			appendTransaction: (transactions, __, state) => {
				const { doc, tr, schema } = state;
				const shouldInsertNodeAtEnd = plugin.getState(state);
				const endPosition = doc.content.size;
				const type = schema.nodes[defaultNode];
				if (transactions.some((transaction) => transaction.getMeta("skipTrailingNode"))) return;
				if (!shouldInsertNodeAtEnd) return;
				return tr.insert(endPosition, type.create());
			},
			state: {
				init: (_, state) => {
					const lastNode = state.tr.doc.lastChild;
					return !nodeEqualsType({
						node: lastNode,
						types: disabledNodes
					});
				},
				apply: (tr, value) => {
					if (!tr.docChanged) return value;
					if (tr.getMeta("__uniqueIDTransaction")) return value;
					const lastNode = tr.doc.lastChild;
					return !nodeEqualsType({
						node: lastNode,
						types: disabledNodes
					});
				}
			}
		})];
	}
});
/**
* This extension allows you to undo and redo recent changes.
* @see https://www.tiptap.dev/api/extensions/undo-redo
*
* **Important**: If the `@tiptap/extension-collaboration` package is used, make sure to remove
* the `undo-redo` extension, as it is not compatible with the `collaboration` extension.
*
* `@tiptap/extension-collaboration` uses its own history implementation.
*/
var UndoRedo = Extension.create({
	name: "undoRedo",
	addOptions() {
		return {
			depth: 100,
			newGroupDelay: 500
		};
	},
	addCommands() {
		return {
			undo: () => ({ state, dispatch }) => {
				return undo(state, dispatch);
			},
			redo: () => ({ state, dispatch }) => {
				return redo(state, dispatch);
			}
		};
	},
	addProseMirrorPlugins() {
		return [history(this.options)];
	},
	addKeyboardShortcuts() {
		return {
			"Mod-z": () => this.editor.commands.undo(),
			"Shift-Mod-z": () => this.editor.commands.redo(),
			"Mod-y": () => this.editor.commands.redo(),
			"Mod-я": () => this.editor.commands.undo(),
			"Shift-Mod-я": () => this.editor.commands.redo()
		};
	}
});
export { UndoRedo as a, TrailingNode as i, Gapcursor as n, Placeholder as r, Dropcursor as t };
