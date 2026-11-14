import { _n as mergeAttributes, bt as getStyleProperty, f as Mark, mn as markPasteRule, pn as markInputRule, un as isValidCSSStyleValue } from "./dist-BgYMzsBB.js";
// ../DnD helper/node_modules/@tiptap/extension-highlight/dist/index.js
/**
* Matches a highlight to a ==highlight== on input.
*/
var inputRegex = /(?:^|\s)(==(?!\s+==)((?:[^=]+))==(?!\s+==))$/;
/**
* Matches a highlight to a ==highlight== on paste.
*/
var pasteRegex = /(?:^|\s)(==(?!\s+==)((?:[^=]+))==(?!\s+==))/g;
/**
* This extension allows you to highlight text.
* @see https://www.tiptap.dev/api/marks/highlight
*/
var Highlight = Mark.create({
	name: "highlight",
	addOptions() {
		return {
			multicolor: false,
			HTMLAttributes: {}
		};
	},
	addAttributes() {
		if (!this.options.multicolor) return {};
		return { color: {
			default: null,
			parseHTML: (element) => element.getAttribute("data-color") || getStyleProperty(element, "background-color") || element.style.backgroundColor,
			renderHTML: (attributes) => {
				if (!isValidCSSStyleValue(attributes.color)) return {};
				return {
					"data-color": attributes.color,
					style: `background-color: ${attributes.color}; color: inherit`
				};
			}
		} };
	},
	parseHTML() {
		return [{ tag: "mark" }];
	},
	renderHTML({ HTMLAttributes }) {
		return [
			"mark",
			mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
			0
		];
	},
	renderMarkdown: (node, h) => {
		return `==${h.renderChildren(node)}==`;
	},
	parseMarkdown: (token, h) => {
		return h.applyMark("highlight", h.parseInline(token.tokens || []));
	},
	markdownTokenizer: {
		name: "highlight",
		level: "inline",
		start: (src) => src.indexOf("=="),
		tokenize(src, _, h) {
			const match = /^(==)(?!\s)([^=]*[^=\s])(==)/.exec(src);
			if (match) {
				const innerContent = match[2].trim();
				const children = h.inlineTokens(innerContent);
				return {
					type: "highlight",
					raw: match[0],
					text: innerContent,
					tokens: children
				};
			}
		}
	},
	addCommands() {
		return {
			setHighlight: (attributes) => ({ commands }) => {
				return commands.setMark(this.name, attributes);
			},
			toggleHighlight: (attributes) => ({ commands }) => {
				return commands.toggleMark(this.name, attributes);
			},
			unsetHighlight: () => ({ commands }) => {
				return commands.unsetMark(this.name);
			}
		};
	},
	addKeyboardShortcuts() {
		return { "Mod-Shift-h": () => this.editor.commands.toggleHighlight() };
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
var src_default = Highlight;
export { Highlight, src_default as default, inputRegex, pasteRegex };
