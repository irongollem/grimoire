import { $ as createTextVNode, Dt as mergeProps, Ft as onMounted, G as createBlock, Gn as readonly, In as isReactive, Jt as renderSlot, K as createCommentVNode, Kn as ref, M as Fragment, Mt as onBeforeUpdate, Ot as nextTick, Qn as toRef, T as withModifiers, U as computed, Ut as provide, Vn as onScopeDispose, Vt as openBlock, W as createBaseVNode, Wn as reactive, Xn as stop, Yn as shallowRef, Z as createSlots, Zn as toRaw, Zt as resolveDynamicComponent, _n as watchEffect, an as toHandlers, ar as normalizeClass, cn as useId, cr as toDisplayString, dn as useSlots, er as toValue, et as createVNode, ft as guardReactiveProps, gn as watch, jn as effect, nr as unref, nt as defineComponent, or as normalizeProps, q as createElementBlock, qt as renderList, r as TransitionGroup, sn as useAttrs, sr as normalizeStyle, tr as triggerRef, xn as withCtx, xt as inject, zt as onUnmounted } from "./vue.runtime.esm-bundler-Bwv4pGxO.js";
// ../DnD helper/node_modules/v-network-graph/lib/common/configs.js
var t = class {
	static value(e, t) {
		return e instanceof Function ? e(t) : e;
	}
	static values(e, t) {
		return Object.values(e).filter((e) => e instanceof Function).length === 0 ? e : Object.fromEntries(Object.entries(e).map(([e, n]) => [e, n instanceof Function ? n(t) : n]));
	}
};
var n$1 = /* @__PURE__ */ function(e) {
	return e.CENTER = "center", e.NORTH = "north", e.NORTH_EAST = "north-east", e.EAST = "east", e.SOUTH_EAST = "south-east", e.SOUTH = "south", e.SOUTH_WEST = "south-west", e.WEST = "west", e.NORTH_WEST = "north-west", e;
}({});
function r(t) {
	let n = {};
	return Object.assign(n, t(reactive(n)));
}
function i(e) {
	return e;
}
function a(e) {
	return e;
}
function o(e) {
	return e;
}
// ../DnD helper/node_modules/v-network-graph/lib/utils/visual.js
function t$57(t$80, n, r) {
	let i = t.values(n.normal, t$80);
	return i.type == "circle" ? {
		width: i.radius * 2 * r,
		height: i.radius * 2 * r
	} : {
		width: i.width * r,
		height: i.height * r
	};
}
function n$18(e, t, n, r) {
	let i = Math.abs(e.x - n.x) < t.width / 2 + r.width / 2, a = Math.abs(e.y - n.y) < t.height / 2 + r.height / 2;
	return i && a;
}
function r$19(e, t) {
	let n = 0;
	return n = t === 1 || e === void 0 || e === "none" ? e ?? 0 : typeof e == "string" ? e.split(/\s+/).map((e) => parseInt(e) * t).filter((e) => !isNaN(e)).join(" ") : e * t, n && n !== "0" ? n : void 0;
}
function i$21(e) {
	let t = 0;
	if (e === void 0 || e === "none") t = 0;
	else if (typeof e == "string") {
		let n = e.split(/\s+/).map((e) => parseInt(e)).filter((e) => !isNaN(e));
		t = n.length % 2 == 0 ? n.reduce((e, t) => e + t, 0) : n.reduce((e, t) => e + t, 0) * 2;
	} else t = e * 2;
	return t;
}
// ../DnD helper/node_modules/lodash-es/_freeGlobal.js
/** Detect free variable `global` from Node.js. */
var freeGlobal = typeof global == "object" && global && global.Object === Object && global;
// ../DnD helper/node_modules/lodash-es/_root.js
/** Detect free variable `self`. */
var freeSelf = typeof self == "object" && self && self.Object === Object && self;
/** Used as a reference to the global object. */
var root = freeGlobal || freeSelf || Function("return this")();
// ../DnD helper/node_modules/lodash-es/_Symbol.js
/** Built-in value references. */
var Symbol$1 = root.Symbol;
// ../DnD helper/node_modules/lodash-es/_getRawTag.js
/** Used for built-in method references. */
var objectProto$4 = Object.prototype;
/** Used to check objects for own properties. */
var hasOwnProperty$11 = objectProto$4.hasOwnProperty;
/**
* Used to resolve the
* [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
* of values.
*/
var nativeObjectToString$1 = objectProto$4.toString;
/** Built-in value references. */
var symToStringTag$1 = Symbol$1 ? Symbol$1.toStringTag : void 0;
/**
* A specialized version of `baseGetTag` which ignores `Symbol.toStringTag` values.
*
* @private
* @param {*} value The value to query.
* @returns {string} Returns the raw `toStringTag`.
*/
function getRawTag(value) {
	var isOwn = hasOwnProperty$11.call(value, symToStringTag$1), tag = value[symToStringTag$1];
	try {
		value[symToStringTag$1] = void 0;
		var unmasked = true;
	} catch (e) {}
	var result = nativeObjectToString$1.call(value);
	if (unmasked) {
		if (isOwn) value[symToStringTag$1] = tag;
		else delete value[symToStringTag$1];
	}
	return result;
}
// ../DnD helper/node_modules/lodash-es/_objectToString.js
/**
* Used to resolve the
* [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
* of values.
*/
var nativeObjectToString = Object.prototype.toString;
/**
* Converts `value` to a string using `Object.prototype.toString`.
*
* @private
* @param {*} value The value to convert.
* @returns {string} Returns the converted string.
*/
function objectToString(value) {
	return nativeObjectToString.call(value);
}
// ../DnD helper/node_modules/lodash-es/_baseGetTag.js
/** `Object#toString` result references. */
var nullTag = "[object Null]";
var undefinedTag = "[object Undefined]";
/** Built-in value references. */
var symToStringTag = Symbol$1 ? Symbol$1.toStringTag : void 0;
/**
* The base implementation of `getTag` without fallbacks for buggy environments.
*
* @private
* @param {*} value The value to query.
* @returns {string} Returns the `toStringTag`.
*/
function baseGetTag(value) {
	if (value == null) return value === void 0 ? undefinedTag : nullTag;
	return symToStringTag && symToStringTag in Object(value) ? getRawTag(value) : objectToString(value);
}
// ../DnD helper/node_modules/lodash-es/isObjectLike.js
/**
* Checks if `value` is object-like. A value is object-like if it's not `null`
* and has a `typeof` result of "object".
*
* @static
* @memberOf _
* @since 4.0.0
* @category Lang
* @param {*} value The value to check.
* @returns {boolean} Returns `true` if `value` is object-like, else `false`.
* @example
*
* _.isObjectLike({});
* // => true
*
* _.isObjectLike([1, 2, 3]);
* // => true
*
* _.isObjectLike(_.noop);
* // => false
*
* _.isObjectLike(null);
* // => false
*/
function isObjectLike(value) {
	return value != null && typeof value == "object";
}
// ../DnD helper/node_modules/lodash-es/isSymbol.js
/** `Object#toString` result references. */
var symbolTag$1 = "[object Symbol]";
/**
* Checks if `value` is classified as a `Symbol` primitive or object.
*
* @static
* @memberOf _
* @since 4.0.0
* @category Lang
* @param {*} value The value to check.
* @returns {boolean} Returns `true` if `value` is a symbol, else `false`.
* @example
*
* _.isSymbol(Symbol.iterator);
* // => true
*
* _.isSymbol('abc');
* // => false
*/
function isSymbol(value) {
	return typeof value == "symbol" || isObjectLike(value) && baseGetTag(value) == symbolTag$1;
}
// ../DnD helper/node_modules/lodash-es/_arrayMap.js
/**
* A specialized version of `_.map` for arrays without support for iteratee
* shorthands.
*
* @private
* @param {Array} [array] The array to iterate over.
* @param {Function} iteratee The function invoked per iteration.
* @returns {Array} Returns the new mapped array.
*/
function arrayMap(array, iteratee) {
	var index = -1, length = array == null ? 0 : array.length, result = Array(length);
	while (++index < length) result[index] = iteratee(array[index], index, array);
	return result;
}
// ../DnD helper/node_modules/lodash-es/isArray.js
/**
* Checks if `value` is classified as an `Array` object.
*
* @static
* @memberOf _
* @since 0.1.0
* @category Lang
* @param {*} value The value to check.
* @returns {boolean} Returns `true` if `value` is an array, else `false`.
* @example
*
* _.isArray([1, 2, 3]);
* // => true
*
* _.isArray(document.body.children);
* // => false
*
* _.isArray('abc');
* // => false
*
* _.isArray(_.noop);
* // => false
*/
var isArray = Array.isArray;
// ../DnD helper/node_modules/lodash-es/_baseToString.js
/** Used as references for various `Number` constants. */
var INFINITY$1 = 1 / 0;
/** Used to convert symbols to primitives and strings. */
var symbolProto$1 = Symbol$1 ? Symbol$1.prototype : void 0;
var symbolToString = symbolProto$1 ? symbolProto$1.toString : void 0;
/**
* The base implementation of `_.toString` which doesn't convert nullish
* values to empty strings.
*
* @private
* @param {*} value The value to process.
* @returns {string} Returns the string.
*/
function baseToString(value) {
	if (typeof value == "string") return value;
	if (isArray(value)) return arrayMap(value, baseToString) + "";
	if (isSymbol(value)) return symbolToString ? symbolToString.call(value) : "";
	var result = value + "";
	return result == "0" && 1 / value == -INFINITY$1 ? "-0" : result;
}
// ../DnD helper/node_modules/lodash-es/_trimmedEndIndex.js
/** Used to match a single whitespace character. */
var reWhitespace = /\s/;
/**
* Used by `_.trim` and `_.trimEnd` to get the index of the last non-whitespace
* character of `string`.
*
* @private
* @param {string} string The string to inspect.
* @returns {number} Returns the index of the last non-whitespace character.
*/
function trimmedEndIndex(string) {
	var index = string.length;
	while (index-- && reWhitespace.test(string.charAt(index)));
	return index;
}
// ../DnD helper/node_modules/lodash-es/_baseTrim.js
/** Used to match leading whitespace. */
var reTrimStart = /^\s+/;
/**
* The base implementation of `_.trim`.
*
* @private
* @param {string} string The string to trim.
* @returns {string} Returns the trimmed string.
*/
function baseTrim(string) {
	return string ? string.slice(0, trimmedEndIndex(string) + 1).replace(reTrimStart, "") : string;
}
// ../DnD helper/node_modules/lodash-es/isObject.js
/**
* Checks if `value` is the
* [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
* of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
*
* @static
* @memberOf _
* @since 0.1.0
* @category Lang
* @param {*} value The value to check.
* @returns {boolean} Returns `true` if `value` is an object, else `false`.
* @example
*
* _.isObject({});
* // => true
*
* _.isObject([1, 2, 3]);
* // => true
*
* _.isObject(_.noop);
* // => true
*
* _.isObject(null);
* // => false
*/
function isObject(value) {
	var type = typeof value;
	return value != null && (type == "object" || type == "function");
}
// ../DnD helper/node_modules/lodash-es/toNumber.js
/** Used as references for various `Number` constants. */
var NAN = NaN;
/** Used to detect bad signed hexadecimal string values. */
var reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
/** Used to detect binary string values. */
var reIsBinary = /^0b[01]+$/i;
/** Used to detect octal string values. */
var reIsOctal = /^0o[0-7]+$/i;
/** Built-in method references without a dependency on `root`. */
var freeParseInt = parseInt;
/**
* Converts `value` to a number.
*
* @static
* @memberOf _
* @since 4.0.0
* @category Lang
* @param {*} value The value to process.
* @returns {number} Returns the number.
* @example
*
* _.toNumber(3.2);
* // => 3.2
*
* _.toNumber(Number.MIN_VALUE);
* // => 5e-324
*
* _.toNumber(Infinity);
* // => Infinity
*
* _.toNumber('3.2');
* // => 3.2
*/
function toNumber(value) {
	if (typeof value == "number") return value;
	if (isSymbol(value)) return NAN;
	if (isObject(value)) {
		var other = typeof value.valueOf == "function" ? value.valueOf() : value;
		value = isObject(other) ? other + "" : other;
	}
	if (typeof value != "string") return value === 0 ? value : +value;
	value = baseTrim(value);
	var isBinary = reIsBinary.test(value);
	return isBinary || reIsOctal.test(value) ? freeParseInt(value.slice(2), isBinary ? 2 : 8) : reIsBadHex.test(value) ? NAN : +value;
}
// ../DnD helper/node_modules/lodash-es/toFinite.js
/** Used as references for various `Number` constants. */
var INFINITY = 1 / 0;
var MAX_INTEGER = 17976931348623157e292;
/**
* Converts `value` to a finite number.
*
* @static
* @memberOf _
* @since 4.12.0
* @category Lang
* @param {*} value The value to convert.
* @returns {number} Returns the converted number.
* @example
*
* _.toFinite(3.2);
* // => 3.2
*
* _.toFinite(Number.MIN_VALUE);
* // => 5e-324
*
* _.toFinite(Infinity);
* // => 1.7976931348623157e+308
*
* _.toFinite('3.2');
* // => 3.2
*/
function toFinite(value) {
	if (!value) return value === 0 ? value : 0;
	value = toNumber(value);
	if (value === INFINITY || value === -INFINITY) return (value < 0 ? -1 : 1) * MAX_INTEGER;
	return value === value ? value : 0;
}
// ../DnD helper/node_modules/lodash-es/toInteger.js
/**
* Converts `value` to an integer.
*
* **Note:** This method is loosely based on
* [`ToInteger`](http://www.ecma-international.org/ecma-262/7.0/#sec-tointeger).
*
* @static
* @memberOf _
* @since 4.0.0
* @category Lang
* @param {*} value The value to convert.
* @returns {number} Returns the converted integer.
* @example
*
* _.toInteger(3.2);
* // => 3
*
* _.toInteger(Number.MIN_VALUE);
* // => 0
*
* _.toInteger(Infinity);
* // => 1.7976931348623157e+308
*
* _.toInteger('3.2');
* // => 3
*/
function toInteger(value) {
	var result = toFinite(value), remainder = result % 1;
	return result === result ? remainder ? result - remainder : result : 0;
}
// ../DnD helper/node_modules/lodash-es/identity.js
/**
* This method returns the first argument it receives.
*
* @static
* @since 0.1.0
* @memberOf _
* @category Util
* @param {*} value Any value.
* @returns {*} Returns `value`.
* @example
*
* var object = { 'a': 1 };
*
* console.log(_.identity(object) === object);
* // => true
*/
function identity(value) {
	return value;
}
// ../DnD helper/node_modules/lodash-es/isFunction.js
/** `Object#toString` result references. */
var asyncTag = "[object AsyncFunction]";
var funcTag$1 = "[object Function]";
var genTag = "[object GeneratorFunction]";
var proxyTag = "[object Proxy]";
/**
* Checks if `value` is classified as a `Function` object.
*
* @static
* @memberOf _
* @since 0.1.0
* @category Lang
* @param {*} value The value to check.
* @returns {boolean} Returns `true` if `value` is a function, else `false`.
* @example
*
* _.isFunction(_);
* // => true
*
* _.isFunction(/abc/);
* // => false
*/
function isFunction(value) {
	if (!isObject(value)) return false;
	var tag = baseGetTag(value);
	return tag == funcTag$1 || tag == genTag || tag == asyncTag || tag == proxyTag;
}
// ../DnD helper/node_modules/lodash-es/_coreJsData.js
/** Used to detect overreaching core-js shims. */
var coreJsData = root["__core-js_shared__"];
// ../DnD helper/node_modules/lodash-es/_isMasked.js
/** Used to detect methods masquerading as native. */
var maskSrcKey = function() {
	var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || "");
	return uid ? "Symbol(src)_1." + uid : "";
}();
/**
* Checks if `func` has its source masked.
*
* @private
* @param {Function} func The function to check.
* @returns {boolean} Returns `true` if `func` is masked, else `false`.
*/
function isMasked(func) {
	return !!maskSrcKey && maskSrcKey in func;
}
// ../DnD helper/node_modules/lodash-es/_toSource.js
/** Used to resolve the decompiled source of functions. */
var funcToString$2 = Function.prototype.toString;
/**
* Converts `func` to its source code.
*
* @private
* @param {Function} func The function to convert.
* @returns {string} Returns the source code.
*/
function toSource(func) {
	if (func != null) {
		try {
			return funcToString$2.call(func);
		} catch (e) {}
		try {
			return func + "";
		} catch (e) {}
	}
	return "";
}
// ../DnD helper/node_modules/lodash-es/_baseIsNative.js
/**
* Used to match `RegExp`
* [syntax characters](http://ecma-international.org/ecma-262/7.0/#sec-patterns).
*/
var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;
/** Used to detect host constructors (Safari). */
var reIsHostCtor = /^\[object .+?Constructor\]$/;
/** Used for built-in method references. */
var funcProto$1 = Function.prototype;
var objectProto$3 = Object.prototype;
/** Used to resolve the decompiled source of functions. */
var funcToString$1 = funcProto$1.toString;
/** Used to check objects for own properties. */
var hasOwnProperty$10 = objectProto$3.hasOwnProperty;
/** Used to detect if a method is native. */
var reIsNative = RegExp("^" + funcToString$1.call(hasOwnProperty$10).replace(reRegExpChar, "\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, "$1.*?") + "$");
/**
* The base implementation of `_.isNative` without bad shim checks.
*
* @private
* @param {*} value The value to check.
* @returns {boolean} Returns `true` if `value` is a native function,
*  else `false`.
*/
function baseIsNative(value) {
	if (!isObject(value) || isMasked(value)) return false;
	return (isFunction(value) ? reIsNative : reIsHostCtor).test(toSource(value));
}
// ../DnD helper/node_modules/lodash-es/_getValue.js
/**
* Gets the value at `key` of `object`.
*
* @private
* @param {Object} [object] The object to query.
* @param {string} key The key of the property to get.
* @returns {*} Returns the property value.
*/
function getValue(object, key) {
	return object == null ? void 0 : object[key];
}
// ../DnD helper/node_modules/lodash-es/_getNative.js
/**
* Gets the native function at `key` of `object`.
*
* @private
* @param {Object} object The object to query.
* @param {string} key The key of the method to get.
* @returns {*} Returns the function if it's native, else `undefined`.
*/
function getNative(object, key) {
	var value = getValue(object, key);
	return baseIsNative(value) ? value : void 0;
}
// ../DnD helper/node_modules/lodash-es/_WeakMap.js
var WeakMap$1 = getNative(root, "WeakMap");
// ../DnD helper/node_modules/lodash-es/_baseCreate.js
/** Built-in value references. */
var objectCreate = Object.create;
/**
* The base implementation of `_.create` without support for assigning
* properties to the created object.
*
* @private
* @param {Object} proto The object to inherit from.
* @returns {Object} Returns the new object.
*/
var baseCreate = function() {
	function object() {}
	return function(proto) {
		if (!isObject(proto)) return {};
		if (objectCreate) return objectCreate(proto);
		object.prototype = proto;
		var result = new object();
		object.prototype = void 0;
		return result;
	};
}();
// ../DnD helper/node_modules/lodash-es/_apply.js
/**
* A faster alternative to `Function#apply`, this function invokes `func`
* with the `this` binding of `thisArg` and the arguments of `args`.
*
* @private
* @param {Function} func The function to invoke.
* @param {*} thisArg The `this` binding of `func`.
* @param {Array} args The arguments to invoke `func` with.
* @returns {*} Returns the result of `func`.
*/
function apply(func, thisArg, args) {
	switch (args.length) {
		case 0: return func.call(thisArg);
		case 1: return func.call(thisArg, args[0]);
		case 2: return func.call(thisArg, args[0], args[1]);
		case 3: return func.call(thisArg, args[0], args[1], args[2]);
	}
	return func.apply(thisArg, args);
}
// ../DnD helper/node_modules/lodash-es/noop.js
/**
* This method returns `undefined`.
*
* @static
* @memberOf _
* @since 2.3.0
* @category Util
* @example
*
* _.times(2, _.noop);
* // => [undefined, undefined]
*/
function noop() {}
// ../DnD helper/node_modules/lodash-es/_copyArray.js
/**
* Copies the values of `source` to `array`.
*
* @private
* @param {Array} source The array to copy values from.
* @param {Array} [array=[]] The array to copy values to.
* @returns {Array} Returns `array`.
*/
function copyArray(source, array) {
	var index = -1, length = source.length;
	array || (array = Array(length));
	while (++index < length) array[index] = source[index];
	return array;
}
// ../DnD helper/node_modules/lodash-es/_shortOut.js
/** Used to detect hot functions by number of calls within a span of milliseconds. */
var HOT_COUNT = 800;
var HOT_SPAN = 16;
var nativeNow = Date.now;
/**
* Creates a function that'll short out and invoke `identity` instead
* of `func` when it's called `HOT_COUNT` or more times in `HOT_SPAN`
* milliseconds.
*
* @private
* @param {Function} func The function to restrict.
* @returns {Function} Returns the new shortable function.
*/
function shortOut(func) {
	var count = 0, lastCalled = 0;
	return function() {
		var stamp = nativeNow(), remaining = HOT_SPAN - (stamp - lastCalled);
		lastCalled = stamp;
		if (remaining > 0) {
			if (++count >= HOT_COUNT) return arguments[0];
		} else count = 0;
		return func.apply(void 0, arguments);
	};
}
// ../DnD helper/node_modules/lodash-es/constant.js
/**
* Creates a function that returns `value`.
*
* @static
* @memberOf _
* @since 2.4.0
* @category Util
* @param {*} value The value to return from the new function.
* @returns {Function} Returns the new constant function.
* @example
*
* var objects = _.times(2, _.constant({ 'a': 1 }));
*
* console.log(objects);
* // => [{ 'a': 1 }, { 'a': 1 }]
*
* console.log(objects[0] === objects[1]);
* // => true
*/
function constant(value) {
	return function() {
		return value;
	};
}
// ../DnD helper/node_modules/lodash-es/_defineProperty.js
var defineProperty = function() {
	try {
		var func = getNative(Object, "defineProperty");
		func({}, "", {});
		return func;
	} catch (e) {}
}();
// ../DnD helper/node_modules/lodash-es/_setToString.js
/**
* Sets the `toString` method of `func` to return `string`.
*
* @private
* @param {Function} func The function to modify.
* @param {Function} string The `toString` result.
* @returns {Function} Returns `func`.
*/
var setToString = shortOut(!defineProperty ? identity : function(func, string) {
	return defineProperty(func, "toString", {
		"configurable": true,
		"enumerable": false,
		"value": constant(string),
		"writable": true
	});
});
// ../DnD helper/node_modules/lodash-es/_baseFindIndex.js
/**
* The base implementation of `_.findIndex` and `_.findLastIndex` without
* support for iteratee shorthands.
*
* @private
* @param {Array} array The array to inspect.
* @param {Function} predicate The function invoked per iteration.
* @param {number} fromIndex The index to search from.
* @param {boolean} [fromRight] Specify iterating from right to left.
* @returns {number} Returns the index of the matched value, else `-1`.
*/
function baseFindIndex(array, predicate, fromIndex, fromRight) {
	var length = array.length, index = fromIndex + (fromRight ? 1 : -1);
	while (fromRight ? index-- : ++index < length) if (predicate(array[index], index, array)) return index;
	return -1;
}
// ../DnD helper/node_modules/lodash-es/_baseIsNaN.js
/**
* The base implementation of `_.isNaN` without support for number objects.
*
* @private
* @param {*} value The value to check.
* @returns {boolean} Returns `true` if `value` is `NaN`, else `false`.
*/
function baseIsNaN(value) {
	return value !== value;
}
// ../DnD helper/node_modules/lodash-es/_strictIndexOf.js
/**
* A specialized version of `_.indexOf` which performs strict equality
* comparisons of values, i.e. `===`.
*
* @private
* @param {Array} array The array to inspect.
* @param {*} value The value to search for.
* @param {number} fromIndex The index to search from.
* @returns {number} Returns the index of the matched value, else `-1`.
*/
function strictIndexOf(array, value, fromIndex) {
	var index = fromIndex - 1, length = array.length;
	while (++index < length) if (array[index] === value) return index;
	return -1;
}
// ../DnD helper/node_modules/lodash-es/_baseIndexOf.js
/**
* The base implementation of `_.indexOf` without `fromIndex` bounds checks.
*
* @private
* @param {Array} array The array to inspect.
* @param {*} value The value to search for.
* @param {number} fromIndex The index to search from.
* @returns {number} Returns the index of the matched value, else `-1`.
*/
function baseIndexOf(array, value, fromIndex) {
	return value === value ? strictIndexOf(array, value, fromIndex) : baseFindIndex(array, baseIsNaN, fromIndex);
}
// ../DnD helper/node_modules/lodash-es/_arrayIncludes.js
/**
* A specialized version of `_.includes` for arrays without support for
* specifying an index to search from.
*
* @private
* @param {Array} [array] The array to inspect.
* @param {*} target The value to search for.
* @returns {boolean} Returns `true` if `target` is found, else `false`.
*/
function arrayIncludes(array, value) {
	return !!(array == null ? 0 : array.length) && baseIndexOf(array, value, 0) > -1;
}
// ../DnD helper/node_modules/lodash-es/_isIndex.js
/** Used as references for various `Number` constants. */
var MAX_SAFE_INTEGER$1 = 9007199254740991;
/** Used to detect unsigned integer values. */
var reIsUint = /^(?:0|[1-9]\d*)$/;
/**
* Checks if `value` is a valid array-like index.
*
* @private
* @param {*} value The value to check.
* @param {number} [length=MAX_SAFE_INTEGER] The upper bounds of a valid index.
* @returns {boolean} Returns `true` if `value` is a valid index, else `false`.
*/
function isIndex(value, length) {
	var type = typeof value;
	length = length == null ? MAX_SAFE_INTEGER$1 : length;
	return !!length && (type == "number" || type != "symbol" && reIsUint.test(value)) && value > -1 && value % 1 == 0 && value < length;
}
// ../DnD helper/node_modules/lodash-es/_baseAssignValue.js
/**
* The base implementation of `assignValue` and `assignMergeValue` without
* value checks.
*
* @private
* @param {Object} object The object to modify.
* @param {string} key The key of the property to assign.
* @param {*} value The value to assign.
*/
function baseAssignValue(object, key, value) {
	if (key == "__proto__" && defineProperty) defineProperty(object, key, {
		"configurable": true,
		"enumerable": true,
		"value": value,
		"writable": true
	});
	else object[key] = value;
}
// ../DnD helper/node_modules/lodash-es/eq.js
/**
* Performs a
* [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
* comparison between two values to determine if they are equivalent.
*
* @static
* @memberOf _
* @since 4.0.0
* @category Lang
* @param {*} value The value to compare.
* @param {*} other The other value to compare.
* @returns {boolean} Returns `true` if the values are equivalent, else `false`.
* @example
*
* var object = { 'a': 1 };
* var other = { 'a': 1 };
*
* _.eq(object, object);
* // => true
*
* _.eq(object, other);
* // => false
*
* _.eq('a', 'a');
* // => true
*
* _.eq('a', Object('a'));
* // => false
*
* _.eq(NaN, NaN);
* // => true
*/
function eq(value, other) {
	return value === other || value !== value && other !== other;
}
// ../DnD helper/node_modules/lodash-es/_assignValue.js
/** Used to check objects for own properties. */
var hasOwnProperty$9 = Object.prototype.hasOwnProperty;
/**
* Assigns `value` to `key` of `object` if the existing value is not equivalent
* using [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
* for equality comparisons.
*
* @private
* @param {Object} object The object to modify.
* @param {string} key The key of the property to assign.
* @param {*} value The value to assign.
*/
function assignValue(object, key, value) {
	var objValue = object[key];
	if (!(hasOwnProperty$9.call(object, key) && eq(objValue, value)) || value === void 0 && !(key in object)) baseAssignValue(object, key, value);
}
// ../DnD helper/node_modules/lodash-es/_copyObject.js
/**
* Copies properties of `source` to `object`.
*
* @private
* @param {Object} source The object to copy properties from.
* @param {Array} props The property identifiers to copy.
* @param {Object} [object={}] The object to copy properties to.
* @param {Function} [customizer] The function to customize copied values.
* @returns {Object} Returns `object`.
*/
function copyObject(source, props, object, customizer) {
	var isNew = !object;
	object || (object = {});
	var index = -1, length = props.length;
	while (++index < length) {
		var key = props[index];
		var newValue = customizer ? customizer(object[key], source[key], key, object, source) : void 0;
		if (newValue === void 0) newValue = source[key];
		if (isNew) baseAssignValue(object, key, newValue);
		else assignValue(object, key, newValue);
	}
	return object;
}
// ../DnD helper/node_modules/lodash-es/_overRest.js
var nativeMax$2 = Math.max;
/**
* A specialized version of `baseRest` which transforms the rest array.
*
* @private
* @param {Function} func The function to apply a rest parameter to.
* @param {number} [start=func.length-1] The start position of the rest parameter.
* @param {Function} transform The rest array transform.
* @returns {Function} Returns the new function.
*/
function overRest(func, start, transform) {
	start = nativeMax$2(start === void 0 ? func.length - 1 : start, 0);
	return function() {
		var args = arguments, index = -1, length = nativeMax$2(args.length - start, 0), array = Array(length);
		while (++index < length) array[index] = args[start + index];
		index = -1;
		var otherArgs = Array(start + 1);
		while (++index < start) otherArgs[index] = args[index];
		otherArgs[start] = transform(array);
		return apply(func, this, otherArgs);
	};
}
// ../DnD helper/node_modules/lodash-es/_baseRest.js
/**
* The base implementation of `_.rest` which doesn't validate or coerce arguments.
*
* @private
* @param {Function} func The function to apply a rest parameter to.
* @param {number} [start=func.length-1] The start position of the rest parameter.
* @returns {Function} Returns the new function.
*/
function baseRest(func, start) {
	return setToString(overRest(func, start, identity), func + "");
}
// ../DnD helper/node_modules/lodash-es/isLength.js
/** Used as references for various `Number` constants. */
var MAX_SAFE_INTEGER = 9007199254740991;
/**
* Checks if `value` is a valid array-like length.
*
* **Note:** This method is loosely based on
* [`ToLength`](http://ecma-international.org/ecma-262/7.0/#sec-tolength).
*
* @static
* @memberOf _
* @since 4.0.0
* @category Lang
* @param {*} value The value to check.
* @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
* @example
*
* _.isLength(3);
* // => true
*
* _.isLength(Number.MIN_VALUE);
* // => false
*
* _.isLength(Infinity);
* // => false
*
* _.isLength('3');
* // => false
*/
function isLength(value) {
	return typeof value == "number" && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
}
// ../DnD helper/node_modules/lodash-es/isArrayLike.js
/**
* Checks if `value` is array-like. A value is considered array-like if it's
* not a function and has a `value.length` that's an integer greater than or
* equal to `0` and less than or equal to `Number.MAX_SAFE_INTEGER`.
*
* @static
* @memberOf _
* @since 4.0.0
* @category Lang
* @param {*} value The value to check.
* @returns {boolean} Returns `true` if `value` is array-like, else `false`.
* @example
*
* _.isArrayLike([1, 2, 3]);
* // => true
*
* _.isArrayLike(document.body.children);
* // => true
*
* _.isArrayLike('abc');
* // => true
*
* _.isArrayLike(_.noop);
* // => false
*/
function isArrayLike(value) {
	return value != null && isLength(value.length) && !isFunction(value);
}
// ../DnD helper/node_modules/lodash-es/_isIterateeCall.js
/**
* Checks if the given arguments are from an iteratee call.
*
* @private
* @param {*} value The potential iteratee value argument.
* @param {*} index The potential iteratee index or key argument.
* @param {*} object The potential iteratee object argument.
* @returns {boolean} Returns `true` if the arguments are from an iteratee call,
*  else `false`.
*/
function isIterateeCall(value, index, object) {
	if (!isObject(object)) return false;
	var type = typeof index;
	if (type == "number" ? isArrayLike(object) && isIndex(index, object.length) : type == "string" && index in object) return eq(object[index], value);
	return false;
}
// ../DnD helper/node_modules/lodash-es/_createAssigner.js
/**
* Creates a function like `_.assign`.
*
* @private
* @param {Function} assigner The function to assign values.
* @returns {Function} Returns the new assigner function.
*/
function createAssigner(assigner) {
	return baseRest(function(object, sources) {
		var index = -1, length = sources.length, customizer = length > 1 ? sources[length - 1] : void 0, guard = length > 2 ? sources[2] : void 0;
		customizer = assigner.length > 3 && typeof customizer == "function" ? (length--, customizer) : void 0;
		if (guard && isIterateeCall(sources[0], sources[1], guard)) {
			customizer = length < 3 ? void 0 : customizer;
			length = 1;
		}
		object = Object(object);
		while (++index < length) {
			var source = sources[index];
			if (source) assigner(object, source, index, customizer);
		}
		return object;
	});
}
// ../DnD helper/node_modules/lodash-es/_isPrototype.js
/** Used for built-in method references. */
var objectProto$2 = Object.prototype;
/**
* Checks if `value` is likely a prototype object.
*
* @private
* @param {*} value The value to check.
* @returns {boolean} Returns `true` if `value` is a prototype, else `false`.
*/
function isPrototype(value) {
	var Ctor = value && value.constructor;
	return value === (typeof Ctor == "function" && Ctor.prototype || objectProto$2);
}
// ../DnD helper/node_modules/lodash-es/_baseTimes.js
/**
* The base implementation of `_.times` without support for iteratee shorthands
* or max array length checks.
*
* @private
* @param {number} n The number of times to invoke `iteratee`.
* @param {Function} iteratee The function invoked per iteration.
* @returns {Array} Returns the array of results.
*/
function baseTimes(n, iteratee) {
	var index = -1, result = Array(n);
	while (++index < n) result[index] = iteratee(index);
	return result;
}
// ../DnD helper/node_modules/lodash-es/_baseIsArguments.js
/** `Object#toString` result references. */
var argsTag$2 = "[object Arguments]";
/**
* The base implementation of `_.isArguments`.
*
* @private
* @param {*} value The value to check.
* @returns {boolean} Returns `true` if `value` is an `arguments` object,
*/
function baseIsArguments(value) {
	return isObjectLike(value) && baseGetTag(value) == argsTag$2;
}
// ../DnD helper/node_modules/lodash-es/isArguments.js
/** Used for built-in method references. */
var objectProto$1 = Object.prototype;
/** Used to check objects for own properties. */
var hasOwnProperty$8 = objectProto$1.hasOwnProperty;
/** Built-in value references. */
var propertyIsEnumerable$1 = objectProto$1.propertyIsEnumerable;
/**
* Checks if `value` is likely an `arguments` object.
*
* @static
* @memberOf _
* @since 0.1.0
* @category Lang
* @param {*} value The value to check.
* @returns {boolean} Returns `true` if `value` is an `arguments` object,
*  else `false`.
* @example
*
* _.isArguments(function() { return arguments; }());
* // => true
*
* _.isArguments([1, 2, 3]);
* // => false
*/
var isArguments = baseIsArguments(function() {
	return arguments;
}()) ? baseIsArguments : function(value) {
	return isObjectLike(value) && hasOwnProperty$8.call(value, "callee") && !propertyIsEnumerable$1.call(value, "callee");
};
// ../DnD helper/node_modules/lodash-es/stubFalse.js
/**
* This method returns `false`.
*
* @static
* @memberOf _
* @since 4.13.0
* @category Util
* @returns {boolean} Returns `false`.
* @example
*
* _.times(2, _.stubFalse);
* // => [false, false]
*/
function stubFalse() {
	return false;
}
// ../DnD helper/node_modules/lodash-es/isBuffer.js
/** Detect free variable `exports`. */
var freeExports$2 = typeof exports == "object" && exports && !exports.nodeType && exports;
/** Detect free variable `module`. */
var freeModule$2 = freeExports$2 && typeof module == "object" && module && !module.nodeType && module;
/** Built-in value references. */
var Buffer$2 = freeModule$2 && freeModule$2.exports === freeExports$2 ? root.Buffer : void 0;
/**
* Checks if `value` is a buffer.
*
* @static
* @memberOf _
* @since 4.3.0
* @category Lang
* @param {*} value The value to check.
* @returns {boolean} Returns `true` if `value` is a buffer, else `false`.
* @example
*
* _.isBuffer(new Buffer(2));
* // => true
*
* _.isBuffer(new Uint8Array(2));
* // => false
*/
var isBuffer = (Buffer$2 ? Buffer$2.isBuffer : void 0) || stubFalse;
// ../DnD helper/node_modules/lodash-es/_baseIsTypedArray.js
/** `Object#toString` result references. */
var argsTag$1 = "[object Arguments]";
var arrayTag$1 = "[object Array]";
var boolTag$1 = "[object Boolean]";
var dateTag$1 = "[object Date]";
var errorTag$1 = "[object Error]";
var funcTag = "[object Function]";
var mapTag$2 = "[object Map]";
var numberTag$1 = "[object Number]";
var objectTag$3 = "[object Object]";
var regexpTag$1 = "[object RegExp]";
var setTag$2 = "[object Set]";
var stringTag$1 = "[object String]";
var weakMapTag$1 = "[object WeakMap]";
var arrayBufferTag$1 = "[object ArrayBuffer]";
var dataViewTag$2 = "[object DataView]";
var float32Tag = "[object Float32Array]";
var float64Tag = "[object Float64Array]";
var int8Tag = "[object Int8Array]";
var int16Tag = "[object Int16Array]";
var int32Tag = "[object Int32Array]";
var uint8Tag = "[object Uint8Array]";
var uint8ClampedTag = "[object Uint8ClampedArray]";
var uint16Tag = "[object Uint16Array]";
var uint32Tag = "[object Uint32Array]";
/** Used to identify `toStringTag` values of typed arrays. */
var typedArrayTags = {};
typedArrayTags[float32Tag] = typedArrayTags[float64Tag] = typedArrayTags[int8Tag] = typedArrayTags[int16Tag] = typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] = typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] = typedArrayTags[uint32Tag] = true;
typedArrayTags[argsTag$1] = typedArrayTags[arrayTag$1] = typedArrayTags[arrayBufferTag$1] = typedArrayTags[boolTag$1] = typedArrayTags[dataViewTag$2] = typedArrayTags[dateTag$1] = typedArrayTags[errorTag$1] = typedArrayTags[funcTag] = typedArrayTags[mapTag$2] = typedArrayTags[numberTag$1] = typedArrayTags[objectTag$3] = typedArrayTags[regexpTag$1] = typedArrayTags[setTag$2] = typedArrayTags[stringTag$1] = typedArrayTags[weakMapTag$1] = false;
/**
* The base implementation of `_.isTypedArray` without Node.js optimizations.
*
* @private
* @param {*} value The value to check.
* @returns {boolean} Returns `true` if `value` is a typed array, else `false`.
*/
function baseIsTypedArray(value) {
	return isObjectLike(value) && isLength(value.length) && !!typedArrayTags[baseGetTag(value)];
}
// ../DnD helper/node_modules/lodash-es/_baseUnary.js
/**
* The base implementation of `_.unary` without support for storing metadata.
*
* @private
* @param {Function} func The function to cap arguments for.
* @returns {Function} Returns the new capped function.
*/
function baseUnary(func) {
	return function(value) {
		return func(value);
	};
}
// ../DnD helper/node_modules/lodash-es/_nodeUtil.js
/** Detect free variable `exports`. */
var freeExports$1 = typeof exports == "object" && exports && !exports.nodeType && exports;
/** Detect free variable `module`. */
var freeModule$1 = freeExports$1 && typeof module == "object" && module && !module.nodeType && module;
/** Detect free variable `process` from Node.js. */
var freeProcess = freeModule$1 && freeModule$1.exports === freeExports$1 && freeGlobal.process;
/** Used to access faster Node.js helpers. */
var nodeUtil = function() {
	try {
		var types = freeModule$1 && freeModule$1.require && freeModule$1.require("util").types;
		if (types) return types;
		return freeProcess && freeProcess.binding && freeProcess.binding("util");
	} catch (e) {}
}();
// ../DnD helper/node_modules/lodash-es/isTypedArray.js
var nodeIsTypedArray = nodeUtil && nodeUtil.isTypedArray;
/**
* Checks if `value` is classified as a typed array.
*
* @static
* @memberOf _
* @since 3.0.0
* @category Lang
* @param {*} value The value to check.
* @returns {boolean} Returns `true` if `value` is a typed array, else `false`.
* @example
*
* _.isTypedArray(new Uint8Array);
* // => true
*
* _.isTypedArray([]);
* // => false
*/
var isTypedArray = nodeIsTypedArray ? baseUnary(nodeIsTypedArray) : baseIsTypedArray;
// ../DnD helper/node_modules/lodash-es/_arrayLikeKeys.js
/** Used to check objects for own properties. */
var hasOwnProperty$7 = Object.prototype.hasOwnProperty;
/**
* Creates an array of the enumerable property names of the array-like `value`.
*
* @private
* @param {*} value The value to query.
* @param {boolean} inherited Specify returning inherited property names.
* @returns {Array} Returns the array of property names.
*/
function arrayLikeKeys(value, inherited) {
	var isArr = isArray(value), isArg = !isArr && isArguments(value), isBuff = !isArr && !isArg && isBuffer(value), isType = !isArr && !isArg && !isBuff && isTypedArray(value), skipIndexes = isArr || isArg || isBuff || isType, result = skipIndexes ? baseTimes(value.length, String) : [], length = result.length;
	for (var key in value) if ((inherited || hasOwnProperty$7.call(value, key)) && !(skipIndexes && (key == "length" || isBuff && (key == "offset" || key == "parent") || isType && (key == "buffer" || key == "byteLength" || key == "byteOffset") || isIndex(key, length)))) result.push(key);
	return result;
}
// ../DnD helper/node_modules/lodash-es/_overArg.js
/**
* Creates a unary function that invokes `func` with its argument transformed.
*
* @private
* @param {Function} func The function to wrap.
* @param {Function} transform The argument transform.
* @returns {Function} Returns the new function.
*/
function overArg(func, transform) {
	return function(arg) {
		return func(transform(arg));
	};
}
// ../DnD helper/node_modules/lodash-es/_nativeKeys.js
var nativeKeys = overArg(Object.keys, Object);
// ../DnD helper/node_modules/lodash-es/_baseKeys.js
/** Used to check objects for own properties. */
var hasOwnProperty$6 = Object.prototype.hasOwnProperty;
/**
* The base implementation of `_.keys` which doesn't treat sparse arrays as dense.
*
* @private
* @param {Object} object The object to query.
* @returns {Array} Returns the array of property names.
*/
function baseKeys(object) {
	if (!isPrototype(object)) return nativeKeys(object);
	var result = [];
	for (var key in Object(object)) if (hasOwnProperty$6.call(object, key) && key != "constructor") result.push(key);
	return result;
}
// ../DnD helper/node_modules/lodash-es/keys.js
/**
* Creates an array of the own enumerable property names of `object`.
*
* **Note:** Non-object values are coerced to objects. See the
* [ES spec](http://ecma-international.org/ecma-262/7.0/#sec-object.keys)
* for more details.
*
* @static
* @since 0.1.0
* @memberOf _
* @category Object
* @param {Object} object The object to query.
* @returns {Array} Returns the array of property names.
* @example
*
* function Foo() {
*   this.a = 1;
*   this.b = 2;
* }
*
* Foo.prototype.c = 3;
*
* _.keys(new Foo);
* // => ['a', 'b'] (iteration order is not guaranteed)
*
* _.keys('hi');
* // => ['0', '1']
*/
function keys(object) {
	return isArrayLike(object) ? arrayLikeKeys(object) : baseKeys(object);
}
// ../DnD helper/node_modules/lodash-es/_nativeKeysIn.js
/**
* This function is like
* [`Object.keys`](http://ecma-international.org/ecma-262/7.0/#sec-object.keys)
* except that it includes inherited enumerable properties.
*
* @private
* @param {Object} object The object to query.
* @returns {Array} Returns the array of property names.
*/
function nativeKeysIn(object) {
	var result = [];
	if (object != null) for (var key in Object(object)) result.push(key);
	return result;
}
// ../DnD helper/node_modules/lodash-es/_baseKeysIn.js
/** Used to check objects for own properties. */
var hasOwnProperty$5 = Object.prototype.hasOwnProperty;
/**
* The base implementation of `_.keysIn` which doesn't treat sparse arrays as dense.
*
* @private
* @param {Object} object The object to query.
* @returns {Array} Returns the array of property names.
*/
function baseKeysIn(object) {
	if (!isObject(object)) return nativeKeysIn(object);
	var isProto = isPrototype(object), result = [];
	for (var key in object) if (!(key == "constructor" && (isProto || !hasOwnProperty$5.call(object, key)))) result.push(key);
	return result;
}
// ../DnD helper/node_modules/lodash-es/keysIn.js
/**
* Creates an array of the own and inherited enumerable property names of `object`.
*
* **Note:** Non-object values are coerced to objects.
*
* @static
* @memberOf _
* @since 3.0.0
* @category Object
* @param {Object} object The object to query.
* @returns {Array} Returns the array of property names.
* @example
*
* function Foo() {
*   this.a = 1;
*   this.b = 2;
* }
*
* Foo.prototype.c = 3;
*
* _.keysIn(new Foo);
* // => ['a', 'b', 'c'] (iteration order is not guaranteed)
*/
function keysIn(object) {
	return isArrayLike(object) ? arrayLikeKeys(object, true) : baseKeysIn(object);
}
// ../DnD helper/node_modules/lodash-es/_nativeCreate.js
var nativeCreate = getNative(Object, "create");
// ../DnD helper/node_modules/lodash-es/_hashClear.js
/**
* Removes all key-value entries from the hash.
*
* @private
* @name clear
* @memberOf Hash
*/
function hashClear() {
	this.__data__ = nativeCreate ? nativeCreate(null) : {};
	this.size = 0;
}
// ../DnD helper/node_modules/lodash-es/_hashDelete.js
/**
* Removes `key` and its value from the hash.
*
* @private
* @name delete
* @memberOf Hash
* @param {Object} hash The hash to modify.
* @param {string} key The key of the value to remove.
* @returns {boolean} Returns `true` if the entry was removed, else `false`.
*/
function hashDelete(key) {
	var result = this.has(key) && delete this.__data__[key];
	this.size -= result ? 1 : 0;
	return result;
}
// ../DnD helper/node_modules/lodash-es/_hashGet.js
/** Used to stand-in for `undefined` hash values. */
var HASH_UNDEFINED$2 = "__lodash_hash_undefined__";
/** Used to check objects for own properties. */
var hasOwnProperty$4 = Object.prototype.hasOwnProperty;
/**
* Gets the hash value for `key`.
*
* @private
* @name get
* @memberOf Hash
* @param {string} key The key of the value to get.
* @returns {*} Returns the entry value.
*/
function hashGet(key) {
	var data = this.__data__;
	if (nativeCreate) {
		var result = data[key];
		return result === HASH_UNDEFINED$2 ? void 0 : result;
	}
	return hasOwnProperty$4.call(data, key) ? data[key] : void 0;
}
// ../DnD helper/node_modules/lodash-es/_hashHas.js
/** Used to check objects for own properties. */
var hasOwnProperty$3 = Object.prototype.hasOwnProperty;
/**
* Checks if a hash value for `key` exists.
*
* @private
* @name has
* @memberOf Hash
* @param {string} key The key of the entry to check.
* @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
*/
function hashHas(key) {
	var data = this.__data__;
	return nativeCreate ? data[key] !== void 0 : hasOwnProperty$3.call(data, key);
}
// ../DnD helper/node_modules/lodash-es/_hashSet.js
/** Used to stand-in for `undefined` hash values. */
var HASH_UNDEFINED$1 = "__lodash_hash_undefined__";
/**
* Sets the hash `key` to `value`.
*
* @private
* @name set
* @memberOf Hash
* @param {string} key The key of the value to set.
* @param {*} value The value to set.
* @returns {Object} Returns the hash instance.
*/
function hashSet(key, value) {
	var data = this.__data__;
	this.size += this.has(key) ? 0 : 1;
	data[key] = nativeCreate && value === void 0 ? HASH_UNDEFINED$1 : value;
	return this;
}
// ../DnD helper/node_modules/lodash-es/_Hash.js
/**
* Creates a hash object.
*
* @private
* @constructor
* @param {Array} [entries] The key-value pairs to cache.
*/
function Hash(entries) {
	var index = -1, length = entries == null ? 0 : entries.length;
	this.clear();
	while (++index < length) {
		var entry = entries[index];
		this.set(entry[0], entry[1]);
	}
}
Hash.prototype.clear = hashClear;
Hash.prototype["delete"] = hashDelete;
Hash.prototype.get = hashGet;
Hash.prototype.has = hashHas;
Hash.prototype.set = hashSet;
// ../DnD helper/node_modules/lodash-es/_listCacheClear.js
/**
* Removes all key-value entries from the list cache.
*
* @private
* @name clear
* @memberOf ListCache
*/
function listCacheClear() {
	this.__data__ = [];
	this.size = 0;
}
// ../DnD helper/node_modules/lodash-es/_assocIndexOf.js
/**
* Gets the index at which the `key` is found in `array` of key-value pairs.
*
* @private
* @param {Array} array The array to inspect.
* @param {*} key The key to search for.
* @returns {number} Returns the index of the matched value, else `-1`.
*/
function assocIndexOf(array, key) {
	var length = array.length;
	while (length--) if (eq(array[length][0], key)) return length;
	return -1;
}
// ../DnD helper/node_modules/lodash-es/_listCacheDelete.js
/** Built-in value references. */
var splice = Array.prototype.splice;
/**
* Removes `key` and its value from the list cache.
*
* @private
* @name delete
* @memberOf ListCache
* @param {string} key The key of the value to remove.
* @returns {boolean} Returns `true` if the entry was removed, else `false`.
*/
function listCacheDelete(key) {
	var data = this.__data__, index = assocIndexOf(data, key);
	if (index < 0) return false;
	if (index == data.length - 1) data.pop();
	else splice.call(data, index, 1);
	--this.size;
	return true;
}
// ../DnD helper/node_modules/lodash-es/_listCacheGet.js
/**
* Gets the list cache value for `key`.
*
* @private
* @name get
* @memberOf ListCache
* @param {string} key The key of the value to get.
* @returns {*} Returns the entry value.
*/
function listCacheGet(key) {
	var data = this.__data__, index = assocIndexOf(data, key);
	return index < 0 ? void 0 : data[index][1];
}
// ../DnD helper/node_modules/lodash-es/_listCacheHas.js
/**
* Checks if a list cache value for `key` exists.
*
* @private
* @name has
* @memberOf ListCache
* @param {string} key The key of the entry to check.
* @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
*/
function listCacheHas(key) {
	return assocIndexOf(this.__data__, key) > -1;
}
// ../DnD helper/node_modules/lodash-es/_listCacheSet.js
/**
* Sets the list cache `key` to `value`.
*
* @private
* @name set
* @memberOf ListCache
* @param {string} key The key of the value to set.
* @param {*} value The value to set.
* @returns {Object} Returns the list cache instance.
*/
function listCacheSet(key, value) {
	var data = this.__data__, index = assocIndexOf(data, key);
	if (index < 0) {
		++this.size;
		data.push([key, value]);
	} else data[index][1] = value;
	return this;
}
// ../DnD helper/node_modules/lodash-es/_ListCache.js
/**
* Creates an list cache object.
*
* @private
* @constructor
* @param {Array} [entries] The key-value pairs to cache.
*/
function ListCache(entries) {
	var index = -1, length = entries == null ? 0 : entries.length;
	this.clear();
	while (++index < length) {
		var entry = entries[index];
		this.set(entry[0], entry[1]);
	}
}
ListCache.prototype.clear = listCacheClear;
ListCache.prototype["delete"] = listCacheDelete;
ListCache.prototype.get = listCacheGet;
ListCache.prototype.has = listCacheHas;
ListCache.prototype.set = listCacheSet;
// ../DnD helper/node_modules/lodash-es/_Map.js
var Map$1 = getNative(root, "Map");
// ../DnD helper/node_modules/lodash-es/_mapCacheClear.js
/**
* Removes all key-value entries from the map.
*
* @private
* @name clear
* @memberOf MapCache
*/
function mapCacheClear() {
	this.size = 0;
	this.__data__ = {
		"hash": new Hash(),
		"map": new (Map$1 || ListCache)(),
		"string": new Hash()
	};
}
// ../DnD helper/node_modules/lodash-es/_isKeyable.js
/**
* Checks if `value` is suitable for use as unique object key.
*
* @private
* @param {*} value The value to check.
* @returns {boolean} Returns `true` if `value` is suitable, else `false`.
*/
function isKeyable(value) {
	var type = typeof value;
	return type == "string" || type == "number" || type == "symbol" || type == "boolean" ? value !== "__proto__" : value === null;
}
// ../DnD helper/node_modules/lodash-es/_getMapData.js
/**
* Gets the data for `map`.
*
* @private
* @param {Object} map The map to query.
* @param {string} key The reference key.
* @returns {*} Returns the map data.
*/
function getMapData(map, key) {
	var data = map.__data__;
	return isKeyable(key) ? data[typeof key == "string" ? "string" : "hash"] : data.map;
}
// ../DnD helper/node_modules/lodash-es/_mapCacheDelete.js
/**
* Removes `key` and its value from the map.
*
* @private
* @name delete
* @memberOf MapCache
* @param {string} key The key of the value to remove.
* @returns {boolean} Returns `true` if the entry was removed, else `false`.
*/
function mapCacheDelete(key) {
	var result = getMapData(this, key)["delete"](key);
	this.size -= result ? 1 : 0;
	return result;
}
// ../DnD helper/node_modules/lodash-es/_mapCacheGet.js
/**
* Gets the map value for `key`.
*
* @private
* @name get
* @memberOf MapCache
* @param {string} key The key of the value to get.
* @returns {*} Returns the entry value.
*/
function mapCacheGet(key) {
	return getMapData(this, key).get(key);
}
// ../DnD helper/node_modules/lodash-es/_mapCacheHas.js
/**
* Checks if a map value for `key` exists.
*
* @private
* @name has
* @memberOf MapCache
* @param {string} key The key of the entry to check.
* @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
*/
function mapCacheHas(key) {
	return getMapData(this, key).has(key);
}
// ../DnD helper/node_modules/lodash-es/_mapCacheSet.js
/**
* Sets the map `key` to `value`.
*
* @private
* @name set
* @memberOf MapCache
* @param {string} key The key of the value to set.
* @param {*} value The value to set.
* @returns {Object} Returns the map cache instance.
*/
function mapCacheSet(key, value) {
	var data = getMapData(this, key), size = data.size;
	data.set(key, value);
	this.size += data.size == size ? 0 : 1;
	return this;
}
// ../DnD helper/node_modules/lodash-es/_MapCache.js
/**
* Creates a map cache object to store key-value pairs.
*
* @private
* @constructor
* @param {Array} [entries] The key-value pairs to cache.
*/
function MapCache(entries) {
	var index = -1, length = entries == null ? 0 : entries.length;
	this.clear();
	while (++index < length) {
		var entry = entries[index];
		this.set(entry[0], entry[1]);
	}
}
MapCache.prototype.clear = mapCacheClear;
MapCache.prototype["delete"] = mapCacheDelete;
MapCache.prototype.get = mapCacheGet;
MapCache.prototype.has = mapCacheHas;
MapCache.prototype.set = mapCacheSet;
// ../DnD helper/node_modules/lodash-es/toString.js
/**
* Converts `value` to a string. An empty string is returned for `null`
* and `undefined` values. The sign of `-0` is preserved.
*
* @static
* @memberOf _
* @since 4.0.0
* @category Lang
* @param {*} value The value to convert.
* @returns {string} Returns the converted string.
* @example
*
* _.toString(null);
* // => ''
*
* _.toString(-0);
* // => '-0'
*
* _.toString([1, 2, 3]);
* // => '1,2,3'
*/
function toString(value) {
	return value == null ? "" : baseToString(value);
}
// ../DnD helper/node_modules/lodash-es/_arrayPush.js
/**
* Appends the elements of `values` to `array`.
*
* @private
* @param {Array} array The array to modify.
* @param {Array} values The values to append.
* @returns {Array} Returns `array`.
*/
function arrayPush(array, values) {
	var index = -1, length = values.length, offset = array.length;
	while (++index < length) array[offset + index] = values[index];
	return array;
}
// ../DnD helper/node_modules/lodash-es/_getPrototype.js
/** Built-in value references. */
var getPrototype = overArg(Object.getPrototypeOf, Object);
// ../DnD helper/node_modules/lodash-es/isPlainObject.js
/** `Object#toString` result references. */
var objectTag$2 = "[object Object]";
/** Used for built-in method references. */
var funcProto = Function.prototype;
var objectProto = Object.prototype;
/** Used to resolve the decompiled source of functions. */
var funcToString = funcProto.toString;
/** Used to check objects for own properties. */
var hasOwnProperty$2 = objectProto.hasOwnProperty;
/** Used to infer the `Object` constructor. */
var objectCtorString = funcToString.call(Object);
/**
* Checks if `value` is a plain object, that is, an object created by the
* `Object` constructor or one with a `[[Prototype]]` of `null`.
*
* @static
* @memberOf _
* @since 0.8.0
* @category Lang
* @param {*} value The value to check.
* @returns {boolean} Returns `true` if `value` is a plain object, else `false`.
* @example
*
* function Foo() {
*   this.a = 1;
* }
*
* _.isPlainObject(new Foo);
* // => false
*
* _.isPlainObject([1, 2, 3]);
* // => false
*
* _.isPlainObject({ 'x': 0, 'y': 0 });
* // => true
*
* _.isPlainObject(Object.create(null));
* // => true
*/
function isPlainObject(value) {
	if (!isObjectLike(value) || baseGetTag(value) != objectTag$2) return false;
	var proto = getPrototype(value);
	if (proto === null) return true;
	var Ctor = hasOwnProperty$2.call(proto, "constructor") && proto.constructor;
	return typeof Ctor == "function" && Ctor instanceof Ctor && funcToString.call(Ctor) == objectCtorString;
}
// ../DnD helper/node_modules/lodash-es/_baseSlice.js
/**
* The base implementation of `_.slice` without an iteratee call guard.
*
* @private
* @param {Array} array The array to slice.
* @param {number} [start=0] The start position.
* @param {number} [end=array.length] The end position.
* @returns {Array} Returns the slice of `array`.
*/
function baseSlice(array, start, end) {
	var index = -1, length = array.length;
	if (start < 0) start = -start > length ? 0 : length + start;
	end = end > length ? length : end;
	if (end < 0) end += length;
	length = start > end ? 0 : end - start >>> 0;
	start >>>= 0;
	var result = Array(length);
	while (++index < length) result[index] = array[index + start];
	return result;
}
// ../DnD helper/node_modules/lodash-es/_createRound.js
var nativeIsFinite = root.isFinite;
var nativeMin$1 = Math.min;
/**
* Creates a function like `_.round`.
*
* @private
* @param {string} methodName The name of the `Math` method to use when rounding.
* @returns {Function} Returns the new round function.
*/
function createRound(methodName) {
	var func = Math[methodName];
	return function(number, precision) {
		number = toNumber(number);
		precision = precision == null ? 0 : nativeMin$1(toInteger(precision), 292);
		if (precision && nativeIsFinite(number)) {
			var pair = (toString(number) + "e").split("e");
			pair = (toString(func(pair[0] + "e" + (+pair[1] + precision))) + "e").split("e");
			return +(pair[0] + "e" + (+pair[1] - precision));
		}
		return func(number);
	};
}
// ../DnD helper/node_modules/lodash-es/chunk.js
var nativeCeil = Math.ceil;
var nativeMax$1 = Math.max;
/**
* Creates an array of elements split into groups the length of `size`.
* If `array` can't be split evenly, the final chunk will be the remaining
* elements.
*
* @static
* @memberOf _
* @since 3.0.0
* @category Array
* @param {Array} array The array to process.
* @param {number} [size=1] The length of each chunk
* @param- {Object} [guard] Enables use as an iteratee for methods like `_.map`.
* @returns {Array} Returns the new array of chunks.
* @example
*
* _.chunk(['a', 'b', 'c', 'd'], 2);
* // => [['a', 'b'], ['c', 'd']]
*
* _.chunk(['a', 'b', 'c', 'd'], 3);
* // => [['a', 'b', 'c'], ['d']]
*/
function chunk(array, size, guard) {
	if (guard ? isIterateeCall(array, size, guard) : size === void 0) size = 1;
	else size = nativeMax$1(toInteger(size), 0);
	var length = array == null ? 0 : array.length;
	if (!length || size < 1) return [];
	var index = 0, resIndex = 0, result = Array(nativeCeil(length / size));
	while (index < length) result[resIndex++] = baseSlice(array, index, index += size);
	return result;
}
// ../DnD helper/node_modules/lodash-es/_stackClear.js
/**
* Removes all key-value entries from the stack.
*
* @private
* @name clear
* @memberOf Stack
*/
function stackClear() {
	this.__data__ = new ListCache();
	this.size = 0;
}
// ../DnD helper/node_modules/lodash-es/_stackDelete.js
/**
* Removes `key` and its value from the stack.
*
* @private
* @name delete
* @memberOf Stack
* @param {string} key The key of the value to remove.
* @returns {boolean} Returns `true` if the entry was removed, else `false`.
*/
function stackDelete(key) {
	var data = this.__data__, result = data["delete"](key);
	this.size = data.size;
	return result;
}
// ../DnD helper/node_modules/lodash-es/_stackGet.js
/**
* Gets the stack value for `key`.
*
* @private
* @name get
* @memberOf Stack
* @param {string} key The key of the value to get.
* @returns {*} Returns the entry value.
*/
function stackGet(key) {
	return this.__data__.get(key);
}
// ../DnD helper/node_modules/lodash-es/_stackHas.js
/**
* Checks if a stack value for `key` exists.
*
* @private
* @name has
* @memberOf Stack
* @param {string} key The key of the entry to check.
* @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
*/
function stackHas(key) {
	return this.__data__.has(key);
}
// ../DnD helper/node_modules/lodash-es/_stackSet.js
/** Used as the size to enable large array optimizations. */
var LARGE_ARRAY_SIZE$1 = 200;
/**
* Sets the stack `key` to `value`.
*
* @private
* @name set
* @memberOf Stack
* @param {string} key The key of the value to set.
* @param {*} value The value to set.
* @returns {Object} Returns the stack cache instance.
*/
function stackSet(key, value) {
	var data = this.__data__;
	if (data instanceof ListCache) {
		var pairs = data.__data__;
		if (!Map$1 || pairs.length < LARGE_ARRAY_SIZE$1 - 1) {
			pairs.push([key, value]);
			this.size = ++data.size;
			return this;
		}
		data = this.__data__ = new MapCache(pairs);
	}
	data.set(key, value);
	this.size = data.size;
	return this;
}
// ../DnD helper/node_modules/lodash-es/_Stack.js
/**
* Creates a stack cache object to store key-value pairs.
*
* @private
* @constructor
* @param {Array} [entries] The key-value pairs to cache.
*/
function Stack(entries) {
	var data = this.__data__ = new ListCache(entries);
	this.size = data.size;
}
Stack.prototype.clear = stackClear;
Stack.prototype["delete"] = stackDelete;
Stack.prototype.get = stackGet;
Stack.prototype.has = stackHas;
Stack.prototype.set = stackSet;
// ../DnD helper/node_modules/lodash-es/_cloneBuffer.js
/** Detect free variable `exports`. */
var freeExports = typeof exports == "object" && exports && !exports.nodeType && exports;
/** Detect free variable `module`. */
var freeModule = freeExports && typeof module == "object" && module && !module.nodeType && module;
/** Built-in value references. */
var Buffer$1 = freeModule && freeModule.exports === freeExports ? root.Buffer : void 0;
var allocUnsafe = Buffer$1 ? Buffer$1.allocUnsafe : void 0;
/**
* Creates a clone of  `buffer`.
*
* @private
* @param {Buffer} buffer The buffer to clone.
* @param {boolean} [isDeep] Specify a deep clone.
* @returns {Buffer} Returns the cloned buffer.
*/
function cloneBuffer(buffer, isDeep) {
	if (isDeep) return buffer.slice();
	var length = buffer.length, result = allocUnsafe ? allocUnsafe(length) : new buffer.constructor(length);
	buffer.copy(result);
	return result;
}
// ../DnD helper/node_modules/lodash-es/_arrayFilter.js
/**
* A specialized version of `_.filter` for arrays without support for
* iteratee shorthands.
*
* @private
* @param {Array} [array] The array to iterate over.
* @param {Function} predicate The function invoked per iteration.
* @returns {Array} Returns the new filtered array.
*/
function arrayFilter(array, predicate) {
	var index = -1, length = array == null ? 0 : array.length, resIndex = 0, result = [];
	while (++index < length) {
		var value = array[index];
		if (predicate(value, index, array)) result[resIndex++] = value;
	}
	return result;
}
// ../DnD helper/node_modules/lodash-es/stubArray.js
/**
* This method returns a new empty array.
*
* @static
* @memberOf _
* @since 4.13.0
* @category Util
* @returns {Array} Returns the new empty array.
* @example
*
* var arrays = _.times(2, _.stubArray);
*
* console.log(arrays);
* // => [[], []]
*
* console.log(arrays[0] === arrays[1]);
* // => false
*/
function stubArray() {
	return [];
}
// ../DnD helper/node_modules/lodash-es/_getSymbols.js
/** Built-in value references. */
var propertyIsEnumerable = Object.prototype.propertyIsEnumerable;
var nativeGetSymbols = Object.getOwnPropertySymbols;
/**
* Creates an array of the own enumerable symbols of `object`.
*
* @private
* @param {Object} object The object to query.
* @returns {Array} Returns the array of symbols.
*/
var getSymbols = !nativeGetSymbols ? stubArray : function(object) {
	if (object == null) return [];
	object = Object(object);
	return arrayFilter(nativeGetSymbols(object), function(symbol) {
		return propertyIsEnumerable.call(object, symbol);
	});
};
// ../DnD helper/node_modules/lodash-es/_baseGetAllKeys.js
/**
* The base implementation of `getAllKeys` and `getAllKeysIn` which uses
* `keysFunc` and `symbolsFunc` to get the enumerable property names and
* symbols of `object`.
*
* @private
* @param {Object} object The object to query.
* @param {Function} keysFunc The function to get the keys of `object`.
* @param {Function} symbolsFunc The function to get the symbols of `object`.
* @returns {Array} Returns the array of property names and symbols.
*/
function baseGetAllKeys(object, keysFunc, symbolsFunc) {
	var result = keysFunc(object);
	return isArray(object) ? result : arrayPush(result, symbolsFunc(object));
}
// ../DnD helper/node_modules/lodash-es/_getAllKeys.js
/**
* Creates an array of own enumerable property names and symbols of `object`.
*
* @private
* @param {Object} object The object to query.
* @returns {Array} Returns the array of property names and symbols.
*/
function getAllKeys(object) {
	return baseGetAllKeys(object, keys, getSymbols);
}
// ../DnD helper/node_modules/lodash-es/_DataView.js
var DataView = getNative(root, "DataView");
// ../DnD helper/node_modules/lodash-es/_Promise.js
var Promise$1 = getNative(root, "Promise");
// ../DnD helper/node_modules/lodash-es/_Set.js
var Set$1 = getNative(root, "Set");
// ../DnD helper/node_modules/lodash-es/_getTag.js
/** `Object#toString` result references. */
var mapTag$1 = "[object Map]";
var objectTag$1 = "[object Object]";
var promiseTag = "[object Promise]";
var setTag$1 = "[object Set]";
var weakMapTag = "[object WeakMap]";
var dataViewTag$1 = "[object DataView]";
/** Used to detect maps, sets, and weakmaps. */
var dataViewCtorString = toSource(DataView);
var mapCtorString = toSource(Map$1);
var promiseCtorString = toSource(Promise$1);
var setCtorString = toSource(Set$1);
var weakMapCtorString = toSource(WeakMap$1);
/**
* Gets the `toStringTag` of `value`.
*
* @private
* @param {*} value The value to query.
* @returns {string} Returns the `toStringTag`.
*/
var getTag = baseGetTag;
if (DataView && getTag(new DataView(/* @__PURE__ */ new ArrayBuffer(1))) != dataViewTag$1 || Map$1 && getTag(new Map$1()) != mapTag$1 || Promise$1 && getTag(Promise$1.resolve()) != promiseTag || Set$1 && getTag(new Set$1()) != setTag$1 || WeakMap$1 && getTag(new WeakMap$1()) != weakMapTag) getTag = function(value) {
	var result = baseGetTag(value), Ctor = result == objectTag$1 ? value.constructor : void 0, ctorString = Ctor ? toSource(Ctor) : "";
	if (ctorString) switch (ctorString) {
		case dataViewCtorString: return dataViewTag$1;
		case mapCtorString: return mapTag$1;
		case promiseCtorString: return promiseTag;
		case setCtorString: return setTag$1;
		case weakMapCtorString: return weakMapTag;
	}
	return result;
};
var _getTag_default = getTag;
// ../DnD helper/node_modules/lodash-es/_Uint8Array.js
/** Built-in value references. */
var Uint8Array = root.Uint8Array;
// ../DnD helper/node_modules/lodash-es/_cloneArrayBuffer.js
/**
* Creates a clone of `arrayBuffer`.
*
* @private
* @param {ArrayBuffer} arrayBuffer The array buffer to clone.
* @returns {ArrayBuffer} Returns the cloned array buffer.
*/
function cloneArrayBuffer(arrayBuffer) {
	var result = new arrayBuffer.constructor(arrayBuffer.byteLength);
	new Uint8Array(result).set(new Uint8Array(arrayBuffer));
	return result;
}
// ../DnD helper/node_modules/lodash-es/_cloneTypedArray.js
/**
* Creates a clone of `typedArray`.
*
* @private
* @param {Object} typedArray The typed array to clone.
* @param {boolean} [isDeep] Specify a deep clone.
* @returns {Object} Returns the cloned typed array.
*/
function cloneTypedArray(typedArray, isDeep) {
	var buffer = isDeep ? cloneArrayBuffer(typedArray.buffer) : typedArray.buffer;
	return new typedArray.constructor(buffer, typedArray.byteOffset, typedArray.length);
}
// ../DnD helper/node_modules/lodash-es/_initCloneObject.js
/**
* Initializes an object clone.
*
* @private
* @param {Object} object The object to clone.
* @returns {Object} Returns the initialized clone.
*/
function initCloneObject(object) {
	return typeof object.constructor == "function" && !isPrototype(object) ? baseCreate(getPrototype(object)) : {};
}
// ../DnD helper/node_modules/lodash-es/_setCacheAdd.js
/** Used to stand-in for `undefined` hash values. */
var HASH_UNDEFINED = "__lodash_hash_undefined__";
/**
* Adds `value` to the array cache.
*
* @private
* @name add
* @memberOf SetCache
* @alias push
* @param {*} value The value to cache.
* @returns {Object} Returns the cache instance.
*/
function setCacheAdd(value) {
	this.__data__.set(value, HASH_UNDEFINED);
	return this;
}
// ../DnD helper/node_modules/lodash-es/_setCacheHas.js
/**
* Checks if `value` is in the array cache.
*
* @private
* @name has
* @memberOf SetCache
* @param {*} value The value to search for.
* @returns {boolean} Returns `true` if `value` is found, else `false`.
*/
function setCacheHas(value) {
	return this.__data__.has(value);
}
// ../DnD helper/node_modules/lodash-es/_SetCache.js
/**
*
* Creates an array cache object to store unique values.
*
* @private
* @constructor
* @param {Array} [values] The values to cache.
*/
function SetCache(values) {
	var index = -1, length = values == null ? 0 : values.length;
	this.__data__ = new MapCache();
	while (++index < length) this.add(values[index]);
}
SetCache.prototype.add = SetCache.prototype.push = setCacheAdd;
SetCache.prototype.has = setCacheHas;
// ../DnD helper/node_modules/lodash-es/_arraySome.js
/**
* A specialized version of `_.some` for arrays without support for iteratee
* shorthands.
*
* @private
* @param {Array} [array] The array to iterate over.
* @param {Function} predicate The function invoked per iteration.
* @returns {boolean} Returns `true` if any element passes the predicate check,
*  else `false`.
*/
function arraySome(array, predicate) {
	var index = -1, length = array == null ? 0 : array.length;
	while (++index < length) if (predicate(array[index], index, array)) return true;
	return false;
}
// ../DnD helper/node_modules/lodash-es/_cacheHas.js
/**
* Checks if a `cache` value for `key` exists.
*
* @private
* @param {Object} cache The cache to query.
* @param {string} key The key of the entry to check.
* @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
*/
function cacheHas(cache, key) {
	return cache.has(key);
}
// ../DnD helper/node_modules/lodash-es/_equalArrays.js
/** Used to compose bitmasks for value comparisons. */
var COMPARE_PARTIAL_FLAG$3 = 1;
var COMPARE_UNORDERED_FLAG$1 = 2;
/**
* A specialized version of `baseIsEqualDeep` for arrays with support for
* partial deep comparisons.
*
* @private
* @param {Array} array The array to compare.
* @param {Array} other The other array to compare.
* @param {number} bitmask The bitmask flags. See `baseIsEqual` for more details.
* @param {Function} customizer The function to customize comparisons.
* @param {Function} equalFunc The function to determine equivalents of values.
* @param {Object} stack Tracks traversed `array` and `other` objects.
* @returns {boolean} Returns `true` if the arrays are equivalent, else `false`.
*/
function equalArrays(array, other, bitmask, customizer, equalFunc, stack) {
	var isPartial = bitmask & COMPARE_PARTIAL_FLAG$3, arrLength = array.length, othLength = other.length;
	if (arrLength != othLength && !(isPartial && othLength > arrLength)) return false;
	var arrStacked = stack.get(array);
	var othStacked = stack.get(other);
	if (arrStacked && othStacked) return arrStacked == other && othStacked == array;
	var index = -1, result = true, seen = bitmask & COMPARE_UNORDERED_FLAG$1 ? new SetCache() : void 0;
	stack.set(array, other);
	stack.set(other, array);
	while (++index < arrLength) {
		var arrValue = array[index], othValue = other[index];
		if (customizer) var compared = isPartial ? customizer(othValue, arrValue, index, other, array, stack) : customizer(arrValue, othValue, index, array, other, stack);
		if (compared !== void 0) {
			if (compared) continue;
			result = false;
			break;
		}
		if (seen) {
			if (!arraySome(other, function(othValue, othIndex) {
				if (!cacheHas(seen, othIndex) && (arrValue === othValue || equalFunc(arrValue, othValue, bitmask, customizer, stack))) return seen.push(othIndex);
			})) {
				result = false;
				break;
			}
		} else if (!(arrValue === othValue || equalFunc(arrValue, othValue, bitmask, customizer, stack))) {
			result = false;
			break;
		}
	}
	stack["delete"](array);
	stack["delete"](other);
	return result;
}
// ../DnD helper/node_modules/lodash-es/_mapToArray.js
/**
* Converts `map` to its key-value pairs.
*
* @private
* @param {Object} map The map to convert.
* @returns {Array} Returns the key-value pairs.
*/
function mapToArray(map) {
	var index = -1, result = Array(map.size);
	map.forEach(function(value, key) {
		result[++index] = [key, value];
	});
	return result;
}
// ../DnD helper/node_modules/lodash-es/_setToArray.js
/**
* Converts `set` to an array of its values.
*
* @private
* @param {Object} set The set to convert.
* @returns {Array} Returns the values.
*/
function setToArray(set) {
	var index = -1, result = Array(set.size);
	set.forEach(function(value) {
		result[++index] = value;
	});
	return result;
}
// ../DnD helper/node_modules/lodash-es/_equalByTag.js
/** Used to compose bitmasks for value comparisons. */
var COMPARE_PARTIAL_FLAG$2 = 1;
var COMPARE_UNORDERED_FLAG = 2;
/** `Object#toString` result references. */
var boolTag = "[object Boolean]";
var dateTag = "[object Date]";
var errorTag = "[object Error]";
var mapTag = "[object Map]";
var numberTag = "[object Number]";
var regexpTag = "[object RegExp]";
var setTag = "[object Set]";
var stringTag = "[object String]";
var symbolTag = "[object Symbol]";
var arrayBufferTag = "[object ArrayBuffer]";
var dataViewTag = "[object DataView]";
/** Used to convert symbols to primitives and strings. */
var symbolProto = Symbol$1 ? Symbol$1.prototype : void 0;
var symbolValueOf = symbolProto ? symbolProto.valueOf : void 0;
/**
* A specialized version of `baseIsEqualDeep` for comparing objects of
* the same `toStringTag`.
*
* **Note:** This function only supports comparing values with tags of
* `Boolean`, `Date`, `Error`, `Number`, `RegExp`, or `String`.
*
* @private
* @param {Object} object The object to compare.
* @param {Object} other The other object to compare.
* @param {string} tag The `toStringTag` of the objects to compare.
* @param {number} bitmask The bitmask flags. See `baseIsEqual` for more details.
* @param {Function} customizer The function to customize comparisons.
* @param {Function} equalFunc The function to determine equivalents of values.
* @param {Object} stack Tracks traversed `object` and `other` objects.
* @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
*/
function equalByTag(object, other, tag, bitmask, customizer, equalFunc, stack) {
	switch (tag) {
		case dataViewTag:
			if (object.byteLength != other.byteLength || object.byteOffset != other.byteOffset) return false;
			object = object.buffer;
			other = other.buffer;
		case arrayBufferTag:
			if (object.byteLength != other.byteLength || !equalFunc(new Uint8Array(object), new Uint8Array(other))) return false;
			return true;
		case boolTag:
		case dateTag:
		case numberTag: return eq(+object, +other);
		case errorTag: return object.name == other.name && object.message == other.message;
		case regexpTag:
		case stringTag: return object == other + "";
		case mapTag: var convert = mapToArray;
		case setTag:
			var isPartial = bitmask & COMPARE_PARTIAL_FLAG$2;
			convert || (convert = setToArray);
			if (object.size != other.size && !isPartial) return false;
			var stacked = stack.get(object);
			if (stacked) return stacked == other;
			bitmask |= COMPARE_UNORDERED_FLAG;
			stack.set(object, other);
			var result = equalArrays(convert(object), convert(other), bitmask, customizer, equalFunc, stack);
			stack["delete"](object);
			return result;
		case symbolTag: if (symbolValueOf) return symbolValueOf.call(object) == symbolValueOf.call(other);
	}
	return false;
}
// ../DnD helper/node_modules/lodash-es/_equalObjects.js
/** Used to compose bitmasks for value comparisons. */
var COMPARE_PARTIAL_FLAG$1 = 1;
/** Used to check objects for own properties. */
var hasOwnProperty$1 = Object.prototype.hasOwnProperty;
/**
* A specialized version of `baseIsEqualDeep` for objects with support for
* partial deep comparisons.
*
* @private
* @param {Object} object The object to compare.
* @param {Object} other The other object to compare.
* @param {number} bitmask The bitmask flags. See `baseIsEqual` for more details.
* @param {Function} customizer The function to customize comparisons.
* @param {Function} equalFunc The function to determine equivalents of values.
* @param {Object} stack Tracks traversed `object` and `other` objects.
* @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
*/
function equalObjects(object, other, bitmask, customizer, equalFunc, stack) {
	var isPartial = bitmask & COMPARE_PARTIAL_FLAG$1, objProps = getAllKeys(object), objLength = objProps.length;
	if (objLength != getAllKeys(other).length && !isPartial) return false;
	var index = objLength;
	while (index--) {
		var key = objProps[index];
		if (!(isPartial ? key in other : hasOwnProperty$1.call(other, key))) return false;
	}
	var objStacked = stack.get(object);
	var othStacked = stack.get(other);
	if (objStacked && othStacked) return objStacked == other && othStacked == object;
	var result = true;
	stack.set(object, other);
	stack.set(other, object);
	var skipCtor = isPartial;
	while (++index < objLength) {
		key = objProps[index];
		var objValue = object[key], othValue = other[key];
		if (customizer) var compared = isPartial ? customizer(othValue, objValue, key, other, object, stack) : customizer(objValue, othValue, key, object, other, stack);
		if (!(compared === void 0 ? objValue === othValue || equalFunc(objValue, othValue, bitmask, customizer, stack) : compared)) {
			result = false;
			break;
		}
		skipCtor || (skipCtor = key == "constructor");
	}
	if (result && !skipCtor) {
		var objCtor = object.constructor, othCtor = other.constructor;
		if (objCtor != othCtor && "constructor" in object && "constructor" in other && !(typeof objCtor == "function" && objCtor instanceof objCtor && typeof othCtor == "function" && othCtor instanceof othCtor)) result = false;
	}
	stack["delete"](object);
	stack["delete"](other);
	return result;
}
// ../DnD helper/node_modules/lodash-es/_baseIsEqualDeep.js
/** Used to compose bitmasks for value comparisons. */
var COMPARE_PARTIAL_FLAG = 1;
/** `Object#toString` result references. */
var argsTag = "[object Arguments]";
var arrayTag = "[object Array]";
var objectTag = "[object Object]";
/** Used to check objects for own properties. */
var hasOwnProperty = Object.prototype.hasOwnProperty;
/**
* A specialized version of `baseIsEqual` for arrays and objects which performs
* deep comparisons and tracks traversed objects enabling objects with circular
* references to be compared.
*
* @private
* @param {Object} object The object to compare.
* @param {Object} other The other object to compare.
* @param {number} bitmask The bitmask flags. See `baseIsEqual` for more details.
* @param {Function} customizer The function to customize comparisons.
* @param {Function} equalFunc The function to determine equivalents of values.
* @param {Object} [stack] Tracks traversed `object` and `other` objects.
* @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
*/
function baseIsEqualDeep(object, other, bitmask, customizer, equalFunc, stack) {
	var objIsArr = isArray(object), othIsArr = isArray(other), objTag = objIsArr ? arrayTag : _getTag_default(object), othTag = othIsArr ? arrayTag : _getTag_default(other);
	objTag = objTag == argsTag ? objectTag : objTag;
	othTag = othTag == argsTag ? objectTag : othTag;
	var objIsObj = objTag == objectTag, othIsObj = othTag == objectTag, isSameTag = objTag == othTag;
	if (isSameTag && isBuffer(object)) {
		if (!isBuffer(other)) return false;
		objIsArr = true;
		objIsObj = false;
	}
	if (isSameTag && !objIsObj) {
		stack || (stack = new Stack());
		return objIsArr || isTypedArray(object) ? equalArrays(object, other, bitmask, customizer, equalFunc, stack) : equalByTag(object, other, objTag, bitmask, customizer, equalFunc, stack);
	}
	if (!(bitmask & COMPARE_PARTIAL_FLAG)) {
		var objIsWrapped = objIsObj && hasOwnProperty.call(object, "__wrapped__"), othIsWrapped = othIsObj && hasOwnProperty.call(other, "__wrapped__");
		if (objIsWrapped || othIsWrapped) {
			var objUnwrapped = objIsWrapped ? object.value() : object, othUnwrapped = othIsWrapped ? other.value() : other;
			stack || (stack = new Stack());
			return equalFunc(objUnwrapped, othUnwrapped, bitmask, customizer, stack);
		}
	}
	if (!isSameTag) return false;
	stack || (stack = new Stack());
	return equalObjects(object, other, bitmask, customizer, equalFunc, stack);
}
// ../DnD helper/node_modules/lodash-es/_baseIsEqual.js
/**
* The base implementation of `_.isEqual` which supports partial comparisons
* and tracks traversed objects.
*
* @private
* @param {*} value The value to compare.
* @param {*} other The other value to compare.
* @param {boolean} bitmask The bitmask flags.
*  1 - Unordered comparison
*  2 - Partial comparison
* @param {Function} [customizer] The function to customize comparisons.
* @param {Object} [stack] Tracks traversed `value` and `other` objects.
* @returns {boolean} Returns `true` if the values are equivalent, else `false`.
*/
function baseIsEqual(value, other, bitmask, customizer, stack) {
	if (value === other) return true;
	if (value == null || other == null || !isObjectLike(value) && !isObjectLike(other)) return value !== value && other !== other;
	return baseIsEqualDeep(value, other, bitmask, customizer, baseIsEqual, stack);
}
// ../DnD helper/node_modules/lodash-es/_createBaseFor.js
/**
* Creates a base function for methods like `_.forIn` and `_.forOwn`.
*
* @private
* @param {boolean} [fromRight] Specify iterating from right to left.
* @returns {Function} Returns the new base function.
*/
function createBaseFor(fromRight) {
	return function(object, iteratee, keysFunc) {
		var index = -1, iterable = Object(object), props = keysFunc(object), length = props.length;
		while (length--) {
			var key = props[fromRight ? length : ++index];
			if (iteratee(iterable[key], key, iterable) === false) break;
		}
		return object;
	};
}
// ../DnD helper/node_modules/lodash-es/_baseFor.js
/**
* The base implementation of `baseForOwn` which iterates over `object`
* properties returned by `keysFunc` and invokes `iteratee` for each property.
* Iteratee functions may exit iteration early by explicitly returning `false`.
*
* @private
* @param {Object} object The object to iterate over.
* @param {Function} iteratee The function invoked per iteration.
* @param {Function} keysFunc The function to get the keys of `object`.
* @returns {Object} Returns `object`.
*/
var baseFor = createBaseFor();
// ../DnD helper/node_modules/lodash-es/now.js
/**
* Gets the timestamp of the number of milliseconds that have elapsed since
* the Unix epoch (1 January 1970 00:00:00 UTC).
*
* @static
* @memberOf _
* @since 2.4.0
* @category Date
* @returns {number} Returns the timestamp.
* @example
*
* _.defer(function(stamp) {
*   console.log(_.now() - stamp);
* }, _.now());
* // => Logs the number of milliseconds it took for the deferred invocation.
*/
var now = function() {
	return root.Date.now();
};
// ../DnD helper/node_modules/lodash-es/debounce.js
/** Error message constants. */
var FUNC_ERROR_TEXT = "Expected a function";
var nativeMax = Math.max;
var nativeMin = Math.min;
/**
* Creates a debounced function that delays invoking `func` until after `wait`
* milliseconds have elapsed since the last time the debounced function was
* invoked. The debounced function comes with a `cancel` method to cancel
* delayed `func` invocations and a `flush` method to immediately invoke them.
* Provide `options` to indicate whether `func` should be invoked on the
* leading and/or trailing edge of the `wait` timeout. The `func` is invoked
* with the last arguments provided to the debounced function. Subsequent
* calls to the debounced function return the result of the last `func`
* invocation.
*
* **Note:** If `leading` and `trailing` options are `true`, `func` is
* invoked on the trailing edge of the timeout only if the debounced function
* is invoked more than once during the `wait` timeout.
*
* If `wait` is `0` and `leading` is `false`, `func` invocation is deferred
* until to the next tick, similar to `setTimeout` with a timeout of `0`.
*
* See [David Corbacho's article](https://css-tricks.com/debouncing-throttling-explained-examples/)
* for details over the differences between `_.debounce` and `_.throttle`.
*
* @static
* @memberOf _
* @since 0.1.0
* @category Function
* @param {Function} func The function to debounce.
* @param {number} [wait=0] The number of milliseconds to delay.
* @param {Object} [options={}] The options object.
* @param {boolean} [options.leading=false]
*  Specify invoking on the leading edge of the timeout.
* @param {number} [options.maxWait]
*  The maximum time `func` is allowed to be delayed before it's invoked.
* @param {boolean} [options.trailing=true]
*  Specify invoking on the trailing edge of the timeout.
* @returns {Function} Returns the new debounced function.
* @example
*
* // Avoid costly calculations while the window size is in flux.
* jQuery(window).on('resize', _.debounce(calculateLayout, 150));
*
* // Invoke `sendMail` when clicked, debouncing subsequent calls.
* jQuery(element).on('click', _.debounce(sendMail, 300, {
*   'leading': true,
*   'trailing': false
* }));
*
* // Ensure `batchLog` is invoked once after 1 second of debounced calls.
* var debounced = _.debounce(batchLog, 250, { 'maxWait': 1000 });
* var source = new EventSource('/stream');
* jQuery(source).on('message', debounced);
*
* // Cancel the trailing debounced invocation.
* jQuery(window).on('popstate', debounced.cancel);
*/
function debounce(func, wait, options) {
	var lastArgs, lastThis, maxWait, result, timerId, lastCallTime, lastInvokeTime = 0, leading = false, maxing = false, trailing = true;
	if (typeof func != "function") throw new TypeError(FUNC_ERROR_TEXT);
	wait = toNumber(wait) || 0;
	if (isObject(options)) {
		leading = !!options.leading;
		maxing = "maxWait" in options;
		maxWait = maxing ? nativeMax(toNumber(options.maxWait) || 0, wait) : maxWait;
		trailing = "trailing" in options ? !!options.trailing : trailing;
	}
	function invokeFunc(time) {
		var args = lastArgs, thisArg = lastThis;
		lastArgs = lastThis = void 0;
		lastInvokeTime = time;
		result = func.apply(thisArg, args);
		return result;
	}
	function leadingEdge(time) {
		lastInvokeTime = time;
		timerId = setTimeout(timerExpired, wait);
		return leading ? invokeFunc(time) : result;
	}
	function remainingWait(time) {
		var timeSinceLastCall = time - lastCallTime, timeSinceLastInvoke = time - lastInvokeTime, timeWaiting = wait - timeSinceLastCall;
		return maxing ? nativeMin(timeWaiting, maxWait - timeSinceLastInvoke) : timeWaiting;
	}
	function shouldInvoke(time) {
		var timeSinceLastCall = time - lastCallTime, timeSinceLastInvoke = time - lastInvokeTime;
		return lastCallTime === void 0 || timeSinceLastCall >= wait || timeSinceLastCall < 0 || maxing && timeSinceLastInvoke >= maxWait;
	}
	function timerExpired() {
		var time = now();
		if (shouldInvoke(time)) return trailingEdge(time);
		timerId = setTimeout(timerExpired, remainingWait(time));
	}
	function trailingEdge(time) {
		timerId = void 0;
		if (trailing && lastArgs) return invokeFunc(time);
		lastArgs = lastThis = void 0;
		return result;
	}
	function cancel() {
		if (timerId !== void 0) clearTimeout(timerId);
		lastInvokeTime = 0;
		lastArgs = lastCallTime = lastThis = timerId = void 0;
	}
	function flush() {
		return timerId === void 0 ? result : trailingEdge(now());
	}
	function debounced() {
		var time = now(), isInvoking = shouldInvoke(time);
		lastArgs = arguments;
		lastThis = this;
		lastCallTime = time;
		if (isInvoking) {
			if (timerId === void 0) return leadingEdge(lastCallTime);
			if (maxing) {
				clearTimeout(timerId);
				timerId = setTimeout(timerExpired, wait);
				return invokeFunc(lastCallTime);
			}
		}
		if (timerId === void 0) timerId = setTimeout(timerExpired, wait);
		return result;
	}
	debounced.cancel = cancel;
	debounced.flush = flush;
	return debounced;
}
// ../DnD helper/node_modules/lodash-es/_assignMergeValue.js
/**
* This function is like `assignValue` except that it doesn't assign
* `undefined` values.
*
* @private
* @param {Object} object The object to modify.
* @param {string} key The key of the property to assign.
* @param {*} value The value to assign.
*/
function assignMergeValue(object, key, value) {
	if (value !== void 0 && !eq(object[key], value) || value === void 0 && !(key in object)) baseAssignValue(object, key, value);
}
// ../DnD helper/node_modules/lodash-es/isArrayLikeObject.js
/**
* This method is like `_.isArrayLike` except that it also checks if `value`
* is an object.
*
* @static
* @memberOf _
* @since 4.0.0
* @category Lang
* @param {*} value The value to check.
* @returns {boolean} Returns `true` if `value` is an array-like object,
*  else `false`.
* @example
*
* _.isArrayLikeObject([1, 2, 3]);
* // => true
*
* _.isArrayLikeObject(document.body.children);
* // => true
*
* _.isArrayLikeObject('abc');
* // => false
*
* _.isArrayLikeObject(_.noop);
* // => false
*/
function isArrayLikeObject(value) {
	return isObjectLike(value) && isArrayLike(value);
}
// ../DnD helper/node_modules/lodash-es/_safeGet.js
/**
* Gets the value at `key`, unless `key` is "__proto__" or "constructor".
*
* @private
* @param {Object} object The object to query.
* @param {string} key The key of the property to get.
* @returns {*} Returns the property value.
*/
function safeGet(object, key) {
	if (key === "constructor" && typeof object[key] === "function") return;
	if (key == "__proto__") return;
	return object[key];
}
// ../DnD helper/node_modules/lodash-es/toPlainObject.js
/**
* Converts `value` to a plain object flattening inherited enumerable string
* keyed properties of `value` to own properties of the plain object.
*
* @static
* @memberOf _
* @since 3.0.0
* @category Lang
* @param {*} value The value to convert.
* @returns {Object} Returns the converted plain object.
* @example
*
* function Foo() {
*   this.b = 2;
* }
*
* Foo.prototype.c = 3;
*
* _.assign({ 'a': 1 }, new Foo);
* // => { 'a': 1, 'b': 2 }
*
* _.assign({ 'a': 1 }, _.toPlainObject(new Foo));
* // => { 'a': 1, 'b': 2, 'c': 3 }
*/
function toPlainObject(value) {
	return copyObject(value, keysIn(value));
}
// ../DnD helper/node_modules/lodash-es/_baseMergeDeep.js
/**
* A specialized version of `baseMerge` for arrays and objects which performs
* deep merges and tracks traversed objects enabling objects with circular
* references to be merged.
*
* @private
* @param {Object} object The destination object.
* @param {Object} source The source object.
* @param {string} key The key of the value to merge.
* @param {number} srcIndex The index of `source`.
* @param {Function} mergeFunc The function to merge values.
* @param {Function} [customizer] The function to customize assigned values.
* @param {Object} [stack] Tracks traversed source values and their merged
*  counterparts.
*/
function baseMergeDeep(object, source, key, srcIndex, mergeFunc, customizer, stack) {
	var objValue = safeGet(object, key), srcValue = safeGet(source, key), stacked = stack.get(srcValue);
	if (stacked) {
		assignMergeValue(object, key, stacked);
		return;
	}
	var newValue = customizer ? customizer(objValue, srcValue, key + "", object, source, stack) : void 0;
	var isCommon = newValue === void 0;
	if (isCommon) {
		var isArr = isArray(srcValue), isBuff = !isArr && isBuffer(srcValue), isTyped = !isArr && !isBuff && isTypedArray(srcValue);
		newValue = srcValue;
		if (isArr || isBuff || isTyped) {
			if (isArray(objValue)) newValue = objValue;
			else if (isArrayLikeObject(objValue)) newValue = copyArray(objValue);
			else if (isBuff) {
				isCommon = false;
				newValue = cloneBuffer(srcValue, true);
			} else if (isTyped) {
				isCommon = false;
				newValue = cloneTypedArray(srcValue, true);
			} else newValue = [];
		} else if (isPlainObject(srcValue) || isArguments(srcValue)) {
			newValue = objValue;
			if (isArguments(objValue)) newValue = toPlainObject(objValue);
			else if (!isObject(objValue) || isFunction(objValue)) newValue = initCloneObject(srcValue);
		} else isCommon = false;
	}
	if (isCommon) {
		stack.set(srcValue, newValue);
		mergeFunc(newValue, srcValue, srcIndex, customizer, stack);
		stack["delete"](srcValue);
	}
	assignMergeValue(object, key, newValue);
}
// ../DnD helper/node_modules/lodash-es/_baseMerge.js
/**
* The base implementation of `_.merge` without support for multiple sources.
*
* @private
* @param {Object} object The destination object.
* @param {Object} source The source object.
* @param {number} srcIndex The index of `source`.
* @param {Function} [customizer] The function to customize merged values.
* @param {Object} [stack] Tracks traversed source values and their merged
*  counterparts.
*/
function baseMerge(object, source, srcIndex, customizer, stack) {
	if (object === source) return;
	baseFor(source, function(srcValue, key) {
		stack || (stack = new Stack());
		if (isObject(srcValue)) baseMergeDeep(object, source, key, srcIndex, baseMerge, customizer, stack);
		else {
			var newValue = customizer ? customizer(safeGet(object, key), srcValue, key + "", object, source, stack) : void 0;
			if (newValue === void 0) newValue = srcValue;
			assignMergeValue(object, key, newValue);
		}
	}, keysIn);
}
// ../DnD helper/node_modules/lodash-es/mergeWith.js
/**
* This method is like `_.merge` except that it accepts `customizer` which
* is invoked to produce the merged values of the destination and source
* properties. If `customizer` returns `undefined`, merging is handled by the
* method instead. The `customizer` is invoked with six arguments:
* (objValue, srcValue, key, object, source, stack).
*
* **Note:** This method mutates `object`.
*
* @static
* @memberOf _
* @since 4.0.0
* @category Object
* @param {Object} object The destination object.
* @param {...Object} sources The source objects.
* @param {Function} customizer The function to customize assigned values.
* @returns {Object} Returns `object`.
* @example
*
* function customizer(objValue, srcValue) {
*   if (_.isArray(objValue)) {
*     return objValue.concat(srcValue);
*   }
* }
*
* var object = { 'a': [1], 'b': [2] };
* var other = { 'a': [3], 'b': [4] };
*
* _.mergeWith(object, other, customizer);
* // => { 'a': [1, 3], 'b': [2, 4] }
*/
var mergeWith = createAssigner(function(object, source, srcIndex, customizer) {
	baseMerge(object, source, srcIndex, customizer);
});
// ../DnD helper/node_modules/lodash-es/_arrayIncludesWith.js
/**
* This function is like `arrayIncludes` except that it accepts a comparator.
*
* @private
* @param {Array} [array] The array to inspect.
* @param {*} target The value to search for.
* @param {Function} comparator The comparator invoked per element.
* @returns {boolean} Returns `true` if `target` is found, else `false`.
*/
function arrayIncludesWith(array, value, comparator) {
	var index = -1, length = array == null ? 0 : array.length;
	while (++index < length) if (comparator(value, array[index])) return true;
	return false;
}
// ../DnD helper/node_modules/lodash-es/isEqual.js
/**
* Performs a deep comparison between two values to determine if they are
* equivalent.
*
* **Note:** This method supports comparing arrays, array buffers, booleans,
* date objects, error objects, maps, numbers, `Object` objects, regexes,
* sets, strings, symbols, and typed arrays. `Object` objects are compared
* by their own, not inherited, enumerable properties. Functions and DOM
* nodes are compared by strict equality, i.e. `===`.
*
* @static
* @memberOf _
* @since 0.1.0
* @category Lang
* @param {*} value The value to compare.
* @param {*} other The other value to compare.
* @returns {boolean} Returns `true` if the values are equivalent, else `false`.
* @example
*
* var object = { 'a': 1 };
* var other = { 'a': 1 };
*
* _.isEqual(object, other);
* // => true
*
* object === other;
* // => false
*/
function isEqual(value, other) {
	return baseIsEqual(value, other);
}
// ../DnD helper/node_modules/lodash-es/merge.js
/**
* This method is like `_.assign` except that it recursively merges own and
* inherited enumerable string keyed properties of source objects into the
* destination object. Source properties that resolve to `undefined` are
* skipped if a destination value exists. Array and plain object properties
* are merged recursively. Other objects and value types are overridden by
* assignment. Source objects are applied from left to right. Subsequent
* sources overwrite property assignments of previous sources.
*
* **Note:** This method mutates `object`.
*
* @static
* @memberOf _
* @since 0.5.0
* @category Object
* @param {Object} object The destination object.
* @param {...Object} [sources] The source objects.
* @returns {Object} Returns `object`.
* @example
*
* var object = {
*   'a': [{ 'b': 2 }, { 'd': 4 }]
* };
*
* var other = {
*   'a': [{ 'c': 3 }, { 'e': 5 }]
* };
*
* _.merge(object, other);
* // => { 'a': [{ 'b': 2, 'c': 3 }, { 'd': 4, 'e': 5 }] }
*/
var merge = createAssigner(function(object, source, srcIndex) {
	baseMerge(object, source, srcIndex);
});
// ../DnD helper/node_modules/lodash-es/round.js
/**
* Computes `number` rounded to `precision`.
*
* @static
* @memberOf _
* @since 3.10.0
* @category Math
* @param {number} number The number to round.
* @param {number} [precision=0] The precision to round to.
* @returns {number} Returns the rounded number.
* @example
*
* _.round(4.006);
* // => 4
*
* _.round(4.006, 2);
* // => 4.01
*
* _.round(4060, -2);
* // => 4100
*/
var round = createRound("round");
// ../DnD helper/node_modules/lodash-es/_createSet.js
/**
* Creates a set object of `values`.
*
* @private
* @param {Array} values The values to add to the set.
* @returns {Object} Returns the new set.
*/
var createSet = !(Set$1 && 1 / setToArray(new Set$1([, -0]))[1] == 1 / 0) ? noop : function(values) {
	return new Set$1(values);
};
// ../DnD helper/node_modules/lodash-es/_baseUniq.js
/** Used as the size to enable large array optimizations. */
var LARGE_ARRAY_SIZE = 200;
/**
* The base implementation of `_.uniqBy` without support for iteratee shorthands.
*
* @private
* @param {Array} array The array to inspect.
* @param {Function} [iteratee] The iteratee invoked per element.
* @param {Function} [comparator] The comparator invoked per element.
* @returns {Array} Returns the new duplicate free array.
*/
function baseUniq(array, iteratee, comparator) {
	var index = -1, includes = arrayIncludes, length = array.length, isCommon = true, result = [], seen = result;
	if (comparator) {
		isCommon = false;
		includes = arrayIncludesWith;
	} else if (length >= LARGE_ARRAY_SIZE) {
		var set = iteratee ? null : createSet(array);
		if (set) return setToArray(set);
		isCommon = false;
		includes = cacheHas;
		seen = new SetCache();
	} else seen = iteratee ? [] : result;
	outer: while (++index < length) {
		var value = array[index], computed = iteratee ? iteratee(value) : value;
		value = comparator || value !== 0 ? value : 0;
		if (isCommon && computed === computed) {
			var seenIndex = seen.length;
			while (seenIndex--) if (seen[seenIndex] === computed) continue outer;
			if (iteratee) seen.push(computed);
			result.push(value);
		} else if (!includes(seen, computed, comparator)) {
			if (seen !== result) seen.push(computed);
			result.push(value);
		}
	}
	return result;
}
// ../DnD helper/node_modules/lodash-es/uniq.js
/**
* Creates a duplicate-free version of an array, using
* [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
* for equality comparisons, in which only the first occurrence of each element
* is kept. The order of result values is determined by the order they occur
* in the array.
*
* @static
* @memberOf _
* @since 0.1.0
* @category Array
* @param {Array} array The array to inspect.
* @returns {Array} Returns the new duplicate free array.
* @example
*
* _.uniq([2, 1, 2]);
* // => [2, 1]
*/
function uniq(array) {
	return array && array.length ? baseUniq(array) : [];
}
// ../DnD helper/node_modules/v-network-graph/lib/layouts/simple.js
var o$22 = 20;
var s = class {
	activate(n) {
		let { nodePositions: a, nodes: s, configs: c, emitter: l, scale: u, svgPanZoom: d } = n, f = (e) => {
			for (let [t, n] of Object.entries(e)) {
				let e = this.getOrCreateNodePosition(a, t);
				this.setNodePosition(e, n);
			}
		}, p = (n) => {
			let r = n.filter((e) => !(e in a.value)), i = d.getViewArea(), l = u.value;
			for (let n of r) {
				let r = s.value[n], u = t$57(r, c.node, l), d = { ...i.center };
				for (;;) {
					let r = !1;
					for (let [i, o] of Object.entries(a.value)) {
						if (n === i) continue;
						let a = s.value[i];
						if (!a) continue;
						if (r = n$18(d, u, o, t$57(a, c.node, l)), r) break;
					}
					if (r) d.x += u.width + o$22 * l, d.x + u.width / 2 > i.box.right && (d.x = i.center.x, d.y += u.height + o$22 * l);
					else break;
				}
				let f = this.getOrCreateNodePosition(a, n);
				this.setNodePosition(f, d);
			}
		};
		p(Object.keys(s.value));
		let m = watch(() => isEqual(new Set(Object.keys(s.value)), new Set(Object.keys(a.value))), (e) => {
			e || p(Object.keys(s.value));
		});
		l.on("node:dragstart", f), l.on("node:pointermove", f), l.on("node:dragend", f), this.onDeactivate = () => {
			m(), l.off("node:dragstart", f), l.off("node:pointermove", f), l.off("node:dragend", f);
		};
	}
	deactivate() {
		this.onDeactivate && this.onDeactivate();
	}
	setNodePosition(e, t) {
		e.value.x = round(t.x, 3), e.value.y = round(t.y, 3);
	}
	getOrCreateNodePosition(e, t) {
		let r = toRef(e.value, t);
		return r.value || (r.value = {
			x: 0,
			y: 0
		}), r;
	}
};
// ../DnD helper/node_modules/v-network-graph/lib/common/config-defaults.js
function a$23() {
	return {
		view: {
			scalingObjects: !1,
			panEnabled: !0,
			zoomEnabled: !0,
			minZoomLevel: .1,
			maxZoomLevel: 64,
			doubleClickZoomEnabled: !0,
			mouseWheelZoomEnabled: !0,
			boxSelectionEnabled: !1,
			autoPanAndZoomOnLoad: "center-content",
			fitContentMargin: "8%",
			autoPanOnResize: !0,
			layoutHandler: new s(),
			onSvgPanZoomInitialized: void 0,
			grid: {
				visible: !1,
				interval: 10,
				thickIncrements: 5,
				line: {
					color: "#e0e0e0",
					width: 1,
					dasharray: 1
				},
				thick: {
					color: "#cccccc",
					width: 1,
					dasharray: 0
				}
			},
			selection: {
				box: {
					color: "#0000ff20",
					strokeWidth: 1,
					strokeColor: "#aaaaff",
					strokeDasharray: 0
				},
				detector: (e) => {
					let t = /Mac OS/.test(navigator.userAgent) ? e.metaKey : e.ctrlKey;
					return e.type === "keydown" ? t : !t;
				}
			},
			builtInLayerOrder: [],
			onBeforeInitialDisplay: void 0
		},
		node: r((n) => ({
			normal: {
				type: "circle",
				radius: 16,
				width: 32,
				height: 32,
				borderRadius: 4,
				color: "#4466cc",
				strokeWidth: 0,
				strokeColor: "#000000",
				strokeDasharray: 0
			},
			hover: {
				type: (t$61) => t.value(n.normal.type, t$61),
				radius: (t$62) => (t.value(n.normal.radius, t$62) ?? 0) + 2,
				width: (t$63) => (t.value(n.normal.width, t$63) ?? 0) + 2,
				height: (t$64) => (t.value(n.normal.height, t$64) ?? 0) + 2,
				borderRadius: (t$65) => t.value(n.normal.borderRadius, t$65) ?? 0,
				strokeWidth: (t$66) => t.value(n.normal.strokeWidth, t$66),
				strokeColor: (t$67) => t.value(n.normal.strokeColor, t$67),
				strokeDasharray: (t$68) => t.value(n.normal.strokeDasharray, t$68),
				color: "#3355bb"
			},
			selected: {
				type: (t$69) => t.value(n.normal.type, t$69),
				radius: (t$70) => t.value(n.normal.radius, t$70),
				width: (t$71) => t.value(n.normal.width, t$71),
				height: (t$72) => t.value(n.normal.height, t$72),
				borderRadius: (t$73) => t.value(n.normal.borderRadius, t$73),
				color: (t$74) => t.value(n.normal.color, t$74),
				strokeWidth: (t$75) => t.value(n.normal.strokeWidth, t$75),
				strokeColor: (t$76) => t.value(n.normal.strokeColor, t$76),
				strokeDasharray: (t$77) => t.value(n.normal.strokeDasharray, t$77)
			},
			draggable: !0,
			selectable: !1,
			label: {
				visible: !0,
				fontFamily: void 0,
				fontSize: 11,
				lineHeight: 1.1,
				color: "#000000",
				background: void 0,
				margin: 4,
				direction: n$1.SOUTH,
				directionAutoAdjustment: !1,
				text: "name",
				handleNodeEvents: !0
			},
			focusring: {
				visible: !0,
				width: 4,
				padding: 3,
				color: "#eebb00"
			},
			zOrder: {
				enabled: !1,
				zIndex: 0,
				bringToFrontOnHover: !0,
				bringToFrontOnSelected: !0
			},
			transition: void 0
		})),
		edge: r((t$78) => ({
			normal: {
				width: 2,
				color: "#4466cc",
				dasharray: 0,
				linecap: "butt",
				animate: !1,
				animationSpeed: 50
			},
			hover: {
				width: (n) => t.value(t$78.normal.width, n) + 1,
				color: "#3355bb",
				dasharray: (n) => t.value(t$78.normal.dasharray, n),
				linecap: (n) => t.value(t$78.normal.linecap, n),
				animate: (n) => t.value(t$78.normal.animate, n),
				animationSpeed: (n) => t.value(t$78.normal.animationSpeed, n)
			},
			selected: {
				width: (n) => t.value(t$78.normal.width, n) + 1,
				color: "#dd8800",
				dasharray: (n) => {
					let r = t.value(t$78.normal.width, n);
					return `${r * 1.5} ${r * 2}`;
				},
				linecap: (n) => t.value(t$78.normal.linecap, n),
				animate: (n) => t.value(t$78.normal.animate, n),
				animationSpeed: (n) => t.value(t$78.normal.animationSpeed, n)
			},
			selectable: !1,
			gap: 3,
			type: "straight",
			marker: {
				source: {
					type: "none",
					width: 5,
					height: 5,
					margin: -1,
					offset: 0,
					units: "strokeWidth",
					color: null
				},
				target: {
					type: "none",
					width: 5,
					height: 5,
					margin: -1,
					offset: 0,
					units: "strokeWidth",
					color: null
				}
			},
			margin: null,
			summarize: (e, t) => t.edge.type != "curve" && null,
			summarized: {
				label: {
					fontSize: 10,
					lineHeight: 1,
					color: "#4466cc"
				},
				shape: {
					type: "rect",
					radius: 6,
					width: 12,
					height: 12,
					borderRadius: 3,
					color: "#ffffff",
					strokeWidth: 1,
					strokeColor: "#4466cc",
					strokeDasharray: void 0
				},
				stroke: {
					width: 5,
					color: "#4466cc",
					dasharray: void 0,
					linecap: void 0,
					animate: !1,
					animationSpeed: 50
				}
			},
			selfLoop: {
				radius: 12,
				isClockwise: !0,
				offset: 10,
				angle: 270
			},
			keepOrder: "clock",
			label: {
				fontFamily: void 0,
				fontSize: 11,
				lineHeight: 1.1,
				color: "#000000",
				background: void 0,
				margin: 4,
				padding: 4
			},
			zOrder: {
				enabled: !1,
				zIndex: 0,
				bringToFrontOnHover: !0,
				bringToFrontOnSelected: !0
			}
		})),
		path: r((t$79) => ({
			visible: !1,
			clickable: !1,
			hoverable: !1,
			curveInNode: !1,
			end: "centerOfNode",
			margin: 0,
			path: {
				width: 6,
				color: (e) => {
					let t = [
						"#d5000088",
						"#c5116288",
						"#aa00ff88",
						"#6200ea88",
						"#304ffe88",
						"#2962ff88",
						"#0091ea88",
						"#00b8d488",
						"#00bfa588",
						"#00c85388",
						"#64dd1788",
						"#aeea0088",
						"#ffd60088",
						"#ffab0088",
						"#ff6d0088",
						"#dd2c0088"
					], n = e.edges.map((e) => e.split("").reduce((e, t) => (e = (e << 5) - e + t.charCodeAt(0), e & e), 0)).reduce((e, t) => e + t, 0);
					return t[Math.abs(n) % t.length];
				},
				dasharray: void 0,
				linecap: "round",
				linejoin: "round",
				animate: !1,
				animationSpeed: 50
			},
			normal: {
				width: (n) => t.value(t$79.path.width, n),
				color: (n) => t.value(t$79.path.color, n),
				dasharray: (n) => t.value(t$79.path.dasharray, n),
				linecap: (n) => t.value(t$79.path.linecap, n),
				linejoin: (n) => t.value(t$79.path.linejoin, n),
				animate: (n) => t.value(t$79.path.animate, n),
				animationSpeed: (n) => t.value(t$79.path.animationSpeed, n)
			},
			hover: {
				width: (n) => t.value(t$79.normal.width, n) + 2,
				color: (n) => t.value(t$79.normal.color, n),
				dasharray: (n) => t.value(t$79.normal.dasharray, n),
				linecap: (n) => t.value(t$79.normal.linecap, n),
				linejoin: (n) => t.value(t$79.normal.linejoin, n),
				animate: (n) => t.value(t$79.normal.animate, n),
				animationSpeed: (n) => t.value(t$79.normal.animationSpeed, n)
			},
			selected: {
				width: (n) => t.value(t$79.normal.width, n) + 2,
				color: (n) => t.value(t$79.normal.color, n),
				dasharray: "6 12",
				linecap: (n) => t.value(t$79.normal.linecap, n),
				linejoin: (n) => t.value(t$79.normal.linejoin, n),
				animate: (n) => t.value(t$79.normal.animate, n),
				animationSpeed: (n) => t.value(t$79.normal.animationSpeed, n)
			},
			selectable: !1,
			zOrder: {
				enabled: !1,
				zIndex: 0,
				bringToFrontOnHover: !0,
				bringToFrontOnSelected: !0
			},
			transition: void 0
		}))
	};
}
var o$21 = 300;
function s$20() {
	let e = a$23();
	return {
		...e,
		view: {
			...e.view,
			layoutsUpdateInterval: o$21
		}
	};
}
function c(e) {
	let t = a$23();
	return e && merge(t, e), t;
}
// ../DnD helper/node_modules/v-network-graph/lib/common/types.js
var e = [
	"paths",
	"node-labels",
	"nodes",
	"focusring",
	"edge-labels",
	"edges",
	"base",
	"grid",
	"background",
	"root"
];
// ../DnD helper/node_modules/v-network-graph/lib/_virtual/_rolldown/runtime.js
var e$12 = Object.defineProperty;
var t$56 = (t, n) => {
	let r = {};
	for (var i in t) e$12(r, i, {
		get: t[i],
		enumerable: !0
	});
	return n || e$12(r, Symbol.toStringTag, { value: "Module" }), r;
};
// ../DnD helper/node_modules/v-network-graph/lib/modules/vector2d/methods.js
var t$55 = /* @__PURE__ */ t$56({
	add: () => n$17,
	angle: () => _$8,
	angleDegree: () => v$4,
	cross: () => c$21,
	distance: () => f$14,
	distanceSquared: () => d$18,
	divide: () => o$20,
	dot: () => s$19,
	length: () => u$24,
	lengthSquared: () => l$20,
	multiply: () => i$20,
	multiplyScalar: () => a$22,
	normalize: () => p$8,
	rotate: () => m$6,
	subtract: () => r$18
});
function n$17(e, t, n) {
	return n || (n = {
		x: 0,
		y: 0
	}), n.x = e.x + t.x, n.y = e.y + t.y, n;
}
function r$18(e, t, n) {
	return n || (n = {
		x: 0,
		y: 0
	}), n.x = e.x - t.x, n.y = e.y - t.y, n;
}
function i$20(e, t, n) {
	return n || (n = {
		x: 0,
		y: 0
	}), n.x = e.x * t.x, n.y = e.y * t.y, n;
}
function a$22(e, t, n) {
	return n || (n = {
		x: 0,
		y: 0
	}), n.x = e.x * t, n.y = e.y * t, n;
}
function o$20(e, t, n) {
	return n || (n = {
		x: 0,
		y: 0
	}), n.x = e.x / t.x, n.y = e.y / t.y, n;
}
function s$19(e, t) {
	return e.x * t.x + e.y * t.y;
}
function c$21(e, t) {
	return e.x * t.y - e.y * t.x;
}
function l$20(e) {
	return e.x * e.x + e.y * e.y;
}
function u$24(e) {
	return Math.sqrt(l$20(e));
}
function d$18(e, t) {
	let n = e.x - t.x, r = e.y - t.y;
	return n * n + r * r;
}
function f$14(e, t) {
	return Math.sqrt(d$18(e, t));
}
function p$8(e, t) {
	t || (t = {
		x: 0,
		y: 0
	});
	let n = u$24(e);
	return n === 0 ? (t.x = 1, t.y = 0) : o$20(e, {
		x: n,
		y: n
	}, t), t;
}
function m$6(e, t, n) {
	n || (n = {
		x: 0,
		y: 0
	});
	let r = e.x * Math.cos(t) - e.y * Math.sin(t), i = e.x * Math.sin(t) + e.y * Math.cos(t);
	return n.x = r, n.y = i, n;
}
var h$8 = 180 / Math.PI;
function g$5(e) {
	return e * h$8;
}
function _$8(e) {
	return Math.atan2(e.y, e.x);
}
function v$4(e) {
	return g$5(_$8(e));
}
// ../DnD helper/node_modules/v-network-graph/lib/modules/vector2d/vector2d.js
var h = class h {
	static fromArray(e) {
		return new h(e[0] || 0, e[1] || 0);
	}
	static fromObject(e) {
		return new h(e.x, e.y);
	}
	constructor(e, t) {
		this.x = e, this.y = t;
	}
	add(t) {
		return n$17(this, t, this);
	}
	subtract(e) {
		return r$18(this, e, this);
	}
	multiply(e) {
		return i$20(this, e, this);
	}
	multiplyScalar(e) {
		return a$22(this, e, this);
	}
	divide(e) {
		return o$20(this, e, this);
	}
	dot(e) {
		return s$19(this, e);
	}
	cross(e) {
		return c$21(this, e);
	}
	lengthSquared() {
		return l$20(this);
	}
	length() {
		return u$24(this);
	}
	distanceSquared(e) {
		return d$18(this, e);
	}
	distance(e) {
		return f$14(this, e);
	}
	normalize() {
		return p$8(this, this);
	}
	angle() {
		return _$8(this);
	}
	angleDegree() {
		return v$4(this);
	}
	rotate(e) {
		return m$6(this, e, this);
	}
	isEqualTo(e) {
		return this.x === e.x && this.y === e.y;
	}
	clone() {
		return new h(this.x, this.y);
	}
	toObject() {
		return {
			x: this.x,
			y: this.y
		};
	}
	toArray() {
		return [this.x, this.y];
	}
};
// ../DnD helper/node_modules/v-network-graph/lib/common/common.js
function n$16(n) {
	return isReactive(n) ? n : reactive(n);
}
function r$17(e, t = "Parameter") {
	if (e == null) throw Error(`${t} is null`);
	return e;
}
// ../DnD helper/node_modules/v-network-graph/lib/utils/object.js
function t$54(e) {
	return Object.entries(e);
}
function n$15(n, r) {
	let i = new Set(Object.keys(n));
	t$54(r).forEach(([t, r]) => {
		isEqual(n[t], r) || (n[t] = r), i.delete(t);
	}), i.forEach((e) => delete n[e]);
}
function r$16(e) {
	return e instanceof Promise || e && typeof e.then == "function";
}
// ../DnD helper/node_modules/v-network-graph/lib/modules/edge/group.js
function o$19(t, r, a) {
	let o = n$16({
		edgeLayoutPoints: {},
		edgeGroups: {},
		summarizedEdges: {}
	});
	return watchEffect(() => {
		let { edgeLayoutPoints: e, edgeGroups: i } = l$19(a, t.value, r.value);
		n$15(o.edgeLayoutPoints, e), n$15(o.edgeGroups, i), c$20(o.edgeGroups, i);
	}), watchEffect(() => {
		let e = {};
		for (let [n, { edges: r, groupWidth: i }] of Object.entries(o.edgeGroups)) {
			let s = !1;
			if (i == 0) s = !1;
			else if (a.edge.summarize instanceof Function) {
				let e = a.edge.summarize(r, a);
				s = e === null ? u$23(t.value, r, a, i) : e;
			} else s = a.edge.summarize ? u$23(t.value, r, a, i) : !1;
			o.edgeGroups[n].summarize = s, s && Object.keys(r).forEach((t) => e[t] = !0);
		}
		n$15(o.summarizedEdges, e);
	}), o;
}
function s$18(e, t, n, r, i, a) {
	return e ? t ? d$17(e.edge, n, r, i, 0, 0, a) : d$17(e.edge, n, r, i, e.groupWidth, e.pointInGroup, a) : {
		p1: {
			x: 0,
			y: 0
		},
		p2: {
			x: 0,
			y: 0
		}
	};
}
function c$20(e, t) {
	let n = toRaw(e);
	for (let [r, i] of Object.entries(t)) isEqual(Object.keys(n[r].edges), Object.keys(i.edges)) || (e[r] = i);
	let i = Object.keys(t);
	if (isEqual(Object.keys(n), i)) return;
	let o = i.map((e) => n[e]);
	i.forEach((t) => delete e[t]), i.forEach((t, n) => e[t] = o[n]);
}
function l$19(e, n, r) {
	let i = {}, a = {}, o = {};
	for (let [e, t] of Object.entries(r)) {
		if (!(t.source in n && t.target in n)) continue;
		let r = [t.source, t.target].sort().join("<=>"), i = o[r] || {};
		i[e] = t, o[r] = i;
	}
	let s = e.edge.gap instanceof Function ? e.edge.gap : (t, n) => e.edge.gap;
	for (let [n, r] of Object.entries(o)) {
		let o = Object.keys(r).length;
		if (o == 0) continue;
		let c = s(r, e), [l, u] = Object.entries(r)[0];
		if (o === 1) i[l] = {
			edge: u,
			pointInGroup: 0,
			groupWidth: 0
		}, a[n] = {
			edges: r,
			groupWidth: 0,
			summarize: !1
		};
		else {
			let o = 0, s = Object.entries(r).map(([n, r]) => {
				let i = t.value(e.edge.normal.width, r);
				return isNaN(+i) && (console.warn("[v-network-graph] Edge width is invalid value. id=[%s] value=[%s]", n, i), i = 1), i / 2;
			}), l = Object.entries(r).map(([e, t], n) => (n > 0 && (o += s[n - 1] + c + s[n]), [
				e,
				t,
				o
			])), u = o;
			l.forEach(([e, t, n]) => {
				i[e] = {
					edge: t,
					pointInGroup: n,
					groupWidth: u
				};
			}), a[n] = {
				edges: r,
				groupWidth: u,
				summarize: !1
			};
		}
	}
	return {
		edgeLayoutPoints: i,
		edgeGroups: a
	};
}
function u$23(e, n, r, i) {
	return Object.entries(n).length !== 1 && i > Math.min(...Object.values(n).flatMap((t) => [e[t.source], e[t.target]]).filter((e) => e).map((e) => {
		let n = t.values(r.node.normal, e);
		return n.type === "circle" ? n.radius * 2 : Math.min(n.width, n.height);
	}));
}
function d$17(e, t, n, r, i, a, o) {
	let s, c, l, u;
	return e.source < e.target ? [s, c, l, u] = f$13(t.x, t.y, n.x, n.y, r, i, a, o) : [l, u, s, c] = f$13(n.x, n.y, t.x, t.y, r, i, a, o), {
		p1: {
			x: s,
			y: c
		},
		p2: {
			x: l,
			y: u
		}
	};
}
function f$13(e, t, n, r, i, a, o, s) {
	let c = n - e, l = r - t, u = (a / 2 - o) * i;
	if (u !== 0 && s !== "clock") {
		let i = Math.atan2(r - t, n - e);
		if (s === "vertical") {
			let e = Math.PI / 2;
			(i < -e || i >= e) && (u *= -1);
		} else s === "horizontal" && i < 0 && (u *= -1);
	}
	if (c === 0) {
		let i = l < 0 ? -1 : 1;
		return [
			e + u * i,
			t,
			n + u * i,
			r
		];
	}
	if (l === 0) {
		let i = c < 0 ? 1 : -1;
		return [
			e,
			t + u * i,
			n,
			r + u * i
		];
	}
	{
		let i = -1 / (l / c);
		l < 0 && (u = -u);
		let a = u / Math.sqrt(1 + i ** 2);
		return [
			e + a,
			t + a * i,
			n + a,
			r + a * i
		];
	}
}
// ../DnD helper/node_modules/v-network-graph/lib/composables/id.js
function t$53() {
	return useId();
}
// ../DnD helper/node_modules/v-network-graph/lib/modules/calculation/line.js
var t$52 = class t {
	constructor(e, t, n) {
		this.source = e, this.target = t, this.v = n;
	}
	static fromLinePosition(r) {
		let i = h.fromObject(r.p1), a = h.fromObject(r.p2);
		return new t(i, a, n$14(i, a));
	}
	static fromPositions(r, i) {
		let a = h.fromObject(r), o = h.fromObject(i);
		return new t(a, o, n$14(a, o));
	}
	static fromVectors(e, r) {
		return new t(e, r, n$14(e, r));
	}
};
function n$14(e, t) {
	return t.clone().subtract(e);
}
function r$15(t) {
	return [h.fromObject(t.p1), h.fromObject(t.p2)];
}
function i$19(t) {
	return new h((t.p1.x + t.p2.x) / 2, (t.p1.y + t.p2.y) / 2);
}
function a$21(e, t) {
	return {
		p1: e,
		p2: t
	};
}
function o$18(e, n, r) {
	return s$17(t$52.fromLinePosition(e), n, r);
}
function s$17(t, r, i) {
	let a = t.v.clone().normalize(), o = t.source.clone().add(a.clone().multiplyScalar(r)), s = t.target.clone().subtract(a.clone().multiplyScalar(i)), c = o.toObject(), l = s.toObject(), u = n$14(o, s);
	if (t.v.dot(u) < 0) {
		let t = new h((c.x + l.x) / 2, (c.y + l.y) / 2), n = t.clone().add(a.multiplyScalar(.5));
		c = t.toObject(), l = n.toObject();
	}
	return {
		p1: c,
		p2: l
	};
}
function c$19(e) {
	return {
		p1: e.p2,
		p2: e.p1
	};
}
function l$18(e) {
	let n = e.v.clone().normalize().rotate(Math.PI / 2);
	return t$52.fromVectors(e.target, e.target.clone().add(n));
}
// ../DnD helper/node_modules/v-network-graph/lib/modules/vector2d/index.js
var _$7 = {
	Vector2D: h,
	...t$55
};
// ../DnD helper/node_modules/v-network-graph/lib/modules/calculation/point.js
var r$14 = 1e-9;
function i$18(e, i, o, s) {
	let c = r$14 * (s + Math.max(Math.abs(o.x), Math.abs(o.y)));
	if (_$7.distance(i, o) > s + c) return null;
	let l = t$52.fromVectors(e, i), u = a$20(o, l), d = _$7.length(_$7.subtract(u, o));
	if (d > s + c) return null;
	let f = Math.sqrt(Math.max(0, s ** 2 - d ** 2));
	return [u, l.v.normalize().multiplyScalar(f)];
}
function a$20(e, n) {
	let r = n.v.clone().normalize(), i = n.source, a = _$7.subtract(e, i), o = r.dot(a);
	return i.clone().add(r.multiplyScalar(o));
}
function o$17(e, t, n, r) {
	let a = i$18(e, t, n, r);
	if (!a) return null;
	let [o, s] = a;
	return o.subtract(s);
}
function s$16(e, t, n, r, a) {
	let o = i$18(e, t, n, r);
	if (!o) return null;
	let [s, c] = o, l = s.clone().add(c), u = s.clone().subtract(c), d = a.distance(l), f = a.distance(u);
	return Math.abs(d - f) < 2 ? u : d < f ? l : u;
}
function c$18(e, n) {
	let r = _$7.subtract(n.source, e.source), i = e.v, a = n.v, o = _$7.cross(r, i) / _$7.cross(i, a);
	return n.source.clone().add(a.clone().multiplyScalar(o));
}
function l$17(t, n, r, i, a) {
	let o = t, s = r.clone().subtract(o), c = s.length(), l = n + i;
	if (l < c) return null;
	let u = Math.abs(n - i);
	if (c < u) return null;
	if (c === l) {
		let e = s.clone().normalize(), r = t.clone().add(e.multiplyScalar(n));
		return a ? r : [r, r];
	}
	if (c === u) {
		let e = s.clone().normalize(), r = n > i, o = t.clone().add(e.multiplyScalar(r ? n : -n));
		return a ? o : [o, o];
	}
	let d = n, f = i, p = d * ((c ** 2 + d ** 2 - f ** 2) / (2 * c * d)), m = Math.sqrt(d ** 2 - p ** 2), h$18 = s.clone().normalize(), g = new h(-h$18.y, h$18.x), _ = h$18.clone().multiplyScalar(p), v = g.clone().multiplyScalar(m), y = t.clone().add(_).add(v), b = t.clone().add(_).subtract(v);
	return a ? y.distance(a) < b.distance(a) ? y : b : [y, b];
}
// ../DnD helper/node_modules/v-network-graph/lib/modules/calculation/2d.js
function c$17(t, r, o, c) {
	let l = t$52.fromPositions(t, r), u = (o.width + o.strokeWidth) / 2 * c, d = (o.height + o.strokeWidth) / 2 * c, f = o.borderRadius > 0 ? (o.borderRadius + o.strokeWidth / 2) * c : 0, p = (l.v.angle() - Math.PI / 2) % Math.PI, m = Math.PI / 2 - p % Math.PI, h$14 = d * Math.abs(Math.tan(p)), g = u * Math.abs(Math.tan(m)), _ = h$14 <= u - f, v = g <= d - f;
	if (_ || v || f === 0) return Math.sqrt(_ ? d ** 2 + h$14 ** 2 : u ** 2 + g ** 2);
	{
		let t = r.x - u + f, n = r.y - d + f, o = r.x + u - f, c = r.y + d - f, p = [
			new h(t, n),
			new h(o, n),
			new h(o, c),
			new h(t, c)
		][Math.floor((l.v.angleDegree() + 360) % 360 / 90)], m = o$17(l.source, a$20(p, l), p, f);
		return m ? n$14(m, l.target).length() : n$14(p, l.target).length() + f;
	}
}
function l$16(r, i, a, o, s) {
	let c = t$52.fromLinePosition(r), l = c.v.clone().normalize(), u = o === 0 ? c.source : c.source.clone().add(l.clone().multiplyScalar(o * s)), d = o === 0 ? c.target : c.target.clone().subtract(l.clone().multiplyScalar(o * s)), f = (i.width / 2 + a) * s, p = new h(-l.y, l.x).multiplyScalar(f), m = _$7.subtract(u, p), h$15 = _$7.add(u, p), g = _$7.subtract(d, p), _ = _$7.add(d, p), v = c.v.angleDegree();
	return (v < -90 || v >= 90) && ([m, h$15] = [h$15, m], [g, _] = [_, g]), {
		source: {
			above: m,
			below: h$15
		},
		target: {
			above: g,
			below: _
		}
	};
}
function u$22(e, t, n, r) {
	let i;
	i = n.type === "circle" ? n.radius + n.strokeWidth / 2 : c$17(t, e, n, 1);
	let a;
	return a = r.type === "circle" ? r.radius + r.strokeWidth / 2 : c$17(e, t, r, 1), [i, a];
}
function d$16(e, t, n) {
	let { x: r, y: i } = e, a = r - t.x, o = i - t.y;
	return {
		x: a * Math.cos(n) - o * Math.sin(n) + t.x,
		y: a * Math.sin(n) + o * Math.cos(n) + t.y
	};
}
function f$12(e) {
	return e > 0 ? -(Math.PI * 2 - e) : Math.PI * 2 + e;
}
function p$7(t, i, a, s) {
	let c = [], l = t$52.fromVectors(i, t), u = t$52.fromVectors(i, a), p = m$5(l, u);
	s * p < 0 && (p = f$12(p));
	let h$16 = h.fromObject(d$16(t, i, -p / 2)), g = t$52.fromVectors(i, h$16), _ = l$18(g), v = m$5(l, g), y = l$18(l);
	if (Math.abs(v) < Math.PI / 2) {
		let e = c$18(y, _);
		c.push(e);
	} else {
		let t = h.fromObject(d$16(h$16, i, v / 2)), a = l$18(t$52.fromVectors(i, h.fromObject(t))), s = c$18(y, a), l = c$18(a, _);
		c.push(s, t, l);
	}
	c.push(h$16);
	let b = m$5(u, g);
	if (y = l$18(u), Math.abs(b) < Math.PI / 2) {
		let e = c$18(y, _);
		c.push(e);
	} else {
		let t = h.fromObject(d$16(h$16, i, b / 2)), a = l$18(t$52.fromVectors(i, h.fromObject(t))), s = c$18(_, a), l = c$18(a, y);
		c.push(s, t, l);
	}
	return c;
}
function m$5(e, t) {
	return Math.atan2(e.v.y * t.v.x - e.v.x * t.v.y, e.v.x * t.v.x + e.v.y * t.v.y);
}
function h$7(t, n, r) {
	let i = t.x, a = t.y, o = n.x, s = n.y, c = r.x, l = r.y, u = i - o, d = a - s, f = c - o, p = l - s;
	if (u === 0 && d === 0 || f === 0 && p === 0) return [t, 0];
	let m = (p * (u * (i + o) + d * (a + s)) - d * (f * (c + o) + p * (l + s))) / (2 * u * p - 2 * d * f), h$17 = (-f * (u * (i + o) + d * (a + s)) + u * (f * (c + o) + p * (l + s))) / (2 * u * p - 2 * d * f), g = Math.sqrt((i - m) ** 2 + (a - h$17) ** 2);
	return [new h(m, h$17), g];
}
// ../DnD helper/node_modules/v-network-graph/lib/modules/node/position.js
function t$51(e, t) {
	let n = e[t];
	return {
		x: i$17(n?.x),
		y: i$17(n?.y)
	};
}
function n$13(t, n) {
	let a = toRaw(toRaw(t)[n]);
	return a && r$13(a.x) && r$13(a.y) ? a : {
		x: i$17(a?.x),
		y: i$17(a?.y)
	};
}
function r$13(e) {
	return typeof e == "number" && Number.isFinite(e);
}
function i$17(e) {
	if (r$13(e)) return e;
	if (typeof e != "string" || e.trim() === "") return 0;
	let t = Number(e);
	return Number.isFinite(t) ? t : 0;
}
// ../DnD helper/node_modules/v-network-graph/lib/modules/node/node.js
function t$50(e) {
	return e.type == "circle" ? e.radius : Math.min(e.width, e.height) / 2;
}
function n$12(t) {
	let n = Object.keys(t).map((n) => t$51(t, n));
	if (n.length === 0) return {
		top: 0,
		bottom: 0,
		left: 0,
		right: 0
	};
	let r = {
		top: n[0].y,
		bottom: n[0].y,
		left: n[0].x,
		right: n[0].x
	};
	return n.forEach((e) => {
		r.top = Math.min(e.y, r.top), r.bottom = Math.max(e.y, r.bottom), r.left = Math.min(e.x, r.left), r.right = Math.max(e.x, r.right);
	}), r;
}
// ../DnD helper/node_modules/v-network-graph/lib/utils/collection.js
function e$11(...e) {
	return e.find((e) => !!e);
}
// ../DnD helper/node_modules/v-network-graph/lib/modules/calculation/path.js
var h$6 = 2 ** -52 * 100;
function g$4(e, i, a, o, s, c, l, d) {
	let m = e.edges, h$12 = e.directions, g = m.map((e, t) => C$3(e, h$12[t], o[e.edgeId])), _ = [], v = !1, y = !1;
	{
		let e = g[0], t = t$50(i[e.source].shape) * s, n = d + (l === "edgeOfNode" ? t : 0), o = n <= 0 ? e.line.source : b$4(e, n, a, !0);
		_.push(o), t = t$50(i[e.target].shape) * s, d > 0 && _$7.distance(e.line.source, e.line.target) <= n + t && (v = !0);
	}
	let w = m.length;
	for (let e = 1; e < w; e++) {
		let o = g[e - 1], l = g[e], d = l.source, m = h.fromObject(t$51(a, d)), h$11 = x$4(o, l, m), v = t$50(i[d].shape) * s, y = Math.max(2 / 3 * v, v - 4 * s), b = E$1(o), C = E$1(l), w = S$3(o, m, y, b), D = S$3(l, m, y, !C), O = S$3(o, m, v, b), k = S$3(l, m, v, !C), A;
		if (h$11) {
			let e = _$7.distance(h$11, m);
			if (e < y) A = [
				e$11(w, O, o.line.target),
				h$11,
				e$11(D, k, l.line.source)
			];
			else if (e <= v) {
				let e, t;
				e = O && w ? _$7.distance(h$11, w) < _$7.distance(h$11, O) ? w : O : O || o.line.target, t = k && D ? _$7.distance(h$11, D) < _$7.distance(h$11, k) ? D : k : k || l.line.source, A = [
					e,
					h$11,
					t
				];
			} else A = w && D ? [
				w,
				m,
				D
			] : O && k ? [
				O,
				m,
				k
			] : [
				e$11(w, O, o.line.target),
				m,
				e$11(D, k, l.line.source)
			];
		} else A = w && D ? [
			w,
			m,
			D
		] : O && k ? [
			O,
			m,
			k
		] : [
			o.line.target,
			m,
			l.line.source
		];
		if (o.curve) {
			let e = _[_.length - 1];
			if (e) {
				let t = e instanceof Array ? e[e.length - 1] : e, n;
				n = A instanceof Array ? c ? A[0] : A[1] : A;
				let r = p$7(t, o.curve.circle.center, n, o.curve.theta);
				A instanceof Array && c ? _.push([...r, ...A]) : _.push([...r, n]);
			}
		} else if (o.loop) {
			let [e, t, n] = T$3(m, o, v);
			_.push(e), _.push(n), A instanceof Array && c ? _.push([
				t,
				A[1],
				A[2]
			]) : _.push(A[2]);
		} else c || !(A instanceof Array) ? _.push(A) : l.curve ? _.push(A[1]) : l.loop ? _.push(A[0]) : _.push(A[0], A[2]);
	}
	{
		let e = g[g.length - 1], o = t$50(i[e.target].shape) * s, c = d + (l === "edgeOfNode" ? o : 0), p = c <= 0 ? e.line.target : b$4(e, c, a, !1);
		if (o = t$50(i[e.source].shape) * s, e.loop) {
			let [r, i, s] = T$3(h.fromObject(t$51(a, e.target)), e, o);
			_.push(r), _.push(s);
		} else if (e.curve) {
			let t = _[_.length - 1], r = p$7(t instanceof Array ? t[t.length - 1] : t, e.curve.circle.center, p, e.curve.theta);
			_.push([...r, p]);
		} else _.push(p);
		d > 0 && _$7.distance(e.line.source, e.line.target) <= c + o && (y = !0);
	}
	return v && (_.shift(), _[0] instanceof Array && _.unshift(_[0][0])), y && _.pop(), _;
}
function _$6(e) {
	return chunk(e, 2).map(([e, t]) => `Q ${e.x} ${e.y} ${t.x} ${t.y}`);
}
function v$3(e) {
	let t = e.length;
	if (t === 0) return [];
	if (t <= 1) return [!0];
	let n = [], r = null, i = !0;
	for (let a = 0; a < t; a++) {
		let o = e[a].edge.source, s = e[a].edge.target;
		if (a === 0) {
			if (t > 2) {
				let t = y$5(e, 0);
				i = t === null || t === s;
			} else i = [e[1].edge.source, e[1].edge.target].includes(s);
		} else i = o === s || r === o;
		n.push(i), r = i ? s : o;
	}
	return n;
}
function y$5(e, t) {
	let n = e[t], r = e[t + 1], i = [n.edge.source, n.edge.target].sort(), a = [r.edge.source, r.edge.target].sort();
	if (i[0] === i[1]) return i[0];
	if (a[0] === a[1]) return a[0];
	if (n.edgeId === r.edgeId || i[0] === a[0] && i[1] === a[1]) {
		if (t >= e.length - 2) return null;
		{
			let n = y$5(e, t + 1);
			return n === null ? null : n === i[1] ? i[0] : i[1];
		}
	}
	return a.includes(i[1]) ? i[1] : i[0];
}
function b$4(e, r, i, a) {
	let o = a ? e.source : e.target, c = e.curve;
	if (c) {
		let t = r / c.circle.radius;
		return c.theta > 0 && (t *= -1), a || (t *= -1), h.fromObject(d$16(a ? e.line.source : e.line.target, c.circle.center, t));
	}
	{
		let c, l;
		a ? (c = e.line.target, l = e.line.source) : (c = e.line.source, l = e.line.target);
		let u = o$17(c, l, h.fromObject(t$51(i, o)), r);
		return u === null ? c : u;
	}
}
function x$4(e, t, n) {
	let r = null;
	if (e.loop || t.loop) r = null;
	else if (e.curve) {
		if (t.curve) {
			if (e.line.target.isEqualTo(t.line.source)) return e.line.target.clone();
			r = l$17(e.curve.circle.center, e.curve.circle.radius, t.curve.circle.center, t.curve.circle.radius, e.curve.center);
		} else r = s$16(t.line.target, t.line.source, e.curve.circle.center, e.curve.circle.radius, n);
	} else if (t.curve) r = o$17(e.line.source, e.line.target, t.curve.circle.center, t.curve.circle.radius);
	else {
		let n = w$3(e.line), i = w$3(t.line);
		r = !isFinite(n) && !isFinite(i) || Math.abs(n - i) < h$6 ? null : c$18(e.line, t.line);
	}
	return r;
}
function S$3(e, t, r, i) {
	if (e.loop) {
		let n = l$17(t, r, e.loop.center, e.loop.radius[0]);
		return n ? i ? n[0] : n[1] : null;
	}
	return e.curve ? l$17(t, r, e.curve.circle.center, e.curve.circle.radius, h.fromObject(e.curve.center)) : o$17(i ? e.line.source : e.line.target, i ? e.line.target : e.line.source, t, r);
}
function C$3(e, t, n) {
	let r = n.origin, o = e.edge.source, s = e.edge.target, c = n.curve, l = n.loop;
	l ? r = n.position : t || (r = c$19(r), o = e.edge.target, s = e.edge.source, c && (c = {
		...c,
		theta: -c.theta
	}));
	let u = t$52.fromLinePosition(r);
	return {
		edgeId: e.edgeId,
		source: o,
		target: s,
		line: u,
		direction: t,
		curve: c,
		loop: l
	};
}
function w$3(e) {
	return (e.target.y - e.source.y) / (e.target.x - e.source.x);
}
function T$3(t, r, i) {
	let { radius: a, center: s } = r$17(r.loop, "Loop of edge parameter"), [c, l] = a, u = l$17(t, i, s, a[0]), [d, f] = u ? u.reverse() : [r.line.source, r.line.target], p = E$1(r);
	p || ([d, f] = [f, d]);
	let m = d, h$13 = f, g = h.fromObject(m).subtract(s).angleDegree(), _ = (h.fromObject(h$13).subtract(s).angleDegree() + 360 - g) % 360 >= 180;
	return _ = p ? _ : !_, [
		m,
		h$13,
		`A ${c} ${l} 0 ${+!!_} ${+!!p} ${h$13.x} ${h$13.y}`
	];
}
function E$1(e) {
	return e.loop ? e.direction ? e.loop.isClockwise : !e.loop.isClockwise : !0;
}
// ../DnD helper/node_modules/v-network-graph/lib/modules/edge/geometry.js
function _$5(e) {
	let { source: t, target: n, sourceShape: i, targetShape: o, layoutPoint: s, summarized: c, line: l } = e, d = e.scale, f = s$18(s, c, t, n, d, e.keepOrder), [p, m] = u$22(t, n, i, o), g = o$18(f, p * d, m * d), _ = 0, v = 0;
	if (l.source.type !== "none") {
		let e = l.source;
		_ = e.margin + e.width, e.units === "strokeWidth" && (_ *= l.normalWidth);
	}
	if (l.target.type !== "none") {
		let e = l.target;
		v = e.margin + e.width, e.units === "strokeWidth" && (v *= l.normalWidth);
	}
	e.margin && (_ += e.margin, v += e.margin);
	let y = !!e.margin || l.source.type !== "none" || l.target.type !== "none";
	if (e.selfLoop) {
		let [r, o] = k$1(t, i, e.selfLoop, y, _, v, s?.pointInGroup ?? 0, d);
		return {
			origin: a$21(t, n),
			labelPosition: g,
			position: r,
			curve: void 0,
			loop: o
		};
	}
	if (y && (_ += p, v += m), e.type === "straight" || c) {
		let e = f;
		return {
			origin: e,
			labelPosition: g,
			position: _ === 0 && v === 0 ? e : o$18(e, _ * d, v * d),
			curve: void 0,
			loop: void 0
		};
	}
	let b = a$21(t, n), [x, S] = O$1(b, f, s ? s.groupWidth / 2 - s.pointInGroup : 0, _ * d, v * d);
	return {
		origin: b,
		labelPosition: g,
		position: x,
		curve: S,
		loop: void 0
	};
}
function v$2(e) {
	let t = e.position;
	if (e.loop) {
		let { radius: n, isLargeArc: r, isClockwise: i } = e.loop, [a, o] = n, s = +!!r, c = +!!i;
		return `M ${t.p1.x} ${t.p1.y} A ${a} ${o} 0 ${s} ${c} ${t.p2.x} ${t.p2.y}`;
	}
	if (e.curve) {
		let n = [...e.curve.control, {
			x: t.p2.x,
			y: t.p2.y
		}];
		return [`M ${t.p1.x} ${t.p1.y}`, ..._$6(n)].join(" ");
	}
	return `M ${t.p1.x} ${t.p1.y} L ${t.p2.x} ${t.p2.y}`;
}
function y$4(e) {
	return S$2(e).reduce((e, t) => e + t.length, 0);
}
function b$3(e, t) {
	let n = S$2(e), r = Math.max(t, 0);
	for (let e of n) {
		if (r <= e.length) return e.pointAt(r);
		r -= e.length;
	}
	let { p2: i } = e.position;
	return {
		x: i.x,
		y: i.y
	};
}
var x$3 = /* @__PURE__ */ new WeakMap();
function S$2(e) {
	let t = toRaw(e.position), n = toRaw(e.curve), r = toRaw(e.loop), i = x$3.get(t);
	if (i && i.curve === n && i.loop === r) return i.segments;
	let a = C$2(e);
	return x$3.set(t, {
		curve: n,
		loop: r,
		segments: a
	}), a;
}
function C$2(e) {
	let { p1: t, p2: n } = e.position;
	if (e.loop) return [T$2(t, n, e.loop)];
	if (e.curve) {
		let r = [
			t,
			...e.curve.control,
			n
		], i = [];
		for (let e = 0; e + 2 < r.length; e += 2) i.push(D(r[e], r[e + 1], r[e + 2]));
		return i;
	}
	return [w$2(t, n)];
}
function w$2(e, t) {
	let n = Math.hypot(t.x - e.x, t.y - e.y);
	return {
		length: n,
		pointAt: (r) => {
			let i = n === 0 ? 0 : r / n;
			return {
				x: e.x + (t.x - e.x) * i,
				y: e.y + (t.y - e.y) * i
			};
		}
	};
}
function T$2(e, t, n) {
	let { center: r } = n, i = n.radius[0], a = Math.atan2(e.y - r.y, e.x - r.x), o = Math.atan2(t.y - r.y, t.x - r.x), s = 2 * Math.PI, c = n.isClockwise ? ((o - a) % s + s) % s : -(((a - o) % s + s) % s);
	return {
		length: Math.abs(c) * i,
		pointAt: (t) => {
			if (i === 0) return {
				x: e.x,
				y: e.y
			};
			let n = a + t / i * Math.sign(c);
			return {
				x: r.x + i * Math.cos(n),
				y: r.y + i * Math.sin(n)
			};
		}
	};
}
var E = [
	[-.932469514203152, .1713244923791704],
	[-.6612093864662645, .3607615730481386],
	[-.2386191860831969, .467913934572691],
	[.2386191860831969, .467913934572691],
	[.6612093864662645, .3607615730481386],
	[.932469514203152, .1713244923791704]
];
function D(e, t, n) {
	let r = (r) => {
		let i = 1 - r;
		return {
			x: i * i * e.x + 2 * i * r * t.x + r * r * n.x,
			y: i * i * e.y + 2 * i * r * t.y + r * r * n.y
		};
	}, i = (r) => {
		let i = 2 * ((1 - r) * (t.x - e.x) + r * (n.x - t.x)), a = 2 * ((1 - r) * (t.y - e.y) + r * (n.y - t.y));
		return Math.hypot(i, a);
	}, a = (e) => E.reduce((t, [n, r]) => t + r * i(e * (n + 1) / 2), 0) * e / 2, o = a(1);
	return {
		length: o,
		pointAt: (e) => {
			if (o === 0) return r(0);
			let t = 0, n = 1, s = e / o;
			for (let r = 0; r < 40; r++) {
				let r = a(s) - e;
				if (Math.abs(r) < 1e-9) break;
				r < 0 ? t = s : n = s;
				let o = i(s), c = o > 0 ? s - r / o : NaN;
				s = c > t && c < n ? c : (t + n) / 2;
			}
			return r(s);
		}
	};
}
function O$1(e, t, s, u, p) {
	let m = t$52.fromLinePosition(e), h = t$52.fromLinePosition(t), g = i$19(t), [_, v] = h$7(m.source, m.target, g), y, b;
	if (v === 0) return [e, b];
	if (s === 0) return y = u === 0 && p === 0 ? e : o$18(e, u, p), [y, b];
	let x = t$52.fromVectors(_, g), S = m$5(t$52.fromVectors(_, m.source), x);
	if (u === 0 && p === 0) y = e;
	else {
		let e = 2 * Math.abs(S) * v;
		if (u + p >= e * (1 - 1e-9)) return y = a$21(g, g.clone().add(h.v.normalize().multiplyScalar(.5))), [y, b];
		let t = u / v, n = p / v;
		S > 0 && (t *= -1, n *= -1), y = a$21(d$16(m.source, _, t), d$16(m.target, _, -n));
	}
	let [C, w] = r$15(y), T = p$7(C, _, w, S).map((e) => e.toObject());
	return b = {
		center: g,
		theta: S,
		circle: {
			center: _,
			radius: v
		},
		control: T
	}, [y, b];
}
function k$1(n, r, i, a, o, c, l, u) {
	let d = u, m = (i.radius + l / 2) * d, h$10 = i.offset * d + m, g = (i.angle - 90) * (Math.PI / 180), _ = h.fromObject({
		x: n.x + h$10 * Math.cos(g),
		y: n.y + h$10 * Math.sin(g)
	}), v = i.isClockwise, y, b;
	if (a) {
		let e = l$17(_, m, h.fromObject(n), t$50(r) * d);
		if (e) {
			[y, b] = e;
			let t = 1;
			if (v || ([y, b] = [b, y], t = -1), o !== 0 || c !== 0) {
				let e = o * d / m * t, n = c * d / m * t;
				y = d$16(y, _, e), b = d$16(b, _, -n);
			}
		}
	}
	if (y === void 0 || b === void 0) {
		let r = h.fromObject(n).subtract(_).normalize().multiplyScalar(m), i = Math.PI / 180 * 1;
		v || (i *= -1), y = _.clone().add(m$6(r, i)), b = _.clone().add(m$6(r, -i));
	}
	let x = h.fromObject(y).subtract(_).angleDegree(), S = (h.fromObject(b).subtract(_).angleDegree() + 360 - x) % 360 >= 180;
	return [{
		p1: y,
		p2: b
	}, {
		center: _,
		radius: [m, m],
		isLargeArc: v ? S : !S,
		isClockwise: v
	}];
}
// ../DnD helper/node_modules/v-network-graph/lib/composables/edgePlacement.js
var u$21 = [
	"origin",
	"labelPosition",
	"position",
	"curve",
	"loop"
];
function d$15() {
	return {
		origin: {
			p1: {
				x: 0,
				y: 0
			},
			p2: {
				x: 0,
				y: 0
			}
		},
		labelPosition: {
			p1: {
				x: 0,
				y: 0
			},
			p2: {
				x: 0,
				y: 0
			}
		},
		position: {
			p1: {
				x: 0,
				y: 0
			},
			p2: {
				x: 0,
				y: 0
			}
		},
		curve: void 0,
		loop: void 0
	};
}
function f$11(e) {
	return {
		...e,
		color: "",
		strokeColor: void 0,
		strokeDasharray: void 0
	};
}
function p$6(p, m, h, g, _, v, y) {
	let b = /* @__PURE__ */ new Map(), x = /* @__PURE__ */ new Map(), S = /* @__PURE__ */ new Map(), C = /* @__PURE__ */ new Set(), w = shallowRef(0), T = (e, t = !1) => {
		let n = !1;
		e.forEach((e) => {
			let r = b.get(e);
			!r || t && !r.effect.dirty || (r(), y.edges.add(e), n = !0);
		}), n && triggerRef(y.changed);
	};
	return {
		geometries: S,
		placeEdges: (e) => T(e),
		placeEdgesAhead: (e) => {
			x.forEach((t) => t(e));
		},
		followStyleChanges: () => {
			watchEffect(() => {
				if (w.value, C.size === 0) return;
				let e = new Set(C);
				C.clear(), T(e, !0);
			});
		},
		startPlacing: (c, y) => {
			let T = d$15();
			S.set(c, T);
			let E = Object.fromEntries(u$21.map((e) => [e, shallowRef(T[e])])), D = toRef(g.edgeLayoutPoints, c), O = toRef(g.summarizedEdges, c), k = computed((e) => {
				let t = A();
				return e && isEqual(e, t) ? e : t;
			}), A = () => {
				let t$60 = p.value[c];
				if (!t$60) return;
				let n = h[t$60.source]?.staticShape, r = h[t$60.target]?.staticShape;
				if (!n || !r) return;
				let i = D.value, a = y.value, o = t$60.source === t$60.target ? t.values(m.selfLoop, t$60) : void 0;
				return {
					sourceId: t$60.source,
					targetId: t$60.target,
					sourceShape: f$11(n),
					targetShape: f$11(r),
					layoutPoint: i && {
						...i,
						edge: {
							source: i.edge.source,
							target: i.edge.target
						}
					},
					summarized: O.value ?? !1,
					line: {
						normalWidth: a.normalWidth,
						source: {
							...a.source,
							color: null
						},
						target: {
							...a.target,
							color: null
						}
					},
					type: o ? "straight" : m.type,
					margin: m.margin,
					keepOrder: m.keepOrder,
					selfLoop: o && { ...o }
				};
			}, j, M = !1, N = () => {
				if (j) return j.source = _(j.sourceId), j.target = _(j.targetId), _$5(j);
			}, P = effect(() => {
				let e = k.value;
				j = e && {
					...e,
					source: {
						x: 0,
						y: 0
					},
					target: {
						x: 0,
						y: 0
					},
					scale: v.value
				}, M = !!e && e.type === "straight" && !e.summarized && !e.selfLoop && !!e.layoutPoint && e.layoutPoint.groupWidth === 0 && !e.margin && e.line.source.type === "none" && e.line.target.type === "none";
				let t = N();
				t && (S.set(c, t), E.origin.value = t.origin, E.labelPosition.value = t.labelPosition, E.position.value = t.position, E.curve.value = t.curve, E.loop.value = t.loop);
			}, { scheduler: () => {
				C.add(c), triggerRef(w);
			} });
			return b.set(c, P), x.set(c, (e) => {
				if (!j) return;
				if (M) {
					e(c, _(j.sourceId), _(j.targetId));
					return;
				}
				let t = N();
				t && (S.set(c, t), e(c, t.position.p1, t.position.p2));
			}), {
				geometry: E,
				stop: () => {
					b.delete(c), x.delete(c), S.delete(c), stop(P);
				}
			};
		}
	};
}
// ../DnD helper/node_modules/v-network-graph/lib/utils/string.js
function e$10(e) {
	return typeof btoa > "u" ? Buffer.from(e).toString("base64").replace(/=/g, "") : btoa(e).replace(/=/g, "");
}
// ../DnD helper/node_modules/v-network-graph/lib/composables/marker.js
function n$11() {
	return {
		markers: reactive({}),
		referenceCount: {}
	};
}
function r$12(e) {
	let { markers: t, referenceCount: n } = e;
	function r(e, r) {
		let i = n[e] ?? 0;
		n[e] = i + 1, i || (t[e] = r);
	}
	function o(e) {
		let r = n[e] ?? 0;
		r && (r - 1 == 0 ? (delete t[e], delete n[e]) : n[e] = r - 1);
	}
	function s(e) {
		e && o(e);
	}
	function c(e, t, n, o, c) {
		if (e.type === "none") {
			s(n);
			return;
		}
		if (e.type === "custom") return s(n), e.customId;
		let l = i$16(e, t, o), u = a$19(l, c);
		return u === n || (s(n), r(u, l)), u;
	}
	return {
		makeMarker: c,
		clearMarker: s
	};
}
function i$16(e, t, n) {
	return {
		...e,
		color: e.color ?? n,
		isSource: t
	};
}
function a$19(t, n) {
	let r = e$10(t.color), i = t.isSource ? "L" : "R", a = t.units === "strokeWidth" ? "rel" : "abs";
	return `marker_${n}_${t.type}_${t.width}_${t.height}_${t.margin}_${t.offset}_${r}_${i}_${a}`;
}
// ../DnD helper/node_modules/v-network-graph/lib/composables/edgeState.js
var o$16 = {
	type: "none",
	width: 0,
	height: 0,
	margin: 0,
	offset: 0,
	units: "strokeWidth",
	color: null
};
function s$15(r, o, s, l, f, p, m) {
	let { makeMarker: h, clearMarker: g } = r$12(f);
	s.label = computed(() => r.value[o] ? t.values(l.label, r.value[o]) : unref(s.label));
	let _ = computed(() => {
		let t$58 = r.value[o], n = u$20(t$58, s.selected, s.hovered, l);
		isNaN(+n.width) && (console.warn("[v-network-graph] Edge width is invalid value. id=[%s] value=[%s]", o, n.width), n.width = 1), (n.color === void 0 || n.color === null) && (console.warn("[v-network-graph] Edge color is invalid value. id=[%s] value=[%s]", o, n.color), n.color = "#000000");
		let i = t.value(l.normal.width, t$58);
		isNaN(+i) && (i = 1);
		let a = d$14(t.values(l.marker.source, [t$58, n])), c = d$14(t.values(l.marker.target, [t$58, n]));
		return {
			stroke: n,
			normalWidth: i,
			source: a,
			target: c
		};
	});
	s.line = _;
	let v = m.startPlacing(o, _);
	c$16(s, v.geometry);
	let y = watchEffect(() => {
		r.value[o] && (s.sourceMarkerId = h(_.value.source, !0, s.sourceMarkerId, _.value.stroke.color, p), s.targetMarkerId = h(_.value.target, !1, s.targetMarkerId, _.value.stroke.color, p));
	});
	s.stopWatchHandle = () => {
		v.stop(), y(), g(s.sourceMarkerId), g(s.targetMarkerId);
	};
}
function c$16(e, t) {
	for (let n of Object.keys(t)) Object.defineProperty(toRaw(e), n, {
		get: () => t[n].value,
		enumerable: !0,
		configurable: !0
	});
}
function l$15(e, t) {
	return Object.entries(e).map(([e, n]) => n.summarize ? {
		id: Object.keys(n.edges)[0] ?? e,
		summarized: !0,
		key: e,
		group: n,
		zIndex: Object.keys(n.edges).map((e) => t[e]?.zIndex ?? 0).reduce((e, t) => Math.max(e, t))
	} : Object.entries(n.edges).map(([e, n]) => ({
		id: e,
		summarized: !1,
		key: e,
		edge: n,
		zIndex: t[e]?.zIndex ?? 0
	}))).flat();
}
function u$20(t$59, n, r, i) {
	return n ? t.values(i.selected, t$59) : r && i.hover ? t.values(i.hover, t$59) : t.values(i.normal, t$59);
}
function d$14(e) {
	return e.type === "none" ? o$16 : e;
}
// ../DnD helper/node_modules/v-network-graph/lib/composables/nodeState.js
function c$15(t, n) {
	let i = n$16({});
	return watchEffect(() => {
		let e = Object.fromEntries(Object.keys(t.value).map((e) => [e, {}]));
		Object.entries(n.value).forEach(([t, n]) => {
			e?.[n.source] || (e[n.source] = {}), e?.[n.target] || (e[n.target] = {}), e[n.source][t] = n.target, e[n.target][t] = n.source;
		}), n$15(i, e);
	}), i;
}
function l$14(e, r, s, c, l, f, p) {
	let m = p().nodes?.[r];
	!f.nodes[r] && m && (f.nodes[r] = m), s.shape = computed(() => e.value[r] ? u$19(e.value[r], s.selected, s.hovered, c) : unref(s.shape)), s.staticShape = computed(() => e.value[r] ? d$13(e.value[r], s.selected, c) : unref(s.staticShape)), s.label = computed(() => e.value[r] ? t.values(c.label, e.value[r]) : unref(s.label)), s.labelText = computed(() => c.label.text instanceof Function ? unref(s.label).text : e.value[r] ? e.value[r]?.[unref(s.label).text] ?? "" : unref(s.labelText)), s.draggable = computed(() => e.value[r] ? t.value(c.draggable, e.value[r]) : unref(s.draggable)), s.oppositeNodeIds = toRef(l, r), s.oppositeNodes = computed(() => Object.entries(s.oppositeNodeIds).reduce((e, t) => {
		let [r, i] = t;
		return i in f.nodes && (e[r] = {
			nodeId: i,
			pos: t$51(f.nodes, i)
		}), e;
	}, {}));
}
function u$19(e, n, r, i) {
	return r && i.hover ? t.values(i.hover, e) : d$13(e, n, i);
}
function d$13(e, n, r) {
	return n ? t.values(r.selected, e) : t.values(r.normal, e);
}
// ../DnD helper/node_modules/v-network-graph/lib/composables/objectState.js
function a$18(e, r, a, c, l, u, d) {
	let f = reactive({});
	return watch(() => new Set(Object.keys(e.value)), (t, n) => {
		n || (n = /* @__PURE__ */ new Set([]));
		for (let i of t) n.has(i) || o$15(e, f, i, !1, r, l);
		for (let e of n) t.has(e) || (a.delete(e), c.delete(e), u?.(e, f[e]), delete f[e]);
	}, { immediate: !0 }), watch(() => [...a], (e, t) => {
		let n = t ? e.filter((e) => !t.includes(e)) : e, r = t ? t.filter((t) => !e.includes(t)) : [];
		n.forEach((e) => {
			let t = f[e];
			t && !t.selected && (t.selected = !0);
		}), r.forEach((e) => {
			let t = f[e];
			t && t.selected && (t.selected = !1);
		});
	}, { immediate: !0 }), watch(() => [...c], (e, t) => {
		let n = e.filter((e) => !t.includes(e)), r = t.filter((t) => !e.includes(t));
		n.forEach((e) => {
			let t = f[e];
			t && !t.hovered && (t.hovered = !0);
		}), r.forEach((e) => {
			let t = f[e];
			t && t.hovered && (t.hovered = !1);
		});
	}), {
		states: f,
		zOrderedList: computed(() => {
			let e = d ? d() : Object.values(f);
			return r.zOrder.enabled ? s$14(e, r.zOrder, c, a) : e;
		})
	};
}
function o$15(n, i, a, o, s, c) {
	let l = {
		id: a,
		selected: o,
		hovered: !1,
		selectable: computed(() => n.value[a] ? t.value(s.selectable, n.value[a]) : unref(l.selectable)),
		zIndex: computed(() => n.value[a] ? t.value(s.zOrder.zIndex, n.value[a]) : unref(l.zIndex))
	};
	i[a] = l, c(n, a, i[a]);
}
function s$14(e, t, n, r) {
	return t.bringToFrontOnHover && t.bringToFrontOnSelected ? e.sort((e, t) => {
		let i = n.has(e.id);
		if (i != n.has(t.id)) return i ? 1 : -1;
		let a = r.has(e.id);
		return a == r.has(t.id) ? e.zIndex - t.zIndex : a ? 1 : -1;
	}) : t.bringToFrontOnHover ? e.sort((e, t) => {
		let r = n.has(e.id);
		return r == n.has(t.id) ? e.zIndex - t.zIndex : r ? 1 : -1;
	}) : t.bringToFrontOnSelected ? e.sort((e, t) => {
		let n = r.has(e.id);
		return n == r.has(t.id) ? e.zIndex - t.zIndex : n ? 1 : -1;
	}) : e.sort((e, t) => e.zIndex - t.zIndex);
}
// ../DnD helper/node_modules/v-network-graph/lib/composables/pathState.js
function a$17(a, s, c, l, u, d) {
	c.clickable = computed(() => a.value[s] ? t.value(l.clickable, a.value[s]) : !1), c.hoverable = computed(() => a.value[s] ? t.value(l.hoverable, a.value[s]) : !1), c.stopWatchHandle = watchEffect(() => {
		if (!a.value[s]) return;
		c.path = a.value[s];
		let e = o$14(c.path, u, d);
		isEqual(e, c.edges) || (c.edges = e);
		let n = v$3(e);
		isEqual(n, c.directions) || (c.directions = n);
	});
}
function o$14(e, t, n) {
	return e.edges.map((e) => ({
		edgeId: e,
		edge: t.value[e]
	})).filter((e) => e.edge && e.edgeId in n.edgeLayoutPoints);
}
// ../DnD helper/node_modules/v-network-graph/lib/composables/positionTracker.js
function a$16(a, o, s) {
	let c = shallowRef(), l = /* @__PURE__ */ new Map(), u = !0;
	return watchEffect(() => {
		let t = a.nodes, i = /* @__PURE__ */ new Set(), d = !1, f = 0;
		for (let n in t) {
			f++;
			let r = t[n], a = r?.x, o = r?.y, s = i$17(a), c = i$17(o), u = r?.fixed, p = l.get(n);
			p && Object.is(p.givenX, a) && Object.is(p.givenY, o) && p.fixed === u || ((p?.x !== s || p?.y !== c) && i.add(n), p ? (p.x = s, p.y = c, p.givenX = a, p.givenY = o, p.fixed = u) : l.set(n, {
				x: s,
				y: c,
				givenX: a,
				givenY: o,
				fixed: u
			}), d = !0);
		}
		if (l.size > f) {
			let e = toRaw(t);
			l.forEach((t, r) => {
				r in e || (l.delete(r), d = !0, r in toRaw(o.value) && i.add(r));
			});
		}
		i.size > 0 && s(i), d && !u && triggerRef(c), u = !1;
	}), c;
}
// ../DnD helper/node_modules/v-network-graph/lib/composables/state.js
function y$3(e, t, n) {
	return {
		objects: e,
		selected: t,
		hovered: n
	};
}
var b$2 = Symbol("states");
function x$2(e, d, f, y, x, S, C, w, T) {
	let E = c$15(e.objects, d.objects), { states: D, zOrderedList: O } = a$18(e.objects, y.node, e.selected, e.hovered, (e, t, n) => {
		l$14(e, t, n, y.node, E, x, S);
	}, (e, t) => {
		let n = x.nodes;
		delete n[e];
	}), k = t$53(), A = o$19(e.objects, d.objects, y), j = ref([]), M = {
		nodes: /* @__PURE__ */ new Set(),
		edges: /* @__PURE__ */ new Set(),
		changed: shallowRef()
	}, N = p$6(d.objects, y.edge, D, A, T.of, w, M), { states: P, zOrderedList: F } = a$18(d.objects, y.edge, d.selected, d.hovered, (e, t, n) => {
		s$15(e, t, n, y.edge, C, k, N);
	}, (e, t) => {
		t.stopWatchHandle?.();
	}, () => j.value);
	N.followStyleChanges();
	let I = a$16(x, e.objects, (e) => {
		let t = /* @__PURE__ */ new Set();
		e.forEach((e) => {
			M.nodes.add(e), Object.keys(toRaw(E)[e] ?? {}).forEach((e) => t.add(e));
		}), N.placeEdges(t), triggerRef(M.changed), T.moved(e);
	});
	watchEffect(() => {
		j.value = l$15(A.edgeGroups, P);
	});
	let { states: L, zOrderedList: R } = a$18(f.objects, y.path, f.selected, f.hovered, (e, t, n) => {
		a$17(e, t, n, y.path, d.objects, A);
	}, (e, t) => {
		t.stopWatchHandle?.();
	}), z = {
		nodeStates: D,
		edgeStates: P,
		edgeGroupStates: A,
		pathStates: L,
		layouts: x,
		nodeZOrderedList: O,
		edgeZOrderedList: F,
		pathZOrderedList: R
	};
	return provide(b$2, z), {
		...z,
		positionChanges: M,
		layoutsChanged: I,
		edgeGeometries: N.geometries,
		placeEdgesAhead: N.placeEdgesAhead
	};
}
function S$1(e) {
	return e.summarized;
}
function C() {
	return r$17(inject(b$2), "states");
}
function w$1(e, t) {
	let n = Object.keys(t).find((t) => t in e);
	return n ? e[n] : void 0;
}
function T$1(e) {
	let { edgeStates: t } = C(), n = (n) => computed(() => Object.keys(e()).some((e) => t[e]?.[n]));
	return {
		hovered: n("hovered"),
		selectable: n("selectable"),
		selected: n("selected")
	};
}
// ../DnD helper/node_modules/v-network-graph/lib/composables/zoom.js
var i$15 = Symbol("zoomLevel");
function a$15(e, n) {
	let a = computed(() => n.scalingObjects ? 1 : 1 / e.value);
	return provide(i$15, {
		zoomLevel: e,
		scale: a
	}), { scale: a };
}
function o$13() {
	return r$17(inject(i$15), "zoomLevel");
}
// ../DnD helper/node_modules/v-network-graph/lib/composables/labelText.js
function n$10(n, r = () => void 0) {
	let { scale: i } = o$13(), a = computed(() => n.text?.toString().split(/\r?\n/) ?? ""), o = computed(() => r() ?? n.config.fontSize * i.value), s = computed(() => o.value * n.config.lineHeight);
	return {
		texts: a,
		fontSize: o,
		lineHeight: s,
		topDeltaY: computed(() => {
			let e = n.dominantBaseline;
			return e === "hanging" ? 0 : e === "central" ? -(s.value * (a.value.length - 1)) / 2 : -s.value * (a.value.length - 1);
		})
	};
}
// ../DnD helper/node_modules/v-network-graph/lib/components/base/VLabelText.vue_vue_type_script_setup_true_lang.js
var b$1 = [
	"rx",
	"ry",
	"fill",
	"transform"
];
var x$1 = [
	"x",
	"y",
	"dominant-baseline",
	"font-family",
	"font-size",
	"fill"
];
var S = [
	"x",
	"dy",
	"dominant-baseline"
];
// ../DnD helper/node_modules/v-network-graph/lib/components/base/VLabelText.vue.js
var t$2 = /* @__PURE__ */ defineComponent({
	__name: "VLabelText",
	props: {
		text: {},
		x: { default: 0 },
		y: { default: 0 },
		dominantBaseline: { default: "central" },
		config: {}
	},
	setup(c) {
		let C = c, w = useAttrs(), { scale: T } = o$13(), { texts: E, fontSize: D, lineHeight: O, topDeltaY: k } = n$10(C, () => w["font-size"]), A = ref(), j = ref(""), M = reactive({
			x: 0,
			y: 0,
			width: 0,
			height: 0
		}), N = computed(() => {
			let e = C.config.background;
			if (!e) return M;
			let t, n;
			e.padding instanceof Object ? (t = e.padding.vertical, n = e.padding.horizontal) : (t = e.padding ?? 0, n = e.padding ?? 0);
			let r = O.value - D.value;
			return {
				x: M.x - n * T.value,
				y: M.y - t * T.value - r / 2,
				width: M.width + n * 2 * T.value,
				height: M.height + t * 2 * T.value + r
			};
		}), P, F = () => {
			C.config.background && C.config.background.visible ? !P && A.value && (P = L(A.value, M, j)) : (P?.disconnect(), P = void 0);
		};
		onMounted(() => F()), watch(() => C.config.background && C.config.background.visible, (e, t) => {
			e != t && F();
		}), onUnmounted(() => {
			P?.disconnect(), P = void 0;
		});
		function I(e, t, n) {
			let r = e.getBBox();
			t.x = r.x, t.y = r.y, t.width = r.width, t.height = r.height, n.value = e.getAttribute("transform") ?? void 0;
		}
		function L(e, t, n) {
			let r = new MutationObserver(() => {
				I(e, t, n);
			});
			return r.observe(e, {
				attributes: !0,
				attributeFilter: [
					"x",
					"y",
					"transform",
					"font-size"
				]
			}), I(e, t, n), r;
		}
		return (e, t) => (openBlock(), createElementBlock(Fragment, null, [c.config.background && c.config.background.visible ? (openBlock(), createElementBlock("rect", mergeProps({
			key: 0,
			class: "v-ng-text-background"
		}, N.value, {
			rx: (c.config.background?.borderRadius ?? 0) * unref(T),
			ry: (c.config.background?.borderRadius ?? 0) * unref(T),
			fill: c.config.background?.color ?? "#ffffff",
			transform: j.value
		}), null, 16, b$1)) : createCommentVNode("", !0), createBaseVNode("text", mergeProps({
			ref_key: "element",
			ref: A,
			class: "v-ng-text"
		}, e.$attrs, {
			x: c.x,
			y: c.y,
			"dominant-baseline": c.dominantBaseline,
			"font-family": e.$attrs["font-family"] ? `${e.$attrs["font-family"]}` : c.config.fontFamily,
			"font-size": unref(D),
			fill: e.$attrs.fill ? `${e.$attrs.fill}` : c.config.color
		}), [unref(E).length <= 1 ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [createTextVNode(toDisplayString(c.text), 1)], 64)) : (openBlock(!0), createElementBlock(Fragment, { key: 1 }, renderList(unref(E), (e, t) => (openBlock(), createElementBlock("tspan", {
			key: t,
			x: c.x,
			dy: unref(t == 0 ? k : O),
			"dominant-baseline": c.dominantBaseline
		}, toDisplayString(e), 9, S))), 128))], 16, x$1)], 64));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/composables/shape.js
function i$14(i) {
	let { scale: a } = o$13(), o = ref(i.baseX), s = ref(i.baseY), c = ref(0), l = ref("#000000"), u = ref(void 0), d = ref(0), f = ref(0), p = ref(0), m = ref(0);
	return watchEffect(() => {
		let e = a.value;
		c.value = i.config.strokeWidth * e, l.value = i.config.strokeColor ?? "none", u.value = r$19(i.config.strokeDasharray, e), i.config.type === "circle" ? (o.value = i.baseX, s.value = i.baseY, d.value = i.config.radius * e) : (f.value = i.config.width * e, p.value = i.config.height * e, m.value = i.config.borderRadius * e, o.value = i.baseX - f.value / 2, s.value = i.baseY - p.value / 2);
	}), {
		x: o,
		y: s,
		strokeWidth: c,
		strokeColor: l,
		strokeDasharray: u,
		radius: d,
		width: f,
		height: p,
		borderRadius: m
	};
}
// ../DnD helper/node_modules/v-network-graph/lib/components/base/VShape.vue_vue_type_script_setup_true_lang.js
var a$14 = [
	"cx",
	"cy",
	"r",
	"fill",
	"stroke",
	"stroke-width",
	"stroke-dasharray"
];
var o$12 = [
	"x",
	"y",
	"width",
	"height",
	"rx",
	"ry",
	"fill",
	"stroke",
	"stroke-width",
	"stroke-dasharray"
];
// ../DnD helper/node_modules/v-network-graph/lib/components/base/VShape.vue.js
var t$5 = /* @__PURE__ */ defineComponent({
	__name: "VShape",
	props: {
		baseX: { default: 0 },
		baseY: { default: 0 },
		config: {}
	},
	setup(n) {
		let { x: s, y: c, strokeWidth: l, strokeColor: u, strokeDasharray: d, radius: f, width: p, height: m, borderRadius: h } = i$14(n);
		return (e, g) => n.config.type === "circle" ? (openBlock(), createElementBlock("circle", {
			key: 0,
			class: "v-ng-shape-circle",
			cx: unref(s),
			cy: unref(c),
			r: unref(f),
			fill: n.config.color,
			stroke: unref(u),
			"stroke-width": unref(l),
			"stroke-dasharray": unref(d)
		}, null, 8, a$14)) : (openBlock(), createElementBlock("rect", {
			key: 1,
			class: "v-ng-shape-rect",
			x: unref(s),
			y: unref(c),
			width: unref(p),
			height: unref(m),
			rx: unref(h),
			ry: unref(h),
			fill: n.config.color,
			stroke: unref(u),
			"stroke-width": unref(l),
			"stroke-dasharray": unref(d)
		}, null, 8, o$12));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/utils/props.js
function a$13(e, t, a, o) {
	if (o) {
		let s = ref(o(e[t])), c = (n) => {
			isEqual(n, s.value) || (s.value = n), isEqual(n, e[t]) || a(`update:${t}`, n);
		};
		return watch(() => o(s.value), c), watch(() => e[t], (e) => c(o(e))), s.value !== e[t] && a(`update:${t}`, s.value), s;
	}
	let s = ref(e[t]);
	return watch(() => e[t], (e) => {
		isEqual(e, s.value) || (s.value = e);
	}), watch(s, (n) => {
		isEqual(n, e[t]) || a(`update:${t}`, n);
	}), s;
}
function o$11(n, a, o, s) {
	let c = reactive(/* @__PURE__ */ new Set());
	return watch(() => n[a], () => {
		let e = n[a].filter((e) => e in o.value);
		isEqual(e, Array.from(c)) || (c.clear(), e.forEach(c.add, c));
	}, {
		deep: !0,
		immediate: !0
	}), watch(c, () => {
		let e = Array.from(c);
		isEqual(n[a], e) || s(`update:${a}`, e);
	}), n$16(c);
}
// ../DnD helper/node_modules/v-network-graph/lib/composables/container.js
var r$11 = Symbol("containers");
function i$13(e) {
	provide(r$11, e);
}
function a$12() {
	let n = r$17(inject(r$11), "containers");
	return {
		container: n.container,
		svg: n.svg,
		viewport: n.viewport,
		svgPanZoom: n.svgPanZoom
	};
}
// ../DnD helper/node_modules/v-network-graph/lib/vendor/@dash14/svg-pan-zoom/dist/svg-pan-zoom.js
var e$9 = {
	extend: function(e, t) {
		for (var n in e = e || {}, t) this.isObject(t[n]) ? e[n] = this.extend(e[n], t[n]) : e[n] = t[n];
		return e;
	},
	isElement: function(e) {
		return e instanceof HTMLElement || e instanceof SVGElement || e instanceof SVGSVGElement || e && typeof e == "object" && !!e && e.nodeType === 1 && typeof e.nodeName == "string";
	},
	isObject: function(e) {
		return Object.prototype.toString.call(e) === "[object Object]";
	},
	isNumber: function(e) {
		return !isNaN(parseFloat(e)) && isFinite(e);
	},
	getSvg: function(e) {
		var t, n;
		if (this.isElement(e)) t = e;
		else if (typeof e == "string" || e instanceof String) {
			if (t = document.querySelector(e), !t) throw Error("Provided selector did not find any elements. Selector: " + e);
		} else throw Error("Provided selector is not an HTML object nor String");
		if (t.tagName.toLowerCase() === "svg") n = t;
		else if (t.tagName.toLowerCase() === "object") n = t.contentDocument.documentElement;
		else if (t.tagName.toLowerCase() === "embed") n = t.getSVGDocument().documentElement;
		else if (t.tagName.toLowerCase() === "img") throw Error("Cannot script an SVG in an \"img\" element. Please use an \"object\" element or an in-line SVG.");
		else throw Error("Cannot get SVG.");
		return n;
	},
	proxy: function(e, t) {
		return function() {
			return e.apply(t, arguments);
		};
	},
	getType: function(e) {
		return Object.prototype.toString.apply(e).replace(/^\[object\s/, "").replace(/\]$/, "");
	},
	mouseAndTouchNormalize: function(e, t) {
		if (e.clientX === void 0 || e.clientX === null) {
			if (e.clientX = 0, e.clientY = 0, e.touches !== void 0 && e.touches.length) {
				if (e.touches[0].clientX !== void 0) e.clientX = e.touches[0].clientX, e.clientY = e.touches[0].clientY;
				else if (e.touches[0].pageX !== void 0) {
					var n = t.getBoundingClientRect();
					e.clientX = e.touches[0].pageX - n.left, e.clientY = e.touches[0].pageY - n.top;
				}
			} else e.originalEvent !== void 0 && e.originalEvent.clientX !== void 0 && (e.clientX = e.originalEvent.clientX, e.clientY = e.originalEvent.clientY);
		}
	},
	touchNormalize: function(e, t, n) {
		if (e.touches !== void 0 && e.touches.length) {
			if (e.touches[n].clientX !== void 0) e.clientX = e.touches[n].clientX, e.clientY = e.touches[n].clientY;
			else if (e.touches[n].pageX !== void 0) {
				var r = t.getBoundingClientRect();
				e.clientX = e.touches[n].pageX - r.left, e.clientY = e.touches[n].pageY - r.top;
			}
		} else (e.clientX === void 0 || e.clientX === null) && (e.clientX = 0, e.clientY = 0, e.originalEvent !== void 0 && e.originalEvent.clientX !== void 0 && (e.clientX = e.originalEvent.clientX, e.clientY = e.originalEvent.clientY));
	},
	isDblClick: function(e, t) {
		if (e.detail === 2) return !0;
		if (t != null) {
			var n = e.timeStamp - t.timeStamp, r = Math.sqrt((e.clientX - t.clientX) ** 2 + (e.clientY - t.clientY) ** 2);
			return n < 250 && r < 10;
		}
		return !1;
	},
	createRequestAnimationFrame: function(e) {
		var n = null;
		return e !== "auto" && e < 60 && e > 1 && (n = Math.floor(1e3 / e)), n === null ? window.requestAnimationFrame : t$49(n);
	},
	calculateDistance: function(e, t) {
		var n = e.x - t.x, r = e.y - t.y;
		return Math.sqrt(n * n + r * r);
	}
};
function t$49(e) {
	return function(t) {
		window.setTimeout(t, e);
	};
}
var n$9 = {
	svgNS: "http://www.w3.org/2000/svg",
	xmlNS: "http://www.w3.org/XML/1998/namespace",
	xmlnsNS: "http://www.w3.org/2000/xmlns/",
	xlinkNS: "http://www.w3.org/1999/xlink",
	evNS: "http://www.w3.org/2001/xml-events",
	getBoundingClientRectNormalized: function(e) {
		if (e.clientWidth && e.clientHeight) return {
			width: e.clientWidth,
			height: e.clientHeight
		};
		if (e.getBoundingClientRect()) return e.getBoundingClientRect();
		throw Error("Cannot get BoundingClientRect for SVG.");
	},
	getOrCreateViewport: function(t, n) {
		var r = null;
		if (r = e$9.isElement(n) ? n : t.querySelector(n), r) return r;
		var i = Array.prototype.slice.call(t.childNodes).filter(function(e) {
			return e.nodeName !== "defs" && e.nodeName !== "#text";
		});
		if (i.length === 1 && i[0].nodeName === "g" && i[0].getAttribute("transform") === null && (r = i[0]), !r) {
			var a = "viewport-" + (/* @__PURE__ */ new Date()).toISOString().replace(/\D/g, "");
			r = document.createElementNS(this.svgNS, "g"), r.setAttribute("id", a);
			for (var o = t.childNodes, s = o.length; s > 0; s--) o[o.length - s].nodeName !== "defs" && r.appendChild(o[o.length - s]);
			t.appendChild(r);
		}
		var c = [];
		return r.getAttribute("class") && (c = r.getAttribute("class").split(" ")), ~c.indexOf("svg-pan-zoom_viewport") || (c.push("svg-pan-zoom_viewport"), r.setAttribute("class", c.join(" "))), r;
	},
	setupSvgAttributes: function(e) {
		if (e.setAttribute("xmlns", this.svgNS), e.setAttributeNS(this.xmlnsNS, "xmlns:xlink", this.xlinkNS), e.setAttributeNS(this.xmlnsNS, "xmlns:ev", this.evNS), e.parentNode !== null) {
			var t = e.getAttribute("style") || "";
			t.toLowerCase().indexOf("overflow") === -1 && e.setAttribute("style", "overflow: hidden; " + t);
		}
	},
	setCTM: function(e, t) {
		var n = "matrix(" + t.a + "," + t.b + "," + t.c + "," + t.d + "," + t.e + "," + t.f + ")";
		e.setAttributeNS(null, "transform", n), e.style.transform = n;
	},
	getEventPoint: function(t, n) {
		var r = n.createSVGPoint();
		return e$9.mouseAndTouchNormalize(t, n), r.x = t.clientX, r.y = t.clientY, r;
	},
	getTouchPoint: function(t, n, r) {
		var i = n.createSVGPoint();
		return e$9.touchNormalize(t, n, r), i.x = t.clientX, i.y = t.clientY, i;
	},
	getSvgCenterPoint: function(e, t, n) {
		return this.createSVGPoint(e, t / 2, n / 2);
	},
	createSVGPoint: function(e, t, n) {
		var r = e.createSVGPoint();
		return r.x = t, r.y = n, r;
	}
};
var r$10 = {
	enable: function(e) {
		var t = e.svg.querySelector("defs");
		if (t || (t = document.createElementNS(n$9.svgNS, "defs"), e.svg.appendChild(t)), !t.querySelector("style#svg-pan-zoom-controls-styles")) {
			var r = document.createElementNS(n$9.svgNS, "style");
			r.setAttribute("id", "svg-pan-zoom-controls-styles"), r.setAttribute("type", "text/css"), r.textContent = ".svg-pan-zoom-control { cursor: pointer; fill: black; fill-opacity: 0.333; } .svg-pan-zoom-control:hover { fill-opacity: 0.8; } .svg-pan-zoom-control-background { fill: white; fill-opacity: 0.5; } .svg-pan-zoom-control-background { fill-opacity: 0.8; }", t.appendChild(r);
		}
		var i = document.createElementNS(n$9.svgNS, "g");
		i.setAttribute("id", "svg-pan-zoom-controls"), i.setAttribute("transform", "translate(" + (e.width - 70) + " " + (e.height - 76) + ") scale(0.75)"), i.setAttribute("class", "svg-pan-zoom-control"), i.appendChild(this._createZoomIn(e)), i.appendChild(this._createZoomReset(e)), i.appendChild(this._createZoomOut(e)), e.svg.appendChild(i), e.controlIcons = i;
	},
	_createZoomIn: function(e) {
		var t = document.createElementNS(n$9.svgNS, "g");
		t.setAttribute("id", "svg-pan-zoom-zoom-in"), t.setAttribute("transform", "translate(30.5 5) scale(0.015)"), t.setAttribute("class", "svg-pan-zoom-control"), t.addEventListener("click", function() {
			e.getPublicInstance().zoomIn();
		}, !1), t.addEventListener("touchstart", function() {
			e.getPublicInstance().zoomIn();
		}, !1);
		var r = document.createElementNS(n$9.svgNS, "rect");
		r.setAttribute("x", "0"), r.setAttribute("y", "0"), r.setAttribute("width", "1500"), r.setAttribute("height", "1400"), r.setAttribute("class", "svg-pan-zoom-control-background"), t.appendChild(r);
		var i = document.createElementNS(n$9.svgNS, "path");
		return i.setAttribute("d", "M1280 576v128q0 26 -19 45t-45 19h-320v320q0 26 -19 45t-45 19h-128q-26 0 -45 -19t-19 -45v-320h-320q-26 0 -45 -19t-19 -45v-128q0 -26 19 -45t45 -19h320v-320q0 -26 19 -45t45 -19h128q26 0 45 19t19 45v320h320q26 0 45 19t19 45zM1536 1120v-960 q0 -119 -84.5 -203.5t-203.5 -84.5h-960q-119 0 -203.5 84.5t-84.5 203.5v960q0 119 84.5 203.5t203.5 84.5h960q119 0 203.5 -84.5t84.5 -203.5z"), i.setAttribute("class", "svg-pan-zoom-control-element"), t.appendChild(i), t;
	},
	_createZoomReset: function(e) {
		var t = document.createElementNS(n$9.svgNS, "g");
		t.setAttribute("id", "svg-pan-zoom-reset-pan-zoom"), t.setAttribute("transform", "translate(5 35) scale(0.4)"), t.setAttribute("class", "svg-pan-zoom-control"), t.addEventListener("click", function() {
			e.getPublicInstance().reset();
		}, !1), t.addEventListener("touchstart", function() {
			e.getPublicInstance().reset();
		}, !1);
		var r = document.createElementNS(n$9.svgNS, "rect");
		r.setAttribute("x", "2"), r.setAttribute("y", "2"), r.setAttribute("width", "182"), r.setAttribute("height", "58"), r.setAttribute("class", "svg-pan-zoom-control-background"), t.appendChild(r);
		var i = document.createElementNS(n$9.svgNS, "path");
		i.setAttribute("d", "M33.051,20.632c-0.742-0.406-1.854-0.609-3.338-0.609h-7.969v9.281h7.769c1.543,0,2.701-0.188,3.473-0.562c1.365-0.656,2.048-1.953,2.048-3.891C35.032,22.757,34.372,21.351,33.051,20.632z"), i.setAttribute("class", "svg-pan-zoom-control-element"), t.appendChild(i);
		var a = document.createElementNS(n$9.svgNS, "path");
		return a.setAttribute("d", "M170.231,0.5H15.847C7.102,0.5,0.5,5.708,0.5,11.84v38.861C0.5,56.833,7.102,61.5,15.847,61.5h154.384c8.745,0,15.269-4.667,15.269-10.798V11.84C185.5,5.708,178.976,0.5,170.231,0.5z M42.837,48.569h-7.969c-0.219-0.766-0.375-1.383-0.469-1.852c-0.188-0.969-0.289-1.961-0.305-2.977l-0.047-3.211c-0.03-2.203-0.41-3.672-1.142-4.406c-0.732-0.734-2.103-1.102-4.113-1.102h-7.05v13.547h-7.055V14.022h16.524c2.361,0.047,4.178,0.344,5.45,0.891c1.272,0.547,2.351,1.352,3.234,2.414c0.731,0.875,1.31,1.844,1.737,2.906s0.64,2.273,0.64,3.633c0,1.641-0.414,3.254-1.242,4.84s-2.195,2.707-4.102,3.363c1.594,0.641,2.723,1.551,3.387,2.73s0.996,2.98,0.996,5.402v2.32c0,1.578,0.063,2.648,0.19,3.211c0.19,0.891,0.635,1.547,1.333,1.969V48.569z M75.579,48.569h-26.18V14.022h25.336v6.117H56.454v7.336h16.781v6H56.454v8.883h19.125V48.569z M104.497,46.331c-2.44,2.086-5.887,3.129-10.34,3.129c-4.548,0-8.125-1.027-10.731-3.082s-3.909-4.879-3.909-8.473h6.891c0.224,1.578,0.662,2.758,1.316,3.539c1.196,1.422,3.246,2.133,6.15,2.133c1.739,0,3.151-0.188,4.236-0.562c2.058-0.719,3.087-2.055,3.087-4.008c0-1.141-0.504-2.023-1.512-2.648c-1.008-0.609-2.607-1.148-4.796-1.617l-3.74-0.82c-3.676-0.812-6.201-1.695-7.576-2.648c-2.328-1.594-3.492-4.086-3.492-7.477c0-3.094,1.139-5.664,3.417-7.711s5.623-3.07,10.036-3.07c3.685,0,6.829,0.965,9.431,2.895c2.602,1.93,3.966,4.73,4.093,8.402h-6.938c-0.128-2.078-1.057-3.555-2.787-4.43c-1.154-0.578-2.587-0.867-4.301-0.867c-1.907,0-3.428,0.375-4.565,1.125c-1.138,0.75-1.706,1.797-1.706,3.141c0,1.234,0.561,2.156,1.682,2.766c0.721,0.406,2.25,0.883,4.589,1.43l6.063,1.43c2.657,0.625,4.648,1.461,5.975,2.508c2.059,1.625,3.089,3.977,3.089,7.055C108.157,41.624,106.937,44.245,104.497,46.331z M139.61,48.569h-26.18V14.022h25.336v6.117h-18.281v7.336h16.781v6h-16.781v8.883h19.125V48.569z M170.337,20.14h-10.336v28.43h-7.266V20.14h-10.383v-6.117h27.984V20.14z"), a.setAttribute("class", "svg-pan-zoom-control-element"), t.appendChild(a), t;
	},
	_createZoomOut: function(e) {
		var t = document.createElementNS(n$9.svgNS, "g");
		t.setAttribute("id", "svg-pan-zoom-zoom-out"), t.setAttribute("transform", "translate(30.5 70) scale(0.015)"), t.setAttribute("class", "svg-pan-zoom-control"), t.addEventListener("click", function() {
			e.getPublicInstance().zoomOut();
		}, !1), t.addEventListener("touchstart", function() {
			e.getPublicInstance().zoomOut();
		}, !1);
		var r = document.createElementNS(n$9.svgNS, "rect");
		r.setAttribute("x", "0"), r.setAttribute("y", "0"), r.setAttribute("width", "1500"), r.setAttribute("height", "1400"), r.setAttribute("class", "svg-pan-zoom-control-background"), t.appendChild(r);
		var i = document.createElementNS(n$9.svgNS, "path");
		return i.setAttribute("d", "M1280 576v128q0 26 -19 45t-45 19h-896q-26 0 -45 -19t-19 -45v-128q0 -26 19 -45t45 -19h896q26 0 45 19t19 45zM1536 1120v-960q0 -119 -84.5 -203.5t-203.5 -84.5h-960q-119 0 -203.5 84.5t-84.5 203.5v960q0 119 84.5 203.5t203.5 84.5h960q119 0 203.5 -84.5 t84.5 -203.5z"), i.setAttribute("class", "svg-pan-zoom-control-element"), t.appendChild(i), t;
	},
	disable: function(e) {
		e.controlIcons && (e.controlIcons.parentNode.removeChild(e.controlIcons), e.controlIcons = null);
	}
};
var i$12 = function(e, t) {
	this.init(e, t);
};
i$12.prototype.init = function(t, n) {
	this.viewport = t, this.options = n, this.originalState = {
		zoom: 1,
		x: 0,
		y: 0
	}, this.activeState = {
		zoom: 1,
		x: 0,
		y: 0
	}, this.updateCTMCached = e$9.proxy(this.updateCTM, this), this.requestAnimationFrame = e$9.createRequestAnimationFrame(this.options.refreshRate), this.viewBox = {
		x: 0,
		y: 0,
		width: 0,
		height: 0
	}, this.cacheViewBox();
	var r = this.processCTM();
	this.setCTM(r), this.updateCTM();
}, i$12.prototype.cacheViewBox = function() {
	var e = this.options.svg.getAttribute("viewBox");
	if (e) {
		var t = e.split(/[\s\,]/).filter(function(e) {
			return e;
		}).map(parseFloat);
		this.viewBox.x = t[0], this.viewBox.y = t[1], this.viewBox.width = t[2], this.viewBox.height = t[3];
		var n = Math.min(this.options.width / this.viewBox.width, this.options.height / this.viewBox.height);
		this.activeState.zoom = isFinite(n) ? n : 1, this.activeState.x = (this.options.width - this.viewBox.width * n) / 2, this.activeState.y = (this.options.height - this.viewBox.height * n) / 2, this.updateCTMOnNextFrame(), this.options.svg.removeAttribute("viewBox");
	} else this.simpleViewBoxCache();
}, i$12.prototype.simpleViewBoxCache = function() {
	var e = this.viewport.getBBox();
	this.viewBox.x = e.x, this.viewBox.y = e.y, this.viewBox.width = e.width, this.viewBox.height = e.height;
}, i$12.prototype.getViewBox = function() {
	return e$9.extend({}, this.viewBox);
}, i$12.prototype.processCTM = function() {
	var e = this.getCTM();
	if (this.options.fit || this.options.contain) {
		var t = this.options.fit ? Math.min(this.options.width / this.viewBox.width, this.options.height / this.viewBox.height) : Math.max(this.options.width / this.viewBox.width, this.options.height / this.viewBox.height);
		t = isFinite(t) ? t : 1, e.a = t, e.d = t, e.e = -this.viewBox.x * t, e.f = -this.viewBox.y * t;
	}
	if (this.options.center) {
		var n = (this.options.width - (this.viewBox.width + this.viewBox.x * 2) * e.a) * .5, r = (this.options.height - (this.viewBox.height + this.viewBox.y * 2) * e.a) * .5;
		e.e = n, e.f = r;
	}
	return this.originalState.zoom = e.a, this.originalState.x = e.e, this.originalState.y = e.f, e;
}, i$12.prototype.getOriginalState = function() {
	return e$9.extend({}, this.originalState);
}, i$12.prototype.getState = function() {
	return e$9.extend({}, this.activeState);
}, i$12.prototype.getZoom = function() {
	return this.activeState.zoom;
}, i$12.prototype.getRelativeZoom = function() {
	return this.activeState.zoom / this.originalState.zoom;
}, i$12.prototype.computeRelativeZoom = function(e) {
	return e / this.originalState.zoom;
}, i$12.prototype.getPan = function() {
	return {
		x: this.activeState.x,
		y: this.activeState.y
	};
}, i$12.prototype.getCTM = function() {
	var e = this.options.svg.createSVGMatrix();
	return e.a = this.activeState.zoom, e.b = 0, e.c = 0, e.d = this.activeState.zoom, e.e = this.activeState.x, e.f = this.activeState.y, e;
}, i$12.prototype.setCTM = function(t) {
	var n = this.isZoomDifferent(t), r = this.isPanDifferent(t);
	if (n || r) {
		if (n && (this.options.beforeZoom(this.getRelativeZoom(), this.computeRelativeZoom(t.a)) === !1 ? (t.a = t.d = this.activeState.zoom, n = !1) : (this.updateCache(t), this.options.onZoom(this.getRelativeZoom()))), r) {
			var i = this.options.beforePan(this.getPan(), {
				x: t.e,
				y: t.f
			}), a = !1, o = !1;
			i === !1 ? (t.e = this.getPan().x, t.f = this.getPan().y, a = o = !0) : e$9.isObject(i) && (i.x === !1 ? (t.e = this.getPan().x, a = !0) : e$9.isNumber(i.x) && (t.e = i.x), i.y === !1 ? (t.f = this.getPan().y, o = !0) : e$9.isNumber(i.y) && (t.f = i.y)), a && o || !this.isPanDifferent(t) ? r = !1 : (this.updateCache(t), this.options.onPan(this.getPan()));
		}
		(n || r) && this.updateCTMOnNextFrame();
	}
}, i$12.prototype.isZoomDifferent = function(e) {
	return this.activeState.zoom !== e.a;
}, i$12.prototype.isPanDifferent = function(e) {
	return this.activeState.x !== e.e || this.activeState.y !== e.f;
}, i$12.prototype.updateCache = function(e) {
	this.activeState.zoom = e.a, this.activeState.x = e.e, this.activeState.y = e.f;
}, i$12.prototype.pendingUpdate = !1, i$12.prototype.updateCTMOnNextFrame = function() {
	this.pendingUpdate || (this.pendingUpdate = !0, this.requestAnimationFrame.call(window, this.updateCTMCached));
}, i$12.prototype.updateCTM = function() {
	var e = this.getCTM();
	n$9.setCTM(this.viewport, e), this.pendingUpdate = !1, this.options.onUpdatedCTM && this.options.onUpdatedCTM(e);
};
function a$11(e, t) {
	return new i$12(e, t);
}
var o$10 = function(e, t) {
	this.init(e, t);
};
var s$12 = {
	viewportSelector: ".svg-pan-zoom_viewport",
	panEnabled: !0,
	controlIconsEnabled: !1,
	zoomEnabled: !0,
	dblClickZoomEnabled: !0,
	mouseWheelZoomEnabled: !0,
	preventMouseEventsDefault: !0,
	zoomScaleSensitivity: .1,
	minZoom: .5,
	maxZoom: 10,
	fit: !0,
	contain: !1,
	center: !0,
	refreshRate: "auto",
	beforeZoom: null,
	onZoom: null,
	beforePan: null,
	onPan: null,
	customEventsHandler: null,
	eventsListenerElement: null,
	onUpdatedCTM: null
};
var c$14 = { passive: !0 };
var l$13 = { passive: !1 };
o$10.prototype.init = function(t, i) {
	var o = this;
	this.svg = t, n$9.setupSvgAttributes(this.svg), this.options = e$9.extend(e$9.extend({}, s$12), i), this.state = "none";
	var c = n$9.getBoundingClientRectNormalized(t);
	this.width = c.width, this.height = c.height, this.viewport = a$11(n$9.getOrCreateViewport(this.svg, this.options.viewportSelector), {
		svg: this.svg,
		width: this.width,
		height: this.height,
		fit: this.options.fit,
		contain: this.options.contain,
		center: this.options.center,
		refreshRate: this.options.refreshRate,
		beforeZoom: function(e, t) {
			if (o.viewport && o.options.beforeZoom) return o.options.beforeZoom(e, t);
		},
		onZoom: function(e) {
			if (o.viewport && o.options.onZoom) return o.options.onZoom(e);
		},
		beforePan: function(e, t) {
			if (o.viewport && o.options.beforePan) return o.options.beforePan(e, t);
		},
		onPan: function(e) {
			if (o.viewport && o.options.onPan) return o.options.onPan(e);
		},
		onUpdatedCTM: function(e) {
			if (o.viewport && o.options.onUpdatedCTM) return o.options.onUpdatedCTM(e);
		}
	});
	var l = this.getPublicInstance();
	l.setBeforeZoom(this.options.beforeZoom), l.setOnZoom(this.options.onZoom), l.setBeforePan(this.options.beforePan), l.setOnPan(this.options.onPan), l.setOnUpdatedCTM(this.options.onUpdatedCTM), this.options.controlIconsEnabled && r$10.enable(this), this.lastMouseWheelEventTime = Date.now(), this.setupHandlers();
}, o$10.prototype.setupHandlers = function() {
	var e = this, t = null;
	if (this.eventListeners = {
		pointerdown: function(n) {
			if (n.pointerType !== "touch") {
				var r = e.handleMouseDown(n, t);
				return t = n, r;
			}
		},
		touchstart: function(n) {
			var r = e.handleTouchStart(n, t);
			return t = n, r;
		},
		pointerup: function(t) {
			if (t.pointerType !== "touch") return e.handleMouseUp(t);
		},
		touchend: function(t) {
			return e.handleTouchEnd(t);
		},
		pointermove: function(t) {
			if (t.pointerType !== "touch") return e.handleMouseMove(t);
		},
		touchmove: function(t) {
			return e.handleTouchMove(t);
		},
		pointerleave: function(t) {
			if (t.pointerType !== "touch") return e.handleMouseUp(t);
		},
		pointercancel: function(t) {
			if (t.pointerType !== "touch") return e.handleMouseUp(t);
		},
		touchleave: function(t) {
			return e.handleTouchEnd(t);
		},
		touchcancel: function(t) {
			return e.handleTouchEnd(t);
		}
	}, this.options.customEventsHandler != null) {
		this.options.customEventsHandler.init({
			svgElement: this.svg,
			eventsListenerElement: this.options.eventsListenerElement,
			instance: this.getPublicInstance()
		});
		var n = this.options.customEventsHandler.haltEventListeners;
		if (n && n.length) for (var r = n.length - 1; r >= 0; r--) this.eventListeners.hasOwnProperty(n[r]) && delete this.eventListeners[n[r]];
	}
	for (var i in this.eventListeners) (this.options.eventsListenerElement || this.svg).addEventListener(i, this.eventListeners[i], this.options.preventMouseEventsDefault ? l$13 : c$14);
	this.options.mouseWheelZoomEnabled && (this.options.mouseWheelZoomEnabled = !1, this.enableMouseWheelZoom());
}, o$10.prototype.enableMouseWheelZoom = function() {
	if (!this.options.mouseWheelZoomEnabled) {
		var e = this;
		this.wheelListener = function(t) {
			return e.handleMouseWheel(t);
		};
		var t = !this.options.preventMouseEventsDefault;
		(this.options.eventsListenerElement || this.svg).addEventListener("wheel", this.wheelListener, { passive: t }), this.options.mouseWheelZoomEnabled = !0;
	}
}, o$10.prototype.disableMouseWheelZoom = function() {
	this.options.mouseWheelZoomEnabled && ((this.options.eventsListenerElement || this.svg).removeEventListener("wheel", this.wheelListener), this.options.mouseWheelZoomEnabled = !1);
}, o$10.prototype.handleMouseWheel = function(e) {
	if (this.options.zoomEnabled && this.state === "none") {
		this.options.preventMouseEventsDefault && e.preventDefault();
		var t = e.deltaY || 0, r = Date.now() - this.lastMouseWheelEventTime, i = 3 + Math.max(0, 30 - r);
		this.lastMouseWheelEventTime = Date.now(), e.deltaMode === 0 && e.wheelDelta && (t = e.deltaY === 0 ? 0 : Math.abs(e.wheelDelta) / e.deltaY), t = -.3 < t && t < .3 ? t : (t > 0 ? 1 : -1) * Math.log(Math.abs(t) + 10) / i;
		var a = this.svg.getScreenCTM().inverse(), o = n$9.getEventPoint(e, this.svg).matrixTransform(a), s = (1 + this.options.zoomScaleSensitivity) ** (-1 * t);
		this.zoomAtPoint(s, o);
	}
}, o$10.prototype.zoomAtPoint = function(e, t, n) {
	var r = this.viewport.getOriginalState();
	n ? (e = Math.max(this.options.minZoom * r.zoom, Math.min(this.options.maxZoom * r.zoom, e)), e /= this.getZoom()) : this.getZoom() * e < this.options.minZoom * r.zoom ? e = this.options.minZoom * r.zoom / this.getZoom() : this.getZoom() * e > this.options.maxZoom * r.zoom && (e = this.options.maxZoom * r.zoom / this.getZoom());
	var i = this.viewport.getCTM(), a = t.matrixTransform(i.inverse()), o = this.svg.createSVGMatrix().translate(a.x, a.y).scale(e).translate(-a.x, -a.y), s = i.multiply(o);
	s.a !== i.a && this.viewport.setCTM(s);
}, o$10.prototype.zoom = function(e, t) {
	this.zoomAtPoint(e, n$9.getSvgCenterPoint(this.svg, this.width, this.height), t);
}, o$10.prototype.publicZoom = function(e, t) {
	t && (e = this.computeFromRelativeZoom(e)), this.zoom(e, t);
}, o$10.prototype.publicZoomAtPoint = function(t, r, i) {
	if (i && (t = this.computeFromRelativeZoom(t)), e$9.getType(r) !== "SVGPoint") {
		if ("x" in r && "y" in r) r = n$9.createSVGPoint(this.svg, r.x, r.y);
		else throw Error("Given point is invalid");
	}
	this.zoomAtPoint(t, r, i);
}, o$10.prototype.getZoom = function() {
	return this.viewport.getZoom();
}, o$10.prototype.getRelativeZoom = function() {
	return this.viewport.getRelativeZoom();
}, o$10.prototype.computeFromRelativeZoom = function(e) {
	return e * this.viewport.getOriginalState().zoom;
}, o$10.prototype.resetZoom = function() {
	var e = this.viewport.getOriginalState();
	this.zoom(e.zoom, !0);
}, o$10.prototype.resetPan = function() {
	this.pan(this.viewport.getOriginalState());
}, o$10.prototype.reset = function() {
	this.resetZoom(), this.resetPan();
}, o$10.prototype.handleDblClick = function(e) {
	if (this.options.preventMouseEventsDefault && e.preventDefault(), this.options.controlIconsEnabled && (e.target.getAttribute("class") || "").indexOf("svg-pan-zoom-control") > -1) return !1;
	var t = e.shiftKey ? 1 / ((1 + this.options.zoomScaleSensitivity) * 2) : (1 + this.options.zoomScaleSensitivity) * 2, r = n$9.getEventPoint(e, this.svg).matrixTransform(this.svg.getScreenCTM().inverse());
	this.zoomAtPoint(t, r);
}, o$10.prototype.handleMouseDown = function(t, r) {
	this.options.preventMouseEventsDefault && t.preventDefault(), e$9.mouseAndTouchNormalize(t, this.svg), this.options.dblClickZoomEnabled && e$9.isDblClick(t, r) ? this.handleDblClick(t) : (this.state = "pan", this.firstEventCTM = this.viewport.getCTM(), this.stateOrigin = n$9.getEventPoint(t, this.svg).matrixTransform(this.firstEventCTM.inverse()));
}, o$10.prototype.handleMouseMove = function(e) {
	if (this.options.preventMouseEventsDefault && e.preventDefault(), this.state === "pan" && this.options.panEnabled) {
		var t = n$9.getEventPoint(e, this.svg).matrixTransform(this.firstEventCTM.inverse()), r = this.firstEventCTM.translate(t.x - this.stateOrigin.x, t.y - this.stateOrigin.y);
		this.viewport.setCTM(r);
	}
}, o$10.prototype.handleMouseUp = function(e) {
	this.options.preventMouseEventsDefault && e.preventDefault(), this.state === "pan" && (this.state = "none");
}, o$10.prototype.handleTouchStart = function(t, r) {
	if (t.touches.length == 1) this.handleMouseDown(t, r);
	else {
		this.options.preventMouseEventsDefault && t.preventDefault(), this.firstEventCTM = this.viewport.getCTM();
		var i = n$9.getTouchPoint(t, this.svg, 0), a = n$9.getTouchPoint(t, this.svg, 1);
		this.firstDistance = e$9.calculateDistance(i, a), i.x = (i.x + a.x) / 2, i.y = (i.y + a.y) / 2, this.stateOrigin = i.matrixTransform(this.firstEventCTM.inverse()), this.firstZoomLevel = this.getZoom();
	}
}, o$10.prototype.handleTouchMove = function(t) {
	if (t.touches.length == 1) this.handleMouseMove(t);
	else {
		if (this.options.preventMouseEventsDefault && t.preventDefault(), !this.options.panEnabled && !this.options.zoomEnabled) return;
		var r = n$9.getTouchPoint(t, this.svg, 0), i = n$9.getTouchPoint(t, this.svg, 1), a = this.svg.createSVGPoint();
		if (a.x = (r.x + i.x) / 2, a.y = (r.y + i.y) / 2, this.state === "pan" && this.options.panEnabled) {
			var o = a.matrixTransform(this.firstEventCTM.inverse()), s = this.firstEventCTM.translate(o.x - this.stateOrigin.x, o.y - this.stateOrigin.y);
			this.viewport.setCTM(s);
		}
		if (this.options.zoomEnabled) {
			var c = e$9.calculateDistance(r, i) / this.firstDistance, l = this.svg.getScreenCTM().inverse(), u = a.matrixTransform(l);
			this.zoomAtPoint(this.firstZoomLevel * c, u, !0);
		}
	}
}, o$10.prototype.handleTouchEnd = function(t) {
	if (t.touches.length == 0) this.handleMouseUp(t);
	else if (this.options.preventMouseEventsDefault && t.preventDefault(), this.firstEventCTM = this.viewport.getCTM(), t.touches.length == 1) this.stateOrigin = n$9.getEventPoint(t, this.svg).matrixTransform(this.firstEventCTM.inverse());
	else {
		var r = n$9.getTouchPoint(t, this.svg, 0), i = n$9.getTouchPoint(t, this.svg, 1);
		this.firstDistance = e$9.calculateDistance(r, i), r.x = (r.x + i.x) / 2, r.y = (r.y + i.y) / 2, this.stateOrigin = r.matrixTransform(this.firstEventCTM.inverse());
	}
}, o$10.prototype.fit = function() {
	var e = this.viewport.getViewBox(), t = Math.min(this.width / e.width, this.height / e.height);
	this.zoom(t, !0);
}, o$10.prototype.contain = function() {
	var e = this.viewport.getViewBox(), t = Math.max(this.width / e.width, this.height / e.height);
	this.zoom(t, !0);
}, o$10.prototype.center = function() {
	var e = this.viewport.getViewBox(), t = (this.width - (e.width + e.x * 2) * this.getZoom()) * .5, n = (this.height - (e.height + e.y * 2) * this.getZoom()) * .5;
	this.getPublicInstance().pan({
		x: t,
		y: n
	});
}, o$10.prototype.updateBBox = function() {
	this.viewport.simpleViewBoxCache();
}, o$10.prototype.pan = function(e) {
	var t = this.viewport.getCTM();
	t.e = e.x, t.f = e.y, this.viewport.setCTM(t);
}, o$10.prototype.panBy = function(e) {
	var t = this.viewport.getCTM();
	t.e += e.x, t.f += e.y, this.viewport.setCTM(t);
}, o$10.prototype.getPan = function() {
	var e = this.viewport.getState();
	return {
		x: e.x,
		y: e.y
	};
}, o$10.prototype.resize = function() {
	var e = n$9.getBoundingClientRectNormalized(this.svg);
	this.width = e.width, this.height = e.height;
	var t = this.viewport;
	t.options.width = this.width, t.options.height = this.height, t.processCTM(), this.options.controlIconsEnabled && (this.getPublicInstance().disableControlIcons(), this.getPublicInstance().enableControlIcons());
}, o$10.prototype.destroy = function() {
	var e = this;
	for (var t in this.beforeZoom = null, this.onZoom = null, this.beforePan = null, this.onPan = null, this.onUpdatedCTM = null, this.options.customEventsHandler != null && this.options.customEventsHandler.destroy({
		svgElement: this.svg,
		eventsListenerElement: this.options.eventsListenerElement,
		instance: this.getPublicInstance()
	}), this.eventListeners) (this.options.eventsListenerElement || this.svg).removeEventListener(t, this.eventListeners[t], this.options.preventMouseEventsDefault ? l$13 : c$14);
	this.disableMouseWheelZoom(), this.getPublicInstance().disableControlIcons(), u$18 = u$18.filter(function(t) {
		return t.svg !== e.svg;
	}), delete this.options, delete this.viewport, delete this.publicInstance, delete this.pi, this.getPublicInstance = function() {
		return null;
	};
}, o$10.prototype.getPublicInstance = function() {
	var t = this;
	return this.publicInstance || (this.publicInstance = this.pi = {
		enablePan: function() {
			return t.options.panEnabled = !0, t.pi;
		},
		disablePan: function() {
			return t.options.panEnabled = !1, t.pi;
		},
		isPanEnabled: function() {
			return !!t.options.panEnabled;
		},
		pan: function(e) {
			return t.pan(e), t.pi;
		},
		panBy: function(e) {
			return t.panBy(e), t.pi;
		},
		getPan: function() {
			return t.getPan();
		},
		setBeforePan: function(n) {
			return t.options.beforePan = n === null ? null : e$9.proxy(n, t.publicInstance), t.pi;
		},
		setOnPan: function(n) {
			return t.options.onPan = n === null ? null : e$9.proxy(n, t.publicInstance), t.pi;
		},
		enableZoom: function() {
			return t.options.zoomEnabled = !0, t.pi;
		},
		disableZoom: function() {
			return t.options.zoomEnabled = !1, t.pi;
		},
		isZoomEnabled: function() {
			return !!t.options.zoomEnabled;
		},
		enableControlIcons: function() {
			return t.options.controlIconsEnabled || (t.options.controlIconsEnabled = !0, r$10.enable(t)), t.pi;
		},
		disableControlIcons: function() {
			return t.options.controlIconsEnabled && (t.options.controlIconsEnabled = !1, r$10.disable(t)), t.pi;
		},
		isControlIconsEnabled: function() {
			return !!t.options.controlIconsEnabled;
		},
		enableDblClickZoom: function() {
			return t.options.dblClickZoomEnabled = !0, t.pi;
		},
		disableDblClickZoom: function() {
			return t.options.dblClickZoomEnabled = !1, t.pi;
		},
		isDblClickZoomEnabled: function() {
			return !!t.options.dblClickZoomEnabled;
		},
		enableMouseWheelZoom: function() {
			return t.enableMouseWheelZoom(), t.pi;
		},
		disableMouseWheelZoom: function() {
			return t.disableMouseWheelZoom(), t.pi;
		},
		isMouseWheelZoomEnabled: function() {
			return !!t.options.mouseWheelZoomEnabled;
		},
		setZoomScaleSensitivity: function(e) {
			return t.options.zoomScaleSensitivity = e, t.pi;
		},
		setMinZoom: function(e) {
			return t.options.minZoom = e, t.pi;
		},
		setMaxZoom: function(e) {
			return t.options.maxZoom = e, t.pi;
		},
		setBeforeZoom: function(n) {
			return t.options.beforeZoom = n === null ? null : e$9.proxy(n, t.publicInstance), t.pi;
		},
		setOnZoom: function(n) {
			return t.options.onZoom = n === null ? null : e$9.proxy(n, t.publicInstance), t.pi;
		},
		zoom: function(e) {
			return t.publicZoom(e, !0), t.pi;
		},
		zoomBy: function(e) {
			return t.publicZoom(e, !1), t.pi;
		},
		zoomAtPoint: function(e, n) {
			return t.publicZoomAtPoint(e, n, !0), t.pi;
		},
		zoomAtPointBy: function(e, n) {
			return t.publicZoomAtPoint(e, n, !1), t.pi;
		},
		zoomIn: function() {
			return this.zoomBy(1 + t.options.zoomScaleSensitivity), t.pi;
		},
		zoomOut: function() {
			return this.zoomBy(1 / (1 + t.options.zoomScaleSensitivity)), t.pi;
		},
		getZoom: function() {
			return t.getRelativeZoom();
		},
		setOnUpdatedCTM: function(n) {
			return t.options.onUpdatedCTM = n === null ? null : e$9.proxy(n, t.publicInstance), t.pi;
		},
		resetZoom: function() {
			return t.resetZoom(), t.pi;
		},
		resetPan: function() {
			return t.resetPan(), t.pi;
		},
		reset: function() {
			return t.reset(), t.pi;
		},
		fit: function() {
			return t.fit(), t.pi;
		},
		contain: function() {
			return t.contain(), t.pi;
		},
		center: function() {
			return t.center(), t.pi;
		},
		updateBBox: function() {
			return t.updateBBox(), t.pi;
		},
		resize: function() {
			return t.resize(), t.pi;
		},
		getSizes: function() {
			return {
				width: t.width,
				height: t.height,
				realZoom: t.getZoom(),
				viewBox: t.viewport.getViewBox()
			};
		},
		destroy: function() {
			return t.destroy(), t.pi;
		}
	}), this.publicInstance;
};
var u$18 = [];
var d$12 = function(t, n) {
	var r = e$9.getSvg(t);
	if (r === null) return null;
	for (var i = u$18.length - 1; i >= 0; i--) if (u$18[i].svg === r) return u$18[i].instance.getPublicInstance();
	return u$18.push({
		svg: r,
		instance: new o$10(r, n)
	}), u$18[u$18.length - 1].instance.getPublicInstance();
};
// ../DnD helper/node_modules/v-network-graph/lib/modules/svg-pan-zoom-ex.js
var t$48 = {
	getViewArea() {
		let e = this.getSizes(), t = this.getPan(), n = e.realZoom;
		t.x /= n, t.y /= n;
		let r = {
			width: e.width / n,
			height: e.height / n
		};
		return {
			box: {
				top: -t.y,
				bottom: r.height - t.y,
				left: -t.x,
				right: r.width - t.x
			},
			center: {
				x: r.width / 2 - t.x,
				y: r.height / 2 - t.y
			}
		};
	},
	getViewBox() {
		return this.getViewArea().box;
	},
	setViewBox(e) {
		let t = e.right - e.left, n = e.bottom - e.top, { width: r, height: i } = this.getSizes(), a = t / n, o = r / i, s = a < o ? n * o : t, c = a > o ? t / o : n, l = Math.min(r / s, i / c), u = this.getRealZoom() / this.getZoom();
		this.zoom(l / u);
		let d = {
			x: (e.left + t / 2) * l,
			y: (e.top + n / 2) * l
		};
		this.pan({
			x: -d.x + s / 2 * l,
			y: -d.y + c / 2 * l
		});
	},
	getRealZoom() {
		return this.getSizes().realZoom;
	},
	applyAbsoluteZoomLevel(e, t, n) {
		let r = Math.max(1e-4, t), i = Math.max(r, n), a = Math.max(Math.min(i, e), r), o = this.getRealZoom() / this.getZoom();
		this.setMinZoom(r / o).setMaxZoom(i / o).zoom(a / o);
	},
	isPanEnabled() {
		return this._isPanEnabled;
	},
	enablePan() {
		return this._isPanEnabled = !0, this._internalEnablePan(), this;
	},
	disablePan() {
		return this._isPanEnabled = !1, this._internalDisablePan(), this;
	},
	isZoomEnabled() {
		return this._isZoomEnabled;
	},
	enableZoom() {
		return this._isZoomEnabled = !0, this._internalEnableZoom(), this;
	},
	disableZoom() {
		return this._isZoomEnabled = !1, this._internalDisableZoom(), this;
	},
	setPanEnabled(e) {
		return e ? this.enablePan() : this.disablePan(), this;
	},
	setZoomEnabled(e) {
		return e ? (this.enableZoom(), this.enableDblClickZoom()) : (this.disableZoom(), this.disableDblClickZoom()), this;
	}
};
function n$8(e, n) {
	let r = e;
	return r._isPanEnabled = n.panEnabled ?? !0, r._isZoomEnabled = n?.zoomEnabled ?? !0, r._internalIsPanEnabled = r.isPanEnabled, r._internalEnablePan = r.enablePan, r._internalDisablePan = r.disablePan, r._internalIsZoomEnabled = r.isZoomEnabled, r._internalEnableZoom = r.enableZoom, r._internalDisableZoom = r.disableZoom, Object.assign(e, t$48), r;
}
function r$9(t, r) {
	let i = r.customEventsHandler?.init ?? ((e) => {}), a = r.customEventsHandler?.destroy ?? ((e) => {}), o = r.customEventsHandler?.haltEventListeners ?? [];
	return r.mouseWheelZoomEnabled === void 0 && (r.mouseWheelZoomEnabled = r.zoomEnabled), r.customEventsHandler = {
		init: (e) => {
			n$8(e.instance, r), i(e);
		},
		destroy: (e) => a(e),
		haltEventListeners: o
	}, d$12(t, r);
}
// ../DnD helper/node_modules/v-network-graph/lib/composables/svg-pan-zoom.js
function a$10(a, o) {
	let s = ref(), c = 0, l = [], u = [], d = () => {
		c = 1, l.forEach((e) => e()), l.length = 0;
	}, f = () => {
		c = 2, u.forEach((e) => e()), u.length = 0;
	};
	return onMounted(() => {
		let n = r$17(a.value, "<svg>"), r = o.customEventsHandler?.init ?? ((e) => {}), i = o.customEventsHandler?.destroy ?? ((e) => {});
		o.customEventsHandler = {
			init: (e) => {
				s.value = e.instance, r(e), d();
			},
			destroy: (e) => {
				f(), i(e);
			},
			haltEventListeners: o.customEventsHandler?.haltEventListeners ?? []
		};
		let c = () => {
			let e = n.getBoundingClientRect();
			e.width !== 0 && e.height !== 0 ? r$9(n, o) : setTimeout(c, 200);
		};
		c();
	}), onUnmounted(() => {
		s.value?.destroy(), s.value = void 0;
	}), {
		svgPanZoom: s,
		onSvgPanZoomMounted: (e) => {
			c === 0 ? l.push(e) : c === 1 && e();
		},
		onSvgPanZoomUnmounted: (e) => {
			c === 0 || c === 1 ? u.push(e) : e();
		}
	};
}
// ../DnD helper/node_modules/v-network-graph/lib/composables/canvas.js
var s$11 = /* @__PURE__ */ function(e) {
	return e[e.INITIAL = 0] = "INITIAL", e[e.LOADED = 1] = "LOADED", e[e.UNLOADED = 2] = "UNLOADED", e;
}({});
function c$13(s, c, p, m) {
	let h = ref(), g = ref(), _ = ref(), v = ref(0), y = computed(() => v.value !== 0), { svgPanZoom: b, onSvgPanZoomMounted: x, onSvgPanZoomUnmounted: S } = a$10(g, {
		viewportSelector: ".v-ng-viewport",
		minZoom: p.view.minZoomLevel,
		maxZoom: p.view.maxZoomLevel,
		dblClickZoomEnabled: u$17(p.view),
		mouseWheelZoomEnabled: d$11(p.view),
		fit: p.view.autoPanAndZoomOnLoad === "fit-content",
		center: p.view.autoPanAndZoomOnLoad !== !1,
		zoomEnabled: p.view.zoomEnabled,
		preventMouseEventsDefault: !1,
		onZoom: (e) => {
			if (v.value === 2) return;
			let t = b.value?.getRealZoom() ?? 1;
			Math.abs(s.value - t) >= 1e-6 && (s.value = t, m.emit("view:zoom", t));
		},
		panEnabled: p.view.panEnabled,
		onPan: (e) => {
			v.value !== 2 && m.emit("view:pan", e);
		}
	});
	i$13({
		container: h,
		svg: g,
		viewport: _,
		svgPanZoom: b
	});
	let C = {
		width: 0,
		height: 0
	}, w = globalThis.ResizeObserver ? new ResizeObserver(() => {
		if (b.value?.resize(), !p.view.autoPanOnResize) return;
		let e = h.value?.getBoundingClientRect();
		if (e) {
			let t = -(C.width - e.width) / 2, n = -(C.height - e.height) / 2;
			b.value?.panBy({
				x: t,
				y: n
			});
			let { width: r, height: i } = e;
			(C.width !== r || C.height !== i) && (Object.assign(C, {
				width: r,
				height: i
			}), m.emit("view:resize", {
				x: e.x,
				y: e.y,
				width: r,
				height: i
			}));
		}
	}) : void 0;
	x(() => {
		let t = r$17(h.value, "svg-pan-zoom container");
		w?.observe(t), p.view.onSvgPanZoomInitialized?.(r$17(b.value, "svg-pan-zoom instance"));
		let { width: n, height: r } = t.getBoundingClientRect();
		Object.assign(C, {
			width: n,
			height: r
		}), _.value?.addEventListener("touchstart", f$10, { passive: !1 });
	}), S(() => {
		w?.disconnect(), _.value?.removeEventListener("touchstart", f$10);
	});
	let T = (e) => {
		b.value?.applyAbsoluteZoomLevel(e, p.view.minZoomLevel, p.view.maxZoomLevel);
	};
	watch(() => p.view.panEnabled, (e) => {
		b.value?.setPanEnabled(e);
	}), watch(() => [
		p.view.zoomEnabled,
		u$17(p.view),
		d$11(p.view)
	], () => {
		let e = b.value;
		e && l$12(e, p.view.zoomEnabled, p.view.doubleClickZoomEnabled, p.view.mouseWheelZoomEnabled);
	}), watch(s, (e) => T(e)), watch(() => [p.view.minZoomLevel, p.view.maxZoomLevel], (e) => {
		T(s.value);
	});
	let { scale: E } = a$15(s, p.view);
	return x(() => {
		T(c());
	}), {
		container: h,
		svg: g,
		viewport: _,
		state: v,
		show: y,
		svgPanZoom: b,
		onSvgPanZoomMounted: x,
		onSvgPanZoomUnmounted: S,
		applyAbsoluteZoomLevel: T,
		scale: E
	};
}
function l$12(e, t, n, r) {
	e.setZoomEnabled(t), t && n ? e.enableDblClickZoom() : e.disableDblClickZoom(), t && r ? e.enableMouseWheelZoom() : e.disableMouseWheelZoom();
}
function u$17(e) {
	return e.zoomEnabled && e.doubleClickZoomEnabled;
}
function d$11(e) {
	return e.zoomEnabled && e.mouseWheelZoomEnabled;
}
function f$10(e) {
	e.stopPropagation();
}
// ../DnD helper/node_modules/v-network-graph/lib/composables/config.js
var l$11 = Symbol("style");
function u$16(e, t) {
	return isPlainObject(e) ? merge(e, t) : t;
}
function d$10(e, n = a$23) {
	let o = reactive(n()), s = Object.keys(o);
	for (let t of s) watch(() => e.value[t], () => {
		mergeWith(o[t], e.value[t] || {}, u$16);
	}, {
		immediate: !0,
		deep: !0
	});
	return provide(l$11, o), o;
}
function f$9(t) {
	return r$17(inject(l$11), `Configs(${t})`)[t];
}
function p$5() {
	return f$9("view");
}
function m$4() {
	return f$9("node");
}
function h$5() {
	return f$9("edge");
}
function g$3() {
	return f$9("path");
}
// ../DnD helper/node_modules/v-network-graph/lib/composables/currentPositions.js
var c$12 = Symbol("currentPositions");
function l$10(e) {
	let n, l = /* @__PURE__ */ new Set(), u = /* @__PURE__ */ new Set(), d = /* @__PURE__ */ new Set(), f = shallowRef();
	watch(f, () => {
		let e = d;
		d = /* @__PURE__ */ new Set(), u.forEach((t) => t(e));
	});
	let p = (r) => n?.(r) ?? n$13(toRaw(e).nodes, r), m = {
		of: p,
		all: () => {
			let t = toRaw(e).nodes;
			return n ? Object.fromEntries(Object.keys(t).map((e) => [e, {
				...t[e],
				...p(e)
			}])) : t;
		},
		onDrawn: (e) => (l.add(e), () => l.delete(e)),
		onMoved: (e) => (u.add(e), () => u.delete(e)),
		moved: (e) => {
			e.forEach((e) => d.add(e)), triggerRef(f);
		},
		drawAhead: (e) => {
			n = e, l.forEach((e) => e());
		},
		endAhead: () => n = void 0
	};
	return provide(c$12, m), m;
}
function u$15() {
	return r$17(inject(c$12), "CurrentPositions");
}
// ../DnD helper/node_modules/v-network-graph/lib/vendor/mitt/dist/mitt.js
function e$8(e) {
	return {
		all: e = e || /* @__PURE__ */ new Map(),
		on: function(t, n) {
			var r = e.get(t);
			r ? r.push(n) : e.set(t, [n]);
		},
		off: function(t, n) {
			var r = e.get(t);
			r && (n ? r.splice(r.indexOf(n) >>> 0, 1) : e.set(t, []));
		},
		emit: function(t, n) {
			var r = e.get(t);
			r && r.slice().map(function(e) {
				e(n);
			}), (r = e.get("*")) && r.slice().map(function(e) {
				e(t, n);
			});
		}
	};
}
// ../DnD helper/node_modules/v-network-graph/lib/composables/event-emitter.js
var i$11 = Symbol("emitter");
function a$9() {
	let e = e$8();
	return provide(i$11, e), e;
}
function o$9() {
	return r$17(inject(i$11), "event emitter");
}
// ../DnD helper/node_modules/v-network-graph/lib/modules/vue/nextTick.js
var t$47 = () => new Promise((t) => nextTick(t));
// ../DnD helper/node_modules/v-network-graph/lib/composables/graphLoading.js
function o$8(o, s, c, l, u, d) {
	let { state: f, onSvgPanZoomMounted: p, onSvgPanZoomUnmounted: m, svgPanZoom: h } = o, { updateBorderBox: g, fitToContents: _, panToCenter: v } = s;
	watch(() => l.view.layoutHandler, (e, t) => {
		t.deactivate(), e.activate(d());
	}), p(async () => {
		if (l.view.onBeforeInitialDisplay) {
			let e = l.view.onBeforeInitialDisplay();
			r$16(e) && await e;
		}
		let a = r$17(h.value, "svg-pan-zoom");
		l.view.layoutHandler.activate(d()), await t$47();
		let o = l.view.autoPanAndZoomOnLoad;
		if (l.view.fit || o !== !1) {
			let e = Object.keys(c.value).length == 0, t = a.getPan();
			if (e || o === "center-zero") {
				await g();
				let e = a.getSizes();
				a.pan({
					x: e.width / 2,
					y: e.height / 2
				});
			} else o === "fit-content" || l.view.fit ? await _() : o === "center-content" ? await v() : await g();
			nextTick(() => {
				let e = a.getPan();
				t.x === e.x && t.y === e.y && u.emit("view:pan", e);
			});
		} else await g();
		u.emit("view:load"), f.value = s$11.LOADED;
	}), m(() => {
		f.value = s$11.UNLOADED, u.emit("view:unload"), l.view.layoutHandler.deactivate();
	});
}
// ../DnD helper/node_modules/v-network-graph/lib/modules/collection/array.js
function e$7(e, t) {
	let n = e.indexOf(t);
	n >= 0 && e.splice(n, 1);
}
function t$46(e, t, n) {
	let r = e.indexOf(t);
	r < 0 || e.splice(r + 1, 0, n);
}
// ../DnD helper/node_modules/v-network-graph/lib/modules/collection/iterate.js
function e$6(e, t) {
	for (let n = 0; n < e.length - 1; n++) t(e[n], e[n + 1]);
}
// ../DnD helper/node_modules/v-network-graph/lib/composables/layer.js
var s$10 = [
	"edges",
	"edge-labels",
	"focusring",
	"nodes",
	"node-labels",
	"paths"
];
var c$11 = [
	"override-node",
	"override-node-label",
	"edge-overlay",
	"edge-label",
	"edges-label"
];
function l$9(e, c, l = s$10) {
	return computed(() => {
		let i = uniq(e.view.builtInLayerOrder).filter((e) => {
			let t = l.includes(e);
			return t || console.warn(`Layer ${e} is not a built-in layer.`), t;
		}).reverse(), s = [...l];
		e$6(i, (e, r) => {
			e$7(s, r), t$46(s, e, r);
		});
		let u = toValue(c);
		return u.includes("edge-label") || u.includes("edges-label") || e$7(s, "edge-labels"), e.node.focusring.visible || e$7(s, "focusring"), e.node.label.visible === !1 && e$7(s, "node-labels"), e.path.visible || e$7(s, "paths"), s;
	});
}
function u$14(t, n, r, o) {
	let s = computed(() => {
		let t = new Set(toValue(n));
		o.forEach((e) => t.delete(e));
		let i = Object.fromEntries(e.map((e) => [e, []]));
		return Object.assign(i, Object.entries(r()).reduce((e, [n, r]) => (o.includes(n) || (t.delete(n), r in e ? e[r].push(n) : e[r] = [n]), e), {})), i.root.push(...t), i;
	}), c = computed(() => t.view.grid.visible);
	return {
		layerDefs: s,
		isShowGrid: c,
		isShowBackgroundViewport: computed(() => {
			let e = s.value;
			return c.value || e.background.length > 0 || e.grid.length > 0;
		})
	};
}
// ../DnD helper/node_modules/v-network-graph/lib/composables/layout.js
var o$7 = Symbol("layouts");
function s$9(e) {
	provide(o$7, e);
}
function c$10() {
	return r$17(inject(o$7), "Layouts");
}
function l$8(t) {
	let n = n$16({ nodes: {} });
	return s$9(n), watch(() => toRaw(t()) === toRaw(n) ? void 0 : { ...t().nodes }, (e) => e && Object.assign(n.nodes, e), { immediate: !0 }), n;
}
// ../DnD helper/node_modules/v-network-graph/lib/utils/download.js
async function e$5(e) {
	let t = await fetch(e);
	if (!t.ok) throw Error(`HTTP ${t.status}`);
	let n = await t.blob();
	return new Promise((e, t) => {
		try {
			let r = new FileReader();
			r.onload = function() {
				e(this.result);
			}, r.onerror = () => t(r.error), r.readAsDataURL(n);
		} catch (e) {
			t(e);
		}
	});
}
// ../DnD helper/node_modules/v-network-graph/lib/utils/svg.js
function t$45(e, t, n) {
	let r = e.createSVGPoint();
	r.x = n.x, r.y = n.y;
	let i = r.matrixTransform(t.getCTM()?.inverse());
	return {
		x: i.x,
		y: i.y
	};
}
function n$7(e, t, n) {
	let r = e.createSVGPoint();
	r.x = n.x, r.y = n.y;
	let i = r.matrixTransform(t.getCTM());
	return {
		x: i.x,
		y: i.y
	};
}
function r$8(e, t, n) {
	let r = e.cloneNode(!0), i = t.getBBox(), a = 1 / n, o = {
		x: Math.floor((i.x - 10) * a),
		y: Math.floor((i.y - 10) * a),
		width: Math.ceil((i.width + 20) * a),
		height: Math.ceil((i.height + 20) * a)
	};
	r.setAttribute("width", o.width.toString()), r.setAttribute("height", o.height.toString());
	let s = r.querySelector(".v-ng-viewport");
	s.setAttribute("transform", `translate(${-o.x} ${-o.y}), scale(${a})`), s.removeAttribute("style"), s.removeAttribute("data-moving"), r.setAttribute("viewBox", `0 0 ${o.width} ${o.height}`), r.removeAttribute("style");
	let c = document.createNodeIterator(r, NodeFilter.SHOW_COMMENT);
	for (; c.nextNode();) {
		let e = c.referenceNode;
		e.parentNode?.removeChild(e);
	}
	return r;
}
async function i$10(t) {
	let n = !1, r = t.getAttribute("href");
	if (r || (n = !0, r = t.getAttribute("xlink:href")), r && !r.startsWith("data:")) try {
		let i = await e$5(r);
		t.setAttribute(n ? "xlink:href" : "href", i);
	} catch {
		console.warn("Image download failed.", r);
		return;
	}
}
async function a$8(e, t, n, a = {}) {
	let o = r$8(e, t, n);
	if (a.embedImages) {
		let e = Array.from(o.querySelectorAll("image")).map((e) => i$10(e));
		await Promise.all(e);
	}
	return o;
}
// ../DnD helper/node_modules/v-network-graph/lib/composables/mouse/boxSelection.js
function l$7(n, l, p, m, h$9, g) {
	let _ = computed(() => !!g.node.selectable && g.view.boxSelectionEnabled), v = computed(() => l.viewMode.value === "box-selection"), y = ref(), b = ref(), x = {
		pointers: /* @__PURE__ */ new Set(),
		points: /* @__PURE__ */ new Map(),
		startPoint: null,
		selectedNodesAtSelectStarted: /* @__PURE__ */ new Set(),
		selectionType: "append",
		options: {
			stopTrigger: "pointerup",
			selectionType: "append",
			selectionTypeWithShiftKey: "same"
		}
	}, S = debounce(() => {
		u$13(r$17(n.value, "container"), r$17(y.value, "viewport"), b, p, m, h$9, x.selectedNodesAtSelectStarted, x.selectionType);
	}, 50, { maxWait: 100 }), C = new d$9(n, T, E, D, w, O);
	function w(e) {
		if (x.options.stopTrigger !== "click" || x.pointers.size > 0) return;
		let n = {
			x: e.offsetX,
			y: e.offsetY
		};
		x.startPoint && h.fromObject(x.startPoint).distance(n) > 10 || M();
	}
	function T(e) {
		e.stopPropagation();
		let t = {
			x: e.offsetX,
			y: e.offsetY
		};
		x.pointers.size === 0 && (x.startPoint = t, C.activate(), x.selectedNodesAtSelectStarted.clear(), h$9.forEach((e) => x.selectedNodesAtSelectStarted.add(e)), x.options.selectionTypeWithShiftKey === "same" ? x.selectionType = x.options.selectionType : x.selectionType = e.shiftKey ? x.options.selectionTypeWithShiftKey : x.options.selectionType), x.pointers.has(e.pointerId) || x.pointers.add(e.pointerId), x.points.set(e.pointerId, t), k();
	}
	function E(t) {
		let r = r$17(n.value).getBoundingClientRect(), i = {
			x: t.x - r.x,
			y: t.y - r.y
		};
		x.points.set(t.pointerId, i), k(), S(), S.flush(), x.pointers.delete(t.pointerId), x.pointers.size === 1 ? x.startPoint = i : x.pointers.size === 0 && (C.deactivate(), x.options.stopTrigger === "pointerup" && M(), x.selectedNodesAtSelectStarted.clear()), k(), x.pointers.size > 0 && S();
	}
	function D(t) {
		let r = r$17(n.value).getBoundingClientRect(), i = {
			x: t.x - r.x,
			y: t.y - r.y
		};
		x.points.set(t.pointerId, i), k(), S();
	}
	function O(e) {
		e.key === "Escape" && x.options.stopTrigger !== "manual" && (e.stopPropagation(), M());
	}
	function k() {
		let e, t, n = Array.from(x.pointers);
		if (n.length >= 2) {
			let r = n[0], i = n[n.length - 1];
			e = x.points.get(r), t = x.points.get(i);
		} else if (x.startPoint && n.length === 1) {
			let r = n[0];
			e = x.startPoint, t = x.points.get(r);
		} else e = void 0, t = void 0;
		e && t ? (b.value = {
			pos: {
				x: Math.min(e.x, t.x),
				y: Math.min(e.y, t.y)
			},
			size: {
				width: Math.abs(t.x - e.x),
				height: Math.abs(t.y - e.y)
			}
		}, b.value.size.width === 0 && (b.value.size.width = 1), b.value.size.height === 0 && (b.value.size.height = 1)) : b.value && (b.value = void 0);
	}
	let A = new f$8(n, (e) => {
		_.value && g.view.selection.detector(e) && (j({
			stop: "manual",
			type: "append",
			withShiftKey: "invert"
		}), A.activate());
	}, (e) => {
		_.value && g.view.selection.detector(e) && (x.pointers.size === 0 ? M() : x.options.stopTrigger = "pointerup", A.deactivate());
	});
	watch(_, (e) => {
		e ? A.register() : A.unregister();
	}), onMounted(() => {
		y.value = n.value?.querySelector(".v-ng-viewport"), _.value && A.register();
	}), onUnmounted(() => {
		M(), _.value && A.unregister();
	});
	function j(e = {}) {
		x.options = {
			stopTrigger: e.stop ?? "pointerup",
			selectionType: e.type ?? "append",
			selectionTypeWithShiftKey: e.withShiftKey ?? "same"
		}, l.viewMode.value !== "box-selection" && (l.viewMode.value = "box-selection", x.pointers.clear(), C.register());
	}
	function M() {
		S.cancel(), l.viewMode.value === "box-selection" && (l.viewMode.value = "default", C.unregister());
	}
	return {
		isBoxSelectionMode: v,
		selectionBox: b,
		startBoxSelection: j,
		stopBoxSelection: M
	};
}
function u$13(e, t, r, i, a, o, s, c) {
	if (!r.value) return;
	let l = r.value, u = t$45(e, t, l.pos), d = t$45(e, t, {
		x: l.pos.x + l.size.width,
		y: l.pos.y + l.size.height
	}), f = new Set(Object.keys(a).filter((e) => {
		let t = i(e);
		return u.x <= t.x && t.x <= d.x && u.y <= t.y && t.y <= d.y;
	}));
	if (c === "append") o.forEach((e) => {
		f.has(e) || o.delete(e);
	}), f.forEach((e) => {
		let t = a[e]?.selectable ?? !1;
		(t === !0 || typeof t == "number" && o.size < t) && o.add(e);
	});
	else {
		let e = new Set(s);
		e.forEach((t) => {
			f.has(t) && e.delete(t);
		}), f.forEach((t) => {
			if (!s.has(t)) {
				let n = a[t]?.selectable ?? !1;
				(n === !0 || typeof n == "number" && e.size < n) && e.add(t);
			}
		}), o.clear(), e.forEach((e) => o.add(e));
	}
}
var d$9 = class {
	constructor(e, t, n, r, i, a) {
		this._container = e, this._handlePointerDownEvent = t, this._handlePointerUpEvent = n, this._handlePointerMoveEvent = r, this._handleClickEvent = i, this._handleKeyDownEvent = a, this._ignoreEvent = (e) => e.stopPropagation();
	}
	register() {
		let t = {
			capture: !0,
			passive: !1
		}, n = r$17(this._container.value, "container");
		n.addEventListener("pointerdown", this._handlePointerDownEvent, t), n.addEventListener("click", this._handleClickEvent, t), n.addEventListener("pointerenter", this._ignoreEvent, t), n.addEventListener("pointerleave", this._ignoreEvent, t), document.addEventListener("keydown", this._handleKeyDownEvent, t);
	}
	activate() {
		let e = {
			capture: !0,
			passive: !1
		};
		document.addEventListener("pointermove", this._handlePointerMoveEvent, e), document.addEventListener("pointerup", this._handlePointerUpEvent, e);
	}
	deactivate() {
		let e = { capture: !0 };
		document.removeEventListener("pointermove", this._handlePointerMoveEvent, e), document.removeEventListener("pointerup", this._handlePointerUpEvent, e);
	}
	unregister() {
		this.deactivate();
		let e = { capture: !0 };
		if (this._container.value) {
			let t = this._container.value;
			t.removeEventListener("pointerdown", this._handlePointerDownEvent, e), t.removeEventListener("click", this._handleClickEvent, e), t.removeEventListener("pointerenter", this._ignoreEvent, e), t.removeEventListener("pointerleave", this._ignoreEvent, e), document.removeEventListener("keydown", this._handleKeyDownEvent, e);
		}
	}
};
var f$8 = class {
	constructor(e, t, n) {
		this._container = e, this._handleKeyDownEvent = t, this._handleKeyUpEvent = n, this._preventDefault = (e) => {
			e.stopPropagation(), e.preventDefault();
		};
	}
	register() {
		document.addEventListener("keydown", this._handleKeyDownEvent, {
			capture: !0,
			passive: !0
		});
	}
	activate() {
		document.addEventListener("keyup", this._handleKeyUpEvent, {
			capture: !0,
			passive: !0
		}), r$17(this._container.value, "container").addEventListener("contextmenu", this._preventDefault, { passive: !1 });
	}
	deactivate() {
		document.removeEventListener("keyup", this._handleKeyUpEvent, { capture: !0 }), this._container.value && this._container.value.removeEventListener("contextmenu", this._preventDefault);
	}
	unregister() {
		this.deactivate(), document.removeEventListener("keydown", this._handleKeyDownEvent, { capture: !0 });
	}
};
// ../DnD helper/node_modules/v-network-graph/lib/composables/mouse/core.js
function e$4(e) {
	return e === "touch" ? 6 : 3;
}
function t$44(e, t, r, i) {
	let a = e.get(t);
	if (a) a.id !== r && (a = void 0);
	else {
		let t = Array.from(e.entries()).find(([e, t]) => t.id === r);
		if (t) {
			let [n, r] = t;
			e.delete(n), a = r;
		}
	}
	let o, s;
	return [a, o, s] = n$6(a, i, r), e.set(t, a), [o, s];
}
function n$6(e, t, n) {
	let r = Date.now();
	e && r - e.lastTime <= 500 ? (e.count++, e.lastTime = r) : e = {
		count: 1,
		lastTime: r,
		id: n
	};
	let i = {
		view: window,
		screenX: t.screenX,
		screenY: t.screenY,
		clientX: t.clientX,
		clientY: t.clientY,
		ctrlKey: t.ctrlKey,
		shiftKey: t.shiftKey,
		altKey: t.altKey,
		metaKey: t.metaKey,
		button: t.button,
		buttons: t.buttons,
		detail: e.count
	}, a, o;
	return t instanceof PointerEvent ? (Object.assign(i, {
		pointerId: t.pointerId,
		width: t.width,
		height: t.height,
		pressure: t.pressure,
		tangentialPressure: t.tangentialPressure,
		tiltX: t.tiltX,
		tiltY: t.tiltY,
		twist: t.twist,
		pointerType: t.pointerType,
		isPrimary: t.isPrimary
	}), a = new PointerEvent("click", i), e.count === 2 && (o = new PointerEvent("dblclick", i))) : (a = new MouseEvent("click", i), e.count === 2 && (o = new MouseEvent("dblclick", i))), [
		e,
		a,
		o
	];
}
function r$7(e) {
	let t = Date.now();
	Array.from(e.entries()).filter(([e, n]) => t - n.lastTime > 500).map(([t, n]) => e.delete(t));
}
// ../DnD helper/node_modules/v-network-graph/lib/composables/mouse/container.js
function o$6(o, s, c, l) {
	let u = {
		moveCounter: 0,
		pointerCounter: 0,
		clickState: void 0
	}, d = {
		pointermove: p,
		pointerup: m,
		pointercancel: m
	};
	function f(t) {
		u.moveCounter = 0, u.pointerCounter === 0 && t$54(d).forEach(([e, t]) => {
			document.addEventListener(e, t, { passive: !0 });
		}), u.pointerCounter++;
	}
	function p(e) {
		u.moveCounter++;
	}
	function m(r) {
		if (u.pointerCounter--, u.pointerCounter <= 0) {
			u.pointerCounter = 0, t$54(d).forEach(([e, t]) => {
				document.removeEventListener(e, t);
			});
			let i = e$4(r.pointerType);
			if (u.moveCounter <= i) {
				if (r.shiftKey && s.selectionMode.value !== "container") return;
				s.selectionMode.value = "container";
				let [e, n, i] = n$6(u.clickState, r, "view");
				u.clickState = e, o.value.dispatchEvent(n), i && o.value.dispatchEvent(i);
			}
		}
	}
	function h(e) {
		e.isTrusted || (e.stopPropagation(), l.emit("view:click", { event: e }));
	}
	function g(e) {
		e.isTrusted || (e.stopPropagation(), l.emit("view:dblclick", { event: e }));
	}
	function _(t) {
		l.emit("view:contextmenu", { event: t }), u.pointerCounter > 0 && (u.pointerCounter = 0, t$54(d).forEach(([e, t]) => {
			o.value?.removeEventListener(e, t);
		}));
	}
	let v = (e) => {
		e.preventDefault();
	};
	onMounted(() => {
		let e = o.value;
		e && (e.addEventListener("pointerdown", f, { passive: !0 }), e.addEventListener("click", h, { passive: !1 }), e.addEventListener("dblclick", g, { passive: !1 }), e.addEventListener("contextmenu", _, { passive: !1 }), c.value && e.addEventListener("wheel", v, { passive: !1 }));
	}), onUnmounted(() => {
		let e = o.value;
		e && (e.removeEventListener("pointerdown", f), e.removeEventListener("click", h), e.removeEventListener("dblclick", g), e.removeEventListener("contextmenu", _), c.value && e.removeEventListener("wheel", v));
	}), watch(c, (e, t) => {
		let n = o.value;
		n && e !== t && (e ? n.addEventListener("wheel", v, { passive: !1 }) : n.removeEventListener("wheel", v));
	});
}
// ../DnD helper/node_modules/v-network-graph/lib/utils/map.js
var e$3 = class {
	static valueOf(e) {
		return Array.from(e.values());
	}
};
// ../DnD helper/node_modules/v-network-graph/lib/composables/mouse/edge.js
function a$7(a, s, c, l, u) {
	let d = {
		pointers: /* @__PURE__ */ new Map(),
		pointerPeekCount: 0,
		clicks: /* @__PURE__ */ new Map()
	}, f = {
		pointerup: m,
		pointercancel: h
	};
	watch(l, (e) => {
		e.size > 0 && s.selectionMode.value !== "edge" ? s.selectionMode.value = "edge" : e.size === 0 && s.selectionMode.value === "edge" && (s.selectionMode.value = "container");
	}), watch(s.selectionMode, (e) => {
		e !== "edge" && l.clear();
	});
	function p(t, n) {
		if (n.button == 2 || (n.stopPropagation(), !["default", "edge"].includes(s.viewMode.value))) return;
		d.pointers.size == 0 && (s.viewMode.value = "edge", t$54(f).forEach(([e, t]) => {
			document.addEventListener(e, t);
		}), d.pointerPeekCount = 0), d.pointerPeekCount++;
		let r = {
			pointerId: n.pointerId,
			id: t,
			eventTarget: n.currentTarget
		};
		d.pointers.set(n.pointerId, r), u.emit("edge:pointerdown", o$5(t, n));
	}
	function m(r) {
		r.stopPropagation();
		let i = d.pointers.get(r.pointerId);
		if (!i) return;
		d.pointers.delete(r.pointerId);
		let a = i.id;
		u.emit("edge:pointerup", o$5(a, r));
		let [c, l] = t$44(d.clicks, i.pointerId, a instanceof Array ? a.join(",") : a, r);
		i.eventTarget?.dispatchEvent(c), l && i.eventTarget?.dispatchEvent(l), d.pointers.size === 0 && (d.pointerPeekCount = 0, t$54(f).forEach(([e, t]) => {
			document.removeEventListener(e, t);
		}), r$7(d.clicks), s.viewMode.value = "default");
	}
	function h(t) {
		if (t.stopPropagation(), d.pointers.get(t.pointerId)) {
			for (let e of d.pointers.values()) {
				let n = e.id;
				u.emit("edge:pointerup", o$5(n, t));
			}
			d.pointers.clear(), d.pointerPeekCount = 0, t$54(f).forEach(([e, t]) => {
				document.removeEventListener(e, t);
			}), u.emit("view:mode", "default");
		}
	}
	function g(e, t) {
		if (t.isTrusted || t.shiftKey && !["container", "edge"].includes(s.selectionMode.value)) return;
		s.selectionMode.value = "edge";
		let n = e instanceof Array ? e : [e], i = e$3.valueOf(d.pointers).filter((e) => (e.id instanceof Array ? e.id : [e.id]).every((e) => l.has(e))).length > 0;
		if (e instanceof Array) n.find((e) => a[e]?.selectable) && (t.shiftKey || i ? n.some((e) => l.has(e)) ? n.forEach((e) => l.delete(e)) : n.forEach((e) => {
			let t = a[e]?.selectable;
			typeof t == "number" && l.size >= t || l.add(e);
		}) : (l.clear(), n.forEach((e) => l.add(e))));
		else {
			let n = a[e]?.selectable;
			n && (t.shiftKey || i ? l.has(e) ? l.delete(e) : typeof n == "number" && l.size >= n || l.add(e) : l.has(e) || (l.clear(), l.add(e)));
		}
		u.emit("edge:click", o$5(e, t));
	}
	function _(e, t) {
		t.isTrusted || u.emit("edge:dblclick", o$5(e, t));
	}
	function v(e, t) {
		c.add(e), u.emit("edge:pointerover", o$5(e, t));
	}
	function y(e, t) {
		c.delete(e), u.emit("edge:pointerout", o$5(e, t));
	}
	function b(e, t) {
		t.stopPropagation(), u.emit("edge:contextmenu", o$5(e, t));
	}
	function x(t, n) {
		if (n.button == 2 || (n.stopPropagation(), !["default", "edge"].includes(s.viewMode.value))) return;
		d.pointers.size == 0 && (s.viewMode.value = "edge", t$54(f).forEach(([e, t]) => {
			document.addEventListener(e, t);
		}), d.pointerPeekCount = 0), d.pointerPeekCount++;
		let r = {
			pointerId: n.pointerId,
			id: t,
			eventTarget: n.currentTarget
		};
		d.pointers.set(n.pointerId, r), u.emit("edge:pointerdown", o$5(t, n));
	}
	function S(e, t) {
		e.forEach((e) => c.add(e)), u.emit("edge:pointerover", o$5(e, t));
	}
	function C(e, t) {
		e.forEach((e) => c.delete(e)), u.emit("edge:pointerout", o$5(e, t));
	}
	function w(e, t) {
		g(e, t);
	}
	function T(e, t) {
		_(e, t);
	}
	function E(e, t) {
		t.stopPropagation(), u.emit("edge:contextmenu", o$5(e, t));
	}
	return {
		handleEdgePointerDownEvent: p,
		handleEdgePointerOverEvent: v,
		handleEdgePointerOutEvent: y,
		handleEdgeClickEvent: g,
		handleEdgeDoubleClickEvent: _,
		handleEdgeContextMenu: b,
		handleEdgesPointerDownEvent: x,
		handleEdgesPointerOverEvent: S,
		handleEdgesPointerOutEvent: C,
		handleEdgesClickEvent: w,
		handleEdgesDoubleClickEvent: T,
		handleEdgesContextMenu: E
	};
}
function o$5(e, t) {
	return e instanceof Array ? {
		edges: e,
		event: t,
		summarized: !0
	} : {
		edge: e,
		edges: [e],
		event: t,
		summarized: !1
	};
}
// ../DnD helper/node_modules/v-network-graph/lib/composables/mouse/node.js
function o$4(o, c, l, u, d, f, p) {
	let m = {
		pointers: /* @__PURE__ */ new Map(),
		follow: {
			followedPointerId: -1,
			nodeBasePositions: {}
		},
		hoveredNodesPre: /* @__PURE__ */ new Set(),
		clicks: /* @__PURE__ */ new Map()
	}, h = {
		pointermove: b,
		pointerup: S,
		pointercancel: x
	};
	function g(e) {
		let t = m.follow.followedPointerId === e.pointerId, n = d.has(e.nodeId), r = !(e.pointerId in m.pointers);
		if (t && r || t && !n) {
			let t = e$3.valueOf(m.pointers).find((e) => d.has(e.nodeId));
			if (!t) {
				m.follow = {
					followedPointerId: -1,
					nodeBasePositions: {}
				};
				return;
			}
			e = t, m.follow.followedPointerId = e.pointerId;
		} else {
			let t = m.pointers.get(m.follow.followedPointerId);
			if (!t) {
				m.follow = {
					followedPointerId: -1,
					nodeBasePositions: {}
				};
				return;
			}
			e = t;
		}
		if (t || n) {
			let t = e$3.valueOf(m.pointers).map((e) => e.nodeId);
			m.follow.nodeBasePositions = Object.fromEntries(Array.from(d).filter((e) => !t.includes(e)).filter((e) => o[e]?.draggable).map((e) => [e, s$8(c(e))])), e.dragBasePosition = { ...e.latestPosition }, e.nodeBasePosition = s$8(c(e.nodeId));
		}
	}
	watch(d, (e) => {
		let t = m.pointers.get(m.follow.followedPointerId);
		t && g(t), e.size > 0 && l.selectionMode.value !== "node" ? l.selectionMode.value = "node" : e.size === 0 && l.selectionMode.value === "node" && (l.selectionMode.value = "container");
	}), watch(l.selectionMode, (e) => {
		e !== "node" && d.clear();
	});
	function _(e, t) {
		let n = e.dragBasePosition.x - t.pageX, r = e.dragBasePosition.y - t.pageY, i = m.follow.followedPointerId == e.pointerId ? {
			[e.nodeId]: e.nodeBasePosition,
			...m.follow.nodeBasePositions
		} : { [e.nodeId]: e.nodeBasePosition }, a = f.value;
		return Object.fromEntries(Object.entries(i).map(([e, t]) => [e, {
			x: t.x - n / a,
			y: t.y - r / a
		}]));
	}
	function v(e, t) {
		if (t.isTrusted || t.shiftKey && !["container", "node"].includes(l.selectionMode.value)) return;
		l.selectionMode.value = "node";
		let n = o[e]?.selectable ?? !1;
		if (n) {
			let r = e$3.valueOf(m.pointers).filter((e) => d.has(e.nodeId)).length > 0;
			t.shiftKey || r ? d.has(e) ? d.delete(e) : typeof n == "number" && d.size >= n || d.add(e) : d.has(e) || (d.clear(), d.add(e));
		}
		p.emit("node:click", {
			node: e,
			event: t
		});
	}
	function y(e, t) {
		t.isTrusted || p.emit("node:dblclick", {
			node: e,
			event: t
		});
	}
	function b(e) {
		e.stopPropagation();
		let t = m.pointers.get(e.pointerId);
		if (!t) return;
		t.latestPosition = {
			x: e.pageX,
			y: e.pageY
		}, t.moveCounter++;
		let n = e$4(e.pointerType);
		if (t.moveCounter <= n || !o[t.nodeId]?.draggable) return;
		if (t.moveCounter === n + 1) {
			let e = _(t, {
				pointerId: t.pointerId,
				pageX: t.dragBasePosition.x,
				pageY: t.dragBasePosition.y
			});
			p.emit("node:dragstart", e);
		}
		let i = _(t, e);
		p.emit("node:pointermove", i);
	}
	function x(t) {
		t.stopPropagation();
		let n = m.pointers.get(t.pointerId);
		if (n) {
			for (n of m.pointers.values()) {
				let e = n.nodeId, i = e$4(t.pointerType);
				if (n.moveCounter > i) {
					let e = _(n, {
						pointerId: n.pointerId,
						pageX: n.latestPosition.x,
						pageY: n.latestPosition.y
					});
					p.emit("node:dragend", e);
				}
				p.emit("node:pointerup", {
					node: e,
					event: t
				});
			}
			m.pointers.clear(), m.follow = {
				followedPointerId: -1,
				nodeBasePositions: {}
			}, t$54(h).forEach(([e, t]) => {
				document.removeEventListener(e, t);
			}), l.viewMode.value = "default";
		}
	}
	function S(i) {
		i.stopPropagation();
		let a = m.pointers.get(i.pointerId);
		if (!a) return;
		m.pointers.delete(i.pointerId);
		let s = a.nodeId, c = e$4(i.pointerType), d = a.moveCounter > c;
		if (d) {
			if (o[a.nodeId]?.draggable) {
				let e = _(a, i);
				p.emit("node:dragend", e), p.emit("node:pointerup", {
					node: s,
					event: i
				});
			}
		} else p.emit("node:pointerup", {
			node: s,
			event: i
		});
		if (!d) {
			let [e, t] = t$44(m.clicks, a.pointerId, s, i);
			a.eventTarget?.dispatchEvent(e), t && a.eventTarget?.dispatchEvent(t);
		}
		m.pointers.size === 0 ? (m.follow = {
			followedPointerId: -1,
			nodeBasePositions: {}
		}, t$54(h).forEach(([e, t]) => {
			document.removeEventListener(e, t);
		}), r$7(m.clicks), l.viewMode.value = "default") : g(a), u.clear(), m.hoveredNodesPre.forEach(u.add, u);
	}
	function C(t, n) {
		if (n.button == 2 || (n.stopPropagation(), !["default", "node"].includes(l.viewMode.value))) return;
		m.pointers.size == 0 && (l.viewMode.value = "node", t$54(h).forEach(([e, t]) => {
			document.addEventListener(e, t);
		}));
		let r = {
			pointerId: n.pointerId,
			nodeId: t,
			moveCounter: 0,
			nodeBasePosition: s$8(c(t)),
			dragBasePosition: {
				x: n.pageX,
				y: n.pageY
			},
			latestPosition: {
				x: n.pageX,
				y: n.pageY
			},
			eventTarget: n.currentTarget
		};
		m.pointers.set(n.pointerId, r), d.has(t) && (m.follow.followedPointerId < 0 ? (m.follow.followedPointerId = n.pointerId, g(r)) : delete m.follow.nodeBasePositions[r.nodeId]), p.emit("node:pointerdown", {
			node: t,
			event: n
		});
	}
	function w(e, t) {
		m.hoveredNodesPre.add(e), !(m.pointers.size > 0) && (u.add(e), p.emit("node:pointerover", {
			node: e,
			event: t
		}));
	}
	function T(e, t) {
		m.hoveredNodesPre.delete(e), !(m.pointers.size > 0) && (u.delete(e), p.emit("node:pointerout", {
			node: e,
			event: t
		}));
	}
	function E(e, t) {
		t.stopPropagation(), p.emit("node:contextmenu", {
			node: e,
			event: t
		});
	}
	return {
		handleNodePointerDownEvent: C,
		handleNodePointerOverEvent: w,
		handleNodePointerOutEvent: T,
		handleNodeClickEvent: v,
		handleNodeDoubleClickEvent: y,
		handleNodeContextMenu: E
	};
}
function s$8({ x: e, y: t }) {
	return {
		x: e,
		y: t
	};
}
// ../DnD helper/node_modules/v-network-graph/lib/composables/mouse/path.js
function a$6(a, o, s, c, l, u) {
	let d = {
		pointers: /* @__PURE__ */ new Map(),
		pointerPeekCount: 0,
		clicks: /* @__PURE__ */ new Map()
	};
	function f(e, t) {
		return l.value ? {
			path: a[e]?.path ?? e,
			event: t
		} : {
			path: e,
			event: t
		};
	}
	let p = {
		pointerup: h,
		pointercancel: g
	};
	watch(c, (e) => {
		e.size > 0 && o.selectionMode.value !== "path" ? o.selectionMode.value = "path" : e.size === 0 && o.selectionMode.value === "path" && (o.selectionMode.value = "container");
	}), watch(o.selectionMode, (e) => {
		e !== "path" && c.clear();
	});
	function m(t, n) {
		if (!a[t]?.clickable || n.button == 2 || (n.stopPropagation(), !["default", "path"].includes(o.viewMode.value))) return;
		d.pointers.size == 0 && (o.viewMode.value = "path", t$54(p).forEach(([e, t]) => {
			document.addEventListener(e, t);
		}), d.pointerPeekCount = 0), d.pointerPeekCount++;
		let r = {
			pointerId: n.pointerId,
			id: t,
			eventTarget: n.currentTarget
		};
		d.pointers.set(n.pointerId, r), u.emit("path:pointerdown", f(t, n));
	}
	function h(r) {
		let i = d.pointers.get(r.pointerId);
		if (!i) return;
		r.stopPropagation(), d.pointers.delete(r.pointerId);
		let a = i.id;
		u.emit("path:pointerup", f(a, r));
		let [s, c] = t$44(d.clicks, i.pointerId, a, r);
		i.eventTarget?.dispatchEvent(s), c && i.eventTarget?.dispatchEvent(c), d.pointers.size === 0 && (d.pointerPeekCount = 0, t$54(p).forEach(([e, t]) => {
			document.removeEventListener(e, t);
		}), r$7(d.clicks), o.viewMode.value = "default");
	}
	function g(t) {
		if (d.pointers.get(t.pointerId)) {
			t.stopPropagation();
			for (let e of d.pointers.values()) {
				let n = e.id;
				u.emit("path:pointerup", f(n, t));
			}
			d.pointers.clear(), d.pointerPeekCount = 0, t$54(p).forEach(([e, t]) => {
				document.removeEventListener(e, t);
			}), u.emit("view:mode", "default");
		}
	}
	function _(e, t) {
		a[e]?.hoverable && (s.add(e), u.emit("path:pointerover", f(e, t)));
	}
	function v(e, t) {
		a[e]?.hoverable && (s.delete(e), u.emit("path:pointerout", f(e, t)));
	}
	function y(e, t) {
		if (t.isTrusted || !a[e]?.clickable || t.shiftKey && !["container", "path"].includes(o.selectionMode.value)) return;
		o.selectionMode.value = "path";
		let n = a[e]?.selectable ?? !1;
		if (n) {
			let i = e$3.valueOf(d.pointers).filter((e) => c.has(e.id)).length > 0;
			t.shiftKey || i ? c.has(e) ? c.delete(e) : typeof n == "number" && c.size >= n || c.add(e) : c.has(e) || (c.clear(), c.add(e));
		}
		u.emit("path:click", f(e, t));
	}
	function b(e, t) {
		t.isTrusted || a[e]?.clickable && u.emit("path:dblclick", f(e, t));
	}
	function x(e, t) {
		a[e]?.clickable && (t.stopPropagation(), u.emit("path:contextmenu", f(e, t)));
	}
	return {
		handlePathPointerDownEvent: m,
		handlePathPointerOverEvent: _,
		handlePathPointerOutEvent: v,
		handlePathClickEvent: y,
		handlePathDoubleClickEvent: b,
		handlePathContextMenu: x
	};
}
// ../DnD helper/node_modules/v-network-graph/lib/composables/mouse/index.js
var d$8 = Symbol("mouseEventHandlers");
function f$7(e, s, f, p, m, h, g, _, v, y, b, x, S, C, w, T) {
	let E = {
		selectionMode: ref("container"),
		viewMode: ref("default")
	};
	v.size > 0 ? E.selectionMode.value = "path" : _.size > 0 ? E.selectionMode.value = "edge" : g.size > 0 && (E.selectionMode.value = "node");
	let D = {
		node: g,
		edge: _,
		path: v
	};
	watch([
		g,
		_,
		v
	], () => {
		t$54(D).forEach(([e, t]) => {
			e !== E.selectionMode.value && t.size > 0 && t.clear();
		});
	}, {
		flush: "post",
		immediate: !0
	}), watch(E.viewMode, (e) => {
		T.emit("view:mode", e);
	}), o$6(e, E, C, T);
	let O = {
		selectedNodes: g,
		hoveredNodes: y,
		selectedEdges: _,
		hoveredEdges: b,
		selectedPaths: v,
		hoveredPaths: x,
		...o$4(p, s, E, y, g, f, T),
		...a$7(m, E, b, _, T),
		...a$6(h, E, x, v, S, T),
		...l$7(e, E, s, p, g, w)
	};
	return provide(d$8, O), O;
}
function p$4() {
	return r$17(inject(d$8), "mouseEventHandlers");
}
// ../DnD helper/node_modules/v-network-graph/lib/composables/positionWriter.js
var o$3 = Symbol("positionWriter");
var s$7 = 200;
var c$9 = .2;
function l$6(e, n, l, u) {
	let d = /* @__PURE__ */ new Map(), f = /* @__PURE__ */ new Map(), p = (e, t, n, r = !1) => {
		if (t.x1 === n.x && t.y1 === n.y) return;
		t.x1 = n.x, t.y1 = n.y;
		let i = r ? e.transform?.baseVal : void 0;
		i?.numberOfItems === 1 ? i.getItem(0).setTranslate(n.x, n.y) : e.setAttribute("transform", `translate(${n.x} ${n.y})`);
	}, m = (t, n, r) => {
		p(t, n, e.of(r));
	}, h = (e, t, n, r, i = !1) => {
		if (t.x1 === n.x && t.y1 === n.y && t.x2 === r.x && t.y2 === r.y) return;
		t.x1 = n.x, t.y1 = n.y, t.x2 = r.x, t.y2 = r.y;
		let a = e;
		if (i && a.x1 && a.y1 && a.x2 && a.y2) {
			let e = t.lengths ?? (t.lengths = [
				a.x1.baseVal,
				a.y1.baseVal,
				a.x2.baseVal,
				a.y2.baseVal
			]);
			e[0].value = n.x, e[1].value = n.y, e[2].value = r.x, e[3].value = r.y;
		} else e.setAttribute("x1", `${n.x}`), e.setAttribute("y1", `${n.y}`), e.setAttribute("x2", `${r.x}`), e.setAttribute("y2", `${r.y}`);
	}, g = (e, r, i) => {
		let a = n.get(i);
		if (a) {
			if (e.localName === "line") h(e, r, a.position.p1, a.position.p2);
			else {
				let n = v$2(a);
				if (r.d === n) return;
				r.d = n, e.setAttribute("d", n);
			}
		}
	}, _, v = 0, y, b = (e) => u.value?.toggleAttribute("data-moving", e), x = (e) => {
		y = setTimeout(() => {
			let e = performance.now() - v;
			if (e < s$7) return x(s$7 - e);
			y = void 0, b(!1);
		}, e);
	}, S = () => {
		let e = document.timeline.currentTime;
		e !== _ && (_ = e, v = performance.now(), y === void 0 ? x(s$7) : b(!0));
	};
	onScopeDispose(() => clearTimeout(y)), watchEffect(() => {
		l.changed.value, (l.nodes.size > 0 || l.edges.size > 0) && S(), l.nodes.forEach((e) => d.get(e)?.forEach((t, n) => m(n, t, e))), l.edges.forEach((e) => f.get(e)?.forEach((t, n) => g(n, t, e))), l.nodes.clear(), l.edges.clear();
	});
	let C = (e, t, n) => {
		let r;
		return (i) => {
			let a = i instanceof Element ? i : void 0;
			if (a === r) return;
			if (r) {
				let n = e.get(t);
				n?.delete(r), n?.size === 0 && e.delete(t);
			}
			if (r = a, !r) return;
			let o = e.get(t);
			o || e.set(t, o = /* @__PURE__ */ new Map());
			let s = {
				x1: NaN,
				y1: NaN,
				x2: NaN,
				y2: NaN
			};
			o.set(r, s), n(r, s, t);
		};
	}, w;
	return provide(o$3, {
		nodeRef: (e) => C(d, e, m),
		edgeRef: (e) => C(f, e, g)
	}), {
		makePositionDrawer: (t, n, r) => {
			let i = /* @__PURE__ */ new Map(), a = 0, o = (e, t) => !!t && Math.abs(e.x - t.x) < a && Math.abs(e.y - t.y) < a;
			return e.onMoved((e) => e.forEach((e) => i.delete(e))), {
				get interval() {
					return t();
				},
				draw: (t) => {
					S(), a = c$9 / n();
					let s = i;
					i = /* @__PURE__ */ new Map(), d.forEach((e, n) => {
						let r = t(n);
						if (!r) return;
						let a = s.get(n);
						i.set(n, o(r, a) ? a : r);
					}), e.drawAhead((e) => {
						let n = t(e);
						if (!n) return;
						let r = i.get(e);
						return o(n, r) ? r : n;
					}), d.forEach((t, n) => {
						let r = e.of(n);
						t.forEach((e, t) => p(t, e, r, !0));
					}), r((e, t, n) => f.get(e)?.forEach((r, i) => {
						i.localName === "line" ? h(i, r, t, n, !0) : g(i, r, e);
					}));
				},
				setFlush: (t) => {
					w = t, t || (e.endAhead(), i.clear());
				}
			};
		},
		flushPositions: () => w?.()
	};
}
function u$12() {
	return r$17(inject(o$3), "PositionWriter");
}
// ../DnD helper/node_modules/v-network-graph/lib/composables/selection.js
var r$6 = Symbol("selection");
function i$9(e, t, i) {
	provide(r$6, {
		selectedNodes: e,
		selectedEdges: t,
		selectedPaths: i
	});
}
function a$5() {
	return r$17(inject(r$6), "Selections");
}
// ../DnD helper/node_modules/v-network-graph/lib/utils/box.js
function e$2(e, t) {
	let n = Math.max(e.width, e.height, t.width, t.height) / 1e4;
	return Math.abs(e.x - t.x) < n && Math.abs(e.y - t.y) < n && Math.abs(e.width - t.width) < n && Math.abs(e.height - t.height) < n;
}
function t$43(e, t) {
	return {
		top: e.top + t.top,
		left: e.left + t.left,
		right: e.right + t.right,
		bottom: e.bottom + t.bottom
	};
}
function n$5(e, t) {
	return {
		top: e.top * t,
		left: e.left * t,
		right: e.right * t,
		bottom: e.bottom * t
	};
}
function r$5(e, t) {
	return {
		top: e.top / t,
		left: e.left / t,
		right: e.right / t,
		bottom: e.bottom / t
	};
}
function i$8(e) {
	return {
		top: e.y,
		left: e.x,
		right: e.x + e.width,
		bottom: e.y + e.height
	};
}
function a$4(e) {
	return {
		x: e.left,
		y: e.top,
		width: e.right - e.left,
		height: e.bottom - e.top
	};
}
function o$2(e, t) {
	return {
		top: Math.min(e.top, t.top),
		left: Math.min(e.left, t.left),
		right: Math.max(e.right, t.right),
		bottom: Math.max(e.bottom, t.bottom)
	};
}
// ../DnD helper/node_modules/v-network-graph/lib/modules/view/fit.js
var c$8 = /* @__PURE__ */ RegExp("^\\d+$");
function l$5(e, t) {
	let n = {
		top: 0,
		left: 0,
		right: 0,
		bottom: 0
	};
	if (typeof e == "string") {
		let r = d$7(e, t.width), i = d$7(e, t.height);
		r === void 0 || i === void 0 ? console.warn("Invalid `fitContentMargin` value.", e) : n = {
			top: i,
			left: r,
			right: r,
			bottom: i
		};
	} else if (typeof e == "number") {
		let t = e;
		n = {
			top: t,
			left: t,
			right: t,
			bottom: t
		};
	} else {
		if (e.top) {
			let r = d$7(e.top, t.height);
			r === void 0 ? console.warn("Invalid `fitContentMargin` value.", e.top) : n.top = r;
		}
		if (e.left) {
			let r = d$7(e.left, t.width);
			r === void 0 ? console.warn("Invalid `fitContentMargin` value.", e.left) : n.left = r;
		}
		if (e.right) {
			let r = d$7(e.right, t.width);
			r === void 0 ? console.warn("Invalid `fitContentMargin` value.", e.right) : n.right = r;
		}
		if (e.bottom) {
			let r = d$7(e.bottom, t.height);
			r === void 0 ? console.warn("Invalid `fitContentMargin` value.", e.bottom) : n.bottom = r;
		}
	}
	return n;
}
function u$11(e, t, n, r, i, a) {
	let o = e.getBBox();
	return a ? p$3(o, t, n, i) : m$3(o, f$6(e, o), t, n, r, i);
}
function d$7(e, t) {
	if (typeof e == "string") {
		if (e.endsWith("%")) {
			let n = parseInt(e.toString());
			if (Number.isFinite(n)) return n / 100 * t;
		} else if (e.endsWith("px") || c$8.test(e)) {
			let t = parseInt(e.toString());
			if (Number.isFinite(t)) return t;
		}
	} else if (typeof e == "number") return e;
}
function f$6(e, t) {
	let n = Array.from(e.querySelectorAll(".v-ng-graph-objects")).filter((e) => e.firstElementChild).map((e) => i$8(e.getBBox()));
	return n.length > 0 ? a$4(n.reduce(o$2)) : t;
}
function p$3(e, t, n, r) {
	if (Object.keys(n).length <= 1) return;
	let i = h$4(e, t, r);
	if (i > 0) return {
		zoom: i,
		pos: g$2(i$8(e), i, t, r)
	};
}
function m$3(i, c, l, u, d, f) {
	if (Object.keys(u).length <= 1) return;
	let p = n$12(u), m = {
		top: (p.top - c.y) * d,
		left: (p.left - c.x) * d,
		right: (c.x + c.width - p.right) * d,
		bottom: (c.y + c.height - p.bottom) * d
	}, v = h$4(i, l, f);
	if (v === 0) return;
	let y = _$4(l, t$43(f, m));
	if (y.width <= 0 || y.height <= 0) return;
	let b = i$8(i), x = _$4(l, f), S = e$2(i, c), C = 0, w = 0, T = {
		top: 0,
		left: 0,
		right: 0,
		bottom: 0
	};
	do {
		w = v;
		let e = r$5(m, v), t = {
			top: p.top - e.top,
			left: p.left - e.left,
			right: p.right + e.right,
			bottom: p.bottom + e.bottom
		};
		T = S ? t : o$2(b, t);
		let n = a$4(T), i = [x.width / n.width, x.height / n.height].filter((e) => e > 0);
		if (i.length === 0) return;
		v = Math.min(...i), C++;
	} while (Math.abs(w - v) > 1e-6 && C < 10);
	return {
		zoom: v,
		pos: g$2(T, v, l, f)
	};
}
function h$4(e, t, n) {
	if (e.width === 0 || e.height === 0) return 0;
	let r = _$4(t, n);
	if (r.width <= 0 || r.height <= 0) return 0;
	let i = [r.width / e.width, r.height / e.height];
	return Math.min(...i);
}
function g$2(e, t, n, r) {
	let o = _$4(n, r), s = a$4(n$5(e, t)), c = (o.width - s.width) / 2, l = (o.height - s.height) / 2, u = s.x - r.left, d = s.y - r.top;
	return {
		x: -u + c,
		y: -d + l
	};
}
function _$4(e, t) {
	let n = t.left + t.right, r = t.top + t.bottom;
	return {
		width: e.width - n,
		height: e.height - r
	};
}
// ../DnD helper/node_modules/v-network-graph/lib/composables/viewMethods.js
function c$7(c, l, u, d, f, p) {
	let { svg: m, viewport: h, svgPanZoom: g, applyAbsoluteZoomLevel: _, scale: v } = c, y = async () => {
		Object.keys(u.value).length > 0 && (g.value?.updateBBox(), await t$47());
	}, b = async (t) => {
		let n = !t || t.margin === void 0 ? f.view.fitContentMargin : t.margin;
		await y();
		let r = r$17(m.value).getBoundingClientRect(), i = l$5(n, r), a = u$11(r$17(h.value), r, d.all(), l.value, i, f.view.scalingObjects);
		a ? (_(a.zoom), g.value?.pan(a.pos)) : g.value?.center(), p.emit("view:fit", void 0);
	}, x = async () => {
		await y(), g.value?.center();
	}, S = () => g.value?.getViewBox() ?? {
		top: 0,
		bottom: 0,
		left: 0,
		right: 0
	}, C = (e) => g.value?.setViewBox(e);
	function w() {
		g.value?.zoomIn();
	}
	function T() {
		g.value?.zoomOut();
	}
	function E(e) {
		g.value?.pan(e);
	}
	function D(e) {
		g.value?.panBy(e);
	}
	function O() {
		return r$17(g.value).getPan();
	}
	function k() {
		let t = r$17(g.value).getSizes();
		return {
			width: t.width,
			height: t.height,
			viewBox: t.viewBox
		};
	}
	function A(t) {
		return t$45(r$17(m.value, "svg"), r$17(h.value, "viewport"), t);
	}
	function j(t) {
		return n$7(r$17(m.value, "svg"), r$17(h.value, "viewport"), t);
	}
	function M() {
		return r$8(r$17(m.value, "svg"), r$17(h.value, "viewport"), v.value).outerHTML;
	}
	async function N(e = {}) {
		return (await P(e)).outerHTML;
	}
	async function P(t = {}) {
		return a$8(r$17(m.value, "svg"), r$17(h.value, "viewport"), v.value, t);
	}
	return {
		updateBorderBox: y,
		fitToContents: b,
		panToCenter: x,
		getViewBox: S,
		setViewBox: C,
		zoomIn: w,
		zoomOut: T,
		panTo: E,
		panBy: D,
		getPan: O,
		getSizes: k,
		translateFromDomToSvgCoordinates: A,
		translateFromSvgToDomCoordinates: j,
		getAsSvg: M,
		exportAsSvgText: N,
		exportAsSvgElement: P
	};
}
// ../DnD helper/node_modules/v-network-graph/lib/composables/viewMode.js
function n$4(n, r, i) {
	let a = ref(!1);
	return i.on("node:dragstart", (e) => a.value = !0), i.on("node:dragend", (e) => a.value = !1), i.on("view:mode", (e) => {
		r.view.panEnabled && (e === "default" ? n.value?.enablePan() : n.value?.disablePan()), r.view.zoomEnabled && (e === "default" ? n.value?.enableZoom() : n.value?.disableZoom());
	}), {
		dragging: a,
		touches: computed(() => r.view.panEnabled || r.view.zoomEnabled || r.node.draggable)
	};
}
// ../DnD helper/node_modules/v-network-graph/lib/composables/graph.js
function x(x, S, C) {
	let w = toRef(x, "nodes"), T = toRef(x, "edges"), E = C.paths?.objects ?? ref({}), D = a$9();
	Object.entries(x.eventHandlers).forEach(([e, t]) => {
		D.on(e, t);
	});
	let O = C.drawAheadDefaults, k = O ? d$10(C.configs, O) : void 0, A = k ?? d$10(C.configs), j = shallowRef(Object.keys(C.slots));
	onBeforeUpdate(() => {
		let e = Object.keys(C.slots);
		isEqual(e, j.value) || (j.value = e);
	});
	let { layerDefs: M, isShowGrid: N, isShowBackgroundViewport: P } = u$14(A, j, () => x.layers, c$11), F = l$9(A, j, C.builtInLayers), I = a$13(x, "zoomLevel", S, (e) => (e = Math.max(e, A.view.minZoomLevel), e = Math.min(e, A.view.maxZoomLevel), e)), L = c$13(I, () => x.zoomLevel, A, D), { svg: R, viewport: z, svgPanZoom: B, scale: V } = L, H = o$11(x, "selectedNodes", w, S);
	watch(H, (e) => D.emit("node:select", Array.from(e)));
	let U = o$11(x, "selectedEdges", T, S);
	watch(U, (e) => D.emit("edge:select", Array.from(e)));
	let W = C.paths ? o$11(C.paths.props, "selectedPaths", E, C.paths.emit) : n$16(/* @__PURE__ */ new Set());
	C.paths && watch(W, (e) => D.emit("path:select", Array.from(e))), i$9(H, U, W);
	let G = n$16(/* @__PURE__ */ new Set()), K = n$16(/* @__PURE__ */ new Set()), q = n$16(/* @__PURE__ */ new Set()), J = l$8(() => x.layouts), Y = l$10(J), X = n$11(), { dragging: ue, touches: de } = n$4(B, A, D), { nodeStates: fe, edgeStates: pe, pathStates: me, positionChanges: he, layoutsChanged: ge, edgeGeometries: _e, placeEdgesAhead: ve } = x$2(y$3(w, H, G), y$3(T, U, K), y$3(E, W, q), readonly(A), J, () => x.layouts, X, V, Y), { makePositionDrawer: ye, flushPositions: be } = l$6(Y, _e, he, z);
	watch(ge, () => S("update:layouts", J));
	let xe = computed(() => d$11(A.view)), { isBoxSelectionMode: Se, selectionBox: Z, startBoxSelection: Ce, stopBoxSelection: we } = f$7(R, Y.of, readonly(I), fe, pe, me, H, U, W, G, K, q, C.paths?.isInCompatibilityMode ?? ref(!1), xe, A, D), Q = c$7(L, I, w, Y, A, D), $ = k ? ye(() => k.view.layoutsUpdateInterval, () => I.value, ve) : void 0;
	o$8(L, Q, w, A, D, () => ({
		layouts: n$16(J.nodes),
		nodePositions: toRef(J, "nodes"),
		nodes: w,
		edges: T,
		configs: readonly(A),
		scale: readonly(V),
		emitter: D,
		svgPanZoom: r$17(B.value),
		...$ ? { positionDrawer: $ } : {}
	}));
	function Te() {
		be();
		let e = Object.entries(toRaw(J).nodes).map(([e, t]) => [e, { ...t }]);
		return { nodes: Object.fromEntries(e) };
	}
	return {
		configs: A,
		layerDefs: M,
		isShowGrid: N,
		isShowBackgroundViewport: P,
		builtInLayerOrder: F,
		canvas: L,
		markerState: X,
		dragging: ue,
		touches: de,
		isBoxSelectionMode: Se,
		selectionBox: Z,
		getLayouts: Te,
		methods: {
			fitToContents: Q.fitToContents,
			panToCenter: Q.panToCenter,
			getViewBox: Q.getViewBox,
			setViewBox: Q.setViewBox,
			startBoxSelection: Ce,
			stopBoxSelection: we,
			zoomIn: Q.zoomIn,
			zoomOut: Q.zoomOut,
			panTo: Q.panTo,
			panBy: Q.panBy,
			getPan: Q.getPan,
			getSizes: Q.getSizes,
			translateFromDomToSvgCoordinates: Q.translateFromDomToSvgCoordinates,
			translateFromSvgToDomCoordinates: Q.translateFromSvgToDomCoordinates,
			exportAsSvgText: Q.exportAsSvgText,
			exportAsSvgElement: Q.exportAsSvgElement,
			getAsSvg: Q.getAsSvg
		}
	};
}
// ../DnD helper/node_modules/v-network-graph/lib/composables/object.js
function n$3(n) {
	let r = ref({}), i = ref(!1), a = 1, o = /* @__PURE__ */ new Map();
	return watchEffect(() => {
		if (n.value instanceof Array) {
			let e = /* @__PURE__ */ new Set([]);
			if (r.value = Object.fromEntries(n.value.map((t) => {
				let n = t.id;
				return n || (i.value || (i.value = !0, console.warn("[v-network-graph] Please specify the `id` field for the `Path` object. Currently, this works for compatibility, but in the future, the id field will be required.")), n = o.get(t), n || (n = "path-" + a++, o.set(t, n))), e.add(n), [n, t];
			})), i.value) for (let [t, n] of Array.from(o.entries())) e.has(n) || o.delete(t);
		} else r.value = n.value;
	}), {
		objects: r,
		isInCompatibilityModeForPath: i
	};
}
// ../DnD helper/node_modules/v-network-graph/lib/composables/transition.js
function n$2(e) {
	return e instanceof Promise || e && typeof e.then == "function";
}
function r$4() {
	let r = null, i = 0, a = 0, o = ref({
		enabled: !1,
		duration: 300,
		timingFunction: "linear"
	});
	function s(t, s = 300, c = "linear") {
		r && (clearTimeout(r), r = null), o.value = {
			enabled: !0,
			duration: s,
			timingFunction: c
		}, i++, a = Math.max(a, s), nextTick(async () => {
			try {
				let e = t();
				n$2(e) && await e;
			} finally {
				i--, i === 0 && (r = window?.setTimeout(() => {
					o.value.enabled = !1, r = null, a = 0;
				}, a));
			}
		});
	}
	return {
		transitionWhile: s,
		transitionOption: o
	};
}
// ../DnD helper/node_modules/v-network-graph/lib/components/background/VBackgroundGrid.vue_vue_type_script_setup_true_lang.js
var p$2 = {
	class: "v-ng-background-grid",
	"shape-rendering": "crispEdges"
};
var m$2 = ["d"];
var h$3 = ["d"];
var g$1 = ["d"];
var _$3 = ["d"];
// ../DnD helper/node_modules/v-network-graph/lib/components/background/VBackgroundGrid.vue.js
var t$42 = /* @__PURE__ */ defineComponent({
	__name: "VBackgroundGrid",
	setup(o) {
		let { container: v, svgPanZoom: y } = a$12(), { zoomLevel: b } = o$13(), x = o$9(), S = p$5(), C = ref({
			x: 0,
			y: 0
		}), w = ref({
			width: 500,
			height: 500
		});
		onMounted(() => {
			let e = y.value?.getPan();
			e && (C.value = {
				x: -e.x,
				y: -e.y
			});
			let t = v.value.getBoundingClientRect();
			w.value = {
				width: t.width,
				height: t.height
			};
		}), x.on("view:resize", (e) => {
			w.value = {
				width: e.width,
				height: e.height
			};
		}), x.on("view:pan", (e) => {
			C.value = {
				x: -e.x,
				y: -e.y
			};
		}), x.on("view:zoom", () => {
			let e = y.value?.getPan();
			e && (C.value = {
				x: -e.x,
				y: -e.y
			});
		});
		let T = ref([]), E = ref([]), D = ref([]), O = ref([]);
		return watchEffect(() => {
			let e = [], t = [], n = [], r = [], i = 1 / b.value, a = S.grid.interval, o = C.value.x * i, s = C.value.y * i, c = Math.floor(w.value.width / a + 1) * a, l = Math.floor(w.value.height / a + 1) * a, u = (C.value.x + c) * i, d = (C.value.y + l) * i, f = S.grid.thickIncrements, p = S.grid.line.dasharray, m = S.grid.thick.dasharray, h = {
				stroke: S.grid.thick.color,
				"stroke-width": S.grid.thick.width,
				"stroke-dasharray": m,
				"stroke-dashoffset": m ? o / i : void 0
			}, g = {
				stroke: S.grid.line.color,
				"stroke-width": S.grid.line.width,
				"stroke-dasharray": p,
				"stroke-dashoffset": p ? o / i : void 0
			}, _ = (C.value.x + c) * i;
			for (let t = s; t <= d; t += a) {
				let r = Math.floor(t / a);
				f && r % f === 0 ? e.push([
					r,
					r * a,
					o,
					_,
					h
				]) : n.push([
					r,
					r * a,
					o,
					_,
					g
				]);
			}
			h = { ...h }, h["stroke-dashoffset"] = m ? s / i : void 0, g = { ...g }, g["stroke-dashoffset"] = p ? s / i : void 0;
			let v = (C.value.y + l) * i;
			for (let e = o; e <= u; e += a) {
				let n = Math.floor(e / a);
				f && n % f === 0 ? t.push([
					n,
					n * a,
					s,
					v,
					h
				]) : r.push([
					n,
					n * a,
					s,
					v,
					g
				]);
			}
			E.value = e, T.value = t, O.value = n, D.value = r;
		}), (e, t) => (openBlock(), createElementBlock("g", p$2, [
			(openBlock(!0), createElementBlock(Fragment, null, renderList(O.value, ([e, t, n, r, i]) => (openBlock(), createElementBlock("path", mergeProps({
				key: `nv${e}`,
				d: `M ${n} ${t} L ${r} ${t}`
			}, { ref_for: !0 }, i, { style: { "vector-effect": "non-scaling-stroke" } }), null, 16, m$2))), 128)),
			(openBlock(!0), createElementBlock(Fragment, null, renderList(D.value, ([e, t, n, r, i]) => (openBlock(), createElementBlock("path", mergeProps({
				key: `nh${e}`,
				d: `M ${t} ${n} L ${t} ${r}`
			}, { ref_for: !0 }, i, { style: { "vector-effect": "non-scaling-stroke" } }), null, 16, h$3))), 128)),
			(openBlock(!0), createElementBlock(Fragment, null, renderList(E.value, ([e, t, n, r, i]) => (openBlock(), createElementBlock("path", mergeProps({
				key: `tv${e}`,
				d: `M ${n} ${t} L ${r} ${t}`
			}, { ref_for: !0 }, i, { style: { "vector-effect": "non-scaling-stroke" } }), null, 16, g$1))), 128)),
			(openBlock(!0), createElementBlock(Fragment, null, renderList(T.value, ([e, t, n, r, i]) => (openBlock(), createElementBlock("path", mergeProps({
				key: `th${e}`,
				d: `M ${t} ${n} L ${t} ${r}`
			}, { ref_for: !0 }, i, { style: { "vector-effect": "non-scaling-stroke" } }), null, 16, _$3))), 128))
		]));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/components/background/VBackgroundViewport.vue.js
var t$41 = /* @__PURE__ */ defineComponent({
	__name: "VBackgroundViewport",
	setup(n) {
		let { viewport: c } = a$12(), l = ref(), u = (e, t, n) => {
			e.forEach((e) => t.setAttribute(e, n.getAttribute(e) ?? ""));
		}, d = new MutationObserver((e) => {
			if (!l.value) return;
			let t = e.map((e) => e.attributeName ?? "").filter(Boolean);
			u(t, l.value, c.value);
		});
		return onMounted(() => {
			let e = ["transform", "style"];
			d.observe(c.value, {
				attributes: !0,
				attributeFilter: e
			}), l.value && u(e, l.value, c.value);
		}), onUnmounted(() => {
			d.disconnect();
		}), (e, n) => (openBlock(), createElementBlock("g", {
			ref_key: "background",
			ref: l,
			class: "v-ng-background-viewport"
		}, [renderSlot(e.$slots, "default")], 512));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/components/base/VSelectionBox.vue_vue_type_script_setup_true_lang.js
var r$3 = [
	"x",
	"y",
	"width",
	"height",
	"fill",
	"stroke",
	"stroke-width",
	"stroke-dasharray"
];
// ../DnD helper/node_modules/v-network-graph/lib/components/base/VSelectionBox.vue.js
var t$40 = /* @__PURE__ */ defineComponent({
	__name: "VSelectionBox",
	props: {
		box: {},
		config: {}
	},
	setup(t) {
		return (i, a) => (openBlock(), createElementBlock("rect", {
			class: "v-ng-selection-box",
			x: Math.round(t.box.pos.x),
			y: Math.round(t.box.pos.y),
			width: Math.ceil(t.box.size.width),
			height: Math.ceil(t.box.size.height),
			fill: t.config.color,
			stroke: t.config.strokeColor,
			"stroke-width": t.config.strokeWidth,
			"stroke-dasharray": t.config.strokeDasharray
		}, null, 8, r$3));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/components/base/VRenderSlot.js
var t$39 = ({ render: t, slotProps: n }, { slots: r }) => renderSlot({ content: t }, "content", n, r.default);
t$39.props = ["render", "slotProps"];
// ../DnD helper/node_modules/v-network-graph/lib/components/edge/VEdgeLabelPlace.vue.js
var t$38 = /* @__PURE__ */ defineComponent({
	__name: "VEdgeLabelPlace",
	props: {
		edgeId: {},
		edge: {},
		state: {}
	},
	setup(i) {
		let s = i, { scale: c } = o$13(), l = computed(() => l$16(s.state.labelPosition, s.state.line.stroke, s.state.label.margin, s.state.label.padding, c.value));
		return (e, t) => i.state.loop ? createCommentVNode("", !0) : renderSlot(e.$slots, "default", {
			edgeId: i.edgeId,
			edge: i.edge,
			config: i.state.label,
			area: l.value,
			hovered: i.state.hovered,
			selected: i.state.selected,
			scale: unref(c)
		}, void 0, void 0, 0);
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/components/edge/VEdgeLabelsPlace.vue.js
var t$37 = /* @__PURE__ */ defineComponent({
	__name: "VEdgeLabelsPlace",
	props: {
		edges: {},
		state: {}
	},
	setup(s) {
		let u = s, d = h$5(), { scale: f } = o$13(), p = computed(() => t.values(d.summarized.stroke, u.edges)), { hovered: m, selected: h } = T$1(() => u.edges), g = computed(() => l$16(u.state.labelPosition, p.value, u.state.label.margin, u.state.label.padding, f.value));
		return (e, t) => s.state.loop ? createCommentVNode("", !0) : renderSlot(e.$slots, "default", {
			edges: s.edges,
			config: s.state.label,
			area: g.value,
			hovered: unref(m),
			selected: unref(h),
			scale: unref(f)
		}, void 0, void 0, 0);
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/components/edge/VEdgeLabels.vue_vue_type_script_setup_true_lang.js
var g = { class: "v-ng-edge-labels" };
// ../DnD helper/node_modules/v-network-graph/lib/components/edge/VEdgeLabels.vue.js
var t$36 = /* @__PURE__ */ defineComponent({
	__name: "VEdgeLabels",
	props: {
		enableEdgeLabel: {
			type: Boolean,
			default: !1
		},
		enableEdgesLabel: {
			type: Boolean,
			default: !1
		}
	},
	setup(l) {
		let { edgeStates: _, edgeGroupStates: v } = C(), y = computed(() => {
			let e = {}, t = {};
			return Object.entries(v.edgeGroups).forEach(([n, r]) => {
				Object.keys(r.edges).length > 0 && (r.summarize ? t[n] = r : e[n] = r);
			}), {
				individual: e,
				summarized: t
			};
		});
		return (t, a) => (openBlock(), createElementBlock("g", g, [l.enableEdgeLabel ? (openBlock(!0), createElementBlock(Fragment, { key: 0 }, renderList(y.value.individual, (e, r) => (openBlock(), createElementBlock(Fragment, { key: r }, [(openBlock(!0), createElementBlock(Fragment, null, renderList(e.edges, (e, r) => (openBlock(), createBlock(t$38, {
			key: r,
			"edge-id": r,
			edge: e,
			state: unref(_)[r]
		}, {
			default: withCtx((e) => [renderSlot(t.$slots, "edge-label", mergeProps({ ref_for: !0 }, e))]),
			_: 3
		}, 8, [
			"edge-id",
			"edge",
			"state"
		]))), 128))], 64))), 128)) : createCommentVNode("", !0), l.enableEdgesLabel ? (openBlock(!0), createElementBlock(Fragment, { key: 1 }, renderList(y.value.summarized, (n, a) => (openBlock(), createElementBlock(Fragment, { key: a }, [unref(w$1)(unref(_), n.edges) ? (openBlock(), createBlock(t$37, {
			key: 0,
			edges: n.edges,
			state: unref(w$1)(unref(_), n.edges)
		}, {
			default: withCtx((e) => [renderSlot(t.$slots, "edges-label", mergeProps({ ref_for: !0 }, e))]),
			_: 3
		}, 8, ["edges", "state"])) : createCommentVNode("", !0)], 64))), 128)) : createCommentVNode("", !0)]));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/components/layers/VEdgeLabelsLayer.vue.js
var t$35 = /* @__PURE__ */ defineComponent({
	__name: "VEdgeLabelsLayer",
	props: {
		edgeLabel: { type: Function },
		edgesLabel: { type: Function }
	},
	setup(a) {
		return (l, u) => (openBlock(), createBlock(t$36, {
			"enable-edge-label": !!a.edgeLabel,
			"enable-edges-label": !!a.edgesLabel,
			class: "v-ng-layer-edge-labels v-ng-graph-objects"
		}, createSlots({ _: 2 }, [a.edgeLabel ? {
			name: "edge-label",
			fn: withCtx((t) => [createVNode(unref(t$39), {
				render: a.edgeLabel,
				"slot-props": t
			}, null, 8, ["render", "slot-props"])]),
			key: "0"
		} : void 0, a.edgesLabel ? {
			name: "edges-label",
			fn: withCtx((t) => [createVNode(unref(t$39), {
				render: a.edgesLabel,
				"slot-props": t
			}, null, 8, ["render", "slot-props"])]),
			key: "1"
		} : void 0]), 1032, ["enable-edge-label", "enable-edges-label"]));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/components/edge/VEdgeBackground.vue_vue_type_script_setup_true_lang.js
var u$9 = ["stroke-width"];
// ../DnD helper/node_modules/v-network-graph/lib/components/edge/VEdgeBackground.vue.js
var t$34 = /* @__PURE__ */ defineComponent({
	__name: "VEdgeBackground",
	props: {
		id: {},
		state: {}
	},
	setup(a) {
		let d = a, { scale: f } = o$13(), { handleEdgePointerDownEvent: p, handleEdgePointerOverEvent: m, handleEdgePointerOutEvent: h, handleEdgeClickEvent: g, handleEdgeDoubleClickEvent: _, handleEdgeContextMenu: v } = p$4(), y = u$12().edgeRef(d.id), b = computed(() => (d.state.line.stroke.width + 10) * f.value);
		return (e, t) => (openBlock(), createElementBlock("path", {
			ref: unref(y),
			class: normalizeClass({
				"v-ng-line-background": !0,
				selectable: a.state.selectable
			}),
			stroke: "transparent",
			"stroke-width": b.value,
			fill: "none",
			onPointerdown: t[0] || (t[0] = withModifiers((e) => unref(p)(a.id, e), ["stop"])),
			onPointerenterPassive: t[1] || (t[1] = (e) => unref(m)(a.id, e)),
			onPointerleavePassive: t[2] || (t[2] = (e) => unref(h)(a.id, e)),
			onClick: t[3] || (t[3] = withModifiers((e) => unref(g)(a.id, e), ["stop"])),
			onDblclick: t[4] || (t[4] = withModifiers((e) => unref(_)(a.id, e), ["stop"])),
			onContextmenu: t[5] || (t[5] = (e) => unref(v)(a.id, e))
		}, null, 42, u$9));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/components/edge/VEdgeBackgrounds.vue.js
var t$33 = /* @__PURE__ */ defineComponent({
	__name: "VEdgeBackgrounds",
	setup(o) {
		let { edgeStates: u, edgeGroupStates: d } = C();
		return (e, o) => (openBlock(!0), createElementBlock(Fragment, null, renderList(unref(d).edgeGroups, ({ summarize: e, edges: o }) => (openBlock(), createElementBlock(Fragment, null, [e ? createCommentVNode("", !0) : (openBlock(!0), createElementBlock(Fragment, { key: 0 }, renderList(o, (e, n) => (openBlock(), createBlock(t$34, {
			key: n,
			id: n,
			state: unref(u)[n]
		}, null, 8, ["id", "state"]))), 128))], 64))), 256));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/composables/stroke.js
function i$6(i) {
	let { scale: a } = o$13();
	return {
		strokeWidth: computed(() => i().width * a.value),
		strokeDasharray: computed(() => r$19(i().dasharray, a.value)),
		animationSpeed: computed(() => {
			let { animate: e, dasharray: t, animationSpeed: r } = i(), o = e ? i$21(t) * r * a.value : 0;
			return o ? { "--animation-speed": o } : void 0;
		})
	};
}
// ../DnD helper/node_modules/v-network-graph/lib/components/edge/VEdge.vue_vue_type_script_setup_true_lang.js
var l$3 = [
	"fill",
	"stroke",
	"stroke-width",
	"stroke-dasharray",
	"stroke-linecap",
	"data-edge-id",
	"marker-start",
	"marker-end"
];
// ../DnD helper/node_modules/v-network-graph/lib/components/edge/VEdge.vue.js
var t$32 = /* @__PURE__ */ defineComponent({
	__name: "VEdge",
	props: {
		id: {},
		state: {}
	},
	setup(i) {
		let u = i, { strokeWidth: d, strokeDasharray: f, animationSpeed: p } = i$6(() => u.state.line.stroke), m = computed(() => !!u.state.loop), h = computed(() => !m.value && !u.state.curve), g = u$12().edgeRef(u.id);
		return (e, t) => (openBlock(), createElementBlock("path", {
			ref: unref(g),
			class: normalizeClass([{
				"v-ng-line": !0,
				animate: i.state.line.stroke.animate,
				selectable: i.state.selectable,
				hover: i.state.hovered,
				selected: i.state.selected
			}, "v-ng-edge"]),
			fill: h.value ? void 0 : "none",
			stroke: i.state.line.stroke.color,
			"stroke-width": unref(d),
			"stroke-dasharray": unref(f),
			"stroke-linecap": i.state.line.stroke.linecap,
			style: normalizeStyle(unref(p)),
			"data-edge-id": m.value ? void 0 : i.id,
			"marker-start": i.state.sourceMarkerId ? `url('#${i.state.sourceMarkerId}')` : void 0,
			"marker-end": i.state.targetMarkerId ? `url('#${i.state.targetMarkerId}')` : void 0
		}, null, 14, l$3));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/components/edge/VEdgeOverlay.vue_vue_type_script_setup_true_lang.js
var f$5 = { class: "v-ng-edge-overlay" };
// ../DnD helper/node_modules/v-network-graph/lib/components/edge/VEdgeOverlay.vue.js
var t$31 = /* @__PURE__ */ defineComponent({
	__name: "VEdgeOverlay",
	props: {
		edgeId: { default: void 0 },
		edge: { default: void 0 },
		edges: { default: () => ({}) },
		state: {},
		isSummarized: { type: Boolean }
	},
	setup(c) {
		let p = c, { scale: m } = o$13(), h = h$5(), { hovered: g, selected: _ } = T$1(() => p.edges), v = computed(() => p.isSummarized ? t.values(h.summarized.stroke, p.edges) : p.state.line.stroke), y = computed(() => ({
			source: p.state.origin.p1,
			target: p.state.origin.p2
		})), b = computed(() => {
			if (p.state.curve) return p.state.curve.center;
			let { p1: e, p2: t } = p.state.origin;
			return {
				x: (e.x + t.x) / 2,
				y: (e.y + t.y) / 2
			};
		}), x = computed(() => p.isSummarized ? { position: p.state.position } : p.state), S = computed(() => y$4(x.value));
		function C(e) {
			return Number.isNaN(e) ? p.state.position.p1 : b$3(x.value, e);
		}
		return (e, t) => (openBlock(), createElementBlock("g", f$5, [c.isSummarized ? renderSlot(e.$slots, "default", {
			edges: c.edges,
			isSummarized: c.isSummarized,
			stroke: v.value,
			position: y.value,
			center: b.value,
			hovered: unref(g),
			selected: unref(_),
			scale: unref(m),
			length: S.value,
			pointAtLength: C
		}, void 0, void 0, 0) : renderSlot(e.$slots, "default", {
			edgeId: c.edgeId,
			edge: c.edge,
			edges: { [c.edgeId]: c.edge },
			isSummarized: c.isSummarized,
			stroke: v.value,
			position: y.value,
			center: b.value,
			hovered: c.state.hovered,
			selected: c.state.selected,
			scale: unref(m),
			length: S.value,
			pointAtLength: C
		}, void 0, void 0, 1)]));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/components/base/VLine.vue_vue_type_script_setup_true_lang.js
var s$5 = [
	"d",
	"stroke",
	"stroke-width",
	"stroke-dasharray",
	"stroke-linecap"
];
// ../DnD helper/node_modules/v-network-graph/lib/components/base/VLine.vue.js
var t$30 = /* @__PURE__ */ defineComponent({
	__name: "VLine",
	props: {
		p1: {},
		p2: {},
		config: {}
	},
	setup(n) {
		let c = n, { strokeWidth: l, strokeDasharray: u, animationSpeed: d } = i$6(() => c.config);
		return (e, c) => (openBlock(), createElementBlock("path", {
			class: normalizeClass({
				"v-ng-line": !0,
				animate: n.config.animate
			}),
			d: `M ${n.p1.x} ${n.p1.y} L ${n.p2.x} ${n.p2.y}`,
			stroke: n.config.color,
			"stroke-width": unref(l),
			"stroke-dasharray": unref(u),
			"stroke-linecap": n.config.linecap,
			style: normalizeStyle(unref(d))
		}, null, 14, s$5));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/components/edge/VEdgeSummarized.vue.js
var t$29 = /* @__PURE__ */ defineComponent({
	__name: "VEdgeSummarized",
	props: {
		edges: {},
		layouts: {}
	},
	setup(f) {
		let b = f, x = h$5(), { handleEdgesPointerDownEvent: S, handleEdgesPointerOverEvent: C$6, handleEdgesPointerOutEvent: w, handleEdgesClickEvent: T, handleEdgesDoubleClickEvent: E, handleEdgesContextMenu: D } = p$4(), { edgeStates: O } = C(), k = ref({
			p1: {
				x: 0,
				y: 0
			},
			p2: {
				x: 0,
				y: 0
			}
		}), A = ref({
			x: 0,
			y: 0
		});
		watchEffect(() => {
			let e = w$1(O, b.edges);
			e && (k.value = e.position, A.value = {
				x: (k.value.p1.x + k.value.p2.x) / 2,
				y: (k.value.p1.y + k.value.p2.y) / 2
			});
		});
		let j = computed(() => Object.keys(b.edges)), M = computed(() => t.values(x.summarized.label, b.edges)), N = computed(() => t.values(x.summarized.shape, b.edges)), P = computed(() => t.values(x.summarized.stroke, b.edges)), { hovered: F, selectable: I, selected: L } = T$1(() => b.edges);
		return (e, t) => (openBlock(), createElementBlock("g", {
			class: normalizeClass({
				"v-ng-line-summarized": !0,
				hovered: unref(F),
				selectable: unref(I),
				selected: unref(L)
			}),
			onPointerdown: t[0] || (t[0] = withModifiers((e) => unref(S)(j.value, e), ["stop"])),
			onPointerenterPassive: t[1] || (t[1] = (e) => unref(C$6)(j.value, e)),
			onPointerleavePassive: t[2] || (t[2] = (e) => unref(w)(j.value, e)),
			onClick: t[3] || (t[3] = withModifiers((e) => unref(T)(j.value, e), ["stop"])),
			onDblclick: t[4] || (t[4] = withModifiers((e) => unref(E)(j.value, e), ["stop"])),
			onContextmenu: t[5] || (t[5] = (e) => unref(D)(j.value, e))
		}, [
			createVNode(t$30, mergeProps(k.value, {
				config: P.value,
				"data-edge-id": j.value[0]
			}), null, 16, ["config", "data-edge-id"]),
			createVNode(t$5, {
				"base-x": A.value.x,
				"base-y": A.value.y,
				config: N.value
			}, null, 8, [
				"base-x",
				"base-y",
				"config"
			]),
			createVNode(t$2, {
				text: Object.keys(f.edges).length.toString(),
				x: A.value.x,
				y: A.value.y,
				config: M.value,
				"text-anchor": "middle",
				"dominant-baseline": "central"
			}, null, 8, [
				"text",
				"x",
				"y",
				"config"
			])
		], 34));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/components/edge/VEdgeGroups.vue.js
var t$28 = /* @__PURE__ */ defineComponent({
	__name: "VEdgeGroups",
	props: { hasEdgeOverlaySlot: { type: Boolean } },
	setup(u) {
		let { edgeStates: _, edgeZOrderedList: v, layouts: y } = C();
		return (n, b) => (openBlock(!0), createElementBlock(Fragment, null, renderList(unref(v), (p) => (openBlock(), createElementBlock(Fragment, null, [unref(S$1)(p) ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [(openBlock(), createBlock(t$29, {
			key: p.key,
			edges: p.group.edges,
			layouts: unref(y).nodes
		}, null, 8, ["edges", "layouts"])), u.hasEdgeOverlaySlot && unref(w$1)(unref(_), p.group.edges) ? (openBlock(), createBlock(t$31, {
			key: p.key,
			edges: p.group.edges,
			state: unref(w$1)(unref(_), p.group.edges),
			"is-summarized": !0
		}, {
			default: withCtx((e) => [renderSlot(n.$slots, "default", mergeProps({ ref_for: !0 }, e))]),
			_: 3
		}, 8, ["edges", "state"])) : createCommentVNode("", !0)], 64)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [(openBlock(), createBlock(t$32, {
			id: p.key,
			key: p.key,
			state: unref(_)[p.key]
		}, null, 8, ["id", "state"])), u.hasEdgeOverlaySlot ? (openBlock(), createBlock(t$31, {
			key: p.key,
			"edge-id": p.key,
			edge: p.edge,
			state: unref(_)[p.key],
			"is-summarized": !1
		}, {
			default: withCtx((e) => [renderSlot(n.$slots, "default", mergeProps({ ref_for: !0 }, e))]),
			_: 3
		}, 8, [
			"edge-id",
			"edge",
			"state"
		])) : createCommentVNode("", !0)], 64))], 64))), 256));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/components/layers/VEdgesLayer.vue_vue_type_script_setup_true_lang.js
var u$6 = { class: "v-ng-layer-edges v-ng-graph-objects" };
// ../DnD helper/node_modules/v-network-graph/lib/components/layers/VEdgesLayer.vue.js
var t$27 = /* @__PURE__ */ defineComponent({
	__name: "VEdgesLayer",
	props: { edgeOverlay: { type: Function } },
	setup(o) {
		return (d, f) => (openBlock(), createElementBlock("g", u$6, [createVNode(t$33), createVNode(t$28, { "has-edge-overlay-slot": !!o.edgeOverlay }, createSlots({ _: 2 }, [o.edgeOverlay ? {
			name: "default",
			fn: withCtx((t) => [createVNode(unref(t$39), {
				render: o.edgeOverlay,
				"slot-props": t
			}, null, 8, ["render", "slot-props"])]),
			key: "0"
		} : void 0]), 1032, ["has-edge-overlay-slot"])]));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/components/node/VNodeFocusRing.vue.js
var t$26 = /* @__PURE__ */ defineComponent({
	__name: "VNodeFocusRing",
	props: {
		id: {},
		state: {}
	},
	setup(o) {
		let u = o, d = c$10(), f = computed(() => t$51(d.nodes, u.id)), p = computed(() => f.value.x), m = computed(() => f.value.y), h = m$4(), g = reactive({});
		return watchEffect(() => {
			let e = u.state.shape;
			if (e.type === "circle") {
				let t = {
					type: "circle",
					radius: e.radius + (e.strokeWidth ?? 0) / 2 + h.focusring.padding + h.focusring.width / 2,
					color: "none",
					strokeWidth: h.focusring.width,
					strokeColor: h.focusring.color,
					strokeDasharray: h.focusring.dasharray
				};
				Object.assign(g, t);
			} else {
				let t = {
					type: "rect",
					width: e.width + (e.strokeWidth ?? 0) + h.focusring.padding * 2 + h.focusring.width,
					height: e.height + (e.strokeWidth ?? 0) + h.focusring.padding * 2 + h.focusring.width,
					borderRadius: e.borderRadius > 0 ? e.borderRadius + h.focusring.padding : 0,
					color: "none",
					strokeWidth: h.focusring.width,
					strokeColor: h.focusring.color,
					strokeDasharray: h.focusring.dasharray
				};
				Object.assign(g, t);
			}
		}), (e, t) => (openBlock(), createBlock(t$5, {
			class: "v-ng-node-focusring",
			"base-x": p.value,
			"base-y": m.value,
			config: g
		}, null, 8, [
			"base-x",
			"base-y",
			"config"
		]));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/components/layers/VFocusringLayer.vue_vue_type_script_setup_true_lang.js
var u$4 = { class: "v-ng-layer-nodes-selections" };
// ../DnD helper/node_modules/v-network-graph/lib/components/layers/VFocusringLayer.vue.js
var t$25 = /* @__PURE__ */ defineComponent({
	__name: "VFocusringLayer",
	setup(o) {
		let { nodeStates: d } = C(), { selectedNodes: f } = a$5();
		return (e, t) => (openBlock(), createElementBlock("g", u$4, [(openBlock(!0), createElementBlock(Fragment, null, renderList(unref(f), (e) => (openBlock(), createBlock(t$26, {
			id: e,
			key: e,
			state: unref(d)[e]
		}, null, 8, ["id", "state"]))), 128))]));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/components/base/VTransitionGroup.vue_vue_type_script_setup_true_lang.js
var s$4 = { key: 1 };
// ../DnD helper/node_modules/v-network-graph/lib/components/base/VTransitionGroup.vue.js
var t$24 = /* @__PURE__ */ defineComponent({
	__name: "VTransitionGroup",
	props: { name: {} },
	setup(r) {
		return (c, l) => r.name ? (openBlock(), createBlock(TransitionGroup, {
			key: 0,
			name: r.name,
			tag: "g"
		}, {
			default: withCtx(() => [renderSlot(c.$slots, "default")]),
			_: 3
		}, 8, ["name"])) : (openBlock(), createElementBlock("g", s$4, [renderSlot(c.$slots, "default")]));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/modules/node/label.js
var r$2 = {
	[n$1.NORTH]: 0,
	[n$1.NORTH_EAST]: 1,
	[n$1.EAST]: 2,
	[n$1.SOUTH_EAST]: 3,
	[n$1.SOUTH]: 4,
	[n$1.SOUTH_WEST]: 5,
	[n$1.WEST]: 6,
	[n$1.NORTH_WEST]: 7,
	[n$1.CENTER]: -1
};
var i$5 = [
	(e, t) => o$1(e, 0, t ? 90 : 60),
	(e, t) => o$1(e, 45, t ? 90 : 45),
	(e, t) => o$1(e, 90, t ? 60 : 30),
	(e, t) => o$1(e, 135, t ? 90 : 45),
	(e, t) => o$1(e, 180, t ? 90 : 60),
	(e, t) => o$1(e, 225, t ? 90 : 45),
	(e, t) => o$1(e, 270, t ? 60 : 30),
	(e, t) => o$1(e, 315, t ? 90 : 45)
];
function a$3(r, a, o, l, u) {
	if (u === n$1.CENTER) return n$1.CENTER;
	let d = [];
	Object.entries(o).forEach(([e, i]) => {
		let o = !1;
		if (i.nodeId === r) {
			let t = l(e);
			t && (o = !0, i = {
				...i,
				pos: {
					x: t.x,
					y: t.y
				}
			});
		}
		let s = (v$4(r$18(i.pos, a)) + 360 + 90) % 360;
		d.push([s, o]);
	});
	let f = s$3(u), p = [
		f,
		(f + 4) % 8,
		(f + 2) % 8,
		(f - 2 + 8) % 8,
		(f + 1) % 8,
		(f - 1 + 8) % 8,
		(f + 3) % 8,
		(f - 3 + 8) % 8
	].find((e) => d.every((t) => !i$5[e](...t)));
	return p === void 0 ? u : c$3(p, u);
}
function o$1(e, t, n) {
	e %= 360;
	let r = (t - n + 360) % 360, i = (t + n) % 360;
	return r <= i ? r < e && e < i : r < e || e < i;
}
function s$3(e) {
	return r$2[e] ?? 0;
}
function c$3(e, t) {
	return Object.entries(r$2)[e]?.[0] ?? t;
}
// ../DnD helper/node_modules/v-network-graph/lib/composables/nodeLabelPlacement.js
var d$3 = ({ x: e, y: t }) => ({
	x: e,
	y: t
});
function f$4(f) {
	let { edgeStates: p } = C(), { scale: m } = o$13(), h = c$10(), g = u$15(), _ = computed(() => f.state.label.direction === n$1.CENTER ? 0 : f.state.label.margin * m.value), v = ref(0), y = ref(0), b = ref(0), x = ref(0), S = f.state.label, C$5 = [], w = () => {
		let { direction: e, directionAutoAdjustment: t } = S;
		if (t === !1) return e;
		let n = d$3(g.of(f.id)), r = toRaw(h).nodes, i = {};
		for (let [e, t] of C$5) t in r && (i[e] = {
			nodeId: t,
			pos: d$3(g.of(t))
		});
		return t === !0 ? a$3(f.state.id, n, i, (e) => {
			let t = p[e];
			if (!t?.loop) return;
			let { center: r } = t.loop, i = t.origin.p1;
			return {
				x: n.x + r.x - i.x,
				y: n.y + r.y - i.y
			};
		}, e) : t({
			nodeId: f.state.id,
			pos: n,
			oppositeNodes: i
		}) ?? e;
	}, T = shallowRef(f.state.label.direction), E = () => T.value = w();
	watchEffect(() => {
		S = f.state.label, C$5 = Object.entries(f.state.oppositeNodeIds), E();
	}), watchEffect((e) => {
		if (f.state.label.directionAutoAdjustment === !1) return;
		let t = (e) => e.has(f.id) || C$5.some(([, t]) => e.has(t)), n = g.onDrawn(E), r = g.onMoved((e) => t(e) && E());
		e(() => {
			n(), r();
		});
	});
	let D = computed(() => {
		switch (T.value) {
			case n$1.CENTER:
			case n$1.NORTH:
			case n$1.SOUTH: return "middle";
			case n$1.EAST:
			case n$1.NORTH_EAST:
			case n$1.SOUTH_EAST: return "start";
			case n$1.WEST:
			case n$1.NORTH_WEST:
			case n$1.SOUTH_WEST:
			default: return "end";
		}
	}), O = computed(() => {
		switch (T.value) {
			case n$1.NORTH:
			case n$1.NORTH_EAST:
			case n$1.NORTH_WEST: return "text-top";
			case n$1.SOUTH:
			case n$1.SOUTH_EAST:
			case n$1.SOUTH_WEST: return "hanging";
			case n$1.CENTER:
			case n$1.EAST:
			case n$1.WEST:
			default: return "central";
		}
	}), k = computed(() => {
		switch (T.value) {
			case n$1.CENTER:
			case n$1.NORTH:
			case n$1.SOUTH: return 0;
			case n$1.EAST: return y.value;
			case n$1.WEST: return -y.value;
			case n$1.NORTH_EAST:
			case n$1.SOUTH_EAST: return x.value;
			case n$1.NORTH_WEST:
			case n$1.SOUTH_WEST:
			default: return -x.value;
		}
	}), A = computed(() => {
		switch (T.value) {
			case n$1.NORTH: return -v.value;
			case n$1.SOUTH: return v.value;
			case n$1.CENTER:
			case n$1.EAST:
			case n$1.WEST: return 0;
			case n$1.NORTH_EAST:
			case n$1.NORTH_WEST: return -b.value;
			case n$1.SOUTH_EAST:
			case n$1.SOUTH_WEST:
			default: return b.value;
		}
	});
	return watchEffect(() => {
		let e = m.value, t = f.state.shape;
		if (t.type == "circle") {
			let n = t.radius * e, r = n + _.value, i = Math.sqrt(r ** 2 / 2);
			v.value = n + _.value, y.value = n + _.value, b.value = i, x.value = i;
		} else {
			let n = t.borderRadius * e, r = t.width * e, i = t.height * e, a = n + _.value, o = Math.sqrt(a ** 2 / 2);
			v.value = i / 2 + _.value, y.value = r / 2 + _.value, b.value = i / 2 - n + o, x.value = r / 2 - n + o;
		}
	}), {
		textAnchor: D,
		dominantBaseline: O,
		labelX: k,
		labelY: A
	};
}
// ../DnD helper/node_modules/v-network-graph/lib/components/node/VNodeLabel.vue.js
var t$23 = /* @__PURE__ */ defineComponent({
	__name: "VNodeLabel",
	props: {
		id: {},
		state: {},
		overrideNodeLabel: {
			type: Function,
			default: void 0
		}
	},
	setup(d) {
		let y = d, b = m$4(), { scale: x } = o$13(), { handleNodePointerDownEvent: S, handleNodePointerOverEvent: C, handleNodePointerOutEvent: w, handleNodeClickEvent: T, handleNodeDoubleClickEvent: E, handleNodeContextMenu: D } = p$4(), O = u$12().nodeRef(y.id), { textAnchor: k, dominantBaseline: A, labelX: j, labelY: M } = f$4(y), N = computed(() => (e) => b.label.handleNodeEvents ? {
			pointerdown: (t) => {
				t.stopPropagation(), S(e, t);
			},
			pointerenter: (t) => C(e, t),
			pointerleave: (t) => w(e, t),
			click: (t) => {
				t.stopPropagation(), T(e, t);
			},
			dblclick: (t) => {
				t.stopPropagation(), E(e, t);
			},
			contextmenu: (t) => {
				D(e, t);
			}
		} : {}), P = computed(() => {
			let e = b.label.handleNodeEvents;
			return {
				"v-ng-node-label": !0,
				hover: e && y.state.hovered,
				selected: e && y.state.selected
			};
		}), F = computed(() => {
			let e = b.label.handleNodeEvents;
			return {
				draggable: e && y.state.draggable,
				selectable: e && y.state.selectable
			};
		}), I = computed(() => ({
			nodeId: y.id,
			scale: x.value,
			text: y.state.labelText,
			x: j.value,
			y: M.value,
			config: y.state.label,
			shape: y.state.shape,
			textAnchor: k.value,
			dominantBaseline: A.value,
			class: F.value
		})), L = computed(() => ({
			text: y.state.labelText,
			config: y.state.label,
			"text-anchor": k.value,
			dominantBaseline: A.value,
			class: F.value,
			transform: `translate(${j.value} ${M.value})`
		}));
		return (e, t) => (openBlock(), createElementBlock("g", mergeProps({
			ref: unref(O),
			class: P.value
		}, toHandlers(N.value(d.id), !0)), [d.overrideNodeLabel ? (openBlock(), createBlock(unref(t$39), {
			key: 0,
			render: d.overrideNodeLabel,
			"slot-props": I.value
		}, {
			default: withCtx(() => [createVNode(t$2, normalizeProps(guardReactiveProps(L.value)), null, 16)]),
			_: 1
		}, 8, ["render", "slot-props"])) : (openBlock(), createBlock(t$2, normalizeProps(mergeProps({ key: 1 }, L.value)), null, 16))], 16));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/components/layers/VNodeLabelsLayer.vue.js
var t$22 = /* @__PURE__ */ defineComponent({
	__name: "VNodeLabelsLayer",
	props: { overrideNodeLabel: { type: Function } },
	setup(c) {
		let { nodeZOrderedList: p } = C(), m = m$4(), h = computed(() => g(p.value));
		function g(e) {
			return e.filter((e) => e.label.visible && (e.labelText ?? !1));
		}
		return (e, t) => (openBlock(), createBlock(t$24, {
			name: unref(m).transition,
			class: "v-ng-layer-node-labels v-ng-graph-objects"
		}, {
			default: withCtx(() => [(openBlock(!0), createElementBlock(Fragment, null, renderList(h.value, (e) => (openBlock(), createBlock(t$23, {
				id: e.id,
				key: e.id,
				state: e,
				"override-node-label": c.overrideNodeLabel
			}, null, 8, [
				"id",
				"state",
				"override-node-label"
			]))), 128))]),
			_: 1
		}, 8, ["name"]));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/components/node/VNode.vue.js
var t$21 = /* @__PURE__ */ defineComponent({
	__name: "VNode",
	props: {
		id: {},
		state: {},
		overrideNode: {
			type: Function,
			default: void 0
		}
	},
	setup(l) {
		let h = l, g = u$12().nodeRef(h.id), { scale: _ } = o$13(), v = computed(() => ({
			draggable: h.state.draggable,
			selectable: h.state.selectable
		})), { handleNodePointerDownEvent: y, handleNodePointerOverEvent: b, handleNodePointerOutEvent: x, handleNodeClickEvent: S, handleNodeDoubleClickEvent: C, handleNodeContextMenu: w } = p$4();
		return (e, t) => (openBlock(), createElementBlock("g", {
			ref: unref(g),
			class: normalizeClass({
				"v-ng-node": !0,
				hover: l.state.hovered,
				selected: l.state.selected
			}),
			onPointerdown: t[0] || (t[0] = withModifiers((e) => unref(y)(l.id, e), ["stop"])),
			onPointerenterPassive: t[1] || (t[1] = (e) => unref(b)(l.id, e)),
			onPointerleavePassive: t[2] || (t[2] = (e) => unref(x)(l.id, e)),
			onClick: t[3] || (t[3] = withModifiers((e) => unref(S)(l.id, e), ["stop"])),
			onDblclick: t[4] || (t[4] = withModifiers((e) => unref(C)(l.id, e), ["stop"])),
			onContextmenu: t[5] || (t[5] = (e) => unref(w)(l.id, e))
		}, [l.overrideNode ? (openBlock(), createBlock(unref(t$39), {
			key: 0,
			render: l.overrideNode,
			"slot-props": {
				nodeId: l.id,
				scale: unref(_),
				config: l.state.shape,
				class: v.value
			}
		}, {
			default: withCtx(() => [createVNode(t$5, {
				config: l.state.shape,
				class: normalizeClass(["v-ng-node-default", v.value])
			}, null, 8, ["config", "class"])]),
			_: 1
		}, 8, ["render", "slot-props"])) : (openBlock(), createBlock(t$5, {
			key: 1,
			config: l.state.shape,
			class: normalizeClass(["v-ng-node-default", v.value])
		}, null, 8, ["config", "class"]))], 34));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/components/layers/VNodesLayer.vue.js
var t$20 = /* @__PURE__ */ defineComponent({
	__name: "VNodesLayer",
	props: { overrideNode: { type: Function } },
	setup(s) {
		let { nodeZOrderedList: f } = C(), p = m$4();
		return (e, t) => (openBlock(), createBlock(t$24, {
			name: unref(p).transition,
			class: "v-ng-layer-nodes v-ng-graph-objects"
		}, {
			default: withCtx(() => [(openBlock(!0), createElementBlock(Fragment, null, renderList(unref(f), (e) => (openBlock(), createBlock(t$21, {
				id: e.id,
				key: e.id,
				state: e,
				"override-node": s.overrideNode
			}, null, 8, [
				"id",
				"state",
				"override-node"
			]))), 128))]),
			_: 1
		}, 8, ["name"]));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/components/path/VPath.vue_vue_type_script_setup_true_lang.js
var m$1 = [
	"d",
	"stroke",
	"stroke-width",
	"stroke-dasharray",
	"stroke-linecap",
	"stroke-linejoin"
];
// ../DnD helper/node_modules/v-network-graph/lib/components/path/VPath.vue.js
var t$19 = /* @__PURE__ */ defineComponent({
	__name: "VPath",
	props: { path: {} },
	setup(l) {
		let h = l, { nodeStates: g, edgeStates: _, layouts: v } = C(), { scale: y } = o$13(), b = g$3();
		function x(e) {
			if (e.edges.length === 0) return [];
			let n = t.value(b.margin, e.path) * y.value;
			return g$4(e, g, v.nodes, _, y.value, b.curveInNode, b.end, n);
		}
		function S(e) {
			let t = x(e), n = !0;
			return t.map((e) => {
				if (e === null) n = !0;
				else if (typeof e == "string") return e;
				else if (e instanceof Array) {
					e = [...e];
					let t = [];
					if (e.length % 2 == 1) {
						let n = e[0];
						e = e.slice(1), t.push(`L ${n.x} ${n.y}`);
					}
					return t.push(..._$6(e)), t.join(" ");
				} else {
					let t = n;
					return n = !1, `${t ? "M " : "L "}${e.x} ${e.y}`;
				}
			}).join(" ");
		}
		let C$4 = computed(() => {
			let e = h.path;
			return e.selected ? t.values(b.selected, e.path) : e.hovered && b.hover ? t.values(b.hover, e.path) : t.values(b.normal, e.path);
		}), { strokeWidth: w, strokeDasharray: T, animationSpeed: E } = i$6(() => C$4.value);
		return (e, t) => (openBlock(), createElementBlock("path", {
			class: normalizeClass({
				"v-ng-path": !0,
				animate: C$4.value.animate,
				clickable: l.path.clickable,
				hoverable: l.path.hoverable
			}),
			d: S(l.path),
			fill: "none",
			stroke: C$4.value.color,
			"stroke-width": unref(w),
			"stroke-dasharray": unref(T),
			"stroke-linecap": C$4.value.linecap,
			"stroke-linejoin": C$4.value.linejoin,
			style: normalizeStyle(unref(E))
		}, null, 14, m$1));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/components/path/VPaths.vue.js
var t$18 = /* @__PURE__ */ defineComponent({
	__name: "VPaths",
	setup(c) {
		let { pathZOrderedList: m } = C(), h = g$3(), { handlePathPointerDownEvent: g, handlePathPointerOverEvent: _, handlePathPointerOutEvent: v, handlePathClickEvent: y, handlePathDoubleClickEvent: b, handlePathContextMenu: x } = p$4();
		return (e, t) => (openBlock(), createBlock(t$24, {
			name: unref(h).transition,
			class: "v-ng-paths v-ng-layer-paths v-ng-graph-objects"
		}, {
			default: withCtx(() => [(openBlock(!0), createElementBlock(Fragment, null, renderList(unref(m), (e) => (openBlock(), createBlock(t$19, {
				key: e.id,
				path: e,
				onPointerdown: (t) => unref(g)(e.id, t),
				onPointerenterPassive: (t) => unref(_)(e.id, t),
				onPointerleavePassive: (t) => unref(v)(e.id, t),
				onClick: withModifiers((t) => unref(y)(e.id, t), ["stop"]),
				onDblclick: withModifiers((t) => unref(b)(e.id, t), ["stop"]),
				onContextmenu: (t) => unref(x)(e.id, t)
			}, null, 8, [
				"path",
				"onPointerdown",
				"onPointerenterPassive",
				"onPointerleavePassive",
				"onClick",
				"onDblclick",
				"onContextmenu"
			]))), 128))]),
			_: 1
		}, 8, ["name"]));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/components/layers/VPathsLayer.vue.js
var t$17 = /* @__PURE__ */ defineComponent({
	__name: "VPathsLayer",
	setup(n) {
		return (n, i) => (openBlock(), createBlock(t$18));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/components/marker/VMarkerHeadAngle.vue_vue_type_script_setup_true_lang.js
var i$3 = [
	"points",
	"stroke-width",
	"stroke"
];
// ../DnD helper/node_modules/v-network-graph/lib/components/marker/VMarkerHeadAngle.vue.js
var t$16 = /* @__PURE__ */ defineComponent({
	__name: "VMarkerHeadAngle",
	props: {
		width: {},
		height: {},
		refX: {},
		color: {},
		isSource: { type: Boolean },
		units: {}
	},
	setup(n) {
		let a = n, o = computed(() => a.units === "strokeWidth" ? 1 : Math.min(a.width, a.height) / 5), s = computed(() => {
			let e = o.value / 2, t = a.width, n = a.height;
			return a.isSource ? `${t - e} ${n - e}, ${e} ${n / 2}, ${t - e} ${e}` : `${e} ${e}, ${t - e} ${n / 2}, ${e} ${n - e}`;
		});
		return (e, a) => (openBlock(), createElementBlock("polyline", {
			points: s.value,
			fill: "none",
			"stroke-width": o.value,
			stroke: n.color,
			"stroke-linecap": "round",
			"stroke-linejoin": "round"
		}, null, 8, i$3));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/components/marker/VMarkerHeadArrow.vue_vue_type_script_setup_true_lang.js
var i$2 = ["points", "fill"];
// ../DnD helper/node_modules/v-network-graph/lib/components/marker/VMarkerHeadArrow.vue.js
var t$15 = /* @__PURE__ */ defineComponent({
	__name: "VMarkerHeadArrow",
	props: {
		width: {},
		height: {},
		refX: {},
		color: {},
		isSource: { type: Boolean },
		units: {}
	},
	setup(n) {
		let a = n, o = computed(() => {
			let e = a.width, t = a.height;
			return a.isSource ? `${e} ${t}, 0 ${t / 2}, ${e} 0` : `0 0, ${e} ${t / 2}, 0 ${t}`;
		});
		return (e, a) => (openBlock(), createElementBlock("polygon", {
			points: o.value,
			fill: n.color
		}, null, 8, i$2));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/components/marker/VMarkerHeadCircle.vue_vue_type_script_setup_true_lang.js
var r$1 = [
	"fill",
	"cx",
	"cy",
	"rx",
	"ry"
];
// ../DnD helper/node_modules/v-network-graph/lib/components/marker/VMarkerHeadCircle.vue.js
var t$14 = /* @__PURE__ */ defineComponent({
	__name: "VMarkerHeadCircle",
	props: {
		width: {},
		height: {},
		refX: {},
		color: {},
		isSource: { type: Boolean },
		units: {}
	},
	setup(t) {
		return (i, a) => (openBlock(), createElementBlock("ellipse", {
			fill: t.color,
			cx: t.width / 2,
			cy: t.height / 2,
			rx: t.width / 2,
			ry: t.height / 2
		}, null, 8, r$1));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/components/marker/VMarkerHead.vue_vue_type_script_setup_true_lang.js
var u$3 = [
	"id",
	"markerWidth",
	"markerHeight",
	"refX",
	"refY",
	"markerUnits"
];
// ../DnD helper/node_modules/v-network-graph/lib/components/marker/VMarkerHead.vue.js
var t$13 = /* @__PURE__ */ defineComponent({
	__name: "VMarkerHead",
	props: {
		id: {},
		marker: {},
		scale: {}
	},
	setup(s) {
		let d = {
			arrow: t$15,
			angle: t$16,
			circle: t$14
		}, f = s, p = computed(() => f.marker.width * (f.marker.units === "strokeWidth" ? 1 : f.scale)), m = computed(() => f.marker.height * (f.marker.units === "strokeWidth" ? 1 : f.scale)), h = computed(() => {
			let e = f.marker.margin * (f.marker.units === "strokeWidth" ? 1 : f.scale);
			return f.marker.isSource ? p.value + e : -e;
		}), g = computed(() => {
			let e = f.marker.offset * (f.marker.units === "strokeWidth" ? 1 : f.scale);
			return f.marker.isSource ? e : -e;
		});
		return (e, t) => s.marker.type !== "none" && s.marker.type !== "custom" ? (openBlock(), createElementBlock("marker", {
			key: 0,
			id: s.id,
			markerWidth: p.value,
			markerHeight: m.value,
			refX: h.value,
			refY: m.value / 2 + g.value,
			orient: "auto",
			markerUnits: s.marker.units,
			class: "v-ng-marker"
		}, [(openBlock(), createBlock(resolveDynamicComponent(d[s.marker.type]), {
			width: p.value,
			height: m.value,
			refX: h.value,
			color: s.marker.color,
			"is-source": s.marker.isSource,
			units: s.marker.units
		}, null, 8, [
			"width",
			"height",
			"refX",
			"color",
			"is-source",
			"units"
		]))], 8, u$3)) : createCommentVNode("", !0);
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/components/VNetworkGraph.vue_vue_type_script_setup_true_lang.js
var O = { key: 0 };
// ../DnD helper/node_modules/v-network-graph/lib/components/VNetworkGraph.vue.js
var t$3 = /* @__PURE__ */ defineComponent({
	__name: "VNetworkGraph",
	props: {
		nodes: { default: () => ({}) },
		edges: { default: () => ({}) },
		paths: { default: () => ({}) },
		layouts: { default: () => ({}) },
		zoomLevel: { default: 1 },
		selectedNodes: { default: () => [] },
		selectedEdges: { default: () => [] },
		selectedPaths: { default: () => [] },
		configs: { default: () => ({}) },
		layers: { default: () => ({}) },
		eventHandlers: { default: () => ({}) }
	},
	emits: [
		"update:zoomLevel",
		"update:layouts",
		"update:selectedNodes",
		"update:selectedEdges",
		"update:selectedPaths"
	],
	setup(v, { expose: k, emit: A }) {
		let j = v, M = A, N = useSlots(), { objects: P, isInCompatibilityModeForPath: F } = n$3(toRef(j, "paths")), { configs: I, layerDefs: L, isShowGrid: te, isShowBackgroundViewport: R, builtInLayerOrder: z, canvas: B, markerState: V, dragging: H, touches: U, isBoxSelectionMode: W, selectionBox: G, methods: K } = x(j, M, {
			configs: toRef(j, "configs"),
			slots: N,
			paths: {
				objects: P,
				isInCompatibilityMode: F,
				props: j,
				emit: M
			}
		}), { container: q, svg: J, viewport: Y, show: X, scale: Z } = B, { transitionWhile: Q, transitionOption: $ } = r$4(), ne = computed(() => {
			let e = $.value;
			return e.enabled ? {
				"--transition-duration": e.duration + "ms",
				"--transition-function": e.timingFunction
			} : {};
		});
		return k({
			...K,
			transitionWhile: Q
		}), (e, t) => (openBlock(), createElementBlock("div", {
			ref_key: "container",
			ref: q,
			class: "v-network-graph v-ng-container"
		}, [(openBlock(), createElementBlock("svg", {
			ref_key: "svg",
			ref: J,
			class: normalizeClass(["v-ng-canvas", {
				show: unref(X),
				dragging: unref(H),
				touches: unref(U),
				"box-selection-mode": unref(W)
			}]),
			width: "100%",
			height: "100%"
		}, [
			(openBlock(!0), createElementBlock(Fragment, null, renderList(unref(L).root, (t) => renderSlot(e.$slots, t, { scale: unref(Z) }, void 0, void 0, t)), 128)),
			Object.keys(unref(V).markers).length > 0 ? (openBlock(), createElementBlock("defs", O, [(openBlock(!0), createElementBlock(Fragment, null, renderList(unref(V).markers, (e, t) => (openBlock(), createBlock(t$13, {
				id: t,
				key: t,
				marker: e,
				scale: unref(Z)
			}, null, 8, [
				"id",
				"marker",
				"scale"
			]))), 128))])) : createCommentVNode("", !0),
			unref(R) ? (openBlock(), createBlock(t$41, { key: 1 }, {
				default: withCtx(() => [
					(openBlock(!0), createElementBlock(Fragment, null, renderList(unref(L).background, (t) => (openBlock(), createElementBlock("g", {
						key: t,
						class: "v-ng-layer"
					}, [renderSlot(e.$slots, t, { scale: unref(Z) })]))), 128)),
					unref(te) ? (openBlock(), createBlock(t$42, { key: 0 })) : createCommentVNode("", !0),
					(openBlock(!0), createElementBlock(Fragment, null, renderList(unref(L).grid, (t) => (openBlock(), createElementBlock("g", {
						key: t,
						class: "v-ng-layer"
					}, [renderSlot(e.$slots, t, { scale: unref(Z) })]))), 128))
				]),
				_: 3
			})) : createCommentVNode("", !0),
			createBaseVNode("g", {
				ref_key: "viewport",
				ref: Y,
				class: normalizeClass(["v-ng-viewport", { "v-ng-transition": unref($).enabled }]),
				style: normalizeStyle(ne.value)
			}, [(openBlock(!0), createElementBlock(Fragment, null, renderList(unref(L).base, (t) => (openBlock(), createElementBlock("g", {
				key: t,
				class: "v-ng-layer"
			}, [renderSlot(e.$slots, t, { scale: unref(Z) })]))), 128)), (openBlock(!0), createElementBlock(Fragment, null, renderList(unref(z), (t) => (openBlock(), createElementBlock(Fragment, { key: t }, [t === "edges" ? (openBlock(), createBlock(t$27, {
				key: 0,
				"edge-overlay": N["edge-overlay"]
			}, null, 8, ["edge-overlay"])) : t === "edge-labels" ? (openBlock(), createBlock(t$35, {
				key: 1,
				"edge-label": N["edge-label"],
				"edges-label": N["edges-label"]
			}, null, 8, ["edge-label", "edges-label"])) : t === "focusring" ? (openBlock(), createBlock(t$25, { key: 2 })) : t === "nodes" ? (openBlock(), createBlock(t$20, {
				key: 3,
				"override-node": N["override-node"]
			}, null, 8, ["override-node"])) : t === "node-labels" ? (openBlock(), createBlock(t$22, {
				key: 4,
				"override-node-label": N["override-node-label"]
			}, null, 8, ["override-node-label"])) : t === "paths" ? (openBlock(), createBlock(t$17, { key: 5 })) : createCommentVNode("", !0), (openBlock(!0), createElementBlock(Fragment, null, renderList(unref(L)[t], (t) => (openBlock(), createElementBlock("g", {
				key: t,
				class: "v-ng-layer"
			}, [renderSlot(e.$slots, t, { scale: unref(Z) })]))), 128))], 64))), 128))], 6),
			unref(G) ? (openBlock(), createBlock(t$40, {
				key: 2,
				box: unref(G),
				config: unref(I).view.selection.box
			}, null, 8, ["box", "config"])) : createCommentVNode("", !0)
		], 2))], 512));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/components/lite/VLiteEdge.vue.js
var t$12 = /* @__PURE__ */ defineComponent({
	__name: "VLiteEdge",
	props: {
		id: {},
		state: {}
	},
	setup(a) {
		let f = a, { strokeWidth: p, strokeDasharray: m, animationSpeed: h } = i$6(() => f.state.line.stroke), g = u$12().edgeRef(f.id), _ = computed(() => !!f.state.loop), { handleEdgePointerDownEvent: v, handleEdgePointerOverEvent: y, handleEdgePointerOutEvent: b, handleEdgeClickEvent: x, handleEdgeDoubleClickEvent: S, handleEdgeContextMenu: C } = p$4();
		return (e, t) => (openBlock(), createBlock(resolveDynamicComponent(_.value ? "path" : "line"), {
			ref: unref(g),
			class: normalizeClass({
				"v-ng-edge": !0,
				"v-ng-line": !0,
				"v-ng-lite-edge": !0,
				animate: a.state.line.stroke.animate,
				selectable: a.state.selectable,
				hover: a.state.hovered,
				selected: a.state.selected
			}),
			fill: _.value ? "none" : void 0,
			stroke: a.state.line.stroke.color,
			"stroke-width": unref(p),
			"stroke-dasharray": unref(m),
			"stroke-linecap": a.state.line.stroke.linecap,
			style: normalizeStyle(unref(h)),
			"data-edge-id": a.id,
			"marker-start": a.state.sourceMarkerId ? `url('#${a.state.sourceMarkerId}')` : void 0,
			"marker-end": a.state.targetMarkerId ? `url('#${a.state.targetMarkerId}')` : void 0,
			onPointerdown: t[0] || (t[0] = withModifiers((e) => unref(v)(a.id, e), ["stop"])),
			onPointerenterPassive: t[1] || (t[1] = (e) => unref(y)(a.id, e)),
			onPointerleavePassive: t[2] || (t[2] = (e) => unref(b)(a.id, e)),
			onClick: t[3] || (t[3] = withModifiers((e) => unref(x)(a.id, e), ["stop"])),
			onDblclick: t[4] || (t[4] = withModifiers((e) => unref(S)(a.id, e), ["stop"])),
			onContextmenu: t[5] || (t[5] = (e) => unref(C)(a.id, e))
		}, null, 40, [
			"class",
			"fill",
			"stroke",
			"stroke-width",
			"stroke-dasharray",
			"stroke-linecap",
			"style",
			"data-edge-id",
			"marker-start",
			"marker-end"
		]));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/components/lite/VLiteEdgesLayer.vue_vue_type_script_setup_true_lang.js
var d$1 = { class: "v-ng-layer-edges v-ng-graph-objects" };
// ../DnD helper/node_modules/v-network-graph/lib/components/lite/VLiteEdgesLayer.vue.js
var t$11 = /* @__PURE__ */ defineComponent({
	__name: "VLiteEdgesLayer",
	setup(s) {
		let { edgeStates: f, edgeZOrderedList: p } = C();
		return (t, s) => (openBlock(), createElementBlock("g", d$1, [(openBlock(!0), createElementBlock(Fragment, null, renderList(unref(p), (t) => (openBlock(), createElementBlock(Fragment, { key: t.key }, [unref(S$1)(t) ? createCommentVNode("", !0) : (openBlock(), createBlock(t$12, {
			key: 0,
			id: t.key,
			state: unref(f)[t.key]
		}, null, 8, ["id", "state"]))], 64))), 128))]));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/components/lite/VLiteNodeLabel.vue_vue_type_script_setup_true_lang.js
var _ = [
	"x",
	"y",
	"text-anchor",
	"dominant-baseline",
	"font-family",
	"font-size",
	"fill"
];
var v = [
	"x",
	"dy",
	"dominant-baseline"
];
// ../DnD helper/node_modules/v-network-graph/lib/components/lite/VLiteNodeLabel.vue.js
var t$10 = /* @__PURE__ */ defineComponent({
	__name: "VLiteNodeLabel",
	props: {
		id: {},
		state: {}
	},
	setup(u) {
		let y = u, b = m$4(), x = u$12().nodeRef(y.id), { textAnchor: S, dominantBaseline: C, labelX: w, labelY: T } = f$4(y), { texts: E, fontSize: D, lineHeight: O, topDeltaY: k } = n$10({
			get text() {
				return y.state.labelText;
			},
			get config() {
				return y.state.label;
			},
			get dominantBaseline() {
				return C.value;
			}
		}), { handleNodePointerDownEvent: A, handleNodePointerOverEvent: j, handleNodePointerOutEvent: M, handleNodeClickEvent: N, handleNodeDoubleClickEvent: P, handleNodeContextMenu: F } = p$4(), I = computed(() => {
			if (!b.label.handleNodeEvents) return {};
			let e = y.id;
			return {
				pointerdown: (t) => {
					t.stopPropagation(), A(e, t);
				},
				pointerenter: (t) => j(e, t),
				pointerleave: (t) => M(e, t),
				click: (t) => {
					t.stopPropagation(), N(e, t);
				},
				dblclick: (t) => {
					t.stopPropagation(), P(e, t);
				},
				contextmenu: (t) => F(e, t)
			};
		}), L = computed(() => {
			let e = b.label.handleNodeEvents;
			return {
				"v-ng-node-label": !0,
				"v-ng-lite-node-label": !0,
				"v-ng-text": !0,
				hover: e && y.state.hovered,
				selected: e && y.state.selected,
				draggable: e && y.state.draggable,
				selectable: e && y.state.selectable
			};
		});
		return (e, t) => (openBlock(), createElementBlock("g", { ref: unref(x) }, [createBaseVNode("text", mergeProps({
			class: L.value,
			x: unref(w),
			y: unref(T),
			"text-anchor": unref(S),
			"dominant-baseline": unref(C),
			"font-family": u.state.label.fontFamily,
			"font-size": unref(D),
			fill: u.state.label.color
		}, toHandlers(I.value, !0)), [unref(E).length <= 1 ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [createTextVNode(toDisplayString(u.state.labelText), 1)], 64)) : (openBlock(!0), createElementBlock(Fragment, { key: 1 }, renderList(unref(E), (e, t) => (openBlock(), createElementBlock("tspan", {
			key: t,
			x: unref(w),
			dy: unref(t == 0 ? k : O),
			"dominant-baseline": unref(C)
		}, toDisplayString(e), 9, v))), 128))], 16, _)], 512));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/components/lite/VLiteNodeLabelsLayer.vue_vue_type_script_setup_true_lang.js
var l$2 = { class: "v-ng-layer-node-labels v-ng-graph-objects" };
// ../DnD helper/node_modules/v-network-graph/lib/components/lite/VLiteNodeLabelsLayer.vue.js
var t$9 = /* @__PURE__ */ defineComponent({
	__name: "VLiteNodeLabelsLayer",
	setup(o) {
		let { nodeZOrderedList: u } = C(), d = computed(() => u.value.filter((e) => e.label.visible && (e.labelText ?? !1)));
		return (e, r) => (openBlock(), createElementBlock("g", l$2, [(openBlock(!0), createElementBlock(Fragment, null, renderList(d.value, (e) => (openBlock(), createBlock(t$10, {
			id: e.id,
			key: e.id,
			state: e
		}, null, 8, ["id", "state"]))), 128))]));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/components/lite/VLiteNode.vue_vue_type_script_setup_true_lang.js
var u$1 = [
	"cx",
	"cy",
	"r",
	"fill",
	"stroke",
	"stroke-width",
	"stroke-dasharray"
];
var d = [
	"x",
	"y",
	"width",
	"height",
	"rx",
	"ry",
	"fill",
	"stroke",
	"stroke-width",
	"stroke-dasharray"
];
// ../DnD helper/node_modules/v-network-graph/lib/components/lite/VLiteNode.vue.js
var t$8 = /* @__PURE__ */ defineComponent({
	__name: "VLiteNode",
	props: {
		id: {},
		state: {}
	},
	setup(a) {
		let f = a, p = u$12().nodeRef(f.id), { x: m, y: h, strokeWidth: g, strokeColor: _, strokeDasharray: v, radius: y, width: b, height: x, borderRadius: S } = i$14({
			get config() {
				return f.state.shape;
			},
			baseX: 0,
			baseY: 0
		}), C = computed(() => ({
			"v-ng-node": !0,
			"v-ng-lite-node": !0,
			hover: f.state.hovered,
			selected: f.state.selected,
			draggable: f.state.draggable,
			selectable: f.state.selectable
		})), { handleNodePointerDownEvent: w, handleNodePointerOverEvent: T, handleNodePointerOutEvent: E, handleNodeClickEvent: D, handleNodeDoubleClickEvent: O, handleNodeContextMenu: k } = p$4();
		return (e, t) => a.state.shape.type === "circle" ? (openBlock(), createElementBlock("circle", {
			key: 0,
			ref: unref(p),
			class: normalizeClass(C.value),
			cx: unref(m),
			cy: unref(h),
			r: unref(y),
			fill: a.state.shape.color,
			stroke: unref(_),
			"stroke-width": unref(g),
			"stroke-dasharray": unref(v),
			onPointerdown: t[0] || (t[0] = withModifiers((e) => unref(w)(a.id, e), ["stop"])),
			onPointerenterPassive: t[1] || (t[1] = (e) => unref(T)(a.id, e)),
			onPointerleavePassive: t[2] || (t[2] = (e) => unref(E)(a.id, e)),
			onClick: t[3] || (t[3] = withModifiers((e) => unref(D)(a.id, e), ["stop"])),
			onDblclick: t[4] || (t[4] = withModifiers((e) => unref(O)(a.id, e), ["stop"])),
			onContextmenu: t[5] || (t[5] = (e) => unref(k)(a.id, e))
		}, null, 42, u$1)) : (openBlock(), createElementBlock("rect", {
			key: 1,
			ref: unref(p),
			class: normalizeClass(C.value),
			x: unref(m),
			y: unref(h),
			width: unref(b),
			height: unref(x),
			rx: unref(S),
			ry: unref(S),
			fill: a.state.shape.color,
			stroke: unref(_),
			"stroke-width": unref(g),
			"stroke-dasharray": unref(v),
			onPointerdown: t[6] || (t[6] = withModifiers((e) => unref(w)(a.id, e), ["stop"])),
			onPointerenterPassive: t[7] || (t[7] = (e) => unref(T)(a.id, e)),
			onPointerleavePassive: t[8] || (t[8] = (e) => unref(E)(a.id, e)),
			onClick: t[9] || (t[9] = withModifiers((e) => unref(D)(a.id, e), ["stop"])),
			onDblclick: t[10] || (t[10] = withModifiers((e) => unref(O)(a.id, e), ["stop"])),
			onContextmenu: t[11] || (t[11] = (e) => unref(k)(a.id, e))
		}, null, 42, d));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/components/lite/VLiteNodesLayer.vue_vue_type_script_setup_true_lang.js
var l$1 = { class: "v-ng-layer-nodes v-ng-graph-objects" };
// ../DnD helper/node_modules/v-network-graph/lib/components/lite/VLiteNodesLayer.vue.js
var t$7 = /* @__PURE__ */ defineComponent({
	__name: "VLiteNodesLayer",
	setup(a) {
		let { nodeZOrderedList: u } = C();
		return (e, a) => (openBlock(), createElementBlock("g", l$1, [(openBlock(!0), createElementBlock(Fragment, null, renderList(unref(u), (e) => (openBlock(), createBlock(t$8, {
			id: e.id,
			key: e.id,
			state: e
		}, null, 8, ["id", "state"]))), 128))]));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/components/VNetworkGraphLite.vue_vue_type_script_setup_true_lang.js
var w = { key: 0 };
// ../DnD helper/node_modules/v-network-graph/lib/components/VNetworkGraphLite.vue.js
var t$4 = /* @__PURE__ */ defineComponent({
	__name: "VNetworkGraphLite",
	props: {
		nodes: { default: () => ({}) },
		edges: { default: () => ({}) },
		layouts: { default: () => ({}) },
		zoomLevel: { default: 1 },
		selectedNodes: { default: () => [] },
		selectedEdges: { default: () => [] },
		configs: { default: () => ({}) },
		layers: { default: () => ({}) },
		eventHandlers: { default: () => ({}) }
	},
	emits: [
		"update:zoomLevel",
		"update:layouts",
		"update:selectedNodes",
		"update:selectedEdges"
	],
	setup(g, { expose: T, emit: E }) {
		let D = [
			"edges",
			"nodes",
			"node-labels"
		], O = g, k = E, A = useSlots(), j = c$11.filter((e) => e in A).map((e) => `#${e}`);
		j.length > 0 && console.warn(`VNetworkGraphLite does not support ${j.join(", ")}.`);
		let { configs: N, layerDefs: P, isShowGrid: F, isShowBackgroundViewport: I, builtInLayerOrder: L, canvas: R, markerState: z, dragging: B, touches: V, isBoxSelectionMode: H, selectionBox: U, getLayouts: W, methods: G } = x(O, k, {
			configs: computed(() => ({
				...O.configs,
				edge: {
					...O.configs.edge,
					type: "straight",
					summarize: !1
				}
			})),
			slots: A,
			builtInLayers: D,
			drawAheadDefaults: s$20
		}), { container: K, svg: q, viewport: J, show: Y, scale: X } = R;
		return T({
			getLayouts: W,
			...G
		}), (e, t) => (openBlock(), createElementBlock("div", {
			ref_key: "container",
			ref: K,
			class: "v-network-graph v-network-graph-lite v-ng-container"
		}, [(openBlock(), createElementBlock("svg", {
			ref_key: "svg",
			ref: q,
			class: normalizeClass(["v-ng-canvas", {
				show: unref(Y),
				dragging: unref(B),
				touches: unref(V),
				"box-selection-mode": unref(H)
			}]),
			width: "100%",
			height: "100%"
		}, [
			(openBlock(!0), createElementBlock(Fragment, null, renderList(unref(P).root, (t) => renderSlot(e.$slots, t, { scale: unref(X) }, void 0, void 0, t)), 128)),
			Object.keys(unref(z).markers).length > 0 ? (openBlock(), createElementBlock("defs", w, [(openBlock(!0), createElementBlock(Fragment, null, renderList(unref(z).markers, (e, t) => (openBlock(), createBlock(t$13, {
				id: t,
				key: t,
				marker: e,
				scale: unref(X)
			}, null, 8, [
				"id",
				"marker",
				"scale"
			]))), 128))])) : createCommentVNode("", !0),
			unref(I) ? (openBlock(), createBlock(t$41, { key: 1 }, {
				default: withCtx(() => [
					(openBlock(!0), createElementBlock(Fragment, null, renderList(unref(P).background, (t) => (openBlock(), createElementBlock("g", {
						key: t,
						class: "v-ng-layer"
					}, [renderSlot(e.$slots, t, { scale: unref(X) })]))), 128)),
					unref(F) ? (openBlock(), createBlock(t$42, { key: 0 })) : createCommentVNode("", !0),
					(openBlock(!0), createElementBlock(Fragment, null, renderList(unref(P).grid, (t) => (openBlock(), createElementBlock("g", {
						key: t,
						class: "v-ng-layer"
					}, [renderSlot(e.$slots, t, { scale: unref(X) })]))), 128))
				]),
				_: 3
			})) : createCommentVNode("", !0),
			createBaseVNode("g", {
				ref_key: "viewport",
				ref: J,
				class: "v-ng-viewport"
			}, [(openBlock(!0), createElementBlock(Fragment, null, renderList(unref(P).base, (t) => (openBlock(), createElementBlock("g", {
				key: t,
				class: "v-ng-layer"
			}, [renderSlot(e.$slots, t, { scale: unref(X) })]))), 128)), (openBlock(!0), createElementBlock(Fragment, null, renderList(unref(L), (t) => (openBlock(), createElementBlock(Fragment, { key: t }, [t === "edges" ? (openBlock(), createBlock(t$11, { key: 0 })) : t === "nodes" ? (openBlock(), createBlock(t$7, { key: 1 })) : t === "node-labels" ? (openBlock(), createBlock(t$9, { key: 2 })) : createCommentVNode("", !0), (openBlock(!0), createElementBlock(Fragment, null, renderList(unref(P)[t], (t) => (openBlock(), createElementBlock("g", {
				key: t,
				class: "v-ng-layer"
			}, [renderSlot(e.$slots, t, { scale: unref(X) })]))), 128))], 64))), 128))], 512),
			unref(U) ? (openBlock(), createBlock(t$40, {
				key: 2,
				box: unref(U),
				config: unref(N).view.selection.box
			}, null, 8, ["box", "config"])) : createCommentVNode("", !0)
		], 2))], 512));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/_virtual/_plugin-vue_export-helper.js
var e$1 = (e, t) => {
	let n = e.__vccOpts || e;
	for (let [e, r] of t) n[e] = r;
	return n;
};
// ../DnD helper/node_modules/v-network-graph/lib/components/base/VStyle.vue.js
var s$2 = {};
function c$2(e, s) {
	return openBlock(), createElementBlock("defs", null, [(openBlock(), createBlock(resolveDynamicComponent("style"), null, {
		default: withCtx(() => [renderSlot(e.$slots, "default")]),
		_: 3
	}))]);
}
var l = /*#__PURE__*/ e$1(s$2, [["render", c$2]]);
// ../DnD helper/node_modules/v-network-graph/lib/components/edge/VEdgeLabel.vue.js
var t$1 = /* @__PURE__ */ defineComponent({
	__name: "VEdgeLabel",
	props: {
		area: {},
		config: {},
		text: { default: "" },
		align: { default: "center" },
		verticalAlign: { default: "center" },
		edge: { default: void 0 },
		hovered: {
			type: Boolean,
			default: void 0
		},
		selected: {
			type: Boolean,
			default: void 0
		},
		scale: { default: void 0 }
	},
	setup(i) {
		let c = i, l = ref(0), u = ref(0), d = ref("middle"), f = ref("central"), p = ref(0);
		watchEffect(() => {
			let t = c.area.source, n = c.area.target;
			c.align === "source" ? (t.above.x == n.above.x ? d.value = t.above.y > n.above.y ? "start" : "end" : d.value = t.above.x < n.above.x ? "start" : "end", c.verticalAlign === "above" ? (l.value = t.above.x, u.value = t.above.y, f.value = "text-top") : c.verticalAlign === "below" ? (l.value = t.below.x, u.value = t.below.y, f.value = "hanging") : (l.value = (t.above.x + t.below.x) / 2, u.value = (t.above.y + t.below.y) / 2, f.value = "central")) : c.align === "target" ? (t.above.x == n.above.x ? d.value = t.above.y < n.above.y ? "start" : "end" : d.value = t.above.x > n.above.x ? "start" : "end", c.verticalAlign === "above" ? (l.value = n.above.x, u.value = n.above.y, f.value = "text-top") : c.verticalAlign === "below" ? (l.value = n.below.x, u.value = n.below.y, f.value = "hanging") : (l.value = (n.above.x + n.below.x) / 2, u.value = (n.above.y + n.below.y) / 2, f.value = "central")) : (d.value = "middle", c.verticalAlign === "above" ? (l.value = (t.above.x + n.above.x) / 2, u.value = (t.above.y + n.above.y) / 2, f.value = "text-top") : c.verticalAlign === "below" ? (l.value = (t.below.x + n.below.x) / 2, u.value = (t.below.y + n.below.y) / 2, f.value = "hanging") : (l.value = (t.above.x + n.below.x) / 2, u.value = (t.above.y + n.below.y) / 2, f.value = "central"));
			let r = t$52.fromPositions(t.above, n.above).v.angleDegree();
			(r < -90 || r >= 90) && (r += 180, r > 180 && (r -= 360)), p.value = r;
		});
		let m = computed(() => f.value === "central" && !c.config.background ? {
			...c.config,
			background: {
				visible: !0,
				color: "#ffffff",
				padding: {
					vertical: 1,
					horizontal: 4
				},
				borderRadius: 2
			}
		} : c.config);
		return (e, n) => (openBlock(), createBlock(t$2, {
			class: "v-ng-edge-label",
			text: i.text,
			x: l.value,
			y: u.value,
			config: m.value,
			"text-anchor": d.value,
			"dominant-baseline": f.value,
			transform: `rotate(${p.value} ${l.value} ${u.value})`
		}, null, 8, [
			"text",
			"x",
			"y",
			"config",
			"text-anchor",
			"dominant-baseline",
			"transform"
		]));
	}
});
// ../DnD helper/node_modules/v-network-graph/lib/components/index.js
var s$1 = /* @__PURE__ */ t$56({
	VEdgeLabel: () => t$1,
	VLabelText: () => t$2,
	VNetworkGraph: () => t$3,
	VNetworkGraphLite: () => t$4,
	VShape: () => t$5,
	VStyle: () => l
});
// ../DnD helper/node_modules/v-network-graph/lib/layouts/grid.js
var t$6 = 10;
var n = class extends s {
	constructor(e = {}) {
		super(), this.options = e;
	}
	setNodePosition(e, n) {
		let r = this.options.grid || t$6;
		e.value.x = Math.floor(n.x / r) * r, e.value.y = Math.floor(n.y / r) * r;
	}
};
// ../DnD helper/node_modules/v-network-graph/lib/index.js
var y = function(e) {
	Object.entries(s$1).forEach(([t, n]) => {
		e.component(t, n);
	});
};
export { t as Config, n as GridLayout, e as LayerPositions, n$1 as NodeLabelDirection, s as SimpleLayout, t$1 as VEdgeLabel, t$2 as VLabelText, t$3 as VNetworkGraph, t$4 as VNetworkGraphLite, t$5 as VShape, l as VStyle, h as Vector2D, i as configsWithType, y as default, a as defineConfigs, o as defineLiteConfigs, c as getFullConfigs, C as useStates, r as withSelf };
