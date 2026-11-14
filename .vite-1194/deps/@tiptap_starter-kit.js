import { Bn as wrappingInputRule, E as combineTransactionSteps, G as findChildrenInRange, Hn as isHistoryTransaction, Ht as isNodeSelection, Rn as textblockTypeInputRule, T as canInsertNode, _n as mergeAttributes, bn as nodeInputRule, et as getAttributes, f as Mark, lt as getMarksBetween, m as Node, mn as markPasteRule, nt as getChangedRanges, pn as markInputRule, s as Extension, u as InputRule, v as PasteRule } from "./dist-BgYMzsBB.js";
import { p as Slice } from "./dist-CL9j1usr.js";
import { u as ReplaceStep } from "./dist-DMR5aO-v.js";
import "./@tiptap_pm_model.js";
import { a as PluginKey, c as TextSelection, i as Plugin, o as Selection, r as NodeSelection } from "./dist-CrIvfOQu.js";
import "./@tiptap_pm_state.js";
import "./@tiptap_pm_transform.js";
import { i as OrderedList, n as ListItem, r as ListKeymap, t as BulletList } from "./dist-UMat9FgZ.js";
import { a as UndoRedo, i as TrailingNode, n as Gapcursor, t as Dropcursor } from "./dist-EB57nve8.js";
// ../DnD helper/node_modules/@tiptap/core/dist/jsx-runtime/jsx-runtime.js
var jsxElements = /* @__PURE__ */ new WeakSet();
var jsxFragments = /* @__PURE__ */ new WeakSet();
/** Create a new JSX element from the given spec */
function createJSXElement(spec) {
	const element = spec;
	jsxElements.add(element);
	return element;
}
/** Check if a spec is a JSX element */
function isJSXElement(value) {
	return Array.isArray(value) && jsxElements.has(value);
}
function flattenFragmentChildren(children) {
	return children.flatMap((child) => {
		if (child == null) return [];
		if (Array.isArray(child) && jsxFragments.has(child) && !isJSXElement(child)) return flattenFragmentChildren(child);
		return [child];
	});
}
function render(tag, attributes) {
	if (tag === "slot") return 0;
	if (tag instanceof Function) {
		const result = tag(attributes);
		if (Array.isArray(result) && !isJSXElement(result) && !jsxFragments.has(result)) return createJSXElement(result);
		return result;
	}
	const { children, ...rest } = attributes !== null && attributes !== void 0 ? attributes : {};
	if (tag === "svg") throw new Error("SVG elements are not supported in the JSX syntax, use the array syntax instead");
	if (Array.isArray(children)) {
		if (isJSXElement(children)) return createJSXElement([
			tag,
			rest,
			children
		]);
		if (children.length === 0) return createJSXElement([tag, rest]);
		const flattenedChildren = flattenFragmentChildren(children);
		if (flattenedChildren.length === 0) return createJSXElement([tag, rest]);
		return createJSXElement([
			tag,
			rest,
			...flattenedChildren
		]);
	}
	if (children !== void 0 && children !== null) return createJSXElement([
		tag,
		rest,
		children
	]);
	return createJSXElement([tag, rest]);
}
var h = (tag, attributes) => render(tag, attributes);
// ../DnD helper/node_modules/@tiptap/extension-blockquote/dist/index.js
/**
* Restructure the blockquote boundary at the caret.
*
* Two cases are handled in a single backspace:
*
* 1. Caret at the start of a non-first child of a blockquote — lift the
*    current child out, splitting the blockquote around it.
* 2. Caret at the start of a top-level textblock whose previous sibling is
*    a blockquote with a textblock last child — merge the current
*    textblock's inline content into the blockquote's last textblock
*    instead of letting joinBackward pull the paragraph back inside.
*
* Returns true when the backspace was consumed.
*/
var handleBackspace = (editor, type) => {
	var _previous$lastChild;
	const { state } = editor;
	const { selection } = state;
	if (!selection.empty) return false;
	const { $from } = selection;
	if ($from.parentOffset !== 0) return false;
	const parentDepth = $from.depth - 1;
	if (parentDepth < 0) return false;
	const parent = $from.node(parentDepth);
	const index = $from.index(parentDepth);
	if (index === 0) return false;
	if (parent.type === type) return editor.commands.lift(type.name);
	const previous = parent.child(index - 1);
	if (previous.type !== type || !((_previous$lastChild = previous.lastChild) === null || _previous$lastChild === void 0 ? void 0 : _previous$lastChild.isTextblock)) return false;
	const targetPos = $from.before() - 1 - 1;
	return editor.commands.command(({ tr, dispatch }) => {
		if (!dispatch) return true;
		const content = $from.parent.content;
		const slice = new Slice(content, 0, 0);
		tr.replace(targetPos, $from.after(), slice);
		tr.setSelection(TextSelection.create(tr.doc, targetPos + content.size));
		tr.scrollIntoView();
		dispatch(tr);
		return true;
	});
};
/** @jsxImportSource @tiptap/core */
/**
* Matches a blockquote to a `>` as input.
*/
var inputRegex$1 = /^\s*>\s$/;
/**
* This extension allows you to create blockquotes.
* @see https://tiptap.dev/api/nodes/blockquote
*/
var Blockquote = Node.create({
	name: "blockquote",
	addOptions() {
		return { HTMLAttributes: {} };
	},
	content: "block+",
	group: "block",
	defining: true,
	parseHTML() {
		return [{ tag: "blockquote" }];
	},
	renderHTML({ HTMLAttributes }) {
		return /* @__PURE__ */ h("blockquote", {
			...mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
			children: /* @__PURE__ */ h("slot", {})
		});
	},
	parseMarkdown: (token, helpers) => {
		var _helpers$parseBlockCh;
		const parseBlockChildren = (_helpers$parseBlockCh = helpers.parseBlockChildren) !== null && _helpers$parseBlockCh !== void 0 ? _helpers$parseBlockCh : helpers.parseChildren;
		return helpers.createNode("blockquote", void 0, parseBlockChildren(token.tokens || []));
	},
	renderMarkdown: (node, h) => {
		if (!node.content) return "";
		const prefix = ">";
		const result = [];
		node.content.forEach((child, index) => {
			var _h$renderChild, _h$renderChild2;
			const linesWithPrefix = ((_h$renderChild = (_h$renderChild2 = h.renderChild) === null || _h$renderChild2 === void 0 ? void 0 : _h$renderChild2.call(h, child, index)) !== null && _h$renderChild !== void 0 ? _h$renderChild : h.renderChildren([child])).split("\n").map((line) => {
				if (line.trim() === "") return prefix;
				return `${prefix} ${line}`;
			});
			result.push(linesWithPrefix.join("\n"));
		});
		return result.join(`\n${prefix}\n`);
	},
	addCommands() {
		return {
			setBlockquote: () => ({ commands }) => {
				return commands.wrapIn(this.name);
			},
			toggleBlockquote: () => ({ commands }) => {
				return commands.toggleWrap(this.name);
			},
			unsetBlockquote: () => ({ commands }) => {
				return commands.lift(this.name);
			}
		};
	},
	addKeyboardShortcuts() {
		return {
			"Mod-Shift-b": () => this.editor.commands.toggleBlockquote(),
			Backspace: () => handleBackspace(this.editor, this.type)
		};
	},
	addInputRules() {
		return [wrappingInputRule({
			find: inputRegex$1,
			type: this.type
		})];
	}
});
// ../DnD helper/node_modules/@tiptap/extension-bold/dist/index.js
/** @jsxImportSource @tiptap/core */
/**
* Matches bold text via `**` as input.
*/
var starInputRegex$1 = /(?:^|\s)(\*\*(?!\s+\*\*)((?:[^*]+))\*\*(?!\s+\*\*))$/;
/**
* Matches bold text via `**` while pasting.
*/
var starPasteRegex$1 = /(?:^|\s)(\*\*(?!\s+\*\*)((?:[^*]+))\*\*(?!\s+\*\*))/g;
/**
* Matches bold text via `__` as input.
*/
var underscoreInputRegex$1 = /(?:^|\s)(__(?!\s+__)((?:[^_]+))__(?!\s+__))$/;
/**
* Matches bold text via `__` while pasting.
*/
var underscorePasteRegex$1 = /(?:^|\s)(__(?!\s+__)((?:[^_]+))__(?!\s+__))/g;
/**
* This extension allows you to mark text as bold.
* @see https://tiptap.dev/api/marks/bold
*/
var Bold = Mark.create({
	name: "bold",
	addOptions() {
		return { HTMLAttributes: {} };
	},
	parseHTML() {
		return [
			{ tag: "strong" },
			{
				tag: "b",
				getAttrs: (node) => node.style.fontWeight !== "normal" && null
			},
			{
				style: "font-weight=400",
				clearMark: (mark) => mark.type.name === this.name
			},
			{
				style: "font-weight",
				getAttrs: (value) => /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null
			}
		];
	},
	renderHTML({ HTMLAttributes }) {
		return /* @__PURE__ */ h("strong", {
			...mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
			children: /* @__PURE__ */ h("slot", {})
		});
	},
	markdownTokenName: "strong",
	parseMarkdown: (token, helpers) => {
		return helpers.applyMark("bold", helpers.parseInline(token.tokens || []));
	},
	markdownOptions: { htmlReopen: {
		open: "<strong>",
		close: "</strong>"
	} },
	renderMarkdown: (node, h) => {
		return `**${h.renderChildren(node)}**`;
	},
	addCommands() {
		return {
			setBold: () => ({ commands }) => {
				return commands.setMark(this.name);
			},
			toggleBold: () => ({ commands }) => {
				return commands.toggleMark(this.name);
			},
			unsetBold: () => ({ commands }) => {
				return commands.unsetMark(this.name);
			}
		};
	},
	addKeyboardShortcuts() {
		return {
			"Mod-b": () => this.editor.commands.toggleBold(),
			"Mod-B": () => this.editor.commands.toggleBold()
		};
	},
	addInputRules() {
		return [markInputRule({
			find: starInputRegex$1,
			type: this.type
		}), markInputRule({
			find: underscoreInputRegex$1,
			type: this.type
		})];
	},
	addPasteRules() {
		return [markPasteRule({
			find: starPasteRegex$1,
			type: this.type
		}), markPasteRule({
			find: underscorePasteRegex$1,
			type: this.type
		})];
	}
});
// ../DnD helper/node_modules/@tiptap/extension-code/dist/index.js
/**
* A function-based finder for the inline code input rule.
* Used internally by the extension to ensure the preceding character
* is not consumed as part of the match, preventing it from being deleted.
*/
var inputRegexMatch = (text) => {
	const match = /`([^`]+)`(?!`)$/.exec(text);
	if (!match) return null;
	if (match.index > 0 && text[match.index - 1] === "`") return null;
	return {
		index: match.index,
		text: match[0],
		replaceWith: match[1]
	};
};
/**
* A function-based finder for the inline code paste rule.
* Used internally by the extension to avoid consuming the preceding
* character as part of the match.
*/
var pasteRegexMatch = (text) => {
	const regex = /`([^`]+)`(?!`)/g;
	const matches = [];
	let match;
	while ((match = regex.exec(text)) !== null) {
		if (match.index > 0 && text[match.index - 1] === "`") continue;
		matches.push({
			index: match.index,
			text: match[0],
			replaceWith: match[1]
		});
	}
	return matches;
};
function shortestUnusedBacktickRun(text) {
	const runs = new Set((text.match(/`+/g) || []).map((run) => run.length));
	let length = 1;
	while (runs.has(length)) length += 1;
	return length;
}
/**
* This extension allows you to mark text as inline code.
* @see https://tiptap.dev/api/marks/code
*/
var Code = Mark.create({
	name: "code",
	addOptions() {
		return { HTMLAttributes: {} };
	},
	excludes: "_",
	code: true,
	exitable: true,
	parseHTML() {
		return [{ tag: "code" }];
	},
	renderHTML({ HTMLAttributes }) {
		return [
			"code",
			mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
			0
		];
	},
	markdownTokenName: "codespan",
	parseMarkdown: (token, helpers) => {
		return helpers.applyMark("code", [{
			type: "text",
			text: token.text || ""
		}]);
	},
	renderMarkdown: (node, h, context) => {
		var _context$meta;
		if (!node.content) return "";
		const markText = typeof (context === null || context === void 0 || (_context$meta = context.meta) === null || _context$meta === void 0 ? void 0 : _context$meta.markText) === "string" ? context.meta.markText : "";
		const fence = "`".repeat(shortestUnusedBacktickRun(markText));
		const padding = markText.startsWith("`") || markText.endsWith("`") ? " " : "";
		return `${fence}${padding}${h.renderChildren(node.content)}${padding}${fence}`;
	},
	addCommands() {
		return {
			setCode: () => ({ commands }) => {
				return commands.setMark(this.name);
			},
			toggleCode: () => ({ commands }) => {
				return commands.toggleMark(this.name);
			},
			unsetCode: () => ({ commands }) => {
				return commands.unsetMark(this.name);
			}
		};
	},
	addKeyboardShortcuts() {
		return { "Mod-e": () => this.editor.commands.toggleCode() };
	},
	addInputRules() {
		return [markInputRule({
			find: inputRegexMatch,
			type: this.type
		})];
	},
	addPasteRules() {
		return [markPasteRule({
			find: pasteRegexMatch,
			type: this.type
		})];
	}
});
// ../DnD helper/node_modules/@tiptap/extension-code-block/dist/index.js
var DEFAULT_TAB_SIZE = 4;
/**
* Matches a code block with backticks.
*/
var backtickInputRegex = /^```([a-z]+)?[\s\n]$/;
/**
* Matches a code block with tildes.
*/
var tildeInputRegex = /^~~~([a-z]+)?[\s\n]$/;
/**
* This extension allows you to create code blocks.
* @see https://tiptap.dev/api/nodes/code-block
*/
var CodeBlock = Node.create({
	name: "codeBlock",
	addOptions() {
		return {
			languageClassPrefix: "language-",
			exitOnTripleEnter: true,
			exitOnArrowDown: true,
			exitOnArrowUp: true,
			defaultLanguage: null,
			enableTabIndentation: false,
			tabSize: DEFAULT_TAB_SIZE,
			HTMLAttributes: {}
		};
	},
	content: "text*",
	marks: "",
	group: "block",
	code: true,
	defining: true,
	addAttributes() {
		return { language: {
			default: this.options.defaultLanguage,
			parseHTML: (element) => {
				var _element$firstElement;
				const { languageClassPrefix } = this.options;
				if (!languageClassPrefix) return null;
				const language = [...((_element$firstElement = element.firstElementChild) === null || _element$firstElement === void 0 ? void 0 : _element$firstElement.classList) || []].filter((className) => className.startsWith(languageClassPrefix)).map((className) => className.replace(languageClassPrefix, ""))[0];
				if (!language) return null;
				return language;
			},
			rendered: false
		} };
	},
	parseHTML() {
		return [{
			tag: "pre",
			preserveWhitespace: "full"
		}];
	},
	renderHTML({ node, HTMLAttributes }) {
		return [
			"pre",
			mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
			[
				"code",
				{ class: node.attrs.language ? this.options.languageClassPrefix + node.attrs.language : null },
				0
			]
		];
	},
	markdownTokenName: "code",
	parseMarkdown: (token, helpers) => {
		var _token$raw, _token$raw2;
		if (((_token$raw = token.raw) === null || _token$raw === void 0 ? void 0 : _token$raw.startsWith("```")) === false && ((_token$raw2 = token.raw) === null || _token$raw2 === void 0 ? void 0 : _token$raw2.startsWith("~~~")) === false && token.codeBlockStyle !== "indented") return [];
		return helpers.createNode("codeBlock", { language: token.lang || null }, token.text ? [helpers.createTextNode(token.text)] : []);
	},
	renderMarkdown: (node, h) => {
		var _node$attrs;
		let output = "";
		const language = ((_node$attrs = node.attrs) === null || _node$attrs === void 0 ? void 0 : _node$attrs.language) || "";
		if (!node.content) output = `\`\`\`${language}\n\n\`\`\``;
		else output = [
			`\`\`\`${language}`,
			h.renderChildren(node.content),
			"```"
		].join("\n");
		return output;
	},
	addCommands() {
		return {
			setCodeBlock: (attributes) => ({ commands }) => {
				return commands.setNode(this.name, attributes);
			},
			toggleCodeBlock: (attributes) => ({ commands }) => {
				return commands.toggleNode(this.name, "paragraph", attributes);
			}
		};
	},
	addKeyboardShortcuts() {
		return {
			"Mod-Alt-c": () => this.editor.commands.toggleCodeBlock(),
			Backspace: () => {
				const { empty, $anchor } = this.editor.state.selection;
				const isAtStart = $anchor.pos === 1;
				if (!empty || $anchor.parent.type.name !== this.name) return false;
				if (isAtStart || !$anchor.parent.textContent.length) return this.editor.commands.clearNodes();
				return false;
			},
			Tab: ({ editor }) => {
				var _this$options$tabSize;
				if (!this.options.enableTabIndentation) return false;
				const tabSize = (_this$options$tabSize = this.options.tabSize) !== null && _this$options$tabSize !== void 0 ? _this$options$tabSize : DEFAULT_TAB_SIZE;
				const { state } = editor;
				const { selection } = state;
				const { $from, empty } = selection;
				if ($from.parent.type !== this.type) return false;
				const indent = " ".repeat(tabSize);
				if (empty) return editor.commands.insertContent(indent);
				return editor.commands.command(({ tr }) => {
					const { from, to } = selection;
					const indentedText = state.doc.textBetween(from, to, "\n", "\n").split("\n").map((line) => indent + line).join("\n");
					tr.replaceWith(from, to, state.schema.text(indentedText));
					return true;
				});
			},
			"Shift-Tab": ({ editor }) => {
				var _this$options$tabSize2;
				if (!this.options.enableTabIndentation) return false;
				const tabSize = (_this$options$tabSize2 = this.options.tabSize) !== null && _this$options$tabSize2 !== void 0 ? _this$options$tabSize2 : DEFAULT_TAB_SIZE;
				const { state } = editor;
				const { selection } = state;
				const { $from, empty } = selection;
				if ($from.parent.type !== this.type) return false;
				if (empty) return editor.commands.command(({ tr }) => {
					var _currentLine$match;
					const { pos } = $from;
					const codeBlockStart = $from.start();
					const codeBlockEnd = $from.end();
					const lines = state.doc.textBetween(codeBlockStart, codeBlockEnd, "\n", "\n").split("\n");
					let currentLineIndex = 0;
					let charCount = 0;
					const relativeCursorPos = pos - codeBlockStart;
					for (let i = 0; i < lines.length; i += 1) {
						if (charCount + lines[i].length >= relativeCursorPos) {
							currentLineIndex = i;
							break;
						}
						charCount += lines[i].length + 1;
					}
					const leadingSpaces = ((_currentLine$match = lines[currentLineIndex].match(/^ */)) === null || _currentLine$match === void 0 ? void 0 : _currentLine$match[0]) || "";
					const spacesToRemove = Math.min(leadingSpaces.length, tabSize);
					if (spacesToRemove === 0) return true;
					let lineStartPos = codeBlockStart;
					for (let i = 0; i < currentLineIndex; i += 1) lineStartPos += lines[i].length + 1;
					tr.delete(lineStartPos, lineStartPos + spacesToRemove);
					if (pos - lineStartPos <= spacesToRemove) tr.setSelection(TextSelection.create(tr.doc, lineStartPos));
					return true;
				});
				return editor.commands.command(({ tr }) => {
					const { from, to } = selection;
					const reverseIndentText = state.doc.textBetween(from, to, "\n", "\n").split("\n").map((line) => {
						var _line$match;
						const leadingSpaces = ((_line$match = line.match(/^ */)) === null || _line$match === void 0 ? void 0 : _line$match[0]) || "";
						const spacesToRemove = Math.min(leadingSpaces.length, tabSize);
						return line.slice(spacesToRemove);
					}).join("\n");
					tr.replaceWith(from, to, state.schema.text(reverseIndentText));
					return true;
				});
			},
			Enter: ({ editor }) => {
				if (!this.options.exitOnTripleEnter) return false;
				const { state } = editor;
				const { selection } = state;
				const { $from, empty } = selection;
				if (!empty || $from.parent.type !== this.type) return false;
				const isAtEnd = $from.parentOffset === $from.parent.nodeSize - 2;
				const endsWithDoubleNewline = $from.parent.textContent.endsWith("\n\n");
				if (!isAtEnd || !endsWithDoubleNewline) return false;
				return editor.chain().command(({ tr }) => {
					tr.delete($from.pos - 2, $from.pos);
					return true;
				}).exitCode().run();
			},
			ArrowUp: ({ editor }) => {
				if (!this.options.exitOnArrowUp) return false;
				const { state } = editor;
				const { selection } = state;
				const { $from, empty } = selection;
				if (!empty || $from.parent.type !== this.type) return false;
				if ($from.parentOffset !== 0) return false;
				const before = $from.before();
				if (before > 0) return false;
				return editor.commands.insertDefaultBlock({ pos: before });
			},
			ArrowDown: ({ editor }) => {
				if (!this.options.exitOnArrowDown) return false;
				const { state } = editor;
				const { selection, doc } = state;
				const { $from, empty } = selection;
				if (!empty || $from.parent.type !== this.type) return false;
				if (!($from.parentOffset === $from.parent.nodeSize - 2)) return false;
				const after = $from.after();
				if (after === void 0) return false;
				if (doc.nodeAt(after)) return editor.commands.command(({ tr }) => {
					tr.setSelection(Selection.near(doc.resolve(after)));
					return true;
				});
				return editor.commands.exitCode();
			}
		};
	},
	addInputRules() {
		return [textblockTypeInputRule({
			find: backtickInputRegex,
			type: this.type,
			getAttributes: (match) => ({ language: match[1] })
		}), textblockTypeInputRule({
			find: tildeInputRegex,
			type: this.type,
			getAttributes: (match) => ({ language: match[1] })
		})];
	},
	addProseMirrorPlugins() {
		return [new Plugin({
			key: new PluginKey("codeBlockVSCodeHandler"),
			props: { handlePaste: (view, event) => {
				if (!event.clipboardData) return false;
				if (this.editor.isActive(this.type.name)) return false;
				const text = event.clipboardData.getData("text/plain");
				const vscode = event.clipboardData.getData("vscode-editor-data");
				const vscodeData = vscode ? JSON.parse(vscode) : void 0;
				const language = vscodeData === null || vscodeData === void 0 ? void 0 : vscodeData.mode;
				if (!text || !language) return false;
				const { tr, schema } = view.state;
				const textNode = schema.text(text.replace(/\r\n?/g, "\n"));
				tr.replaceSelectionWith(this.type.create({ language }, textNode));
				if (tr.selection.$from.parent.type !== this.type) tr.setSelection(TextSelection.near(tr.doc.resolve(Math.max(0, tr.selection.from - 2))));
				tr.setMeta("paste", true);
				view.dispatch(tr);
				return true;
			} }
		})];
	}
});
// ../DnD helper/node_modules/@tiptap/extension-document/dist/index.js
/**
* The default document node which represents the top level node of the editor.
* @see https://tiptap.dev/api/nodes/document
*/
var Document = Node.create({
	name: "doc",
	topNode: true,
	content: "block+",
	renderMarkdown: (node, h) => {
		if (!node.content) return "";
		return h.renderChildren(node.content, "\n\n");
	}
});
// ../DnD helper/node_modules/@tiptap/extension-hard-break/dist/index.js
/**
* This extension allows you to insert hard breaks.
* @see https://www.tiptap.dev/api/nodes/hard-break
*/
var HardBreak = Node.create({
	name: "hardBreak",
	markdownTokenName: "br",
	addOptions() {
		return {
			keepMarks: true,
			HTMLAttributes: {}
		};
	},
	inline: true,
	group: "inline",
	selectable: false,
	linebreakReplacement: true,
	parseHTML() {
		return [{ tag: "br" }];
	},
	renderHTML({ HTMLAttributes }) {
		return ["br", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)];
	},
	renderText() {
		return "\n";
	},
	renderMarkdown: () => `  \n`,
	parseMarkdown: () => {
		return { type: "hardBreak" };
	},
	addCommands() {
		return { setHardBreak: () => ({ commands, chain, state, editor }) => {
			return commands.first([() => commands.exitCode(), () => commands.command(() => {
				const { selection, storedMarks } = state;
				if (selection.$from.parent.type.spec.isolating) return false;
				const { keepMarks } = this.options;
				const { splittableMarks } = editor.extensionManager;
				const marks = storedMarks || selection.$to.parentOffset && selection.$from.marks();
				return chain().insertContent({ type: this.name }).command(({ tr, dispatch }) => {
					if (dispatch && marks && keepMarks) {
						const filteredMarks = marks.filter((mark) => splittableMarks.includes(mark.type.name));
						tr.ensureMarks(filteredMarks);
					}
					return true;
				}).scrollIntoView().run();
			})]);
		} };
	},
	addKeyboardShortcuts() {
		return {
			"Mod-Enter": () => this.editor.commands.setHardBreak(),
			"Shift-Enter": () => this.editor.commands.setHardBreak()
		};
	}
});
// ../DnD helper/node_modules/@tiptap/extension-heading/dist/index.js
/**
* This extension allows you to create headings.
* @see https://www.tiptap.dev/api/nodes/heading
*/
var Heading = Node.create({
	name: "heading",
	addOptions() {
		return {
			levels: [
				1,
				2,
				3,
				4,
				5,
				6
			],
			HTMLAttributes: {}
		};
	},
	content: "inline*",
	group: "block",
	defining: true,
	addAttributes() {
		return { level: {
			default: 1,
			rendered: false
		} };
	},
	parseHTML() {
		return this.options.levels.map((level) => ({
			tag: `h${level}`,
			attrs: { level }
		}));
	},
	renderHTML({ node, HTMLAttributes }) {
		return [
			`h${this.options.levels.includes(node.attrs.level) ? node.attrs.level : this.options.levels[0]}`,
			mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
			0
		];
	},
	parseMarkdown(token, helpers) {
		const level = token.depth || 1;
		if (!this.options.levels.includes(level)) return helpers.createNode("paragraph", void 0, helpers.parseInline(token.tokens || []));
		return helpers.createNode("heading", { level }, helpers.parseInline(token.tokens || []));
	},
	renderMarkdown: (node, h) => {
		var _node$attrs;
		const level = ((_node$attrs = node.attrs) === null || _node$attrs === void 0 ? void 0 : _node$attrs.level) ? parseInt(node.attrs.level, 10) : 1;
		const headingChars = "#".repeat(level);
		if (!node.content) return "";
		return `${headingChars} ${h.renderChildren(node.content)}`;
	},
	addCommands() {
		return {
			setHeading: (attributes) => ({ commands }) => {
				if (!this.options.levels.includes(attributes.level)) return false;
				return commands.setNode(this.name, attributes);
			},
			toggleHeading: (attributes) => ({ commands }) => {
				if (!this.options.levels.includes(attributes.level)) return false;
				return commands.toggleNode(this.name, "paragraph", attributes);
			}
		};
	},
	addKeyboardShortcuts() {
		return this.options.levels.reduce((items, level) => ({
			...items,
			[`Mod-Alt-${level}`]: () => this.editor.commands.toggleHeading({ level })
		}), {});
	},
	addInputRules() {
		return this.options.levels.map((level) => {
			return textblockTypeInputRule({
				find: new RegExp(`^(#{${Math.min(...this.options.levels)},${level}})\\s$`),
				type: this.type,
				getAttributes: { level }
			});
		});
	}
});
// ../DnD helper/node_modules/@tiptap/extension-horizontal-rule/dist/index.js
/**
* This extension allows you to insert horizontal rules.
* @see https://www.tiptap.dev/api/nodes/horizontal-rule
*/
var HorizontalRule = Node.create({
	name: "horizontalRule",
	addOptions() {
		return {
			HTMLAttributes: {},
			nextNodeType: "paragraph"
		};
	},
	group: "block",
	parseHTML() {
		return [{ tag: "hr" }];
	},
	renderHTML({ HTMLAttributes }) {
		return ["hr", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)];
	},
	markdownTokenName: "hr",
	parseMarkdown: (token, helpers) => {
		return helpers.createNode("horizontalRule");
	},
	renderMarkdown: () => {
		return "---";
	},
	addCommands() {
		return { setHorizontalRule: () => ({ chain, state }) => {
			if (!canInsertNode(state, state.schema.nodes[this.name])) return false;
			const { selection } = state;
			const { $to: $originTo } = selection;
			const currentChain = chain();
			if (isNodeSelection(selection)) currentChain.insertContentAt($originTo.pos, { type: this.name });
			else currentChain.insertContent({ type: this.name });
			return currentChain.command(({ state: chainState, tr, dispatch }) => {
				if (dispatch) {
					const { $to } = tr.selection;
					const posAfter = $to.end();
					if ($to.nodeAfter) {
						if ($to.nodeAfter.isTextblock) tr.setSelection(TextSelection.create(tr.doc, $to.pos + 1));
						else if ($to.nodeAfter.isBlock) tr.setSelection(NodeSelection.create(tr.doc, $to.pos));
						else tr.setSelection(TextSelection.create(tr.doc, $to.pos));
					} else {
						const nodeType = chainState.schema.nodes[this.options.nextNodeType] || $to.parent.type.contentMatch.defaultType;
						const node = nodeType === null || nodeType === void 0 ? void 0 : nodeType.create();
						if (node) {
							tr.insert(posAfter, node);
							tr.setSelection(TextSelection.create(tr.doc, posAfter + 1));
						}
					}
					tr.scrollIntoView();
				}
				return true;
			}).run();
		} };
	},
	addInputRules() {
		return [nodeInputRule({
			find: /^(?:---|—-|___\s|\*\*\*\s)$/,
			type: this.type
		})];
	}
});
// ../DnD helper/node_modules/@tiptap/extension-italic/dist/index.js
/**
* Matches an italic to a *italic* on input.
*/
var starInputRegex = /(?:^|\s)(\*(?!\s+\*)((?:[^*]+))\*(?!\s+\*))$/;
/**
* Matches an italic to a *italic* on paste.
*/
var starPasteRegex = /(?:^|\s)(\*(?!\s+\*)((?:[^*]+))\*(?!\s+\*))/g;
/**
* Matches an italic to a _italic_ on input.
*/
var underscoreInputRegex = /(?:^|\s)(_(?!\s+_)((?:[^_]+))_(?!\s+_))$/;
/**
* Matches an italic to a _italic_ on paste.
*/
var underscorePasteRegex = /(?:^|\s)(_(?!\s+_)((?:[^_]+))_(?!\s+_))/g;
/**
* This extension allows you to create italic text.
* @see https://www.tiptap.dev/api/marks/italic
*/
var Italic = Mark.create({
	name: "italic",
	addOptions() {
		return { HTMLAttributes: {} };
	},
	parseHTML() {
		return [
			{ tag: "em" },
			{
				tag: "i",
				getAttrs: (node) => node.style.fontStyle !== "normal" && null
			},
			{
				style: "font-style=normal",
				clearMark: (mark) => mark.type.name === this.name
			},
			{ style: "font-style=italic" }
		];
	},
	renderHTML({ HTMLAttributes }) {
		return [
			"em",
			mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
			0
		];
	},
	addCommands() {
		return {
			setItalic: () => ({ commands }) => {
				return commands.setMark(this.name);
			},
			toggleItalic: () => ({ commands }) => {
				return commands.toggleMark(this.name);
			},
			unsetItalic: () => ({ commands }) => {
				return commands.unsetMark(this.name);
			}
		};
	},
	markdownTokenName: "em",
	parseMarkdown: (token, helpers) => {
		return helpers.applyMark("italic", helpers.parseInline(token.tokens || []));
	},
	markdownOptions: { htmlReopen: {
		open: "<em>",
		close: "</em>"
	} },
	renderMarkdown: (node, h) => {
		return `*${h.renderChildren(node)}*`;
	},
	addKeyboardShortcuts() {
		return {
			"Mod-i": () => this.editor.commands.toggleItalic(),
			"Mod-I": () => this.editor.commands.toggleItalic()
		};
	},
	addInputRules() {
		return [markInputRule({
			find: starInputRegex,
			type: this.type
		}), markInputRule({
			find: underscoreInputRegex,
			type: this.type
		})];
	},
	addPasteRules() {
		return [markPasteRule({
			find: starPasteRegex,
			type: this.type
		}), markPasteRule({
			find: underscorePasteRegex,
			type: this.type
		})];
	}
});
// ../DnD helper/node_modules/linkifyjs/dist/linkify.mjs
var encodedTlds = "aaa1rp3bb0ott3vie4c1le2ogado5udhabi7c0ademy5centure6ountant0s9o1tor4d0s1ult4e0g1ro2tna4f0l1rica5g0akhan5ency5i0g1rbus3force5tel5kdn3l0ibaba4pay4lfinanz6state5y2sace3tom5m0azon4ericanexpress7family11x2fam3ica3sterdam8nalytics7droid5quan4z2o0l2partments8p0le4q0uarelle8r0ab1mco4chi3my2pa2t0e3s0da2ia2sociates9t0hleta5torney7u0ction5di0ble3o3spost5thor3o0s4w0s2x0a2z0ure5ba0by2idu3namex4d1k2r0celona5laycard4s5efoot5gains6seball5ketball8uhaus5yern5b0c1t1va3cg1n2d1e0ats2uty4er2rlin4st0buy5t2f1g1h0arti5i0ble3d1ke2ng0o3o1z2j1lack0friday9ockbuster8g1omberg7ue3m0s1w2n0pparibas9o0ats3ehringer8fa2m1nd2o0k0ing5sch2tik2on4t1utique6x2r0adesco6idgestone9oadway5ker3ther5ussels7s1t1uild0ers6siness6y1zz3v1w1y1z0h3ca0b1fe2l0l1vinklein9m0era3p2non3petown5ital0one8r0avan4ds2e0er0s4s2sa1e1h1ino4t0ering5holic7ba1n1re3c1d1enter4o1rn3f0a1d2g1h0anel2nel4rity4se2t2eap3intai5ristmas6ome4urch5i0priani6rcle4sco3tadel4i0c2y3k1l0aims4eaning6ick2nic1que6othing5ud3ub0med6m1n1o0ach3des3ffee4llege4ogne5m0mbank4unity6pany2re3uter5sec4ndos3struction8ulting7tact3ractors9oking4l1p2rsica5untry4pon0s4rses6pa2r0edit0card4union9icket5own3s1uise0s6u0isinella9v1w1x1y0mru3ou3z2dad1nce3ta1e1ing3sun4y2clk3ds2e0al0er2s3gree4livery5l1oitte5ta3mocrat6ntal2ist5si0gn4v2hl2iamonds6et2gital5rect0ory7scount3ver5h2y2j1k1m1np2o0cs1tor4g1mains5t1wnload7rive4tv2ubai3pont4rban5vag2r2z2earth3t2c0o2deka3u0cation8e1g1mail3erck5nergy4gineer0ing9terprises10pson4quipment8r0icsson6ni3s0q1tate5t1u0rovision8s2vents5xchange6pert3osed4ress5traspace10fage2il1rwinds6th3mily4n0s2rm0ers5shion4t3edex3edback6rrari3ero6i0delity5o2lm2nal1nce1ial7re0stone6mdale6sh0ing5t0ness6j1k1lickr3ghts4r2orist4wers5y2m1o0o0d1tball6rd1ex2sale4um3undation8x2r0ee1senius7l1ogans4ntier7tr2ujitsu5n0d2rniture7tbol5yi3ga0l0lery3o1up4me0s3p1rden4y2b0iz3d0n2e0a1nt0ing5orge5f1g0ee3h1i0ft0s3ves2ing5l0ass3e1obal2o4m0ail3bh2o1x2n1odaddy5ld0point6f2odyear5g0le4p1t1v2p1q1r0ainger5phics5tis4een3ipe3ocery4up4s1t1u0cci3ge2ide2tars5ru3w1y2hair2mburg5ngout5us3bo2dfc0bank7ealth0care8lp1sinki6re1mes5iphop4samitsu7tachi5v2k0t2m1n1ockey4ldings5iday5medepot5goods5s0ense7nda3rse3spital5t0ing5t0els3mail5use3w2r1sbc3t1u0ghes5yatt3undai7ibm2cbc2e1u2d1e0ee3fm2kano4l1m0amat4db2mo0bilien9n0c1dustries8finiti5o2g1k1stitute6urance4e4t0ernational10uit4vestments10o1piranga7q1r0ish4s0maili5t0anbul7t0au2v3jaguar4va3cb2e0ep2tzt3welry6io2ll2m0p2nj2o0bs1urg4t1y2p0morgan6rs3uegos6kaufen5ddi3e0rryhotels6properties14fh2g1h1i0a1ds2m1ndle4tchen5wi3m1n1oeln3matsu5sher5p0mg2n2r0d1ed3uokgroup8w1y0oto4z2la0caixa5mborghini8er3nd0rover6xess5salle5t0ino3robe5w0yer5b1c1ds2ease3clerc5frak4gal2o2xus4gbt3i0dl2fe0insurance9style7ghting6ke2lly3mited4o2ncoln4k2ve1ing5k1lc1p2oan0s3cker3us3l1ndon4tte1o3ve3pl0financial11r1s1t0d0a3u0ndbeck6xe1ury5v1y2ma0drid4if1son4keup4n0agement7go3p1rket0ing3s4riott5shalls7ttel5ba2c0kinsey7d1e0d0ia3et2lbourne7me1orial6n0u2rck0msd7g1h1iami3crosoft7l1ni1t2t0subishi9k1l0b1s2m0a2n1o0bi0le4da2e1i1m1nash3ey2ster5rmon3tgage6scow4to0rcycles9v0ie4p1q1r1s0d2t0n1r2u0seum3ic4v1w1x1y1z2na0b1goya4me2vy3ba2c1e0c1t0bank4flix4work5ustar5w0s2xt0direct7us4f0l2g0o2hk2i0co2ke1on3nja3ssan1y5l1o0kia3rton4w0ruz3tv4p1r0a1w2tt2u1yc2z2obi1server7ffice5kinawa6layan0group9lo3m0ega4ne1g1l0ine5oo2pen3racle3nge4g0anic5igins6saka4tsuka4t2vh3pa0ge2nasonic7ris2s1tners4s1y3y2ccw3e0t2f0izer5g1h0armacy6d1ilips5one2to0graphy6s4ysio5ics1tet2ures6d1n0g1k2oneer5zza4k1l0ace2y0station9umbing5s3m1n0c2ohl2ker3litie5rn2st3r0axi3ess3ime3o0d0uctions8f1gressive8mo2perties3y5tection8u0dential9s1t1ub2w0c2y2qa1pon3uebec3st5racing4dio4e0ad1lestate6tor2y4cipes5d0umbrella9hab3ise0n3t2liance6n0t0als5pair3ort3ublican8st0aurant8view0s5xroth6ich0ardli6oh3l1o1p2o0cks3deo3gers4om3s0vp3u0gby3hr2n2w0e2yukyu6sa0arland6fe0ty4kura4le1on3msclub4ung5ndvik0coromant12ofi4p1rl2s1ve2xo3b0i1s2c0b1haeffler7midt4olarships8ol3ule3warz5ience5ot3d1e0arch3t2cure1ity6ek2lect4ner3rvices6ven3w1x0y3fr2g1h0angrila6rp3ell3ia1ksha5oes2p0ping5uji3w3i0lk2na1gles5te3j1k0i0n2y0pe4l0ing4m0art3ile4n0cf3o0ccer3ial4ftbank4ware6hu2lar2utions7ng1y2y2pa0ce3ort2t3r0l2s1t0ada2ples4r1tebank4farm7c0group6ockholm6rage3e3ream4udio2y3yle4u0cks3pplies3y2ort5rf1gery5zuki5v1watch4iss4x1y0dney4stems6z2tab1ipei4lk2obao4rget4tamotors6r2too4x0i3c0i2d0k2eam2ch0nology8l1masek5nnis4va3f1g1h0d1eater2re6iaa2ckets5enda4ps2res2ol4j0maxx4x2k0maxx5l1m0all4n1o0day3kyo3ols3p1ray3shiba5tal3urs3wn2yota3s3r0ade1ing4ining5vel0ers0insurance16ust3v2t1ube2i1nes3shu4v0s2w1z2ua1bank3s2g1k1nicom3versity8o2ol2ps2s1y1z2va0cations7na1guard7c1e0gas3ntures6risign5mögensberater2ung14sicherung10t2g1i0ajes4deo3g1king4llas4n1p1rgin4sa1ion4va1o3laanderen9n1odka3lvo3te1ing3o2yage5u2wales2mart4ter4ng0gou5tch0es6eather0channel12b0cam3er2site5d0ding5ibo2r3f1hoswho6ien2ki2lliamhill9n0dows4e1ners6me2oodside6rk0s2ld3w2s1tc1f3xbox3erox4ihuan4n2xx2yz3yachts4hoo3maxun5ndex5e1odobashi7ga2kohama6u0tube6t1un3za0ppos4ra3ero3ip2m1one3uerich6w2";
var encodedUtlds = "ελ1υ2бг1ел3дети4ею2католик6ом3мкд2он1сква6онлайн5рг3рус2ф2сайт3рб3укр3қаз3հայ3ישראל5קום3ابوظبي5رامكو5لاردن4بحرين5جزائر5سعودية6عليان5مغرب5مارات5یران5بارت2زار4يتك3ھارت5تونس4سودان3رية5شبكة4عراق2ب2مان4فلسطين6قطر3كاثوليك6وم3مصر2ليسيا5وريتانيا7قع4همراه5پاکستان7ڀارت4कॉम3नेट3भारत0म्3ोत5संगठन5বাংলা5ভারত2ৰত4ਭਾਰਤ4ભારત4ଭାରତ4இந்தியா6லங்கை6சிங்கப்பூர்11భారత్5ಭಾರತ4ഭാരതം5ලංකා4คอม3ไทย3ລາວ3გე2みんな3アマゾン4クラウド4グーグル4コム2ストア3セール3ファッション6ポイント4世界2中信1国1國1文网3亚马逊3企业2佛山2信息2健康2八卦2公司1益2台湾1灣2商城1店1标2嘉里0大酒店5在线2大拿2天主教3娱乐2家電2广东2微博2慈善2我爱你3手机2招聘2政务1府2新加坡2闻2时尚2書籍2机构2淡马锡3游戏2澳門2点看2移动2组织机构4网址1店1站1络2联通2谷歌2购物2通販2集团2電訊盈科4飞利浦3食品2餐厅2香格里拉3港2닷넷1컴2삼성2한국2";
/**
* Finite State Machine generation utilities
*/
/**
* @template T
* @typedef {{ [group: string]: T[] }} Collections
*/
/**
* @typedef {{ [group: string]: true }} Flags
*/
var numeric = "numeric";
var ascii = "ascii";
var alpha = "alpha";
var asciinumeric = "asciinumeric";
var alphanumeric = "alphanumeric";
var domain = "domain";
var emoji = "emoji";
var scheme = "scheme";
var slashscheme = "slashscheme";
var whitespace = "whitespace";
/**
* @template T
* @param {string} name
* @param {Collections<T>} groups to register in
* @returns {T[]} Current list of tokens in the given collection
*/
function registerGroup(name, groups) {
	if (!(name in groups)) groups[name] = [];
	return groups[name];
}
/**
* @template T
* @param {T} t token to add
* @param {Collections<T>} groups
* @param {Flags} flags
*/
function addToGroups(t, flags, groups) {
	if (flags[numeric]) {
		flags[asciinumeric] = true;
		flags[alphanumeric] = true;
	}
	if (flags[ascii]) {
		flags[asciinumeric] = true;
		flags[alpha] = true;
	}
	if (flags[asciinumeric]) flags[alphanumeric] = true;
	if (flags[alpha]) flags[alphanumeric] = true;
	if (flags[alphanumeric]) flags[domain] = true;
	if (flags[emoji]) flags[domain] = true;
	for (const k in flags) {
		const group = registerGroup(k, groups);
		if (group.indexOf(t) < 0) group.push(t);
	}
}
/**
* @template T
* @param {T} t token to check
* @param {Collections<T>} groups
* @returns {Flags} group flags that contain this token
*/
function flagsForToken(t, groups) {
	const result = {};
	for (const c in groups) if (groups[c].indexOf(t) >= 0) result[c] = true;
	return result;
}
/**
* @template T
* @typedef {null | T } Transition
*/
/**
* Define a basic state machine state. j is the list of character transitions,
* jr is the list of regex-match transitions, jd is the default state to
* transition to t is the accepting token type, if any. If this is the terminal
* state, then it does not emit a token.
*
* The template type T represents the type of the token this state accepts. This
* should be a string (such as of the token exports in `text.js`) or a
* MultiToken subclass (from `multi.js`)
*
* @template T
* @param {T} [token] Token that this state emits
*/
function State(token = null) {
	/** @type {{ [input: string]: State<T> }} j */
	this.j = {};
	/** @type {[RegExp, State<T>][]} jr */
	this.jr = [];
	/** @type {?State<T>} jd */
	this.jd = null;
	/** @type {?T} t */
	this.t = token;
}
/**
* Scanner token groups
* @type Collections<string>
*/
State.groups = {};
State.prototype = {
	accepts() {
		return !!this.t;
	},
	/**
	* Follow an existing transition from the given input to the next state.
	* Does not mutate.
	* @param {string} input character or token type to transition on
	* @returns {?State<T>} the next state, if any
	*/
	go(input) {
		const state = this;
		const nextState = state.j[input];
		if (nextState) return nextState;
		for (let i = 0; i < state.jr.length; i++) {
			const regex = state.jr[i][0];
			const nextState = state.jr[i][1];
			if (nextState && regex.test(input)) return nextState;
		}
		return state.jd;
	},
	/**
	* Whether the state has a transition for the given input. Set the second
	* argument to true to only look for an exact match (and not a default or
	* regular-expression-based transition)
	* @param {string} input
	* @param {boolean} exactOnly
	*/
	has(input, exactOnly = false) {
		return exactOnly ? input in this.j : !!this.go(input);
	},
	/**
	* Short for "transition all"; create a transition from the array of items
	* in the given list to the same final resulting state.
	* @param {string | string[]} inputs Group of inputs to transition on
	* @param {Transition<T> | State<T>} [next] Transition options
	* @param {Flags} [flags] Collections flags to add token to
	* @param {Collections<T>} [groups] Master list of token groups
	*/
	ta(inputs, next, flags, groups) {
		for (let i = 0; i < inputs.length; i++) this.tt(inputs[i], next, flags, groups);
	},
	/**
	* Short for "take regexp transition"; defines a transition for this state
	* when it encounters a token which matches the given regular expression
	* @param {RegExp} regexp Regular expression transition (populate first)
	* @param {T | State<T>} [next] Transition options
	* @param {Flags} [flags] Collections flags to add token to
	* @param {Collections<T>} [groups] Master list of token groups
	* @returns {State<T>} taken after the given input
	*/
	tr(regexp, next, flags, groups) {
		groups = groups || State.groups;
		let nextState;
		if (next && next.j) nextState = next;
		else {
			nextState = new State(next);
			if (flags && groups) addToGroups(next, flags, groups);
		}
		this.jr.push([regexp, nextState]);
		return nextState;
	},
	/**
	* Short for "take transitions", will take as many sequential transitions as
	* the length of the given input and returns the
	* resulting final state.
	* @param {string | string[]} input
	* @param {T | State<T>} [next] Transition options
	* @param {Flags} [flags] Collections flags to add token to
	* @param {Collections<T>} [groups] Master list of token groups
	* @returns {State<T>} taken after the given input
	*/
	ts(input, next, flags, groups) {
		let state = this;
		const len = input.length;
		if (!len) return state;
		for (let i = 0; i < len - 1; i++) state = state.tt(input[i]);
		return state.tt(input[len - 1], next, flags, groups);
	},
	/**
	* Short for "take transition", this is a method for building/working with
	* state machines.
	*
	* If a state already exists for the given input, returns it.
	*
	* If a token is specified, that state will emit that token when reached by
	* the linkify engine.
	*
	* If no state exists, it will be initialized with some default transitions
	* that resemble existing default transitions.
	*
	* If a state is given for the second argument, that state will be
	* transitioned to on the given input regardless of what that input
	* previously did.
	*
	* Specify a token group flags to define groups that this token belongs to.
	* The token will be added to corresponding entires in the given groups
	* object.
	*
	* @param {string} input character, token type to transition on
	* @param {T | State<T>} [next] Transition options
	* @param {Flags} [flags] Collections flags to add token to
	* @param {Collections<T>} [groups] Master list of groups
	* @returns {State<T>} taken after the given input
	*/
	tt(input, next, flags, groups) {
		groups = groups || State.groups;
		const state = this;
		if (next && next.j) {
			state.j[input] = next;
			return next;
		}
		const t = next;
		let nextState, templateState = state.go(input);
		if (templateState) {
			nextState = new State();
			Object.assign(nextState.j, templateState.j);
			nextState.jr.push.apply(nextState.jr, templateState.jr);
			nextState.jd = templateState.jd;
			nextState.t = templateState.t;
		} else nextState = new State();
		if (t) {
			if (groups) {
				if (nextState.t && typeof nextState.t === "string") addToGroups(t, Object.assign(flagsForToken(nextState.t, groups), flags), groups);
				else if (flags) addToGroups(t, flags, groups);
			}
			nextState.t = t;
		}
		state.j[input] = nextState;
		return nextState;
	}
};
/**
* @template T
* @param {State<T>} state
* @param {string | string[]} input
* @param {Flags} [flags]
* @param {Collections<T>} [groups]
*/
var ta = (state, input, next, flags, groups) => state.ta(input, next, flags, groups);
/**
* @template T
* @param {State<T>} state
* @param {RegExp} regexp
* @param {T | State<T>} [next]
* @param {Flags} [flags]
* @param {Collections<T>} [groups]
*/
var tr = (state, regexp, next, flags, groups) => state.tr(regexp, next, flags, groups);
/**
* @template T
* @param {State<T>} state
* @param {string | string[]} input
* @param {T | State<T>} [next]
* @param {Flags} [flags]
* @param {Collections<T>} [groups]
*/
var ts = (state, input, next, flags, groups) => state.ts(input, next, flags, groups);
/**
* @template T
* @param {State<T>} state
* @param {string} input
* @param {T | State<T>} [next]
* @param {Collections<T>} [groups]
* @param {Flags} [flags]
*/
var tt = (state, input, next, flags, groups) => state.tt(input, next, flags, groups);
/******************************************************************************
Text Tokens
Identifiers for token outputs from the regexp scanner
******************************************************************************/
var WORD = "WORD";
var UWORD = "UWORD";
var ASCIINUMERICAL = "ASCIINUMERICAL";
var ALPHANUMERICAL = "ALPHANUMERICAL";
var LOCALHOST = "LOCALHOST";
var TLD = "TLD";
var UTLD = "UTLD";
var SCHEME = "SCHEME";
var SLASH_SCHEME = "SLASH_SCHEME";
var NUM = "NUM";
var WS = "WS";
var NL = "NL";
var OPENBRACE = "OPENBRACE";
var CLOSEBRACE = "CLOSEBRACE";
var OPENBRACKET = "OPENBRACKET";
var CLOSEBRACKET = "CLOSEBRACKET";
var OPENPAREN = "OPENPAREN";
var CLOSEPAREN = "CLOSEPAREN";
var OPENANGLEBRACKET = "OPENANGLEBRACKET";
var CLOSEANGLEBRACKET = "CLOSEANGLEBRACKET";
var FULLWIDTHLEFTPAREN = "FULLWIDTHLEFTPAREN";
var FULLWIDTHRIGHTPAREN = "FULLWIDTHRIGHTPAREN";
var LEFTCORNERBRACKET = "LEFTCORNERBRACKET";
var RIGHTCORNERBRACKET = "RIGHTCORNERBRACKET";
var LEFTWHITECORNERBRACKET = "LEFTWHITECORNERBRACKET";
var RIGHTWHITECORNERBRACKET = "RIGHTWHITECORNERBRACKET";
var FULLWIDTHLESSTHAN = "FULLWIDTHLESSTHAN";
var FULLWIDTHGREATERTHAN = "FULLWIDTHGREATERTHAN";
var AMPERSAND = "AMPERSAND";
var APOSTROPHE = "APOSTROPHE";
var ASTERISK = "ASTERISK";
var AT = "AT";
var BACKSLASH = "BACKSLASH";
var BACKTICK = "BACKTICK";
var CARET = "CARET";
var COLON = "COLON";
var COMMA = "COMMA";
var DOLLAR = "DOLLAR";
var DOT = "DOT";
var EQUALS = "EQUALS";
var EXCLAMATION = "EXCLAMATION";
var HYPHEN = "HYPHEN";
var PERCENT = "PERCENT";
var PIPE = "PIPE";
var PLUS = "PLUS";
var POUND = "POUND";
var QUERY = "QUERY";
var QUOTE = "QUOTE";
var FULLWIDTHMIDDLEDOT = "FULLWIDTHMIDDLEDOT";
var SEMI = "SEMI";
var SLASH = "SLASH";
var TILDE = "TILDE";
var UNDERSCORE = "UNDERSCORE";
var EMOJI$1 = "EMOJI";
var SYM = "SYM";
var tk = /*#__PURE__*/ Object.freeze({
	__proto__: null,
	ALPHANUMERICAL,
	AMPERSAND,
	APOSTROPHE,
	ASCIINUMERICAL,
	ASTERISK,
	AT,
	BACKSLASH,
	BACKTICK,
	CARET,
	CLOSEANGLEBRACKET,
	CLOSEBRACE,
	CLOSEBRACKET,
	CLOSEPAREN,
	COLON,
	COMMA,
	DOLLAR,
	DOT,
	EMOJI: EMOJI$1,
	EQUALS,
	EXCLAMATION,
	FULLWIDTHGREATERTHAN,
	FULLWIDTHLEFTPAREN,
	FULLWIDTHLESSTHAN,
	FULLWIDTHMIDDLEDOT,
	FULLWIDTHRIGHTPAREN,
	HYPHEN,
	LEFTCORNERBRACKET,
	LEFTWHITECORNERBRACKET,
	LOCALHOST,
	NL,
	NUM,
	OPENANGLEBRACKET,
	OPENBRACE,
	OPENBRACKET,
	OPENPAREN,
	PERCENT,
	PIPE,
	PLUS,
	POUND,
	QUERY,
	QUOTE,
	RIGHTCORNERBRACKET,
	RIGHTWHITECORNERBRACKET,
	SCHEME,
	SEMI,
	SLASH,
	SLASH_SCHEME,
	SYM,
	TILDE,
	TLD,
	UNDERSCORE,
	UTLD,
	UWORD,
	WORD,
	WS
});
var ASCII_LETTER = /[a-z]/;
var LETTER = /[a-z]/i;
var EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]|\u{FE0F}/u;
try {
	LETTER = /* @__PURE__ */ new RegExp("\\p{L}", "u");
	EMOJI = /* @__PURE__ */ new RegExp("\\p{Emoji}", "u");
} catch {}
var DIGIT = /\d/;
var SPACE = /\s/;
/**
The scanner provides an interface that takes a string of text as input, and
outputs an array of tokens instances that can be used for easy URL parsing.
*/
var CR = "\r";
var LF = "\n";
var EMOJI_VARIATION = "️";
var EMOJI_JOINER = "‍";
var OBJECT_REPLACEMENT = "￼";
var tlds = null;
var utlds = null;
/**
* Scanner output token:
* - `t` is the token name (e.g., 'NUM', 'EMOJI', 'TLD')
* - `v` is the value of the token (e.g., '123', '❤️', 'com')
* - `s` is the start index of the token in the original string
* - `e` is the end index of the token in the original string
* @typedef {{t: string, v: string, s: number, e: number}} Token
*/
/**
* @template T
* @typedef {{ [collection: string]: T[] }} Collections
*/
/**
* Initialize the scanner character-based state machine for the given start
* state
* @param {[string, boolean][]} customSchemes List of custom schemes, where each
* item is a length-2 tuple with the first element set to the string scheme, and
* the second element set to `true` if the `://` after the scheme is optional
*/
function init$2(customSchemes = []) {
	/** @type Collections<string> */
	const groups = {};
	State.groups = groups;
	/** @type State<string> */
	const Start = new State();
	if (tlds == null) tlds = decodeTlds(encodedTlds);
	if (utlds == null) utlds = decodeTlds(encodedUtlds);
	tt(Start, "'", APOSTROPHE);
	tt(Start, "{", OPENBRACE);
	tt(Start, "}", CLOSEBRACE);
	tt(Start, "[", OPENBRACKET);
	tt(Start, "]", CLOSEBRACKET);
	tt(Start, "(", OPENPAREN);
	tt(Start, ")", CLOSEPAREN);
	tt(Start, "<", OPENANGLEBRACKET);
	tt(Start, ">", CLOSEANGLEBRACKET);
	tt(Start, "（", FULLWIDTHLEFTPAREN);
	tt(Start, "）", FULLWIDTHRIGHTPAREN);
	tt(Start, "「", LEFTCORNERBRACKET);
	tt(Start, "」", RIGHTCORNERBRACKET);
	tt(Start, "『", LEFTWHITECORNERBRACKET);
	tt(Start, "』", RIGHTWHITECORNERBRACKET);
	tt(Start, "＜", FULLWIDTHLESSTHAN);
	tt(Start, "＞", FULLWIDTHGREATERTHAN);
	tt(Start, "&", AMPERSAND);
	tt(Start, "*", ASTERISK);
	tt(Start, "@", AT);
	tt(Start, "`", BACKTICK);
	tt(Start, "^", CARET);
	tt(Start, ":", COLON);
	tt(Start, ",", COMMA);
	tt(Start, "$", DOLLAR);
	tt(Start, ".", DOT);
	tt(Start, "=", EQUALS);
	tt(Start, "!", EXCLAMATION);
	tt(Start, "-", HYPHEN);
	tt(Start, "%", PERCENT);
	tt(Start, "|", PIPE);
	tt(Start, "+", PLUS);
	tt(Start, "#", POUND);
	tt(Start, "?", QUERY);
	tt(Start, "\"", QUOTE);
	tt(Start, "/", SLASH);
	tt(Start, ";", SEMI);
	tt(Start, "~", TILDE);
	tt(Start, "_", UNDERSCORE);
	tt(Start, "\\", BACKSLASH);
	tt(Start, "・", FULLWIDTHMIDDLEDOT);
	const Num = tr(Start, DIGIT, NUM, { [numeric]: true });
	tr(Num, DIGIT, Num);
	const Asciinumeric = tr(Num, ASCII_LETTER, ASCIINUMERICAL, { [asciinumeric]: true });
	const Alphanumeric = tr(Num, LETTER, ALPHANUMERICAL, { [alphanumeric]: true });
	const Word = tr(Start, ASCII_LETTER, WORD, { [ascii]: true });
	tr(Word, DIGIT, Asciinumeric);
	tr(Word, ASCII_LETTER, Word);
	tr(Asciinumeric, DIGIT, Asciinumeric);
	tr(Asciinumeric, ASCII_LETTER, Asciinumeric);
	const UWord = tr(Start, LETTER, UWORD, { [alpha]: true });
	tr(UWord, ASCII_LETTER);
	tr(UWord, DIGIT, Alphanumeric);
	tr(UWord, LETTER, UWord);
	tr(Alphanumeric, DIGIT, Alphanumeric);
	tr(Alphanumeric, ASCII_LETTER);
	tr(Alphanumeric, LETTER, Alphanumeric);
	const Nl = tt(Start, LF, NL, { [whitespace]: true });
	const Cr = tt(Start, CR, WS, { [whitespace]: true });
	const Ws = tr(Start, SPACE, WS, { [whitespace]: true });
	tt(Start, OBJECT_REPLACEMENT, Ws);
	tt(Cr, LF, Nl);
	tt(Cr, OBJECT_REPLACEMENT, Ws);
	tr(Cr, SPACE, Ws);
	tt(Ws, CR);
	tt(Ws, LF);
	tr(Ws, SPACE, Ws);
	tt(Ws, OBJECT_REPLACEMENT, Ws);
	const Emoji = tr(Start, EMOJI, EMOJI$1, { [emoji]: true });
	tt(Emoji, "#");
	tr(Emoji, EMOJI, Emoji);
	tt(Emoji, EMOJI_VARIATION, Emoji);
	const EmojiJoiner = tt(Emoji, EMOJI_JOINER);
	tt(EmojiJoiner, "#");
	tr(EmojiJoiner, EMOJI, Emoji);
	const wordjr = [[ASCII_LETTER, Word], [DIGIT, Asciinumeric]];
	const uwordjr = [
		[ASCII_LETTER, null],
		[LETTER, UWord],
		[DIGIT, Alphanumeric]
	];
	for (let i = 0; i < tlds.length; i++) fastts(Start, tlds[i], TLD, WORD, wordjr);
	for (let i = 0; i < utlds.length; i++) fastts(Start, utlds[i], UTLD, UWORD, uwordjr);
	addToGroups(TLD, {
		tld: true,
		ascii: true
	}, groups);
	addToGroups(UTLD, {
		utld: true,
		alpha: true
	}, groups);
	fastts(Start, "file", SCHEME, WORD, wordjr);
	fastts(Start, "mailto", SCHEME, WORD, wordjr);
	fastts(Start, "http", SLASH_SCHEME, WORD, wordjr);
	fastts(Start, "https", SLASH_SCHEME, WORD, wordjr);
	fastts(Start, "ftp", SLASH_SCHEME, WORD, wordjr);
	fastts(Start, "ftps", SLASH_SCHEME, WORD, wordjr);
	addToGroups(SCHEME, {
		scheme: true,
		ascii: true
	}, groups);
	addToGroups(SLASH_SCHEME, {
		slashscheme: true,
		ascii: true
	}, groups);
	customSchemes = customSchemes.sort((a, b) => a[0] > b[0] ? 1 : -1);
	for (let i = 0; i < customSchemes.length; i++) {
		const sch = customSchemes[i][0];
		const flags = customSchemes[i][1] ? { [scheme]: true } : { [slashscheme]: true };
		if (sch.indexOf("-") >= 0) flags[domain] = true;
		else if (!ASCII_LETTER.test(sch)) flags[numeric] = true;
		else if (DIGIT.test(sch)) flags[asciinumeric] = true;
		else flags[ascii] = true;
		ts(Start, sch, sch, flags);
	}
	ts(Start, "localhost", LOCALHOST, { ascii: true });
	Start.jd = new State(SYM);
	return {
		start: Start,
		tokens: Object.assign({ groups }, tk)
	};
}
/**
Given a string, returns an array of TOKEN instances representing the
composition of that string.

@method run
@param {State<string>} start scanner starting state
@param {string} str input string to scan
@return {Token[]} list of tokens, each with a type and value
*/
function run$1(start, str) {
	const iterable = stringToArray(str.replace(/[A-Z]/g, (c) => c.toLowerCase()));
	const charCount = iterable.length;
	const tokens = [];
	let cursor = 0;
	let charCursor = 0;
	while (charCursor < charCount) {
		let state = start;
		let nextState = null;
		let tokenLength = 0;
		let latestAccepting = null;
		let sinceAccepts = -1;
		let charsSinceAccepts = -1;
		while (charCursor < charCount && (nextState = state.go(iterable[charCursor]))) {
			state = nextState;
			if (state.accepts()) {
				sinceAccepts = 0;
				charsSinceAccepts = 0;
				latestAccepting = state;
			} else if (sinceAccepts >= 0) {
				sinceAccepts += iterable[charCursor].length;
				charsSinceAccepts++;
			}
			tokenLength += iterable[charCursor].length;
			cursor += iterable[charCursor].length;
			charCursor++;
		}
		cursor -= sinceAccepts;
		charCursor -= charsSinceAccepts;
		tokenLength -= sinceAccepts;
		tokens.push({
			t: latestAccepting.t,
			v: str.slice(cursor - tokenLength, cursor),
			s: cursor - tokenLength,
			e: cursor
		});
	}
	return tokens;
}
/**
* Convert a String to an Array of characters, taking into account that some
* characters like emojis take up two string indexes.
*
* Adapted from core-js (MIT license)
* https://github.com/zloirock/core-js/blob/2d69cf5f99ab3ea3463c395df81e5a15b68f49d9/packages/core-js/internals/string-multibyte.js
*
* @function stringToArray
* @param {string} str
* @returns {string[]}
*/
function stringToArray(str) {
	const result = [];
	const len = str.length;
	let index = 0;
	while (index < len) {
		let first = str.charCodeAt(index);
		let second;
		let char = first < 55296 || first > 56319 || index + 1 === len || (second = str.charCodeAt(index + 1)) < 56320 || second > 57343 ? str[index] : str.slice(index, index + 2);
		result.push(char);
		index += char.length;
	}
	return result;
}
/**
* Fast version of ts function for when transition defaults are well known
* @param {State<string>} state
* @param {string} input
* @param {string} t
* @param {string} defaultt
* @param {[RegExp, State<string>][]} jr
* @returns {State<string>}
*/
function fastts(state, input, t, defaultt, jr) {
	let next;
	const len = input.length;
	for (let i = 0; i < len - 1; i++) {
		const char = input[i];
		if (state.j[char]) next = state.j[char];
		else {
			next = new State(defaultt);
			next.jr = jr.slice();
			state.j[char] = next;
		}
		state = next;
	}
	next = new State(t);
	next.jr = jr.slice();
	state.j[input[len - 1]] = next;
	return next;
}
/**
* Converts a string of Top-Level Domain names encoded in update-tlds.js back
* into a list of strings.
* @param {str} encoded encoded TLDs string
* @returns {str[]} original TLDs list
*/
function decodeTlds(encoded) {
	const words = [];
	const stack = [];
	let i = 0;
	let digits = "0123456789";
	while (i < encoded.length) {
		let popDigitCount = 0;
		while (digits.indexOf(encoded[i + popDigitCount]) >= 0) popDigitCount++;
		if (popDigitCount > 0) {
			words.push(stack.join(""));
			for (let popCount = parseInt(encoded.substring(i, i + popDigitCount), 10); popCount > 0; popCount--) stack.pop();
			i += popDigitCount;
		} else {
			stack.push(encoded[i]);
			i++;
		}
	}
	return words;
}
/**
* An object where each key is a valid DOM Event Name such as `click` or `focus`
* and each value is an event handler function.
*
* https://developer.mozilla.org/en-US/docs/Web/API/Element#events
* @typedef {?{ [event: string]: Function }} EventListeners
*/
/**
* All formatted properties required to render a link, including `tagName`,
* `attributes`, `content` and `eventListeners`.
* @typedef {{ tagName: any, attributes: {[attr: string]: any}, content: string,
* eventListeners: EventListeners }} IntermediateRepresentation
*/
/**
* Specify either an object described by the template type `O` or a function.
*
* The function takes a string value (usually the link's href attribute), the
* link type (`'url'`, `'hashtag`', etc.) and an internal token representation
* of the link. It should return an object of the template type `O`
* @template O
* @typedef {O | ((value: string, type: string, token: MultiToken) => O)} OptObj
*/
/**
* Specify either a function described by template type `F` or an object.
*
* Each key in the object should be a link type (`'url'`, `'hashtag`', etc.). Each
* value should be a function with template type `F` that is called when the
* corresponding link type is encountered.
* @template F
* @typedef {F | { [type: string]: F}} OptFn
*/
/**
* Specify either a value with template type `V`, a function that returns `V` or
* an object where each value resolves to `V`.
*
* The function takes a string value (usually the link's href attribute), the
* link type (`'url'`, `'hashtag`', etc.) and an internal token representation
* of the link. It should return an object of the template type `V`
*
* For the object, each key should be a link type (`'url'`, `'hashtag`', etc.).
* Each value should either have type `V` or a function that returns V. This
* function similarly takes a string value and a token.
*
* Example valid types for `Opt<string>`:
*
* ```js
* 'hello'
* (value, type, token) => 'world'
* { url: 'hello', email: (value, token) => 'world'}
* ```
* @template V
* @typedef {V | ((value: string, type: string, token: MultiToken) => V) | { [type: string]: V | ((value: string, token: MultiToken) => V) }} Opt
*/
/**
* See available options: https://linkify.js.org/docs/options.html
* @typedef {{
* 	defaultProtocol?: string,
*  events?: OptObj<EventListeners>,
* 	format?: Opt<string>,
* 	formatHref?: Opt<string>,
* 	nl2br?: boolean,
* 	tagName?: Opt<any>,
* 	target?: Opt<string>,
* 	rel?: Opt<string>,
* 	validate?: Opt<boolean>,
* 	truncate?: Opt<number>,
* 	className?: Opt<string>,
* 	attributes?: OptObj<({ [attr: string]: any })>,
*  ignoreTags?: string[],
*  ignoreClasses?: string[],
* 	render?: OptFn<((ir: IntermediateRepresentation) => any)>
* }} Opts
*/
/**
* @type Required<Opts>
*/
var defaults = {
	defaultProtocol: "http",
	events: null,
	format: noop,
	formatHref: noop,
	nl2br: false,
	tagName: "a",
	target: null,
	rel: null,
	validate: true,
	truncate: Infinity,
	className: null,
	attributes: null,
	ignoreTags: [],
	ignoreClasses: [],
	render: null
};
/**
* Utility class for linkify interfaces to apply specified
* {@link Opts formatting and rendering options}.
*
* @param {Opts | Options} [opts] Option value overrides.
* @param {(ir: IntermediateRepresentation) => any} [defaultRender] (For
*   internal use) default render function that determines how to generate an
*   HTML element based on a link token's derived tagName, attributes and HTML.
*   Similar to render option
*/
function Options(opts, defaultRender = null) {
	let o = Object.assign({}, defaults);
	if (opts) o = Object.assign(o, opts instanceof Options ? opts.o : opts);
	const ignoredTags = o.ignoreTags;
	const uppercaseIgnoredTags = [];
	for (let i = 0; i < ignoredTags.length; i++) uppercaseIgnoredTags.push(ignoredTags[i].toUpperCase());
	/** @protected */
	this.o = o;
	if (defaultRender) this.defaultRender = defaultRender;
	this.ignoreTags = uppercaseIgnoredTags;
	this.ignoreClasses = o.ignoreClasses.slice();
}
Options.prototype = {
	o: defaults,
	/**
	* @type string[]
	*/
	ignoreTags: [],
	/**
	* @type string[]
	*/
	ignoreClasses: [],
	/**
	* Returns whether a whitespace-separated class attribute contains an
	* ignored class name.
	* @param {unknown} classNames
	* @returns {boolean}
	*/
	isIgnoredClass(classNames) {
		if (typeof classNames !== "string" || this.ignoreClasses.length === 0) return false;
		const classes = classNames.split(/\s+/);
		for (let i = 0; i < classes.length; i++) if (this.ignoreClasses.indexOf(classes[i]) >= 0) return true;
		return false;
	},
	/**
	* @param {IntermediateRepresentation} ir
	* @returns {any}
	*/
	defaultRender(ir) {
		return ir;
	},
	/**
	* Returns true or false based on whether a token should be displayed as a
	* link based on the user options.
	* @param {MultiToken} token
	* @returns {boolean}
	*/
	check(token) {
		return this.get("validate", token.toString(), token);
	},
	/**
	* Resolve an option's value based on the value of the option and the given
	* params. If operator and token are specified and the target option is
	* callable, automatically calls the function with the given argument.
	* @template {keyof Opts} K
	* @param {K} key Name of option to use
	* @param {string} [operator] will be passed to the target option if it's a
	* function. If not specified, RAW function value gets returned
	* @param {MultiToken} [token] The token from linkify.tokenize
	* @returns {Opts[K] | any}
	*/
	get(key, operator, token) {
		const isCallable = operator != null;
		let option = this.o[key];
		if (!option) return option;
		if (typeof option === "object") {
			option = token.t in option ? option[token.t] : defaults[key];
			if (typeof option === "function" && isCallable) option = option(operator, token);
		} else if (typeof option === "function" && isCallable) option = option(operator, token.t, token);
		return option;
	},
	/**
	* @template {keyof Opts} L
	* @param {L} key Name of options object to use
	* @param {string} [operator]
	* @param {MultiToken} [token]
	* @returns {Opts[L] | any}
	*/
	getObj(key, operator, token) {
		let obj = this.o[key];
		if (typeof obj === "function" && operator != null) obj = obj(operator, token.t, token);
		return obj;
	},
	/**
	* Convert the given token to a rendered element that may be added to the
	* calling-interface's DOM
	* @param {MultiToken} token Token to render to an HTML element
	* @returns {any} Render result; e.g., HTML string, DOM element, React
	*   Component, etc.
	*/
	render(token) {
		const ir = token.render(this);
		return (this.get("render", null, token) || this.defaultRender)(ir, token.t, token);
	}
};
function noop(val) {
	return val;
}
/******************************************************************************
Multi-Tokens
Tokens composed of arrays of TextTokens
******************************************************************************/
/**
* @param {string} value
* @param {Token[]} tokens
*/
function MultiToken(value, tokens) {
	this.t = "token";
	this.v = value;
	this.tk = tokens;
}
/**
* Abstract class used for manufacturing tokens of text tokens. That is rather
* than the value for a token being a small string of text, it's value an array
* of text tokens.
*
* Used for grouping together URLs, emails, hashtags, and other potential
* creations.
* @class MultiToken
* @property {string} t
* @property {string} v
* @property {Token[]} tk
* @abstract
*/
MultiToken.prototype = {
	isLink: false,
	/**
	* Return the string this token represents.
	* @return {string}
	*/
	toString() {
		return this.v;
	},
	/**
	* What should the value for this token be in the `href` HTML attribute?
	* Returns the `.toString` value by default.
	* @param {string} [scheme]
	* @return {string}
	*/
	toHref(scheme) {
		return this.toString();
	},
	/**
	* @param {Options} options Formatting options
	* @returns {string}
	*/
	toFormattedString(options) {
		const val = this.toString();
		const truncate = options.get("truncate", val, this);
		const formatted = options.get("format", val, this);
		return truncate && formatted.length > truncate ? formatted.substring(0, truncate) + "…" : formatted;
	},
	/**
	*
	* @param {Options} options
	* @returns {string}
	*/
	toFormattedHref(options) {
		return options.get("formatHref", this.toHref(options.get("defaultProtocol")), this);
	},
	/**
	* The start index of this token in the original input string
	* @returns {number}
	*/
	startIndex() {
		return this.tk[0].s;
	},
	/**
	* The end index of this token in the original input string (up to this
	* index but not including it)
	* @returns {number}
	*/
	endIndex() {
		return this.tk[this.tk.length - 1].e;
	},
	/**
	Returns an object  of relevant values for this token, which includes keys
	* type - Kind of token ('url', 'email', etc.)
	* value - Original text
	* href - The value that should be added to the anchor tag's href
	attribute
	@method toObject
	@param {string} [protocol] `'http'` by default
	*/
	toObject(protocol = defaults.defaultProtocol) {
		return {
			type: this.t,
			value: this.toString(),
			isLink: this.isLink,
			href: this.toHref(protocol),
			start: this.startIndex(),
			end: this.endIndex()
		};
	},
	/**
	*
	* @param {Options} options Formatting option
	*/
	toFormattedObject(options) {
		return {
			type: this.t,
			value: this.toFormattedString(options),
			isLink: this.isLink,
			href: this.toFormattedHref(options),
			start: this.startIndex(),
			end: this.endIndex()
		};
	},
	/**
	* Whether this token should be rendered as a link according to the given options
	* @param {Options} options
	* @returns {boolean}
	*/
	validate(options) {
		return options.get("validate", this.toString(), this);
	},
	/**
	* Return an object that represents how this link should be rendered.
	* @param {Options} options Formattinng options
	*/
	render(options) {
		const token = this;
		const href = this.toHref(options.get("defaultProtocol"));
		const formattedHref = options.get("formatHref", href, this);
		const tagName = options.get("tagName", href, token);
		const content = this.toFormattedString(options);
		const attributes = {};
		const className = options.get("className", href, token);
		const target = options.get("target", href, token);
		const rel = options.get("rel", href, token);
		const attrs = options.getObj("attributes", href, token);
		const eventListeners = options.getObj("events", href, token);
		attributes.href = formattedHref;
		if (className) attributes.class = className;
		if (target) attributes.target = target;
		if (rel) attributes.rel = rel;
		if (attrs) Object.assign(attributes, attrs);
		return {
			tagName,
			attributes,
			content,
			eventListeners
		};
	}
};
/**
* Create a new token that can be emitted by the parser state machine
* @param {string} type readable type of the token
* @param {object} props properties to assign or override, including isLink = true or false
* @returns {new (value: string, tokens: Token[]) => MultiToken} new token class
*/
function createTokenClass(type, props) {
	class Token extends MultiToken {
		constructor(value, tokens) {
			super(value, tokens);
			this.t = type;
		}
	}
	for (const p in props) Token.prototype[p] = props[p];
	Token.t = type;
	return Token;
}
/**
Represents a list of tokens making up a valid email address
*/
var Email = createTokenClass("email", {
	isLink: true,
	toHref() {
		return "mailto:" + this.toString();
	}
});
/**
Represents some plain text
*/
var Text$1 = createTokenClass("text");
/**
Multi-linebreak token - represents a line break
@class Nl
*/
var Nl = createTokenClass("nl");
/**
Represents a list of text tokens making up a valid URL
@class Url
*/
var Url = createTokenClass("url", {
	isLink: true,
	/**
	Lowercases relevant parts of the domain and adds the protocol if
	required. Note that this will not escape unsafe HTML characters in the
	URL.
	@param {string} [scheme] default scheme (e.g., 'https')
	@return {string} the full href
	*/
	toHref(scheme = defaults.defaultProtocol) {
		return this.hasProtocol() ? this.v : `${scheme}://${this.v}`;
	},
	/**
	* Check whether this URL token has a protocol
	* @return {boolean}
	*/
	hasProtocol() {
		const tokens = this.tk;
		return tokens.length >= 2 && tokens[0].t !== LOCALHOST && tokens[1].t === COLON;
	}
});
/**
Not exactly parser, more like the second-stage scanner (although we can
theoretically hotswap the code here with a real parser in the future... but
for a little URL-finding utility abstract syntax trees may be a little
overkill).

URL format: http://en.wikipedia.org/wiki/URI_scheme
Email format: http://en.wikipedia.org/wiki/EmailAddress (links to RFC in
reference)

@module linkify
@submodule parser
@main run
*/
var makeState = (arg) => new State(arg);
/**
* Generate the parser multi token-based state machine
* @param {{ groups: Collections<string> }} tokens
*/
function init$1({ groups }) {
	const qsAccepting = groups.domain.concat([
		AMPERSAND,
		ASTERISK,
		AT,
		BACKSLASH,
		BACKTICK,
		CARET,
		DOLLAR,
		EQUALS,
		HYPHEN,
		NUM,
		PERCENT,
		PIPE,
		PLUS,
		POUND,
		SLASH,
		SYM,
		TILDE,
		UNDERSCORE
	]);
	const qsNonAccepting = [
		APOSTROPHE,
		COLON,
		COMMA,
		DOT,
		EXCLAMATION,
		PERCENT,
		QUERY,
		QUOTE,
		SEMI,
		OPENANGLEBRACKET,
		CLOSEANGLEBRACKET,
		OPENBRACE,
		CLOSEBRACE,
		CLOSEBRACKET,
		OPENBRACKET,
		OPENPAREN,
		CLOSEPAREN,
		FULLWIDTHLEFTPAREN,
		FULLWIDTHRIGHTPAREN,
		LEFTCORNERBRACKET,
		RIGHTCORNERBRACKET,
		LEFTWHITECORNERBRACKET,
		RIGHTWHITECORNERBRACKET,
		FULLWIDTHLESSTHAN,
		FULLWIDTHGREATERTHAN
	];
	const localpartAccepting = [
		AMPERSAND,
		APOSTROPHE,
		ASTERISK,
		BACKSLASH,
		BACKTICK,
		CARET,
		DOLLAR,
		EQUALS,
		HYPHEN,
		OPENBRACE,
		CLOSEBRACE,
		PERCENT,
		PIPE,
		PLUS,
		POUND,
		QUERY,
		SLASH,
		SYM,
		TILDE,
		UNDERSCORE
	];
	/**
	* @type State<Token>
	*/
	const Start = makeState();
	const Localpart = tt(Start, TILDE);
	ta(Localpart, localpartAccepting, Localpart);
	ta(Localpart, groups.domain, Localpart);
	const Domain = makeState(), Scheme = makeState(), SlashScheme = makeState();
	ta(Start, groups.domain, Domain);
	ta(Start, groups.scheme, Scheme);
	ta(Start, groups.slashscheme, SlashScheme);
	ta(Domain, localpartAccepting, Localpart);
	ta(Domain, groups.domain, Domain);
	const LocalpartAt = tt(Domain, AT);
	tt(Localpart, AT, LocalpartAt);
	tt(Scheme, AT, LocalpartAt);
	tt(SlashScheme, AT, LocalpartAt);
	const LocalpartDot = tt(Localpart, DOT);
	ta(LocalpartDot, localpartAccepting, Localpart);
	ta(LocalpartDot, groups.domain, Localpart);
	const EmailDomain = makeState();
	ta(LocalpartAt, groups.domain, EmailDomain);
	ta(EmailDomain, groups.domain, EmailDomain);
	const EmailDomainDot = tt(EmailDomain, DOT);
	ta(EmailDomainDot, groups.domain, EmailDomain);
	const Email$1 = makeState(Email);
	ta(EmailDomainDot, groups.tld, Email$1);
	ta(EmailDomainDot, groups.utld, Email$1);
	tt(LocalpartAt, LOCALHOST, Email$1);
	const EmailDomainHyphen = tt(EmailDomain, HYPHEN);
	tt(EmailDomainHyphen, HYPHEN, EmailDomainHyphen);
	ta(EmailDomainHyphen, groups.domain, EmailDomain);
	ta(Email$1, groups.domain, EmailDomain);
	tt(Email$1, DOT, EmailDomainDot);
	tt(Email$1, HYPHEN, EmailDomainHyphen);
	const DomainHyphen = tt(Domain, HYPHEN);
	const DomainDot = tt(Domain, DOT);
	tt(DomainHyphen, HYPHEN, DomainHyphen);
	ta(DomainHyphen, groups.domain, Domain);
	ta(DomainDot, localpartAccepting, Localpart);
	ta(DomainDot, groups.domain, Domain);
	const DomainDotTld = makeState(Url);
	ta(DomainDot, groups.tld, DomainDotTld);
	ta(DomainDot, groups.utld, DomainDotTld);
	ta(DomainDotTld, groups.domain, Domain);
	ta(DomainDotTld, localpartAccepting, Localpart);
	tt(DomainDotTld, DOT, DomainDot);
	tt(DomainDotTld, HYPHEN, DomainHyphen);
	tt(DomainDotTld, AT, LocalpartAt);
	const DomainDotTldColon = tt(DomainDotTld, COLON);
	const DomainDotTldColonPort = makeState(Url);
	ta(DomainDotTldColon, groups.numeric, DomainDotTldColonPort);
	const Url$1 = makeState(Url);
	const UrlNonaccept = makeState();
	ta(Url$1, qsAccepting, Url$1);
	ta(Url$1, qsNonAccepting, UrlNonaccept);
	ta(UrlNonaccept, qsAccepting, Url$1);
	ta(UrlNonaccept, qsNonAccepting, UrlNonaccept);
	tt(DomainDotTld, SLASH, Url$1);
	tt(DomainDotTldColonPort, SLASH, Url$1);
	tt(DomainDotTld, QUERY, UrlNonaccept);
	tt(DomainDotTld, POUND, Url$1);
	tt(DomainDotTldColonPort, QUERY, UrlNonaccept);
	tt(DomainDotTldColonPort, POUND, Url$1);
	const SchemeColon = tt(Scheme, COLON);
	const UriPrefix = tt(tt(tt(SlashScheme, COLON), SLASH), SLASH);
	ta(Scheme, groups.domain, Domain);
	tt(Scheme, DOT, DomainDot);
	tt(Scheme, HYPHEN, DomainHyphen);
	ta(SlashScheme, groups.domain, Domain);
	tt(SlashScheme, DOT, DomainDot);
	tt(SlashScheme, HYPHEN, DomainHyphen);
	ta(SchemeColon, groups.domain, Url$1);
	tt(SchemeColon, SLASH, Url$1);
	tt(SchemeColon, QUERY, Url$1);
	ta(UriPrefix, groups.domain, Url$1);
	ta(UriPrefix, qsAccepting, Url$1);
	tt(UriPrefix, SLASH, Url$1);
	const bracketPairs = [
		[OPENBRACE, CLOSEBRACE],
		[OPENBRACKET, CLOSEBRACKET],
		[OPENPAREN, CLOSEPAREN],
		[OPENANGLEBRACKET, CLOSEANGLEBRACKET],
		[FULLWIDTHLEFTPAREN, FULLWIDTHRIGHTPAREN],
		[LEFTCORNERBRACKET, RIGHTCORNERBRACKET],
		[LEFTWHITECORNERBRACKET, RIGHTWHITECORNERBRACKET],
		[FULLWIDTHLESSTHAN, FULLWIDTHGREATERTHAN]
	];
	for (let i = 0; i < bracketPairs.length; i++) {
		const [OPEN, CLOSE] = bracketPairs[i];
		const UrlOpen = tt(Url$1, OPEN);
		tt(UrlNonaccept, OPEN, UrlOpen);
		const UrlOpenQ = makeState(Url);
		ta(UrlOpen, qsAccepting, UrlOpenQ);
		const UrlOpenSyms = makeState();
		ta(UrlOpen, qsNonAccepting, UrlOpenSyms);
		tt(UrlOpen, CLOSE, Url$1);
		ta(UrlOpenQ, qsAccepting, UrlOpenQ);
		ta(UrlOpenQ, qsNonAccepting, UrlOpenSyms);
		ta(UrlOpenSyms, qsAccepting, UrlOpenQ);
		ta(UrlOpenSyms, qsNonAccepting, UrlOpenSyms);
		tt(UrlOpenQ, CLOSE, Url$1);
		tt(UrlOpenSyms, CLOSE, Url$1);
	}
	tt(Start, LOCALHOST, DomainDotTld);
	tt(Start, NL, Nl);
	return {
		start: Start,
		tokens: tk
	};
}
/**
* Run the parser state machine on a list of scanned string-based tokens to
* create a list of multi tokens, each of which represents a URL, email address,
* plain text, etc.
*
* @param {State<MultiToken>} start parser start state
* @param {string} input the original input used to generate the given tokens
* @param {Token[]} tokens list of scanned tokens
* @returns {MultiToken[]}
*/
function run(start, input, tokens) {
	let len = tokens.length;
	let cursor = 0;
	let multis = [];
	let textTokens = [];
	/** @type {Array<Set<State<MultiToken>> | undefined>} */
	const dead = [];
	while (cursor < len) {
		let state = start;
		let secondState = null;
		let nextState = null;
		let multiLength = 0;
		let latestAccepting = null;
		let sinceAccepts = -1;
		let visited = [];
		while (cursor < len && !(secondState = state.go(tokens[cursor].t))) textTokens.push(tokens[cursor++]);
		while (cursor < len && (nextState = secondState || state.go(tokens[cursor].t))) {
			secondState = null;
			state = nextState;
			cursor++;
			multiLength++;
			if (state.accepts()) {
				sinceAccepts = 0;
				latestAccepting = state;
				visited = [];
			} else {
				if (sinceAccepts >= 0) sinceAccepts++;
				visited.push(state);
				if (dead[cursor] && dead[cursor].has(state)) break;
			}
		}
		for (let k = 0, pos = cursor - visited.length + 1; k < visited.length; k++, pos++) (dead[pos] || (dead[pos] = /* @__PURE__ */ new Set())).add(visited[k]);
		if (sinceAccepts < 0) {
			cursor -= multiLength;
			if (cursor < len) {
				textTokens.push(tokens[cursor]);
				cursor++;
			}
		} else {
			if (textTokens.length > 0) {
				multis.push(initMultiToken(Text$1, input, textTokens));
				textTokens = [];
			}
			cursor -= sinceAccepts;
			multiLength -= sinceAccepts;
			const Multi = latestAccepting.t;
			const subtokens = tokens.slice(cursor - multiLength, cursor);
			multis.push(initMultiToken(Multi, input, subtokens));
		}
	}
	if (textTokens.length > 0) multis.push(initMultiToken(Text$1, input, textTokens));
	return multis;
}
/**
* Utility function for instantiating a new multitoken with all the relevant
* fields during parsing.
* @param {new (value: string, tokens: Token[]) => MultiToken} Multi class to instantiate
* @param {string} input original input string
* @param {Token[]} tokens consecutive tokens scanned from input string
* @returns {MultiToken}
*/
function initMultiToken(Multi, input, tokens) {
	const startIdx = tokens[0].s;
	const endIdx = tokens[tokens.length - 1].e;
	return new Multi(input.slice(startIdx, endIdx), tokens);
}
var warn = typeof console !== "undefined" && console && console.warn || (() => {});
var warnAdvice = "until manual call of linkify.init(). Register all schemes and plugins before invoking linkify the first time.";
var INIT = {
	scanner: null,
	parser: null,
	tokenQueue: [],
	pluginQueue: [],
	customSchemes: [],
	initialized: false
};
/**
* @typedef {{
* 	start: State<string>,
* 	tokens: { groups: Collections<string> } & typeof tk
* }} ScannerInit
*/
/**
* @typedef {{
* 	start: State<MultiToken>,
* 	tokens: typeof multi
* }} ParserInit
*/
/**
* @typedef {(arg: { scanner: ScannerInit }) => void} TokenPlugin
*/
/**
* @typedef {(arg: { scanner: ScannerInit, parser: ParserInit }) => void} Plugin
*/
/**
* De-register all plugins and reset the internal state-machine. Used for
* testing; not required in practice.
* @private
*/
function reset() {
	State.groups = {};
	INIT.scanner = null;
	INIT.parser = null;
	INIT.tokenQueue = [];
	INIT.pluginQueue = [];
	INIT.customSchemes = [];
	INIT.initialized = false;
	return INIT;
}
/**
* Detect URLs with the following additional protocol. Anything with format
* "protocol://..." will be considered a link. If `optionalSlashSlash` is set to
* `true`, anything with format "protocol:..." will be considered a link.
* @param {string} scheme
* @param {boolean} [optionalSlashSlash]
*/
function registerCustomProtocol(scheme, optionalSlashSlash = false) {
	if (INIT.initialized) warn(`linkifyjs: already initialized - will not register custom scheme "${scheme}" ${warnAdvice}`);
	if (!/^[0-9a-z]+(-[0-9a-z]+)*$/.test(scheme)) throw new Error(`linkifyjs: incorrect scheme format.
1. Must only contain digits, lowercase ASCII letters or "-"
2. Cannot start or end with "-"
3. "-" cannot repeat`);
	INIT.customSchemes.push([scheme, optionalSlashSlash]);
}
/**
* Initialize the linkify state machine. Called automatically the first time
* linkify is called on a string, but may be called manually as well.
*/
function init() {
	INIT.scanner = init$2(INIT.customSchemes);
	for (let i = 0; i < INIT.tokenQueue.length; i++) INIT.tokenQueue[i][1]({ scanner: INIT.scanner });
	INIT.parser = init$1(INIT.scanner.tokens);
	for (let i = 0; i < INIT.pluginQueue.length; i++) INIT.pluginQueue[i][1]({
		scanner: INIT.scanner,
		parser: INIT.parser
	});
	INIT.initialized = true;
	return INIT;
}
/**
* Parse a string into tokens that represent linkable and non-linkable sub-components
* @param {string} str
* @return {MultiToken[]} tokens
*/
function tokenize(str) {
	if (!INIT.initialized) init();
	return run(INIT.parser.start, str, run$1(INIT.scanner.start, str));
}
tokenize.scan = run$1;
/**
* Find a list of linkable items in the given string.
* @param {string} str string to find links in
* @param {string | Opts} [type] either formatting options or specific type of
* links to find, e.g., 'url' or 'email'
* @param {Opts} [opts] formatting options for final output. Cannot be specified
* if opts already provided in `type` argument
*/
function find(str, type = null, opts = null) {
	if (type && typeof type === "object") {
		if (opts) throw Error(`linkifyjs: Invalid link type ${type}; must be a string`);
		opts = type;
		type = null;
	}
	const options = new Options(opts);
	const tokens = tokenize(str);
	const filtered = [];
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (token.isLink && (!type || token.t === type) && options.check(token)) filtered.push(token.toFormattedObject(options));
	}
	return filtered;
}
// ../DnD helper/node_modules/@tiptap/extension-link/dist/index.js
var UNICODE_WHITESPACE_PATTERN = "[\0- \xA0 ᠎ -\u2029 　]";
var UNICODE_WHITESPACE_REGEX = new RegExp(UNICODE_WHITESPACE_PATTERN);
var UNICODE_WHITESPACE_REGEX_END = new RegExp(`${UNICODE_WHITESPACE_PATTERN}$`);
var UNICODE_WHITESPACE_REGEX_TRAILING = new RegExp(`${UNICODE_WHITESPACE_PATTERN}+$`);
var UNICODE_WHITESPACE_REGEX_GLOBAL = new RegExp(UNICODE_WHITESPACE_PATTERN, "g");
function unlinkTrailingWhitespace(tr, range, type) {
	var _rangeEnd$nodeBefore, _insertedText$match;
	const rangeEnd = tr.doc.resolve(range.to);
	if (!((_rangeEnd$nodeBefore = rangeEnd.nodeBefore) === null || _rangeEnd$nodeBefore === void 0 ? void 0 : _rangeEnd$nodeBefore.isText)) return;
	const trailingWhitespace = (_insertedText$match = tr.doc.textBetween(range.from, range.to, "￼", "￼").match(UNICODE_WHITESPACE_REGEX_TRAILING)) === null || _insertedText$match === void 0 ? void 0 : _insertedText$match[0];
	if (!trailingWhitespace) return;
	const whitespaceFrom = range.to - trailingWhitespace.length;
	const linkMarks = getMarksBetween(whitespaceFrom, range.to, tr.doc).filter((item) => item.mark.type === type);
	if (!linkMarks.length) return;
	const { nodeAfter } = rangeEnd;
	if (!!nodeAfter && linkMarks.some((item) => item.mark.isInSet(nodeAfter.marks))) return;
	const storedMarks = tr.storedMarks;
	tr.removeMark(whitespaceFrom, range.to, type);
	tr.setStoredMarks(storedMarks);
	if (tr.selection.empty && tr.selection.from === range.to) tr.removeStoredMark(type);
}
/**
* Check if the provided tokens form a valid link structure, which can either be a single link token
* or a link token surrounded by parentheses or square brackets.
*
* This ensures that only complete and valid text is hyperlinked, preventing cases where a valid
* top-level domain (TLD) is immediately followed by an invalid character, like a number. For
* example, with the `find` method from Linkify, entering `example.com1` would result in
* `example.com` being linked and the trailing `1` left as plain text. By using the `tokenize`
* method, we can perform more comprehensive validation on the input text.
*/
function isValidLinkStructure(tokens) {
	if (tokens.length === 1) return tokens[0].isLink;
	if (tokens.length === 3 && tokens[1].isLink) return ["()", "[]"].includes(tokens[0].value + tokens[2].value);
	return false;
}
/**
* This plugin allows you to automatically add links to your editor.
* @param options The plugin options
* @returns The plugin instance
*/
function autolink(options) {
	return new Plugin({
		key: new PluginKey("autolink"),
		appendTransaction: (transactions, oldState, newState) => {
			/**
			* Does the transaction change the document?
			*/
			const docChanges = transactions.some((transaction) => transaction.docChanged) && !oldState.doc.eq(newState.doc);
			/**
			* Prevent autolink if the transaction is not a document change or if the transaction has the meta `preventAutolink`.
			*/
			const preventAutolink = transactions.some((transaction) => transaction.getMeta("preventAutolink"));
			/**
			* Prevent autolink if the transaction is not a document change
			* or if the transaction has the meta `preventAutolink`.
			*/
			if (!docChanges || preventAutolink) return;
			const { tr } = newState;
			const transform = combineTransactionSteps(oldState.doc, [...transactions]);
			if (!transactions.some(isHistoryTransaction)) {
				const insertedRanges = [];
				transform.steps.forEach((step, index) => {
					if (!(step instanceof ReplaceStep) || !step.slice.size) return;
					const mapping = transform.mapping.slice(index + 1);
					const from = mapping.map(step.from, 1);
					const to = mapping.map(step.from + step.slice.size, -1);
					if (from < to) insertedRanges.push({
						from,
						to
					});
				});
				insertedRanges.sort((left, right) => right.to - left.to);
				insertedRanges.forEach((range) => unlinkTrailingWhitespace(tr, range, options.type));
			}
			getChangedRanges(transform).forEach(({ newRange }) => {
				const nodesInChangedRanges = findChildrenInRange(newState.doc, newRange, (node) => node.isTextblock);
				let textBlock;
				let textBeforeWhitespace;
				if (nodesInChangedRanges.length > 1) {
					textBlock = nodesInChangedRanges[0];
					textBeforeWhitespace = newState.doc.textBetween(textBlock.pos, textBlock.pos + textBlock.node.nodeSize, void 0, " ");
				} else if (nodesInChangedRanges.length) {
					const endText = newState.doc.textBetween(newRange.from, newRange.to, " ", " ");
					if (!UNICODE_WHITESPACE_REGEX_END.test(endText)) return;
					textBlock = nodesInChangedRanges[0];
					textBeforeWhitespace = newState.doc.textBetween(textBlock.pos, newRange.to, void 0, " ");
				}
				if (textBlock && textBeforeWhitespace) {
					const wordsBeforeWhitespace = textBeforeWhitespace.split(UNICODE_WHITESPACE_REGEX).filter(Boolean);
					if (wordsBeforeWhitespace.length <= 0) return false;
					const lastWordBeforeSpace = wordsBeforeWhitespace[wordsBeforeWhitespace.length - 1];
					const lastWordAndBlockOffset = textBlock.pos + textBeforeWhitespace.lastIndexOf(lastWordBeforeSpace);
					if (!lastWordBeforeSpace) return false;
					const linksBeforeSpace = tokenize(lastWordBeforeSpace).map((t) => t.toObject(options.defaultProtocol));
					if (!isValidLinkStructure(linksBeforeSpace)) return false;
					linksBeforeSpace.filter((link) => link.isLink).map((link) => ({
						...link,
						from: lastWordAndBlockOffset + link.start + 1,
						to: lastWordAndBlockOffset + link.end + 1
					})).filter((link) => {
						if (!newState.schema.marks.code) return true;
						return !newState.doc.rangeHasMark(link.from, link.to, newState.schema.marks.code);
					}).filter((link) => options.validate(link.value)).filter((link) => options.shouldAutoLink(link.value)).forEach((link) => {
						if (getMarksBetween(link.from, link.to, newState.doc).some((item) => item.mark.type === options.type)) return;
						tr.addMark(link.from, link.to, options.type.create({ href: link.href }));
					});
				}
			});
			if (!tr.steps.length) return;
			return tr;
		}
	});
}
function clickHandler(options) {
	return new Plugin({
		key: new PluginKey("handleClickLink"),
		props: { handleClick: (view, pos, event) => {
			if (event.button !== 0) return false;
			if (!view.editable) return false;
			let link = null;
			if (event.target instanceof HTMLAnchorElement) link = event.target;
			else {
				const target = event.target;
				if (!target) return false;
				const root = options.editor.view.dom;
				link = target.closest("a");
				if (link && !root.contains(link)) link = null;
			}
			if (!link) return false;
			let handled = false;
			if (options.enableClickSelection) handled = options.editor.commands.extendMarkRange(options.type.name);
			if (options.openOnClick) {
				var _link$href, _link$target;
				const attrs = getAttributes(view.state, options.type.name);
				const href = (_link$href = link.href) !== null && _link$href !== void 0 ? _link$href : attrs.href;
				const target = (_link$target = link.target) !== null && _link$target !== void 0 ? _link$target : attrs.target;
				if (href) {
					window.open(href, target);
					handled = true;
				}
			}
			return handled;
		} }
	});
}
/**
* Matches a Markdown link with an optional quoted title.
* for ex: [Tiptap](https://tiptap.dev) or [Tiptap](https://tiptap.dev "some title")
* the URL may also contain one level of balanced parentheses, as in CommonMark
* (titles accept curly quotes too, the Typography extension swaps them in while typing)
* the title delimiters must come in matching pairs
*/
var MARKDOWN_LINK_INPUT_REGEX = /\[([^[\]]+)\]\(((?:[^\s()]|\([^\s()]*\))+)(?:\s+(?:(["'])(.*?)\3|“(.*?)”|‘(.*?)’))?\)$/;
/**
* Same as the input regex but global, to find every Markdown link in pasted text.
*/
var MARKDOWN_LINK_PASTE_REGEX = /\[([^[\]]+)\]\(((?:[^\s()]|\([^\s()]*\))+)(?:\s+(?:(["'])(.*?)\3|“(.*?)”|‘(.*?)’))?\)/g;
function isEscaped(text, index) {
	let backslashes = 0;
	for (let position = index - 1; position >= 0 && text[position] === "\\"; position -= 1) backslashes += 1;
	return backslashes % 2 === 1;
}
/**
* Pairs the backtick runs before the match by length, as CommonMark does.
* A run left open means the match sits in an unfinished code span.
*/
function isInsideCodeSpan(text, matchIndex) {
	let openRunLength = 0;
	let index = 0;
	while (index < matchIndex) {
		if (text[index] !== "`") {
			index += 1;
			continue;
		}
		if (openRunLength === 0 && isEscaped(text, index)) {
			index += 1;
			continue;
		}
		let runLength = 0;
		while (index < matchIndex && text[index] === "`") {
			runLength += 1;
			index += 1;
		}
		if (openRunLength === 0) openRunLength = runLength;
		else if (runLength === openRunLength) openRunLength = 0;
	}
	return openRunLength > 0;
}
function isConvertibleLink(text, match, isAllowedHref) {
	var _match$index, _match$index2;
	const [, linkText, href] = match;
	if ((match.index ? text[match.index - 1] : void 0) === "!" || isEscaped(text, (_match$index = match.index) !== null && _match$index !== void 0 ? _match$index : 0)) return false;
	if (isInsideCodeSpan(text, (_match$index2 = match.index) !== null && _match$index2 !== void 0 ? _match$index2 : 0)) return false;
	return !!linkText.trim() && isAllowedHref(href);
}
function toRuleMatch(match) {
	var _ref, _match$index3;
	const [linkSyntax, linkText, href, , straightQuotedTitle, curlyDoubleTitle, curlySingleTitle] = match;
	const title = (_ref = straightQuotedTitle !== null && straightQuotedTitle !== void 0 ? straightQuotedTitle : curlyDoubleTitle) !== null && _ref !== void 0 ? _ref : curlySingleTitle;
	return {
		index: (_match$index3 = match.index) !== null && _match$index3 !== void 0 ? _match$index3 : 0,
		text: linkSyntax,
		replaceWith: linkText,
		data: {
			href,
			title: title || null,
			markdown: true
		}
	};
}
function matchesOverlap(a, b) {
	return a.index < b.index + b.text.length && b.index < a.index + a.text.length;
}
function getMarkdownLinkAttributes(match) {
	var _match$data, _match$data$title, _match$data2;
	return {
		href: (_match$data = match.data) === null || _match$data === void 0 ? void 0 : _match$data.href,
		title: (_match$data$title = (_match$data2 = match.data) === null || _match$data2 === void 0 ? void 0 : _match$data2.title) !== null && _match$data$title !== void 0 ? _match$data$title : null
	};
}
/**
* Turns typed Markdown link syntax into a link mark as soon as the closing `)` comes in.
* The transaction gets flagged so autolink doesn't touch the converted text again.
*/
function markdownLinkInputRule(config) {
	const rule = markInputRule({
		find: (text) => {
			const match = MARKDOWN_LINK_INPUT_REGEX.exec(text);
			if (!match || !isConvertibleLink(text, match, config.isAllowedHref)) return null;
			return toRuleMatch(match);
		},
		type: config.type,
		getAttributes: getMarkdownLinkAttributes
	});
	return new InputRule({
		find: rule.find,
		handler: (props) => {
			const result = rule.handler(props);
			if (result !== null && props.state.tr.steps.length) props.state.tr.setMeta("preventAutolink", true);
			return result;
		}
	});
}
/**
* Same for pasting, converts every Markdown link found in the pasted text
* and links the plain URLs from `findPlainUrls`.
*/
function markdownLinkPasteRule(config) {
	const rule = markPasteRule({
		find: (text) => {
			var _config$findPlainUrls, _config$findPlainUrls2;
			const markdownMatches = [];
			for (const match of text.matchAll(MARKDOWN_LINK_PASTE_REGEX)) if (isConvertibleLink(text, match, config.isAllowedHref)) markdownMatches.push(toRuleMatch(match));
			const plainUrlMatches = ((_config$findPlainUrls = (_config$findPlainUrls2 = config.findPlainUrls) === null || _config$findPlainUrls2 === void 0 ? void 0 : _config$findPlainUrls2.call(config, text)) !== null && _config$findPlainUrls !== void 0 ? _config$findPlainUrls : []).filter((urlMatch) => !markdownMatches.some((markdownMatch) => matchesOverlap(markdownMatch, urlMatch)));
			return [...markdownMatches, ...plainUrlMatches];
		},
		type: config.type,
		getAttributes: getMarkdownLinkAttributes
	});
	return new PasteRule({
		find: rule.find,
		handler: (props) => {
			var _props$match$data;
			const result = rule.handler(props);
			if (result !== null && props.state.tr.steps.length && ((_props$match$data = props.match.data) === null || _props$match$data === void 0 ? void 0 : _props$match$data.markdown)) props.state.tr.setMeta("preventAutolink", true);
			return result;
		}
	});
}
function pasteHandler(options) {
	return new Plugin({
		key: new PluginKey("handlePasteLink"),
		props: { handlePaste: (view, _event, slice) => {
			const { shouldAutoLink } = options;
			const { state } = view;
			const { selection } = state;
			const { empty } = selection;
			if (empty) return false;
			let textContent = "";
			slice.content.forEach((node) => {
				textContent += node.textContent;
			});
			const link = find(textContent, { defaultProtocol: options.defaultProtocol }).find((item) => item.isLink && item.value === textContent);
			if (!textContent || !link || shouldAutoLink !== void 0 && !shouldAutoLink(link.value)) return false;
			return options.editor.commands.setMark(options.type, { href: link.href });
		} }
	});
}
function isAllowedUri(uri, protocols) {
	const allowedProtocols = [
		"http",
		"https",
		"ftp",
		"ftps",
		"mailto",
		"tel",
		"callto",
		"sms",
		"cid",
		"xmpp"
	];
	if (protocols) protocols.forEach((protocol) => {
		const nextProtocol = typeof protocol === "string" ? protocol : protocol.scheme;
		if (nextProtocol) allowedProtocols.push(nextProtocol);
	});
	return !uri || uri.replace(UNICODE_WHITESPACE_REGEX_GLOBAL, "").match(new RegExp(`^(?:(?:${allowedProtocols.map((protocol) => protocol.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join("|")}):|[^a-z]|[a-z0-9+.\\-]+(?:[^a-z+.\\-:]|$))`, "i"));
}
/**
* This extension allows you to create links.
* @see https://www.tiptap.dev/api/marks/link
*/
var Link = Mark.create({
	name: "link",
	priority: 1e3,
	keepOnSplit: false,
	exitable: true,
	onCreate() {
		if (this.options.validate && !this.options.shouldAutoLink) {
			this.options.shouldAutoLink = this.options.validate;
			console.warn("The `validate` option is deprecated. Rename to the `shouldAutoLink` option instead.");
		}
		this.options.protocols.forEach((protocol) => {
			if (typeof protocol === "string") {
				registerCustomProtocol(protocol);
				return;
			}
			registerCustomProtocol(protocol.scheme, protocol.optionalSlashes);
		});
	},
	onDestroy() {
		reset();
	},
	inclusive() {
		return this.options.autolink;
	},
	addOptions() {
		return {
			openOnClick: true,
			enableClickSelection: false,
			linkOnPaste: true,
			markdownLinks: false,
			autolink: true,
			protocols: [],
			defaultProtocol: "http",
			HTMLAttributes: {
				target: "_blank",
				rel: "noopener noreferrer nofollow",
				class: null
			},
			isAllowedUri: (url, ctx) => !!isAllowedUri(url, ctx.protocols),
			validate: (url) => !!url,
			shouldAutoLink: (url) => {
				const hasProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(url);
				const hasMaybeProtocol = /^[a-z][a-z0-9+.-]*:/i.test(url);
				if (hasProtocol || hasMaybeProtocol && !url.includes("@")) return true;
				const hostname = (url.includes("@") ? url.split("@").pop() : url).split(/[/?#:]/)[0];
				if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return false;
				if (!/\./.test(hostname)) return false;
				return true;
			}
		};
	},
	addAttributes() {
		var _this$options$HTMLAtt, _this$options$HTMLAtt2, _this$options$HTMLAtt3;
		return {
			href: {
				default: null,
				parseHTML(element) {
					return element.getAttribute("href");
				}
			},
			target: { default: (_this$options$HTMLAtt = this.options.HTMLAttributes.target) !== null && _this$options$HTMLAtt !== void 0 ? _this$options$HTMLAtt : null },
			rel: { default: (_this$options$HTMLAtt2 = this.options.HTMLAttributes.rel) !== null && _this$options$HTMLAtt2 !== void 0 ? _this$options$HTMLAtt2 : null },
			class: { default: (_this$options$HTMLAtt3 = this.options.HTMLAttributes.class) !== null && _this$options$HTMLAtt3 !== void 0 ? _this$options$HTMLAtt3 : null },
			title: { default: null }
		};
	},
	parseHTML() {
		return [{
			tag: "a[href]",
			getAttrs: (dom) => {
				const href = dom.getAttribute("href");
				if (!href || !this.options.isAllowedUri(href, {
					defaultValidate: (url) => !!isAllowedUri(url, this.options.protocols),
					protocols: this.options.protocols,
					defaultProtocol: this.options.defaultProtocol
				})) return false;
				return null;
			}
		}];
	},
	renderHTML({ HTMLAttributes }) {
		if (!this.options.isAllowedUri(HTMLAttributes.href, {
			defaultValidate: (href) => !!isAllowedUri(href, this.options.protocols),
			protocols: this.options.protocols,
			defaultProtocol: this.options.defaultProtocol
		})) return [
			"a",
			mergeAttributes(this.options.HTMLAttributes, {
				...HTMLAttributes,
				href: ""
			}),
			0
		];
		return [
			"a",
			mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
			0
		];
	},
	markdownTokenName: "link",
	parseMarkdown: (token, helpers) => {
		return helpers.applyMark("link", helpers.parseInline(token.tokens || []), {
			href: token.href,
			title: token.title || null
		});
	},
	renderMarkdown: (node, h) => {
		var _node$attrs$href, _node$attrs, _node$attrs$title, _node$attrs2;
		const href = (_node$attrs$href = (_node$attrs = node.attrs) === null || _node$attrs === void 0 ? void 0 : _node$attrs.href) !== null && _node$attrs$href !== void 0 ? _node$attrs$href : "";
		const title = (_node$attrs$title = (_node$attrs2 = node.attrs) === null || _node$attrs2 === void 0 ? void 0 : _node$attrs2.title) !== null && _node$attrs$title !== void 0 ? _node$attrs$title : "";
		const text = h.renderChildren(node);
		return title ? `[${text}](${href} "${title}")` : `[${text}](${href})`;
	},
	addCommands() {
		return {
			setLink: (attributes) => ({ chain }) => {
				const { href } = attributes;
				if (!this.options.isAllowedUri(href, {
					defaultValidate: (url) => !!isAllowedUri(url, this.options.protocols),
					protocols: this.options.protocols,
					defaultProtocol: this.options.defaultProtocol
				})) return false;
				return chain().setMark(this.name, attributes).setMeta("preventAutolink", true).run();
			},
			toggleLink: (attributes) => ({ chain }) => {
				const { href } = attributes || {};
				if (href && !this.options.isAllowedUri(href, {
					defaultValidate: (url) => !!isAllowedUri(url, this.options.protocols),
					protocols: this.options.protocols,
					defaultProtocol: this.options.defaultProtocol
				})) return false;
				return chain().toggleMark(this.name, attributes, { extendEmptyMarkRange: true }).setMeta("preventAutolink", true).run();
			},
			unsetLink: () => ({ chain }) => {
				return chain().unsetMark(this.name, { extendEmptyMarkRange: true }).setMeta("preventAutolink", true).run();
			}
		};
	},
	addInputRules() {
		if (!this.options.markdownLinks) return [];
		return [markdownLinkInputRule({
			type: this.type,
			isAllowedHref: (href) => this.options.isAllowedUri(href, {
				defaultValidate: (url) => !!isAllowedUri(url, this.options.protocols),
				protocols: this.options.protocols,
				defaultProtocol: this.options.defaultProtocol
			})
		})];
	},
	addPasteRules() {
		const findPlainUrls = (text) => {
			const foundLinks = [];
			if (text) {
				const { protocols, defaultProtocol } = this.options;
				find(text, { defaultProtocol }).filter((item) => item.isLink && this.options.isAllowedUri(item.value, {
					defaultValidate: (href) => !!isAllowedUri(href, protocols),
					protocols,
					defaultProtocol
				})).forEach((link) => {
					if (!this.options.shouldAutoLink(link.value)) return;
					foundLinks.push({
						text: link.value,
						data: { href: link.href },
						index: link.start
					});
				});
			}
			return foundLinks;
		};
		if (this.options.markdownLinks) return [markdownLinkPasteRule({
			type: this.type,
			isAllowedHref: (href) => this.options.isAllowedUri(href, {
				defaultValidate: (url) => !!isAllowedUri(url, this.options.protocols),
				protocols: this.options.protocols,
				defaultProtocol: this.options.defaultProtocol
			}),
			findPlainUrls
		})];
		return [markPasteRule({
			find: findPlainUrls,
			type: this.type,
			getAttributes: (match) => {
				var _match$data;
				return { href: (_match$data = match.data) === null || _match$data === void 0 ? void 0 : _match$data.href };
			}
		})];
	},
	addProseMirrorPlugins() {
		const plugins = [];
		const { protocols, defaultProtocol } = this.options;
		if (this.options.autolink) plugins.push(autolink({
			type: this.type,
			defaultProtocol: this.options.defaultProtocol,
			validate: (url) => this.options.isAllowedUri(url, {
				defaultValidate: (href) => !!isAllowedUri(href, protocols),
				protocols,
				defaultProtocol
			}),
			shouldAutoLink: this.options.shouldAutoLink
		}));
		plugins.push(clickHandler({
			type: this.type,
			editor: this.editor,
			openOnClick: this.options.openOnClick === "whenNotEditable" ? true : this.options.openOnClick,
			enableClickSelection: this.options.enableClickSelection
		}));
		if (this.options.linkOnPaste) plugins.push(pasteHandler({
			editor: this.editor,
			defaultProtocol: this.options.defaultProtocol,
			type: this.type,
			shouldAutoLink: this.options.shouldAutoLink
		}));
		return plugins;
	}
});
// ../DnD helper/node_modules/@tiptap/extension-paragraph/dist/index.js
/**
* Markdown marker for empty paragraphs to preserve blank lines.
* Using &nbsp; (non-breaking space HTML entity) ensures the paragraph
* is not collapsed by markdown parsers while remaining human-readable.
*/
var EMPTY_PARAGRAPH_MARKDOWN = "&nbsp;";
/**
* Unicode character for non-breaking space (U+00A0).
* Some markdown parsers may convert &nbsp; entities to this literal character.
*/
var NBSP_CHAR = "\xA0";
/**
* This extension allows you to create paragraphs.
* @see https://www.tiptap.dev/api/nodes/paragraph
*/
var Paragraph = Node.create({
	name: "paragraph",
	priority: 1e3,
	addOptions() {
		return { HTMLAttributes: {} };
	},
	group: "block",
	content: "inline*",
	parseHTML() {
		return [{ tag: "p" }];
	},
	renderHTML({ HTMLAttributes }) {
		return [
			"p",
			mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
			0
		];
	},
	parseMarkdown: (token, helpers) => {
		const tokens = token.tokens || [];
		if (tokens.length === 1 && tokens[0].type === "image") return helpers.parseChildren([tokens[0]]);
		const content = helpers.parseInline(tokens);
		if (tokens.length === 1 && tokens[0].type === "text" && (tokens[0].raw === EMPTY_PARAGRAPH_MARKDOWN || tokens[0].text === EMPTY_PARAGRAPH_MARKDOWN || tokens[0].raw === NBSP_CHAR || tokens[0].text === NBSP_CHAR) && content.length === 1 && content[0].type === "text" && (content[0].text === EMPTY_PARAGRAPH_MARKDOWN || content[0].text === NBSP_CHAR)) return helpers.createNode("paragraph", void 0, []);
		return helpers.createNode("paragraph", void 0, content);
	},
	renderMarkdown: (node, h, ctx) => {
		if (!node) return "";
		const content = Array.isArray(node.content) ? node.content : [];
		if (content.length === 0) {
			var _ctx$previousNode, _ctx$previousNode2;
			const previousContent = Array.isArray(ctx === null || ctx === void 0 || (_ctx$previousNode = ctx.previousNode) === null || _ctx$previousNode === void 0 ? void 0 : _ctx$previousNode.content) ? ctx.previousNode.content : [];
			return (ctx === null || ctx === void 0 || (_ctx$previousNode2 = ctx.previousNode) === null || _ctx$previousNode2 === void 0 ? void 0 : _ctx$previousNode2.type) === "paragraph" && previousContent.length === 0 ? EMPTY_PARAGRAPH_MARKDOWN : "";
		}
		return h.renderChildren(content);
	},
	addCommands() {
		return { setParagraph: () => ({ commands }) => {
			return commands.setNode(this.name);
		} };
	},
	addKeyboardShortcuts() {
		return { "Mod-Alt-0": () => this.editor.commands.setParagraph() };
	}
});
// ../DnD helper/node_modules/@tiptap/extension-strike/dist/index.js
/**
* Matches a strike to a ~~strike~~ on input.
*/
var inputRegex = /(?:^|\s)(~~(?!\s+~~)((?:[^~]+))~~(?!\s+~~))$/;
/**
* Matches a strike to a ~~strike~~ on paste.
*/
var pasteRegex = /(?:^|\s)(~~(?!\s+~~)((?:[^~]+))~~(?!\s+~~))/g;
/**
* This extension allows you to create strike text.
* @see https://www.tiptap.dev/api/marks/strike
*/
var Strike = Mark.create({
	name: "strike",
	addOptions() {
		return { HTMLAttributes: {} };
	},
	parseHTML() {
		return [
			{ tag: "s" },
			{ tag: "del" },
			{ tag: "strike" },
			{
				style: "text-decoration",
				consuming: false,
				getAttrs: (style) => style.includes("line-through") ? {} : false
			}
		];
	},
	renderHTML({ HTMLAttributes }) {
		return [
			"s",
			mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
			0
		];
	},
	markdownTokenName: "del",
	parseMarkdown: (token, helpers) => {
		return helpers.applyMark("strike", helpers.parseInline(token.tokens || []));
	},
	renderMarkdown: (node, h) => {
		return `~~${h.renderChildren(node)}~~`;
	},
	addCommands() {
		return {
			setStrike: () => ({ commands }) => {
				return commands.setMark(this.name);
			},
			toggleStrike: () => ({ commands }) => {
				return commands.toggleMark(this.name);
			},
			unsetStrike: () => ({ commands }) => {
				return commands.unsetMark(this.name);
			}
		};
	},
	addKeyboardShortcuts() {
		return { "Mod-Shift-s": () => this.editor.commands.toggleStrike() };
	},
	addInputRules() {
		return [markInputRule({
			find: inputRegex,
			type: this.type
		})];
	},
	addPasteRules() {
		return [markPasteRule({
			find: pasteRegex,
			type: this.type
		})];
	}
});
// ../DnD helper/node_modules/@tiptap/extension-text/dist/index.js
/**
* This extension allows you to create text nodes.
* @see https://www.tiptap.dev/api/nodes/text
*/
var Text = Node.create({
	name: "text",
	group: "inline",
	parseMarkdown: (token) => {
		return {
			type: "text",
			text: token.text || ""
		};
	},
	renderMarkdown: (node) => node.text || ""
});
// ../DnD helper/node_modules/@tiptap/extension-underline/dist/index.js
/**
* This extension allows you to create underline text.
* @see https://www.tiptap.dev/api/marks/underline
*/
var Underline = Mark.create({
	name: "underline",
	addOptions() {
		return { HTMLAttributes: {} };
	},
	parseHTML() {
		return [{ tag: "u" }, {
			style: "text-decoration",
			consuming: false,
			getAttrs: (style) => style.includes("underline") ? {} : false
		}];
	},
	renderHTML({ HTMLAttributes }) {
		return [
			"u",
			mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
			0
		];
	},
	parseMarkdown(token, helpers) {
		return helpers.applyMark(this.name || "underline", helpers.parseInline(token.tokens || []));
	},
	renderMarkdown(node, helpers) {
		return `<u>${helpers.renderChildren(node)}</u>`;
	},
	markdownTokenizer: {
		name: "underline",
		level: "inline",
		start(src) {
			return src.toLowerCase().indexOf("<u>");
		},
		tokenize(src, _tokens, lexer) {
			if (!/^<u>/i.test(src)) return;
			const delimiters = /\\[\s\S]|`+|<\/u>/gi;
			delimiters.lastIndex = 3;
			let match = delimiters.exec(src);
			while (match) {
				if (match[0].startsWith("`")) {
					const codeSpan = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/.exec(src.slice(match.index));
					if (codeSpan) delimiters.lastIndex = match.index + codeSpan[0].length;
				} else if (!match[0].startsWith("\\")) {
					const text = src.slice(3, match.index);
					if (!text) return;
					return {
						type: "underline",
						raw: src.slice(0, delimiters.lastIndex),
						text,
						tokens: lexer.inlineTokens(text)
					};
				}
				match = delimiters.exec(src);
			}
		}
	},
	addCommands() {
		return {
			setUnderline: () => ({ commands }) => {
				return commands.setMark(this.name);
			},
			toggleUnderline: () => ({ commands }) => {
				return commands.toggleMark(this.name);
			},
			unsetUnderline: () => ({ commands }) => {
				return commands.unsetMark(this.name);
			}
		};
	},
	addKeyboardShortcuts() {
		return {
			"Mod-u": () => this.editor.commands.toggleUnderline(),
			"Mod-U": () => this.editor.commands.toggleUnderline()
		};
	}
});
// ../DnD helper/node_modules/@tiptap/starter-kit/dist/index.js
/**
* The starter kit is a collection of essential editor extensions.
*
* It’s a good starting point for building your own editor.
*/
var StarterKit = Extension.create({
	name: "starterKit",
	addExtensions() {
		const extensions = [];
		if (this.options.bold !== false) extensions.push(Bold.configure(this.options.bold));
		if (this.options.blockquote !== false) extensions.push(Blockquote.configure(this.options.blockquote));
		if (this.options.bulletList !== false) extensions.push(BulletList.configure(this.options.bulletList));
		if (this.options.code !== false) extensions.push(Code.configure(this.options.code));
		if (this.options.codeBlock !== false) extensions.push(CodeBlock.configure(this.options.codeBlock));
		if (this.options.document !== false) extensions.push(Document.configure(this.options.document));
		if (this.options.dropcursor !== false) extensions.push(Dropcursor.configure(this.options.dropcursor));
		if (this.options.gapcursor !== false) extensions.push(Gapcursor.configure(this.options.gapcursor));
		if (this.options.hardBreak !== false) extensions.push(HardBreak.configure(this.options.hardBreak));
		if (this.options.heading !== false) extensions.push(Heading.configure(this.options.heading));
		if (this.options.undoRedo !== false) extensions.push(UndoRedo.configure(this.options.undoRedo));
		if (this.options.horizontalRule !== false) extensions.push(HorizontalRule.configure(this.options.horizontalRule));
		if (this.options.italic !== false) extensions.push(Italic.configure(this.options.italic));
		if (this.options.listItem !== false) extensions.push(ListItem.configure(this.options.listItem));
		if (this.options.listKeymap !== false) {
			var _this$options;
			extensions.push(ListKeymap.configure((_this$options = this.options) === null || _this$options === void 0 ? void 0 : _this$options.listKeymap));
		}
		if (this.options.link !== false) {
			var _this$options2;
			extensions.push(Link.configure((_this$options2 = this.options) === null || _this$options2 === void 0 ? void 0 : _this$options2.link));
		}
		if (this.options.orderedList !== false) extensions.push(OrderedList.configure(this.options.orderedList));
		if (this.options.paragraph !== false) extensions.push(Paragraph.configure(this.options.paragraph));
		if (this.options.strike !== false) extensions.push(Strike.configure(this.options.strike));
		if (this.options.text !== false) extensions.push(Text.configure(this.options.text));
		if (this.options.underline !== false) {
			var _this$options3;
			extensions.push(Underline.configure((_this$options3 = this.options) === null || _this$options3 === void 0 ? void 0 : _this$options3.underline));
		}
		if (this.options.trailingNode !== false) {
			var _this$options4;
			extensions.push(TrailingNode.configure((_this$options4 = this.options) === null || _this$options4 === void 0 ? void 0 : _this$options4.trailingNode));
		}
		return extensions;
	}
});
var src_default = StarterKit;
export { StarterKit, src_default as default };
