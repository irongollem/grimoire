import { In as textInputRule, s as Extension } from "./dist-BgYMzsBB.js";
// ../DnD helper/node_modules/@tiptap/extension-typography/dist/index.js
var emDash = (override) => textInputRule({
	find: /--$/,
	replace: override !== null && override !== void 0 ? override : "—"
});
var ellipsis = (override) => textInputRule({
	find: /\.\.\.$/,
	replace: override !== null && override !== void 0 ? override : "…"
});
var openDoubleQuote = (override) => textInputRule({
	find: /(?:^|[\s{[(<'"\u2018\u201C])(")$/,
	replace: override !== null && override !== void 0 ? override : "“"
});
var closeDoubleQuote = (override) => textInputRule({
	find: /"$/,
	replace: override !== null && override !== void 0 ? override : "”"
});
var openSingleQuote = (override) => textInputRule({
	find: /(?:^|[\s{[(<'"\u2018\u201C])(')$/,
	replace: override !== null && override !== void 0 ? override : "‘"
});
var closeSingleQuote = (override) => textInputRule({
	find: /'$/,
	replace: override !== null && override !== void 0 ? override : "’"
});
var leftArrow = (override) => textInputRule({
	find: /<-$/,
	replace: override !== null && override !== void 0 ? override : "←"
});
var rightArrow = (override) => textInputRule({
	find: /->$/,
	replace: override !== null && override !== void 0 ? override : "→"
});
var copyright = (override) => textInputRule({
	find: /\(c\)$/,
	replace: override !== null && override !== void 0 ? override : "©"
});
var trademark = (override) => textInputRule({
	find: /\(tm\)$/,
	replace: override !== null && override !== void 0 ? override : "™"
});
var servicemark = (override) => textInputRule({
	find: /\(sm\)$/,
	replace: override !== null && override !== void 0 ? override : "℠"
});
var registeredTrademark = (override) => textInputRule({
	find: /\(r\)$/,
	replace: override !== null && override !== void 0 ? override : "®"
});
var oneHalf = (override) => textInputRule({
	find: /(?:^|\s)(1\/2)\s$/,
	replace: override !== null && override !== void 0 ? override : "½"
});
var plusMinus = (override) => textInputRule({
	find: /\+\/-$/,
	replace: override !== null && override !== void 0 ? override : "±"
});
var notEqual = (override) => textInputRule({
	find: /!=$/,
	replace: override !== null && override !== void 0 ? override : "≠"
});
var laquo = (override) => textInputRule({
	find: /<<$/,
	replace: override !== null && override !== void 0 ? override : "«"
});
var raquo = (override) => textInputRule({
	find: />>$/,
	replace: override !== null && override !== void 0 ? override : "»"
});
var multiplication = (override) => textInputRule({
	find: /\d+\s?([*x])\s?\d+$/,
	replace: override !== null && override !== void 0 ? override : "×"
});
var superscriptTwo = (override) => textInputRule({
	find: /\^2$/,
	replace: override !== null && override !== void 0 ? override : "²"
});
var superscriptThree = (override) => textInputRule({
	find: /\^3$/,
	replace: override !== null && override !== void 0 ? override : "³"
});
var oneQuarter = (override) => textInputRule({
	find: /(?:^|\s)(1\/4)\s$/,
	replace: override !== null && override !== void 0 ? override : "¼"
});
var threeQuarters = (override) => textInputRule({
	find: /(?:^|\s)(3\/4)\s$/,
	replace: override !== null && override !== void 0 ? override : "¾"
});
/**
* This extension allows you to add typography replacements for specific characters.
* @see https://www.tiptap.dev/api/extensions/typography
*/
var Typography = Extension.create({
	name: "typography",
	addOptions() {
		return {
			closeDoubleQuote: "”",
			closeSingleQuote: "’",
			copyright: "©",
			ellipsis: "…",
			emDash: "—",
			laquo: "«",
			leftArrow: "←",
			multiplication: "×",
			notEqual: "≠",
			oneHalf: "½",
			oneQuarter: "¼",
			openDoubleQuote: "“",
			openSingleQuote: "‘",
			plusMinus: "±",
			raquo: "»",
			registeredTrademark: "®",
			rightArrow: "→",
			servicemark: "℠",
			superscriptThree: "³",
			superscriptTwo: "²",
			threeQuarters: "¾",
			trademark: "™"
		};
	},
	addInputRules() {
		var _this$options$doubleQ, _this$options$singleQ;
		const rules = [];
		if (this.options.emDash !== false) rules.push(emDash(this.options.emDash));
		if (this.options.ellipsis !== false) rules.push(ellipsis(this.options.ellipsis));
		const isRTL = this.editor.options.textDirection === "rtl";
		if ((_this$options$doubleQ = this.options.doubleQuotes) === null || _this$options$doubleQ === void 0 ? void 0 : _this$options$doubleQ.rtl) {
			const { open, close } = this.options.doubleQuotes.rtl;
			rules.push(openDoubleQuote(open));
			rules.push(closeDoubleQuote(close));
		} else if (isRTL) {
			rules.push(openDoubleQuote("”"));
			rules.push(closeDoubleQuote("“"));
		} else {
			if (this.options.openDoubleQuote !== false) rules.push(openDoubleQuote(this.options.openDoubleQuote));
			if (this.options.closeDoubleQuote !== false) rules.push(closeDoubleQuote(this.options.closeDoubleQuote));
		}
		if ((_this$options$singleQ = this.options.singleQuotes) === null || _this$options$singleQ === void 0 ? void 0 : _this$options$singleQ.rtl) {
			const { open, close } = this.options.singleQuotes.rtl;
			rules.push(openSingleQuote(open));
			rules.push(closeSingleQuote(close));
		} else if (isRTL) {
			rules.push(openSingleQuote("’"));
			rules.push(closeSingleQuote("‘"));
		} else {
			if (this.options.openSingleQuote !== false) rules.push(openSingleQuote(this.options.openSingleQuote));
			if (this.options.closeSingleQuote !== false) rules.push(closeSingleQuote(this.options.closeSingleQuote));
		}
		if (this.options.leftArrow !== false) rules.push(leftArrow(this.options.leftArrow));
		if (this.options.rightArrow !== false) rules.push(rightArrow(this.options.rightArrow));
		if (this.options.copyright !== false) rules.push(copyright(this.options.copyright));
		if (this.options.trademark !== false) rules.push(trademark(this.options.trademark));
		if (this.options.servicemark !== false) rules.push(servicemark(this.options.servicemark));
		if (this.options.registeredTrademark !== false) rules.push(registeredTrademark(this.options.registeredTrademark));
		if (this.options.oneHalf !== false) rules.push(oneHalf(this.options.oneHalf));
		if (this.options.plusMinus !== false) rules.push(plusMinus(this.options.plusMinus));
		if (this.options.notEqual !== false) rules.push(notEqual(this.options.notEqual));
		if (this.options.laquo !== false) rules.push(laquo(this.options.laquo));
		if (this.options.raquo !== false) rules.push(raquo(this.options.raquo));
		if (this.options.multiplication !== false) rules.push(multiplication(this.options.multiplication));
		if (this.options.superscriptTwo !== false) rules.push(superscriptTwo(this.options.superscriptTwo));
		if (this.options.superscriptThree !== false) rules.push(superscriptThree(this.options.superscriptThree));
		if (this.options.oneQuarter !== false) rules.push(oneQuarter(this.options.oneQuarter));
		if (this.options.threeQuarters !== false) rules.push(threeQuarters(this.options.threeQuarters));
		return rules;
	}
});
var src_default = Typography;
export { Typography, closeDoubleQuote, closeSingleQuote, copyright, src_default as default, ellipsis, emDash, laquo, leftArrow, multiplication, notEqual, oneHalf, oneQuarter, openDoubleQuote, openSingleQuote, plusMinus, raquo, registeredTrademark, rightArrow, servicemark, superscriptThree, superscriptTwo, threeQuarters, trademark };
