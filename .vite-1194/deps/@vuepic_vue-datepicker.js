import { $ as createTextVNode, C as vShow, Cn as withDirectives, Dt as mergeProps, Ft as onMounted, G as createBlock, Gn as readonly, I as Teleport, Jn as shallowReadonly, Jt as renderSlot, K as createCommentVNode, Kn as ref, M as Fragment, Mt as onBeforeUpdate, Nn as getCurrentScope, Ot as nextTick, Qn as toRef, T as withModifiers, Tt as mergeDefaults, U as computed, Ut as provide, Vn as onScopeDispose, Vt as openBlock, W as createBaseVNode, Wn as reactive, Yn as shallowRef, Z as createSlots, Zt as resolveDynamicComponent, ar as normalizeClass, cr as toDisplayString, dn as useSlots, er as toValue$1, et as createVNode, fn as useTemplateRef, ft as guardReactiveProps, gn as watch, n as Transition, nr as unref, nt as defineComponent, or as normalizeProps, pt as h, q as createElementBlock, qt as renderList, sr as normalizeStyle, w as withKeys, xn as withCtx, xt as inject, zt as onUnmounted } from "./vue.runtime.esm-bundler-Bwv4pGxO.js";
import { S as watchImmediate, a as isClient, c as isObject, h as toArray, l as noop, s as isIOS } from "./dist-BxFsHs9P.js";
import { a as flip, f as getNodeName, i as computePosition, l as offset, p as isNode, r as autoUpdate, t as arrow$2, u as shift } from "./floating-ui.dom-BsrkDKcO.js";
// ../DnD helper/node_modules/@vuepic/vue-datepicker/node_modules/@vueuse/core/dist/index.js
var defaultWindow = isClient ? window : void 0;
isClient && window.document;
isClient && window.navigator;
isClient && window.location;
/**
* Get the dom element of a ref of element or Vue component instance
*
* @param elRef
*/
function unrefElement(elRef) {
	var _$el;
	const plain = toValue$1(elRef);
	return (_$el = plain === null || plain === void 0 ? void 0 : plain.$el) !== null && _$el !== void 0 ? _$el : plain;
}
function useEventListener(...args) {
	const register = (el, event, listener, options) => {
		el.addEventListener(event, listener, options);
		return () => el.removeEventListener(event, listener, options);
	};
	const firstParamTargets = computed(() => {
		const test = toArray(toValue$1(args[0])).filter((e) => e != null);
		return test.every((e) => typeof e !== "string") ? test : void 0;
	});
	return watchImmediate(() => {
		var _firstParamTargets$va, _firstParamTargets$va2;
		return [
			(_firstParamTargets$va = (_firstParamTargets$va2 = firstParamTargets.value) === null || _firstParamTargets$va2 === void 0 ? void 0 : _firstParamTargets$va2.map((e) => unrefElement(e))) !== null && _firstParamTargets$va !== void 0 ? _firstParamTargets$va : [defaultWindow].filter((e) => e != null),
			toArray(toValue$1(firstParamTargets.value ? args[1] : args[0])),
			toArray(unref(firstParamTargets.value ? args[2] : args[1])),
			toValue$1(firstParamTargets.value ? args[3] : args[2])
		];
	}, ([raw_targets, raw_events, raw_listeners, raw_options], _, onCleanup) => {
		if (!(raw_targets === null || raw_targets === void 0 ? void 0 : raw_targets.length) || !(raw_events === null || raw_events === void 0 ? void 0 : raw_events.length) || !(raw_listeners === null || raw_listeners === void 0 ? void 0 : raw_listeners.length)) return;
		const optionsClone = isObject(raw_options) ? { ...raw_options } : raw_options;
		const cleanups = raw_targets.flatMap((el) => raw_events.flatMap((event) => raw_listeners.map((listener) => register(el, event, listener, optionsClone))));
		onCleanup(() => {
			cleanups.forEach((fn) => fn());
		});
	}, { flush: "post" });
}
var _iOSWorkaround = false;
function onClickOutside(target, handler, options = {}) {
	const { window = defaultWindow, ignore = [], capture = true, detectIframe = false, controls = false } = options;
	if (!window) return controls ? {
		stop: noop,
		cancel: noop,
		trigger: noop
	} : noop;
	if (isIOS && !_iOSWorkaround) {
		_iOSWorkaround = true;
		const listenerOptions = { passive: true };
		Array.from(window.document.body.children).forEach((el) => el.addEventListener("click", noop, listenerOptions));
		window.document.documentElement.addEventListener("click", noop, listenerOptions);
	}
	let shouldListen = true;
	const shouldIgnore = (event) => {
		return toValue$1(ignore).some((target) => {
			if (typeof target === "string") return Array.from(window.document.querySelectorAll(target)).some((el) => el === event.target || event.composedPath().includes(el));
			else {
				const el = unrefElement(target);
				return el && (event.target === el || event.composedPath().includes(el));
			}
		});
	};
	/**
	* Determines if the given target has multiple root elements.
	* Referenced from: https://github.com/vuejs/test-utils/blob/ccb460be55f9f6be05ab708500a41ec8adf6f4bc/src/vue-wrapper.ts#L21
	*/
	function hasMultipleRoots(target) {
		const vm = toValue$1(target);
		return vm && vm.$.subTree.shapeFlag === 16;
	}
	function checkMultipleRoots(target, event) {
		const vm = toValue$1(target);
		const children = vm.$.subTree && vm.$.subTree.children;
		if (children == null || !Array.isArray(children)) return false;
		return children.some((child) => child.el === event.target || event.composedPath().includes(child.el));
	}
	const listener = (event) => {
		const el = unrefElement(target);
		if (event.target == null) return;
		if (!(el instanceof Element) && hasMultipleRoots(target) && checkMultipleRoots(target, event)) return;
		if (!el || el === event.target || event.composedPath().includes(el)) return;
		if ("detail" in event && event.detail === 0) shouldListen = !shouldIgnore(event);
		if (!shouldListen) {
			shouldListen = true;
			return;
		}
		handler(event);
	};
	let isProcessingClick = false;
	const cleanup = [
		useEventListener(window, "click", (event) => {
			if (!isProcessingClick) {
				isProcessingClick = true;
				setTimeout(() => {
					isProcessingClick = false;
				}, 0);
				listener(event);
			}
		}, {
			passive: true,
			capture
		}),
		useEventListener(window, "pointerdown", (e) => {
			const el = unrefElement(target);
			shouldListen = !shouldIgnore(e) && !!(el && !e.composedPath().includes(el));
		}, { passive: true }),
		detectIframe && useEventListener(window, "blur", (event) => {
			setTimeout(() => {
				const el = unrefElement(target);
				let activeEl = window.document.activeElement;
				while (activeEl === null || activeEl === void 0 ? void 0 : activeEl.shadowRoot) activeEl = activeEl.shadowRoot.activeElement;
				if ((activeEl === null || activeEl === void 0 ? void 0 : activeEl.tagName) === "IFRAME" && !(el === null || el === void 0 ? void 0 : el.contains(window.document.activeElement))) handler(event);
			}, 0);
		}, { passive: true })
	].filter(Boolean);
	const stop = () => cleanup.forEach((fn) => fn());
	if (controls) return {
		stop,
		cancel: () => {
			shouldListen = false;
		},
		trigger: (event) => {
			shouldListen = true;
			listener(event);
			shouldListen = false;
		}
	};
	return stop;
}
/**
* Reactive swipe detection.
*
* @see https://vueuse.org/useSwipe
* @param target
* @param options
*/
function useSwipe(target, options = {}) {
	const { threshold = 50, onSwipe, onSwipeEnd, onSwipeStart, passive = true } = options;
	const coordsStart = reactive({
		x: 0,
		y: 0
	});
	const coordsEnd = reactive({
		x: 0,
		y: 0
	});
	const diffX = computed(() => coordsStart.x - coordsEnd.x);
	const diffY = computed(() => coordsStart.y - coordsEnd.y);
	const { max, abs } = Math;
	const isThresholdExceeded = computed(() => max(abs(diffX.value), abs(diffY.value)) >= threshold);
	const isSwiping = shallowRef(false);
	const direction = computed(() => {
		if (!isThresholdExceeded.value) return "none";
		if (abs(diffX.value) > abs(diffY.value)) return diffX.value > 0 ? "left" : "right";
		else return diffY.value > 0 ? "up" : "down";
	});
	const getTouchEventCoords = (e) => [e.touches[0].clientX, e.touches[0].clientY];
	const updateCoordsStart = (x, y) => {
		coordsStart.x = x;
		coordsStart.y = y;
	};
	const updateCoordsEnd = (x, y) => {
		coordsEnd.x = x;
		coordsEnd.y = y;
	};
	const listenerOptions = {
		passive,
		capture: !passive
	};
	const onTouchEnd = (e) => {
		if (isSwiping.value) onSwipeEnd === null || onSwipeEnd === void 0 || onSwipeEnd(e, direction.value);
		isSwiping.value = false;
	};
	const stops = [
		useEventListener(target, "touchstart", (e) => {
			if (e.touches.length !== 1) return;
			const [x, y] = getTouchEventCoords(e);
			updateCoordsStart(x, y);
			updateCoordsEnd(x, y);
			onSwipeStart === null || onSwipeStart === void 0 || onSwipeStart(e);
		}, listenerOptions),
		useEventListener(target, "touchmove", (e) => {
			if (e.touches.length !== 1) return;
			const [x, y] = getTouchEventCoords(e);
			updateCoordsEnd(x, y);
			if (listenerOptions.capture && !listenerOptions.passive && Math.abs(diffX.value) > Math.abs(diffY.value)) e.preventDefault();
			if (!isSwiping.value && isThresholdExceeded.value) isSwiping.value = true;
			if (isSwiping.value) onSwipe === null || onSwipe === void 0 || onSwipe(e);
		}, listenerOptions),
		useEventListener(target, ["touchend", "touchcancel"], onTouchEnd, listenerOptions)
	];
	const stop = () => stops.forEach((s) => s());
	return {
		isSwiping,
		direction,
		coordsStart,
		coordsEnd,
		lengthX: diffX,
		lengthY: diffY,
		stop
	};
}
/* @__NO_SIDE_EFFECTS__ */
function useTemplateRefsList() {
	const refs = ref([]);
	refs.value.set = (el) => {
		if (el) refs.value.push(el);
	};
	onBeforeUpdate(() => {
		refs.value.length = 0;
	});
	return refs;
}
// ../DnD helper/node_modules/@floating-ui/vue/dist/floating-ui.vue.mjs
function isComponentPublicInstance(target) {
	return target != null && typeof target === "object" && "$el" in target;
}
function unwrapElement(target) {
	if (isComponentPublicInstance(target)) {
		const element = target.$el;
		return isNode(element) && getNodeName(element) === "#comment" ? null : element;
	}
	return target;
}
function toValue(source) {
	return typeof source === "function" ? source() : unref(source);
}
/**
* Positions an inner element of the floating element such that it is centered to the reference element.
* @param options The arrow options.
* @see https://floating-ui.com/docs/arrow
*/
function arrow(options) {
	return {
		name: "arrow",
		options,
		fn(args) {
			const element = unwrapElement(toValue(options.element));
			if (element == null) return {};
			return arrow$2({
				element,
				padding: options.padding
			}).fn(args);
		}
	};
}
function getDPR(element) {
	if (typeof window === "undefined") return 1;
	return (element.ownerDocument.defaultView || window).devicePixelRatio || 1;
}
function roundByDPR(element, value) {
	const dpr = getDPR(element);
	return Math.round(value * dpr) / dpr;
}
/**
* Computes the `x` and `y` coordinates that will place the floating element next to a reference element when it is given a certain CSS positioning strategy.
* @param reference The reference template ref.
* @param floating The floating template ref.
* @param options The floating options.
* @see https://floating-ui.com/docs/vue
*/
function useFloating(reference, floating, options) {
	if (options === void 0) options = {};
	const whileElementsMountedOption = options.whileElementsMounted;
	const openOption = computed(() => {
		var _toValue;
		return (_toValue = toValue(options.open)) != null ? _toValue : true;
	});
	const middlewareOption = computed(() => toValue(options.middleware));
	const placementOption = computed(() => {
		var _toValue2;
		return (_toValue2 = toValue(options.placement)) != null ? _toValue2 : "bottom";
	});
	const strategyOption = computed(() => {
		var _toValue3;
		return (_toValue3 = toValue(options.strategy)) != null ? _toValue3 : "absolute";
	});
	const transformOption = computed(() => {
		var _toValue4;
		return (_toValue4 = toValue(options.transform)) != null ? _toValue4 : true;
	});
	const referenceElement = computed(() => unwrapElement(reference.value));
	const floatingElement = computed(() => unwrapElement(floating.value));
	const x = ref(0);
	const y = ref(0);
	const strategy = ref(strategyOption.value);
	const placement = ref(placementOption.value);
	const middlewareData = shallowRef({});
	const isPositioned = ref(false);
	const floatingStyles = computed(() => {
		const initialStyles = {
			position: strategy.value,
			left: "0",
			top: "0"
		};
		if (!floatingElement.value) return initialStyles;
		const xVal = roundByDPR(floatingElement.value, x.value);
		const yVal = roundByDPR(floatingElement.value, y.value);
		if (transformOption.value) return {
			...initialStyles,
			transform: "translate(" + xVal + "px, " + yVal + "px)",
			...getDPR(floatingElement.value) >= 1.5 && { willChange: "transform" }
		};
		return {
			position: strategy.value,
			left: xVal + "px",
			top: yVal + "px"
		};
	});
	let whileElementsMountedCleanup;
	function update() {
		if (referenceElement.value == null || floatingElement.value == null) return;
		const open = openOption.value;
		computePosition(referenceElement.value, floatingElement.value, {
			middleware: middlewareOption.value,
			placement: placementOption.value,
			strategy: strategyOption.value
		}).then((position) => {
			x.value = position.x;
			y.value = position.y;
			strategy.value = position.strategy;
			placement.value = position.placement;
			middlewareData.value = position.middlewareData;
			/**
			* The floating element's position may be recomputed while it's closed
			* but still mounted (such as when transitioning out). To ensure
			* `isPositioned` will be `false` initially on the next open, avoid
			* setting it to `true` when `open === false` (must be specified).
			*/
			isPositioned.value = open !== false;
		});
	}
	function cleanup() {
		if (typeof whileElementsMountedCleanup === "function") {
			whileElementsMountedCleanup();
			whileElementsMountedCleanup = void 0;
		}
	}
	function attach() {
		cleanup();
		if (whileElementsMountedOption === void 0) {
			update();
			return;
		}
		if (referenceElement.value != null && floatingElement.value != null) {
			whileElementsMountedCleanup = whileElementsMountedOption(referenceElement.value, floatingElement.value, update);
			return;
		}
	}
	function reset() {
		if (!openOption.value) isPositioned.value = false;
	}
	watch([
		middlewareOption,
		placementOption,
		strategyOption,
		openOption
	], update, { flush: "sync" });
	watch([referenceElement, floatingElement], attach, { flush: "sync" });
	watch(openOption, reset, { flush: "sync" });
	if (getCurrentScope()) onScopeDispose(cleanup);
	return {
		x: shallowReadonly(x),
		y: shallowReadonly(y),
		strategy: shallowReadonly(strategy),
		placement: shallowReadonly(placement),
		middlewareData: shallowReadonly(middlewareData),
		isPositioned: shallowReadonly(isPositioned),
		floatingStyles,
		update
	};
}
-(Math.pow(10, 8) * 24 * 60 * 60 * 1e3);
/**
* @constant
* @name millisecondsInWeek
* @summary Milliseconds in 1 week.
*/
var millisecondsInWeek = 6048e5;
/**
* @constant
* @name millisecondsInDay
* @summary Milliseconds in 1 day.
*/
var millisecondsInDay = 864e5;
/**
* @constant
* @name millisecondsInMinute
* @summary Milliseconds in 1 minute
*/
var millisecondsInMinute = 6e4;
/**
* @constant
* @name millisecondsInHour
* @summary Milliseconds in 1 hour
*/
var millisecondsInHour = 36e5;
/**
* @constant
* @name millisecondsInSecond
* @summary Milliseconds in 1 second
*/
var millisecondsInSecond = 1e3;
/**
* @constant
* @name constructFromSymbol
* @summary Symbol enabling Date extensions to inherit properties from the reference date.
*
* The symbol is used to enable the `constructFrom` function to construct a date
* using a reference date and a value. It allows to transfer extra properties
* from the reference date to the new date. It's useful for extensions like
* [`TZDate`](https://github.com/date-fns/tz) that accept a time zone as
* a constructor argument.
*/
var constructFromSymbol = Symbol.for("constructDateFrom");
// ../DnD helper/node_modules/date-fns/constructFrom.js
/**
* @name constructFrom
* @category Generic Helpers
* @summary Constructs a date using the reference date and the value
*
* @description
* The function constructs a new date using the constructor from the reference
* date and the given value. It helps to build generic functions that accept
* date extensions.
*
* It defaults to `Date` if the passed reference date is a number or a string.
*
* Starting from v3.7.0, it allows to construct a date using `[Symbol.for("constructDateFrom")]`
* enabling to transfer extra properties from the reference date to the new date.
* It's useful for extensions like [`TZDate`](https://github.com/date-fns/tz)
* that accept a time zone as a constructor argument.
*
* @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
*
* @param date - The reference date to take constructor from
* @param value - The value to create the date
*
* @returns Date initialized using the given date and value
*
* @example
* import { constructFrom } from "./constructFrom/date-fns";
*
* // A function that clones a date preserving the original type
* function cloneDate<DateType extends Date>(date: DateType): DateType {
*   return constructFrom(
*     date, // Use constructor from the given date
*     date.getTime() // Use the date value to create a new date
*   );
* }
*/
function constructFrom(date, value) {
	if (typeof date === "function") return date(value);
	if (date && typeof date === "object" && constructFromSymbol in date) return date[constructFromSymbol](value);
	if (date instanceof Date) return new date.constructor(value);
	return new Date(value);
}
// ../DnD helper/node_modules/date-fns/toDate.js
/**
* @name toDate
* @category Common Helpers
* @summary Convert the given argument to an instance of Date.
*
* @description
* Convert the given argument to an instance of Date.
*
* If the argument is an instance of Date, the function returns its clone.
*
* If the argument is a number, it is treated as a timestamp.
*
* If the argument is none of the above, the function returns Invalid Date.
*
* Starting from v3.7.0, it clones a date using `[Symbol.for("constructDateFrom")]`
* enabling to transfer extra properties from the reference date to the new date.
* It's useful for extensions like [`TZDate`](https://github.com/date-fns/tz)
* that accept a time zone as a constructor argument.
*
* **Note**: *all* Date arguments passed to any *date-fns* function is processed by `toDate`.
*
* @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
* @typeParam ResultDate - The result `Date` type, it is the type returned from the context function if it is passed, or inferred from the arguments.
*
* @param argument - The value to convert
*
* @returns The parsed date in the local time zone
*
* @example
* // Clone the date:
* const result = toDate(new Date(2014, 1, 11, 11, 30, 30))
* //=> Tue Feb 11 2014 11:30:30
*
* @example
* // Convert the timestamp to date:
* const result = toDate(1392098430000)
* //=> Tue Feb 11 2014 11:30:30
*/
function toDate(argument, context) {
	return constructFrom(context || argument, argument);
}
// ../DnD helper/node_modules/date-fns/addDays.js
/**
* The {@link addDays} function options.
*/
/**
* @name addDays
* @category Day Helpers
* @summary Add the specified number of days to the given date.
*
* @description
* Add the specified number of days to the given date.
*
* **You don't need date-fns\***:
*
* Temporal has a built-in `add` method on all its classes:
*
* - [`Temporal.Instant.prototype.add()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Instant/add)
* - [`Temporal.PlainDate.prototype.add()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate/add)
* - [`Temporal.PlainDateTime.prototype.add()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/add)
* - [`Temporal.PlainTime.prototype.add()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainTime/add)
* - [`Temporal.PlainYearMonth.prototype.add()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainYearMonth/add)
* - [`Temporal.ZonedDateTime.prototype.add()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/add)
*
* \* **Not really**, see: https://date-fns.org/you-dont-need-date-fns
*
* @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
* @typeParam ResultDate - The result `Date` type, it is the type returned from the context function if it is passed, or inferred from the arguments.
*
* @param date - The date to be changed
* @param amount - The amount of days to be added.
* @param options - An object with options
*
* @returns The new date with the days added
*
* @example
* // Add 10 days to 1 September 2014:
* const result = addDays(new Date(2014, 8, 1), 10)
* //=> Thu Sep 11 2014 00:00:00
*
* @example
* // Using Temporal:
* // Add 10 days to 1 September 2014:
* Temporal.PlainDate.from("2014-09-01").add({ days: 10 }).toString();
* //=> "2014-09-11"
*/
function addDays(date, amount, options) {
	const _date = toDate(date, options?.in);
	if (isNaN(amount)) return constructFrom(options?.in || date, NaN);
	if (!amount) return _date;
	_date.setDate(_date.getDate() + amount);
	return _date;
}
// ../DnD helper/node_modules/date-fns/addMonths.js
/**
* The {@link addMonths} function options.
*/
/**
* @name addMonths
* @category Month Helpers
* @summary Add the specified number of months to the given date.
*
* @description
* Add the specified number of months to the given date.
*
* @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
* @typeParam ResultDate - The result `Date` type, it is the type returned from the context function if it is passed, or inferred from the arguments.
*
* @param date - The date to be changed
* @param amount - The amount of months to be added.
* @param options - The options object
*
* @returns The new date with the months added
*
* @example
* // Add 5 months to 1 September 2014:
* const result = addMonths(new Date(2014, 8, 1), 5)
* //=> Sun Feb 01 2015 00:00:00
*
* // Add one month to 30 January 2023:
* const result = addMonths(new Date(2023, 0, 30), 1)
* //=> Tue Feb 28 2023 00:00:00
*/
function addMonths(date, amount, options) {
	const _date = toDate(date, options?.in);
	if (isNaN(amount)) return constructFrom(options?.in || date, NaN);
	if (!amount) return _date;
	const dayOfMonth = _date.getDate();
	const endOfDesiredMonth = constructFrom(options?.in || date, _date.getTime());
	endOfDesiredMonth.setMonth(_date.getMonth() + amount + 1, 0);
	if (dayOfMonth >= endOfDesiredMonth.getDate()) return endOfDesiredMonth;
	else {
		_date.setFullYear(endOfDesiredMonth.getFullYear(), endOfDesiredMonth.getMonth(), dayOfMonth);
		return _date;
	}
}
// ../DnD helper/node_modules/date-fns/add.js
/**
* The {@link add} function options.
*/
/**
* @name add
* @category Common Helpers
* @summary Add the specified years, months, weeks, days, hours, minutes, and seconds to the given date.
*
* @description
* Add the specified years, months, weeks, days, hours, minutes, and seconds to the given date.
*
* **You don't need date-fns\***:
*
* Temporal has a built-in `add` method on all its classes:
*
* - [`Temporal.Instant.prototype.add()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Instant/add)
* - [`Temporal.PlainDate.prototype.add()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate/add)
* - [`Temporal.PlainDateTime.prototype.add()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/add)
* - [`Temporal.PlainTime.prototype.add()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainTime/add)
* - [`Temporal.PlainYearMonth.prototype.add()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainYearMonth/add)
* - [`Temporal.ZonedDateTime.prototype.add()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/add)
*
* \* **Not really**, see: https://date-fns.org/you-dont-need-date-fns
*
* @typeParam DateType - The `Date` type the function operates on. Gets inferred from passed arguments. Allows using extensions like [`UTCDate`](https://github.com/date-fns/utc).
* @typeParam ResultDate - The result `Date` type, it is the type returned from the context function if it is passed, or inferred from the arguments.
*
* @param date - The date to be changed
* @param duration - The object with years, months, weeks, days, hours, minutes, and seconds to be added.
* @param options - An object with options
*
* @returns The new date with the seconds added
*
* @example
* // Add the following duration to 1 September 2014, 10:19:50
* const result = add(new Date(2014, 8, 1, 10, 19, 50), {
*   years: 2,
*   months: 9,
*   weeks: 1,
*   days: 7,
*   hours: 5,
*   minutes: 9,
*   seconds: 30,
* })
* //=> Thu Jun 15 2017 15:29:20
*
* @example
* // Using Temporal:
* // Add the following duration to 1 September 2014, 10:19:50
* Temporal.PlainDateTime.from("2014-09-01T10:19:50")
*   .add({
*     years: 2,
*     months: 9,
*     weeks: 1,
*     days: 7,
*     hours: 5,
*     minutes: 9,
*     seconds: 30,
*   })
*   .toString();
* //=> "2017-06-15T15:29:20"
*/
function add(date, duration, options) {
	const { years = 0, months = 0, weeks = 0, days = 0, hours = 0, minutes = 0, seconds = 0 } = duration;
	const _date = toDate(date, options?.in);
	const dateWithMonths = months || years ? addMonths(_date, months + years * 12) : _date;
	const dateWithDays = days || weeks ? addDays(dateWithMonths, days + weeks * 7) : dateWithMonths;
	const msToAdd = (seconds + (minutes + hours * 60) * 60) * 1e3;
	return constructFrom(options?.in || date, +dateWithDays + msToAdd);
}
// ../DnD helper/node_modules/date-fns/_lib/defaultOptions.js
var defaultOptions = {};
function getDefaultOptions$1() {
	return defaultOptions;
}
// ../DnD helper/node_modules/date-fns/startOfWeek.js
/**
* The {@link startOfWeek} function options.
*/
/**
* @name startOfWeek
* @category Week Helpers
* @summary Return the start of a week for the given date.
*
* @description
* Return the start of a week for the given date.
* The result will be in the local timezone.
*
* @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
* @typeParam ResultDate - The result `Date` type, it is the type returned from the context function if it is passed, or inferred from the arguments.
*
* @param date - The original date
* @param options - An object with options
*
* @returns The start of a week
*
* @example
* // The start of a week for 2 September 2014 11:55:00:
* const result = startOfWeek(new Date(2014, 8, 2, 11, 55, 0))
* //=> Sun Aug 31 2014 00:00:00
*
* @example
* // If the week starts on Monday, the start of the week for 2 September 2014 11:55:00:
* const result = startOfWeek(new Date(2014, 8, 2, 11, 55, 0), { weekStartsOn: 1 })
* //=> Mon Sep 01 2014 00:00:00
*/
function startOfWeek(date, options) {
	const defaultOptions = getDefaultOptions$1();
	const weekStartsOn = options?.weekStartsOn ?? options?.locale?.options?.weekStartsOn ?? defaultOptions.weekStartsOn ?? defaultOptions.locale?.options?.weekStartsOn ?? 0;
	const _date = toDate(date, options?.in);
	const day = _date.getDay();
	const diff = (day < weekStartsOn ? 7 : 0) + day - weekStartsOn;
	_date.setDate(_date.getDate() - diff);
	_date.setHours(0, 0, 0, 0);
	return _date;
}
// ../DnD helper/node_modules/date-fns/startOfISOWeek.js
/**
* The {@link startOfISOWeek} function options.
*/
/**
* @name startOfISOWeek
* @category ISO Week Helpers
* @summary Return the start of an ISO week for the given date.
*
* @description
* Return the start of an ISO week for the given date.
* The result will be in the local timezone.
*
* ISO week-numbering year: http://en.wikipedia.org/wiki/ISO_week_date
*
* @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
* @typeParam ResultDate - The result `Date` type, it is the type returned from the context function if it is passed, or inferred from the arguments.
*
* @param date - The original date
* @param options - An object with options
*
* @returns The start of an ISO week
*
* @example
* // The start of an ISO week for 2 September 2014 11:55:00:
* const result = startOfISOWeek(new Date(2014, 8, 2, 11, 55, 0))
* //=> Mon Sep 01 2014 00:00:00
*/
function startOfISOWeek(date, options) {
	return startOfWeek(date, {
		...options,
		weekStartsOn: 1
	});
}
// ../DnD helper/node_modules/date-fns/getISOWeekYear.js
/**
* The {@link getISOWeekYear} function options.
*/
/**
* @name getISOWeekYear
* @category ISO Week-Numbering Year Helpers
* @summary Get the ISO week-numbering year of the given date.
*
* @description
* Get the ISO week-numbering year of the given date,
* which always starts 3 days before the year's first Thursday.
*
* ISO week-numbering year: http://en.wikipedia.org/wiki/ISO_week_date
*
* @param date - The given date
*
* @returns The ISO week-numbering year
*
* @example
* // Which ISO-week numbering year is 2 January 2005?
* const result = getISOWeekYear(new Date(2005, 0, 2))
* //=> 2004
*/
function getISOWeekYear(date, options) {
	const _date = toDate(date, options?.in);
	const year = _date.getFullYear();
	const fourthOfJanuaryOfNextYear = constructFrom(_date, 0);
	fourthOfJanuaryOfNextYear.setFullYear(year + 1, 0, 4);
	fourthOfJanuaryOfNextYear.setHours(0, 0, 0, 0);
	const startOfNextYear = startOfISOWeek(fourthOfJanuaryOfNextYear);
	const fourthOfJanuaryOfThisYear = constructFrom(_date, 0);
	fourthOfJanuaryOfThisYear.setFullYear(year, 0, 4);
	fourthOfJanuaryOfThisYear.setHours(0, 0, 0, 0);
	const startOfThisYear = startOfISOWeek(fourthOfJanuaryOfThisYear);
	if (_date.getTime() >= startOfNextYear.getTime()) return year + 1;
	else if (_date.getTime() >= startOfThisYear.getTime()) return year;
	else return year - 1;
}
// ../DnD helper/node_modules/date-fns/_lib/getTimezoneOffsetInMilliseconds.js
/**
* Google Chrome as of 67.0.3396.87 introduced timezones with offset that includes seconds.
* They usually appear for dates that denote time before the timezones were introduced
* (e.g. for 'Europe/Prague' timezone the offset is GMT+00:57:44 before 1 October 1891
* and GMT+01:00:00 after that date)
*
* Date#getTimezoneOffset returns the offset in minutes and would return 57 for the example above,
* which would lead to incorrect calculations.
*
* This function returns the timezone offset in milliseconds that takes seconds in account.
*/
function getTimezoneOffsetInMilliseconds(date) {
	const _date = toDate(date);
	const utcDate = new Date(Date.UTC(_date.getFullYear(), _date.getMonth(), _date.getDate(), _date.getHours(), _date.getMinutes(), _date.getSeconds(), _date.getMilliseconds()));
	utcDate.setUTCFullYear(_date.getFullYear());
	return +date - +utcDate;
}
// ../DnD helper/node_modules/date-fns/_lib/normalizeDates.js
function normalizeDates(context, ...dates) {
	const normalize = constructFrom.bind(null, context || dates.find((date) => typeof date === "object"));
	return dates.map(normalize);
}
// ../DnD helper/node_modules/date-fns/startOfDay.js
/**
* The {@link startOfDay} function options.
*/
/**
* @name startOfDay
* @category Day Helpers
* @summary Return the start of a day for the given date.
*
* @description
* Return the start of a day for the given date.
* The result will be in the local timezone.
*
* @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
* @typeParam ResultDate - The result `Date` type, it is the type returned from the context function if it is passed, or inferred from the arguments.
*
* @param date - The original date
* @param options - The options
*
* @returns The start of a day
*
* @example
* // The start of a day for 2 September 2014 11:55:00:
* const result = startOfDay(new Date(2014, 8, 2, 11, 55, 0))
* //=> Tue Sep 02 2014 00:00:00
*/
function startOfDay(date, options) {
	const _date = toDate(date, options?.in);
	_date.setHours(0, 0, 0, 0);
	return _date;
}
// ../DnD helper/node_modules/date-fns/differenceInCalendarDays.js
/**
* The {@link differenceInCalendarDays} function options.
*/
/**
* @name differenceInCalendarDays
* @category Day Helpers
* @summary Get the number of calendar days between the given dates.
*
* @description
* Get the number of calendar days between the given dates. This means that the times are removed
* from the dates and then the difference in days is calculated.
*
* @param laterDate - The later date
* @param earlierDate - The earlier date
* @param options - The options object
*
* @returns The number of calendar days
*
* @example
* // How many calendar days are between
* // 2 July 2011 23:00:00 and 2 July 2012 00:00:00?
* const result = differenceInCalendarDays(
*   new Date(2012, 6, 2, 0, 0),
*   new Date(2011, 6, 2, 23, 0)
* )
* //=> 366
* // How many calendar days are between
* // 2 July 2011 23:59:00 and 3 July 2011 00:01:00?
* const result = differenceInCalendarDays(
*   new Date(2011, 6, 3, 0, 1),
*   new Date(2011, 6, 2, 23, 59)
* )
* //=> 1
*/
function differenceInCalendarDays(laterDate, earlierDate, options) {
	const [laterDate_, earlierDate_] = normalizeDates(options?.in, laterDate, earlierDate);
	const laterStartOfDay = startOfDay(laterDate_);
	const earlierStartOfDay = startOfDay(earlierDate_);
	const laterTimestamp = +laterStartOfDay - getTimezoneOffsetInMilliseconds(laterStartOfDay);
	const earlierTimestamp = +earlierStartOfDay - getTimezoneOffsetInMilliseconds(earlierStartOfDay);
	return Math.round((laterTimestamp - earlierTimestamp) / millisecondsInDay);
}
// ../DnD helper/node_modules/date-fns/startOfISOWeekYear.js
/**
* The {@link startOfISOWeekYear} function options.
*/
/**
* @name startOfISOWeekYear
* @category ISO Week-Numbering Year Helpers
* @summary Return the start of an ISO week-numbering year for the given date.
*
* @description
* Return the start of an ISO week-numbering year,
* which always starts 3 days before the year's first Thursday.
* The result will be in the local timezone.
*
* ISO week-numbering year: http://en.wikipedia.org/wiki/ISO_week_date
*
* @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
* @typeParam ResultDate - The result `Date` type, it is the type returned from the context function if it is passed, or inferred from the arguments.
*
* @param date - The original date
* @param options - An object with options
*
* @returns The start of an ISO week-numbering year
*
* @example
* // The start of an ISO week-numbering year for 2 July 2005:
* const result = startOfISOWeekYear(new Date(2005, 6, 2))
* //=> Mon Jan 03 2005 00:00:00
*/
function startOfISOWeekYear(date, options) {
	const year = getISOWeekYear(date, options);
	const fourthOfJanuary = constructFrom(options?.in || date, 0);
	fourthOfJanuary.setFullYear(year, 0, 4);
	fourthOfJanuary.setHours(0, 0, 0, 0);
	return startOfISOWeek(fourthOfJanuary);
}
// ../DnD helper/node_modules/date-fns/addQuarters.js
/**
* The {@link addQuarters} function options.
*/
/**
* @name addQuarters
* @category Quarter Helpers
* @summary Add the specified number of year quarters to the given date.
*
* @description
* Add the specified number of year quarters to the given date.
*
* @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
* @typeParam ResultDate - The result `Date` type, it is the type returned from the context function if it is passed, or inferred from the arguments.
*
* @param date - The date to be changed
* @param amount - The amount of quarters to be added.
* @param options - An object with options
*
* @returns The new date with the quarters added
*
* @example
* // Add 1 quarter to 1 September 2014:
* const result = addQuarters(new Date(2014, 8, 1), 1)
* //=; Mon Dec 01 2014 00:00:00
*/
function addQuarters(date, amount, options) {
	return addMonths(date, amount * 3, options);
}
// ../DnD helper/node_modules/date-fns/addYears.js
/**
* The {@link addYears} function options.
*/
/**
* @name addYears
* @category Year Helpers
* @summary Add the specified number of years to the given date.
*
* @description
* Add the specified number of years to the given date.
*
* @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
* @typeParam ResultDate - The result `Date` type.
*
* @param date - The date to be changed
* @param amount - The amount of years to be added.
* @param options - The options
*
* @returns The new date with the years added
*
* @example
* // Add 5 years to 1 September 2014:
* const result = addYears(new Date(2014, 8, 1), 5)
* //=> Sun Sep 01 2019 00:00:00
*/
function addYears(date, amount, options) {
	return addMonths(date, amount * 12, options);
}
// ../DnD helper/node_modules/date-fns/compareAsc.js
/**
* @name compareAsc
* @category Common Helpers
* @summary Compare the two dates and return -1, 0 or 1.
*
* @description
* Compare the two dates and return 1 if the first date is after the second,
* -1 if the first date is before the second or 0 if dates are equal.
*
* @param dateLeft - The first date to compare
* @param dateRight - The second date to compare
*
* @returns The result of the comparison
*
* @example
* // Compare 11 February 1987 and 10 July 1989:
* const result = compareAsc(new Date(1987, 1, 11), new Date(1989, 6, 10))
* //=> -1
*
* @example
* // Sort the array of dates:
* const result = [
*   new Date(1995, 6, 2),
*   new Date(1987, 1, 11),
*   new Date(1989, 6, 10)
* ].sort(compareAsc)
* //=> [
* //   Wed Feb 11 1987 00:00:00,
* //   Mon Jul 10 1989 00:00:00,
* //   Sun Jul 02 1995 00:00:00
* // ]
*/
function compareAsc(dateLeft, dateRight) {
	const diff = +toDate(dateLeft) - +toDate(dateRight);
	if (diff < 0) return -1;
	else if (diff > 0) return 1;
	return diff;
}
// ../DnD helper/node_modules/date-fns/isDate.js
/**
* @name isDate
* @category Common Helpers
* @summary Is the given value a date?
*
* @description
* Returns true if the given value is an instance of Date. The function works for dates transferred across iframes.
*
* @param value - The value to check
*
* @returns True if the given value is a date
*
* @example
* // For a valid date:
* const result = isDate(new Date())
* //=> true
*
* @example
* // For an invalid date:
* const result = isDate(new Date(NaN))
* //=> true
*
* @example
* // For some value:
* const result = isDate('2014-02-31')
* //=> false
*
* @example
* // For an object:
* const result = isDate({})
* //=> false
*/
function isDate(value) {
	return value instanceof Date || typeof value === "object" && Object.prototype.toString.call(value) === "[object Date]";
}
// ../DnD helper/node_modules/date-fns/isValid.js
/**
* @name isValid
* @category Common Helpers
* @summary Is the given date valid?
*
* @description
* Returns false if argument is Invalid Date and true otherwise.
* Argument is converted to Date using `toDate`. See [toDate](https://date-fns.org/docs/toDate)
* Invalid Date is a Date, whose time value is NaN.
*
* Time value of Date: http://es5.github.io/#x15.9.1.1
*
* @param date - The date to check
*
* @returns The date is valid
*
* @example
* // For the valid date:
* const result = isValid(new Date(2014, 1, 31))
* //=> true
*
* @example
* // For the value, convertible into a date:
* const result = isValid(1393804800000)
* //=> true
*
* @example
* // For the invalid date:
* const result = isValid(new Date(''))
* //=> false
*/
function isValid(date) {
	return !(!isDate(date) && typeof date !== "number" || isNaN(+toDate(date)));
}
// ../DnD helper/node_modules/date-fns/getQuarter.js
/**
* The {@link getQuarter} function options.
*/
/**
* @name getQuarter
* @category Quarter Helpers
* @summary Get the year quarter of the given date.
*
* @description
* Get the year quarter of the given date.
*
* @param date - The given date
* @param options - An object with options
*
* @returns The quarter
*
* @example
* // Which quarter is 2 July 2014?
* const result = getQuarter(new Date(2014, 6, 2));
* //=> 3
*/
function getQuarter(date, options) {
	const _date = toDate(date, options?.in);
	return Math.trunc(_date.getMonth() / 3) + 1;
}
// ../DnD helper/node_modules/date-fns/differenceInCalendarYears.js
/**
* The {@link differenceInCalendarYears} function options.
*/
/**
* @name differenceInCalendarYears
* @category Year Helpers
* @summary Get the number of calendar years between the given dates.
*
* @description
* Get the number of calendar years between the given dates.
*
* @param laterDate - The later date
* @param earlierDate - The earlier date
* @param options - An object with options

* @returns The number of calendar years
*
* @example
* // How many calendar years are between 31 December 2013 and 11 February 2015?
* const result = differenceInCalendarYears(
*   new Date(2015, 1, 11),
*   new Date(2013, 11, 31)
* );
* //=> 2
*/
function differenceInCalendarYears(laterDate, earlierDate, options) {
	const [laterDate_, earlierDate_] = normalizeDates(options?.in, laterDate, earlierDate);
	return laterDate_.getFullYear() - earlierDate_.getFullYear();
}
// ../DnD helper/node_modules/date-fns/_lib/getRoundingMethod.js
function getRoundingMethod(method) {
	return (number) => {
		const result = (method ? Math[method] : Math.trunc)(number);
		return result === 0 ? 0 : result;
	};
}
// ../DnD helper/node_modules/date-fns/differenceInYears.js
/**
* The {@link differenceInYears} function options.
*/
/**
* @name differenceInYears
* @category Year Helpers
* @summary Get the number of full years between the given dates.
*
* @description
* Get the number of full years between the given dates.
*
* @param laterDate - The later date
* @param earlierDate - The earlier date
* @param options - An object with options
*
* @returns The number of full years
*
* @example
* // How many full years are between 31 December 2013 and 11 February 2015?
* const result = differenceInYears(new Date(2015, 1, 11), new Date(2013, 11, 31))
* //=> 1
*/
function differenceInYears(laterDate, earlierDate, options) {
	const [laterDate_, earlierDate_] = normalizeDates(options?.in, laterDate, earlierDate);
	const sign = compareAsc(laterDate_, earlierDate_);
	const diff = Math.abs(differenceInCalendarYears(laterDate_, earlierDate_));
	laterDate_.setFullYear(1584);
	earlierDate_.setFullYear(1584);
	const result = sign * (diff - +(compareAsc(laterDate_, earlierDate_) === -sign));
	return result === 0 ? 0 : result;
}
// ../DnD helper/node_modules/date-fns/_lib/normalizeInterval.js
function normalizeInterval(context, interval) {
	const [start, end] = normalizeDates(context, interval.start, interval.end);
	return {
		start,
		end
	};
}
// ../DnD helper/node_modules/date-fns/eachDayOfInterval.js
/**
* The {@link eachDayOfInterval} function options.
*/
/**
* The {@link eachDayOfInterval} function result type. It resolves the proper data type.
* It uses the first argument date object type, starting from the date argument,
* then the start interval date, and finally the end interval date. If
* a context function is passed, it uses the context function return type.
*/
/**
* @name eachDayOfInterval
* @category Interval Helpers
* @summary Return the array of dates within the specified time interval.
*
* @description
* Return the array of dates within the specified time interval.
*
* @typeParam IntervalType - Interval type.
* @typeParam Options - Options type.
*
* @param interval - The interval.
* @param options - An object with options.
*
* @returns The array with starts of days from the day of the interval start to the day of the interval end
*
* @example
* // Each day between 6 October 2014 and 10 October 2014:
* const result = eachDayOfInterval({
*   start: new Date(2014, 9, 6),
*   end: new Date(2014, 9, 10)
* })
* //=> [
* //   Mon Oct 06 2014 00:00:00,
* //   Tue Oct 07 2014 00:00:00,
* //   Wed Oct 08 2014 00:00:00,
* //   Thu Oct 09 2014 00:00:00,
* //   Fri Oct 10 2014 00:00:00
* // ]
*/
function eachDayOfInterval(interval, options) {
	const { start, end } = normalizeInterval(options?.in, interval);
	let reversed = +start > +end;
	const endTime = reversed ? +start : +end;
	const date = reversed ? end : start;
	date.setHours(0, 0, 0, 0);
	let step = options?.step ?? 1;
	if (!step) return [];
	if (step < 0) {
		step = -step;
		reversed = !reversed;
	}
	const dates = [];
	while (+date <= endTime) {
		dates.push(constructFrom(start, date));
		date.setDate(date.getDate() + step);
		date.setHours(0, 0, 0, 0);
	}
	return reversed ? dates.reverse() : dates;
}
// ../DnD helper/node_modules/date-fns/startOfQuarter.js
/**
* The {@link startOfQuarter} function options.
*/
/**
* @name startOfQuarter
* @category Quarter Helpers
* @summary Return the start of a year quarter for the given date.
*
* @description
* Return the start of a year quarter for the given date.
* The result will be in the local timezone.
*
* @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
* @typeParam ResultDate - The result `Date` type, it is the type returned from the context function if it is passed, or inferred from the arguments.
*
* @param date - The original date
* @param options - The options
*
* @returns The start of a quarter
*
* @example
* // The start of a quarter for 2 September 2014 11:55:00:
* const result = startOfQuarter(new Date(2014, 8, 2, 11, 55, 0))
* //=> Tue Jul 01 2014 00:00:00
*/
function startOfQuarter(date, options) {
	const _date = toDate(date, options?.in);
	const currentMonth = _date.getMonth();
	const month = currentMonth - currentMonth % 3;
	_date.setMonth(month, 1);
	_date.setHours(0, 0, 0, 0);
	return _date;
}
// ../DnD helper/node_modules/date-fns/eachQuarterOfInterval.js
/**
* The {@link eachQuarterOfInterval} function options.
*/
/**
* The {@link eachQuarterOfInterval} function result type. It resolves the proper data type.
* It uses the first argument date object type, starting from the date argument,
* then the start interval date, and finally the end interval date. If
* a context function is passed, it uses the context function return type.
*/
/**
* @name eachQuarterOfInterval
* @category Interval Helpers
* @summary Return the array of quarters within the specified time interval.
*
* @description
* Return the array of quarters within the specified time interval.
*
* @typeParam IntervalType - Interval type.
* @typeParam Options - Options type.
*
* @param interval - The interval
* @param options - An object with options
*
* @returns The array with starts of quarters from the quarter of the interval start to the quarter of the interval end
*
* @example
* // Each quarter within interval 6 February 2014 - 10 August 2014:
* const result = eachQuarterOfInterval({
*   start: new Date(2014, 1, 6),
*   end: new Date(2014, 7, 10),
* })
* //=> [
* //   Wed Jan 01 2014 00:00:00,
* //   Tue Apr 01 2014 00:00:00,
* //   Tue Jul 01 2014 00:00:00,
* // ]
*/
function eachQuarterOfInterval(interval, options) {
	const { start, end } = normalizeInterval(options?.in, interval);
	let reversed = +start > +end;
	const endTime = reversed ? +startOfQuarter(start) : +startOfQuarter(end);
	let date = reversed ? startOfQuarter(end) : startOfQuarter(start);
	let step = options?.step ?? 1;
	if (!step) return [];
	if (step < 0) {
		step = -step;
		reversed = !reversed;
	}
	const dates = [];
	while (+date <= endTime) {
		dates.push(constructFrom(start, date));
		date = addQuarters(date, step);
	}
	return reversed ? dates.reverse() : dates;
}
// ../DnD helper/node_modules/date-fns/startOfMonth.js
/**
* The {@link startOfMonth} function options.
*/
/**
* @name startOfMonth
* @category Month Helpers
* @summary Return the start of a month for the given date.
*
* @description
* Return the start of a month for the given date. The result will be in the local timezone.
*
* @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments.
* Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
* @typeParam ResultDate - The result `Date` type, it is the type returned from the context function if it is passed,
* or inferred from the arguments.
*
* @param date - The original date
* @param options - An object with options
*
* @returns The start of a month
*
* @example
* // The start of a month for 2 September 2014 11:55:00:
* const result = startOfMonth(new Date(2014, 8, 2, 11, 55, 0))
* //=> Mon Sep 01 2014 00:00:00
*/
function startOfMonth(date, options) {
	const _date = toDate(date, options?.in);
	_date.setDate(1);
	_date.setHours(0, 0, 0, 0);
	return _date;
}
// ../DnD helper/node_modules/date-fns/endOfYear.js
/**
* The {@link endOfYear} function options.
*/
/**
* @name endOfYear
* @category Year Helpers
* @summary Return the end of a year for the given date.
*
* @description
* Return the end of a year for the given date.
* The result will be in the local timezone.
*
* @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
* @typeParam ResultDate - The result `Date` type, it is the type returned from the context function if it is passed, or inferred from the arguments.
*
* @param date - The original date
* @param options - The options
*
* @returns The end of a year
*
* @example
* // The end of a year for 2 September 2014 11:55:00:
* const result = endOfYear(new Date(2014, 8, 2, 11, 55, 0))
* //=> Wed Dec 31 2014 23:59:59.999
*/
function endOfYear(date, options) {
	const _date = toDate(date, options?.in);
	const year = _date.getFullYear();
	_date.setFullYear(year + 1, 0, 0);
	_date.setHours(23, 59, 59, 999);
	return _date;
}
// ../DnD helper/node_modules/date-fns/startOfYear.js
/**
* The {@link startOfYear} function options.
*/
/**
* @name startOfYear
* @category Year Helpers
* @summary Return the start of a year for the given date.
*
* @description
* Return the start of a year for the given date.
* The result will be in the local timezone.
*
* @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
* @typeParam ResultDate - The result `Date` type, it is the type returned from the context function if it is passed, or inferred from the arguments.
*
* @param date - The original date
* @param options - The options
*
* @returns The start of a year
*
* @example
* // The start of a year for 2 September 2014 11:55:00:
* const result = startOfYear(new Date(2014, 8, 2, 11, 55, 00))
* //=> Wed Jan 01 2014 00:00:00
*/
function startOfYear(date, options) {
	const date_ = toDate(date, options?.in);
	date_.setFullYear(date_.getFullYear(), 0, 1);
	date_.setHours(0, 0, 0, 0);
	return date_;
}
// ../DnD helper/node_modules/date-fns/endOfWeek.js
/**
* The {@link endOfWeek} function options.
*/
/**
* @name endOfWeek
* @category Week Helpers
* @summary Return the end of a week for the given date.
*
* @description
* Return the end of a week for the given date.
* The result will be in the local timezone.
*
* @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
* @typeParam ResultDate - The result `Date` type, it is the type returned from the context function if it is passed, or inferred from the arguments.
*
* @param date - The original date
* @param options - An object with options
*
* @returns The end of a week
*
* @example
* // The end of a week for 2 September 2014 11:55:00:
* const result = endOfWeek(new Date(2014, 8, 2, 11, 55, 0))
* //=> Sat Sep 06 2014 23:59:59.999
*
* @example
* // If the week starts on Monday, the end of the week for 2 September 2014 11:55:00:
* const result = endOfWeek(new Date(2014, 8, 2, 11, 55, 0), { weekStartsOn: 1 })
* //=> Sun Sep 07 2014 23:59:59.999
*/
function endOfWeek(date, options) {
	const defaultOptions = getDefaultOptions$1();
	const weekStartsOn = options?.weekStartsOn ?? options?.locale?.options?.weekStartsOn ?? defaultOptions.weekStartsOn ?? defaultOptions.locale?.options?.weekStartsOn ?? 0;
	const _date = toDate(date, options?.in);
	const day = _date.getDay();
	const diff = (day < weekStartsOn ? -7 : 0) + 6 - (day - weekStartsOn);
	_date.setDate(_date.getDate() + diff);
	_date.setHours(23, 59, 59, 999);
	return _date;
}
// ../DnD helper/node_modules/date-fns/endOfQuarter.js
/**
* The {@link endOfQuarter} function options.
*/
/**
* @name endOfQuarter
* @category Quarter Helpers
* @summary Return the end of a year quarter for the given date.
*
* @description
* Return the end of a year quarter for the given date.
* The result will be in the local timezone.
*
* @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
* @typeParam ResultDate - The result `Date` type, it is the type returned from the context function if it is passed, or inferred from the arguments.
*
* @param date - The original date
* @param options - An object with options
*
* @returns The end of a quarter
*
* @example
* // The end of a quarter for 2 September 2014 11:55:00:
* const result = endOfQuarter(new Date(2014, 8, 2, 11, 55, 0))
* //=> Tue Sep 30 2014 23:59:59.999
*/
function endOfQuarter(date, options) {
	const _date = toDate(date, options?.in);
	const currentMonth = _date.getMonth();
	const month = currentMonth - currentMonth % 3 + 3;
	_date.setMonth(month, 0);
	_date.setHours(23, 59, 59, 999);
	return _date;
}
// ../DnD helper/node_modules/date-fns/locale/en-US/_lib/formatDistance.js
var formatDistanceLocale = {
	lessThanXSeconds: {
		one: "less than a second",
		other: "less than {{count}} seconds"
	},
	xSeconds: {
		one: "1 second",
		other: "{{count}} seconds"
	},
	halfAMinute: "half a minute",
	lessThanXMinutes: {
		one: "less than a minute",
		other: "less than {{count}} minutes"
	},
	xMinutes: {
		one: "1 minute",
		other: "{{count}} minutes"
	},
	aboutXHours: {
		one: "about 1 hour",
		other: "about {{count}} hours"
	},
	xHours: {
		one: "1 hour",
		other: "{{count}} hours"
	},
	xDays: {
		one: "1 day",
		other: "{{count}} days"
	},
	aboutXWeeks: {
		one: "about 1 week",
		other: "about {{count}} weeks"
	},
	xWeeks: {
		one: "1 week",
		other: "{{count}} weeks"
	},
	aboutXMonths: {
		one: "about 1 month",
		other: "about {{count}} months"
	},
	xMonths: {
		one: "1 month",
		other: "{{count}} months"
	},
	aboutXYears: {
		one: "about 1 year",
		other: "about {{count}} years"
	},
	xYears: {
		one: "1 year",
		other: "{{count}} years"
	},
	overXYears: {
		one: "over 1 year",
		other: "over {{count}} years"
	},
	almostXYears: {
		one: "almost 1 year",
		other: "almost {{count}} years"
	}
};
var formatDistance = (token, count, options) => {
	let result;
	const tokenValue = formatDistanceLocale[token];
	if (typeof tokenValue === "string") result = tokenValue;
	else if (count === 1) result = tokenValue.one;
	else result = tokenValue.other.replace("{{count}}", count.toString());
	if (options?.addSuffix) {
		if (options.comparison && options.comparison > 0) return "in " + result;
		else return result + " ago";
	}
	return result;
};
// ../DnD helper/node_modules/date-fns/locale/_lib/buildFormatLongFn.js
function buildFormatLongFn(args) {
	return (options = {}) => {
		const width = options.width ? String(options.width) : args.defaultWidth;
		return args.formats[width] || args.formats[args.defaultWidth];
	};
}
var formatLong = {
	date: buildFormatLongFn({
		formats: {
			full: "EEEE, MMMM do, y",
			long: "MMMM do, y",
			medium: "MMM d, y",
			short: "MM/dd/yyyy"
		},
		defaultWidth: "full"
	}),
	time: buildFormatLongFn({
		formats: {
			full: "h:mm:ss a zzzz",
			long: "h:mm:ss a z",
			medium: "h:mm:ss a",
			short: "h:mm a"
		},
		defaultWidth: "full"
	}),
	dateTime: buildFormatLongFn({
		formats: {
			full: "{{date}} 'at' {{time}}",
			long: "{{date}} 'at' {{time}}",
			medium: "{{date}}, {{time}}",
			short: "{{date}}, {{time}}"
		},
		defaultWidth: "full"
	})
};
// ../DnD helper/node_modules/date-fns/locale/en-US/_lib/formatRelative.js
var formatRelativeLocale = {
	lastWeek: "'last' eeee 'at' p",
	yesterday: "'yesterday at' p",
	today: "'today at' p",
	tomorrow: "'tomorrow at' p",
	nextWeek: "eeee 'at' p",
	other: "P"
};
var formatRelative = (token, _date, _baseDate, _options) => formatRelativeLocale[token];
// ../DnD helper/node_modules/date-fns/locale/_lib/buildLocalizeFn.js
/**
* The localize function argument callback which allows to convert raw value to
* the actual type.
*
* @param value - The value to convert
*
* @returns The converted value
*/
/**
* The map of localized values for each width.
*/
/**
* The index type of the locale unit value. It types conversion of units of
* values that don't start at 0 (i.e. quarters).
*/
/**
* Converts the unit value to the tuple of values.
*/
/**
* The tuple of localized era values. The first element represents BC,
* the second element represents AD.
*/
/**
* The tuple of localized quarter values. The first element represents Q1.
*/
/**
* The tuple of localized day values. The first element represents Sunday.
*/
/**
* The tuple of localized month values. The first element represents January.
*/
function buildLocalizeFn(args) {
	return (value, options) => {
		const context = options?.context ? String(options.context) : "standalone";
		let valuesArray;
		if (context === "formatting" && args.formattingValues) {
			const defaultWidth = args.defaultFormattingWidth || args.defaultWidth;
			const width = options?.width ? String(options.width) : defaultWidth;
			valuesArray = args.formattingValues[width] || args.formattingValues[defaultWidth];
		} else {
			const defaultWidth = args.defaultWidth;
			const width = options?.width ? String(options.width) : args.defaultWidth;
			valuesArray = args.values[width] || args.values[defaultWidth];
		}
		const index = args.argumentCallback ? args.argumentCallback(value) : value;
		return valuesArray[index];
	};
}
// ../DnD helper/node_modules/date-fns/locale/en-US/_lib/localize.js
var eraValues = {
	narrow: ["B", "A"],
	abbreviated: ["BC", "AD"],
	wide: ["Before Christ", "Anno Domini"]
};
var quarterValues = {
	narrow: [
		"1",
		"2",
		"3",
		"4"
	],
	abbreviated: [
		"Q1",
		"Q2",
		"Q3",
		"Q4"
	],
	wide: [
		"1st quarter",
		"2nd quarter",
		"3rd quarter",
		"4th quarter"
	]
};
var monthValues = {
	narrow: [
		"J",
		"F",
		"M",
		"A",
		"M",
		"J",
		"J",
		"A",
		"S",
		"O",
		"N",
		"D"
	],
	abbreviated: [
		"Jan",
		"Feb",
		"Mar",
		"Apr",
		"May",
		"Jun",
		"Jul",
		"Aug",
		"Sep",
		"Oct",
		"Nov",
		"Dec"
	],
	wide: [
		"January",
		"February",
		"March",
		"April",
		"May",
		"June",
		"July",
		"August",
		"September",
		"October",
		"November",
		"December"
	]
};
var dayValues = {
	narrow: [
		"S",
		"M",
		"T",
		"W",
		"T",
		"F",
		"S"
	],
	short: [
		"Su",
		"Mo",
		"Tu",
		"We",
		"Th",
		"Fr",
		"Sa"
	],
	abbreviated: [
		"Sun",
		"Mon",
		"Tue",
		"Wed",
		"Thu",
		"Fri",
		"Sat"
	],
	wide: [
		"Sunday",
		"Monday",
		"Tuesday",
		"Wednesday",
		"Thursday",
		"Friday",
		"Saturday"
	]
};
var dayPeriodValues = {
	narrow: {
		am: "a",
		pm: "p",
		midnight: "mi",
		noon: "n",
		morning: "morning",
		afternoon: "afternoon",
		evening: "evening",
		night: "night"
	},
	abbreviated: {
		am: "AM",
		pm: "PM",
		midnight: "midnight",
		noon: "noon",
		morning: "morning",
		afternoon: "afternoon",
		evening: "evening",
		night: "night"
	},
	wide: {
		am: "a.m.",
		pm: "p.m.",
		midnight: "midnight",
		noon: "noon",
		morning: "morning",
		afternoon: "afternoon",
		evening: "evening",
		night: "night"
	}
};
var formattingDayPeriodValues = {
	narrow: {
		am: "a",
		pm: "p",
		midnight: "mi",
		noon: "n",
		morning: "in the morning",
		afternoon: "in the afternoon",
		evening: "in the evening",
		night: "at night"
	},
	abbreviated: {
		am: "AM",
		pm: "PM",
		midnight: "midnight",
		noon: "noon",
		morning: "in the morning",
		afternoon: "in the afternoon",
		evening: "in the evening",
		night: "at night"
	},
	wide: {
		am: "a.m.",
		pm: "p.m.",
		midnight: "midnight",
		noon: "noon",
		morning: "in the morning",
		afternoon: "in the afternoon",
		evening: "in the evening",
		night: "at night"
	}
};
var ordinalNumber = (dirtyNumber, _options) => {
	const number = Number(dirtyNumber);
	const rem100 = number % 100;
	if (rem100 > 20 || rem100 < 10) switch (rem100 % 10) {
		case 1: return number + "st";
		case 2: return number + "nd";
		case 3: return number + "rd";
	}
	return number + "th";
};
var localize = {
	ordinalNumber,
	era: buildLocalizeFn({
		values: eraValues,
		defaultWidth: "wide"
	}),
	quarter: buildLocalizeFn({
		values: quarterValues,
		defaultWidth: "wide",
		argumentCallback: (quarter) => quarter - 1
	}),
	month: buildLocalizeFn({
		values: monthValues,
		defaultWidth: "wide"
	}),
	day: buildLocalizeFn({
		values: dayValues,
		defaultWidth: "wide"
	}),
	dayPeriod: buildLocalizeFn({
		values: dayPeriodValues,
		defaultWidth: "wide",
		formattingValues: formattingDayPeriodValues,
		defaultFormattingWidth: "wide"
	})
};
// ../DnD helper/node_modules/date-fns/locale/_lib/buildMatchFn.js
function buildMatchFn(args) {
	return (string, options = {}) => {
		const width = options.width;
		const matchPattern = width && args.matchPatterns[width] || args.matchPatterns[args.defaultMatchWidth];
		const matchResult = string.match(matchPattern);
		if (!matchResult) return null;
		const matchedString = matchResult[0];
		const parsePatterns = width && args.parsePatterns[width] || args.parsePatterns[args.defaultParseWidth];
		const key = Array.isArray(parsePatterns) ? findIndex(parsePatterns, (pattern) => pattern.test(matchedString)) : findKey(parsePatterns, (pattern) => pattern.test(matchedString));
		let value;
		value = args.valueCallback ? args.valueCallback(key) : key;
		value = options.valueCallback ? options.valueCallback(value) : value;
		const rest = string.slice(matchedString.length);
		return {
			value,
			rest
		};
	};
}
function findKey(object, predicate) {
	for (const key in object) if (Object.prototype.hasOwnProperty.call(object, key) && predicate(object[key])) return key;
}
function findIndex(array, predicate) {
	for (let key = 0; key < array.length; key++) if (predicate(array[key])) return key;
}
// ../DnD helper/node_modules/date-fns/locale/_lib/buildMatchPatternFn.js
function buildMatchPatternFn(args) {
	return (string, options = {}) => {
		const matchResult = string.match(args.matchPattern);
		if (!matchResult) return null;
		const matchedString = matchResult[0];
		const parseResult = string.match(args.parsePattern);
		if (!parseResult) return null;
		let value = args.valueCallback ? args.valueCallback(parseResult[0]) : parseResult[0];
		value = options.valueCallback ? options.valueCallback(value) : value;
		const rest = string.slice(matchedString.length);
		return {
			value,
			rest
		};
	};
}
// ../DnD helper/node_modules/date-fns/locale/en-US.js
/**
* @category Locales
* @summary English locale (United States).
* @language English
* @iso-639-2 eng
* @author Sasha Koss [@kossnocorp](https://github.com/kossnocorp)
* @author Lesha Koss [@leshakoss](https://github.com/leshakoss)
*/
var enUS = {
	code: "en-US",
	formatDistance,
	formatLong,
	formatRelative,
	localize,
	match: {
		ordinalNumber: buildMatchPatternFn({
			matchPattern: /^(\d+)(th|st|nd|rd)?/i,
			parsePattern: /\d+/i,
			valueCallback: (value) => parseInt(value, 10)
		}),
		era: buildMatchFn({
			matchPatterns: {
				narrow: /^(b|a)/i,
				abbreviated: /^(b\.?\s?c\.?|b\.?\s?c\.?\s?e\.?|a\.?\s?d\.?|c\.?\s?e\.?)/i,
				wide: /^(before christ|before common era|anno domini|common era)/i
			},
			defaultMatchWidth: "wide",
			parsePatterns: { any: [/^b/i, /^(a|c)/i] },
			defaultParseWidth: "any"
		}),
		quarter: buildMatchFn({
			matchPatterns: {
				narrow: /^[1234]/i,
				abbreviated: /^q[1234]/i,
				wide: /^[1234](th|st|nd|rd)? quarter/i
			},
			defaultMatchWidth: "wide",
			parsePatterns: { any: [
				/1/i,
				/2/i,
				/3/i,
				/4/i
			] },
			defaultParseWidth: "any",
			valueCallback: (index) => index + 1
		}),
		month: buildMatchFn({
			matchPatterns: {
				narrow: /^[jfmasond]/i,
				abbreviated: /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
				wide: /^(january|february|march|april|may|june|july|august|september|october|november|december)/i
			},
			defaultMatchWidth: "wide",
			parsePatterns: {
				narrow: [
					/^j/i,
					/^f/i,
					/^m/i,
					/^a/i,
					/^m/i,
					/^j/i,
					/^j/i,
					/^a/i,
					/^s/i,
					/^o/i,
					/^n/i,
					/^d/i
				],
				any: [
					/^ja/i,
					/^f/i,
					/^mar/i,
					/^ap/i,
					/^may/i,
					/^jun/i,
					/^jul/i,
					/^au/i,
					/^s/i,
					/^o/i,
					/^n/i,
					/^d/i
				]
			},
			defaultParseWidth: "any"
		}),
		day: buildMatchFn({
			matchPatterns: {
				narrow: /^[smtwf]/i,
				short: /^(su|mo|tu|we|th|fr|sa)/i,
				abbreviated: /^(sun|mon|tue|wed|thu|fri|sat)/i,
				wide: /^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/i
			},
			defaultMatchWidth: "wide",
			parsePatterns: {
				narrow: [
					/^s/i,
					/^m/i,
					/^t/i,
					/^w/i,
					/^t/i,
					/^f/i,
					/^s/i
				],
				any: [
					/^su/i,
					/^m/i,
					/^tu/i,
					/^w/i,
					/^th/i,
					/^f/i,
					/^sa/i
				]
			},
			defaultParseWidth: "any"
		}),
		dayPeriod: buildMatchFn({
			matchPatterns: {
				narrow: /^(a|p|mi|n|(in the|at) (morning|afternoon|evening|night))/i,
				any: /^([ap]\.?\s?m\.?|midnight|noon|(in the|at) (morning|afternoon|evening|night))/i
			},
			defaultMatchWidth: "any",
			parsePatterns: { any: {
				am: /^a/i,
				pm: /^p/i,
				midnight: /^mi/i,
				noon: /^no/i,
				morning: /morning/i,
				afternoon: /afternoon/i,
				evening: /evening/i,
				night: /night/i
			} },
			defaultParseWidth: "any"
		})
	},
	options: {
		weekStartsOn: 0,
		firstWeekContainsDate: 1
	}
};
// ../DnD helper/node_modules/date-fns/getDayOfYear.js
/**
* The {@link getDayOfYear} function options.
*/
/**
* @name getDayOfYear
* @category Day Helpers
* @summary Get the day of the year of the given date.
*
* @description
* Get the day of the year of the given date.
*
* @param date - The given date
* @param options - The options
*
* @returns The day of year
*
* @example
* // Which day of the year is 2 July 2014?
* const result = getDayOfYear(new Date(2014, 6, 2))
* //=> 183
*/
function getDayOfYear(date, options) {
	const _date = toDate(date, options?.in);
	return differenceInCalendarDays(_date, startOfYear(_date)) + 1;
}
// ../DnD helper/node_modules/date-fns/getISOWeek.js
/**
* The {@link getISOWeek} function options.
*/
/**
* @name getISOWeek
* @category ISO Week Helpers
* @summary Get the ISO week of the given date.
*
* @description
* Get the ISO week of the given date.
*
* ISO week-numbering year: http://en.wikipedia.org/wiki/ISO_week_date
*
* @param date - The given date
* @param options - The options
*
* @returns The ISO week
*
* @example
* // Which week of the ISO-week numbering year is 2 January 2005?
* const result = getISOWeek(new Date(2005, 0, 2))
* //=> 53
*/
function getISOWeek(date, options) {
	const _date = toDate(date, options?.in);
	const diff = +startOfISOWeek(_date) - +startOfISOWeekYear(_date);
	return Math.round(diff / millisecondsInWeek) + 1;
}
// ../DnD helper/node_modules/date-fns/getWeekYear.js
/**
* The {@link getWeekYear} function options.
*/
/**
* @name getWeekYear
* @category Week-Numbering Year Helpers
* @summary Get the local week-numbering year of the given date.
*
* @description
* Get the local week-numbering year of the given date.
* The exact calculation depends on the values of
* `options.weekStartsOn` (which is the index of the first day of the week)
* and `options.firstWeekContainsDate` (which is the day of January, which is always in
* the first week of the week-numbering year)
*
* Week numbering: https://en.wikipedia.org/wiki/Week#The_ISO_week_date_system
*
* @param date - The given date
* @param options - An object with options.
*
* @returns The local week-numbering year
*
* @example
* // Which week numbering year is 26 December 2004 with the default settings?
* const result = getWeekYear(new Date(2004, 11, 26))
* //=> 2005
*
* @example
* // Which week numbering year is 26 December 2004 if week starts on Saturday?
* const result = getWeekYear(new Date(2004, 11, 26), { weekStartsOn: 6 })
* //=> 2004
*
* @example
* // Which week numbering year is 26 December 2004 if the first week contains 4 January?
* const result = getWeekYear(new Date(2004, 11, 26), { firstWeekContainsDate: 4 })
* //=> 2004
*/
function getWeekYear(date, options) {
	const _date = toDate(date, options?.in);
	const year = _date.getFullYear();
	const defaultOptions = getDefaultOptions$1();
	const firstWeekContainsDate = options?.firstWeekContainsDate ?? options?.locale?.options?.firstWeekContainsDate ?? defaultOptions.firstWeekContainsDate ?? defaultOptions.locale?.options?.firstWeekContainsDate ?? 1;
	const firstWeekOfNextYear = constructFrom(options?.in || date, 0);
	firstWeekOfNextYear.setFullYear(year + 1, 0, firstWeekContainsDate);
	firstWeekOfNextYear.setHours(0, 0, 0, 0);
	const startOfNextYear = startOfWeek(firstWeekOfNextYear, options);
	const firstWeekOfThisYear = constructFrom(options?.in || date, 0);
	firstWeekOfThisYear.setFullYear(year, 0, firstWeekContainsDate);
	firstWeekOfThisYear.setHours(0, 0, 0, 0);
	const startOfThisYear = startOfWeek(firstWeekOfThisYear, options);
	if (+_date >= +startOfNextYear) return year + 1;
	else if (+_date >= +startOfThisYear) return year;
	else return year - 1;
}
// ../DnD helper/node_modules/date-fns/startOfWeekYear.js
/**
* The {@link startOfWeekYear} function options.
*/
/**
* @name startOfWeekYear
* @category Week-Numbering Year Helpers
* @summary Return the start of a local week-numbering year for the given date.
*
* @description
* Return the start of a local week-numbering year.
* The exact calculation depends on the values of
* `options.weekStartsOn` (which is the index of the first day of the week)
* and `options.firstWeekContainsDate` (which is the day of January, which is always in
* the first week of the week-numbering year)
*
* Week numbering: https://en.wikipedia.org/wiki/Week#The_ISO_week_date_system
*
* @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
* @typeParam ResultDate - The result `Date` type.
*
* @param date - The original date
* @param options - An object with options
*
* @returns The start of a week-numbering year
*
* @example
* // The start of an a week-numbering year for 2 July 2005 with default settings:
* const result = startOfWeekYear(new Date(2005, 6, 2))
* //=> Sun Dec 26 2004 00:00:00
*
* @example
* // The start of a week-numbering year for 2 July 2005
* // if Monday is the first day of week
* // and 4 January is always in the first week of the year:
* const result = startOfWeekYear(new Date(2005, 6, 2), {
*   weekStartsOn: 1,
*   firstWeekContainsDate: 4
* })
* //=> Mon Jan 03 2005 00:00:00
*/
function startOfWeekYear(date, options) {
	const defaultOptions = getDefaultOptions$1();
	const firstWeekContainsDate = options?.firstWeekContainsDate ?? options?.locale?.options?.firstWeekContainsDate ?? defaultOptions.firstWeekContainsDate ?? defaultOptions.locale?.options?.firstWeekContainsDate ?? 1;
	const year = getWeekYear(date, options);
	const firstWeek = constructFrom(options?.in || date, 0);
	firstWeek.setFullYear(year, 0, firstWeekContainsDate);
	firstWeek.setHours(0, 0, 0, 0);
	return startOfWeek(firstWeek, options);
}
// ../DnD helper/node_modules/date-fns/getWeek.js
/**
* The {@link getWeek} function options.
*/
/**
* @name getWeek
* @category Week Helpers
* @summary Get the local week index of the given date.
*
* @description
* Get the local week index of the given date.
* The exact calculation depends on the values of
* `options.weekStartsOn` (which is the index of the first day of the week)
* and `options.firstWeekContainsDate` (which is the day of January, which is always in
* the first week of the week-numbering year)
*
* Week numbering: https://en.wikipedia.org/wiki/Week#The_ISO_week_date_system
*
* @param date - The given date
* @param options - An object with options
*
* @returns The week
*
* @example
* // Which week of the local week numbering year is 2 January 2005 with default options?
* const result = getWeek(new Date(2005, 0, 2))
* //=> 2
*
* @example
* // Which week of the local week numbering year is 2 January 2005,
* // if Monday is the first day of the week,
* // and the first week of the year always contains 4 January?
* const result = getWeek(new Date(2005, 0, 2), {
*   weekStartsOn: 1,
*   firstWeekContainsDate: 4
* })
* //=> 53
*/
function getWeek(date, options) {
	const _date = toDate(date, options?.in);
	const diff = +startOfWeek(_date, options) - +startOfWeekYear(_date, options);
	return Math.round(diff / millisecondsInWeek) + 1;
}
// ../DnD helper/node_modules/date-fns/_lib/addLeadingZeros.js
function addLeadingZeros(number, targetLength) {
	return (number < 0 ? "-" : "") + Math.abs(number).toString().padStart(targetLength, "0");
}
// ../DnD helper/node_modules/date-fns/_lib/format/lightFormatters.js
var lightFormatters = {
	y(date, token) {
		const signedYear = date.getFullYear();
		const year = signedYear > 0 ? signedYear : 1 - signedYear;
		return addLeadingZeros(token === "yy" ? year % 100 : year, token.length);
	},
	M(date, token) {
		const month = date.getMonth();
		return token === "M" ? String(month + 1) : addLeadingZeros(month + 1, 2);
	},
	d(date, token) {
		return addLeadingZeros(date.getDate(), token.length);
	},
	a(date, token) {
		const dayPeriodEnumValue = date.getHours() / 12 >= 1 ? "pm" : "am";
		switch (token) {
			case "a":
			case "aa": return dayPeriodEnumValue.toUpperCase();
			case "aaa": return dayPeriodEnumValue;
			case "aaaaa": return dayPeriodEnumValue[0];
			default: return dayPeriodEnumValue === "am" ? "a.m." : "p.m.";
		}
	},
	h(date, token) {
		return addLeadingZeros(date.getHours() % 12 || 12, token.length);
	},
	H(date, token) {
		return addLeadingZeros(date.getHours(), token.length);
	},
	m(date, token) {
		return addLeadingZeros(date.getMinutes(), token.length);
	},
	s(date, token) {
		return addLeadingZeros(date.getSeconds(), token.length);
	},
	S(date, token) {
		const numberOfDigits = token.length;
		const milliseconds = date.getMilliseconds();
		return addLeadingZeros(Math.trunc(milliseconds * Math.pow(10, numberOfDigits - 3)), token.length);
	}
};
// ../DnD helper/node_modules/date-fns/_lib/format/formatters.js
var dayPeriodEnum = {
	am: "am",
	pm: "pm",
	midnight: "midnight",
	noon: "noon",
	morning: "morning",
	afternoon: "afternoon",
	evening: "evening",
	night: "night"
};
var formatters = {
	G: function(date, token, localize) {
		const era = date.getFullYear() > 0 ? 1 : 0;
		switch (token) {
			case "G":
			case "GG":
			case "GGG": return localize.era(era, { width: "abbreviated" });
			case "GGGGG": return localize.era(era, { width: "narrow" });
			default: return localize.era(era, { width: "wide" });
		}
	},
	y: function(date, token, localize) {
		if (token === "yo") {
			const signedYear = date.getFullYear();
			const year = signedYear > 0 ? signedYear : 1 - signedYear;
			return localize.ordinalNumber(year, { unit: "year" });
		}
		return lightFormatters.y(date, token);
	},
	Y: function(date, token, localize, options) {
		const signedWeekYear = getWeekYear(date, options);
		const weekYear = signedWeekYear > 0 ? signedWeekYear : 1 - signedWeekYear;
		if (token === "YY") return addLeadingZeros(weekYear % 100, 2);
		if (token === "Yo") return localize.ordinalNumber(weekYear, { unit: "year" });
		return addLeadingZeros(weekYear, token.length);
	},
	R: function(date, token) {
		return addLeadingZeros(getISOWeekYear(date), token.length);
	},
	u: function(date, token) {
		return addLeadingZeros(date.getFullYear(), token.length);
	},
	Q: function(date, token, localize) {
		const quarter = Math.ceil((date.getMonth() + 1) / 3);
		switch (token) {
			case "Q": return String(quarter);
			case "QQ": return addLeadingZeros(quarter, 2);
			case "Qo": return localize.ordinalNumber(quarter, { unit: "quarter" });
			case "QQQ": return localize.quarter(quarter, {
				width: "abbreviated",
				context: "formatting"
			});
			case "QQQQQ": return localize.quarter(quarter, {
				width: "narrow",
				context: "formatting"
			});
			default: return localize.quarter(quarter, {
				width: "wide",
				context: "formatting"
			});
		}
	},
	q: function(date, token, localize) {
		const quarter = Math.ceil((date.getMonth() + 1) / 3);
		switch (token) {
			case "q": return String(quarter);
			case "qq": return addLeadingZeros(quarter, 2);
			case "qo": return localize.ordinalNumber(quarter, { unit: "quarter" });
			case "qqq": return localize.quarter(quarter, {
				width: "abbreviated",
				context: "standalone"
			});
			case "qqqqq": return localize.quarter(quarter, {
				width: "narrow",
				context: "standalone"
			});
			default: return localize.quarter(quarter, {
				width: "wide",
				context: "standalone"
			});
		}
	},
	M: function(date, token, localize) {
		const month = date.getMonth();
		switch (token) {
			case "M":
			case "MM": return lightFormatters.M(date, token);
			case "Mo": return localize.ordinalNumber(month + 1, { unit: "month" });
			case "MMM": return localize.month(month, {
				width: "abbreviated",
				context: "formatting"
			});
			case "MMMMM": return localize.month(month, {
				width: "narrow",
				context: "formatting"
			});
			default: return localize.month(month, {
				width: "wide",
				context: "formatting"
			});
		}
	},
	L: function(date, token, localize) {
		const month = date.getMonth();
		switch (token) {
			case "L": return String(month + 1);
			case "LL": return addLeadingZeros(month + 1, 2);
			case "Lo": return localize.ordinalNumber(month + 1, { unit: "month" });
			case "LLL": return localize.month(month, {
				width: "abbreviated",
				context: "standalone"
			});
			case "LLLLL": return localize.month(month, {
				width: "narrow",
				context: "standalone"
			});
			default: return localize.month(month, {
				width: "wide",
				context: "standalone"
			});
		}
	},
	w: function(date, token, localize, options) {
		const week = getWeek(date, options);
		if (token === "wo") return localize.ordinalNumber(week, { unit: "week" });
		return addLeadingZeros(week, token.length);
	},
	I: function(date, token, localize) {
		const isoWeek = getISOWeek(date);
		if (token === "Io") return localize.ordinalNumber(isoWeek, { unit: "week" });
		return addLeadingZeros(isoWeek, token.length);
	},
	d: function(date, token, localize) {
		if (token === "do") return localize.ordinalNumber(date.getDate(), { unit: "date" });
		return lightFormatters.d(date, token);
	},
	D: function(date, token, localize) {
		const dayOfYear = getDayOfYear(date);
		if (token === "Do") return localize.ordinalNumber(dayOfYear, { unit: "dayOfYear" });
		return addLeadingZeros(dayOfYear, token.length);
	},
	E: function(date, token, localize) {
		const dayOfWeek = date.getDay();
		switch (token) {
			case "E":
			case "EE":
			case "EEE": return localize.day(dayOfWeek, {
				width: "abbreviated",
				context: "formatting"
			});
			case "EEEEE": return localize.day(dayOfWeek, {
				width: "narrow",
				context: "formatting"
			});
			case "EEEEEE": return localize.day(dayOfWeek, {
				width: "short",
				context: "formatting"
			});
			default: return localize.day(dayOfWeek, {
				width: "wide",
				context: "formatting"
			});
		}
	},
	e: function(date, token, localize, options) {
		const dayOfWeek = date.getDay();
		const localDayOfWeek = (dayOfWeek - options.weekStartsOn + 8) % 7 || 7;
		switch (token) {
			case "e": return String(localDayOfWeek);
			case "ee": return addLeadingZeros(localDayOfWeek, 2);
			case "eo": return localize.ordinalNumber(localDayOfWeek, { unit: "day" });
			case "eee": return localize.day(dayOfWeek, {
				width: "abbreviated",
				context: "formatting"
			});
			case "eeeee": return localize.day(dayOfWeek, {
				width: "narrow",
				context: "formatting"
			});
			case "eeeeee": return localize.day(dayOfWeek, {
				width: "short",
				context: "formatting"
			});
			default: return localize.day(dayOfWeek, {
				width: "wide",
				context: "formatting"
			});
		}
	},
	c: function(date, token, localize, options) {
		const dayOfWeek = date.getDay();
		const localDayOfWeek = (dayOfWeek - options.weekStartsOn + 8) % 7 || 7;
		switch (token) {
			case "c": return String(localDayOfWeek);
			case "cc": return addLeadingZeros(localDayOfWeek, token.length);
			case "co": return localize.ordinalNumber(localDayOfWeek, { unit: "day" });
			case "ccc": return localize.day(dayOfWeek, {
				width: "abbreviated",
				context: "standalone"
			});
			case "ccccc": return localize.day(dayOfWeek, {
				width: "narrow",
				context: "standalone"
			});
			case "cccccc": return localize.day(dayOfWeek, {
				width: "short",
				context: "standalone"
			});
			default: return localize.day(dayOfWeek, {
				width: "wide",
				context: "standalone"
			});
		}
	},
	i: function(date, token, localize) {
		const dayOfWeek = date.getDay();
		const isoDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;
		switch (token) {
			case "i": return String(isoDayOfWeek);
			case "ii": return addLeadingZeros(isoDayOfWeek, token.length);
			case "io": return localize.ordinalNumber(isoDayOfWeek, { unit: "day" });
			case "iii": return localize.day(dayOfWeek, {
				width: "abbreviated",
				context: "formatting"
			});
			case "iiiii": return localize.day(dayOfWeek, {
				width: "narrow",
				context: "formatting"
			});
			case "iiiiii": return localize.day(dayOfWeek, {
				width: "short",
				context: "formatting"
			});
			default: return localize.day(dayOfWeek, {
				width: "wide",
				context: "formatting"
			});
		}
	},
	a: function(date, token, localize) {
		const dayPeriodEnumValue = date.getHours() / 12 >= 1 ? "pm" : "am";
		switch (token) {
			case "a":
			case "aa": return localize.dayPeriod(dayPeriodEnumValue, {
				width: "abbreviated",
				context: "formatting"
			});
			case "aaa": return localize.dayPeriod(dayPeriodEnumValue, {
				width: "abbreviated",
				context: "formatting"
			}).toLowerCase();
			case "aaaaa": return localize.dayPeriod(dayPeriodEnumValue, {
				width: "narrow",
				context: "formatting"
			});
			default: return localize.dayPeriod(dayPeriodEnumValue, {
				width: "wide",
				context: "formatting"
			});
		}
	},
	b: function(date, token, localize) {
		const hours = date.getHours();
		let dayPeriodEnumValue;
		if (hours === 12) dayPeriodEnumValue = dayPeriodEnum.noon;
		else if (hours === 0) dayPeriodEnumValue = dayPeriodEnum.midnight;
		else dayPeriodEnumValue = hours / 12 >= 1 ? "pm" : "am";
		switch (token) {
			case "b":
			case "bb": return localize.dayPeriod(dayPeriodEnumValue, {
				width: "abbreviated",
				context: "formatting"
			});
			case "bbb": return localize.dayPeriod(dayPeriodEnumValue, {
				width: "abbreviated",
				context: "formatting"
			}).toLowerCase();
			case "bbbbb": return localize.dayPeriod(dayPeriodEnumValue, {
				width: "narrow",
				context: "formatting"
			});
			default: return localize.dayPeriod(dayPeriodEnumValue, {
				width: "wide",
				context: "formatting"
			});
		}
	},
	B: function(date, token, localize) {
		const hours = date.getHours();
		let dayPeriodEnumValue;
		if (hours >= 17) dayPeriodEnumValue = dayPeriodEnum.evening;
		else if (hours >= 12) dayPeriodEnumValue = dayPeriodEnum.afternoon;
		else if (hours >= 4) dayPeriodEnumValue = dayPeriodEnum.morning;
		else dayPeriodEnumValue = dayPeriodEnum.night;
		switch (token) {
			case "B":
			case "BB":
			case "BBB": return localize.dayPeriod(dayPeriodEnumValue, {
				width: "abbreviated",
				context: "formatting"
			});
			case "BBBBB": return localize.dayPeriod(dayPeriodEnumValue, {
				width: "narrow",
				context: "formatting"
			});
			default: return localize.dayPeriod(dayPeriodEnumValue, {
				width: "wide",
				context: "formatting"
			});
		}
	},
	h: function(date, token, localize) {
		if (token === "ho") {
			let hours = date.getHours() % 12;
			if (hours === 0) hours = 12;
			return localize.ordinalNumber(hours, { unit: "hour" });
		}
		return lightFormatters.h(date, token);
	},
	H: function(date, token, localize) {
		if (token === "Ho") return localize.ordinalNumber(date.getHours(), { unit: "hour" });
		return lightFormatters.H(date, token);
	},
	K: function(date, token, localize) {
		const hours = date.getHours() % 12;
		if (token === "Ko") return localize.ordinalNumber(hours, { unit: "hour" });
		return addLeadingZeros(hours, token.length);
	},
	k: function(date, token, localize) {
		let hours = date.getHours();
		if (hours === 0) hours = 24;
		if (token === "ko") return localize.ordinalNumber(hours, { unit: "hour" });
		return addLeadingZeros(hours, token.length);
	},
	m: function(date, token, localize) {
		if (token === "mo") return localize.ordinalNumber(date.getMinutes(), { unit: "minute" });
		return lightFormatters.m(date, token);
	},
	s: function(date, token, localize) {
		if (token === "so") return localize.ordinalNumber(date.getSeconds(), { unit: "second" });
		return lightFormatters.s(date, token);
	},
	S: function(date, token) {
		return lightFormatters.S(date, token);
	},
	X: function(date, token, _localize) {
		const timezoneOffset = date.getTimezoneOffset();
		if (timezoneOffset === 0) return "Z";
		switch (token) {
			case "X": return formatTimezoneWithOptionalMinutes(timezoneOffset);
			case "XXXX":
			case "XX": return formatTimezone(timezoneOffset);
			default: return formatTimezone(timezoneOffset, ":");
		}
	},
	x: function(date, token, _localize) {
		const timezoneOffset = date.getTimezoneOffset();
		switch (token) {
			case "x": return formatTimezoneWithOptionalMinutes(timezoneOffset);
			case "xxxx":
			case "xx": return formatTimezone(timezoneOffset);
			default: return formatTimezone(timezoneOffset, ":");
		}
	},
	O: function(date, token, _localize) {
		const timezoneOffset = date.getTimezoneOffset();
		switch (token) {
			case "O":
			case "OO":
			case "OOO": return "GMT" + formatTimezoneShort(timezoneOffset, ":");
			default: return "GMT" + formatTimezone(timezoneOffset, ":");
		}
	},
	z: function(date, token, _localize) {
		const timezoneOffset = date.getTimezoneOffset();
		switch (token) {
			case "z":
			case "zz":
			case "zzz": return "GMT" + formatTimezoneShort(timezoneOffset, ":");
			default: return "GMT" + formatTimezone(timezoneOffset, ":");
		}
	},
	t: function(date, token, _localize) {
		return addLeadingZeros(Math.trunc(+date / 1e3), token.length);
	},
	T: function(date, token, _localize) {
		return addLeadingZeros(+date, token.length);
	}
};
function formatTimezoneShort(offset, delimiter = "") {
	const sign = offset > 0 ? "-" : "+";
	const absOffset = Math.abs(offset);
	const hours = Math.trunc(absOffset / 60);
	const minutes = absOffset % 60;
	if (minutes === 0) return sign + String(hours);
	return sign + String(hours) + delimiter + addLeadingZeros(minutes, 2);
}
function formatTimezoneWithOptionalMinutes(offset, delimiter) {
	if (offset % 60 === 0) return (offset > 0 ? "-" : "+") + addLeadingZeros(Math.abs(offset) / 60, 2);
	return formatTimezone(offset, delimiter);
}
function formatTimezone(offset, delimiter = "") {
	const sign = offset > 0 ? "-" : "+";
	const absOffset = Math.abs(offset);
	const hours = addLeadingZeros(Math.trunc(absOffset / 60), 2);
	const minutes = addLeadingZeros(absOffset % 60, 2);
	return sign + hours + delimiter + minutes;
}
// ../DnD helper/node_modules/date-fns/_lib/format/longFormatters.js
var dateLongFormatter = (pattern, formatLong) => {
	switch (pattern) {
		case "P": return formatLong.date({ width: "short" });
		case "PP": return formatLong.date({ width: "medium" });
		case "PPP": return formatLong.date({ width: "long" });
		default: return formatLong.date({ width: "full" });
	}
};
var timeLongFormatter = (pattern, formatLong) => {
	switch (pattern) {
		case "p": return formatLong.time({ width: "short" });
		case "pp": return formatLong.time({ width: "medium" });
		case "ppp": return formatLong.time({ width: "long" });
		default: return formatLong.time({ width: "full" });
	}
};
var dateTimeLongFormatter = (pattern, formatLong) => {
	const matchResult = pattern.match(/(P+)(p+)?/) || [];
	const datePattern = matchResult[1];
	const timePattern = matchResult[2];
	if (!timePattern) return dateLongFormatter(pattern, formatLong);
	let dateTimeFormat;
	switch (datePattern) {
		case "P":
			dateTimeFormat = formatLong.dateTime({ width: "short" });
			break;
		case "PP":
			dateTimeFormat = formatLong.dateTime({ width: "medium" });
			break;
		case "PPP":
			dateTimeFormat = formatLong.dateTime({ width: "long" });
			break;
		default: dateTimeFormat = formatLong.dateTime({ width: "full" });
	}
	return dateTimeFormat.replace("{{date}}", dateLongFormatter(datePattern, formatLong)).replace("{{time}}", timeLongFormatter(timePattern, formatLong));
};
var longFormatters = {
	p: timeLongFormatter,
	P: dateTimeLongFormatter
};
// ../DnD helper/node_modules/date-fns/_lib/protectedTokens.js
var dayOfYearTokenRE = /^D+$/;
var weekYearTokenRE = /^Y+$/;
var throwTokens = [
	"D",
	"DD",
	"YY",
	"YYYY"
];
function isProtectedDayOfYearToken(token) {
	return dayOfYearTokenRE.test(token);
}
function isProtectedWeekYearToken(token) {
	return weekYearTokenRE.test(token);
}
function warnOrThrowProtectedError(token, format, input) {
	const _message = message(token, format, input);
	console.warn(_message);
	if (throwTokens.includes(token)) throw new RangeError(_message);
}
function message(token, format, input) {
	const subject = token[0] === "Y" ? "years" : "days of the month";
	return `Use \`${token.toLowerCase()}\` instead of \`${token}\` (in \`${format}\`) for formatting ${subject} to the input \`${input}\`; see: https://github.com/date-fns/date-fns/blob/master/docs/unicodeTokens.md`;
}
// ../DnD helper/node_modules/date-fns/format.js
var formattingTokensRegExp$1 = /[yYQqMLwIdDecihHKkms]o|(\w)\1*|''|'(''|[^'])+('|$)|./g;
var longFormattingTokensRegExp$1 = /P+p+|P+|p+|''|'(''|[^'])+('|$)|./g;
var escapedStringRegExp$1 = /^'([^]*?)'?$/;
var doubleQuoteRegExp$1 = /''/g;
var unescapedLatinCharacterRegExp$1 = /[a-zA-Z]/;
/**
* The {@link format} function options.
*/
/**
* @name format
* @alias formatDate
* @category Common Helpers
* @summary Format the date.
*
* @description
* Return the formatted date string in the given format. The result may vary by locale.
*
* > ⚠️ Please note that the `format` tokens differ from Moment.js and other libraries.
* > See: https://github.com/date-fns/date-fns/blob/master/docs/unicodeTokens.md
*
* The characters wrapped between two single quotes characters (') are escaped.
* Two single quotes in a row, whether inside or outside a quoted sequence, represent a 'real' single quote.
* (see the last example)
*
* Format of the string is based on Unicode Technical Standard #35:
* https://www.unicode.org/reports/tr35/tr35-dates.html#Date_Field_Symbol_Table
* with a few additions (see note 7 below the table).
*
* Accepted patterns:
* | Unit                            | Pattern | Result examples                   | Notes |
* |---------------------------------|---------|-----------------------------------|-------|
* | Era                             | G..GGG  | AD, BC                            |       |
* |                                 | GGGG    | Anno Domini, Before Christ        | 2     |
* |                                 | GGGGG   | A, B                              |       |
* | Calendar year                   | y       | 44, 1, 1900, 2017                 | 5     |
* |                                 | yo      | 44th, 1st, 0th, 17th              | 5,7   |
* |                                 | yy      | 44, 01, 00, 17                    | 5     |
* |                                 | yyy     | 044, 001, 1900, 2017              | 5     |
* |                                 | yyyy    | 0044, 0001, 1900, 2017            | 5     |
* |                                 | yyyyy   | ...                               | 3,5   |
* | Local week-numbering year       | Y       | 44, 1, 1900, 2017                 | 5     |
* |                                 | Yo      | 44th, 1st, 1900th, 2017th         | 5,7   |
* |                                 | YY      | 44, 01, 00, 17                    | 5,8   |
* |                                 | YYY     | 044, 001, 1900, 2017              | 5     |
* |                                 | YYYY    | 0044, 0001, 1900, 2017            | 5,8   |
* |                                 | YYYYY   | ...                               | 3,5   |
* | ISO week-numbering year         | R       | -43, 0, 1, 1900, 2017             | 5,7   |
* |                                 | RR      | -43, 00, 01, 1900, 2017           | 5,7   |
* |                                 | RRR     | -043, 000, 001, 1900, 2017        | 5,7   |
* |                                 | RRRR    | -0043, 0000, 0001, 1900, 2017     | 5,7   |
* |                                 | RRRRR   | ...                               | 3,5,7 |
* | Extended year                   | u       | -43, 0, 1, 1900, 2017             | 5     |
* |                                 | uu      | -43, 01, 1900, 2017               | 5     |
* |                                 | uuu     | -043, 001, 1900, 2017             | 5     |
* |                                 | uuuu    | -0043, 0001, 1900, 2017           | 5     |
* |                                 | uuuuu   | ...                               | 3,5   |
* | Quarter (formatting)            | Q       | 1, 2, 3, 4                        |       |
* |                                 | Qo      | 1st, 2nd, 3rd, 4th                | 7     |
* |                                 | QQ      | 01, 02, 03, 04                    |       |
* |                                 | QQQ     | Q1, Q2, Q3, Q4                    |       |
* |                                 | QQQQ    | 1st quarter, 2nd quarter, ...     | 2     |
* |                                 | QQQQQ   | 1, 2, 3, 4                        | 4     |
* | Quarter (stand-alone)           | q       | 1, 2, 3, 4                        |       |
* |                                 | qo      | 1st, 2nd, 3rd, 4th                | 7     |
* |                                 | qq      | 01, 02, 03, 04                    |       |
* |                                 | qqq     | Q1, Q2, Q3, Q4                    |       |
* |                                 | qqqq    | 1st quarter, 2nd quarter, ...     | 2     |
* |                                 | qqqqq   | 1, 2, 3, 4                        | 4     |
* | Month (formatting)              | M       | 1, 2, ..., 12                     |       |
* |                                 | Mo      | 1st, 2nd, ..., 12th               | 7     |
* |                                 | MM      | 01, 02, ..., 12                   |       |
* |                                 | MMM     | Jan, Feb, ..., Dec                |       |
* |                                 | MMMM    | January, February, ..., December  | 2     |
* |                                 | MMMMM   | J, F, ..., D                      |       |
* | Month (stand-alone)             | L       | 1, 2, ..., 12                     |       |
* |                                 | Lo      | 1st, 2nd, ..., 12th               | 7     |
* |                                 | LL      | 01, 02, ..., 12                   |       |
* |                                 | LLL     | Jan, Feb, ..., Dec                |       |
* |                                 | LLLL    | January, February, ..., December  | 2     |
* |                                 | LLLLL   | J, F, ..., D                      |       |
* | Local week of year              | w       | 1, 2, ..., 53                     |       |
* |                                 | wo      | 1st, 2nd, ..., 53th               | 7     |
* |                                 | ww      | 01, 02, ..., 53                   |       |
* | ISO week of year                | I       | 1, 2, ..., 53                     | 7     |
* |                                 | Io      | 1st, 2nd, ..., 53th               | 7     |
* |                                 | II      | 01, 02, ..., 53                   | 7     |
* | Day of month                    | d       | 1, 2, ..., 31                     |       |
* |                                 | do      | 1st, 2nd, ..., 31st               | 7     |
* |                                 | dd      | 01, 02, ..., 31                   |       |
* | Day of year                     | D       | 1, 2, ..., 365, 366               | 9     |
* |                                 | Do      | 1st, 2nd, ..., 365th, 366th       | 7     |
* |                                 | DD      | 01, 02, ..., 365, 366             | 9     |
* |                                 | DDD     | 001, 002, ..., 365, 366           |       |
* |                                 | DDDD    | ...                               | 3     |
* | Day of week (formatting)        | E..EEE  | Mon, Tue, Wed, ..., Sun           |       |
* |                                 | EEEE    | Monday, Tuesday, ..., Sunday      | 2     |
* |                                 | EEEEE   | M, T, W, T, F, S, S               |       |
* |                                 | EEEEEE  | Mo, Tu, We, Th, Fr, Sa, Su        |       |
* | ISO day of week (formatting)    | i       | 1, 2, 3, ..., 7                   | 7     |
* |                                 | io      | 1st, 2nd, ..., 7th                | 7     |
* |                                 | ii      | 01, 02, ..., 07                   | 7     |
* |                                 | iii     | Mon, Tue, Wed, ..., Sun           | 7     |
* |                                 | iiii    | Monday, Tuesday, ..., Sunday      | 2,7   |
* |                                 | iiiii   | M, T, W, T, F, S, S               | 7     |
* |                                 | iiiiii  | Mo, Tu, We, Th, Fr, Sa, Su        | 7     |
* | Local day of week (formatting)  | e       | 2, 3, 4, ..., 1                   |       |
* |                                 | eo      | 2nd, 3rd, ..., 1st                | 7     |
* |                                 | ee      | 02, 03, ..., 01                   |       |
* |                                 | eee     | Mon, Tue, Wed, ..., Sun           |       |
* |                                 | eeee    | Monday, Tuesday, ..., Sunday      | 2     |
* |                                 | eeeee   | M, T, W, T, F, S, S               |       |
* |                                 | eeeeee  | Mo, Tu, We, Th, Fr, Sa, Su        |       |
* | Local day of week (stand-alone) | c       | 2, 3, 4, ..., 1                   |       |
* |                                 | co      | 2nd, 3rd, ..., 1st                | 7     |
* |                                 | cc      | 02, 03, ..., 01                   |       |
* |                                 | ccc     | Mon, Tue, Wed, ..., Sun           |       |
* |                                 | cccc    | Monday, Tuesday, ..., Sunday      | 2     |
* |                                 | ccccc   | M, T, W, T, F, S, S               |       |
* |                                 | cccccc  | Mo, Tu, We, Th, Fr, Sa, Su        |       |
* | AM, PM                          | a..aa   | AM, PM                            |       |
* |                                 | aaa     | am, pm                            |       |
* |                                 | aaaa    | a.m., p.m.                        | 2     |
* |                                 | aaaaa   | a, p                              |       |
* | AM, PM, noon, midnight          | b..bb   | AM, PM, noon, midnight            |       |
* |                                 | bbb     | am, pm, noon, midnight            |       |
* |                                 | bbbb    | a.m., p.m., noon, midnight        | 2     |
* |                                 | bbbbb   | a, p, n, mi                       |       |
* | Flexible day period             | B..BBB  | at night, in the morning, ...     |       |
* |                                 | BBBB    | at night, in the morning, ...     | 2     |
* |                                 | BBBBB   | at night, in the morning, ...     |       |
* | Hour [1-12]                     | h       | 1, 2, ..., 11, 12                 |       |
* |                                 | ho      | 1st, 2nd, ..., 11th, 12th         | 7     |
* |                                 | hh      | 01, 02, ..., 11, 12               |       |
* | Hour [0-23]                     | H       | 0, 1, 2, ..., 23                  |       |
* |                                 | Ho      | 0th, 1st, 2nd, ..., 23rd          | 7     |
* |                                 | HH      | 00, 01, 02, ..., 23               |       |
* | Hour [0-11]                     | K       | 1, 2, ..., 11, 0                  |       |
* |                                 | Ko      | 1st, 2nd, ..., 11th, 0th          | 7     |
* |                                 | KK      | 01, 02, ..., 11, 00               |       |
* | Hour [1-24]                     | k       | 24, 1, 2, ..., 23                 |       |
* |                                 | ko      | 24th, 1st, 2nd, ..., 23rd         | 7     |
* |                                 | kk      | 24, 01, 02, ..., 23               |       |
* | Minute                          | m       | 0, 1, ..., 59                     |       |
* |                                 | mo      | 0th, 1st, ..., 59th               | 7     |
* |                                 | mm      | 00, 01, ..., 59                   |       |
* | Second                          | s       | 0, 1, ..., 59                     |       |
* |                                 | so      | 0th, 1st, ..., 59th               | 7     |
* |                                 | ss      | 00, 01, ..., 59                   |       |
* | Fraction of second              | S       | 0, 1, ..., 9                      |       |
* |                                 | SS      | 00, 01, ..., 99                   |       |
* |                                 | SSS     | 000, 001, ..., 999                |       |
* |                                 | SSSS    | ...                               | 3     |
* | Timezone (ISO-8601 w/ Z)        | X       | -08, +0530, Z                     |       |
* |                                 | XX      | -0800, +0530, Z                   |       |
* |                                 | XXX     | -08:00, +05:30, Z                 |       |
* |                                 | XXXX    | -0800, +0530, Z, +123456          | 2     |
* |                                 | XXXXX   | -08:00, +05:30, Z, +12:34:56      |       |
* | Timezone (ISO-8601 w/o Z)       | x       | -08, +0530, +00                   |       |
* |                                 | xx      | -0800, +0530, +0000               |       |
* |                                 | xxx     | -08:00, +05:30, +00:00            | 2     |
* |                                 | xxxx    | -0800, +0530, +0000, +123456      |       |
* |                                 | xxxxx   | -08:00, +05:30, +00:00, +12:34:56 |       |
* | Timezone (GMT)                  | O...OOO | GMT-8, GMT+5:30, GMT+0            |       |
* |                                 | OOOO    | GMT-08:00, GMT+05:30, GMT+00:00   | 2     |
* | Timezone (specific non-locat.)  | z...zzz | GMT-8, GMT+5:30, GMT+0            | 6     |
* |                                 | zzzz    | GMT-08:00, GMT+05:30, GMT+00:00   | 2,6   |
* | Seconds timestamp               | t       | 512969520                         | 7     |
* |                                 | tt      | ...                               | 3,7   |
* | Milliseconds timestamp          | T       | 512969520900                      | 7     |
* |                                 | TT      | ...                               | 3,7   |
* | Long localized date             | P       | 04/29/1453                        | 7     |
* |                                 | PP      | Apr 29, 1453                      | 7     |
* |                                 | PPP     | April 29th, 1453                  | 7     |
* |                                 | PPPP    | Friday, April 29th, 1453          | 2,7   |
* | Long localized time             | p       | 12:00 AM                          | 7     |
* |                                 | pp      | 12:00:00 AM                       | 7     |
* |                                 | ppp     | 12:00:00 AM GMT+2                 | 7     |
* |                                 | pppp    | 12:00:00 AM GMT+02:00             | 2,7   |
* | Combination of date and time    | Pp      | 04/29/1453, 12:00 AM              | 7     |
* |                                 | PPpp    | Apr 29, 1453, 12:00:00 AM         | 7     |
* |                                 | PPPppp  | April 29th, 1453 at ...           | 7     |
* |                                 | PPPPpppp| Friday, April 29th, 1453 at ...   | 2,7   |
* Notes:
* 1. "Formatting" units (e.g. formatting quarter) in the default en-US locale
*    are the same as "stand-alone" units, but are different in some languages.
*    "Formatting" units are declined according to the rules of the language
*    in the context of a date. "Stand-alone" units are always nominative singular:
*
*    `format(new Date(2017, 10, 6), 'do LLLL', {locale: cs}) //=> '6. listopad'`
*
*    `format(new Date(2017, 10, 6), 'do MMMM', {locale: cs}) //=> '6. listopadu'`
*
* 2. Any sequence of the identical letters is a pattern, unless it is escaped by
*    the single quote characters (see below).
*    If the sequence is longer than listed in table (e.g. `EEEEEEEEEEE`)
*    the output will be the same as default pattern for this unit, usually
*    the longest one (in case of ISO weekdays, `EEEE`). Default patterns for units
*    are marked with "2" in the last column of the table.
*
*    `format(new Date(2017, 10, 6), 'MMM') //=> 'Nov'`
*
*    `format(new Date(2017, 10, 6), 'MMMM') //=> 'November'`
*
*    `format(new Date(2017, 10, 6), 'MMMMM') //=> 'N'`
*
*    `format(new Date(2017, 10, 6), 'MMMMMM') //=> 'November'`
*
*    `format(new Date(2017, 10, 6), 'MMMMMMM') //=> 'November'`
*
* 3. Some patterns could be unlimited length (such as `yyyyyyyy`).
*    The output will be padded with zeros to match the length of the pattern.
*
*    `format(new Date(2017, 10, 6), 'yyyyyyyy') //=> '00002017'`
*
* 4. `QQQQQ` and `qqqqq` could be not strictly numerical in some locales.
*    These tokens represent the shortest form of the quarter.
*
* 5. The main difference between `y` and `u` patterns are B.C. years:
*
*    | Year | `y` | `u` |
*    |------|-----|-----|
*    | AC 1 |   1 |   1 |
*    | BC 1 |   1 |   0 |
*    | BC 2 |   2 |  -1 |
*
*    Also `yy` always returns the last two digits of a year,
*    while `uu` pads single digit years to 2 characters and returns other years unchanged:
*
*    | Year | `yy` | `uu` |
*    |------|------|------|
*    | 1    |   01 |   01 |
*    | 14   |   14 |   14 |
*    | 376  |   76 |  376 |
*    | 1453 |   53 | 1453 |
*
*    The same difference is true for local and ISO week-numbering years (`Y` and `R`),
*    except local week-numbering years are dependent on `options.weekStartsOn`
*    and `options.firstWeekContainsDate` (compare [getISOWeekYear](https://date-fns.org/docs/getISOWeekYear)
*    and [getWeekYear](https://date-fns.org/docs/getWeekYear)).
*
* 6. Specific non-location timezones are currently unavailable in `date-fns`,
*    so right now these tokens fall back to GMT timezones.
*
* 7. These patterns are not in the Unicode Technical Standard #35:
*    - `i`: ISO day of week
*    - `I`: ISO week of year
*    - `R`: ISO week-numbering year
*    - `t`: seconds timestamp
*    - `T`: milliseconds timestamp
*    - `o`: ordinal number modifier
*    - `P`: long localized date
*    - `p`: long localized time
*
* 8. `YY` and `YYYY` tokens represent week-numbering years but they are often confused with years.
*    You should enable `options.useAdditionalWeekYearTokens` to use them. See: https://github.com/date-fns/date-fns/blob/master/docs/unicodeTokens.md
*
* 9. `D` and `DD` tokens represent days of the year but they are often confused with days of the month.
*    You should enable `options.useAdditionalDayOfYearTokens` to use them. See: https://github.com/date-fns/date-fns/blob/master/docs/unicodeTokens.md
*
* @param date - The original date
* @param format - The string of tokens
* @param options - An object with options
*
* @returns The formatted date string
*
* @throws `date` must not be Invalid Date
* @throws `options.locale` must contain `localize` property
* @throws `options.locale` must contain `formatLong` property
* @throws use `yyyy` instead of `YYYY` for formatting years using [format provided] to the input [input provided]; see: https://github.com/date-fns/date-fns/blob/master/docs/unicodeTokens.md
* @throws use `yy` instead of `YY` for formatting years using [format provided] to the input [input provided]; see: https://github.com/date-fns/date-fns/blob/master/docs/unicodeTokens.md
* @throws use `d` instead of `D` for formatting days of the month using [format provided] to the input [input provided]; see: https://github.com/date-fns/date-fns/blob/master/docs/unicodeTokens.md
* @throws use `dd` instead of `DD` for formatting days of the month using [format provided] to the input [input provided]; see: https://github.com/date-fns/date-fns/blob/master/docs/unicodeTokens.md
* @throws format string contains an unescaped latin alphabet character
*
* @example
* // Represent 11 February 2014 in middle-endian format:
* const result = format(new Date(2014, 1, 11), 'MM/dd/yyyy')
* //=> '02/11/2014'
*
* @example
* // Represent 2 July 2014 in Esperanto:
* import { eoLocale } from 'date-fns/locale/eo'
* const result = format(new Date(2014, 6, 2), "do 'de' MMMM yyyy", {
*   locale: eoLocale
* })
* //=> '2-a de julio 2014'
*
* @example
* // Escape string by single quote characters:
* const result = format(new Date(2014, 6, 2, 15), "h 'o''clock'")
* //=> "3 o'clock"
*/
function format(date, formatStr, options) {
	const defaultOptions = getDefaultOptions$1();
	const locale = options?.locale ?? defaultOptions.locale ?? enUS;
	const firstWeekContainsDate = options?.firstWeekContainsDate ?? options?.locale?.options?.firstWeekContainsDate ?? defaultOptions.firstWeekContainsDate ?? defaultOptions.locale?.options?.firstWeekContainsDate ?? 1;
	const weekStartsOn = options?.weekStartsOn ?? options?.locale?.options?.weekStartsOn ?? defaultOptions.weekStartsOn ?? defaultOptions.locale?.options?.weekStartsOn ?? 0;
	const originalDate = toDate(date, options?.in);
	if (!isValid(originalDate)) throw new RangeError("Invalid time value");
	let parts = formatStr.match(longFormattingTokensRegExp$1).map((substring) => {
		const firstCharacter = substring[0];
		if (firstCharacter === "p" || firstCharacter === "P") {
			const longFormatter = longFormatters[firstCharacter];
			return longFormatter(substring, locale.formatLong);
		}
		return substring;
	}).join("").match(formattingTokensRegExp$1).map((substring) => {
		if (substring === "''") return {
			isToken: false,
			value: "'"
		};
		const firstCharacter = substring[0];
		if (firstCharacter === "'") return {
			isToken: false,
			value: cleanEscapedString$1(substring)
		};
		if (formatters[firstCharacter]) return {
			isToken: true,
			value: substring
		};
		if (firstCharacter.match(unescapedLatinCharacterRegExp$1)) throw new RangeError("Format string contains an unescaped latin alphabet character `" + firstCharacter + "`");
		return {
			isToken: false,
			value: substring
		};
	});
	if (locale.localize.preprocessor) parts = locale.localize.preprocessor(originalDate, parts);
	const formatterOptions = {
		firstWeekContainsDate,
		weekStartsOn,
		locale
	};
	return parts.map((part) => {
		if (!part.isToken) return part.value;
		const token = part.value;
		if (!options?.useAdditionalWeekYearTokens && isProtectedWeekYearToken(token) || !options?.useAdditionalDayOfYearTokens && isProtectedDayOfYearToken(token)) warnOrThrowProtectedError(token, formatStr, String(date));
		const formatter = formatters[token[0]];
		return formatter(originalDate, token, locale.localize, formatterOptions);
	}).join("");
}
function cleanEscapedString$1(input) {
	const matched = input.match(escapedStringRegExp$1);
	if (!matched) return input;
	return matched[1].replace(doubleQuoteRegExp$1, "'");
}
// ../DnD helper/node_modules/date-fns/getDay.js
/**
* The {@link getDay} function options.
*/
/**
* @name getDay
* @category Weekday Helpers
* @summary Get the day of the week of the given date.
*
* @description
* Get the day of the week of the given date.
*
* @param date - The given date
* @param options - The options
*
* @returns The day of week, 0 represents Sunday
*
* @example
* // Which day of the week is 29 February 2012?
* const result = getDay(new Date(2012, 1, 29))
* //=> 3
*/
function getDay(date, options) {
	return toDate(date, options?.in).getDay();
}
// ../DnD helper/node_modules/date-fns/getDaysInMonth.js
/**
* The {@link getDaysInMonth} function options.
*/
/**
* @name getDaysInMonth
* @category Month Helpers
* @summary Get the number of days in a month of the given date.
*
* @description
* Get the number of days in a month of the given date, considering the context if provided.
*
* @param date - The given date
* @param options - An object with options
*
* @returns The number of days in a month
*
* @example
* // How many days are in February 2000?
* const result = getDaysInMonth(new Date(2000, 1))
* //=> 29
*/
function getDaysInMonth(date, options) {
	const _date = toDate(date, options?.in);
	const year = _date.getFullYear();
	const monthIndex = _date.getMonth();
	const lastDayOfMonth = constructFrom(_date, 0);
	lastDayOfMonth.setFullYear(year, monthIndex + 1, 0);
	lastDayOfMonth.setHours(0, 0, 0, 0);
	return lastDayOfMonth.getDate();
}
// ../DnD helper/node_modules/date-fns/getDefaultOptions.js
/**
* @name getDefaultOptions
* @category Common Helpers
* @summary Get default options.
* @pure false
*
* @description
* Returns an object that contains defaults for
* `options.locale`, `options.weekStartsOn` and `options.firstWeekContainsDate`
* arguments for all functions.
*
* You can change these with [setDefaultOptions](https://date-fns.org/docs/setDefaultOptions).
*
* @returns The default options
*
* @example
* const result = getDefaultOptions()
* //=> {}
*
* @example
* setDefaultOptions({ weekStarsOn: 1, firstWeekContainsDate: 4 })
* const result = getDefaultOptions()
* //=> { weekStarsOn: 1, firstWeekContainsDate: 4 }
*/
function getDefaultOptions() {
	return Object.assign({}, getDefaultOptions$1());
}
// ../DnD helper/node_modules/date-fns/getHours.js
/**
* The {@link getHours} function options.
*/
/**
* @name getHours
* @category Hour Helpers
* @summary Get the hours of the given date.
*
* @description
* Get the hours of the given date.
*
* @param date - The given date
* @param options - An object with options
*
* @returns The hours
*
* @example
* // Get the hours of 29 February 2012 11:45:00:
* const result = getHours(new Date(2012, 1, 29, 11, 45))
* //=> 11
*/
function getHours(date, options) {
	return toDate(date, options?.in).getHours();
}
// ../DnD helper/node_modules/date-fns/getISODay.js
/**
* The {@link getISODay} function options.
*/
/**
* @name getISODay
* @category Weekday Helpers
* @summary Get the day of the ISO week of the given date.
*
* @description
* Get the day of the ISO week of the given date,
* which is 7 for Sunday, 1 for Monday etc.
*
* ISO week-numbering year: http://en.wikipedia.org/wiki/ISO_week_date
*
* @param date - The given date
* @param options - An object with options
*
* @returns The day of ISO week
*
* @example
* // Which day of the ISO week is 26 February 2012?
* const result = getISODay(new Date(2012, 1, 26))
* //=> 7
*/
function getISODay(date, options) {
	const day = toDate(date, options?.in).getDay();
	return day === 0 ? 7 : day;
}
// ../DnD helper/node_modules/date-fns/getMinutes.js
/**
* The {@link getMinutes} function options.
*/
/**
* @name getMinutes
* @category Minute Helpers
* @summary Get the minutes of the given date.
*
* @description
* Get the minutes of the given date.
*
* @param date - The given date
* @param options - The options
*
* @returns The minutes
*
* @example
* // Get the minutes of 29 February 2012 11:45:05:
* const result = getMinutes(new Date(2012, 1, 29, 11, 45, 5))
* //=> 45
*/
function getMinutes(date, options) {
	return toDate(date, options?.in).getMinutes();
}
// ../DnD helper/node_modules/date-fns/getMonth.js
/**
* The {@link getMonth} function options.
*/
/**
* @name getMonth
* @category Month Helpers
* @summary Get the month of the given date.
*
* @description
* Get the month of the given date.
*
* @param date - The given date
* @param options - An object with options
*
* @returns The month index (0-11)
*
* @example
* // Which month is 29 February 2012?
* const result = getMonth(new Date(2012, 1, 29))
* //=> 1
*/
function getMonth(date, options) {
	return toDate(date, options?.in).getMonth();
}
// ../DnD helper/node_modules/date-fns/getSeconds.js
/**
* @name getSeconds
* @category Second Helpers
* @summary Get the seconds of the given date.
*
* @description
* Get the seconds of the given date.
*
* @param date - The given date
*
* @returns The seconds
*
* @example
* // Get the seconds of 29 February 2012 11:45:05.123:
* const result = getSeconds(new Date(2012, 1, 29, 11, 45, 5, 123))
* //=> 5
*/
function getSeconds(date) {
	return toDate(date).getSeconds();
}
// ../DnD helper/node_modules/date-fns/getYear.js
/**
* The {@link getYear} function options.
*/
/**
* @name getYear
* @category Year Helpers
* @summary Get the year of the given date.
*
* @description
* Get the year of the given date.
*
* @param date - The given date
* @param options - An object with options
*
* @returns The year
*
* @example
* // Which year is 2 July 2014?
* const result = getYear(new Date(2014, 6, 2))
* //=> 2014
*/
function getYear(date, options) {
	return toDate(date, options?.in).getFullYear();
}
// ../DnD helper/node_modules/date-fns/isAfter.js
/**
* @name isAfter
* @category Common Helpers
* @summary Is the first date after the second one?
*
* @description
* Is the first date after the second one?
*
* @param date - The date that should be after the other one to return true
* @param dateToCompare - The date to compare with
*
* @returns The first date is after the second date
*
* @example
* // Is 10 July 1989 after 11 February 1987?
* const result = isAfter(new Date(1989, 6, 10), new Date(1987, 1, 11))
* //=> true
*/
function isAfter(date, dateToCompare) {
	return +toDate(date) > +toDate(dateToCompare);
}
// ../DnD helper/node_modules/date-fns/isBefore.js
/**
* @name isBefore
* @category Common Helpers
* @summary Is the first date before the second one?
*
* @description
* Is the first date before the second one?
*
* @param date - The date that should be before the other one to return true
* @param dateToCompare - The date to compare with
*
* @returns The first date is before the second date
*
* @example
* // Is 10 July 1989 before 11 February 1987?
* const result = isBefore(new Date(1989, 6, 10), new Date(1987, 1, 11))
* //=> false
*/
function isBefore(date, dateToCompare) {
	return +toDate(date) < +toDate(dateToCompare);
}
// ../DnD helper/node_modules/date-fns/isEqual.js
/**
* @name isEqual
* @category Common Helpers
* @summary Are the given dates equal?
*
* @description
* Are the given dates equal?
*
* @param dateLeft - The first date to compare
* @param dateRight - The second date to compare
*
* @returns The dates are equal
*
* @example
* // Are 2 July 2014 06:30:45.000 and 2 July 2014 06:30:45.500 equal?
* const result = isEqual(
*   new Date(2014, 6, 2, 6, 30, 45, 0),
*   new Date(2014, 6, 2, 6, 30, 45, 500)
* )
* //=> false
*/
function isEqual(leftDate, rightDate) {
	return +toDate(leftDate) === +toDate(rightDate);
}
// ../DnD helper/node_modules/date-fns/transpose.js
/**
* @name transpose
* @category Generic Helpers
* @summary Transpose the date to the given constructor.
*
* @description
* The function transposes the date to the given constructor. It helps you
* to transpose the date in the system time zone to say `UTCDate` or any other
* date extension.
*
* @typeParam InputDate - The input `Date` type derived from the passed argument.
* @typeParam ResultDate - The result `Date` type derived from the passed constructor.
*
* @param date - The date to use values from
* @param constructor - The date constructor to use
*
* @returns Date transposed to the given constructor
*
* @example
* // Create July 10, 2022 00:00 in locale time zone
* const date = new Date(2022, 6, 10)
* //=> 'Sun Jul 10 2022 00:00:00 GMT+0800 (Singapore Standard Time)'
*
* @example
* // Transpose the date to July 10, 2022 00:00 in UTC
* transpose(date, UTCDate)
* //=> 'Sun Jul 10 2022 00:00:00 GMT+0000 (Coordinated Universal Time)'
*/
function transpose(date, constructor) {
	const date_ = isConstructor(constructor) ? new constructor(0) : constructFrom(constructor, 0);
	date_.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
	date_.setHours(date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
	return date_;
}
function isConstructor(constructor) {
	return typeof constructor === "function" && constructor.prototype?.constructor === constructor;
}
// ../DnD helper/node_modules/date-fns/parse/_lib/Setter.js
var TIMEZONE_UNIT_PRIORITY = 10;
var Setter = class {
	subPriority = 0;
	validate(_utcDate, _options) {
		return true;
	}
};
var ValueSetter = class extends Setter {
	constructor(value, validateValue, setValue, priority, subPriority) {
		super();
		this.value = value;
		this.validateValue = validateValue;
		this.setValue = setValue;
		this.priority = priority;
		if (subPriority) this.subPriority = subPriority;
	}
	validate(date, options) {
		return this.validateValue(date, this.value, options);
	}
	set(date, flags, options) {
		return this.setValue(date, flags, this.value, options);
	}
};
var DateTimezoneSetter = class extends Setter {
	priority = TIMEZONE_UNIT_PRIORITY;
	subPriority = -1;
	constructor(context, reference) {
		super();
		this.context = context || ((date) => constructFrom(reference, date));
	}
	set(date, flags) {
		if (flags.timestampIsSet) return date;
		return constructFrom(date, transpose(date, this.context));
	}
};
// ../DnD helper/node_modules/date-fns/parse/_lib/Parser.js
var Parser = class {
	run(dateString, token, match, options) {
		const result = this.parse(dateString, token, match, options);
		if (!result) return null;
		return {
			setter: new ValueSetter(result.value, this.validate, this.set, this.priority, this.subPriority),
			rest: result.rest
		};
	}
	validate(_utcDate, _value, _options) {
		return true;
	}
};
// ../DnD helper/node_modules/date-fns/parse/_lib/parsers/EraParser.js
var EraParser = class extends Parser {
	priority = 140;
	parse(dateString, token, match) {
		switch (token) {
			case "G":
			case "GG":
			case "GGG": return match.era(dateString, { width: "abbreviated" }) || match.era(dateString, { width: "narrow" });
			case "GGGGG": return match.era(dateString, { width: "narrow" });
			default: return match.era(dateString, { width: "wide" }) || match.era(dateString, { width: "abbreviated" }) || match.era(dateString, { width: "narrow" });
		}
	}
	set(date, flags, value) {
		flags.era = value;
		date.setFullYear(value, 0, 1);
		date.setHours(0, 0, 0, 0);
		return date;
	}
	incompatibleTokens = [
		"R",
		"u",
		"t",
		"T"
	];
};
// ../DnD helper/node_modules/date-fns/parse/_lib/constants.js
var numericPatterns = {
	month: /^(1[0-2]|0?\d)/,
	date: /^(3[0-1]|[0-2]?\d)/,
	dayOfYear: /^(36[0-6]|3[0-5]\d|[0-2]?\d?\d)/,
	week: /^(5[0-3]|[0-4]?\d)/,
	hour23h: /^(2[0-3]|[0-1]?\d)/,
	hour24h: /^(2[0-4]|[0-1]?\d)/,
	hour11h: /^(1[0-1]|0?\d)/,
	hour12h: /^(1[0-2]|0?\d)/,
	minute: /^[0-5]?\d/,
	second: /^[0-5]?\d/,
	singleDigit: /^\d/,
	twoDigits: /^\d{1,2}/,
	threeDigits: /^\d{1,3}/,
	fourDigits: /^\d{1,4}/,
	anyDigitsSigned: /^-?\d+/,
	singleDigitSigned: /^-?\d/,
	twoDigitsSigned: /^-?\d{1,2}/,
	threeDigitsSigned: /^-?\d{1,3}/,
	fourDigitsSigned: /^-?\d{1,4}/
};
var timezonePatterns = {
	basicOptionalMinutes: /^([+-])(\d{2})(\d{2})?|Z/,
	basic: /^([+-])(\d{2})(\d{2})|Z/,
	basicOptionalSeconds: /^([+-])(\d{2})(\d{2})((\d{2}))?|Z/,
	extended: /^([+-])(\d{2}):(\d{2})|Z/,
	extendedOptionalSeconds: /^([+-])(\d{2}):(\d{2})(:(\d{2}))?|Z/
};
// ../DnD helper/node_modules/date-fns/parse/_lib/utils.js
function mapValue(parseFnResult, mapFn) {
	if (!parseFnResult) return parseFnResult;
	return {
		value: mapFn(parseFnResult.value),
		rest: parseFnResult.rest
	};
}
function parseNumericPattern(pattern, dateString) {
	const matchResult = dateString.match(pattern);
	if (!matchResult) return null;
	return {
		value: parseInt(matchResult[0], 10),
		rest: dateString.slice(matchResult[0].length)
	};
}
function parseTimezonePattern(pattern, dateString) {
	const matchResult = dateString.match(pattern);
	if (!matchResult) return null;
	if (matchResult[0] === "Z") return {
		value: 0,
		rest: dateString.slice(1)
	};
	const sign = matchResult[1] === "+" ? 1 : -1;
	const hours = matchResult[2] ? parseInt(matchResult[2], 10) : 0;
	const minutes = matchResult[3] ? parseInt(matchResult[3], 10) : 0;
	const seconds = matchResult[5] ? parseInt(matchResult[5], 10) : 0;
	return {
		value: sign * (hours * millisecondsInHour + minutes * millisecondsInMinute + seconds * millisecondsInSecond),
		rest: dateString.slice(matchResult[0].length)
	};
}
function parseAnyDigitsSigned(dateString) {
	return parseNumericPattern(numericPatterns.anyDigitsSigned, dateString);
}
function parseNDigits(n, dateString) {
	switch (n) {
		case 1: return parseNumericPattern(numericPatterns.singleDigit, dateString);
		case 2: return parseNumericPattern(numericPatterns.twoDigits, dateString);
		case 3: return parseNumericPattern(numericPatterns.threeDigits, dateString);
		case 4: return parseNumericPattern(numericPatterns.fourDigits, dateString);
		default: return parseNumericPattern(new RegExp("^\\d{1," + n + "}"), dateString);
	}
}
function parseNDigitsSigned(n, dateString) {
	switch (n) {
		case 1: return parseNumericPattern(numericPatterns.singleDigitSigned, dateString);
		case 2: return parseNumericPattern(numericPatterns.twoDigitsSigned, dateString);
		case 3: return parseNumericPattern(numericPatterns.threeDigitsSigned, dateString);
		case 4: return parseNumericPattern(numericPatterns.fourDigitsSigned, dateString);
		default: return parseNumericPattern(new RegExp("^-?\\d{1," + n + "}"), dateString);
	}
}
function dayPeriodEnumToHours(dayPeriod) {
	switch (dayPeriod) {
		case "morning": return 4;
		case "evening": return 17;
		case "pm":
		case "noon":
		case "afternoon": return 12;
		default: return 0;
	}
}
function normalizeTwoDigitYear(twoDigitYear, currentYear) {
	const isCommonEra = currentYear > 0;
	const absCurrentYear = isCommonEra ? currentYear : 1 - currentYear;
	let result;
	if (absCurrentYear <= 50) result = twoDigitYear || 100;
	else {
		const rangeEnd = absCurrentYear + 50;
		const rangeEndCentury = Math.trunc(rangeEnd / 100) * 100;
		const isPreviousCentury = twoDigitYear >= rangeEnd % 100;
		result = twoDigitYear + rangeEndCentury - (isPreviousCentury ? 100 : 0);
	}
	return isCommonEra ? result : 1 - result;
}
function isLeapYearIndex(year) {
	return year % 400 === 0 || year % 4 === 0 && year % 100 !== 0;
}
// ../DnD helper/node_modules/date-fns/parse/_lib/parsers/YearParser.js
var YearParser = class extends Parser {
	priority = 130;
	incompatibleTokens = [
		"Y",
		"R",
		"u",
		"w",
		"I",
		"i",
		"e",
		"c",
		"t",
		"T"
	];
	parse(dateString, token, match) {
		const valueCallback = (year) => ({
			year,
			isTwoDigitYear: token === "yy"
		});
		switch (token) {
			case "y": return mapValue(parseNDigits(4, dateString), valueCallback);
			case "yo": return mapValue(match.ordinalNumber(dateString, { unit: "year" }), valueCallback);
			default: return mapValue(parseNDigits(token.length, dateString), valueCallback);
		}
	}
	validate(_date, value) {
		return value.isTwoDigitYear || value.year > 0;
	}
	set(date, flags, value) {
		const currentYear = date.getFullYear();
		if (value.isTwoDigitYear) {
			const normalizedTwoDigitYear = normalizeTwoDigitYear(value.year, currentYear);
			date.setFullYear(normalizedTwoDigitYear, 0, 1);
			date.setHours(0, 0, 0, 0);
			return date;
		}
		const year = !("era" in flags) || flags.era === 1 ? value.year : 1 - value.year;
		date.setFullYear(year, 0, 1);
		date.setHours(0, 0, 0, 0);
		return date;
	}
};
// ../DnD helper/node_modules/date-fns/parse/_lib/parsers/LocalWeekYearParser.js
var LocalWeekYearParser = class extends Parser {
	priority = 130;
	parse(dateString, token, match) {
		const valueCallback = (year) => ({
			year,
			isTwoDigitYear: token === "YY"
		});
		switch (token) {
			case "Y": return mapValue(parseNDigits(4, dateString), valueCallback);
			case "Yo": return mapValue(match.ordinalNumber(dateString, { unit: "year" }), valueCallback);
			default: return mapValue(parseNDigits(token.length, dateString), valueCallback);
		}
	}
	validate(_date, value) {
		return value.isTwoDigitYear || value.year > 0;
	}
	set(date, flags, value, options) {
		const currentYear = getWeekYear(date, options);
		if (value.isTwoDigitYear) {
			const normalizedTwoDigitYear = normalizeTwoDigitYear(value.year, currentYear);
			date.setFullYear(normalizedTwoDigitYear, 0, options.firstWeekContainsDate);
			date.setHours(0, 0, 0, 0);
			return startOfWeek(date, options);
		}
		const year = !("era" in flags) || flags.era === 1 ? value.year : 1 - value.year;
		date.setFullYear(year, 0, options.firstWeekContainsDate);
		date.setHours(0, 0, 0, 0);
		return startOfWeek(date, options);
	}
	incompatibleTokens = [
		"y",
		"R",
		"u",
		"Q",
		"q",
		"M",
		"L",
		"I",
		"d",
		"D",
		"i",
		"t",
		"T"
	];
};
// ../DnD helper/node_modules/date-fns/parse/_lib/parsers/ISOWeekYearParser.js
var ISOWeekYearParser = class extends Parser {
	priority = 130;
	parse(dateString, token) {
		if (token === "R") return parseNDigitsSigned(4, dateString);
		return parseNDigitsSigned(token.length, dateString);
	}
	set(date, _flags, value) {
		const firstWeekOfYear = constructFrom(date, 0);
		firstWeekOfYear.setFullYear(value, 0, 4);
		firstWeekOfYear.setHours(0, 0, 0, 0);
		return startOfISOWeek(firstWeekOfYear);
	}
	incompatibleTokens = [
		"G",
		"y",
		"Y",
		"u",
		"Q",
		"q",
		"M",
		"L",
		"w",
		"d",
		"D",
		"e",
		"c",
		"t",
		"T"
	];
};
// ../DnD helper/node_modules/date-fns/parse/_lib/parsers/ExtendedYearParser.js
var ExtendedYearParser = class extends Parser {
	priority = 130;
	parse(dateString, token) {
		if (token === "u") return parseNDigitsSigned(4, dateString);
		return parseNDigitsSigned(token.length, dateString);
	}
	set(date, _flags, value) {
		date.setFullYear(value, 0, 1);
		date.setHours(0, 0, 0, 0);
		return date;
	}
	incompatibleTokens = [
		"G",
		"y",
		"Y",
		"R",
		"w",
		"I",
		"i",
		"e",
		"c",
		"t",
		"T"
	];
};
// ../DnD helper/node_modules/date-fns/parse/_lib/parsers/QuarterParser.js
var QuarterParser = class extends Parser {
	priority = 120;
	parse(dateString, token, match) {
		switch (token) {
			case "Q":
			case "QQ": return parseNDigits(token.length, dateString);
			case "Qo": return match.ordinalNumber(dateString, { unit: "quarter" });
			case "QQQ": return match.quarter(dateString, {
				width: "abbreviated",
				context: "formatting"
			}) || match.quarter(dateString, {
				width: "narrow",
				context: "formatting"
			});
			case "QQQQQ": return match.quarter(dateString, {
				width: "narrow",
				context: "formatting"
			});
			default: return match.quarter(dateString, {
				width: "wide",
				context: "formatting"
			}) || match.quarter(dateString, {
				width: "abbreviated",
				context: "formatting"
			}) || match.quarter(dateString, {
				width: "narrow",
				context: "formatting"
			});
		}
	}
	validate(_date, value) {
		return value >= 1 && value <= 4;
	}
	set(date, _flags, value) {
		date.setMonth((value - 1) * 3, 1);
		date.setHours(0, 0, 0, 0);
		return date;
	}
	incompatibleTokens = [
		"Y",
		"R",
		"q",
		"M",
		"L",
		"w",
		"I",
		"d",
		"D",
		"i",
		"e",
		"c",
		"t",
		"T"
	];
};
// ../DnD helper/node_modules/date-fns/parse/_lib/parsers/StandAloneQuarterParser.js
var StandAloneQuarterParser = class extends Parser {
	priority = 120;
	parse(dateString, token, match) {
		switch (token) {
			case "q":
			case "qq": return parseNDigits(token.length, dateString);
			case "qo": return match.ordinalNumber(dateString, { unit: "quarter" });
			case "qqq": return match.quarter(dateString, {
				width: "abbreviated",
				context: "standalone"
			}) || match.quarter(dateString, {
				width: "narrow",
				context: "standalone"
			});
			case "qqqqq": return match.quarter(dateString, {
				width: "narrow",
				context: "standalone"
			});
			default: return match.quarter(dateString, {
				width: "wide",
				context: "standalone"
			}) || match.quarter(dateString, {
				width: "abbreviated",
				context: "standalone"
			}) || match.quarter(dateString, {
				width: "narrow",
				context: "standalone"
			});
		}
	}
	validate(_date, value) {
		return value >= 1 && value <= 4;
	}
	set(date, _flags, value) {
		date.setMonth((value - 1) * 3, 1);
		date.setHours(0, 0, 0, 0);
		return date;
	}
	incompatibleTokens = [
		"Y",
		"R",
		"Q",
		"M",
		"L",
		"w",
		"I",
		"d",
		"D",
		"i",
		"e",
		"c",
		"t",
		"T"
	];
};
// ../DnD helper/node_modules/date-fns/parse/_lib/parsers/MonthParser.js
var MonthParser = class extends Parser {
	incompatibleTokens = [
		"Y",
		"R",
		"q",
		"Q",
		"L",
		"w",
		"I",
		"D",
		"i",
		"e",
		"c",
		"t",
		"T"
	];
	priority = 110;
	parse(dateString, token, match) {
		const valueCallback = (value) => value - 1;
		switch (token) {
			case "M": return mapValue(parseNumericPattern(numericPatterns.month, dateString), valueCallback);
			case "MM": return mapValue(parseNDigits(2, dateString), valueCallback);
			case "Mo": return mapValue(match.ordinalNumber(dateString, { unit: "month" }), valueCallback);
			case "MMM": return match.month(dateString, {
				width: "abbreviated",
				context: "formatting"
			}) || match.month(dateString, {
				width: "narrow",
				context: "formatting"
			});
			case "MMMMM": return match.month(dateString, {
				width: "narrow",
				context: "formatting"
			});
			default: return match.month(dateString, {
				width: "wide",
				context: "formatting"
			}) || match.month(dateString, {
				width: "abbreviated",
				context: "formatting"
			}) || match.month(dateString, {
				width: "narrow",
				context: "formatting"
			});
		}
	}
	validate(_date, value) {
		return value >= 0 && value <= 11;
	}
	set(date, _flags, value) {
		date.setMonth(value, 1);
		date.setHours(0, 0, 0, 0);
		return date;
	}
};
// ../DnD helper/node_modules/date-fns/parse/_lib/parsers/StandAloneMonthParser.js
var StandAloneMonthParser = class extends Parser {
	priority = 110;
	parse(dateString, token, match) {
		const valueCallback = (value) => value - 1;
		switch (token) {
			case "L": return mapValue(parseNumericPattern(numericPatterns.month, dateString), valueCallback);
			case "LL": return mapValue(parseNDigits(2, dateString), valueCallback);
			case "Lo": return mapValue(match.ordinalNumber(dateString, { unit: "month" }), valueCallback);
			case "LLL": return match.month(dateString, {
				width: "abbreviated",
				context: "standalone"
			}) || match.month(dateString, {
				width: "narrow",
				context: "standalone"
			});
			case "LLLLL": return match.month(dateString, {
				width: "narrow",
				context: "standalone"
			});
			default: return match.month(dateString, {
				width: "wide",
				context: "standalone"
			}) || match.month(dateString, {
				width: "abbreviated",
				context: "standalone"
			}) || match.month(dateString, {
				width: "narrow",
				context: "standalone"
			});
		}
	}
	validate(_date, value) {
		return value >= 0 && value <= 11;
	}
	set(date, _flags, value) {
		date.setMonth(value, 1);
		date.setHours(0, 0, 0, 0);
		return date;
	}
	incompatibleTokens = [
		"Y",
		"R",
		"q",
		"Q",
		"M",
		"w",
		"I",
		"D",
		"i",
		"e",
		"c",
		"t",
		"T"
	];
};
// ../DnD helper/node_modules/date-fns/setWeek.js
/**
* The {@link setWeek} function options.
*/
/**
* @name setWeek
* @category Week Helpers
* @summary Set the local week to the given date.
*
* @description
* Set the local week to the given date, saving the weekday number.
* The exact calculation depends on the values of
* `options.weekStartsOn` (which is the index of the first day of the week)
* and `options.firstWeekContainsDate` (which is the day of January, which is always in
* the first week of the week-numbering year)
*
* Week numbering: https://en.wikipedia.org/wiki/Week#The_ISO_week_date_system
*
* @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
* @typeParam ResultDate - The result `Date` type, it is the type returned from the context function if it is passed, or inferred from the arguments.
*
* @param date - The date to be changed
* @param week - The week of the new date
* @param options - An object with options
*
* @returns The new date with the local week set
*
* @example
* // Set the 1st week to 2 January 2005 with default options:
* const result = setWeek(new Date(2005, 0, 2), 1)
* //=> Sun Dec 26 2004 00:00:00
*
* @example
* // Set the 1st week to 2 January 2005,
* // if Monday is the first day of the week,
* // and the first week of the year always contains 4 January:
* const result = setWeek(new Date(2005, 0, 2), 1, {
*   weekStartsOn: 1,
*   firstWeekContainsDate: 4
* })
* //=> Sun Jan 4 2004 00:00:00
*/
function setWeek(date, week, options) {
	const date_ = toDate(date, options?.in);
	const diff = getWeek(date_, options) - week;
	date_.setDate(date_.getDate() - diff * 7);
	return toDate(date_, options?.in);
}
// ../DnD helper/node_modules/date-fns/parse/_lib/parsers/LocalWeekParser.js
var LocalWeekParser = class extends Parser {
	priority = 100;
	parse(dateString, token, match) {
		switch (token) {
			case "w": return parseNumericPattern(numericPatterns.week, dateString);
			case "wo": return match.ordinalNumber(dateString, { unit: "week" });
			default: return parseNDigits(token.length, dateString);
		}
	}
	validate(_date, value) {
		return value >= 1 && value <= 53;
	}
	set(date, _flags, value, options) {
		return startOfWeek(setWeek(date, value, options), options);
	}
	incompatibleTokens = [
		"y",
		"R",
		"u",
		"q",
		"Q",
		"M",
		"L",
		"I",
		"d",
		"D",
		"i",
		"t",
		"T"
	];
};
// ../DnD helper/node_modules/date-fns/setISOWeek.js
/**
* The {@link setISOWeek} function options.
*/
/**
* @name setISOWeek
* @category ISO Week Helpers
* @summary Set the ISO week to the given date.
*
* @description
* Set the ISO week to the given date, saving the weekday number.
*
* ISO week-numbering year: http://en.wikipedia.org/wiki/ISO_week_date
*
* @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
* @typeParam ResultDate - The `Date` type of the context function.
*
* @param date - The date to be changed
* @param week - The ISO week of the new date
* @param options - An object with options
*
* @returns The new date with the ISO week set
*
* @example
* // Set the 53rd ISO week to 7 August 2004:
* const result = setISOWeek(new Date(2004, 7, 7), 53)
* //=> Sat Jan 01 2005 00:00:00
*/
function setISOWeek(date, week, options) {
	const _date = toDate(date, options?.in);
	const diff = getISOWeek(_date, options) - week;
	_date.setDate(_date.getDate() - diff * 7);
	return _date;
}
// ../DnD helper/node_modules/date-fns/parse/_lib/parsers/ISOWeekParser.js
var ISOWeekParser = class extends Parser {
	priority = 100;
	parse(dateString, token, match) {
		switch (token) {
			case "I": return parseNumericPattern(numericPatterns.week, dateString);
			case "Io": return match.ordinalNumber(dateString, { unit: "week" });
			default: return parseNDigits(token.length, dateString);
		}
	}
	validate(_date, value) {
		return value >= 1 && value <= 53;
	}
	set(date, _flags, value) {
		return startOfISOWeek(setISOWeek(date, value));
	}
	incompatibleTokens = [
		"y",
		"Y",
		"u",
		"q",
		"Q",
		"M",
		"L",
		"w",
		"d",
		"D",
		"e",
		"c",
		"t",
		"T"
	];
};
// ../DnD helper/node_modules/date-fns/parse/_lib/parsers/DateParser.js
var DAYS_IN_MONTH = [
	31,
	28,
	31,
	30,
	31,
	30,
	31,
	31,
	30,
	31,
	30,
	31
];
var DAYS_IN_MONTH_LEAP_YEAR = [
	31,
	29,
	31,
	30,
	31,
	30,
	31,
	31,
	30,
	31,
	30,
	31
];
var DateParser = class extends Parser {
	priority = 90;
	subPriority = 1;
	parse(dateString, token, match) {
		switch (token) {
			case "d": return parseNumericPattern(numericPatterns.date, dateString);
			case "do": return match.ordinalNumber(dateString, { unit: "date" });
			default: return parseNDigits(token.length, dateString);
		}
	}
	validate(date, value) {
		const isLeapYear = isLeapYearIndex(date.getFullYear());
		const month = date.getMonth();
		if (isLeapYear) return value >= 1 && value <= DAYS_IN_MONTH_LEAP_YEAR[month];
		else return value >= 1 && value <= DAYS_IN_MONTH[month];
	}
	set(date, _flags, value) {
		date.setDate(value);
		date.setHours(0, 0, 0, 0);
		return date;
	}
	incompatibleTokens = [
		"Y",
		"R",
		"q",
		"Q",
		"w",
		"I",
		"D",
		"i",
		"e",
		"c",
		"t",
		"T"
	];
};
// ../DnD helper/node_modules/date-fns/parse/_lib/parsers/DayOfYearParser.js
var DayOfYearParser = class extends Parser {
	priority = 90;
	subpriority = 1;
	parse(dateString, token, match) {
		switch (token) {
			case "D":
			case "DD": return parseNumericPattern(numericPatterns.dayOfYear, dateString);
			case "Do": return match.ordinalNumber(dateString, { unit: "date" });
			default: return parseNDigits(token.length, dateString);
		}
	}
	validate(date, value) {
		if (isLeapYearIndex(date.getFullYear())) return value >= 1 && value <= 366;
		else return value >= 1 && value <= 365;
	}
	set(date, _flags, value) {
		date.setMonth(0, value);
		date.setHours(0, 0, 0, 0);
		return date;
	}
	incompatibleTokens = [
		"Y",
		"R",
		"q",
		"Q",
		"M",
		"L",
		"w",
		"I",
		"d",
		"E",
		"i",
		"e",
		"c",
		"t",
		"T"
	];
};
// ../DnD helper/node_modules/date-fns/setDay.js
/**
* The {@link setDay} function options.
*/
/**
* @name setDay
* @category Weekday Helpers
* @summary Set the day of the week to the given date.
*
* @description
* Set the day of the week to the given date.
*
* @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
* @typeParam ResultDate - The result `Date` type, it is the type returned from the context function if it is passed, or inferred from the arguments.
*
* @param date - The date to be changed
* @param day - The day of the week of the new date
* @param options - An object with options.
*
* @returns The new date with the day of the week set
*
* @example
* // Set week day to Sunday, with the default weekStartsOn of Sunday:
* const result = setDay(new Date(2014, 8, 1), 0)
* //=> Sun Aug 31 2014 00:00:00
*
* @example
* // Set week day to Sunday, with a weekStartsOn of Monday:
* const result = setDay(new Date(2014, 8, 1), 0, { weekStartsOn: 1 })
* //=> Sun Sep 07 2014 00:00:00
*/
function setDay(date, day, options) {
	const defaultOptions = getDefaultOptions$1();
	const weekStartsOn = options?.weekStartsOn ?? options?.locale?.options?.weekStartsOn ?? defaultOptions.weekStartsOn ?? defaultOptions.locale?.options?.weekStartsOn ?? 0;
	const date_ = toDate(date, options?.in);
	const currentDay = date_.getDay();
	const dayIndex = (day % 7 + 7) % 7;
	const delta = 7 - weekStartsOn;
	return addDays(date_, day < 0 || day > 6 ? day - (currentDay + delta) % 7 : (dayIndex + delta) % 7 - (currentDay + delta) % 7, options);
}
// ../DnD helper/node_modules/date-fns/parse/_lib/parsers/DayParser.js
var DayParser = class extends Parser {
	priority = 90;
	parse(dateString, token, match) {
		switch (token) {
			case "E":
			case "EE":
			case "EEE": return match.day(dateString, {
				width: "abbreviated",
				context: "formatting"
			}) || match.day(dateString, {
				width: "short",
				context: "formatting"
			}) || match.day(dateString, {
				width: "narrow",
				context: "formatting"
			});
			case "EEEEE": return match.day(dateString, {
				width: "narrow",
				context: "formatting"
			});
			case "EEEEEE": return match.day(dateString, {
				width: "short",
				context: "formatting"
			}) || match.day(dateString, {
				width: "narrow",
				context: "formatting"
			});
			default: return match.day(dateString, {
				width: "wide",
				context: "formatting"
			}) || match.day(dateString, {
				width: "abbreviated",
				context: "formatting"
			}) || match.day(dateString, {
				width: "short",
				context: "formatting"
			}) || match.day(dateString, {
				width: "narrow",
				context: "formatting"
			});
		}
	}
	validate(_date, value) {
		return value >= 0 && value <= 6;
	}
	set(date, _flags, value, options) {
		date = setDay(date, value, options);
		date.setHours(0, 0, 0, 0);
		return date;
	}
	incompatibleTokens = [
		"D",
		"i",
		"e",
		"c",
		"t",
		"T"
	];
};
// ../DnD helper/node_modules/date-fns/parse/_lib/parsers/LocalDayParser.js
var LocalDayParser = class extends Parser {
	priority = 90;
	parse(dateString, token, match, options) {
		const valueCallback = (value) => {
			const wholeWeekDays = Math.floor((value - 1) / 7) * 7;
			return (value + options.weekStartsOn + 6) % 7 + wholeWeekDays;
		};
		switch (token) {
			case "e":
			case "ee": return mapValue(parseNDigits(token.length, dateString), valueCallback);
			case "eo": return mapValue(match.ordinalNumber(dateString, { unit: "day" }), valueCallback);
			case "eee": return match.day(dateString, {
				width: "abbreviated",
				context: "formatting"
			}) || match.day(dateString, {
				width: "short",
				context: "formatting"
			}) || match.day(dateString, {
				width: "narrow",
				context: "formatting"
			});
			case "eeeee": return match.day(dateString, {
				width: "narrow",
				context: "formatting"
			});
			case "eeeeee": return match.day(dateString, {
				width: "short",
				context: "formatting"
			}) || match.day(dateString, {
				width: "narrow",
				context: "formatting"
			});
			default: return match.day(dateString, {
				width: "wide",
				context: "formatting"
			}) || match.day(dateString, {
				width: "abbreviated",
				context: "formatting"
			}) || match.day(dateString, {
				width: "short",
				context: "formatting"
			}) || match.day(dateString, {
				width: "narrow",
				context: "formatting"
			});
		}
	}
	validate(_date, value) {
		return value >= 0 && value <= 6;
	}
	set(date, _flags, value, options) {
		date = setDay(date, value, options);
		date.setHours(0, 0, 0, 0);
		return date;
	}
	incompatibleTokens = [
		"y",
		"R",
		"u",
		"q",
		"Q",
		"M",
		"L",
		"I",
		"d",
		"D",
		"E",
		"i",
		"c",
		"t",
		"T"
	];
};
// ../DnD helper/node_modules/date-fns/parse/_lib/parsers/StandAloneLocalDayParser.js
var StandAloneLocalDayParser = class extends Parser {
	priority = 90;
	parse(dateString, token, match, options) {
		const valueCallback = (value) => {
			const wholeWeekDays = Math.floor((value - 1) / 7) * 7;
			return (value + options.weekStartsOn + 6) % 7 + wholeWeekDays;
		};
		switch (token) {
			case "c":
			case "cc": return mapValue(parseNDigits(token.length, dateString), valueCallback);
			case "co": return mapValue(match.ordinalNumber(dateString, { unit: "day" }), valueCallback);
			case "ccc": return match.day(dateString, {
				width: "abbreviated",
				context: "standalone"
			}) || match.day(dateString, {
				width: "short",
				context: "standalone"
			}) || match.day(dateString, {
				width: "narrow",
				context: "standalone"
			});
			case "ccccc": return match.day(dateString, {
				width: "narrow",
				context: "standalone"
			});
			case "cccccc": return match.day(dateString, {
				width: "short",
				context: "standalone"
			}) || match.day(dateString, {
				width: "narrow",
				context: "standalone"
			});
			default: return match.day(dateString, {
				width: "wide",
				context: "standalone"
			}) || match.day(dateString, {
				width: "abbreviated",
				context: "standalone"
			}) || match.day(dateString, {
				width: "short",
				context: "standalone"
			}) || match.day(dateString, {
				width: "narrow",
				context: "standalone"
			});
		}
	}
	validate(_date, value) {
		return value >= 0 && value <= 6;
	}
	set(date, _flags, value, options) {
		date = setDay(date, value, options);
		date.setHours(0, 0, 0, 0);
		return date;
	}
	incompatibleTokens = [
		"y",
		"R",
		"u",
		"q",
		"Q",
		"M",
		"L",
		"I",
		"d",
		"D",
		"E",
		"i",
		"e",
		"t",
		"T"
	];
};
// ../DnD helper/node_modules/date-fns/setISODay.js
/**
* The {@link setISODay} function options.
*/
/**
* @name setISODay
* @category Weekday Helpers
* @summary Set the day of the ISO week to the given date.
*
* @description
* Set the day of the ISO week to the given date.
* ISO week starts with Monday.
* 7 is the index of Sunday, 1 is the index of Monday, etc.
*
* @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
* @typeParam ResultDate - The result `Date` type, it is the type returned from the context function if it is passed, or inferred from the arguments.
*
* @param date - The date to be changed
* @param day - The day of the ISO week of the new date
* @param options - An object with options
*
* @returns The new date with the day of the ISO week set
*
* @example
* // Set Sunday to 1 September 2014:
* const result = setISODay(new Date(2014, 8, 1), 7)
* //=> Sun Sep 07 2014 00:00:00
*/
function setISODay(date, day, options) {
	const date_ = toDate(date, options?.in);
	return addDays(date_, day - getISODay(date_, options), options);
}
// ../DnD helper/node_modules/date-fns/parse/_lib/parsers/ISODayParser.js
var ISODayParser = class extends Parser {
	priority = 90;
	parse(dateString, token, match) {
		const valueCallback = (value) => {
			if (value === 0) return 7;
			return value;
		};
		switch (token) {
			case "i":
			case "ii": return parseNDigits(token.length, dateString);
			case "io": return match.ordinalNumber(dateString, { unit: "day" });
			case "iii": return mapValue(match.day(dateString, {
				width: "abbreviated",
				context: "formatting"
			}) || match.day(dateString, {
				width: "short",
				context: "formatting"
			}) || match.day(dateString, {
				width: "narrow",
				context: "formatting"
			}), valueCallback);
			case "iiiii": return mapValue(match.day(dateString, {
				width: "narrow",
				context: "formatting"
			}), valueCallback);
			case "iiiiii": return mapValue(match.day(dateString, {
				width: "short",
				context: "formatting"
			}) || match.day(dateString, {
				width: "narrow",
				context: "formatting"
			}), valueCallback);
			default: return mapValue(match.day(dateString, {
				width: "wide",
				context: "formatting"
			}) || match.day(dateString, {
				width: "abbreviated",
				context: "formatting"
			}) || match.day(dateString, {
				width: "short",
				context: "formatting"
			}) || match.day(dateString, {
				width: "narrow",
				context: "formatting"
			}), valueCallback);
		}
	}
	validate(_date, value) {
		return value >= 1 && value <= 7;
	}
	set(date, _flags, value) {
		date = setISODay(date, value);
		date.setHours(0, 0, 0, 0);
		return date;
	}
	incompatibleTokens = [
		"y",
		"Y",
		"u",
		"q",
		"Q",
		"M",
		"L",
		"w",
		"d",
		"D",
		"E",
		"e",
		"c",
		"t",
		"T"
	];
};
// ../DnD helper/node_modules/date-fns/parse/_lib/parsers/AMPMParser.js
var AMPMParser = class extends Parser {
	priority = 80;
	parse(dateString, token, match) {
		switch (token) {
			case "a":
			case "aa":
			case "aaa": return match.dayPeriod(dateString, {
				width: "abbreviated",
				context: "formatting"
			}) || match.dayPeriod(dateString, {
				width: "narrow",
				context: "formatting"
			});
			case "aaaaa": return match.dayPeriod(dateString, {
				width: "narrow",
				context: "formatting"
			});
			default: return match.dayPeriod(dateString, {
				width: "wide",
				context: "formatting"
			}) || match.dayPeriod(dateString, {
				width: "abbreviated",
				context: "formatting"
			}) || match.dayPeriod(dateString, {
				width: "narrow",
				context: "formatting"
			});
		}
	}
	set(date, _flags, value) {
		date.setHours(dayPeriodEnumToHours(value), 0, 0, 0);
		return date;
	}
	incompatibleTokens = [
		"b",
		"B",
		"H",
		"k",
		"t",
		"T"
	];
};
// ../DnD helper/node_modules/date-fns/parse/_lib/parsers/AMPMMidnightParser.js
var AMPMMidnightParser = class extends Parser {
	priority = 80;
	parse(dateString, token, match) {
		switch (token) {
			case "b":
			case "bb":
			case "bbb": return match.dayPeriod(dateString, {
				width: "abbreviated",
				context: "formatting"
			}) || match.dayPeriod(dateString, {
				width: "narrow",
				context: "formatting"
			});
			case "bbbbb": return match.dayPeriod(dateString, {
				width: "narrow",
				context: "formatting"
			});
			default: return match.dayPeriod(dateString, {
				width: "wide",
				context: "formatting"
			}) || match.dayPeriod(dateString, {
				width: "abbreviated",
				context: "formatting"
			}) || match.dayPeriod(dateString, {
				width: "narrow",
				context: "formatting"
			});
		}
	}
	set(date, _flags, value) {
		date.setHours(dayPeriodEnumToHours(value), 0, 0, 0);
		return date;
	}
	incompatibleTokens = [
		"a",
		"B",
		"H",
		"k",
		"t",
		"T"
	];
};
// ../DnD helper/node_modules/date-fns/parse/_lib/parsers/DayPeriodParser.js
var DayPeriodParser = class extends Parser {
	priority = 80;
	parse(dateString, token, match) {
		switch (token) {
			case "B":
			case "BB":
			case "BBB": return match.dayPeriod(dateString, {
				width: "abbreviated",
				context: "formatting"
			}) || match.dayPeriod(dateString, {
				width: "narrow",
				context: "formatting"
			});
			case "BBBBB": return match.dayPeriod(dateString, {
				width: "narrow",
				context: "formatting"
			});
			default: return match.dayPeriod(dateString, {
				width: "wide",
				context: "formatting"
			}) || match.dayPeriod(dateString, {
				width: "abbreviated",
				context: "formatting"
			}) || match.dayPeriod(dateString, {
				width: "narrow",
				context: "formatting"
			});
		}
	}
	set(date, _flags, value) {
		date.setHours(dayPeriodEnumToHours(value), 0, 0, 0);
		return date;
	}
	incompatibleTokens = [
		"a",
		"b",
		"t",
		"T"
	];
};
// ../DnD helper/node_modules/date-fns/parse/_lib/parsers/Hour1to12Parser.js
var Hour1to12Parser = class extends Parser {
	priority = 70;
	parse(dateString, token, match) {
		switch (token) {
			case "h": return parseNumericPattern(numericPatterns.hour12h, dateString);
			case "ho": return match.ordinalNumber(dateString, { unit: "hour" });
			default: return parseNDigits(token.length, dateString);
		}
	}
	validate(_date, value) {
		return value >= 1 && value <= 12;
	}
	set(date, _flags, value) {
		const isPM = date.getHours() >= 12;
		if (isPM && value < 12) date.setHours(value + 12, 0, 0, 0);
		else if (!isPM && value === 12) date.setHours(0, 0, 0, 0);
		else date.setHours(value, 0, 0, 0);
		return date;
	}
	incompatibleTokens = [
		"H",
		"K",
		"k",
		"t",
		"T"
	];
};
// ../DnD helper/node_modules/date-fns/parse/_lib/parsers/Hour0to23Parser.js
var Hour0to23Parser = class extends Parser {
	priority = 70;
	parse(dateString, token, match) {
		switch (token) {
			case "H": return parseNumericPattern(numericPatterns.hour23h, dateString);
			case "Ho": return match.ordinalNumber(dateString, { unit: "hour" });
			default: return parseNDigits(token.length, dateString);
		}
	}
	validate(_date, value) {
		return value >= 0 && value <= 23;
	}
	set(date, _flags, value) {
		date.setHours(value, 0, 0, 0);
		return date;
	}
	incompatibleTokens = [
		"a",
		"b",
		"h",
		"K",
		"k",
		"t",
		"T"
	];
};
// ../DnD helper/node_modules/date-fns/parse/_lib/parsers/Hour0To11Parser.js
var Hour0To11Parser = class extends Parser {
	priority = 70;
	parse(dateString, token, match) {
		switch (token) {
			case "K": return parseNumericPattern(numericPatterns.hour11h, dateString);
			case "Ko": return match.ordinalNumber(dateString, { unit: "hour" });
			default: return parseNDigits(token.length, dateString);
		}
	}
	validate(_date, value) {
		return value >= 0 && value <= 11;
	}
	set(date, _flags, value) {
		if (date.getHours() >= 12 && value < 12) date.setHours(value + 12, 0, 0, 0);
		else date.setHours(value, 0, 0, 0);
		return date;
	}
	incompatibleTokens = [
		"h",
		"H",
		"k",
		"t",
		"T"
	];
};
// ../DnD helper/node_modules/date-fns/parse/_lib/parsers/Hour1To24Parser.js
var Hour1To24Parser = class extends Parser {
	priority = 70;
	parse(dateString, token, match) {
		switch (token) {
			case "k": return parseNumericPattern(numericPatterns.hour24h, dateString);
			case "ko": return match.ordinalNumber(dateString, { unit: "hour" });
			default: return parseNDigits(token.length, dateString);
		}
	}
	validate(_date, value) {
		return value >= 1 && value <= 24;
	}
	set(date, _flags, value) {
		const hours = value <= 24 ? value % 24 : value;
		date.setHours(hours, 0, 0, 0);
		return date;
	}
	incompatibleTokens = [
		"a",
		"b",
		"h",
		"H",
		"K",
		"t",
		"T"
	];
};
// ../DnD helper/node_modules/date-fns/parse/_lib/parsers/MinuteParser.js
var MinuteParser = class extends Parser {
	priority = 60;
	parse(dateString, token, match) {
		switch (token) {
			case "m": return parseNumericPattern(numericPatterns.minute, dateString);
			case "mo": return match.ordinalNumber(dateString, { unit: "minute" });
			default: return parseNDigits(token.length, dateString);
		}
	}
	validate(_date, value) {
		return value >= 0 && value <= 59;
	}
	set(date, _flags, value) {
		date.setMinutes(value, 0, 0);
		return date;
	}
	incompatibleTokens = ["t", "T"];
};
// ../DnD helper/node_modules/date-fns/parse/_lib/parsers/SecondParser.js
var SecondParser = class extends Parser {
	priority = 50;
	parse(dateString, token, match) {
		switch (token) {
			case "s": return parseNumericPattern(numericPatterns.second, dateString);
			case "so": return match.ordinalNumber(dateString, { unit: "second" });
			default: return parseNDigits(token.length, dateString);
		}
	}
	validate(_date, value) {
		return value >= 0 && value <= 59;
	}
	set(date, _flags, value) {
		date.setSeconds(value, 0);
		return date;
	}
	incompatibleTokens = ["t", "T"];
};
// ../DnD helper/node_modules/date-fns/parse/_lib/parsers/FractionOfSecondParser.js
var FractionOfSecondParser = class extends Parser {
	priority = 30;
	parse(dateString, token) {
		const valueCallback = (value) => Math.trunc(value * Math.pow(10, -token.length + 3));
		return mapValue(parseNDigits(token.length, dateString), valueCallback);
	}
	set(date, _flags, value) {
		date.setMilliseconds(value);
		return date;
	}
	incompatibleTokens = ["t", "T"];
};
// ../DnD helper/node_modules/date-fns/parse/_lib/parsers/ISOTimezoneWithZParser.js
var ISOTimezoneWithZParser = class extends Parser {
	priority = 10;
	parse(dateString, token) {
		switch (token) {
			case "X": return parseTimezonePattern(timezonePatterns.basicOptionalMinutes, dateString);
			case "XX": return parseTimezonePattern(timezonePatterns.basic, dateString);
			case "XXXX": return parseTimezonePattern(timezonePatterns.basicOptionalSeconds, dateString);
			case "XXXXX": return parseTimezonePattern(timezonePatterns.extendedOptionalSeconds, dateString);
			default: return parseTimezonePattern(timezonePatterns.extended, dateString);
		}
	}
	set(date, flags, value) {
		if (flags.timestampIsSet) return date;
		return constructFrom(date, date.getTime() - getTimezoneOffsetInMilliseconds(date) - value);
	}
	incompatibleTokens = [
		"t",
		"T",
		"x"
	];
};
// ../DnD helper/node_modules/date-fns/parse/_lib/parsers/ISOTimezoneParser.js
var ISOTimezoneParser = class extends Parser {
	priority = 10;
	parse(dateString, token) {
		switch (token) {
			case "x": return parseTimezonePattern(timezonePatterns.basicOptionalMinutes, dateString);
			case "xx": return parseTimezonePattern(timezonePatterns.basic, dateString);
			case "xxxx": return parseTimezonePattern(timezonePatterns.basicOptionalSeconds, dateString);
			case "xxxxx": return parseTimezonePattern(timezonePatterns.extendedOptionalSeconds, dateString);
			default: return parseTimezonePattern(timezonePatterns.extended, dateString);
		}
	}
	set(date, flags, value) {
		if (flags.timestampIsSet) return date;
		return constructFrom(date, date.getTime() - getTimezoneOffsetInMilliseconds(date) - value);
	}
	incompatibleTokens = [
		"t",
		"T",
		"X"
	];
};
// ../DnD helper/node_modules/date-fns/parse/_lib/parsers/TimestampSecondsParser.js
var TimestampSecondsParser = class extends Parser {
	priority = 40;
	parse(dateString) {
		return parseAnyDigitsSigned(dateString);
	}
	set(date, _flags, value) {
		return [constructFrom(date, value * 1e3), { timestampIsSet: true }];
	}
	incompatibleTokens = "*";
};
// ../DnD helper/node_modules/date-fns/parse/_lib/parsers/TimestampMillisecondsParser.js
var TimestampMillisecondsParser = class extends Parser {
	priority = 20;
	parse(dateString) {
		return parseAnyDigitsSigned(dateString);
	}
	set(date, _flags, value) {
		return [constructFrom(date, value), { timestampIsSet: true }];
	}
	incompatibleTokens = "*";
};
// ../DnD helper/node_modules/date-fns/parse/_lib/parsers.js
var parsers = {
	G: new EraParser(),
	y: new YearParser(),
	Y: new LocalWeekYearParser(),
	R: new ISOWeekYearParser(),
	u: new ExtendedYearParser(),
	Q: new QuarterParser(),
	q: new StandAloneQuarterParser(),
	M: new MonthParser(),
	L: new StandAloneMonthParser(),
	w: new LocalWeekParser(),
	I: new ISOWeekParser(),
	d: new DateParser(),
	D: new DayOfYearParser(),
	E: new DayParser(),
	e: new LocalDayParser(),
	c: new StandAloneLocalDayParser(),
	i: new ISODayParser(),
	a: new AMPMParser(),
	b: new AMPMMidnightParser(),
	B: new DayPeriodParser(),
	h: new Hour1to12Parser(),
	H: new Hour0to23Parser(),
	K: new Hour0To11Parser(),
	k: new Hour1To24Parser(),
	m: new MinuteParser(),
	s: new SecondParser(),
	S: new FractionOfSecondParser(),
	X: new ISOTimezoneWithZParser(),
	x: new ISOTimezoneParser(),
	t: new TimestampSecondsParser(),
	T: new TimestampMillisecondsParser()
};
// ../DnD helper/node_modules/date-fns/parse.js
/**
* The {@link parse} function options.
*/
var formattingTokensRegExp = /[yYQqMLwIdDecihHKkms]o|(\w)\1*|''|'(''|[^'])+('|$)|./g;
var longFormattingTokensRegExp = /P+p+|P+|p+|''|'(''|[^'])+('|$)|./g;
var escapedStringRegExp = /^'([^]*?)'?$/;
var doubleQuoteRegExp = /''/g;
var notWhitespaceRegExp = /\S/;
var unescapedLatinCharacterRegExp = /[a-zA-Z]/;
/**
* @name parse
* @category Common Helpers
* @summary Parse the date.
*
* @description
* Return the date parsed from string using the given format string.
*
* > ⚠️ Please note that the `format` tokens differ from Moment.js and other libraries.
* > See: https://github.com/date-fns/date-fns/blob/master/docs/unicodeTokens.md
*
* The characters in the format string wrapped between two single quotes characters (') are escaped.
* Two single quotes in a row, whether inside or outside a quoted sequence, represent a 'real' single quote.
*
* Format of the format string is based on Unicode Technical Standard #35:
* https://www.unicode.org/reports/tr35/tr35-dates.html#Date_Field_Symbol_Table
* with a few additions (see note 5 below the table).
*
* Not all tokens are compatible. Combinations that don't make sense or could lead to bugs are prohibited
* and will throw `RangeError`. For example usage of 24-hour format token with AM/PM token will throw an exception:
*
* ```javascript
* parse('23 AM', 'HH a', new Date())
* //=> RangeError: The format string mustn't contain `HH` and `a` at the same time
* ```
*
* See the compatibility table: https://docs.google.com/spreadsheets/d/e/2PACX-1vQOPU3xUhplll6dyoMmVUXHKl_8CRDs6_ueLmex3SoqwhuolkuN3O05l4rqx5h1dKX8eb46Ul-CCSrq/pubhtml?gid=0&single=true
*
* Accepted format string patterns:
* | Unit                            |Prior| Pattern | Result examples                   | Notes |
* |---------------------------------|-----|---------|-----------------------------------|-------|
* | Era                             | 140 | G..GGG  | AD, BC                            |       |
* |                                 |     | GGGG    | Anno Domini, Before Christ        | 2     |
* |                                 |     | GGGGG   | A, B                              |       |
* | Calendar year                   | 130 | y       | 44, 1, 1900, 2017, 9999           | 4     |
* |                                 |     | yo      | 44th, 1st, 1900th, 9999999th      | 4,5   |
* |                                 |     | yy      | 44, 01, 00, 17                    | 4     |
* |                                 |     | yyy     | 044, 001, 123, 999                | 4     |
* |                                 |     | yyyy    | 0044, 0001, 1900, 2017            | 4     |
* |                                 |     | yyyyy   | ...                               | 2,4   |
* | Local week-numbering year       | 130 | Y       | 44, 1, 1900, 2017, 9000           | 4     |
* |                                 |     | Yo      | 44th, 1st, 1900th, 9999999th      | 4,5   |
* |                                 |     | YY      | 44, 01, 00, 17                    | 4,6   |
* |                                 |     | YYY     | 044, 001, 123, 999                | 4     |
* |                                 |     | YYYY    | 0044, 0001, 1900, 2017            | 4,6   |
* |                                 |     | YYYYY   | ...                               | 2,4   |
* | ISO week-numbering year         | 130 | R       | -43, 1, 1900, 2017, 9999, -9999   | 4,5   |
* |                                 |     | RR      | -43, 01, 00, 17                   | 4,5   |
* |                                 |     | RRR     | -043, 001, 123, 999, -999         | 4,5   |
* |                                 |     | RRRR    | -0043, 0001, 2017, 9999, -9999    | 4,5   |
* |                                 |     | RRRRR   | ...                               | 2,4,5 |
* | Extended year                   | 130 | u       | -43, 1, 1900, 2017, 9999, -999    | 4     |
* |                                 |     | uu      | -43, 01, 99, -99                  | 4     |
* |                                 |     | uuu     | -043, 001, 123, 999, -999         | 4     |
* |                                 |     | uuuu    | -0043, 0001, 2017, 9999, -9999    | 4     |
* |                                 |     | uuuuu   | ...                               | 2,4   |
* | Quarter (formatting)            | 120 | Q       | 1, 2, 3, 4                        |       |
* |                                 |     | Qo      | 1st, 2nd, 3rd, 4th                | 5     |
* |                                 |     | QQ      | 01, 02, 03, 04                    |       |
* |                                 |     | QQQ     | Q1, Q2, Q3, Q4                    |       |
* |                                 |     | QQQQ    | 1st quarter, 2nd quarter, ...     | 2     |
* |                                 |     | QQQQQ   | 1, 2, 3, 4                        | 4     |
* | Quarter (stand-alone)           | 120 | q       | 1, 2, 3, 4                        |       |
* |                                 |     | qo      | 1st, 2nd, 3rd, 4th                | 5     |
* |                                 |     | qq      | 01, 02, 03, 04                    |       |
* |                                 |     | qqq     | Q1, Q2, Q3, Q4                    |       |
* |                                 |     | qqqq    | 1st quarter, 2nd quarter, ...     | 2     |
* |                                 |     | qqqqq   | 1, 2, 3, 4                        | 3     |
* | Month (formatting)              | 110 | M       | 1, 2, ..., 12                     |       |
* |                                 |     | Mo      | 1st, 2nd, ..., 12th               | 5     |
* |                                 |     | MM      | 01, 02, ..., 12                   |       |
* |                                 |     | MMM     | Jan, Feb, ..., Dec                |       |
* |                                 |     | MMMM    | January, February, ..., December  | 2     |
* |                                 |     | MMMMM   | J, F, ..., D                      |       |
* | Month (stand-alone)             | 110 | L       | 1, 2, ..., 12                     |       |
* |                                 |     | Lo      | 1st, 2nd, ..., 12th               | 5     |
* |                                 |     | LL      | 01, 02, ..., 12                   |       |
* |                                 |     | LLL     | Jan, Feb, ..., Dec                |       |
* |                                 |     | LLLL    | January, February, ..., December  | 2     |
* |                                 |     | LLLLL   | J, F, ..., D                      |       |
* | Local week of year              | 100 | w       | 1, 2, ..., 53                     |       |
* |                                 |     | wo      | 1st, 2nd, ..., 53th               | 5     |
* |                                 |     | ww      | 01, 02, ..., 53                   |       |
* | ISO week of year                | 100 | I       | 1, 2, ..., 53                     | 5     |
* |                                 |     | Io      | 1st, 2nd, ..., 53th               | 5     |
* |                                 |     | II      | 01, 02, ..., 53                   | 5     |
* | Day of month                    |  90 | d       | 1, 2, ..., 31                     |       |
* |                                 |     | do      | 1st, 2nd, ..., 31st               | 5     |
* |                                 |     | dd      | 01, 02, ..., 31                   |       |
* | Day of year                     |  90 | D       | 1, 2, ..., 365, 366               | 7     |
* |                                 |     | Do      | 1st, 2nd, ..., 365th, 366th       | 5     |
* |                                 |     | DD      | 01, 02, ..., 365, 366             | 7     |
* |                                 |     | DDD     | 001, 002, ..., 365, 366           |       |
* |                                 |     | DDDD    | ...                               | 2     |
* | Day of week (formatting)        |  90 | E..EEE  | Mon, Tue, Wed, ..., Sun           |       |
* |                                 |     | EEEE    | Monday, Tuesday, ..., Sunday      | 2     |
* |                                 |     | EEEEE   | M, T, W, T, F, S, S               |       |
* |                                 |     | EEEEEE  | Mo, Tu, We, Th, Fr, Sa, Su        |       |
* | ISO day of week (formatting)    |  90 | i       | 1, 2, 3, ..., 7                   | 5     |
* |                                 |     | io      | 1st, 2nd, ..., 7th                | 5     |
* |                                 |     | ii      | 01, 02, ..., 07                   | 5     |
* |                                 |     | iii     | Mon, Tue, Wed, ..., Sun           | 5     |
* |                                 |     | iiii    | Monday, Tuesday, ..., Sunday      | 2,5   |
* |                                 |     | iiiii   | M, T, W, T, F, S, S               | 5     |
* |                                 |     | iiiiii  | Mo, Tu, We, Th, Fr, Sa, Su        | 5     |
* | Local day of week (formatting)  |  90 | e       | 2, 3, 4, ..., 1                   |       |
* |                                 |     | eo      | 2nd, 3rd, ..., 1st                | 5     |
* |                                 |     | ee      | 02, 03, ..., 01                   |       |
* |                                 |     | eee     | Mon, Tue, Wed, ..., Sun           |       |
* |                                 |     | eeee    | Monday, Tuesday, ..., Sunday      | 2     |
* |                                 |     | eeeee   | M, T, W, T, F, S, S               |       |
* |                                 |     | eeeeee  | Mo, Tu, We, Th, Fr, Sa, Su        |       |
* | Local day of week (stand-alone) |  90 | c       | 2, 3, 4, ..., 1                   |       |
* |                                 |     | co      | 2nd, 3rd, ..., 1st                | 5     |
* |                                 |     | cc      | 02, 03, ..., 01                   |       |
* |                                 |     | ccc     | Mon, Tue, Wed, ..., Sun           |       |
* |                                 |     | cccc    | Monday, Tuesday, ..., Sunday      | 2     |
* |                                 |     | ccccc   | M, T, W, T, F, S, S               |       |
* |                                 |     | cccccc  | Mo, Tu, We, Th, Fr, Sa, Su        |       |
* | AM, PM                          |  80 | a..aaa  | AM, PM                            |       |
* |                                 |     | aaaa    | a.m., p.m.                        | 2     |
* |                                 |     | aaaaa   | a, p                              |       |
* | AM, PM, noon, midnight          |  80 | b..bbb  | AM, PM, noon, midnight            |       |
* |                                 |     | bbbb    | a.m., p.m., noon, midnight        | 2     |
* |                                 |     | bbbbb   | a, p, n, mi                       |       |
* | Flexible day period             |  80 | B..BBB  | at night, in the morning, ...     |       |
* |                                 |     | BBBB    | at night, in the morning, ...     | 2     |
* |                                 |     | BBBBB   | at night, in the morning, ...     |       |
* | Hour [1-12]                     |  70 | h       | 1, 2, ..., 11, 12                 |       |
* |                                 |     | ho      | 1st, 2nd, ..., 11th, 12th         | 5     |
* |                                 |     | hh      | 01, 02, ..., 11, 12               |       |
* | Hour [0-23]                     |  70 | H       | 0, 1, 2, ..., 23                  |       |
* |                                 |     | Ho      | 0th, 1st, 2nd, ..., 23rd          | 5     |
* |                                 |     | HH      | 00, 01, 02, ..., 23               |       |
* | Hour [0-11]                     |  70 | K       | 1, 2, ..., 11, 0                  |       |
* |                                 |     | Ko      | 1st, 2nd, ..., 11th, 0th          | 5     |
* |                                 |     | KK      | 01, 02, ..., 11, 00               |       |
* | Hour [1-24]                     |  70 | k       | 24, 1, 2, ..., 23                 |       |
* |                                 |     | ko      | 24th, 1st, 2nd, ..., 23rd         | 5     |
* |                                 |     | kk      | 24, 01, 02, ..., 23               |       |
* | Minute                          |  60 | m       | 0, 1, ..., 59                     |       |
* |                                 |     | mo      | 0th, 1st, ..., 59th               | 5     |
* |                                 |     | mm      | 00, 01, ..., 59                   |       |
* | Second                          |  50 | s       | 0, 1, ..., 59                     |       |
* |                                 |     | so      | 0th, 1st, ..., 59th               | 5     |
* |                                 |     | ss      | 00, 01, ..., 59                   |       |
* | Seconds timestamp               |  40 | t       | 512969520                         |       |
* |                                 |     | tt      | ...                               | 2     |
* | Fraction of second              |  30 | S       | 0, 1, ..., 9                      |       |
* |                                 |     | SS      | 00, 01, ..., 99                   |       |
* |                                 |     | SSS     | 000, 001, ..., 999                |       |
* |                                 |     | SSSS    | ...                               | 2     |
* | Milliseconds timestamp          |  20 | T       | 512969520900                      |       |
* |                                 |     | TT      | ...                               | 2     |
* | Timezone (ISO-8601 w/ Z)        |  10 | X       | -08, +0530, Z                     |       |
* |                                 |     | XX      | -0800, +0530, Z                   |       |
* |                                 |     | XXX     | -08:00, +05:30, Z                 |       |
* |                                 |     | XXXX    | -0800, +0530, Z, +123456          | 2     |
* |                                 |     | XXXXX   | -08:00, +05:30, Z, +12:34:56      |       |
* | Timezone (ISO-8601 w/o Z)       |  10 | x       | -08, +0530, +00                   |       |
* |                                 |     | xx      | -0800, +0530, +0000               |       |
* |                                 |     | xxx     | -08:00, +05:30, +00:00            | 2     |
* |                                 |     | xxxx    | -0800, +0530, +0000, +123456      |       |
* |                                 |     | xxxxx   | -08:00, +05:30, +00:00, +12:34:56 |       |
* | Long localized date             |  NA | P       | 05/29/1453                        | 5,8   |
* |                                 |     | PP      | May 29, 1453                      |       |
* |                                 |     | PPP     | May 29th, 1453                    |       |
* |                                 |     | PPPP    | Sunday, May 29th, 1453            | 2,5,8 |
* | Long localized time             |  NA | p       | 12:00 AM                          | 5,8   |
* |                                 |     | pp      | 12:00:00 AM                       |       |
* | Combination of date and time    |  NA | Pp      | 05/29/1453, 12:00 AM              |       |
* |                                 |     | PPpp    | May 29, 1453, 12:00:00 AM         |       |
* |                                 |     | PPPpp   | May 29th, 1453 at ...             |       |
* |                                 |     | PPPPpp  | Sunday, May 29th, 1453 at ...     | 2,5,8 |
* Notes:
* 1. "Formatting" units (e.g. formatting quarter) in the default en-US locale
*    are the same as "stand-alone" units, but are different in some languages.
*    "Formatting" units are declined according to the rules of the language
*    in the context of a date. "Stand-alone" units are always nominative singular.
*    In `format` function, they will produce different result:
*
*    `format(new Date(2017, 10, 6), 'do LLLL', {locale: cs}) //=> '6. listopad'`
*
*    `format(new Date(2017, 10, 6), 'do MMMM', {locale: cs}) //=> '6. listopadu'`
*
*    `parse` will try to match both formatting and stand-alone units interchangeably.
*
* 2. Any sequence of the identical letters is a pattern, unless it is escaped by
*    the single quote characters (see below).
*    If the sequence is longer than listed in table:
*    - for numerical units (`yyyyyyyy`) `parse` will try to match a number
*      as wide as the sequence
*    - for text units (`MMMMMMMM`) `parse` will try to match the widest variation of the unit.
*      These variations are marked with "2" in the last column of the table.
*
* 3. `QQQQQ` and `qqqqq` could be not strictly numerical in some locales.
*    These tokens represent the shortest form of the quarter.
*
* 4. The main difference between `y` and `u` patterns are B.C. years:
*
*    | Year | `y` | `u` |
*    |------|-----|-----|
*    | AC 1 |   1 |   1 |
*    | BC 1 |   1 |   0 |
*    | BC 2 |   2 |  -1 |
*
*    Also `yy` will try to guess the century of two digit year by proximity with `referenceDate`:
*
*    `parse('50', 'yy', new Date(2018, 0, 1)) //=> Sat Jan 01 2050 00:00:00`
*
*    `parse('75', 'yy', new Date(2018, 0, 1)) //=> Wed Jan 01 1975 00:00:00`
*
*    while `uu` will just assign the year as is:
*
*    `parse('50', 'uu', new Date(2018, 0, 1)) //=> Sat Jan 01 0050 00:00:00`
*
*    `parse('75', 'uu', new Date(2018, 0, 1)) //=> Tue Jan 01 0075 00:00:00`
*
*    The same difference is true for local and ISO week-numbering years (`Y` and `R`),
*    except local week-numbering years are dependent on `options.weekStartsOn`
*    and `options.firstWeekContainsDate` (compare [setISOWeekYear](https://date-fns.org/docs/setISOWeekYear)
*    and [setWeekYear](https://date-fns.org/docs/setWeekYear)).
*
* 5. These patterns are not in the Unicode Technical Standard #35:
*    - `i`: ISO day of week
*    - `I`: ISO week of year
*    - `R`: ISO week-numbering year
*    - `o`: ordinal number modifier
*    - `P`: long localized date
*    - `p`: long localized time
*
* 6. `YY` and `YYYY` tokens represent week-numbering years but they are often confused with years.
*    You should enable `options.useAdditionalWeekYearTokens` to use them. See: https://github.com/date-fns/date-fns/blob/master/docs/unicodeTokens.md
*
* 7. `D` and `DD` tokens represent days of the year but they are often confused with days of the month.
*    You should enable `options.useAdditionalDayOfYearTokens` to use them. See: https://github.com/date-fns/date-fns/blob/master/docs/unicodeTokens.md
*
* 8. `P+` tokens do not have a defined priority since they are merely aliases to other tokens based
*    on the given locale.
*
*    using `en-US` locale: `P` => `MM/dd/yyyy`
*    using `en-US` locale: `p` => `hh:mm a`
*    using `pt-BR` locale: `P` => `dd/MM/yyyy`
*    using `pt-BR` locale: `p` => `HH:mm`
*
* Values will be assigned to the date in the descending order of its unit's priority.
* Units of an equal priority overwrite each other in the order of appearance.
*
* If no values of higher priority are parsed (e.g. when parsing string 'January 1st' without a year),
* the values will be taken from 3rd argument `referenceDate` which works as a context of parsing.
*
* `referenceDate` must be passed for correct work of the function.
* If you're not sure which `referenceDate` to supply, create a new instance of Date:
* `parse('02/11/2014', 'MM/dd/yyyy', new Date())`
* In this case parsing will be done in the context of the current date.
* If `referenceDate` is `Invalid Date` or a value not convertible to valid `Date`,
* then `Invalid Date` will be returned.
*
* The result may vary by locale.
*
* If `formatString` matches with `dateString` but does not provides tokens, `referenceDate` will be returned.
*
* If parsing failed, `Invalid Date` will be returned.
* Invalid Date is a Date, whose time value is NaN.
* Time value of Date: http://es5.github.io/#x15.9.1.1
*
* @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
* @typeParam ResultDate - The result `Date` type, it is the type returned from the context function if it is passed, or inferred from the arguments.
*
* @param dateStr - The string to parse
* @param formatStr - The string of tokens
* @param referenceDate - defines values missing from the parsed dateString
* @param options - An object with options.
*   see: https://github.com/date-fns/date-fns/blob/master/docs/unicodeTokens.md
*   see: https://github.com/date-fns/date-fns/blob/master/docs/unicodeTokens.md
*
* @returns The parsed date
*
* @throws `options.locale` must contain `match` property
* @throws use `yyyy` instead of `YYYY` for formatting years using [format provided] to the input [input provided]; see: https://github.com/date-fns/date-fns/blob/master/docs/unicodeTokens.md
* @throws use `yy` instead of `YY` for formatting years using [format provided] to the input [input provided]; see: https://github.com/date-fns/date-fns/blob/master/docs/unicodeTokens.md
* @throws use `d` instead of `D` for formatting days of the month using [format provided] to the input [input provided]; see: https://github.com/date-fns/date-fns/blob/master/docs/unicodeTokens.md
* @throws use `dd` instead of `DD` for formatting days of the month using [format provided] to the input [input provided]; see: https://github.com/date-fns/date-fns/blob/master/docs/unicodeTokens.md
* @throws format string contains an unescaped latin alphabet character
*
* @example
* // Parse 11 February 2014 from middle-endian format:
* var result = parse('02/11/2014', 'MM/dd/yyyy', new Date())
* //=> Tue Feb 11 2014 00:00:00
*
* @example
* // Parse 28th of February in Esperanto locale in the context of 2010 year:
* import eo from 'date-fns/locale/eo'
* var result = parse('28-a de februaro', "do 'de' MMMM", new Date(2010, 0, 1), {
*   locale: eo
* })
* //=> Sun Feb 28 2010 00:00:00
*/
function parse(dateStr, formatStr, referenceDate, options) {
	const invalidDate = () => constructFrom(options?.in || referenceDate, NaN);
	const defaultOptions = getDefaultOptions();
	const locale = options?.locale ?? defaultOptions.locale ?? enUS;
	const firstWeekContainsDate = options?.firstWeekContainsDate ?? options?.locale?.options?.firstWeekContainsDate ?? defaultOptions.firstWeekContainsDate ?? defaultOptions.locale?.options?.firstWeekContainsDate ?? 1;
	const weekStartsOn = options?.weekStartsOn ?? options?.locale?.options?.weekStartsOn ?? defaultOptions.weekStartsOn ?? defaultOptions.locale?.options?.weekStartsOn ?? 0;
	if (!formatStr) return dateStr ? invalidDate() : toDate(referenceDate, options?.in);
	const subFnOptions = {
		firstWeekContainsDate,
		weekStartsOn,
		locale
	};
	const setters = [new DateTimezoneSetter(options?.in, referenceDate)];
	const tokens = formatStr.match(longFormattingTokensRegExp).map((substring) => {
		const firstCharacter = substring[0];
		if (firstCharacter in longFormatters) {
			const longFormatter = longFormatters[firstCharacter];
			return longFormatter(substring, locale.formatLong);
		}
		return substring;
	}).join("").match(formattingTokensRegExp);
	const usedTokens = [];
	for (let token of tokens) {
		if (!options?.useAdditionalWeekYearTokens && isProtectedWeekYearToken(token)) warnOrThrowProtectedError(token, formatStr, dateStr);
		if (!options?.useAdditionalDayOfYearTokens && isProtectedDayOfYearToken(token)) warnOrThrowProtectedError(token, formatStr, dateStr);
		const firstCharacter = token[0];
		const parser = parsers[firstCharacter];
		if (parser) {
			const { incompatibleTokens } = parser;
			if (Array.isArray(incompatibleTokens)) {
				const incompatibleToken = usedTokens.find((usedToken) => incompatibleTokens.includes(usedToken.token) || usedToken.token === firstCharacter);
				if (incompatibleToken) throw new RangeError(`The format string mustn't contain \`${incompatibleToken.fullToken}\` and \`${token}\` at the same time`);
			} else if (parser.incompatibleTokens === "*" && usedTokens.length > 0) throw new RangeError(`The format string mustn't contain \`${token}\` and any other token at the same time`);
			usedTokens.push({
				token: firstCharacter,
				fullToken: token
			});
			const parseResult = parser.run(dateStr, token, locale.match, subFnOptions);
			if (!parseResult) return invalidDate();
			setters.push(parseResult.setter);
			dateStr = parseResult.rest;
		} else {
			if (firstCharacter.match(unescapedLatinCharacterRegExp)) throw new RangeError("Format string contains an unescaped latin alphabet character `" + firstCharacter + "`");
			if (token === "''") token = "'";
			else if (firstCharacter === "'") token = cleanEscapedString(token);
			if (dateStr.indexOf(token) === 0) dateStr = dateStr.slice(token.length);
			else return invalidDate();
		}
	}
	if (dateStr.length > 0 && notWhitespaceRegExp.test(dateStr)) return invalidDate();
	const uniquePrioritySetters = setters.map((setter) => setter.priority).sort((a, b) => b - a).filter((priority, index, array) => array.indexOf(priority) === index).map((priority) => setters.filter((setter) => setter.priority === priority).sort((a, b) => b.subPriority - a.subPriority)).map((setterArray) => setterArray[0]);
	let date = toDate(referenceDate, options?.in);
	if (isNaN(+date)) return invalidDate();
	const flags = {};
	for (const setter of uniquePrioritySetters) {
		if (!setter.validate(date, subFnOptions)) return invalidDate();
		const result = setter.set(date, flags, subFnOptions);
		if (Array.isArray(result)) {
			date = result[0];
			Object.assign(flags, result[1]);
		} else date = result;
	}
	return date;
}
function cleanEscapedString(input) {
	return input.match(escapedStringRegExp)[1].replace(doubleQuoteRegExp, "'");
}
// ../DnD helper/node_modules/date-fns/isSameQuarter.js
/**
* The {@link isSameQuarter} function options.
*/
/**
* @name isSameQuarter
* @category Quarter Helpers
* @summary Are the given dates in the same quarter (and year)?
*
* @description
* Are the given dates in the same quarter (and year)?
*
* @param laterDate - The first date to check
* @param earlierDate - The second date to check
* @param options - An object with options
*
* @returns The dates are in the same quarter (and year)
*
* @example
* // Are 1 January 2014 and 8 March 2014 in the same quarter?
* const result = isSameQuarter(new Date(2014, 0, 1), new Date(2014, 2, 8))
* //=> true
*
* @example
* // Are 1 January 2014 and 1 January 2015 in the same quarter?
* const result = isSameQuarter(new Date(2014, 0, 1), new Date(2015, 0, 1))
* //=> false
*/
function isSameQuarter(laterDate, earlierDate, options) {
	const [dateLeft_, dateRight_] = normalizeDates(options?.in, laterDate, earlierDate);
	return +startOfQuarter(dateLeft_) === +startOfQuarter(dateRight_);
}
// ../DnD helper/node_modules/date-fns/subDays.js
/**
* The {@link subDays} function options.
*/
/**
* @name subDays
* @category Day Helpers
* @summary Subtract the specified number of days from the given date.
*
* @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
* @typeParam ResultDate - The result `Date` type, it is the type returned from the context function if it is passed, or inferred from the arguments.
*
* @param date - The date to be changed
* @param amount - The amount of days to be subtracted.
* @param options - An object with options
*
* @returns The new date with the days subtracted
*
* @example
* // Subtract 10 days from 1 September 2014:
* const result = subDays(new Date(2014, 8, 1), 10)
* //=> Fri Aug 22 2014 00:00:00
*/
function subDays(date, amount, options) {
	return addDays(date, -amount, options);
}
// ../DnD helper/node_modules/date-fns/roundToNearestMinutes.js
/**
* The {@link roundToNearestMinutes} function options.
*/
/**
* @name roundToNearestMinutes
* @category Minute Helpers
* @summary Rounds the given date to the nearest minute
*
* @description
* Rounds the given date to the nearest minute (or number of minutes).
* Rounds up when the given date is exactly between the nearest round minutes.
*
* @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
* @typeParam ResultDate - The result `Date` type, it is the type returned from the context function if it is passed, or inferred from the arguments.
*
* @param date - The date to round
* @param options - An object with options.
*
* @returns The new date rounded to the closest minute
*
* @example
* // Round 10 July 2014 12:12:34 to nearest minute:
* const result = roundToNearestMinutes(new Date(2014, 6, 10, 12, 12, 34))
* //=> Thu Jul 10 2014 12:13:00
*
* @example
* // Round 10 July 2014 12:12:34 to nearest quarter hour:
* const result = roundToNearestMinutes(new Date(2014, 6, 10, 12, 12, 34), { nearestTo: 15 })
* //=> Thu Jul 10 2014 12:15:00
*
* @example
* // Floor (rounds down) 10 July 2014 12:12:34 to nearest minute:
* const result = roundToNearestMinutes(new Date(2014, 6, 10, 12, 12, 34), { roundingMethod: 'floor' })
* //=> Thu Jul 10 2014 12:12:00
*
* @example
* // Ceil (rounds up) 10 July 2014 12:12:34 to nearest half hour:
* const result = roundToNearestMinutes(new Date(2014, 6, 10, 12, 12, 34), { roundingMethod: 'ceil', nearestTo: 30 })
* //=> Thu Jul 10 2014 12:30:00
*/
function roundToNearestMinutes(date, options) {
	const nearestTo = options?.nearestTo ?? 1;
	if (nearestTo < 1 || nearestTo > 30) return constructFrom(date, NaN);
	const date_ = toDate(date, options?.in);
	const fractionalSeconds = date_.getSeconds() / 60;
	const fractionalMilliseconds = date_.getMilliseconds() / 1e3 / 60;
	const minutes = date_.getMinutes() + fractionalSeconds + fractionalMilliseconds;
	const roundedMinutes = getRoundingMethod(options?.roundingMethod ?? "round")(minutes / nearestTo) * nearestTo;
	date_.setMinutes(roundedMinutes, 0, 0);
	return date_;
}
// ../DnD helper/node_modules/date-fns/setMonth.js
/**
* The {@link setMonth} function options.
*/
/**
* @name setMonth
* @category Month Helpers
* @summary Set the month to the given date.
*
* @description
* Set the month to the given date.
*
* @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
* @typeParam ResultDate - The result `Date` type, it is the type returned from the context function if it is passed, or inferred from the arguments.
*
* @param date - The date to be changed
* @param month - The month index to set (0-11)
* @param options - The options
*
* @returns The new date with the month set
*
* @example
* // Set February to 1 September 2014:
* const result = setMonth(new Date(2014, 8, 1), 1)
* //=> Sat Feb 01 2014 00:00:00
*/
function setMonth(date, month, options) {
	const _date = toDate(date, options?.in);
	const year = _date.getFullYear();
	const day = _date.getDate();
	const midMonth = constructFrom(options?.in || date, 0);
	midMonth.setFullYear(year, month, 15);
	midMonth.setHours(0, 0, 0, 0);
	const daysInMonth = getDaysInMonth(midMonth);
	_date.setMonth(month, Math.min(day, daysInMonth));
	return _date;
}
// ../DnD helper/node_modules/date-fns/set.js
/**
* The {@link set} function options.
*/
/**
* @name set
* @category Common Helpers
* @summary Set date values to a given date.
*
* @description
* Set date values to a given date.
*
* Sets time values to date from object `values`.
* A value is not set if it is undefined or null or doesn't exist in `values`.
*
* Note about bundle size: `set` does not internally use `setX` functions from date-fns but instead opts
* to use native `Date#setX` methods. If you use this function, you may not want to include the
* other `setX` functions that date-fns provides if you are concerned about the bundle size.
*
* @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
* @typeParam ResultDate - The result `Date` type, it is the type returned from the context function if it is passed, or inferred from the arguments.
*
* @param date - The date to be changed
* @param values - The date values to be set
* @param options - The options
*
* @returns The new date with options set
*
* @example
* // Transform 1 September 2014 into 20 October 2015 in a single line:
* const result = set(new Date(2014, 8, 20), { year: 2015, month: 9, date: 20 })
* //=> Tue Oct 20 2015 00:00:00
*
* @example
* // Set 12 PM to 1 September 2014 01:23:45 to 1 September 2014 12:00:00:
* const result = set(new Date(2014, 8, 1, 1, 23, 45), { hours: 12 })
* //=> Mon Sep 01 2014 12:23:45
*/
function set(date, values, options) {
	let _date = toDate(date, options?.in);
	if (isNaN(+_date)) return constructFrom(options?.in || date, NaN);
	if (values.year != null) _date.setFullYear(values.year);
	if (values.month != null) _date = setMonth(_date, values.month);
	if (values.date != null) _date.setDate(values.date);
	if (values.hours != null) _date.setHours(values.hours);
	if (values.minutes != null) _date.setMinutes(values.minutes);
	if (values.seconds != null) _date.setSeconds(values.seconds);
	if (values.milliseconds != null) _date.setMilliseconds(values.milliseconds);
	return _date;
}
// ../DnD helper/node_modules/date-fns/setMilliseconds.js
/**
* The {@link setMilliseconds} function options.
*/
/**
* @name setMilliseconds
* @category Millisecond Helpers
* @summary Set the milliseconds to the given date.
*
* @description
* Set the milliseconds to the given date.
*
* @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
* @typeParam ResultDate - The result `Date` type, it is the type returned from the context function if it is passed, or inferred from the arguments.
*
* @param date - The date to be changed
* @param milliseconds - The milliseconds of the new date
* @param options - The options
*
* @returns The new date with the milliseconds set
*
* @example
* // Set 300 milliseconds to 1 September 2014 11:30:40.500:
* const result = setMilliseconds(new Date(2014, 8, 1, 11, 30, 40, 500), 300)
* //=> Mon Sep 01 2014 11:30:40.300
*/
function setMilliseconds(date, milliseconds, options) {
	const _date = toDate(date, options?.in);
	_date.setMilliseconds(milliseconds);
	return _date;
}
// ../DnD helper/node_modules/date-fns/setSeconds.js
/**
* The {@link setSeconds} function options.
*/
/**
* @name setSeconds
* @category Second Helpers
* @summary Set the seconds to the given date, with context support.
*
* @description
* Set the seconds to the given date, with an optional context for time zone specification.
*
* @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
* @typeParam ResultDate - The result `Date` type, it is the type returned from the context function if it is passed, or inferred from the arguments.
*
* @param date - The date to be changed
* @param seconds - The seconds of the new date
* @param options - An object with options
*
* @returns The new date with the seconds set
*
* @example
* // Set 45 seconds to 1 September 2014 11:30:40:
* const result = setSeconds(new Date(2014, 8, 1, 11, 30, 40), 45)
* //=> Mon Sep 01 2014 11:30:45
*/
function setSeconds(date, seconds, options) {
	const _date = toDate(date, options?.in);
	_date.setSeconds(seconds);
	return _date;
}
// ../DnD helper/node_modules/date-fns/setYear.js
/**
* The {@link setYear} function options.
*/
/**
* @name setYear
* @category Year Helpers
* @summary Set the year to the given date.
*
* @description
* Set the year to the given date.
*
* @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
* @typeParam ResultDate - The result `Date` type, it is the type returned from the context function if it is passed, or inferred from the arguments.
*
* @param date - The date to be changed
* @param year - The year of the new date
* @param options - An object with options.
*
* @returns The new date with the year set
*
* @example
* // Set year 2013 to 1 September 2014:
* const result = setYear(new Date(2014, 8, 1), 2013)
* //=> Sun Sep 01 2013 00:00:00
*/
function setYear(date, year, options) {
	const date_ = toDate(date, options?.in);
	if (isNaN(+date_)) return constructFrom(options?.in || date, NaN);
	date_.setFullYear(year);
	return date_;
}
// ../DnD helper/node_modules/date-fns/subMonths.js
/**
* The subMonths function options.
*/
/**
* @name subMonths
* @category Month Helpers
* @summary Subtract the specified number of months from the given date.
*
* @description
* Subtract the specified number of months from the given date.
*
* @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
* @typeParam ResultDate - The result `Date` type, it is the type returned from the context function if it is passed, or inferred from the arguments.
*
* @param date - The date to be changed
* @param amount - The amount of months to be subtracted.
* @param options - An object with options
*
* @returns The new date with the months subtracted
*
* @example
* // Subtract 5 months from 1 February 2015:
* const result = subMonths(new Date(2015, 1, 1), 5)
* //=> Mon Sep 01 2014 00:00:00
*/
function subMonths(date, amount, options) {
	return addMonths(date, -amount, options);
}
// ../DnD helper/node_modules/date-fns/sub.js
/**
* The {@link sub} function options.
*/
/**
* @name sub
* @category Common Helpers
* @summary Subtract the specified years, months, weeks, days, hours, minutes and seconds from the given date.
*
* @description
* Subtract the specified years, months, weeks, days, hours, minutes and seconds from the given date.
*
* @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
* @typeParam ResultDate - The result `Date` type, it is the type returned from the context function if it is passed, or inferred from the arguments.
*
* @param date - The date to be changed
* @param duration - The object with years, months, weeks, days, hours, minutes and seconds to be subtracted
* @param options - An object with options
*
* | Key     | Description                        |
* |---------|------------------------------------|
* | years   | Amount of years to be subtracted   |
* | months  | Amount of months to be subtracted  |
* | weeks   | Amount of weeks to be subtracted   |
* | days    | Amount of days to be subtracted    |
* | hours   | Amount of hours to be subtracted   |
* | minutes | Amount of minutes to be subtracted |
* | seconds | Amount of seconds to be subtracted |
*
* All values default to 0
*
* @returns The new date with the seconds subtracted
*
* @example
* // Subtract the following duration from 15 June 2017 15:29:20
* const result = sub(new Date(2017, 5, 15, 15, 29, 20), {
*   years: 2,
*   months: 9,
*   weeks: 1,
*   days: 7,
*   hours: 5,
*   minutes: 9,
*   seconds: 30
* })
* //=> Mon Sep 1 2014 10:19:50
*/
function sub(date, duration, options) {
	const { years = 0, months = 0, weeks = 0, days = 0, hours = 0, minutes = 0, seconds = 0 } = duration;
	const withoutDays = subDays(subMonths(date, months + years * 12, options), days + weeks * 7, options);
	const msToSub = (seconds + (minutes + hours * 60) * 60) * 1e3;
	return constructFrom(options?.in || date, +withoutDays - msToSub);
}
// ../DnD helper/node_modules/date-fns/subYears.js
/**
* The {@link subYears} function options.
*/
/**
* @name subYears
* @category Year Helpers
* @summary Subtract the specified number of years from the given date.
*
* @description
* Subtract the specified number of years from the given date.
*
* @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
* @typeParam ResultDate - The result `Date` type, it is the type returned from the context function if it is passed, or inferred from the arguments.
*
* @param date - The date to be changed
* @param amount - The amount of years to be subtracted.
* @param options - An object with options
*
* @returns The new date with the years subtracted
*
* @example
* // Subtract 5 years from 1 September 2014:
* const result = subYears(new Date(2014, 8, 1), 5)
* //=> Tue Sep 01 2009 00:00:00
*/
function subYears(date, amount, options) {
	return addYears(date, -amount, options);
}
// ../DnD helper/node_modules/@date-fns/tz/tzName/index.js
/**
* Time zone name format.
*/
/**
* The function returns the time zone name for the given date in the specified
* time zone.
*
* It uses the `Intl.DateTimeFormat` API and by default outputs the time zone
* name in a long format, e.g. "Pacific Standard Time" or
* "Singapore Standard Time".
*
* It is possible to specify the format as the third argument using one of the following options
*
* - "short": e.g. "EDT" or "GMT+8".
* - "long": e.g. "Eastern Daylight Time".
* - "shortGeneric": e.g. "ET" or "Singapore Time".
* - "longGeneric": e.g. "Eastern Time" or "Singapore Standard Time".
*
* These options correspond to TR35 tokens `z..zzz`, `zzzz`, `v`, and `vvvv` respectively: https://www.unicode.org/reports/tr35/tr35-dates.html#dfst-zone
*
* @param timeZone - Time zone name (IANA or UTC offset)
* @param date - Date object to get the time zone name for
* @param format - Optional format of the time zone name. Defaults to "long". Can be "short", "long", "shortGeneric", or "longGeneric".
*
* @returns Time zone name (e.g. "Singapore Standard Time")
*/
function tzName(timeZone, date, format = "long") {
	return new Intl.DateTimeFormat("en-US", {
		hour: "numeric",
		timeZone,
		timeZoneName: format
	}).format(date).split(/\s/g).slice(2).join(" ");
}
// ../DnD helper/node_modules/@date-fns/tz/tzOffset/index.js
var offsetFormatCache = {};
var offsetCache = {};
/**
* The function returns UTC offset in minutes for the given date in specified
* time zone.
*
* Unlike `Date.prototype.getTimezoneOffset`, this function returns the value
* mirrored to the sign of the offset in the time zone. For Asia/Singapore
* (UTC+8), `tzOffset` returns `480`, while `getTimezoneOffset` returns `-480`.
*
* It uses `Intl.DateTimeFormat` internally to access otherwise unavailable
* runtime's time zone data, and falls back to basic manual parsing if Intl API
* is not supported (e.g., older Node.js versions, React Native's Hermes, etc.).
*
* @param timeZone - Time zone name (IANA or UTC offset).
* @param date - Date to check the offset for.
*
* @returns UTC offset in minutes (e.g., `480` for date in UTC+8).
*/
function tzOffset(timeZone, date) {
	try {
		const offsetStr = (offsetFormatCache[timeZone] ||= new Intl.DateTimeFormat("en-US", {
			timeZone,
			timeZoneName: "longOffset"
		}).format)(date).split("GMT")[1];
		if (offsetStr in offsetCache) return offsetCache[offsetStr];
		return calcOffset(offsetStr, offsetStr.split(":"));
	} catch {
		if (timeZone in offsetCache) return offsetCache[timeZone];
		const captures = timeZone?.match(offsetRe);
		if (captures) return calcOffset(timeZone, captures.slice(1));
		return NaN;
	}
}
var offsetRe = /([+-]\d\d):?(\d\d)?/;
function calcOffset(cacheStr, values) {
	const hours = +(values[0] || 0);
	const minutes = +(values[1] || 0);
	const seconds = +(values[2] || 0) / 60;
	return offsetCache[cacheStr] = hours * 60 + minutes > 0 ? hours * 60 + minutes + seconds : hours * 60 - minutes - seconds;
}
// ../DnD helper/node_modules/@date-fns/tz/date/mini.js
var TZDateMini = class TZDateMini extends Date {
	constructor(...args) {
		super();
		if (args.length > 1 && typeof args[args.length - 1] === "string") this.timeZone = args.pop();
		this.internal = /* @__PURE__ */ new Date();
		if (isNaN(tzOffset(this.timeZone, this))) this.setTime(NaN);
		else if (!args.length) this.setTime(Date.now());
		else if (typeof args[0] === "number" && (args.length === 1 || args.length === 2 && typeof args[1] !== "number")) this.setTime(args[0]);
		else if (typeof args[0] === "string") this.setTime(+new Date(args[0]));
		else if (args[0] instanceof Date) this.setTime(+args[0]);
		else {
			this.setTime(+new Date(...args));
			adjustToSystemTZ(this, args);
		}
	}
	static tz(tz, ...args) {
		return args.length ? new TZDateMini(...args, tz) : new TZDateMini(Date.now(), tz);
	}
	withTimeZone(timeZone) {
		return new TZDateMini(+this, timeZone);
	}
	getTimezoneOffset() {
		const offset = -tzOffset(this.timeZone, this);
		return offset > 0 ? Math.floor(offset) : Math.ceil(offset);
	}
	setTime(_time) {
		Date.prototype.setTime.apply(this, arguments);
		syncToInternal(this);
		return +this;
	}
	[Symbol.for("constructDateFrom")](date) {
		return new TZDateMini(+new Date(date), this.timeZone);
	}
};
var re = /^(get|set)(?!UTC)/;
Object.getOwnPropertyNames(Date.prototype).forEach((method) => {
	if (!re.test(method)) return;
	const utcMethod = method.replace(re, "$1UTC");
	if (!TZDateMini.prototype[utcMethod]) return;
	if (method.startsWith("get")) TZDateMini.prototype[method] = function() {
		return this.internal[utcMethod]();
	};
	else {
		TZDateMini.prototype[method] = function() {
			Date.prototype[utcMethod].apply(this.internal, arguments);
			syncFromInternal(this);
			return +this;
		};
		TZDateMini.prototype[utcMethod] = function() {
			Date.prototype[utcMethod].apply(this, arguments);
			syncToInternal(this);
			return +this;
		};
	}
});
/**
* @internal
* Function syncs time to internal date, applying the current time zone offset.
*
* @param {Date} date - `Date` to sync
*/
function syncToInternal(date) {
	date.internal.setTime(+date);
	date.internal.setUTCSeconds(date.internal.getUTCSeconds() - Math.round(-tzOffset(date.timeZone, date) * 60));
}
/**
* @internal
* Function syncs internal wall-clock fields into the external date.
*
* @param {Date} date - The date to sync
*/
function syncFromInternal(date) {
	Date.prototype.setFullYear.call(date, date.internal.getUTCFullYear(), date.internal.getUTCMonth(), date.internal.getUTCDate());
	Date.prototype.setHours.call(date, date.internal.getUTCHours(), date.internal.getUTCMinutes(), date.internal.getUTCSeconds(), date.internal.getUTCMilliseconds());
	adjustToSystemTZ(date);
}
/**
* @internal
* Function adjusts the date to the system time zone. It uses the time zone
* differences to calculate the offset and adjust the date.
*
* We use it when constructing `TZDate` and syncing the external date from
* the internal one.
*
* @param {TZDate} date - `TZDate` to adjust.
*/
function adjustToSystemTZ(date, constructorArgs) {
	const expectedInternalTime = Array.isArray(constructorArgs) ? constructorArgsToInternalTime(constructorArgs) : +date.internal;
	const offsetWithSeconds = tzOffset(date.timeZone, date);
	const offset = offsetWithSeconds > 0 ? Math.floor(offsetWithSeconds) : Math.ceil(offsetWithSeconds);
	const prevHour = /* @__PURE__ */ new Date(+date);
	prevHour.setUTCHours(prevHour.getUTCHours() - 1);
	const systemOffset = -(/* @__PURE__ */ new Date(+date)).getTimezoneOffset();
	const prevHourSystemOffset = -(/* @__PURE__ */ new Date(+prevHour)).getTimezoneOffset();
	const systemDSTChange = systemOffset - prevHourSystemOffset;
	let systemOffsetForDiff = systemOffset;
	if (systemDSTChange && systemOffset !== offset) {
		if (Date.prototype.getHours.apply(date) !== (Array.isArray(constructorArgs) ? constructorArgs[3] || 0 : date.internal.getUTCHours())) {
			const testDate = /* @__PURE__ */ new Date(+date);
			const testOffsetDiff = systemOffset - offset;
			if (testOffsetDiff) testDate.setUTCMinutes(testDate.getUTCMinutes() + testOffsetDiff);
			const testOffsetWithSeconds = tzOffset(date.timeZone, testDate);
			if ((testOffsetWithSeconds > 0 ? Math.floor(testOffsetWithSeconds) : Math.ceil(testOffsetWithSeconds)) === offset) systemOffsetForDiff = prevHourSystemOffset;
		}
	}
	const offsetDiff = systemOffsetForDiff - offset;
	if (offsetDiff) Date.prototype.setUTCMinutes.call(date, Date.prototype.getUTCMinutes.call(date) + offsetDiff);
	const systemDate = /* @__PURE__ */ new Date(+date);
	systemDate.setUTCSeconds(0);
	const systemSecondsOffset = systemOffset > 0 ? systemDate.getSeconds() : (systemDate.getSeconds() - 60) % 60;
	const secondsOffset = Math.round(-(tzOffset(date.timeZone, date) * 60)) % 60;
	if (secondsOffset || systemSecondsOffset) Date.prototype.setUTCSeconds.call(date, Date.prototype.getUTCSeconds.call(date) + secondsOffset + systemSecondsOffset);
	const postOffsetWithSeconds = tzOffset(date.timeZone, date);
	const postOffset = postOffsetWithSeconds > 0 ? Math.floor(postOffsetWithSeconds) : Math.ceil(postOffsetWithSeconds);
	const postOffsetDiff = -(/* @__PURE__ */ new Date(+date)).getTimezoneOffset() - postOffset;
	const offsetChanged = postOffset !== offset;
	const postDiff = postOffsetDiff - offsetDiff;
	const targetDSTShift = postOffset - offset;
	const postOffsetCandidate = expectedInternalTime - postOffset * 60 * 1e3;
	const normalizedTargetDSTGap = targetDSTShift > 0 && targetInternalTime(date) - expectedInternalTime === targetDSTShift * 60 * 1e3 && targetInternalTime(date, postOffsetCandidate) !== expectedInternalTime;
	if (offsetChanged && postDiff && !normalizedTargetDSTGap) {
		Date.prototype.setUTCMinutes.call(date, Date.prototype.getUTCMinutes.call(date) + postDiff);
		const newOffsetWithSeconds = tzOffset(date.timeZone, date);
		const offsetChange = postOffset - (newOffsetWithSeconds > 0 ? Math.floor(newOffsetWithSeconds) : Math.ceil(newOffsetWithSeconds));
		if (offsetChange && postDiff < 0) Date.prototype.setUTCMinutes.call(date, Date.prototype.getUTCMinutes.call(date) + offsetChange);
	}
	syncToInternal(date);
	const drift = (constructorArgs ? expectedInternalTime : expectedInternalTime + secondsOffset * 1e3) - +date.internal;
	if (drift && Math.abs(drift) < 18e5) {
		Date.prototype.setTime.call(date, +date + drift);
		syncToInternal(date);
	}
}
function constructorArgsToInternalTime(args) {
	return Date.UTC(args[0], args.length > 1 ? args[1] : 0, args.length > 2 ? args[2] : 1, ...args.slice(3));
}
function targetInternalTime(date, time) {
	const internal = new Date(time ?? +date);
	internal.setUTCSeconds(internal.getUTCSeconds() - Math.round(-tzOffset(date.timeZone, internal) * 60));
	return +internal;
}
// ../DnD helper/node_modules/@date-fns/tz/date/index.js
var TZDate = class TZDate extends TZDateMini {
	static tz(tz, ...args) {
		return args.length ? new TZDate(...args, tz) : new TZDate(Date.now(), tz);
	}
	toISOString() {
		const [sign, hours, minutes] = this.tzComponents();
		const tz = `${sign}${hours}:${minutes}`;
		return this.internal.toISOString().slice(0, -1) + tz;
	}
	toString() {
		return `${this.toDateString()} ${this.toTimeString()}`;
	}
	toDateString() {
		const [day, date, month, year] = this.internal.toUTCString().split(" ");
		return `${day?.slice(0, -1)} ${month} ${date} ${year}`;
	}
	toTimeString() {
		const time = this.internal.toUTCString().split(" ")[4];
		const [sign, hours, minutes] = this.tzComponents();
		return `${time} GMT${sign}${hours}${minutes} (${tzName(this.timeZone, this)})`;
	}
	toLocaleString(locales, options) {
		return Date.prototype.toLocaleString.call(this, locales, {
			...options,
			timeZone: options?.timeZone || this.timeZone
		});
	}
	toLocaleDateString(locales, options) {
		return Date.prototype.toLocaleDateString.call(this, locales, {
			...options,
			timeZone: options?.timeZone || this.timeZone
		});
	}
	toLocaleTimeString(locales, options) {
		return Date.prototype.toLocaleTimeString.call(this, locales, {
			...options,
			timeZone: options?.timeZone || this.timeZone
		});
	}
	tzComponents() {
		const offset = this.getTimezoneOffset();
		return [
			offset > 0 ? "-" : "+",
			String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0"),
			String(Math.abs(offset) % 60).padStart(2, "0")
		];
	}
	withTimeZone(timeZone) {
		return new TZDate(+this, timeZone);
	}
	[Symbol.for("constructDateFrom")](date) {
		return new TZDate(+new Date(date), this.timeZone);
	}
};
// ../DnD helper/node_modules/@vuepic/vue-datepicker/dist/vue-datepicker.js
function Ke() {
	return h("svg", {
		xmlns: "http://www.w3.org/2000/svg",
		viewBox: "0 0 32 32",
		fill: "currentColor",
		"aria-hidden": "true",
		class: "dp--icon",
		role: "img"
	}, [
		h("path", { d: "M29.333 8c0-2.208-1.792-4-4-4h-18.667c-2.208 0-4 1.792-4 4v18.667c0 2.208 1.792 4 4 4h18.667c2.208 0 4-1.792 4-4v-18.667zM26.667 8v18.667c0 0.736-0.597 1.333-1.333 1.333 0 0-18.667 0-18.667 0-0.736 0-1.333-0.597-1.333-1.333 0 0 0-18.667 0-18.667 0-0.736 0.597-1.333 1.333-1.333 0 0 18.667 0 18.667 0 0.736 0 1.333 0.597 1.333 1.333z" }),
		h("path", { d: "M20 2.667v5.333c0 0.736 0.597 1.333 1.333 1.333s1.333-0.597 1.333-1.333v-5.333c0-0.736-0.597-1.333-1.333-1.333s-1.333 0.597-1.333 1.333z" }),
		h("path", { d: "M9.333 2.667v5.333c0 0.736 0.597 1.333 1.333 1.333s1.333-0.597 1.333-1.333v-5.333c0-0.736-0.597-1.333-1.333-1.333s-1.333 0.597-1.333 1.333z" }),
		h("path", { d: "M4 14.667h24c0.736 0 1.333-0.597 1.333-1.333s-0.597-1.333-1.333-1.333h-24c-0.736 0-1.333 0.597-1.333 1.333s0.597 1.333 1.333 1.333z" })
	]);
}
function qe() {
	return h("svg", {
		xmlns: "http://www.w3.org/2000/svg",
		viewBox: "0 0 32 32",
		fill: "currentColor",
		"aria-hidden": "true",
		class: "dp--icon",
		role: "img"
	}, [h("path", { d: "M23.057 7.057l-16 16c-0.52 0.52-0.52 1.365 0 1.885s1.365 0.52 1.885 0l16-16c0.52-0.52 0.52-1.365 0-1.885s-1.365-0.52-1.885 0z" }), h("path", { d: "M7.057 8.943l16 16c0.52 0.52 1.365 0.52 1.885 0s0.52-1.365 0-1.885l-16-16c-0.52-0.52-1.365-0.52-1.885 0s-0.52 1.365 0 1.885z" })]);
}
function Je() {
	return h("svg", {
		xmlns: "http://www.w3.org/2000/svg",
		viewBox: "0 0 32 32",
		fill: "currentColor",
		"aria-hidden": "true",
		class: "dp--icon",
		role: "img"
	}, [h("path", { d: "M20.943 23.057l-7.057-7.057c0 0 7.057-7.057 7.057-7.057 0.52-0.52 0.52-1.365 0-1.885s-1.365-0.52-1.885 0l-8 8c-0.521 0.521-0.521 1.365 0 1.885l8 8c0.52 0.52 1.365 0.52 1.885 0s0.52-1.365 0-1.885z" })]);
}
function Ye() {
	return h("svg", {
		xmlns: "http://www.w3.org/2000/svg",
		viewBox: "0 0 32 32",
		fill: "currentColor",
		"aria-hidden": "true",
		class: "dp--icon",
		role: "img"
	}, [h("path", { d: "M12.943 24.943l8-8c0.521-0.521 0.521-1.365 0-1.885l-8-8c-0.52-0.52-1.365-0.52-1.885 0s-0.52 1.365 0 1.885l7.057 7.057c0 0-7.057 7.057-7.057 7.057-0.52 0.52-0.52 1.365 0 1.885s1.365 0.52 1.885 0z" })]);
}
function Xe() {
	return h("svg", {
		xmlns: "http://www.w3.org/2000/svg",
		viewBox: "0 0 32 32",
		fill: "currentColor",
		"aria-hidden": "true",
		class: "dp--icon",
		role: "img"
	}, [h("path", { d: "M16 1.333c-8.095 0-14.667 6.572-14.667 14.667s6.572 14.667 14.667 14.667c8.095 0 14.667-6.572 14.667-14.667s-6.572-14.667-14.667-14.667zM16 4c6.623 0 12 5.377 12 12s-5.377 12-12 12c-6.623 0-12-5.377-12-12s5.377-12 12-12z" }), h("path", { d: "M14.667 8v8c0 0.505 0.285 0.967 0.737 1.193l5.333 2.667c0.658 0.329 1.46 0.062 1.789-0.596s0.062-1.46-0.596-1.789l-4.596-2.298c0 0 0-7.176 0-7.176 0-0.736-0.597-1.333-1.333-1.333s-1.333 0.597-1.333 1.333z" })]);
}
function Ze() {
	return h("svg", {
		xmlns: "http://www.w3.org/2000/svg",
		viewBox: "0 0 32 32",
		fill: "currentColor",
		"aria-hidden": "true",
		class: "dp--icon",
		role: "img"
	}, [h("path", { d: "M24.943 19.057l-8-8c-0.521-0.521-1.365-0.521-1.885 0l-8 8c-0.52 0.52-0.52 1.365 0 1.885s1.365 0.52 1.885 0l7.057-7.057c0 0 7.057 7.057 7.057 7.057 0.52 0.52 1.365 0.52 1.885 0s0.52-1.365 0-1.885z" })]);
}
function Qe() {
	return h("svg", {
		xmlns: "http://www.w3.org/2000/svg",
		viewBox: "0 0 32 32",
		fill: "currentColor",
		"aria-hidden": "true",
		class: "dp--icon",
		role: "img"
	}, [h("path", { d: "M7.057 12.943l8 8c0.521 0.521 1.365 0.521 1.885 0l8-8c0.52-0.52 0.52-1.365 0-1.885s-1.365-0.52-1.885 0l-7.057 7.057c0 0-7.057-7.057-7.057-7.057-0.52-0.52-1.365-0.52-1.885 0s-0.52 1.365 0 1.885z" })]);
}
var $e = Symbol("ContextKey");
var et = (e, t) => {
	let { setTimeModelValue: n } = Wt(), i = Ut(e), a = ref(null), o = reactive({
		menuFocused: !1,
		shiftKeyInMenu: !1,
		isInputFocused: !1,
		isTextInputDate: !1,
		arrowNavigationLevel: 0
	}), s = i.getDate(/* @__PURE__ */ new Date()), c = ref(""), l = ref([{
		month: getMonth(s),
		year: getYear(s)
	}]), u = reactive({
		hours: 0,
		minutes: 0,
		seconds: 0
	});
	n(u, null, s, i.range.value.enabled);
	let d = computed({
		get: () => a.value,
		set: (e) => {
			a.value = e;
		}
	}), f = computed(() => (e) => l.value[e] ? l.value[e].month : 0), p = computed(() => (e) => l.value[e] ? l.value[e].year : 0);
	provide($e, {
		rootProps: e,
		defaults: i,
		modelValue: d,
		state: readonly(o),
		rootEmit: t,
		calendars: l,
		month: f,
		year: p,
		time: u,
		today: s,
		inputValue: c,
		setState: (e, t) => {
			o[e] = t;
		},
		updateTime: () => {
			n(u, d.value, s, i.range.value.enabled);
		},
		getDate: i.getDate,
		getDateFromParts: i.getDateFromParts
	});
};
var tt = /* @__PURE__ */ function(e) {
	return e.month = "month", e.year = "year", e;
}({});
var nt = /* @__PURE__ */ function(e) {
	return e.header = "header", e.calendar = "calendar", e.timePicker = "timePicker", e;
}({});
var rt = /* @__PURE__ */ function(e) {
	return e.month = "month", e.year = "year", e.calendar = "calendar", e.time = "time", e.minutes = "minutes", e.hours = "hours", e.seconds = "seconds", e;
}({});
var it = [
	"timestamp",
	"date",
	"iso"
];
var at = /* @__PURE__ */ function(e) {
	return e.up = "up", e.down = "down", e.left = "left", e.right = "right", e;
}({});
var Q = /* @__PURE__ */ function(e) {
	return e.arrowUp = "ArrowUp", e.arrowDown = "ArrowDown", e.arrowLeft = "ArrowLeft", e.arrowRight = "ArrowRight", e.enter = "Enter", e.space = " ", e.esc = "Escape", e.tab = "Tab", e.home = "Home", e.end = "End", e.pageUp = "PageUp", e.pageDown = "PageDown", e;
}({});
var ot = /* @__PURE__ */ function(e) {
	return e.MONTH_AND_YEAR = "MM-yyyy", e.YEAR = "yyyy", e.DATE = "dd-MM-yyyy", e;
}({});
var st = /* @__PURE__ */ function(e) {
	return e[e.Sunday = 0] = "Sunday", e[e.Monday = 1] = "Monday", e[e.Tuesday = 2] = "Tuesday", e[e.Wednesday = 3] = "Wednesday", e[e.Thursday = 4] = "Thursday", e[e.Friday = 5] = "Friday", e[e.Saturday = 6] = "Saturday", e;
}({});
var ct = Symbol("FlowKey");
var lt = (e, t) => {
	let { rootEmit: n, rootProps: i, defaults: { timeConfig: a, flow: o } } = $(), s = ref(), c = reactive({
		[nt.timePicker]: !a.value.enableTimePicker || i.timePicker || i.monthPicker || i.quarterPicker,
		[nt.calendar]: !1,
		[nt.header]: !1
	}), l = computed(() => i.monthPicker || i.timePicker || i.quarterPicker), u = (e) => {
		let t = o.value?.steps.at(0);
		if (o.value?.steps?.length) {
			if (!e && l.value) return p(t);
			e && (c[e] = !0), Object.keys(c).filter((e) => !c[e]).length || p(t);
		}
	}, d = (e) => {
		if (o.value?.steps?.length && s.value === e) {
			let e = o.value.steps.at(o.value.steps.indexOf(s.value) + 1);
			e ? (s.value = e, n("flow-step", s.value), p()) : i.autoApply && nextTick().then(() => t("auto-apply"));
		}
	}, f = (t, n, ...r) => {
		s.value === t && e.value && e.value[n]?.(...r);
	}, p = (e) => {
		e && (s.value = e), f(rt.month, "toggleMonthPicker", !0), f(rt.year, "toggleYearPicker", !0), f(rt.calendar, "toggleTimePicker", !1), f(rt.time, "toggleTimePicker", !0), (s.value === rt.hours || s.value === rt.minutes || s.value === rt.seconds) && f(s.value, "toggleTimePicker", !0, s.value);
	};
	return provide(ct, {
		childMount: u,
		updateFlowStep: d,
		flowStep: readonly(s)
	}), { executeFlow: p };
};
var $ = () => {
	let e = inject($e);
	if (!e) throw Error("Can't use context");
	return e;
};
var ut = () => {
	let e = inject(ct);
	if (!e) throw Error("Can't use flow");
	return e;
};
var dt = () => {
	let { rootProps: e, state: t, defaults: { textInput: n } } = $(), i = computed(() => t.arrowNavigationLevel), a = ref(-1), o = ref(-1);
	watch(i, (e, t) => {
		b(n.value.enabled && n.value.selectOnFocus ? !0 : e === 0 && t > 0);
	});
	let s = ref([]), c = ref(/* @__PURE__ */ new Map()), l = () => {
		let e = Array.from(document.querySelectorAll(`[data-dp-action-element="${i.value}"]`)), t = /* @__PURE__ */ new Map(), n = /* @__PURE__ */ new Map();
		for (let r of e) {
			let e = r.getBoundingClientRect(), i = e.top, a = e.left;
			t.has(i) || t.set(i, []), t.get(i).push(r), n.set(r, {
				row: i,
				col: a
			});
		}
		s.value = Array.from(t.entries()).sort((e, t) => e[0] - t[0]).map(([e, t]) => u(t, n)), c.value = n;
	}, u = (e, t) => e.sort((e, n) => {
		let r = t.get(e), i = t.get(n);
		return r.col - i.col;
	}), d = (e, t) => {
		i.value === 0 && (a.value = e, o.value = t);
	}, f = (e) => {
		if (![
			Q.arrowUp,
			Q.arrowDown,
			Q.arrowLeft,
			Q.arrowRight
		].includes(e.key)) return;
		l(), e.preventDefault();
		let t = document.activeElement;
		if (!t?.hasAttribute("data-dp-action-element")) return;
		let n = -1, r = -1;
		for (let e = 0; e < s.value.length; e++) {
			let i = s.value[e].indexOf(t);
			if (i !== -1) {
				n = e, r = i;
				break;
			}
		}
		if (n !== -1) switch (e.key) {
			case Q.arrowLeft: return p(n, r);
			case Q.arrowRight: return m(n, r);
			case Q.arrowUp: return h(n, r);
			case Q.arrowDown: return g(n, r);
			default: return;
		}
	}, p = (e, t) => {
		if (t > 0) {
			let n = s.value[e][t - 1];
			d(e, t - 1), n && n.focus();
		}
	}, m = (e, t) => {
		if (t < s.value[e].length - 1) {
			let n = s.value[e][t + 1];
			d(e, t + 1), n && n.focus();
		}
	}, h = (e, t) => {
		if (e > 0) {
			let n = s.value[e - 1], r = Math.min(t, n.length - 1), i = n[r];
			d(e - 1, r), i && i.focus();
		}
	}, g = (e, t) => {
		if (e < s.value.length - 1) {
			let n = s.value[e + 1], r = Math.min(t, n.length - 1), i = n[r];
			d(e + 1, r), i && i.focus();
		}
	}, v = () => {
		nextTick().then(() => {
			l();
			let e = s.value[a.value]?.[o.value];
			e && y(e);
		});
	}, y = (e) => {
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				e.focus({ preventScroll: !0 });
			});
		});
	}, b = (e) => {
		if (e) return v();
		let t = document.querySelector(`[data-dp-element-active="${i.value}"]`);
		if (t && !e) y(t);
		else {
			let e = document.querySelector(`[data-dp-action-element="${i.value}"]`);
			e && y(e);
		}
	};
	onMounted(() => {
		e.arrowNavigation && (b(!1), document.addEventListener("keydown", f));
	}), onUnmounted(() => {
		e.arrowNavigation && document.removeEventListener("keydown", f);
	});
};
var ft = () => {
	let { checkPartialRangeValue: e, checkRangeEnabled: t, isValidDate: n } = ht(), { convertType: r, errorMapper: i } = Wt(), { getDate: a, rootEmit: o, state: s, rootProps: c, inputValue: l, defaults: { textInput: u, range: d, multiDates: f, timeConfig: p, formats: m, weekStart: h }, modelValue: g, updateTime: _ } = $(), { setTime: v, getWeekFromDate: y } = Gt(), { formatSelectedDate: b, formatForTextInput: x } = qt();
	watch(g, (e, t) => {
		o("internal-model-change", g.value), JSON.stringify(t ?? {}) !== JSON.stringify(e ?? {}) && _();
	}, { deep: !0 }), watch(d, (e, t) => {
		e.enabled !== t.enabled && (g.value = null, _());
	}), watch(() => m.value.input, () => {
		R();
	});
	let S = (e) => e ? c.modelType ? B(e) : {
		hours: getHours(e),
		minutes: getMinutes(e),
		seconds: p.value.enableSeconds ? getSeconds(e) : 0
	} : null, C = (e) => c.modelType ? B(e) : {
		month: getMonth(e),
		year: getYear(e)
	}, w = (n) => Array.isArray(n) ? f.value.enabled ? n.map((e) => T(e, setYear(a(), e))) : t(() => [setYear(a(), n[0]), n[1] ? setYear(a(), n[1]) : e(d.value.partialRange)], d.value.enabled) : setYear(a(), +n), T = (e, t) => (typeof e == "string" || typeof e == "number") && c.modelType ? z(e) : t, E = (e) => Array.isArray(e) ? [T(e[0], v(e[0])), T(e[1], v(e[1]))] : T(e, v(e)), D = (n) => {
		let r = set(a(), { date: 1 });
		return Array.isArray(n) ? f.value.enabled ? n.map((e) => T(e, set(r, {
			month: +e.month,
			year: +e.year
		}))) : t(() => [T(n[0], set(r, {
			month: +n[0].month,
			year: +n[0].year
		})), T(n[1], n[1] ? set(r, {
			month: +n[1].month,
			year: +n[1].year
		}) : e(d.value.partialRange))], d.value.enabled) : T(n, set(r, {
			month: +n.month,
			year: +n.year
		}));
	}, O = (e) => {
		if (Array.isArray(e)) return e.map((e) => z(e));
		throw Error(i.dateArr("multi-dates"));
	}, k = (e) => {
		if (Array.isArray(e) && d.value.enabled) {
			let t = e[0], n = e[1];
			return [a(Array.isArray(t) ? t[0] : null), Array.isArray(n) && n.length ? a(n[0]) : null];
		}
		return a(e[0]);
	}, A = (n) => c.modelAuto ? Array.isArray(n) ? [z(n[0]), z(n[1])] : c.autoApply ? [z(n)] : [z(n), null] : Array.isArray(n) ? t(() => n[1] ? [z(n[0]), n[1] ? z(n[1]) : e(d.value.partialRange)] : [z(n[0])], d.value.enabled) : z(n), j = () => {
		Array.isArray(g.value) && d.value.enabled && g.value.length === 1 && g.value.push(e(d.value.partialRange));
	}, M = () => {
		let t = g.value;
		return [B(t[0]), t[1] ? B(t[1]) : e(d.value.partialRange)];
	}, N = () => Array.isArray(g.value) ? g.value[1] ? M() : B(r(g.value[0])) : [], ee = () => (g.value || []).map((e) => B(e)), P = (e = !1) => (e || j(), c.modelAuto ? N() : f.value.enabled ? ee() : Array.isArray(g.value) ? t(() => M(), d.value.enabled) : B(r(g.value))), F = (e) => !e || Array.isArray(e) && !e.length ? null : c.timePicker ? E(r(e)) : c.monthPicker ? D(r(e)) : c.yearPicker ? w(r(e)) : f.value.enabled ? O(r(e)) : c.weekPicker ? k(r(e)) : A(r(e)), I = (e) => {
		if (s.isTextInputDate) return;
		let t = F(e);
		n(r(t)) ? (g.value = r(t), R()) : (g.value = null, l.value = "");
	}, te = () => g.value ? f.value.enabled ? g.value.map((e) => b(e)).join("; ") : u.value.enabled ? x() : b(g.value) : "", R = () => {
		l.value = te();
	}, z = (e) => c.modelType ? it.includes(c.modelType) ? a(e) : c.modelType === "format" && typeof m.value.input == "string" ? parse(e, m.value.input, a(), { locale: c.locale }) : parse(e, c.modelType, a(), { locale: c.locale }) : a(e), B = (e) => e ? c.modelType ? c.modelType === "timestamp" ? +e : c.modelType === "iso" ? e.toISOString() : c.modelType === "format" && typeof m.value.input == "string" ? b(e) : b(e, c.modelType) : e : null, V = (e) => {
		o("update:model-value", e);
	}, ne = (e) => Array.isArray(g.value) ? f.value.enabled ? g.value.map((t) => e(t)) : [e(g.value[0]), g.value[1] ? e(g.value[1]) : null] : e(r(g.value)), re = () => {
		if (Array.isArray(g.value)) {
			let e = y(g.value[0], h.value), t = g.value[1] ? y(g.value[1], h.value) : [];
			return [e.map((e) => a(e)), t.map((e) => a(e))];
		}
		return y(g.value, h.value).map((e) => a(e));
	}, H = (e) => V(r(ne(e))), U = () => o("update:model-value", re());
	return {
		checkBeforeEmit: () => g.value ? d.value.enabled ? d.value.partialRange ? g.value.length >= 1 : g.value.length === 2 : !!g.value : !1,
		parseExternalModelValue: I,
		formatInputValue: R,
		emitModelValue: () => (R(), c.monthPicker ? H(C) : c.timePicker ? H(S) : c.yearPicker ? H(getYear) : c.weekPicker ? U() : V(P()))
	};
};
var pt = () => {
	let { defaults: { transitions: e } } = $(), t = computed(() => (t) => e.value ? t ? e.value.open : e.value.close : ""), n = computed(() => (t) => e.value ? t ? e.value.menuAppearTop : e.value.menuAppearBottom : "");
	return {
		transitionName: t,
		showTransition: !!e.value,
		menuTransition: n
	};
};
var mt = (e) => {
	let { modelValue: t } = $();
	watch(t, (t, n) => {
		e && JSON.stringify(t ?? {}) !== JSON.stringify(n ?? {}) && e();
	}, { deep: !0 });
};
var ht = () => {
	let { defaults: { safeDates: e, range: t, multiDates: n, filters: i, timeConfig: a }, rootProps: o, getDate: s } = $(), { getMapKeyType: c, getMapDate: l, errorMapper: u, convertType: d } = Wt(), { isDateBefore: f, isDateAfter: p, isDateEqual: m, resetDate: h, getDaysInBetween: g, setTimeValue: _, getTimeObj: v, setTime: y } = Gt(), b = (t) => e.value.disabledDates ? typeof e.value.disabledDates == "function" ? e.value.disabledDates(s(t)) : !!l(t, e.value.disabledDates) : !1, x = (t) => e.value.maxDate ? o.yearPicker ? getYear(t) > getYear(e.value.maxDate) : p(t, e.value.maxDate) : !1, S = (t) => e.value.minDate ? o.yearPicker ? getYear(t) < getYear(e.value.minDate) : f(t, e.value.minDate) : !1, C = (e) => {
		if (!e) return !1;
		let t = x(e), n = S(e), r = b(e), a = i.value.months.map((e) => +e).includes(getMonth(e)), s = i.value.weekDays?.length ? i.value.weekDays.some((t) => +t === getDay(e)) : !1, c = O(e), l = getYear(e), u = l < +o.yearRange[0] || l > +o.yearRange[1];
		return !(t || n || r || a || u || s || c);
	}, w = (t, n) => f(...H(e.value.minDate, t, n)) || m(...H(e.value.minDate, t, n)), T = (t, n) => p(...H(e.value.maxDate, t, n)) || m(...H(e.value.maxDate, t, n)), E = (t, n, r) => {
		let i = !1;
		return e.value.maxDate && r && T(t, n) && (i = !0), e.value.minDate && !r && w(t, n) && (i = !0), i;
	}, D = (t, n, r, i) => {
		let a = !1;
		return i && (e.value.minDate || e.value.maxDate) ? e.value.minDate && e.value.maxDate ? a = E(t, n, r) : (e.value.minDate && w(t, n) || e.value.maxDate && T(t, n)) && (a = !0) : a = !0, a;
	}, O = (t) => Array.isArray(e.value.allowedDates) && !e.value.allowedDates.length ? !0 : e.value.allowedDates ? !l(t, e.value.allowedDates, c(o.monthPicker, o.yearPicker)) : !1, k = (e) => !C(e), A = (e) => t.value.noDisabledRange ? !eachDayOfInterval({
		start: e[0],
		end: e[1]
	}).some((e) => k(e)) : !0, j = (e) => {
		if (e) {
			let t = getYear(e);
			return t >= +o.yearRange[0] && t <= o.yearRange[1];
		}
		return !0;
	}, M = (e, n) => !!(Array.isArray(e) && e[n] && (t.value.maxRange || t.value.minRange) && j(e[n])), N = (e, n, r = 0) => {
		if (M(n, r) && j(e)) {
			let i = differenceInCalendarDays(e, n[r]), a = g(n[r], e), o = a.length === 1 ? 0 : a.filter((e) => k(e)).length, s = Math.abs(i) - (t.value.minMaxRawRange ? 0 : o);
			if (t.value.minRange && t.value.maxRange) return s >= +t.value.minRange && s <= +t.value.maxRange;
			if (t.value.minRange) return s >= +t.value.minRange;
			if (t.value.maxRange) return s <= +t.value.maxRange;
		}
		return !0;
	}, ee = () => !a.value.enableTimePicker || o.monthPicker || o.yearPicker || a.value.ignoreTimeValidation, P = (e) => Array.isArray(e) ? [e[0] ? _(e[0]) : null, e[1] ? _(e[1]) : null] : _(e), F = (e, t, n) => t ? e.find((e) => +e.hours === getHours(t) && e.minutes === "*" ? !0 : +e.minutes === getMinutes(t) && +e.hours === getHours(t)) && n : !1, I = (e, t, n) => {
		let [r, i] = e, [a, o] = t;
		return !F(r, a, n) && !F(i, o, n) && n;
	}, te = (e, t) => {
		let n = Array.isArray(t) ? t : [t];
		return Array.isArray(o.disabledTimes) ? Array.isArray(o.disabledTimes[0]) ? I(o.disabledTimes, n, e) : !n.some((t) => F(o.disabledTimes, t, e)) : e;
	}, L = (e, t) => {
		let n = Array.isArray(t) ? [v(t[0]), t[1] ? v(t[1]) : void 0] : v(t), r = !o.disabledTimes(n);
		return e && r;
	}, R = (e, t) => o.disabledTimes ? Array.isArray(o.disabledTimes) ? te(t, e) : L(t, e) : t, z = (t) => {
		let n = !0;
		if (!t || ee()) return !0;
		let r = !e.value.minDate && !e.value.maxDate ? P(t) : t;
		return (o.maxTime || e.value.maxDate) && (n = W(o.maxTime, e.value.maxDate, "max", d(r), n)), (o.minTime || e.value.minDate) && (n = W(o.minTime, e.value.minDate, "min", d(r), n)), R(t, n);
	}, B = (t) => {
		if (!o.monthPicker) return !0;
		let n = !0, r = s(h(t));
		if (e.value.minDate && e.value.maxDate) {
			let t = s(h(e.value.minDate)), n = s(h(e.value.maxDate));
			return p(r, t) && f(r, n) || m(r, t) || m(r, n);
		}
		if (e.value.minDate) {
			let t = s(h(e.value.minDate));
			n = p(r, t) || m(r, t);
		}
		if (e.value.maxDate) {
			let t = s(h(e.value.maxDate));
			n = f(r, t) || m(r, t);
		}
		return n;
	}, V = computed(() => (e) => !a.value.enableTimePicker || a.value.ignoreTimeValidation ? !0 : z(e)), ne = computed(() => (e) => o.monthPicker ? Array.isArray(e) && (t.value.enabled || n.value.enabled) ? !e.filter((e) => !B(e)).length : B(e) : !0), re = (t, n, r) => {
		if (!n || r && !e.value.maxDate || !r && !e.value.minDate) return !1;
		let i = r ? addMonths(t, 1) : subMonths(t, 1), a = [getMonth(i), getYear(i)];
		return r ? !T(...a) : !w(...a);
	}, H = (e, t, n) => [set(s(e), { date: 1 }), set(s(), {
		month: t,
		year: n,
		date: 1
	})], U = (e, t, n, r) => {
		if (!e) return !0;
		if (r) {
			let r = n === "max" ? isBefore(e, t) : isAfter(e, t), i = {
				seconds: 0,
				milliseconds: 0
			};
			return r || isEqual(set(e, i), set(t, i));
		}
		return n === "max" ? e.getTime() <= t.getTime() : e.getTime() >= t.getTime();
	}, W = (e, t, n, r, i) => {
		if (Array.isArray(r)) {
			let a = ie(e, r[0], t), o = ie(e, r[1], t);
			return U(r[0], a, n, !!t) && U(r[1], o, n, !!t) && i;
		}
		return U(r, ie(e, r, t), n, !!t) && i;
	}, ie = (e, t, n) => e ? y(e, t) : s(n ?? t);
	return {
		isDisabled: k,
		validateDate: C,
		validateMonthYearInRange: D,
		isDateRangeAllowed: A,
		checkMinMaxRange: N,
		isValidTime: z,
		validateMonthYear: re,
		validateMinDate: w,
		validateMaxDate: T,
		isValidDate: (e) => Array.isArray(e) ? isValid(e[0]) && (e[1] ? isValid(e[1]) : !0) : e ? isValid(e) : !1,
		checkPartialRangeValue: (e) => {
			if (e) return null;
			throw Error(u.prop("partial-range"));
		},
		checkRangeEnabled: (e, t) => {
			if (t) return e();
			throw Error(u.prop("range"));
		},
		checkMinMaxValue: (e, t, n) => {
			let r = n != null, i = t != null;
			if (!r && !i) return !1;
			let a = +n, o = +t;
			return r && i ? +e > a || +e < o : r ? +e > a : i ? +e < o : !1;
		},
		isTimeValid: V,
		isMonthValid: ne
	};
};
function gt(e) {
	return (t = {}) => {
		let n = t.width ? String(t.width) : e.defaultWidth;
		return e.formats[n] || e.formats[e.defaultWidth];
	};
}
function _t(e) {
	return (t, n) => {
		let r = n?.context ? String(n.context) : "standalone", i;
		if (r === "formatting" && e.formattingValues) {
			let t = e.defaultFormattingWidth || e.defaultWidth, r = n?.width ? String(n.width) : t;
			i = e.formattingValues[r] || e.formattingValues[t];
		} else {
			let t = e.defaultWidth, r = n?.width ? String(n.width) : e.defaultWidth;
			i = e.values[r] || e.values[t];
		}
		let a = e.argumentCallback ? e.argumentCallback(t) : t;
		return i[a];
	};
}
function vt(e) {
	return (t, n = {}) => {
		let r = n.width, i = r && e.matchPatterns[r] || e.matchPatterns[e.defaultMatchWidth], a = t.match(i);
		if (!a) return null;
		let o = a[0], s = r && e.parsePatterns[r] || e.parsePatterns[e.defaultParseWidth], c = Array.isArray(s) ? bt(s, (e) => e.test(o)) : yt(s, (e) => e.test(o)), l;
		l = e.valueCallback ? e.valueCallback(c) : c, l = n.valueCallback ? n.valueCallback(l) : l;
		let u = t.slice(o.length);
		return {
			value: l,
			rest: u
		};
	};
}
function yt(e, t) {
	for (let n in e) if (Object.prototype.hasOwnProperty.call(e, n) && t(e[n])) return n;
}
function bt(e, t) {
	for (let n = 0; n < e.length; n++) if (t(e[n])) return n;
}
function xt(e) {
	return (t, n = {}) => {
		let r = t.match(e.matchPattern);
		if (!r) return null;
		let i = r[0], a = t.match(e.parsePattern);
		if (!a) return null;
		let o = e.valueCallback ? e.valueCallback(a[0]) : a[0];
		o = n.valueCallback ? n.valueCallback(o) : o;
		let s = t.slice(i.length);
		return {
			value: o,
			rest: s
		};
	};
}
var St = {
	lessThanXSeconds: {
		one: "less than a second",
		other: "less than {{count}} seconds"
	},
	xSeconds: {
		one: "1 second",
		other: "{{count}} seconds"
	},
	halfAMinute: "half a minute",
	lessThanXMinutes: {
		one: "less than a minute",
		other: "less than {{count}} minutes"
	},
	xMinutes: {
		one: "1 minute",
		other: "{{count}} minutes"
	},
	aboutXHours: {
		one: "about 1 hour",
		other: "about {{count}} hours"
	},
	xHours: {
		one: "1 hour",
		other: "{{count}} hours"
	},
	xDays: {
		one: "1 day",
		other: "{{count}} days"
	},
	aboutXWeeks: {
		one: "about 1 week",
		other: "about {{count}} weeks"
	},
	xWeeks: {
		one: "1 week",
		other: "{{count}} weeks"
	},
	aboutXMonths: {
		one: "about 1 month",
		other: "about {{count}} months"
	},
	xMonths: {
		one: "1 month",
		other: "{{count}} months"
	},
	aboutXYears: {
		one: "about 1 year",
		other: "about {{count}} years"
	},
	xYears: {
		one: "1 year",
		other: "{{count}} years"
	},
	overXYears: {
		one: "over 1 year",
		other: "over {{count}} years"
	},
	almostXYears: {
		one: "almost 1 year",
		other: "almost {{count}} years"
	}
};
var Ct = (e, t, n) => {
	let r, i = St[e];
	return r = typeof i == "string" ? i : t === 1 ? i.one : i.other.replace("{{count}}", t.toString()), n?.addSuffix ? n.comparison && n.comparison > 0 ? "in " + r : r + " ago" : r;
};
var wt = {
	lastWeek: "'last' eeee 'at' p",
	yesterday: "'yesterday at' p",
	today: "'today at' p",
	tomorrow: "'tomorrow at' p",
	nextWeek: "eeee 'at' p",
	other: "P"
};
var Tt = (e, t, n, r) => wt[e];
var Et = {
	ordinalNumber: (e, t) => {
		let n = Number(e), r = n % 100;
		if (r > 20 || r < 10) switch (r % 10) {
			case 1: return n + "st";
			case 2: return n + "nd";
			case 3: return n + "rd";
		}
		return n + "th";
	},
	era: _t({
		values: {
			narrow: ["B", "A"],
			abbreviated: ["BC", "AD"],
			wide: ["Before Christ", "Anno Domini"]
		},
		defaultWidth: "wide"
	}),
	quarter: _t({
		values: {
			narrow: [
				"1",
				"2",
				"3",
				"4"
			],
			abbreviated: [
				"Q1",
				"Q2",
				"Q3",
				"Q4"
			],
			wide: [
				"1st quarter",
				"2nd quarter",
				"3rd quarter",
				"4th quarter"
			]
		},
		defaultWidth: "wide",
		argumentCallback: (e) => e - 1
	}),
	month: _t({
		values: {
			narrow: [
				"J",
				"F",
				"M",
				"A",
				"M",
				"J",
				"J",
				"A",
				"S",
				"O",
				"N",
				"D"
			],
			abbreviated: [
				"Jan",
				"Feb",
				"Mar",
				"Apr",
				"May",
				"Jun",
				"Jul",
				"Aug",
				"Sep",
				"Oct",
				"Nov",
				"Dec"
			],
			wide: [
				"January",
				"February",
				"March",
				"April",
				"May",
				"June",
				"July",
				"August",
				"September",
				"October",
				"November",
				"December"
			]
		},
		defaultWidth: "wide"
	}),
	day: _t({
		values: {
			narrow: [
				"S",
				"M",
				"T",
				"W",
				"T",
				"F",
				"S"
			],
			short: [
				"Su",
				"Mo",
				"Tu",
				"We",
				"Th",
				"Fr",
				"Sa"
			],
			abbreviated: [
				"Sun",
				"Mon",
				"Tue",
				"Wed",
				"Thu",
				"Fri",
				"Sat"
			],
			wide: [
				"Sunday",
				"Monday",
				"Tuesday",
				"Wednesday",
				"Thursday",
				"Friday",
				"Saturday"
			]
		},
		defaultWidth: "wide"
	}),
	dayPeriod: _t({
		values: {
			narrow: {
				am: "a",
				pm: "p",
				midnight: "mi",
				noon: "n",
				morning: "morning",
				afternoon: "afternoon",
				evening: "evening",
				night: "night"
			},
			abbreviated: {
				am: "AM",
				pm: "PM",
				midnight: "midnight",
				noon: "noon",
				morning: "morning",
				afternoon: "afternoon",
				evening: "evening",
				night: "night"
			},
			wide: {
				am: "a.m.",
				pm: "p.m.",
				midnight: "midnight",
				noon: "noon",
				morning: "morning",
				afternoon: "afternoon",
				evening: "evening",
				night: "night"
			}
		},
		defaultWidth: "wide",
		formattingValues: {
			narrow: {
				am: "a",
				pm: "p",
				midnight: "mi",
				noon: "n",
				morning: "in the morning",
				afternoon: "in the afternoon",
				evening: "in the evening",
				night: "at night"
			},
			abbreviated: {
				am: "AM",
				pm: "PM",
				midnight: "midnight",
				noon: "noon",
				morning: "in the morning",
				afternoon: "in the afternoon",
				evening: "in the evening",
				night: "at night"
			},
			wide: {
				am: "a.m.",
				pm: "p.m.",
				midnight: "midnight",
				noon: "noon",
				morning: "in the morning",
				afternoon: "in the afternoon",
				evening: "in the evening",
				night: "at night"
			}
		},
		defaultFormattingWidth: "wide"
	})
};
var Dt = {
	ordinalNumber: xt({
		matchPattern: /^(\d+)(th|st|nd|rd)?/i,
		parsePattern: /\d+/i,
		valueCallback: (e) => parseInt(e, 10)
	}),
	era: vt({
		matchPatterns: {
			narrow: /^(b|a)/i,
			abbreviated: /^(b\.?\s?c\.?|b\.?\s?c\.?\s?e\.?|a\.?\s?d\.?|c\.?\s?e\.?)/i,
			wide: /^(before christ|before common era|anno domini|common era)/i
		},
		defaultMatchWidth: "wide",
		parsePatterns: { any: [/^b/i, /^(a|c)/i] },
		defaultParseWidth: "any"
	}),
	quarter: vt({
		matchPatterns: {
			narrow: /^[1234]/i,
			abbreviated: /^q[1234]/i,
			wide: /^[1234](th|st|nd|rd)? quarter/i
		},
		defaultMatchWidth: "wide",
		parsePatterns: { any: [
			/1/i,
			/2/i,
			/3/i,
			/4/i
		] },
		defaultParseWidth: "any",
		valueCallback: (e) => e + 1
	}),
	month: vt({
		matchPatterns: {
			narrow: /^[jfmasond]/i,
			abbreviated: /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
			wide: /^(january|february|march|april|may|june|july|august|september|october|november|december)/i
		},
		defaultMatchWidth: "wide",
		parsePatterns: {
			narrow: [
				/^j/i,
				/^f/i,
				/^m/i,
				/^a/i,
				/^m/i,
				/^j/i,
				/^j/i,
				/^a/i,
				/^s/i,
				/^o/i,
				/^n/i,
				/^d/i
			],
			any: [
				/^ja/i,
				/^f/i,
				/^mar/i,
				/^ap/i,
				/^may/i,
				/^jun/i,
				/^jul/i,
				/^au/i,
				/^s/i,
				/^o/i,
				/^n/i,
				/^d/i
			]
		},
		defaultParseWidth: "any"
	}),
	day: vt({
		matchPatterns: {
			narrow: /^[smtwf]/i,
			short: /^(su|mo|tu|we|th|fr|sa)/i,
			abbreviated: /^(sun|mon|tue|wed|thu|fri|sat)/i,
			wide: /^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/i
		},
		defaultMatchWidth: "wide",
		parsePatterns: {
			narrow: [
				/^s/i,
				/^m/i,
				/^t/i,
				/^w/i,
				/^t/i,
				/^f/i,
				/^s/i
			],
			any: [
				/^su/i,
				/^m/i,
				/^tu/i,
				/^w/i,
				/^th/i,
				/^f/i,
				/^sa/i
			]
		},
		defaultParseWidth: "any"
	}),
	dayPeriod: vt({
		matchPatterns: {
			narrow: /^(a|p|mi|n|(in the|at) (morning|afternoon|evening|night))/i,
			any: /^([ap]\.?\s?m\.?|midnight|noon|(in the|at) (morning|afternoon|evening|night))/i
		},
		defaultMatchWidth: "any",
		parsePatterns: { any: {
			am: /^a/i,
			pm: /^p/i,
			midnight: /^mi/i,
			noon: /^no/i,
			morning: /morning/i,
			afternoon: /afternoon/i,
			evening: /evening/i,
			night: /night/i
		} },
		defaultParseWidth: "any"
	})
};
var Ot = {
	code: "en-US",
	formatDistance: Ct,
	formatLong: {
		date: gt({
			formats: {
				full: "EEEE, MMMM do, y",
				long: "MMMM do, y",
				medium: "MMM d, y",
				short: "MM/dd/yyyy"
			},
			defaultWidth: "full"
		}),
		time: gt({
			formats: {
				full: "h:mm:ss a zzzz",
				long: "h:mm:ss a z",
				medium: "h:mm:ss a",
				short: "h:mm a"
			},
			defaultWidth: "full"
		}),
		dateTime: gt({
			formats: {
				full: "{{date}} 'at' {{time}}",
				long: "{{date}} 'at' {{time}}",
				medium: "{{date}}, {{time}}",
				short: "{{date}}, {{time}}"
			},
			defaultWidth: "full"
		})
	},
	formatRelative: Tt,
	localize: Et,
	match: Dt,
	options: {
		weekStartsOn: 0,
		firstWeekContainsDate: 1
	}
};
var kt = {
	noDisabledRange: !1,
	showLastInRange: !0,
	minMaxRawRange: !1,
	partialRange: !0,
	disableTimeRangeValidation: !1,
	maxRange: void 0,
	minRange: void 0,
	autoRange: void 0,
	fixedStart: !1,
	fixedEnd: !1,
	autoSwitchStartEnd: !0
};
var At = {
	allowStopPropagation: !0,
	closeOnScroll: !1,
	modeHeight: 255,
	allowPreventDefault: !1,
	closeOnClearValue: !0,
	closeOnAutoApply: !0,
	noSwipe: !1,
	keepActionRow: !1,
	onClickOutside: void 0,
	onInternalKeydown: void 0,
	tabOutClosesMenu: !0,
	arrowLeft: void 0,
	keepViewOnOffsetClick: !1,
	timeArrowHoldThreshold: 0,
	shadowDom: !1,
	mobileBreakpoint: 600,
	setDateOnMenuClose: !1,
	escClose: !0,
	spaceConfirm: !0,
	monthChangeOnArrows: !0,
	monthChangeOnScroll: !0
};
var jt = {
	enterSubmit: !0,
	tabSubmit: !0,
	openMenu: "open",
	selectOnFocus: !1,
	rangeSeparator: " - ",
	escClose: !0,
	format: void 0,
	maskFormat: void 0,
	applyOnBlur: !1,
	separators: void 0
};
var Mt = {
	dates: [],
	years: [],
	months: [],
	quarters: [],
	weeks: [],
	weekdays: [],
	options: { highlightDisabled: !1 }
};
var Nt = {
	showSelect: !0,
	showCancel: !0,
	showNow: !1,
	showPreview: !0,
	selectBtnLabel: "Select",
	cancelBtnLabel: "Cancel",
	nowBtnLabel: "Now",
	nowBtnRound: void 0
};
var Pt = {
	toggleOverlay: "Toggle overlay",
	menu: "Datepicker menu",
	input: "Datepicker input",
	openTimePicker: "Open time picker",
	closeTimePicker: "Close time Picker",
	incrementValue: (e) => `Increment ${e}`,
	decrementValue: (e) => `Decrement ${e}`,
	openTpOverlay: (e) => `Open ${e} overlay`,
	amPmButton: "Switch AM/PM mode",
	openYearsOverlay: "Open years overlay",
	openMonthsOverlay: "Open months overlay",
	nextMonth: "Next month",
	prevMonth: "Previous month",
	nextYear: "Next year",
	prevYear: "Previous year",
	day: void 0,
	weekDay: void 0,
	clearInput: "Clear value",
	calendarIcon: "Calendar icon",
	timePicker: "Time picker",
	monthPicker: (e) => `Month picker${e ? " overlay" : ""}`,
	yearPicker: (e) => `Year picker${e ? " overlay" : ""}`,
	timeOverlay: (e) => `${e} overlay`
};
var Ft = {
	menuAppearTop: "dp-menu-appear-top",
	menuAppearBottom: "dp-menu-appear-bottom",
	open: "dp-slide-down",
	close: "dp-slide-up",
	next: "calendar-next",
	previous: "calendar-prev",
	vNext: "dp-slide-up",
	vPrevious: "dp-slide-down"
};
var It = {
	weekDays: [],
	months: [],
	years: [],
	times: {
		hours: [],
		minutes: [],
		seconds: []
	}
};
var Lt = {
	month: "LLL",
	year: "yyyy",
	weekDay: "EEEEEE",
	quarter: "MMMM",
	day: "d",
	input: void 0,
	preview: void 0
};
var Rt = {
	enableTimePicker: !0,
	ignoreTimeValidation: !1,
	enableSeconds: !1,
	enableMinutes: !0,
	is24: !0,
	noHoursOverlay: !1,
	noMinutesOverlay: !1,
	noSecondsOverlay: !1,
	hoursGridIncrement: 1,
	minutesGridIncrement: 5,
	secondsGridIncrement: 5,
	hoursIncrement: 1,
	minutesIncrement: 1,
	secondsIncrement: 1,
	timePickerInline: !1,
	startTime: void 0
};
var zt = {
	menuWrapRef: null,
	collapse: !1
};
var Bt = {
	yearRange: () => [1900, 2100],
	ui: () => ({}),
	locale: () => Ot,
	dark: !1,
	transitions: !0,
	hideNavigation: () => [],
	vertical: !1,
	hideMonthYearSelect: !1,
	disableYearSelect: !1,
	autoApply: !1,
	disabledDates: () => [],
	hideOffsetDates: !1,
	noToday: !1,
	markers: () => [],
	presetDates: () => [],
	preventMinMaxNavigation: !1,
	reverseYears: !1,
	weekPicker: !1,
	arrowNavigation: !1,
	monthPicker: !1,
	yearPicker: !1,
	quarterPicker: !1,
	timePicker: !1,
	modelAuto: !1,
	multiDates: !1,
	range: !1,
	inline: !1,
	sixWeeks: !1,
	focusStartDate: !1,
	yearFirst: !1,
	loading: !1,
	centered: !1
};
var Vt = {
	name: void 0,
	required: !1,
	autocomplete: "off",
	state: void 0,
	clearable: !0,
	alwaysClearable: !1,
	hideInputIcon: !1,
	id: void 0,
	inputmode: "none"
};
var Ht = {
	type: "local",
	hideOnOffsetDates: !1,
	label: "W"
};
var Ut = (e) => {
	let { getMapKey: t, getMapKeyType: n, getTimeObjFromCurrent: i } = Wt();
	function a(t, n) {
		let r;
		return r = e.timezone ? new TZDate(t ?? /* @__PURE__ */ new Date(), e.timezone) : t ? new Date(t) : /* @__PURE__ */ new Date(), n ? set(r, {
			hours: 0,
			minutes: 0,
			seconds: 0,
			milliseconds: 0
		}) : r;
	}
	let o = (t, n, r = 1) => e.timezone ? new TZDate(t, n, r, e.timezone) : new Date(t, n, r), s = () => {
		let e = j.value.enableSeconds ? ":ss" : "", t = j.value.enableMinutes ? ":mm" : "";
		return j.value.is24 ? `HH${t}${e}` : `hh${t}${e} aa`;
	}, c = () => e.monthPicker ? "MM/yyyy" : e.timePicker ? s() : e.weekPicker ? `${w.value?.type === "iso" ? "II" : "ww"}-RR` : e.yearPicker ? "yyyy" : e.quarterPicker ? "QQQ/yyyy" : j.value.enableTimePicker ? `MM/dd/yyyy, ${s()}` : "MM/dd/yyyy", l = (e) => i(a(), e, j.value.enableSeconds), u = () => D.value.enabled ? j.value.startTime && Array.isArray(j.value.startTime) ? [l(j.value.startTime[0]), l(j.value.startTime[1])] : null : j.value.startTime && !Array.isArray(j.value.startTime) ? l(j.value.startTime) : null, d = (e) => e ? typeof e == "boolean" ? e ? 2 : 0 : Math.max(+e, 2) : 0, f = (r) => {
		let i = n(e.monthPicker, e.yearPicker);
		return new Map(r.map((e) => {
			let n = a(e, p.value);
			return [t(n, i), n];
		}));
	}, p = computed(() => e.monthPicker || e.yearPicker || e.quarterPicker), m = computed(() => {
		let t = typeof e.multiCalendars == "object" && e.multiCalendars, n = {
			static: !0,
			solo: !1
		};
		if (!e.multiCalendars) return {
			...n,
			count: d(!1)
		};
		let r = t ? e.multiCalendars : {}, i = d(t ? r.count ?? !0 : e.multiCalendars);
		return Object.assign(n, r, { count: i });
	}), h = computed(() => u()), g = computed(() => ({
		...Pt,
		...e.ariaLabels
	})), _ = computed(() => ({
		...It,
		...e.filters
	})), v = computed(() => typeof e.transitions == "boolean" ? e.transitions ? Ft : !1 : {
		...Ft,
		...e.transitions
	}), y = computed(() => ({
		...Nt,
		...e.actionRow
	})), b = computed(() => typeof e.textInput == "object" ? {
		...jt,
		...e.textInput,
		format: typeof e.textInput.format == "string" ? e.textInput.format : k.value.input,
		pattern: e.textInput.format ?? k.value.input,
		enabled: !0
	} : {
		...jt,
		format: k.value.input,
		pattern: k.value.input,
		enabled: e.textInput
	}), x = computed(() => {
		let t = { input: !1 };
		return typeof e.inline == "object" ? {
			...t,
			...e.inline,
			enabled: !0
		} : {
			enabled: e.inline,
			...t
		};
	}), S = computed(() => ({
		...At,
		...e.config
	})), C = computed(() => typeof e.highlight == "function" ? e.highlight : {
		...Mt,
		...e.highlight
	}), w = computed(() => typeof e.weekNumbers == "object" ? {
		type: e.weekNumbers?.type ?? Ht.type,
		hideOnOffsetDates: e.weekNumbers?.hideOnOffsetDates ?? Ht.hideOnOffsetDates,
		label: e.weekNumbers.label ?? Ht.label
	} : e.weekNumbers ? Ht : void 0), T = computed(() => typeof e.multiDates == "boolean" ? {
		enabled: e.multiDates,
		dragSelect: !0,
		limit: null
	} : {
		enabled: !!e.multiDates,
		limit: e.multiDates?.limit ? +e.multiDates.limit : null,
		dragSelect: e.multiDates?.dragSelect ?? !0
	}), E = computed(() => ({
		minDate: e.minDate ? a(e.minDate) : null,
		maxDate: e.maxDate ? a(e.maxDate) : null,
		disabledDates: Array.isArray(e.disabledDates) ? f(e.disabledDates) : e.disabledDates,
		allowedDates: Array.isArray(e.allowedDates) ? f(e.allowedDates) : null,
		highlight: typeof C.value == "object" && Array.isArray(C.value.dates) ? f(C.value.dates) : C.value,
		markers: e.markers?.length ? new Map(e.markers.map((e) => [t(a(e.date), ot.DATE), e])) : null
	})), D = computed(() => typeof e.range == "object" ? {
		enabled: !0,
		...kt,
		...e.range
	} : {
		enabled: e.range,
		...kt
	}), O = computed(() => Object.fromEntries(Object.keys(e.ui).map((t) => {
		let n = t, r = e.ui[n];
		return n === "dayClass" ? [n, e.ui[n]] : [t, typeof e.ui[n] == "string" ? { [r]: !0 } : Object.fromEntries(r.map((e) => [e, !0]))];
	}))), k = computed(() => ({
		...Lt,
		...e.formats,
		input: e.formats?.input ?? c(),
		preview: e.formats?.preview ?? e.formats?.input ?? c()
	})), A = computed(() => {
		if (e.teleport) return typeof e.teleport == "string" ? e.teleport : typeof e.teleport == "boolean" ? "body" : e.teleport;
	}), j = computed(() => ({
		...Rt,
		...e.timeConfig
	}));
	return {
		transitions: v,
		multiCalendars: m,
		startTime: h,
		ariaLabels: g,
		filters: _,
		actionRow: y,
		textInput: b,
		inline: x,
		config: S,
		highlight: C,
		weekNumbers: w,
		range: D,
		safeDates: E,
		multiDates: T,
		ui: O,
		formats: k,
		teleport: A,
		timeConfig: j,
		flow: computed(() => {
			if (e.flow) return {
				steps: [],
				partial: !1,
				...e.flow
			};
		}),
		inputAttrs: computed(() => {
			let t = b.value.enabled ? "text" : "none";
			return e.inputAttrs ? {
				...Vt,
				inputmode: t,
				...e.inputAttrs
			} : {
				...Vt,
				inputmode: t
			};
		}),
		floatingConfig: computed(() => ({
			offset: e.floating?.offset ?? 10,
			arrow: e.floating?.arrow ?? !0,
			strategy: e.floating?.strategy ?? void 0,
			placement: e.floating?.placement ?? void 0,
			flip: e.floating?.flip ?? !0,
			shift: e.floating?.shift ?? !0
		})),
		weekStart: computed(() => e.weekStart || e.weekStart === 0 || e.weekStart === "0" ? +e.weekStart : getDay(startOfWeek(a(), { locale: e.locale }))),
		getDate: a,
		getDateFromParts: o
	};
};
var Wt = () => {
	let e = (e, t) => format(e, t ?? ot.DATE), t = (e, t) => e ? ot.MONTH_AND_YEAR : t ? ot.YEAR : ot.DATE, n = (t, n, r) => n.get(e(t, r)), r = (e) => e, i = (e) => e === 0 ? e : !e || Number.isNaN(+e) ? null : +e, a = () => [
		"a[href]",
		"area[href]",
		"input:not([disabled]):not([type='hidden'])",
		"select:not([disabled])",
		"textarea:not([disabled])",
		"button:not([disabled])",
		"[tabindex]:not([tabindex='-1'])",
		"[data-datepicker-instance]"
	].join(", "), o = (e, t) => {
		let n = [...document.querySelectorAll(a())];
		n = n.filter((t) => !e.contains(t) || "datepicker-instance" in t.dataset);
		let r = n.indexOf(e);
		if (r >= 0 && (t ? r - 1 >= 0 : r + 1 <= n.length)) return n[r + (t ? -1 : 1)];
	}, s = (e) => String(e).padStart(2, "0"), c = (e, t) => e?.querySelector(`[data-dp-element="${t}"]`), l = (e, t, n = !1) => {
		e && t.allowStopPropagation && (n && e.stopImmediatePropagation(), e.stopPropagation());
	}, u = (e, t, n = !1, r = !0, i) => {
		if (e.key === Q.enter || e.key === Q.space && r) return n && e.preventDefault(), t();
		if (i) return i(e);
	}, d = (e, t) => {
		t.allowStopPropagation && e.stopPropagation(), t.allowPreventDefault && e.preventDefault();
	}, f = (e) => {
		if (e) return [...e.querySelectorAll("input, button, select, textarea, a[href]")][0];
	}, p = () => "ontouchstart" in globalThis || navigator.maxTouchPoints > 0, m = (e) => [
		12,
		1,
		2,
		3,
		4,
		5,
		6,
		7,
		8,
		9,
		10,
		11,
		12,
		1,
		2,
		3,
		4,
		5,
		6,
		7,
		8,
		9,
		10,
		11
	][e], h = (e) => {
		let t = [], n = (e) => e.filter((e) => !!e);
		for (let r = 0; r < e.length; r += 3) {
			let i = [
				e[r],
				e[r + 1],
				e[r + 2]
			];
			t.push(n(i));
		}
		return t;
	}, g = {
		prop: (e) => `"${e}" prop must be enabled!`,
		dateArr: (e) => `You need to use array as "model-value" binding in order to support "${e}"`
	}, _ = (e, t, n, r, i) => {
		let a = {
			hours: getHours,
			minutes: getMinutes,
			seconds: getSeconds
		};
		if (!t) return r ? [a[e](n), a[e](n)] : a[e](n);
		if (Array.isArray(t) && r) {
			let r = t[0] ?? n, o = t[1];
			return [a[e](r), o ? a[e](o) : i[e][1] ?? a[e](n)];
		}
		return Array.isArray(t) && !r ? a[e](t.at(-1) ?? n) : a[e](t);
	};
	return {
		getMapKey: e,
		getMapKeyType: t,
		getMapDate: n,
		convertType: r,
		getNumVal: i,
		findNextFocusableElement: o,
		padZero: s,
		getElWithin: c,
		checkStopPropagation: l,
		checkKeyDown: u,
		handleEventPropagation: d,
		findFocusableEl: f,
		isTouchDevice: p,
		hoursToAmPmHours: m,
		getGroupedList: h,
		setTimeModelValue: (e, t, n, r) => {
			e.hours = _("hours", t, n, r, e), e.minutes = _("minutes", t, n, r, e), e.seconds = _("seconds", t, n, r, e);
		},
		getTimeObjFromCurrent: (e, t, n) => {
			let r = {
				hours: getHours(e),
				minutes: getMinutes(e),
				seconds: n ? getSeconds(e) : 0
			};
			return Object.assign(r, t);
		},
		errorMapper: g
	};
};
var Gt = () => {
	let { getDate: e } = $(), { getMapDate: t, getGroupedList: n } = Wt(), r = (t, n) => {
		if (!t) return e();
		let r = set(e(t), {
			hours: 0,
			minutes: 0,
			seconds: 0,
			milliseconds: 0
		});
		return n ? startOfMonth(r) : r;
	}, i = (t, n) => {
		let r = e(n);
		return set(r, {
			hours: +(t.hours ?? getHours(r)),
			minutes: +(t.minutes ?? getMinutes(r)),
			seconds: +(t.seconds ?? getSeconds(r)),
			milliseconds: 0
		});
	}, a = (e, t) => [startOfWeek(e, { weekStartsOn: +t }), endOfWeek(e, { weekStartsOn: +t })], o = (e, t) => !e || !t ? !1 : isBefore(r(e), r(t)), s = (e, t) => !e || !t ? !1 : isEqual(r(e), r(t)), c = (e, t) => !e || !t ? !1 : isAfter(r(e), r(t)), l = (e, t, n) => e?.[0] && e?.[1] ? c(n, e[0]) && o(n, e[1]) : e?.[0] && t ? c(n, e[0]) && o(n, t) || o(n, e[0]) && c(n, t) : !1, u = (e, t) => eachDayOfInterval({
		start: c(e, t) ? t : e,
		end: c(t, e) ? t : e
	}), d = (e) => `dp-${format(e, "yyyy-MM-dd")}`, f = (t) => r(set(e(t), { date: 1 })), p = (t, n) => {
		if (n) {
			let r = getYear(e(n));
			if (r > t) return 12;
			if (r === t) return getMonth(e(n));
		}
	}, m = (t, n) => {
		if (n) {
			let r = getYear(e(n));
			return r < t ? -1 : r === t ? getMonth(e(n)) : void 0;
		}
	}, h = (t) => {
		if (t) return getYear(e(t));
	}, g = (e) => ({
		hours: getHours(e),
		minutes: getMinutes(e),
		seconds: getSeconds(e)
	});
	return {
		resetDateTime: r,
		groupListAndMap: (e, t) => n(e).map((e) => e.map((e) => {
			let { active: n, disabled: r, isBetween: i, highlighted: a } = t(e);
			return {
				...e,
				active: n,
				disabled: r,
				className: {
					"dp--active dp--overlay-cell-active": n,
					"dp--overlay-cell": !n,
					"dp--overlay-cell-disabled": r,
					"dp--overlay-cell-pad": !0,
					"dp--overlay-cell-active-disabled": r && n,
					"dp--cell-in-between": i,
					"dp--highlighted": a
				}
			};
		})),
		setTime: i,
		getWeekFromDate: a,
		isDateAfter: c,
		isDateBefore: o,
		isDateBetween: l,
		isDateEqual: s,
		getDaysInBetween: u,
		getCellId: d,
		resetDate: f,
		getMinMonth: p,
		getMaxMonth: m,
		getYearFromDate: h,
		getTimeObj: g,
		setTimeValue: (t) => set(e(), g(t)),
		sanitizeTime: (e, t, n) => t && (n || n === 0) ? Object.fromEntries([
			"hours",
			"minutes",
			"seconds"
		].map((r) => r === t ? [r, n] : [r, Number.isNaN(+e[r]) ? void 0 : +e[r]])) : {
			hours: Number.isNaN(+e.hours) ? void 0 : +e.hours,
			minutes: Number.isNaN(+e.minutes) ? void 0 : +e.minutes,
			seconds: Number.isNaN(+(e.seconds ?? "")) ? void 0 : +e.seconds
		},
		getBeforeAndAfterInRange: (e, t) => ({
			before: subDays(r(t), e),
			after: addDays(r(t), e)
		}),
		isModelAuto: (e) => Array.isArray(e) ? !!e[0] && !!e[1] : !1,
		matchDate: (n, r) => n ? r ? r instanceof Map ? !!t(n, r) : r(e(n)) : !1 : !0,
		checkHighlightMonth: (e, t, n) => typeof e == "function" ? e({
			month: t,
			year: n
		}) : e.months.some((e) => e.month === t && e.year === n),
		checkHighlightYear: (e, t) => typeof e == "function" ? e(t) : e.years.includes(t)
	};
};
var Kt = () => {
	let { defaults: { config: e } } = $(), t = ref(0);
	onMounted(() => {
		n(), globalThis.addEventListener("resize", n, { passive: !0 });
	}), onUnmounted(() => {
		globalThis.removeEventListener("resize", n);
	});
	let n = () => {
		t.value = globalThis.document.documentElement.clientWidth;
	};
	return { isMobile: computed(() => t.value <= e.value.mobileBreakpoint ? !0 : void 0) };
};
var qt = () => {
	let { getDate: e, state: t, modelValue: n, rootProps: r, defaults: { formats: i, textInput: a } } = $(), o = (t) => format(setYear(e(), t), i.value.year, { locale: r.locale }), s = (t) => format(setMonth(e(), t), i.value.month, { locale: r.locale }), c = (e) => format(e, i.value.weekDay, { locale: r.locale }), l = (e) => format(e, i.value.quarter, { locale: r.locale }), u = (e, t) => [e, t].map((e) => l(e)).join("-"), d = (e) => format(e, i.value.day, { locale: r.locale }), f = (e, t, n) => {
		let o = n ? i.value.preview : i.value.input;
		if (!e) return "";
		if (typeof o == "function") return o(e);
		let s = t ?? o, c = { locale: r.locale };
		return Array.isArray(e) ? `${format(e[0], s, c)}${r.modelAuto && !e[1] ? "" : a.value.rangeSeparator}${e[1] ? format(e[1], s, c) : ""}` : format(e, s, c);
	}, p = () => {
		let e = (e) => format(e, a.value.format);
		return Array.isArray(n.value) ? `${e(n.value[0])}${a.value.rangeSeparator}${n.value[1] ? e(n.value[1]) : ""}` : "";
	};
	return {
		formatYear: o,
		formatMonth: s,
		formatWeekDay: c,
		formatQuarter: l,
		formatSelectedDate: f,
		formatForTextInput: () => t.isInputFocused && n.value ? Array.isArray(n.value) ? p() : typeof a.value.format == "function" ? a.value.format(n.value) : format(n.value, a.value.format) : f(n.value),
		formatPreview: (e) => f(e, void 0, !0),
		formatQuarterText: u,
		formatDay: d
	};
};
var Jt = () => {
	let { rootProps: e } = $(), { formatYear: t, formatMonth: n } = qt();
	return {
		getMonths: () => [
			0,
			1,
			2,
			3,
			4,
			5,
			6,
			7,
			8,
			9,
			10,
			11
		].map((e) => ({
			text: n(e),
			value: e
		})),
		getYears: () => {
			let n = [];
			for (let r = +e.yearRange[0]; r <= +e.yearRange[1]; r++) n.push({
				value: +r,
				text: t(r)
			});
			return e.reverseYears ? n.reverse() : n;
		},
		isOutOfYearRange: (t) => t < +e.yearRange[0] || t > +e.yearRange[1]
	};
};
var Yt = (e) => ({
	openMenu: () => e.value?.openMenu(),
	closeMenu: () => e.value?.closeMenu(),
	selectDate: () => e.value?.selectDate(),
	clearValue: () => e.value?.clearValue(),
	formatInputValue: () => e.value?.formatInputValue(),
	updateInternalModelValue: (t) => e.value?.updateInternalModelValue(t),
	setMonthYear: (t, n) => e.value?.setMonthYear(t, n),
	parseModel: () => e.value?.parseModel(),
	switchView: (t, n) => e.value?.switchView(t, n),
	executeFlow: (t) => e.value?.executeFlow(t),
	toggleMenu: () => e.value?.toggleMenu(),
	dpMenuRef: () => e.value?.dpMenuRef(),
	dpWrapMenuRef: () => e.value?.dpWrapMenuRef(),
	inputRef: () => e.value?.inputRef()
});
var Xt = () => ({ boolHtmlAttribute: (e) => e ? !0 : void 0 });
var Zt = () => {
	let { getDate: e, rootProps: t, defaults: { textInput: n, startTime: i, timeConfig: a } } = $(), { getTimeObjFromCurrent: o } = Wt(), s = ref(!1), c = computed(() => Array.isArray(i.value) ? i.value[0] : i.value ?? o(e(), {}, a.value.enableSeconds)), l = (e, t) => {
		let n = /[^a-zA-Z0-9]+/g, r = t.split(n), i = e.split(n), a = e.match(n) || [], o = t.match(n) || [], s = "";
		for (let e = 0; e < r.length && e < i.length; e++) {
			e > 0 && o[e - 1] && (s += a[e - 1] || o[e - 1]);
			let t = r[e]?.length;
			s += i[e]?.slice(0, t);
		}
		return s;
	}, u = (n, r, i) => {
		let a = parse(n, l(r, n), e(), { locale: t.locale });
		return isValid(a) && isDate(a) ? i || s.value || t.timePicker ? a : set(a, {
			hours: +c.value.hours,
			minutes: +c.value.minutes,
			seconds: +(c.value.seconds ?? 0),
			milliseconds: 0
		}) : null;
	};
	return {
		textPasted: s,
		parseFreeInput: (e, t) => {
			if (typeof n.value.pattern == "string") return u(e, n.value.pattern, t);
			if (Array.isArray(n.value.pattern)) {
				let r = null;
				for (let i of n.value.pattern) if (r = u(e, i, t), r) break;
				return r;
			}
			return typeof n.value.pattern == "function" ? n.value.pattern(e) : null;
		},
		applyMaxValues: (e, t) => {
			let n = {
				MM: 12,
				DD: 31,
				hh: 23,
				mm: 59,
				ss: 59
			}, r = "", i = 0;
			for (let a = 0; a < t.length; a++) {
				let o = t[a], s = o.length, c = e.slice(i, i + s);
				if (!c) break;
				if (c.length < s) r += c;
				else {
					let e = Number.parseInt(c, 10);
					n[o] && e > n[o] && (e = n[o]), r += e.toString().padStart(s, "0").slice(0, s);
				}
				i += s;
			}
			return r;
		},
		createMaskedValue: (e, t) => {
			let n = /(YYYY|MM|DD|hh|mm|ss)/g, r = [...t.matchAll(n)].map((e) => e[0]), i = t.replace(n, "|").split("|").filter(Boolean), a = r.map((e) => e.length), o = "", s = 0;
			for (let t = 0; t < r.length; t++) {
				let n = a[t], r = e.slice(s, s + n);
				if (!r) break;
				o += r, r.length === n && i[t] && (o += i[t]), s += n;
			}
			return o;
		}
	};
};
var Qt = /* @__PURE__ */ function(e) {
	return e.Input = "input", e.DatePicker = "date-picker", e.Calendar = "calendar", e.DatePickerHeader = "date-picker-header", e.Menu = "menu", e.ActionRow = "action-row", e.TimePicker = "time-picker", e.TimeInput = "time-input", e.PassTrough = "pass-trough", e.MonthPicker = "month-picker", e.YearMode = "year-mode", e.QuarterPicker = "quarter-picker", e.YearPicker = "year-picker", e;
}({});
var $t = [
	"time-input",
	"time-picker",
	"pass-trough"
];
var en = [
	{
		name: "trigger",
		use: ["input"]
	},
	{
		name: "input-icon",
		use: ["input"]
	},
	{
		name: "clear-icon",
		use: ["input"]
	},
	{
		name: "dp-input",
		use: ["input"]
	},
	{
		name: "clock-icon",
		use: [
			"time-picker",
			"time-input",
			"pass-trough"
		]
	},
	{
		name: "arrow-left",
		use: [
			"date-picker-header",
			"pass-trough",
			"year-mode"
		]
	},
	{
		name: "arrow-right",
		use: [
			"date-picker-header",
			"pass-trough",
			"year-mode"
		]
	},
	{
		name: "arrow-up",
		use: [
			"time-picker",
			"time-input",
			"date-picker-header",
			"pass-trough"
		]
	},
	{
		name: "arrow-down",
		use: [
			"time-picker",
			"time-input",
			"date-picker-header",
			"pass-trough"
		]
	},
	{
		name: "calendar-icon",
		use: [
			"date-picker-header",
			"time-picker",
			"pass-trough",
			"year-mode"
		]
	},
	{
		name: "day",
		use: ["calendar", "pass-trough"]
	},
	{
		name: "month-overlay-value",
		use: [
			"date-picker-header",
			"pass-trough",
			"month-picker"
		]
	},
	{
		name: "year-overlay-value",
		use: [
			"date-picker-header",
			"pass-trough",
			"year-mode",
			"year-picker"
		]
	},
	{
		name: "year-overlay",
		use: ["date-picker-header", "pass-trough"]
	},
	{
		name: "month-overlay",
		use: ["date-picker-header", "pass-trough"]
	},
	{
		name: "month-overlay-header",
		use: ["date-picker-header", "pass-trough"]
	},
	{
		name: "year-overlay-header",
		use: ["date-picker-header", "pass-trough"]
	},
	{
		name: "hours-overlay-value",
		use: $t
	},
	{
		name: "hours-overlay-header",
		use: $t
	},
	{
		name: "minutes-overlay-value",
		use: $t
	},
	{
		name: "minutes-overlay-header",
		use: $t
	},
	{
		name: "seconds-overlay-value",
		use: $t
	},
	{
		name: "seconds-overlay-header",
		use: $t
	},
	{
		name: "hours",
		use: [
			"time-input",
			"time-picker",
			"pass-trough"
		]
	},
	{
		name: "minutes",
		use: [
			"time-input",
			"time-picker",
			"pass-trough"
		]
	},
	{
		name: "seconds",
		use: [
			"time-input",
			"time-picker",
			"pass-trough"
		]
	},
	{
		name: "month",
		use: [
			"date-picker-header",
			"time-picker",
			"pass-trough"
		]
	},
	{
		name: "year",
		use: [
			"date-picker-header",
			"time-picker",
			"pass-trough",
			"year-mode"
		]
	},
	{
		name: "action-buttons",
		use: ["action-row"]
	},
	{
		name: "action-preview",
		use: ["action-row"]
	},
	{
		name: "calendar-header",
		use: ["calendar", "pass-trough"]
	},
	{
		name: "marker-tooltip",
		use: ["calendar", "pass-trough"]
	},
	{
		name: "action-extra",
		use: ["menu"]
	},
	{
		name: "time-picker-overlay",
		use: [
			"time-picker",
			"time-picker",
			"pass-trough"
		]
	},
	{
		name: "am-pm-button",
		use: [
			"time-picker",
			"time-input",
			"pass-trough"
		]
	},
	{
		name: "left-sidebar",
		use: ["menu"]
	},
	{
		name: "right-sidebar",
		use: ["menu"]
	},
	{
		name: "month-year",
		use: [
			"date-picker-header",
			"pass-trough",
			"month-picker",
			"year-picker"
		]
	},
	{
		name: "time-picker",
		use: ["date-picker", "pass-trough"]
	},
	{
		name: "action-row",
		use: ["action-row"]
	},
	{
		name: "marker",
		use: ["calendar", "pass-trough"]
	},
	{
		name: "quarter",
		use: ["quarter-picker", "pass-trough"]
	},
	{
		name: "top-extra",
		use: [
			"date-picker-header",
			"pass-trough",
			"month-picker",
			"quarter-picker",
			"year-picker"
		]
	},
	{
		name: "tp-inline-arrow-up",
		use: [
			"date-picker",
			"time-input",
			"time-picker",
			"pass-trough"
		]
	},
	{
		name: "tp-inline-arrow-down",
		use: [
			"date-picker",
			"time-input",
			"time-picker",
			"pass-trough"
		]
	},
	{
		name: "arrow",
		use: ["menu"]
	},
	{
		name: "menu-header",
		use: ["menu"]
	}
];
var tn = (e, t) => en.filter((n) => e[n.name] && n.use.includes(t)).map((e) => e.name);
var nn = (e, t) => en.map((e) => e.name).concat(t?.filter((e) => e.slot).map((e) => e.slot) ?? []).filter((t) => !!e[t]);
var rn = {
	key: 1,
	class: "dp--input-wrap"
};
var an = [
	"id",
	"name",
	"inputmode",
	"placeholder",
	"disabled",
	"readonly",
	"required",
	"value",
	"autocomplete",
	"aria-label",
	"aria-disabled",
	"aria-invalid",
	"aria-expanded",
	"aria-controls"
];
var on = {
	key: 1,
	class: "dp--clear-btn"
};
var sn = ["aria-label"];
var cn = /* @__PURE__ */ defineComponent({
	__name: "DatepickerInput",
	props: { isMenuOpen: {
		type: Boolean,
		default: !1
	} },
	emits: [
		"clear",
		"open",
		"set-input-date",
		"close",
		"select-date",
		"set-empty-date",
		"toggle",
		"focus",
		"blur",
		"real-blur"
	],
	setup(e, { expose: t, emit: n }) {
		let c = n, l = e, { rootEmit: d, inputValue: f, rootProps: p, defaults: { textInput: m, ariaLabels: h, inline: g, config: y, range: b, multiDates: x, ui: S, inputAttrs: C } } = $(), { checkMinMaxRange: T, isValidDate: E } = ht(), { parseFreeInput: D, textPasted: k, createMaskedValue: j, applyMaxValues: M } = Zt(), { checkKeyDown: N, checkStopPropagation: ee } = Wt(), { boolHtmlAttribute: F } = Xt(), te = useTemplateRef("dp-input"), L = ref(null), R = ref(!1), z = computed(() => ({
			"dp--pointer": !p.disabled && !p.readonly && !m.value.enabled,
			"dp--disabled": p.disabled,
			"dp--input-readonly": !m.value.enabled,
			"dp--input": !0,
			"dp--input-not-clearable": !C.value.clearable,
			"dp--input-icon-pad": !C.value.hideInputIcon,
			"dp--input-valid": typeof C.value.state == "boolean" ? C.value.state : !1,
			"dp--input-invalid": typeof C.value.state == "boolean" ? !C.value.state : !1,
			"dp--input-focus": R.value || l.isMenuOpen,
			"dp--input-reg": !m.value.enabled,
			...S.value.input
		})), B = () => {
			c("set-input-date", null), C && p.autoApply && (c("set-empty-date"), L.value = null);
		}, ne = (e) => {
			if (m.value.separators?.length) {
				let t = new RegExp(m.value.separators.map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"));
				return e.split(t);
			}
			return e.split(m.value.rangeSeparator);
		}, re = (e) => {
			let [t, n] = ne(e);
			if (t) {
				let e = D(t.trim(), f.value), r = n ? D(n.trim(), f.value) : void 0;
				if (isAfter(e, r)) return;
				let i = e && r ? [e, r] : [e];
				T(r, i, 0) && (L.value = e ? i : null);
			}
		}, H = () => {
			k.value = !0;
		}, U = (e) => {
			b.value.enabled ? re(e) : x.value.enabled ? L.value = e.split(";").map((e) => D(e.trim())).filter((e) => !!e) : L.value = D(e, f.value);
		}, W = (e) => {
			let t = typeof e == "string" ? e : e.target?.value, n = m?.value?.maskFormat, r = t;
			if (typeof n == "string") {
				let e = [...n.matchAll(/(YYYY|MM|DD|hh|mm|ss)/g)].map((e) => e[0]);
				r = j(M(t.replace(/\D/g, ""), e), n);
			}
			r === "" ? B() : (m.value.openMenu && !l.isMenuOpen && c("open"), U(r), c("set-input-date", L.value)), k.value = !1, f.value = r, d("text-input", e, L.value);
		}, ie = (e) => {
			m.value.enabled ? (U(e.target.value), m.value.enterSubmit && E(L.value) && f.value !== "" ? (c("set-input-date", L.value, !0), L.value = null) : m.value.enterSubmit && f.value === "" && (L.value = null, c("clear"))) : G(e);
		}, ae = (e, t) => {
			m.value.enabled && m.value.tabSubmit && !t && U(e.target.value), m.value.tabSubmit && E(L.value) && f.value !== "" ? (c("set-input-date", L.value, !0, !0), L.value = null) : m.value.tabSubmit && f.value === "" && (L.value = null, c("clear"));
		}, oe = () => {
			R.value = !0, c("focus"), nextTick().then(() => {
				m.value.enabled && m.value.selectOnFocus && te.value?.select();
			});
		}, G = (e) => {
			if (ee(e, y.value, !0), m.value.enabled && m.value.openMenu && !g.value.input) {
				if (m.value.openMenu === "open" && !l.isMenuOpen) return c("open");
				if (m.value.openMenu === "toggle") return c("toggle");
			} else m.value.enabled || c("toggle");
		}, K = () => {
			c("real-blur"), R.value = !1, (!l.isMenuOpen || g.value.enabled && g.value.input) && c("blur"), (p.autoApply && m.value.enabled && L.value && !l.isMenuOpen || m.value.applyOnBlur) && (c("set-input-date", L.value), c("select-date"), L.value = null);
		}, q = (e) => {
			ee(e, y.value, !0), c("clear");
		}, J = () => {
			c("close");
		}, se = (e) => {
			if (e.key === "Tab" && ae(e), e.key === "Enter" && (ie(e), y.value.allowPreventDefault && (e.preventDefault(), ee(e, y.value, !0))), e.key === "Escape" && m.value.escClose && J(), !m.value.enabled) {
				if (e.code === "Tab") return;
				e.preventDefault();
			}
		}, ce = () => {
			te.value?.focus({ preventScroll: !0 });
		}, le = (e) => {
			L.value = e;
		}, ue = (e) => {
			e.key === Q.tab && ae(e, !0);
		};
		return t({
			focusInput: ce,
			setParsedDate: le
		}), (t, n) => (openBlock(), createElementBlock("div", { onClick: G }, [!t.$slots["dp-input"] && !unref(g).enabled ? renderSlot(t.$slots, "trigger", { key: 0 }) : createCommentVNode("", !0), !t.$slots.trigger && (!unref(g).enabled || unref(g).input) ? (openBlock(), createElementBlock("div", rn, [
			!t.$slots.trigger && (!unref(g).enabled || unref(g).enabled && unref(g).input) ? renderSlot(t.$slots, "dp-input", {
				key: 0,
				value: unref(f),
				isMenuOpen: e.isMenuOpen,
				onInput: W,
				onEnter: ie,
				onTab: ae,
				onClear: q,
				onBlur: K,
				onKeypress: se,
				onPaste: H,
				onFocus: oe,
				openMenu: () => t.$emit("open"),
				closeMenu: () => t.$emit("close"),
				toggleMenu: () => t.$emit("toggle")
			}, () => [createBaseVNode("input", {
				id: unref(C).id,
				ref: "dp-input",
				"data-test-id": "dp-input",
				name: unref(C).name,
				class: normalizeClass(z.value),
				inputmode: unref(C).inputmode,
				placeholder: unref(p).placeholder,
				disabled: unref(F)(unref(p).disabled),
				readonly: unref(F)(unref(p).readonly),
				required: unref(F)(unref(C).required),
				value: unref(f),
				autocomplete: unref(C).autocomplete,
				"aria-label": unref(h).input,
				"aria-disabled": unref(p).disabled || void 0,
				"aria-invalid": unref(C).state === !1 ? !0 : void 0,
				role: "combobox",
				"aria-haspopup": "dialog",
				"aria-expanded": e.isMenuOpen,
				"aria-controls": unref(p).menuId,
				onInput: W,
				onBlur: K,
				onFocus: oe,
				onKeypress: se,
				onKeydown: n[0] ||= (e) => se(e),
				onPaste: H,
				onInvalid: n[1] ||= (e) => unref(d)("invalid", e)
			}, null, 42, an)]) : createCommentVNode("", !0),
			createBaseVNode("div", { onClick: n[4] ||= (e) => c("toggle") }, [t.$slots["input-icon"] && !unref(C).hideInputIcon ? (openBlock(), createElementBlock("span", {
				key: 0,
				class: "dp--input-icon",
				onClick: n[2] ||= (e) => c("toggle")
			}, [renderSlot(t.$slots, "input-icon")])) : createCommentVNode("", !0), !t.$slots["input-icon"] && !unref(C).hideInputIcon && !t.$slots["dp-input"] ? (openBlock(), createBlock(unref(Ke), {
				key: 1,
				"aria-label": unref(h)?.calendarIcon,
				class: "dp--input-icon dp--input-icons",
				onClick: n[3] ||= (e) => c("toggle")
			}, null, 8, ["aria-label"])) : createCommentVNode("", !0)]),
			t.$slots["clear-icon"] && (unref(C).alwaysClearable || unref(f) && unref(C).clearable && !unref(p).disabled && !unref(p).readonly) ? (openBlock(), createElementBlock("span", on, [renderSlot(t.$slots, "clear-icon", { clear: q })])) : createCommentVNode("", !0),
			!t.$slots["clear-icon"] && (unref(C).alwaysClearable || unref(C).clearable && unref(f) && !unref(p).disabled && !unref(p).readonly) ? (openBlock(), createElementBlock("button", {
				key: 2,
				"aria-label": unref(h)?.clearInput,
				class: "dp--clear-btn",
				type: "button",
				"data-test-id": "clear-input-value-btn",
				onKeydown: n[5] ||= (e) => unref(N)(e, () => q(e), !0, unref(y).spaceConfirm, ue),
				onClick: n[6] ||= withModifiers((e) => q(e), ["prevent"])
			}, [createVNode(unref(qe), { class: "dp--input-icons" })], 40, sn)) : createCommentVNode("", !0)
		])) : createCommentVNode("", !0)]));
	}
});
var ln = (e) => {
	let { rootProps: t, modelValue: n, getDate: r, defaults: { range: i, multiDates: a } } = $(), { isDateBefore: o } = Gt(), s = () => {
		let e = r();
		return t.actionRow?.nowBtnRound && (e = roundToNearestMinutes(e, {
			roundingMethod: t.actionRow.nowBtnRound.rounding ?? "ceil",
			nearestTo: t.actionRow.nowBtnRound.roundTo ?? 15
		})), e;
	}, c = () => {
		let e = s();
		!i.value.enabled && !a.value.enabled ? n.value = e : n.value && Array.isArray(n.value) && n.value[0] ? a.value.enabled ? n.value = [...n.value, e] : n.value = o(e, n.value[0]) ? [e, n.value[0]] : [n.value[0], e] : n.value = [e], l();
	}, l = () => {
		t.autoApply && e && e("select-date");
	};
	return {
		selectCurrentDate: c,
		selectOnAutoApply: l
	};
};
var un = {
	ref: "action-row",
	class: "dp--action-row"
};
var dn = ["title"];
var fn = {
	ref: "action-buttons-container",
	class: "dp--action-buttons",
	"data-dp-element": "action-row"
};
var pn = ["disabled"];
var mn = /* @__PURE__ */ defineComponent({
	__name: "ActionRow",
	props: {
		menuMount: {
			type: Boolean,
			default: !1
		},
		calendarWidth: { default: 0 }
	},
	emits: [
		"close-picker",
		"select-date",
		"select-now"
	],
	setup(t, { emit: n }) {
		let i = n, c = t, { rootEmit: u, rootProps: d, modelValue: f, defaults: { actionRow: p, multiCalendars: m, inline: h, range: g, multiDates: _, formats: v } } = $(), { selectCurrentDate: y } = ln(i), { isTimeValid: x, isMonthValid: T } = ht(), { formatPreview: E } = qt(), { checkKeyDown: D, convertType: k } = Wt(), { boolHtmlAttribute: j } = Xt(), N = useTemplateRef("action-buttons-container"), ee = useTemplateRef("action-row"), F = ref(!1), te = ref({});
		onMounted(() => {
			L(), globalThis.addEventListener("resize", L);
		}), onUnmounted(() => {
			globalThis.removeEventListener("resize", L);
		});
		let L = () => {
			F.value = !1, setTimeout(() => {
				let e = N.value?.getBoundingClientRect(), t = ee.value?.getBoundingClientRect();
				e && t && (te.value.maxWidth = `${t.width - e.width - 20}px`), F.value = !0;
			}, 0);
		}, R = computed(() => g.value.enabled && !g.value.partialRange && f.value ? f.value.length === 2 : !0), z = computed(() => !x.value(f.value) || !T.value(f.value) || !R.value), B = () => {
			let e = v.value.preview;
			return d.timePicker || d.monthPicker, e(k(f.value));
		}, V = () => {
			let e = f.value;
			return m.value.count > 0 ? `${E(e[0])} - ${E(e[1])}` : [E(e[0]), E(e[1])];
		}, ne = computed(() => !f.value || !c.menuMount ? "" : typeof v.value.preview == "string" ? Array.isArray(f.value) ? f.value.length === 2 && f.value[1] ? V() : _.value.enabled ? f.value.map((e) => `${E(e)}`) : d.modelAuto ? `${E(f.value[0])}` : `${E(f.value[0])} -` : E(f.value) : B()), re = () => _.value.enabled ? "; " : " - ", H = computed(() => Array.isArray(ne.value) ? ne.value.join(re()) : ne.value), U = () => {
			x.value(f.value) && T.value(f.value) && R.value ? i("select-date") : u("invalid-select");
		};
		return (t, n) => (openBlock(), createElementBlock("div", un, [t.$slots["action-row"] ? renderSlot(t.$slots, "action-row", {
			key: 0,
			modelValue: unref(f),
			disabled: z.value,
			selectDate: () => t.$emit("select-date"),
			closePicker: () => t.$emit("close-picker")
		}) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [unref(p).showPreview ? (openBlock(), createElementBlock("div", {
			key: 0,
			class: "dp--selection-preview",
			title: H.value || void 0,
			style: normalizeStyle(te.value)
		}, [t.$slots["action-preview"] && F.value ? renderSlot(t.$slots, "action-preview", {
			key: 0,
			value: unref(f),
			formatValue: H.value
		}) : createCommentVNode("", !0), !t.$slots["action-preview"] && F.value ? (openBlock(), createElementBlock(Fragment, { key: 1 }, [createTextVNode(toDisplayString(H.value), 1)], 64)) : createCommentVNode("", !0)], 12, dn)) : createCommentVNode("", !0), createBaseVNode("div", fn, [t.$slots["action-buttons"] ? renderSlot(t.$slots, "action-buttons", {
			key: 0,
			value: unref(f),
			selectDate: U,
			selectionDisabled: z.value
		}) : createCommentVNode("", !0), t.$slots["action-buttons"] ? createCommentVNode("", !0) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
			!unref(h).enabled && unref(p).showCancel ? (openBlock(), createElementBlock("button", {
				key: 0,
				ref: "cancel-btn",
				type: "button",
				"data-dp-action-element": "0",
				class: "dp--action-button dp--action-cancel",
				onClick: n[0] ||= (e) => t.$emit("close-picker"),
				onKeydown: n[1] ||= (e) => unref(D)(e, () => t.$emit("close-picker"))
			}, toDisplayString(unref(p).cancelBtnLabel), 545)) : createCommentVNode("", !0),
			unref(p).showNow ? (openBlock(), createElementBlock("button", {
				key: 1,
				type: "button",
				"data-dp-action-element": "0",
				class: "dp--action-button dp--action-cancel",
				onClick: n[2] ||= (...e) => unref(y) && unref(y)(...e),
				onKeydown: n[3] ||= (e) => unref(D)(e, () => unref(y)())
			}, toDisplayString(unref(p).nowBtnLabel), 33)) : createCommentVNode("", !0),
			unref(p).showSelect ? (openBlock(), createElementBlock("button", {
				key: 2,
				ref: "select-btn",
				type: "button",
				"data-dp-action-element": "0",
				class: "dp--action-button dp--action-select",
				disabled: unref(j)(z.value),
				"data-test-id": "select-button",
				onKeydown: n[4] ||= (e) => unref(D)(e, () => U()),
				onClick: U
			}, toDisplayString(unref(p).selectBtnLabel), 41, pn)) : createCommentVNode("", !0)
		], 64))], 512)], 64))], 512));
	}
});
var hn = () => {
	let { rootProps: e, defaults: { multiCalendars: t } } = $();
	return {
		hideNavigationButtons: computed(() => (t) => e.hideNavigation?.includes(t)),
		showLeftIcon: computed(() => (e) => t.value.count ? t.value.solo ? !0 : e === 0 : !0),
		showRightIcon: computed(() => (e) => t.value.count ? t.value.solo ? !0 : e === t.value.count - 1 : !0)
	};
};
var gn = ["role", "tabindex"];
var _n = {
	ref: "header",
	class: "dp--selection-grid-header"
};
var vn = ["aria-label"];
var yn = [
	"aria-label",
	"aria-selected",
	"aria-disabled",
	"data-dp-action-element",
	"data-dp-element-active",
	"data-test-id",
	"onClick",
	"onKeydown",
	"onMouseover"
];
var bn = ["aria-label", "data-dp-action-element"];
var xn = /* @__PURE__ */ defineComponent({
	__name: "SelectionOverlay",
	props: {
		items: {},
		type: {},
		useRelative: { type: Boolean },
		height: {},
		overlayLabel: {},
		isLast: { type: Boolean },
		level: {}
	},
	emits: [
		"selected",
		"toggle",
		"hover-value"
	],
	setup(t, { emit: n }) {
		let i = n, c = t, { setState: u, defaults: { ariaLabels: d, config: f } } = $(), { hideNavigationButtons: p } = hn(), { handleEventPropagation: m, checkKeyDown: h } = Wt(), g = useTemplateRef("toggle-button"), y = useTemplateRef("header"), T = useTemplateRef("overlay-container"), E = useTemplateRef("grid-wrap"), D = /* @__PURE__ */ useTemplateRefsList(), j = ref(!1), N = ref(null), ee = ref(), F = ref(0);
		onBeforeUpdate(() => {
			N.value = null;
		}), onMounted(async () => {
			await nextTick(), ie(), u("arrowNavigationLevel", c.level ?? 1);
		}), onUnmounted(() => {
			u("arrowNavigationLevel", (c.level ?? 1) - 1);
		});
		let R = computed(() => ({
			"dp--overlay": !0,
			"dp--overlay-absolute": !c.useRelative,
			"dp--overlay-relative": c.useRelative
		})), B = computed(() => c.useRelative ? {
			height: `${c.height}px`,
			width: "var(--dp-menu-min-width)"
		} : void 0), ne = computed(() => ({ "dp--overlay-col": !0 })), H = computed(() => ({
			"dp--btn-base dp--bg-none": !0,
			"dp--button": !0,
			"dp--overlay-action": !0,
			"dp--over-action-scroll": j.value,
			"dp--button-bottom": c.isLast
		})), W = computed(() => ({
			"dp--overlay-container": !0,
			"dp--container-flex": c.items?.length <= 6,
			"dp--container-block": c.items?.length > 6
		}));
		watch(() => c.items, () => ie(!1), { deep: !0 });
		let ie = (e = !0) => {
			nextTick().then(() => {
				let t = unrefElement(E), n = unrefElement(g), r = unrefElement(T), i = unrefElement(y), a = n ? n.getBoundingClientRect().height : 0;
				t && (t.getBoundingClientRect().height ? F.value = t.getBoundingClientRect().height - a - (i?.getBoundingClientRect().height ?? 0) : F.value = f.value.modeHeight - a - (i?.getBoundingClientRect().height ?? 0));
				let o = D.value?.find((e) => {
					let { dpElementActive: t } = e.dataset;
					return t === `${c.level ?? 1}`;
				});
				o && r && e && (r.scrollTop = o.offsetTop - r.offsetTop - (F.value / 2 - o.getBoundingClientRect().height) - a);
			});
		}, ae = (e) => {
			e.disabled || i("selected", e.value);
		}, oe = () => {
			i("toggle");
		}, G = (e) => {
			f.value.escClose && (oe(), m(e, f.value));
		}, K = (e) => {
			ee.value = e, i("hover-value", e);
		}, q = (e) => {
			if (e.key === Q.esc) return G(e);
		}, J = (e) => {
			if (e.key === Q.enter) return oe();
		};
		return (n, r) => (openBlock(), createElementBlock("div", {
			ref: "grid-wrap",
			class: normalizeClass(R.value),
			style: normalizeStyle(B.value),
			role: t.useRelative ? void 0 : "presentation",
			tabindex: t.useRelative ? void 0 : "0",
			onKeydown: q,
			onClick: r[0] ||= withModifiers(() => {}, ["prevent"])
		}, [
			createBaseVNode("div", _n, [renderSlot(n.$slots, "header")], 512),
			createBaseVNode("div", {
				ref: "overlay-container",
				"aria-label": t.overlayLabel,
				class: normalizeClass(W.value),
				style: normalizeStyle({ "--dp-overlay-height": `${F.value}px` }),
				role: "listbox"
			}, [renderSlot(n.$slots, "overlay", {}, () => [(openBlock(!0), createElementBlock(Fragment, null, renderList(t.items, (r, i) => (openBlock(), createElementBlock("div", {
				key: i,
				class: normalizeClass(["dp--overlay-row", { "dp--flex-row": t.items.length >= 3 }]),
				role: "presentation"
			}, [(openBlock(!0), createElementBlock(Fragment, null, renderList(r, (e) => (openBlock(), createElementBlock("div", {
				key: e.value,
				ref_for: !0,
				ref_key: "colRefs",
				ref: D,
				role: "option",
				class: normalizeClass(ne.value),
				"aria-label": e.ariaLabel ?? e.text,
				"aria-selected": e.active || void 0,
				"aria-disabled": e.disabled || void 0,
				"data-dp-action-element": t.level ?? 1,
				"data-dp-element-active": e.active ? t.level ?? 1 : void 0,
				tabindex: "0",
				"data-test-id": e.text,
				onClick: withModifiers((t) => ae(e), ["prevent"]),
				onKeydown: (t) => unref(h)(t, () => ae(e), !0),
				onMouseover: (t) => K(e.value)
			}, [createBaseVNode("div", { class: normalizeClass(e.className) }, [renderSlot(n.$slots, "item", { item: e }, () => [createTextVNode(toDisplayString(e.text), 1)])], 2)], 42, yn))), 128))], 2))), 128))])], 14, vn),
			n.$slots["button-icon"] ? withDirectives((openBlock(), createElementBlock("button", {
				key: 0,
				ref: "toggle-button",
				type: "button",
				"aria-label": unref(d)?.toggleOverlay,
				class: normalizeClass(H.value),
				tabindex: "0",
				"data-dp-action-element": t.level ?? 1,
				onClick: oe,
				onKeydown: J
			}, [renderSlot(n.$slots, "button-icon")], 42, bn)), [[vShow, !unref(p)(t.type)]]) : createCommentVNode("", !0)
		], 46, gn));
	}
});
var Sn = ["data-dp-mobile"];
var Cn = /* @__PURE__ */ defineComponent({
	__name: "InstanceWrap",
	props: {
		stretch: { type: Boolean },
		collapse: { type: Boolean }
	},
	setup(e) {
		let { defaults: { multiCalendars: t } } = $(), { isMobile: n } = Kt(), i = computed(() => t.value.count > 0 ? [...Array.from({ length: t.value.count }).keys()] : [0]);
		return (r, a) => (openBlock(), createElementBlock("div", {
			class: normalizeClass({
				"dp--menu-inner": !e.stretch,
				"dp--menu--inner-stretched": e.stretch,
				"dp--flex-display": unref(t).count > 0,
				"dp--flex-display-collapsed": e.collapse
			}),
			"data-dp-mobile": unref(n)
		}, [renderSlot(r.$slots, "default", {
			instances: i.value,
			wrapClass: { "dp--instance-calendar": unref(t).count > 0 }
		})], 10, Sn));
	}
});
var wn = [
	"data-dp-element",
	"tabindex",
	"inert",
	"aria-hidden",
	"disabled",
	"aria-label",
	"aria-disabled"
];
var Tn = /* @__PURE__ */ defineComponent({
	__name: "ArrowBtn",
	props: {
		ariaLabel: {},
		elName: {},
		disabled: { type: Boolean },
		inactive: { type: Boolean }
	},
	emits: ["activate", "set-ref"],
	setup(e, { emit: t }) {
		let { boolHtmlAttribute: n } = Xt(), { checkKeyDown: r } = Wt(), i = t;
		return (t, a) => (openBlock(), createElementBlock("button", {
			ref: "arrow-btn",
			type: "button",
			"data-dp-element": e.elName,
			"data-dp-action-element": "0",
			class: "dp--btn-base dp--bg-none dp--arrow-btn-nav",
			tabindex: e.inactive ? -1 : 0,
			inert: e.inactive || void 0,
			"aria-hidden": e.inactive || void 0,
			disabled: unref(n)(e.disabled),
			"aria-label": e.ariaLabel,
			"aria-disabled": unref(n)(e.disabled),
			onClick: a[0] ||= (e) => i("activate"),
			onKeydown: a[1] ||= (e) => unref(r)(e, () => i("activate"), !0)
		}, [createBaseVNode("span", { class: normalizeClass(["dp--inner-nav", { "dp--inner-nav-disabled": e.disabled }]) }, [renderSlot(t.$slots, "default")], 2)], 40, wn));
	}
});
var En = [
	"aria-label",
	"data-test-id",
	"aria-expanded"
];
var Dn = /* @__PURE__ */ defineComponent({
	__name: "YearModePicker",
	props: {
		items: {},
		instance: {},
		year: {},
		showYearPicker: {
			type: Boolean,
			default: !1
		},
		isDisabled: {}
	},
	emits: [
		"handle-year",
		"year-select",
		"toggle-year-picker"
	],
	setup(t, { emit: d }) {
		let f = d, p = t, { showRightIcon: m, showLeftIcon: h } = hn(), { rootProps: g, defaults: { config: _, ariaLabels: y, ui: b } } = $(), { showTransition: x, transitionName: S } = pt(), { formatYear: C } = qt(), { boolHtmlAttribute: T } = Xt(), E = ref(!1), D = computed(() => C(p.year)), k = (e) => {
			E.value = !E.value, f("toggle-year-picker", { show: e });
		}, j = (e) => {
			E.value = !1, f("year-select", e);
		}, N = (e = !1) => {
			f("handle-year", e);
		};
		return (r, d) => (openBlock(), createElementBlock(Fragment, null, [createBaseVNode("div", { class: normalizeClass(["dp--year-mode-picker", { "dp--hidden-el": E.value }]) }, [
			unref(h)(t.instance) ? (openBlock(), createBlock(Tn, {
				key: 0,
				ref: "mpPrevIconRef",
				"aria-label": unref(y)?.prevYear,
				disabled: unref(T)(t.isDisabled(!1)),
				class: normalizeClass(unref(b)?.navBtnPrev),
				onActivate: d[0] ||= (e) => N(!1)
			}, {
				default: withCtx(() => [r.$slots["arrow-left"] ? renderSlot(r.$slots, "arrow-left", { key: 0 }) : createCommentVNode("", !0), r.$slots["arrow-left"] ? createCommentVNode("", !0) : (openBlock(), createBlock(unref(Je), { key: 1 }))]),
				_: 3
			}, 8, [
				"aria-label",
				"disabled",
				"class"
			])) : createCommentVNode("", !0),
			createBaseVNode("button", {
				ref: "mpYearButtonRef",
				class: "dp--btn-base dp--bg-none dp--month-year-select-base dp--year-select",
				type: "button",
				"aria-label": `${t.year}-${unref(y)?.openYearsOverlay}`,
				"data-test-id": `year-mode-btn-${t.instance}`,
				"aria-haspopup": "dialog",
				"aria-expanded": t.showYearPicker,
				"data-dp-action-element": "0",
				onClick: d[1] ||= () => k(),
				onKeydown: d[2] ||= withKeys(withModifiers(() => k(), ["prevent"]), ["enter"])
			}, [r.$slots.year ? renderSlot(r.$slots, "year", {
				key: 0,
				text: D.value,
				value: t.year
			}) : createCommentVNode("", !0), r.$slots.year ? createCommentVNode("", !0) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [createTextVNode(toDisplayString(t.year), 1)], 64))], 40, En),
			unref(m)(t.instance) ? (openBlock(), createBlock(Tn, {
				key: 1,
				ref: "mpNextIconRef",
				"aria-label": unref(y)?.nextYear,
				disabled: unref(T)(t.isDisabled(!0)),
				class: normalizeClass(unref(b)?.navBtnNext),
				onActivate: d[3] ||= (e) => N(!0)
			}, {
				default: withCtx(() => [r.$slots["arrow-right"] ? renderSlot(r.$slots, "arrow-right", { key: 0 }) : createCommentVNode("", !0), r.$slots["arrow-right"] ? createCommentVNode("", !0) : (openBlock(), createBlock(unref(Ye), { key: 1 }))]),
				_: 3
			}, 8, [
				"aria-label",
				"disabled",
				"class"
			])) : createCommentVNode("", !0)
		], 2), createVNode(Transition, {
			name: unref(S)(t.showYearPicker),
			css: unref(x)
		}, {
			default: withCtx(() => [t.showYearPicker ? (openBlock(), createBlock(xn, {
				key: 0,
				items: t.items,
				"is-last": unref(g).autoApply && !unref(_).keepActionRow,
				"overlay-label": unref(y)?.yearPicker?.(!0),
				type: "year",
				onToggle: k,
				onSelected: d[4] ||= (e) => j(e)
			}, createSlots({
				"button-icon": withCtx(() => [r.$slots["calendar-icon"] ? renderSlot(r.$slots, "calendar-icon", { key: 0 }) : createCommentVNode("", !0), r.$slots["calendar-icon"] ? createCommentVNode("", !0) : (openBlock(), createBlock(unref(Ke), { key: 1 }))]),
				_: 2
			}, [r.$slots["year-overlay-value"] ? {
				name: "item",
				fn: withCtx(({ item: e }) => [renderSlot(r.$slots, "year-overlay-value", {
					text: e.text,
					value: e.value
				})]),
				key: "0"
			} : void 0]), 1032, [
				"items",
				"is-last",
				"overlay-label"
			])) : createCommentVNode("", !0)]),
			_: 3
		}, 8, ["name", "css"])], 64));
	}
});
var On = () => {
	let { getDate: e, rootEmit: t, state: n, month: i, year: a, modelValue: o, calendars: s, rootProps: c, defaults: { multiCalendars: l, range: u, safeDates: d, filters: f, highlight: p } } = $(), { resetDate: m, getYearFromDate: h, checkHighlightYear: g, groupListAndMap: _ } = Gt(), { getYears: v } = Jt(), { validateMonthYear: y, checkMinMaxValue: b } = ht(), x = ref([!1]), C = computed(() => v()), w = computed(() => (t, n) => {
		let r = set(m(e()), {
			month: i.value(t),
			year: a.value(t)
		});
		return y(n ? endOfYear(r) : startOfYear(r), c.preventMinMaxNavigation, n);
	}), T = () => Array.isArray(o.value) && l.value.solo && o.value[1], E = () => {
		for (let t = 0; t < l.value.count; t++) if (t === 0) s.value[t] = s.value[0];
		else if (t === l.value.count - 1 && T()) s.value[t] = {
			month: getMonth(o.value[1]),
			year: getYear(o.value[1])
		};
		else {
			let n = set(e(), s.value[t - 1]);
			s.value[t] = {
				month: getMonth(n),
				year: getYear(addYears(n, 1))
			};
		}
	}, D = (t) => {
		if (!t) return E();
		let n = set(e(), s.value[t]);
		return s.value[0].year = getYear(subYears(n, l.value.count - 1)), E();
	}, k = (e, t) => {
		let n = differenceInYears(t, e);
		return u.value.showLastInRange && n > 1 ? t : e;
	}, A = (e) => c.focusStartDate || l.value.solo ? e[0] : e[1] ? k(e[0], e[1]) : e[0], j = () => {
		if (o.value) {
			let e = Array.isArray(o.value) ? A(o.value) : o.value;
			s.value[0] = {
				month: getMonth(e),
				year: getYear(e)
			};
		}
	}, M = () => {
		j(), l.value.count && E();
	};
	watch(o, (e, t) => {
		n.isTextInputDate && JSON.stringify(e ?? {}) !== JSON.stringify(t ?? {}) && M();
	}), onMounted(() => {
		M();
	});
	let N = (e, n) => {
		s.value[n].year = e, t("update-month-year", {
			instance: n,
			year: e,
			month: s.value[n].month
		}), l.value.count && !l.value.solo && D(n);
	}, ee = computed(() => (e) => _(C.value, (t) => ({
		active: a.value(e) === t.value,
		disabled: b(t.value, h(d.value.minDate), h(d.value.maxDate)) || f.value.years?.includes(t.value),
		highlighted: g(p.value, t.value)
	}))), P = (e, t) => {
		N(e, t), I(t);
	}, F = (e, t = !1) => {
		w.value(e, t) || N(t ? a.value(e) + 1 : a.value(e) - 1, e);
	}, I = (e, n) => {
		n === void 0 ? x.value[e] = !x.value[e] : x.value[e] = n, x.value[e] ? t("overlay-toggle", {
			open: !0,
			overlay: rt.year
		}) : t("overlay-toggle", {
			open: !1,
			overlay: rt.year
		});
	};
	return {
		isDisabled: w,
		groupedYears: ee,
		showYearPicker: x,
		selectYear: N,
		setStartDate: () => {
			c.startDate && (o.value && c.focusStartDate || !o.value) && N(getYear(e(c.startDate)), 0);
		},
		toggleYearPicker: I,
		handleYearSelect: P,
		handleYear: F
	};
};
var kn = () => {
	let { isDateAfter: e, isDateBefore: t, isDateEqual: n } = Gt(), { getDate: r, rootEmit: i, rootProps: a, modelValue: o, defaults: { range: s } } = $();
	return {
		getRangeWithFixedDate: (r) => Array.isArray(o.value) && (o.value.length === 2 || o.value.length === 1 && s.value.partialRange) ? s.value.fixedStart && (e(r, o.value[0]) || n(r, o.value[0])) ? [o.value[0], r] : s.value.fixedEnd && (t(r, o.value[1]) || n(r, o.value[1])) ? [r, o.value[1]] : (i("invalid-fixed-range", r), o.value) : [],
		setPresetDate: (e) => {
			Array.isArray(e.value) && e.value.length <= 2 && s.value.enabled ? o.value = e.value.map((e) => r(e)) : Array.isArray(e.value) || (o.value = r(e.value));
		},
		checkRangeAutoApply: (e, t, n) => {
			s && (e[0] && e[1] && a.autoApply && t("auto-apply", n), e[0] && !e[1] && (a.modelAuto || s.value.partialRange) && a.autoApply && t("auto-apply", n));
		},
		setMonthOrYearRange: (e) => {
			let n = o.value ? o.value.slice() : [];
			return n.length === 2 && n[1] !== null && (n = []), n.length ? (t(e, n[0]) ? n.unshift(e) : n[1] = e, i("range-end", e)) : (n = [e], i("range-start", e)), n;
		},
		handleMultiDatesSelect: (e, t) => {
			if (o.value && Array.isArray(o.value)) if (o.value.some((t) => n(e, t))) {
				let t = o.value.filter((t) => !n(t, e));
				o.value = t.length ? t : null;
			} else (t && +t > o.value.length || !t) && o.value.push(e);
			else o.value = [e];
		}
	};
};
var An = (e) => {
	let { getDate: t, rootEmit: n, state: i, calendars: a, year: o, modelValue: s, rootProps: c, defaults: { range: l, highlight: u, safeDates: d, filters: f, multiDates: p } } = $();
	mt(() => {
		i.isTextInputDate && z(getYear(t(c.startDate)), 0);
	});
	let { checkMinMaxRange: m, checkMinMaxValue: h } = ht(), { isDateBetween: g, resetDateTime: v, resetDate: y, getMinMonth: b, getMaxMonth: x, checkHighlightMonth: C, groupListAndMap: w } = Gt(), { checkRangeAutoApply: T, getRangeWithFixedDate: E, handleMultiDatesSelect: D, setMonthOrYearRange: k, setPresetDate: A } = kn(), { padZero: j } = Wt(), { getMonths: M, isOutOfYearRange: N } = Jt(), { updateFlowStep: ee, childMount: P } = ut(), F = computed(() => M()), I = ref(null), { groupedYears: te, showYearPicker: L, isDisabled: R, selectYear: z, toggleYearPicker: B, handleYearSelect: V, handleYear: ne, setStartDate: re } = On();
	onMounted(() => {
		P(), re();
	});
	let H = (e) => e ? {
		month: getMonth(e),
		year: getYear(e)
	} : {
		month: null,
		year: null
	}, U = () => s.value ? Array.isArray(s.value) ? s.value.map((e) => H(e)) : H(s.value) : H(), W = (e, t) => {
		let n = a.value[e], r = U();
		return Array.isArray(r) ? r.some((e) => e.year === n?.year && e.month === t) : n?.year === r.year && t === r.month;
	}, ie = (e, t, n) => {
		let r = U();
		return Array.isArray(r) ? o.value(t) === r[n]?.year && e === r[n]?.month : !1;
	}, ae = (e, n) => {
		if (l.value.enabled) {
			let r = U();
			if (Array.isArray(s.value) && Array.isArray(r)) {
				let r = ie(e, n, 0) || ie(e, n, 1), i = set(y(t()), {
					month: e,
					year: o.value(n)
				});
				return g(s.value, I.value, i) && !r;
			}
			return !1;
		}
		return !1;
	}, oe = computed(() => (e) => w(F.value, (t) => {
		let n = W(e, t.value), r = format(G(t.value, e), "MMMM", { locale: c.locale });
		return {
			active: n,
			disabled: h(t.value, b(o.value(e), d.value.minDate), x(o.value(e), d.value.maxDate)) || fe(d.value.disabledDates, o.value(e), t.value) || f.value.months?.includes(t.value) || !pe(d.value.allowedDates, o.value(e), t.value) || N(o.value(e)),
			isBetween: ae(t.value, e),
			highlighted: C(u.value, t.value, o.value(e)),
			ariaLabel: r
		};
	})), G = (e, n) => set(y(t()), {
		month: e,
		year: o.value(n)
	}), K = (n, r) => {
		s.value = set(s.value ? s.value : y(t()), {
			month: n,
			year: o.value(r)
		}), e("auto-apply"), ee("month");
	}, q = (t, n) => {
		let r = G(t, n);
		l.value.fixedEnd || l.value.fixedStart ? s.value = E(r) : s.value ? m(r, s.value) && (s.value = k(G(t, n))) : s.value = [G(t, n)], nextTick().then(() => {
			T(s.value, e, s.value.length < 2);
		});
	}, J = (t, n) => {
		D(G(t, n), p.value.limit), e("auto-apply", !0);
	}, se = (e, t) => (a.value[t].month = e, le(t, a.value[t].year, e), p.value.enabled ? J(e, t) : l.value.enabled ? q(e, t) : K(e, t)), ce = (e, t) => {
		z(e, t), le(t, e, null);
	}, le = (e, t, r) => {
		let i = r;
		if (!i && i !== 0) {
			let t = U();
			i = Array.isArray(t) ? t[e].month : t.month;
		}
		n("update-month-year", {
			instance: e,
			year: t,
			month: i
		});
	}, ue = (e, t) => {
		I.value = G(e, t);
	}, de = (t) => {
		A({ value: t }), e("auto-apply");
	}, fe = (e, n, r) => {
		if (e instanceof Map) {
			let t = `${j(r + 1)}-${n}`;
			return e.size ? e.has(t) : !1;
		}
		return typeof e == "function" ? e(v(set(t(), {
			month: r,
			year: n
		}), !0)) : !1;
	}, pe = (e, t, n) => {
		if (e instanceof Map) {
			let r = `${j(n + 1)}-${t}`;
			return e.size ? e.has(r) : !0;
		}
		return !0;
	};
	return {
		groupedMonths: oe,
		groupedYears: te,
		year: o,
		isDisabled: R,
		showYearPicker: L,
		modelValue: s,
		toggleYearPicker: B,
		handleYearSelect: V,
		handleYear: ne,
		presetDate: de,
		setHoverDate: ue,
		selectMonth: se,
		selectYear: ce,
		getModelMonthYear: U
	};
};
var jn = /* @__PURE__ */ defineComponent({
	__name: "MonthPicker",
	props: {
		collapse: { type: Boolean },
		menuWrapRef: {},
		noOverlayFocus: { type: Boolean }
	},
	emits: ["auto-apply"],
	setup(t, { expose: n, emit: r }) {
		let s = r, l = useSlots(), { rootProps: d, defaults: { config: f } } = $(), p = tn(l, Qt.YearMode), { groupedMonths: m, groupedYears: h, year: _, isDisabled: y, showYearPicker: b, modelValue: x, presetDate: S, setHoverDate: C, selectMonth: T, selectYear: E, toggleYearPicker: D, handleYearSelect: O, handleYear: j, getModelMonthYear: M } = An(s);
		return n({
			getSidebarProps: () => ({
				modelValue: x,
				year: _,
				getModelMonthYear: M,
				selectMonth: T,
				selectYear: E,
				handleYear: j
			}),
			presetDate: S,
			toggleYearPicker: (e) => D(0, e)
		}), (n, r) => (openBlock(), createBlock(Cn, {
			collapse: t.collapse,
			stretch: ""
		}, {
			default: withCtx(({ instances: r, wrapClass: i }) => [(openBlock(!0), createElementBlock(Fragment, null, renderList(r, (e) => (openBlock(), createElementBlock("div", {
				key: e,
				class: normalizeClass(i)
			}, [n.$slots["top-extra"] ? renderSlot(n.$slots, "top-extra", {
				key: 0,
				value: unref(x)
			}) : createCommentVNode("", !0), renderSlot(n.$slots, "month-year", mergeProps({ ref_for: !0 }, {
				mode: "month",
				year: unref(_),
				months: unref(m)(e),
				years: unref(h)(e),
				selectMonth: unref(T),
				selectYear: unref(E),
				instance: e
			}), () => [createVNode(xn, {
				items: unref(m)(e),
				"is-last": unref(d).autoApply && !unref(f).keepActionRow,
				height: unref(f).modeHeight,
				"no-overlay-focus": !!(t.noOverlayFocus || unref(d).textInput),
				"use-relative": "",
				level: 0,
				type: "month",
				onSelected: (t) => unref(T)(t, e),
				onHoverValue: (t) => unref(C)(t, e)
			}, createSlots({
				header: withCtx(() => [createVNode(Dn, {
					items: unref(h)(e),
					instance: e,
					"show-year-picker": unref(b)[e],
					year: unref(_)(e),
					"is-disabled": (t) => unref(y)(e, t),
					onHandleYear: (t) => unref(j)(e, t),
					onYearSelect: (t) => unref(O)(t, e),
					onToggleYearPicker: (t) => unref(D)(e, t?.show)
				}, createSlots({ _: 2 }, [renderList(unref(p), (e) => ({
					name: e,
					fn: withCtx((t) => [renderSlot(n.$slots, e, mergeProps({ ref_for: !0 }, t))])
				}))]), 1032, [
					"items",
					"instance",
					"show-year-picker",
					"year",
					"is-disabled",
					"onHandleYear",
					"onYearSelect",
					"onToggleYearPicker"
				])]),
				_: 2
			}, [n.$slots["month-overlay-value"] ? {
				name: "item",
				fn: withCtx(({ item: e }) => [renderSlot(n.$slots, "month-overlay-value", {
					text: e.text,
					value: e.value
				})]),
				key: "0"
			} : void 0]), 1032, [
				"items",
				"is-last",
				"height",
				"no-overlay-focus",
				"onSelected",
				"onHoverValue"
			])])], 2))), 128))]),
			_: 3
		}, 8, ["collapse"]));
	}
});
var Mn = (e) => {
	let { rootEmit: t, getDate: n, state: i, modelValue: a, rootProps: o, defaults: { highlight: s, multiDates: c, filters: l, range: u, safeDates: d } } = $(), { getYears: f } = Jt(), { isDateBetween: p, resetDate: m, resetDateTime: h, getYearFromDate: g, checkHighlightYear: v, groupListAndMap: y } = Gt(), { checkRangeAutoApply: b, setMonthOrYearRange: x } = kn(), { checkMinMaxValue: C, checkMinMaxRange: w } = ht();
	mt(() => {
		i.isTextInputDate && (E.value = getYear(n(o.startDate)));
	});
	let T = ref(null), E = ref();
	onMounted(() => {
		o.startDate && (a.value && o.focusStartDate || !a.value) && (E.value = getYear(n(o.startDate)));
	});
	let D = (e) => Array.isArray(a.value) ? a.value.some((t) => getYear(t) === e) : a.value ? getYear(a.value) === e : !1, k = (e) => u.value.enabled && Array.isArray(a.value) ? p(a.value, T.value, N(e)) : !1, A = (e) => d.value.allowedDates?.size ? d.value.allowedDates.has(`${e}`) : !0, j = (e) => d.value.disabledDates instanceof Map ? d.value.disabledDates.size ? d.value.disabledDates.has(`${e}`) : !1 : typeof d.value.disabledDates == "function" ? d.value.disabledDates(setYear(h(startOfYear(n())), e)) : !0, M = computed(() => y(f(), (e) => {
		let t = D(e.value);
		return {
			active: t,
			disabled: C(e.value, g(d.value.minDate), g(d.value.maxDate)) || l.value.years.includes(e.value) || !A(e.value) || j(e.value),
			isBetween: k(e.value) && !t,
			highlighted: v(s.value, e.value)
		};
	})), N = (e) => setYear(m(startOfYear(n())), e);
	return {
		groupedYears: M,
		focusYear: E,
		setHoverValue: (e) => {
			T.value = setYear(m(n()), e);
		},
		selectYear: (r) => {
			if (t("update-month-year", {
				instance: 0,
				year: r,
				month: NaN
			}), c.value.enabled) return a.value ? Array.isArray(a.value) && ((a.value?.map((e) => getYear(e))).includes(r) ? a.value = a.value.filter((e) => getYear(e) !== r) : a.value.push(setYear(h(n()), r))) : a.value = [setYear(h(startOfYear(n())), r)], e("auto-apply", !0);
			u.value.enabled ? w(N(r), a.value) && (a.value = x(N(r)), nextTick().then(() => {
				b(a.value, e, a.value.length < 2);
			})) : (a.value = N(r), e("auto-apply"));
		}
	};
};
var Nn = /* @__PURE__ */ defineComponent({
	__name: "YearPicker",
	props: {
		collapse: { type: Boolean },
		menuWrapRef: {},
		noOverlayFocus: { type: Boolean }
	},
	emits: ["auto-apply"],
	setup(e, { expose: t, emit: n }) {
		let r = n, { modelValue: s, defaults: { config: l }, rootProps: u } = $(), { groupedYears: d, focusYear: f, selectYear: p, setHoverValue: m } = Mn(r);
		return t({ getSidebarProps: () => ({
			modelValue: s,
			selectYear: p
		}) }), (t, n) => (openBlock(), createElementBlock("div", null, [t.$slots["top-extra"] ? renderSlot(t.$slots, "top-extra", {
			key: 0,
			value: unref(s)
		}) : createCommentVNode("", !0), t.$slots["month-year"] ? renderSlot(t.$slots, "month-year", normalizeProps(mergeProps({ key: 1 }, {
			mode: "year",
			years: unref(d),
			selectYear: unref(p)
		}))) : (openBlock(), createBlock(xn, {
			key: 2,
			items: unref(d),
			"is-last": unref(u).autoApply && !unref(l).keepActionRow,
			height: unref(l).modeHeight,
			"no-overlay-focus": !!(e.noOverlayFocus || unref(u).textInput),
			"focus-value": unref(f),
			type: "year",
			"use-relative": "",
			onSelected: unref(p),
			onHoverValue: unref(m)
		}, createSlots({ _: 2 }, [t.$slots["year-overlay-value"] ? {
			name: "item",
			fn: withCtx(({ item: e }) => [renderSlot(t.$slots, "year-overlay-value", {
				text: e.text,
				value: e.value
			})]),
			key: "0"
		} : void 0]), 1032, [
			"items",
			"is-last",
			"height",
			"no-overlay-focus",
			"focus-value",
			"onSelected",
			"onHoverValue"
		]))]));
	}
});
var Pn = {
	key: 0,
	class: "dp--time-input"
};
var Fn = ["data-compact", "data-collapsed"];
var In = [
	"data-test-id",
	"aria-label",
	"disabled",
	"data-dp-action-element",
	"onKeydown",
	"onClick",
	"onMousedown"
];
var Ln = [
	"aria-label",
	"aria-expanded",
	"disabled",
	"data-dp-action-element",
	"data-test-id",
	"onKeydown",
	"onClick"
];
var Rn = [
	"data-test-id",
	"aria-label",
	"data-dp-action-element",
	"disabled",
	"onKeydown",
	"onClick",
	"onMousedown"
];
var zn = { key: 0 };
var Bn = [
	"aria-label",
	"disabled",
	"data-dp-action-element",
	"data-compact"
];
var Vn = /* @__PURE__ */ defineComponent({
	__name: "TimeInput",
	props: {
		hours: {},
		minutes: {},
		seconds: {},
		order: {},
		disabled: { type: Boolean },
		closeTimePickerBtn: {},
		disabledTimesConfig: {},
		validateTime: {}
	},
	emits: [
		"update:hours",
		"update:minutes",
		"update:seconds",
		"overlay-opened",
		"overlay-closed",
		"set-hours",
		"set-minutes",
		"mounted"
	],
	setup(t, { expose: d, emit: f }) {
		let p = f, m = t, { getDate: h, rootEmit: g, rootProps: _, defaults: { ariaLabels: y, filters: b, config: x, range: C, multiCalendars: T, timeConfig: D } } = $(), { checkKeyDown: N, hoursToAmPmHours: ee } = Wt(), { boolHtmlAttribute: F } = Xt(), { sanitizeTime: I, groupListAndMap: te } = Gt(), { transitionName: L, showTransition: z } = pt(), B = reactive({
			hours: !1,
			minutes: !1,
			seconds: !1
		}), V = ref("AM"), ne = ref(null), re = ref(), H = ref(!1);
		onMounted(() => {
			p("mounted");
		});
		let U = (e) => set(h(), {
			hours: e.hours,
			minutes: e.minutes,
			seconds: D.value.enableSeconds ? e.seconds : 0,
			milliseconds: 0
		}), W = computed(() => _.timePicker || D.value.timePickerInline ? 0 : 1), ie = computed(() => (e) => me(e, m[e]) || oe(e, m[e]) || m.disabled), ae = computed(() => ({
			hours: m.hours,
			minutes: m.minutes,
			seconds: m.seconds
		})), oe = (e, t) => C.value.enabled && !C.value.disableTimeRangeValidation ? !m.validateTime(e, t) : !1, G = (e, t) => {
			if (C.value.enabled && !C.value.disableTimeRangeValidation) {
				let n = t ? +D.value[`${e}Increment`] : -+D.value[`${e}Increment`], r = m[e] + n;
				return !m.validateTime(e, r);
			}
			return !1;
		}, K = computed(() => (e) => !Y(+m[e] + +D.value[`${e}Increment`], e) || G(e, !0) || m.disabled), J = computed(() => (e) => !Y(m[e] - +D.value[`${e}Increment`], e) || G(e, !1) || m.disabled), se = (e, t) => add(set(h(), e), t), ce = (e, t) => sub(set(h(), e), t), le = computed(() => ({
			"dp--time-col": !0,
			"dp--time-col-block": !D.value.timePickerInline,
			"dp--time-col-reg-block": !D.value.enableSeconds && D.value.is24 && !D.value.timePickerInline,
			"dp--time-col-reg-inline": !D.value.enableSeconds && D.value.is24 && D.value.timePickerInline,
			"dp--time-col-reg-with-button": !D.value.enableSeconds && !D.value.is24,
			"dp--time-col-sec": D.value.enableSeconds && D.value.is24,
			"dp--time-col-sec-with-button": D.value.enableSeconds && !D.value.is24
		})), ue = computed(() => D.value.timePickerInline && C.value.enabled && !T.value.count), de = computed(() => {
			let e = [{ type: "hours" }];
			return D.value.enableMinutes && e.push({
				type: "",
				separator: !0
			}, { type: "minutes" }), D.value.enableSeconds && e.push({
				type: "",
				separator: !0
			}, { type: "seconds" }), e;
		}), fe = computed(() => de.value.filter((e) => !e.separator)), pe = computed(() => (e) => {
			if (e === "hours") {
				let e = ke(+m.hours);
				return {
					text: e < 10 ? `0${e}` : `${e}`,
					value: e
				};
			}
			return {
				text: m[e] < 10 ? `0${m[e]}` : `${m[e]}`,
				value: m[e]
			};
		}), me = (e, t) => {
			if (!m.disabledTimesConfig) return !1;
			let n = m.disabledTimesConfig(m.order, e === "hours" ? t : void 0);
			return n[e] ? !!n[e]?.includes(t) : !0;
		}, he = (e, t) => t === "hours" ? V.value === "AM" ? e : e + 12 : e, ge = (e) => {
			let t = D.value.is24 ? 24 : 12, n = e === "hours" ? t : 60, r = +D.value[`${e}GridIncrement`], i = e === "hours" && !D.value.is24 ? r : 0, a = [];
			for (let t = i; t < n; t += r) a.push({
				value: D.value.is24 ? t : he(t, e),
				text: t < 10 ? `0${t}` : `${t}`
			});
			return e === "hours" && !D.value.is24 && a.unshift({
				value: V.value === "PM" ? 12 : 0,
				text: "12"
			}), te(a, (t) => ({
				active: !1,
				disabled: b.value.times[e].includes(t.value) || !Y(t.value, e) || me(e, t.value) || oe(e, t.value)
			}));
		}, _e = (e) => e >= 0 ? e : 59, ye = (e) => e >= 0 ? e : 23, Y = (e, t) => {
			let n = _.minTime ? U(I(_.minTime)) : null, r = _.maxTime ? U(I(_.maxTime)) : null, i = U(I(ae.value, t, t === "minutes" || t === "seconds" ? _e(e) : ye(e)));
			return n && r ? (isBefore(i, r) || isEqual(i, r)) && (isAfter(i, n) || isEqual(i, n)) : n ? isAfter(i, n) || isEqual(i, n) : r ? isBefore(i, r) || isEqual(i, r) : !0;
		}, xe = (e) => D.value[`no${e[0].toUpperCase() + e.slice(1)}Overlay`] || m.disabled, Ce = (e) => {
			xe(e) || (B[e] = !B[e], B[e] ? (H.value = !0, p("overlay-opened", e)) : (H.value = !1, p("overlay-closed", e)));
		}, X = (e) => e === "hours" ? getHours : e === "minutes" ? getMinutes : getSeconds, Ee = () => {
			re.value && clearTimeout(re.value);
		}, Oe = (e, t = !0, n) => {
			let r = t ? se : ce, i = t ? +D.value[`${e}Increment`] : -+D.value[`${e}Increment`];
			Y(+m[e] + i, e) && p(`update:${e}`, X(e)(r({ [e]: +m[e] }, { [e]: +D.value[`${e}Increment`] }))), !n?.keyboard && x.value.timeArrowHoldThreshold && (re.value = setTimeout(() => {
				Oe(e, t);
			}, x.value.timeArrowHoldThreshold));
		}, ke = (e) => D.value.is24 ? e : (e >= 12 ? V.value = "PM" : V.value = "AM", ee(e)), Ae = () => {
			V.value === "PM" ? (V.value = "AM", p("update:hours", m.hours - 12)) : (V.value = "PM", p("update:hours", m.hours + 12)), g("am-pm-change", V.value);
		}, je = (e) => {
			B[e] = !0;
		}, Me = (e, t) => (Ce(e), p(`update:${e}`, t));
		return d({ openChildCmp: je }), (r, d) => unref(_).disabled ? createCommentVNode("", !0) : (openBlock(), createElementBlock("div", Pn, [
			(openBlock(!0), createElementBlock(Fragment, null, renderList(de.value, (n, i) => (openBlock(), createElementBlock("div", {
				key: i,
				class: normalizeClass(le.value),
				"data-compact": ue.value && !unref(D).enableSeconds,
				"data-collapsed": ue.value && unref(D).enableSeconds
			}, [n.separator ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [H.value ? createCommentVNode("", !0) : (openBlock(), createElementBlock(Fragment, { key: 0 }, [createTextVNode(":")], 64))], 64)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
				createBaseVNode("button", {
					type: "button",
					class: normalizeClass({
						"dp--btn-base dp--bg-none": !0,
						"dp--inc-dec-button": !unref(D).timePickerInline,
						"dp--inc-dec-button-inline": unref(D).timePickerInline,
						"dp--tp-inline-btn-top": unref(D).timePickerInline,
						"dp--inc-dec-button-disabled": K.value(n.type),
						"dp--hidden-el": H.value
					}),
					"data-test-id": `${n.type}-time-inc-btn-${m.order}`,
					"aria-label": unref(y)?.incrementValue(n.type),
					tabindex: "0",
					disabled: unref(F)(t.disabled),
					"data-dp-action-element": W.value,
					onKeydown: (e) => unref(N)(e, () => Oe(n.type, !0, { keyboard: !0 }), !0),
					onClick: (e) => unref(x).timeArrowHoldThreshold ? void 0 : Oe(n.type, !0),
					onMousedown: (e) => unref(x).timeArrowHoldThreshold ? Oe(n.type, !0) : void 0,
					onMouseup: Ee
				}, [unref(D).timePickerInline ? renderSlot(r.$slots, "tp-inline-arrow-up", { key: 1 }, () => [d[1] ||= createBaseVNode("span", { class: "dp--tp-inline-btn-bar dp--tp-btn-in-l" }, null, -1), d[2] ||= createBaseVNode("span", { class: "dp--tp-inline-btn-bar dp--tp-btn-in-r" }, null, -1)]) : renderSlot(r.$slots, "arrow-up", { key: 0 }, () => [createVNode(unref(Ze))])], 42, In),
				createBaseVNode("button", {
					type: "button",
					"aria-label": `${pe.value(n.type).text}-${unref(y)?.openTpOverlay(n.type)}`,
					"aria-haspopup": "dialog",
					"aria-expanded": B[n.type],
					class: normalizeClass({
						"dp--time-display": !0,
						"dp--time-display-block": !unref(D).timePickerInline,
						"dp--time-display-inline": unref(D).timePickerInline,
						"dp--btn-base dp--time-invalid": ie.value(n.type),
						"dp--btn-base dp--time-overlay-btn": !ie.value(n.type),
						"dp--hidden-el": H.value
					}),
					disabled: unref(F)(xe(n.type)),
					tabindex: "0",
					"data-dp-action-element": W.value,
					"data-test-id": `${n.type}-toggle-overlay-btn-${m.order}`,
					onKeydown: (e) => unref(N)(e, () => Ce(n.type), !0),
					onClick: (e) => Ce(n.type)
				}, [renderSlot(r.$slots, n.type, {
					text: pe.value(n.type).text,
					value: pe.value(n.type).value
				}, () => [createTextVNode(toDisplayString(pe.value(n.type).text), 1)])], 42, Ln),
				createBaseVNode("button", {
					type: "button",
					class: normalizeClass({
						"dp--btn-base dp--bg-none": !0,
						"dp--inc-dec-button": !unref(D).timePickerInline,
						"dp--inc-dec-button-inline": unref(D).timePickerInline,
						"dp--tp-inline-btn-bottom": unref(D).timePickerInline,
						"dp--inc-dec-button-disabled": J.value(n.type),
						"dp--hidden-el": H.value
					}),
					"data-test-id": `${n.type}-time-dec-btn-${m.order}`,
					"aria-label": unref(y)?.decrementValue(n.type),
					tabindex: "0",
					"data-dp-action-element": W.value,
					disabled: unref(F)(xe(n.type)),
					onKeydown: (e) => unref(N)(e, () => Oe(n.type, !1, { keyboard: !0 }), !0),
					onClick: (e) => unref(x).timeArrowHoldThreshold ? void 0 : Oe(n.type, !1),
					onMousedown: (e) => unref(x).timeArrowHoldThreshold ? Oe(n.type, !1) : void 0,
					onMouseup: Ee
				}, [unref(D).timePickerInline ? renderSlot(r.$slots, "tp-inline-arrow-down", { key: 1 }, () => [d[3] ||= createBaseVNode("span", { class: "dp--tp-inline-btn-bar dp--tp-btn-in-l" }, null, -1), d[4] ||= createBaseVNode("span", { class: "dp--tp-inline-btn-bar dp--tp-btn-in-r" }, null, -1)]) : renderSlot(r.$slots, "arrow-down", { key: 0 }, () => [createVNode(unref(Qe))])], 42, Rn)
			], 64))], 10, Fn))), 128)),
			unref(D).is24 ? createCommentVNode("", !0) : (openBlock(), createElementBlock("div", zn, [renderSlot(r.$slots, "am-pm-button", {
				toggle: Ae,
				value: V.value
			}, () => [createBaseVNode("button", {
				ref_key: "amPmButton",
				ref: ne,
				type: "button",
				class: "dp--pm-am-button",
				"aria-label": unref(y)?.amPmButton,
				tabindex: "0",
				disabled: unref(F)(t.disabled),
				"data-dp-action-element": W.value,
				"data-compact": ue.value,
				onClick: Ae,
				onKeydown: d[0] ||= (e) => unref(N)(e, () => Ae(), !0)
			}, toDisplayString(V.value), 41, Bn)])])),
			(openBlock(!0), createElementBlock(Fragment, null, renderList(fe.value, (e) => (openBlock(), createBlock(Transition, {
				key: e,
				name: unref(L)(B[e.type]),
				css: unref(z)
			}, {
				default: withCtx(() => [B[e.type] ? (openBlock(), createBlock(xn, {
					key: 0,
					items: ge(e.type),
					"is-last": unref(_).autoApply && !unref(x).keepActionRow,
					type: e.type,
					"aria-labels": unref(y),
					level: unref(D).timePickerInline || unref(_).timePicker ? 1 : 2,
					"overlay-label": unref(y).timeOverlay?.(e.type),
					onSelected: (t) => Me(e.type, t),
					onToggle: (t) => Ce(e.type)
				}, createSlots({
					"button-icon": withCtx(() => [renderSlot(r.$slots, "clock-icon", {}, () => [r.$slots["clock-icon"] ? createCommentVNode("", !0) : (openBlock(), createBlock(resolveDynamicComponent(unref(D).timePickerInline ? unref(Ke) : unref(Xe)), { key: 0 }))])]),
					_: 2
				}, [r.$slots[`${e.type}-overlay-value`] ? {
					name: "item",
					fn: withCtx(({ item: t }) => [renderSlot(r.$slots, `${e.type}-overlay-value`, {
						text: t.text,
						value: t.value
					})]),
					key: "0"
				} : void 0, r.$slots[`${e.type}-overlay-header`] ? {
					name: "header",
					fn: withCtx(() => [renderSlot(r.$slots, `${e.type}-overlay-header`, { toggle: () => Ce(e.type) })]),
					key: "1"
				} : void 0]), 1032, [
					"items",
					"is-last",
					"type",
					"aria-labels",
					"level",
					"overlay-label",
					"onSelected",
					"onToggle"
				])) : createCommentVNode("", !0)]),
				_: 2
			}, 1032, ["name", "css"]))), 128))
		]));
	}
});
var Hn = ["data-dp-mobile"];
var Un = ["aria-label", "tabindex"];
var Wn = [
	"role",
	"aria-label",
	"tabindex"
];
var Gn = ["aria-label"];
var Kn = /* @__PURE__ */ defineComponent({
	__name: "TimePicker",
	props: {
		hours: {},
		minutes: {},
		seconds: {},
		disabledTimesConfig: { type: [Function, null] },
		noOverlayFocus: { type: Boolean },
		validateTime: { type: Function }
	},
	emits: [
		"update:hours",
		"update:minutes",
		"update:seconds"
	],
	setup(t, { expose: l, emit: d }) {
		let f = d, p = t, { rootEmit: m, setState: h, modelValue: y, rootProps: x, defaults: { ariaLabels: C, textInput: T, config: E, range: D, timeConfig: j } } = $(), { isModelAuto: M } = Gt(), { checkKeyDown: N, findFocusableEl: ee } = Wt(), { transitionName: L, showTransition: B } = pt(), { hideNavigationButtons: V } = hn(), { isMobile: ne } = Kt(), { childMount: re } = ut(), H = useSlots(), U = useTemplateRef("overlay"), W = useTemplateRef("close-tp-btn"), ie = useTemplateRef("tp-input"), ae = ref(!1);
		onMounted(() => {
			re(x.timePicker ? void 0 : nt.timePicker);
		});
		let oe = computed(() => D.value.enabled && x.modelAuto ? M(y.value) : !0), G = ref(!1), K = (e) => ({
			hours: Array.isArray(p.hours) ? p.hours[e] : p.hours,
			minutes: Array.isArray(p.minutes) ? p.minutes[e] : p.minutes,
			seconds: Array.isArray(p.seconds) ? p.seconds[e] : p.seconds
		}), q = computed(() => {
			let e = [];
			if (D.value.enabled) for (let t = 0; t < 2; t++) e.push(K(t));
			else e.push(K(0));
			return e;
		}), J = (e, t = "") => {
			let n = e !== G.value;
			G.value = e, h("arrowNavigationLevel", +!!e), n && m("overlay-toggle", {
				open: e,
				overlay: rt.time
			}), nextTick().then(() => {
				t !== "" && ie.value?.[0] && ie.value[0].openChildCmp(t);
			});
		}, se = computed(() => ({
			"dp--btn-base dp--bg-none": !0,
			"dp--button": !0,
			"dp--button-bottom": x.autoApply && !E.value.keepActionRow
		})), ce = tn(H, Qt.TimeInput), le = (e, t, n) => D.value.enabled ? t === 0 ? [e, q.value[1][n]] : [q.value[0][n], e] : e, ue = (e) => {
			f("update:hours", e);
		}, de = (e) => {
			f("update:minutes", e);
		}, fe = (e) => {
			f("update:seconds", e);
		}, pe = () => {
			if (U.value && !T.value.enabled && !p.noOverlayFocus) {
				let e = ee(U.value);
				e && e.focus({ preventScroll: !0 });
			}
		}, me = (e) => {
			ae.value = !1, m("overlay-toggle", {
				open: !1,
				overlay: e
			});
		}, he = (e) => {
			ae.value = !0, m("overlay-toggle", {
				open: !0,
				overlay: e
			});
		};
		return l({ toggleTimePicker: J }), (r, l) => (openBlock(), createElementBlock("div", {
			class: "dp--tp-wrap",
			"data-dp-mobile": unref(ne)
		}, [!unref(x).timePicker && !unref(j).timePickerInline ? withDirectives((openBlock(), createElementBlock("button", {
			key: 0,
			ref: "open-tp-btn",
			type: "button",
			"data-dp-action-element": "0",
			class: normalizeClass({
				...se.value,
				"dp--hidden-el": G.value
			}),
			"aria-label": unref(C)?.openTimePicker,
			tabindex: t.noOverlayFocus ? void 0 : 0,
			"data-test-id": "open-time-picker-btn",
			onKeydown: l[0] ||= (e) => unref(N)(e, () => J(!0)),
			onClick: l[1] ||= (e) => J(!0)
		}, [renderSlot(r.$slots, "clock-icon", {}, () => [createVNode(unref(Xe))])], 42, Un)), [[vShow, !unref(V)("time")]]) : createCommentVNode("", !0), createVNode(Transition, {
			name: unref(L)(G.value),
			css: unref(B) && !unref(j).timePickerInline
		}, {
			default: withCtx(() => [G.value || unref(x).timePicker || unref(j).timePickerInline ? (openBlock(), createElementBlock("div", {
				key: 0,
				ref: "overlay",
				role: unref(j).timePickerInline ? void 0 : "dialog",
				class: normalizeClass({
					"dp--overlay": !unref(j).timePickerInline,
					"dp--overlay-absolute": !unref(x).timePicker && !unref(j).timePickerInline,
					"dp--overlay-relative": unref(x).timePicker
				}),
				style: normalizeStyle(unref(x).timePicker ? { height: `${unref(E).modeHeight}px` } : void 0),
				"aria-label": unref(C)?.timePicker,
				tabindex: unref(j).timePickerInline ? void 0 : 0
			}, [createBaseVNode("div", {
				class: normalizeClass(unref(j).timePickerInline ? "dp--time-picker-inline-container" : "dp--overlay-container dp--container-flex dp--time-picker-overlay-container"),
				style: { display: "flex" }
			}, [renderSlot(r.$slots, "time-picker-overlay", {
				hours: t.hours,
				minutes: t.minutes,
				seconds: t.seconds,
				setHours: ue,
				setMinutes: de,
				setSeconds: fe
			}, () => [createBaseVNode("div", { class: normalizeClass(unref(j).timePickerInline ? "dp--flex" : "dp--overlay-row dp--flex-row") }, [(openBlock(!0), createElementBlock(Fragment, null, renderList(q.value, (e, n) => withDirectives((openBlock(), createBlock(Vn, {
				key: n,
				ref_for: !0,
				ref: "tp-input",
				hours: e.hours,
				minutes: e.minutes,
				seconds: e.seconds,
				order: n,
				"close-time-picker-btn": W.value,
				"disabled-times-config": t.disabledTimesConfig,
				disabled: n === 0 ? unref(D).fixedStart : unref(D).fixedEnd,
				"validate-time": (e, r) => t.validateTime(e, le(r, n, e)),
				"onUpdate:hours": (e) => ue(le(e, n, "hours")),
				"onUpdate:minutes": (e) => de(le(e, n, "minutes")),
				"onUpdate:seconds": (e) => fe(le(e, n, "seconds")),
				onMounted: pe,
				onOverlayClosed: me,
				onOverlayOpened: he
			}, createSlots({ _: 2 }, [renderList(unref(ce), (e) => ({
				name: e,
				fn: withCtx((t) => [renderSlot(r.$slots, e, mergeProps({ ref_for: !0 }, t))])
			}))]), 1032, [
				"hours",
				"minutes",
				"seconds",
				"order",
				"close-time-picker-btn",
				"disabled-times-config",
				"disabled",
				"validate-time",
				"onUpdate:hours",
				"onUpdate:minutes",
				"onUpdate:seconds"
			])), [[vShow, n === 0 ? !0 : oe.value]])), 128))], 2)]), !unref(x).timePicker && !unref(j).timePickerInline ? withDirectives((openBlock(), createElementBlock("button", {
				key: 0,
				ref: "close-tp-btn",
				"data-dp-action-element": "1",
				type: "button",
				class: normalizeClass({
					...se.value,
					"dp--hidden-el": ae.value
				}),
				"aria-label": unref(C)?.closeTimePicker,
				tabindex: "0",
				onKeydown: l[2] ||= (e) => unref(N)(e, () => J(!1)),
				onClick: l[3] ||= (e) => J(!1)
			}, [renderSlot(r.$slots, "calendar-icon", {}, () => [createVNode(unref(Ke))])], 42, Gn)), [[vShow, !unref(V)("time")]]) : createCommentVNode("", !0)], 2)], 14, Wn)) : createCommentVNode("", !0)]),
			_: 3
		}, 8, ["name", "css"])], 8, Hn));
	}
});
var qn = () => {
	let { getDate: e, modelValue: t, time: n, rootProps: i, defaults: { range: a, timeConfig: o } } = $(), { updateFlowStep: s } = ut(), { isDateEqual: c, setTime: l } = Gt(), u = (e, t) => Array.isArray(n[e]) ? n[e][t] : n[e], d = (e) => o.value.enableSeconds ? Array.isArray(n.seconds) ? n.seconds[e] : n.seconds : 0, f = (t, r) => t ? l(r === void 0 ? {
		hours: n.hours,
		minutes: n.minutes,
		seconds: d()
	} : {
		hours: u("hours", r),
		minutes: u("minutes", r),
		seconds: d(r)
	}, t) : setSeconds(e(), d(r)), p = (e, t) => {
		n[e] = t;
	}, m = computed(() => i.modelAuto && a.value.enabled ? Array.isArray(t.value) ? t.value.length > 1 : !1 : a.value.enabled), h = (e, r) => {
		let i = Object.fromEntries(Object.keys(n).map((t) => t === e ? [t, r] : [t, n[t]].slice()));
		if (m.value && !a.value.disableTimeRangeValidation) {
			let e = (e) => t.value ? l({
				hours: i.hours[e],
				minutes: i.minutes[e],
				seconds: i.seconds[e]
			}, t.value[e]) : null, n = (e) => setMilliseconds(t.value[e], 0);
			return !(c(e(0), e(1)) && (isAfter(e(0), n(1)) || isBefore(e(1), n(0))));
		}
		return !0;
	}, g = (e, t) => {
		let r = n[e] === t ? void 0 : e;
		h(e, t) && (p(e, t), r && nextTick().then(() => s(e)));
	}, v = (e) => {
		g("hours", e);
	}, y = (e) => {
		g("minutes", e);
	}, b = (e) => {
		g("seconds", e);
	}, x = (e, n) => {
		v(e.hours), y(e.minutes), b(e.seconds), t.value && n(t.value);
	}, S = (e) => {
		if (e) {
			let t = Array.isArray(e), n = t ? [+e[0].hours, +e[1].hours] : +e.hours, r = t ? [+e[0].minutes, +e[1].minutes] : +e.minutes, i = t ? [+(e[0].seconds ?? 0), +(e[1].seconds ?? 0)] : +(e.seconds ?? 0);
			p("hours", n), p("minutes", r), o.value.enableSeconds && p("seconds", i);
		}
	}, C = (e, t) => {
		let r = {
			hours: Array.isArray(n.hours) ? n.hours[e] : n.hours,
			disabledArr: []
		};
		return (t || t === 0) && (r.hours = t), Array.isArray(i.disabledTimes) && (r.disabledArr = a.value.enabled && Array.isArray(i.disabledTimes[e]) ? i.disabledTimes[e] : i.disabledTimes), r;
	};
	return {
		assignTime: p,
		updateHours: v,
		updateMinutes: y,
		updateSeconds: b,
		getSetDateTime: f,
		updateTimeValues: x,
		getSecondsValue: d,
		assignStartTime: S,
		validateTime: h,
		disabledTimesConfig: computed(() => (e, t) => {
			if (Array.isArray(i.disabledTimes)) {
				let { disabledArr: n, hours: r } = C(e, t), i = n.filter((e) => +e.hours === r);
				return i[0]?.minutes === "*" ? {
					hours: [r],
					minutes: void 0,
					seconds: void 0
				} : {
					hours: [],
					minutes: i?.map((e) => +e.minutes) ?? [],
					seconds: i?.map((e) => e.seconds ? +e.seconds : void 0) ?? []
				};
			}
			return {
				hours: [],
				minutes: [],
				seconds: []
			};
		})
	};
};
var Jn = (e) => {
	let { getDate: t, time: n, modelValue: r, state: i, defaults: { startTime: a, range: o, timeConfig: s } } = $(), { getTimeObj: c } = Gt();
	mt(() => {
		i.isTextInputDate && b();
	});
	let { updateTimeValues: l, getSetDateTime: u, assignTime: d, assignStartTime: f, disabledTimesConfig: p, validateTime: m } = qn(), h = (e) => {
		let { hours: t, minutes: n, seconds: r } = e;
		return {
			hours: +t,
			minutes: +n,
			seconds: r ? +r : 0
		};
	}, g = () => {
		if (s.value.startTime) {
			if (Array.isArray(s.value.startTime)) {
				let e = h(s.value.startTime[0]), n = h(s.value.startTime[1]);
				return [set(t(), e), set(t(), n)];
			}
			let e = h(s.value.startTime);
			return set(t(), e);
		}
		return o.value.enabled ? [null, null] : null;
	}, _ = () => {
		if (o.value.enabled) {
			let [e, t] = g();
			r.value = [u(e, 0), u(t, 1)];
		} else r.value = u(g());
	}, v = (e) => Array.isArray(e) ? [c(t(e[0])), c(t(e[1]))] : [c(e ?? t())], y = (e, t, n) => {
		d("hours", e), d("minutes", t), d("seconds", s.value.enableSeconds ? n : 0);
	}, b = () => {
		let [e, t] = v(r.value);
		return o.value.enabled ? y([e.hours, t.hours], [e.minutes, t.minutes], [e.seconds, t.seconds]) : y(e.hours, e.minutes, e.seconds);
	};
	onMounted(() => (f(a.value), r.value ? b() : _()));
	let x = () => {
		Array.isArray(r.value) ? r.value = r.value.map((e, t) => e && u(e, t)) : r.value = u(r.value), e("time-update");
	};
	return {
		modelValue: r,
		time: n,
		disabledTimesConfig: p,
		validateTime: m,
		updateTime: (e) => {
			l(e, x);
		}
	};
};
var Yn = /* @__PURE__ */ defineComponent({
	__name: "TimePickerSolo",
	props: {
		collapse: { type: Boolean },
		menuWrapRef: {},
		noOverlayFocus: { type: Boolean }
	},
	emits: [
		"time-update",
		"mount",
		"update-flow-step"
	],
	setup(e, { expose: t, emit: n }) {
		let r = n, a = tn(useSlots(), Qt.TimePicker), o = useTemplateRef("time-input"), { time: l, modelValue: d, disabledTimesConfig: p, updateTime: m, validateTime: h } = Jn(r);
		return onMounted(() => {
			r("mount");
		}), t({
			getSidebarProps: () => ({
				modelValue: d,
				time: l,
				updateTime: m
			}),
			toggleTimePicker: (e, t = "") => {
				o.value?.toggleTimePicker(e, t);
			}
		}), (e, t) => (openBlock(), createBlock(Cn, {
			"multi-calendars": 0,
			stretch: ""
		}, {
			default: withCtx(({ wrapClass: n }) => [createBaseVNode("div", { class: normalizeClass(n) }, [createVNode(Kn, mergeProps({ ref: "time-input" }, e.$props, {
				hours: unref(l).hours,
				minutes: unref(l).minutes,
				seconds: unref(l).seconds,
				"disabled-times-config": unref(p),
				"validate-time": unref(h),
				"onUpdate:hours": t[0] ||= (e) => unref(m)({
					hours: e,
					minutes: unref(l).minutes,
					seconds: unref(l).seconds
				}),
				"onUpdate:minutes": t[1] ||= (e) => unref(m)({
					hours: unref(l).hours,
					minutes: e,
					seconds: unref(l).seconds
				}),
				"onUpdate:seconds": t[2] ||= (e) => unref(m)({
					hours: unref(l).hours,
					minutes: unref(l).minutes,
					seconds: e
				})
			}), createSlots({ _: 2 }, [renderList(unref(a), (t, n) => ({
				name: t,
				fn: withCtx((n) => [renderSlot(e.$slots, t, normalizeProps(guardReactiveProps(n)))])
			}))]), 1040, [
				"hours",
				"minutes",
				"seconds",
				"disabled-times-config",
				"validate-time"
			])], 2)]),
			_: 3
		}));
	}
});
var Xn = (e, t) => {
	let { getDate: n, rootProps: i, defaults: { filters: a } } = $(), { validateMonthYearInRange: o, validateMonthYear: s } = ht(), c = (e, t) => {
		let n = e;
		return a.value.months.includes(getMonth(n)) ? (n = t ? addMonths(e, 1) : subMonths(e, 1), c(n, t)) : n;
	}, l = (e, t) => {
		let n = e;
		return a.value.years.includes(getYear(n)) ? (n = t ? addYears(e, 1) : subYears(e, 1), l(n, t)) : n;
	}, u = (t, r = !1) => {
		let s = set(n(), {
			month: e.month,
			year: e.year
		}), u = t ? addMonths(s, 1) : subMonths(s, 1);
		i.disableYearSelect && (u = setYear(u, e.year));
		let f = getMonth(u), p = getYear(u);
		a.value.months.includes(f) && (u = c(u, t), f = getMonth(u), p = getYear(u)), a.value.years.includes(p) && (u = l(u, t), p = getYear(u)), o(f, p, t, i.preventMinMaxNavigation) && d(f, p, r);
	}, d = (e, n, r = !1) => {
		t("update-month-year", {
			month: e,
			year: n,
			fromNav: r
		});
	};
	return {
		handleMonthYearChange: u,
		isDisabled: computed(() => (t) => s(set(n(), {
			month: e.month,
			year: e.year
		}), i.preventMinMaxNavigation, t)),
		updateMonthYear: d
	};
};
var Zn = { class: "dp--header-wrap" };
var Qn = {
	key: 0,
	class: "dp--month-year-wrap"
};
var $n = { key: 0 };
var er = { class: "dp--month-year-wrap" };
var tr = [
	"data-dp-element",
	"aria-label",
	"aria-expanded",
	"data-test-id",
	"onClick",
	"onKeydown"
];
var nr = /* @__PURE__ */ defineComponent({
	__name: "DpHeader",
	props: {
		month: {},
		year: {},
		instance: {},
		years: {},
		months: {},
		menuWrapRef: {}
	},
	emits: ["update-month-year"],
	setup(t, { expose: d, emit: p }) {
		let m = p, h = t, { rootEmit: _, rootProps: b, modelValue: x, defaults: { ariaLabels: C, filters: T, config: E, highlight: D, safeDates: N, ui: ee } } = $(), { transitionName: F, showTransition: I } = pt(), { showLeftIcon: te, showRightIcon: L } = hn(), { handleMonthYearChange: z, isDisabled: B, updateMonthYear: V } = Xn(h, m), { getMaxMonth: ne, getMinMonth: re, getYearFromDate: H, groupListAndMap: U, checkHighlightYear: W, checkHighlightMonth: ie } = Gt(), { checkKeyDown: ae } = Wt(), { formatYear: oe } = qt(), { checkMinMaxValue: G } = ht(), { boolHtmlAttribute: K } = Xt(), { childMount: q } = ut(), J = ref(!1), se = ref(!1), ce = ref(!1);
		onMounted(() => {
			q(nt.header);
		});
		let le = (e) => ({
			get: () => h[e],
			set: (t) => {
				let n = e === tt.month ? tt.year : tt.month;
				m("update-month-year", {
					[e]: t,
					[n]: h[n]
				}), e === tt.month ? _e() : ve();
			}
		}), ue = computed(le(tt.month)), de = computed(le(tt.year)), fe = computed(() => (e) => ({
			month: h.month,
			year: h.year,
			items: e === tt.month ? h.months : h.years,
			instance: h.instance,
			updateMonthYear: V,
			toggle: e === tt.month ? _e : ve
		})), pe = computed(() => h.months.find((e) => e.value === h.month) || {
			text: "",
			value: 0
		}), me = computed(() => U(h.months, (e) => ({
			active: h.month === e.value,
			disabled: G(e.value, re(h.year, N.value.minDate), ne(h.year, N.value.maxDate)) || T.value.months.includes(e.value),
			highlighted: ie(D.value, e.value, h.year)
		}))), he = computed(() => U(h.years, (e) => ({
			active: h.year === e.value,
			disabled: G(e.value, H(N.value.minDate), H(N.value.maxDate)) || T.value.years.includes(e.value),
			highlighted: W(D.value, e.value)
		}))), ge = (e, t, n) => {
			n === void 0 ? e.value = !e.value : e.value = n, e.value ? (ce.value = !0, _("overlay-toggle", {
				open: !0,
				overlay: t
			})) : (ce.value = !1, _("overlay-toggle", {
				open: !1,
				overlay: t
			}));
		}, _e = (e) => {
			ge(J, rt.month, e);
		}, ve = (e) => {
			ge(se, rt.year, e);
		}, ye = computed(() => [{
			type: tt.month,
			index: 1,
			toggle: _e,
			modelValue: ue.value,
			updateModelValue: (e) => ue.value = e,
			text: pe.value.text,
			showSelectionGrid: J.value,
			items: me.value,
			ariaLabel: C.value?.openMonthsOverlay,
			overlayLabel: C.value.monthPicker?.(!0) ?? void 0
		}, {
			type: tt.year,
			index: 2,
			toggle: ve,
			modelValue: de.value,
			updateModelValue: (e) => de.value = e,
			text: oe(h.year),
			showSelectionGrid: se.value,
			items: he.value,
			ariaLabel: C.value?.openYearsOverlay,
			overlayLabel: C.value.yearPicker?.(!0) ?? void 0
		}]), be = computed(() => b.disableYearSelect ? [ye.value[0]] : b.yearFirst ? [...ye.value].reverse() : ye.value);
		return d({
			toggleMonthPicker: _e,
			toggleYearPicker: ve,
			handleMonthYearChange: z
		}), (r, d) => (openBlock(), createElementBlock("div", Zn, [r.$slots["month-year"] ? (openBlock(), createElementBlock("div", Qn, [renderSlot(r.$slots, "month-year", normalizeProps(guardReactiveProps({
			mode: "date",
			month: t.month,
			year: t.year,
			months: t.months,
			years: t.years,
			updateMonthYear: unref(V),
			handleMonthYearChange: unref(z),
			instance: t.instance,
			isDisabled: unref(B)
		})))])) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [r.$slots["top-extra"] ? (openBlock(), createElementBlock("div", $n, [renderSlot(r.$slots, "top-extra", { value: unref(x) })])) : createCommentVNode("", !0), createBaseVNode("div", er, [
			unref(te)(t.instance) && !unref(b).vertical ? (openBlock(), createBlock(Tn, {
				key: 0,
				"aria-label": unref(C)?.prevMonth,
				disabled: unref(K)(unref(B)(!1)),
				inactive: ce.value,
				class: normalizeClass(unref(ee)?.navBtnPrev),
				"el-name": "action-prev",
				onActivate: d[0] ||= (e) => unref(z)(!1, !0)
			}, {
				default: withCtx(() => [r.$slots["arrow-left"] ? renderSlot(r.$slots, "arrow-left", { key: 0 }) : createCommentVNode("", !0), r.$slots["arrow-left"] ? createCommentVNode("", !0) : (openBlock(), createBlock(unref(Je), { key: 1 }))]),
				_: 3
			}, 8, [
				"aria-label",
				"disabled",
				"inactive",
				"class"
			])) : createCommentVNode("", !0),
			createBaseVNode("div", { class: normalizeClass(["dp--month-year-wrap", { "dp--year-disable-select": unref(b).disableYearSelect }]) }, [(openBlock(!0), createElementBlock(Fragment, null, renderList(be.value, (d) => (openBlock(), createElementBlock(Fragment, { key: d.type }, [createBaseVNode("button", {
				type: "button",
				"data-dp-element": `overlay-${d.type}`,
				class: normalizeClass(["dp--btn-base dp--bg-none dp--month-year-select-base dp--month-year-select", { "dp--hidden-el": ce.value }]),
				"aria-label": `${d.text}-${d.ariaLabel}`,
				"aria-haspopup": "dialog",
				"aria-expanded": d.showSelectionGrid,
				"data-test-id": `${d.type}-toggle-overlay-${t.instance}`,
				tabindex: "0",
				"data-dp-action-element": "0",
				onClick: (e) => d.toggle(),
				onKeydown: (e) => unref(ae)(e, () => d.toggle(), !0)
			}, [r.$slots[d.type] ? renderSlot(r.$slots, d.type, {
				key: 0,
				text: d.text,
				value: h[d.type]
			}) : createCommentVNode("", !0), r.$slots[d.type] ? createCommentVNode("", !0) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [createTextVNode(toDisplayString(d.text), 1)], 64))], 42, tr), createVNode(Transition, {
				name: unref(F)(d.showSelectionGrid),
				css: unref(I)
			}, {
				default: withCtx(() => [d.showSelectionGrid ? (openBlock(), createBlock(xn, {
					key: 0,
					items: d.items,
					"is-last": unref(b).autoApply && !unref(E).keepActionRow,
					"skip-button-ref": !1,
					type: d.type,
					"header-refs": [],
					"menu-wrap-ref": t.menuWrapRef,
					"overlay-label": d.overlayLabel,
					onSelected: d.updateModelValue,
					onToggle: d.toggle
				}, createSlots({
					"button-icon": withCtx(() => [r.$slots["calendar-icon"] ? renderSlot(r.$slots, "calendar-icon", { key: 0 }) : createCommentVNode("", !0), r.$slots["calendar-icon"] ? createCommentVNode("", !0) : (openBlock(), createBlock(unref(Ke), { key: 1 }))]),
					_: 2
				}, [
					r.$slots[`${d.type}-overlay-value`] ? {
						name: "item",
						fn: withCtx(({ item: e }) => [renderSlot(r.$slots, `${d.type}-overlay-value`, {
							text: e.text,
							value: e.value
						})]),
						key: "0"
					} : void 0,
					r.$slots[`${d.type}-overlay`] ? {
						name: "overlay",
						fn: withCtx(() => [renderSlot(r.$slots, `${d.type}-overlay`, mergeProps({ ref_for: !0 }, fe.value(d.type)))]),
						key: "1"
					} : void 0,
					r.$slots[`${d.type}-overlay-header`] ? {
						name: "header",
						fn: withCtx(() => [renderSlot(r.$slots, `${d.type}-overlay-header`, { toggle: d.toggle })]),
						key: "2"
					} : void 0
				]), 1032, [
					"items",
					"is-last",
					"type",
					"menu-wrap-ref",
					"overlay-label",
					"onSelected",
					"onToggle"
				])) : createCommentVNode("", !0)]),
				_: 2
			}, 1032, ["name", "css"])], 64))), 128))], 2),
			unref(te)(t.instance) && unref(b).vertical ? (openBlock(), createBlock(Tn, {
				key: 1,
				"aria-label": unref(C)?.prevMonth,
				"el-name": "action-prev",
				disabled: unref(K)(unref(B)(!1)),
				inactive: ce.value,
				class: normalizeClass(unref(ee)?.navBtnPrev),
				onActivate: d[1] ||= (e) => unref(z)(!1, !0)
			}, {
				default: withCtx(() => [r.$slots["arrow-up"] ? renderSlot(r.$slots, "arrow-up", { key: 0 }) : createCommentVNode("", !0), r.$slots["arrow-up"] ? createCommentVNode("", !0) : (openBlock(), createBlock(unref(Ze), { key: 1 }))]),
				_: 3
			}, 8, [
				"aria-label",
				"disabled",
				"inactive",
				"class"
			])) : createCommentVNode("", !0),
			unref(L)(t.instance) ? (openBlock(), createBlock(Tn, {
				key: 2,
				ref: "rightIcon",
				"el-name": "action-next",
				disabled: unref(K)(unref(B)(!0)),
				"aria-label": unref(C)?.nextMonth,
				inactive: ce.value,
				class: normalizeClass(unref(ee)?.navBtnNext),
				onActivate: d[2] ||= (e) => unref(z)(!0, !0)
			}, {
				default: withCtx(() => [r.$slots[unref(b).vertical ? "arrow-down" : "arrow-right"] ? renderSlot(r.$slots, unref(b).vertical ? "arrow-down" : "arrow-right", { key: 0 }) : createCommentVNode("", !0), r.$slots[unref(b).vertical ? "arrow-down" : "arrow-right"] ? createCommentVNode("", !0) : (openBlock(), createBlock(resolveDynamicComponent(unref(b).vertical ? unref(Qe) : unref(Ye)), { key: 1 }))]),
				_: 3
			}, 8, [
				"disabled",
				"aria-label",
				"inactive",
				"class"
			])) : createCommentVNode("", !0)
		])], 64))]));
	}
});
var rr = ["inert", "aria-hidden"];
var ir = {
	class: "dp--calendar-header",
	role: "row"
};
var ar = {
	key: 0,
	class: "dp--calendar-header-item",
	role: "gridcell"
};
var or = ["aria-label"];
var sr = {
	key: 0,
	class: "dp--calendar-item dp--week-num",
	role: "gridcell"
};
var cr = { class: "dp--cell-inner" };
var lr = [
	"id",
	"aria-selected",
	"aria-disabled",
	"aria-label",
	"tabindex",
	"data-test-id",
	"data-dp-element-active",
	"onClick",
	"onTouchend",
	"onKeydown",
	"onMouseenter",
	"onMouseleave",
	"onMousedown"
];
var ur = /* @__PURE__ */ defineComponent({
	__name: "DpCalendar",
	props: {
		instance: {},
		mappedDates: {},
		month: {},
		year: {}
	},
	emits: [
		"select-date",
		"set-hover-date",
		"handle-scroll",
		"handle-swipe"
	],
	setup(t, { expose: i, emit: c }) {
		let d = c, f = t, { getDate: p, rootEmit: m, rootProps: h, state: g, defaults: { transitions: y, config: x, ariaLabels: T, multiCalendars: E, weekNumbers: D, multiDates: j, ui: N, weekStart: ee } } = $(), { isDateAfter: F, isDateEqual: te, resetDateTime: L, getCellId: z } = Gt(), { checkKeyDown: B, checkStopPropagation: ne, isTouchDevice: U } = Wt(), { formatWeekDay: W } = qt(), { childMount: ie } = ut(), ae = useTemplateRef("calendar-wrap"), oe = useTemplateRef("active-tooltip"), G = ref([]), K = ref(null), q = ref(!0), J = ref(!1), se = ref(""), ce = ref({
			bottom: "",
			left: "",
			transform: ""
		}), le = ref({ left: "50%" });
		useSwipe(ae, { onSwipeEnd: (e, t) => {
			x.value.noSwipe || (h.vertical ? (t === "up" || t === "down") && d("handle-swipe", t === "up" ? "left" : "right") : (t === "left" || t === "right") && d("handle-swipe", t === "right" ? "left" : "right"));
		} });
		let ue = computed(() => h.calendar ? h.calendar(f.mappedDates) : f.mappedDates), fe = computed(() => h.dayNames ? Array.isArray(h.dayNames) ? h.dayNames : h.dayNames() : Fe());
		onMounted(() => {
			ie(nt.calendar), x.value.monthChangeOnScroll && ae.value && ae.value.addEventListener("wheel", ke, { passive: !1 });
		}), onUnmounted(() => {
			x.value.monthChangeOnScroll && ae.value && ae.value.removeEventListener("wheel", ke);
		});
		let pe = (e) => e ? h.vertical ? "vNext" : "next" : h.vertical ? "vPrevious" : "previous", he = (e, t) => {
			if (h.transitions) {
				let n = L(set(p(), {
					month: f.month,
					year: f.year
				}));
				se.value = F(L(set(p(), {
					month: e,
					year: t
				})), n) ? y.value[pe(!0)] : y.value[pe(!1)], q.value = !1, nextTick().then(() => q.value = !0);
			}
		}, _e = computed(() => ({ ...N.value.calendar })), ve = (e) => ({
			type: "dot",
			...e
		}), be = computed(() => (e) => {
			let t = ve(e);
			return {
				"dp--marker-base": !0,
				"dp--marker-dot": t.type === "dot",
				"dp--marker-line": t.type === "line"
			};
		}), Y = computed(() => (e) => te(e, K.value)), xe = computed(() => ({
			"dp--calendar": !0,
			"dp--calendar-next": E.value.count > 0 && f.instance !== 0
		})), Se = computed(() => g.arrowNavigationLevel > 0), X = computed(() => (e) => h.hideOffsetDates ? e.current : !0), we = async (e, t) => {
			let { width: n, height: r } = e.getBoundingClientRect();
			K.value = t.value;
			let i = { left: `${n / 2}px` }, a = -50;
			if (await nextTick(), oe.value?.[0]) {
				let { left: e, width: t } = oe.value[0].getBoundingClientRect();
				e < 0 && (i = { left: "0" }, a = 0, le.value.left = `${n / 2}px`), globalThis.innerWidth < e + t && (i = { right: "0" }, a = 0, le.value.left = `${t - n / 2}px`);
			}
			ce.value = {
				bottom: `${r}px`,
				...i,
				transform: `translateX(${a}%)`
			};
		}, Te = async (e, t, n) => {
			let r = unrefElement(G.value?.[t]?.[n]);
			r && (e.marker?.customPosition && e.marker?.tooltip?.length ? ce.value = e.marker.customPosition(r) : await we(r, e), m("tooltip-open", e.marker));
		}, Ee = async (e, t, n) => {
			if (J.value && j.value.enabled && j.value.dragSelect) return d("select-date", e);
			if (d("set-hover-date", e), e.marker?.tooltip?.length) {
				if (h.hideOffsetDates && !e.current) return;
				await Te(e, t, n);
			}
		}, De = (e) => {
			K.value && (K.value = null, ce.value = structuredClone({
				bottom: "",
				left: "",
				transform: ""
			}), m("tooltip-close", e.marker));
		}, Oe = (e, t, n) => {
			e && (Array.isArray(G.value[t]) ? G.value[t][n] = e : G.value[t] = [e]);
		}, ke = (e) => {
			x.value.monthChangeOnScroll && (e.preventDefault(), d("handle-scroll", e));
		}, Ae = (e) => D.value ? D.value.type === "local" ? getWeek(e.value, {
			weekStartsOn: ee.value,
			locale: h.locale
		}) : D.value.type === "iso" ? getISOWeek(e.value) : typeof D.value.type == "function" ? D.value.type(e.value) : "" : "", je = (e) => {
			let t = e[0];
			return D.value?.hideOnOffsetDates ? e.some((e) => e.current) ? Ae(t) : "" : Ae(t);
		}, Me = (e, t, n = !0) => {
			!n && U() || (!j.value.enabled || x.value.allowPreventDefault) && (ne(e, x.value), d("select-date", t));
		}, Ne = (e) => {
			ne(e, x.value);
		}, Pe = (e) => {
			j.value.enabled && j.value.dragSelect ? (J.value = !0, d("select-date", e)) : j.value.enabled && d("select-date", e);
		}, Fe = () => {
			let e = p();
			return eachDayOfInterval({
				start: startOfWeek(e, {
					locale: h.locale,
					weekStartsOn: ee.value
				}),
				end: endOfWeek(e, {
					locale: h.locale,
					weekStartsOn: ee.value
				})
			}).map((e) => W(e));
		}, Ie = (e) => T.value?.day?.(e) ?? format(e.value, "MMMM do, yyyy", { locale: h.locale });
		return i({ triggerTransition: he }), (t, r) => (openBlock(), createElementBlock("div", {
			class: normalizeClass(xe.value),
			inert: Se.value || void 0,
			"aria-hidden": Se.value || void 0
		}, [createBaseVNode("div", {
			ref: "calendar-wrap",
			class: normalizeClass(_e.value),
			role: "grid"
		}, [
			createBaseVNode("div", ir, [unref(D) ? (openBlock(), createElementBlock("div", ar, toDisplayString(unref(D).label), 1)) : createCommentVNode("", !0), (openBlock(!0), createElementBlock(Fragment, null, renderList(fe.value, (e, n) => (openBlock(), createElementBlock("div", {
				key: n,
				class: "dp--calendar-header-item",
				role: "gridcell",
				"data-test-id": "calendar-header",
				"aria-label": unref(T)?.weekDay?.(n)
			}, [renderSlot(t.$slots, "calendar-header", {
				day: e,
				index: n
			}, () => [createTextVNode(toDisplayString(e), 1)])], 8, or))), 128))]),
			r[2] ||= createBaseVNode("div", { class: "dp--calendar-header-separator" }, null, -1),
			createVNode(Transition, {
				name: se.value,
				css: !!unref(y)
			}, {
				default: withCtx(() => [q.value ? (openBlock(), createElementBlock("div", {
					key: 0,
					class: "dp--calendar",
					role: "rowgroup",
					onMouseleave: r[1] ||= (e) => J.value = !1
				}, [(openBlock(!0), createElementBlock(Fragment, null, renderList(ue.value, (n, i) => (openBlock(), createElementBlock("div", {
					key: i,
					class: "dp--calendar-row",
					role: "row"
				}, [unref(D) ? (openBlock(), createElementBlock("div", sr, [createBaseVNode("div", cr, toDisplayString(je(n.days)), 1)])) : createCommentVNode("", !0), (openBlock(!0), createElementBlock(Fragment, null, renderList(n.days, (n, c) => (openBlock(), createElementBlock("div", {
					id: unref(z)(n.value),
					ref_for: !0,
					ref: (e) => Oe(e, i, c),
					key: c + i,
					role: "gridcell",
					class: "dp--calendar-item",
					"aria-selected": (n.classData["dp--active"] || n.classData["dp--range-border-start"] || n.classData["dp--range-border-end"]) ?? void 0,
					"aria-disabled": n.classData["dp--cell-disabled"] || void 0,
					"aria-label": Ie(n),
					tabindex: !n.current && unref(h).hideOffsetDates ? void 0 : 0,
					"data-test-id": unref(z)(n.value),
					"data-dp-element-active": n.classData["dp--active"] ? 0 : void 0,
					"data-dp-action-element": "0",
					onClick: withModifiers((e) => Me(e, n), ["prevent"]),
					onTouchend: (e) => Me(e, n, !1),
					onKeydown: (e) => unref(B)(e, () => t.$emit("select-date", n), !1, unref(x).spaceConfirm, void 0),
					onMouseenter: (e) => Ee(n, i, c),
					onMouseleave: (e) => De(n),
					onMousedown: (e) => Pe(n),
					onMouseup: r[0] ||= (e) => J.value = !1
				}, [createBaseVNode("div", { class: normalizeClass(["dp--cell-inner", n.classData]) }, [
					t.$slots.day && X.value(n) ? renderSlot(t.$slots, "day", {
						key: 0,
						day: +n.text,
						date: n.value
					}) : createCommentVNode("", !0),
					t.$slots.day ? createCommentVNode("", !0) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [createTextVNode(toDisplayString(n.text), 1)], 64)),
					n.marker && X.value(n) ? renderSlot(t.$slots, "marker", {
						key: 2,
						marker: n.marker,
						day: +n.text,
						date: n.value
					}, () => [createBaseVNode("div", {
						class: normalizeClass(be.value(n.marker)),
						style: normalizeStyle(n.marker.color ? { backgroundColor: n.marker.color } : {})
					}, null, 6)]) : createCommentVNode("", !0),
					Y.value(n.value) ? (openBlock(), createElementBlock("div", {
						key: 3,
						ref_for: !0,
						ref: "active-tooltip",
						class: "dp--marker-tooltip",
						style: normalizeStyle(ce.value)
					}, [n.marker?.tooltip ? (openBlock(), createElementBlock("div", {
						key: 0,
						class: "dp--tooltip-content",
						onClick: Ne
					}, [(openBlock(!0), createElementBlock(Fragment, null, renderList(n.marker.tooltip, (e, r) => (openBlock(), createElementBlock("div", {
						key: r,
						class: "dp--tooltip-text"
					}, [renderSlot(t.$slots, "marker-tooltip", {
						tooltip: e,
						day: n.value
					}, () => [createBaseVNode("div", {
						class: "dp--tooltip-mark",
						style: normalizeStyle(e.color ? { backgroundColor: e.color } : {})
					}, null, 4), createBaseVNode("div", null, toDisplayString(e.text), 1)])]))), 128)), createBaseVNode("div", {
						class: "dp--arrow-bottom-tp",
						style: normalizeStyle(le.value)
					}, null, 4)])) : createCommentVNode("", !0)], 4)) : createCommentVNode("", !0)
				], 2)], 40, lr))), 128))]))), 128))], 32)) : createCommentVNode("", !0)]),
				_: 3
			}, 8, ["name", "css"])
		], 2)], 10, rr));
	}
});
var dr = (e, t) => {
	let n = ref([]), i = ref(/* @__PURE__ */ new Date()), a = ref(), { getDate: o, getDateFromParts: s, rootEmit: c, calendars: l, month: u, year: d, time: f, modelValue: p, rootProps: m, today: h, state: g, defaults: { multiCalendars: v, startTime: y, range: b, config: x, safeDates: C, multiDates: w, timeConfig: T, flow: E, weekStart: D } } = $(), { validateMonthYearInRange: k, isDisabled: A, isDateRangeAllowed: j, checkMinMaxRange: M } = ht(), { updateTimeValues: N, getSetDateTime: ee, assignTime: P, assignStartTime: F, validateTime: I, disabledTimesConfig: te } = qn(), { formatDay: L } = qt(), { setTime: R, isDateBefore: z, getDaysInBetween: B } = Gt(), { checkRangeAutoApply: V, getRangeWithFixedDate: ne, handleMultiDatesSelect: re, setPresetDate: H } = kn(), { getMapDate: U } = Wt(), { selectOnAutoApply: W } = ln(e);
	mt(() => de(g.isTextInputDate));
	let { updateFlowStep: ie, flowStep: ae } = ut(), oe = (e) => !x.value.keepViewOnOffsetClick || e ? !0 : !a.value, G = (e, t, n, r = !1, i = !1) => {
		oe(i) && (!r && t && n && K(e, t, n), l.value[e] ??= l.value[e] = {
			month: 0,
			year: 0
		}, l.value[e].month = t ?? l.value[e]?.month, l.value[e].year = n ?? l.value[e]?.year);
	}, K = (e, t, n) => {
		(l.value.at(e)?.month !== t || l.value.at(e)?.year !== n) && c("update-month-year", {
			month: t,
			year: n,
			instance: e
		});
	}, ce = () => {
		y.value && F(y.value);
	};
	onMounted(() => {
		p.value || (Ee(), ce()), de(!0), m.focusStartDate && m.startDate && Ee();
	});
	let le = computed(() => E.value?.steps?.length ? E.value.steps.at(-1) === ae.value : !0), ue = () => {
		m.autoApply && e("auto-apply", !le.value);
	}, de = (e = !1) => {
		if (p.value) return Array.isArray(p.value) ? (n.value = p.value, xe(e)) : he(p.value, e);
		if (v.value.count && e && !m.startDate) return me(o(), e);
	}, fe = () => Array.isArray(p.value) && b.value.enabled ? getMonth(p.value[0]) === getMonth(p.value[1] ?? p.value[0]) : !1, pe = (e) => {
		let t = addMonths(e, 1);
		return {
			month: getMonth(t),
			year: getYear(t)
		};
	}, me = (e = o(), t = !1) => {
		if ((!v.value.count || !v.value.static || t) && G(0, getMonth(e), getYear(e), t), v.value.count && (!p.value || fe() || !v.value.solo) && (!v.value.solo || t)) for (let e = 1; e < v.value.count; e++) {
			let t = add(set(o(), {
				month: u.value(e - 1),
				year: d.value(e - 1)
			}), { months: 1 });
			l.value[e] = {
				month: getMonth(t),
				year: getYear(t)
			};
		}
	}, he = (e, t) => {
		me(e, t), P("hours", getHours(e)), P("minutes", getMinutes(e)), P("seconds", getSeconds(e)), v.value.count && t && Te();
	}, ge = (e) => {
		if (v.value.count) {
			if (v.value.solo) return 0;
			let t = getMonth(e[0]), n = getMonth(e[1]);
			return Math.abs(n - t) < v.value.count ? 0 : 1;
		}
		return 1;
	}, _e = (e, t) => {
		e[1] && b.value.showLastInRange ? me(e[ge(e)], t) : me(e[0], t);
		let n = (t, n) => [t(e[0]), e?.[1] ? t(e[1]) : f[n][1]];
		P("hours", n(getHours, "hours")), P("minutes", n(getMinutes, "minutes")), P("seconds", n(getSeconds, "seconds"));
	}, ye = (e, t) => {
		if ((b.value.enabled || m.weekPicker) && !w.value.enabled) return _e(e, t);
		if (w.value.enabled && t) {
			let n = e.at(-1);
			if (n) return he(n, t);
		}
	}, xe = (e) => {
		let t = p.value;
		ye(t, e), v.value.count && v.value.solo && Te();
	}, Ce = (e, n) => {
		let r = set(o(), {
			month: u.value(n),
			year: d.value(n)
		}), i = e < 0 ? addMonths(r, 1) : subMonths(r, 1);
		k(getMonth(i), getYear(i), e < 0, m.preventMinMaxNavigation) && (G(n, getMonth(i), getYear(i)), v.value.count && !v.value.solo && we(n), t());
	}, we = (e) => {
		for (let t = e - 1; t >= 0; t--) {
			let e = subMonths(set(o(), {
				month: u.value(t + 1),
				year: d.value(t + 1)
			}), 1);
			G(t, getMonth(e), getYear(e));
		}
		for (let t = e + 1; t <= v.value.count - 1; t++) {
			let e = addMonths(set(o(), {
				month: u.value(t - 1),
				year: d.value(t - 1)
			}), 1);
			G(t, getMonth(e), getYear(e));
		}
	}, Te = () => {
		if (Array.isArray(p.value) && p.value.length === 2) {
			let e = o(o(p.value[1] ?? addMonths(p.value[0], 1))), [t, n] = [getMonth(p.value[0]), getYear(p.value[0])], [r, i] = [getMonth(p.value[1]), getYear(p.value[1])];
			(t !== r || t === r && n !== i) && v.value.solo && G(1, getMonth(e), getYear(e));
		} else p.value && !Array.isArray(p.value) && (G(0, getMonth(p.value), getYear(p.value)), me(o()));
	}, Ee = () => {
		m.startDate && (G(0, getMonth(o(m.startDate)), getYear(o(m.startDate))), v.value.count && we(0));
	}, De = (e, t) => {
		if (x.value.monthChangeOnScroll) {
			let n = Date.now() - i.value.getTime(), r = Math.abs(e.deltaY), a = 500;
			r > 1 && (a = 100), r > 100 && (a = 0), n > a && (i.value = /* @__PURE__ */ new Date(), Ce(x.value.monthChangeOnScroll === "inverse" ? e.deltaY : -e.deltaY, t));
		}
	}, Oe = (e, t, n = !1) => {
		x.value.monthChangeOnArrows && m.vertical === n && ke(e, t);
	}, ke = (e, t) => {
		Ce(e === "right" ? -1 : 1, t);
	}, Ae = (e) => {
		if (C.value.markers) return U(e.value, C.value.markers);
	}, je = (e, t) => {
		switch (m.sixWeeks === !0 ? "append" : m.sixWeeks) {
			case "prepend": return [!0, !1];
			case "center": return [e == 0, !0];
			case "fair": return [e == 0 || t > e, !0];
			case "append": return [!1, !1];
			default: return [!1, !1];
		}
	}, Me = (e, t, n) => {
		if (n) {
			let r = n.days.at(-1);
			if (r) {
				let n = Pe(addDays(r.value, 1), getMonth(t));
				e.push({ days: n });
			}
		}
	}, Ne = (e, t, n, r) => {
		if (m.sixWeeks && e.length < 6) {
			let i = 6 - e.length, [a, o] = je((t.getDay() + 7 - r) % 7, 6 - (n.getDay() + 7 - r) % 7);
			for (let n = 1; n <= i; n++) if (o ? !!(n % 2) == a : a) {
				let n = e[0].days[0], r = Pe(addDays(n.value, -7), getMonth(t));
				e.unshift({ days: r });
			} else Me(e, t, e.at(-1));
		}
		return e;
	}, Pe = (e, t) => {
		let n = o(e), r = [];
		for (let e = 0; e < 7; e++) {
			let i = addDays(n, e), a = getMonth(i) !== t;
			r.push({
				text: m.hideOffsetDates && a ? "" : L(i),
				value: i,
				current: !a,
				classData: {}
			});
		}
		return r;
	}, Fe = (e, t) => {
		let n = [], r = s(t, e), i = s(t, e + 1, 0), a = startOfWeek(r, { weekStartsOn: D.value }), o = (t) => {
			let r = Pe(t, e);
			n.push({ days: r });
			let a = r.at(-1)?.value;
			z(a, i) && o(addDays(t, 7));
		};
		return o(a), Ne(n, r, i, D.value);
	}, Ie = (e) => {
		let t = R({
			hours: f.hours,
			minutes: f.minutes,
			seconds: Ge()
		}, o(e.value));
		c("date-click", t), w.value.enabled ? re(t, w.value.limit) : p.value = t, ie("calendar"), nextTick().then(() => {
			ue();
		});
	}, Le = (e) => b.value.noDisabledRange ? B(n.value[0], e).some((e) => A(e)) : !1, ze = () => {
		n.value = p.value ? p.value.slice().filter((e) => !!e) : [], n.value.length === 2 && !(b.value.fixedStart || b.value.fixedEnd) && (n.value = []);
	}, Be = (e, t) => {
		let r = [o(e.value), addDays(o(e.value), +b.value.autoRange)];
		j(r) ? (t && Ve(e.value), n.value = r) : c("invalid-date", e.value);
	}, Ve = (e) => {
		if (G(0, getMonth(o(e)), getYear(o(e))), v.value.count > 0) for (let t = 1; t < v.value.count; t++) {
			let n = pe(set(o(e), {
				year: d.value(t - 1),
				month: u.value(t - 1)
			}));
			G(t, n.month, n.year);
		}
	}, Ue = (e) => {
		if (Le(e.value) || !M(e.value, p.value, +!b.value.fixedStart)) return c("invalid-date", e.value);
		n.value = ne(o(e.value));
	}, We = (e, t) => {
		if (ze(), b.value.autoRange) return Be(e, t);
		if (b.value.fixedStart || b.value.fixedEnd) return Ue(e);
		n.value[0] ? M(o(e.value), p.value) && !Le(e.value) ? z(o(e.value), o(n.value[0])) ? b.value.autoSwitchStartEnd ? (n.value.unshift(o(e.value)), c("range-end", n.value[0])) : (n.value[0] = o(e.value), c("range-start", n.value[0])) : (n.value[1] = o(e.value), c("range-end", n.value[1])) : c("invalid-date", e.value) : (n.value[0] = o(e.value), c("range-start", n.value[0]));
	}, Ge = (e = !0) => T.value.enableSeconds ? Array.isArray(f.seconds) ? e ? f.seconds[0] : f.seconds[1] : f.seconds : 0, Ke = (e) => {
		n.value[e] = R({
			hours: f.hours[e],
			minutes: f.minutes[e],
			seconds: Ge(e !== 1)
		}, n.value[e]);
	}, qe = () => {
		n.value[0] && n.value[1] && +n.value?.[0] > +n.value?.[1] && (n.value.reverse(), c("range-start", n.value[0]), c("range-end", n.value[1]));
	}, Je = () => {
		n.value.length && (n.value[0] && !n.value[1] ? Ke(0) : (Ke(0), Ke(1), ie("calendar")), qe(), p.value = n.value.slice(), V(n.value, e, n.value.length < 2 || E.value?.steps.length ? E.value?.steps.at(-1) !== ae.value : !1));
	}, Ye = (e, t = !1) => {
		if (A(e.value) || !e.current && m.hideOffsetDates) return c("invalid-date", e.value);
		if (a.value = structuredClone(e), !b.value.enabled) return Ie(e);
		Array.isArray(f.hours) && Array.isArray(f.minutes) && !w.value.enabled && (We(e, t), Je());
	}, Xe = (e, n) => {
		let r = u.value(e) !== n.month;
		G(e, n.month, n.year, !1, !0), v.value.count && !v.value.solo && we(e), t(v.value.solo ? e : void 0), n.fromNav || ie(r ? "month" : "year");
	}, Ze = (e) => {
		H({ value: e }), W(), m.multiCalendars && nextTick().then(() => de(!0));
	}, Qe = () => {
		if (Array.isArray(p.value)) if (w.value.enabled) {
			let e = $e();
			p.value[p.value.length - 1] = ee(e);
		} else p.value = p.value.map((e, t) => e && ee(e, t));
		else p.value = ee(p.value);
		e("time-update");
	}, $e = () => Array.isArray(p.value) && p.value.length ? p.value[p.value.length - 1] : null, et = (e) => {
		let t = "";
		if (b.value.enabled && Array.isArray(p.value)) for (let n of Object.keys(e)) {
			let r = e[n];
			Array.isArray(r) && (f[n][0] !== r[0] && (t = "range-start"), f[n][1] !== r[1] && (t = "range-start"));
		}
		return t;
	};
	return {
		calendars: l,
		modelValue: p,
		month: u,
		year: d,
		time: f,
		disabledTimesConfig: te,
		today: h,
		validateTime: I,
		getCalendarDays: Fe,
		getMarker: Ae,
		handleScroll: De,
		handleSwipe: ke,
		handleArrow: Oe,
		selectDate: Ye,
		updateMonthYear: Xe,
		presetDate: Ze,
		updateTime: (e) => {
			let t = et(e);
			N(e, Qe), t && c(t, p.value[t === "range-start" ? 0 : 1]), E.value?.steps.length && ue();
		},
		assignMonthAndYear: me,
		setStartTime: ce
	};
};
var fr = () => {
	let { isModelAuto: e, matchDate: t, isDateAfter: n, isDateBefore: r, isDateBetween: i, isDateEqual: a, getWeekFromDate: o, getBeforeAndAfterInRange: s } = Gt(), { getDate: c, today: l, rootProps: u, defaults: { multiCalendars: d, multiDates: f, ui: p, highlight: m, safeDates: h, range: g, weekStart: _ }, modelValue: v } = $(), { isDisabled: y } = ht(), b = ref(null), x = (e) => {
		!e.current && u.hideOffsetDates || (b.value = e.value);
	}, S = () => {
		b.value = null;
	}, C = (e) => Array.isArray(v.value) && g.value.enabled && v.value[0] && b.value ? e ? n(b.value, v.value[0]) : r(b.value, v.value[0]) : !0, w = (e, t) => {
		let n = v.value && Array.isArray(v.value) && v.value ? t ? v.value[0] || null : v.value[1] : null;
		return a(c(e.value), n);
	}, T = (e) => {
		let t = Array.isArray(v.value) ? v.value[0] : null;
		return e ? !r(b.value, t) : !0;
	}, E = (e, t = !0) => (g.value.enabled || u.weekPicker) && Array.isArray(v.value) && v.value.length === 2 ? u.hideOffsetDates && !e.current ? !1 : a(c(e.value), v.value[+!t]) : g.value.enabled ? w(e, t) && T(t) || a(e.value, Array.isArray(v.value) ? v.value[0] : null) && C(t) : !1, D = (e, t) => {
		if (Array.isArray(v.value) && v.value[0] && v.value.length === 1) {
			let i = a(e.value, b.value);
			return t ? n(v.value[0], e.value) && i : r(v.value[0], e.value) && i;
		}
		return !1;
	}, k = (e) => !v.value || u.hideOffsetDates && !e.current ? !1 : g.value.enabled ? u.modelAuto && Array.isArray(v.value) ? a(e.value, v.value[0] ?? l) : !1 : f.value.enabled && Array.isArray(v.value) ? v.value.some((t) => a(t, e.value)) : a(e.value, v.value ? v.value : l), A = (e) => {
		if (g.value.autoRange || u.weekPicker) {
			if (b.value) {
				if (u.hideOffsetDates && !e.current) return !1;
				let t = addDays(b.value, +g.value.autoRange), n = o(c(b.value), _.value);
				return u.weekPicker ? a(n[1], c(e.value)) : a(t, c(e.value));
			}
			return !1;
		}
		return !1;
	}, j = (e) => {
		if (g.value.autoRange || u.weekPicker) {
			if (b.value) {
				let t = addDays(b.value, +g.value.autoRange);
				if (u.hideOffsetDates && !e.current) return !1;
				let i = o(c(b.value), _.value);
				return u.weekPicker ? n(e.value, i[0]) && r(e.value, i[1]) : n(e.value, b.value) && r(e.value, t);
			}
			return !1;
		}
		return !1;
	}, M = (e) => {
		if (g.value.autoRange || u.weekPicker) {
			if (b.value) {
				if (u.hideOffsetDates && !e.current) return !1;
				let t = o(c(b.value), _.value);
				return u.weekPicker ? a(t[0], e.value) : a(b.value, e.value);
			}
			return !1;
		}
		return !1;
	}, N = (e) => i(v.value, b.value, e.value), ee = () => u.modelAuto && Array.isArray(v.value) ? !!v.value[0] : !1, P = () => u.modelAuto ? e(v.value) : !0, F = (e) => {
		if (u.weekPicker) return !1;
		let t = g.value.enabled ? !E(e) && !E(e, !1) : !0;
		return !y(e.value) && !k(e) && !(!e.current && u.hideOffsetDates) && t;
	}, I = (e) => g.value.enabled ? u.modelAuto ? ee() && k(e) : !1 : k(e), te = (e) => m.value ? t(e.value, h.value.highlight) : !1, L = (e) => {
		let t = y(e.value);
		return t && (typeof m.value == "function" ? !m.value(e.value, t) : !m.value.options.highlightDisabled);
	}, R = (e) => typeof m.value == "function" ? m.value(e.value) : m.value.weekdays?.includes(e.value.getDay()), z = (e) => (g.value.enabled || u.weekPicker) && (!(d.value.count > 0) || e.current) && P() && !(!e.current && u.hideOffsetDates) && !k(e) ? N(e) : !1, B = (e) => {
		if (Array.isArray(v.value) && v.value.length === 1) {
			let { before: t, after: n } = s(+g.value.maxRange, v.value[0]);
			return isBefore(e.value, t) || isAfter(e.value, n);
		}
		return !1;
	}, V = (e) => {
		if (Array.isArray(v.value) && v.value.length === 1) {
			let { before: t, after: n } = s(+g.value.minRange, v.value[0]);
			return i([t, n], v.value[0], e.value);
		}
		return !1;
	}, ne = (e) => g.value.enabled && (g.value.maxRange || g.value.minRange) ? g.value.maxRange && g.value.minRange ? B(e) || V(e) : g.value.maxRange ? B(e) : V(e) : !1, re = (e) => {
		let { isRangeStart: t, isRangeEnd: i } = ie(e), o = g.value.enabled ? t || i : !1;
		return {
			"dp--cell-offset": !e.current,
			"dp--pointer": !u.disabled && !(!e.current && u.hideOffsetDates) && !y(e.value) && !ne(e),
			"dp--cell-disabled": y(e.value) || ne(e),
			"dp--cell-highlight": !L(e) && (te(e) || R(e)) && !I(e) && !o && !M(e) && !(z(e) && u.weekPicker) && !i,
			"dp--cell-highlight-active": !L(e) && (te(e) || R(e)) && I(e),
			"dp--today": !u.noToday && a(e.value, l) && e.current,
			"dp--past": r(e.value, l),
			"dp--future": n(e.value, l)
		};
	}, H = (e) => ({
		"dp--active": I(e),
		"dp--date-hoverable": F(e)
	}), U = (e) => {
		if (v.value && !Array.isArray(v.value)) {
			let t = o(v.value, _.value);
			return {
				...q(e),
				"dp--range-border-start dp--active": a(t[0], e.value),
				"dp--range-border-end dp--active": a(t[1], e.value),
				"dp--range-preview dp--range-between-week": n(e.value, t[0]) && r(e.value, t[1])
			};
		}
		return { ...q(e) };
	}, W = (e) => {
		if (v.value && Array.isArray(v.value)) {
			let t = o(v.value[0], _.value), i = v.value[1] ? o(v.value[1], _.value) : [];
			return {
				...q(e),
				"dp--range-border-start dp--active": a(t[0], e.value) || a(i[0], e.value),
				"dp--range-border-end dp--active": a(t[1], e.value) || a(i[1], e.value),
				"dp--range-preview dp--range-between-week": n(e.value, t[0]) && r(e.value, t[1]) || n(e.value, i[0]) && r(e.value, i[1]),
				"dp--range-between": n(e.value, t[1]) && r(e.value, i[0])
			};
		}
		return { ...q(e) };
	}, ie = (e) => ({
		isRangeStart: d.value.count > 0 ? e.current && E(e) && P() : E(e) && P(),
		isRangeEnd: d.value.count > 0 ? e.current && E(e, !1) && P() : E(e, !1) && P()
	}), ae = (e) => g.value.enabled && (g.value.fixedStart || g.value.fixedEnd) && Array.isArray(e) && e.length === 2, oe = (e, t, n, r) => !ae(v.value) || !b.value ? !1 : t ? g.value.fixedEnd && a(e.value, b.value) && isBefore(e.value, v.value[0]) && !n : g.value.fixedStart && a(e.value, b.value) && isAfter(e.value, v.value[1]) && !r, G = (e, t) => !ae(v.value) || !b.value ? !1 : t ? g.value.fixedEnd && isAfter(e.value, b.value) && isBefore(e.value, v.value[0]) : g.value.fixedStart && isBefore(e.value, b.value) && isAfter(e.value, v.value[1]), K = (e) => {
		let { isRangeStart: t, isRangeEnd: n } = ie(e);
		return {
			"dp--range-border-start dp--active": t,
			"dp--range-border-end dp--active": n,
			"dp--range-between": z(e) || G(e, !0) || G(e, !1),
			"dp--date-hoverable": a(e.value, b.value) && !t && !n && !u.weekPicker,
			"dp--date-hoverable dp--date-hoverable-start": D(e, !0) || oe(e, !0, t, n),
			"dp--date-hoverable dp--date-hoverable-end": D(e, !1) || oe(e, !1, t, n)
		};
	}, q = (e) => ({
		...K(e),
		"dp--range-preview dp--cell-auto-range": j(e),
		"dp--range-preview dp--range-border-start dp--cell-auto-range-start": M(e),
		"dp--range-preview dp--range-border-end dp--cell-auto-range-end": A(e)
	}), se = (e) => g.value.enabled ? g.value.autoRange ? q(e) : u.modelAuto ? {
		...H(e),
		...K(e)
	} : u.weekPicker ? W(e) : K(e) : u.weekPicker ? U(e) : H(e);
	return {
		setHoverDate: x,
		clearHoverDate: S,
		getDayClassData: (e) => u.hideOffsetDates && !e.current ? {} : {
			...re(e),
			...se(e),
			[p.value.dayClass ? p.value.dayClass(e.value, v.value) : ""]: !0,
			...p.value.calendarCell
		}
	};
};
var pr = { key: 0 };
var mr = /* @__PURE__ */ defineComponent({
	__name: "DatePicker",
	props: /*@__PURE__*/ mergeDefaults({
		collapse: { type: Boolean },
		menuWrapRef: {},
		noOverlayFocus: { type: Boolean }
	}, zt),
	emits: [
		"focus-menu",
		"select-date",
		"time-update",
		"auto-apply"
	],
	setup(t, { expose: n, emit: s }) {
		let l = s, { month: d, year: p, modelValue: m, time: h, disabledTimesConfig: _, today: b, validateTime: x, getCalendarDays: S, getMarker: C, handleArrow: T, handleScroll: E, handleSwipe: D, selectDate: O, updateMonthYear: j, presetDate: M, updateTime: N, assignMonthAndYear: ee, setStartTime: te } = dr(l, de), z = useSlots(), { setHoverDate: B, getDayClassData: V, clearHoverDate: ne } = fr(), { getDate: re, rootEmit: H, rootProps: U, defaults: { multiCalendars: W, timeConfig: ie } } = $(), { getYears: ae, getMonths: oe } = Jt(), { getCellId: G } = Gt(), K = useTemplateRef("calendar-header"), q = useTemplateRef("calendar"), J = useTemplateRef("time-picker"), se = tn(z, Qt.Calendar), ce = tn(z, Qt.DatePickerHeader), le = tn(z, Qt.TimePicker);
		watch(W, (e, t) => {
			e.count - t.count > 0 && ee();
		}, { deep: !0 });
		let ue = computed(() => (e) => S(d.value(e), p.value(e)).map((e) => ({
			...e,
			days: e.days.map((e) => (e.marker = C(e), e.classData = V(e), e))
		})));
		function de(e) {
			e || e === 0 ? q.value?.[e]?.triggerTransition(d.value(e), p.value(e)) : q.value?.forEach((e, t) => e?.triggerTransition(d.value(t), p.value(t)));
		}
		let fe = (e, t = 0) => {
			K.value?.[t]?.toggleMonthPicker(e);
		}, pe = (e, t = 0) => {
			K.value?.[t]?.toggleYearPicker(e);
		}, he = (e, t) => {
			J.value?.toggleTimePicker(e, t);
		}, ge = (e, t) => {
			if (!U.range) {
				let n = m.value ? m.value : b, r = t ? re(t) : n, i = e ? startOfWeek(r, { weekStartsOn: 1 }) : endOfWeek(r, { weekStartsOn: 1 });
				O({
					value: i,
					current: getMonth(r) === d.value(0),
					text: "",
					classData: {}
				}), document.getElementById(G(i))?.focus();
			}
		}, _e = (e) => {
			K.value?.[0]?.handleMonthYearChange(e, !0);
		}, ve = (e) => {
			j(0, {
				month: d.value(0),
				year: p.value(0) + (e ? 1 : -1),
				fromNav: !0
			});
		}, ye = (e) => {
			H("overlay-toggle", {
				open: !1,
				overlay: e
			}), l("focus-menu");
		};
		return n({
			clearHoverDate: ne,
			presetDate: M,
			handleArrow: T,
			updateMonthYear: j,
			setStartTime: te,
			toggleMonthPicker: fe,
			toggleYearPicker: pe,
			toggleTimePicker: he,
			getSidebarProps: () => ({
				modelValue: m,
				month: d,
				year: p,
				time: h,
				updateTime: N,
				updateMonthYear: j,
				selectDate: O,
				presetDate: M
			}),
			changeMonth: _e,
			changeYear: ve,
			selectWeekDate: ge
		}), (n, r) => (openBlock(), createElementBlock(Fragment, null, [createVNode(Cn, { collapse: t.collapse }, {
			default: withCtx(({ instances: s, wrapClass: l }) => [(openBlock(!0), createElementBlock(Fragment, null, renderList(s, (e) => (openBlock(), createElementBlock("div", {
				key: e,
				class: normalizeClass(l)
			}, [unref(U).hideMonthYearSelect ? createCommentVNode("", !0) : (openBlock(), createBlock(nr, {
				key: 0,
				ref_for: !0,
				ref: "calendar-header",
				months: unref(oe)(),
				years: unref(ae)(),
				month: unref(d)(e),
				year: unref(p)(e),
				instance: e,
				"menu-wrap-ref": t.menuWrapRef,
				onUpdateMonthYear: (t) => unref(j)(e, t),
				onOverlayClosed: ye
			}, createSlots({ _: 2 }, [renderList(unref(ce), (e) => ({
				name: e,
				fn: withCtx((t) => [renderSlot(n.$slots, e, mergeProps({ ref_for: !0 }, t))])
			}))]), 1032, [
				"months",
				"years",
				"month",
				"year",
				"instance",
				"menu-wrap-ref",
				"onUpdateMonthYear"
			])), createVNode(ur, {
				ref_for: !0,
				ref: "calendar",
				"mapped-dates": ue.value(e),
				instance: e,
				month: unref(d)(e),
				year: unref(p)(e),
				onSelectDate: (t) => unref(O)(t, e !== 1),
				onSetHoverDate: r[0] ||= (e) => unref(B)(e),
				onHandleScroll: (t) => unref(E)(t, e),
				onHandleSwipe: (t) => unref(D)(t, e)
			}, createSlots({ _: 2 }, [renderList(unref(se), (e) => ({
				name: e,
				fn: withCtx((t) => [renderSlot(n.$slots, e, mergeProps({ ref_for: !0 }, t))])
			}))]), 1032, [
				"mapped-dates",
				"instance",
				"month",
				"year",
				"onSelectDate",
				"onHandleScroll",
				"onHandleSwipe"
			])], 2))), 128))]),
			_: 3
		}, 8, ["collapse"]), unref(ie).enableTimePicker ? (openBlock(), createElementBlock("div", pr, [renderSlot(n.$slots, "time-picker", normalizeProps(guardReactiveProps({
			time: unref(h),
			updateTime: unref(N)
		})), () => [createVNode(Kn, {
			ref: "time-picker",
			hours: unref(h).hours,
			minutes: unref(h).minutes,
			seconds: unref(h).seconds,
			"disabled-times-config": unref(_),
			"validate-time": unref(x),
			"no-overlay-focus": t.noOverlayFocus,
			"onUpdate:hours": r[1] ||= (e) => unref(N)({
				hours: e,
				minutes: unref(h).minutes,
				seconds: unref(h).seconds
			}),
			"onUpdate:minutes": r[2] ||= (e) => unref(N)({
				hours: unref(h).hours,
				minutes: e,
				seconds: unref(h).seconds
			}),
			"onUpdate:seconds": r[3] ||= (e) => unref(N)({
				hours: unref(h).hours,
				minutes: unref(h).minutes,
				seconds: e
			})
		}, createSlots({ _: 2 }, [renderList(unref(le), (e) => ({
			name: e,
			fn: withCtx((t) => [renderSlot(n.$slots, e, normalizeProps(guardReactiveProps(t)))])
		}))]), 1032, [
			"hours",
			"minutes",
			"seconds",
			"disabled-times-config",
			"validate-time",
			"no-overlay-focus"
		])])])) : createCommentVNode("", !0)], 64));
	}
});
var hr = (e) => {
	let { getDate: t, modelValue: n, year: i, calendars: a, defaults: { highlight: o, range: s, multiDates: c } } = $(), { isDateBetween: l, isDateEqual: u } = Gt(), { checkRangeAutoApply: d, handleMultiDatesSelect: f, setMonthOrYearRange: p } = kn();
	mt();
	let { isDisabled: m } = ht(), { formatQuarterText: h } = qt(), { childMount: g } = ut(), { groupedYears: _, showYearPicker: v, isDisabled: y, selectYear: b, toggleYearPicker: x, handleYearSelect: C, handleYear: w, setStartDate: T } = On(), E = ref();
	onMounted(() => {
		g(), T();
	});
	let D = computed(() => (e) => n.value ? Array.isArray(n.value) ? n.value.some((t) => isSameQuarter(e, t)) : isSameQuarter(n.value, e) : !1), k = (e) => {
		if (s.value.enabled) {
			if (Array.isArray(n.value)) {
				let t = u(e, n.value[0]) || u(e, n.value[1]);
				return l(n.value, E.value, e) && !t;
			}
			return !1;
		}
		return !1;
	}, A = (e, t) => e.quarter === getQuarter(t) && e.year === getYear(t), j = (e) => typeof o.value == "function" ? o.value({
		quarter: getQuarter(e),
		year: getYear(e)
	}) : o.value.quarters.some((t) => A(t, e)), M = computed(() => (e) => {
		let n = set(t(), { year: i.value(e) });
		return eachQuarterOfInterval({
			start: startOfYear(n),
			end: endOfYear(n)
		}).map((e) => {
			let t = startOfQuarter(e), n = endOfQuarter(e), r = m(e), i = k(t), a = j(t);
			return {
				text: h(t, n),
				value: t,
				active: D.value(t),
				highlighted: a,
				disabled: r,
				isBetween: i
			};
		});
	}), N = (t) => {
		f(t, c.value.limit), e("auto-apply", !0);
	}, ee = (t) => {
		n.value = p(t), d(n.value, e, n.value.length < 2);
	}, P = (t) => {
		n.value = t, e("auto-apply");
	};
	return {
		groupedYears: _,
		year: i,
		isDisabled: y,
		quarters: M,
		showYearPicker: v,
		modelValue: n,
		selectYear: b,
		toggleYearPicker: x,
		handleYearSelect: C,
		handleYear: w,
		setHoverDate: (e) => {
			E.value = e;
		},
		selectQuarter: (e, t, n) => {
			if (!n) return a.value[t].month = getMonth(endOfQuarter(e)), c.value.enabled ? N(e) : s.value.enabled ? ee(e) : P(e);
		}
	};
};
var gr = { class: "dp--quarter-items" };
var _r = [
	"data-test-id",
	"disabled",
	"onClick",
	"onMouseover"
];
var vr = /* @__PURE__ */ defineComponent({
	__name: "QuarterPicker",
	props: {
		collapse: { type: Boolean },
		menuWrapRef: {},
		noOverlayFocus: { type: Boolean }
	},
	emits: ["auto-apply"],
	setup(t, { expose: n, emit: r }) {
		let d = r, { defaults: { config: f } } = $(), p = useSlots(), { boolHtmlAttribute: m } = Xt(), h = tn(p, Qt.YearMode), { groupedYears: _, year: y, isDisabled: x, quarters: S, modelValue: C, showYearPicker: T, setHoverDate: E, selectQuarter: D, toggleYearPicker: O, handleYearSelect: j, handleYear: N } = hr(d);
		return n({
			getSidebarProps: () => ({
				modelValue: C,
				year: y,
				selectQuarter: D,
				handleYearSelect: j,
				handleYear: N
			}),
			toggleYearPicker: (e) => O(0, e)
		}), (n, r) => (openBlock(), createBlock(Cn, {
			collapse: t.collapse,
			stretch: ""
		}, {
			default: withCtx(({ instances: t, wrapClass: r }) => [(openBlock(!0), createElementBlock(Fragment, null, renderList(t, (t) => (openBlock(), createElementBlock("div", {
				key: t,
				class: normalizeClass(r)
			}, [createBaseVNode("div", {
				class: "dp-quarter-picker-wrap",
				style: normalizeStyle({ minHeight: `${unref(f).modeHeight}px` })
			}, [
				n.$slots["top-extra"] ? renderSlot(n.$slots, "top-extra", {
					key: 0,
					value: unref(C)
				}) : createCommentVNode("", !0),
				createBaseVNode("div", null, [createVNode(Dn, {
					items: unref(_)(t),
					instance: t,
					"show-year-picker": unref(T)[t],
					year: unref(y)(t),
					"is-disabled": (e) => unref(x)(t, e),
					onHandleYear: (e) => unref(N)(t, e),
					onYearSelect: (e) => unref(j)(e, t),
					onToggleYearPicker: (e) => unref(O)(t, e?.show)
				}, createSlots({ _: 2 }, [renderList(unref(h), (e) => ({
					name: e,
					fn: withCtx((t) => [renderSlot(n.$slots, e, mergeProps({ ref_for: !0 }, t))])
				}))]), 1032, [
					"items",
					"instance",
					"show-year-picker",
					"year",
					"is-disabled",
					"onHandleYear",
					"onYearSelect",
					"onToggleYearPicker"
				])]),
				createBaseVNode("div", gr, [(openBlock(!0), createElementBlock(Fragment, null, renderList(unref(S)(t), (e, r) => (openBlock(), createElementBlock("div", { key: r }, [createBaseVNode("button", {
					type: "button",
					class: normalizeClass(["dp--btn-base dp--qr-btn", {
						"dp--active": e.active,
						"dp--qr-btn-between": e.isBetween,
						"dp--qr-btn-disabled": e.disabled,
						"dp--highlighted": e.highlighted
					}]),
					"data-dp-action-element": "0",
					"data-test-id": e.value,
					disabled: unref(m)(e.disabled),
					onClick: (n) => unref(D)(e.value, t, e.disabled),
					onMouseover: (t) => unref(E)(e.value)
				}, [renderSlot(n.$slots, "quarter", {
					value: e.value,
					text: e.text
				}, () => [createTextVNode(toDisplayString(e.text), 1)])], 42, _r)]))), 128))])
			], 4)], 2))), 128))]),
			_: 3
		}, 8, ["collapse"]));
	}
});
var yr = [
	"id",
	"tabindex",
	"role",
	"aria-label",
	"aria-modal"
];
var br = {
	key: 0,
	class: "dp--menu-load-container"
};
var xr = {
	key: 1,
	class: "dp--menu-header"
};
var Sr = ["data-dp-mobile"];
var Cr = {
	key: 0,
	class: "dp--sidebar-left"
};
var wr = ["data-dp-mobile"];
var Tr = [
	"data-test-id",
	"data-dp-mobile",
	"onClick",
	"onKeydown"
];
var Er = { class: "dp--instance-calendar" };
var Dr = {
	key: 2,
	class: "dp--sidebar-right"
};
var Or = {
	key: 2,
	class: "dp--action-extra"
};
var kr = /* @__PURE__ */ defineComponent({
	__name: "DatepickerMenu",
	props: {
		collapse: { type: Boolean },
		noOverlayFocus: { type: Boolean },
		getInputRect: { type: Function }
	},
	emits: [
		"close-picker",
		"select-date",
		"auto-apply",
		"time-update",
		"menu-blur"
	],
	setup(t, { expose: n, emit: l }) {
		let u = l, d = useSlots(), { state: p, rootProps: m, defaults: { textInput: h, inline: g, config: _, ui: x, ariaLabels: T }, rootEmit: E, setState: D } = $(), { isMobile: N } = Kt(), { handleEventPropagation: te, getElWithin: L, checkStopPropagation: z, checkKeyDown: B } = Wt(), { selectCurrentDate: ne } = ln();
		dt();
		let H = useTemplateRef("inner-menu"), U = useTemplateRef("dp-menu"), W = useTemplateRef("dyn-cmp"), ie = ref(0), ae = ref(!1), oe = ref(!1), { executeFlow: G } = lt(W, u), K = (e) => {
			oe.value = !0, _.value.allowPreventDefault && e.preventDefault(), z(e, _.value, !0);
		};
		onMounted(() => {
			ae.value = !0, q(), globalThis.addEventListener("resize", q);
			let e = unrefElement(U);
			e && !h.value.enabled && !g.value.enabled && D("menuFocused", !0), e && (e.addEventListener("pointerdown", K), e.addEventListener("mousedown", K), E("menu-mounted", e)), document.addEventListener("mousedown", we);
		}), onUnmounted(() => {
			globalThis.removeEventListener("resize", q), document.removeEventListener("mousedown", we);
			let e = unrefElement(U);
			e && (e.removeEventListener("pointerdown", K), e.removeEventListener("mousedown", K), E("menu-unmounted", e));
		});
		let q = () => {
			let e = unrefElement(H);
			e && (ie.value = e.getBoundingClientRect().width);
		}, J = computed(() => m.monthPicker ? jn : m.yearPicker ? Nn : m.timePicker ? Yn : m.quarterPicker ? vr : mr), se = () => {
			let e = unrefElement(U);
			e && e.focus({ preventScroll: !0 });
		}, ce = computed(() => W.value?.getSidebarProps() || {}), le = tn(d, Qt.ActionRow), ue = tn(d, Qt.PassTrough), de = computed(() => ({
			"dp--menu-unclickable dp--menu-disabled": m.disabled,
			"dp--menu-unclickable dp--menu-readonly": m.readonly,
			"dp--menu-unclickable dp-menu-loading": m.loading
		})), fe = computed(() => ({
			"dp--menu": !0,
			"dp--menu-index": !g.value.enabled,
			"dp--relative": g.value.enabled,
			...x.value.menu
		})), pe = (e) => {
			z(e, _.value, !0);
		}, me = (e) => {
			_.value.escClose && (u("close-picker"), te(e, _.value));
		}, he = (e) => {
			m.arrowNavigation || (e === at.left || e === at.up ? ye("handleArrow", at.left, 0, e === at.up) : ye("handleArrow", at.right, 0, e === at.down));
		}, ge = (e) => {
			D("shiftKeyInMenu", e.shiftKey), _.value.tabOutClosesMenu && !m.hideMonthYearSelect && e.code === Q.tab && e.target.classList.contains("dp--menu") && p.shiftKeyInMenu && (e.preventDefault(), z(e, _.value, !0), u("close-picker"));
		}, _e = (e) => {
			W.value?.toggleTimePicker(!1, !1), W.value?.toggleMonthPicker(!1, e), W.value?.toggleYearPicker(!1, e);
		}, ve = (e, t = 0) => e === "month" ? W.value?.toggleMonthPicker(!0, t) : e === "year" ? W.value?.toggleYearPicker(!0, t) : e === "time" ? W.value?.toggleTimePicker(!0) : _e(t), ye = (e, ...t) => {
			W.value?.[e] && W.value?.[e](...t);
		}, be = (e) => {
			ye("presetDate", toValue$1(e));
		}, Y = () => {
			ye("clearHoverDate");
		}, xe = (e, t) => {
			ye("updateMonthYear", e, t);
		}, Se = (e, t) => {
			e.preventDefault(), he(t);
		}, Ce = (e) => {
			_.value.allowPreventDefault && (e.preventDefault(), z(e, _.value, !0));
		}, X = (e) => {
			if (_.value.onInternalKeydown?.(e) !== !1) {
				if (ge(e), e.key === Q.home || e.key === Q.end) return ye("selectWeekDate", e.key === Q.home, e.target.getAttribute("id"));
				switch ((e.key === Q.pageUp || e.key === Q.pageDown) && (e.shiftKey ? (ye("changeYear", e.key === Q.pageUp), L(U.value, "overlay-year")?.focus()) : (ye("changeMonth", e.key === Q.pageUp), L(U.value, e.key === Q.pageUp ? "action-prev" : "action-next")?.focus()), e.target.getAttribute("id") && U.value?.focus({ preventScroll: !0 })), e.key) {
					case Q.esc: return me(e);
					case Q.enter: return Ce(e);
					case Q.arrowLeft: return Se(e, at.left);
					case Q.arrowRight: return Se(e, at.right);
					case Q.arrowUp: return Se(e, at.up);
					case Q.arrowDown: return Se(e, at.down);
					default: return;
				}
			}
		}, we = (e) => {
			g.value.enabled && !g.value.input && !U.value?.contains(e.target) && oe.value && (oe.value = !1, u("menu-blur"));
		};
		return n({
			updateMonthYear: xe,
			switchView: ve,
			onValueCleared: () => {
				W.value?.setStartTime?.();
			},
			executeFlow: G
		}), (n, r) => (openBlock(), createElementBlock("div", {
			id: unref(m).menuId,
			ref: "dp-menu",
			tabindex: unref(g).enabled ? void 0 : "0",
			role: unref(g).enabled ? void 0 : "dialog",
			"aria-label": unref(T)?.menu,
			"aria-modal": unref(g).enabled ? void 0 : !0,
			class: normalizeClass(fe.value),
			onMouseleave: Y,
			onClick: pe,
			onKeydown: X
		}, [
			(unref(m).disabled || unref(m).readonly) && unref(g).enabled || unref(m).loading ? (openBlock(), createElementBlock("div", {
				key: 0,
				class: normalizeClass(de.value)
			}, [unref(m).loading ? (openBlock(), createElementBlock("div", br, [...r[5] ||= [createBaseVNode("span", { class: "dp--menu-loader" }, null, -1)]])) : createCommentVNode("", !0)], 2)) : createCommentVNode("", !0),
			n.$slots["menu-header"] ? (openBlock(), createElementBlock("div", xr, [renderSlot(n.$slots, "menu-header")])) : createCommentVNode("", !0),
			renderSlot(n.$slots, "arrow"),
			createBaseVNode("div", {
				ref: "inner-menu",
				class: normalizeClass({
					"dp--menu-content-wrapper": unref(m).presetDates?.length || !!n.$slots["left-sidebar"] || !!n.$slots["right-sidebar"],
					"dp--menu-content-wrapper-collapsed": t.collapse && (unref(m).presetDates?.length || !!n.$slots["left-sidebar"] || !!n.$slots["right-sidebar"])
				}),
				"data-dp-mobile": unref(N),
				style: normalizeStyle({ "--dp-menu-width": `${ie.value}px` })
			}, [
				n.$slots["left-sidebar"] ? (openBlock(), createElementBlock("div", Cr, [renderSlot(n.$slots, "left-sidebar", normalizeProps(guardReactiveProps(ce.value)))])) : createCommentVNode("", !0),
				unref(m).presetDates.length ? (openBlock(), createElementBlock("div", {
					key: 1,
					class: normalizeClass({
						"dp--preset-dates-collapsed": t.collapse,
						"dp--preset-dates": !0
					}),
					"data-dp-mobile": unref(N)
				}, [(openBlock(!0), createElementBlock(Fragment, null, renderList(unref(m).presetDates, (r, i) => (openBlock(), createElementBlock(Fragment, { key: i }, [r.slot ? renderSlot(n.$slots, r.slot, {
					key: 0,
					presetDate: be,
					label: r.label,
					value: r.value
				}) : (openBlock(), createElementBlock("button", {
					key: 1,
					type: "button",
					style: normalizeStyle(r.style || {}),
					class: normalizeClass(["dp--btn dp--preset-range", { "dp--preset-range-collapsed": t.collapse }]),
					"data-test-id": r.testId ?? void 0,
					"data-dp-mobile": unref(N),
					onClick: withModifiers((e) => be(r.value), ["prevent"]),
					onKeydown: (e) => unref(B)(e, () => be(r.value), !0)
				}, toDisplayString(r.label), 47, Tr))], 64))), 128))], 10, wr)) : createCommentVNode("", !0),
				createBaseVNode("div", Er, [(openBlock(), createBlock(resolveDynamicComponent(J.value), {
					ref: "dyn-cmp",
					collapse: t.collapse,
					"no-overlay-focus": t.noOverlayFocus,
					"menu-wrap-ref": U.value,
					onFocusMenu: se,
					onSelectDate: r[0] ||= (e) => n.$emit("select-date"),
					onAutoApply: r[1] ||= (e) => n.$emit("auto-apply", e),
					onTimeUpdate: r[2] ||= (e) => n.$emit("time-update")
				}, createSlots({ _: 2 }, [renderList(unref(ue), (e) => ({
					name: e,
					fn: withCtx((t) => [renderSlot(n.$slots, e, normalizeProps(guardReactiveProps({ ...t })))])
				}))]), 1064, [
					"collapse",
					"no-overlay-focus",
					"menu-wrap-ref"
				]))]),
				n.$slots["right-sidebar"] ? (openBlock(), createElementBlock("div", Dr, [renderSlot(n.$slots, "right-sidebar", normalizeProps(guardReactiveProps(ce.value)))])) : createCommentVNode("", !0)
			], 14, Sr),
			n.$slots["action-extra"] ? (openBlock(), createElementBlock("div", Or, [n.$slots["action-extra"] ? renderSlot(n.$slots, "action-extra", {
				key: 0,
				selectCurrentDate: unref(ne)
			}) : createCommentVNode("", !0)])) : createCommentVNode("", !0),
			!unref(m).autoApply || unref(_).keepActionRow ? (openBlock(), createBlock(mn, {
				key: 3,
				"menu-mount": ae.value,
				"calendar-width": ie.value,
				onClosePicker: r[3] ||= (e) => n.$emit("close-picker"),
				onSelectDate: r[4] ||= (e) => n.$emit("select-date"),
				onSelectNow: unref(ne)
			}, createSlots({ _: 2 }, [renderList(unref(le), (e) => ({
				name: e,
				fn: withCtx((t) => [renderSlot(n.$slots, e, normalizeProps(guardReactiveProps(t)))])
			}))]), 1032, [
				"menu-mount",
				"calendar-width",
				"onSelectNow"
			])) : createCommentVNode("", !0)
		], 42, yr));
	}
});
var Ar = defineComponent({
	name: "MaybeTeleport",
	props: {
		to: {
			type: [String, Object],
			default: void 0
		},
		disabled: {
			type: Boolean,
			default: !1
		}
	},
	setup(e, { slots: n }) {
		return () => {
			let r = n.default?.();
			return e.to && !e.disabled ? h(Teleport, { to: e.to }, r) : r;
		};
	}
});
var jr = ["data-dp-mobile"];
var Mr = /* @__PURE__ */ defineComponent({
	__name: "VueDatePicker",
	setup(e, { expose: t }) {
		let { rootEmit: l, setState: d, inputValue: p, modelValue: m, rootProps: h, defaults: { inline: g, config: x, textInput: T, range: E, multiDates: D, teleport: j, floatingConfig: M, flow: ee } } = $(), { validateDate: te, isValidTime: z } = ht(), { menuTransition: B, showTransition: V } = pt(), { isMobile: re } = Kt(), { findNextFocusableElement: H, getNumVal: U } = Wt(), q = useSlots(), J = ref(!1), se = ref(g.value.enabled), ce = ref(g.value.enabled || h.centered), le = toRef(h, "modelValue"), ue = toRef(h, "timezone"), de = useTemplateRef("dp-menu-wrap"), fe = useTemplateRef("dp-menu"), pe = useTemplateRef("input-cmp"), me = useTemplateRef("picker-wrapper"), he = useTemplateRef("menu-arrow"), ge = ref(!1), _e = ref(!1), ve = ref(!1), ye = ref(!0), { floatingStyles: be, middlewareData: Y, placement: xe, y: Se } = useFloating(pe, de, {
			strategy: M.value.strategy,
			placement: M.value.placement,
			middleware: ((e) => (M.value.flip && e.push(flip(typeof M.value.flip == "object" ? M.value.flip : {})), M.value.shift && e.push(shift(typeof M.value.shift == "object" ? M.value.shift : {})), M.value.arrow && e.push(arrow({ element: M.value.arrow === !0 ? he : M.value.arrow })), e))([offset(M.value.offset)]),
			whileElementsMounted: autoUpdate
		});
		onMounted(() => {
			we(h.modelValue), nextTick().then(() => {
				g.value.enabled || globalThis.addEventListener("resize", Me);
			}), g.value.enabled && (J.value = !0), globalThis.addEventListener("keyup", Ne), globalThis.addEventListener("keydown", Pe);
		}), onUnmounted(() => {
			g.value.enabled || globalThis.removeEventListener("resize", Me), globalThis.removeEventListener("keyup", Ne), globalThis.removeEventListener("keydown", Pe);
		});
		let Ce = nn(q, h.presetDates), X = tn(q, Qt.Input);
		watch([le, ue], () => {
			we(le.value);
		}, { deep: !0 }), watch([xe, Se], () => {
			!g.value.enabled && !h.centered && ye.value && (ce.value = !1, nextTick().then(() => {
				ye.value = !1, ce.value = !0;
			}));
		});
		let { parseExternalModelValue: we, emitModelValue: Te, formatInputValue: Ee, checkBeforeEmit: De } = ft(), Oe = computed(() => ({
			"dp--main": !0,
			"dp--theme-dark": h.dark,
			"dp--theme-light": !h.dark,
			"dp--flex-display": g.value.enabled,
			"dp--flex-display-collapsed": ve.value,
			"dp--flex-display-with-input": g.value.input
		})), ke = computed(() => h.dark ? "dp--theme-dark" : "dp--theme-light"), Ae = computed(() => g.value.enabled && (h.timePicker || h.monthPicker || h.yearPicker || h.quarterPicker)), je = () => pe.value?.$el?.getBoundingClientRect() ?? {
			width: 0,
			left: 0,
			right: 0
		}, Z = () => {
			J.value && x.value.closeOnScroll && Ue();
		}, Me = () => {
			let e = fe.value?.$el.getBoundingClientRect().width ?? 0;
			ve.value = document.body.offsetWidth <= e;
		}, Ne = (e) => {
			if (e.key === "Tab" && !g.value.enabled && x.value.tabOutClosesMenu) {
				let e = me.value?.contains(document.activeElement), t = de.value?.contains(document.activeElement);
				!e && !t && Ue();
			}
			_e.value = e.shiftKey;
		}, Pe = (e) => {
			_e.value = e.shiftKey;
		}, Fe = () => {
			!h.disabled && !h.readonly && (ye.value = !0, se.value = !0, J.value = !0, J.value && l("open"), J.value || He(), we(h.modelValue));
		}, Ie = () => {
			p.value = "", He(), fe.value?.onValueCleared(), pe.value?.setParsedDate(null), l("update:model-value", null), l("cleared"), x.value.closeOnClearValue && Ue();
		}, Le = () => {
			let e = m.value;
			return !e || !Array.isArray(e) && te(e) ? !0 : Array.isArray(e) ? D.value.enabled || e.length === 2 && te(e[0]) && te(e[1]) ? !0 : E.value.partialRange && !h.timePicker ? te(e[0]) : !1 : !1;
		}, Re = () => {
			De() && Le() ? (Te(), Ue()) : l("invalid-select");
		}, ze = (e) => {
			Be(), Te(), x.value.closeOnAutoApply && !e && Ue();
		}, Be = () => {
			pe.value && T.value.enabled && pe.value.setParsedDate(m.value);
		}, Ve = (e = !1) => {
			h.autoApply && z(m.value) && Le() && (E.value.enabled && Array.isArray(m.value) ? (E.value.partialRange || m.value.length === 2) && ze(e) : ze(e));
		}, He = () => {
			T.value.enabled || (m.value = null);
		}, Ue = (e = !1) => {
			ye.value = !0, e && m.value && x.value.setDateOnMenuClose && Re(), g.value.enabled || (J.value && (J.value = !1, d("menuFocused", !1), d("shiftKeyInMenu", !1), l("closed"), p.value && we(le.value)), He(), l("blur"));
		}, We = () => {
			!g.value.enabled && !J.value && (se.value = !1);
		}, Ge = (e, t, n = !1) => {
			if (!e) {
				m.value = null;
				return;
			}
			let r = Array.isArray(e) ? e.every((e) => te(e)) : te(e), i = z(e);
			r && i ? (d("isTextInputDate", !0), m.value = e, t ? (ge.value = n, Re(), l("text-submit")) : h.autoApply && Ve(!0), nextTick().then(() => {
				d("isTextInputDate", !1);
			})) : l("invalid-date", e);
		}, Ke = () => {
			h.autoApply && z(m.value) && Te(), Be();
		}, qe = () => J.value ? Ue() : Fe(), Je = (e) => {
			m.value = e;
		}, Ye = () => {
			T.value.enabled && (d("isInputFocused", !0), Ee()), l("focus");
		}, Xe = () => {
			T.value.enabled && (d("isInputFocused", !1), we(h.modelValue), ge.value && H(me.value, _e.value)?.focus()), l("blur");
		}, Ze = (e, t) => {
			fe.value && fe.value.updateMonthYear(t ?? 0, {
				month: U(e.month),
				year: U(e.year)
			});
		}, Qe = (e) => {
			we(e ?? h.modelValue);
		}, $e = (e, t) => {
			fe.value?.switchView(e, t);
		}, et = (e, t) => {
			if (J.value) return x.value.onClickOutside ? x.value.onClickOutside(e, t) : Ue(!0);
		};
		return onClickOutside(de, (e) => et(Le, e), { ignore: [pe] }), t({
			closeMenu: Ue,
			selectDate: Re,
			clearValue: Ie,
			openMenu: Fe,
			onScroll: Z,
			formatInputValue: Ee,
			updateInternalModelValue: Je,
			setMonthYear: Ze,
			parseModel: Qe,
			switchView: $e,
			toggleMenu: qe,
			executeFlow: (e) => {
				fe.value?.executeFlow(e ?? ee.value?.steps?.at(0));
			},
			getDpWrapMenuRef: () => de,
			dpMenuRef: () => fe,
			dpWrapMenuRef: () => de,
			inputRef: () => pe
		}), (e, t) => (openBlock(), createElementBlock("div", {
			ref: "picker-wrapper",
			class: normalizeClass(Oe.value),
			"data-datepicker-instance": "",
			"data-dp-mobile": unref(re)
		}, [createVNode(cn, {
			ref: "input-cmp",
			"is-menu-open": J.value,
			onClear: Ie,
			onOpen: Fe,
			onSetInputDate: Ge,
			onSetEmptyDate: unref(Te),
			onSelectDate: Re,
			onToggle: qe,
			onClose: Ue,
			onFocus: Ye,
			onBlur: Xe,
			onRealBlur: t[0] ||= (e) => unref(d)("isInputFocused", !1)
		}, createSlots({ _: 2 }, [renderList(unref(X), (t) => ({
			name: t,
			fn: withCtx((n) => [renderSlot(e.$slots, t, normalizeProps(guardReactiveProps(n)))])
		}))]), 1032, ["is-menu-open", "onSetEmptyDate"]), createVNode(unref(Ar), {
			to: unref(j),
			disabled: !unref(j)
		}, {
			default: withCtx(() => [se.value ? (openBlock(), createElementBlock("div", {
				key: 0,
				ref: "dp-menu-wrap",
				class: normalizeClass({
					"dp--menu-wrapper": !unref(g).enabled,
					"dp--outer-menu-wrap": !0,
					"dp--centered": unref(h).centered
				}),
				style: normalizeStyle(!unref(g).enabled && !unref(h).centered ? unref(be) : void 0)
			}, [createVNode(Transition, {
				name: unref(B)(unref(xe).startsWith("top")),
				css: unref(V) && !unref(g).enabled && !unref(h).centered && ce.value,
				appear: "",
				onAfterLeave: We
			}, {
				default: withCtx(() => [J.value && ce.value ? (openBlock(), createBlock(kr, {
					key: 0,
					ref: "dp-menu",
					class: normalizeClass({ [ke.value]: !0 }),
					"no-overlay-focus": Ae.value,
					collapse: ve.value,
					"get-input-rect": je,
					onClosePicker: Ue,
					onSelectDate: Re,
					onAutoApply: Ve,
					onTimeUpdate: Ke,
					onMenuBlur: t[1] ||= (e) => unref(l)("blur")
				}, createSlots({ _: 2 }, [renderList(unref(Ce), (t) => ({
					name: t,
					fn: withCtx((n) => [renderSlot(e.$slots, t, normalizeProps(guardReactiveProps({ ...n })))])
				})), !unref(g).enabled && !unref(h).centered && unref(M).arrow === !0 ? {
					name: "arrow",
					fn: withCtx(() => [createBaseVNode("div", {
						ref: "menu-arrow",
						class: normalizeClass({
							"dp--arrow-top": unref(xe).includes("bottom"),
							"dp--arrow-bottom": unref(xe).includes("top")
						}),
						style: normalizeStyle({
							left: unref(Y).arrow?.x == null ? "" : `${unref(Y).arrow.x - unref(Y).arrow.centerOffset}px`,
							top: unref(Y).arrow?.y == null ? "" : `${unref(Y).arrow.y}px`
						})
					}, null, 6)]),
					key: "0"
				} : void 0]), 1032, [
					"class",
					"no-overlay-focus",
					"collapse"
				])) : createCommentVNode("", !0)]),
				_: 3
			}, 8, ["name", "css"])], 6)) : createCommentVNode("", !0)]),
			_: 3
		}, 8, ["to", "disabled"])], 10, jr));
	}
});
var Nr = /* @__PURE__ */ defineComponent({
	__name: "VueDatePickerRoot",
	props: /*@__PURE__*/ mergeDefaults({
		multiCalendars: { type: [
			Boolean,
			Number,
			String,
			Object
		] },
		modelValue: {},
		modelType: {},
		dark: { type: Boolean },
		transitions: { type: [Boolean, Object] },
		ariaLabels: {},
		hideNavigation: {},
		timezone: {},
		vertical: { type: Boolean },
		hideMonthYearSelect: { type: Boolean },
		disableYearSelect: { type: Boolean },
		yearRange: {},
		autoApply: { type: Boolean },
		disabledDates: { type: [Array, Function] },
		startDate: {},
		hideOffsetDates: { type: Boolean },
		noToday: { type: Boolean },
		allowedDates: {},
		markers: {},
		presetDates: {},
		flow: {},
		preventMinMaxNavigation: { type: Boolean },
		reverseYears: { type: Boolean },
		weekPicker: { type: Boolean },
		filters: {},
		arrowNavigation: { type: Boolean },
		highlight: { type: [Function, Object] },
		teleport: { type: [Boolean, String] },
		centered: { type: Boolean },
		locale: {},
		weekStart: {},
		weekNumbers: { type: [Boolean, Object] },
		dayNames: { type: [Function, Array] },
		monthPicker: { type: Boolean },
		yearPicker: { type: Boolean },
		modelAuto: { type: Boolean },
		formats: {},
		multiDates: { type: [Boolean, Object] },
		minDate: {},
		maxDate: {},
		minTime: {},
		maxTime: {},
		inputAttrs: {},
		timeConfig: {},
		placeholder: {},
		timePicker: { type: Boolean },
		range: { type: [Boolean, Object] },
		menuId: {},
		disabled: { type: Boolean },
		readonly: { type: Boolean },
		inline: { type: [Boolean, Object] },
		textInput: { type: [Boolean, Object] },
		sixWeeks: { type: [Boolean, String] },
		actionRow: {},
		focusStartDate: { type: Boolean },
		disabledTimes: { type: [Function, Array] },
		calendar: { type: Function },
		config: {},
		quarterPicker: { type: Boolean },
		yearFirst: { type: Boolean },
		loading: { type: Boolean },
		ui: {},
		floating: {}
	}, Bt),
	emits: [
		"update:model-value",
		"internal-model-change",
		"text-submit",
		"text-input",
		"open",
		"closed",
		"focus",
		"blur",
		"cleared",
		"flow-step",
		"update-month-year",
		"invalid-select",
		"invalid-fixed-range",
		"invalid-date",
		"tooltip-open",
		"tooltip-close",
		"am-pm-change",
		"range-start",
		"range-end",
		"date-click",
		"overlay-toggle",
		"invalid",
		"menu-mounted",
		"menu-unmounted"
	],
	setup(e, { expose: t, emit: n }) {
		let r = n, a = e;
		et(a, r);
		let o = nn(useSlots(), a.presetDates);
		return t(Yt(useTemplateRef("date-picker"))), (e, t) => (openBlock(), createBlock(Mr, { ref: "date-picker" }, createSlots({ _: 2 }, [renderList(unref(o), (t) => ({
			name: t,
			fn: withCtx((n) => [renderSlot(e.$slots, t, normalizeProps(guardReactiveProps(n)))])
		}))]), 1536));
	}
});
export { TZDate, Nr as VueDatePicker, st as WeekStart };
