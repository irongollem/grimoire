import { n as __exportAll } from "./rolldown-runtime-SbdDWaPq.js";
// ../DnD helper/node_modules/@sentry/core/build/esm/debug-build.js
var DEBUG_BUILD$5 = typeof __SENTRY_DEBUG__ === "undefined" || __SENTRY_DEBUG__;
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/worldwide.js
var GLOBAL_OBJ = globalThis;
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/version.js
var SDK_VERSION = "11.11.0";
// ../DnD helper/node_modules/@sentry/core/build/esm/carrier.js
function getMainCarrier() {
	getSentryCarrier(GLOBAL_OBJ);
	return GLOBAL_OBJ;
}
function getSentryCarrier(carrier) {
	const __SENTRY__ = carrier.__SENTRY__ = carrier.__SENTRY__ || {};
	__SENTRY__.version = __SENTRY__.version || "11.11.0";
	return __SENTRY__[SDK_VERSION] = __SENTRY__["11.11.0"] || {};
}
function getGlobalSingleton(name, creator, obj = GLOBAL_OBJ) {
	const __SENTRY__ = obj.__SENTRY__ = obj.__SENTRY__ || {};
	const carrier = __SENTRY__[SDK_VERSION] = __SENTRY__["11.11.0"] || {};
	return carrier[name] || (carrier[name] = creator());
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/debug-logger.js
var CONSOLE_LEVELS$1 = [
	"debug",
	"info",
	"warn",
	"error",
	"log",
	"assert",
	"trace"
];
var PREFIX$1 = "Sentry Logger ";
var originalConsoleMethods = {};
function consoleSandbox(callback) {
	if (!("console" in GLOBAL_OBJ)) return callback();
	const console = GLOBAL_OBJ.console;
	const wrappedFuncs = {};
	const wrappedLevels = Object.keys(originalConsoleMethods);
	wrappedLevels.forEach((level) => {
		const originalConsoleMethod = originalConsoleMethods[level];
		wrappedFuncs[level] = console[level];
		console[level] = originalConsoleMethod;
	});
	try {
		return callback();
	} finally {
		wrappedLevels.forEach((level) => {
			console[level] = wrappedFuncs[level];
		});
	}
}
function enable() {
	_getLoggerSettings().enabled = true;
}
function disable() {
	_getLoggerSettings().enabled = false;
}
function isEnabled$1() {
	return _getLoggerSettings().enabled;
}
function log(...args) {
	_maybeLog("log", ...args);
}
function warn$1(...args) {
	_maybeLog("warn", ...args);
}
function error$1(...args) {
	_maybeLog("error", ...args);
}
function _maybeLog(level, ...args) {
	if (!DEBUG_BUILD$5) return;
	if (isEnabled$1()) consoleSandbox(() => {
		GLOBAL_OBJ.console[level](`${PREFIX$1}[${level}]:`, ...args);
	});
}
function _getLoggerSettings() {
	if (!DEBUG_BUILD$5) return { enabled: false };
	return getGlobalSingleton("loggerSettings", () => ({ enabled: false }));
}
var debug$2 = {
	/** Enable logging. */
	enable,
	/** Disable logging. */
	disable,
	/** Check if logging is enabled. */
	isEnabled: isEnabled$1,
	/** Log a message. */
	log,
	/** Log a warning. */
	warn: warn$1,
	/** Log an error. */
	error: error$1
};
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/stacktrace.js
var STACKTRACE_FRAME_LIMIT = 50;
var WEBPACK_ERROR_REGEXP = /\(error: (.*)\)/;
var STRIP_FRAME_REGEXP = /captureMessage|captureException/;
function createStackParser(...parsers) {
	const sortedParsers = parsers.sort((a, b) => a[0] - b[0]).map((p) => p[1]);
	return (stack, skipFirstLines = 0, framesToPop = 0) => {
		const frames = [];
		const lines = stack.split("\n");
		for (let i = skipFirstLines; i < lines.length; i++) {
			let line = lines[i];
			if (line.length > 1024) line = line.slice(0, 1024);
			const cleanedLine = WEBPACK_ERROR_REGEXP.test(line) ? line.replace(WEBPACK_ERROR_REGEXP, "$1") : line;
			if (cleanedLine.includes("Error: ")) continue;
			for (const parser of sortedParsers) {
				const frame = parser(cleanedLine);
				if (frame) {
					frames.push(frame);
					break;
				}
			}
			if (frames.length >= STACKTRACE_FRAME_LIMIT + framesToPop) break;
		}
		return stripSentryFramesAndReverse(frames.slice(framesToPop));
	};
}
function stackParserFromStackParserOptions(stackParser) {
	if (Array.isArray(stackParser)) return createStackParser(...stackParser);
	return stackParser;
}
function stripSentryFramesAndReverse(stack) {
	if (!stack.length) return [];
	const localStack = Array.from(stack);
	if (/sentryWrapped/.test(getLastStackFrame(localStack).function || "")) localStack.pop();
	localStack.reverse();
	if (STRIP_FRAME_REGEXP.test(getLastStackFrame(localStack).function || "")) {
		localStack.pop();
		if (STRIP_FRAME_REGEXP.test(getLastStackFrame(localStack).function || "")) localStack.pop();
	}
	return localStack.slice(0, STACKTRACE_FRAME_LIMIT).map((frame) => ({
		...frame,
		filename: frame.filename || getLastStackFrame(localStack).filename,
		function: frame.function || "?"
	}));
}
function getLastStackFrame(arr) {
	return arr[arr.length - 1] || {};
}
var defaultFunctionName = "<anonymous>";
function getFunctionName(fn) {
	try {
		if (!fn || typeof fn !== "function") return defaultFunctionName;
		return fn.name || defaultFunctionName;
	} catch {
		return defaultFunctionName;
	}
}
function getFramesFromEvent(event) {
	const exception = event.exception;
	if (exception) {
		const frames = [];
		try {
			exception.values.forEach((value) => {
				if (value.stacktrace.frames) frames.push(...value.stacktrace.frames);
			});
			return frames;
		} catch {
			return;
		}
	}
}
function normalizeStackTracePath(path) {
	let filename = path?.startsWith("file://") ? path.slice(7) : path;
	if (filename?.match(/\/[A-Z]:/)) filename = filename.slice(1);
	return filename;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/instrument/handlers.js
var handlers$2 = {};
var instrumented$1 = {};
function addHandler$1(type, handler) {
	handlers$2[type] = handlers$2[type] || [];
	handlers$2[type].push(handler);
	return () => {
		const typeHandlers = handlers$2[type];
		if (typeHandlers) {
			const index = typeHandlers.indexOf(handler);
			if (index !== -1) typeHandlers.splice(index, 1);
		}
	};
}
function maybeInstrument(type, instrumentFn) {
	if (!instrumented$1[type]) {
		instrumented$1[type] = true;
		try {
			instrumentFn();
		} catch (e) {
			DEBUG_BUILD$5 && debug$2.error(`Error while instrumenting ${type}`, e);
		}
	}
}
function triggerHandlers$1(type, data) {
	const typeHandlers = type && handlers$2[type];
	if (!typeHandlers) return;
	for (const handler of typeHandlers) try {
		handler(data);
	} catch (e) {
		DEBUG_BUILD$5 && debug$2.error(`Error while triggering instrumentation handler.
Type: ${type}
Name: ${getFunctionName(handler)}
Error:`, e);
	}
}
// ../DnD helper/node_modules/@sentry/core/build/esm/instrument/globalError.js
var _oldOnErrorHandler = null;
function addGlobalErrorInstrumentationHandler(handler) {
	const type = "error";
	addHandler$1(type, handler);
	maybeInstrument(type, instrumentError);
}
function instrumentError() {
	_oldOnErrorHandler = GLOBAL_OBJ.onerror;
	GLOBAL_OBJ.onerror = function(msg, url, line, column, error) {
		triggerHandlers$1("error", {
			column,
			error,
			line,
			msg,
			url
		});
		if (_oldOnErrorHandler) return _oldOnErrorHandler.apply(this, arguments);
		return false;
	};
	GLOBAL_OBJ.onerror.__SENTRY_INSTRUMENTED__ = true;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/instrument/globalUnhandledRejection.js
var _oldOnUnhandledRejectionHandler = null;
function addGlobalUnhandledRejectionInstrumentationHandler(handler) {
	const type = "unhandledrejection";
	addHandler$1(type, handler);
	maybeInstrument(type, instrumentUnhandledRejection);
}
function instrumentUnhandledRejection() {
	_oldOnUnhandledRejectionHandler = GLOBAL_OBJ.onunhandledrejection;
	GLOBAL_OBJ.onunhandledrejection = function(e) {
		triggerHandlers$1("unhandledrejection", e);
		if (_oldOnUnhandledRejectionHandler) return _oldOnUnhandledRejectionHandler.apply(this, arguments);
		return true;
	};
	GLOBAL_OBJ.onunhandledrejection.__SENTRY_INSTRUMENTED__ = true;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/is.js
var objectToString = Object.prototype.toString;
function isError(wat) {
	switch (objectToString.call(wat)) {
		case "[object Error]":
		case "[object Exception]":
		case "[object DOMException]":
		case "[object WebAssembly.Exception]": return true;
		default: return isInstanceOf(wat, Error);
	}
}
function isBuiltin(wat, className) {
	return objectToString.call(wat) === `[object ${className}]`;
}
function isErrorEvent$2(wat) {
	return isBuiltin(wat, "ErrorEvent");
}
function isDOMError(wat) {
	return isBuiltin(wat, "DOMError");
}
function isDOMException(wat) {
	return isBuiltin(wat, "DOMException");
}
function isString(wat) {
	return isBuiltin(wat, "String");
}
function isParameterizedString(wat) {
	return typeof wat === "object" && wat !== null && "__sentry_template_string__" in wat && "__sentry_template_values__" in wat;
}
function isPrimitive(wat) {
	return wat === null || isParameterizedString(wat) || typeof wat !== "object" && typeof wat !== "function";
}
function isPlainObject(wat) {
	return isBuiltin(wat, "Object");
}
function isObjectLike(wat) {
	return typeof wat === "object" && wat !== null;
}
function isEvent(wat) {
	return typeof Event !== "undefined" && isInstanceOf(wat, Event);
}
function isRegExp(wat) {
	return isBuiltin(wat, "RegExp");
}
function isThenable(wat) {
	return Boolean(wat?.then && typeof wat.then === "function");
}
function isInstanceOf(wat, base) {
	try {
		return wat instanceof base;
	} catch {
		return false;
	}
}
function isRequest(request) {
	return typeof Request !== "undefined" && isInstanceOf(request, Request);
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/object.js
function fill(source, name, replacementFactory) {
	if (!(name in source)) return;
	const original = source[name];
	if (typeof original !== "function") return;
	const wrapped = replacementFactory(original);
	if (typeof wrapped === "function") markFunctionWrapped(wrapped, original);
	try {
		source[name] = wrapped;
	} catch {
		DEBUG_BUILD$5 && debug$2.log(`Failed to replace method "${name}" in object`, source);
	}
}
function addNonEnumerableProperty(obj, name, value) {
	try {
		Object.defineProperty(obj, name, {
			value,
			writable: true,
			configurable: true
		});
	} catch {
		DEBUG_BUILD$5 && debug$2.log(`Failed to add non-enumerable property "${String(name)}" to object`, obj);
	}
}
function markFunctionWrapped(wrapped, original) {
	try {
		wrapped.prototype = original.prototype = original.prototype || {};
		addNonEnumerableProperty(wrapped, "__sentry_original__", original);
	} catch {}
}
function getOriginalFunction(func) {
	return func.__sentry_original__;
}
function convertToPlainObject(value) {
	if (isError(value)) return {
		message: value.message,
		name: value.name,
		stack: value.stack,
		...getOwnProperties(value)
	};
	if (isEvent(value)) {
		const { type, target, currentTarget, detail } = value;
		return {
			type,
			target,
			currentTarget,
			...detail ? { detail } : {},
			...getOwnProperties(value)
		};
	}
	return value;
}
function getOwnProperties(obj) {
	if (isObjectLike(obj)) return Object.fromEntries(Object.entries(obj));
	return {};
}
function extractExceptionKeysForMessage(exception) {
	const keys = Object.keys(convertToPlainObject(exception));
	keys.sort();
	return !keys[0] ? "[object has no keys]" : keys.join(", ");
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/randomSafeContext.js
var RESOLVED_RUNNER;
function withRandomSafeContext(cb) {
	if (RESOLVED_RUNNER !== void 0) return RESOLVED_RUNNER ? RESOLVED_RUNNER(cb) : cb();
	const sym = /* @__PURE__ */ Symbol.for("__SENTRY_SAFE_RANDOM_ID_WRAPPER__");
	const globalWithSymbol = GLOBAL_OBJ;
	if (sym in globalWithSymbol && typeof globalWithSymbol[sym] === "function") {
		RESOLVED_RUNNER = globalWithSymbol[sym];
		return RESOLVED_RUNNER(cb);
	}
	RESOLVED_RUNNER = null;
	return cb();
}
function safeMathRandom() {
	return withRandomSafeContext(() => Math.random());
}
function safeDateNow() {
	return withRandomSafeContext(() => Date.now());
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/normalizationHints.js
var SENTRY_SKIP_NORMALIZATION = /* @__PURE__ */ Symbol.for("sentry.skipNormalization");
var SENTRY_OVERRIDE_NORMALIZATION_DEPTH = /* @__PURE__ */ Symbol.for("sentry.overrideNormalizationDepth");
function setSkipNormalizationHint(obj) {
	addNonEnumerableProperty(obj, SENTRY_SKIP_NORMALIZATION, true);
}
function setNormalizationDepthOverrideHint(obj, depth) {
	addNonEnumerableProperty(obj, SENTRY_OVERRIDE_NORMALIZATION_DEPTH, depth);
}
function hasSkipNormalizationHint(value) {
	return Boolean(value[SENTRY_SKIP_NORMALIZATION]);
}
function getNormalizationDepthOverrideHint(value) {
	const v = value[SENTRY_OVERRIDE_NORMALIZATION_DEPTH];
	return typeof v === "number" ? v : void 0;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/normalize.js
var stringifier;
function setNormalizeStringifier(newStringifier) {
	stringifier = newStringifier;
}
function normalize(input, depth = 100, maxProperties = Infinity) {
	try {
		return visit("", input, depth, maxProperties);
	} catch (err) {
		return { ERROR: `**non-serializable** (${err})` };
	}
}
function normalizeToSize(object, depth = 3, maxSize = 102400) {
	const normalized = normalize(object, depth);
	if (jsonSize(normalized) > maxSize) return normalizeToSize(object, depth - 1, maxSize);
	return normalized;
}
function visit(key, value, depth = Infinity, maxProperties = Infinity, memo = memoBuilder()) {
	const [memoize, unmemoize] = memo;
	if (value == null || ["boolean", "string"].includes(typeof value) || typeof value === "number" && Number.isFinite(value)) return value;
	const stringified = stringifyValue(key, value);
	if (!stringified.startsWith("[object ")) return stringified;
	if (hasSkipNormalizationHint(value)) return value;
	const overrideDepth = getNormalizationDepthOverrideHint(value);
	const remainingDepth = overrideDepth !== void 0 ? overrideDepth : depth;
	if (remainingDepth === 0) return stringified.replace("object ", "");
	if (memoize(value)) return "[Circular ~]";
	const valueWithToJSON = value;
	if (valueWithToJSON && typeof valueWithToJSON.toJSON === "function") try {
		return visit("", valueWithToJSON.toJSON(), remainingDepth - 1, maxProperties, memo);
	} catch {}
	const normalized = Array.isArray(value) ? [] : {};
	let numAdded = 0;
	const visitable = convertToPlainObject(value);
	for (const visitKey in visitable) {
		if (!Object.prototype.hasOwnProperty.call(visitable, visitKey)) continue;
		if (numAdded >= maxProperties) {
			normalized[visitKey] = "[MaxProperties ~]";
			break;
		}
		const visitValue = visitable[visitKey];
		normalized[visitKey] = visit(visitKey, visitValue, remainingDepth - 1, maxProperties, memo);
		numAdded++;
	}
	unmemoize(value);
	return normalized;
}
function stringifyValue(key, value) {
	try {
		if (stringifier) {
			const stringified = stringifier(value);
			if (stringified) return stringified;
		}
		if (typeof global !== "undefined" && value === global) return "[Global]";
		if (typeof value === "number" && !Number.isFinite(value)) return `[${value}]`;
		if (typeof value === "function") return `[Function: ${getFunctionName(value)}]`;
		if (typeof value === "symbol") return `[${String(value)}]`;
		if (typeof value === "bigint") return `[BigInt: ${String(value)}]`;
		return `[object ${getConstructorName$1(value)}]`;
	} catch (err) {
		return `**non-serializable** (${err})`;
	}
}
function getConstructorName$1(value) {
	const prototype = Object.getPrototypeOf(value);
	return prototype?.constructor ? prototype.constructor.name : "null prototype";
}
function utf8Length(value) {
	return ~-encodeURI(value).split(/%..|./).length;
}
function jsonSize(value) {
	return utf8Length(JSON.stringify(value));
}
function memoBuilder() {
	const inner = /* @__PURE__ */ new WeakSet();
	function memoize(obj) {
		if (inner.has(obj)) return true;
		inner.add(obj);
		return false;
	}
	function unmemoize(obj) {
		inner.delete(obj);
	}
	return [memoize, unmemoize];
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/string.js
function truncate(str, max = 0) {
	if (typeof str !== "string" || max === 0) return str;
	return str.length <= max ? str : `${str.slice(0, max)}...`;
}
function snipLine(line, colno) {
	let newLine = line;
	const lineLength = newLine.length;
	if (lineLength <= 150) return newLine;
	if (colno > lineLength) colno = lineLength;
	let start = Math.max(colno - 60, 0);
	if (start < 5) start = 0;
	let end = Math.min(start + 140, lineLength);
	if (end > lineLength - 5) end = lineLength;
	if (end === lineLength) start = Math.max(end - 140, 0);
	newLine = newLine.slice(start, end);
	if (start > 0) newLine = `'{snip} ${newLine}`;
	if (end < lineLength) newLine += " {snip}";
	return newLine;
}
function safeJoin(input, delimiter) {
	if (!Array.isArray(input)) return "";
	const output = [];
	for (let i = 0; i < input.length; i++) {
		const value = input[i];
		if (isPrimitive(value)) output.push(String(value));
		else if (value instanceof Error) output.push(value.message ? `${value.name}: ${value.message}` : value.name);
		else output.push(stringifyValue(void 0, value));
	}
	return output.join(delimiter);
}
function isMatchingPattern(value, pattern, requireExactStringMatch = false) {
	if (!isString(value)) return false;
	if (isRegExp(pattern)) return pattern.test(value);
	if (isString(pattern)) return requireExactStringMatch ? value === pattern : value.includes(pattern);
	if (typeof pattern === "function") return pattern(value);
	return false;
}
function stringMatchesSomePattern(testString, patterns = [], requireExactStringMatch = false) {
	for (const pattern of patterns) if (isMatchingPattern(testString, pattern, requireExactStringMatch)) return true;
	return false;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/misc.js
function getCrypto() {
	const gbl = GLOBAL_OBJ;
	return gbl.crypto || gbl.msCrypto;
}
var emptyUuid;
function getRandomByte() {
	return safeMathRandom() * 16;
}
function uuid4(crypto = getCrypto()) {
	try {
		if (crypto?.randomUUID) return withRandomSafeContext(() => crypto.randomUUID()).replace(/-/g, "");
	} catch {}
	if (!emptyUuid) emptyUuid = "10000000100040008000100000000000";
	return emptyUuid.replace(/[018]/g, (c) => (c ^ (getRandomByte() & 15) >> c / 4).toString(16));
}
function getFirstException(event) {
	return event.exception?.values?.[0];
}
function getEventDescription(event) {
	const { message, event_id: eventId } = event;
	if (message) return message;
	const firstException = getFirstException(event);
	if (firstException) {
		if (firstException.type && firstException.value) return `${firstException.type}: ${firstException.value}`;
		return firstException.type || firstException.value || eventId || "<unknown>";
	}
	return eventId || "<unknown>";
}
function addExceptionTypeValue(event, value, type) {
	const exception = event.exception = event.exception || {};
	const values = exception.values = exception.values || [];
	const firstException = values[0] = values[0] || {};
	if (!firstException.value) firstException.value = value || "";
	if (!firstException.type) firstException.type = type || "Error";
}
function addExceptionMechanism(event, newMechanism) {
	const firstException = getFirstException(event);
	if (!firstException) return;
	applyExceptionMechanism(firstException, newMechanism);
}
function addExceptionMechanismToCapturedException(event, newMechanism) {
	const exceptions = event.exception?.values;
	const capturedException = exceptions?.find((exception) => exception.mechanism?.exception_id === 0) ?? exceptions?.[0];
	if (!capturedException) return;
	applyExceptionMechanism(capturedException, newMechanism);
}
function applyExceptionMechanism(exception, newMechanism) {
	const defaultMechanism = {
		type: "generic",
		handled: true
	};
	const currentMechanism = exception.mechanism;
	exception.mechanism = {
		...defaultMechanism,
		...currentMechanism,
		...newMechanism
	};
	if (newMechanism && "data" in newMechanism) exception.mechanism.data = {
		...currentMechanism?.data,
		...newMechanism.data
	};
}
function addContextToFrame(lines, frame, linesOfContext = 5) {
	if (frame.lineno === void 0) return;
	const maxLines = lines.length;
	const sourceLine = Math.max(Math.min(maxLines - 1, frame.lineno - 1), 0);
	frame.pre_context = lines.slice(Math.max(0, sourceLine - linesOfContext), sourceLine).map((line) => snipLine(line, 0));
	frame.context_line = snipLine(lines[Math.min(maxLines - 1, sourceLine)], frame.colno || 0);
	frame.post_context = lines.slice(Math.min(sourceLine + 1, maxLines), sourceLine + 1 + linesOfContext).map((line) => snipLine(line, 0));
}
function checkOrSetAlreadyCaught(exception) {
	if (isAlreadyCaptured(exception)) return true;
	try {
		addNonEnumerableProperty(exception, "__sentry_captured__", true);
	} catch {}
	return false;
}
function isAlreadyCaptured(exception) {
	try {
		return exception.__sentry_captured__;
	} catch {}
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/time.js
var ONE_SECOND_IN_MS = 1e3;
var CLOCK_DRIFT_THRESHOLD_MS = 1e3;
var MAX_TIME_ORIGIN_SEGMENTS = 100;
function dateTimestampInSeconds() {
	return safeDateNow() / ONE_SECOND_IN_MS;
}
var _timeOriginSegments = [];
function createUnixTimestampInSecondsFunc() {
	const { performance } = GLOBAL_OBJ;
	if (!performance?.now || !performance.timeOrigin) {
		if (performance?.now) _timeOriginSegments = [{
			from: 0,
			origin: safeDateNow() - withRandomSafeContext(() => performance.now())
		}];
		return dateTimestampInSeconds;
	}
	let correctedTimeOrigin = performance.timeOrigin;
	_timeOriginSegments = [{
		from: 0,
		origin: correctedTimeOrigin
	}];
	let isFirstCall = true;
	let lastCheckedPerformanceNow = 0;
	return () => {
		return withRandomSafeContext(() => {
			const performanceNow = performance.now();
			const dateNow = Date.now();
			if (Math.abs(correctedTimeOrigin + performanceNow - dateNow) > CLOCK_DRIFT_THRESHOLD_MS) {
				correctedTimeOrigin = dateNow - performanceNow;
				if (isFirstCall) _timeOriginSegments = [{
					from: 0,
					origin: correctedTimeOrigin
				}];
				else {
					_timeOriginSegments.push({
						from: lastCheckedPerformanceNow,
						origin: correctedTimeOrigin
					});
					if (_timeOriginSegments.length > MAX_TIME_ORIGIN_SEGMENTS) _timeOriginSegments.splice(1, 1);
				}
			}
			isFirstCall = false;
			lastCheckedPerformanceNow = performanceNow;
			return (correctedTimeOrigin + performanceNow) / ONE_SECOND_IN_MS;
		});
	};
}
function safePerformanceNow() {
	const { performance } = GLOBAL_OBJ;
	return performance?.now ? withRandomSafeContext(() => performance.now()) : void 0;
}
var _cachedTimestampInSecondsFn;
var _checkedForDriftInThisTask = false;
function performanceTimeToSeconds(monotonicTimeInMs, entryStartTimeInMs = monotonicTimeInMs) {
	const origin = browserPerformanceTimeOrigin(entryStartTimeInMs);
	return origin == null ? void 0 : (origin + monotonicTimeInMs) / ONE_SECOND_IN_MS;
}
function timestampInSeconds() {
	return (_cachedTimestampInSecondsFn ?? (_cachedTimestampInSecondsFn = createUnixTimestampInSecondsFunc()))();
}
function browserPerformanceTimeOrigin(monotonicTimeInMs = 0) {
	if (!_checkedForDriftInThisTask) {
		_checkedForDriftInThisTask = true;
		Promise.resolve().then(() => {
			_checkedForDriftInThisTask = false;
		});
		timestampInSeconds();
	}
	let segment;
	for (const candidate of _timeOriginSegments) {
		if (segment && candidate.from > monotonicTimeInMs) break;
		segment = candidate;
	}
	return segment?.origin;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/session.js
function makeSession$1(context) {
	const startingTime = timestampInSeconds();
	const session = {
		sid: uuid4(),
		init: true,
		timestamp: startingTime,
		started: startingTime,
		duration: 0,
		status: "ok",
		errors: 0,
		ignoreDuration: false,
		toJSON: () => sessionToJSON(session)
	};
	if (context) updateSession(session, context);
	return session;
}
function updateSession(session, context = {}) {
	if (context.user) {
		if (!session.ipAddress && context.user.ip_address) session.ipAddress = context.user.ip_address;
		if (!session.did && !context.did) session.did = context.user.id || context.user.email || context.user.username;
	}
	session.timestamp = context.timestamp || timestampInSeconds();
	if (context.abnormal_mechanism) session.abnormal_mechanism = context.abnormal_mechanism;
	if (context.ignoreDuration) session.ignoreDuration = context.ignoreDuration;
	if (context.sid) session.sid = context.sid.length === 32 ? context.sid : uuid4();
	if (context.init !== void 0) session.init = context.init;
	if (!session.did && context.did) session.did = `${context.did}`;
	if (typeof context.started === "number") session.started = context.started;
	if (session.ignoreDuration) session.duration = void 0;
	else if (typeof context.duration === "number") session.duration = context.duration;
	else {
		const duration = session.timestamp - session.started;
		session.duration = duration >= 0 ? duration : 0;
	}
	if (context.release) session.release = context.release;
	if (context.environment) session.environment = context.environment;
	if (!session.ipAddress && context.ipAddress) session.ipAddress = context.ipAddress;
	if (!session.userAgent && context.userAgent) session.userAgent = context.userAgent;
	if (typeof context.errors === "number") session.errors = context.errors;
	if (context.status) session.status = context.status;
}
function closeSession(session, status) {
	let context = {};
	if (status) context = { status };
	else if (session.status === "ok") context = { status: "exited" };
	updateSession(session, context);
}
function sessionToJSON(session) {
	return {
		sid: `${session.sid}`,
		init: session.init,
		started: (/* @__PURE__ */ new Date(session.started * 1e3)).toISOString(),
		timestamp: (/* @__PURE__ */ new Date(session.timestamp * 1e3)).toISOString(),
		status: session.status,
		errors: session.errors,
		did: typeof session.did === "number" || typeof session.did === "string" ? `${session.did}` : void 0,
		duration: session.duration,
		abnormal_mechanism: session.abnormal_mechanism,
		attrs: {
			release: session.release,
			environment: session.environment,
			ip_address: session.ipAddress,
			user_agent: session.userAgent
		}
	};
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/merge.js
function merge(initialObj, mergeObj, levels = 2) {
	if (!mergeObj || typeof mergeObj !== "object" || levels <= 0) return mergeObj;
	if (initialObj && Object.keys(mergeObj).length === 0) return initialObj;
	const output = { ...initialObj };
	for (const key in mergeObj) if (Object.prototype.hasOwnProperty.call(mergeObj, key)) output[key] = merge(output[key], mergeObj[key], levels - 1);
	return output;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/propagationContext.js
function generateTraceId() {
	return uuid4();
}
function generateSpanId() {
	return uuid4().substring(16);
}
// ../DnD helper/node_modules/@sentry/core/build/esm/scope.js
var DEFAULT_MAX_BREADCRUMBS = 100;
var Scope = class Scope {
	constructor() {
		this._notifyingListeners = false;
		this._scopeListeners = [];
		this._eventProcessors = [];
		this._breadcrumbs = [];
		this._attachments = [];
		this._user = {};
		this._tags = {};
		this._attributes = {};
		this._extra = {};
		this._contexts = {};
		this._sdkProcessingMetadata = {};
		addNonEnumerableProperty(this, "refs", {});
		this._propagationContext = {
			traceId: generateTraceId(),
			sampleRand: safeMathRandom()
		};
	}
	/**
	* Clone all data from this scope into a new scope.
	*/
	clone() {
		const newScope = new Scope();
		newScope._breadcrumbs = [...this._breadcrumbs];
		newScope._tags = { ...this._tags };
		newScope._attributes = { ...this._attributes };
		newScope._extra = { ...this._extra };
		newScope._contexts = { ...this._contexts };
		if (this._contexts.flags) newScope._contexts.flags = { values: [...this._contexts.flags.values] };
		newScope._user = this._user;
		newScope._level = this._level;
		newScope._session = this._session;
		newScope._transactionName = this._transactionName;
		newScope._fingerprint = this._fingerprint;
		newScope._eventProcessors = [...this._eventProcessors];
		newScope._attachments = [...this._attachments];
		newScope._sdkProcessingMetadata = { ...this._sdkProcessingMetadata };
		newScope._propagationContext = { ...this._propagationContext };
		newScope._client = this._client;
		newScope._lastEventId = this._lastEventId;
		newScope._conversationId = this._conversationId;
		newScope.refs = { ...this.refs };
		return newScope;
	}
	/**
	* Update the client assigned to this scope.
	* Note that not every scope will have a client assigned - isolation scopes & the global scope will generally not have a client,
	* as well as manually created scopes.
	*/
	setClient(client) {
		this._client = client;
	}
	/**
	* Set the ID of the last captured error event.
	* This is generally only captured on the isolation scope.
	*/
	setLastEventId(lastEventId) {
		this._lastEventId = lastEventId;
	}
	/**
	* Get the client assigned to this scope.
	*/
	getClient() {
		return this._client;
	}
	/**
	* Get the ID of the last captured error event.
	* This is generally only available on the isolation scope.
	*/
	lastEventId() {
		return this._lastEventId;
	}
	/**
	* @inheritDoc
	*/
	addScopeListener(callback) {
		this._scopeListeners.push(callback);
	}
	/**
	* Add an event processor that will be called before an event is sent.
	*/
	addEventProcessor(callback) {
		this._eventProcessors.push(callback);
		return this;
	}
	/**
	* Set the user for this scope.
	* Set to `null` to unset the user.
	*/
	setUser(user) {
		this._user = user || {
			email: void 0,
			id: void 0,
			ip_address: void 0,
			username: void 0
		};
		if (this._session) updateSession(this._session, { user });
		this._notifyScopeListeners();
		return this;
	}
	/**
	* Get the user from this scope.
	*/
	getUser() {
		return this._user;
	}
	/**
	* Set the conversation ID for this scope.
	* Set to `null` to unset the conversation ID.
	*/
	setConversationId(conversationId) {
		this._conversationId = conversationId || void 0;
		this._notifyScopeListeners();
		return this;
	}
	/**
	* Set an object that will be merged into existing tags on the scope,
	* and will be sent as tags data with the event.
	*/
	setTags(tags) {
		this._tags = {
			...this._tags,
			...tags
		};
		this._notifyScopeListeners();
		return this;
	}
	/**
	* Set a single tag that will be sent as tags data with the event.
	*/
	setTag(key, value) {
		return this.setTags({ [key]: value });
	}
	/**
	* Sets attributes onto the scope.
	*
	* These attributes are applied to logs, metrics and streamed spans.
	*
	* Supported attribute value types are `string`, `number`, `boolean`, `string[]`, `number[]` and `boolean[]`.
	*
	* @param newAttributes - The attributes to set on the scope, as key-value pairs.
	*
	* @example
	* ```typescript
	* scope.setAttributes({
	*   is_admin: true,
	*   payment_selection: 'credit_card',
	*   render_duration: 150,
	* });
	* ```
	*/
	setAttributes(newAttributes) {
		this._attributes = {
			...this._attributes,
			...newAttributes
		};
		this._notifyScopeListeners();
		return this;
	}
	/**
	* Sets an attribute onto the scope.
	*
	* These attributes are applied to logs, metrics and streamed spans.
	*
	* Supported attribute value types are `string`, `number`, `boolean`, `string[]`, `number[]` and `boolean[]`.
	*
	* @param key - The attribute key.
	* @param value - The attribute value.
	*
	* @example
	* ```typescript
	* scope.setAttribute('is_admin', true);
	* scope.setAttribute('render_duration', 150);
	* ```
	*/
	setAttribute(key, value) {
		return this.setAttributes({ [key]: value });
	}
	/**
	* Removes the attribute with the given key from the scope.
	*
	* @param key - The attribute key.
	*
	* @example
	* ```typescript
	* scope.removeAttribute('is_admin');
	* ```
	*/
	removeAttribute(key) {
		if (key in this._attributes) {
			delete this._attributes[key];
			this._notifyScopeListeners();
		}
		return this;
	}
	/**
	* Set an object that will be merged into existing extra on the scope,
	* and will be sent as extra data with the event.
	*/
	setExtras(extras) {
		this._extra = {
			...this._extra,
			...extras
		};
		this._notifyScopeListeners();
		return this;
	}
	/**
	* Set a single key:value extra entry that will be sent as extra data with the event.
	*/
	setExtra(key, extra) {
		this._extra = {
			...this._extra,
			[key]: extra
		};
		this._notifyScopeListeners();
		return this;
	}
	/**
	* Sets the fingerprint on the scope to send with the events.
	* @param {string[]} fingerprint Fingerprint to group events in Sentry.
	*/
	setFingerprint(fingerprint) {
		this._fingerprint = fingerprint;
		this._notifyScopeListeners();
		return this;
	}
	/**
	* Sets the level on the scope for future events.
	*/
	setLevel(level) {
		this._level = level;
		this._notifyScopeListeners();
		return this;
	}
	/**
	* Sets the transaction name on the scope so that the name of e.g. taken server route or
	* the page location is attached to future events.
	*
	* IMPORTANT: Calling this function does NOT change the name of the currently active
	* root span. If you want to change the name of the active root span, use
	* `Sentry.updateSpanName(rootSpan, 'new name')` instead.
	*
	* By default, the SDK updates the scope's transaction name automatically on sensible
	* occasions, such as a page navigation or when handling a new request on the server.
	*/
	setTransactionName(name) {
		this._transactionName = name;
		this._notifyScopeListeners();
		return this;
	}
	/**
	* Sets context data with the given name.
	* Data passed as context will be normalized. You can also pass `null` to unset the context.
	* Note that context data will not be merged - calling `setContext` will overwrite an existing context with the same key.
	*/
	setContext(key, context) {
		if (context === null) delete this._contexts[key];
		else this._contexts[key] = context;
		this._notifyScopeListeners();
		return this;
	}
	/**
	* Set the session for the scope.
	*/
	setSession(session) {
		if (!session) delete this._session;
		else this._session = session;
		this._notifyScopeListeners();
		return this;
	}
	/**
	* Get the session from the scope.
	*/
	getSession() {
		return this._session;
	}
	/**
	* Updates the scope with provided data. Can work in three variations:
	* - plain object containing updatable attributes
	* - Scope instance that'll extract the attributes from
	* - callback function that'll receive the current scope as an argument and allow for modifications
	*/
	update(captureContext) {
		if (!captureContext) return this;
		const scopeToMerge = typeof captureContext === "function" ? captureContext(this) : captureContext;
		const { tags, attributes, extra, user, contexts, level, fingerprint = [], propagationContext, conversationId } = (scopeToMerge instanceof Scope ? scopeToMerge.getScopeData() : isPlainObject(scopeToMerge) ? captureContext : void 0) || {};
		this._tags = {
			...this._tags,
			...tags
		};
		this._attributes = {
			...this._attributes,
			...attributes
		};
		this._extra = {
			...this._extra,
			...extra
		};
		this._contexts = {
			...this._contexts,
			...contexts
		};
		if (user && Object.keys(user).length) this._user = user;
		if (level) this._level = level;
		if (fingerprint.length) this._fingerprint = fingerprint;
		if (propagationContext) this._propagationContext = propagationContext;
		if (conversationId) this._conversationId = conversationId;
		return this;
	}
	/**
	* Adds a breadcrumb to the scope.
	* By default, the last 100 breadcrumbs are kept.
	*/
	addBreadcrumb(breadcrumb, maxBreadcrumbs) {
		const maxCrumbs = typeof maxBreadcrumbs === "number" ? maxBreadcrumbs : DEFAULT_MAX_BREADCRUMBS;
		if (maxCrumbs <= 0) return this;
		const mergedBreadcrumb = {
			timestamp: dateTimestampInSeconds(),
			...breadcrumb,
			message: breadcrumb.message ? truncate(breadcrumb.message, 2048) : breadcrumb.message
		};
		this._breadcrumbs.push(mergedBreadcrumb);
		if (this._breadcrumbs.length > maxCrumbs) this._breadcrumbs = this._breadcrumbs.slice(-maxCrumbs);
		this._notifyScopeListeners();
		return this;
	}
	/**
	* Get the last breadcrumb of the scope.
	*/
	getLastBreadcrumb() {
		return this._breadcrumbs[this._breadcrumbs.length - 1];
	}
	/**
	* Clear all breadcrumbs from the scope.
	*/
	clearBreadcrumbs() {
		this._breadcrumbs = [];
		this._notifyScopeListeners();
		return this;
	}
	/**
	* Add an attachment to the scope.
	*/
	addAttachment(attachment) {
		this._attachments.push(attachment);
		return this;
	}
	/**
	* Clear all attachments from the scope.
	*/
	clearAttachments() {
		this._attachments = [];
		return this;
	}
	/**
	* Get the data of this scope, which should be applied to an event during processing.
	*/
	getScopeData() {
		return {
			breadcrumbs: this._breadcrumbs,
			attachments: this._attachments,
			contexts: this._contexts,
			tags: this._tags,
			attributes: this._attributes,
			extra: this._extra,
			user: this._user,
			level: this._level,
			fingerprint: this._fingerprint || [],
			eventProcessors: this._eventProcessors,
			propagationContext: this._propagationContext,
			sdkProcessingMetadata: this._sdkProcessingMetadata,
			transactionName: this._transactionName,
			conversationId: this._conversationId
		};
	}
	/**
	* Add data which will be accessible during event processing but won't get sent to Sentry.
	*/
	setSDKProcessingMetadata(newData) {
		this._sdkProcessingMetadata = merge(this._sdkProcessingMetadata, newData, 2);
		return this;
	}
	/**
	* Add propagation context to the scope, used for distributed tracing
	*/
	setPropagationContext(context) {
		this._propagationContext = context;
		return this;
	}
	/**
	* Get propagation context from the scope, used for distributed tracing
	*/
	getPropagationContext() {
		return this._propagationContext;
	}
	/**
	* Capture an exception for this scope.
	*
	* @returns {string} The id of the captured Sentry event.
	*/
	captureException(exception, hint) {
		const eventId = hint?.event_id || uuid4();
		if (!this._client) {
			DEBUG_BUILD$5 && debug$2.warn("No client configured on scope - will not capture exception!");
			return eventId;
		}
		const syntheticException = /* @__PURE__ */ new Error("Sentry syntheticException");
		this._client.captureException(exception, {
			originalException: exception,
			syntheticException,
			...hint,
			event_id: eventId
		}, this);
		return eventId;
	}
	/**
	* Capture a message for this scope.
	*
	* @returns {string} The id of the captured message.
	*/
	captureMessage(message, level, hint) {
		const eventId = hint?.event_id || uuid4();
		if (!this._client) {
			DEBUG_BUILD$5 && debug$2.warn("No client configured on scope - will not capture message!");
			return eventId;
		}
		const syntheticException = hint?.syntheticException ?? new Error(message);
		this._client.captureMessage(message, level, {
			originalException: message,
			syntheticException,
			...hint,
			event_id: eventId
		}, this);
		return eventId;
	}
	/**
	* Capture a Sentry event for this scope.
	*
	* @returns {string} The id of the captured event.
	*/
	captureEvent(event, hint) {
		const eventId = event.event_id || hint?.event_id || uuid4();
		if (!this._client) {
			DEBUG_BUILD$5 && debug$2.warn("No client configured on scope - will not capture event!");
			return eventId;
		}
		this._client.captureEvent(event, {
			...hint,
			event_id: eventId
		}, this);
		return eventId;
	}
	/**
	* This will be called on every set call.
	*/
	_notifyScopeListeners() {
		if (!this._notifyingListeners) {
			this._notifyingListeners = true;
			this._scopeListeners.forEach((callback) => {
				callback(this);
			});
			this._notifyingListeners = false;
		}
	}
};
// ../DnD helper/node_modules/@sentry/core/build/esm/defaultScopes.js
function getDefaultCurrentScope() {
	return getGlobalSingleton("defaultCurrentScope", () => new Scope());
}
function getDefaultIsolationScope() {
	return getGlobalSingleton("defaultIsolationScope", () => new Scope());
}
// ../DnD helper/node_modules/@sentry/core/build/esm/tracing/constants.js
var SUPPRESS_TRACING_KEY = "__SENTRY_SUPPRESS_TRACING__";
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/chain-and-copy-promiselike.js
var isActualPromise = (p) => p instanceof Promise && !p[kChainedCopy];
var kChainedCopy = /* @__PURE__ */ Symbol("chained PromiseLike");
var chainAndCopyPromiseLike = (original, onSuccess, onError) => {
	const chained = original.then((value) => {
		onSuccess(value);
		return value;
	}, (err) => {
		onError(err);
		throw err;
	});
	return isActualPromise(chained) && isActualPromise(original) ? chained : copyProps(original, chained);
};
var copyProps = (original, chained) => {
	if (!chained) return original;
	let mutated = false;
	for (const key in original) {
		if (key in chained) continue;
		mutated = true;
		const value = original[key];
		if (typeof value === "function") Object.defineProperty(chained, key, {
			value: (...args) => value.apply(original, args),
			enumerable: true,
			configurable: true,
			writable: true
		});
		else chained[key] = value;
	}
	if (mutated) Object.assign(chained, { [kChainedCopy]: true });
	return chained;
};
// ../DnD helper/node_modules/@sentry/core/build/esm/asyncContext/stackStrategy.js
var AsyncContextStack = class {
	constructor(scope, isolationScope) {
		let assignedScope;
		if (!scope) assignedScope = new Scope();
		else assignedScope = scope;
		let assignedIsolationScope;
		if (!isolationScope) assignedIsolationScope = new Scope();
		else assignedIsolationScope = isolationScope;
		this._stack = [{ scope: assignedScope }];
		this._isolationScope = assignedIsolationScope;
	}
	/**
	* Fork a scope for the stack.
	*/
	withScope(callback) {
		const scope = this._pushScope();
		let maybePromiseResult;
		try {
			maybePromiseResult = callback(scope);
		} catch (e) {
			this._popScope();
			throw e;
		}
		if (isThenable(maybePromiseResult)) return chainAndCopyPromiseLike(maybePromiseResult, () => this._popScope(), () => this._popScope());
		this._popScope();
		return maybePromiseResult;
	}
	/**
	* Get the client of the stack.
	*/
	getClient() {
		return this.getStackTop().client;
	}
	/**
	* Returns the scope of the top stack.
	*/
	getScope() {
		return this.getStackTop().scope;
	}
	/**
	* Get the isolation scope for the stack.
	*/
	getIsolationScope() {
		return this._isolationScope;
	}
	/**
	* Returns the topmost scope layer in the order domain > local > process.
	*/
	getStackTop() {
		return this._stack[this._stack.length - 1];
	}
	/**
	* Push a scope to the stack.
	*/
	_pushScope() {
		const scope = this.getScope().clone();
		this._stack.push({
			client: this.getClient(),
			scope
		});
		return scope;
	}
	/**
	* Pop a scope from the stack.
	*/
	_popScope() {
		if (this._stack.length <= 1) return false;
		return !!this._stack.pop();
	}
};
function getAsyncContextStack() {
	const sentry = getSentryCarrier(getMainCarrier());
	return sentry.stack = sentry.stack || new AsyncContextStack(getDefaultCurrentScope(), getDefaultIsolationScope());
}
function withScope$1(callback) {
	return getAsyncContextStack().withScope(callback);
}
function withSetScope(scope, callback) {
	const stack = getAsyncContextStack();
	return stack.withScope(() => {
		stack.getStackTop().scope = scope;
		return callback(scope);
	});
}
function withIsolationScope$1(callback) {
	return getAsyncContextStack().withScope(() => {
		return callback(getAsyncContextStack().getIsolationScope());
	});
}
function getStackAsyncContextStrategy() {
	return {
		suppressTracing: suppressTracingInStack,
		withIsolationScope: withIsolationScope$1,
		withScope: withScope$1,
		withSetScope,
		withSetIsolationScope: (_isolationScope, callback) => {
			return withIsolationScope$1(callback);
		},
		getCurrentScope: () => getAsyncContextStack().getScope(),
		getIsolationScope: () => getAsyncContextStack().getIsolationScope()
	};
}
function suppressTracingInStack(callback) {
	return withScope$1((scope) => {
		scope.setSDKProcessingMetadata({ [SUPPRESS_TRACING_KEY]: true });
		const res = callback();
		scope.setSDKProcessingMetadata({ [SUPPRESS_TRACING_KEY]: void 0 });
		return res;
	});
}
// ../DnD helper/node_modules/@sentry/core/build/esm/asyncContext/index.js
function getAsyncContextStrategy(carrier) {
	const sentry = getSentryCarrier(carrier);
	if (sentry.acs) return sentry.acs;
	return getStackAsyncContextStrategy();
}
// ../DnD helper/node_modules/@sentry/core/build/esm/attributes.js
function isAttributeObject(maybeObj) {
	return typeof maybeObj === "object" && maybeObj != null && !Array.isArray(maybeObj) && Object.keys(maybeObj).includes("value");
}
function attributeValueToTypedAttributeValue(rawValue, useFallback) {
	const { value, unit } = isAttributeObject(rawValue) ? rawValue : {
		value: rawValue,
		unit: void 0
	};
	const attributeValue = getTypedAttributeValue(value);
	const checkedUnit = unit && typeof unit === "string" ? { unit } : {};
	if (attributeValue) return {
		...attributeValue,
		...checkedUnit
	};
	if (!useFallback || useFallback === "skip-undefined" && value === void 0) return;
	let stringValue = "";
	try {
		stringValue = JSON.stringify(value) ?? "";
	} catch {}
	return {
		value: stringValue,
		type: "string",
		...checkedUnit
	};
}
function serializeAttributes(attributes, fallback = false) {
	const serializedAttributes = {};
	for (const [key, value] of Object.entries(attributes ?? {})) {
		const typedValue = attributeValueToTypedAttributeValue(value, fallback);
		if (typedValue) serializedAttributes[key] = typedValue;
	}
	return serializedAttributes;
}
function estimateTypedAttributesSizeInBytes(attributes) {
	if (!attributes) return 0;
	let weight = 0;
	for (const [key, attr] of Object.entries(attributes)) {
		weight += key.length * 2;
		weight += attr.type.length * 2;
		weight += (attr.unit?.length ?? 0) * 2;
		const val = attr.value;
		if (Array.isArray(val)) weight += estimatePrimitiveSizeInBytes$1(val[0]) * val.length;
		else if (isPrimitive(val)) weight += estimatePrimitiveSizeInBytes$1(val);
		else weight += 100;
	}
	return weight;
}
function estimatePrimitiveSizeInBytes$1(value) {
	if (typeof value === "string") return value.length * 2;
	else if (typeof value === "boolean") return 4;
	else if (typeof value === "number") return 8;
	return 0;
}
function getTypedAttributeValue(value) {
	if (Array.isArray(value)) return {
		value,
		type: "array"
	};
	const primitiveType = typeof value === "string" ? "string" : typeof value === "boolean" ? "boolean" : typeof value === "number" && !Number.isNaN(value) ? Number.isInteger(value) ? "integer" : "double" : null;
	if (primitiveType) return {
		value,
		type: primitiveType
	};
}
// ../DnD helper/node_modules/@sentry/core/build/esm/currentScopes.js
function getExternalPropagationContext() {
	return getSentryCarrier(getMainCarrier()).externalPropagationContextProvider?.();
}
function hasExternalPropagationContext() {
	return getSentryCarrier(getMainCarrier()).externalPropagationContextProvider !== void 0;
}
function getCurrentScope() {
	return getAsyncContextStrategy(getMainCarrier()).getCurrentScope();
}
function getIsolationScope() {
	return getAsyncContextStrategy(getMainCarrier()).getIsolationScope();
}
function getGlobalScope() {
	return getGlobalSingleton("globalScope", () => new Scope());
}
function withScope(...rest) {
	const acs = getAsyncContextStrategy(getMainCarrier());
	if (rest.length === 2) {
		const [scope, callback] = rest;
		if (!scope) return acs.withScope(callback);
		return acs.withSetScope(scope, callback);
	}
	return acs.withScope(rest[0]);
}
function withIsolationScope(...rest) {
	const acs = getAsyncContextStrategy(getMainCarrier());
	if (rest.length === 2) {
		const [isolationScope, callback] = rest;
		if (!isolationScope) return acs.withIsolationScope(callback);
		return acs.withSetIsolationScope(isolationScope, callback);
	}
	return acs.withIsolationScope(rest[0]);
}
function getClient() {
	return getCurrentScope().getClient();
}
function getTraceContextFromScope(scope) {
	const externalContext = getExternalPropagationContext();
	if (externalContext) return {
		trace_id: externalContext.traceId,
		span_id: externalContext.spanId
	};
	const { traceId, parentSpanId, propagationSpanId } = scope.getPropagationContext();
	const traceContext = {
		trace_id: traceId,
		span_id: propagationSpanId || generateSpanId()
	};
	if (parentSpanId) traceContext.parent_span_id = parentSpanId;
	return traceContext;
}
// ../DnD helper/node_modules/@sentry/conventions/dist/attributes.mjs
var Q$2 = "angular.version";
var Ft = "browser.bfcache.frame";
var Ht = "browser.bfcache.not_restored_reason_count";
var Qt = "browser.bfcache.outcome";
var Jt = "browser.bfcache.reason";
var Zt = "browser.navigation.id";
var $t = "browser.navigation.type";
var ei = "browser.paint.type";
var ti = "browser.performance.navigation.activation_start";
var ii = "browser.performance.time_origin";
var si = "browser.script.invoker";
var ri = "browser.script.invoker_type";
var ni = "browser.script.source_char_position";
var hi = "browser.web_vital.inp.target";
var vi = "browser.web_vital.lcp.element";
var Ni = "browser.web_vital.ttfb.request_time";
var fa = "code.file.path";
var ka = "code.function.name";
var Ia = "connectionType";
var wa = "culture.calendar";
var Ra = "culture.locale";
var Na = "culture.timezone";
var Ba = "db.operation.name";
var es = "db.system.name";
var is = "deviceMemory";
var Ts = "device.memory.estimated_capacity";
var Rs = "device.processor_count";
var Ws = "effectiveConnectionType";
var Yr = "gen_ai.conversation.id";
var po = "graphql.document";
var co = "graphql.operation.name";
var uo = "graphql.operation.type";
var Co = "hardwareConcurrency";
var jo = "http.request.connection_end";
var Wo = "http.request.connect_start";
var Fo = "http.request.domain_lookup_end";
var Ho = "http.request.domain_lookup_start";
var Jo = "http.request.fetch_start";
var $o = "http.request.method";
var tl = "http.request.redirect_end";
var il = "http.request.redirect_start";
var al = "http.request.request_start";
var rl = "http.request.response_end";
var nl = "http.request.response_start";
var ol = "http.request.same_origin";
var ll = "http.request.secure_connection_start";
var pl = "http.request.time_to_first_byte";
var cl = "http.request.worker_start";
var ul = "http.response.body.decoded_size";
var dl = "http.response.body.size";
var hl = "http.response.size";
var fl = "http.response.status_code";
var Sl = "http.route";
var Ql = "lcp.element";
var Jl = "lcp.id";
var Xl = "lcp.loadTime";
var Zl = "lcp.renderTime";
var $l = "lcp.size";
var ep = "lcp.url";
var yu = "network.connection.effective_type";
var _u = "network.connection.rtt";
var hu = "network.connection.type";
var Tu = "network.protocol.name";
var Eu = "network.protocol.version";
var sd = "params";
var rd = "performance.activationStart";
var nd = "performance.timeOrigin";
var Cd = "react.version";
var Yd = "resource.render_blocking_status";
var Kd = "router.navigation.route.id";
var mm = "sentry.cancellation_reason";
var wm = "sentry.environment";
var Cm = "sentry.exclusive_time";
var Gm = "sentry.idle_span_finish_reason";
var Bm = "sentry.is_localhost";
var jm = "sentry.link.type";
var Vm = "sentry.message.template";
var ab = "sentry.op";
var sb = "sentry.origin";
var rb = "sentry.pageload.span_id";
var ob = "sentry.profiler_id";
var lb = "sentry.profile_id";
var ub = "sentry.release";
var db$1 = "sentry.replay_id";
var gb = "sentry.sdk.integrations";
var yb = "sentry.sdk.name";
var _b = "sentry.sdk.version";
var hb = "sentry.segment.id";
var vb = "sentry.segment.name";
var kb$1 = "sentry.segment.name.source";
var Cb = "sentry.timestamp.sequence";
var Pb = "sentry.trace_lifecycle";
var qb = "sentry.trace.parent_span_id";
var Lb = "sentry.transaction";
var Kb = "server.address";
var Hb = "server.port";
var ig = "state.type";
var lg = "thread.id";
var pg = "thread.name";
var Cg = "ui.component_name";
var Dg = "ui.element.height";
var Lg = "ui.element.id";
var Mg = "ui.element.identifier";
var Gg = "ui.element.paint_type";
var zg = "ui.element.type";
var Yg = "ui.element.url";
var jg = "ui.element.width";
var Kg = "url.domain";
var Vg = "url.fragment";
var Fg = "url.full";
var Hg = "url.path";
var Jg = "url.path.parameter";
var ey = "url.query";
var iy = "url.scheme";
var ay = "url.template";
var sy = "user_agent.original";
var ry = "user.email";
var dy = "user.id";
var my = "user.ip_address";
var by = "user.name";
// ../DnD helper/node_modules/@sentry/core/build/esm/semanticAttributes.js
var SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE = "sentry.sample_rate";
var SEMANTIC_ATTRIBUTE_SENTRY_PREVIOUS_TRACE_SAMPLE_RATE = "sentry.previous_trace_sample_rate";
var SEMANTIC_ATTRIBUTE_SENTRY_OP = "sentry.op";
var SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN = "sentry.origin";
var SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_UNIT = "sentry.measurement_unit";
var SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_VALUE = "sentry.measurement_value";
var SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME = "sentry.custom_span_name";
// ../DnD helper/node_modules/@sentry/core/build/esm/types/spanStatus.js
var SPAN_STATUS_TYPES = [
	"ok",
	"deadline_exceeded",
	"unauthenticated",
	"permission_denied",
	"not_found",
	"resource_exhausted",
	"invalid_argument",
	"unimplemented",
	"unavailable",
	"internal_error",
	"unknown_error",
	"cancelled",
	"already_exists",
	"failed_precondition",
	"aborted",
	"out_of_range",
	"data_loss"
];
function isStatusErrorMessageValid(message) {
	return message !== "ok" && SPAN_STATUS_TYPES.includes(message);
}
function getSpanStatusFromHttpCode(httpStatus) {
	if (httpStatus < 400 && httpStatus >= 100) return { code: 1 };
	if (httpStatus >= 400 && httpStatus < 500) switch (httpStatus) {
		case 401: return {
			code: 2,
			message: "unauthenticated"
		};
		case 403: return {
			code: 2,
			message: "permission_denied"
		};
		case 404: return {
			code: 2,
			message: "not_found"
		};
		case 409: return {
			code: 2,
			message: "already_exists"
		};
		case 413: return {
			code: 2,
			message: "failed_precondition"
		};
		case 429: return {
			code: 2,
			message: "resource_exhausted"
		};
		case 499: return {
			code: 2,
			message: "cancelled"
		};
		default: return {
			code: 2,
			message: "invalid_argument"
		};
	}
	if (httpStatus >= 500 && httpStatus < 600) switch (httpStatus) {
		case 501: return {
			code: 2,
			message: "unimplemented"
		};
		case 503: return {
			code: 2,
			message: "unavailable"
		};
		case 504: return {
			code: 2,
			message: "deadline_exceeded"
		};
		default: return {
			code: 2,
			message: "internal_error"
		};
	}
	return {
		code: 2,
		message: "internal_error"
	};
}
function setHttpStatus(span, httpStatus) {
	span.setAttribute(fl, httpStatus);
	const spanStatus = getSpanStatusFromHttpCode(httpStatus);
	if (spanStatus.message !== "unknown_error") span.setStatus(spanStatus);
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/weakRef.js
function makeWeakRef(value) {
	try {
		const WeakRefImpl = GLOBAL_OBJ.WeakRef;
		if (typeof WeakRefImpl === "function") return new WeakRefImpl(value);
	} catch {}
	return value;
}
function derefWeakRef(ref) {
	if (!ref) return;
	if (typeof ref === "object" && "deref" in ref && typeof ref.deref === "function") try {
		return ref.deref();
	} catch {
		return;
	}
	return ref;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/tracing/utils.js
var SCOPE_ON_START_SPAN_FIELD = "_sentryScope";
var ISOLATION_SCOPE_ON_START_SPAN_FIELD = "_sentryIsolationScope";
var TRACER_PROVIDER_SPAN_FIELD = /* @__PURE__ */ Symbol.for("sentry.tracerProviderSpan");
function setCapturedScopesOnSpan(span, scope, isolationScope) {
	if (span) {
		addNonEnumerableProperty(span, ISOLATION_SCOPE_ON_START_SPAN_FIELD, makeWeakRef(isolationScope));
		addNonEnumerableProperty(span, SCOPE_ON_START_SPAN_FIELD, scope);
	}
}
function getCapturedScopesOnSpan(span) {
	const spanWithScopes = span;
	return {
		scope: spanWithScopes[SCOPE_ON_START_SPAN_FIELD],
		isolationScope: derefWeakRef(spanWithScopes[ISOLATION_SCOPE_ON_START_SPAN_FIELD])
	};
}
function spanIsTracerProviderSpan(span) {
	return span[TRACER_PROVIDER_SPAN_FIELD] === true;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/baggage.js
var SENTRY_BAGGAGE_KEY_PREFIX = "sentry-";
function baggageHeaderToDynamicSamplingContext(baggageHeader) {
	const baggageObject = parseBaggageHeader(baggageHeader);
	if (!baggageObject) return;
	const dynamicSamplingContext = Object.entries(baggageObject).reduce((acc, [key, value]) => {
		if (key.startsWith("sentry-")) {
			const nonPrefixedKey = key.slice(7);
			acc[nonPrefixedKey] = value;
		}
		return acc;
	}, {});
	if (Object.keys(dynamicSamplingContext).length > 0) return dynamicSamplingContext;
	else return;
}
function dynamicSamplingContextToSentryBaggageHeader(dynamicSamplingContext) {
	if (!dynamicSamplingContext) return;
	return objectToBaggageHeader(Object.entries(dynamicSamplingContext).reduce((acc, [dscKey, dscValue]) => {
		if (dscValue) acc[`${SENTRY_BAGGAGE_KEY_PREFIX}${dscKey}`] = dscValue;
		return acc;
	}, {}));
}
function parseBaggageHeader(baggageHeader) {
	if (!baggageHeader || !isString(baggageHeader) && !Array.isArray(baggageHeader)) return;
	if (Array.isArray(baggageHeader)) return baggageHeader.reduce((acc, curr) => {
		const currBaggageObject = baggageHeaderToObject(curr);
		Object.entries(currBaggageObject).forEach(([key, value]) => {
			acc[key] = value;
		});
		return acc;
	}, {});
	return baggageHeaderToObject(baggageHeader);
}
function baggageHeaderToObject(baggageHeader) {
	return baggageHeader.split(",").map((baggageEntry) => {
		const eqIdx = baggageEntry.indexOf("=");
		if (eqIdx === -1) return [];
		return [baggageEntry.slice(0, eqIdx), baggageEntry.slice(eqIdx + 1)].map((keyOrValue) => {
			try {
				return decodeURIComponent(keyOrValue.trim());
			} catch {
				return;
			}
		});
	}).reduce((acc, [key, value]) => {
		if (key && value) acc[key] = value;
		return acc;
	}, {});
}
function objectToBaggageHeader(object) {
	if (Object.keys(object).length === 0) return;
	return Object.entries(object).reduce((baggageHeader, [objectKey, objectValue], currentIndex) => {
		const baggageEntry = `${encodeURIComponent(objectKey)}=${encodeURIComponent(objectValue)}`;
		const newBaggageHeader = currentIndex === 0 ? baggageEntry : `${baggageHeader},${baggageEntry}`;
		if (newBaggageHeader.length > 8192) {
			DEBUG_BUILD$5 && debug$2.warn(`Not adding key: ${objectKey} with val: ${objectValue} to baggage header due to exceeding baggage size limits.`);
			return baggageHeader;
		} else return newBaggageHeader;
	}, "");
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/dsn.js
var ORG_ID_REGEX = /^o(\d+)\./;
var DSN_REGEX = /^(?:(\w+):)\/\/(?:(\w+)(?::(\w+)?)?@)((?:\[[:.%\w]+\]|[\w.-]+))(?::(\d+))?\/(.+)/;
function isValidProtocol(protocol) {
	return protocol === "http" || protocol === "https";
}
function dsnToString(dsn, withPassword = false) {
	const { host, path, pass, port, projectId, protocol, publicKey } = dsn;
	return `${protocol}://${publicKey}${withPassword && pass ? `:${pass}` : ""}@${host}${port ? `:${port}` : ""}/${path ? `${path}/` : path}${projectId}`;
}
function dsnFromString(str) {
	const match = DSN_REGEX.exec(str);
	if (!match) {
		consoleSandbox(() => {
			console.error(`Invalid Sentry Dsn: ${str}`);
		});
		return;
	}
	const [protocol, publicKey, pass = "", host = "", port = "", lastPath = ""] = match.slice(1);
	let path = "";
	let projectId = lastPath;
	const split = projectId.split("/");
	if (split.length > 1) {
		path = split.slice(0, -1).join("/");
		projectId = split.pop();
	}
	if (projectId) {
		const projectMatch = projectId.match(/^\d+/);
		if (projectMatch) projectId = projectMatch[0];
	}
	return dsnFromComponents({
		host,
		pass,
		path,
		projectId,
		port,
		protocol,
		publicKey
	});
}
function dsnFromComponents(components) {
	return {
		protocol: components.protocol,
		publicKey: components.publicKey || "",
		pass: components.pass || "",
		host: components.host,
		port: components.port || "",
		path: components.path || "",
		projectId: components.projectId
	};
}
function validateDsn(dsn) {
	if (!DEBUG_BUILD$5) return true;
	const { port, projectId, protocol } = dsn;
	if ([
		"protocol",
		"publicKey",
		"host",
		"projectId"
	].find((component) => {
		if (!dsn[component]) {
			debug$2.error(`Invalid Sentry Dsn: ${component} missing`);
			return true;
		}
		return false;
	})) return false;
	if (!projectId.match(/^\d+$/)) {
		debug$2.error(`Invalid Sentry Dsn: Invalid projectId ${projectId}`);
		return false;
	}
	if (!isValidProtocol(protocol)) {
		debug$2.error(`Invalid Sentry Dsn: Invalid protocol ${protocol}`);
		return false;
	}
	if (port && isNaN(parseInt(port, 10))) {
		debug$2.error(`Invalid Sentry Dsn: Invalid port ${port}`);
		return false;
	}
	return true;
}
function extractOrgIdFromDsnHost(host) {
	return host.match(ORG_ID_REGEX)?.[1];
}
function extractOrgIdFromClient(client) {
	const options = client.getOptions();
	const { host } = client.getDsn() || {};
	let org_id;
	if (options.orgId) org_id = String(options.orgId);
	else if (host) org_id = extractOrgIdFromDsnHost(host);
	return org_id;
}
function makeDsn(from) {
	const components = typeof from === "string" ? dsnFromString(from) : dsnFromComponents(from);
	if (!components || !validateDsn(components)) return;
	return components;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/parseSampleRate.js
function parseSampleRate(sampleRate) {
	if (typeof sampleRate === "boolean") return Number(sampleRate);
	const rate = typeof sampleRate === "string" ? parseFloat(sampleRate) : sampleRate;
	if (typeof rate !== "number" || isNaN(rate) || rate < 0 || rate > 1) return;
	return rate;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/tracing.js
var TRACEPARENT_REGEXP = /* @__PURE__ */ new RegExp("^[ \\t]*([0-9a-f]{32})?-?([0-9a-f]{16})?-?([01])?[ \\t]*$");
function extractTraceparentData(traceparent) {
	if (!traceparent) return;
	const matches = traceparent.match(TRACEPARENT_REGEXP);
	if (!matches) return;
	let parentSampled;
	if (matches[3] === "1") parentSampled = true;
	else if (matches[3] === "0") parentSampled = false;
	return {
		traceId: matches[1],
		parentSampled,
		parentSpanId: matches[2]
	};
}
function propagationContextFromHeaders(sentryTrace, baggage) {
	const traceparentData = extractTraceparentData(sentryTrace);
	const dynamicSamplingContext = baggageHeaderToDynamicSamplingContext(baggage);
	if (!traceparentData?.traceId) return {
		traceId: generateTraceId(),
		sampleRand: safeMathRandom()
	};
	const sampleRand = getSampleRandFromTraceparentAndDsc(traceparentData, dynamicSamplingContext);
	if (dynamicSamplingContext) dynamicSamplingContext.sample_rand = sampleRand.toString();
	const { traceId, parentSpanId, parentSampled } = traceparentData;
	return {
		traceId,
		parentSpanId,
		sampled: parentSampled,
		dsc: dynamicSamplingContext || {},
		sampleRand
	};
}
function generateSentryTraceHeader(traceId = generateTraceId(), spanId = generateSpanId(), sampled) {
	let sampledString = "";
	if (sampled !== void 0) sampledString = sampled ? "-1" : "-0";
	return `${traceId}-${spanId}${sampledString}`;
}
function generateTraceparentHeader(traceId = generateTraceId(), spanId = generateSpanId(), sampled) {
	return `00-${traceId}-${spanId}-${sampled ? "01" : "00"}`;
}
function getSampleRandFromTraceparentAndDsc(traceparentData, dsc) {
	const parsedSampleRand = parseSampleRate(dsc?.sample_rand);
	if (parsedSampleRand !== void 0) return parsedSampleRand;
	const parsedSampleRate = parseSampleRate(dsc?.sample_rate);
	if (parsedSampleRate && traceparentData?.parentSampled !== void 0) return traceparentData.parentSampled ? safeMathRandom() * parsedSampleRate : parsedSampleRate + safeMathRandom() * (1 - parsedSampleRate);
	else return safeMathRandom();
}
function shouldContinueTrace(client, baggageOrgId) {
	const clientOrgId = extractOrgIdFromClient(client);
	if (baggageOrgId && clientOrgId && baggageOrgId !== clientOrgId) {
		debug$2.log(`Won't continue trace because org IDs don't match (incoming baggage: ${baggageOrgId}, SDK options: ${clientOrgId})`);
		return false;
	}
	if (client.getOptions().strictTraceContinuation || false) {
		if (baggageOrgId && !clientOrgId || !baggageOrgId && clientOrgId) {
			debug$2.log(`Starting a new trace because strict trace continuation is enabled but one org ID is missing (incoming baggage: ${baggageOrgId}, Sentry client: ${clientOrgId})`);
			return false;
		}
	}
	return true;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/spanOnScope.js
var SCOPE_SPAN_FIELD = "span";
function _setSpanForScope(scope, span) {
	if (span) scope.refs[SCOPE_SPAN_FIELD] = makeWeakRef(span);
	else delete scope.refs[SCOPE_SPAN_FIELD];
}
function _getSpanForScope(scope) {
	return derefWeakRef(scope.refs[SCOPE_SPAN_FIELD]);
}
function spanToTransactionTraceContext(span) {
	const { spanId: span_id, traceId: trace_id } = span.spanContext();
	const { data, op, parent_span_id, status, origin, links } = spanToStaticSpanJSON(span);
	return {
		parent_span_id,
		span_id,
		trace_id,
		data,
		op,
		status,
		origin,
		links
	};
}
function spanToTraceContext(span) {
	const { spanId, traceId: trace_id, isRemote } = span.spanContext();
	const parent_span_id = isRemote ? spanId : spanToStaticSpanJSON(span).parent_span_id;
	const scope = getCapturedScopesOnSpan(span).scope;
	return {
		parent_span_id,
		span_id: isRemote ? scope?.getPropagationContext().propagationSpanId || generateSpanId() : spanId,
		trace_id
	};
}
function spanToTraceHeader(span) {
	const { traceId, spanId } = span.spanContext();
	return generateSentryTraceHeader(traceId, spanId, spanIsSampled(span));
}
function spanToTraceparentHeader(span) {
	const { traceId, spanId } = span.spanContext();
	return generateTraceparentHeader(traceId, spanId, spanIsSampled(span));
}
function convertSpanLinksForEnvelope(links) {
	if (links && links.length > 0) return links.map(({ context: { spanId, traceId, traceFlags, ...restContext }, attributes }) => ({
		span_id: spanId,
		trace_id: traceId,
		sampled: traceFlags === 1,
		attributes,
		...restContext
	}));
	else return;
}
function getStreamedSpanLinks(links) {
	if (links?.length) return links.map(({ context: { spanId, traceId, traceFlags }, attributes }) => ({
		span_id: spanId,
		trace_id: traceId,
		sampled: traceFlags === 1,
		attributes
	}));
	else return;
}
function spanTimeInputToSeconds(input) {
	if (typeof input === "number") return ensureTimestampInSeconds(input);
	if (Array.isArray(input)) return input[0] + input[1] / 1e9;
	if (input instanceof Date) return ensureTimestampInSeconds(input.getTime());
	return timestampInSeconds();
}
function ensureTimestampInSeconds(timestamp) {
	return timestamp > 9999999999 ? timestamp / 1e3 : timestamp;
}
function otelTimeInputToSeconds(input) {
	if (typeof input !== "number") return spanTimeInputToSeconds(input);
	if (input < 0xe8d4a51000) return performanceTimeToSeconds(input) ?? timestampInSeconds();
	return input / 1e3;
}
function spanToStaticSpanJSON(span) {
	if (spanIsSentrySpan(span)) return span.getStaticSpanJSON();
	const { spanId: span_id, traceId: trace_id } = span.spanContext();
	if (spanIsOpenTelemetrySdkTraceBaseSpan(span)) {
		const { attributes, startTime, name, endTime, status, links } = span;
		return {
			span_id,
			trace_id,
			data: attributes,
			description: name,
			parent_span_id: getOtelParentSpanId(span),
			start_timestamp: spanTimeInputToSeconds(startTime),
			timestamp: spanTimeInputToSeconds(endTime) || void 0,
			status: getStatusMessage(status),
			op: attributes[ab],
			origin: attributes[sb],
			links: convertSpanLinksForEnvelope(links)
		};
	}
	return {
		span_id,
		trace_id,
		start_timestamp: 0,
		status: "ok",
		data: {}
	};
}
function spanToJSON(span) {
	if (spanIsSentrySpan(span)) return span.getSpanJSON();
	const { spanId: span_id, traceId: trace_id } = span.spanContext();
	if (spanIsOpenTelemetrySdkTraceBaseSpan(span)) {
		const { attributes, startTime, name, endTime, status, links } = span;
		return {
			name,
			span_id,
			trace_id,
			parent_span_id: getOtelParentSpanId(span),
			start_timestamp: spanTimeInputToSeconds(startTime),
			end_timestamp: spanTimeInputToSeconds(endTime) || void 0,
			is_segment: spanIsSegment(span),
			status: getSimpleStatus(status),
			attributes: addStatusMessageAttribute(attributes, status),
			links: getStreamedSpanLinks(links)
		};
	}
	return {
		span_id,
		trace_id,
		start_timestamp: 0,
		name: "",
		status: "ok",
		is_segment: spanIsSegment(span),
		attributes: {}
	};
}
function getOtelParentSpanId(span) {
	return "parentSpanId" in span ? span.parentSpanId : "parentSpanContext" in span ? span.parentSpanContext?.spanId : void 0;
}
function streamedSpanJsonToSerializedSpan(spanJson) {
	return {
		...spanJson,
		end_timestamp: spanJson.end_timestamp ?? spanJson.start_timestamp,
		attributes: serializeAttributes(spanJson.attributes),
		links: spanJson.links?.map((link) => ({
			...link,
			attributes: serializeAttributes(link.attributes)
		}))
	};
}
function spanIsOpenTelemetrySdkTraceBaseSpan(span) {
	const castSpan = span;
	return !!castSpan.attributes && !!castSpan.startTime && !!castSpan.name && !!castSpan.endTime && !!castSpan.status;
}
function spanIsSentrySpan(span) {
	return typeof span.getSpanJSON === "function";
}
function spanIsSampled(span) {
	const { traceFlags } = span.spanContext();
	return traceFlags === 1;
}
function getStatusMessage(status) {
	if (!status || status.code === 0) return "ok";
	if (status.code === 1) return "ok";
	return status.message && isStatusErrorMessageValid(status.message) ? status.message : "internal_error";
}
function getSimpleStatus(status) {
	return !status || status.code === 1 || status.code === 0 || status.message === "cancelled" ? "ok" : "error";
}
function addStatusMessageAttribute(attributes, status) {
	const statusMessage = getSimpleStatus(status) === "error" ? status?.message : void 0;
	return {
		...statusMessage && { ["sentry.status.message"]: statusMessage },
		...attributes
	};
}
var CHILD_SPANS_FIELD = "_sentryChildSpans";
var ROOT_SPAN_FIELD = "_sentryRootSpan";
function addChildSpanToSpan(span, childSpan) {
	const rootSpan = span[ROOT_SPAN_FIELD] || span;
	addNonEnumerableProperty(childSpan, ROOT_SPAN_FIELD, rootSpan);
	childSpan.setAttribute(kb$1, void 0);
	if (!spanIsSampled(span)) return;
	if (!span.isRecording() && !rootSpan.isRecording()) return;
	if (span[CHILD_SPANS_FIELD]) span[CHILD_SPANS_FIELD].add(childSpan);
	else addNonEnumerableProperty(span, CHILD_SPANS_FIELD, /* @__PURE__ */ new Set([childSpan]));
}
function removeChildSpanFromSpan(span, childSpan) {
	if (span[CHILD_SPANS_FIELD]) span[CHILD_SPANS_FIELD].delete(childSpan);
}
function getSpanDescendants(span) {
	const resultSet = /* @__PURE__ */ new Set();
	function addSpanChildren(span2) {
		if (resultSet.has(span2)) return;
		else if (spanIsSampled(span2)) {
			resultSet.add(span2);
			const childSpans = span2[CHILD_SPANS_FIELD] ? Array.from(span2[CHILD_SPANS_FIELD]) : [];
			for (const childSpan of childSpans) addSpanChildren(childSpan);
		}
	}
	addSpanChildren(span);
	return Array.from(resultSet);
}
var getRootSpan = INTERNAL_getSegmentSpan;
function INTERNAL_getSegmentSpan(span) {
	return span[ROOT_SPAN_FIELD] || span;
}
function spanIsSegment(span) {
	return span === INTERNAL_getSegmentSpan(span);
}
function getActiveSpan(scope) {
	const acs = getAsyncContextStrategy(getMainCarrier());
	if (acs.getActiveSpan) return acs.getActiveSpan(scope);
	return _getSpanForScope(scope || getCurrentScope());
}
function updateSpanName(span, name) {
	span.updateName(name);
	span.setAttributes({ [SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME]: name });
	INTERNAL_setSegmentNameSourceIfSegment(span, "custom");
}
function INTERNAL_setSegmentNameSourceIfSegment(span, source) {
	if (spanIsSegment(span)) span.setAttribute(kb$1, source);
}
// ../DnD helper/node_modules/@sentry/core/build/esm/tracing/errors.js
var errorsInstrumented = false;
function registerSpanErrorInstrumentation() {
	if (errorsInstrumented) return;
	function errorCallback() {
		const activeSpan = getActiveSpan();
		const rootSpan = activeSpan && getRootSpan(activeSpan);
		if (rootSpan) {
			const message = "internal_error";
			DEBUG_BUILD$5 && debug$2.log(`[Tracing] Root span: ${message} -> Global error occurred`);
			rootSpan.setStatus({
				code: 2,
				message
			});
		}
	}
	errorsInstrumented = true;
	addGlobalErrorInstrumentationHandler(errorCallback);
	addGlobalUnhandledRejectionInstrumentationHandler(errorCallback);
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/hasSpansEnabled.js
function hasSpansEnabled(maybeOptions) {
	if (typeof __SENTRY_TRACING__ === "boolean" && !__SENTRY_TRACING__) return false;
	const options = maybeOptions || getClient()?.getOptions();
	return !!options && (options.tracesSampleRate != null || !!options.tracesSampler);
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/should-ignore-span.js
function logIgnoredSpan(droppedSpan) {
	debug$2.log(`Ignoring span ${droppedSpan.op} - ${droppedSpan.description} because it matches \`ignoreSpans\`.`);
}
function shouldIgnoreSpan(span, ignoreSpans) {
	if (!ignoreSpans?.length) return false;
	for (const pattern of ignoreSpans) {
		if (isStringOrRegExp(pattern)) {
			if (span.description && isMatchingPattern(span.description, pattern)) {
				DEBUG_BUILD$5 && logIgnoredSpan(span);
				return true;
			}
			continue;
		}
		const hasAttributes = !!pattern.attributes && Object.keys(pattern.attributes).length > 0;
		if (!pattern.name && !pattern.op && !hasAttributes) continue;
		const nameMatches = pattern.name ? span.description && isMatchingPattern(span.description, pattern.name) : true;
		const opMatches = pattern.op ? span.op && isMatchingPattern(span.op, pattern.op) : true;
		const attrsMatch = pattern.attributes ? Object.entries(pattern.attributes).every(([key, valuePattern]) => _matchesAttributeValue(span.attributes?.[key], valuePattern)) : true;
		if (nameMatches && opMatches && attrsMatch) {
			DEBUG_BUILD$5 && logIgnoredSpan(span);
			return true;
		}
	}
	return false;
}
function _matchesAttributeValue(actual, pat) {
	if (typeof actual === "string" && (typeof pat === "string" || pat instanceof RegExp)) return isMatchingPattern(actual, pat);
	if (Array.isArray(actual) && Array.isArray(pat)) return actual.length === pat.length && actual.every((v, i) => v === pat[i]);
	return actual === pat;
}
function reparentChildSpans(spans, dropSpan) {
	const droppedSpanParentId = dropSpan.parent_span_id;
	const droppedSpanId = dropSpan.span_id;
	if (!droppedSpanParentId) return;
	for (const span of spans) if (span.parent_span_id === droppedSpanId) span.parent_span_id = droppedSpanParentId;
}
function isStringOrRegExp(value) {
	return typeof value === "string" || value instanceof RegExp;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/integration.js
var installedIntegrations = [];
function filterDuplicates(integrations) {
	const integrationsByName = {};
	integrations.forEach((currentInstance) => {
		const { name } = currentInstance;
		const existingInstance = integrationsByName[name];
		if (existingInstance && !existingInstance.isDefaultInstance && currentInstance.isDefaultInstance) return;
		integrationsByName[name] = currentInstance;
	});
	return Object.values(integrationsByName);
}
function getIntegrationsToSetup(options) {
	const defaultIntegrations = options.defaultIntegrations || [];
	const userIntegrations = options.integrations;
	defaultIntegrations.forEach((integration) => {
		integration.isDefaultInstance = true;
	});
	let integrations;
	if (Array.isArray(userIntegrations)) integrations = [...defaultIntegrations, ...userIntegrations];
	else if (typeof userIntegrations === "function") {
		const resolvedUserIntegrations = userIntegrations(defaultIntegrations);
		integrations = Array.isArray(resolvedUserIntegrations) ? resolvedUserIntegrations : [resolvedUserIntegrations];
	} else integrations = defaultIntegrations;
	return filterDuplicates(integrations);
}
function setupIntegrations(client, integrations) {
	const integrationIndex = {};
	integrations.forEach((integration) => {
		if (integration?.beforeSetup) integration.beforeSetup(client);
	});
	integrations.forEach((integration) => {
		if (integration) setupIntegration(client, integration, integrationIndex);
	});
	return integrationIndex;
}
function afterSetupIntegrations(client, integrations) {
	for (const integration of integrations) if (integration?.afterAllSetup) integration.afterAllSetup(client);
}
function setupIntegration(client, integration, integrationIndex) {
	if (integrationIndex[integration.name]) {
		DEBUG_BUILD$5 && debug$2.log(`Integration skipped because it was already installed: ${integration.name}`);
		return;
	}
	integrationIndex[integration.name] = integration;
	if (!installedIntegrations.includes(integration.name) && typeof integration.setupOnce === "function") {
		integration.setupOnce();
		installedIntegrations.push(integration.name);
	}
	if (integration.setup && typeof integration.setup === "function") integration.setup(client);
	if (typeof integration.preprocessEvent === "function") {
		const callback = integration.preprocessEvent.bind(integration);
		client.on("preprocessEvent", (event, hint) => callback(event, hint, client));
	}
	if (typeof integration.processEvent === "function") {
		const callback = integration.processEvent.bind(integration);
		const processor = Object.assign((event, hint) => callback(event, hint, client), { id: integration.name });
		client.addEventProcessor(processor);
	}
	["processSpan", "processSegmentSpan"].forEach((hook) => {
		const callback = integration[hook];
		if (typeof callback === "function") client.on(hook, (span) => callback.call(integration, span, client));
	});
	DEBUG_BUILD$5 && debug$2.log(`Integration installed: ${integration.name}`);
}
function addIntegration(integration) {
	const client = getClient();
	if (!client) {
		DEBUG_BUILD$5 && debug$2.warn(`Cannot add integration "${integration.name}" because no SDK Client is available.`);
		return;
	}
	client.addIntegration(integration);
}
function defineIntegration(fn) {
	return fn;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/constants.js
var DEFAULT_ENVIRONMENT = "production";
// ../DnD helper/node_modules/@sentry/core/build/esm/tracing/sentryNonRecordingSpan.js
var NON_RECORDING_SPAN_FIELD = /* @__PURE__ */ Symbol.for("sentry.nonRecordingSpan");
var SentryNonRecordingSpan = class {
	constructor(spanContext = {}) {
		this._traceId = spanContext.traceId || generateTraceId();
		this._spanId = spanContext.spanId || generateSpanId();
		this.dropReason = spanContext.dropReason;
		addNonEnumerableProperty(this, NON_RECORDING_SPAN_FIELD, true);
	}
	/** @inheritdoc */
	spanContext() {
		return {
			spanId: this._spanId,
			traceId: this._traceId,
			traceFlags: 0
		};
	}
	/** @inheritdoc */
	end(_timestamp) {}
	/** @inheritdoc */
	setAttribute(_key, _value) {
		return this;
	}
	/** @inheritdoc */
	setAttributes(_values) {
		return this;
	}
	/** @inheritdoc */
	setStatus(_status) {
		return this;
	}
	/** @inheritdoc */
	updateName(_name) {
		return this;
	}
	/** @inheritdoc */
	isRecording() {
		return false;
	}
	/** @inheritdoc */
	addEvent(_name, _attributesOrStartTime, _startTime) {
		return this;
	}
	/** @inheritDoc */
	addLink(_link) {
		return this;
	}
	/** @inheritDoc */
	addLinks(_links) {
		return this;
	}
	/**
	* This should generally not be used,
	* but we need it for being compliant with the OTEL Span interface.
	*
	* @hidden
	* @internal
	*/
	recordException(_exception, _time) {}
};
function spanIsNonRecordingSpan(span) {
	return !!span && span[NON_RECORDING_SPAN_FIELD] === true;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/tracing/dynamicSamplingContext.js
var FROZEN_DSC_FIELD = "_frozenDsc";
function freezeDscOnSpan(span, dsc) {
	addNonEnumerableProperty(span, FROZEN_DSC_FIELD, dsc);
}
function getDynamicSamplingContextFromClient(trace_id, client) {
	const options = client.getOptions();
	const { publicKey: public_key } = client.getDsn() || {};
	const dsc = {
		environment: options.environment || "production",
		release: options.release,
		public_key,
		trace_id,
		org_id: extractOrgIdFromClient(client)
	};
	client.emit("createDsc", dsc);
	return dsc;
}
function getDynamicSamplingContextFromScope(client, scope) {
	if (getExternalPropagationContext()) return;
	const propagationContext = scope.getPropagationContext();
	return propagationContext.dsc || getDynamicSamplingContextFromClient(propagationContext.traceId, client);
}
function getDynamicSamplingContextFromSpan(span) {
	const client = getClient();
	if (!client) return {};
	const rootSpan = getRootSpan(span);
	const rootSpanJson = spanToStaticSpanJSON(rootSpan);
	const rootSpanAttributes = rootSpanJson.data;
	const traceState = rootSpan.spanContext().traceState;
	const rootSpanSampleRate = traceState?.get("sentry.sample_rate") ?? rootSpanAttributes["sentry.sample_rate"] ?? rootSpanAttributes["sentry.previous_trace_sample_rate"];
	function applyLocalSampleRateToDsc(dsc2) {
		if (typeof rootSpanSampleRate === "number" || typeof rootSpanSampleRate === "string") dsc2.sample_rate = `${rootSpanSampleRate}`;
		return dsc2;
	}
	const frozenDsc = rootSpan[FROZEN_DSC_FIELD];
	if (frozenDsc) return applyLocalSampleRateToDsc(frozenDsc);
	const isNonRecordingRoot = spanIsNonRecordingSpan(rootSpan);
	const isIgnoredRoot = isNonRecordingRoot && rootSpan.dropReason === "ignored";
	if (isNonRecordingRoot && (!hasSpansEnabled(client.getOptions()) || isIgnoredRoot)) {
		const capturedScope = getCapturedScopesOnSpan(rootSpan).scope;
		const scopeDsc = capturedScope && getDynamicSamplingContextFromScope(client, capturedScope);
		if (scopeDsc) {
			const dsc2 = { ...scopeDsc };
			if (isIgnoredRoot) dsc2.sampled = "false";
			return applyLocalSampleRateToDsc(dsc2);
		}
	}
	const traceStateDsc = traceState?.get("sentry.dsc");
	const dscOnTraceState = traceStateDsc && baggageHeaderToDynamicSamplingContext(traceStateDsc);
	if (dscOnTraceState) return applyLocalSampleRateToDsc(dscOnTraceState);
	const dsc = getDynamicSamplingContextFromClient(span.spanContext().traceId, client);
	const source = rootSpanAttributes[kb$1];
	const name = rootSpanJson.description;
	if (source !== "url" && name) dsc.transaction = name;
	if (hasSpansEnabled()) {
		dsc.sampled = String(spanIsSampled(rootSpan));
		dsc.sample_rand = traceState?.get("sentry.sample_rand") ?? getCapturedScopesOnSpan(rootSpan).scope?.getPropagationContext().sampleRand.toString();
	}
	applyLocalSampleRateToDsc(dsc);
	client.emit("createDsc", dsc, rootSpan);
	return dsc;
}
function spanToBaggageHeader(span) {
	return dynamicSamplingContextToSentryBaggageHeader(getDynamicSamplingContextFromSpan(span));
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/scopeData.js
function applyScopeDataToEvent(event, data) {
	const { fingerprint, breadcrumbs, sdkProcessingMetadata } = data;
	applyDataToEvent(event, data);
	applyFingerprintToEvent(event, fingerprint);
	applyBreadcrumbsToEvent(event, breadcrumbs);
	applySdkMetadataToEvent(event, sdkProcessingMetadata);
}
function mergeScopeData(data, mergeData) {
	const { extra, tags, attributes, user, contexts, level, sdkProcessingMetadata, breadcrumbs, fingerprint, eventProcessors, attachments, propagationContext, transactionName } = mergeData;
	mergeAndOverwriteScopeData(data, "extra", extra);
	mergeAndOverwriteScopeData(data, "tags", tags);
	mergeAndOverwriteScopeData(data, "attributes", attributes);
	mergeAndOverwriteScopeData(data, "user", user);
	mergeAndOverwriteScopeData(data, "contexts", contexts);
	data.sdkProcessingMetadata = merge(data.sdkProcessingMetadata, sdkProcessingMetadata, 2);
	if (level) data.level = level;
	if (transactionName) data.transactionName = transactionName;
	if (breadcrumbs.length) data.breadcrumbs = [...data.breadcrumbs, ...breadcrumbs];
	if (fingerprint.length) data.fingerprint = [...data.fingerprint, ...fingerprint];
	if (eventProcessors.length) data.eventProcessors = [...data.eventProcessors, ...eventProcessors];
	if (attachments.length) data.attachments = [...data.attachments, ...attachments];
	data.propagationContext = {
		...data.propagationContext,
		...propagationContext
	};
}
function mergeAndOverwriteScopeData(data, prop, mergeVal) {
	data[prop] = merge(data[prop], mergeVal, 1);
}
function getCombinedScopeData(isolationScope, currentScope) {
	const scopeData = getGlobalScope().getScopeData();
	isolationScope && mergeScopeData(scopeData, isolationScope.getScopeData());
	currentScope && mergeScopeData(scopeData, currentScope.getScopeData());
	return scopeData;
}
function applyDataToEvent(event, data) {
	const { extra, tags, user, contexts, level, transactionName } = data;
	if (Object.keys(extra).length) event.extra = {
		...extra,
		...event.extra
	};
	if (Object.keys(tags).length) event.tags = {
		...tags,
		...event.tags
	};
	if (Object.keys(user).length) event.user = {
		...user,
		...event.user
	};
	if (Object.keys(contexts).length) event.contexts = {
		...contexts,
		...event.contexts
	};
	if (level) event.level = level;
	if (transactionName && event.type !== "transaction") event.transaction = transactionName;
}
function applyBreadcrumbsToEvent(event, breadcrumbs) {
	const mergedBreadcrumbs = [...event.breadcrumbs || [], ...breadcrumbs];
	event.breadcrumbs = mergedBreadcrumbs.length ? mergedBreadcrumbs : void 0;
}
function applySdkMetadataToEvent(event, sdkProcessingMetadata) {
	event.sdkProcessingMetadata = {
		...event.sdkProcessingMetadata,
		...sdkProcessingMetadata
	};
}
function applySpanToEvent(event, span) {
	event.contexts = {
		trace: spanToTraceContext(span),
		...event.contexts
	};
	event.sdkProcessingMetadata = {
		dynamicSamplingContext: getDynamicSamplingContextFromSpan(span),
		...event.sdkProcessingMetadata
	};
	const transactionName = spanToStaticSpanJSON(getRootSpan(span)).description;
	if (transactionName && !event.transaction && event.type === "transaction") event.transaction = transactionName;
}
function applyFingerprintToEvent(event, fingerprint) {
	event.fingerprint = event.fingerprint ? Array.isArray(event.fingerprint) ? event.fingerprint : [event.fingerprint] : [];
	if (fingerprint) event.fingerprint = event.fingerprint.concat(fingerprint);
	if (!event.fingerprint.length) delete event.fingerprint;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/safeCallback.js
var CALLBACK_ERROR = /* @__PURE__ */ Symbol.for("SentryCallbackError");
function safeCallback(message, fn, fallback) {
	let result;
	try {
		result = fn();
	} catch (error) {
		return recover(message, error, fallback);
	}
	if (isThenable(result)) return result.then(void 0, (error) => recover(message, error, fallback));
	return result;
}
function recover(message, error, fallback) {
	DEBUG_BUILD$5 && debug$2.error(message, error);
	return fallback(error);
}
// ../DnD helper/node_modules/@sentry/core/build/esm/tracing/spans/beforeSendSpan.js
function withStaticSpan(callback) {
	addNonEnumerableProperty(callback, "_static", true);
	return callback;
}
function withStreamedSpan(callback) {
	return callback;
}
function isStaticBeforeSendSpanCallback(callback) {
	return !!callback && typeof callback === "function" && "_static" in callback && !!callback._static;
}
function applyBeforeSendSpanCallback(span, beforeSendSpan) {
	return safeCallback(DEBUG_BUILD$5 ? "The `beforeSendSpan` callback threw an error, sending the span unmodified:" : "", () => beforeSendSpan(span), () => span) || span;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/tracing/spans/spanJsonToStreamedSpan.js
function spanJsonToSerializedStreamedSpan(span) {
	return streamedSpanJsonToSerializedSpan({
		trace_id: span.trace_id,
		span_id: span.span_id,
		parent_span_id: span.parent_span_id,
		name: span.description || "",
		start_timestamp: span.start_timestamp,
		end_timestamp: span.timestamp,
		status: !span.status || span.status === "ok" || span.status === "cancelled" ? "ok" : "error",
		is_segment: false,
		attributes: { ...span.data },
		links: span.links
	});
}
// ../DnD helper/node_modules/@sentry/core/build/esm/tracing/spans/scopeContextAttributes.js
function scopeContextsToSpanAttributes(contexts) {
	const attrs = {};
	const { response, profile, cloud_resource, culture, state } = contexts;
	if (response) {
		if (response.status_code != null) attrs[fl] = response.status_code;
		if (response.body_size != null) attrs[dl] = response.body_size;
	}
	if (profile) {
		if (profile.profile_id) attrs[lb] = profile.profile_id;
		if (profile.profiler_id) attrs[ob] = profile.profiler_id;
	}
	if (cloud_resource) {
		for (const [key, value] of Object.entries(cloud_resource)) if (value != null) attrs[key] = value;
	}
	if (culture) {
		if (culture.locale) attrs[Ra] = culture.locale;
		if (culture.timezone) attrs[Na] = culture.timezone;
	}
	if (state?.state && typeof state.state.type === "string") attrs[ig] = state.state.type;
	const angular = contexts["angular"];
	if (angular) {
		const version = angular["version"];
		if (typeof version === "string" || typeof version === "number") attrs[Q$2] = version;
	}
	const react = contexts["react"];
	if (react) {
		const version = react["version"];
		if (typeof version === "string" || typeof version === "number") attrs[Cd] = version;
	}
	return attrs;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/tracing/spans/captureSpan.js
function captureSpan(span, client) {
	const spanJSON = spanToJSON(span);
	if (spanJSON.attributes) delete spanJSON.attributes[SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME];
	const segmentSpan = INTERNAL_getSegmentSpan(span);
	const serializedSegmentSpan = spanToJSON(segmentSpan);
	const { isolationScope: spanIsolationScope, scope: spanScope } = getCapturedScopesOnSpan(span);
	const finalScopeData = getCombinedScopeData(spanIsolationScope, spanScope);
	applyCommonSpanAttributes(spanJSON, serializedSegmentSpan, client, finalScopeData);
	client.emit("preprocessSpan", spanJSON);
	if (spanJSON.is_segment) {
		applyScopeToSegmentSpan(spanJSON, finalScopeData);
		applySdkMetadataToSegmentSpan(spanJSON, client);
		client.emit("processSegmentSpan", spanJSON);
	}
	client.emit("processSpan", spanJSON);
	const { beforeSendSpan, traceLifecycle } = client.getOptions();
	return {
		...streamedSpanJsonToSerializedSpan(traceLifecycle !== "static" && beforeSendSpan && !isStaticBeforeSendSpanCallback(beforeSendSpan) ? applyBeforeSendSpanCallback(spanJSON, beforeSendSpan) : spanJSON),
		_segmentSpan: segmentSpan
	};
}
function applyScopeToSegmentSpan(segmentSpanJSON, scopeData) {
	safeSetSpanJSONAttributes(segmentSpanJSON, scopeContextsToSpanAttributes(scopeData.contexts));
}
function safeSetSpanJSONAttributes(spanJSON, newAttributes) {
	const originalAttributes = spanJSON.attributes ?? (spanJSON.attributes = {});
	Object.entries(newAttributes).forEach(([key, value]) => {
		if (value != null && !(key in originalAttributes)) originalAttributes[key] = value;
	});
}
function applySdkMetadataToSegmentSpan(segmentSpanJSON, client) {
	const integrationNames = client.getIntegrationNames();
	if (!integrationNames.length) return;
	safeSetSpanJSONAttributes(segmentSpanJSON, { [gb]: integrationNames });
}
function commonSpanAttributes(serializedSegmentSpan, client, scopeData, includeScopeAttributes = true) {
	const sdk = client.getSdkMetadata();
	const { release, environment } = client.getOptions();
	return {
		[Pb]: "stream",
		[vb]: serializedSegmentSpan.name,
		[hb]: serializedSegmentSpan.span_id,
		[yb]: sdk?.sdk?.name,
		[_b]: sdk?.sdk?.version,
		[ub]: release,
		[wm]: environment || "production",
		[dy]: scopeData.user?.id,
		[ry]: scopeData.user?.email,
		[my]: scopeData.user?.ip_address,
		[by]: scopeData.user?.username,
		...includeScopeAttributes ? scopeData.attributes : void 0
	};
}
function applyCommonSpanAttributes(spanJSON, serializedSegmentSpan, client, scopeData) {
	safeSetSpanJSONAttributes(spanJSON, commonSpanAttributes(serializedSegmentSpan, client, scopeData));
}
function captureStandaloneSpanWithStaticCallback(span, client, beforeSendSpan) {
	const spanJSON = spanToStaticSpanJSON(span);
	const serializedSegmentSpan = spanToJSON(INTERNAL_getSegmentSpan(span));
	const { isolationScope: spanIsolationScope, scope: spanScope } = getCapturedScopesOnSpan(span);
	const commonAttributes = commonSpanAttributes(serializedSegmentSpan, client, getCombinedScopeData(spanIsolationScope, spanScope), false);
	Object.entries(commonAttributes).forEach(([key, value]) => {
		if (value != null && !(key in spanJSON.data)) spanJSON.data[key] = value;
	});
	return spanJsonToSerializedStreamedSpan(applyBeforeSendSpanCallback(spanJSON, beforeSendSpan));
}
// ../DnD helper/node_modules/@sentry/core/build/esm/tracing/spans/hasSpanStreamingEnabled.js
function hasSpanStreamingEnabled(client) {
	return client.getOptions().traceLifecycle === "stream";
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/timer.js
function safeUnref(timer) {
	if (typeof timer === "object" && typeof timer.unref === "function") timer.unref();
	return timer;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/envelope.js
function createEnvelope(headers, items = []) {
	return [headers, items];
}
function addItemToEnvelope(envelope, newItem) {
	const [headers, items] = envelope;
	return [headers, [...items, newItem]];
}
function forEachEnvelopeItem(envelope, callback) {
	const envelopeItems = envelope[1];
	for (const envelopeItem of envelopeItems) {
		const envelopeItemType = envelopeItem[0].type;
		if (callback(envelopeItem, envelopeItemType)) return true;
	}
	return false;
}
function envelopeContainsItemType(envelope, types) {
	return forEachEnvelopeItem(envelope, (_, type) => types.includes(type));
}
function encodeUTF8(input) {
	const carrier = getSentryCarrier(GLOBAL_OBJ);
	return carrier.encodePolyfill ? carrier.encodePolyfill(input) : new TextEncoder().encode(input);
}
function decodeUTF8(input) {
	const carrier = getSentryCarrier(GLOBAL_OBJ);
	return carrier.decodePolyfill ? carrier.decodePolyfill(input) : new TextDecoder().decode(input);
}
function serializeEnvelope(envelope) {
	const [envHeaders, items] = envelope;
	let parts = JSON.stringify(envHeaders);
	function append(next) {
		if (typeof parts === "string") parts = typeof next === "string" ? parts + next : [encodeUTF8(parts), next];
		else parts.push(typeof next === "string" ? encodeUTF8(next) : next);
	}
	for (const item of items) {
		const [itemHeaders, payload] = item;
		append(`
${JSON.stringify(itemHeaders)}
`);
		if (typeof payload === "string" || payload instanceof Uint8Array) append(payload);
		else {
			let stringifiedPayload;
			try {
				stringifiedPayload = JSON.stringify(payload);
			} catch {
				stringifiedPayload = JSON.stringify(normalize(payload));
			}
			append(stringifiedPayload);
		}
	}
	return typeof parts === "string" ? parts : concatBuffers(parts);
}
function concatBuffers(buffers) {
	const totalLength = buffers.reduce((acc, buf) => acc + buf.length, 0);
	const merged = new Uint8Array(totalLength);
	let offset = 0;
	for (const buffer of buffers) {
		merged.set(buffer, offset);
		offset += buffer.length;
	}
	return merged;
}
function parseEnvelope(env) {
	let buffer = typeof env === "string" ? encodeUTF8(env) : env;
	function readBinary(length) {
		const bin = buffer.subarray(0, length);
		buffer = buffer.subarray(length + 1);
		return bin;
	}
	function readJson() {
		let i = buffer.indexOf(10);
		if (i < 0) i = buffer.length;
		return JSON.parse(decodeUTF8(readBinary(i)));
	}
	const envelopeHeader = readJson();
	const items = [];
	while (buffer.length) {
		const itemHeader = readJson();
		const binaryLength = typeof itemHeader.length === "number" ? itemHeader.length : void 0;
		items.push([itemHeader, binaryLength ? readBinary(binaryLength) : readJson()]);
	}
	return [envelopeHeader, items];
}
function createAttachmentEnvelopeItem(attachment) {
	const buffer = typeof attachment.data === "string" ? encodeUTF8(attachment.data) : attachment.data;
	return [{
		type: "attachment",
		length: buffer.length,
		filename: attachment.filename,
		content_type: attachment.contentType,
		attachment_type: attachment.attachmentType
	}, buffer];
}
var DATA_CATEGORY_OVERRIDES = {
	sessions: "session",
	event: "error",
	client_report: "internal",
	user_report: "default",
	profile_chunk: "profile",
	replay_event: "replay",
	replay_recording: "replay",
	check_in: "monitor",
	raw_security: "security",
	log: "log_item",
	metric: "trace_metric"
};
function _isOverriddenType(type) {
	return type in DATA_CATEGORY_OVERRIDES;
}
function envelopeItemTypeToDataCategory(type) {
	return _isOverriddenType(type) ? DATA_CATEGORY_OVERRIDES[type] : type;
}
function getSdkMetadataForEnvelopeHeader(metadataOrEvent) {
	if (!metadataOrEvent?.sdk) return;
	const { name, version } = metadataOrEvent.sdk;
	return {
		name,
		version
	};
}
function createEventEnvelopeHeaders(event, sdkInfo, tunnel, dsn) {
	const dynamicSamplingContext = event.sdkProcessingMetadata?.dynamicSamplingContext;
	return {
		event_id: event.event_id,
		sent_at: new Date(safeDateNow()).toISOString(),
		...sdkInfo && { sdk: sdkInfo },
		...!!tunnel && dsn && { dsn: dsnToString(dsn) },
		...dynamicSamplingContext && { trace: dynamicSamplingContext }
	};
}
function getDataCategoryByType(type) {
	return type === "replay_event" ? "replay" : type || "error";
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/env.js
function isBrowserBundle() {
	return typeof __SENTRY_BROWSER_BUNDLE__ !== "undefined" && !!__SENTRY_BROWSER_BUNDLE__;
}
function getSDKSource() {
	/*! __SENTRY_SDK_SOURCE__ */
	return "npm";
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/node.js
function isNodeEnv() {
	return !isBrowserBundle() && Object.prototype.toString.call(typeof process !== "undefined" ? process : 0) === "[object process]";
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/isBrowser.js
function isBrowser() {
	return typeof window !== "undefined" && (!isNodeEnv() || isElectronNodeRenderer());
}
function isElectronNodeRenderer() {
	return GLOBAL_OBJ.process?.type === "renderer";
}
// ../DnD helper/node_modules/@sentry/core/build/esm/tracing/spans/envelope.js
function createStreamedSpanEnvelope(serializedSpans, dsc, client) {
	const options = client.getOptions();
	const dsn = client.getDsn();
	const tunnel = options.tunnel;
	const sdk = getSdkMetadataForEnvelopeHeader(options._metadata);
	return createEnvelope({
		sent_at: new Date(safeDateNow()).toISOString(),
		...dscHasRequiredProps(dsc) && { trace: dsc },
		...sdk && { sdk },
		...!!tunnel && dsn && { dsn: dsnToString(dsn) }
	}, [createSpanContainerItem(serializedSpans, client)]);
}
function createSpanContainerItem(serializedSpans, client) {
	const inferSetting = client.getDataCollectionOptions().userInfo ? "auto" : "never";
	return [{
		type: "span",
		item_count: serializedSpans.length,
		content_type: "application/vnd.sentry.items.span.v2+json"
	}, {
		version: 2,
		ingest_settings: isBrowser() ? {
			infer_ip: inferSetting,
			infer_user_agent: inferSetting
		} : void 0,
		items: serializedSpans
	}];
}
function dscHasRequiredProps(dsc) {
	return !!dsc.trace_id && !!dsc.public_key;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/tracing/spans/estimateSize.js
function estimateSerializedSpanSizeInBytes(span) {
	let weight = 156;
	weight += span.name.length * 2;
	weight += estimateTypedAttributesSizeInBytes(span.attributes);
	if (span.links && span.links.length > 0) {
		const attributes = span.links[0]?.attributes;
		const linkWeight = 100 + (attributes ? estimateTypedAttributesSizeInBytes(attributes) : 0);
		weight += linkWeight * span.links.length;
	}
	return weight;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/tracing/spans/spanBuffer.js
var MAX_SPANS_PER_ENVELOPE = 1e3;
var MAX_TRACE_WEIGHT_IN_BYTES = 5e6;
var SpanBuffer = class {
	constructor(client, options) {
		this._traceBuckets = /* @__PURE__ */ new Map();
		this._client = client;
		const { maxSpanLimit, flushInterval, maxTraceWeightInBytes } = options ?? {};
		this._maxSpanLimit = maxSpanLimit && maxSpanLimit > 0 && maxSpanLimit <= MAX_SPANS_PER_ENVELOPE ? maxSpanLimit : MAX_SPANS_PER_ENVELOPE;
		this._flushInterval = flushInterval && flushInterval > 0 ? flushInterval : 5e3;
		this._maxTraceWeight = maxTraceWeightInBytes && maxTraceWeightInBytes > 0 ? maxTraceWeightInBytes : MAX_TRACE_WEIGHT_IN_BYTES;
		this._client.on("flush", () => {
			this.drain();
		});
		this._client.on("close", () => {
			this._traceBuckets.forEach((bucket) => {
				clearTimeout(bucket.timeout);
			});
			this._traceBuckets.clear();
		});
	}
	/**
	* Add a span to the buffer.
	*/
	add(spanJSON) {
		const traceId = spanJSON.trace_id;
		let bucket = this._traceBuckets.get(traceId);
		if (!bucket) {
			bucket = {
				spans: /* @__PURE__ */ new Set(),
				size: 0,
				timeout: safeUnref(setTimeout(() => {
					this.flush(traceId);
				}, this._flushInterval))
			};
			this._traceBuckets.set(traceId, bucket);
		}
		bucket.spans.add(spanJSON);
		bucket.size += estimateSerializedSpanSizeInBytes(spanJSON);
		if (bucket.spans.size >= this._maxSpanLimit || bucket.size >= this._maxTraceWeight) this.flush(traceId);
	}
	/**
	* Drain and flush all buffered traces.
	*/
	drain() {
		if (!this._traceBuckets.size) return;
		DEBUG_BUILD$5 && debug$2.log(`Flushing span tree map with ${this._traceBuckets.size} traces`);
		this._traceBuckets.forEach((_, traceId) => {
			this.flush(traceId);
		});
	}
	/**
	* Flush spans of a specific trace.
	* In contrast to {@link SpanBuffer.drain}, this method does not flush all traces, but only the one with the given traceId.
	*/
	flush(traceId) {
		const bucket = this._traceBuckets.get(traceId);
		if (!bucket) return;
		if (!bucket.spans.size) {
			this._removeTrace(traceId);
			return;
		}
		const spans = Array.from(bucket.spans);
		const segmentSpan = spans[0]?._segmentSpan;
		if (!segmentSpan) {
			DEBUG_BUILD$5 && debug$2.warn("No segment span reference found on span JSON, cannot compute DSC");
			this._removeTrace(traceId);
			return;
		}
		const dsc = getDynamicSamplingContextFromSpan(segmentSpan);
		const cleanedSpans = spans.map((spanJSON) => {
			const { _segmentSpan, ...cleanSpanJSON } = spanJSON;
			return cleanSpanJSON;
		});
		const envelope = createStreamedSpanEnvelope(cleanedSpans, dsc, this._client);
		DEBUG_BUILD$5 && debug$2.log(`Sending span envelope for trace ${traceId} with ${cleanedSpans.length} spans`);
		this._client.sendEnvelope(envelope).then(null, (reason) => {
			DEBUG_BUILD$5 && debug$2.error("Error while sending streamed span envelope:", reason);
		});
		this._removeTrace(traceId);
	}
	_removeTrace(traceId) {
		const bucket = this._traceBuckets.get(traceId);
		if (bucket) clearTimeout(bucket.timeout);
		this._traceBuckets.delete(traceId);
	}
};
// ../DnD helper/node_modules/@sentry/core/build/esm/integrations/spanStreaming.js
var INTEGRATION_NAME$29 = "SpanStreaming";
var spanStreamingIntegration = defineIntegration((options = {}) => {
	const flushOnSegmentEnd = options.flushOnSegmentEnd ?? true;
	return {
		name: INTEGRATION_NAME$29,
		setup(client) {
			if (!hasSpanStreamingEnabled(client)) {
				DEBUG_BUILD$5 && debug$2.log(`[SpanStreaming] \`traceLifecycle\` is "static", skipping setup.`);
				return;
			}
			const buffer = new SpanBuffer(client);
			client.on("afterSpanEnd", (span) => {
				if (!spanIsSampled(span)) return;
				buffer.add(captureSpan(span, client));
			});
			client.on("flushTraceSpans", (traceId) => {
				buffer.flush(traceId);
			});
			if (flushOnSegmentEnd) client.on("afterSegmentSpanEnd", (segmentSpan) => {
				const traceId = segmentSpan.spanContext().traceId;
				safeUnref(setTimeout(() => {
					buffer.flush(traceId);
				}, 500));
			});
		}
	};
});
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/handleCallbackErrors.js
function handleCallbackErrors(fn, onError, onFinally = () => {}, onSuccess = () => {}) {
	let maybePromiseResult;
	try {
		maybePromiseResult = fn();
	} catch (e) {
		onError(e);
		onFinally();
		throw e;
	}
	return maybeHandlePromiseRejection(maybePromiseResult, onError, onFinally, onSuccess);
}
function maybeHandlePromiseRejection(value, onError, onFinally, onSuccess) {
	if (isThenable(value)) return chainAndCopyPromiseLike(value, (result) => {
		onFinally();
		onSuccess(result);
	}, (err) => {
		onError(err);
		onFinally();
	});
	onFinally();
	onSuccess(value);
	return value;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/errorSpanAttribution.js
var escapedSpanTraceContexts = /* @__PURE__ */ new WeakMap();
function toWeakMapKey(error) {
	return isPrimitive(error) ? void 0 : error;
}
function recordEscapedErrorSpan(error, span) {
	const key = toWeakMapKey(error);
	if (!key || !spanIsSampled(span) || escapedSpanTraceContexts.has(key)) return;
	escapedSpanTraceContexts.set(key, spanToTraceContext(span));
}
function applyEscapedErrorSpanToEvent(event, hint, scope) {
	const key = toWeakMapKey(hint.originalException);
	const traceContext = key && escapedSpanTraceContexts.get(key);
	if (!traceContext) return;
	const eventTraceContext = event.contexts?.trace;
	if ((eventTraceContext?.trace_id ?? (scope && getTraceContextFromScope(scope).trace_id)) !== traceContext.trace_id) return;
	event.contexts = {
		...event.contexts,
		trace: {
			...eventTraceContext,
			...traceContext
		}
	};
}
// ../DnD helper/node_modules/@sentry/core/build/esm/tracing/logSpans.js
function logSpanStart(span) {
	if (!DEBUG_BUILD$5) return;
	const { description = "< unknown name >", op = "< unknown op >", parent_span_id: parentSpanId } = spanToStaticSpanJSON(span);
	const { spanId } = span.spanContext();
	const sampled = spanIsSampled(span);
	const rootSpan = getRootSpan(span);
	const isRootSpan = rootSpan === span;
	const header = `[Tracing] Starting ${sampled ? "sampled" : "unsampled"} ${isRootSpan ? "root " : ""}span`;
	const infoParts = [
		`op: ${op}`,
		`name: ${description}`,
		`ID: ${spanId}`
	];
	if (parentSpanId) infoParts.push(`parent ID: ${parentSpanId}`);
	if (!isRootSpan) {
		const { op: op2, description: description2 } = spanToStaticSpanJSON(rootSpan);
		infoParts.push(`root ID: ${rootSpan.spanContext().spanId}`);
		if (op2) infoParts.push(`root op: ${op2}`);
		if (description2) infoParts.push(`root description: ${description2}`);
	}
	debug$2.log(`${header}
  ${infoParts.join("\n  ")}`);
}
function logSpanEnd(span) {
	if (!DEBUG_BUILD$5) return;
	const { description = "< unknown name >", op = "< unknown op >" } = spanToStaticSpanJSON(span);
	const { spanId } = span.spanContext();
	const msg = `[Tracing] Finishing "${op}" ${getRootSpan(span) === span ? "root " : ""}span "${description}" with ID ${spanId}`;
	debug$2.log(msg);
}
// ../DnD helper/node_modules/@sentry/core/build/esm/tracing/sampling.js
function sampleSpan(options, samplingContext, sampleRand) {
	if (!hasSpansEnabled(options)) return [false];
	const resolved = resolveSampleRate(options, samplingContext);
	if (!resolved) return [
		false,
		void 0,
		void 0,
		"callback_error"
	];
	const [sampleRate, localSampleRateWasApplied] = resolved;
	const parsedSampleRate = parseSampleRate(sampleRate);
	if (parsedSampleRate === void 0) {
		DEBUG_BUILD$5 && debug$2.warn(`[Tracing] Discarding root span because of invalid sample rate. Sample rate must be a boolean or a number between 0 and 1. Got ${JSON.stringify(sampleRate)} of type ${JSON.stringify(typeof sampleRate)}.`);
		return [false];
	}
	if (!parsedSampleRate) {
		DEBUG_BUILD$5 && debug$2.log(`[Tracing] Discarding transaction because ${typeof options.tracesSampler === "function" ? "tracesSampler returned 0 or false" : "a negative sampling decision was inherited or tracesSampleRate is set to 0"}`);
		return [
			false,
			parsedSampleRate,
			localSampleRateWasApplied
		];
	}
	const shouldSample = sampleRand < parsedSampleRate;
	if (!shouldSample) DEBUG_BUILD$5 && debug$2.log(`[Tracing] Discarding transaction because it's not included in the random sample (sampling rate = ${Number(sampleRate)})`);
	return [
		shouldSample,
		parsedSampleRate,
		localSampleRateWasApplied
	];
}
function resolveSampleRate(options, samplingContext) {
	const { tracesSampler, tracesSampleRate } = options;
	if (typeof tracesSampler === "function") {
		const samplerResult = safeCallback(DEBUG_BUILD$5 ? "The `tracesSampler` callback threw an error, falling back to the parent sampling decision or `tracesSampleRate`:" : "", () => [tracesSampler({
			...samplingContext,
			inheritOrSampleWith: (fallbackSampleRate) => {
				if (typeof samplingContext.parentSampleRate === "number") return samplingContext.parentSampleRate;
				if (typeof samplingContext.parentSampled === "boolean") return Number(samplingContext.parentSampled);
				return fallbackSampleRate;
			}
		}), true], () => void 0);
		if (samplerResult) return samplerResult;
	}
	if (samplingContext.parentSampled !== void 0) return [samplingContext.parentSampled];
	if (typeof tracesSampleRate !== "undefined") return [tracesSampleRate, true];
}
// ../DnD helper/node_modules/@sentry/core/build/esm/tracing/measurement.js
function setMeasurement(name, value, unit, activeSpan = getActiveSpan()) {
	const rootSpan = activeSpan && getRootSpan(activeSpan);
	if (rootSpan) {
		DEBUG_BUILD$5 && debug$2.log(`[Measurement] Setting measurement on root span: ${name} = ${value} ${unit}`);
		rootSpan.addEvent(name, {
			[SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_VALUE]: value,
			[SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_UNIT]: unit
		});
	}
}
function timedEventsToMeasurements(events) {
	if (!events || events.length === 0) return;
	const measurements = {};
	events.forEach((event) => {
		const attributes = event.attributes || {};
		const unit = attributes[SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_UNIT];
		const value = attributes[SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_VALUE];
		if (typeof unit === "string" && typeof value === "number") measurements[event.name] = {
			value,
			unit
		};
	});
	return measurements;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/tracing/segmentSpanCaptureStrategy.js
function getSegmentSpanCaptureStrategy() {
	return getSentryCarrier(getMainCarrier()).segmentSpanCaptureStrategy;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/tracing/sentrySpan.js
var MAX_SPAN_COUNT = 1e3;
var SentrySpan = class {
	/**
	* You should never call the constructor manually, always use `Sentry.startSpan()`
	* or other span methods.
	* @internal
	* @hideconstructor
	* @hidden
	*/
	constructor(spanContext = {}) {
		this._traceId = spanContext.traceId || generateTraceId();
		this._spanId = spanContext.spanId || generateSpanId();
		if (spanContext.startTimestamp) this._startTime = spanContext.startTimestamp;
		else {
			this._startTime = timestampInSeconds();
			this._startPerformanceNow = safePerformanceNow();
		}
		this._links = spanContext.links;
		this._attributes = {};
		this.setAttributes({
			[sb]: "manual",
			[ab]: spanContext.op,
			...spanContext.attributes
		});
		this._name = spanContext.name;
		if (spanContext.parentSpanId) this._parentSpanId = spanContext.parentSpanId;
		if ("sampled" in spanContext) this._sampled = spanContext.sampled;
		this._events = [];
		this._isStandaloneSpan = spanContext.isStandalone;
	}
	/** @inheritDoc */
	addLink(link) {
		if (this._frozen) return this;
		if (this._links) this._links.push(link);
		else this._links = [link];
		return this;
	}
	/** @inheritDoc */
	addLinks(links) {
		if (this._frozen) return this;
		if (this._links) this._links.push(...links);
		else this._links = links;
		return this;
	}
	/**
	* This should generally not be used,
	* but it is needed for being compliant with the OTEL Span interface.
	*
	* @hidden
	* @internal
	*/
	recordException(_exception, _time) {}
	/** @inheritdoc */
	spanContext() {
		const { _spanId: spanId, _traceId: traceId, _sampled: sampled } = this;
		return {
			spanId,
			traceId,
			traceFlags: sampled ? 1 : 0
		};
	}
	/** @inheritdoc */
	setAttribute(key, value) {
		if (this._frozen) return this;
		if (key === "sentry.segment.name.source" && value !== void 0 && !spanIsSegment(this)) {
			DEBUG_BUILD$5 && debug$2.warn("[Tracing] Ignoring name source on a child span: this attribute is only valid on the root span.");
			return this;
		}
		if (value === void 0) delete this._attributes[key];
		else this._attributes[key] = value;
		return this;
	}
	/** @inheritdoc */
	setAttributes(attributes) {
		Object.keys(attributes).forEach((key) => this.setAttribute(key, attributes[key]));
		return this;
	}
	/**
	* This should generally not be used,
	* but we need it for browser tracing where we want to adjust the start time afterwards.
	* USE THIS WITH CAUTION!
	*
	* @hidden
	* @internal
	*/
	updateStartTime(timeInput) {
		if (this._frozen) return;
		this._startTime = timeInputToSeconds(this, timeInput);
		this._startPerformanceNow = void 0;
	}
	/**
	* @inheritDoc
	*/
	setStatus(value) {
		if (this._frozen) return this;
		this._status = value;
		return this;
	}
	/**
	* @inheritDoc
	*/
	updateName(name) {
		if (this._frozen) return this;
		this._name = name;
		INTERNAL_setSegmentNameSourceIfSegment(this, "custom");
		return this;
	}
	/** @inheritdoc */
	end(endTimestamp) {
		if (this._endTime) return;
		this._endTime = endTimestamp == null ? this._getEndTimeFromDuration() : timeInputToSeconds(this, endTimestamp);
		logSpanEnd(this);
		this._onSpanEnded();
		this._frozen = spanIsTracerProviderSpan(this);
	}
	/**
	* Get JSON representation of this span.
	*
	* @hidden
	* @internal This method is purely for internal purposes and should not be used outside
	* of SDK code. If you need to get a JSON representation of a span,
	* use `spanToJSON(span)` instead.
	*/
	getStaticSpanJSON() {
		return {
			data: this._attributes,
			description: this._name,
			op: this._attributes[ab],
			parent_span_id: this._parentSpanId,
			span_id: this._spanId,
			start_timestamp: this._startTime,
			status: getStatusMessage(this._status),
			timestamp: this._endTime,
			trace_id: this._traceId,
			origin: this._attributes[sb],
			profile_id: this._attributes[lb],
			exclusive_time: this._attributes[Cm],
			measurements: timedEventsToMeasurements(this._events),
			links: convertSpanLinksForEnvelope(this._links)
		};
	}
	/**
	* Get {@link StreamedSpanJSON} representation of this span.
	*
	* @hidden
	* @internal This method is purely for internal purposes and should not be used outside
	* of SDK code. If you need to get a JSON representation of a span,
	* use `spanToJSON(span)` instead.
	*/
	getSpanJSON() {
		return {
			name: this._name ?? "",
			span_id: this._spanId,
			trace_id: this._traceId,
			parent_span_id: this._parentSpanId,
			start_timestamp: this._startTime,
			end_timestamp: this._endTime,
			is_segment: spanIsSegment(this),
			status: getSimpleStatus(this._status),
			attributes: addStatusMessageAttribute(this._attributes, this._status),
			links: getStreamedSpanLinks(this._links)
		};
	}
	/** @inheritdoc */
	isRecording() {
		return !this._endTime && !!this._sampled;
	}
	/**
	* @inheritdoc
	*/
	addEvent(name, attributesOrStartTime, startTime) {
		if (this._frozen) return this;
		DEBUG_BUILD$5 && debug$2.log("[Tracing] Adding an event to span:", name);
		const time = isSpanTimeInput(attributesOrStartTime) ? attributesOrStartTime : startTime || void 0;
		const attributes = isSpanTimeInput(attributesOrStartTime) ? {} : attributesOrStartTime || {};
		const event = {
			name,
			time: timeInputToSeconds(this, time),
			attributes
		};
		this._events.push(event);
		return this;
	}
	/**
	* Whether this span is sent on its own (as a v2 streamed span) rather than as part of a
	* transaction. Used internally; see `_isStandaloneSpan`.
	* @internal
	*/
	isStandaloneSpan() {
		return !!this._isStandaloneSpan;
	}
	/**
	* Returns the start time plus the `performance.now()` time since the span started.
	*
	* This way, the duration is correct even if the time origin was corrected while the span was running (e.g. after the
	* device slept), and it can never be negative.
	*/
	_getEndTimeFromDuration() {
		const performanceNow = safePerformanceNow();
		if (this._startPerformanceNow == null || performanceNow == null) return timestampInSeconds();
		return this._startTime + (performanceNow - this._startPerformanceNow) / 1e3;
	}
	/** Emit `spanEnd` when the span is ended. */
	_onSpanEnded() {
		const client = getClient();
		client?.emit("spanEnd", this);
		if (this._isStandaloneSpan) {
			if (!client) return;
			if (this._sampled) {
				sendStandaloneSpan(this, client);
				return;
			}
			DEBUG_BUILD$5 && debug$2.log("[Tracing] Discarding standalone span because its trace was not chosen to be sampled.");
			return;
		}
		client?.emit("afterSpanEnd", this);
		const rootSpan = getRootSpan(this);
		if (rootSpan !== this) {
			const strategy2 = getSegmentSpanCaptureStrategy();
			if (strategy2) {
				const scope2 = getCapturedScopesOnSpan(this).scope || getCurrentScope();
				strategy2.onChildSpanEnded(this, rootSpan, (options) => this._convertSpanToTransaction(options), scope2);
			}
			return;
		}
		if (client && hasSpanStreamingEnabled(client)) {
			client.emit("afterSegmentSpanEnd", this);
			return;
		}
		const scope = getCapturedScopesOnSpan(this).scope || getCurrentScope();
		const strategy = getSegmentSpanCaptureStrategy();
		if (strategy) strategy.onSegmentSpanEnded((options) => this._convertSpanToTransaction(options), scope);
		else {
			const transactionEvent = this._convertSpanToTransaction();
			if (transactionEvent) scope.captureEvent(transactionEvent);
		}
	}
	/**
	* Finish the transaction & prepare the event to send to Sentry.
	*/
	_convertSpanToTransaction(options = {}) {
		if (!isFullFinishedSpan(spanToStaticSpanJSON(this))) return;
		if (!this._name) {
			DEBUG_BUILD$5 && debug$2.warn("Transaction has no name, falling back to `<unlabeled transaction>`.");
			this._name = "<unlabeled transaction>";
		}
		const { scope: capturedSpanScope, isolationScope: capturedSpanIsolationScope } = getCapturedScopesOnSpan(this);
		const normalizedRequest = capturedSpanScope?.getScopeData().sdkProcessingMetadata?.normalizedRequest;
		if (this._sampled !== true) return;
		options.onSpanCaptured?.(this);
		const spans = [];
		let droppedUnfinishedSpanCount = 0;
		for (const descendant of getSpanDescendants(this)) {
			if (descendant === this || isStandaloneSpan(descendant) || options.isSpanAlreadyCaptured?.(descendant)) continue;
			const spanJSON = spanToStaticSpanJSON(descendant);
			if (!isFullFinishedSpan(spanJSON)) {
				if (!options.onSpanCaptured) droppedUnfinishedSpanCount++;
				continue;
			}
			options.onSpanCaptured?.(descendant);
			spans.push(spanJSON);
		}
		const client = capturedSpanScope?.getClient() || getClient();
		if (droppedUnfinishedSpanCount) client?.recordDroppedEvent("invalid", "span", droppedUnfinishedSpanCount);
		if (spans.length > MAX_SPAN_COUNT) client?.recordDroppedEvent("buffer_overflow", "span", spans.length - MAX_SPAN_COUNT);
		const source = this._attributes[kb$1];
		delete this._attributes[SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME];
		let hasGenAiSpans = false;
		spans.forEach((span) => {
			delete span.data[SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME];
			if (span.op?.startsWith("gen_ai.")) hasGenAiSpans = true;
		});
		const transaction = {
			contexts: { trace: spanToTransactionTraceContext(this) },
			spans: spans.length > MAX_SPAN_COUNT ? spans.sort((a, b) => a.start_timestamp - b.start_timestamp).slice(0, MAX_SPAN_COUNT) : spans,
			start_timestamp: this._startTime,
			timestamp: this._endTime,
			transaction: this._name,
			type: "transaction",
			sdkProcessingMetadata: {
				capturedSpanScope,
				capturedSpanIsolationScope,
				dynamicSamplingContext: getDynamicSamplingContextFromSpan(this),
				hasGenAiSpans
			},
			request: normalizedRequest,
			...source && { transaction_info: { source } }
		};
		const measurements = timedEventsToMeasurements(this._events);
		if (measurements && Object.keys(measurements).length) {
			DEBUG_BUILD$5 && debug$2.log("[Measurements] Adding measurements to transaction event", JSON.stringify(measurements, void 0, 2));
			transaction.measurements = measurements;
		}
		return transaction;
	}
};
function timeInputToSeconds(span, input) {
	return spanIsTracerProviderSpan(span) ? otelTimeInputToSeconds(input) : spanTimeInputToSeconds(input);
}
function isSpanTimeInput(value) {
	return value && typeof value === "number" || value instanceof Date || Array.isArray(value);
}
function isFullFinishedSpan(input) {
	return !!input.start_timestamp && !!input.timestamp && !!input.span_id && !!input.trace_id;
}
function isStandaloneSpan(span) {
	return span instanceof SentrySpan && span.isStandaloneSpan();
}
function sendStandaloneSpan(span, client) {
	const { beforeSendSpan, traceLifecycle } = client.getOptions();
	if (traceLifecycle === "static" && isStaticBeforeSendSpanCallback(beforeSendSpan)) {
		const serializedSpan2 = captureStandaloneSpanWithStaticCallback(span, client, beforeSendSpan);
		const dsc2 = getDynamicSamplingContextFromSpan(span);
		client.sendEnvelope(createStreamedSpanEnvelope([serializedSpan2], dsc2, client));
		return;
	}
	const { _segmentSpan, ...serializedSpan } = captureSpan(span, client);
	const dsc = getDynamicSamplingContextFromSpan(_segmentSpan);
	client.sendEnvelope(createStreamedSpanEnvelope([serializedSpan], dsc, client));
}
// ../DnD helper/node_modules/@sentry/core/build/esm/tracing/trace.js
function startSpan$1(options, callback) {
	const spanArguments = parseSentrySpanArguments(options);
	const { forceTransaction, parentSpan: customParentSpan, scope: customScope } = options;
	const customForkedScope = customScope?.clone();
	return withScope(customForkedScope, () => {
		return getActiveSpanWrapper(customParentSpan)(() => {
			const scope = getCurrentScope();
			const parentSpan = getParentSpan(customScope ?? scope, customParentSpan);
			const client = getClient();
			const activeSpan = options.onlyIfParent && !parentSpan ? startMissingRequiredParentSpan(scope, client) : createChildOrRootSpan({
				parentSpan,
				spanArguments,
				forceTransaction,
				scope
			});
			return runCallback(activeSpan, !spanIsIgnored(activeSpan) || !parentSpan, () => callback(activeSpan), () => activeSpan.end());
		});
	});
}
function startSpanManual$1(options, callback) {
	const spanArguments = parseSentrySpanArguments(options);
	const { forceTransaction, parentSpan: customParentSpan, scope: customScope } = options;
	const customForkedScope = customScope?.clone();
	return withScope(customForkedScope, () => {
		return getActiveSpanWrapper(customParentSpan)(() => {
			const scope = getCurrentScope();
			const parentSpan = getParentSpan(customScope ?? scope, customParentSpan);
			const activeSpan = options.onlyIfParent && !parentSpan ? startMissingRequiredParentSpan(scope, getClient()) : createChildOrRootSpan({
				parentSpan,
				spanArguments,
				forceTransaction,
				scope
			});
			return runCallback(activeSpan, !spanIsIgnored(activeSpan) || !parentSpan, () => callback(activeSpan, () => activeSpan.end()));
		});
	});
}
function startInactiveSpan$1(options) {
	const spanArguments = parseSentrySpanArguments(options);
	const { forceTransaction, parentSpan: customParentSpan, scope: customScope } = options;
	return (customScope ? (callback) => withScope(customScope, callback) : customParentSpan !== void 0 ? (callback) => withActiveSpan(customParentSpan, callback) : (callback) => callback())(() => {
		const scope = getCurrentScope();
		const parentSpan = getParentSpan(customScope ?? scope, customParentSpan);
		const client = getClient();
		if (options.onlyIfParent && !parentSpan) return startMissingRequiredParentSpan(scope, client);
		return createChildOrRootSpan({
			parentSpan,
			spanArguments,
			forceTransaction,
			scope
		});
	});
}
var continueTrace = (options, callback) => {
	const acs = getAsyncContextStrategy(getMainCarrier());
	if (acs.continueTrace) return acs.continueTrace(options, callback);
	const { sentryTrace, baggage } = options;
	const client = getClient();
	const incomingDsc = baggageHeaderToDynamicSamplingContext(baggage);
	if (client && !shouldContinueTrace(client, incomingDsc?.org_id)) return startNewTrace(callback);
	return withScope((scope) => {
		const propagationContext = propagationContextFromHeaders(sentryTrace, baggage);
		scope.setPropagationContext(propagationContext);
		return withActiveSpan(null, callback);
	});
};
function withActiveSpan(span, callback) {
	const acs = getAcs();
	if (acs.withActiveSpan) return acs.withActiveSpan(span, callback);
	return withScope((scope) => {
		_setSpanForScope(scope, span || void 0);
		return callback(scope);
	});
}
function suppressTracing(callback) {
	const acs = getAcs();
	if (acs.suppressTracing) return acs.suppressTracing(callback);
	return withScope((scope) => {
		scope.setSDKProcessingMetadata({ [SUPPRESS_TRACING_KEY]: true });
		return callback();
	});
}
function isTracingSuppressed(scope = getCurrentScope()) {
	const acs = getAcs();
	if (acs.isTracingSuppressed) return acs.isTracingSuppressed(scope);
	return scope.getScopeData().sdkProcessingMetadata[SUPPRESS_TRACING_KEY] === true;
}
function startNewTrace(callback) {
	const acs = getAcs();
	if (acs.startNewTrace) return acs.startNewTrace(callback);
	return withActiveSpan(null, () => {
		return withScope((scope) => {
			scope.setPropagationContext({
				traceId: generateTraceId(),
				sampleRand: safeMathRandom()
			});
			DEBUG_BUILD$5 && debug$2.log(`Starting a new trace with id ${scope.getPropagationContext().traceId}`);
			return callback();
		});
	});
}
function startMissingRequiredParentSpan(scope, client) {
	client?.recordDroppedEvent("no_parent_span", "span");
	const span = new SentryNonRecordingSpan({
		dropReason: "no_parent_span",
		traceId: scope.getPropagationContext().traceId
	});
	setCapturedScopesOnSpan(span, scope, getIsolationScope());
	return span;
}
function createChildOrRootSpan({ parentSpan: resolvedParentSpan, spanArguments, forceTransaction, scope: currentScope }) {
	const isolationScope = getIsolationScope();
	const spanScope = {
		scope: currentScope,
		parentSpan: resolvedParentSpan
	};
	getClient()?.emit("prepareSpanScope", spanScope);
	const { scope, parentSpan } = spanScope;
	if (!hasSpansEnabled()) {
		const scopePropagationContext = scope.getPropagationContext();
		const span2 = new SentryNonRecordingSpan({ traceId: parentSpan ? parentSpan.spanContext().traceId : scopePropagationContext.traceId });
		if (parentSpan && !forceTransaction) addChildSpanToSpan(parentSpan, span2);
		setCapturedScopesOnSpan(span2, scope, isolationScope);
		return span2;
	}
	const client = getClient();
	if (_shouldIgnoreStreamedSpan(client, spanArguments)) {
		if (!isTracingSuppressed(scope)) client?.recordDroppedEvent("ignored", "span");
		const ignoredSpan = new SentryNonRecordingSpan({
			dropReason: "ignored",
			traceId: parentSpan?.spanContext().traceId ?? scope.getPropagationContext().traceId
		});
		if (parentSpan && !forceTransaction) addChildSpanToSpan(parentSpan, ignoredSpan);
		setCapturedScopesOnSpan(ignoredSpan, scope, isolationScope);
		return ignoredSpan;
	}
	let span;
	if (parentSpan && !forceTransaction) {
		span = _startChildSpan(parentSpan, scope, spanArguments, isolationScope);
		addChildSpanToSpan(parentSpan, span);
	} else if (parentSpan) {
		const dsc = getDynamicSamplingContextFromSpan(parentSpan);
		const { traceId, spanId: parentSpanId } = parentSpan.spanContext();
		const parentSampled = spanIsSampled(parentSpan);
		span = _startRootSpan({
			traceId,
			parentSpanId,
			...spanArguments
		}, scope, isolationScope, parentSampled);
		freezeDscOnSpan(span, dsc);
	} else {
		const { traceId, dsc, parentSpanId, sampled: parentSampled, sampleRand } = scope.getPropagationContext();
		span = _startRootSpan({
			traceId,
			parentSpanId,
			...spanArguments
		}, scope, isolationScope, parentSampled);
		if (dsc) {
			const dscWithSampleRand = Object.keys(dsc).length === 0 && sampleRand !== void 0 ? { sample_rand: sampleRand.toString() } : dsc;
			freezeDscOnSpan(span, dscWithSampleRand);
		}
	}
	logSpanStart(span);
	return span;
}
function parseSentrySpanArguments(options) {
	const initialCtx = {
		isStandalone: options.experimental?.standalone,
		...options
	};
	if (options.op) initialCtx.attributes = {
		[ab]: options.op,
		...options.attributes
	};
	if (options.startTime) {
		const ctx = { ...initialCtx };
		ctx.startTimestamp = spanTimeInputToSeconds(options.startTime);
		delete ctx.startTime;
		return ctx;
	}
	return initialCtx;
}
function getAcs() {
	return getAsyncContextStrategy(getMainCarrier());
}
function _startRootSpan(spanArguments, scope, isolationScope, parentSampled) {
	const client = getClient();
	const options = client?.getOptions() || {};
	const { name = "" } = spanArguments;
	const mutableSpanSamplingData = {
		spanAttributes: { ...spanArguments.attributes },
		spanName: name,
		parentSampled
	};
	client?.emit("beforeSampling", mutableSpanSamplingData, { decision: false });
	const finalParentSampled = mutableSpanSamplingData.parentSampled ?? parentSampled;
	const finalAttributes = mutableSpanSamplingData.spanAttributes;
	const currentPropagationContext = scope.getPropagationContext();
	const _isTracingSuppressed = isTracingSuppressed(scope);
	const [sampled, sampleRate, localSampleRateWasApplied, dropReason] = _isTracingSuppressed ? [false] : sampleSpan(options, {
		name,
		parentSampled: finalParentSampled,
		attributes: finalAttributes,
		normalizedRequest: isolationScope.getScopeData().sdkProcessingMetadata.normalizedRequest,
		parentSampleRate: parseSampleRate(currentPropagationContext.dsc?.sample_rate)
	}, currentPropagationContext.sampleRand);
	const rootSpan = new SentrySpan({
		...spanArguments,
		attributes: {
			[kb$1]: "custom",
			[SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: sampleRate !== void 0 && localSampleRateWasApplied ? sampleRate : void 0,
			...finalAttributes
		},
		sampled
	});
	if (!sampled && client && !_isTracingSuppressed) {
		DEBUG_BUILD$5 && debug$2.log("[Tracing] Discarding root span because its trace was not chosen to be sampled.");
		const outcomeReason = dropReason || "sample_rate";
		if (!hasSpanStreamingEnabled(client) && !spanArguments.isStandalone) client.recordDroppedEvent(outcomeReason, "transaction");
		client.recordDroppedEvent(outcomeReason, "span");
	}
	setCapturedScopesOnSpan(rootSpan, scope, isolationScope);
	if (client) client.emit("spanStart", rootSpan);
	return rootSpan;
}
function _startChildSpan(parentSpan, scope, spanArguments, isolationScope) {
	const { spanId, traceId } = parentSpan.spanContext();
	const _isTracingSuppressed = isTracingSuppressed(scope);
	const sampled = _isTracingSuppressed ? false : spanIsSampled(parentSpan);
	const childSpan = sampled ? new SentrySpan({
		...spanArguments,
		parentSpanId: spanId,
		traceId,
		sampled
	}) : new SentryNonRecordingSpan({ traceId });
	addChildSpanToSpan(parentSpan, childSpan);
	setCapturedScopesOnSpan(childSpan, scope, isolationScope);
	const client = getClient();
	if (!client) return childSpan;
	if (spanIsNonRecordingSpan(childSpan)) {
		if (spanIsNonRecordingSpan(parentSpan) && parentSpan.dropReason) {
			childSpan.dropReason = parentSpan.dropReason;
			client.recordDroppedEvent(parentSpan.dropReason, "span");
		} else if (!_isTracingSuppressed) {
			childSpan.dropReason = "sample_rate";
			client.recordDroppedEvent("sample_rate", "span");
		}
	}
	client.emit("spanStart", childSpan);
	return childSpan;
}
function getParentSpan(scope, customParentSpan) {
	if (customParentSpan) return customParentSpan;
	if (customParentSpan === null) return;
	const span = getActiveSpan(scope);
	if (!span) return;
	const client = getClient();
	if ((client ? client.getOptions() : {}).parentSpanIsAlwaysRootSpan) return getRootSpan(span);
	return span;
}
function getActiveSpanWrapper(parentSpan) {
	return parentSpan !== void 0 ? (callback) => {
		return withActiveSpan(parentSpan, callback);
	} : (callback) => callback();
}
function _shouldIgnoreStreamedSpan(client, spanArguments) {
	const ignoreSpans = client?.getOptions().ignoreSpans;
	if (!client || !hasSpanStreamingEnabled(client) || !ignoreSpans?.length) return false;
	return shouldIgnoreSpan({
		description: spanArguments.name || "",
		op: spanArguments.attributes?.["sentry.op"] || spanArguments.op,
		attributes: spanArguments.attributes
	}, ignoreSpans);
}
function spanIsIgnored(span) {
	return spanIsNonRecordingSpan(span) && span.dropReason === "ignored";
}
function runCallback(span, makeSpanActive, callback, finallyCallback) {
	return (makeSpanActive ? (callback2) => {
		return withActiveSpan(span, () => {
			const scope = getCurrentScope();
			const creationScope = getCapturedScopesOnSpan(span).scope;
			if (creationScope) scope.setPropagationContext(creationScope.getPropagationContext());
			setCapturedScopesOnSpan(span, scope, getIsolationScope());
			return callback2();
		});
	} : (callback2) => callback2())(() => handleCallbackErrors(() => callback(), (error) => {
		recordEscapedErrorSpan(error, span);
		const { status } = spanToStaticSpanJSON(span);
		if (span.isRecording() && status === "ok") span.setStatus({
			code: 2,
			message: "internal_error"
		});
	}, finallyCallback));
}
// ../DnD helper/node_modules/@sentry/core/build/esm/tracing/browserSpanApi.js
var clientsWithIntegration = /* @__PURE__ */ new WeakSet();
function _INTERNAL_ensureBrowserSpanStreaming(client = getClient()) {
	if (!client || clientsWithIntegration.has(client) || !hasSpanStreamingEnabled(client)) return;
	clientsWithIntegration.add(client);
	client.addIntegration(spanStreamingIntegration());
}
function startSpan(options, callback) {
	_INTERNAL_ensureBrowserSpanStreaming();
	return startSpan$1(options, callback);
}
function startSpanManual(options, callback) {
	_INTERNAL_ensureBrowserSpanStreaming();
	return startSpanManual$1(options, callback);
}
function startInactiveSpan(options) {
	_INTERNAL_ensureBrowserSpanStreaming();
	return startInactiveSpan$1(options);
}
// ../DnD helper/node_modules/@sentry/core/build/esm/tracing/idleSpan.js
var TRACING_DEFAULTS = {
	idleTimeout: 1e3,
	finalTimeout: 3e4,
	childSpanTimeout: 15e3
};
var FINISH_REASON_HEARTBEAT_FAILED = "heartbeatFailed";
var FINISH_REASON_IDLE_TIMEOUT = "idleTimeout";
var FINISH_REASON_FINAL_TIMEOUT = "finalTimeout";
var FINISH_REASON_EXTERNAL_FINISH = "externalFinish";
function startIdleSpan(startSpanOptions, options = {}) {
	const client = getClient();
	_INTERNAL_ensureBrowserSpanStreaming(client);
	const activities = /* @__PURE__ */ new Map();
	let _finished = false;
	let _idleTimeoutID;
	let _childSpanTimeoutID;
	let _finishReason = FINISH_REASON_EXTERNAL_FINISH;
	let _autoFinishAllowed = !options.disableAutoFinish;
	const _cleanupHooks = [];
	const { idleTimeout = TRACING_DEFAULTS.idleTimeout, finalTimeout = TRACING_DEFAULTS.finalTimeout, childSpanTimeout = TRACING_DEFAULTS.childSpanTimeout, trimIdleSpanEndTimestamp = true } = options;
	const scope = getCurrentScope();
	if (!client || !hasSpansEnabled()) {
		const span2 = new SentryNonRecordingSpan({ traceId: scope.getPropagationContext().traceId });
		setCapturedScopesOnSpan(span2, scope, getIsolationScope());
		return span2;
	}
	const previousActiveSpan = getActiveSpan();
	const span = startInactiveSpan$1(startSpanOptions);
	_setSpanForScope(getCurrentScope(), span);
	DEBUG_BUILD$5 && debug$2.log("[Tracing] Started span is an idle span");
	span.end = new Proxy(span.end, { apply(target, thisArg, args) {
		client.emit("beforeIdleSpanEnd", span);
		if (spanIsNonRecordingSpan(thisArg)) return;
		const [definedEndTimestamp, ...rest] = args;
		const spanEndTimestamp = spanTimeInputToSeconds(definedEndTimestamp || timestampInSeconds());
		const spans = getSpanDescendants(span).filter((child) => child !== span);
		const spanJson = spanToStaticSpanJSON(span);
		if (!spans.length || !trimIdleSpanEndTimestamp) {
			onIdleSpanEnded(spanEndTimestamp);
			return Reflect.apply(target, thisArg, [spanEndTimestamp, ...rest]);
		}
		const ignoreSpans = client.getOptions().ignoreSpans;
		const latestSpanEndTimestamp = spans?.reduce((acc, current) => {
			const currentSpanJson = spanToStaticSpanJSON(current);
			if (!currentSpanJson.timestamp) return acc;
			if (ignoreSpans && shouldIgnoreSpan({
				description: currentSpanJson.description,
				op: currentSpanJson.op,
				attributes: currentSpanJson.data
			}, ignoreSpans)) return acc;
			return acc ? Math.max(acc, currentSpanJson.timestamp) : currentSpanJson.timestamp;
		}, void 0);
		const spanStartTimestamp = spanJson.start_timestamp;
		const endTimestamp = Math.min(spanStartTimestamp ? spanStartTimestamp + finalTimeout / 1e3 : Infinity, Math.max(spanStartTimestamp || -Infinity, Math.min(spanEndTimestamp, latestSpanEndTimestamp || Infinity)));
		onIdleSpanEnded(endTimestamp);
		return Reflect.apply(target, thisArg, [endTimestamp, ...rest]);
	} });
	function _cancelIdleTimeout() {
		if (_idleTimeoutID) {
			clearTimeout(_idleTimeoutID);
			_idleTimeoutID = void 0;
		}
	}
	function _cancelChildSpanTimeout() {
		if (_childSpanTimeoutID) {
			clearTimeout(_childSpanTimeoutID);
			_childSpanTimeoutID = void 0;
		}
	}
	function _restartIdleTimeout(endTimestamp) {
		_cancelIdleTimeout();
		_idleTimeoutID = setTimeout(() => {
			if (!_finished && activities.size === 0 && _autoFinishAllowed) {
				_finishReason = FINISH_REASON_IDLE_TIMEOUT;
				span.end(endTimestamp);
			}
		}, idleTimeout);
	}
	function _restartChildSpanTimeout(endTimestamp) {
		_cancelChildSpanTimeout();
		_childSpanTimeoutID = setTimeout(() => {
			if (!_finished && _autoFinishAllowed) {
				_finishReason = FINISH_REASON_HEARTBEAT_FAILED;
				span.end(endTimestamp);
			}
		}, childSpanTimeout);
	}
	function _pushActivity(spanId) {
		_cancelIdleTimeout();
		activities.set(spanId, true);
		_restartChildSpanTimeout(timestampInSeconds() + childSpanTimeout / 1e3);
	}
	function _popActivity(spanId) {
		if (activities.has(spanId)) activities.delete(spanId);
		if (activities.size === 0) {
			_restartIdleTimeout(timestampInSeconds() + idleTimeout / 1e3);
			_cancelChildSpanTimeout();
		}
	}
	function onIdleSpanEnded(endTimestamp) {
		_finished = true;
		activities.clear();
		_cleanupHooks.forEach((cleanup) => cleanup());
		_setSpanForScope(scope, previousActiveSpan);
		const spanJSON = spanToStaticSpanJSON(span);
		const { start_timestamp: startTimestamp } = spanJSON;
		if (!startTimestamp) return;
		if (!spanJSON.data["sentry.idle_span_finish_reason"]) span.setAttribute(Gm, _finishReason);
		const currentStatus = spanJSON.status;
		if (!currentStatus || currentStatus === "unknown") span.setStatus({ code: 1 });
		debug$2.log(`[Tracing] Idle span "${spanJSON.op}" finished`);
		const childSpans = getSpanDescendants(span).filter((child) => child !== span);
		let discardedSpans = 0;
		childSpans.forEach((childSpan) => {
			if (childSpan.isRecording()) {
				childSpan.setStatus({
					code: 2,
					message: "cancelled"
				});
				childSpan.end(endTimestamp);
				DEBUG_BUILD$5 && debug$2.log("[Tracing] Cancelling span since span ended early", JSON.stringify(childSpan, void 0, 2));
			}
			const { timestamp: childEndTimestamp = 0, start_timestamp: childStartTimestamp = 0 } = spanToStaticSpanJSON(childSpan);
			const spanStartedBeforeIdleSpanEnd = childStartTimestamp <= endTimestamp;
			const timeoutWithMarginOfError = (finalTimeout + idleTimeout) / 1e3;
			const spanEndedBeforeFinalTimeout = childEndTimestamp - childStartTimestamp <= timeoutWithMarginOfError;
			if (DEBUG_BUILD$5) {
				const stringifiedSpan = JSON.stringify(childSpan, void 0, 2);
				if (!spanStartedBeforeIdleSpanEnd) debug$2.log("[Tracing] Discarding span since it happened after idle span was finished", stringifiedSpan);
				else if (!spanEndedBeforeFinalTimeout) debug$2.log("[Tracing] Discarding span since it finished after idle span final timeout", stringifiedSpan);
			}
			if (!spanEndedBeforeFinalTimeout || !spanStartedBeforeIdleSpanEnd) {
				removeChildSpanFromSpan(span, childSpan);
				discardedSpans++;
			}
		});
		if (discardedSpans > 0) span.setAttribute("sentry.idle_span_discarded_spans", discardedSpans);
	}
	_cleanupHooks.push(client.on("spanStart", (startedSpan) => {
		if (_finished || startedSpan === span || !!spanToJSON(startedSpan).end_timestamp || startedSpan instanceof SentrySpan && startedSpan.isStandaloneSpan()) return;
		if (getSpanDescendants(span).includes(startedSpan)) _pushActivity(startedSpan.spanContext().spanId);
	}));
	_cleanupHooks.push(client.on("spanEnd", (endedSpan) => {
		if (_finished) return;
		_popActivity(endedSpan.spanContext().spanId);
	}));
	_cleanupHooks.push(client.on("idleSpanEnableAutoFinish", (spanToAllowAutoFinish) => {
		if (spanToAllowAutoFinish === span) {
			_autoFinishAllowed = true;
			_restartIdleTimeout();
			if (activities.size) _restartChildSpanTimeout();
		}
	}));
	if (!options.disableAutoFinish) _restartIdleTimeout();
	setTimeout(() => {
		if (!_finished) {
			span.setStatus({
				code: 2,
				message: "deadline_exceeded"
			});
			_finishReason = FINISH_REASON_FINAL_TIMEOUT;
			span.end();
		}
	}, finalTimeout);
	return span;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/debounce.js
function debounce$1(func, wait, options) {
	let callbackReturnValue;
	let timerId;
	let maxTimerId;
	const maxWait = options?.maxWait ? Math.max(options.maxWait, wait) : 0;
	const setTimeoutImpl = options?.setTimeoutImpl || setTimeout;
	function invokeFunc() {
		cancelTimers();
		callbackReturnValue = func();
		return callbackReturnValue;
	}
	function cancelTimers() {
		timerId !== void 0 && clearTimeout(timerId);
		maxTimerId !== void 0 && clearTimeout(maxTimerId);
		timerId = maxTimerId = void 0;
	}
	function flush() {
		if (timerId !== void 0 || maxTimerId !== void 0) return invokeFunc();
		return callbackReturnValue;
	}
	function debounced() {
		if (timerId) clearTimeout(timerId);
		timerId = setTimeoutImpl(invokeFunc, wait);
		if (maxWait && maxTimerId === void 0) maxTimerId = setTimeoutImpl(invokeFunc, maxWait);
		return callbackReturnValue;
	}
	debounced.cancel = cancelTimers;
	debounced.flush = flush;
	return debounced;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/tracing/bindScopeToEmitter.js
var ADD_LISTENER_METHODS = [
	"addListener",
	"on",
	"once",
	"prependListener",
	"prependOnceListener",
	"addEventListener"
];
var REMOVE_LISTENER_METHODS = [
	"removeListener",
	"off",
	"removeEventListener"
];
var SCOPE_BOUND_LISTENERS = /* @__PURE__ */ Symbol("SentryScopeBoundListeners");
var registeringWrapper;
function isReentrantWrapperRegistration(listener) {
	return registeringWrapper !== void 0 && (listener === registeringWrapper || listener.listener === registeringWrapper);
}
function bindScopeToEmitter(emitter, scope = getCurrentScope()) {
	const ee = emitter;
	if (getPatchMap(ee)) return emitter;
	createPatchMap(ee);
	for (const methodName of ADD_LISTENER_METHODS) {
		if (typeof ee[methodName] !== "function") continue;
		ee[methodName] = patchAddListener(ee, ee[methodName], scope);
	}
	for (const methodName of REMOVE_LISTENER_METHODS) {
		if (typeof ee[methodName] !== "function") continue;
		ee[methodName] = patchRemoveListener(ee, ee[methodName]);
	}
	if (typeof ee.removeAllListeners === "function") ee.removeAllListeners = patchRemoveAllListeners(ee, ee.removeAllListeners);
	return emitter;
}
function bindListenerToScope(listener, scope) {
	return function(...args) {
		return withScope(scope, () => listener.apply(this, args));
	};
}
function isBoundListener(listener) {
	return typeof listener === "function";
}
function patchAddListener(ee, original, scope) {
	return function(...args) {
		const event = args[0];
		const listener = args[1];
		const rest = args.slice(2);
		if (!isBoundListener(listener) || isReentrantWrapperRegistration(listener)) return original.apply(this, args);
		const map = getPatchMap(ee) || createPatchMap(ee);
		let listeners = map.get(event);
		if (!listeners) {
			listeners = /* @__PURE__ */ new WeakMap();
			map.set(event, listeners);
		}
		let boundListener = listeners.get(listener);
		if (!boundListener) {
			boundListener = bindListenerToScope(listener, scope);
			listeners.set(listener, boundListener);
		}
		const previous = registeringWrapper;
		registeringWrapper = boundListener;
		try {
			return original.call(this, event, boundListener, ...rest);
		} finally {
			registeringWrapper = previous;
		}
	};
}
function patchRemoveListener(ee, original) {
	return function(...args) {
		const event = args[0];
		const listener = args[1];
		const rest = args.slice(2);
		const boundListener = isBoundListener(listener) ? getPatchMap(ee)?.get(event)?.get(listener) : void 0;
		if (!boundListener) return original.apply(this, args);
		return original.call(this, event, boundListener, ...rest);
	};
}
function patchRemoveAllListeners(ee, original) {
	return function(...args) {
		const map = getPatchMap(ee);
		if (map) {
			if (args.length === 0) createPatchMap(ee);
			else {
				const event = args[0];
				map.delete(event);
			}
		}
		return original.apply(this, args);
	};
}
function createPatchMap(ee) {
	const map = /* @__PURE__ */ new Map();
	ee[SCOPE_BOUND_LISTENERS] = map;
	return map;
}
function getPatchMap(ee) {
	return ee[SCOPE_BOUND_LISTENERS];
}
// ../DnD helper/node_modules/@sentry/conventions/dist/op.mjs
var e$3 = "pageload";
var E$2 = "navigation";
var _$3 = "navigation.redirect";
var u$3 = "resource.other";
var s$3 = "browser.paint";
var S$2 = "browser.unload_event";
var d$3 = "browser.redirect";
var l$3 = "browser.dom_content_loaded_event";
var D$3 = "browser.load_event";
var L$2 = "browser.connect";
var p$3 = "browser.tls_ssl";
var P$3 = "browser.cache";
var m$3 = "browser.dns";
var M$1 = "browser.request";
var b$3 = "browser.response";
var W$1 = "ui.mount";
var v$3 = "ui.update";
var V$1 = "ui.unmount";
var h$3 = "ui.long_task";
var q$3 = "ui.long_animation_frame";
var H$2 = "ui.interaction.click";
var Q$1 = "ui.interaction.hover";
var k$3 = "ui.interaction.drag";
var K$1 = "ui.interaction.press";
var j$2 = "ui.webvital.lcp";
var J$1 = "ui.webvital.cls";
var F$2 = "ui.action.click";
var CE = "http.client";
var nE = "http.client.stream";
// ../DnD helper/node_modules/@sentry/core/build/esm/tracing/spans/spanNames.js
var PAGELOAD_SPAN_NAME_FALLBACK = "Pageload";
var NAVIGATION_SPAN_NAME_FALLBACK = "Navigation";
var UI_MOUNT_SPAN_NAME_FALLBACK = "Component mount";
var UI_UPDATE_SPAN_NAME_FALLBACK = "Component update";
var UI_UNMOUNT_SPAN_NAME_FALLBACK = "Component unmount";
var UI_LONG_TASK_SPAN_NAME_FALLBACK = "Main UI thread blocked";
var UI_INTERACTION_CLICK_SPAN_NAME_FALLBACK = "Click";
var UI_INTERACTION_HOVER_SPAN_NAME_FALLBACK = "Hover";
var UI_INTERACTION_DRAG_SPAN_NAME_FALLBACK = "Drag";
var UI_INTERACTION_PRESS_SPAN_NAME_FALLBACK = "Key press";
var BROWSER_NAVIGATION_TIMING_SPAN_NAMES = {
	[P$3]: "Cache lookup",
	[m$3]: "DNS lookup",
	[L$2]: "Connect",
	[p$3]: "TLS handshake",
	[d$3]: "Redirect",
	[M$1]: "Request",
	[b$3]: "Response",
	[S$2]: "Unload event",
	[l$3]: "DOMContentLoaded event",
	[D$3]: "Load event"
};
// ../DnD helper/node_modules/@sentry/core/build/esm/envelope.js
function _enhanceEventWithSdkInfo(event, newSdkInfo) {
	if (!newSdkInfo) return event;
	const eventSdkInfo = event.sdk || {};
	event.sdk = {
		...eventSdkInfo,
		name: eventSdkInfo.name || newSdkInfo.name,
		version: eventSdkInfo.version || newSdkInfo.version,
		integrations: [...event.sdk?.integrations || [], ...newSdkInfo.integrations || []],
		packages: [...event.sdk?.packages || [], ...newSdkInfo.packages || []],
		settings: event.sdk?.settings || newSdkInfo.settings ? {
			...event.sdk?.settings,
			...newSdkInfo.settings
		} : void 0
	};
	return event;
}
function createSessionEnvelope(session, dsn, metadata, tunnel) {
	const sdkInfo = getSdkMetadataForEnvelopeHeader(metadata);
	return createEnvelope({
		sent_at: new Date(safeDateNow()).toISOString(),
		...sdkInfo && { sdk: sdkInfo },
		...!!tunnel && dsn && { dsn: dsnToString(dsn) }
	}, ["aggregates" in session ? [{ type: "sessions" }, session] : [{ type: "session" }, session.toJSON()]]);
}
function createEventEnvelope(event, dsn, metadata, tunnel) {
	const sdkInfo = getSdkMetadataForEnvelopeHeader(metadata);
	const eventType = event.type && event.type !== "replay_event" ? event.type : "event";
	_enhanceEventWithSdkInfo(event, metadata?.sdk);
	const envelopeHeaders = createEventEnvelopeHeaders(event, sdkInfo, tunnel, dsn);
	delete event.sdkProcessingMetadata;
	return createEnvelope(envelopeHeaders, [[{ type: eventType }, event]]);
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/data-collection/filtering-snippets.js
var FILTERED_VALUE = "[Filtered]";
var SENSITIVE_KEY_SNIPPETS = [
	"auth",
	"token",
	"secret",
	"session",
	"password",
	"passwd",
	"pwd",
	"key",
	"jwt",
	"bearer",
	"sso",
	"saml",
	"csrf",
	"xsrf",
	"credentials",
	"sid",
	"identity",
	"set-cookie",
	"cookie"
];
var SENSITIVE_COOKIE_NAME_SNIPPETS = [
	".sid",
	"sessid",
	"remember",
	"oidc",
	"pkce",
	"nonce",
	"__secure-",
	"__host-",
	"awsalb",
	"awselb",
	"akamai",
	"__stripe",
	"cognito",
	"firebase",
	"supabase",
	"sb-",
	"mfa",
	"2fa"
];
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/data-collection/filterKeyValueData.js
function isSensitiveKey(lower, denySnippets) {
	return denySnippets.some((snippet) => lower.includes(snippet));
}
function shouldFilterDataKey(key, behavior, additionalDenyTerms) {
	if (behavior === false) return true;
	const lowerKey = key.toLowerCase();
	if (isSensitiveKey(lowerKey, additionalDenyTerms != null ? [...SENSITIVE_KEY_SNIPPETS, ...additionalDenyTerms] : SENSITIVE_KEY_SNIPPETS)) return true;
	if (behavior === true) return false;
	const matchesConfiguredTerm = ("deny" in behavior ? behavior.deny : behavior.allow).some((term) => lowerKey.includes(term.toLowerCase()));
	return "deny" in behavior ? matchesConfiguredTerm : !matchesConfiguredTerm;
}
function filterKeyValueData(data, behavior, additionalDenyTerms) {
	if (behavior === false) return {};
	const result = {};
	for (const key of Object.keys(data)) result[key] = shouldFilterDataKey(key, behavior, additionalDenyTerms) ? FILTERED_VALUE : data[key];
	return result;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/syncpromise.js
var STATE_PENDING = 0;
var STATE_RESOLVED = 1;
var STATE_REJECTED = 2;
function resolvedSyncPromise(value) {
	return new SyncPromise((resolve) => {
		resolve(value);
	});
}
function rejectedSyncPromise(reason) {
	return new SyncPromise((_, reject) => {
		reject(reason);
	});
}
var SyncPromise = class SyncPromise {
	constructor(executor) {
		this._state = STATE_PENDING;
		this._handlers = [];
		this._runExecutor(executor);
	}
	/** @inheritdoc */
	then(onfulfilled, onrejected) {
		return new SyncPromise((resolve, reject) => {
			this._handlers.push([
				false,
				(result) => {
					if (!onfulfilled) resolve(result);
					else try {
						resolve(onfulfilled(result));
					} catch (e) {
						reject(e);
					}
				},
				(reason) => {
					if (!onrejected) reject(reason);
					else try {
						resolve(onrejected(reason));
					} catch (e) {
						reject(e);
					}
				}
			]);
			this._executeHandlers();
		});
	}
	/** @inheritdoc */
	catch(onrejected) {
		return this.then((val) => val, onrejected);
	}
	/** @inheritdoc */
	finally(onfinally) {
		return new SyncPromise((resolve, reject) => {
			let val;
			let isRejected;
			return this.then((value) => {
				isRejected = false;
				val = value;
				if (onfinally) onfinally();
			}, (reason) => {
				isRejected = true;
				val = reason;
				if (onfinally) onfinally();
			}).then(() => {
				if (isRejected) {
					reject(val);
					return;
				}
				resolve(val);
			});
		});
	}
	/** Excute the resolve/reject handlers. */
	_executeHandlers() {
		if (this._state === STATE_PENDING) return;
		const cachedHandlers = this._handlers.slice();
		this._handlers = [];
		cachedHandlers.forEach((handler) => {
			if (handler[0]) return;
			if (this._state === STATE_RESOLVED) handler[1](this._value);
			if (this._state === STATE_REJECTED) handler[2](this._value);
			handler[0] = true;
		});
	}
	/** Run the executor for the SyncPromise. */
	_runExecutor(executor) {
		const setResult = (state, value) => {
			if (this._state !== STATE_PENDING) return;
			if (isThenable(value)) {
				value.then(resolve, reject);
				return;
			}
			this._state = state;
			this._value = value;
			this._executeHandlers();
		};
		const resolve = (value) => {
			setResult(STATE_RESOLVED, value);
		};
		const reject = (reason) => {
			setResult(STATE_REJECTED, reason);
		};
		try {
			executor(resolve, reject);
		} catch (e) {
			reject(e);
		}
	}
};
// ../DnD helper/node_modules/@sentry/core/build/esm/eventProcessors.js
function notifyEventProcessors(processors, event, hint, index = 0, onDrop) {
	try {
		const result = _notifyEventProcessors(event, hint, processors, index, onDrop);
		return isThenable(result) ? result : resolvedSyncPromise(result);
	} catch (error) {
		return rejectedSyncPromise(error);
	}
}
function _notifyEventProcessors(event, hint, processors, index, onDrop) {
	const processor = processors[index];
	if (!event || !processor) return event;
	const processorName = `Event processor "${processor.id || "?"}"`;
	let callbackError = false;
	const result = safeCallback(DEBUG_BUILD$5 ? `${processorName} threw an error, dropping event:` : "", () => processor({ ...event }, hint), () => {
		callbackError = true;
		return null;
	});
	DEBUG_BUILD$5 && result === null && debug$2.log(`${processorName} dropped event`);
	if (isThenable(result)) return result.then((final) => {
		if (!final) {
			onDrop?.(callbackError ? "callback_error" : "event_processor");
			return null;
		}
		return _notifyEventProcessors(final, hint, processors, index + 1, onDrop);
	});
	if (!result) {
		onDrop?.(callbackError ? "callback_error" : "event_processor");
		return null;
	}
	return _notifyEventProcessors(result, hint, processors, index + 1, onDrop);
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/debug-ids.js
var parsedStackResults;
var lastSentryKeysCount;
var lastNativeKeysCount;
var cachedFilenameDebugIds;
function getFilenameToDebugIdMap(stackParser) {
	const sentryDebugIdMap = GLOBAL_OBJ._sentryDebugIds;
	const nativeDebugIdMap = GLOBAL_OBJ._debugIds;
	if (!sentryDebugIdMap && !nativeDebugIdMap) return {};
	const sentryDebugIdKeys = sentryDebugIdMap ? Object.keys(sentryDebugIdMap) : [];
	const nativeDebugIdKeys = nativeDebugIdMap ? Object.keys(nativeDebugIdMap) : [];
	if (cachedFilenameDebugIds && sentryDebugIdKeys.length === lastSentryKeysCount && nativeDebugIdKeys.length === lastNativeKeysCount) return cachedFilenameDebugIds;
	lastSentryKeysCount = sentryDebugIdKeys.length;
	lastNativeKeysCount = nativeDebugIdKeys.length;
	cachedFilenameDebugIds = {};
	if (!parsedStackResults) parsedStackResults = {};
	const processDebugIds = (debugIdKeys, debugIdMap) => {
		for (const key of debugIdKeys) {
			const debugId = debugIdMap[key];
			const result = parsedStackResults?.[key];
			if (result && cachedFilenameDebugIds && debugId) {
				cachedFilenameDebugIds[result[0]] = debugId;
				if (parsedStackResults) parsedStackResults[key] = [result[0], debugId];
			} else if (debugId) {
				const parsedStack = stackParser(key);
				for (let i = parsedStack.length - 1; i >= 0; i--) {
					const filename = parsedStack[i]?.filename;
					if (filename && cachedFilenameDebugIds && parsedStackResults) {
						cachedFilenameDebugIds[filename] = debugId;
						parsedStackResults[key] = [filename, debugId];
						break;
					}
				}
			}
		}
	};
	if (sentryDebugIdMap) processDebugIds(sentryDebugIdKeys, sentryDebugIdMap);
	if (nativeDebugIdMap) processDebugIds(nativeDebugIdKeys, nativeDebugIdMap);
	return cachedFilenameDebugIds;
}
function getDebugImagesForResources(stackParser, resource_paths) {
	const filenameDebugIdMap = getFilenameToDebugIdMap(stackParser);
	if (!filenameDebugIdMap) return [];
	const images = [];
	for (const path of resource_paths) {
		const normalizedPath = normalizeStackTracePath(path);
		if (normalizedPath && filenameDebugIdMap[normalizedPath]) images.push({
			type: "sourcemap",
			code_file: path,
			debug_id: filenameDebugIdMap[normalizedPath]
		});
	}
	return images;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/eventUtils.js
function isInternalException(hint) {
	return hint.data?.__sentry__ === true;
}
function getPossibleEventMessages(event) {
	const possibleMessages = [];
	if (event.message) possibleMessages.push(event.message);
	try {
		const lastException = event.exception.values[event.exception.values.length - 1];
		if (lastException?.value) {
			possibleMessages.push(lastException.value);
			if (lastException.type) possibleMessages.push(`${lastException.type}: ${lastException.value}`);
		}
	} catch {}
	return possibleMessages;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/prepareEvent.js
function prepareEvent(options, event, hint, scope, client, isolationScope) {
	const { normalizeDepth = 3, normalizeMaxBreadth = 1e3 } = options;
	const prepared = {
		...event,
		event_id: event.event_id || hint.event_id || uuid4(),
		timestamp: event.timestamp || dateTimestampInSeconds()
	};
	const integrations = hint.integrations || options.integrations.map((i) => i.name);
	applyClientOptions(prepared, options);
	applyIntegrationsMetadata(prepared, integrations);
	if (client) client.emit("applyFrameMetadata", event);
	if (event.type === void 0) applyDebugIds(prepared, options.stackParser);
	const finalScope = getFinalScope(scope, hint.captureContext);
	if (hint.mechanism) addExceptionMechanismToCapturedException(prepared, hint.mechanism);
	const clientEventProcessors = client ? client.getEventProcessors() : [];
	const data = getCombinedScopeData(isolationScope, finalScope);
	const attachments = [...hint.attachments || [], ...data.attachments];
	if (attachments.length) hint.attachments = attachments;
	applyScopeDataToEvent(prepared, data);
	const span = getActiveSpan(finalScope);
	if (span) applySpanToEvent(prepared, span);
	applyEscapedErrorSpanToEvent(prepared, hint, finalScope);
	const eventProcessors = [...clientEventProcessors, ...data.eventProcessors];
	const isTransaction = event.type === "transaction";
	const spanCountBeforeProcessing = event.spans?.length || 0;
	return (isInternalException(hint) ? resolvedSyncPromise(prepared) : notifyEventProcessors(eventProcessors, prepared, hint, 0, (reason) => {
		if (!client) return;
		client.recordDroppedEvent(reason, getDataCategoryByType(event.type));
		if (isTransaction) client.recordDroppedEvent(reason, "span", 1 + spanCountBeforeProcessing);
	})).then((evt) => {
		if (!evt) return null;
		if (isTransaction && client) {
			const droppedSpanCount = spanCountBeforeProcessing - (evt.spans?.length || 0);
			if (droppedSpanCount > 0) client.recordDroppedEvent("event_processor", "span", droppedSpanCount);
		}
		applyDebugMeta(evt);
		if (typeof normalizeDepth === "number" && normalizeDepth > 0) return normalizeEvent(evt, normalizeDepth, normalizeMaxBreadth);
		return evt;
	});
}
function applyClientOptions(event, options) {
	const { environment, release, dist, maxValueLength } = options;
	event.environment = event.environment || environment || "production";
	if (!event.release && release) event.release = release;
	if (!event.dist && dist) event.dist = dist;
	const request = event.request;
	if (request?.url && maxValueLength) request.url = truncate(request.url, maxValueLength);
	if (maxValueLength) event.exception?.values?.forEach((exception) => {
		if (exception.value) exception.value = truncate(exception.value, maxValueLength);
	});
}
function applyDebugIds(event, stackParser) {
	const filenameDebugIdMap = getFilenameToDebugIdMap(stackParser);
	event.exception?.values?.forEach((exception) => {
		exception.stacktrace?.frames?.forEach((frame) => {
			if (frame.filename) frame.debug_id = filenameDebugIdMap[frame.filename];
		});
	});
}
function applyDebugMeta(event) {
	const filenameDebugIdMap = {};
	event.exception?.values?.forEach((exception) => {
		exception.stacktrace?.frames?.forEach((frame) => {
			if (frame.debug_id) {
				if (frame.abs_path) filenameDebugIdMap[frame.abs_path] = frame.debug_id;
				else if (frame.filename) filenameDebugIdMap[frame.filename] = frame.debug_id;
				delete frame.debug_id;
			}
		});
	});
	if (Object.keys(filenameDebugIdMap).length === 0) return;
	event.debug_meta = event.debug_meta || {};
	event.debug_meta.images = event.debug_meta.images || [];
	const images = event.debug_meta.images;
	Object.entries(filenameDebugIdMap).forEach(([filename, debug_id]) => {
		images.push({
			type: "sourcemap",
			code_file: filename,
			debug_id
		});
	});
}
function applyIntegrationsMetadata(event, integrationNames) {
	if (integrationNames.length > 0) {
		event.sdk = event.sdk || {};
		event.sdk.integrations = [...event.sdk.integrations || [], ...integrationNames];
	}
}
function normalizeEvent(event, depth, maxBreadth) {
	if (!event) return null;
	const normalized = {
		...event,
		...event.breadcrumbs && { breadcrumbs: event.breadcrumbs.map((b) => ({
			...b,
			...b.data && { data: normalize(b.data, depth, maxBreadth) }
		})) },
		...event.user && { user: normalize(event.user, depth, maxBreadth) },
		...event.contexts && { contexts: normalize(event.contexts, depth, maxBreadth) },
		...event.extra && { extra: normalize(event.extra, depth, maxBreadth) }
	};
	if (event.contexts?.trace && normalized.contexts) {
		normalized.contexts.trace = event.contexts.trace;
		if (event.contexts.trace.data) normalized.contexts.trace.data = normalize(event.contexts.trace.data, depth, maxBreadth);
	}
	if (event.spans) normalized.spans = event.spans.map((span) => {
		return {
			...span,
			...span.data && { data: normalize(span.data, depth, maxBreadth) }
		};
	});
	if (event.contexts?.flags && normalized.contexts) normalized.contexts.flags = normalize(event.contexts.flags, 3, maxBreadth);
	return normalized;
}
function getFinalScope(scope, captureContext) {
	if (!captureContext) return scope;
	const finalScope = scope ? scope.clone() : new Scope();
	finalScope.update(captureContext);
	return finalScope;
}
function parseEventHintOrCaptureContext(hint) {
	if (!hint) return;
	if (hintIsScopeOrFunction(hint)) return { captureContext: hint };
	if (hintIsScopeContext(hint)) return { captureContext: hint };
	return hint;
}
function hintIsScopeOrFunction(hint) {
	return hint instanceof Scope || typeof hint === "function";
}
var captureContextKeys = [
	"user",
	"level",
	"extra",
	"contexts",
	"tags",
	"fingerprint",
	"propagationContext"
];
function hintIsScopeContext(hint) {
	return Object.keys(hint).some((key) => captureContextKeys.includes(key));
}
// ../DnD helper/node_modules/@sentry/core/build/esm/exports.js
function captureException(exception, hint) {
	return getCurrentScope().captureException(exception, parseEventHintOrCaptureContext(hint));
}
function captureMessage(message, captureContext) {
	const level = typeof captureContext === "string" ? captureContext : void 0;
	const hint = typeof captureContext !== "string" ? { captureContext } : void 0;
	return getCurrentScope().captureMessage(message, level, hint);
}
function captureEvent(event, hint) {
	return getCurrentScope().captureEvent(event, hint);
}
function setContext(name, context) {
	getIsolationScope().setContext(name, context);
}
function setExtras(extras) {
	getIsolationScope().setExtras(extras);
}
function setExtra(key, extra) {
	getIsolationScope().setExtra(key, extra);
}
function setTags(tags) {
	getIsolationScope().setTags(tags);
}
function setTag(key, value) {
	getIsolationScope().setTag(key, value);
}
function setAttributes(attributes) {
	getIsolationScope().setAttributes(attributes);
}
function setAttribute(key, value) {
	getIsolationScope().setAttribute(key, value);
}
function setUser(user) {
	getIsolationScope().setUser(user);
}
function setConversationId(conversationId) {
	getIsolationScope().setConversationId(conversationId);
}
function lastEventId() {
	return getIsolationScope().lastEventId();
}
async function flush(timeout) {
	const client = getClient();
	if (client) return client.flush(timeout);
	DEBUG_BUILD$5 && debug$2.warn("Cannot flush events. No client defined.");
	return Promise.resolve(false);
}
async function close(timeout) {
	const scope = getCurrentScope();
	const client = scope.getClient();
	if (client) {
		const result = await client.close(timeout);
		if (scope.getClient() === client) scope.setClient(void 0);
		return result;
	}
	DEBUG_BUILD$5 && debug$2.warn("Cannot flush events and disable SDK. No client defined.");
	return Promise.resolve(false);
}
function isInitialized() {
	return !!getClient();
}
function isEnabled() {
	const client = getClient();
	return client?.getOptions().enabled !== false && !!client?.getTransport();
}
function addEventProcessor(callback) {
	getIsolationScope().addEventProcessor(callback);
}
function startSession(context) {
	const isolationScope = getIsolationScope();
	const { user } = getCombinedScopeData(isolationScope, getCurrentScope());
	let userAgent = GLOBAL_OBJ.navigator?.userAgent;
	if (userAgent) {
		const headerCollection = getClient()?.getDataCollectionOptions().httpHeaders.request ?? true;
		userAgent = filterKeyValueData({ "User-Agent": userAgent }, headerCollection)["User-Agent"];
	}
	const session = makeSession$1({
		user,
		userAgent,
		...context
	});
	const currentSession = isolationScope.getSession();
	if (currentSession?.status === "ok") updateSession(currentSession, { status: "exited" });
	endSession();
	isolationScope.setSession(session);
	return session;
}
function endSession() {
	const isolationScope = getIsolationScope();
	const session = getCurrentScope().getSession() || isolationScope.getSession();
	if (session) closeSession(session);
	_sendSessionUpdate();
	isolationScope.setSession();
}
function _sendSessionUpdate() {
	const isolationScope = getIsolationScope();
	const client = getClient();
	const session = isolationScope.getSession();
	if (session && client) client.captureSession(session);
}
function captureSession(end = false) {
	if (end) {
		endSession();
		return;
	}
	_sendSessionUpdate();
}
function getBaseApiEndpoint(dsn) {
	const protocol = dsn.protocol ? `${dsn.protocol}:` : "";
	const port = dsn.port ? `:${dsn.port}` : "";
	return `${protocol}//${dsn.host}${port}${dsn.path ? `/${dsn.path}` : ""}/api/`;
}
function _getIngestEndpoint(dsn) {
	return `${getBaseApiEndpoint(dsn)}${dsn.projectId}/envelope/`;
}
function _encodedAuth(dsn, sdkInfo) {
	const params = { sentry_version: "7" };
	if (dsn.publicKey) params.sentry_key = dsn.publicKey;
	if (sdkInfo) params.sentry_client = `${sdkInfo.name}/${sdkInfo.version}`;
	return new URLSearchParams(params).toString();
}
function getEnvelopeEndpointWithUrlEncodedAuth(dsn, tunnel, sdkInfo) {
	return tunnel ? tunnel : `${_getIngestEndpoint(dsn)}?${_encodedAuth(dsn, sdkInfo)}`;
}
function getReportDialogEndpoint(dsnLike, dialogOptions) {
	const dsn = makeDsn(dsnLike);
	if (!dsn) return "";
	const endpoint = `${getBaseApiEndpoint(dsn)}embed/error-page/`;
	let encodedOptions = `dsn=${dsnToString(dsn)}`;
	for (const key in dialogOptions) {
		if (key === "dsn") continue;
		if (key === "onClose" || key === "onError") continue;
		if (key === "user") {
			const user = dialogOptions.user;
			if (!user) continue;
			if (user.name) encodedOptions += `&name=${encodeURIComponent(user.name)}`;
			if (user.email) encodedOptions += `&email=${encodeURIComponent(user.email)}`;
		} else encodedOptions += `&${encodeURIComponent(key)}=${encodeURIComponent(dialogOptions[key])}`;
	}
	return `${endpoint}?${encodedOptions}`;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/timestampSequence.js
var _sequenceNumber = 0;
var _previousTimestampMs;
function getSequenceAttribute(timestampInSeconds) {
	const nowMs = Math.floor(timestampInSeconds * 1e3);
	if (_previousTimestampMs !== void 0 && nowMs !== _previousTimestampMs) _sequenceNumber = 0;
	const value = _sequenceNumber;
	_sequenceNumber++;
	_previousTimestampMs = nowMs;
	return {
		key: Cb,
		value: {
			value,
			type: "integer"
		}
	};
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/trace-info.js
function _getTraceInfoFromScope(client, scope) {
	if (!scope) return [void 0, void 0];
	return withScope(scope, () => {
		const span = getActiveSpan();
		const traceContext = span ? spanToTraceContext(span) : getTraceContextFromScope(scope);
		return [span ? getDynamicSamplingContextFromSpan(span) : getDynamicSamplingContextFromScope(client, scope), traceContext];
	});
}
// ../DnD helper/node_modules/@sentry/core/build/esm/logs/constants.js
var SEVERITY_TEXT_TO_SEVERITY_NUMBER = {
	trace: 1,
	debug: 5,
	info: 9,
	warn: 13,
	error: 17,
	fatal: 21
};
// ../DnD helper/node_modules/@sentry/core/build/esm/logs/envelope.js
function createLogContainerEnvelopeItem(items, inferUserData) {
	const inferSetting = inferUserData ? "auto" : "never";
	return [{
		type: "log",
		item_count: items.length,
		content_type: "application/vnd.sentry.items.log+json"
	}, {
		version: 2,
		...isBrowser() && { ingest_settings: {
			infer_ip: inferSetting,
			infer_user_agent: inferSetting
		} },
		items
	}];
}
function createLogEnvelope(logs, metadata, tunnel, dsn, inferUserData) {
	const headers = {};
	if (metadata?.sdk) headers.sdk = {
		name: metadata.sdk.name,
		version: metadata.sdk.version
	};
	if (!!tunnel && !!dsn) headers.dsn = dsnToString(dsn);
	return createEnvelope(headers, [createLogContainerEnvelopeItem(logs, inferUserData)]);
}
// ../DnD helper/node_modules/@sentry/core/build/esm/logs/internal.js
var MAX_LOG_BUFFER_SIZE = 100;
function setLogAttribute(logAttributes, key, value, setEvenIfPresent = true) {
	if (value && (!logAttributes[key] || setEvenIfPresent)) logAttributes[key] = value;
}
function _INTERNAL_captureSerializedLog(client, serializedLog) {
	const bufferMap = _getBufferMap$1();
	const logBuffer = _INTERNAL_getLogBuffer(client);
	if (logBuffer === void 0) bufferMap.set(client, [serializedLog]);
	else if (logBuffer.length >= MAX_LOG_BUFFER_SIZE) {
		_INTERNAL_flushLogsBuffer(client, logBuffer);
		bufferMap.set(client, [serializedLog]);
	} else bufferMap.set(client, [...logBuffer, serializedLog]);
}
function _INTERNAL_captureLog(beforeLog, currentScope = getCurrentScope(), captureSerializedLog = _INTERNAL_captureSerializedLog) {
	const client = currentScope?.getClient() ?? getClient();
	if (!client) {
		DEBUG_BUILD$5 && debug$2.warn("No client available to capture log.");
		return;
	}
	const { release, environment, beforeSendLog } = client.getOptions();
	const [, traceContext] = _getTraceInfoFromScope(client, currentScope);
	const processedLogAttributes = { ...beforeLog.attributes };
	const { user: { id, email, username }, attributes: scopeAttributes } = getCombinedScopeData(getIsolationScope(), currentScope);
	setLogAttribute(processedLogAttributes, dy, id, false);
	setLogAttribute(processedLogAttributes, ry, email, false);
	setLogAttribute(processedLogAttributes, by, username, false);
	setLogAttribute(processedLogAttributes, ub, release);
	setLogAttribute(processedLogAttributes, wm, environment);
	const { name, version } = client.getSdkMetadata()?.sdk ?? {};
	setLogAttribute(processedLogAttributes, yb, name);
	setLogAttribute(processedLogAttributes, _b, version);
	const replay = client.getIntegrationByName("Replay");
	const replayId = replay?.getReplayId(true);
	setLogAttribute(processedLogAttributes, db$1, replayId);
	if (replayId && replay?.getRecordingMode() === "buffer") setLogAttribute(processedLogAttributes, "sentry._internal.replay_is_buffering", true);
	const beforeLogMessage = beforeLog.message;
	if (isParameterizedString(beforeLogMessage)) {
		const { __sentry_template_string__, __sentry_template_values__ = [] } = beforeLogMessage;
		if (__sentry_template_values__?.length) processedLogAttributes[Vm] = __sentry_template_string__;
		__sentry_template_values__.forEach((param, index) => {
			processedLogAttributes[`sentry.message.parameter.${index}`] = param;
		});
	}
	setLogAttribute(processedLogAttributes, qb, getActiveSpan(currentScope)?.spanContext().spanId);
	const processedLog = {
		...beforeLog,
		attributes: processedLogAttributes
	};
	client.emit("beforeCaptureLog", processedLog);
	const log = beforeSendLog ? safeCallback(DEBUG_BUILD$5 ? "The `beforeSendLog` callback threw an error, dropping the log:" : "", () => consoleSandbox(() => beforeSendLog(processedLog)), () => CALLBACK_ERROR) : processedLog;
	if (log === CALLBACK_ERROR) {
		client.recordDroppedEvent("callback_error", "log_item", 1);
		return;
	}
	if (!log) {
		client.recordDroppedEvent("before_send", "log_item", 1);
		DEBUG_BUILD$5 && debug$2.warn("beforeSendLog returned null, log will not be captured.");
		return;
	}
	const { level, message, attributes: logAttributes = {}, severityNumber } = log;
	const timestamp = timestampInSeconds();
	const sequenceAttr = getSequenceAttribute(timestamp);
	captureSerializedLog(client, {
		timestamp,
		level,
		body: _removeLoneSurrogates(String(message)),
		trace_id: traceContext?.trace_id,
		severity_number: severityNumber ?? SEVERITY_TEXT_TO_SEVERITY_NUMBER[level],
		attributes: sanitizeLogAttributes({
			...serializeAttributes(scopeAttributes),
			...serializeAttributes(logAttributes, true),
			[sequenceAttr.key]: sequenceAttr.value
		})
	});
	client.emit("afterCaptureLog", log);
}
function _INTERNAL_flushLogsBuffer(client, maybeLogBuffer) {
	const logBuffer = maybeLogBuffer ?? _INTERNAL_getLogBuffer(client) ?? [];
	if (logBuffer.length === 0) return;
	const clientOptions = client.getOptions();
	const envelope = createLogEnvelope(logBuffer, clientOptions._metadata, clientOptions.tunnel, client.getDsn(), client.getDataCollectionOptions().userInfo);
	_getBufferMap$1().set(client, []);
	client.emit("flushLogs");
	client.sendEnvelope(envelope);
}
function _INTERNAL_getLogBuffer(client) {
	return _getBufferMap$1().get(client);
}
function _getBufferMap$1() {
	return getGlobalSingleton("clientToLogBufferMap", () => /* @__PURE__ */ new WeakMap());
}
function sanitizeLogAttributes(attributes) {
	const sanitized = {};
	for (const [key, attr] of Object.entries(attributes)) {
		const sanitizedKey = _removeLoneSurrogates(key);
		if (attr.type === "string") sanitized[sanitizedKey] = {
			...attr,
			value: _removeLoneSurrogates(attr.value)
		};
		else sanitized[sanitizedKey] = attr;
	}
	return sanitized;
}
function _removeLoneSurrogates(str) {
	const strObj = Object(str);
	const isWellFormed = strObj["isWellFormed"];
	const toWellFormed = strObj["toWellFormed"];
	if (typeof isWellFormed === "function" && typeof toWellFormed === "function") return isWellFormed.call(str) ? str : toWellFormed.call(str);
	return str;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/metrics/envelope.js
function createMetricContainerEnvelopeItem(items, inferUserData) {
	const inferSetting = inferUserData ? "auto" : "never";
	return [{
		type: "trace_metric",
		item_count: items.length,
		content_type: "application/vnd.sentry.items.trace-metric+json"
	}, {
		version: 2,
		...isBrowser() && { ingest_settings: {
			infer_ip: inferSetting,
			infer_user_agent: inferSetting
		} },
		items
	}];
}
function createMetricEnvelope(metrics, metadata, tunnel, dsn, inferUserData) {
	const headers = {};
	if (metadata?.sdk) headers.sdk = {
		name: metadata.sdk.name,
		version: metadata.sdk.version
	};
	if (!!tunnel && !!dsn) headers.dsn = dsnToString(dsn);
	return createEnvelope(headers, [createMetricContainerEnvelopeItem(metrics, inferUserData)]);
}
// ../DnD helper/node_modules/@sentry/core/build/esm/metrics/internal.js
var MAX_METRIC_BUFFER_SIZE = 1e3;
function setMetricAttribute(metricAttributes, key, value, setEvenIfPresent = true) {
	if (value && (setEvenIfPresent || !(key in metricAttributes))) metricAttributes[key] = value;
}
function _INTERNAL_captureSerializedMetric(client, serializedMetric) {
	const bufferMap = _getBufferMap();
	const metricBuffer = _INTERNAL_getMetricBuffer(client);
	if (metricBuffer === void 0) bufferMap.set(client, [serializedMetric]);
	else if (metricBuffer.length >= MAX_METRIC_BUFFER_SIZE) {
		_INTERNAL_flushMetricsBuffer(client, metricBuffer);
		bufferMap.set(client, [serializedMetric]);
	} else bufferMap.set(client, [...metricBuffer, serializedMetric]);
}
function _enrichMetricAttributes(beforeMetric, client, user) {
	const { release, environment } = client.getOptions();
	const processedMetricAttributes = { ...beforeMetric.attributes };
	setMetricAttribute(processedMetricAttributes, dy, user.id, false);
	setMetricAttribute(processedMetricAttributes, ry, user.email, false);
	setMetricAttribute(processedMetricAttributes, by, user.username, false);
	setMetricAttribute(processedMetricAttributes, ub, release);
	setMetricAttribute(processedMetricAttributes, wm, environment);
	const { name, version } = client.getSdkMetadata()?.sdk ?? {};
	setMetricAttribute(processedMetricAttributes, yb, name);
	setMetricAttribute(processedMetricAttributes, _b, version);
	const replay = client.getIntegrationByName("Replay");
	const replayId = replay?.getReplayId(true);
	setMetricAttribute(processedMetricAttributes, db$1, replayId);
	if (replayId && replay?.getRecordingMode() === "buffer") setMetricAttribute(processedMetricAttributes, "sentry._internal.replay_is_buffering", true);
	return {
		...beforeMetric,
		attributes: processedMetricAttributes
	};
}
function _buildSerializedMetric(metric, client, currentScope, scopeAttributes) {
	const [, traceContext] = _getTraceInfoFromScope(client, currentScope);
	const span = getActiveSpan(currentScope);
	const traceId = span ? span.spanContext().traceId : traceContext?.trace_id;
	const spanId = span ? span.spanContext().spanId : void 0;
	const timestamp = timestampInSeconds();
	const sequenceAttr = getSequenceAttribute(timestamp);
	return {
		timestamp,
		trace_id: traceId ?? "",
		span_id: spanId,
		name: metric.name,
		type: metric.type,
		unit: metric.unit,
		value: metric.value,
		attributes: {
			...serializeAttributes(scopeAttributes),
			...serializeAttributes(metric.attributes, "skip-undefined"),
			[sequenceAttr.key]: sequenceAttr.value
		}
	};
}
function _INTERNAL_captureMetric(beforeMetric, options) {
	const currentScope = options?.scope ?? getCurrentScope();
	const captureSerializedMetric = options?.captureSerializedMetric ?? _INTERNAL_captureSerializedMetric;
	const client = currentScope?.getClient() ?? getClient();
	if (!client) {
		DEBUG_BUILD$5 && debug$2.warn("No client available to capture metric.");
		return;
	}
	const { beforeSendMetric } = client.getOptions();
	const { user, attributes: scopeAttributes } = getCombinedScopeData(getIsolationScope(), currentScope);
	const enrichedMetric = _enrichMetricAttributes(beforeMetric, client, user);
	client.emit("processMetric", enrichedMetric);
	const processedMetric = beforeSendMetric ? safeCallback(DEBUG_BUILD$5 ? "The `beforeSendMetric` callback threw an error, dropping the metric:" : "", () => beforeSendMetric(enrichedMetric), () => CALLBACK_ERROR) : enrichedMetric;
	if (processedMetric === CALLBACK_ERROR) {
		client.recordDroppedEvent("callback_error", "trace_metric", 1);
		return;
	}
	if (!processedMetric) {
		client.recordDroppedEvent("before_send", "trace_metric", 1);
		DEBUG_BUILD$5 && debug$2.log("`beforeSendMetric` returned `null`, will not send metric.");
		return;
	}
	const serializedMetric = _buildSerializedMetric(processedMetric, client, currentScope, scopeAttributes);
	DEBUG_BUILD$5 && debug$2.log("[Metric]", serializedMetric);
	captureSerializedMetric(client, serializedMetric);
	client.emit("afterCaptureMetric", processedMetric);
}
function _INTERNAL_flushMetricsBuffer(client, maybeMetricBuffer) {
	const metricBuffer = maybeMetricBuffer ?? _INTERNAL_getMetricBuffer(client) ?? [];
	if (metricBuffer.length === 0) return;
	const clientOptions = client.getOptions();
	const envelope = createMetricEnvelope(metricBuffer, clientOptions._metadata, clientOptions.tunnel, client.getDsn(), client.getDataCollectionOptions().userInfo);
	_getBufferMap().set(client, []);
	client.emit("flushMetrics");
	client.sendEnvelope(envelope);
}
function _INTERNAL_getMetricBuffer(client) {
	return _getBufferMap().get(client);
}
function _getBufferMap() {
	return getGlobalSingleton("clientToMetricBufferMap", () => /* @__PURE__ */ new WeakMap());
}
// ../DnD helper/node_modules/@sentry/core/build/esm/tracing/spans/extractGenAiSpans.js
function extractGenAiSpansFromEvent(event, client) {
	if (event.type !== "transaction" || !event.spans?.length || !event.sdkProcessingMetadata?.hasGenAiSpans || hasSpanStreamingEnabled(client)) return;
	const genAiSpans = [];
	const remainingSpans = [];
	for (const span of event.spans) if (span.op?.startsWith("gen_ai.")) genAiSpans.push(spanJsonToSerializedStreamedSpan(span));
	else remainingSpans.push(span);
	if (genAiSpans.length === 0) return;
	event.spans = remainingSpans;
	return createSpanContainerItem(genAiSpans, client);
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/promisebuffer.js
var SENTRY_BUFFER_FULL_ERROR = /* @__PURE__ */ Symbol.for("SentryBufferFullError");
function makePromiseBuffer(limit = 100) {
	const buffer = /* @__PURE__ */ new Set();
	function isReady() {
		return buffer.size < limit;
	}
	function remove(task) {
		buffer.delete(task);
	}
	function add(taskProducer) {
		if (!isReady()) return rejectedSyncPromise(SENTRY_BUFFER_FULL_ERROR);
		const task = taskProducer();
		buffer.add(task);
		task.then(() => remove(task), () => remove(task));
		return task;
	}
	function drain(timeout) {
		if (!buffer.size) return resolvedSyncPromise(true);
		const drainPromise = Promise.allSettled(Array.from(buffer)).then(() => true);
		if (!timeout) return drainPromise;
		const promises = [drainPromise, new Promise((resolve) => safeUnref(setTimeout(() => resolve(false), timeout)))];
		return Promise.race(promises);
	}
	return {
		get $() {
			return Array.from(buffer);
		},
		add,
		drain
	};
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/ratelimit.js
var DEFAULT_RETRY_AFTER = 6e4;
function parseRetryAfterHeader(header, now = safeDateNow()) {
	const headerDelay = parseInt(`${header}`, 10);
	if (!isNaN(headerDelay)) return headerDelay * 1e3;
	const headerDate = Date.parse(`${header}`);
	if (!isNaN(headerDate)) return headerDate - now;
	return DEFAULT_RETRY_AFTER;
}
function disabledUntil(limits, dataCategory) {
	return limits[dataCategory] || limits.all || 0;
}
function isRateLimited(limits, dataCategory, now = safeDateNow()) {
	return disabledUntil(limits, dataCategory) > now;
}
function updateRateLimits(limits, { statusCode, headers }, now = safeDateNow()) {
	const updatedRateLimits = { ...limits };
	const rateLimitHeader = headers?.["x-sentry-rate-limits"];
	const retryAfterHeader = headers?.["retry-after"];
	if (rateLimitHeader) for (const limit of rateLimitHeader.trim().split(",")) {
		const [retryAfter, categories, , , namespaces] = limit.split(":", 5);
		const headerDelay = parseInt(retryAfter, 10);
		const delay = (!isNaN(headerDelay) ? headerDelay : 60) * 1e3;
		if (!categories) updatedRateLimits.all = now + delay;
		else for (const category of categories.split(";")) if (category === "metric_bucket") {
			if (!namespaces || namespaces.split(";").includes("custom")) updatedRateLimits[category] = now + delay;
		} else updatedRateLimits[category] = now + delay;
	}
	else if (retryAfterHeader) updatedRateLimits.all = now + parseRetryAfterHeader(retryAfterHeader, now);
	else if (statusCode === 429) updatedRateLimits.all = now + 6e4;
	return updatedRateLimits;
}
function createTransport(options, makeRequest, buffer = makePromiseBuffer(options.bufferSize || 64)) {
	let rateLimits = {};
	const flush = (timeout) => buffer.drain(timeout);
	function recordItemLoss(reason, [headers, payload], type) {
		const dataCategory = envelopeItemTypeToDataCategory(type);
		if (type === "transaction") options.recordDroppedEvent(reason, "span", (payload.spans?.length ?? 0) + 1);
		options.recordDroppedEvent(reason, dataCategory, typeof headers.item_count === "number" ? headers.item_count : 1);
	}
	function send(envelope) {
		const filteredEnvelopeItems = [];
		forEachEnvelopeItem(envelope, (item, type) => {
			if (isRateLimited(rateLimits, envelopeItemTypeToDataCategory(type))) recordItemLoss("ratelimit_backoff", item, type);
			else filteredEnvelopeItems.push(item);
		});
		if (filteredEnvelopeItems.length === 0) return Promise.resolve({});
		const filteredEnvelope = createEnvelope(envelope[0], filteredEnvelopeItems);
		const recordEnvelopeLoss = (reason) => {
			if (envelopeContainsItemType(filteredEnvelope, ["client_report"])) {
				DEBUG_BUILD$5 && debug$2.warn(`Dropping client report. Will not send outcomes (reason: ${reason}).`);
				return;
			}
			forEachEnvelopeItem(filteredEnvelope, (item, type) => {
				recordItemLoss(reason, item, type);
			});
		};
		const requestTask = () => makeRequest({ body: serializeEnvelope(filteredEnvelope) }).then((response) => {
			if (response.statusCode === 413) {
				DEBUG_BUILD$5 && debug$2.error("Sentry responded with status code 413. Envelope was discarded due to exceeding size limits.");
				recordEnvelopeLoss("send_error");
				return response;
			}
			if (DEBUG_BUILD$5 && response.statusCode !== void 0 && (response.statusCode < 200 || response.statusCode >= 300)) debug$2.warn(`Sentry responded with status code ${response.statusCode} to sent event.`);
			rateLimits = updateRateLimits(rateLimits, response);
			return response;
		}, (error) => {
			recordEnvelopeLoss("network_error");
			DEBUG_BUILD$5 && debug$2.error("Encountered error running transport request:", error);
			throw error;
		});
		return buffer.add(requestTask).then((result) => result, (error) => {
			if (error === SENTRY_BUFFER_FULL_ERROR) {
				DEBUG_BUILD$5 && debug$2.error("Skipped sending event because buffer is full.");
				recordEnvelopeLoss("queue_overflow");
				return Promise.resolve({});
			} else throw error;
		});
	}
	return {
		send,
		flush
	};
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/clientreport.js
function createClientReportEnvelope(discarded_events, dsn, timestamp) {
	const clientReportItem = [{ type: "client_report" }, {
		timestamp: timestamp || dateTimestampInSeconds(),
		discarded_events
	}];
	return createEnvelope(dsn ? { dsn } : {}, [clientReportItem]);
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/transactionEvent.js
function convertTransactionEventToSpanJson(event) {
	const { trace_id, parent_span_id, span_id, status, origin, data, op, links } = event.contexts?.trace ?? {};
	return {
		data: data ?? {},
		description: event.transaction,
		op,
		parent_span_id,
		span_id: span_id ?? "",
		start_timestamp: event.start_timestamp ?? 0,
		status: status ?? "ok",
		timestamp: event.timestamp,
		trace_id: trace_id ?? "",
		origin,
		links,
		profile_id: data?.[lb],
		exclusive_time: data?.[Cm],
		measurements: event.measurements,
		is_segment: true
	};
}
function convertSpanJsonToTransactionEvent(span) {
	return {
		type: "transaction",
		timestamp: span.timestamp,
		start_timestamp: span.start_timestamp,
		transaction: span.description,
		contexts: { trace: {
			trace_id: span.trace_id,
			span_id: span.span_id,
			parent_span_id: span.parent_span_id,
			op: span.op,
			status: span.status,
			origin: span.origin,
			links: span.links,
			data: {
				...span.data,
				...span.profile_id && { ["sentry.profile_id"]: span.profile_id },
				...span.exclusive_time && { ["sentry.exclusive_time"]: span.exclusive_time }
			}
		} },
		measurements: span.measurements
	};
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/warnAboutIgnoredTransactionOptions.js
function maybeWarnAboutIgnoredTransactionOptions(options) {
	if (options.traceLifecycle !== "stream" || !(options.beforeSendTransaction || options.ignoreTransactions?.length)) return;
	consoleSandbox(() => {
		console.warn("[Sentry] `beforeSendTransaction` and `ignoreTransactions` are ignored with `traceLifecycle: 'stream'` (enabled by default). Use `beforeSendSpan` and `ignoreSpans` instead, or set `traceLifecycle: 'static'`.");
	});
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/data-collection/resolveDataCollectionOptions.js
var DEFAULTS = {
	userInfo: true,
	cookies: true,
	httpHeaders: {
		request: true,
		response: true
	},
	httpBodies: [
		"incomingRequest",
		"outgoingRequest",
		"incomingResponse",
		"outgoingResponse"
	],
	urlQueryParams: true,
	graphQL: {
		document: true,
		variables: true
	},
	genAI: {
		inputs: true,
		outputs: true
	},
	mcp: {
		inputs: true,
		outputs: true
	},
	databaseQueryData: true,
	queues: true,
	stackFrameVariables: true,
	frameContextLines: 5
};
function isCollectBehavior(value) {
	return typeof value === "boolean" || "allow" in value || "deny" in value;
}
function resolveHttpHeaders(httpHeaders) {
	if (httpHeaders === void 0) return { ...DEFAULTS.httpHeaders };
	if (isCollectBehavior(httpHeaders)) return {
		request: httpHeaders,
		response: httpHeaders
	};
	return {
		request: httpHeaders.request ?? DEFAULTS.httpHeaders.request,
		response: httpHeaders.response ?? DEFAULTS.httpHeaders.response
	};
}
function resolveDataCollectionOptions(options) {
	const dc = options.dataCollection ?? {};
	return {
		userInfo: dc.userInfo ?? DEFAULTS.userInfo,
		cookies: dc.cookies ?? DEFAULTS.cookies,
		httpHeaders: resolveHttpHeaders(dc.httpHeaders),
		httpBodies: dc.httpBodies ?? DEFAULTS.httpBodies,
		urlQueryParams: dc.urlQueryParams ?? DEFAULTS.urlQueryParams,
		graphQL: {
			document: dc.graphQL?.document ?? DEFAULTS.graphQL.document,
			variables: dc.graphQL?.variables ?? DEFAULTS.graphQL.variables
		},
		genAI: {
			inputs: dc.genAI?.inputs ?? DEFAULTS.genAI.inputs,
			outputs: dc.genAI?.outputs ?? DEFAULTS.genAI.outputs
		},
		mcp: {
			inputs: dc.mcp?.inputs ?? DEFAULTS.mcp.inputs,
			outputs: dc.mcp?.outputs ?? DEFAULTS.mcp.outputs
		},
		databaseQueryData: dc.databaseQueryData ?? DEFAULTS.databaseQueryData,
		queues: dc.queues ?? DEFAULTS.queues,
		stackFrameVariables: dc.stackFrameVariables ?? DEFAULTS.stackFrameVariables,
		frameContextLines: dc.frameContextLines ?? DEFAULTS.frameContextLines
	};
}
// ../DnD helper/node_modules/@sentry/core/build/esm/client.js
var ALREADY_SEEN_ERROR = "Not capturing exception because it's already been captured.";
var MISSING_RELEASE_FOR_SESSION_ERROR = "Discarded session because of missing or non-string release";
var INTERNAL_ERROR_SYMBOL = /* @__PURE__ */ Symbol.for("SentryInternalError");
var DO_NOT_SEND_EVENT_SYMBOL = /* @__PURE__ */ Symbol.for("SentryDoNotSendEventError");
var DEFAULT_FLUSH_INTERVAL = 5e3;
var CLOSED_CLIENT_SYMBOL = /* @__PURE__ */ Symbol.for("SentryClosedClient");
function isClientClosed(client) {
	return CLOSED_CLIENT_SYMBOL in client;
}
function _makeInternalError(message) {
	return {
		message,
		[INTERNAL_ERROR_SYMBOL]: true
	};
}
function _makeDoNotSendEventError(message) {
	return {
		message,
		[DO_NOT_SEND_EVENT_SYMBOL]: true
	};
}
function _makeSampledOutError(sampleRate) {
	return _makeDoNotSendEventError(`Discarding event because it's not included in the random sample (sampling rate = ${sampleRate})`);
}
function _isInternalError(error) {
	return isObjectLike(error) && INTERNAL_ERROR_SYMBOL in error;
}
function _isDoNotSendEventError(error) {
	return isObjectLike(error) && DO_NOT_SEND_EVENT_SYMBOL in error;
}
function setupWeightBasedFlushing(client, afterCaptureHook, flushHook, estimateSizeFn, flushFn) {
	let weight = 0;
	let flushTimeout;
	let isTimerActive = false;
	client.on(flushHook, () => {
		weight = 0;
		clearTimeout(flushTimeout);
		isTimerActive = false;
	});
	client.on(afterCaptureHook, (item) => {
		weight += estimateSizeFn(item);
		if (weight >= 8e5) flushFn(client);
		else if (!isTimerActive) {
			const flushInterval = client.getOptions()._flushInterval ?? DEFAULT_FLUSH_INTERVAL;
			if (flushInterval > 0) {
				isTimerActive = true;
				flushTimeout = safeUnref(setTimeout(() => {
					flushFn(client);
				}, flushInterval));
			}
		}
	});
	client.on("flush", () => {
		flushFn(client);
	});
}
var Client = class {
	/**
	* Initializes this client instance.
	*
	* @param options Options for the client.
	*/
	constructor(options) {
		this._options = {
			attachStacktrace: true,
			...options,
			traceLifecycle: options.traceLifecycle === "static" ? "static" : "stream"
		};
		this._integrations = {};
		this._numProcessing = 0;
		this._outcomes = {};
		this._hooks = {};
		this._eventProcessors = [];
		this._promiseBuffer = makePromiseBuffer(options.transportOptions?.bufferSize ?? 64);
		this._dataCollection = resolveDataCollectionOptions(options);
		this._unhandledSessionStatus = "crashed";
		this._attachStacktraceIsDefault = options.attachStacktrace === void 0;
		if (options.dsn) this._dsn = makeDsn(options.dsn);
		else DEBUG_BUILD$5 && debug$2.warn("No DSN provided, client will not send events.");
		const { beforeSendSpan, traceLifecycle } = this._options;
		if (DEBUG_BUILD$5 && beforeSendSpan && isStaticBeforeSendSpanCallback(beforeSendSpan) !== (traceLifecycle === "static")) consoleSandbox(() => {
			console.warn(`Ignoring \`beforeSendSpan\`: ${traceLifecycle === "static" ? "wrap it with" : "remove"} \`Sentry.withStaticSpan\` to use it with \`traceLifecycle: "${traceLifecycle}"\`.`);
		});
		if (this._dsn) {
			const url = getEnvelopeEndpointWithUrlEncodedAuth(this._dsn, options.tunnel, options._metadata ? options._metadata.sdk : void 0);
			this._transport = options.transport({
				tunnel: this._options.tunnel,
				recordDroppedEvent: this.recordDroppedEvent.bind(this),
				...options.transportOptions,
				url
			});
		}
		setupWeightBasedFlushing(this, "afterCaptureLog", "flushLogs", estimateLogSizeInBytes, _INTERNAL_flushLogsBuffer);
		setupWeightBasedFlushing(this, "afterCaptureMetric", "flushMetrics", estimateMetricSizeInBytes, _INTERNAL_flushMetricsBuffer);
	}
	/**
	* Captures an exception event and sends it to Sentry.
	*
	* Unlike `captureException` exported from every SDK, this method requires that you pass it the current scope.
	*/
	captureException(exception, hint, scope) {
		const eventId = uuid4();
		if (checkOrSetAlreadyCaught(exception)) {
			DEBUG_BUILD$5 && debug$2.log(ALREADY_SEEN_ERROR);
			return eventId;
		}
		const hintWithEventId = {
			event_id: eventId,
			...hint
		};
		this._process(() => this.eventFromException(exception, hintWithEventId).then((event) => this._captureEvent(event, hintWithEventId, scope)).then((res) => res), "error");
		return hintWithEventId.event_id;
	}
	/**
	* Captures a message event and sends it to Sentry.
	*
	* Unlike `captureMessage` exported from every SDK, this method requires that you pass it the current scope.
	*/
	captureMessage(message, level, hint, currentScope) {
		const hintWithEventId = {
			event_id: uuid4(),
			...hint
		};
		const eventMessage = isParameterizedString(message) ? message : String(message);
		const isMessage = isPrimitive(message);
		const promisedEvent = isMessage ? this.eventFromMessage(eventMessage, level, hintWithEventId).then((event) => {
			if (event.exception && this._attachStacktraceIsDefault) event.sdkProcessingMetadata = {
				...event.sdkProcessingMetadata,
				hasDefaultSyntheticStacktrace: true
			};
			return event;
		}) : this.eventFromException(message, hintWithEventId);
		this._process(() => promisedEvent.then((event) => this._captureEvent(event, hintWithEventId, currentScope)), isMessage ? "unknown" : "error");
		return hintWithEventId.event_id;
	}
	/**
	* Captures a manually created event and sends it to Sentry.
	*
	* Unlike `captureEvent` exported from every SDK, this method requires that you pass it the current scope.
	*/
	captureEvent(event, hint, currentScope) {
		const eventId = uuid4();
		if (hint?.originalException && checkOrSetAlreadyCaught(hint.originalException)) {
			DEBUG_BUILD$5 && debug$2.log(ALREADY_SEEN_ERROR);
			return eventId;
		}
		const hintWithEventId = {
			event_id: eventId,
			...hint
		};
		const sdkProcessingMetadata = event.sdkProcessingMetadata || {};
		const capturedSpanScope = sdkProcessingMetadata.capturedSpanScope;
		const capturedSpanIsolationScope = sdkProcessingMetadata.capturedSpanIsolationScope;
		const dataCategory = getDataCategoryByType(event.type);
		this._process(() => this._captureEvent(event, hintWithEventId, capturedSpanScope || currentScope, capturedSpanIsolationScope), dataCategory);
		return hintWithEventId.event_id;
	}
	/**
	* Captures a session.
	*/
	captureSession(session) {
		this.sendSession(session);
		updateSession(session, { init: false });
	}
	/**
	* Get the current Dsn.
	*/
	getDsn() {
		return this._dsn;
	}
	/**
	* Get the current options.
	*/
	getOptions() {
		return this._options;
	}
	/**
	* Get the resolved data collection configuration.
	*/
	getDataCollectionOptions() {
		return this._dataCollection;
	}
	/**
	* Get the SDK metadata.
	* @see SdkMetadata
	*/
	getSdkMetadata() {
		return this._options._metadata;
	}
	/**
	* Returns the transport that is used by the client.
	* Please note that the transport gets lazy initialized so it will only be there once the first event has been sent.
	*/
	getTransport() {
		return this._transport;
	}
	/**
	* Wait for all events to be sent or the timeout to expire, whichever comes first.
	*
	* @param timeout Maximum time in ms the client should wait for events to be flushed. Omitting this parameter will
	*   cause the client to wait until all events are sent before resolving the promise.
	* @returns A promise that will resolve with `true` if all events are sent before the timeout, or `false` if there are
	* still events in the queue when the timeout is reached.
	*/
	async flush(timeout) {
		const transport = this._transport;
		this.emit("flush");
		if (!transport) return true;
		const clientFinished = await this._isClientDoneProcessing(timeout);
		const transportFlushed = await transport.flush(timeout);
		return clientFinished && transportFlushed;
	}
	/**
	* Flush the event queue and set the client to `enabled = false`. See {@link Client.flush}.
	*
	* @param {number} timeout Maximum time in ms the client should wait before shutting down. Omitting this parameter will cause
	*   the client to wait until all events are sent before disabling itself.
	* @returns {Promise<boolean>} A promise which resolves to `true` if the flush completes successfully before the timeout, or `false` if
	* it doesn't.
	*/
	async close(timeout) {
		Object.defineProperty(this, CLOSED_CLIENT_SYMBOL, { value: true });
		const result = await this.flush(timeout);
		this.getOptions().enabled = false;
		this.emit("close");
		return result;
	}
	/**
	* Get all installed event processors.
	*/
	getEventProcessors() {
		return this._eventProcessors;
	}
	/**
	* Adds an event processor that applies to any event processed by this client.
	*/
	addEventProcessor(eventProcessor) {
		this._eventProcessors.push(eventProcessor);
	}
	/**
	* Initialize this client.
	* Call this after the client was set on a scope.
	*/
	init() {
		if (this._isEnabled() || this._options.integrations.some(({ name }) => name.startsWith("Spotlight"))) {
			this._setupIntegrations();
			maybeWarnAboutIgnoredTransactionOptions(this._options);
		}
	}
	/**
	* Gets an installed integration by its name.
	*
	* @returns {Integration|undefined} The installed integration or `undefined` if no integration with that `name` was installed.
	*/
	getIntegrationByName(integrationName) {
		return this._integrations[integrationName];
	}
	/**
	* Returns the names of all installed integrations.
	*/
	getIntegrationNames() {
		return Object.keys(this._integrations);
	}
	/**
	* Add an integration to the client.
	* This can be used to e.g. lazy load integrations.
	* In most cases, this should not be necessary,
	* and you're better off just passing the integrations via `integrations: []` at initialization time.
	* However, if you find the need to conditionally load & add an integration, you can use `addIntegration` to do so.
	*/
	addIntegration(integration) {
		const isAlreadyInstalled = this._integrations[integration.name];
		if (!isAlreadyInstalled && integration.beforeSetup) integration.beforeSetup(this);
		setupIntegration(this, integration, this._integrations);
		if (!isAlreadyInstalled) afterSetupIntegrations(this, [integration]);
	}
	/**
	* Send a fully prepared event to Sentry.
	*/
	sendEvent(event, hint = {}) {
		this.emit("beforeSendEvent", event, hint);
		const genAiSpanItem = extractGenAiSpansFromEvent(event, this);
		let env = createEventEnvelope(event, this._dsn, this._options._metadata, this._options.tunnel);
		if (!isInternalException(hint)) for (const attachment of hint.attachments || []) env = addItemToEnvelope(env, createAttachmentEnvelopeItem(attachment));
		if (genAiSpanItem) env = addItemToEnvelope(env, genAiSpanItem);
		this.sendEnvelope(env).then((sendResponse) => this.emit("afterSendEvent", event, sendResponse));
	}
	/**
	* Send a session or session aggregrates to Sentry.
	*/
	sendSession(session) {
		const { release: clientReleaseOption, environment: clientEnvironmentOption = DEFAULT_ENVIRONMENT } = this._options;
		if ("aggregates" in session) {
			const sessionAttrs = session.attrs || {};
			if (!sessionAttrs.release && !clientReleaseOption) {
				DEBUG_BUILD$5 && debug$2.warn(MISSING_RELEASE_FOR_SESSION_ERROR);
				return;
			}
			sessionAttrs.release = sessionAttrs.release || clientReleaseOption;
			sessionAttrs.environment = sessionAttrs.environment || clientEnvironmentOption;
			session.attrs = sessionAttrs;
		} else {
			if (!session.release && !clientReleaseOption) {
				DEBUG_BUILD$5 && debug$2.warn(MISSING_RELEASE_FOR_SESSION_ERROR);
				return;
			}
			session.release = session.release || clientReleaseOption;
			session.environment = session.environment || clientEnvironmentOption;
		}
		this.emit("beforeSendSession", session);
		const env = createSessionEnvelope(session, this._dsn, this._options._metadata, this._options.tunnel);
		this.sendEnvelope(env);
	}
	/**
	* Record on the client that an event got dropped (ie, an event that will not be sent to Sentry).
	*/
	recordDroppedEvent(reason, category, count = 1) {
		if (this._options.sendClientReports) {
			const key = `${reason}:${category}`;
			DEBUG_BUILD$5 && debug$2.log(`Recording outcome: "${key}"${count > 1 ? ` (${count} times)` : ""}`);
			this._outcomes[key] = (this._outcomes[key] || 0) + count;
		}
	}
	/**
	* Register a hook on this client.
	*/
	on(hook, callback) {
		const hookCallbacks = this._hooks[hook] = this._hooks[hook] || /* @__PURE__ */ new Set();
		const uniqueCallback = (...args) => callback(...args);
		hookCallbacks.add(uniqueCallback);
		return () => {
			hookCallbacks.delete(uniqueCallback);
		};
	}
	/**
	* Emit a hook that was previously registered via `on()`.
	*/
	emit(hook, ...rest) {
		const callbacks = this._hooks[hook];
		if (callbacks) callbacks.forEach((callback) => callback(...rest));
	}
	/**
	* Send an envelope to Sentry.
	*/
	async sendEnvelope(envelope) {
		this.emit("beforeEnvelope", envelope);
		if (this._isEnabled() && this._transport) try {
			const result = await this._transport.send(envelope);
			this.emit("afterEnvelope", envelope);
			return result;
		} catch (reason) {
			DEBUG_BUILD$5 && debug$2.error("Error while sending envelope:", reason);
			return {};
		}
		DEBUG_BUILD$5 && debug$2.error("Transport disabled");
		return {};
	}
	/**
	* Register a cleanup function to be called when the client is disposed.
	* This is useful for integrations that need to clean up global state.
	*
	* NOTE: This is a no-op in the base `Client` class. Subclasses like `ServerRuntimeClient`
	* override this method to actually register and execute cleanup callbacks.
	*/
	registerCleanup(callback) {}
	/**
	* Disposes of the client and releases all resources.
	*
	* Subclasses should override this method to clean up their own resources, including invoking
	* any callbacks registered via {@link Client.registerCleanup}. The base implementation is a
	* no-op and does NOT execute registered cleanup callbacks.
	*
	* After calling dispose(), the client should not be used anymore.
	*/
	dispose() {}
	/** Setup integrations for this client. */
	_setupIntegrations() {
		const { integrations } = this._options;
		this._integrations = setupIntegrations(this, integrations);
		afterSetupIntegrations(this, integrations);
	}
	/** Updates existing session based on the provided event */
	_updateSessionFromEvent(session, event) {
		let unhandled = event.level === "fatal";
		let errored = false;
		const exceptions = event.exception?.values;
		if (exceptions) {
			errored = true;
			unhandled = false;
			for (const ex of exceptions) if (ex.mechanism?.handled === false) {
				unhandled = true;
				break;
			}
		}
		const sessionNonTerminal = session.status === "ok";
		if (sessionNonTerminal && session.errors === 0 || sessionNonTerminal && unhandled) {
			updateSession(session, {
				...unhandled && { status: this._unhandledSessionStatus },
				errors: session.errors || Number(errored || unhandled)
			});
			this.captureSession(session);
		}
	}
	/**
	* Determine if the client is finished processing. Returns a promise because it will wait `timeout` ms before saying
	* "no" (resolving to `false`) in order to give the client a chance to potentially finish first.
	*
	* @param timeout The time, in ms, after which to resolve to `false` if the client is still busy. Passing `0` (or not
	* passing anything) will make the promise wait as long as it takes for processing to finish before resolving to
	* `true`.
	* @returns A promise which will resolve to `true` if processing is already done or finishes before the timeout, and
	* `false` otherwise
	*/
	async _isClientDoneProcessing(timeout) {
		let ticked = 0;
		while (!timeout || ticked < timeout) {
			await new Promise((resolve) => setTimeout(resolve, 1));
			if (!this._numProcessing) return true;
			ticked++;
		}
		return false;
	}
	/** Determines whether this SDK is enabled and a transport is present. */
	_isEnabled() {
		return this.getOptions().enabled !== false && this._transport !== void 0;
	}
	/**
	* Adds common information to events.
	*
	* The information includes release and environment from `options`,
	* breadcrumbs and context (extra, tags and user) from the scope.
	*
	* Information that is already present in the event is never overwritten. For
	* nested objects, such as the context, keys are merged.
	*
	* @param event The original event.
	* @param hint May contain additional information about the original exception.
	* @param currentScope A scope containing event metadata.
	* @returns A new event with more information.
	*/
	_prepareEvent(event, hint, currentScope, isolationScope) {
		const options = this.getOptions();
		const integrations = this.getIntegrationNames();
		if (!hint.integrations && integrations.length) hint.integrations = integrations;
		this.emit("preprocessEvent", event, hint);
		if (!event.type) isolationScope.setLastEventId(event.event_id || hint.event_id);
		return prepareEvent(options, event, hint, currentScope, this, isolationScope).then((evt) => {
			if (evt === null) return evt;
			this.emit("postprocessEvent", evt, hint);
			evt.contexts = {
				trace: {
					...evt.contexts?.trace,
					...getTraceContextFromScope(currentScope)
				},
				...evt.contexts
			};
			evt.sdkProcessingMetadata = {
				dynamicSamplingContext: getDynamicSamplingContextFromScope(this, currentScope),
				...evt.sdkProcessingMetadata
			};
			return evt;
		});
	}
	/**
	* Processes the event and logs an error in case of rejection
	* @param event
	* @param hint
	* @param scope
	*/
	_captureEvent(event, hint = {}, currentScope = getCurrentScope(), isolationScope = getIsolationScope()) {
		if (DEBUG_BUILD$5 && isErrorEvent$1(event)) debug$2.log(`Captured error event \`${getPossibleEventMessages(event)[0] || "<unknown>"}\``);
		return this._processEvent(event, hint, currentScope, isolationScope).then((finalEvent) => {
			return finalEvent.event_id;
		}, (reason) => {
			if (DEBUG_BUILD$5) {
				if (_isDoNotSendEventError(reason)) debug$2.log(reason.message);
				else if (_isInternalError(reason)) debug$2.warn(reason.message);
				else debug$2.warn(reason);
			}
		});
	}
	/**
	* Processes an event (either error or message) and sends it to Sentry.
	*
	* This also adds breadcrumbs and context information to the event. However,
	* platform specific meta data (such as the User's IP address) must be added
	* by the SDK implementor.
	*
	*
	* @param event The event to send to Sentry.
	* @param hint May contain additional information about the original exception.
	* @param currentScope A scope containing event metadata.
	* @returns A SyncPromise that resolves with the event or rejects in case event was/will not be send.
	*/
	_processEvent(event, hint, currentScope, isolationScope) {
		const options = this.getOptions();
		const { sampleRate } = options;
		const isTransaction = isTransactionEvent$1(event);
		const isError = isErrorEvent$1(event);
		const beforeSendLabel = `before send for type \`${event.type || "error"}\``;
		let beforeSendDropReason = "before_send";
		let ignoredSpanCount = 0;
		const parsedSampleRate = typeof sampleRate === "undefined" ? void 0 : parseSampleRate(sampleRate);
		const isSampledOut = isError && typeof parsedSampleRate === "number" && safeMathRandom() > parsedSampleRate;
		const dataCategory = getDataCategoryByType(event.type);
		let preparedSpanCount = 0;
		const session = currentScope.getSession() || isolationScope.getSession();
		if (isSampledOut && session?.status !== "ok") {
			this.recordDroppedEvent("sample_rate", "error");
			return rejectedSyncPromise(_makeSampledOutError(sampleRate));
		}
		return this._prepareEvent(event, hint, currentScope, isolationScope).then((prepared) => {
			if (prepared === null) throw _makeDoNotSendEventError("An event processor returned `null`, will not send event.");
			preparedSpanCount = prepared.spans?.length || 0;
			if (isInternalException(hint)) return prepared;
			return processBeforeSend(options, prepared, hint, (reason) => {
				beforeSendDropReason = reason;
			}, (count) => {
				ignoredSpanCount = count;
			});
		}).then((processedEvent) => {
			if (ignoredSpanCount) this.recordDroppedEvent("ignored", "span", ignoredSpanCount);
			if (!isPlainObject(processedEvent) || processedEvent === null) {
				this.recordDroppedEvent(beforeSendDropReason, dataCategory);
				if (isTransaction) this.recordDroppedEvent(beforeSendDropReason, "span", 1 + preparedSpanCount - ignoredSpanCount);
				if (processedEvent !== null) throw _makeInternalError(`${beforeSendLabel} must return \`null\` or a valid event.`);
				throw _makeDoNotSendEventError(`${beforeSendDropReason === "ignored" ? "Transaction matched `ignoreSpans`" : `${beforeSendLabel} ${beforeSendDropReason === "callback_error" ? "threw an error" : "returned `null`"}`}, will not send event.`);
			}
			if (isError && session) this._updateSessionFromEvent(session, processedEvent);
			if (isSampledOut) {
				this.recordDroppedEvent("sample_rate", "error");
				throw _makeSampledOutError(sampleRate);
			}
			if (isTransaction) {
				const droppedSpanCount = preparedSpanCount - ignoredSpanCount - (processedEvent.spans?.length || 0);
				if (droppedSpanCount > 0) this.recordDroppedEvent("before_send", "span", droppedSpanCount);
			}
			const transactionInfo = processedEvent.transaction_info;
			if (isTransaction && transactionInfo && processedEvent.transaction !== event.transaction) {
				const source = "custom";
				processedEvent.transaction_info = {
					...transactionInfo,
					source
				};
			}
			this.sendEvent(processedEvent, hint);
			return processedEvent;
		}).then(null, (reason) => {
			if (_isDoNotSendEventError(reason) || _isInternalError(reason)) throw reason;
			this.captureException(reason, {
				mechanism: {
					handled: false,
					type: "internal"
				},
				data: { __sentry__: true },
				originalException: reason
			});
			throw _makeInternalError(`Event processing pipeline threw an error, original event will not be sent. Details have been sent as a new event.
Reason: ${reason}`);
		});
	}
	/**
	* Occupies the client with processing and event
	*/
	_process(taskProducer, dataCategory) {
		this._numProcessing++;
		this._promiseBuffer.add(taskProducer).then((value) => {
			this._numProcessing--;
			return value;
		}, (reason) => {
			this._numProcessing--;
			if (reason === SENTRY_BUFFER_FULL_ERROR) this.recordDroppedEvent("queue_overflow", dataCategory);
			return reason;
		});
	}
	/**
	* Clears outcomes on this client and returns them.
	*/
	_clearOutcomes() {
		const outcomes = this._outcomes;
		this._outcomes = {};
		return Object.entries(outcomes).map(([key, quantity]) => {
			const [reason, category] = key.split(":");
			return {
				reason,
				category,
				quantity
			};
		});
	}
	/**
	* Sends client reports as an envelope.
	*/
	_flushOutcomes() {
		DEBUG_BUILD$5 && debug$2.log("Flushing outcomes...");
		const outcomes = this._clearOutcomes();
		if (outcomes.length === 0) {
			DEBUG_BUILD$5 && debug$2.log("No outcomes to send");
			return;
		}
		if (!this._dsn) {
			DEBUG_BUILD$5 && debug$2.log("No dsn provided, will not send outcomes");
			return;
		}
		DEBUG_BUILD$5 && debug$2.log("Sending outcomes:", outcomes);
		const envelope = createClientReportEnvelope(outcomes, this._options.tunnel && dsnToString(this._dsn));
		this.sendEnvelope(envelope);
	}
};
function processBeforeSend(options, event, hint, onDrop, onIgnoredSpans) {
	const { beforeSend, ignoreSpans, beforeSendTransaction } = options;
	const beforeSendSpan = isStaticBeforeSendSpanCallback(options.beforeSendSpan) && options.beforeSendSpan;
	let processedEvent = event;
	if (isErrorEvent$1(processedEvent) && beforeSend) {
		const errorEvent = processedEvent;
		return safeCallback(DEBUG_BUILD$5 ? "The `beforeSend` callback threw an error, dropping the event:" : "", () => beforeSend(errorEvent, hint), () => {
			onDrop("callback_error");
			return null;
		});
	}
	if (isTransactionEvent$1(processedEvent)) {
		if (beforeSendSpan || ignoreSpans) {
			const rootSpanJson = convertTransactionEventToSpanJson(processedEvent);
			if (ignoreSpans?.length && shouldIgnoreSpan({
				description: rootSpanJson.description,
				op: rootSpanJson.op,
				attributes: rootSpanJson.data
			}, ignoreSpans)) {
				onDrop("ignored");
				return null;
			}
			if (beforeSendSpan) processedEvent = merge(event, convertSpanJsonToTransactionEvent(applyBeforeSendSpanCallback(rootSpanJson, beforeSendSpan)));
			if (processedEvent.spans) {
				const processedSpans = [];
				const initialSpans = processedEvent.spans;
				for (const span of initialSpans) {
					if (ignoreSpans?.length && shouldIgnoreSpan({
						description: span.description,
						op: span.op,
						attributes: span.data
					}, ignoreSpans)) {
						reparentChildSpans(initialSpans, span);
						continue;
					}
					if (beforeSendSpan) processedSpans.push(applyBeforeSendSpanCallback(span, beforeSendSpan));
					else processedSpans.push(span);
				}
				onIgnoredSpans(initialSpans.length - processedSpans.length);
				processedEvent.spans = processedSpans;
			}
		}
		if (beforeSendTransaction) return safeCallback(DEBUG_BUILD$5 ? "The `beforeSendTransaction` callback threw an error, dropping the event:" : "", () => beforeSendTransaction(processedEvent, hint), () => {
			onDrop("callback_error");
			return null;
		});
	}
	return processedEvent;
}
function isErrorEvent$1(event) {
	return event.type === void 0;
}
function isTransactionEvent$1(event) {
	return event.type === "transaction";
}
function estimateMetricSizeInBytes(metric) {
	let weight = 0;
	if (metric.name) weight += metric.name.length * 2;
	weight += 8;
	return weight + estimateAttributesSizeInBytes(metric.attributes);
}
function estimateLogSizeInBytes(log) {
	let weight = 0;
	if (log.message) weight += log.message.length * 2;
	return weight + estimateAttributesSizeInBytes(log.attributes);
}
function estimateAttributesSizeInBytes(attributes) {
	if (!attributes) return 0;
	let weight = 0;
	Object.values(attributes).forEach((value) => {
		if (Array.isArray(value)) weight += value.length * estimatePrimitiveSizeInBytes(value[0]);
		else if (isPrimitive(value)) weight += estimatePrimitiveSizeInBytes(value);
		else weight += 100;
	});
	return weight;
}
function estimatePrimitiveSizeInBytes(value) {
	if (typeof value === "string") return value.length * 2;
	else if (typeof value === "number") return 8;
	else if (typeof value === "boolean") return 4;
	return 0;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/sdk.js
function initAndBind(clientClass, options) {
	if (options.debug === true) {
		if (DEBUG_BUILD$5) debug$2.enable();
		else consoleSandbox(() => {
			console.warn("[Sentry] Cannot initialize SDK with `debug` option using a non-debug bundle.");
		});
	}
	warnIfClientIsActive();
	getCurrentScope().update(options.initialScope);
	const client = new clientClass(options);
	setCurrentClient(client);
	client.init();
	return client;
}
function getActiveClient() {
	const client = getClient();
	return client && !isClientClosed(client) ? client : void 0;
}
function warnIfClientIsActive() {
	if (getActiveClient()) consoleSandbox(() => {
		console.warn("[Sentry] `Sentry.init()` was called more than once. The new client replaces the active client, but the active client is not closed, so state from both can mix. Call `Sentry.init()` only once, or call `await Sentry.close()` before you call it again.");
	});
}
function setCurrentClient(client) {
	getCurrentScope().setClient(client);
}
var START_DELAY = 5e3;
var MAX_DELAY = 36e5;
function makeOfflineTransport(createTransport) {
	function log(...args) {
		DEBUG_BUILD$5 && debug$2.log("[Offline]:", ...args);
	}
	return (options) => {
		const transport = createTransport(options);
		if (!options.createStore) throw new Error("No `createStore` function was provided");
		const store = options.createStore(options);
		let retryDelay = START_DELAY;
		let flushTimer;
		function shouldQueue(env, error, retryDelay2) {
			if (envelopeContainsItemType(env, ["client_report"])) return false;
			if (options.shouldStore) return options.shouldStore(env, error, retryDelay2);
			return true;
		}
		function flushIn(delay) {
			if (flushTimer) clearTimeout(flushTimer);
			flushTimer = safeUnref(setTimeout(async () => {
				flushTimer = void 0;
				const found = await store.shift();
				if (found) {
					log("Attempting to send previously queued event");
					found[0].sent_at = new Date(safeDateNow()).toISOString();
					send(found, true).catch((e) => {
						log("Failed to retry sending", e);
					});
				}
			}, delay));
		}
		function flushWithBackOff() {
			if (flushTimer) return;
			flushIn(retryDelay);
			retryDelay = Math.min(retryDelay * 2, MAX_DELAY);
		}
		async function send(envelope, isRetry = false) {
			if (!isRetry && envelopeContainsItemType(envelope, ["replay_event", "replay_recording"])) {
				await store.push(envelope);
				flushIn(100);
				return {};
			}
			try {
				if (options.shouldSend) {
					const decision = options.shouldSend(envelope);
					if ((isThenable(decision) ? await decision : decision) === false) throw new Error("Envelope not sent because `shouldSend` callback returned false");
				}
				const result = await transport.send(envelope);
				let delay = 100;
				if (result) {
					if (result.headers?.["retry-after"]) delay = parseRetryAfterHeader(result.headers["retry-after"]);
					else if (result.headers?.["x-sentry-rate-limits"]) delay = 6e4;
					else if ((result.statusCode || 0) >= 400) return result;
				}
				flushIn(delay);
				retryDelay = START_DELAY;
				return result;
			} catch (e) {
				const decision = shouldQueue(envelope, e, retryDelay);
				if (isThenable(decision) ? await decision : decision) {
					if (isRetry) await store.unshift(envelope);
					else await store.push(envelope);
					flushWithBackOff();
					log("Error sending. Event queued.", e);
					return {};
				} else throw e;
			}
		}
		if (options.flushAtStartup) flushWithBackOff();
		return {
			send,
			flush: (timeout) => {
				if (timeout === void 0) {
					retryDelay = START_DELAY;
					flushIn(100);
				}
				return transport.flush(timeout);
			}
		};
	};
}
// ../DnD helper/node_modules/@sentry/core/build/esm/transports/multiplexed.js
var MULTIPLEXED_TRANSPORT_EXTRA_KEY = "MULTIPLEXED_TRANSPORT_EXTRA_KEY";
function eventFromEnvelope(env, types) {
	let event;
	forEachEnvelopeItem(env, (item, type) => {
		if (types.includes(type)) event = Array.isArray(item) ? item[1] : void 0;
		return !!event;
	});
	return event;
}
function makeOverrideReleaseTransport(createTransport, release) {
	return (options) => {
		const transport = createTransport(options);
		return {
			...transport,
			send: async (envelope) => {
				const event = eventFromEnvelope(envelope, [
					"event",
					"transaction",
					"profile",
					"replay_event"
				]);
				if (event) event.release = release;
				return transport.send(envelope);
			}
		};
	};
}
function overrideDsn(envelope, dsn) {
	return createEnvelope(dsn ? {
		...envelope[0],
		dsn
	} : envelope[0], envelope[1]);
}
function makeMultiplexedTransport(createTransport, matcher) {
	return (options) => {
		const fallbackTransport = createTransport(options);
		const otherTransports = /* @__PURE__ */ new Map();
		const actualMatcher = matcher || ((args) => {
			const event = args.getEvent();
			if (event?.extra?.["MULTIPLEXED_TRANSPORT_EXTRA_KEY"] && Array.isArray(event.extra["MULTIPLEXED_TRANSPORT_EXTRA_KEY"])) return event.extra["MULTIPLEXED_TRANSPORT_EXTRA_KEY"];
			return [];
		});
		function getTransport(dsn, release) {
			const key = release ? `${dsn}:${release}` : dsn;
			let transport = otherTransports.get(key);
			if (!transport) {
				const validatedDsn = dsnFromString(dsn);
				if (!validatedDsn) return;
				const url = getEnvelopeEndpointWithUrlEncodedAuth(validatedDsn, options.tunnel);
				transport = release ? makeOverrideReleaseTransport(createTransport, release)({
					...options,
					url
				}) : createTransport({
					...options,
					url
				});
				otherTransports.set(key, transport);
			}
			return [dsn, transport];
		}
		async function send(envelope) {
			function getEvent(types) {
				return eventFromEnvelope(envelope, types?.length ? types : ["event"]);
			}
			const transports = actualMatcher({
				envelope,
				getEvent
			}).map((result) => {
				if (typeof result === "string") return getTransport(result, void 0);
				else return getTransport(result.dsn, result.release);
			}).filter((t) => !!t);
			const transportsWithFallback = transports.length ? transports : [["", fallbackTransport]];
			return (await Promise.all(transportsWithFallback.map(([dsn, transport]) => transport.send(overrideDsn(envelope, dsn)))))[0];
		}
		async function flush(timeout) {
			const allTransports = [...otherTransports.values(), fallbackTransport];
			return (await Promise.all(allTransports.map((transport) => transport.flush(timeout)))).every((r) => r);
		}
		return {
			send,
			flush
		};
	};
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/cookie.js
function parseCookieHeader(value, headerName) {
	return (Array.isArray(value) ? value : [value]).flatMap((headerValue) => {
		if (typeof headerValue !== "string") return [];
		return headerName === "set-cookie" ? splitJoinedSetCookieHeader(headerValue).map((cookie) => cookie.split(";")[0]) : headerValue.split(";");
	}).map((segment) => segment.trim()).filter((segment) => segment !== "" && segment !== "=").map((segment) => {
		const equalSignIndex = segment.indexOf("=");
		return equalSignIndex === -1 ? ["", segment] : [segment.slice(0, equalSignIndex).trim(), segment.slice(equalSignIndex + 1).trim()];
	});
}
function splitJoinedSetCookieHeader(headerValue) {
	return headerValue.split(/,(?=[^;=,]*=)/);
}
function cookiePairsToRecord(pairs) {
	const record = {};
	for (const [name, value] of pairs) if (record[name] === void 0) record[name] = name === "" ? FILTERED_VALUE : decodeCookieValue(value);
	return record;
}
function decodeCookieValue(value) {
	const unquoted = value.length > 1 && value.startsWith("\"") && value.endsWith("\"") ? value.slice(1, -1) : value;
	try {
		return unquoted.indexOf("%") !== -1 ? decodeURIComponent(unquoted) : unquoted;
	} catch {
		return unquoted;
	}
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/data-collection/filterCookies.js
function filterCookies(cookieString, behavior, headerName) {
	if (behavior === false) return {};
	return filterKeyValueData(cookiePairsToRecord(parseCookieHeader(cookieString, headerName)), behavior, SENSITIVE_COOKIE_NAME_SNIPPETS);
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/data-collection/filterQueryParams.js
function filterQueryParams(queryString, behavior) {
	if (!queryString || behavior === false) return;
	return queryString.split("&").map((pair) => {
		const separatorIndex = pair.indexOf("=");
		const encodedKey = separatorIndex === -1 ? pair : pair.slice(0, separatorIndex);
		const key = new URLSearchParams(`${encodedKey}=`).keys().next().value;
		return key !== void 0 && shouldFilterDataKey(key, behavior) ? `${encodedKey}=${FILTERED_VALUE}` : pair;
	}).join("&");
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/data-collection/filterUrlQuery.js
function filterUrlQuery(url, behavior) {
	const fragmentStart = url.indexOf("#");
	const queryEnd = fragmentStart === -1 ? url.length : fragmentStart;
	const queryStart = url.indexOf("?");
	if (queryStart === -1 || queryStart > queryEnd) return url;
	const prefix = url.slice(0, queryStart);
	const query = url.slice(queryStart + 1, queryEnd);
	const suffix = url.slice(queryEnd);
	const filtered = filterQueryParams(query, behavior);
	return filtered ? `${prefix}?${filtered}${suffix}` : `${prefix}${suffix}`;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/data-collection/filterCollectedUrl.js
function urlQueryParamsBehavior(client) {
	return (client ?? getClient())?.getDataCollectionOptions().urlQueryParams ?? true;
}
function filterCollectedUrl(url, client) {
	return url === void 0 ? void 0 : filterUrlQuery(url, urlQueryParamsBehavior(client));
}
function filterCollectedUrlQuery(query, client) {
	return query ? filterQueryParams(query, urlQueryParamsBehavior(client)) : void 0;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/url.js
var DEFAULT_BASE_URL = "thismessage:/";
function isURLObjectRelative(url) {
	return "isRelative" in url;
}
function parseStringToURLObject(url, urlBase) {
	const isRelative = url.indexOf("://") <= 0 && url.indexOf("//") !== 0;
	const base = urlBase ?? (isRelative ? DEFAULT_BASE_URL : void 0);
	try {
		if ("canParse" in URL && !URL.canParse(url, base)) return;
		const fullUrlObject = new URL(url, base);
		if (isRelative) return {
			isRelative,
			pathname: fullUrlObject.pathname,
			search: fullUrlObject.search,
			hash: fullUrlObject.hash
		};
		return fullUrlObject;
	} catch {}
}
function getSanitizedUrlStringFromUrlObject(url) {
	if (isURLObjectRelative(url)) return url.pathname;
	const newUrl = new URL(url);
	newUrl.search = "";
	newUrl.hash = "";
	if (["80", "443"].includes(newUrl.port)) newUrl.port = "";
	if (newUrl.password) newUrl.password = "%filtered%";
	if (newUrl.username) newUrl.username = "%filtered%";
	return newUrl.toString();
}
function getUrlQuery(query) {
	return query?.replace(/^\?/, "") || void 0;
}
function getUrlFragment(fragment) {
	return fragment?.replace(/^#/, "") || void 0;
}
function getUrlDomain(url, base) {
	try {
		return new URL(url, base).hostname || void 0;
	} catch {
		return;
	}
}
function parseUrl(url) {
	if (!url) return {};
	const match = url.match(/^(([^:/?#]+):)?(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?$/);
	if (!match) return {};
	const query = match[6] || "";
	const fragment = match[8] || "";
	return {
		host: match[4],
		path: match[5],
		protocol: match[2],
		search: query,
		hash: fragment,
		relative: match[5] + query + fragment
	};
}
function stripUrlQueryAndFragment(urlPath) {
	return urlPath.split(/[?#]/, 1)[0];
}
function stripDataUrlContent(url, includeDataPrefix = true) {
	if (url.startsWith("data:")) {
		const match = url.match(/^data:([^;,]+)/);
		const mimeType = match ? match[1] : "text/plain";
		const isBase64 = url.includes(";base64,");
		const dataStart = url.indexOf(",");
		let dataPrefix = "";
		if (includeDataPrefix && dataStart !== -1) {
			const data = url.slice(dataStart + 1);
			dataPrefix = data.length > 10 ? `${data.slice(0, 10)}... [truncated]` : data;
		}
		return `data:${mimeType}${isBase64 ? ",base64" : ""}${dataPrefix ? `,${dataPrefix}` : ""}`;
	}
	return url;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/isSentryRequestUrl.js
function isSentryRequestUrl(url, client) {
	const dsn = client?.getDsn();
	const tunnel = client?.getOptions().tunnel;
	return checkDsn(url, dsn) || checkTunnel(url, tunnel);
}
function checkTunnel(url, tunnel) {
	if (!tunnel) return false;
	return removeTrailingSlash(url) === removeTrailingSlash(tunnel);
}
function checkDsn(url, dsn) {
	const urlParts = parseStringToURLObject(url);
	if (!urlParts || isURLObjectRelative(urlParts)) return false;
	if (!dsn) return false;
	return hostnameMatchesDsnHost(urlParts.hostname, dsn.host) && /(^|&|\?)sentry_key=/.test(urlParts.search);
}
function hostnameMatchesDsnHost(hostname, dsnHost) {
	return hostname === dsnHost || dsnHost.length > 0 && hostname.endsWith(`.${dsnHost}`);
}
function removeTrailingSlash(str) {
	return str[str.length - 1] === "/" ? str.slice(0, -1) : str;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/parameterize.js
function parameterize(strings, ...values) {
	const cooked = strings.map((str, i) => str ?? strings.raw[i]);
	const formatted = new String(String.raw({ raw: cooked }, ...values));
	formatted.__sentry_template_string__ = cooked.join("\0").replace(/%/g, "%%").replace(/\0/g, "%s");
	formatted.__sentry_template_values__ = values;
	return formatted;
}
var fmt = parameterize;
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/tunnel.js
function getTunnelPath(dsn) {
	const components = dsn ? makeDsn(dsn) : getClient()?.getDsn();
	return components ? `/${fnv1a32(dsnToString(components)).toString(36)}` : void 0;
}
function normalizeTunnelBasePath(basePath) {
	const path = (basePath?.startsWith("./") ? basePath.slice(1) : basePath ?? "").replace(/\/$/, "");
	return !path || path.startsWith("/") ? path : `/${path}`;
}
function fnv1a32(input) {
	let hash = 2166136261;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/ipAddress.js
function addAutoIpAddressToSession(session) {
	if ("aggregates" in session) {
		if (session.attrs?.["ip_address"] === void 0) session.attrs = {
			...session.attrs,
			ip_address: "{{auto}}"
		};
	} else if (session.ipAddress === void 0) session.ipAddress = "{{auto}}";
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/sdkMetadata.js
function applySdkMetadata(options, name, names = [name], source = "npm") {
	const sdk = (options._metadata = options._metadata || {}).sdk = options._metadata.sdk || {};
	if (!sdk.name) {
		sdk.name = `sentry.javascript.${name}`;
		sdk.packages = names.map((name2) => ({
			name: `${source}:@sentry/${name2}`,
			version: SDK_VERSION
		}));
		sdk.version = SDK_VERSION;
	}
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/traceData.js
function getTraceData(options = {}) {
	const client = options.client || getClient();
	if (!isEnabled() || !client) return {};
	const acs = getAsyncContextStrategy(getMainCarrier());
	if (acs.getTraceData) return acs.getTraceData(options);
	const scope = options.scope || getCurrentScope();
	const span = options.span || getActiveSpan();
	const isTwpPlaceholder = spanIsNonRecordingSpan(span) && !hasSpansEnabled(client.getOptions());
	if (!span && hasExternalPropagationContext()) return {};
	const sentryTrace = span && !isTwpPlaceholder ? spanToTraceHeader(span) : scopeToTraceHeader(scope);
	const baggage = dynamicSamplingContextToSentryBaggageHeader(span ? getDynamicSamplingContextFromSpan(span) : getDynamicSamplingContextFromScope(client, scope));
	if (!TRACEPARENT_REGEXP.test(sentryTrace)) {
		debug$2.warn("Invalid sentry-trace data. Cannot generate trace data");
		return {};
	}
	const traceData = {
		"sentry-trace": sentryTrace,
		baggage
	};
	if (options.propagateTraceparent) traceData.traceparent = span && !isTwpPlaceholder ? spanToTraceparentHeader(span) : scopeToTraceparentHeader(scope);
	return traceData;
}
function scopeToTraceHeader(scope) {
	const { traceId, sampled, propagationSpanId } = scope.getPropagationContext();
	return generateSentryTraceHeader(traceId, propagationSpanId, sampled);
}
function scopeToTraceparentHeader(scope) {
	const { traceId, sampled, propagationSpanId } = scope.getPropagationContext();
	return generateTraceparentHeader(traceId, propagationSpanId, sampled);
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/tracePropagationTargets.js
var NORMALIZED_REGEXP_CACHE = /* @__PURE__ */ new WeakMap();
function normalizeRegExpTarget(pattern) {
	const flags = `${pattern.flags.replace(/[gy]/g, "")}${pattern.ignoreCase ? "" : "i"}`;
	if (flags === pattern.flags) return pattern;
	const cached = NORMALIZED_REGEXP_CACHE.get(pattern);
	if (cached) return cached;
	const normalizedPattern = new RegExp(pattern.source, flags);
	NORMALIZED_REGEXP_CACHE.set(pattern, normalizedPattern);
	return normalizedPattern;
}
function matchesTracePropagationTargets(value, tracePropagationTargets, requireExactStringMatch = false) {
	const lowerCaseValue = value.toLowerCase();
	for (const target of tracePropagationTargets) if (isString(target)) {
		const lowerCaseTarget = target.toLowerCase();
		if (requireExactStringMatch ? lowerCaseValue === lowerCaseTarget : lowerCaseValue.includes(lowerCaseTarget)) return true;
	} else if (isRegExp(target) && normalizeRegExpTarget(target).test(value)) return true;
	return false;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/array.js
function uniq(input) {
	return Array.from(new Set(input));
}
// ../DnD helper/node_modules/@sentry/core/build/esm/breadcrumbs.js
var DEFAULT_BREADCRUMBS = 100;
function addBreadcrumb(breadcrumb, hint) {
	const client = getClient();
	const isolationScope = getIsolationScope();
	if (!client) return;
	const { beforeBreadcrumb = null, maxBreadcrumbs = DEFAULT_BREADCRUMBS } = client.getOptions();
	if (maxBreadcrumbs <= 0) return;
	const mergedBreadcrumb = {
		timestamp: dateTimestampInSeconds(),
		...breadcrumb
	};
	const finalBreadcrumb = beforeBreadcrumb ? safeCallback(DEBUG_BUILD$5 ? "The `beforeBreadcrumb` callback threw an error, dropping the breadcrumb:" : "", () => consoleSandbox(() => beforeBreadcrumb(mergedBreadcrumb, hint)), () => null) : mergedBreadcrumb;
	if (finalBreadcrumb === null) return;
	if (client.emit) client.emit("beforeAddBreadcrumb", finalBreadcrumb, hint);
	isolationScope.addBreadcrumb(finalBreadcrumb, maxBreadcrumbs);
}
// ../DnD helper/node_modules/@sentry/core/build/esm/integrations/functiontostring.js
var INTEGRATION_NAME$28 = "FunctionToString";
var SETUP_CLIENTS$1 = /* @__PURE__ */ new WeakMap();
var _functionToStringIntegration = (() => {
	return {
		name: INTEGRATION_NAME$28,
		setupOnce() {
			const originalFunctionToString = Function.prototype.toString;
			const callOriginalFunctionToString = Function.prototype.call.bind(originalFunctionToString);
			try {
				Function.prototype.toString = function() {
					const originalFunction = getOriginalFunction(this);
					let unwrappedFunction;
					try {
						if (SETUP_CLIENTS$1.has(getClient()) && originalFunction !== void 0) unwrappedFunction = originalFunction;
					} catch {}
					return callOriginalFunctionToString(unwrappedFunction ?? this);
				};
			} catch {}
		},
		setup(client) {
			SETUP_CLIENTS$1.set(client, true);
		}
	};
});
var functionToStringIntegration = defineIntegration(_functionToStringIntegration);
// ../DnD helper/node_modules/@sentry/core/build/esm/integrations/eventFilters.js
var DEFAULT_IGNORE_ERRORS = [
	/^Script error\.?$/,
	/^Javascript error: Script error\.? on line 0$/,
	/^ResizeObserver loop completed with undelivered notifications.$/,
	/^Cannot redefine property: googletag$/,
	/^Can't find variable: gmo$/,
	/^undefined is not an object \(evaluating 'a\.[A-Z]'\)$/,
	/can't redefine non-configurable property "solana"/,
	/vv\(\)\.getRestrictions is not a function/,
	/Can't find variable: _AutofillCallbackHandler/,
	/Object Not Found Matching Id:\d+, MethodName:simulateEvent/,
	/Java exception was raised during method invocation$/,
	/Java object is gone$/
];
var INTEGRATION_NAME$27 = "EventFilters";
var eventFiltersIntegration = defineIntegration((options = {}) => {
	let mergedOptions;
	return {
		name: INTEGRATION_NAME$27,
		setup(client) {
			mergedOptions = _mergeOptions(options, client.getOptions());
		},
		processEvent(event, _hint, client) {
			if (!mergedOptions) mergedOptions = _mergeOptions(options, client.getOptions());
			return _shouldDropEvent$1(event, mergedOptions) ? null : event;
		}
	};
});
function _mergeOptions(internalOptions = {}, clientOptions = {}) {
	return {
		allowUrls: [...internalOptions.allowUrls || [], ...clientOptions.allowUrls || []],
		denyUrls: [...internalOptions.denyUrls || [], ...clientOptions.denyUrls || []],
		ignoreErrors: [
			...internalOptions.ignoreErrors || [],
			...clientOptions.ignoreErrors || [],
			...internalOptions.disableErrorDefaults ? [] : DEFAULT_IGNORE_ERRORS
		],
		ignoreTransactions: [...internalOptions.ignoreTransactions || [], ...clientOptions.ignoreTransactions || []]
	};
}
function _shouldDropEvent$1(event, options) {
	if (!event.type) {
		if (_isIgnoredError(event, options.ignoreErrors)) {
			DEBUG_BUILD$5 && debug$2.warn(`Event dropped due to being matched by \`ignoreErrors\` option.
Event: ${getEventDescription(event)}`);
			return true;
		}
		if (_isUselessError(event)) {
			DEBUG_BUILD$5 && debug$2.warn(`Event dropped due to not having an error message, error type or stacktrace.
Event: ${getEventDescription(event)}`);
			return true;
		}
		if (_isDeniedUrl(event, options.denyUrls)) {
			DEBUG_BUILD$5 && debug$2.warn(`Event dropped due to being matched by \`denyUrls\` option.
Event: ${getEventDescription(event)}.
Url: ${_getEventFilterUrl(event)}`);
			return true;
		}
		if (!_isAllowedUrl(event, options.allowUrls)) {
			DEBUG_BUILD$5 && debug$2.warn(`Event dropped due to not being matched by \`allowUrls\` option.
Event: ${getEventDescription(event)}.
Url: ${_getEventFilterUrl(event)}`);
			return true;
		}
	} else if (event.type === "transaction") {
		if (_isIgnoredTransaction(event, options.ignoreTransactions)) {
			DEBUG_BUILD$5 && debug$2.warn(`Event dropped due to being matched by \`ignoreTransactions\` option.
Event: ${getEventDescription(event)}`);
			return true;
		}
	}
	return false;
}
function _isIgnoredError(event, ignoreErrors) {
	if (!ignoreErrors?.length) return false;
	return getPossibleEventMessages(event).some((message) => stringMatchesSomePattern(message, ignoreErrors));
}
function _isIgnoredTransaction(event, ignoreTransactions) {
	if (!ignoreTransactions?.length) return false;
	const name = event.transaction;
	return name ? stringMatchesSomePattern(name, ignoreTransactions) : false;
}
function _isDeniedUrl(event, denyUrls) {
	if (!denyUrls?.length) return false;
	const url = _getEventFilterUrl(event);
	return !url ? false : stringMatchesSomePattern(url, denyUrls);
}
function _isAllowedUrl(event, allowUrls) {
	if (!allowUrls?.length) return true;
	const url = _getEventFilterUrl(event);
	return !url ? true : stringMatchesSomePattern(url, allowUrls);
}
function _getLastValidUrl(frames = []) {
	for (let i = frames.length - 1; i >= 0; i--) {
		const frame = frames[i];
		if (frame && frame.filename !== "<anonymous>" && frame.filename !== "[native code]") return frame.filename || null;
	}
	return null;
}
function _getEventFilterUrl(event) {
	try {
		const frames = [...event.exception?.values ?? []].reverse().find((value) => value.mechanism?.parent_id === void 0 && value.stacktrace?.frames?.length)?.stacktrace?.frames;
		return frames ? _getLastValidUrl(frames) : null;
	} catch {
		DEBUG_BUILD$5 && debug$2.error(`Cannot extract url for event ${getEventDescription(event)}`);
		return null;
	}
}
function _isUselessError(event) {
	if (!event.exception?.values?.length) return false;
	return !event.message && !event.exception.values.some((value) => value.stacktrace || value.type && value.type !== "Error" || value.value);
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/aggregate-errors.js
function applyAggregateErrorsToEvent(exceptionFromErrorImplementation, parser, key, limit, event, hint) {
	if (!event.exception?.values || !hint || !isError(hint.originalException)) return;
	const originalException = event.exception.values.length > 0 ? event.exception.values[event.exception.values.length - 1] : void 0;
	if (originalException) event.exception.values = aggregateExceptionsFromError(exceptionFromErrorImplementation, parser, limit, hint.originalException, key, event.exception.values, originalException, 0);
}
function aggregateExceptionsFromError(exceptionFromErrorImplementation, parser, limit, error, key, prevExceptions, exception, exceptionId) {
	if (prevExceptions.length >= limit + 1) return prevExceptions;
	let newExceptions = [...prevExceptions];
	if (isError(error[key])) {
		applyExceptionGroupFieldsForParentException(exception, exceptionId, error);
		const newException = exceptionFromErrorImplementation(parser, error[key]);
		const newExceptionId = newExceptions.length;
		applyExceptionGroupFieldsForChildException(newException, key, newExceptionId, exceptionId);
		newExceptions = aggregateExceptionsFromError(exceptionFromErrorImplementation, parser, limit, error[key], key, [newException, ...newExceptions], newException, newExceptionId);
	}
	if (isExceptionGroup(error)) error.errors.forEach((childError, i) => {
		if (newExceptions.length < limit + 1 && isError(childError)) {
			applyExceptionGroupFieldsForParentException(exception, exceptionId, error);
			const newException = exceptionFromErrorImplementation(parser, childError);
			const newExceptionId = newExceptions.length;
			applyExceptionGroupFieldsForChildException(newException, `errors[${i}]`, newExceptionId, exceptionId);
			newExceptions = aggregateExceptionsFromError(exceptionFromErrorImplementation, parser, limit, childError, key, [newException, ...newExceptions], newException, newExceptionId);
		}
	});
	if (isSuppressedError(error)) ["error", "suppressed"].forEach((property) => {
		const childError = error[property];
		if (newExceptions.length < limit + 1 && isError(childError)) {
			applyExceptionGroupFieldsForParentException(exception, exceptionId, error);
			const newException = exceptionFromErrorImplementation(parser, childError);
			const newExceptionId = newExceptions.length;
			applyExceptionGroupFieldsForChildException(newException, property, newExceptionId, exceptionId);
			newExceptions = aggregateExceptionsFromError(exceptionFromErrorImplementation, parser, limit, childError, key, [newException, ...newExceptions], newException, newExceptionId);
		}
	});
	return newExceptions;
}
function isExceptionGroup(error) {
	return Array.isArray(error.errors);
}
function isSuppressedError(error) {
	return "error" in error && "suppressed" in error;
}
function applyExceptionGroupFieldsForParentException(exception, exceptionId, error) {
	exception.mechanism = {
		handled: true,
		type: "auto.core.linked_errors",
		...isExceptionGroup(error) && { is_exception_group: true },
		...exception.mechanism,
		exception_id: exceptionId
	};
}
function applyExceptionGroupFieldsForChildException(exception, source, exceptionId, parentId) {
	exception.mechanism = {
		handled: true,
		...exception.mechanism,
		type: "chained",
		source,
		exception_id: exceptionId,
		parent_id: parentId
	};
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/eventbuilder.js
function hasSentryFetchUrlHost(error) {
	return isError(error) && "__sentry_fetch_url_host__" in error && typeof error.__sentry_fetch_url_host__ === "string";
}
function _enhanceErrorWithSentryInfo(error) {
	if (hasSentryFetchUrlHost(error)) return `${error.message} (${error.__sentry_fetch_url_host__})`;
	return error.message;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/metadata.js
var filenameMetadataMap = /* @__PURE__ */ new Map();
var parsedStacks = /* @__PURE__ */ new Set();
function ensureMetadataStacksAreParsed(parser) {
	if (!GLOBAL_OBJ._sentryModuleMetadata) return;
	for (const stack of Object.keys(GLOBAL_OBJ._sentryModuleMetadata)) {
		const metadata = GLOBAL_OBJ._sentryModuleMetadata[stack];
		if (parsedStacks.has(stack)) continue;
		parsedStacks.add(stack);
		const frames = parser(stack);
		for (const frame of frames.reverse()) if (frame.filename) {
			filenameMetadataMap.set(frame.filename, metadata);
			break;
		}
	}
}
function getMetadataForUrl(parser, filename) {
	ensureMetadataStacksAreParsed(parser);
	return filenameMetadataMap.get(filename);
}
function addMetadataToStackFrames(parser, event) {
	event.exception?.values?.forEach((exception) => {
		exception.stacktrace?.frames?.forEach((frame) => {
			if (!frame.filename || frame.module_metadata) return;
			const metadata = getMetadataForUrl(parser, frame.filename);
			if (metadata) frame.module_metadata = metadata;
		});
	});
}
function stripMetadataFromStackFrames(event) {
	event.exception?.values?.forEach((exception) => {
		exception.stacktrace?.frames?.forEach((frame) => {
			delete frame.module_metadata;
		});
	});
}
// ../DnD helper/node_modules/@sentry/core/build/esm/integrations/moduleMetadata.js
var moduleMetadataIntegration = defineIntegration(() => {
	return {
		name: "ModuleMetadata",
		setup(client) {
			client.on("beforeEnvelope", (envelope) => {
				forEachEnvelopeItem(envelope, (item, type) => {
					if (type === "event") {
						const event = Array.isArray(item) ? item[1] : void 0;
						if (event) {
							stripMetadataFromStackFrames(event);
							item[1] = event;
						}
					}
				});
			});
			client.on("applyFrameMetadata", (event) => {
				if (event.type) return;
				const stackParser = client.getOptions().stackParser;
				addMetadataToStackFrames(stackParser, event);
			});
		}
	};
});
// ../DnD helper/node_modules/@sentry/core/build/esm/instrument/console.js
var _filter = /* @__PURE__ */ new Set([]);
function addConsoleInstrumentationHandler(handler) {
	const type = "console";
	const removeHandler = addHandler$1(type, handler);
	maybeInstrument(type, instrumentConsole);
	return removeHandler;
}
function addConsoleInstrumentationFilter(filter) {
	for (const f of filter) _filter.add(f);
	return () => {
		for (const f of filter) _filter.delete(f);
	};
}
var instrumentedLevels = /* @__PURE__ */ new Set();
function instrumentConsole() {
	if (!("console" in GLOBAL_OBJ)) return;
	CONSOLE_LEVELS$1.forEach(function(level) {
		if (instrumentedLevels.has(level) || !(level in GLOBAL_OBJ.console)) return;
		instrumentedLevels.add(level);
		fill(GLOBAL_OBJ.console, level, function(originalConsoleMethod) {
			originalConsoleMethods[level] = originalConsoleMethod;
			return function(...args) {
				const firstArg = args[0];
				const log = originalConsoleMethods[level];
				const isFiltered = _filter.size && typeof firstArg === "string" && stringMatchesSomePattern(firstArg, _filter);
				if (!isFiltered) triggerHandlers$1("console", {
					args,
					level
				});
				if (!isFiltered || DEBUG_BUILD$5 && debug$2.isEnabled()) log?.apply(GLOBAL_OBJ.console, args);
			};
		});
	});
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/severity.js
function severityLevelFromString(level) {
	return level === "warn" ? "warning" : [
		"fatal",
		"error",
		"warning",
		"log",
		"info",
		"debug"
	].includes(level) ? level : "log";
}
// ../DnD helper/node_modules/@sentry/core/build/esm/integrations/captureconsole.js
var INTEGRATION_NAME$26 = "CaptureConsole";
var _captureConsoleIntegration = ((options = {}) => {
	const levels = options.levels || CONSOLE_LEVELS$1;
	const handled = options.handled ?? true;
	return {
		name: INTEGRATION_NAME$26,
		setup(client) {
			if (!("console" in GLOBAL_OBJ)) return;
			addConsoleInstrumentationHandler(({ args, level }) => {
				if (getClient() !== client || !levels.includes(level)) return;
				consoleHandler(args, level, handled);
			});
		}
	};
});
var captureConsoleIntegration = defineIntegration(_captureConsoleIntegration);
function consoleHandler(args, level, handled) {
	const severityLevel = severityLevelFromString(level);
	const syntheticException = /* @__PURE__ */ new Error();
	const captureContext = {
		level: severityLevelFromString(level),
		extra: { arguments: args }
	};
	withScope((scope) => {
		scope.addEventProcessor((event) => {
			event.logger = "console";
			addExceptionMechanism(event, {
				handled,
				type: "auto.core.capture_console"
			});
			return event;
		});
		if (level === "assert") {
			if (!args[0]) {
				const message2 = `Assertion failed: ${safeJoin(args.slice(1), " ") || "console.assert"}`;
				scope.setExtra("arguments", args.slice(1));
				scope.captureMessage(message2, severityLevel, {
					captureContext,
					syntheticException
				});
			}
			return;
		}
		const error = args.find((arg) => arg instanceof Error);
		if (error) {
			captureException(error, captureContext);
			return;
		}
		const message = safeJoin(args, " ");
		scope.captureMessage(message, severityLevel, {
			captureContext,
			syntheticException
		});
	});
}
// ../DnD helper/node_modules/@sentry/core/build/esm/integrations/dedupe.js
var INTEGRATION_NAME$25 = "Dedupe";
var _dedupeIntegration = (() => {
	let previousEvent;
	return {
		name: INTEGRATION_NAME$25,
		processEvent(currentEvent) {
			if (currentEvent.type) return currentEvent;
			try {
				if (_shouldDropEvent(currentEvent, previousEvent)) {
					DEBUG_BUILD$5 && debug$2.warn("Event dropped due to being a duplicate of previously captured event.");
					return null;
				}
			} catch {}
			return previousEvent = currentEvent;
		}
	};
});
var dedupeIntegration = defineIntegration(_dedupeIntegration);
function _shouldDropEvent(currentEvent, previousEvent) {
	if (!previousEvent) return false;
	if (_isSameMessageEvent(currentEvent, previousEvent)) return true;
	if (_isSameExceptionEvent(currentEvent, previousEvent)) return true;
	return false;
}
function _isSameMessageEvent(currentEvent, previousEvent) {
	const currentMessage = currentEvent.message;
	const previousMessage = previousEvent.message;
	if (!currentMessage && !previousMessage) return false;
	if (currentMessage && !previousMessage || !currentMessage && previousMessage) return false;
	if (currentMessage !== previousMessage) return false;
	if (!_isSameFingerprint(currentEvent, previousEvent)) return false;
	if (!_isSameStacktrace(currentEvent, previousEvent)) return false;
	return true;
}
function _isSameExceptionEvent(currentEvent, previousEvent) {
	const previousException = _getExceptionFromEvent(previousEvent);
	const currentException = _getExceptionFromEvent(currentEvent);
	if (!previousException || !currentException) return false;
	if (previousException.type !== currentException.type || previousException.value !== currentException.value) return false;
	if (!_isSameFingerprint(currentEvent, previousEvent)) return false;
	if (!_isSameStacktrace(currentEvent, previousEvent)) return false;
	return true;
}
function _isSameStacktrace(currentEvent, previousEvent) {
	const currentFrames = getFramesFromEvent(currentEvent);
	const previousFrames = getFramesFromEvent(previousEvent);
	if (!currentFrames || !previousFrames) return !currentFrames && !previousFrames;
	if (previousFrames.length !== currentFrames.length) return false;
	for (let i = 0; i < previousFrames.length; i++) {
		const frameA = previousFrames[i];
		const frameB = currentFrames[i];
		if (frameA.filename !== frameB.filename || frameA.lineno !== frameB.lineno || frameA.colno !== frameB.colno || frameA.function !== frameB.function) return false;
	}
	return true;
}
function _isSameFingerprint(currentEvent, previousEvent) {
	const currentFingerprint = currentEvent.fingerprint;
	const previousFingerprint = previousEvent.fingerprint;
	if (!currentFingerprint || !previousFingerprint) return !currentFingerprint && !previousFingerprint;
	try {
		return !!(currentFingerprint.join("") === previousFingerprint.join(""));
	} catch {
		return false;
	}
}
function _getExceptionFromEvent(event) {
	return event.exception?.values?.[0];
}
// ../DnD helper/node_modules/@sentry/core/build/esm/integrations/extraerrordata.js
var INTEGRATION_NAME$24 = "ExtraErrorData";
var _extraErrorDataIntegration = ((options = {}) => {
	const { depth = 3, captureErrorCause = true } = options;
	return {
		name: INTEGRATION_NAME$24,
		processEvent(event, hint, client) {
			const { maxValueLength } = client.getOptions();
			return _enhanceEventWithErrorData(event, hint, depth, captureErrorCause, maxValueLength);
		}
	};
});
var extraErrorDataIntegration = defineIntegration(_extraErrorDataIntegration);
function _enhanceEventWithErrorData(event, hint = {}, depth, captureErrorCause, maxValueLength) {
	if (!hint.originalException || !isError(hint.originalException)) return event;
	const exceptionName = hint.originalException.name || hint.originalException.constructor.name;
	const errorData = _extractErrorData(hint.originalException, captureErrorCause, maxValueLength);
	if (errorData) {
		const contexts = { ...event.contexts };
		const normalizedErrorData = normalize(errorData, depth);
		if (isPlainObject(normalizedErrorData)) {
			setSkipNormalizationHint(normalizedErrorData);
			contexts[exceptionName] = normalizedErrorData;
		}
		return {
			...event,
			contexts
		};
	}
	return event;
}
function _extractErrorData(error, captureErrorCause, maxValueLength) {
	try {
		const nativeKeys = [
			"name",
			"message",
			"stack",
			"line",
			"column",
			"fileName",
			"lineNumber",
			"columnNumber",
			"toJSON"
		];
		const extraErrorInfo = {};
		for (const key of Object.keys(error)) {
			if (nativeKeys.indexOf(key) !== -1) continue;
			const value = error[key];
			extraErrorInfo[key] = isError(value) || typeof value === "string" ? maxValueLength ? truncate(`${value}`, maxValueLength) : `${value}` : value;
		}
		if (captureErrorCause && error.cause !== void 0) {
			if (isError(error.cause)) extraErrorInfo.cause = { [error.cause.name || error.cause.constructor.name]: _extractErrorData(error.cause, false, maxValueLength) };
			else extraErrorInfo.cause = error.cause;
		}
		if (typeof error.toJSON === "function") {
			const serializedError = error.toJSON();
			for (const key of Object.keys(serializedError)) {
				const value = serializedError[key];
				extraErrorInfo[key] = isError(value) ? value.toString() : value;
			}
		}
		return extraErrorInfo;
	} catch (oO) {
		DEBUG_BUILD$5 && debug$2.error("Unable to extract extra data from the Error object:", oO);
	}
	return null;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/path.js
function normalizeArray(parts, allowAboveRoot) {
	let up = 0;
	for (let i = parts.length - 1; i >= 0; i--) {
		const last = parts[i];
		if (last === ".") parts.splice(i, 1);
		else if (last === "..") {
			parts.splice(i, 1);
			up++;
		} else if (up) {
			parts.splice(i, 1);
			up--;
		}
	}
	if (allowAboveRoot) for (; up--;) parts.unshift("..");
	return parts;
}
var splitPathRe = /^(\S+:\\|\/?)([\s\S]*?)((?:\.{1,2}|[^/\\]+?|)(\.[^./\\]*|))(?:[/\\]*)$/;
function splitPath(filename) {
	const truncated = filename.length > 1024 ? `<truncated>${filename.slice(-1024)}` : filename;
	const parts = splitPathRe.exec(truncated);
	return parts ? parts.slice(1) : [];
}
function resolve(...args) {
	let resolvedPath = "";
	let resolvedAbsolute = false;
	for (let i = args.length - 1; i >= -1 && !resolvedAbsolute; i--) {
		const path = i >= 0 ? args[i] : "/";
		if (!path) continue;
		resolvedPath = `${path}/${resolvedPath}`;
		resolvedAbsolute = path.charAt(0) === "/";
	}
	resolvedPath = normalizeArray(resolvedPath.split("/").filter((p) => !!p), !resolvedAbsolute).join("/");
	return (resolvedAbsolute ? "/" : "") + resolvedPath || ".";
}
function trim(arr) {
	let start = 0;
	for (; start < arr.length; start++) if (arr[start] !== "") break;
	let end = arr.length - 1;
	for (; end >= 0; end--) if (arr[end] !== "") break;
	if (start > end) return [];
	return arr.slice(start, end - start + 1);
}
function relative(from, to) {
	from = resolve(from).slice(1);
	to = resolve(to).slice(1);
	const fromParts = trim(from.split("/"));
	const toParts = trim(to.split("/"));
	const length = Math.min(fromParts.length, toParts.length);
	let samePartsLength = length;
	for (let i = 0; i < length; i++) if (fromParts[i] !== toParts[i]) {
		samePartsLength = i;
		break;
	}
	let outputParts = [];
	for (let i = samePartsLength; i < fromParts.length; i++) outputParts.push("..");
	outputParts = outputParts.concat(toParts.slice(samePartsLength));
	return outputParts.join("/");
}
function basename(path, ext) {
	let f = splitPath(path)[2] || "";
	if (ext && f.slice(ext.length * -1) === ext) f = f.slice(0, f.length - ext.length);
	return f;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/integrations/rewriteframes.js
var INTEGRATION_NAME$23 = "RewriteFrames";
var rewriteFramesIntegration = defineIntegration((options = {}) => {
	const root = options.root;
	const prefix = options.prefix || "app:///";
	const isBrowser = "window" in GLOBAL_OBJ && !!GLOBAL_OBJ.window;
	const iteratee = options.iteratee || generateIteratee({
		isBrowser,
		root,
		prefix
	});
	function _processExceptionsEvent(event) {
		try {
			return {
				...event,
				exception: {
					...event.exception,
					values: event.exception.values.map((value) => ({
						...value,
						...value.stacktrace && { stacktrace: _processStacktrace(value.stacktrace) }
					}))
				}
			};
		} catch {
			return event;
		}
	}
	function _processStacktrace(stacktrace) {
		return {
			...stacktrace,
			frames: stacktrace?.frames?.map((f) => iteratee(f))
		};
	}
	return {
		name: INTEGRATION_NAME$23,
		processEvent(originalEvent) {
			let processedEvent = originalEvent;
			if (originalEvent.exception && Array.isArray(originalEvent.exception.values)) processedEvent = _processExceptionsEvent(processedEvent);
			return processedEvent;
		}
	};
});
function generateIteratee({ isBrowser, root, prefix }) {
	return (frame) => {
		if (!frame.filename) return frame;
		const isWindowsFrame = /^[a-zA-Z]:\\/.test(frame.filename) || frame.filename.includes("\\") && !frame.filename.includes("/");
		const startsWithSlash = /^\//.test(frame.filename);
		if (isBrowser) {
			if (root) {
				const oldFilename = frame.filename;
				if (oldFilename.indexOf(root) === 0) frame.filename = oldFilename.replace(root, prefix);
			}
		} else if (isWindowsFrame || startsWithSlash) {
			const filename = isWindowsFrame ? frame.filename.replace(/^[a-zA-Z]:/, "").replace(/\\/g, "/") : frame.filename;
			frame.filename = `${prefix}${root ? relative(root, filename) : basename(filename)}`;
		}
		return frame;
	};
}
// ../DnD helper/node_modules/@sentry/core/build/esm/integrations/supabase.js
var AUTH_OPERATIONS_TO_INSTRUMENT = [
	"reauthenticate",
	"signInAnonymously",
	"signInWithOAuth",
	"signInWithIdToken",
	"signInWithOtp",
	"signInWithPassword",
	"signInWithSSO",
	"signOut",
	"signUp",
	"verifyOtp"
];
var AUTH_ADMIN_OPERATIONS_TO_INSTRUMENT = [
	"createUser",
	"deleteUser",
	"listUsers",
	"getUserById",
	"updateUserById",
	"inviteUserByEmail"
];
var FILTER_MAPPINGS = {
	eq: "eq",
	neq: "neq",
	gt: "gt",
	gte: "gte",
	lt: "lt",
	lte: "lte",
	like: "like",
	"like(all)": "likeAllOf",
	"like(any)": "likeAnyOf",
	ilike: "ilike",
	"ilike(all)": "ilikeAllOf",
	"ilike(any)": "ilikeAnyOf",
	is: "is",
	in: "in",
	cs: "contains",
	cd: "containedBy",
	sr: "rangeGt",
	nxl: "rangeGte",
	sl: "rangeLt",
	nxr: "rangeLte",
	adj: "rangeAdjacent",
	ov: "overlaps",
	fts: "",
	plfts: "plain",
	phfts: "phrase",
	wfts: "websearch",
	not: "not"
};
var DB_OPERATIONS_TO_INSTRUMENT = [
	"select",
	"insert",
	"upsert",
	"update",
	"delete"
];
function markAsInstrumented(fn) {
	try {
		fn.__SENTRY_INSTRUMENTED__ = true;
	} catch {}
}
function isInstrumented(fn) {
	try {
		return fn.__SENTRY_INSTRUMENTED__;
	} catch {
		return false;
	}
}
function getMutationBodyPayloadForTelemetry(rawBody, plainBody) {
	if (Object.keys(plainBody).length > 0) return plainBody;
	if (Array.isArray(rawBody) && rawBody.length > 0) return rawBody;
}
function hasMutationBodyForDescription(rawBody, plainBody) {
	return getMutationBodyPayloadForTelemetry(rawBody, plainBody) !== void 0;
}
function getHeader(headers, name) {
	if (!headers) return;
	if (typeof headers.get === "function") return headers.get(name) ?? void 0;
	const plainHeaders = headers;
	const lowerCaseName = name.toLowerCase();
	const key = Object.keys(plainHeaders).find((headerName) => headerName.toLowerCase() === lowerCaseName);
	return key !== void 0 ? plainHeaders[key] : void 0;
}
function extractOperation(method, headers = {}) {
	switch (method) {
		case "GET":
		case "QUERY": return "select";
		case "POST": if (getHeader(headers, "Prefer")?.includes("resolution=")) return "upsert";
		else return "insert";
		case "PATCH": return "update";
		case "DELETE": return "delete";
		default: return "<unknown-op>";
	}
}
function translateFiltersIntoMethods(key, query) {
	if (query === "" || query === "*") return "select(*)";
	if (key === "select") return `select(${query})`;
	if (key === "or" || key.endsWith(".or")) return `${key}${query}`;
	const [filter, ...value] = query.split(".");
	let method;
	if (filter?.startsWith("fts")) method = "textSearch";
	else if (filter?.startsWith("plfts")) method = "textSearch[plain]";
	else if (filter?.startsWith("phfts")) method = "textSearch[phrase]";
	else if (filter?.startsWith("wfts")) method = "textSearch[websearch]";
	else method = filter && FILTER_MAPPINGS[filter] || "filter";
	return `${method}(${key}, ${value.join(".")})`;
}
function instrumentAuthOperation(operation, isAdmin = false) {
	return new Proxy(operation, { apply(target, thisArg, argumentsList) {
		const operationName = `auth${isAdmin ? ".admin" : ""}.${operation.name}`;
		const client = getClient();
		return startSpanManual$1({
			name: client && hasSpanStreamingEnabled(client) ? operationName : `auth ${isAdmin ? "(admin) " : ""}${operation.name}`,
			onlyIfParent: true,
			attributes: {
				[sb]: "auto.db.supabase",
				[ab]: "db",
				[es]: "postgresql",
				[Ba]: operationName
			}
		}, (span) => {
			return Reflect.apply(target, thisArg, argumentsList).then((res) => {
				if (isObjectLike(res) && "error" in res && res.error) {
					span.setStatus({ code: 2 });
					captureException(res.error, { mechanism: {
						handled: false,
						type: "auto.db.supabase.auth"
					} });
				} else span.setStatus({ code: 1 });
				span.end();
				return res;
			}).catch((err) => {
				span.setStatus({ code: 2 });
				span.end();
				captureException(err, { mechanism: {
					handled: false,
					type: "auto.db.supabase.auth"
				} });
				throw err;
			}).then(...argumentsList);
		});
	} });
}
function instrumentSupabaseAuthClient(supabaseClientInstance) {
	const auth = supabaseClientInstance.auth;
	if (!auth || isInstrumented(supabaseClientInstance.auth)) return;
	for (const operation of AUTH_OPERATIONS_TO_INSTRUMENT) {
		const authOperation = auth[operation];
		if (!authOperation) continue;
		if (typeof supabaseClientInstance.auth[operation] === "function") supabaseClientInstance.auth[operation] = instrumentAuthOperation(authOperation);
	}
	for (const operation of AUTH_ADMIN_OPERATIONS_TO_INSTRUMENT) {
		const authOperation = auth.admin[operation];
		if (!authOperation) continue;
		if (typeof supabaseClientInstance.auth.admin[operation] === "function") supabaseClientInstance.auth.admin[operation] = instrumentAuthOperation(authOperation, true);
	}
	markAsInstrumented(supabaseClientInstance.auth);
}
function instrumentSupabaseClientConstructor(SupabaseClient, _options) {
	if (isInstrumented(SupabaseClient.prototype.from)) return;
	SupabaseClient.prototype.from = new Proxy(SupabaseClient.prototype.from, { apply(target, thisArg, argumentsList) {
		const rv = Reflect.apply(target, thisArg, argumentsList);
		const PostgRESTQueryBuilder = rv.constructor;
		instrumentPostgRESTQueryBuilder(PostgRESTQueryBuilder, _options);
		return rv;
	} });
	markAsInstrumented(SupabaseClient.prototype.from);
}
function instrumentPostgRESTFilterBuilder(PostgRESTFilterBuilder, _options) {
	if (isInstrumented(PostgRESTFilterBuilder.prototype.then)) return;
	PostgRESTFilterBuilder.prototype.then = new Proxy(PostgRESTFilterBuilder.prototype.then, { apply(target, thisArg, argumentsList) {
		const operations = DB_OPERATIONS_TO_INSTRUMENT;
		const typedThis = thisArg;
		const operation = extractOperation(typedThis.method, typedThis.headers);
		if (!operations.includes(operation)) return Reflect.apply(target, thisArg, argumentsList);
		if (!typedThis?.url?.pathname || typeof typedThis.url.pathname !== "string") return Reflect.apply(target, thisArg, argumentsList);
		const pathParts = typedThis.url.pathname.split("/");
		const table = pathParts.length > 0 ? pathParts[pathParts.length - 1] : "";
		const queryItems = [];
		for (const [key, value] of typedThis.url.searchParams.entries()) queryItems.push(translateFiltersIntoMethods(key, value));
		const body = /* @__PURE__ */ Object.create(null);
		if (isPlainObject(typedThis.body)) for (const [key, value] of Object.entries(typedThis.body)) body[key] = value;
		const client = getClient();
		const shouldSendData = _options.sendOperationData ?? client?.getDataCollectionOptions().databaseQueryData === true;
		const bodyPayload = getMutationBodyPayloadForTelemetry(typedThis.body, body);
		const mutationPart = operation === "select" ? "" : `${operation}${hasMutationBodyForDescription(typedThis.body, body) ? "(...) " : ""}`;
		const queryPart = shouldSendData ? queryItems.join(" ") : queryItems.length > 0 ? "[redacted]" : "";
		const descriptionMiddle = [mutationPart.trimEnd(), queryPart].filter(Boolean).join(" ");
		const description = descriptionMiddle ? `${descriptionMiddle} from(${table})` : `from(${table})`;
		const name = client && hasSpanStreamingEnabled(client) ? `${operation}${table ? ` ${table}` : ""}` : description;
		const attributes = {
			"db.table": table,
			"db.schema": typedThis.schema,
			"db.url": typedThis.url.origin,
			"db.sdk": getHeader(typedThis.headers, "X-Client-Info"),
			[es]: "postgresql",
			[Ba]: operation,
			[sb]: "auto.db.supabase",
			[ab]: "db"
		};
		if (queryItems.length && shouldSendData) attributes["db.query"] = queryItems;
		if (bodyPayload !== void 0 && shouldSendData) attributes["db.body"] = bodyPayload;
		return startSpanManual$1({
			name,
			onlyIfParent: true,
			attributes
		}, (span) => {
			return Reflect.apply(target, thisArg, []).then((res) => {
				if (span) {
					if (res && typeof res === "object" && "status" in res) setHttpStatus(span, res.status || 500);
					span.end();
				}
				if (res?.error) {
					const err = new Error(res.error.message);
					if (res.error.code) err.code = res.error.code;
					if (res.error.details) err.details = res.error.details;
					const supabaseContext = {};
					if (queryItems.length && shouldSendData) supabaseContext.query = queryItems;
					if (bodyPayload !== void 0 && shouldSendData) supabaseContext.body = bodyPayload;
					captureException(err, (scope) => {
						scope.addEventProcessor((e) => {
							addExceptionMechanism(e, {
								handled: false,
								type: "auto.db.supabase.postgres"
							});
							return e;
						});
						scope.setContext("supabase", supabaseContext);
						return scope;
					});
				}
				const breadcrumb = {
					type: "supabase",
					category: `db.${operation}`,
					message: description
				};
				const data = {};
				if (queryItems.length && shouldSendData) data.query = queryItems;
				if (bodyPayload !== void 0 && shouldSendData) data.body = bodyPayload;
				if (Object.keys(data).length) breadcrumb.data = data;
				addBreadcrumb(breadcrumb);
				return res;
			}, (err) => {
				if (span) {
					setHttpStatus(span, 500);
					span.end();
				}
				throw err;
			}).then(...argumentsList);
		});
	} });
	markAsInstrumented(PostgRESTFilterBuilder.prototype.then);
}
function instrumentPostgRESTQueryBuilder(PostgRESTQueryBuilder, _options) {
	for (const operation of DB_OPERATIONS_TO_INSTRUMENT) {
		if (isInstrumented(PostgRESTQueryBuilder.prototype[operation])) continue;
		PostgRESTQueryBuilder.prototype[operation] = new Proxy(PostgRESTQueryBuilder.prototype[operation], { apply(target, thisArg, argumentsList) {
			const rv = Reflect.apply(target, thisArg, argumentsList);
			const PostgRESTFilterBuilder = rv.constructor;
			DEBUG_BUILD$5 && debug$2.log(`Instrumenting ${operation} operation's PostgRESTFilterBuilder`);
			instrumentPostgRESTFilterBuilder(PostgRESTFilterBuilder, _options);
			return rv;
		} });
		markAsInstrumented(PostgRESTQueryBuilder.prototype[operation]);
	}
}
var instrumentSupabaseClient = (supabaseClient, options = {}) => {
	if (!supabaseClient) {
		DEBUG_BUILD$5 && debug$2.warn("Supabase integration was not installed because no Supabase client was provided.");
		return;
	}
	instrumentSupabaseClientConstructor(supabaseClient.constructor === Function ? supabaseClient : supabaseClient.constructor, options);
	instrumentSupabaseAuthClient(supabaseClient);
};
var INTEGRATION_NAME$22 = "Supabase";
var _supabaseIntegration = ((supabaseClient, options) => {
	return {
		setupOnce() {
			instrumentSupabaseClient(supabaseClient, options);
		},
		name: INTEGRATION_NAME$22
	};
});
var supabaseIntegration = defineIntegration((options) => {
	return _supabaseIntegration(options.supabaseClient, { sendOperationData: options.sendOperationData });
});
// ../DnD helper/node_modules/@sentry/core/build/esm/integrations/zoderrors.js
var DEFAULT_LIMIT$1 = 10;
var INTEGRATION_NAME$21 = "ZodErrors";
function originalExceptionIsZodError(originalException) {
	return isError(originalException) && originalException.name === "ZodError" && Array.isArray(originalException.issues);
}
function flattenIssue(issue) {
	return {
		...issue,
		path: "path" in issue && Array.isArray(issue.path) ? issue.path.join(".") : void 0,
		keys: "keys" in issue ? JSON.stringify(issue.keys) : void 0,
		unionErrors: "unionErrors" in issue ? JSON.stringify(issue.unionErrors) : void 0
	};
}
function flattenIssuePath(path) {
	return path.map((p) => {
		if (typeof p === "number") return "<array>";
		else return p;
	}).join(".");
}
function formatIssueMessage(zodError) {
	const errorKeyMap = /* @__PURE__ */ new Set();
	for (const iss of zodError.issues) {
		const issuePath = flattenIssuePath(iss.path);
		if (issuePath.length > 0) errorKeyMap.add(issuePath);
	}
	const errorKeys = Array.from(errorKeyMap);
	if (errorKeys.length === 0) {
		let rootExpectedType = "variable";
		if (zodError.issues.length > 0) {
			const iss = zodError.issues[0];
			if (iss !== void 0 && "expected" in iss && typeof iss.expected === "string") rootExpectedType = iss.expected;
		}
		return `Failed to validate ${rootExpectedType}`;
	}
	return `Failed to validate keys: ${truncate(errorKeys.join(", "), 100)}`;
}
function applyZodErrorsToEvent(limit, saveZodIssuesAsAttachment = false, event, hint) {
	if (!event.exception?.values || !hint.originalException || !originalExceptionIsZodError(hint.originalException) || hint.originalException.issues.length === 0) return event;
	try {
		const flattenedIssues = (saveZodIssuesAsAttachment ? hint.originalException.issues : hint.originalException.issues.slice(0, limit)).map(flattenIssue);
		if (saveZodIssuesAsAttachment) {
			if (!Array.isArray(hint.attachments)) hint.attachments = [];
			hint.attachments.push({
				filename: "zod_issues.json",
				data: JSON.stringify({ issues: flattenedIssues })
			});
		}
		return {
			...event,
			exception: {
				...event.exception,
				values: [{
					...event.exception.values[0],
					value: formatIssueMessage(hint.originalException)
				}, ...event.exception.values.slice(1)]
			},
			extra: {
				...event.extra,
				"zoderror.issues": flattenedIssues.slice(0, limit)
			}
		};
	} catch (e) {
		return {
			...event,
			extra: {
				...event.extra,
				"zoderrors sentry integration parse error": {
					message: "an exception was thrown while processing ZodError within applyZodErrorsToEvent()",
					error: e instanceof Error ? `${e.name}: ${e.message}
${e.stack}` : "unknown"
				}
			}
		};
	}
}
var _zodErrorsIntegration = ((options = {}) => {
	const limit = options.limit ?? DEFAULT_LIMIT$1;
	return {
		name: INTEGRATION_NAME$21,
		processEvent(originalEvent, hint) {
			return applyZodErrorsToEvent(limit, options.saveZodIssuesAsAttachment, originalEvent, hint);
		}
	};
});
var zodErrorsIntegration = defineIntegration(_zodErrorsIntegration);
// ../DnD helper/node_modules/@sentry/core/build/esm/integrations/third-party-errors-filter.js
var thirdPartyErrorFilterIntegration = defineIntegration((options) => {
	const ignoreSentryInternalFrames = options.ignoreSentryInternalFrames ?? false;
	return {
		name: "ThirdPartyErrorsFilter",
		setup(client) {
			client.on("beforeEnvelope", (envelope) => {
				forEachEnvelopeItem(envelope, (item, type) => {
					if (type === "event") {
						const event = Array.isArray(item) ? item[1] : void 0;
						if (event) {
							stripMetadataFromStackFrames(event);
							item[1] = event;
						}
					}
				});
			});
			client.on("applyFrameMetadata", (event) => {
				if (event.type) return;
				const stackParser = client.getOptions().stackParser;
				addMetadataToStackFrames(stackParser, event);
			});
		},
		preprocessEvent(event) {
			if (ignoreSentryInternalFrames && (GLOBAL_OBJ._sentryWrappedDepth ?? 0) > 0) event.sdkProcessingMetadata = {
				...event.sdkProcessingMetadata,
				insideSentryWrapped: true
			};
		},
		processEvent(event) {
			const insideSentryWrapped = ignoreSentryInternalFrames ? event.sdkProcessingMetadata?.insideSentryWrapped === true && event.exception?.values?.length === 1 : false;
			const frameKeys = getBundleKeysForAllFramesWithFilenames(event, ignoreSentryInternalFrames, insideSentryWrapped);
			if (frameKeys) {
				if (frameKeys[options.behaviour === "drop-error-if-contains-third-party-frames" || options.behaviour === "apply-tag-if-contains-third-party-frames" ? "some" : "every"]((keys) => !keys.some((key) => options.filterKeys.includes(key)))) {
					if (options.behaviour === "drop-error-if-contains-third-party-frames" || options.behaviour === "drop-error-if-exclusively-contains-third-party-frames") return null;
					else event.tags = {
						...event.tags,
						third_party_code: true
					};
				}
			}
			return event;
		}
	};
});
function isSentryInternalFrame(frame, frameIndex, insideSentryWrapped) {
	if (frameIndex !== 0) return false;
	if (insideSentryWrapped && isLikelyMinifiedSentryWrappedFrame(frame)) return true;
	if (frame.function === "sentryWrapped") return true;
	if (!frame.context_line || !frame.filename) return false;
	if (!frame.filename.includes("sentry") || !frame.filename.includes("helpers") || !frame.context_line.includes(SENTRY_INTERNAL_FN_APPLY)) return false;
	if (frame.pre_context) {
		const len = frame.pre_context.length;
		for (let i = 0; i < len; i++) if (frame.pre_context[i]?.includes(SENTRY_INTERNAL_COMMENT)) return true;
	}
	return false;
}
function getBundleKeysForAllFramesWithFilenames(event, ignoreSentryInternalFrames, insideSentryWrapped) {
	const frames = getFramesFromEvent(event);
	if (!frames) return;
	return frames.filter((frame, index) => {
		if (!frame.filename) return false;
		if (frame.lineno == null && frame.colno == null && frame.instruction_addr == null) return false;
		return !ignoreSentryInternalFrames || !isSentryInternalFrame(frame, index, !!insideSentryWrapped);
	}).map((frame) => {
		if (!frame.module_metadata) return [];
		return Object.keys(frame.module_metadata).filter((key) => key.startsWith(BUNDLER_PLUGIN_APP_KEY_PREFIX)).map((key) => key.slice(BUNDLER_PLUGIN_APP_KEY_PREFIX.length));
	});
}
function isLikelyMinifiedSentryWrappedFrame(frame) {
	return !frame.context_line && !frame.pre_context && !!frame.function && frame.function.length <= 2;
}
var BUNDLER_PLUGIN_APP_KEY_PREFIX = "_sentryBundlerPluginAppKey:";
var SENTRY_INTERNAL_COMMENT = "Attempt to invoke user-land function";
var SENTRY_INTERNAL_FN_APPLY = "fn.apply(this, wrappedArguments)";
// ../DnD helper/node_modules/@sentry/core/build/esm/integrations/console.js
var INTEGRATION_NAME$20 = "Console";
var consoleIntegration = defineIntegration((options = {}) => {
	const levels = new Set(options.levels || CONSOLE_LEVELS$1);
	return {
		name: INTEGRATION_NAME$20,
		setup(client) {
			const unsubscribe = addConsoleInstrumentationHandler(({ args, level }) => {
				if (getClient() !== client || !levels.has(level)) return;
				addConsoleBreadcrumb(level, args);
			});
			client.registerCleanup(unsubscribe);
			if (options.filter) {
				const unsubscribe2 = addConsoleInstrumentationFilter(options.filter);
				client.registerCleanup(unsubscribe2);
			}
		}
	};
});
function addConsoleBreadcrumb(level, args) {
	const breadcrumb = {
		category: "console",
		data: {
			arguments: args,
			logger: "console"
		},
		level: severityLevelFromString(level),
		message: formatConsoleArgs$1(args)
	};
	if (level === "assert") {
		if (args[0] === false) {
			const assertionArgs = args.slice(1);
			breadcrumb.message = assertionArgs.length > 0 ? `Assertion failed: ${formatConsoleArgs$1(assertionArgs)}` : "Assertion failed";
			breadcrumb.data.arguments = assertionArgs;
		} else return;
	}
	addBreadcrumb(breadcrumb, {
		input: args,
		level
	});
}
function formatConsoleArgs$1(values) {
	return "util" in GLOBAL_OBJ && typeof GLOBAL_OBJ.util.format === "function" ? GLOBAL_OBJ.util.format(...values) : safeJoin(values, " ");
}
var SPAN_FLAG_ATTRIBUTE_PREFIX = "flag.evaluation.";
function _INTERNAL_copyFlagsFromScopeToEvent(event) {
	if (event.type) return event;
	const flagContext = getCurrentScope().getScopeData().contexts.flags;
	const flagBuffer = flagContext ? flagContext.values : [];
	if (!flagBuffer.length) return event;
	if (event.contexts === void 0) event.contexts = {};
	event.contexts.flags = { values: [...flagBuffer] };
	return event;
}
function _INTERNAL_insertFlagToScope(name, value, maxSize = 100) {
	const scopeContexts = getCurrentScope().getScopeData().contexts;
	if (!scopeContexts.flags) scopeContexts.flags = { values: [] };
	const flags = scopeContexts.flags.values;
	_INTERNAL_insertToFlagBuffer(flags, name, value, maxSize);
}
function _INTERNAL_insertToFlagBuffer(flags, name, value, maxSize) {
	if (typeof value !== "boolean") return;
	if (flags.length > maxSize) {
		DEBUG_BUILD$5 && debug$2.error(`[Feature Flags] insertToFlagBuffer called on a buffer larger than maxSize=${maxSize}`);
		return;
	}
	const index = flags.findIndex((f) => f.flag === name);
	if (index !== -1) flags.splice(index, 1);
	if (flags.length === maxSize) flags.shift();
	flags.push({
		flag: name,
		result: value
	});
}
function _INTERNAL_addFeatureFlagToActiveSpan(name, value, maxFlagsPerSpan = 10) {
	if (typeof value !== "boolean") return;
	const span = getActiveSpan();
	if (!span) return;
	const attributes = spanToStaticSpanJSON(span).data;
	if (`${SPAN_FLAG_ATTRIBUTE_PREFIX}${name}` in attributes) {
		span.setAttribute(`${SPAN_FLAG_ATTRIBUTE_PREFIX}${name}`, value);
		return;
	}
	if (Object.keys(attributes).filter((key) => key.startsWith(SPAN_FLAG_ATTRIBUTE_PREFIX)).length < maxFlagsPerSpan) span.setAttribute(`${SPAN_FLAG_ATTRIBUTE_PREFIX}${name}`, value);
}
// ../DnD helper/node_modules/@sentry/core/build/esm/integrations/featureFlags/featureFlagsIntegration.js
var featureFlagsIntegration = defineIntegration(() => {
	return {
		name: "FeatureFlags",
		processEvent(event, _hint, _client) {
			return _INTERNAL_copyFlagsFromScopeToEvent(event);
		},
		addFeatureFlag(name, value) {
			_INTERNAL_insertFlagToScope(name, value);
			_INTERNAL_addFeatureFlagToActiveSpan(name, value);
		}
	};
});
// ../DnD helper/node_modules/@sentry/core/build/esm/integrations/featureFlags/growthbook.js
var growthbookIntegration$1 = defineIntegration(({ growthbookClass }) => {
	return {
		name: "GrowthBook",
		setupOnce() {
			const proto = growthbookClass.prototype;
			if (typeof proto.isOn === "function") fill(proto, "isOn", _wrapAndCaptureBooleanResult);
			if (typeof proto.getFeatureValue === "function") fill(proto, "getFeatureValue", _wrapAndCaptureBooleanResult);
		},
		processEvent(event, _hint, _client) {
			return _INTERNAL_copyFlagsFromScopeToEvent(event);
		}
	};
});
function _wrapAndCaptureBooleanResult(original) {
	return function(...args) {
		const flagName = args[0];
		const result = original.apply(this, args);
		if (typeof flagName === "string" && typeof result === "boolean") {
			_INTERNAL_insertFlagToScope(flagName, result);
			_INTERNAL_addFeatureFlagToActiveSpan(flagName, result);
		}
		return result;
	};
}
// ../DnD helper/node_modules/@sentry/core/build/esm/integrations/conversationId.js
var INTEGRATION_NAME$19 = "ConversationId";
var _conversationIdIntegration = (() => {
	return {
		name: INTEGRATION_NAME$19,
		setup(client) {
			client.on("spanStart", (span) => {
				const scopeData = getCurrentScope().getScopeData();
				const isolationScopeData = getIsolationScope().getScopeData();
				const conversationId = scopeData.conversationId || isolationScopeData.conversationId;
				if (conversationId) {
					const { op, data: attributes, description: name } = spanToStaticSpanJSON(span);
					if (!op?.startsWith("gen_ai.") && !attributes["ai.operationId"] && !name?.startsWith("ai.")) return;
					span.setAttribute(Yr, conversationId);
				}
			});
		}
	};
});
var conversationIdIntegration = defineIntegration(_conversationIdIntegration);
// ../DnD helper/node_modules/@sentry/core/build/esm/fetch.js
function instrumentFetchRequest(handlerData, shouldCreateSpan, shouldAttachHeaders, spans, instrumentFetchRequestOptions) {
	if (!handlerData.fetchData) return;
	const { method, url } = handlerData.fetchData;
	const shouldCreateSpanResult = hasSpansEnabled() && shouldCreateSpan(url);
	if (handlerData.endTimestamp) {
		const spanId = handlerData.fetchData.__span;
		if (!spanId) return;
		const span2 = spans[spanId];
		if (span2) {
			if (shouldCreateSpanResult) {
				endSpan(span2, handlerData);
				_callOnRequestSpanEnd(span2, handlerData, instrumentFetchRequestOptions);
			}
			delete spans[spanId];
		}
		return;
	}
	const { spanOrigin = "auto.http.browser", propagateTraceparent = false, urlBase } = instrumentFetchRequestOptions ?? {};
	const client = getClient();
	const hasParent = !!getActiveSpan();
	const shouldEmitSpan = hasParent || !!client && hasSpanStreamingEnabled(client);
	const span = shouldCreateSpanResult && shouldEmitSpan ? startInactiveSpan$1(getSpanStartOptions(url, method, spanOrigin, client, urlBase)) : new SentryNonRecordingSpan();
	const spanForTraceHeaders = spanIsIgnored(span) && hasParent ? void 0 : span;
	if (shouldCreateSpanResult && !shouldEmitSpan) client?.recordDroppedEvent("no_parent_span", "span");
	handlerData.fetchData.__span = span.spanContext().spanId;
	spans[span.spanContext().spanId] = span;
	if (shouldAttachHeaders(handlerData.fetchData.url)) {
		const request = handlerData.args[0];
		const options = { ...handlerData.args[1] || {} };
		const headers = _INTERNAL_getTracingHeadersForFetchRequest(request, options, hasSpansEnabled() && shouldEmitSpan ? spanForTraceHeaders : void 0, propagateTraceparent);
		if (headers) {
			handlerData.args[1] = options;
			options.headers = headers;
		}
	}
	if (client) {
		const fetchHint = {
			input: handlerData.args,
			response: handlerData.response,
			startTimestamp: handlerData.startTimestamp,
			endTimestamp: handlerData.endTimestamp
		};
		client.emit("beforeOutgoingRequestSpan", span, fetchHint);
	}
	return span;
}
function _callOnRequestSpanEnd(span, handlerData, instrumentFetchRequestOptions) {
	instrumentFetchRequestOptions?.onRequestSpanEnd?.(span, {
		headers: handlerData.response?.headers,
		error: handlerData.error
	});
}
function _INTERNAL_getTracingHeadersForFetchRequest(request, fetchOptionsObj, span, propagateTraceparent) {
	const traceHeaders = getTraceData({
		span,
		propagateTraceparent
	});
	const sentryTrace = traceHeaders["sentry-trace"];
	const baggage = traceHeaders.baggage;
	const traceparent = traceHeaders.traceparent;
	if (!sentryTrace) return;
	const originalHeaders = fetchOptionsObj.headers || (isRequest(request) ? request.headers : void 0);
	if (!originalHeaders) return {
		"sentry-trace": sentryTrace,
		...baggage && { baggage },
		...traceparent && { traceparent }
	};
	else if (isHeaders(originalHeaders)) {
		const newHeaders = new Headers(originalHeaders);
		if (!newHeaders.get("sentry-trace")) newHeaders.set("sentry-trace", sentryTrace);
		if (propagateTraceparent && traceparent && !newHeaders.get("traceparent")) newHeaders.set("traceparent", traceparent);
		if (baggage) {
			const prevBaggageHeader = newHeaders.get("baggage");
			if (!prevBaggageHeader) newHeaders.set("baggage", baggage);
			else if (!baggageHeaderHasSentryBaggageValues(prevBaggageHeader)) newHeaders.set("baggage", `${prevBaggageHeader},${baggage}`);
		}
		return newHeaders;
	} else if (isHeadersInitTupleArray(originalHeaders)) {
		const newHeaders = [...originalHeaders];
		if (!newHeaders.find((header) => header[0] === "sentry-trace")) newHeaders.push(["sentry-trace", sentryTrace]);
		if (propagateTraceparent && traceparent && !newHeaders.find((header) => header[0] === "traceparent")) newHeaders.push(["traceparent", traceparent]);
		const prevBaggageHeaderWithSentryValues = originalHeaders.find((header) => header[0] === "baggage" && typeof header[1] === "string" && baggageHeaderHasSentryBaggageValues(header[1]));
		if (baggage && !prevBaggageHeaderWithSentryValues) newHeaders.push(["baggage", baggage]);
		return newHeaders;
	} else {
		const existingSentryTraceHeader = "sentry-trace" in originalHeaders ? originalHeaders["sentry-trace"] : void 0;
		const existingTraceparentHeader = "traceparent" in originalHeaders ? originalHeaders.traceparent : void 0;
		const existingBaggageHeader = "baggage" in originalHeaders ? originalHeaders.baggage : void 0;
		const newBaggageHeaders = existingBaggageHeader ? Array.isArray(existingBaggageHeader) ? [...existingBaggageHeader] : [existingBaggageHeader] : [];
		const prevBaggageHeaderWithSentryValues = existingBaggageHeader && (Array.isArray(existingBaggageHeader) ? existingBaggageHeader.find((headerItem) => baggageHeaderHasSentryBaggageValues(headerItem)) : baggageHeaderHasSentryBaggageValues(existingBaggageHeader));
		if (baggage && !prevBaggageHeaderWithSentryValues) newBaggageHeaders.push(baggage);
		const newHeaders = Object.assign({}, originalHeaders, {
			"sentry-trace": existingSentryTraceHeader ?? sentryTrace,
			...newBaggageHeaders.length > 0 && { baggage: newBaggageHeaders.join(",") }
		});
		if (propagateTraceparent && traceparent && !existingTraceparentHeader) newHeaders.traceparent = traceparent;
		return newHeaders;
	}
}
function endSpan(span, handlerData) {
	if (handlerData.response) {
		setHttpStatus(span, handlerData.response.status);
		const contentLength = handlerData.response?.headers?.get("content-length");
		if (contentLength) {
			const contentLengthNum = parseInt(contentLength);
			if (contentLengthNum > 0) span.setAttribute(dl, contentLengthNum);
		}
	} else if (handlerData.error) span.setStatus({
		code: 2,
		message: "internal_error"
	});
	span.end();
}
function baggageHeaderHasSentryBaggageValues(baggageHeader) {
	if (typeof baggageHeader !== "string") return false;
	return baggageHeader.split(",").some((baggageEntry) => baggageEntry.trim().startsWith(SENTRY_BAGGAGE_KEY_PREFIX));
}
function isHeaders(headers) {
	return typeof Headers !== "undefined" && isInstanceOf(headers, Headers);
}
function isHeadersInitTupleArray(headers) {
	if (!Array.isArray(headers)) return false;
	return headers.every((item) => Array.isArray(item) && item.length === 2 && typeof item[0] === "string");
}
function getSpanStartOptions(url, method, spanOrigin, client, urlBase) {
	const isStreamed = !!client && hasSpanStreamingEnabled(client);
	const domain = getUrlDomain(url, urlBase);
	if (url.startsWith("data:")) {
		const sanitizedUrl2 = stripDataUrlContent(url);
		return {
			name: isStreamed ? method : `${method} ${sanitizedUrl2}`,
			attributes: getFetchSpanAttributes(url, void 0, method, spanOrigin, client, domain)
		};
	}
	const parsedUrl = parseStringToURLObject(url);
	const sanitizedUrl = parsedUrl ? getSanitizedUrlStringFromUrlObject(parsedUrl) : url;
	return {
		name: isStreamed ? domain ? `${method} ${domain}` : method : `${method} ${sanitizedUrl}`,
		attributes: getFetchSpanAttributes(url, parsedUrl, method, spanOrigin, client, domain)
	};
}
function getFetchSpanAttributes(url, parsedUrl, method, spanOrigin, client, domain) {
	const attributes = {
		[Fg]: filterCollectedUrl(stripDataUrlContent(url), client),
		type: "fetch",
		[$o]: method,
		[sb]: spanOrigin,
		[ab]: CE,
		[Kg]: domain
	};
	if (parsedUrl) {
		if (!isURLObjectRelative(parsedUrl)) {
			attributes[Fg] = filterCollectedUrl(stripDataUrlContent(parsedUrl.href), client);
			attributes[Kb] = parsedUrl.hostname;
			attributes[Hb] = parsedUrl.port ? Number(parsedUrl.port) : void 0;
		}
		attributes[ey] = filterCollectedUrlQuery(getUrlQuery(parsedUrl.search), client);
		attributes[Vg] = getUrlFragment(parsedUrl.hash);
	}
	return attributes;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/supports.js
var WINDOW$6 = GLOBAL_OBJ;
function _isFetchSupported() {
	if (!("fetch" in WINDOW$6)) return false;
	try {
		new Headers();
		new Request("data:,");
		new Response();
		return true;
	} catch {
		return false;
	}
}
function isNativeFunction(func) {
	return func && /^function\s+\w+\(\)\s+\{\s+\[native code\]\s+\}$/.test(func.toString());
}
function supportsNativeFetch() {
	if (typeof EdgeRuntime === "string") return true;
	if (!_isFetchSupported()) return false;
	if (isNativeFunction(WINDOW$6.fetch)) return true;
	let result = false;
	const doc = WINDOW$6.document;
	if (doc && typeof doc.createElement === "function") try {
		const sandbox = doc.createElement("iframe");
		sandbox.hidden = true;
		doc.head.appendChild(sandbox);
		if (sandbox.contentWindow?.fetch) result = isNativeFunction(sandbox.contentWindow.fetch);
		doc.head.removeChild(sandbox);
	} catch (err) {
		DEBUG_BUILD$5 && debug$2.warn("Could not create sandbox iframe for pure fetch check, bailing to window.fetch: ", err);
	}
	return result;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/instrument/fetch.js
function addFetchInstrumentationHandler(handler) {
	const type = "fetch";
	const removeHandler = addHandler$1(type, handler);
	maybeInstrument(type, () => instrumentFetch());
	return removeHandler;
}
function addFetchEndInstrumentationHandler(handler) {
	const type = "fetch-body-resolved";
	const removeHandler = addHandler$1(type, handler);
	maybeInstrument(type, () => instrumentFetch(streamHandler));
	return removeHandler;
}
function instrumentFetch(onFetchResolved) {
	if (isBrowser() && !supportsNativeFetch()) return;
	fill(GLOBAL_OBJ, "fetch", function(originalFetch) {
		return new Proxy(originalFetch, { apply(target, _thisArg, args) {
			const virtualError = /* @__PURE__ */ new Error();
			const { method, url } = parseFetchArgs(args);
			const handlerData = {
				args,
				fetchData: {
					method,
					url
				},
				startTimestamp: timestampInSeconds() * 1e3,
				virtualError,
				headers: getHeadersFromFetchArgs(args)
			};
			if (!onFetchResolved) triggerHandlers$1("fetch", { ...handlerData });
			return Reflect.apply(target, GLOBAL_OBJ, args).then(async (response) => {
				if (onFetchResolved) onFetchResolved(response);
				else triggerHandlers$1("fetch", {
					...handlerData,
					endTimestamp: timestampInSeconds() * 1e3,
					response
				});
				return response;
			}, (error) => {
				triggerHandlers$1("fetch", {
					...handlerData,
					endTimestamp: timestampInSeconds() * 1e3,
					error
				});
				if (isError(error) && error.stack === void 0) {
					error.stack = virtualError.stack;
					addNonEnumerableProperty(error, "framesToPop", 1);
				}
				const enhanceOption = getClient()?.getOptions().enhanceFetchErrorMessages ?? "always";
				if (enhanceOption !== false && isError(error) && error.name === "TypeError" && (error.message === "Failed to fetch" || error.message === "Load failed" || error.message === "NetworkError when attempting to fetch resource.")) try {
					const hostname = new URL(handlerData.fetchData.url, GLOBAL_OBJ.location?.href).host;
					if (hostname) {
						if (enhanceOption === "always") error.message = `${error.message} (${hostname})`;
						else addNonEnumerableProperty(error, "__sentry_fetch_url_host__", hostname);
					}
				} catch {}
				throw error;
			});
		} });
	});
}
async function resolveResponse(res, onFinishedResolving) {
	if (res?.body) {
		const body = res.body;
		const responseReader = body.getReader();
		const maxFetchDurationTimeout = setTimeout(() => {
			body.cancel().then(null, () => {});
		}, 9e4);
		let readingActive = true;
		while (readingActive) {
			let chunkTimeout;
			try {
				chunkTimeout = setTimeout(() => {
					body.cancel().then(null, () => {});
				}, 5e3);
				const { done } = await responseReader.read();
				clearTimeout(chunkTimeout);
				if (done) {
					onFinishedResolving();
					readingActive = false;
				}
			} catch {
				readingActive = false;
			} finally {
				clearTimeout(chunkTimeout);
			}
		}
		clearTimeout(maxFetchDurationTimeout);
		responseReader.releaseLock();
		body.cancel().then(null, () => {});
	}
}
function streamHandler(response) {
	let clonedResponseForResolving;
	try {
		clonedResponseForResolving = response.clone();
	} catch {
		return;
	}
	resolveResponse(clonedResponseForResolving, () => {
		triggerHandlers$1("fetch-body-resolved", {
			endTimestamp: timestampInSeconds() * 1e3,
			response
		});
	});
}
function hasProp(obj, prop) {
	return isObjectLike(obj) && !!obj[prop];
}
function getUrlFromResource(resource) {
	if (typeof resource === "string") return resource;
	if (!resource) return "";
	if (hasProp(resource, "url")) return resource.url;
	if (resource.toString) return resource.toString();
	return "";
}
function parseFetchArgs(fetchArgs) {
	if (fetchArgs.length === 0) return {
		method: "GET",
		url: ""
	};
	if (fetchArgs.length === 2) {
		const [resource, options] = fetchArgs;
		return {
			url: getUrlFromResource(resource),
			method: hasProp(options, "method") ? String(options.method).toUpperCase() : isRequest(resource) && hasProp(resource, "method") ? String(resource.method).toUpperCase() : "GET"
		};
	}
	const arg = fetchArgs[0];
	return {
		url: getUrlFromResource(arg),
		method: hasProp(arg, "method") ? String(arg.method).toUpperCase() : "GET"
	};
}
function getHeadersFromFetchArgs(fetchArgs) {
	const [requestArgument, optionsArgument] = fetchArgs;
	try {
		if (typeof optionsArgument === "object" && optionsArgument !== null && "headers" in optionsArgument && optionsArgument.headers) return new Headers(optionsArgument.headers);
		if (isRequest(requestArgument)) return new Headers(requestArgument.headers);
	} catch {}
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/breadcrumb-log-level.js
function getBreadcrumbLogLevelFromHttpStatusCode(statusCode) {
	if (statusCode === void 0) return;
	else if (statusCode >= 400 && statusCode < 500) return "warning";
	else if (statusCode >= 500) return "error";
	else return;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/utils/lru.js
var LRUMap = class {
	constructor(_maxSize) {
		this._maxSize = _maxSize;
		this._cache = /* @__PURE__ */ new Map();
	}
	/** Get the current size of the cache */
	get size() {
		return this._cache.size;
	}
	/** Get an entry or undefined if it was not in the cache. Re-inserts to update the recently used order */
	get(key) {
		const value = this._cache.get(key);
		if (value === void 0) return;
		this._cache.delete(key);
		this._cache.set(key, value);
		return value;
	}
	/** Insert an entry and evict an older entry if we've reached maxSize */
	set(key, value) {
		this._cache.delete(key);
		if (this._cache.size >= this._maxSize) {
			const nextKey = this._cache.keys().next().value;
			this._cache.delete(nextKey);
		}
		this._cache.set(key, value);
	}
	/** Remove an entry and return the entry if it was in the cache */
	remove(key) {
		const value = this._cache.get(key);
		if (value) this._cache.delete(key);
		return value;
	}
	/** Clear all entries */
	clear() {
		this._cache.clear();
	}
	/** Get all the keys */
	keys() {
		return Array.from(this._cache.keys());
	}
	/** Get all the values */
	values() {
		const values = [];
		this._cache.forEach((value) => values.push(value));
		return values;
	}
};
// ../DnD helper/node_modules/@sentry/core/build/esm/feedback.js
function captureFeedback(params, hint = {}, scope = getCurrentScope()) {
	const { message, name, email, url, source, associatedEventId, tags } = params;
	const feedbackEvent = {
		contexts: { feedback: {
			contact_email: email,
			name,
			message,
			url,
			source,
			associated_event_id: associatedEventId
		} },
		type: "feedback",
		level: "info",
		tags
	};
	const client = scope?.getClient() || getClient();
	if (client) client.emit("beforeSendFeedback", feedbackEvent, hint);
	return scope.captureEvent(feedbackEvent, hint);
}
// ../DnD helper/node_modules/@sentry/core/build/esm/logs/public-api.js
var public_api_exports = /* @__PURE__ */ __exportAll({
	debug: () => debug$1,
	error: () => error,
	fatal: () => fatal,
	fmt: () => fmt,
	info: () => info,
	trace: () => trace,
	warn: () => warn
});
function captureLog(level, message, attributes, scope, severityNumber) {
	_INTERNAL_captureLog({
		level,
		message,
		attributes,
		severityNumber
	}, scope);
}
function trace(message, attributes, { scope } = {}) {
	captureLog("trace", message, attributes, scope);
}
function debug$1(message, attributes, { scope } = {}) {
	captureLog("debug", message, attributes, scope);
}
function info(message, attributes, { scope } = {}) {
	captureLog("info", message, attributes, scope);
}
function warn(message, attributes, { scope } = {}) {
	captureLog("warn", message, attributes, scope);
}
function error(message, attributes, { scope } = {}) {
	captureLog("error", message, attributes, scope);
}
function fatal(message, attributes, { scope } = {}) {
	captureLog("fatal", message, attributes, scope);
}
// ../DnD helper/node_modules/@sentry/core/build/esm/logs/utils.js
function formatConsoleArgs(values, normalizeDepth, normalizeMaxBreadth) {
	return "util" in GLOBAL_OBJ && typeof GLOBAL_OBJ.util.format === "function" ? GLOBAL_OBJ.util.format(...values) : safeJoinConsoleArgs(values, normalizeDepth, normalizeMaxBreadth);
}
function safeJoinConsoleArgs(values, normalizeDepth, normalizeMaxBreadth) {
	return values.map((value) => isPrimitive(value) ? String(value) : JSON.stringify(normalize(value, normalizeDepth, normalizeMaxBreadth))).join(" ");
}
function hasConsoleSubstitutions(str) {
	return /%[sdifocO]/.test(str);
}
function createConsoleTemplateAttributes(firstArg, followingArgs) {
	const attributes = {};
	attributes[Vm] = `${firstArg} ${new Array(followingArgs.length).fill("{}").join(" ")}`;
	followingArgs.forEach((arg, index) => {
		attributes[`sentry.message.parameter.${index}`] = arg;
	});
	return attributes;
}
// ../DnD helper/node_modules/@sentry/core/build/esm/logs/console-integration.js
var INTEGRATION_NAME$18 = "ConsoleLogs";
var DEFAULT_ATTRIBUTES = { [sb]: "auto.log.console" };
var _consoleLoggingIntegration = ((options = {}) => {
	const levels = options.levels || CONSOLE_LEVELS$1;
	return {
		name: INTEGRATION_NAME$18,
		setup(client) {
			const { normalizeDepth = 3, normalizeMaxBreadth = 1e3 } = client.getOptions();
			const unsubscribe = addConsoleInstrumentationHandler(({ args, level }) => {
				if (getClient() !== client || !levels.includes(level)) return;
				const firstArg = args[0];
				const followingArgs = args.slice(1);
				if (level === "assert") {
					if (!firstArg) _INTERNAL_captureLog({
						level: "error",
						message: followingArgs.length > 0 ? `Assertion failed: ${formatConsoleArgs(followingArgs, normalizeDepth, normalizeMaxBreadth)}` : "Assertion failed",
						attributes: DEFAULT_ATTRIBUTES
					});
					return;
				}
				const isLevelLog = level === "log";
				const attributes = { ...DEFAULT_ATTRIBUTES };
				if (isPlainObject(firstArg)) {
					Object.assign(attributes, normalize(firstArg, normalizeDepth, normalizeMaxBreadth));
					const remainingArgsStartIndex = typeof args[1] === "string" ? 2 : 1;
					args.slice(remainingArgsStartIndex).forEach((arg, index) => {
						attributes[`sentry.message.parameter.${index}`] = normalize(arg, normalizeDepth, normalizeMaxBreadth);
					});
				} else if (followingArgs.length > 0 && typeof firstArg === "string" && !hasConsoleSubstitutions(firstArg)) {
					const templateAttrs = createConsoleTemplateAttributes(firstArg, followingArgs);
					for (const [key, value] of Object.entries(templateAttrs)) attributes[key] = key.startsWith("sentry.message.parameter.") ? normalize(value, normalizeDepth, normalizeMaxBreadth) : value;
				}
				_INTERNAL_captureLog({
					level: isLevelLog ? "info" : level,
					message: formatConsoleArgs(args, normalizeDepth, normalizeMaxBreadth),
					severityNumber: isLevelLog ? 10 : void 0,
					attributes
				});
			});
			client.registerCleanup(unsubscribe);
		}
	};
});
var consoleLoggingIntegration = defineIntegration(_consoleLoggingIntegration);
// ../DnD helper/node_modules/@sentry/core/build/esm/metrics/public-api.js
var public_api_exports$1 = /* @__PURE__ */ __exportAll({
	count: () => count,
	distribution: () => distribution,
	gauge: () => gauge
});
function captureMetric(type, name, value, options) {
	_INTERNAL_captureMetric({
		type,
		name,
		value,
		unit: options?.unit,
		attributes: options?.attributes
	}, { scope: options?.scope });
}
function count(name, value = 1, options) {
	captureMetric("counter", name, value, options);
}
function gauge(name, value, options) {
	captureMetric("gauge", name, value, options);
}
function distribution(name, value, options) {
	captureMetric("distribution", name, value, options);
}
// ../DnD helper/node_modules/@sentry/core/build/esm/integrations/consola.js
var DEFAULT_CAPTURED_LEVELS = [
	"trace",
	"debug",
	"info",
	"warn",
	"error",
	"fatal"
];
function createConsolaReporter(options = {}) {
	const levels = new Set(options.levels ?? DEFAULT_CAPTURED_LEVELS);
	const providedClient = options.client;
	return { log(logObj) {
		const { type, level, message: consolaMessage, args, tag, date: _date, ...rest } = logObj;
		const client = providedClient || getClient();
		if (!client) return;
		const logSeverityLevel = getLogSeverityLevel(type, level);
		if (!levels.has(logSeverityLevel)) return;
		const { normalizeDepth = 3, normalizeMaxBreadth = 1e3 } = client.getOptions();
		const attributes = {};
		for (const [key, value] of Object.entries(rest)) attributes[key] = normalize(value, normalizeDepth, normalizeMaxBreadth);
		attributes[sb] = "auto.log.consola";
		if (tag) attributes["consola.tag"] = tag;
		if (type) attributes["consola.type"] = type;
		if (level != null && typeof level === "number") attributes["consola.level"] = level;
		const extractionResult = processExtractedAttributes(defaultExtractAttributes(args, normalizeDepth, normalizeMaxBreadth), normalizeDepth, normalizeMaxBreadth);
		if (extractionResult?.attributes) Object.assign(attributes, extractionResult.attributes);
		_INTERNAL_captureLog({
			level: logSeverityLevel,
			message: extractionResult?.message || consolaMessage || args && formatConsoleArgs(args, normalizeDepth, normalizeMaxBreadth) || "",
			attributes
		});
	} };
}
var CONSOLA_TYPE_TO_LOG_SEVERITY_LEVEL_MAP = {
	silent: "trace",
	fatal: "fatal",
	error: "error",
	warn: "warn",
	log: "info",
	info: "info",
	success: "info",
	fail: "error",
	ready: "info",
	start: "info",
	box: "info",
	debug: "debug",
	trace: "trace",
	verbose: "debug",
	critical: "fatal",
	notice: "info"
};
var CONSOLA_LEVEL_TO_LOG_SEVERITY_LEVEL_MAP = {
	0: "fatal",
	1: "warn",
	2: "info",
	3: "info",
	4: "debug",
	5: "trace"
};
function getLogSeverityLevel(type, level) {
	if (type === "verbose") return "debug";
	if (type === "silent") return "trace";
	if (type) {
		const mappedLevel = CONSOLA_TYPE_TO_LOG_SEVERITY_LEVEL_MAP[type];
		if (mappedLevel) return mappedLevel;
	}
	if (typeof level === "number") {
		const mappedLevel = CONSOLA_LEVEL_TO_LOG_SEVERITY_LEVEL_MAP[level];
		if (mappedLevel) return mappedLevel;
	}
	return "info";
}
function defaultExtractAttributes(args, normalizeDepth, normalizeMaxBreadth) {
	if (!args?.length) return { message: "" };
	const message = formatConsoleArgs(args, normalizeDepth, normalizeMaxBreadth);
	const firstArg = args[0];
	if (isPlainObject(firstArg)) {
		const remainingArgsStartIndex = typeof args[1] === "string" ? 2 : 1;
		return {
			message,
			attributes: firstArg,
			messageParameters: args.slice(remainingArgsStartIndex)
		};
	} else {
		const followingArgs = args.slice(1);
		const shouldAddTemplateAttr = followingArgs.length > 0 && typeof firstArg === "string" && !hasConsoleSubstitutions(firstArg);
		return {
			message,
			messageTemplate: shouldAddTemplateAttr ? firstArg : void 0,
			messageParameters: shouldAddTemplateAttr ? followingArgs : void 0
		};
	}
}
function processExtractedAttributes(extractionResult, normalizeDepth, normalizeMaxBreadth) {
	const { message, attributes, messageTemplate, messageParameters } = extractionResult;
	const messageParamAttributes = {};
	if (messageTemplate && messageParameters) {
		const templateAttrs = createConsoleTemplateAttributes(messageTemplate, messageParameters);
		for (const [key, value] of Object.entries(templateAttrs)) messageParamAttributes[key] = key.startsWith("sentry.message.parameter.") ? normalize(value, normalizeDepth, normalizeMaxBreadth) : value;
	} else if (messageParameters && messageParameters.length > 0) messageParameters.forEach((arg, index) => {
		messageParamAttributes[`sentry.message.parameter.${index}`] = normalize(arg, normalizeDepth, normalizeMaxBreadth);
	});
	return {
		message,
		attributes: {
			...normalize(attributes, normalizeDepth, normalizeMaxBreadth),
			...messageParamAttributes
		}
	};
}
// ../DnD helper/node_modules/@sentry/feedback/build/npm/esm/index.js
var WINDOW$5 = GLOBAL_OBJ;
var DOCUMENT = WINDOW$5.document;
var NAVIGATOR$1 = WINDOW$5.navigator;
var TRIGGER_LABEL = "Report a Bug";
var CANCEL_BUTTON_LABEL = "Cancel";
var SUBMIT_BUTTON_LABEL = "Send Bug Report";
var CONFIRM_BUTTON_LABEL = "Confirm";
var FORM_TITLE = "Report a Bug";
var EMAIL_PLACEHOLDER = "your.email@example.org";
var EMAIL_LABEL = "Email";
var MESSAGE_PLACEHOLDER = "What's the bug? What did you expect?";
var MESSAGE_LABEL = "Description";
var NAME_PLACEHOLDER = "Your Name";
var NAME_LABEL = "Name";
var SUCCESS_MESSAGE_TEXT = "Thank you for your report!";
var IS_REQUIRED_LABEL = "(required)";
var ADD_SCREENSHOT_LABEL = "Add a screenshot";
var REMOVE_SCREENSHOT_LABEL = "Remove screenshot";
var HIGHLIGHT_TOOL_TEXT = "Highlight";
var HIDE_TOOL_TEXT = "Hide";
var REMOVE_HIGHLIGHT_TEXT = "Remove";
var ERROR_EMPTY_MESSAGE_TEXT = "Unable to submit feedback with empty message";
var ERROR_NO_CLIENT_TEXT = "No client setup, cannot send feedback.";
var ERROR_TIMEOUT_TEXT = "Unable to determine if Feedback was correctly sent.";
var ERROR_FORBIDDEN_TEXT = "Unable to send feedback. This could be because this domain is not in your list of allowed domains.";
var ERROR_GENERIC_TEXT = "Unable to send feedback. This could be because of network issues, or because you are using an ad-blocker.";
var FEEDBACK_WIDGET_SOURCE = "widget";
var FEEDBACK_API_SOURCE = "api";
var SUCCESS_MESSAGE_TIMEOUT = 5e3;
var DEFAULT_MESSAGES = {
	ERROR_EMPTY_MESSAGE: ERROR_EMPTY_MESSAGE_TEXT,
	ERROR_NO_CLIENT: ERROR_NO_CLIENT_TEXT,
	ERROR_TIMEOUT: ERROR_TIMEOUT_TEXT,
	ERROR_FORBIDDEN: ERROR_FORBIDDEN_TEXT,
	ERROR_GENERIC: ERROR_GENERIC_TEXT
};
function resolveFeedbackErrorMessage(code, messages) {
	return messages?.[code] ?? DEFAULT_MESSAGES[code];
}
function createFeedbackError(code, messages) {
	return new Error(resolveFeedbackErrorMessage(code, messages));
}
var sendFeedback = (params, hint = { includeReplay: true }) => {
	const errorMessages = hint.errorMessages;
	if (!params.message) throw createFeedbackError("ERROR_EMPTY_MESSAGE", errorMessages);
	const client = getClient();
	if (!client) throw createFeedbackError("ERROR_NO_CLIENT", errorMessages);
	if (params.tags && Object.keys(params.tags).length) getCurrentScope().setTags(params.tags);
	const eventId = captureFeedback({
		source: FEEDBACK_API_SOURCE,
		url: _getLocationHref(),
		...params
	}, hint);
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			cleanup();
			reject(createFeedbackError("ERROR_TIMEOUT", errorMessages));
		}, 3e4);
		const cleanup = client.on("afterSendEvent", (event, response) => {
			if (event.event_id !== eventId) return;
			clearTimeout(timeout);
			cleanup();
			if (response?.statusCode && response.statusCode >= 200 && response.statusCode < 300) return resolve(eventId);
			if (response?.statusCode === 403) return reject(createFeedbackError("ERROR_FORBIDDEN", errorMessages));
			return reject(createFeedbackError("ERROR_GENERIC", errorMessages));
		});
	});
};
function _getLocationHref() {
	try {
		return WINDOW$5.document.location.href;
	} catch {
		return "";
	}
}
var DEBUG_BUILD$4 = typeof __SENTRY_DEBUG__ === "undefined" || __SENTRY_DEBUG__;
function isScreenshotSupported() {
	if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(NAVIGATOR$1.userAgent)) return false;
	if (/Macintosh/i.test(NAVIGATOR$1.userAgent) && NAVIGATOR$1.maxTouchPoints && NAVIGATOR$1.maxTouchPoints > 1) return false;
	if (!isSecureContext) return false;
	return true;
}
function mergeOptions(defaultOptions, optionOverrides) {
	return {
		...defaultOptions,
		...optionOverrides,
		tags: {
			...defaultOptions.tags,
			...optionOverrides.tags
		},
		onFormOpen: () => {
			optionOverrides.onFormOpen?.();
			defaultOptions.onFormOpen?.();
		},
		onFormClose: () => {
			optionOverrides.onFormClose?.();
			defaultOptions.onFormClose?.();
		},
		onSubmitSuccess: (data, eventId) => {
			optionOverrides.onSubmitSuccess?.(data, eventId);
			defaultOptions.onSubmitSuccess?.(data, eventId);
		},
		onSubmitError: (error) => {
			optionOverrides.onSubmitError?.(error);
			defaultOptions.onSubmitError?.(error);
		},
		onFormSubmitted: () => {
			optionOverrides.onFormSubmitted?.();
			defaultOptions.onFormSubmitted?.();
		},
		themeDark: {
			...defaultOptions.themeDark,
			...optionOverrides.themeDark
		},
		themeLight: {
			...defaultOptions.themeLight,
			...optionOverrides.themeLight
		}
	};
}
function createActorStyles(styleNonce) {
	const style = DOCUMENT.createElement("style");
	style.textContent = `
.widget__actor {
  position: fixed;
  z-index: var(--z-index);
  margin: var(--page-margin);
  inset: var(--actor-inset);

  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;

  font-family: inherit;
  font-size: var(--font-size);
  font-weight: 600;
  line-height: 1.14em;
  text-decoration: none;

  background: var(--actor-background, var(--background));
  border-radius: var(--actor-border-radius, 1.7em/50%);
  border: var(--actor-border, var(--border));
  box-shadow: var(--actor-box-shadow, var(--box-shadow));
  color: var(--actor-color, var(--foreground));
  fill: var(--actor-color, var(--foreground));
  cursor: pointer;
  opacity: 1;
  transition: transform 0.2s ease-in-out;
  transform: translate(0, 0) scale(1);
}
.widget__actor[aria-hidden="true"] {
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
  transform: translate(0, 16px) scale(0.98);
}

.widget__actor:hover {
  background: var(--actor-hover-background, var(--background));
  filter: var(--interactive-filter);
}

.widget__actor svg {
  width: 1.14em;
  height: 1.14em;
}

@media (max-width: 600px) {
  .widget__actor span {
    display: none;
  }
}
`;
	if (styleNonce) style.setAttribute("nonce", styleNonce);
	return style;
}
function setAttributesNS(el, attributes) {
	Object.entries(attributes).forEach(([key, val]) => {
		el.setAttributeNS(null, key, val);
	});
	return el;
}
var SIZE = 20;
var XMLNS$2 = "http://www.w3.org/2000/svg";
function FeedbackIcon() {
	const createElementNS = (tagName) => WINDOW$5.document.createElementNS(XMLNS$2, tagName);
	const svg = setAttributesNS(createElementNS("svg"), {
		width: `${SIZE}`,
		height: `${SIZE}`,
		viewBox: `0 0 ${SIZE} ${SIZE}`,
		fill: "var(--actor-color, var(--foreground))"
	});
	const g = setAttributesNS(createElementNS("g"), { clipPath: "url(#clip0_57_80)" });
	const path = setAttributesNS(createElementNS("path"), {
		["fill-rule"]: "evenodd",
		["clip-rule"]: "evenodd",
		d: "M15.6622 15H12.3997C12.2129 14.9959 12.031 14.9396 11.8747 14.8375L8.04965 12.2H7.49956V19.1C7.4875 19.3348 7.3888 19.5568 7.22256 19.723C7.05632 19.8892 6.83435 19.9879 6.59956 20H2.04956C1.80193 19.9968 1.56535 19.8969 1.39023 19.7218C1.21511 19.5467 1.1153 19.3101 1.11206 19.0625V12.2H0.949652C0.824431 12.2017 0.700142 12.1783 0.584123 12.1311C0.468104 12.084 0.362708 12.014 0.274155 11.9255C0.185602 11.8369 0.115689 11.7315 0.0685419 11.6155C0.0213952 11.4995 -0.00202913 11.3752 -0.00034808 11.25V3.75C-0.00900498 3.62067 0.0092504 3.49095 0.0532651 3.36904C0.0972798 3.24712 0.166097 3.13566 0.255372 3.04168C0.344646 2.94771 0.452437 2.87327 0.571937 2.82307C0.691437 2.77286 0.82005 2.74798 0.949652 2.75H8.04965L11.8747 0.1625C12.031 0.0603649 12.2129 0.00407221 12.3997 0H15.6622C15.9098 0.00323746 16.1464 0.103049 16.3215 0.278167C16.4966 0.453286 16.5964 0.689866 16.5997 0.9375V3.25269C17.3969 3.42959 18.1345 3.83026 18.7211 4.41679C19.5322 5.22788 19.9878 6.32796 19.9878 7.47502C19.9878 8.62209 19.5322 9.72217 18.7211 10.5333C18.1345 11.1198 17.3969 11.5205 16.5997 11.6974V14.0125C16.6047 14.1393 16.5842 14.2659 16.5395 14.3847C16.4948 14.5035 16.4268 14.6121 16.3394 14.7042C16.252 14.7962 16.147 14.8698 16.0307 14.9206C15.9144 14.9714 15.7891 14.9984 15.6622 15ZM1.89695 10.325H1.88715V4.625H8.33715C8.52423 4.62301 8.70666 4.56654 8.86215 4.4625L12.6872 1.875H14.7247V13.125H12.6872L8.86215 10.4875C8.70666 10.3835 8.52423 10.327 8.33715 10.325H2.20217C2.15205 10.3167 2.10102 10.3125 2.04956 10.3125C1.9981 10.3125 1.94708 10.3167 1.89695 10.325ZM2.98706 12.2V18.1625H5.66206V12.2H2.98706ZM16.5997 9.93612V5.01393C16.6536 5.02355 16.7072 5.03495 16.7605 5.04814C17.1202 5.13709 17.4556 5.30487 17.7425 5.53934C18.0293 5.77381 18.2605 6.06912 18.4192 6.40389C18.578 6.73866 18.6603 7.10452 18.6603 7.47502C18.6603 7.84552 18.578 8.21139 18.4192 8.54616C18.2605 8.88093 18.0293 9.17624 17.7425 9.41071C17.4556 9.64518 17.1202 9.81296 16.7605 9.90191C16.7072 9.91509 16.6536 9.9265 16.5997 9.93612Z"
	});
	svg.appendChild(g).appendChild(path);
	const speakerDefs = createElementNS("defs");
	const speakerClipPathDef = setAttributesNS(createElementNS("clipPath"), { id: "clip0_57_80" });
	const speakerRect = setAttributesNS(createElementNS("rect"), {
		width: `${SIZE}`,
		height: `${SIZE}`,
		fill: "white"
	});
	speakerClipPathDef.appendChild(speakerRect);
	speakerDefs.appendChild(speakerClipPathDef);
	svg.appendChild(speakerDefs).appendChild(speakerClipPathDef).appendChild(speakerRect);
	return svg;
}
function Actor({ triggerLabel, triggerAriaLabel, shadow, styleNonce }) {
	const el = DOCUMENT.createElement("button");
	el.type = "button";
	el.className = "widget__actor";
	el.ariaHidden = "false";
	el.ariaLabel = triggerAriaLabel || triggerLabel || TRIGGER_LABEL;
	el.appendChild(FeedbackIcon());
	if (triggerLabel) {
		const label = DOCUMENT.createElement("span");
		label.appendChild(DOCUMENT.createTextNode(triggerLabel));
		el.appendChild(label);
	}
	const style = createActorStyles(styleNonce);
	return {
		el,
		appendToDom() {
			shadow.appendChild(style);
			shadow.appendChild(el);
		},
		removeFromDom() {
			el.remove();
			style.remove();
		},
		show() {
			el.ariaHidden = "false";
		},
		hide() {
			el.ariaHidden = "true";
		}
	};
}
var PURPLE = "rgba(88, 74, 192, 1)";
var DEFAULT_LIGHT = {
	foreground: "#2b2233",
	background: "#ffffff",
	accentForeground: "white",
	accentBackground: PURPLE,
	successColor: "#268d75",
	errorColor: "#df3338",
	border: "1.5px solid rgba(41, 35, 47, 0.13)",
	boxShadow: "0px 4px 24px 0px rgba(43, 34, 51, 0.12)",
	outline: "1px auto var(--accent-background)",
	interactiveFilter: "brightness(95%)"
};
var DEFAULT_DARK = {
	foreground: "#ebe6ef",
	background: "#29232f",
	accentForeground: "white",
	accentBackground: PURPLE,
	successColor: "#2da98c",
	errorColor: "#f55459",
	border: "1.5px solid rgba(235, 230, 239, 0.15)",
	boxShadow: "0px 4px 24px 0px rgba(43, 34, 51, 0.12)",
	outline: "1px auto var(--accent-background)",
	interactiveFilter: "brightness(150%)"
};
function getThemedCssVariables(theme) {
	return `
  --foreground: ${theme.foreground};
  --background: ${theme.background};
  --accent-foreground: ${theme.accentForeground};
  --accent-background: ${theme.accentBackground};
  --success-color: ${theme.successColor};
  --error-color: ${theme.errorColor};
  --border: ${theme.border};
  --box-shadow: ${theme.boxShadow};
  --outline: ${theme.outline};
  --interactive-filter: ${theme.interactiveFilter};
  `;
}
function createMainStyles({ colorScheme, themeDark, themeLight, styleNonce }) {
	const style = DOCUMENT.createElement("style");
	style.textContent = `
:host {
  --font-family: system-ui, 'Helvetica Neue', Arial, sans-serif;
  --font-size: 14px;
  --z-index: 100000;

  --page-margin: 16px;
  --inset: auto 0 0 auto;
  --actor-inset: var(--inset);

  font-family: var(--font-family);
  font-size: var(--font-size);

  ${colorScheme !== "system" ? `color-scheme: only ${colorScheme};` : ""}

  ${getThemedCssVariables(colorScheme === "dark" ? {
		...DEFAULT_DARK,
		...themeDark
	} : {
		...DEFAULT_LIGHT,
		...themeLight
	})}
}

${colorScheme === "system" ? `
@media (prefers-color-scheme: dark) {
  :host {
    color-scheme: only dark;

    ${getThemedCssVariables({
		...DEFAULT_DARK,
		...themeDark
	})}
  }
}` : ""}
`;
	if (styleNonce) style.setAttribute("nonce", styleNonce);
	return style;
}
var buildFeedbackIntegration = ({ lazyLoadIntegration, getModalIntegration, getScreenshotIntegration }) => {
	const feedbackIntegration = (({ id = "sentry-feedback", autoInject = true, showBranding = true, isEmailRequired = false, isNameRequired = false, showEmail = true, showName = true, enableScreenshot = true, useSentryUser = {
		email: "email",
		name: "username"
	}, tags, styleNonce, scriptNonce, colorScheme = "system", themeLight = {}, themeDark = {}, addScreenshotButtonLabel = ADD_SCREENSHOT_LABEL, cancelButtonLabel = CANCEL_BUTTON_LABEL, confirmButtonLabel = CONFIRM_BUTTON_LABEL, emailLabel = EMAIL_LABEL, emailPlaceholder = EMAIL_PLACEHOLDER, formTitle = FORM_TITLE, isRequiredLabel = IS_REQUIRED_LABEL, messageLabel = MESSAGE_LABEL, messagePlaceholder = MESSAGE_PLACEHOLDER, nameLabel = NAME_LABEL, namePlaceholder = NAME_PLACEHOLDER, removeScreenshotButtonLabel = REMOVE_SCREENSHOT_LABEL, submitButtonLabel = SUBMIT_BUTTON_LABEL, successMessageText = SUCCESS_MESSAGE_TEXT, triggerLabel = TRIGGER_LABEL, triggerAriaLabel = "", highlightToolText = HIGHLIGHT_TOOL_TEXT, hideToolText = HIDE_TOOL_TEXT, removeHighlightText = REMOVE_HIGHLIGHT_TEXT, errorEmptyMessageText = ERROR_EMPTY_MESSAGE_TEXT, errorNoClientText = ERROR_NO_CLIENT_TEXT, errorTimeoutText = ERROR_TIMEOUT_TEXT, errorForbiddenText = ERROR_FORBIDDEN_TEXT, errorGenericText = ERROR_GENERIC_TEXT, onFormOpen, onFormClose, onSubmitSuccess, onSubmitError, onFormSubmitted } = {}) => {
		const _options = {
			id,
			autoInject,
			showBranding,
			isEmailRequired,
			isNameRequired,
			showEmail,
			showName,
			enableScreenshot,
			useSentryUser,
			tags,
			styleNonce,
			scriptNonce,
			colorScheme,
			themeDark,
			themeLight,
			triggerLabel,
			triggerAriaLabel,
			cancelButtonLabel,
			submitButtonLabel,
			confirmButtonLabel,
			formTitle,
			emailLabel,
			emailPlaceholder,
			messageLabel,
			messagePlaceholder,
			nameLabel,
			namePlaceholder,
			successMessageText,
			isRequiredLabel,
			addScreenshotButtonLabel,
			removeScreenshotButtonLabel,
			highlightToolText,
			hideToolText,
			removeHighlightText,
			errorEmptyMessageText,
			errorNoClientText,
			errorTimeoutText,
			errorForbiddenText,
			errorGenericText,
			onFormClose,
			onFormOpen,
			onSubmitError,
			onSubmitSuccess,
			onFormSubmitted
		};
		let _shadow = null;
		let _mainStyle = null;
		let _subscriptions = [];
		const _createShadow = (options) => {
			if (!_shadow) {
				const host = DOCUMENT.createElement("div");
				host.id = String(options.id);
				DOCUMENT.body.appendChild(host);
				_shadow = host.attachShadow({ mode: "open" });
				_mainStyle = createMainStyles(options);
				_shadow.appendChild(_mainStyle);
			}
			return _shadow;
		};
		const _loadAndRenderDialog = async (options) => {
			const screenshotRequired = options.enableScreenshot && isScreenshotSupported();
			let modalIntegration;
			let screenshotIntegration;
			try {
				modalIntegration = (getModalIntegration ? getModalIntegration() : await lazyLoadIntegration("feedbackModalIntegration", scriptNonce))();
				addIntegration(modalIntegration);
			} catch {
				DEBUG_BUILD$4 && debug$2.error("[Feedback] Error when trying to load feedback integrations. Try using `feedbackSyncIntegration` in your `Sentry.init`.");
				throw new Error("[Feedback] Missing feedback modal integration!");
			}
			try {
				const screenshotIntegrationFn = screenshotRequired ? getScreenshotIntegration ? getScreenshotIntegration() : await lazyLoadIntegration("feedbackScreenshotIntegration", scriptNonce) : void 0;
				if (screenshotIntegrationFn) {
					screenshotIntegration = screenshotIntegrationFn();
					addIntegration(screenshotIntegration);
				}
			} catch {
				DEBUG_BUILD$4 && debug$2.error("[Feedback] Missing feedback screenshot integration. Proceeding without screenshots.");
			}
			const errorMessages = {
				ERROR_EMPTY_MESSAGE: options.errorEmptyMessageText,
				ERROR_NO_CLIENT: options.errorNoClientText,
				ERROR_TIMEOUT: options.errorTimeoutText,
				ERROR_FORBIDDEN: options.errorForbiddenText,
				ERROR_GENERIC: options.errorGenericText
			};
			const wrappedSendFeedback = (params, hint) => sendFeedback(params, {
				includeReplay: true,
				...hint,
				errorMessages
			});
			const dialog = modalIntegration.createDialog({
				options: {
					...options,
					onFormClose: () => {
						dialog?.close();
						options.onFormClose?.();
					},
					onFormSubmitted: () => {
						dialog?.close();
						options.onFormSubmitted?.();
					}
				},
				screenshotIntegration,
				sendFeedback: wrappedSendFeedback,
				shadow: _createShadow(options)
			});
			return dialog;
		};
		const _attachTo = (el, optionOverrides = {}) => {
			const mergedOptions = mergeOptions(_options, optionOverrides);
			const targetEl = typeof el === "string" ? DOCUMENT.querySelector(el) : typeof el.addEventListener === "function" ? el : null;
			if (!targetEl) {
				DEBUG_BUILD$4 && debug$2.error("[Feedback] Unable to attach to target element");
				throw new Error("Unable to attach to target element");
			}
			let dialog = null;
			const handleClick = async () => {
				if (!dialog) dialog = await _loadAndRenderDialog({
					...mergedOptions,
					onFormSubmitted: () => {
						dialog?.removeFromDom();
						mergedOptions.onFormSubmitted?.();
					}
				});
				dialog.appendToDom();
				dialog.open();
			};
			targetEl.addEventListener("click", handleClick);
			const unsubscribe = () => {
				_subscriptions = _subscriptions.filter((sub) => sub !== unsubscribe);
				dialog?.removeFromDom();
				dialog = null;
				targetEl.removeEventListener("click", handleClick);
			};
			_subscriptions.push(unsubscribe);
			return unsubscribe;
		};
		const _createActor = (optionOverrides = {}) => {
			const mergedOptions = mergeOptions(_options, optionOverrides);
			const shadow = _createShadow(mergedOptions);
			const actor = Actor({
				triggerLabel: mergedOptions.triggerLabel,
				triggerAriaLabel: mergedOptions.triggerAriaLabel,
				shadow,
				styleNonce
			});
			_attachTo(actor.el, {
				...mergedOptions,
				onFormOpen() {
					actor.hide();
				},
				onFormClose() {
					actor.show();
				},
				onFormSubmitted() {
					actor.show();
				}
			});
			return actor;
		};
		return {
			name: "Feedback",
			setupOnce() {
				if (!isBrowser() || !_options.autoInject) return;
				if (DOCUMENT.readyState === "loading") DOCUMENT.addEventListener("DOMContentLoaded", () => _createActor().appendToDom());
				else _createActor().appendToDom();
			},
			/**
			* Adds click listener to the element to open a feedback dialog
			*
			* The returned function can be used to remove the click listener
			*/
			attachTo: _attachTo,
			/**
			* Creates a new widget which is composed of a Button which triggers a Dialog.
			* Accepts partial options to override any options passed to constructor.
			*/
			createWidget(optionOverrides = {}) {
				const actor = _createActor(mergeOptions(_options, optionOverrides));
				actor.appendToDom();
				return actor;
			},
			/**
			* Creates a new Form which you can
			* Accepts partial options to override any options passed to constructor.
			*/
			async createForm(optionOverrides = {}) {
				return _loadAndRenderDialog(mergeOptions(_options, optionOverrides));
			},
			/**
			* Updates the color scheme of the feedback widget at runtime.
			*/
			setTheme(colorScheme2) {
				_options.colorScheme = colorScheme2;
				if (_shadow) {
					const newStyle = createMainStyles(_options);
					if (_mainStyle) _shadow.replaceChild(newStyle, _mainStyle);
					else _shadow.prepend(newStyle);
					_mainStyle = newStyle;
				}
			},
			/**
			* Removes the Feedback integration (including host, shadow DOM, and all widgets)
			*/
			remove() {
				if (_shadow) {
					_shadow.parentElement?.remove();
					_shadow = null;
					_mainStyle = null;
				}
				_subscriptions.forEach((sub) => sub());
				_subscriptions = [];
			}
		};
	});
	return feedbackIntegration;
};
function getFeedback() {
	return getClient()?.getIntegrationByName("Feedback");
}
var n$3;
var l$1;
var u$1;
var i$1$1;
var r$1$1;
var o$1;
var e$1$1;
var f$1;
var c$1;
var a$1;
var s$1;
var h$1;
var p$1;
var v$1;
var d$1 = {};
var w$1 = [];
var _$1 = /acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i;
var g$1 = Array.isArray;
function m$1(n, l) {
	for (var u in l) n[u] = l[u];
	return n;
}
function b$1(n) {
	n && n.parentNode && n.parentNode.removeChild(n);
}
function k$1(l, u, t) {
	var i, r, o, e = {};
	for (o in u) "key" == o ? i = u[o] : "ref" == o ? r = u[o] : e[o] = u[o];
	if (arguments.length > 2 && (e.children = arguments.length > 3 ? n$3.call(arguments, 2) : t), "function" == typeof l && null != l.defaultProps) for (o in l.defaultProps) void 0 === e[o] && (e[o] = l.defaultProps[o]);
	return x$1(l, e, i, r, null);
}
function x$1(n, t, i, r, o) {
	var e = {
		type: n,
		props: t,
		key: i,
		ref: r,
		__k: null,
		__: null,
		__b: 0,
		__e: null,
		__c: null,
		constructor: void 0,
		__v: null == o ? ++u$1 : o,
		__i: -1,
		__u: 0
	};
	return null == o && null != l$1.vnode && l$1.vnode(e), e;
}
function S$1(n) {
	return n.children;
}
function C$1(n, l) {
	this.props = n, this.context = l;
}
function $$1(n, l) {
	if (null == l) return n.__ ? $$1(n.__, n.__i + 1) : null;
	for (var u; l < n.__k.length; l++) if (null != (u = n.__k[l]) && null != u.__e) return u.__e;
	return "function" == typeof n.type ? $$1(n) : null;
}
function I$1(n) {
	if (n.__P && n.__d) {
		var u = n.__v, t = u.__e, i = [], r = [], o = m$1({}, u);
		o.__v = u.__v + 1, l$1.vnode && l$1.vnode(o), q$1(n.__P, o, u, n.__n, n.__P.namespaceURI, 32 & u.__u ? [t] : null, i, null == t ? $$1(u) : t, !!(32 & u.__u), r), o.__v = u.__v, o.__.__k[o.__i] = o, D$1(i, o, r), u.__e = u.__ = null, o.__e != t && P$1(o);
	}
}
function P$1(n) {
	if (null != (n = n.__) && null != n.__c) return n.__e = n.__c.base = null, n.__k.some(function(l) {
		if (null != l && null != l.__e) return n.__e = n.__c.base = l.__e;
	}), P$1(n);
}
function A$1(n) {
	(!n.__d && (n.__d = true) && i$1$1.push(n) && !H$1.__r++ || r$1$1 != l$1.debounceRendering) && ((r$1$1 = l$1.debounceRendering) || o$1)(H$1);
}
function H$1() {
	try {
		for (var n, l = 1; i$1$1.length;) i$1$1.length > l && i$1$1.sort(e$1$1), n = i$1$1.shift(), l = i$1$1.length, I$1(n);
	} finally {
		i$1$1.length = H$1.__r = 0;
	}
}
function L$1(n, l, u, t, i, r, o, e, f, c, a) {
	var s, h, p, v, y, _, g = t && t.__k || w$1, m = l.length;
	for (f = T$1(u, l, g, f, m), s = 0; s < m; s++) null != (p = u.__k[s]) && (h = -1 != p.__i && g[p.__i] || d$1, p.__i = s, _ = q$1(n, p, h, i, r, o, e, f, c, a), v = p.__e, p.ref && h.ref != p.ref && (h.ref && J(h.ref, null, p), a.push(p.ref, p.__c || v, p)), null == y && null != v && (y = v), 4 & p.__u ? (f = j$1(p, f, n), h.__e && (h.__e = null)) : "function" == typeof p.type && void 0 !== _ ? f = _ : v && (f = v.nextSibling), p.__u &= -7);
	return u.__e = y, f;
}
function T$1(n, l, u, t, i) {
	var r, o, e, f, c, a = u.length, s = a, h = 0;
	for (n.__k = new Array(i), r = 0; r < i; r++) null != (o = l[r]) && "boolean" != typeof o && "function" != typeof o ? ("string" == typeof o || "number" == typeof o || "bigint" == typeof o || o.constructor == String ? o = n.__k[r] = x$1(null, o, null, null, null) : g$1(o) ? o = n.__k[r] = x$1(S$1, { children: o }, null, null, null) : void 0 === o.constructor && o.__b > 0 ? o = n.__k[r] = x$1(o.type, o.props, o.key, o.ref ? o.ref : null, o.__v) : n.__k[r] = o, f = r + h, o.__ = n, o.__b = n.__b + 1, e = null, -1 != (c = o.__i = O$1(o, u, f, s)) && (s--, (e = u[c]) && (e.__u |= 2)), null == e || null == e.__v ? (-1 == c && (i > a ? h-- : i < a && h++), "function" != typeof o.type && (o.__u |= 4)) : c != f && (c == f - 1 ? h-- : c == f + 1 ? h++ : (c > f ? h-- : h++, o.__u |= 4))) : n.__k[r] = null;
	if (s) for (r = 0; r < a; r++) null != (e = u[r]) && 0 == (2 & e.__u) && (e.__e == t && (t = $$1(e)), K(e, e));
	return t;
}
function j$1(n, l, u) {
	var t, i;
	if ("function" == typeof n.type) {
		for (t = n.__k, i = 0; t && i < t.length; i++) t[i] && (t[i].__ = n, l = j$1(t[i], l, u));
		return l;
	}
	n.__e != l && (l && n.type && !l.parentNode && (l = $$1(n)), l = u.insertBefore(n.__e, l || null));
	do
		l = l && l.nextSibling;
	while (null != l && 8 == l.nodeType);
	return l;
}
function O$1(n, l, u, t) {
	var i, r, o, e = n.key, f = n.type, c = l[u], a = null != c && 0 == (2 & c.__u);
	if (null === c && null == e || a && e == c.key && f == c.type) return u;
	if (t > (a ? 1 : 0)) {
		for (i = u - 1, r = u + 1; i >= 0 || r < l.length;) if (null != (c = l[o = i >= 0 ? i-- : r++]) && 0 == (2 & c.__u) && e == c.key && f == c.type) return o;
	}
	return -1;
}
function z$1(n, l, u) {
	"-" == l[0] ? n.setProperty(l, null == u ? "" : u) : n[l] = null == u ? "" : "number" != typeof u || _$1.test(l) ? u : u + "px";
}
function N$1(n, l, u, t, i) {
	var r, o;
	n: if ("style" == l) if ("string" == typeof u) n.style.cssText = u;
	else {
		if ("string" == typeof t && (n.style.cssText = t = ""), t) for (l in t) u && l in u || z$1(n.style, l, "");
		if (u) for (l in u) t && u[l] == t[l] || z$1(n.style, l, u[l]);
	}
	else if ("o" == l[0] && "n" == l[1]) r = l != (l = l.replace(s$1, "$1")), o = l.toLowerCase(), l = o in n || "onFocusOut" == l || "onFocusIn" == l ? o.slice(2) : l.slice(2), n.l || (n.l = {}), n.l[l + r] = u, u ? t ? u[a$1] = t[a$1] : (u[a$1] = h$1, n.addEventListener(l, r ? v$1 : p$1, r)) : n.removeEventListener(l, r ? v$1 : p$1, r);
	else {
		if ("http://www.w3.org/2000/svg" == i) l = l.replace(/xlink(H|:h)/, "h").replace(/sName$/, "s");
		else if ("width" != l && "height" != l && "href" != l && "list" != l && "form" != l && "tabIndex" != l && "download" != l && "rowSpan" != l && "colSpan" != l && "role" != l && "popover" != l && l in n) try {
			n[l] = null == u ? "" : u;
			break n;
		} catch (n) {}
		"function" == typeof u || (null == u || false === u && "-" != l[4] ? n.removeAttribute(l) : n.setAttribute(l, "popover" == l && 1 == u ? "" : u));
	}
}
function V(n) {
	return function(u) {
		if (this.l) {
			var t = this.l[u.type + n];
			if (null == u[c$1]) u[c$1] = h$1++;
			else if (u[c$1] < t[a$1]) return;
			return t(l$1.event ? l$1.event(u) : u);
		}
	};
}
function q$1(n, u, t, i, r, o, e, f, c, a) {
	var s, h, p, v, y, d, _, k, x, M, I, P, A, H, T, j, F = u.type;
	if (void 0 !== u.constructor) return null;
	128 & t.__u && (c = !!(32 & t.__u), o = [f = u.__e = t.__e]), (s = l$1.__b) && s(u);
	n: if ("function" == typeof F) {
		h = e.length;
		try {
			if (x = u.props, M = F.prototype && F.prototype.render, I = (s = F.contextType) && i[s.__c], P = s ? I ? I.props.value : s.__ : i, t.__c ? k = (p = u.__c = t.__c).__ = p.__E : (M ? u.__c = p = new F(x, P) : (u.__c = p = new C$1(x, P), p.constructor = F, p.render = Q), I && I.sub(p), p.state || (p.state = {}), p.__n = i, v = p.__d = !0, p.__h = [], p._sb = []), M && null == p.__s && (p.__s = p.state), M && null != F.getDerivedStateFromProps && (p.__s == p.state && (p.__s = m$1({}, p.__s)), m$1(p.__s, F.getDerivedStateFromProps(x, p.__s))), y = p.props, d = p.state, p.__v = u, v) M && null == F.getDerivedStateFromProps && null != p.componentWillMount && p.componentWillMount(), M && null != p.componentDidMount && p.__h.push(p.componentDidMount);
			else {
				if (M && null == F.getDerivedStateFromProps && x !== y && null != p.componentWillReceiveProps && p.componentWillReceiveProps(x, P), u.__v == t.__v || !p.__e && null != p.shouldComponentUpdate && !1 === p.shouldComponentUpdate(x, p.__s, P)) {
					u.__v != t.__v && (p.props = x, p.state = p.__s, p.__d = !1), u.__e = t.__e, u.__k = t.__k, u.__k.some(function(n) {
						n && (n.__ = u);
					}), w$1.push.apply(p.__h, p._sb), p._sb = [], p.__h.length && e.push(p), f = $$1(t);
					break n;
				}
				null != p.componentWillUpdate && p.componentWillUpdate(x, p.__s, P), M && null != p.componentDidUpdate && p.__h.push(function() {
					p.componentDidUpdate(y, d, _);
				});
			}
			if (p.context = P, p.props = x, p.__P = n, p.__e = !1, A = l$1.__r, H = 0, M) p.state = p.__s, p.__d = !1, A && A(u), s = p.render(p.props, p.state, p.context), w$1.push.apply(p.__h, p._sb), p._sb = [];
			else do
				p.__d = !1, A && A(u), s = p.render(p.props, p.state, p.context), p.state = p.__s;
			while (p.__d && ++H < 25);
			p.state = p.__s, null != p.getChildContext && (i = m$1(m$1({}, i), p.getChildContext())), M && !v && null != p.getSnapshotBeforeUpdate && (_ = p.getSnapshotBeforeUpdate(y, d)), T = null != s && s.type === S$1 && null == s.key ? E$1(s.props.children) : s, f = L$1(n, g$1(T) ? T : [T], u, t, i, r, o, e, f, c, a), p.base = u.__e, u.__u &= -161, p.__h.length && e.push(p), k && (p.__E = p.__ = null);
		} catch (n) {
			if (e.length = h, u.__v = null, c || null != o) {
				if (n.then) {
					for (u.__u |= c ? 160 : 128; f && 8 == f.nodeType && f.nextSibling;) f = f.nextSibling;
					null != o && (o[o.indexOf(f)] = null), u.__e = f;
				} else if (null != o) for (j = o.length; j--;) b$1(o[j]);
			} else u.__e = t.__e;
			u.__k ??= t.__k || [], n.then || B$1(u), l$1.__e(n, u, t);
		}
	} else null == o && u.__v == t.__v ? (u.__k = t.__k, u.__e = t.__e) : f = u.__e = G(t.__e, u, t, i, r, o, e, c, a);
	return (s = l$1.diffed) && s(u), 128 & u.__u ? void 0 : f;
}
function B$1(n) {
	n && (n.__c && (n.__c.__e = true), n.__k && n.__k.some(B$1));
}
function D$1(n, u, t) {
	for (var i = 0; i < t.length; i++) J(t[i], t[++i], t[++i]);
	l$1.__c && l$1.__c(u, n), n.some(function(u) {
		try {
			n = u.__h, u.__h = [], n.some(function(n) {
				n.call(u);
			});
		} catch (n) {
			l$1.__e(n, u.__v);
		}
	});
}
function E$1(n) {
	return "object" != typeof n || null == n || n.__b > 0 ? n : g$1(n) ? n.map(E$1) : void 0 !== n.constructor ? null : m$1({}, n);
}
function G(u, t, i, r, o, e, f, c, a) {
	var s, h, p, v, y, w, _, m = i.props || d$1, k = t.props, x = t.type;
	if ("svg" == x ? o = "http://www.w3.org/2000/svg" : "math" == x ? o = "http://www.w3.org/1998/Math/MathML" : o || (o = "http://www.w3.org/1999/xhtml"), null != e) {
		for (s = 0; s < e.length; s++) if ((y = e[s]) && "setAttribute" in y == !!x && (x ? y.localName == x : 3 == y.nodeType)) {
			u = y, e[s] = null;
			break;
		}
	}
	if (null == u) {
		if (null == x) return document.createTextNode(k);
		u = document.createElementNS(o, x, k.is && k), c && (l$1.__m && l$1.__m(t, e), c = false), e = null;
	}
	if (null == x) m === k || c && u.data == k || (u.data = k);
	else {
		if (e = "textarea" == x && null != k.defaultValue ? null : e && n$3.call(u.childNodes), !c && null != e) for (m = {}, s = 0; s < u.attributes.length; s++) m[(y = u.attributes[s]).name] = y.value;
		for (s in m) y = m[s], "dangerouslySetInnerHTML" == s ? p = y : "children" == s || s in k || "value" == s && "defaultValue" in k || "checked" == s && "defaultChecked" in k || N$1(u, s, null, y, o);
		for (s in k) y = k[s], "children" == s ? v = y : "dangerouslySetInnerHTML" == s ? h = y : "value" == s ? w = y : "checked" == s ? _ = y : c && "function" != typeof y || m[s] === y || N$1(u, s, y, m[s], o);
		if (h) c || p && (h.__html == p.__html || h.__html == u.innerHTML) || (u.innerHTML = h.__html), t.__k = [];
		else if (p && (u.innerHTML = ""), L$1("template" == t.type ? u.content : u, g$1(v) ? v : [v], t, i, r, "foreignObject" == x ? "http://www.w3.org/1999/xhtml" : o, e, f, e ? e[0] : i.__k && $$1(i, 0), c, a), null != e) for (s = e.length; s--;) b$1(e[s]);
		c && "textarea" != x || (s = "value", "progress" == x && null == w ? u.removeAttribute("value") : null != w && (w !== u[s] || "progress" == x && !w || "option" == x && w != m[s]) && N$1(u, s, w, m[s], o), s = "checked", null != _ && _ != u[s] && N$1(u, s, _, m[s], o));
	}
	return u;
}
function J(n, u, t) {
	try {
		if ("function" == typeof n) {
			var i = "function" == typeof n.__u;
			i && n.__u(), i && null == u || (n.__u = n(u));
		} else n.current = u;
	} catch (n) {
		l$1.__e(n, t);
	}
}
function K(n, u, t) {
	var i, r;
	if (l$1.unmount && l$1.unmount(n), (i = n.ref) && (i.current && i.current != n.__e || J(i, null, u)), null != (i = n.__c)) {
		if (i.componentWillUnmount) try {
			i.componentWillUnmount();
		} catch (n) {
			l$1.__e(n, u);
		}
		i.base = i.__P = i.__n = null;
	}
	if (i = n.__k) for (r = 0; r < i.length; r++) i[r] && K(i[r], u, t || "function" != typeof n.type);
	t || b$1(n.__e), n.__c = n.__ = n.__e = void 0;
}
function Q(n, l, u) {
	return this.constructor(n, u);
}
function R(u, t, i) {
	var r, o, e, f;
	t == document && (t = document.documentElement), l$1.__ && l$1.__(u, t), o = (r = false) ? null : t.__k, e = [], f = [], q$1(t, u = t.__k = k$1(S$1, null, [u]), o || d$1, d$1, t.namespaceURI, o ? null : t.firstChild ? n$3.call(t.childNodes) : null, e, o ? o.__e : t.firstChild, r, f), D$1(e, u, f), u.props.children = null;
}
n$3 = w$1.slice, l$1 = { __e: function(n, l, u, t) {
	for (var i, r, o; l = l.__;) if ((i = l.__c) && !i.__) try {
		if ((r = i.constructor) && null != r.getDerivedStateFromError && (i.setState(r.getDerivedStateFromError(n)), o = i.__d), null != i.componentDidCatch && (i.componentDidCatch(n, t || {}), o = i.__d), o) return i.__E = i;
	} catch (l) {
		n = l;
	}
	throw n;
} }, u$1 = 0, C$1.prototype.setState = function(n, l) {
	var u = null != this.__s && this.__s != this.state ? this.__s : this.__s = m$1({}, this.state);
	"function" == typeof n && (n = n(m$1({}, u), this.props)), n && m$1(u, n), null != n && this.__v && (l && this._sb.push(l), A$1(this));
}, C$1.prototype.forceUpdate = function(n) {
	this.__v && (this.__e = true, n && this.__h.push(n), A$1(this));
}, C$1.prototype.render = S$1, i$1$1 = [], o$1 = "function" == typeof Promise ? Promise.prototype.then.bind(Promise.resolve()) : setTimeout, e$1$1 = function(n, l) {
	return n.__v.__b - l.__v.__b;
}, H$1.__r = 0, f$1 = Math.random().toString(8), c$1 = "__d" + f$1, a$1 = "__a" + f$1, s$1 = /(PointerCapture)$|Capture$/i, h$1 = 0, p$1 = V(false), v$1 = V(true);
var t$3;
var r$2;
var u$2;
var i$3;
var o$2 = 0;
var f$2 = [];
var c$2 = l$1;
var e$2 = c$2.__b;
var a$2 = c$2.__r;
var v$2 = c$2.diffed;
var l$2 = c$2.__c;
var m$2 = c$2.unmount;
var p$2 = c$2.__;
function s$2(n, t) {
	c$2.__h && c$2.__h(r$2, n, o$2 || t), o$2 = 0;
	var u = r$2.__H || (r$2.__H = {
		__: [],
		__h: []
	});
	return n >= u.__.length && u.__.push({}), u.__[n];
}
function d$2(n) {
	return o$2 = 1, y$1(D$2, n);
}
function y$1(n, u, i) {
	var o = s$2(t$3++, 2);
	if (o.t = n, !o.__c && (o.__ = [i ? i(u) : D$2(void 0, u), function(n) {
		var t = o.__N ? o.__N[0] : o.__[0], r = o.t(t, n);
		t !== r && (o.__N = [r, o.__[1]], o.__c.setState({}));
	}], o.__c = r$2, !r$2.__f)) {
		var f = function(n, t, r) {
			if (!o.__c.__H) return true;
			var u = false, i = o.__c.props !== n;
			if (o.__c.__H.__.some(function(n) {
				if (n.__N) {
					u = true;
					var t = n.__[0];
					n.__ = n.__N, n.__N = void 0, t !== n.__[0] && (i = true);
				}
			}), c) {
				var f = c.call(this, n, t, r);
				return u ? f || i : f;
			}
			return !u || i;
		};
		r$2.__f = true;
		var c = r$2.shouldComponentUpdate, e = r$2.componentWillUpdate;
		r$2.componentWillUpdate = function(n, t, r) {
			if (this.__e) {
				var u = c;
				c = void 0, f(n, t, r), c = u;
			}
			e && e.call(this, n, t, r);
		}, r$2.shouldComponentUpdate = f;
	}
	return o.__N || o.__;
}
function h$2(n, u) {
	var i = s$2(t$3++, 3);
	!c$2.__s && C$2(i.__H, u) && (i.__ = n, i.u = u, r$2.__H.__h.push(i));
}
function _$2(n, u) {
	var i = s$2(t$3++, 4);
	!c$2.__s && C$2(i.__H, u) && (i.__ = n, i.u = u, r$2.__h.push(i));
}
function A$2(n) {
	return o$2 = 5, T$2(function() {
		return { current: n };
	}, []);
}
function F$1(n, t, r) {
	o$2 = 6, _$2(function() {
		if ("function" == typeof n) {
			var r = n(t());
			return function() {
				n(null), r && "function" == typeof r && r();
			};
		}
		if (n) return n.current = t(), function() {
			return n.current = null;
		};
	}, null == r ? r : r.concat(n));
}
function T$2(n, r) {
	var u = s$2(t$3++, 7);
	return C$2(u.__H, r) && (u.__ = n(), u.__H = r, u.__h = n), u.__;
}
function q$2(n, t) {
	return o$2 = 8, T$2(function() {
		return n;
	}, t);
}
function x$2(n) {
	var u = r$2.context[n.__c], i = s$2(t$3++, 9);
	return i.c = n, u ? (i.__ ?? (i.__ = true, u.sub(r$2)), u.props.value) : n.__;
}
function P$2(n, t) {
	c$2.useDebugValue && c$2.useDebugValue(t ? t(n) : n);
}
function b$2(n) {
	var u = s$2(t$3++, 10), i = d$2();
	return u.__ = n, r$2.componentDidCatch || (r$2.componentDidCatch = function(n, t) {
		u.__ && u.__(n, t), i[1](n);
	}), [i[0], function() {
		i[1](void 0);
	}];
}
function g$2() {
	var n = s$2(t$3++, 11);
	if (!n.__) {
		for (var u = r$2.__v; null !== u && !u.__m && null !== u.__;) u = u.__;
		var i = u.__m || (u.__m = [0, 0]);
		n.__ = "P" + i[0] + "-" + i[1]++;
	}
	return n.__;
}
function j() {
	for (var n; n = f$2.shift();) {
		var t = n.__H;
		if (n.__P && t) try {
			t.__h.some(z), t.__h.some(B$2), t.__h = [];
		} catch (r) {
			t.__h = [], c$2.__e(r, n.__v);
		}
	}
}
c$2.__b = function(n) {
	r$2 = null, e$2 && e$2(n);
}, c$2.__ = function(n, t) {
	n && t.__k && t.__k.__m && (n.__m = t.__k.__m), p$2 && p$2(n, t);
}, c$2.__r = function(n) {
	a$2 && a$2(n), t$3 = 0;
	var i = (r$2 = n.__c).__H;
	i && (u$2 === r$2 ? (i.__h = [], r$2.__h = [], i.__.some(function(n) {
		n.__N && (n.__ = n.__N), n.u = n.__N = void 0;
	})) : (i.__h.some(z), i.__h.some(B$2), i.__h = [], t$3 = 0)), u$2 = r$2;
}, c$2.diffed = function(n) {
	v$2 && v$2(n);
	var t = n.__c;
	t && t.__H && (t.__H.__h.length && (1 !== f$2.push(t) && i$3 === c$2.requestAnimationFrame || ((i$3 = c$2.requestAnimationFrame) || w$2)(j)), t.__H.__.some(function(n) {
		n.u && (n.__H = n.u, n.u = void 0);
	})), u$2 = r$2 = null;
}, c$2.__c = function(n, t) {
	t.some(function(n) {
		try {
			n.__h.some(z), n.__h = n.__h.filter(function(n) {
				return !n.__ || B$2(n);
			});
		} catch (r) {
			t.some(function(n) {
				n.__h && (n.__h = []);
			}), t = [], c$2.__e(r, n.__v);
		}
	}), l$2 && l$2(n, t);
}, c$2.unmount = function(n) {
	m$2 && m$2(n);
	var t, r = n.__c;
	r && r.__H && (r.__H.__.some(function(n) {
		try {
			z(n);
		} catch (n) {
			t = n;
		}
	}), r.__H = void 0, t && c$2.__e(t, r.__v));
};
var k$2 = "function" == typeof requestAnimationFrame;
function w$2(n) {
	var t, r = function() {
		clearTimeout(u), k$2 && cancelAnimationFrame(t), setTimeout(n);
	}, u = setTimeout(r, 35);
	k$2 && (t = requestAnimationFrame(r));
}
function z(n) {
	var t = r$2, u = n.__c;
	"function" == typeof u && (n.__c = void 0, u()), r$2 = t;
}
function B$2(n) {
	var t = r$2;
	n.__c = n.__(), r$2 = t;
}
function C$2(n, t) {
	return !n || n.length !== t.length || t.some(function(t, r) {
		return t !== n[r];
	});
}
function D$2(n, t) {
	return "function" == typeof t ? t(n) : t;
}
var hooks = /*#__PURE__*/ Object.defineProperty({
	__proto__: null,
	useCallback: q$2,
	useContext: x$2,
	useDebugValue: P$2,
	useEffect: h$2,
	useErrorBoundary: b$2,
	useId: g$2,
	useImperativeHandle: F$1,
	useLayoutEffect: _$2,
	useMemo: T$2,
	useReducer: y$1,
	useRef: A$2,
	useState: d$2
}, Symbol.toStringTag, { value: "Module" });
var XMLNS$1 = "http://www.w3.org/2000/svg";
function SentryLogo() {
	const createElementNS = (tagName) => DOCUMENT.createElementNS(XMLNS$1, tagName);
	const svg = setAttributesNS(createElementNS("svg"), {
		width: "32",
		height: "30",
		viewBox: "0 0 72 66",
		fill: "inherit"
	});
	const path = setAttributesNS(createElementNS("path"), {
		transform: "translate(11, 11)",
		d: "M29,2.26a4.67,4.67,0,0,0-8,0L14.42,13.53A32.21,32.21,0,0,1,32.17,40.19H27.55A27.68,27.68,0,0,0,12.09,17.47L6,28a15.92,15.92,0,0,1,9.23,12.17H4.62A.76.76,0,0,1,4,39.06l2.94-5a10.74,10.74,0,0,0-3.36-1.9l-2.91,5a4.54,4.54,0,0,0,1.69,6.24A4.66,4.66,0,0,0,4.62,44H19.15a19.4,19.4,0,0,0-8-17.31l2.31-4A23.87,23.87,0,0,1,23.76,44H36.07a35.88,35.88,0,0,0-16.41-31.8l4.67-8a.77.77,0,0,1,1.05-.27c.53.29,20.29,34.77,20.66,35.17a.76.76,0,0,1-.68,1.13H40.6q.09,1.91,0,3.81h4.78A4.59,4.59,0,0,0,50,39.43a4.49,4.49,0,0,0-.62-2.28Z"
	});
	svg.appendChild(path);
	return svg;
}
function DialogHeader({ options }) {
	const logoHtml = T$2(() => ({ __html: SentryLogo().outerHTML }), []);
	return /* @__PURE__ */ k$1("h2", { class: "dialog__header" }, /* @__PURE__ */ k$1("span", { class: "dialog__title" }, options.formTitle), options.showBranding ? /* @__PURE__ */ k$1("a", {
		class: "brand-link",
		target: "_blank",
		href: "https://sentry.io/welcome/",
		title: "Powered by Sentry",
		rel: "noopener noreferrer",
		dangerouslySetInnerHTML: logoHtml
	}) : null);
}
function getMissingFields(feedback, props) {
	const emptyFields = [];
	if (props.isNameRequired && !feedback.name) emptyFields.push(props.nameLabel);
	if (props.isEmailRequired && !feedback.email) emptyFields.push(props.emailLabel);
	if (!feedback.message) emptyFields.push(props.messageLabel);
	return emptyFields;
}
function retrieveStringValue(formData, key) {
	const value = formData.get(key);
	if (typeof value === "string") return value.trim();
	return "";
}
function Form({ options, defaultEmail, defaultName, onFormClose, onSubmit, onSubmitSuccess, onSubmitError, showEmail, showName, screenshotInput }) {
	const { tags, addScreenshotButtonLabel, removeScreenshotButtonLabel, cancelButtonLabel, emailLabel, emailPlaceholder, isEmailRequired, isNameRequired, messageLabel, messagePlaceholder, nameLabel, namePlaceholder, submitButtonLabel, isRequiredLabel } = options;
	const [isSubmitting, setIsSubmitting] = d$2(false);
	const [error, setError] = d$2(null);
	const [showScreenshotInput, setShowScreenshotInput] = d$2(false);
	const ScreenshotInputComponent = screenshotInput?.input;
	const [screenshotError, setScreenshotError] = d$2(null);
	const onScreenshotError = q$2((error2) => {
		setScreenshotError(error2);
		setShowScreenshotInput(false);
	}, []);
	const hasAllRequiredFields = q$2((data) => {
		const missingFields = getMissingFields(data, {
			emailLabel,
			isEmailRequired,
			isNameRequired,
			messageLabel,
			nameLabel
		});
		if (missingFields.length > 0) setError(`Please enter in the following required fields: ${missingFields.join(", ")}`);
		else setError(null);
		return missingFields.length === 0;
	}, [
		emailLabel,
		isEmailRequired,
		isNameRequired,
		messageLabel,
		nameLabel
	]);
	return /* @__PURE__ */ k$1("form", {
		class: "form",
		onSubmit: q$2(async (e) => {
			setIsSubmitting(true);
			try {
				e.preventDefault();
				if (!(e.target instanceof HTMLFormElement)) return;
				const formData = new FormData(e.target);
				const attachment = await (screenshotInput && showScreenshotInput ? screenshotInput.value() : void 0);
				const data = {
					name: retrieveStringValue(formData, "name"),
					email: retrieveStringValue(formData, "email"),
					message: retrieveStringValue(formData, "message"),
					attachments: attachment ? [attachment] : void 0
				};
				if (!hasAllRequiredFields(data)) return;
				try {
					onSubmitSuccess(data, await onSubmit({
						name: data.name,
						email: data.email,
						message: data.message,
						source: FEEDBACK_WIDGET_SOURCE,
						tags
					}, { attachments: data.attachments }));
				} catch (error2) {
					DEBUG_BUILD$4 && debug$2.error(error2);
					const err = error2;
					setError(err.message);
					onSubmitError(err);
				}
			} finally {
				setIsSubmitting(false);
			}
		}, [
			screenshotInput && showScreenshotInput,
			onSubmitSuccess,
			onSubmitError
		])
	}, ScreenshotInputComponent && showScreenshotInput ? /* @__PURE__ */ k$1(ScreenshotInputComponent, { onError: onScreenshotError }) : null, /* @__PURE__ */ k$1("fieldset", {
		class: "form__right",
		"data-sentry-feedback": true,
		disabled: isSubmitting
	}, /* @__PURE__ */ k$1("div", { class: "form__top" }, error ? /* @__PURE__ */ k$1("div", { class: "form__error-container" }, error) : null, showName ? /* @__PURE__ */ k$1("label", {
		for: "name",
		class: "form__label"
	}, /* @__PURE__ */ k$1(LabelText, {
		label: nameLabel,
		isRequiredLabel,
		isRequired: isNameRequired
	}), /* @__PURE__ */ k$1("input", {
		class: "form__input",
		defaultValue: defaultName,
		id: "name",
		name: "name",
		placeholder: namePlaceholder,
		required: isNameRequired,
		type: "text"
	})) : /* @__PURE__ */ k$1("input", {
		"aria-hidden": true,
		value: defaultName,
		name: "name",
		type: "hidden"
	}), showEmail ? /* @__PURE__ */ k$1("label", {
		for: "email",
		class: "form__label"
	}, /* @__PURE__ */ k$1(LabelText, {
		label: emailLabel,
		isRequiredLabel,
		isRequired: isEmailRequired
	}), /* @__PURE__ */ k$1("input", {
		class: "form__input",
		defaultValue: defaultEmail,
		id: "email",
		name: "email",
		placeholder: emailPlaceholder,
		required: isEmailRequired,
		type: "email"
	})) : /* @__PURE__ */ k$1("input", {
		"aria-hidden": true,
		value: defaultEmail,
		name: "email",
		type: "hidden"
	}), /* @__PURE__ */ k$1("label", {
		for: "message",
		class: "form__label"
	}, /* @__PURE__ */ k$1(LabelText, {
		label: messageLabel,
		isRequiredLabel,
		isRequired: true
	}), /* @__PURE__ */ k$1("textarea", {
		autoFocus: true,
		class: "form__input form__input--textarea",
		id: "message",
		name: "message",
		placeholder: messagePlaceholder,
		required: true,
		rows: 5
	})), ScreenshotInputComponent ? /* @__PURE__ */ k$1("label", {
		for: "screenshot",
		class: "form__label"
	}, /* @__PURE__ */ k$1("button", {
		class: "btn btn--default",
		disabled: isSubmitting,
		type: "button",
		onClick: () => {
			setScreenshotError(null);
			setShowScreenshotInput((prev) => !prev);
		}
	}, showScreenshotInput ? removeScreenshotButtonLabel : addScreenshotButtonLabel), screenshotError ? /* @__PURE__ */ k$1("div", { class: "form__error-container" }, screenshotError.message) : null) : null), /* @__PURE__ */ k$1("div", { class: "btn-group" }, /* @__PURE__ */ k$1("button", {
		class: "btn btn--primary",
		disabled: isSubmitting,
		type: "submit"
	}, submitButtonLabel), /* @__PURE__ */ k$1("button", {
		class: "btn btn--default",
		disabled: isSubmitting,
		type: "button",
		onClick: onFormClose
	}, cancelButtonLabel))));
}
function LabelText({ label, isRequired, isRequiredLabel }) {
	return /* @__PURE__ */ k$1("span", { class: "form__label__text" }, label, isRequired && /* @__PURE__ */ k$1("span", { class: "form__label__text--required" }, isRequiredLabel));
}
var WIDTH = 16;
var HEIGHT = 17;
var XMLNS = "http://www.w3.org/2000/svg";
function SuccessIcon() {
	const createElementNS = (tagName) => WINDOW$5.document.createElementNS(XMLNS, tagName);
	const svg = setAttributesNS(createElementNS("svg"), {
		width: `${WIDTH}`,
		height: `${HEIGHT}`,
		viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
		fill: "inherit"
	});
	const g = setAttributesNS(createElementNS("g"), { clipPath: "url(#clip0_57_156)" });
	const path2 = setAttributesNS(createElementNS("path"), {
		["fill-rule"]: "evenodd",
		["clip-rule"]: "evenodd",
		d: "M3.55544 15.1518C4.87103 16.0308 6.41775 16.5 8 16.5C10.1217 16.5 12.1566 15.6571 13.6569 14.1569C15.1571 12.6566 16 10.6217 16 8.5C16 6.91775 15.5308 5.37103 14.6518 4.05544C13.7727 2.73985 12.5233 1.71447 11.0615 1.10897C9.59966 0.503466 7.99113 0.34504 6.43928 0.653721C4.88743 0.962403 3.46197 1.72433 2.34315 2.84315C1.22433 3.96197 0.462403 5.38743 0.153721 6.93928C-0.15496 8.49113 0.00346625 10.0997 0.608967 11.5615C1.21447 13.0233 2.23985 14.2727 3.55544 15.1518ZM4.40546 3.1204C5.46945 2.40946 6.72036 2.03 8 2.03C9.71595 2.03 11.3616 2.71166 12.575 3.92502C13.7883 5.13838 14.47 6.78405 14.47 8.5C14.47 9.77965 14.0905 11.0306 13.3796 12.0945C12.6687 13.1585 11.6582 13.9878 10.476 14.4775C9.29373 14.9672 7.99283 15.0953 6.73777 14.8457C5.48271 14.596 4.32987 13.9798 3.42502 13.075C2.52018 12.1701 1.90397 11.0173 1.65432 9.76224C1.40468 8.50718 1.5328 7.20628 2.0225 6.02404C2.5122 4.8418 3.34148 3.83133 4.40546 3.1204Z"
	});
	const path = setAttributesNS(createElementNS("path"), { d: "M6.68775 12.4297C6.78586 12.4745 6.89218 12.4984 7 12.5C7.11275 12.4955 7.22315 12.4664 7.32337 12.4145C7.4236 12.3627 7.51121 12.2894 7.58 12.2L12 5.63999C12.0848 5.47724 12.1071 5.28902 12.0625 5.11098C12.0178 4.93294 11.9095 4.77744 11.7579 4.67392C11.6064 4.57041 11.4221 4.52608 11.24 4.54931C11.0579 4.57254 10.8907 4.66173 10.77 4.79999L6.88 10.57L5.13 8.56999C5.06508 8.49566 4.98613 8.43488 4.89768 8.39111C4.80922 8.34735 4.713 8.32148 4.61453 8.31498C4.51605 8.30847 4.41727 8.32147 4.32382 8.35322C4.23038 8.38497 4.14413 8.43484 4.07 8.49999C3.92511 8.63217 3.83692 8.81523 3.82387 9.01092C3.81083 9.2066 3.87393 9.39976 4 9.54999L6.43 12.24C6.50187 12.3204 6.58964 12.385 6.68775 12.4297Z" });
	svg.appendChild(g).append(path, path2);
	const speakerDefs = createElementNS("defs");
	const speakerClipPathDef = setAttributesNS(createElementNS("clipPath"), { id: "clip0_57_156" });
	const speakerRect = setAttributesNS(createElementNS("rect"), {
		width: `${WIDTH}`,
		height: `${WIDTH}`,
		fill: "white",
		transform: "translate(0 0.5)"
	});
	speakerClipPathDef.appendChild(speakerRect);
	speakerDefs.appendChild(speakerClipPathDef);
	svg.appendChild(speakerDefs).appendChild(speakerClipPathDef).appendChild(speakerRect);
	return svg;
}
function Dialog({ open, onFormSubmitted, ...props }) {
	const options = props.options;
	const successIconHtml = T$2(() => ({ __html: SuccessIcon().outerHTML }), []);
	const [timeoutId, setTimeoutId] = d$2(null);
	const handleOnSuccessClick = q$2(() => {
		if (timeoutId) {
			clearTimeout(timeoutId);
			setTimeoutId(null);
		}
		onFormSubmitted();
	}, [timeoutId]);
	const onSubmitSuccess = q$2((data, eventId) => {
		props.onSubmitSuccess(data, eventId);
		setTimeoutId(setTimeout(() => {
			onFormSubmitted();
			setTimeoutId(null);
		}, SUCCESS_MESSAGE_TIMEOUT));
	}, [onFormSubmitted]);
	return /* @__PURE__ */ k$1(S$1, null, timeoutId ? /* @__PURE__ */ k$1("div", {
		class: "success__position",
		onClick: handleOnSuccessClick
	}, /* @__PURE__ */ k$1("div", { class: "success__content" }, options.successMessageText, /* @__PURE__ */ k$1("span", {
		class: "success__icon",
		dangerouslySetInnerHTML: successIconHtml
	}))) : /* @__PURE__ */ k$1("dialog", {
		class: "dialog",
		onClick: options.onFormClose,
		open
	}, /* @__PURE__ */ k$1("div", { class: "dialog__position" }, /* @__PURE__ */ k$1("div", {
		class: "dialog__content",
		onClick: (e) => {
			e.stopPropagation();
		}
	}, /* @__PURE__ */ k$1(DialogHeader, { options }), /* @__PURE__ */ k$1(Form, {
		...props,
		onSubmitSuccess
	})))));
}
var DIALOG = `
.dialog {
  position: fixed;
  z-index: var(--z-index);
  margin: 0;
  inset: 0;

  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  height: 100vh;
  width: 100vw;

  color: var(--dialog-color, var(--foreground));
  fill: var(--dialog-color, var(--foreground));
  line-height: 1.75em;

  background-color: rgba(0, 0, 0, 0.05);
  border: none;
  inset: 0;
  opacity: 1;
  transition: opacity 0.2s ease-in-out;
}

.dialog__position {
  position: fixed;
  z-index: var(--z-index);
  inset: var(--dialog-inset);
  padding: var(--page-margin);
  display: flex;
  max-height: calc(100vh - (2 * var(--page-margin)));
}
@media (max-width: 600px) {
  .dialog__position {
    inset: var(--page-margin);
    padding: 0;
  }
}

.dialog__position:has(.editor) {
  inset: var(--page-margin);
  padding: 0;
}

.dialog:not([open]) {
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
}
.dialog:not([open]) .dialog__content {
  transform: translate(0, -16px) scale(0.98);
}

.dialog__content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: var(--dialog-padding, 24px);
  max-width: 100%;
  width: 100%;
  max-height: 100%;
  overflow: auto;

  background: var(--dialog-background, var(--background));
  border-radius: var(--dialog-border-radius, 20px);
  border: var(--dialog-border, var(--border));
  box-shadow: var(--dialog-box-shadow, var(--box-shadow));
  transform: translate(0, 0) scale(1);
  transition: transform 0.2s ease-in-out;
}

`;
var DIALOG_HEADER = `
.dialog__header {
  display: flex;
  gap: 4px;
  justify-content: space-between;
  font-weight: var(--dialog-header-weight, 600);
  margin: 0;
}
.dialog__title {
  align-self: center;
  width: var(--form-width, 272px);
}

@media (max-width: 600px) {
  .dialog__title {
    width: auto;
  }
}

.dialog__position:has(.editor) .dialog__title {
  width: auto;
}


.brand-link {
  display: inline-flex;
}
.brand-link:focus-visible {
  outline: var(--outline);
}
`;
var FORM = `
.form {
  display: flex;
  overflow: auto;
  flex-direction: row;
  gap: 16px;
  flex: 1 0;
}

.form fieldset {
  border: none;
  margin: 0;
  padding: 0;
}

.form__right {
  flex: 0 0 auto;
  display: flex;
  overflow: auto;
  flex-direction: column;
  justify-content: space-between;
  gap: 20px;
  width: var(--form-width, 100%);
}

.dialog__position:has(.editor) .form__right {
  width: var(--form-width, 272px);
}

.form__top {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form__error-container {
  color: var(--error-color);
  fill: var(--error-color);
  width: 0;
  min-width: 100%;
  overflow-wrap: break-word;
}

.form__label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0px;
}

.form__label__text {
  display: flex;
  gap: 4px;
  align-items: center;
}

.form__label__text--required {
  font-size: 0.85em;
}

.form__input {
  font-family: inherit;
  line-height: inherit;
  background: transparent;
  box-sizing: border-box;
  border: var(--input-border, var(--border));
  border-radius: var(--input-border-radius, 6px);
  color: var(--input-color, inherit);
  fill: var(--input-color, inherit);
  font-size: var(--input-font-size, inherit);
  font-weight: var(--input-font-weight, 500);
  padding: 6px 12px;
}

.form__input::placeholder {
  opacity: 0.65;
  color: var(--input-placeholder-color, inherit);
  filter: var(--interactive-filter);
}

.form__input:focus-visible {
  outline: var(--input-focus-outline, var(--outline));
}

.form__input--textarea {
  font-family: inherit;
  resize: vertical;
}

.error {
  color: var(--error-color);
  fill: var(--error-color);
}
`;
var BUTTON = `
.btn-group {
  display: grid;
  gap: 8px;
}

.btn {
  line-height: inherit;
  border: var(--button-border, var(--border));
  border-radius: var(--button-border-radius, 6px);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--button-font-size, inherit);
  font-weight: var(--button-font-weight, 600);
  padding: var(--button-padding, 6px 16px);
}
.btn[disabled] {
  opacity: 0.6;
  pointer-events: none;
}

.btn--primary {
  color: var(--button-primary-color, var(--accent-foreground));
  fill: var(--button-primary-color, var(--accent-foreground));
  background: var(--button-primary-background, var(--accent-background));
  border: var(--button-primary-border, var(--border));
  border-radius: var(--button-primary-border-radius, 6px);
  font-weight: var(--button-primary-font-weight, 500);
}
.btn--primary:hover {
  color: var(--button-primary-hover-color, var(--accent-foreground));
  fill: var(--button-primary-hover-color, var(--accent-foreground));
  background: var(--button-primary-hover-background, var(--accent-background));
  filter: var(--interactive-filter);
}
.btn--primary:focus-visible {
  background: var(--button-primary-hover-background, var(--accent-background));
  filter: var(--interactive-filter);
  outline: var(--button-primary-focus-outline, var(--outline));
}

.btn--default {
  color: var(--button-color, var(--foreground));
  fill: var(--button-color, var(--foreground));
  background: var(--button-background, var(--background));
  border: var(--button-border, var(--border));
  border-radius: var(--button-border-radius, 6px);
  font-weight: var(--button-font-weight, 500);
}
.btn--default:hover {
  color: var(--button-color, var(--foreground));
  fill: var(--button-color, var(--foreground));
  background: var(--button-hover-background, var(--background));
  filter: var(--interactive-filter);
}
.btn--default:focus-visible {
  background: var(--button-hover-background, var(--background));
  filter: var(--interactive-filter);
  outline: var(--button-focus-outline, var(--outline));
}
`;
var SUCCESS = `
.success__position {
  position: fixed;
  inset: var(--dialog-inset);
  padding: var(--page-margin);
  z-index: var(--z-index);
}
.success__content {
  background: var(--success-background, var(--background));
  border: var(--success-border, var(--border));
  border-radius: var(--success-border-radius, 1.7em/50%);
  box-shadow: var(--success-box-shadow, var(--box-shadow));
  font-weight: var(--success-font-weight, 600);
  color: var(--success-color);
  fill: var(--success-color);
  padding: 12px 24px;
  line-height: 1.75em;

  display: grid;
  align-items: center;
  grid-auto-flow: column;
  gap: 6px;
  cursor: default;
}

.success__icon {
  display: flex;
}
`;
function createDialogStyles(styleNonce) {
	const style = DOCUMENT.createElement("style");
	style.textContent = `
:host {
  --dialog-inset: var(--inset);
}

${DIALOG}
${DIALOG_HEADER}
${FORM}
${BUTTON}
${SUCCESS}
`;
	if (styleNonce) style.setAttribute("nonce", styleNonce);
	return style;
}
function getUser() {
	const currentUser = getCurrentScope().getUser();
	const isolationUser = getIsolationScope().getUser();
	const globalUser = getGlobalScope().getUser();
	if (currentUser && Object.keys(currentUser).length) return currentUser;
	if (isolationUser && Object.keys(isolationUser).length) return isolationUser;
	return globalUser;
}
var feedbackModalIntegration = (() => {
	return {
		name: "FeedbackModal",
		setupOnce() {},
		createDialog: ({ options, screenshotIntegration, sendFeedback, shadow }) => {
			const shadowRoot = shadow;
			const userKey = options.useSentryUser;
			const user = getUser();
			const el = DOCUMENT.createElement("div");
			const style = createDialogStyles(options.styleNonce);
			let originalOverflow = "";
			const dialog = {
				get el() {
					return el;
				},
				appendToDom() {
					if (!shadowRoot.contains(style) && !shadowRoot.contains(el)) {
						shadowRoot.appendChild(style);
						shadowRoot.appendChild(el);
					}
				},
				removeFromDom() {
					el.remove();
					style.remove();
					DOCUMENT.body.style.overflow = originalOverflow;
				},
				open() {
					renderContent(true);
					options.onFormOpen?.();
					getClient()?.emit("openFeedbackWidget");
					originalOverflow = DOCUMENT.body.style.overflow;
					DOCUMENT.body.style.overflow = "hidden";
				},
				close() {
					renderContent(false);
					DOCUMENT.body.style.overflow = originalOverflow;
				}
			};
			const screenshotInput = screenshotIntegration?.createInput({
				h: k$1,
				hooks,
				dialog,
				options
			});
			const renderContent = (open) => {
				R(/* @__PURE__ */ k$1(Dialog, {
					options,
					screenshotInput,
					showName: options.showName || options.isNameRequired,
					showEmail: options.showEmail || options.isEmailRequired,
					defaultName: String(userKey && user?.[userKey.name] || ""),
					defaultEmail: String(userKey && user?.[userKey.email] || ""),
					onFormClose: () => {
						renderContent(false);
						options.onFormClose?.();
					},
					onSubmit: sendFeedback,
					onSubmitSuccess: (data, eventId) => {
						renderContent(false);
						options.onSubmitSuccess?.(data, eventId);
					},
					onSubmitError: (error) => {
						options.onSubmitError?.(error);
					},
					onFormSubmitted: () => {
						options.onFormSubmitted?.();
					},
					open
				}), el);
			};
			return dialog;
		}
	};
});
function IconCloseFactory({ h }) {
	return function IconClose() {
		return /* @__PURE__ */ h("svg", {
			"data-test-id": "icon-close",
			viewBox: "0 0 16 16",
			fill: "#2B2233",
			height: "25px",
			width: "25px"
		}, /* @__PURE__ */ h("circle", {
			r: "7",
			cx: "8",
			cy: "8",
			fill: "white"
		}), /* @__PURE__ */ h("path", {
			strokeWidth: "1.5",
			d: "M8,16a8,8,0,1,1,8-8A8,8,0,0,1,8,16ZM8,1.53A6.47,6.47,0,1,0,14.47,8,6.47,6.47,0,0,0,8,1.53Z"
		}), /* @__PURE__ */ h("path", {
			strokeWidth: "1.5",
			d: "M5.34,11.41a.71.71,0,0,1-.53-.22.74.74,0,0,1,0-1.06l5.32-5.32a.75.75,0,0,1,1.06,1.06L5.87,11.19A.74.74,0,0,1,5.34,11.41Z"
		}), /* @__PURE__ */ h("path", {
			strokeWidth: "1.5",
			d: "M10.66,11.41a.74.74,0,0,1-.53-.22L4.81,5.87A.75.75,0,0,1,5.87,4.81l5.32,5.32a.74.74,0,0,1,0,1.06A.71.71,0,0,1,10.66,11.41Z"
		}));
	};
}
function createScreenshotInputStyles(styleNonce) {
	const style = DOCUMENT.createElement("style");
	const surface200 = "#1A141F";
	const gray100 = "#302735";
	style.textContent = `
.editor {
  display: flex;
  flex-grow: 1;
  flex-direction: column;
}

.editor__image-container {
  justify-items: center;
  padding: 15px;
  position: relative;
  height: 100%;
  border-radius: var(--menu-border-radius, 6px);

  background-color: ${surface200};
  background-image: repeating-linear-gradient(
      -145deg,
      transparent,
      transparent 8px,
      ${surface200} 8px,
      ${surface200} 11px
    ),
    repeating-linear-gradient(
      -45deg,
      transparent,
      transparent 15px,
      ${gray100} 15px,
      ${gray100} 16px
    );
}

.editor__canvas-container {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.editor__canvas-container > * {
  object-fit: contain;
  position: absolute;
}

.editor__tool-container {
  padding-top: 8px;
  display: flex;
  justify-content: center;
}

.editor__tool-bar {
  display: flex;
  gap: 8px;
}

.editor__tool {
  display: flex;
  padding: 8px 12px;
  justify-content: center;
  align-items: center;
  border: var(--button-border, var(--border));
  border-radius: var(--button-border-radius, 6px);
  background: var(--button-background, var(--background));
  color: var(--button-color, var(--foreground));
}

.editor__tool--active {
  background: var(--button-primary-background, var(--accent-background));
  color: var(--button-primary-color, var(--accent-foreground));
}

.editor__rect {
  position: absolute;
  z-index: 2;
}

.editor__rect button {
  opacity: 0;
  position: absolute;
  top: -12px;
  right: -12px;
  cursor: pointer;
  padding: 0;
  z-index: 3;
  border: none;
  background: none;
}

.editor__rect:hover button {
  opacity: 1;
}
`;
	if (styleNonce) style.setAttribute("nonce", styleNonce);
	return style;
}
function ToolbarFactory({ h }) {
	return function Toolbar({ action, setAction, options }) {
		return /* @__PURE__ */ h("div", { class: "editor__tool-container" }, /* @__PURE__ */ h("div", { class: "editor__tool-bar" }, /* @__PURE__ */ h("button", {
			type: "button",
			class: `editor__tool ${action === "highlight" ? "editor__tool--active" : ""}`,
			onClick: () => {
				setAction(action === "highlight" ? "" : "highlight");
			}
		}, options.highlightToolText), /* @__PURE__ */ h("button", {
			type: "button",
			class: `editor__tool ${action === "hide" ? "editor__tool--active" : ""}`,
			onClick: () => {
				setAction(action === "hide" ? "" : "hide");
			}
		}, options.hideToolText)));
	};
}
var FRAMES_BEFORE_CAPTURE = 2;
var MAX_WAIT_BEFORE_CAPTURE_MS = 300;
function waitForFrames(frames, timeout) {
	return new Promise((resolve) => {
		const timeoutId = setTimeout(resolve, timeout);
		let remaining = frames;
		const onFrame = () => {
			remaining -= 1;
			if (remaining > 0) {
				WINDOW$5.requestAnimationFrame(onFrame);
				return;
			}
			clearTimeout(timeoutId);
			resolve();
		};
		WINDOW$5.requestAnimationFrame(onFrame);
	});
}
function useTakeScreenshotFactory({ hooks }) {
	function useDpi() {
		const [dpi, setDpi] = hooks.useState(WINDOW$5.devicePixelRatio ?? 1);
		hooks.useEffect(() => {
			const onChange = () => {
				setDpi(WINDOW$5.devicePixelRatio);
			};
			const media = matchMedia(`(resolution: ${WINDOW$5.devicePixelRatio}dppx)`);
			media.addEventListener("change", onChange);
			return () => {
				media.removeEventListener("change", onChange);
			};
		}, []);
		return dpi;
	}
	return function useTakeScreenshot({ onBeforeScreenshot, onScreenshot, onAfterScreenshot, onError }) {
		const dpi = useDpi();
		hooks.useEffect(() => {
			const takeScreenshot = async () => {
				onBeforeScreenshot();
				await waitForFrames(FRAMES_BEFORE_CAPTURE, MAX_WAIT_BEFORE_CAPTURE_MS);
				const stream = await NAVIGATOR$1.mediaDevices.getDisplayMedia({
					video: {
						width: WINDOW$5.innerWidth * dpi,
						height: WINDOW$5.innerHeight * dpi
					},
					audio: false,
					monitorTypeSurfaces: "exclude",
					preferCurrentTab: true,
					selfBrowserSurface: "include",
					surfaceSwitching: "exclude"
				});
				const video = DOCUMENT.createElement("video");
				await new Promise((resolve, reject) => {
					video.srcObject = stream;
					video.onloadedmetadata = () => {
						onScreenshot(video, dpi);
						stream.getTracks().forEach((track) => track.stop());
						resolve();
					};
					video.play().catch(reject);
				});
				onAfterScreenshot();
			};
			takeScreenshot().catch(onError);
		}, []);
	};
}
function drawRect(command, ctx, color) {
	switch (command.type) {
		case "highlight":
			ctx.save();
			ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
			ctx.shadowBlur = 50;
			ctx.fillStyle = color;
			ctx.fillRect(command.x - 1, command.y - 1, command.w + 2, command.h + 2);
			ctx.clearRect(command.x, command.y, command.w, command.h);
			ctx.restore();
			break;
		case "hide":
			ctx.fillStyle = "rgb(0, 0, 0)";
			ctx.fillRect(command.x, command.y, command.w, command.h);
	}
}
function with2dContext(canvas, options, callback) {
	if (!canvas) return;
	const ctx = canvas.getContext("2d", options);
	if (!ctx) return;
	callback(canvas, ctx);
}
function paintImage(maybeDest, source) {
	with2dContext(maybeDest, { alpha: true }, (destCanvas, destCtx) => {
		destCtx.drawImage(source, 0, 0, source.width, source.height, 0, 0, destCanvas.width, destCanvas.height);
	});
}
function paintForeground(maybeCanvas, strokeColor, drawCommands) {
	with2dContext(maybeCanvas, { alpha: true }, (canvas, ctx) => {
		if (drawCommands.length) {
			ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
			ctx.fillRect(0, 0, canvas.width, canvas.height);
		}
		drawCommands.forEach((command) => {
			drawRect(command, ctx, strokeColor);
		});
	});
}
function ScreenshotEditorFactory({ h: h2, hooks, outputBuffer, dialog, options }) {
	const useTakeScreenshot = useTakeScreenshotFactory({ hooks });
	const Toolbar = ToolbarFactory({ h: h2 });
	const IconClose = IconCloseFactory({ h: h2 });
	const editorStyleInnerText = { __html: createScreenshotInputStyles(options.styleNonce).innerText };
	const dialogStyle = dialog.el.style;
	const ScreenshotEditor = ({ screenshot }) => {
		const [action, setAction] = hooks.useState("highlight");
		const [drawCommands, setDrawCommands] = hooks.useState([]);
		const measurementRef = hooks.useRef(null);
		const backgroundRef = hooks.useRef(null);
		const foregroundRef = hooks.useRef(null);
		const mouseRef = hooks.useRef(null);
		const [scaleFactor, setScaleFactor] = hooks.useState(1);
		const strokeColor = hooks.useMemo(() => {
			const sentryFeedback = DOCUMENT.getElementById(options.id);
			if (!sentryFeedback) return "white";
			const computedStyle = getComputedStyle(sentryFeedback);
			return computedStyle.getPropertyValue("--button-primary-background") || computedStyle.getPropertyValue("--accent-background");
		}, [options.id]);
		hooks.useLayoutEffect(() => {
			const handleResize = () => {
				const measurementDiv = measurementRef.current;
				if (!measurementDiv) return;
				with2dContext(screenshot.canvas, { alpha: false }, (canvas) => {
					const scale = Math.min(measurementDiv.clientWidth / canvas.width, measurementDiv.clientHeight / canvas.height);
					setScaleFactor(scale);
				});
				if (measurementDiv.clientHeight === 0 || measurementDiv.clientWidth === 0) setTimeout(handleResize, 0);
			};
			handleResize();
			WINDOW$5.addEventListener("resize", handleResize);
			return () => {
				WINDOW$5.removeEventListener("resize", handleResize);
			};
		}, [screenshot]);
		const setCanvasSize = hooks.useCallback((maybeCanvas, scale) => {
			with2dContext(maybeCanvas, { alpha: true }, (canvas, ctx) => {
				ctx.scale(scale, scale);
				canvas.width = screenshot.canvas.width;
				canvas.height = screenshot.canvas.height;
			});
		}, [screenshot]);
		hooks.useEffect(() => {
			setCanvasSize(backgroundRef.current, screenshot.dpi);
			paintImage(backgroundRef.current, screenshot.canvas);
		}, [screenshot]);
		hooks.useEffect(() => {
			setCanvasSize(foregroundRef.current, screenshot.dpi);
			with2dContext(foregroundRef.current, { alpha: true }, (canvas, ctx) => {
				ctx.clearRect(0, 0, canvas.width, canvas.height);
			});
			paintForeground(foregroundRef.current, strokeColor, drawCommands);
		}, [drawCommands, strokeColor]);
		hooks.useEffect(() => {
			setCanvasSize(outputBuffer, screenshot.dpi);
			paintImage(outputBuffer, screenshot.canvas);
			with2dContext(DOCUMENT.createElement("canvas"), { alpha: true }, (foreground, ctx) => {
				ctx.scale(screenshot.dpi, screenshot.dpi);
				foreground.width = screenshot.canvas.width;
				foreground.height = screenshot.canvas.height;
				paintForeground(foreground, strokeColor, drawCommands);
				paintImage(outputBuffer, foreground);
			});
		}, [
			drawCommands,
			screenshot,
			strokeColor
		]);
		const handleMouseDown = (e) => {
			if (!action || !mouseRef.current) return;
			const boundingRect = mouseRef.current.getBoundingClientRect();
			const startingPoint = {
				type: action,
				x: (e.clientX - boundingRect.x) / scaleFactor,
				y: (e.clientY - boundingRect.y) / scaleFactor
			};
			const getDrawCommand = (startingPoint2, e2) => {
				const x = (e2.clientX - boundingRect.x) / scaleFactor;
				const y = (e2.clientY - boundingRect.y) / scaleFactor;
				return {
					type: startingPoint2.type,
					x: Math.min(startingPoint2.x, x),
					y: Math.min(startingPoint2.y, y),
					w: Math.abs(x - startingPoint2.x),
					h: Math.abs(y - startingPoint2.y)
				};
			};
			const handleMouseMove = (e2) => {
				with2dContext(foregroundRef.current, { alpha: true }, (canvas, ctx) => {
					ctx.clearRect(0, 0, canvas.width, canvas.height);
				});
				paintForeground(foregroundRef.current, strokeColor, [...drawCommands, getDrawCommand(startingPoint, e2)]);
			};
			const handleMouseUp = (e2) => {
				const drawCommand = getDrawCommand(startingPoint, e2);
				if (drawCommand.w * scaleFactor >= 1 && drawCommand.h * scaleFactor >= 1) setDrawCommands((prev) => [...prev, drawCommand]);
				DOCUMENT.removeEventListener("mousemove", handleMouseMove);
				DOCUMENT.removeEventListener("mouseup", handleMouseUp);
			};
			DOCUMENT.addEventListener("mousemove", handleMouseMove);
			DOCUMENT.addEventListener("mouseup", handleMouseUp);
		};
		const deleteRect = hooks.useCallback((index) => {
			return (e) => {
				e.preventDefault();
				e.stopPropagation();
				setDrawCommands((prev) => {
					const updatedRects = [...prev];
					updatedRects.splice(index, 1);
					return updatedRects;
				});
			};
		}, []);
		const dimensions = {
			width: `${screenshot.canvas.width * scaleFactor}px`,
			height: `${screenshot.canvas.height * scaleFactor}px`
		};
		const handleStopPropagation = (e) => {
			e.stopPropagation();
		};
		return /* @__PURE__ */ h2("div", { class: "editor" }, /* @__PURE__ */ h2("style", {
			nonce: options.styleNonce,
			dangerouslySetInnerHTML: editorStyleInnerText
		}), /* @__PURE__ */ h2("div", { class: "editor__image-container" }, /* @__PURE__ */ h2("div", {
			class: "editor__canvas-container",
			ref: measurementRef
		}, /* @__PURE__ */ h2("canvas", {
			ref: backgroundRef,
			id: "background",
			style: dimensions
		}), /* @__PURE__ */ h2("canvas", {
			ref: foregroundRef,
			id: "foreground",
			style: dimensions
		}), /* @__PURE__ */ h2("div", {
			ref: mouseRef,
			onMouseDown: handleMouseDown,
			style: dimensions
		}, drawCommands.map((rect, index) => /* @__PURE__ */ h2("div", {
			key: index,
			class: "editor__rect",
			style: {
				top: `${rect.y * scaleFactor}px`,
				left: `${rect.x * scaleFactor}px`,
				width: `${rect.w * scaleFactor}px`,
				height: `${rect.h * scaleFactor}px`
			}
		}, /* @__PURE__ */ h2("button", {
			"aria-label": options.removeHighlightText,
			onClick: deleteRect(index),
			onMouseDown: handleStopPropagation,
			onMouseUp: handleStopPropagation,
			type: "button"
		}, /* @__PURE__ */ h2(IconClose, null))))))), /* @__PURE__ */ h2(Toolbar, {
			options,
			action,
			setAction
		}));
	};
	return function Wrapper({ onError }) {
		const [screenshot, setScreenshot] = hooks.useState();
		useTakeScreenshot({
			onBeforeScreenshot: hooks.useCallback(() => {
				dialogStyle.display = "none";
			}, []),
			onScreenshot: hooks.useCallback((screenshotVideo, dpi) => {
				with2dContext(DOCUMENT.createElement("canvas"), { alpha: false }, (canvas, ctx) => {
					ctx.scale(dpi, dpi);
					canvas.width = screenshotVideo.videoWidth;
					canvas.height = screenshotVideo.videoHeight;
					ctx.drawImage(screenshotVideo, 0, 0, canvas.width, canvas.height);
					setScreenshot({
						canvas,
						dpi
					});
				});
				outputBuffer.width = screenshotVideo.videoWidth;
				outputBuffer.height = screenshotVideo.videoHeight;
			}, []),
			onAfterScreenshot: hooks.useCallback(() => {
				dialogStyle.display = "block";
			}, []),
			onError: hooks.useCallback((error) => {
				dialogStyle.display = "block";
				onError(error);
			}, [])
		});
		if (screenshot) return /* @__PURE__ */ h2(ScreenshotEditor, { screenshot });
		return /* @__PURE__ */ h2("div", null);
	};
}
var feedbackScreenshotIntegration = (() => {
	return {
		name: "FeedbackScreenshot",
		setupOnce() {},
		createInput: ({ h, hooks, dialog, options }) => {
			const outputBuffer = DOCUMENT.createElement("canvas");
			return {
				input: ScreenshotEditorFactory({
					h,
					hooks,
					outputBuffer,
					dialog,
					options
				}),
				value: async () => {
					const blob = await new Promise((resolve) => {
						outputBuffer.toBlob(resolve, "image/png");
					});
					if (blob) return {
						data: new Uint8Array(await blob.arrayBuffer()),
						filename: "screenshot.png",
						contentType: "application/png"
					};
				}
			};
		}
	};
});
// ../DnD helper/node_modules/web-vitals/dist/web-vitals.js
var t$2 = -1;
var n$2 = () => t$2;
var e$1 = (n) => {
	addEventListener("pageshow", (e) => {
		e.persisted && (t$2 = e.timeStamp, n(e));
	}, !0);
};
var i$2 = (t, n, e, i) => {
	let o, s;
	return (a) => {
		n.value >= 0 && (a || i) && (s = n.value - (o ?? 0), (s || void 0 === o) && (o = n.value, n.delta = s, n.rating = ((t, n) => t > n[1] ? "poor" : t > n[0] ? "needs-improvement" : "good")(n.value, e), t(n)));
	};
};
var o = (t) => {
	requestAnimationFrame(() => requestAnimationFrame(() => t()));
};
var s = () => {
	const t = performance.getEntriesByType("navigation")[0];
	if (t && t.responseStart > 0 && t.responseStart < performance.now()) return t;
};
var a = () => s()?.activationStart ?? 0;
var r$1 = -1;
var c = /* @__PURE__ */ new Set();
var f = () => "hidden" !== document.visibilityState || document.prerendering ? 1 / 0 : 0;
var h = (t) => {
	if ("hidden" === document.visibilityState) {
		if ("visibilitychange" === t.type) for (const t of c) t();
		isFinite(r$1) || (r$1 = "visibilitychange" === t.type ? t.timeStamp : 0, removeEventListener("prerenderingchange", h, !0));
	}
};
var d = (t = !1) => {
	if (t && (r$1 = 1 / 0), r$1 < 0) {
		const t = a();
		r$1 = (document.prerendering ? void 0 : globalThis.performance.getEntriesByType("visibility-state").find((n) => "hidden" === n.name && n.startTime >= t)?.startTime) ?? f(), addEventListener("visibilitychange", h, !0), addEventListener("prerenderingchange", h, !0), e$1(() => {
			setTimeout(() => {
				r$1 = f();
			});
		});
	}
	return {
		get firstHiddenTime() {
			return r$1;
		},
		onHidden(t) {
			c.add(t);
		}
	};
};
var l = (t, e = -1, i, o = 0, r, c, f) => {
	const h = s(), d = h?.navigationId || 0;
	let l = "navigate";
	i ? l = i : n$2() >= 0 ? l = "back-forward-cache" : h && (document.prerendering || a() > 0 ? l = "prerender" : document.wasDiscarded ? l = "restore" : h.type && (l = h.type.replace(/_/g, "-")));
	return {
		name: t,
		value: e,
		rating: "good",
		delta: 0,
		entries: [],
		id: `v6-${Date.now()}-${Math.floor(8999999999999 * Math.random()) + 0xe8d4a51000}`,
		navigationType: l,
		navigationId: o || d,
		navigationInteractionId: r,
		navigationURL: c || h?.name,
		navigationStartTime: f || 0
	};
};
var g = /* @__PURE__ */ new WeakMap();
function u(t, n) {
	let e = g.get(n);
	return e || (e = /* @__PURE__ */ new WeakMap(), g.set(n, e)), e.get(t) || e.set(t, new n()), e.get(t);
}
var v = class {
	t;
	i = 0;
	o = [];
	h(t) {
		if (t.hadRecentInput) return;
		const n = this.o[0], e = this.o.at(-1);
		this.i && n && e && t.startTime - e.startTime < 1e3 && t.startTime - n.startTime < 5e3 ? (this.i += t.value, this.o.push(t)) : (this.i = t.value, this.o = [t]), this.t?.(t);
	}
};
var m = (t, n, e = {}) => {
	try {
		const i = t.filter((t) => PerformanceObserver.supportedEntryTypes.includes(t));
		if (i.length > 0) {
			const t = new PerformanceObserver((t) => {
				queueMicrotask(() => {
					const e = t.getEntries();
					i.length > 1 && e.sort((t, n) => t.startTime + t.duration - (n.startTime + n.duration)), n(e);
				});
			});
			for (const n of i) t.observe({
				type: n,
				buffered: !0,
				...e
			});
			return t;
		}
	} catch {}
};
var p = (t) => globalThis.PerformanceObserver?.supportedEntryTypes?.includes("soft-navigation") && "function" == typeof globalThis.PerformanceSoftNavigation?.prototype?.getLargestInteractionContentfulPaint && t && t.reportSoftNavs;
var b = (t, n) => {
	if (t.set(n.navigationId, n), t.size > 2) {
		const n = t.keys().next().value;
		void 0 !== n && t.delete(n);
	}
};
var T = (t) => {
	let n = !1;
	return () => {
		n || (t(), n = !0);
	};
};
var y = class {
	l;
};
var _ = (t) => {
	document.prerendering ? addEventListener("prerenderingchange", t, !0) : t();
};
var E = [1800, 3e3];
var M = (t, s = {}) => {
	const r = p(s);
	_(() => {
		const c = u(s, y), f = d();
		let h, g = l("FCP");
		const v = m(["paint"], (t) => {
			for (const n of t) "first-contentful-paint" === n.name && (v.disconnect(), n.startTime < f.firstHiddenTime && (g.value = Math.max(n.startTime - a(), 0), g.entries.push(n), g.navigationId = n.navigationId || g.navigationId, h(!0)));
		});
		if (v && (h = i$2(t, g, E, s.reportAllChanges), e$1((e) => {
			g = l("FCP", -1, "back-forward-cache", g.navigationId, g.navigationInteractionId, g.navigationURL, n$2()), h = i$2(t, g, E, s.reportAllChanges), o(() => {
				g.value = performance.now() - e.timeStamp, h(!0);
			});
		})), r) m(["soft-navigation"], (n) => {
			n.forEach((n) => {
				c.l && n.navigationId && b(c.l, n);
				g = l("FCP", Math.max((n.presentationTime || n.paintTime || 0) - n.startTime, 0), "soft-navigation", n.navigationId, n.interactionId, n.name, n.startTime), h = i$2(t, g, E, s.reportAllChanges), h(!0);
			});
		}, s);
	});
};
var L = [.1, .25];
var P = (t, s = {}) => {
	const a = d();
	M(T(() => {
		let r, c = l("CLS", 0);
		const f = u(s, v), h = (n, e, o, a, h) => {
			c = l("CLS", 0, n, e, o, a, h), f.i = 0, r = i$2(t, c, L, s.reportAllChanges);
		}, d = (t = !1) => {
			f.i > c.value && (c.value = f.i, c.entries = f.o), r(t);
		}, g = (t) => {
			d(!0), h("soft-navigation", t.navigationId, t.interactionId, t.name, t.startTime);
		}, b = (t) => {
			for (const n of t) "soft-navigation" !== n.entryType ? f.h(n) : g(n);
			d();
		}, T = ["layout-shift"];
		p(s) && T.push("soft-navigation");
		const y = m(T, b);
		y && (r = i$2(t, c, L, s.reportAllChanges), a.onHidden(() => {
			b(y.takeRecords()), r(!0);
		}), e$1(() => {
			h("back-forward-cache", c.navigationId, c.navigationInteractionId, c.navigationURL, n$2()), o(r);
		}), setTimeout(r));
	}));
};
var w = 0;
var I = 1 / 0;
var k = 0;
var C = (t) => {
	for (const n of t) n.interactionId && (I = Math.min(I, n.interactionId), k = Math.max(k, n.interactionId), w = k ? (k - I) / 7 + 1 : 0);
};
var F;
var N = () => F ? w : performance.interactionCount ?? 0;
var B = () => {
	"interactionCount" in performance || F || (F = m(["event"], C, { durationThreshold: 0 }));
};
var S = class {
	u = 0;
	v = [];
	m = /* @__PURE__ */ new Map();
	p;
	T;
	_() {
		return N() - this.u;
	}
	M() {
		this.u = N(), this.v.length = 0, this.m.clear();
	}
	L(t) {
		const n = this._(), e = Math.min(this.v.length - 1, Math.floor(n / 50));
		return !n || -1 !== e || "soft-navigation" !== t && "back-forward-cache" !== t ? this.v[e] : {
			P: 8,
			id: -1,
			entries: []
		};
	}
	h(t) {
		if (this.p?.(t), !t.interactionId) return;
		const n = this.v.at(-1);
		let e = this.m.get(t.interactionId);
		if (e || this.v.length < 10 || t.duration > n.P) {
			if (e ? t.duration > e.P ? (e.entries = [t], e.P = t.duration) : t.duration === e.P && t.startTime === e.entries[0].startTime && e.entries.push(t) : (e = {
				id: t.interactionId,
				entries: [t],
				P: t.duration
			}, this.m.set(e.id, e), this.v.push(e)), this.v.sort((t, n) => n.P - t.P), this.v.length > 10) {
				const t = this.v.splice(10);
				for (const n of t) this.m.delete(n.id);
			}
			this.T?.(e);
		}
	}
};
var q = (t) => {
	const n = "requestIdleCallback" in globalThis ? 1e3 : 0, e = globalThis.requestIdleCallback || setTimeout, i = globalThis.cancelIdleCallback || clearTimeout;
	if ("hidden" === document.visibilityState) t();
	else {
		const o = T(t);
		let s = -1;
		const a = () => {
			i(s), o();
		};
		addEventListener("visibilitychange", a, {
			once: !0,
			capture: !0
		}), s = e(() => {
			removeEventListener("visibilitychange", a, { capture: !0 }), o();
		}, { timeout: n });
	}
};
var A = [200, 500];
var x = (t, o = {}) => {
	if (!globalThis.PerformanceEventTiming || !("interactionId" in PerformanceEventTiming.prototype)) return;
	const s = d();
	_(() => {
		B();
		let a, r = l("INP");
		const c = u(o, S), f = (n, e, s, f, h) => {
			c.M(), r = l("INP", -1, n, e, s, f, h), a = i$2(t, r, A, o.reportAllChanges);
		}, h = () => {
			const t = c.L(r.navigationType);
			t && t.P !== r.value && (r.value = t.P, r.entries = t.entries, a());
		}, d = (t) => {
			h(), a(!0), f("soft-navigation", t.navigationId, t.interactionId, t.name, t.startTime);
		}, g = (t, n = !1) => {
			q(() => {
				for (const n of t) "soft-navigation" !== n.entryType ? c.h(n) : d(n);
				h(), n && a(!0);
			});
		}, v = ["event", "first-input"];
		p(o) && v.push("soft-navigation");
		const b = m(v, g, {
			...o,
			durationThreshold: o.durationThreshold ?? 40
		});
		a = i$2(t, r, A, o.reportAllChanges), b && (s.onHidden(() => {
			g(b.takeRecords(), !0);
		}), e$1(() => {
			f("back-forward-cache", r.navigationId, r.navigationInteractionId, r.navigationURL, n$2());
		}));
	});
};
var H = class {
	p;
	l;
	h(t) {
		this.p?.(t);
	}
};
var O = [2500, 4e3];
var U = (t, s = {}) => {
	let r = !1;
	const c = p(s);
	_(() => {
		let f, h = d(), g = l("LCP");
		const v = u(s, H), p = (n, e, o, a, c) => {
			g = l("LCP", -1, n, e, o, a, c), f = i$2(t, g, O, s.reportAllChanges), r = !1, "soft-navigation" === n && (h = d(!0));
		}, T = (t) => {
			v.l && t.navigationId && b(v.l, t), r || f(!0), p("soft-navigation", t.navigationId, t.interactionId, t.name, t.startTime);
			const n = t.getLargestInteractionContentfulPaint?.();
			n && y([n]);
		}, y = (t) => {
			s.reportAllChanges || c || (t = t.slice(-1));
			for (const n of t) {
				if (!n) continue;
				if ("soft-navigation" === n.entryType) {
					T(n);
					continue;
				}
				let t = 0, e = [], i = n.startTime;
				if ("largest-contentful-paint" === n.entryType) t = Math.max(n.startTime - a(), 0), v.h(n), e = [n];
				else if ("interaction-contentful-paint" === n.entryType) {
					const o = n;
					if (!g.navigationId) continue;
					if ("interactionId" in o && o.interactionId != g.navigationInteractionId) continue;
					i = o.largestContentfulPaint?.renderTime || 0, t = Math.max(i - n.startTime, 0), o.largestContentfulPaint && (v.h(o.largestContentfulPaint), e = [o.largestContentfulPaint]);
				}
				i < h.firstHiddenTime && (g.value = t, g.entries = e, f());
			}
		}, _ = ["largest-contentful-paint"];
		c && _.push("interaction-contentful-paint", "soft-navigation");
		const E = m(_, y);
		if (E) {
			f = i$2(t, g, O, s.reportAllChanges);
			const a = [
				"keydown",
				"click",
				"visibilitychange"
			], h = (t) => {
				if (t.isTrusted && !r) {
					const t = g.id;
					q(() => {
						if (!r) {
							if (!c) {
								E.disconnect();
								for (const t of a) removeEventListener(t, h, { capture: !0 });
							}
							t === g.id && (r = !0, f(!0));
						}
					});
				}
			};
			for (const t of a) addEventListener(t, h, { capture: !0 });
			e$1((e) => {
				p("back-forward-cache", g.navigationId, g.navigationInteractionId, g.navigationURL, n$2()), f = i$2(t, g, O, s.reportAllChanges), o(() => {
					g.value = performance.now() - e.timeStamp, r = !0, f(!0);
				});
			});
		}
	});
};
var W = [800, 1800];
var $ = (t) => {
	document.prerendering ? _(() => $(t)) : "complete" !== document.readyState ? addEventListener("load", () => $(t), !0) : setTimeout(t);
};
var D = (t, o = {}) => {
	const r = p(o);
	let c = l("TTFB"), f = i$2(t, c, W, o.reportAllChanges);
	$(() => {
		const h = s();
		if (h) {
			const s = h.responseStart;
			if (c.value = Math.max(s - a(), 0), c.entries = [h], f(!0), e$1(() => {
				c = l("TTFB", 0, "back-forward-cache", c.navigationId, c.navigationInteractionId, c.navigationURL, n$2()), f = i$2(t, c, W, o.reportAllChanges), f(!0);
			}), r) m(["soft-navigation"], (n) => {
				n.forEach((n) => {
					n.navigationId && (c = l("TTFB", 0, "soft-navigation", n.navigationId, n.interactionId, n.name, n.startTime), c.entries = [n], f = i$2(t, c, W, o.reportAllChanges), f(!0));
				});
			}, o);
		}
	});
};
// ../DnD helper/node_modules/@sentry/browser-utils/build/esm/debug-build.js
var DEBUG_BUILD$3 = typeof __SENTRY_DEBUG__ === "undefined" || __SENTRY_DEBUG__;
// ../DnD helper/node_modules/@sentry/browser-utils/build/esm/instrumentation/performanceObserver.js
var handlers$1 = {};
var instrumented = {};
var _previousCls;
var _previousLcp;
var _previousTtfb;
var _previousInp;
var _previousFcp;
var stopListeners = {};
var _reportSoftNavs = false;
var _reportBfcache = false;
function enableSoftNavigationReporting() {
	_reportSoftNavs = true;
}
function enableBfcacheReporting() {
	_reportBfcache = true;
}
function addClsInstrumentationHandler(callback, stopOnCallback = false) {
	return addMetricObserver("cls", callback, instrumentCls, _previousCls, stopOnCallback);
}
function addLcpInstrumentationHandler(callback, stopOnCallback = false) {
	return addMetricObserver("lcp", callback, instrumentLcp, _previousLcp, stopOnCallback);
}
function addTtfbInstrumentationHandler(callback) {
	return addMetricObserver("ttfb", callback, instrumentTtfb, _previousTtfb);
}
function addFcpInstrumentationHandler(callback) {
	return addMetricObserver("fcp", callback, instrumentFcp, _previousFcp);
}
function addInpInstrumentationHandler(callback) {
	return addMetricObserver("inp", callback, instrumentInp, _previousInp);
}
function addPerformanceInstrumentationHandler(type, callback) {
	addHandler(type, callback);
	if (!instrumented[type]) {
		instrumentPerformanceObserver(type);
		instrumented[type] = true;
	}
	return getCleanupCallback(type, callback);
}
function triggerHandlers(type, data) {
	const typeHandlers = handlers$1[type];
	if (!typeHandlers?.length) return;
	for (const handler of typeHandlers) try {
		handler(data);
	} catch (e) {
		DEBUG_BUILD$3 && debug$2.error(`Error while triggering instrumentation handler.
Type: ${type}
Name: ${getFunctionName(handler)}
Error:`, e);
	}
}
function unlessBfcacheDisabled(callback) {
	return (metric) => {
		if (!_reportBfcache && metric.navigationType === "back-forward-cache") return;
		callback(metric);
	};
}
function instrumentCls() {
	return P(unlessBfcacheDisabled((metric) => {
		triggerHandlers("cls", { metric });
		_previousCls = metric;
	}), {
		reportAllChanges: !_reportSoftNavs && !_reportBfcache,
		reportSoftNavs: _reportSoftNavs
	});
}
function instrumentLcp() {
	return U(unlessBfcacheDisabled((metric) => {
		triggerHandlers("lcp", { metric });
		_previousLcp = metric;
	}), {
		reportAllChanges: !_reportSoftNavs && !_reportBfcache,
		reportSoftNavs: _reportSoftNavs
	});
}
function instrumentTtfb() {
	return D(unlessBfcacheDisabled((metric) => {
		triggerHandlers("ttfb", { metric });
		_previousTtfb = metric;
	}));
}
function instrumentFcp() {
	return M(unlessBfcacheDisabled((metric) => {
		triggerHandlers("fcp", { metric });
		_previousFcp = metric;
	}));
}
function instrumentInp() {
	return x(unlessBfcacheDisabled((metric) => {
		triggerHandlers("inp", { metric });
		_previousInp = metric;
	}), { reportSoftNavs: _reportSoftNavs });
}
function addMetricObserver(type, callback, instrumentFn, previousValue, stopOnCallback = false) {
	addHandler(type, callback);
	if (!instrumented[type]) {
		instrumented[type] = true;
		Promise.resolve().then(() => {
			stopListeners[type] = instrumentFn();
		});
	}
	if (previousValue) callback({ metric: previousValue });
	return getCleanupCallback(type, callback, stopOnCallback);
}
function instrumentPerformanceObserver(type) {
	const options = {
		type,
		buffered: true
	};
	if (type === "event") options.durationThreshold = 0;
	try {
		if (PerformanceObserver.supportedEntryTypes.includes(type)) new PerformanceObserver((list) => {
			Promise.resolve().then(() => {
				triggerHandlers(type, { entries: list.getEntries() });
			});
		}).observe(options);
	} catch {}
}
function addHandler(type, handler) {
	handlers$1[type] = handlers$1[type] || [];
	handlers$1[type].push(handler);
}
function getCleanupCallback(type, callback, stopOnCleanup = false) {
	return () => {
		if (stopOnCleanup) stopListeners[type]?.();
		const typeHandlers = handlers$1[type];
		if (!typeHandlers) return;
		const index = typeHandlers.indexOf(callback);
		if (index !== -1) typeHandlers.splice(index, 1);
	};
}
function isPerformanceEventTiming(entry) {
	return "duration" in entry;
}
// ../DnD helper/node_modules/@sentry/browser-utils/build/esm/types.js
var WINDOW$4 = GLOBAL_OBJ;
// ../DnD helper/node_modules/@sentry/browser-utils/build/esm/web-vitals/softNavs.js
var MAX_TRACKED_NAVIGATIONS = 5;
var INTERACTION_MATCH_TOLERANCE_MS = 5;
var _pendingNavigation;
var _pendingInteraction;
var _lastInteractionTimestamp;
var _interactionIdToNavigationSpan = new LRUMap(MAX_TRACKED_NAVIGATIONS);
var _navigationIdToNavigationSpan = new LRUMap(MAX_TRACKED_NAVIGATIONS);
var _correlationStarted = false;
function interactionMatches(entryStartTime, interactionTimestamp) {
	return Math.abs(entryStartTime - interactionTimestamp) <= INTERACTION_MATCH_TOLERANCE_MS;
}
function supportsSoftNavigations() {
	try {
		return PerformanceObserver.supportedEntryTypes.includes("soft-navigation") && typeof WINDOW$4.PerformanceSoftNavigation?.prototype?.getLargestInteractionContentfulPaint === "function";
	} catch {
		return false;
	}
}
function startSoftNavigationCorrelation(client) {
	if (_correlationStarted || !supportsSoftNavigations()) return;
	_correlationStarted = true;
	const onInteraction = (event) => {
		if (event.isTrusted) _lastInteractionTimestamp = event.timeStamp;
	};
	WINDOW$4.addEventListener("click", onInteraction, {
		capture: true,
		passive: true
	});
	WINDOW$4.addEventListener("keydown", onInteraction, {
		capture: true,
		passive: true
	});
	client.on("spanStart", (span) => {
		if (spanToJSON(span).attributes?.["sentry.op"] !== "navigation") return;
		_pendingNavigation = void 0;
		const interactionTimestamp = _lastInteractionTimestamp;
		if (interactionTimestamp == null) return;
		if (_pendingInteraction?.interactionTimestamp === interactionTimestamp) {
			_interactionIdToNavigationSpan.set(_pendingInteraction.interactionId, span);
			_pendingInteraction = void 0;
			return;
		}
		_pendingNavigation = {
			span,
			interactionTimestamp
		};
	});
	const bindInteractionToNavigationSpan = ({ entries }) => {
		for (const entry of entries) {
			if (!isPerformanceEventTiming(entry) || !entry.interactionId) continue;
			const pending = _pendingNavigation;
			if (pending && interactionMatches(entry.startTime, pending.interactionTimestamp)) {
				_interactionIdToNavigationSpan.set(entry.interactionId, pending.span);
				_pendingNavigation = void 0;
				continue;
			}
			if (_interactionIdToNavigationSpan.get(entry.interactionId)) continue;
			if (_lastInteractionTimestamp != null && interactionMatches(entry.startTime, _lastInteractionTimestamp)) _pendingInteraction = {
				interactionId: entry.interactionId,
				interactionTimestamp: _lastInteractionTimestamp
			};
		}
	};
	addPerformanceInstrumentationHandler("event", bindInteractionToNavigationSpan);
	addPerformanceInstrumentationHandler("first-input", bindInteractionToNavigationSpan);
	addPerformanceInstrumentationHandler("soft-navigation", ({ entries }) => {
		for (const entry of entries) {
			const span = _interactionIdToNavigationSpan.get(entry.interactionId);
			if (!span) {
				DEBUG_BUILD$3 && debug$2.log(`[SoftNav] No navigation span found for soft navigation ${entry.navigationId}`, entry);
				continue;
			}
			_navigationIdToNavigationSpan.set(entry.navigationId, span);
			span.setAttribute(Zt, entry.navigationId);
		}
	});
}
function getNavigationSpanForMetric(metric) {
	if (metric.navigationType !== "soft-navigation") return;
	const span = _navigationIdToNavigationSpan.get(metric.navigationId);
	if (span) return span;
	return metric.navigationInteractionId != null ? _interactionIdToNavigationSpan.get(metric.navigationInteractionId) : void 0;
}
// ../DnD helper/node_modules/@sentry/browser-utils/build/esm/performance/utils.js
function isMeasurementValue(value) {
	return typeof value === "number" && isFinite(value);
}
function startAndEndSpan(parentSpan, startTimeInSeconds, endTime, { ...ctx }) {
	const parentStartTime = spanToStaticSpanJSON(parentSpan).start_timestamp;
	if (parentStartTime && parentStartTime > startTimeInSeconds) {
		if (typeof parentSpan.updateStartTime === "function") parentSpan.updateStartTime(startTimeInSeconds);
	}
	return withActiveSpan(parentSpan, () => {
		const span = startInactiveSpan({
			startTime: startTimeInSeconds,
			...ctx
		});
		if (span) span.end(endTime);
		return span;
	});
}
function getBrowserPerformanceAPI() {
	return WINDOW$4.addEventListener && WINDOW$4.performance;
}
function msToSec(time) {
	return time / 1e3;
}
function extractNetworkProtocol(nextHopProtocol) {
	let name = "unknown";
	let version = "unknown";
	let _name = "";
	for (const char of nextHopProtocol) {
		if (char === "/") {
			[name, version] = nextHopProtocol.split("/");
			break;
		}
		if (!isNaN(Number(char))) {
			name = _name === "h" ? "http" : _name;
			version = nextHopProtocol.split(_name)[1];
			break;
		}
		_name += char;
	}
	if (_name === nextHopProtocol) name = _name;
	return {
		name,
		version
	};
}
function supportsWebVital(entryType) {
	try {
		return PerformanceObserver.supportedEntryTypes.includes(entryType);
	} catch {
		return false;
	}
}
// ../DnD helper/node_modules/@sentry/browser-utils/build/esm/performance/resourceTiming.js
function resourceTimingToSpanAttributes(resourceTiming) {
	const timingSpanData = {};
	if (resourceTiming.nextHopProtocol != void 0) {
		const { name, version } = extractNetworkProtocol(resourceTiming.nextHopProtocol);
		timingSpanData[Eu] = version;
		timingSpanData[Tu] = name;
	}
	if (performanceTimeToSeconds(resourceTiming.startTime) === void 0) return timingSpanData;
	const getAbsoluteTime = (time) => time ? performanceTimeToSeconds(time, resourceTiming.startTime) : time;
	return dropUndefinedKeysFromObject({
		...timingSpanData,
		[il]: getAbsoluteTime(resourceTiming.redirectStart),
		[tl]: getAbsoluteTime(resourceTiming.redirectEnd),
		[cl]: getAbsoluteTime(resourceTiming.workerStart),
		[Jo]: getAbsoluteTime(resourceTiming.fetchStart),
		[Ho]: getAbsoluteTime(resourceTiming.domainLookupStart),
		[Fo]: getAbsoluteTime(resourceTiming.domainLookupEnd),
		[Wo]: getAbsoluteTime(resourceTiming.connectStart),
		[ll]: getAbsoluteTime(resourceTiming.secureConnectionStart),
		[jo]: getAbsoluteTime(resourceTiming.connectEnd),
		[al]: getAbsoluteTime(resourceTiming.requestStart),
		[nl]: getAbsoluteTime(resourceTiming.responseStart),
		[rl]: getAbsoluteTime(resourceTiming.responseEnd),
		[pl]: resourceTiming.responseStart != null ? msToSec(resourceTiming.responseStart) : void 0
	});
}
function dropUndefinedKeysFromObject(attrs) {
	return Object.fromEntries(Object.entries(attrs).filter(([, value]) => value != null));
}
// ../DnD helper/node_modules/@sentry/browser-utils/build/esm/performance/entries.js
var MAX_INT_AS_BYTES = 2147483647;
var _performanceCursor = 0;
function startTrackingLongTasks() {
	addPerformanceInstrumentationHandler("longtask", ({ entries }) => {
		const parent = getActiveSpan();
		if (!parent) return;
		const { attributes: parentAttributes, start_timestamp: parentStartTimestamp } = spanToJSON(parent);
		for (const entry of entries) {
			const startTime = performanceTimeToSeconds(entry.startTime);
			if (!startTime) continue;
			const duration = msToSec(entry.duration);
			if (parentAttributes["sentry.op"] === "navigation" && parentStartTimestamp && startTime < parentStartTimestamp) continue;
			startAndEndSpan(parent, startTime, startTime + duration, {
				name: UI_LONG_TASK_SPAN_NAME_FALLBACK,
				op: h$3,
				attributes: { [sb]: "auto.ui.browser.metrics" }
			});
		}
	});
}
function startTrackingLongAnimationFrames() {
	new PerformanceObserver((list) => {
		const parent = getActiveSpan();
		if (!parent) return;
		for (const entry of list.getEntries()) {
			const startTime = performanceTimeToSeconds(entry.startTime);
			if (!startTime || !entry.scripts[0]) continue;
			const { start_timestamp: parentStartTimestamp, attributes: { [ab]: parentOp } } = spanToJSON(parent);
			if (parentOp === "navigation" && parentStartTimestamp && startTime < parentStartTimestamp) continue;
			const duration = msToSec(entry.duration);
			const attributes = { [sb]: "auto.ui.browser.metrics" };
			const { invoker, invokerType, sourceURL, sourceFunctionName, sourceCharPosition } = entry.scripts.reduce((longest, script) => script.duration > longest.duration ? script : longest);
			attributes[si] = invoker;
			attributes[ri] = invokerType;
			if (sourceURL) attributes[fa] = sourceURL;
			if (sourceFunctionName) attributes[ka] = sourceFunctionName;
			if (sourceCharPosition !== -1) attributes[ni] = sourceCharPosition;
			startAndEndSpan(parent, startTime, startTime + duration, {
				name: UI_LONG_TASK_SPAN_NAME_FALLBACK,
				op: q$3,
				attributes
			});
		}
	}).observe({
		type: "long-animation-frame",
		buffered: true
	});
}
function addPerformanceEntries(span, options) {
	const performance = getBrowserPerformanceAPI();
	if (!performance?.getEntries) return;
	const { spanStreamingEnabled, ignoreResourceSpans } = options;
	const performanceEntries = performance.getEntries();
	const { attributes, start_timestamp: transactionStartTime } = spanToJSON(span);
	performanceEntries.slice(_performanceCursor).forEach((entry) => {
		const startTimestamp = performanceTimeToSeconds(entry.startTime);
		if (!startTimestamp) return;
		const duration = msToSec(Math.max(0, entry.duration));
		if (attributes["sentry.op"] === "navigation" && transactionStartTime && startTimestamp < transactionStartTime) return;
		switch (entry.entryType) {
			case "navigation":
				_addNavigationSpans(span, entry, spanStreamingEnabled);
				break;
			case "paint":
				_addPaintSpan(span, entry, startTimestamp, duration);
				break;
			case "resource": _addResourceSpans(span, entry, entry.name, startTimestamp, duration, ignoreResourceSpans, spanStreamingEnabled);
		}
	});
	_performanceCursor = Math.max(performanceEntries.length - 1, 0);
	_trackNavigator(span, spanStreamingEnabled);
}
function _addPaintSpan(span, entry, startTimestamp, duration) {
	startAndEndSpan(span, startTimestamp, startTimestamp + duration, {
		name: entry.name,
		attributes: {
			[ab]: s$3,
			[sb]: "auto.resource.browser.metrics",
			[ei]: entry.name
		}
	});
}
function _addNavigationSpans(span, entry, spanStreamingEnabled) {
	_addPerformanceNavigationTiming(span, entry, "unloadEvent", spanStreamingEnabled);
	_addPerformanceNavigationTiming(span, entry, "redirect", spanStreamingEnabled);
	_addPerformanceNavigationTiming(span, entry, "domContentLoadedEvent", spanStreamingEnabled);
	_addPerformanceNavigationTiming(span, entry, "loadEvent", spanStreamingEnabled);
	_addPerformanceNavigationTiming(span, entry, "connect", spanStreamingEnabled);
	_addPerformanceNavigationTiming(span, entry, "secureConnection", spanStreamingEnabled);
	_addPerformanceNavigationTiming(span, entry, "fetch", spanStreamingEnabled);
	_addPerformanceNavigationTiming(span, entry, "domainLookup", spanStreamingEnabled);
	_addRequest(span, entry, spanStreamingEnabled);
}
function _navigationTimeToSeconds(entry, time) {
	return performanceTimeToSeconds(time, entry.startTime);
}
var NAVIGATION_TIMING_SPAN_OPS = {
	secureConnection: p$3,
	fetch: P$3,
	domainLookup: m$3,
	unloadEvent: S$2,
	redirect: d$3,
	connect: L$2,
	domContentLoadedEvent: l$3,
	loadEvent: D$3
};
function _addPerformanceNavigationTiming(span, entry, event, spanStreamingEnabled) {
	const end = entry[_getEndPropertyNameForNavigationTiming(event)];
	const start = entry[`${event}Start`];
	if (!start || !end) return;
	const op = NAVIGATION_TIMING_SPAN_OPS[event];
	const filteredUrl = filterCollectedUrl(entry.name);
	startAndEndSpan(span, _navigationTimeToSeconds(entry, start), _navigationTimeToSeconds(entry, end), {
		name: spanStreamingEnabled ? BROWSER_NAVIGATION_TIMING_SPAN_NAMES[op] : filteredUrl,
		attributes: {
			[ab]: op,
			[sb]: "auto.ui.browser.metrics",
			[Fg]: filteredUrl,
			...event === "redirect" && entry.redirectCount != null ? { "http.redirect_count": entry.redirectCount } : {}
		}
	});
}
function _getEndPropertyNameForNavigationTiming(event) {
	if (event === "secureConnection") return "connectEnd";
	if (event === "fetch") return "domainLookupStart";
	return `${event}End`;
}
function _addRequest(span, entry, spanStreamingEnabled) {
	const requestStartTimestamp = _navigationTimeToSeconds(entry, entry.requestStart);
	const responseEndTimestamp = _navigationTimeToSeconds(entry, entry.responseEnd);
	const responseStartTimestamp = _navigationTimeToSeconds(entry, entry.responseStart);
	if (entry.responseEnd) {
		const filteredUrl = filterCollectedUrl(entry.name);
		startAndEndSpan(span, requestStartTimestamp, responseEndTimestamp, {
			name: spanStreamingEnabled ? BROWSER_NAVIGATION_TIMING_SPAN_NAMES[M$1] : filteredUrl,
			attributes: {
				[ab]: M$1,
				[sb]: "auto.ui.browser.metrics",
				[Fg]: filteredUrl
			}
		});
		startAndEndSpan(span, responseStartTimestamp, responseEndTimestamp, {
			name: spanStreamingEnabled ? BROWSER_NAVIGATION_TIMING_SPAN_NAMES[b$3] : filteredUrl,
			attributes: {
				[ab]: b$3,
				[sb]: "auto.ui.browser.metrics",
				[Fg]: filteredUrl
			}
		});
	}
}
function _addResourceSpans(span, entry, resourceUrl, startTimestamp, duration, ignoredResourceSpanOps, spanStreamingEnabled) {
	if (entry.initiatorType === "xmlhttprequest" || entry.initiatorType === "fetch") return;
	const op = entry.initiatorType ? `resource.${entry.initiatorType}` : u$3;
	if (ignoredResourceSpanOps?.includes(op)) return;
	const attributes = { [sb]: "auto.resource.browser.metrics" };
	const parsedUrl = parseUrl(resourceUrl);
	if (parsedUrl.protocol) attributes[iy] = parsedUrl.protocol.split(":").pop();
	const host = parsedUrl.host?.replace(/^.*@/, "");
	if (host) attributes[Kb] = host;
	const domain = host?.replace(/:\d+$/, "");
	if (domain) attributes[Kg] = domain;
	attributes[ol] = resourceUrl.includes(WINDOW$4.location.origin);
	const filteredUrl = filterCollectedUrl(resourceUrl);
	attributes[Fg] = filteredUrl;
	_setResourceRequestAttributes(entry, attributes, [
		["responseStatus", fl],
		["transferSize", hl],
		["encodedBodySize", dl],
		["decodedBodySize", ul],
		["renderBlockingStatus", Yd],
		["deliveryType", "http.response_delivery_type"]
	]);
	const attributesWithResourceTiming = {
		...attributes,
		...resourceTimingToSpanAttributes(entry)
	};
	startAndEndSpan(span, startTimestamp, startTimestamp + duration, {
		name: spanStreamingEnabled ? domain || "Resource" : filteredUrl.replace(WINDOW$4.location.origin, ""),
		op,
		attributes: attributesWithResourceTiming
	});
}
function _trackNavigator(span, spanStreamingEnabled) {
	const navigator = WINDOW$4.navigator;
	if (!navigator) return;
	const connection = navigator.connection;
	if (connection) {
		if (connection.effectiveType) span.setAttribute(spanStreamingEnabled ? yu : Ws, connection.effectiveType);
		if (connection.type) span.setAttribute(spanStreamingEnabled ? hu : Ia, connection.type);
		if (isMeasurementValue(connection.rtt)) {
			if (spanStreamingEnabled) span.setAttribute(_u, connection.rtt);
			else if (spanToJSON(span).attributes["sentry.op"] === "pageload") setMeasurement("connection.rtt", connection.rtt, "millisecond");
		}
	}
	if (isMeasurementValue(navigator.deviceMemory)) {
		if (spanStreamingEnabled) span.setAttribute(Ts, navigator.deviceMemory);
		else span.setAttribute(is, `${navigator.deviceMemory} GB`);
	}
	if (isMeasurementValue(navigator.hardwareConcurrency)) {
		if (spanStreamingEnabled) span.setAttribute(Rs, navigator.hardwareConcurrency);
		else span.setAttribute(Co, String(navigator.hardwareConcurrency));
	}
}
function _setResourceRequestAttributes(entry, attributes, properties) {
	properties.forEach(([entryKey, attributeKey]) => {
		const entryVal = entry[entryKey];
		if (entryVal != null && (typeof entryVal === "number" && entryVal < MAX_INT_AS_BYTES || typeof entryVal === "string")) attributes[attributeKey] = entryVal;
	});
}
// ../DnD helper/node_modules/@sentry/browser-utils/build/esm/htmlTreeAsString.js
var DEFAULT_MAX_STRING_LENGTH = 80;
var accessors = {};
try {
	if (typeof Node !== "undefined") accessors.parentNode = Object.getOwnPropertyDescriptor(Node.prototype, "parentNode").get;
	if (typeof Element !== "undefined") {
		accessors.tagName = Object.getOwnPropertyDescriptor(Element.prototype, "tagName").get;
		accessors.id = Object.getOwnPropertyDescriptor(Element.prototype, "id").get;
		accessors.className = Object.getOwnPropertyDescriptor(Element.prototype, "className").get;
		accessors.getAttribute = Element.prototype.getAttribute;
	}
	if (typeof HTMLElement !== "undefined") accessors.dataset = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "dataset").get;
} catch {}
function _safeRead(el, prop, arg) {
	const fn = accessors[prop];
	if (fn) try {
		return fn.call(el, arg);
	} catch {}
	const val = el[prop];
	return typeof val === "function" ? val.call(el, arg) : val;
}
function htmlTreeAsString(elem, options = {}) {
	if (!elem) return "<unknown>";
	try {
		let currentElem = elem;
		const MAX_TRAVERSE_HEIGHT = 5;
		const out = [];
		let height = 0;
		let len = 0;
		const separator = " > ";
		const sepLength = 3;
		let nextStr;
		const keyAttrs = Array.isArray(options) ? options : options.keyAttrs;
		const maskAttributeFn = Array.isArray(options) ? void 0 : options.maskAttributeFn;
		const maxStringLength = !Array.isArray(options) && options.maxStringLength || DEFAULT_MAX_STRING_LENGTH;
		while (currentElem && height++ < MAX_TRAVERSE_HEIGHT) {
			nextStr = _htmlElementAsString(currentElem, keyAttrs, maskAttributeFn);
			if (nextStr === "html" || height > 1 && len + out.length * sepLength + nextStr.length >= maxStringLength) break;
			out.push(nextStr);
			len += nextStr.length;
			currentElem = _safeRead(currentElem, "parentNode");
		}
		return out.reverse().join(separator);
	} catch {
		return "<unknown>";
	}
}
function _htmlElementAsString(el, keyAttrs, maskAttributeFn) {
	const out = [];
	const tagName = _safeRead(el, "tagName");
	if (!tagName) return "";
	if (typeof HTMLElement !== "undefined") {
		if (el instanceof HTMLElement) {
			const dataset = _safeRead(el, "dataset");
			if (dataset) {
				if (dataset["sentryComponent"]) return maskAttributeFn ? maskAttributeFn("data-sentry-component", dataset["sentryComponent"], el) : dataset["sentryComponent"];
				if (dataset["sentryElement"]) return maskAttributeFn ? maskAttributeFn("data-sentry-element", dataset["sentryElement"], el) : dataset["sentryElement"];
			}
		}
	}
	out.push(tagName.toLowerCase());
	const keyAttrPairs = keyAttrs?.length ? keyAttrs.filter((keyAttr) => _safeRead(el, "getAttribute", keyAttr)).map((keyAttr) => [keyAttr, _safeRead(el, "getAttribute", keyAttr)]) : null;
	if (keyAttrPairs?.length) keyAttrPairs.forEach(([key, value]) => {
		out.push(`[${key}="${maskAttributeFn && value ? maskAttributeFn(key, value, el) : value}"]`);
	});
	else {
		const id = _safeRead(el, "id");
		if (id) out.push(`#${maskAttributeFn ? maskAttributeFn("id", id, el) : id}`);
		const className = _safeRead(el, "className");
		if (className && isString(className)) {
			const classes = (maskAttributeFn ? maskAttributeFn("class", className, el) : className).split(/\s+/);
			for (const c of classes) out.push(`.${c}`);
		}
	}
	for (const k of [
		"aria-label",
		"type",
		"name",
		"title",
		"alt"
	]) {
		const attr = _safeRead(el, "getAttribute", k);
		if (attr) out.push(`[${k}="${maskAttributeFn ? maskAttributeFn(k, attr, el) : attr}"]`);
	}
	return out.join("");
}
function isValidLcpMetric(lcpValue) {
	return lcpValue != null && lcpValue > 0 && lcpValue <= 6e4;
}
// ../DnD helper/node_modules/@sentry/browser-utils/build/esm/web-vitals/utils.js
function addPageListener(type, listener, options) {
	if (WINDOW$4.document) WINDOW$4.addEventListener(type, listener, options);
}
function removePageListener(type, listener, options) {
	if (WINDOW$4.document) WINDOW$4.removeEventListener(type, listener, options);
}
var getNavigationEntry = (checkResponseStart = true) => {
	const navigationEntry = WINDOW$4.performance?.getEntriesByType?.("navigation")[0];
	if (!checkResponseStart || navigationEntry && navigationEntry.responseStart > 0 && navigationEntry.responseStart < performance.now()) return navigationEntry;
};
var getActivationStart = () => {
	return getNavigationEntry()?.activationStart ?? 0;
};
var onHidden = (cb) => {
	const onHiddenCallback = (event) => {
		if (WINDOW$4.document?.visibilityState === "hidden") cb(event);
	};
	addPageListener("visibilitychange", onHiddenCallback, { capture: true });
};
var firstHiddenTime = -1;
var onHiddenFunctions = /* @__PURE__ */ new Set();
var initHiddenTime = () => {
	return WINDOW$4.document?.visibilityState === "hidden" && !WINDOW$4.document?.prerendering ? 0 : Infinity;
};
var onVisibilityUpdate = (event) => {
	if (WINDOW$4.document?.visibilityState === "hidden" && firstHiddenTime > -1) {
		if (event.type === "visibilitychange") for (const onHiddenFunction of onHiddenFunctions) onHiddenFunction();
		if (!isFinite(firstHiddenTime)) {
			firstHiddenTime = event.type === "visibilitychange" ? event.timeStamp : 0;
			removePageListener("prerenderingchange", onVisibilityUpdate, true);
		}
	}
};
var getVisibilityWatcher = () => {
	if (WINDOW$4.document && firstHiddenTime < 0) {
		const activationStart = getActivationStart();
		firstHiddenTime = (!WINDOW$4.document.prerendering ? globalThis.performance.getEntriesByType("visibility-state").filter((e) => e.name === "hidden" && e.startTime > activationStart)[0]?.startTime : void 0) ?? initHiddenTime();
		addPageListener("visibilitychange", onVisibilityUpdate, true);
		addPageListener("prerenderingchange", onVisibilityUpdate, true);
	}
	return {
		get firstHiddenTime() {
			return firstHiddenTime;
		},
		onHidden(cb) {
			onHiddenFunctions.add(cb);
		}
	};
};
var whenIdleOrHidden = (cb) => {
	const rIC = WINDOW$4.requestIdleCallback || WINDOW$4.setTimeout;
	if (WINDOW$4.document?.visibilityState === "hidden") cb();
	else {
		let called = false;
		const runOnce = () => {
			if (!called) {
				cb();
				called = true;
			}
		};
		addPageListener("visibilitychange", runOnce, {
			once: true,
			capture: true
		});
		rIC(() => {
			runOnce();
			removePageListener("visibilitychange", runOnce, { capture: true });
		});
	}
};
// ../DnD helper/node_modules/@sentry/browser-utils/build/esm/web-vitals/tracking.js
var _measurements = {};
var _lcpEntry;
var _clsEntry;
var _navigationType;
function startTrackingWebVitals({ trackCls, trackLcp }) {
	if (getBrowserPerformanceAPI() && browserPerformanceTimeOrigin()) {
		const lcpCleanupCallback = trackLcp ? _trackLCP() : void 0;
		const clsCleanupCallback = trackCls ? _trackCLS() : void 0;
		const ttfbCleanupCallback = _trackTtfb();
		const fcpCleanupCallback = _trackFcp();
		const fpCleanupCallback = _trackFp();
		return () => {
			ttfbCleanupCallback();
			fcpCleanupCallback();
			fpCleanupCallback();
			lcpCleanupCallback?.();
			clsCleanupCallback?.();
		};
	}
	return () => void 0;
}
function _trackCLS() {
	return addClsInstrumentationHandler(({ metric }) => {
		const entry = metric.entries[metric.entries.length - 1];
		if (!entry) return;
		_measurements["cls"] = {
			value: metric.value,
			unit: ""
		};
		_clsEntry = entry;
	}, true);
}
function _trackLCP() {
	return addLcpInstrumentationHandler(({ metric }) => {
		const entry = metric.entries[metric.entries.length - 1];
		if (!entry || !isValidLcpMetric(metric.value)) return;
		_measurements["lcp"] = {
			value: metric.value,
			unit: "millisecond"
		};
		_lcpEntry = entry;
	}, true);
}
function _trackTtfb() {
	return addTtfbInstrumentationHandler(({ metric }) => {
		_navigationType = metric.navigationType;
		if (!metric.entries[metric.entries.length - 1]) return;
		_measurements["ttfb"] = {
			value: metric.value,
			unit: "millisecond"
		};
	});
}
function _trackFcp() {
	return addFcpInstrumentationHandler(({ metric }) => {
		_navigationType = metric.navigationType;
		_measurements["fcp"] = {
			value: metric.value,
			unit: "millisecond"
		};
	});
}
function _trackFp() {
	return addPerformanceInstrumentationHandler("paint", ({ entries }) => {
		const firstHidden = getVisibilityWatcher();
		for (const entry of entries) if (entry.name === "first-paint" && entry.startTime < firstHidden.firstHiddenTime) _measurements["fp"] = {
			value: entry.startTime,
			unit: "millisecond"
		};
	});
}
function addWebVitalsToSpan(span, options) {
	const origin = browserPerformanceTimeOrigin();
	if (!getBrowserPerformanceAPI()?.getEntries || !origin) {
		resetWebVitalState();
		return;
	}
	const { spanStreamingEnabled, recordClsOnPageloadSpan, recordLcpOnPageloadSpan } = options;
	const timeOrigin = msToSec(origin);
	if (spanToJSON(span).attributes["sentry.op"] === "pageload") {
		_addTtfbRequestTimeToMeasurements(_measurements);
		_rebaseFpAgainstActivationStart(_measurements);
		if (spanStreamingEnabled) {
			const setAttr = (shortWebVitalName, value, customAttrName) => {
				const attrKey = customAttrName ?? `browser.web_vital.${shortWebVitalName}.value`;
				span.setAttribute(attrKey, value);
				DEBUG_BUILD$3 && debug$2.log("Setting web vital attribute", { [attrKey]: value }, "on pageload span");
			};
			[
				"ttfb",
				"fp",
				"fcp"
			].forEach((measurementName) => {
				if (_measurements[measurementName]) setAttr(measurementName, _measurements[measurementName].value);
			});
			if (_measurements["ttfb.requestTime"]) setAttr("ttfb.requestTime", _measurements["ttfb.requestTime"].value, Ni);
		} else {
			if (!recordClsOnPageloadSpan) delete _measurements.cls;
			if (!recordLcpOnPageloadSpan) delete _measurements.lcp;
			Object.entries(_measurements).forEach(([measurementName, measurement]) => {
				setMeasurement(measurementName, measurement.value, measurement.unit, span);
			});
			_setWebVitalAttributes(span, options);
		}
		if (_navigationType) span.setAttribute($t, _navigationType);
		span.setAttribute(spanStreamingEnabled ? ii : nd, timeOrigin);
		span.setAttribute(spanStreamingEnabled ? ti : rd, getActivationStart());
	}
	resetWebVitalState();
}
function resetWebVitalState() {
	_lcpEntry = void 0;
	_clsEntry = void 0;
	_navigationType = void 0;
	_measurements = {};
}
function _setWebVitalAttributes(span, options) {
	if (_lcpEntry && options.recordLcpOnPageloadSpan) {
		if (_lcpEntry.element) span.setAttribute(Ql, htmlTreeAsString(_lcpEntry.element));
		if (_lcpEntry.id) span.setAttribute(Jl, _lcpEntry.id);
		if (_lcpEntry.url) span.setAttribute(ep, filterCollectedUrl(_lcpEntry.url.trim()).slice(0, 200));
		if (_lcpEntry.loadTime != null) span.setAttribute(Xl, _lcpEntry.loadTime);
		if (_lcpEntry.renderTime != null) span.setAttribute(Zl, _lcpEntry.renderTime);
		span.setAttribute($l, _lcpEntry.size);
	}
	if (_clsEntry?.sources && options.recordClsOnPageloadSpan) _clsEntry.sources.forEach((source, index) => span.setAttribute(`cls.source.${index + 1}`, htmlTreeAsString(source.node)));
}
function _rebaseFpAgainstActivationStart(measurements) {
	const fp = measurements["fp"];
	if (fp) fp.value = Math.max(fp.value - getActivationStart(), 0);
}
function _addTtfbRequestTimeToMeasurements(_measurements2) {
	const navEntry = getNavigationEntry(false);
	if (!navEntry) return;
	const { responseStart, requestStart } = navEntry;
	if (requestStart <= responseStart) _measurements2["ttfb.requestTime"] = {
		value: responseStart - requestStart,
		unit: "millisecond"
	};
}
// ../DnD helper/node_modules/@sentry/browser-utils/build/esm/performance/elementTiming.js
var INTEGRATION_NAME$17 = "ElementTiming";
var _elementTimingIntegration = (() => {
	return {
		name: INTEGRATION_NAME$17,
		setup() {
			if (!getBrowserPerformanceAPI() || !browserPerformanceTimeOrigin()) return;
			addPerformanceInstrumentationHandler("element", ({ entries }) => {
				for (const entry of entries) {
					const elementEntry = entry;
					if (!elementEntry.identifier) continue;
					const identifier = elementEntry.identifier;
					const paintType = elementEntry.name;
					const renderTime = elementEntry.renderTime;
					const loadTime = elementEntry.loadTime;
					const metricAttributes = {
						[sb]: "auto.ui.browser.element_timing",
						[Mg]: identifier
					};
					if (paintType) metricAttributes[Gg] = paintType;
					if (elementEntry.id) metricAttributes[Lg] = elementEntry.id;
					if (elementEntry.element) metricAttributes[zg] = elementEntry.element.tagName.toLowerCase();
					if (elementEntry.url) metricAttributes[Yg] = filterCollectedUrl(elementEntry.url);
					if (elementEntry.naturalWidth) metricAttributes[jg] = elementEntry.naturalWidth;
					if (elementEntry.naturalHeight) metricAttributes[Dg] = elementEntry.naturalHeight;
					if (renderTime > 0) distribution(`ui.element.render_time`, renderTime, {
						unit: "millisecond",
						attributes: metricAttributes
					});
					if (loadTime > 0) distribution(`ui.element.load_time`, loadTime, {
						unit: "millisecond",
						attributes: metricAttributes
					});
				}
			});
		}
	};
});
var elementTimingIntegration = defineIntegration(_elementTimingIntegration);
// ../DnD helper/node_modules/@sentry/browser-utils/build/esm/web-vitals/inp.js
var LAST_INTERACTIONS = [];
var INTERACTIONS_SPAN_MAP = /* @__PURE__ */ new Map();
var ELEMENT_NAME_TIMESTAMP_MAP = /* @__PURE__ */ new Map();
var INP_ENTRY_MAP = {
	click: "click",
	pointerdown: "click",
	pointerup: "click",
	mousedown: "click",
	mouseup: "click",
	touchstart: "click",
	touchend: "click",
	mouseover: "hover",
	mouseout: "hover",
	mouseenter: "hover",
	mouseleave: "hover",
	pointerover: "hover",
	pointerout: "hover",
	pointerenter: "hover",
	pointerleave: "hover",
	dragstart: "drag",
	dragend: "drag",
	drag: "drag",
	dragenter: "drag",
	dragleave: "drag",
	dragover: "drag",
	drop: "drag",
	keydown: "press",
	keyup: "press",
	keypress: "press",
	input: "press"
};
function getCachedInteractionContext(interactionId) {
	return interactionId != null ? INTERACTIONS_SPAN_MAP.get(interactionId) : void 0;
}
function registerInpInteractionListener() {
	const interactionEvents = Object.keys(INP_ENTRY_MAP);
	if (isBrowser()) interactionEvents.forEach((eventType) => {
		WINDOW$4.addEventListener(eventType, captureElementFromEvent, {
			capture: true,
			passive: true
		});
	});
	function captureElementFromEvent(event) {
		const target = event.target;
		if (!target) return;
		const elementName = htmlTreeAsString(target);
		const timestamp = Math.round(event.timeStamp);
		if (!elementName || elementName === "<unknown>") return;
		if (ELEMENT_NAME_TIMESTAMP_MAP.has(timestamp)) return;
		ELEMENT_NAME_TIMESTAMP_MAP.set(timestamp, elementName);
		if (ELEMENT_NAME_TIMESTAMP_MAP.size > 50) {
			const firstKey = ELEMENT_NAME_TIMESTAMP_MAP.keys().next().value;
			if (firstKey !== void 0) ELEMENT_NAME_TIMESTAMP_MAP.delete(firstKey);
		}
	}
	function resolveElementNameFromEntry(entry) {
		const timestamp = Math.round(entry.startTime);
		let elementName = ELEMENT_NAME_TIMESTAMP_MAP.get(timestamp);
		if (!elementName) for (let offset = -5; offset <= 5; offset++) {
			const nearbyName = ELEMENT_NAME_TIMESTAMP_MAP.get(timestamp + offset);
			if (nearbyName) {
				elementName = nearbyName;
				break;
			}
		}
		return elementName || "<unknown>";
	}
	const handleEntries = ({ entries }) => {
		const activeSpan = getActiveSpan();
		const activeRootSpan = activeSpan && getRootSpan(activeSpan);
		entries.forEach((entry) => {
			if (!isPerformanceEventTiming(entry)) return;
			const interactionId = entry.interactionId;
			if (interactionId == null) return;
			if (INTERACTIONS_SPAN_MAP.has(interactionId)) return;
			const elementName = entry.target ? htmlTreeAsString(entry.target) : resolveElementNameFromEntry(entry);
			if (LAST_INTERACTIONS.length > 10) {
				const last = LAST_INTERACTIONS.shift();
				INTERACTIONS_SPAN_MAP.delete(last);
			}
			LAST_INTERACTIONS.push(interactionId);
			INTERACTIONS_SPAN_MAP.set(interactionId, {
				span: activeRootSpan,
				elementName
			});
		});
	};
	addPerformanceInstrumentationHandler("event", handleEntries);
	addPerformanceInstrumentationHandler("first-input", handleEntries);
}
// ../DnD helper/node_modules/@sentry/browser-utils/build/esm/isBotUserAgent.js
var BOT_USER_AGENT_RE = /Googlebot|Google-InspectionTool|Storebot-Google|Bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|Facebot|facebookexternalhit|LinkedInBot|Twitterbot|Applebot/i;
function isBotUserAgent() {
	const nav = WINDOW$4.navigator;
	if (!nav?.userAgent) return false;
	return BOT_USER_AGENT_RE.test(nav.userAgent);
}
// ../DnD helper/node_modules/@sentry/browser-utils/build/esm/component-name.js
function getComponentName(elem, maxTraverseHeight = 5) {
	if (!GLOBAL_OBJ.HTMLElement) return null;
	let currentElem = elem;
	for (let i = 0; i < maxTraverseHeight; i++) {
		if (!currentElem) return null;
		if (currentElem instanceof HTMLElement) {
			if (currentElem.dataset["sentryComponent"]) return currentElem.dataset["sentryComponent"];
			if (currentElem.dataset["sentryElement"]) return currentElem.dataset["sentryElement"];
		}
		currentElem = currentElem.parentNode;
	}
	return null;
}
// ../DnD helper/node_modules/@sentry/browser-utils/build/esm/performance/interactions.js
var INTEGRATION_NAME$16 = "Interactions";
var _interactionsIntegration = ((options = {}) => {
	return {
		name: INTEGRATION_NAME$16,
		setup(client) {
			if (isBotUserAgent()) return;
			const latestRoute = {
				name: void 0,
				source: void 0,
				routeId: void 0,
				urlTemplate: void 0,
				httpRoute: void 0,
				urlPath: void 0,
				urlFull: void 0
			};
			let inflightRouteSpan;
			function trackRoute(span) {
				const { name, attributes } = spanToJSON(span);
				latestRoute.name = name;
				latestRoute.source = attributes["sentry.source"] || attributes["sentry.segment.name.source"];
				latestRoute.routeId = attributes[Kd];
				latestRoute.urlTemplate = attributes[ay];
				latestRoute.httpRoute = attributes[Sl];
				latestRoute.urlPath = attributes[Hg];
				latestRoute.urlFull = attributes[Fg];
			}
			client.on("spanStart", (span) => {
				if (isRouteSpan(span)) {
					inflightRouteSpan = span;
					trackRoute(span);
				}
			});
			client.on("spanEnd", (span) => {
				if (span !== inflightRouteSpan) return;
				inflightRouteSpan = void 0;
				trackRoute(span);
			});
			registerInteractionListener(client, latestRoute, () => inflightRouteSpan, options);
			trackInteractionsAsSpans(client);
		}
	};
});
var interactionsIntegration = defineIntegration(_interactionsIntegration);
function isRouteSpan(span) {
	if (getRootSpan(span) !== span) return false;
	const op = spanToJSON(span).attributes[ab];
	return op === "pageload" || op === "navigation";
}
function registerInteractionListener(client, latestRoute, getInflightRouteSpan, idleSpanOptions) {
	if (!WINDOW$4.document) return;
	let inflightInteractionSpan;
	addEventListener("click", () => {
		if (getInflightRouteSpan()) {
			DEBUG_BUILD$3 && debug$2.warn(`[Tracing] Did not create ui.action.click span because a pageload or navigation span is in progress.`);
			return;
		}
		if (inflightInteractionSpan) {
			inflightInteractionSpan.setAttribute(Gm, "interactionInterrupted");
			inflightInteractionSpan.end();
			inflightInteractionSpan = void 0;
		}
		if (!latestRoute.name) {
			DEBUG_BUILD$3 && debug$2.warn(`[Tracing] Did not create ui.action.click span because the latest route name is missing.`);
			return;
		}
		const hasSpanStreaming = hasSpanStreamingEnabled(client);
		const routeName = latestRoute.routeId || latestRoute.urlTemplate || latestRoute.httpRoute;
		const streamedName = routeName || "Click";
		const streamedNameSource = !routeName || latestRoute.routeId ? "custom" : "route";
		inflightInteractionSpan = startIdleSpan({
			name: hasSpanStreaming ? streamedName : latestRoute.name,
			attributes: {
				[ab]: F$2,
				[kb$1]: hasSpanStreaming ? streamedNameSource : latestRoute.source || "url",
				[sb]: "auto.browser.interactions",
				...hasSpanStreaming && { ["sentry.segment.name"]: streamedName },
				[Kd]: latestRoute.routeId,
				[ay]: latestRoute.urlTemplate,
				[Sl]: latestRoute.httpRoute,
				[Hg]: latestRoute.urlPath,
				...latestRoute.urlFull && { ["url.full"]: filterCollectedUrl(latestRoute.urlFull) }
			}
		}, idleSpanOptions);
	}, { capture: true });
}
function trackInteractionsAsSpans(client) {
	addPerformanceInstrumentationHandler("event", ({ entries }) => {
		const parent = getActiveSpan();
		if (!parent) return;
		for (const entry of entries) if (entry.name === "click") {
			const startTime = performanceTimeToSeconds(entry.startTime);
			if (!startTime) continue;
			const duration = msToSec(entry.duration);
			const selector = htmlTreeAsString(entry.target);
			const componentName = getComponentName(entry.target);
			const spanOptions = {
				name: hasSpanStreamingEnabled(client) ? componentName || "Click" : selector,
				startTime,
				attributes: {
					[ab]: H$2,
					[sb]: "auto.browser.interactions",
					...selector && selector !== "<unknown>" && { ["browser.web_vital.inp.target"]: selector }
				}
			};
			if (componentName) spanOptions.attributes[Cg] = componentName;
			startAndEndSpan(parent, startTime, startTime + duration, spanOptions);
		}
	});
}
// ../DnD helper/node_modules/@sentry/browser-utils/build/esm/getLocationHref.js
function getLocationHref() {
	try {
		return WINDOW$4.document?.location.href ?? "";
	} catch {
		return "";
	}
}
// ../DnD helper/node_modules/@sentry/browser-utils/build/esm/routing.js
var CLIENT_ROUTE_PROVIDERS = /* @__PURE__ */ new WeakMap();
function setRouteProvider(provider, client = getClient()) {
	if (!client) {
		DEBUG_BUILD$3 && debug$2.warn("Cannot set a route provider without a client.");
		return;
	}
	if (DEBUG_BUILD$3 && getRouteProvider(client)) debug$2.warn("A route provider is already registered for this client and will be replaced. Routes only the previous provider knows about will no longer resolve.");
	CLIENT_ROUTE_PROVIDERS.set(client, provider);
}
function getRouteProvider(client = getClient()) {
	return client && CLIENT_ROUTE_PROVIDERS.get(client);
}
function resolveRoute(url, client = getClient()) {
	const provider = getRouteProvider(client);
	if (!provider) return;
	const urlObject = typeof url === "string" ? parseLocation(url) : url;
	if (!urlObject) return;
	return safeCallback(DEBUG_BUILD$3 ? "Route provider threw while resolving a route:" : "", () => provider.resolveRoute(urlObject) || void 0, () => void 0);
}
function resolveCurrentRoute(client = getClient()) {
	const provider = getRouteProvider(client);
	return safeCallback(DEBUG_BUILD$3 ? "Route provider threw while resolving a route:" : "", () => provider?.resolveCurrentRoute() || void 0, () => void 0);
}
function createUrlRouteProvider(resolveRouteFromUrl) {
	return {
		resolveRoute: resolveRouteFromUrl,
		resolveCurrentRoute: () => {
			const urlObject = parseLocation(getLocationHref());
			return urlObject && resolveRouteFromUrl(urlObject);
		}
	};
}
function createCachedRouteProvider(maxEntries = 50) {
	const routeNames = new LRUMap(maxEntries);
	return {
		...createUrlRouteProvider((url) => routeNames.get(url.pathname)),
		record(pathname, routeName) {
			if (pathname && routeName) routeNames.set(pathname, routeName);
		}
	};
}
function parseLocation(url) {
	return url ? parseStringToURLObject(url, getLocationHref() || void 0) : void 0;
}
// ../DnD helper/node_modules/@sentry/browser-utils/build/esm/performance/userTiming.js
var INTEGRATION_NAME$15 = "UserTiming";
var _userTimingIntegration = ((options = {}) => {
	return {
		name: INTEGRATION_NAME$15,
		setup(client) {
			const performance = getBrowserPerformanceAPI();
			if (!performance?.getEntries) return;
			let performanceCursor = 0;
			client.on("beforeIdleSpanEnd", (idleSpan) => {
				const { attributes, start_timestamp: parentStartTimestamp } = spanToJSON(idleSpan);
				const parentOp = attributes[ab];
				if (parentOp !== "pageload" && parentOp !== "navigation") return;
				const requestStart = getNavigationEntry(false)?.requestStart ?? 0;
				const performanceEntries = performance.getEntries();
				for (const entry of performanceEntries.slice(performanceCursor)) {
					if (entry.entryType !== "mark" && entry.entryType !== "measure") continue;
					const startTimestamp = performanceTimeToSeconds(entry.startTime);
					if (!startTimestamp) continue;
					if (parentOp === "navigation" && parentStartTimestamp && startTimestamp < parentStartTimestamp) continue;
					_addUserTimingSpan(idleSpan, entry, startTimestamp, performanceTimeToSeconds(entry.startTime + Math.max(0, entry.duration), entry.startTime), performanceTimeToSeconds(requestStart, entry.startTime), options.ignore ?? []);
				}
				performanceCursor = performanceEntries.length;
			});
		}
	};
});
var userTimingIntegration = defineIntegration(_userTimingIntegration);
function _addUserTimingSpan(parentSpan, entry, startTimestamp, endTimestamp, requestTimestamp, ignore) {
	if (isReact19MeasureEntry(entry) || stringMatchesSomePattern(entry.name, ignore)) return;
	const spanStartTimestamp = Math.max(startTimestamp, requestTimestamp);
	const attributes = { [sb]: `auto.browser.user_timing.${entry.entryType}` };
	if (spanStartTimestamp !== startTimestamp) {
		attributes["sentry.browser.measure_happened_before_request"] = true;
		attributes["sentry.browser.measure_start_time"] = spanStartTimestamp;
	}
	addDetailToSpanAttributes(attributes, entry);
	if (spanStartTimestamp <= endTimestamp) startAndEndSpan(parentSpan, spanStartTimestamp, endTimestamp, {
		name: entry.name,
		op: entry.entryType,
		attributes
	});
}
function isReact19MeasureEntry(entry) {
	if (entry.entryType !== "measure") return;
	try {
		return entry.detail.devtools.track === "Components ⚛";
	} catch {
		return;
	}
}
function addDetailToSpanAttributes(attributes, entry) {
	try {
		const detail = entry.detail;
		if (!detail) return;
		if (typeof detail === "object") {
			for (const [key, value] of Object.entries(detail)) if (value && isPrimitive(value)) attributes[`sentry.browser.measure.detail.${key}`] = value;
			else if (value !== void 0) try {
				attributes[`sentry.browser.measure.detail.${key}`] = JSON.stringify(value);
			} catch {}
			return;
		}
		if (isPrimitive(detail)) {
			attributes["sentry.browser.measure.detail"] = detail;
			return;
		}
		try {
			attributes["sentry.browser.measure.detail"] = JSON.stringify(detail);
		} catch {}
	} catch {}
}
// ../DnD helper/node_modules/@sentry/browser-utils/build/esm/web-vitals/emitSpan.js
function _emitWebVitalSpan(options) {
	const { name, op, origin, metricName, value, attributes: passedAttributes, parentSpan, startTime, endTime, standalone, softNavigationId, navigationType } = options;
	const segmentSpan = parentSpan && getRootSpan(parentSpan);
	const segmentName = segmentSpan ? spanToJSON(segmentSpan).name : getCurrentScope().getScopeData().transactionName;
	const attributes = {
		[sb]: origin,
		[ab]: op,
		[Cm]: 0,
		[`browser.web_vital.${metricName}.value`]: value,
		[Lb]: segmentName,
		[vb]: segmentName,
		[sy]: WINDOW$4.navigator?.userAgent,
		...passedAttributes
	};
	if (parentSpan && spanToJSON(parentSpan).attributes["sentry.op"] === "pageload") attributes[rb] = parentSpan.spanContext().spanId;
	if (softNavigationId != null) attributes[Zt] = softNavigationId;
	if (navigationType) attributes[$t] = navigationType;
	if (standalone) Object.assign(attributes, getReplayAttributes());
	const span = startInactiveSpan({
		name,
		attributes,
		startTime,
		parentSpan,
		experimental: standalone ? { standalone: true } : void 0
	});
	if (span) span.end(endTime ?? startTime);
}
function getReplayAttributes() {
	const replay = getClient()?.getIntegrationByName("Replay");
	const replayId = replay?.getReplayId(true);
	if (!replayId) return {};
	return {
		[db$1]: replayId,
		"sentry._internal.replay_is_buffering": replay.getRecordingMode() === "buffer" ? true : void 0
	};
}
// ../DnD helper/node_modules/@sentry/browser-utils/build/esm/web-vitals/reportEvents.js
function listenForWebVitalReportEvents(client, collectorCallback) {
	let pageloadSpan;
	let collected = false;
	function _runCollectorCallbackOnce() {
		if (!collected && pageloadSpan) collectorCallback(pageloadSpan);
		collected = true;
	}
	onHidden(() => {
		_runCollectorCallbackOnce();
	});
	const unsubscribeStartNavigation = client.on("beforeStartNavigationSpan", (_, options) => {
		if (!options?.isRedirect) {
			_runCollectorCallbackOnce();
			unsubscribeStartNavigation();
			unsubscribeAfterStartPageLoadSpan();
		}
	});
	const unsubscribeAfterStartPageLoadSpan = client.on("afterStartPageLoadSpan", (span) => {
		pageloadSpan = span;
		unsubscribeAfterStartPageLoadSpan();
	});
}
// ../DnD helper/node_modules/@sentry/browser-utils/build/esm/web-vitals/spans.js
var INTERACTION_TYPE_TO_SPAN_OP = {
	click: H$2,
	hover: Q$1,
	drag: k$3,
	press: K$1
};
var INTERACTION_TYPE_TO_SPAN_NAME_FALLBACK = {
	click: UI_INTERACTION_CLICK_SPAN_NAME_FALLBACK,
	hover: UI_INTERACTION_HOVER_SPAN_NAME_FALLBACK,
	drag: UI_INTERACTION_DRAG_SPAN_NAME_FALLBACK,
	press: UI_INTERACTION_PRESS_SPAN_NAME_FALLBACK
};
function trackWebVitalPerNavigation(client, addInstrumentationHandler, send) {
	let pageloadSpan;
	client.on("afterStartPageLoadSpan", (span) => {
		pageloadSpan = span;
	});
	let bfcacheNavigationSpan;
	client.on("spanStart", (span) => {
		const attributes = spanToJSON(span).attributes;
		if (attributes?.["sentry.op"] === "navigation" && attributes["browser.navigation.type"] === "back-forward-cache") bfcacheNavigationSpan = span;
	});
	addInstrumentationHandler(({ metric }) => {
		const navigationSpan = getNavigationSpanForMetric(metric);
		if (metric.navigationType === "soft-navigation") {
			if (navigationSpan) send(metric, navigationSpan, metric.navigationId);
			else DEBUG_BUILD$3 && debug$2.log(`[SoftNav] Dropping ${metric.name} for uncorrelated soft navigation ${metric.navigationId}`);
			return;
		}
		if (metric.navigationType === "back-forward-cache") {
			send(metric, bfcacheNavigationSpan, void 0);
			return;
		}
		send(metric, pageloadSpan, void 0);
	});
}
function trackLcpAsSpan(client, perNavigation = false) {
	if (!supportsWebVital("largest-contentful-paint")) return;
	if (perNavigation) {
		trackWebVitalPerNavigation(client, addLcpInstrumentationHandler, (metric, parentSpan, softNavigationId) => {
			const entry = metric.entries[metric.entries.length - 1];
			_sendLcpSpan(metric.value, entry, parentSpan, softNavigationId, metric.navigationType, metric.navigationStartTime);
		});
		return;
	}
	let lcpValue = 0;
	let lcpEntry;
	let lcpNavigationType;
	const cleanupLcpHandler = addLcpInstrumentationHandler(({ metric }) => {
		lcpNavigationType = metric.navigationType;
		const entry = metric.entries[metric.entries.length - 1];
		if (!entry || !isValidLcpMetric(metric.value)) return;
		lcpValue = metric.value;
		lcpEntry = entry;
	}, true);
	listenForWebVitalReportEvents(client, (pageloadSpan) => {
		_sendLcpSpan(lcpValue, lcpEntry, pageloadSpan, void 0, lcpNavigationType);
		cleanupLcpHandler();
	});
}
function _sendLcpSpan(lcpValue, entry, pageloadSpan, softNavigationId, navigationType, navigationStartTime) {
	if (!isValidLcpMetric(lcpValue)) return;
	DEBUG_BUILD$3 && debug$2.log(`Sending LCP span (${lcpValue})`);
	const navigationStart = navigationStartTime || 0;
	const startTime = performanceTimeToSeconds(navigationStart) ?? msToSec(navigationStart);
	const endTime = entry ? performanceTimeToSeconds(entry.startTime, navigationStart) ?? msToSec(entry.startTime) : startTime + msToSec(lcpValue);
	const selector = entry ? htmlTreeAsString(entry.element) : void 0;
	const componentName = entry?.element ? getComponentName(entry.element) : null;
	const client = getClient();
	const name = !!client && hasSpanStreamingEnabled(client) ? componentName || "Largest contentful paint" : selector ?? "Largest contentful paint";
	const attributes = {};
	if (selector) attributes[vi] = selector;
	if (componentName) attributes[Cg] = componentName;
	entry?.id && (attributes["browser.web_vital.lcp.id"] = entry.id);
	entry?.url && (attributes["browser.web_vital.lcp.url"] = filterCollectedUrl(entry.url, client));
	entry?.loadTime != null && (attributes["browser.web_vital.lcp.load_time"] = entry.loadTime);
	entry?.renderTime != null && (attributes["browser.web_vital.lcp.render_time"] = entry.renderTime);
	entry?.size != null && (attributes["browser.web_vital.lcp.size"] = entry.size);
	_emitWebVitalSpan({
		name,
		op: j$2,
		origin: "auto.ui.browser.lcp",
		metricName: "lcp",
		value: lcpValue,
		attributes,
		parentSpan: pageloadSpan,
		startTime,
		endTime,
		softNavigationId,
		navigationType
	});
}
function trackClsAsSpan(client, perNavigation = false) {
	if (!supportsWebVital("layout-shift")) return;
	if (perNavigation) {
		trackWebVitalPerNavigation(client, addClsInstrumentationHandler, (metric, parentSpan, softNavigationId) => {
			const entry = metric.entries[metric.entries.length - 1];
			_sendClsSpan(metric.value, entry, parentSpan, softNavigationId, metric.navigationType, metric.navigationStartTime);
		});
		return;
	}
	let clsValue = 0;
	let clsEntry;
	let clsNavigationType;
	const cleanupClsHandler = addClsInstrumentationHandler(({ metric }) => {
		clsNavigationType = metric.navigationType;
		const entry = metric.entries[metric.entries.length - 1];
		if (!entry) return;
		clsValue = metric.value;
		clsEntry = entry;
	}, true);
	listenForWebVitalReportEvents(client, (pageloadSpan) => {
		_sendClsSpan(clsValue, clsEntry, pageloadSpan, void 0, clsNavigationType);
		cleanupClsHandler();
	});
}
function _sendClsSpan(clsValue, entry, pageloadSpan, softNavigationId, navigationType, navigationStartTime) {
	DEBUG_BUILD$3 && debug$2.log(`Sending CLS span (${clsValue})`);
	const startTime = performanceTimeToSeconds(entry?.startTime ?? navigationStartTime ?? 0) ?? timestampInSeconds();
	const firstSourceNode = entry?.sources[0]?.node;
	const selector = entry ? htmlTreeAsString(firstSourceNode) : void 0;
	const componentName = firstSourceNode ? getComponentName(firstSourceNode) : null;
	const client = getClient();
	const name = !!client && hasSpanStreamingEnabled(client) ? componentName || "Layout shift" : selector ?? "Layout shift";
	const attributes = {};
	if (componentName) attributes[Cg] = componentName;
	if (entry?.sources) entry.sources.forEach((source, index) => {
		attributes[`browser.web_vital.cls.source.${index + 1}`] = htmlTreeAsString(source.node);
	});
	_emitWebVitalSpan({
		name,
		op: J$1,
		origin: "auto.ui.browser.cls",
		metricName: "cls",
		value: clsValue,
		attributes,
		parentSpan: pageloadSpan,
		startTime,
		softNavigationId,
		navigationType
	});
}
function trackInpAsSpan(client, perNavigation = false) {
	if (!getBrowserPerformanceAPI() || !browserPerformanceTimeOrigin()) return;
	const standalone = !hasSpanStreamingEnabled(client);
	if (perNavigation) {
		trackWebVitalPerNavigation(client, addInpInstrumentationHandler, (metric, parentSpan, softNavigationId) => {
			if (isPlausibleInp(metric)) _sendInpSpan(metric.value, findInpEntry(metric), standalone, parentSpan, softNavigationId, metric);
		});
		return;
	}
	const onInp = ({ metric }) => {
		if (isPlausibleInp(metric)) _sendInpSpan(metric.value, findInpEntry(metric), standalone, void 0, void 0, metric);
	};
	addInpInstrumentationHandler(onInp);
}
function isPlausibleInp(metric) {
	return metric.value != null && msToSec(metric.value) <= 60;
}
function findInpEntry(metric) {
	return metric.entries.find((e) => e.duration === metric.value && INP_ENTRY_MAP[e.name]);
}
function _sendInpSpan(inpValue, entry, standalone = false, attributedSpan, softNavigationId, metric) {
	DEBUG_BUILD$3 && debug$2.log(`Sending INP span (${inpValue})`);
	const startTime = performanceTimeToSeconds(entry?.startTime ?? metric?.navigationStartTime ?? 0);
	if (!startTime) return;
	const duration = msToSec(inpValue);
	const entryInteractionType = entry && INP_ENTRY_MAP[entry.name];
	const interactionType = entryInteractionType || "click";
	const cachedContext = entry && getCachedInteractionContext(entry.interactionId);
	const activeSpan = getActiveSpan();
	const rootSpan = activeSpan ? getRootSpan(activeSpan) : void 0;
	const spanToUse = attributedSpan || cachedContext?.span || rootSpan;
	const selector = cachedContext?.elementName || (entry ? htmlTreeAsString(entry.target) : void 0);
	const componentName = entry?.target ? getComponentName(entry.target) : null;
	const client = getClient();
	const hasSpanStreaming = !!client && hasSpanStreamingEnabled(client);
	const fallbackName = INTERACTION_TYPE_TO_SPAN_NAME_FALLBACK[interactionType];
	const name = hasSpanStreaming ? componentName || fallbackName : selector ?? "Interaction to next paint";
	const attributes = { [Cm]: entry?.duration ?? inpValue };
	selector && selector !== "<unknown>" && (attributes["browser.web_vital.inp.target"] = selector);
	entryInteractionType && (attributes["browser.web_vital.inp.interaction_type"] = entryInteractionType);
	if (componentName) attributes[Cg] = componentName;
	_emitWebVitalSpan({
		name,
		op: INTERACTION_TYPE_TO_SPAN_OP[interactionType],
		origin: "auto.ui.browser.inp",
		metricName: "inp",
		value: inpValue,
		attributes,
		startTime,
		endTime: startTime + duration,
		navigationType: metric?.navigationType,
		parentSpan: spanToUse,
		standalone,
		softNavigationId
	});
}
// ../DnD helper/node_modules/@sentry/browser-utils/build/esm/instrumentation/dom.js
var DEBOUNCE_DURATION = 1e3;
var debounceTimerID;
var lastCapturedEventType;
var lastCapturedEventTargetId;
function getCapture(options) {
	return typeof options === "boolean" ? options : !!options?.capture;
}
function addClickKeypressInstrumentationHandler(handler) {
	const type = "dom";
	addHandler$1(type, handler);
	maybeInstrument(type, instrumentDOM);
}
function instrumentDOM() {
	if (!WINDOW$4.document) return;
	const triggerDOMHandler = triggerHandlers$1.bind(null, "dom");
	const globalDOMEventHandler = makeDOMEventHandler(triggerDOMHandler, true);
	WINDOW$4.document.addEventListener("click", globalDOMEventHandler, false);
	WINDOW$4.document.addEventListener("keypress", globalDOMEventHandler, false);
	["EventTarget", "Node"].forEach((target) => {
		const proto = WINDOW$4[target]?.prototype;
		if (!proto?.hasOwnProperty?.("addEventListener")) return;
		fill(proto, "addEventListener", function(originalAddEventListener) {
			return function(type, listener, options) {
				if ((type === "click" || type == "keypress") && listener) try {
					const handlers = this.__sentry_instrumentation_handlers__ = this.__sentry_instrumentation_handlers__ || {};
					const handlerForType = handlers[type] = handlers[type] || {
						captureListeners: /* @__PURE__ */ new WeakSet(),
						bubbleListeners: /* @__PURE__ */ new WeakSet(),
						listenerCount: 0
					};
					const capture = getCapture(options);
					if (!handlerForType.handler) {
						const handler = makeDOMEventHandler(triggerDOMHandler);
						handlerForType.handler = handler;
						handlerForType.capture = capture;
						originalAddEventListener.call(this, type, handler, handlerForType.capture);
					}
					const listeners = handlerForType[capture ? "captureListeners" : "bubbleListeners"];
					if (!listeners.has(listener)) {
						if (typeof options === "object" && (options?.once || options?.signal)) handlerForType.sticky = true;
						else {
							listeners.add(listener);
							handlerForType.listenerCount++;
						}
					}
				} catch {}
				return originalAddEventListener.call(this, type, listener, options);
			};
		});
		fill(proto, "removeEventListener", function(originalRemoveEventListener) {
			return function(type, listener, options) {
				if ((type === "click" || type == "keypress") && listener) try {
					const handlers = this.__sentry_instrumentation_handlers__ || {};
					const handlerForType = handlers[type];
					if (handlerForType?.[getCapture(options) ? "captureListeners" : "bubbleListeners"].delete(listener)) {
						if (!--handlerForType.listenerCount && !handlerForType.sticky) {
							originalRemoveEventListener.call(this, type, handlerForType.handler, handlerForType.capture);
							handlerForType.handler = void 0;
							delete handlers[type];
						}
						if (Object.keys(handlers).length === 0) delete this.__sentry_instrumentation_handlers__;
					}
				} catch {}
				return originalRemoveEventListener.call(this, type, listener, options);
			};
		});
	});
}
function isSimilarToLastCapturedEvent(event) {
	if (event.type !== lastCapturedEventType) return false;
	try {
		if (!event.target || event.target._sentryId !== lastCapturedEventTargetId) return false;
	} catch {}
	return true;
}
function shouldSkipDOMEvent(eventType, target) {
	if (eventType !== "keypress") return false;
	if (!target?.tagName) return true;
	if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return false;
	return true;
}
function makeDOMEventHandler(handler, globalListener = false) {
	return (event) => {
		if (!event || event["_sentryCaptured"]) return;
		const target = getEventTarget$1(event);
		if (shouldSkipDOMEvent(event.type, target)) return;
		addNonEnumerableProperty(event, "_sentryCaptured", true);
		if (target && !target._sentryId) addNonEnumerableProperty(target, "_sentryId", uuid4());
		const name = event.type === "keypress" ? "input" : event.type;
		if (!isSimilarToLastCapturedEvent(event)) {
			handler({
				event,
				name,
				global: globalListener
			});
			lastCapturedEventType = event.type;
			lastCapturedEventTargetId = target ? target._sentryId : void 0;
		}
		clearTimeout(debounceTimerID);
		debounceTimerID = WINDOW$4.setTimeout(() => {
			lastCapturedEventTargetId = void 0;
			lastCapturedEventType = void 0;
		}, DEBOUNCE_DURATION);
	};
}
function getEventTarget$1(event) {
	try {
		return event.target;
	} catch {
		return null;
	}
}
// ../DnD helper/node_modules/@sentry/browser-utils/build/esm/instrumentation/history.js
var lastHref;
function supportsHistory() {
	return "history" in WINDOW$4 && !!WINDOW$4.history;
}
function addHistoryInstrumentationHandler(handler) {
	const type = "history";
	addHandler$1(type, handler);
	maybeInstrument(type, instrumentHistory);
}
function instrumentHistory() {
	WINDOW$4.addEventListener("popstate", () => {
		const to = WINDOW$4.location.href;
		const from = lastHref;
		lastHref = to;
		if (from === to) return;
		triggerHandlers$1("history", {
			from,
			to
		});
	});
	if (!supportsHistory()) return;
	function historyReplacementFunction(originalHistoryFunction) {
		return function(...args) {
			const url = args.length > 2 ? args[2] : void 0;
			if (url) {
				const from = lastHref;
				const to = getAbsoluteUrl$1(String(url));
				lastHref = to;
				if (from === to) return originalHistoryFunction.apply(this, args);
				triggerHandlers$1("history", {
					from,
					to
				});
			}
			return originalHistoryFunction.apply(this, args);
		};
	}
	fill(WINDOW$4.history, "pushState", historyReplacementFunction);
	fill(WINDOW$4.history, "replaceState", historyReplacementFunction);
}
function getAbsoluteUrl$1(urlOrPath) {
	try {
		return new URL(urlOrPath, WINDOW$4.location.origin).toString();
	} catch {
		return urlOrPath;
	}
}
// ../DnD helper/node_modules/@sentry/browser-utils/build/esm/getNativeImplementation.js
var cachedImplementations$3 = {};
function getNativeImplementation(name) {
	const cached = cachedImplementations$3[name];
	if (cached) return cached;
	let impl = WINDOW$4[name];
	if (isNativeFunction(impl)) return cachedImplementations$3[name] = impl.bind(WINDOW$4);
	const document = WINDOW$4.document;
	if (document && typeof document.createElement === "function") try {
		const sandbox = document.createElement("iframe");
		sandbox.hidden = true;
		document.head.appendChild(sandbox);
		const contentWindow = sandbox.contentWindow;
		if (contentWindow?.[name]) impl = contentWindow[name];
		document.head.removeChild(sandbox);
	} catch (e) {
		DEBUG_BUILD$3 && debug$2.warn(`Could not create sandbox iframe for ${name} check, bailing to window.${name}: `, e);
	}
	if (!impl) return impl;
	return cachedImplementations$3[name] = impl.bind(WINDOW$4);
}
function clearCachedImplementation(name) {
	cachedImplementations$3[name] = void 0;
}
function setTimeout$3(...rest) {
	try {
		return getNativeImplementation("setTimeout")(...rest);
	} catch (e) {
		DEBUG_BUILD$3 && debug$2.warn("Could not use native setTimeout implementation, falling back to window.setTimeout: ", e);
		const fallback = WINDOW$4.setTimeout.bind(WINDOW$4);
		cachedImplementations$3.setTimeout = fallback;
		return fallback(...rest);
	}
}
// ../DnD helper/node_modules/@sentry/browser-utils/build/esm/instrumentation/xhr.js
var SENTRY_XHR_DATA_KEY = "__sentry_xhr_v3__";
function addXhrInstrumentationHandler(handler) {
	const type = "xhr";
	addHandler$1(type, handler);
	maybeInstrument(type, instrumentXHR);
}
function instrumentXHR() {
	if (!WINDOW$4.XMLHttpRequest) return;
	const xhrproto = XMLHttpRequest.prototype;
	xhrproto.open = new Proxy(xhrproto.open, { apply(originalOpen, xhrOpenThisArg, xhrOpenArgArray) {
		let virtualError = /* @__PURE__ */ new Error();
		const startTimestamp = timestampInSeconds() * 1e3;
		const method = isString(xhrOpenArgArray[0]) ? xhrOpenArgArray[0].toUpperCase() : void 0;
		const url = parseXhrUrlArg(xhrOpenArgArray[1]);
		if (!method || !url) return originalOpen.apply(xhrOpenThisArg, xhrOpenArgArray);
		xhrOpenThisArg[SENTRY_XHR_DATA_KEY] = {
			method,
			url,
			request_headers: {}
		};
		if (method === "POST" && url.match(/sentry_key/)) xhrOpenThisArg.__sentry_own_request__ = true;
		const onreadystatechangeHandler = () => {
			const xhrInfo = xhrOpenThisArg[SENTRY_XHR_DATA_KEY];
			if (!xhrInfo) return;
			if (xhrOpenThisArg.readyState === 4) {
				try {
					xhrInfo.status_code = xhrOpenThisArg.status;
				} catch {}
				triggerHandlers$1("xhr", {
					endTimestamp: timestampInSeconds() * 1e3,
					startTimestamp,
					xhr: xhrOpenThisArg,
					virtualError
				});
				virtualError = void 0;
				xhrOpenThisArg.removeEventListener("readystatechange", onreadystatechangeHandler);
			}
		};
		if ("onreadystatechange" in xhrOpenThisArg && typeof xhrOpenThisArg.onreadystatechange === "function") xhrOpenThisArg.onreadystatechange = new Proxy(xhrOpenThisArg.onreadystatechange, { apply(originalOnreadystatechange, onreadystatechangeThisArg, onreadystatechangeArgArray) {
			onreadystatechangeHandler();
			return originalOnreadystatechange.apply(onreadystatechangeThisArg, onreadystatechangeArgArray);
		} });
		else xhrOpenThisArg.addEventListener("readystatechange", onreadystatechangeHandler);
		xhrOpenThisArg.setRequestHeader = new Proxy(xhrOpenThisArg.setRequestHeader, { apply(originalSetRequestHeader, setRequestHeaderThisArg, setRequestHeaderArgArray) {
			const [header, value] = setRequestHeaderArgArray;
			const xhrInfo = setRequestHeaderThisArg[SENTRY_XHR_DATA_KEY];
			if (xhrInfo && isString(header) && isString(value)) xhrInfo.request_headers[header.toLowerCase()] = value;
			return originalSetRequestHeader.apply(setRequestHeaderThisArg, setRequestHeaderArgArray);
		} });
		return originalOpen.apply(xhrOpenThisArg, xhrOpenArgArray);
	} });
	xhrproto.send = new Proxy(xhrproto.send, { apply(originalSend, sendThisArg, sendArgArray) {
		const sentryXhrData = sendThisArg[SENTRY_XHR_DATA_KEY];
		if (!sentryXhrData) return originalSend.apply(sendThisArg, sendArgArray);
		if (sendArgArray[0] !== void 0) sentryXhrData.body = sendArgArray[0];
		triggerHandlers$1("xhr", {
			startTimestamp: timestampInSeconds() * 1e3,
			xhr: sendThisArg
		});
		return originalSend.apply(sendThisArg, sendArgArray);
	} });
}
function parseXhrUrlArg(url) {
	if (isString(url)) return url;
	try {
		return url.toString();
	} catch {}
}
// ../DnD helper/node_modules/@sentry/browser-utils/build/esm/networkUtils.js
var ORIGINAL_REQ_BODY = /* @__PURE__ */ Symbol.for("sentry__originalRequestBody");
function serializeFormData(formData) {
	return new URLSearchParams(formData).toString();
}
function getBodyString(body, _debug = debug$2) {
	try {
		if (typeof body === "string") return [body];
		if (body instanceof URLSearchParams) return [body.toString()];
		if (body instanceof FormData) return [serializeFormData(body)];
		if (!body) return [void 0];
	} catch (error) {
		DEBUG_BUILD$3 && _debug.error(error, "Failed to serialize body", body);
		return [void 0, "BODY_PARSE_ERROR"];
	}
	DEBUG_BUILD$3 && _debug.log("Skipping network body because of body type", body);
	return [void 0, "UNPARSEABLE_BODY_TYPE"];
}
function getFetchRequestArgBody(fetchArgs = []) {
	if (fetchArgs.length >= 2 && fetchArgs[1] && typeof fetchArgs[1] === "object" && "body" in fetchArgs[1]) return fetchArgs[1].body;
	if (fetchArgs.length >= 1 && fetchArgs[0] instanceof Request) {
		const originalBody = fetchArgs[0][ORIGINAL_REQ_BODY];
		if (originalBody !== void 0) return originalBody;
		return;
	}
}
function parseXhrResponseHeaders(xhr) {
	let headers;
	try {
		headers = xhr.getAllResponseHeaders();
	} catch (error) {
		DEBUG_BUILD$3 && debug$2.error(error, "Failed to get xhr response headers", xhr);
		return {};
	}
	if (!headers) return {};
	return headers.split("\r\n").reduce((acc, line) => {
		const [key, value] = line.split(": ");
		if (value) acc[key.toLowerCase()] = value;
		return acc;
	}, {});
}
// ../DnD helper/node_modules/@sentry/browser-utils/build/esm/is.js
function isElement$3(wat) {
	if (typeof Element === "undefined") return false;
	try {
		return wat instanceof Element;
	} catch {
		return false;
	}
}
// ../DnD helper/node_modules/@sentry/browser-utils/build/esm/instrumentation/location.js
function getAbsoluteUrl(urlOrPath) {
	try {
		return new URL(urlOrPath, WINDOW$4.location.origin).toString();
	} catch {
		return urlOrPath;
	}
}
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/helpers.js
var WINDOW = GLOBAL_OBJ;
var ignoreOnError = 0;
var ignoredErrorReports = [];
function shouldIgnoreOnError(data) {
	if (ignoreOnError > 0) return true;
	const index = data ? ignoredErrorReports.findIndex((report) => isSameErrorReport(report, data)) : -1;
	if (index === -1) return false;
	ignoredErrorReports.splice(index, 1);
	return true;
}
function ignoreNextOnErrorMatching(report) {
	ignoredErrorReports.push(report);
	setTimeout(() => {
		const index = ignoredErrorReports.indexOf(report);
		if (index !== -1) ignoredErrorReports.splice(index, 1);
	});
}
function isSameErrorReport(a, b) {
	return a.msg === b.msg && a.url === b.url && a.line === b.line && a.column === b.column;
}
function ignoreNextOnError() {
	ignoreOnError++;
	setTimeout(() => {
		ignoreOnError--;
	});
}
function wrap(fn, options = {}) {
	function isFunction(fn2) {
		return typeof fn2 === "function";
	}
	if (!isFunction(fn)) return fn;
	try {
		if (Object.prototype.hasOwnProperty.call(fn, "__sentry_wrapped__")) {
			const wrapper = fn.__sentry_wrapped__;
			if (typeof wrapper === "function") return wrapper;
			else return fn;
		}
		if (getOriginalFunction(fn)) return fn;
	} catch {
		return fn;
	}
	const sentryWrapped = function(...args) {
		GLOBAL_OBJ._sentryWrappedDepth = (GLOBAL_OBJ._sentryWrappedDepth || 0) + 1;
		try {
			const wrappedArguments = args.map((arg) => wrap(arg, options));
			return fn.apply(this, wrappedArguments);
		} catch (ex) {
			ignoreNextOnError();
			withScope((scope) => {
				scope.addEventProcessor((event) => {
					if (options.mechanism) {
						addExceptionTypeValue(event, void 0, void 0);
						addExceptionMechanism(event, options.mechanism);
					}
					event.extra = {
						...event.extra,
						arguments: args
					};
					return event;
				});
				captureException(ex);
			});
			throw ex;
		} finally {
			GLOBAL_OBJ._sentryWrappedDepth = (GLOBAL_OBJ._sentryWrappedDepth || 0) - 1;
		}
	};
	try {
		for (const property in fn) if (Object.prototype.hasOwnProperty.call(fn, property)) sentryWrapped[property] = fn[property];
	} catch {}
	markFunctionWrapped(sentryWrapped, fn);
	addNonEnumerableProperty(fn, "__sentry_wrapped__", sentryWrapped);
	try {
		if (Object.getOwnPropertyDescriptor(sentryWrapped, "name").configurable) Object.defineProperty(sentryWrapped, "name", { get() {
			return fn.name;
		} });
	} catch {}
	return sentryWrapped;
}
function getHttpRequestData(client) {
	const url = getLocationHref();
	const { referrer } = WINDOW.document || {};
	const { userAgent } = WINDOW.navigator || {};
	return {
		url,
		headers: {
			...referrer && { Referer: filterCollectedUrl(referrer, client) },
			...userAgent && { "User-Agent": userAgent }
		}
	};
}
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/utils/lazyLoadIntegration.js
var LAZY_LOADABLE_NAMES = [
	"replayIntegration",
	"replayCanvasIntegration",
	"feedbackIntegration",
	"feedbackModalIntegration",
	"feedbackScreenshotIntegration",
	"captureConsoleIntegration",
	"contextLinesIntegration",
	"linkedErrorsIntegration",
	"dedupeIntegration",
	"extraErrorDataIntegration",
	"graphqlClientIntegration",
	"httpClientIntegration",
	"reportingObserverIntegration",
	"rewriteFramesIntegration",
	"browserProfilingIntegration",
	"userTimingIntegration",
	"interactionsIntegration",
	"moduleMetadataIntegration"
];
var HYPHENATED_BUNDLES = {
	replayCanvasIntegration: "replay-canvas",
	feedbackModalIntegration: "feedback-modal",
	feedbackScreenshotIntegration: "feedback-screenshot"
};
function getBundleName(name) {
	return HYPHENATED_BUNDLES[name] || name.replace("Integration", "").toLowerCase();
}
var WindowWithMaybeIntegration = WINDOW;
async function lazyLoadIntegration(name, scriptNonce) {
	const bundle = LAZY_LOADABLE_NAMES.includes(name) ? getBundleName(name) : void 0;
	const sentryOnWindow = WindowWithMaybeIntegration.Sentry = WindowWithMaybeIntegration.Sentry || {};
	if (!bundle) throw new Error(`Cannot lazy load integration: ${name}`);
	const existing = sentryOnWindow[name];
	if (typeof existing === "function" && !("_isShim" in existing)) return existing;
	const url = getScriptURL(bundle);
	const script = WINDOW.document.createElement("script");
	script.src = url;
	script.crossOrigin = "anonymous";
	script.referrerPolicy = "strict-origin";
	if (scriptNonce) script.setAttribute("nonce", scriptNonce);
	const waitForLoad = new Promise((resolve, reject) => {
		script.addEventListener("load", () => resolve());
		script.addEventListener("error", reject);
	});
	const currentScript = WINDOW.document.currentScript;
	const parent = WINDOW.document.body || WINDOW.document.head || currentScript?.parentElement;
	if (parent) parent.appendChild(script);
	else throw new Error(`Could not find parent element to insert lazy-loaded ${name} script`);
	try {
		await waitForLoad;
	} catch {
		throw new Error(`Error when loading integration: ${name}`);
	}
	const integrationFn = sentryOnWindow[name];
	if (typeof integrationFn !== "function") throw new Error(`Could not load integration: ${name}`);
	return integrationFn;
}
function getScriptURL(bundle) {
	const baseURL = getClient()?.getOptions()?.cdnBaseUrl || "https://browser.sentry-cdn.com";
	return new URL(`/${SDK_VERSION}/${bundle}.min.js`, baseURL).toString();
}
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/feedbackAsync.js
var feedbackAsyncIntegration = buildFeedbackIntegration({ lazyLoadIntegration });
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/feedbackSync.js
var feedbackSyncIntegration = buildFeedbackIntegration({
	getModalIntegration: () => feedbackModalIntegration,
	getScreenshotIntegration: () => feedbackScreenshotIntegration
});
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/eventbuilder.js
function exceptionFromError(stackParser, ex) {
	const frames = parseStackFrames(stackParser, ex);
	const exception = {
		type: extractType(ex),
		value: extractMessage(ex)
	};
	if (frames.length) exception.stacktrace = { frames };
	if (exception.type === void 0 && exception.value === "") exception.value = "Unrecoverable error caught";
	return exception;
}
function eventFromPlainObject(stackParser, exception, syntheticException, isUnhandledRejection) {
	const normalizeDepth = getClient()?.getOptions().normalizeDepth;
	const errorFromProp = getErrorPropertyFromObject(exception);
	const extra = { __serialized__: normalizeToSize(exception, normalizeDepth) };
	if (errorFromProp) return {
		exception: { values: [exceptionFromError(stackParser, errorFromProp)] },
		extra
	};
	const event = {
		exception: { values: [{
			type: isEvent(exception) ? exception.constructor.name : isUnhandledRejection ? "UnhandledRejection" : "Error",
			value: getNonErrorObjectExceptionValue(exception, { isUnhandledRejection })
		}] },
		extra
	};
	if (syntheticException) {
		const frames = parseStackFrames(stackParser, syntheticException);
		if (frames.length) event.exception.values[0].stacktrace = { frames };
	}
	return event;
}
function eventFromError(stackParser, ex) {
	return { exception: { values: [exceptionFromError(stackParser, ex)] } };
}
function parseStackFrames(stackParser, ex) {
	const stacktrace = ex.stacktrace || ex.stack || "";
	const skipLines = getSkipFirstStackStringLines(ex);
	const framesToPop = getPopFirstTopFrames(ex);
	try {
		return stackParser(stacktrace, skipLines, framesToPop);
	} catch {}
	return [];
}
var reactMinifiedRegexp = /Minified React error #\d+;/i;
function getSkipFirstStackStringLines(ex) {
	if (ex && reactMinifiedRegexp.test(ex.message)) return 1;
	return 0;
}
function getPopFirstTopFrames(ex) {
	if (typeof ex.framesToPop === "number") return ex.framesToPop;
	return 0;
}
function isWebAssemblyException(exception) {
	if (typeof WebAssembly !== "undefined" && typeof WebAssembly.Exception !== "undefined") return exception instanceof WebAssembly.Exception;
	else return false;
}
function extractType(ex) {
	const name = ex?.name;
	if (!name && isWebAssemblyException(ex)) return ex.message && Array.isArray(ex.message) && ex.message.length == 2 ? ex.message[0] : "WebAssembly.Exception";
	return name;
}
function extractMessage(ex) {
	const message = ex?.message;
	if (isWebAssemblyException(ex)) {
		if (Array.isArray(ex.message) && ex.message.length == 2) return ex.message[1];
		return "wasm exception";
	}
	if (!message) return "No error message";
	if (message.error && typeof message.error.message === "string") return _enhanceErrorWithSentryInfo(message.error);
	return _enhanceErrorWithSentryInfo(ex);
}
function eventFromException(stackParser, exception, hint, attachStacktrace) {
	const event = eventFromUnknownInput(stackParser, exception, hint?.syntheticException || void 0, attachStacktrace);
	addExceptionMechanism(event);
	event.level = "error";
	if (hint?.event_id) event.event_id = hint.event_id;
	return resolvedSyncPromise(event);
}
function eventFromMessage(stackParser, message, level = "info", hint, attachStacktrace) {
	const event = eventFromString(stackParser, message, hint?.syntheticException || void 0, attachStacktrace);
	event.level = level;
	if (hint?.event_id) event.event_id = hint.event_id;
	return resolvedSyncPromise(event);
}
function eventFromUnknownInput(stackParser, exception, syntheticException, attachStacktrace, isUnhandledRejection) {
	let event;
	if (isErrorEvent$2(exception) && exception.error) return eventFromError(stackParser, exception.error);
	if (isDOMError(exception) || isDOMException(exception)) {
		const domException = exception;
		if ("stack" in exception) {
			event = eventFromError(stackParser, exception);
			const firstException = event.exception?.values?.[0];
			if (attachStacktrace && syntheticException && firstException && !firstException.stacktrace) {
				const frames = parseStackFrames(stackParser, syntheticException);
				if (frames.length) {
					firstException.stacktrace = { frames };
					addExceptionMechanism(event, { synthetic: true });
				}
			}
		} else {
			const name = domException.name || (isDOMError(domException) ? "DOMError" : "DOMException");
			const message = domException.message ? `${name}: ${domException.message}` : name;
			event = eventFromString(stackParser, message, syntheticException, attachStacktrace);
			addExceptionTypeValue(event, message);
		}
		return event;
	}
	if (isError(exception)) return eventFromError(stackParser, exception);
	if (isPlainObject(exception) || isEvent(exception)) {
		event = eventFromPlainObject(stackParser, exception, syntheticException, isUnhandledRejection);
		addExceptionMechanism(event, { synthetic: true });
		return event;
	}
	const stringifiedException = String(exception);
	event = eventFromString(stackParser, stringifiedException, syntheticException, attachStacktrace);
	addExceptionTypeValue(event, stringifiedException, void 0);
	addExceptionMechanism(event, { synthetic: true });
	return event;
}
function eventFromString(stackParser, message, syntheticException, attachStacktrace) {
	const event = {};
	if (attachStacktrace && syntheticException) {
		const frames = parseStackFrames(stackParser, syntheticException);
		if (frames.length) event.exception = { values: [{
			value: message,
			stacktrace: { frames }
		}] };
		addExceptionMechanism(event, { synthetic: true });
	}
	if (isParameterizedString(message)) {
		const { __sentry_template_string__, __sentry_template_values__ } = message;
		event.logentry = {
			message: __sentry_template_string__,
			params: __sentry_template_values__
		};
		return event;
	}
	event.message = message;
	return event;
}
function getNonErrorObjectExceptionValue(exception, { isUnhandledRejection }) {
	const keys = extractExceptionKeysForMessage(exception);
	const captureType = isUnhandledRejection ? "promise rejection" : "exception";
	if (isErrorEvent$2(exception)) return `Event \`ErrorEvent\` captured as ${captureType} with message \`${exception.message}\``;
	if (isEvent(exception)) return `Event \`${getObjectClassName(exception)}\` (type=${exception.type}) captured as ${captureType}`;
	return `Object captured as ${captureType} with keys: ${keys}`;
}
function getObjectClassName(obj) {
	try {
		const prototype = Object.getPrototypeOf(obj);
		return prototype ? prototype.constructor.name : void 0;
	} catch {}
}
function getErrorPropertyFromObject(obj) {
	return Object.values(obj).find(isError);
}
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/client.js
var BrowserClient = class extends Client {
	/**
	* Creates a new Browser SDK instance.
	*
	* @param options Configuration options for this SDK.
	*/
	constructor(options) {
		const opts = applyDefaultOptions(options);
		applySdkMetadata(opts, "browser", ["browser"], WINDOW.SENTRY_SDK_SOURCE || getSDKSource());
		super(opts);
		if (opts.routeProvider) setRouteProvider(opts.routeProvider, this);
		this._unhandledSessionStatus = "unhandled";
		const { userInfo } = this.getDataCollectionOptions();
		if (opts._metadata?.sdk) opts._metadata.sdk.settings = {
			infer_ip: userInfo ? "auto" : "never",
			...opts._metadata.sdk.settings
		};
		const { sendClientReports } = this._options;
		const checkDrift = () => {
			timestampInSeconds();
		};
		const listeners = [
			[
				WINDOW.document,
				"visibilitychange",
				() => {
					checkDrift();
					if (WINDOW.document.visibilityState === "hidden") {
						if (sendClientReports) this._flushOutcomes();
						queueMicrotask(() => {
							this.flush();
						});
					}
				}
			],
			[
				WINDOW.document,
				"freeze",
				checkDrift
			],
			[
				WINDOW.document,
				"resume",
				checkDrift
			],
			[
				WINDOW,
				"pagehide",
				checkDrift
			],
			[
				WINDOW,
				"pageshow",
				checkDrift
			]
		];
		listeners.forEach(([target, name, listener]) => target?.addEventListener?.(name, listener));
		this.on("close", () => listeners.forEach(([target, name, listener]) => target?.removeEventListener?.(name, listener)));
		if (userInfo) this.on("beforeSendSession", addAutoIpAddressToSession);
	}
	/**
	* @inheritDoc
	*/
	eventFromException(exception, hint) {
		return eventFromException(this._options.stackParser, exception, hint, this._options.attachStacktrace);
	}
	/**
	* @inheritDoc
	*/
	eventFromMessage(message, level = "info", hint) {
		return eventFromMessage(this._options.stackParser, message, level, hint, this._options.attachStacktrace);
	}
	/**
	* @inheritDoc
	*/
	_prepareEvent(event, hint, currentScope, isolationScope) {
		event.platform = event.platform || "javascript";
		return super._prepareEvent(event, hint, currentScope, isolationScope);
	}
};
function applyDefaultOptions(optionsArg) {
	return {
		release: typeof __SENTRY_RELEASE__ === "string" ? __SENTRY_RELEASE__ : WINDOW.SENTRY_RELEASE?.id,
		sendClientReports: true,
		parentSpanIsAlwaysRootSpan: true,
		...optionsArg
	};
}
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/transports/fetch.js
var DEFAULT_BROWSER_TRANSPORT_BUFFER_SIZE = 40;
function makeFetchTransport(options, nativeFetch = getNativeImplementation("fetch")) {
	let pendingBodySize = 0;
	let pendingCount = 0;
	async function makeRequest(request) {
		const requestSize = request.body.length;
		pendingBodySize += requestSize;
		pendingCount++;
		const requestOptions = {
			body: request.body,
			method: "POST",
			referrerPolicy: "strict-origin",
			headers: options.headers,
			keepalive: pendingBodySize <= 6e4 && pendingCount < 15,
			...options.fetchOptions
		};
		try {
			const response = await nativeFetch(options.url, requestOptions);
			return {
				statusCode: response.status,
				headers: {
					"x-sentry-rate-limits": response.headers.get("X-Sentry-Rate-Limits"),
					"retry-after": response.headers.get("Retry-After")
				}
			};
		} catch (e) {
			clearCachedImplementation("fetch");
			throw e;
		} finally {
			pendingBodySize -= requestSize;
			pendingCount--;
		}
	}
	return createTransport(options, makeRequest, makePromiseBuffer(options.bufferSize || DEFAULT_BROWSER_TRANSPORT_BUFFER_SIZE));
}
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/debug-build.js
var DEBUG_BUILD$2 = typeof __SENTRY_DEBUG__ === "undefined" || __SENTRY_DEBUG__;
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/profiling/index.js
function startProfiler() {
	const client = getClient();
	if (!client) {
		DEBUG_BUILD$2 && debug$2.warn("No Sentry client available, profiling is not started");
		return;
	}
	if (!client.getIntegrationByName("BrowserProfiling")) {
		DEBUG_BUILD$2 && debug$2.warn("BrowserProfiling integration is not available");
		return;
	}
	client.emit("startUIProfiler");
}
function stopProfiler() {
	const client = getClient();
	if (!client) {
		DEBUG_BUILD$2 && debug$2.warn("No Sentry client available, profiling is not started");
		return;
	}
	if (!client.getIntegrationByName("BrowserProfiling")) {
		DEBUG_BUILD$2 && debug$2.warn("ProfilingIntegration is not available");
		return;
	}
	client.emit("stopUIProfiler");
}
var uiProfiler = {
	startProfiler,
	stopProfiler
};
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/stack-parsers.js
var OPERA10_PRIORITY = 10;
var OPERA11_PRIORITY = 20;
var CHROME_PRIORITY = 30;
var WINJS_PRIORITY = 40;
var GECKO_PRIORITY = 50;
function createFrame(filename, func, lineno, colno) {
	const frame = {
		filename,
		function: func === "<anonymous>" ? "?" : func,
		in_app: true
	};
	if (lineno !== void 0) frame.lineno = lineno;
	if (colno !== void 0) frame.colno = colno;
	return frame;
}
var chromeRegexNoFnName = /^\s*at (\S+?)(?::(\d+))(?::(\d+))\s*$/i;
var chromeRegex = /^\s*at (?:(.+?\)(?: \[.+\])?|.*?) ?\((?:address at )?)?(?:async )?((?:<anonymous>|[-a-z]+:|.*bundle|\/)?.*?)(?::(\d+))?(?::(\d+))?\)?\s*$/i;
var chromeEvalRegex = /\((\S*)(?::(\d+))(?::(\d+))\)/;
var chromeDataUriRegex = /at (.+?) ?\(data:(.+?),/;
var chromeStackParserFn = (line) => {
	const dataUriMatch = line.match(chromeDataUriRegex);
	if (dataUriMatch) return {
		filename: `<data:${dataUriMatch[2]}>`,
		function: dataUriMatch[1]
	};
	const noFnParts = chromeRegexNoFnName.exec(line);
	if (noFnParts) {
		const [, filename, line2, col] = noFnParts;
		return createFrame(filename, "?", +line2, +col);
	}
	const parts = chromeRegex.exec(line);
	if (parts) {
		if (parts[2]?.indexOf("eval") === 0) {
			const subMatch = chromeEvalRegex.exec(parts[2]);
			if (subMatch) {
				parts[2] = subMatch[1];
				parts[3] = subMatch[2];
				parts[4] = subMatch[3];
			}
		}
		const [func, filename] = extractSafariExtensionDetails(parts[1] || "?", parts[2]);
		return createFrame(filename, func, parts[3] ? +parts[3] : void 0, parts[4] ? +parts[4] : void 0);
	}
};
var chromeStackLineParser = [CHROME_PRIORITY, chromeStackParserFn];
var geckoREgex = /^\s*(.*?)(?:\((.*?)\))?(?:^|@)?((?:[-a-z]+)?:\/.*?|\[native code\]|[^@]*(?:bundle|\d+\.js)|\/[\w\-. /=]+)(?::(\d+))?(?::(\d+))?\s*$/i;
var geckoEvalRegex = /(\S+) line (\d+)(?: > eval line \d+)* > eval/i;
var gecko = (line) => {
	const parts = geckoREgex.exec(line);
	if (parts) {
		if (parts[3] && parts[3].indexOf(" > eval") > -1) {
			const subMatch = geckoEvalRegex.exec(parts[3]);
			if (subMatch) {
				parts[1] = parts[1] || "eval";
				parts[3] = subMatch[1];
				parts[4] = subMatch[2];
				parts[5] = "";
			}
		}
		let filename = parts[3];
		let func = parts[1] || "?";
		[func, filename] = extractSafariExtensionDetails(func, filename);
		return createFrame(filename, func, parts[4] ? +parts[4] : void 0, parts[5] ? +parts[5] : void 0);
	}
};
var geckoStackLineParser = [GECKO_PRIORITY, gecko];
var winjsRegex = /^\s*at (?:((?:\[object object\])?.+) )?\(?((?:[-a-z]+):.*?):(\d+)(?::(\d+))?\)?\s*$/i;
var winjs = (line) => {
	const parts = winjsRegex.exec(line);
	return parts ? createFrame(parts[2], parts[1] || "?", +parts[3], parts[4] ? +parts[4] : void 0) : void 0;
};
var winjsStackLineParser = [WINJS_PRIORITY, winjs];
var opera10Regex = / line (\d+).*script (?:in )?(\S+)(?:: in function (\S+))?$/i;
var opera10 = (line) => {
	const parts = opera10Regex.exec(line);
	return parts ? createFrame(parts[2], parts[3] || "?", +parts[1]) : void 0;
};
var opera10StackLineParser = [OPERA10_PRIORITY, opera10];
var opera11Regex = / line (\d+), column (\d+)\s*(?:in (?:<anonymous function: ([^>]+)>|([^)]+))\(.*\))? in (.*):\s*$/i;
var opera11 = (line) => {
	const parts = opera11Regex.exec(line);
	return parts ? createFrame(parts[5], parts[3] || parts[4] || "?", +parts[1], +parts[2]) : void 0;
};
var opera11StackLineParser = [OPERA11_PRIORITY, opera11];
var defaultStackLineParsers = [chromeStackLineParser, geckoStackLineParser];
var defaultStackParser = createStackParser(...defaultStackLineParsers);
var extractSafariExtensionDetails = (func, filename) => {
	const isSafariExtension = func.indexOf("safari-extension") !== -1;
	const isSafariWebExtension = func.indexOf("safari-web-extension") !== -1;
	return isSafariExtension || isSafariWebExtension ? [func.indexOf("@") !== -1 ? func.split("@")[0] : "?", isSafariExtension ? `safari-extension:${filename}` : `safari-web-extension:${filename}`] : [func, filename];
};
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/userfeedback.js
function createUserFeedbackEnvelope(feedback, { metadata, tunnel, dsn }) {
	return createEnvelope({
		event_id: feedback.event_id,
		sent_at: (/* @__PURE__ */ new Date()).toISOString(),
		...metadata?.sdk && { sdk: {
			name: metadata.sdk.name,
			version: metadata.sdk.version
		} },
		...!!tunnel && !!dsn && { dsn: dsnToString(dsn) }
	}, [createUserFeedbackEnvelopeItem(feedback)]);
}
function createUserFeedbackEnvelopeItem(feedback) {
	return [{ type: "user_report" }, feedback];
}
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/integrations/breadcrumbs.js
var MAX_ALLOWED_STRING_LENGTH = 1024;
var INTEGRATION_NAME$14 = "Breadcrumbs";
var _breadcrumbsIntegration = ((options = {}) => {
	const _options = {
		dom: true,
		fetch: true,
		history: true,
		sentry: true,
		xhr: true,
		...options
	};
	return {
		name: INTEGRATION_NAME$14,
		setup(client) {
			if (_options.dom) addClickKeypressInstrumentationHandler(_getDomBreadcrumbHandler(client, _options.dom));
			if (_options.xhr) addXhrInstrumentationHandler(_getXhrBreadcrumbHandler(client));
			if (_options.fetch) addFetchInstrumentationHandler(_getFetchBreadcrumbHandler(client));
			if (_options.history) addHistoryInstrumentationHandler(_getHistoryBreadcrumbHandler(client));
			if (_options.sentry) client.on("beforeSendEvent", _getSentryBreadcrumbHandler(client));
		}
	};
});
var breadcrumbsIntegration = defineIntegration(_breadcrumbsIntegration);
function _getSentryBreadcrumbHandler(client) {
	return function addSentryBreadcrumb(event) {
		if (getClient() !== client) return;
		addBreadcrumb({
			category: `sentry.${event.type === "transaction" ? "transaction" : "event"}`,
			event_id: event.event_id,
			level: event.level,
			message: getEventDescription(event)
		}, { event });
	};
}
function _getDomBreadcrumbHandler(client, dom) {
	return function _innerDomBreadcrumb(handlerData) {
		if (getClient() !== client) return;
		let target;
		let componentName;
		let keyAttrs = typeof dom === "object" ? dom.serializeAttribute : void 0;
		let maxStringLength = typeof dom === "object" && typeof dom.maxStringLength === "number" ? dom.maxStringLength : void 0;
		if (maxStringLength && maxStringLength > MAX_ALLOWED_STRING_LENGTH) {
			DEBUG_BUILD$2 && debug$2.warn(`\`dom.maxStringLength\` cannot exceed ${MAX_ALLOWED_STRING_LENGTH}, but a value of ${maxStringLength} was configured. Sentry will use ${MAX_ALLOWED_STRING_LENGTH} instead.`);
			maxStringLength = MAX_ALLOWED_STRING_LENGTH;
		}
		if (typeof keyAttrs === "string") keyAttrs = [keyAttrs];
		try {
			const event = handlerData.event;
			const element = _isEvent(event) ? event.target : event;
			target = htmlTreeAsString(element, {
				keyAttrs,
				maxStringLength
			});
			componentName = getComponentName(element);
		} catch {
			target = "<unknown>";
		}
		if (target.length === 0) return;
		const breadcrumb = {
			category: `ui.${handlerData.name}`,
			message: target
		};
		if (componentName) breadcrumb.data = { "ui.component_name": componentName };
		addBreadcrumb(breadcrumb, {
			event: handlerData.event,
			name: handlerData.name,
			global: handlerData.global
		});
	};
}
function _getXhrBreadcrumbHandler(client) {
	return function _xhrBreadcrumb(handlerData) {
		if (getClient() !== client) return;
		const { startTimestamp, endTimestamp } = handlerData;
		const sentryXhrData = handlerData.xhr[SENTRY_XHR_DATA_KEY];
		if (!startTimestamp || !endTimestamp || !sentryXhrData) return;
		const { method, url, status_code, body } = sentryXhrData;
		const data = {
			method,
			url: filterCollectedUrl(url),
			status_code
		};
		const hint = {
			xhr: handlerData.xhr,
			input: body,
			startTimestamp,
			endTimestamp
		};
		const breadcrumb = {
			category: "xhr",
			data,
			type: "http",
			level: getBreadcrumbLogLevelFromHttpStatusCode(status_code)
		};
		client.emit("beforeOutgoingRequestBreadcrumb", breadcrumb, hint);
		addBreadcrumb(breadcrumb, hint);
	};
}
function _getFetchBreadcrumbHandler(client) {
	return function _fetchBreadcrumb(handlerData) {
		if (getClient() !== client) return;
		const { startTimestamp, endTimestamp } = handlerData;
		if (!endTimestamp) return;
		if (handlerData.fetchData.url.match(/sentry_key/) && handlerData.fetchData.method === "POST") return;
		if (handlerData.error) {
			const hint = {
				data: handlerData.error,
				input: handlerData.args,
				startTimestamp,
				endTimestamp
			};
			const breadcrumb = {
				category: "fetch",
				data: {
					...handlerData.fetchData,
					url: filterCollectedUrl(handlerData.fetchData.url)
				},
				level: "error",
				type: "http"
			};
			client.emit("beforeOutgoingRequestBreadcrumb", breadcrumb, hint);
			addBreadcrumb(breadcrumb, hint);
		} else {
			const response = handlerData.response;
			const data = {
				...handlerData.fetchData,
				url: filterCollectedUrl(handlerData.fetchData.url),
				status_code: response?.status
			};
			const hint = {
				input: handlerData.args,
				response,
				startTimestamp,
				endTimestamp
			};
			const breadcrumb = {
				category: "fetch",
				data,
				type: "http",
				level: getBreadcrumbLogLevelFromHttpStatusCode(data.status_code)
			};
			client.emit("beforeOutgoingRequestBreadcrumb", breadcrumb, hint);
			addBreadcrumb(breadcrumb, hint);
		}
	};
}
function _getHistoryBreadcrumbHandler(client) {
	return function _historyBreadcrumb(handlerData) {
		if (getClient() !== client) return;
		let from = handlerData.from;
		let to = handlerData.to;
		const parsedLoc = parseUrl(WINDOW.location.href);
		let parsedFrom = from ? parseUrl(from) : void 0;
		const parsedTo = parseUrl(to);
		if (!parsedFrom?.path) parsedFrom = parsedLoc;
		if (parsedLoc.protocol === parsedTo.protocol && parsedLoc.host === parsedTo.host) to = parsedTo.relative;
		if (parsedLoc.protocol === parsedFrom.protocol && parsedLoc.host === parsedFrom.host) from = parsedFrom.relative;
		addBreadcrumb({
			category: "navigation",
			data: {
				from: filterCollectedUrl(from),
				to: filterCollectedUrl(to)
			}
		});
	};
}
function _isEvent(event) {
	return !!event && !!event.target;
}
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/integrations/browserapierrors.js
var DEFAULT_EVENT_TARGET = "EventTarget,Window,Node,ApplicationCache,AudioTrackList,BroadcastChannel,ChannelMergerNode,CryptoOperation,EventSource,FileReader,HTMLUnknownElement,IDBDatabase,IDBRequest,IDBTransaction,KeyOperation,MediaController,MessagePort,ModalWindow,Notification,SVGElementInstance,Screen,SharedWorker,TextTrack,TextTrackCue,TextTrackList,WebSocket,WebSocketWorker,Worker,XMLHttpRequest,XMLHttpRequestEventTarget,XMLHttpRequestUpload".split(",");
var INTEGRATION_NAME$13 = "BrowserApiErrors";
var _browserApiErrorsIntegration = ((options = {}) => {
	const _options = {
		XMLHttpRequest: true,
		eventTarget: true,
		requestAnimationFrame: true,
		setInterval: true,
		setTimeout: true,
		unregisterOriginalCallbacks: false,
		...options
	};
	return {
		name: INTEGRATION_NAME$13,
		setupOnce() {
			if (_options.setTimeout) fill(WINDOW, "setTimeout", _wrapTimeFunction);
			if (_options.setInterval) fill(WINDOW, "setInterval", _wrapTimeFunction);
			if (_options.requestAnimationFrame) fill(WINDOW, "requestAnimationFrame", _wrapRAF);
			if (_options.XMLHttpRequest && "XMLHttpRequest" in WINDOW) fill(XMLHttpRequest.prototype, "send", _wrapXHR$1);
			const eventTargetOption = _options.eventTarget;
			if (eventTargetOption) (Array.isArray(eventTargetOption) ? eventTargetOption : DEFAULT_EVENT_TARGET).forEach((target) => _wrapEventTarget(target, _options));
		}
	};
});
var browserApiErrorsIntegration = defineIntegration(_browserApiErrorsIntegration);
function _wrapTimeFunction(original) {
	return function(...args) {
		const originalCallback = args[0];
		args[0] = wrap(originalCallback, { mechanism: {
			handled: false,
			type: `auto.browser.browserapierrors.${getFunctionName(original)}`
		} });
		return original.apply(this, args);
	};
}
function _wrapRAF(original) {
	return function(callback) {
		return original.apply(this, [wrap(callback, { mechanism: {
			data: { handler: getFunctionName(original) },
			handled: false,
			type: "auto.browser.browserapierrors.requestAnimationFrame"
		} })]);
	};
}
function _wrapXHR$1(originalSend) {
	return function(...args) {
		const xhr = this;
		[
			"onload",
			"onerror",
			"onprogress",
			"onreadystatechange"
		].forEach((prop) => {
			if (prop in xhr && typeof xhr[prop] === "function") fill(xhr, prop, function(original) {
				const wrapOptions = { mechanism: {
					data: { handler: getFunctionName(original) },
					handled: false,
					type: `auto.browser.browserapierrors.xhr.${prop}`
				} };
				const originalFunction = getOriginalFunction(original);
				if (originalFunction) wrapOptions.mechanism.data.handler = getFunctionName(originalFunction);
				return wrap(original, wrapOptions);
			});
		});
		return originalSend.apply(this, args);
	};
}
function _wrapEventTarget(target, integrationOptions) {
	const proto = WINDOW[target]?.prototype;
	if (!proto?.hasOwnProperty?.("addEventListener")) return;
	fill(proto, "addEventListener", function(original) {
		return function(eventName, fn, options) {
			try {
				if (isEventListenerObject(fn)) fn.handleEvent = wrap(fn.handleEvent, { mechanism: {
					data: {
						handler: getFunctionName(fn),
						target
					},
					handled: false,
					type: "auto.browser.browserapierrors.handleEvent"
				} });
			} catch {}
			if (integrationOptions.unregisterOriginalCallbacks) unregisterOriginalCallback(this, eventName, fn);
			return original.apply(this, [
				eventName,
				wrap(fn, { mechanism: {
					data: {
						handler: getFunctionName(fn),
						target
					},
					handled: false,
					type: "auto.browser.browserapierrors.addEventListener"
				} }),
				options
			]);
		};
	});
	fill(proto, "removeEventListener", function(originalRemoveEventListener) {
		return function(eventName, fn, options) {
			try {
				if (Object.prototype.hasOwnProperty.call(fn, "__sentry_wrapped__")) {
					const originalEventHandler = fn.__sentry_wrapped__;
					if (originalEventHandler) originalRemoveEventListener.call(this, eventName, originalEventHandler, options);
				}
			} catch {}
			return originalRemoveEventListener.call(this, eventName, fn, options);
		};
	});
}
function isEventListenerObject(obj) {
	return typeof obj.handleEvent === "function";
}
function unregisterOriginalCallback(target, eventName, fn) {
	if (target && typeof target === "object" && "removeEventListener" in target && typeof target.removeEventListener === "function") target.removeEventListener(eventName, fn);
}
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/integrations/browsersession.js
var browserSessionIntegration = defineIntegration((options = {}) => {
	const lifecycle = options.lifecycle ?? "page";
	return {
		name: "BrowserSession",
		setupOnce() {
			if (typeof WINDOW.document === "undefined") {
				DEBUG_BUILD$2 && debug$2.warn("Using the `browserSessionIntegration` in non-browser environments is not supported.");
				return;
			}
			startSession({ ignoreDuration: true });
			let initialSessionSent = false;
			whenIdleOrHidden(() => {
				if (!initialSessionSent) {
					captureSession();
					initialSessionSent = true;
				}
			});
			const isolationScope = getIsolationScope();
			let previousUser = isolationScope.getUser();
			isolationScope.addScopeListener((scope) => {
				const maybeNewUser = scope.getUser();
				if (previousUser?.id !== maybeNewUser?.id || previousUser?.ip_address !== maybeNewUser?.ip_address) {
					previousUser = maybeNewUser;
					if (initialSessionSent) captureSession();
				}
			});
			if (lifecycle === "route") addHistoryInstrumentationHandler(({ from, to }) => {
				if (from !== to) {
					startSession({ ignoreDuration: true });
					captureSession();
					initialSessionSent = true;
				}
			});
		}
	};
});
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/integrations/culturecontext.js
var INTEGRATION_NAME$12 = "CultureContext";
var _cultureContextIntegration = (() => {
	return {
		name: INTEGRATION_NAME$12,
		preprocessEvent(event) {
			const culture = getCultureContext();
			if (culture) event.contexts = {
				...event.contexts,
				culture: {
					...culture,
					...event.contexts?.culture
				}
			};
		},
		processSegmentSpan(span) {
			const culture = getCultureContext();
			if (culture) safeSetSpanJSONAttributes(span, {
				[Ra]: culture.locale,
				[Na]: culture.timezone,
				[wa]: culture.calendar
			});
		}
	};
});
var cultureContextIntegration = defineIntegration(_cultureContextIntegration);
function getCultureContext() {
	try {
		const intl = WINDOW.Intl;
		if (!intl) return;
		const options = intl.DateTimeFormat().resolvedOptions();
		return {
			locale: options.locale,
			timezone: options.timeZone,
			calendar: options.calendar
		};
	} catch {
		return;
	}
}
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/integrations/globalhandlers.js
var INTEGRATION_NAME$11 = "GlobalHandlers";
var _globalHandlersIntegration = ((options = {}) => {
	const _options = {
		onerror: true,
		onunhandledrejection: true,
		...options
	};
	return {
		name: INTEGRATION_NAME$11,
		setupOnce() {
			Error.stackTraceLimit = 50;
		},
		setup(client) {
			if (_options.onerror) {
				_installGlobalOnErrorHandler(client);
				globalHandlerLog("onerror");
			}
			if (_options.onunhandledrejection) {
				_installGlobalOnUnhandledRejectionHandler(client);
				globalHandlerLog("onunhandledrejection");
			}
		}
	};
});
var globalHandlersIntegration = defineIntegration(_globalHandlersIntegration);
function _installGlobalOnErrorHandler(client) {
	addGlobalErrorInstrumentationHandler((data) => {
		const { stackParser, attachStacktrace } = getOptions();
		if (getClient() !== client || shouldIgnoreOnError(data)) return;
		const { msg, url, line, column, error } = data;
		const event = _enhanceEventWithInitialFrame(eventFromUnknownInput(stackParser, error || msg, void 0, attachStacktrace, false), url, line, column);
		event.level = "error";
		captureEvent(event, {
			originalException: error,
			mechanism: {
				handled: false,
				type: "auto.browser.global_handlers.onerror"
			}
		});
	});
}
function _installGlobalOnUnhandledRejectionHandler(client) {
	addGlobalUnhandledRejectionInstrumentationHandler((e) => {
		const { stackParser, attachStacktrace } = getOptions();
		if (getClient() !== client || shouldIgnoreOnError()) return;
		const error = _getUnhandledRejectionError(e);
		const event = isPrimitive(error) ? _eventFromRejectionWithPrimitive(error) : eventFromUnknownInput(stackParser, error, void 0, attachStacktrace, true);
		event.level = "error";
		captureEvent(event, {
			originalException: error,
			mechanism: {
				handled: false,
				type: "auto.browser.global_handlers.onunhandledrejection"
			}
		});
	});
}
function _getUnhandledRejectionError(error) {
	if (isPrimitive(error)) return error;
	try {
		if ("reason" in error) return error.reason;
		if ("detail" in error && "reason" in error.detail) return error.detail.reason;
	} catch {}
	return error;
}
function _eventFromRejectionWithPrimitive(reason) {
	return { exception: { values: [{
		type: "UnhandledRejection",
		value: `Non-Error promise rejection captured with value: ${String(reason)}`
	}] } };
}
function _enhanceEventWithInitialFrame(event, url, lineno, colno) {
	const e = event.exception = event.exception || {};
	const ev = e.values = e.values || [];
	const ev0 = ev[0] = ev[0] || {};
	const ev0s = ev0.stacktrace = ev0.stacktrace || {};
	const ev0sf = ev0s.frames = ev0s.frames || [];
	if (ev0sf.length === 0) ev0sf.push({
		colno,
		lineno,
		filename: getFilenameFromUrl(url) ?? getLocationHref(),
		function: "?",
		in_app: true
	});
	return event;
}
function globalHandlerLog(type) {
	DEBUG_BUILD$2 && debug$2.log(`Global Handler attached: ${type}`);
}
function getOptions() {
	return getClient()?.getOptions() || {
		stackParser: () => [],
		attachStacktrace: false
	};
}
function getFilenameFromUrl(url) {
	if (!isString(url) || url.length === 0) return;
	if (url.startsWith("data:")) return `<${stripDataUrlContent(url, false)}>`;
	return url;
}
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/integrations/httpcontext.js
var httpContextIntegration = defineIntegration(() => {
	return {
		name: "HttpContext",
		preprocessEvent(event, _hint, client) {
			if (!WINDOW.navigator && !WINDOW.location && !WINDOW.document) return;
			const { url, headers: collectedHeaders } = getHttpRequestData(client);
			const behavior = client.getDataCollectionOptions().httpHeaders.request;
			const userHeaders = Object.entries(event.request?.headers ?? {}).filter(([key]) => !(key in collectedHeaders));
			const headers = {
				...filterKeyValueData(collectedHeaders, behavior),
				...Object.fromEntries(userHeaders)
			};
			event.request = {
				url: filterCollectedUrl(url, client),
				...event.request,
				...Object.keys(headers).length > 0 ? { headers } : { headers: void 0 }
			};
		},
		processSpan(span, client) {
			if (!WINDOW.navigator && !WINDOW.location && !WINDOW.document) return;
			const reqData = getHttpRequestData(client);
			const headers = filterKeyValueData(reqData.headers, client.getDataCollectionOptions().httpHeaders.request);
			const referer = headers["Referer"];
			const { hostname, protocol } = WINDOW.location || {};
			safeSetSpanJSONAttributes(span, {
				[sy]: headers["User-Agent"],
				[Bm]: protocol === "file:" || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || !!hostname?.endsWith(".localhost"),
				...span.is_segment && {
					["url.full"]: span.attributes?.["sentry.op"] !== "http.client" ? filterCollectedUrl(reqData.url) : void 0,
					[`http.request.header.referer`]: referer ? [referer] : void 0
				}
			});
		}
	};
});
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/integrations/linkederrors.js
var DEFAULT_KEY = "cause";
var DEFAULT_LIMIT = 5;
var INTEGRATION_NAME$10 = "LinkedErrors";
var _linkedErrorsIntegration = ((options = {}) => {
	const limit = options.limit || DEFAULT_LIMIT;
	const key = options.key || DEFAULT_KEY;
	return {
		name: INTEGRATION_NAME$10,
		preprocessEvent(event, hint, client) {
			applyAggregateErrorsToEvent(exceptionFromError, client.getOptions().stackParser, key, limit, event, hint);
		}
	};
});
var linkedErrorsIntegration = defineIntegration(_linkedErrorsIntegration);
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/integrations/spotlight.js
var INTEGRATION_NAME$9 = "SpotlightBrowser";
var SPOTLIGHT_IGNORE_SPANS = [{
	op: H$2,
	name: "#sentry-spotlight"
}, {
	op: H$2,
	attributes: { [hi]: "#sentry-spotlight" }
}];
var _spotlightIntegration = ((options = {}) => {
	const sidecarUrl = options.sidecarUrl || "http://localhost:8969/stream";
	return {
		name: INTEGRATION_NAME$9,
		setup: () => {
			DEBUG_BUILD$2 && debug$2.log("Using Sidecar URL", sidecarUrl);
		},
		beforeSetup(client) {
			const opts = client.getOptions();
			opts.ignoreSpans = [...opts.ignoreSpans || [], ...SPOTLIGHT_IGNORE_SPANS];
		},
		afterAllSetup: (client) => {
			setupSidecarForwarding(client, sidecarUrl);
		}
	};
});
function setupSidecarForwarding(client, sidecarUrl) {
	const makeFetch = getNativeImplementation("fetch");
	let failCount = 0;
	client.on("beforeEnvelope", (envelope) => {
		if (failCount > 3) {
			debug$2.warn("[Spotlight] Disabled Sentry -> Spotlight integration due to too many failed requests:", failCount);
			return;
		}
		makeFetch(sidecarUrl, {
			method: "POST",
			body: serializeEnvelope(envelope),
			headers: { "Content-Type": "application/x-sentry-envelope" },
			mode: "cors"
		}).then((res) => {
			if (res.status >= 200 && res.status < 400) failCount = 0;
		}, (err) => {
			failCount++;
			debug$2.error("Sentry SDK can't connect to Sidecar is it running? See: https://spotlightjs.com/sidecar/npx/", err);
		});
	});
}
var spotlightBrowserIntegration = defineIntegration(_spotlightIntegration);
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/normalizeStringifyValue.js
var HTML_ELEMENT_CONSTRUCTOR_NAME_REGEX = /^HTML(\w*)Element$/;
function normalizeStringifyValue(value) {
	if (typeof window !== "undefined" && value === window) return "[Window]";
	if (typeof document !== "undefined" && value === document) return "[Document]";
	if (isElement$3(value)) {
		const objName = getConstructorName(value);
		if (HTML_ELEMENT_CONSTRUCTOR_NAME_REGEX.test(objName)) return `[HTMLElement: ${htmlTreeAsString(value)}]`;
	}
}
function getConstructorName(value) {
	const prototype = Object.getPrototypeOf(value);
	return prototype?.constructor ? prototype.constructor.name : "null prototype";
}
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/utils/detectBrowserExtension.js
function checkAndWarnIfIsEmbeddedBrowserExtension() {
	if (_isEmbeddedBrowserExtension()) {
		if (DEBUG_BUILD$2) consoleSandbox(() => {
			console.error("[Sentry] You cannot use Sentry.init() in a browser extension, see: https://docs.sentry.io/platforms/javascript/best-practices/browser-extensions/");
		});
		return true;
	}
	return false;
}
function _isEmbeddedBrowserExtension() {
	if (typeof WINDOW.window === "undefined") return false;
	const _window = WINDOW;
	if (_window.nw) return false;
	if (!(_window["chrome"] || _window["browser"])?.runtime?.id) return false;
	const href = getLocationHref();
	return !(WINDOW === WINDOW.top && /^(?:chrome-extension|moz-extension|ms-browser-extension|safari-web-extension):\/\//.test(href));
}
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/utils/managedTunnel.js
function resolveBrowserTunnelOption(options) {
	const { tunnel, dsn, transportOptions } = options;
	if (!tunnel || typeof tunnel === "string") return {
		tunnel,
		transportOptions
	};
	const tunnelOptions = tunnel === true ? {} : tunnel;
	const dsnComponents = dsn && makeDsn(dsn);
	const tunnelPath = tunnelOptions.path ?? (dsnComponents && getTunnelPath(dsnComponents));
	if (!tunnelPath) return {
		tunnel: void 0,
		transportOptions
	};
	const resolvedTunnel = `${normalizeTunnelBasePath(tunnelOptions.basePath)}${tunnelPath}${tunnelOptions.trailingSlash ? "/" : ""}`;
	DEBUG_BUILD$2 && debug$2.log(`Tunneling events to "${resolvedTunnel}"`);
	return {
		tunnel: resolvedTunnel,
		transportOptions: {
			...transportOptions,
			headers: {
				"Content-Type": "application/x-sentry-envelope",
				...transportOptions?.headers
			}
		}
	};
}
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/sdk.js
function getDefaultIntegrations(_options) {
	return [
		eventFiltersIntegration(),
		functionToStringIntegration(),
		conversationIdIntegration(),
		browserApiErrorsIntegration(),
		breadcrumbsIntegration(),
		consoleIntegration(),
		globalHandlersIntegration(),
		linkedErrorsIntegration(),
		dedupeIntegration(),
		httpContextIntegration(),
		cultureContextIntegration(),
		browserSessionIntegration()
	];
}
function init$1(options = {}) {
	const shouldDisableBecauseIsBrowserExtenstion = !options.skipBrowserExtensionCheck && checkAndWarnIfIsEmbeddedBrowserExtension();
	let defaultIntegrations = options.defaultIntegrations == null ? getDefaultIntegrations() : options.defaultIntegrations;
	/*! rollup-include-development-only */
	if (options.spotlight) {
		if (!defaultIntegrations) defaultIntegrations = [];
		const args = typeof options.spotlight === "string" ? { sidecarUrl: options.spotlight } : void 0;
		defaultIntegrations.push(spotlightBrowserIntegration(args));
	}
	/*! rollup-include-development-only-end */
	const integrations = getIntegrationsToSetup({
		integrations: options.integrations,
		defaultIntegrations
	});
	const clientOptions = {
		...options,
		...resolveBrowserTunnelOption(options),
		enabled: shouldDisableBecauseIsBrowserExtenstion ? false : options.enabled,
		stackParser: stackParserFromStackParserOptions(options.stackParser || defaultStackParser),
		integrations,
		transport: options.transport || makeFetchTransport
	};
	setNormalizeStringifier(normalizeStringifyValue);
	return initAndBind(BrowserClient, clientOptions);
}
function forceLoad() {}
function onLoad(callback) {
	callback();
}
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/report-dialog.js
function showReportDialog(options = {}) {
	const optionalDocument = WINDOW.document;
	const injectionPoint = optionalDocument?.head || optionalDocument?.body;
	if (!injectionPoint) {
		DEBUG_BUILD$2 && debug$2.error("[showReportDialog] Global document not defined");
		return;
	}
	const scope = getCurrentScope();
	const dsn = getClient()?.getDsn();
	if (!dsn) {
		DEBUG_BUILD$2 && debug$2.error("[showReportDialog] DSN not configured");
		return;
	}
	const mergedOptions = {
		...options,
		user: {
			...scope.getUser(),
			...options.user
		},
		eventId: options.eventId || lastEventId()
	};
	const { onLoad, onClose, onError } = mergedOptions;
	if (!mergedOptions.eventId) {
		DEBUG_BUILD$2 && debug$2.error("[showReportDialog] No event ID");
		onError?.(/* @__PURE__ */ new Error("No event ID to show the report dialog for"));
		return;
	}
	const script = WINDOW.document.createElement("script");
	script.async = true;
	script.crossOrigin = "anonymous";
	script.src = getReportDialogEndpoint(dsn, mergedOptions);
	if (onLoad) script.onload = onLoad;
	if (onError) script.onerror = () => {
		onError(/* @__PURE__ */ new Error("Failed to load the report dialog script"));
	};
	if (onClose) {
		const reportDialogClosedMessageHandler = (event) => {
			if (event.data === "__sentry_reportdialog_closed__") try {
				onClose();
			} finally {
				WINDOW.removeEventListener("message", reportDialogClosedMessageHandler);
			}
		};
		WINDOW.addEventListener("message", reportDialogClosedMessageHandler);
		script.addEventListener("error", () => {
			WINDOW.removeEventListener("message", reportDialogClosedMessageHandler);
		});
	}
	injectionPoint.appendChild(script);
}
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/integrations/reportingobserver.js
var WINDOW$3 = GLOBAL_OBJ;
function supportsReportingObserver() {
	return "ReportingObserver" in WINDOW$3;
}
var INTEGRATION_NAME$8 = "ReportingObserver";
var SETUP_CLIENTS = /* @__PURE__ */ new WeakMap();
var _reportingObserverIntegration = ((options = {}) => {
	const types = options.types || [
		"crash",
		"deprecation",
		"intervention"
	];
	function handler(reports) {
		if (!SETUP_CLIENTS.has(getClient())) return;
		for (const report of reports) withScope((scope) => {
			scope.setExtra("url", report.url);
			const label = `ReportingObserver [${report.type}]`;
			let details = "No details available";
			if (report.body) {
				const plainBody = {};
				for (const prop in report.body) plainBody[prop] = report.body[prop];
				scope.setExtra("body", plainBody);
				if (report.type === "crash") {
					const body = report.body;
					details = [body.crashId || "", body.reason || ""].join(" ").trim() || details;
				} else details = report.body.message || details;
			}
			captureMessage(`${label}: ${details}`);
		});
	}
	return {
		name: INTEGRATION_NAME$8,
		setupOnce() {
			if (!supportsReportingObserver()) return;
			new WINDOW$3.ReportingObserver(handler, {
				buffered: true,
				types
			}).observe();
		},
		setup(client) {
			SETUP_CLIENTS.set(client, true);
		}
	};
});
var reportingObserverIntegration = defineIntegration(_reportingObserverIntegration);
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/integrations/httpclient.js
var INTEGRATION_NAME$7 = "HttpClient";
var _httpClientIntegration = ((options = {}) => {
	const _options = {
		failedRequestStatusCodes: [[500, 599]],
		failedRequestTargets: [/.*/],
		...options
	};
	return {
		name: INTEGRATION_NAME$7,
		setup(client) {
			_wrapFetch(client, _options);
			_wrapXHR(client, _options);
		}
	};
});
var httpClientIntegration = defineIntegration(_httpClientIntegration);
function _fetchResponseHandler(options, requestInfo, response, requestInit, error) {
	if (_shouldCaptureResponse(options, response.status, response.url)) {
		const request = _getRequest(requestInfo, requestInit);
		let requestHeaders, responseHeaders, requestCookies, responseCookies;
		const dc = _getDataCollectionSettings();
		if (dc.requestHeaders !== false) requestHeaders = filterKeyValueData(_extractFetchHeaders(request.headers), dc.requestHeaders);
		if (dc.responseHeaders !== false) responseHeaders = filterKeyValueData(_extractFetchHeaders(response.headers), dc.responseHeaders);
		if (dc.cookies !== false) {
			const reqCookieStr = request.headers.get("Cookie") || void 0;
			if (reqCookieStr) requestCookies = filterCookies(reqCookieStr, dc.cookies, "cookie");
			const resCookieStr = response.headers.get("Set-Cookie") || void 0;
			if (resCookieStr) responseCookies = filterCookies(resCookieStr, dc.cookies, "set-cookie");
		}
		captureEvent(_createEvent({
			url: request.url,
			method: request.method,
			status: response.status,
			requestHeaders,
			responseHeaders,
			requestCookies,
			responseCookies,
			error,
			type: "fetch"
		}));
	}
}
function _xhrResponseHandler(options, xhr, method, headers, error) {
	if (_shouldCaptureResponse(options, xhr.status, xhr.responseURL)) {
		let requestHeaders, responseCookies, responseHeaders;
		const dc = _getDataCollectionSettings();
		if (dc.cookies !== false) try {
			const cookieString = xhr.getResponseHeader("Set-Cookie") || xhr.getResponseHeader("set-cookie") || void 0;
			if (cookieString) responseCookies = filterCookies(cookieString, dc.cookies, "set-cookie");
		} catch {}
		if (dc.responseHeaders !== false) try {
			responseHeaders = filterKeyValueData(_getXHRResponseHeaders(xhr), dc.responseHeaders);
		} catch {}
		if (dc.requestHeaders !== false) requestHeaders = filterKeyValueData(headers, dc.requestHeaders);
		captureEvent(_createEvent({
			url: xhr.responseURL,
			method,
			status: xhr.status,
			requestHeaders,
			responseHeaders,
			responseCookies,
			error,
			type: "xhr"
		}));
	}
}
function _getResponseSizeFromHeaders(headers) {
	if (headers) {
		const contentLength = headers["Content-Length"] || headers["content-length"];
		if (contentLength) return parseInt(contentLength, 10);
	}
}
function _extractFetchHeaders(headers) {
	const result = {};
	headers.forEach((value, key) => {
		result[key] = value;
	});
	return result;
}
function _getXHRResponseHeaders(xhr) {
	const headers = xhr.getAllResponseHeaders();
	if (!headers) return {};
	return headers.split("\r\n").reduce((acc, line) => {
		const [key, value] = line.split(": ");
		if (key && value) acc[key] = value;
		return acc;
	}, {});
}
function _isInGivenRequestTargets(failedRequestTargets, target) {
	return failedRequestTargets.some((givenRequestTarget) => {
		if (typeof givenRequestTarget === "string") return target.includes(givenRequestTarget);
		return givenRequestTarget.test(target);
	});
}
function _isInGivenStatusRanges(failedRequestStatusCodes, status) {
	return failedRequestStatusCodes.some((range) => {
		if (typeof range === "number") return range === status;
		return status >= range[0] && status <= range[1];
	});
}
function _wrapFetch(client, options) {
	addFetchInstrumentationHandler((handlerData) => {
		if (getClient() !== client) return;
		const { response, args, error, virtualError } = handlerData;
		const [requestInfo, requestInit] = args;
		if (!response) return;
		_fetchResponseHandler(options, requestInfo, response, requestInit, error || virtualError);
	});
}
function _wrapXHR(client, options) {
	if (!("XMLHttpRequest" in GLOBAL_OBJ)) return;
	addXhrInstrumentationHandler((handlerData) => {
		if (getClient() !== client) return;
		const { error, virtualError } = handlerData;
		const xhr = handlerData.xhr;
		const sentryXhrData = xhr[SENTRY_XHR_DATA_KEY];
		if (!sentryXhrData) return;
		const { method, request_headers: headers } = sentryXhrData;
		try {
			_xhrResponseHandler(options, xhr, method, headers, error || virtualError);
		} catch (e) {
			DEBUG_BUILD$2 && debug$2.warn("Error while extracting response event form XHR response", e);
		}
	});
}
function _shouldCaptureResponse(options, status, url) {
	return _isInGivenStatusRanges(options.failedRequestStatusCodes, status) && _isInGivenRequestTargets(options.failedRequestTargets, url) && !isSentryRequestUrl(url, getClient());
}
function _createEvent(data) {
	const client = getClient();
	const virtualStackTrace = client && data.error && data.error instanceof Error ? data.error.stack : void 0;
	const stack = virtualStackTrace && client ? client.getOptions().stackParser(virtualStackTrace, 0, 1) : void 0;
	const message = `HTTP Client Error with status code: ${data.status}`;
	const event = {
		message,
		exception: { values: [{
			type: "Error",
			value: message,
			stacktrace: stack ? { frames: stack } : void 0
		}] },
		request: {
			url: data.url,
			method: data.method,
			headers: data.requestHeaders,
			cookies: data.requestCookies
		},
		contexts: { response: {
			status_code: data.status,
			headers: data.responseHeaders,
			cookies: data.responseCookies,
			body_size: _getResponseSizeFromHeaders(data.responseHeaders)
		} }
	};
	addExceptionMechanism(event, {
		type: `auto.http.client.${data.type}`,
		handled: false
	});
	return event;
}
function _getRequest(requestInfo, requestInit) {
	if (!requestInit && requestInfo instanceof Request) return requestInfo;
	if (requestInfo instanceof Request && requestInfo.bodyUsed) return requestInfo;
	return new Request(requestInfo, requestInit);
}
function _getDataCollectionSettings() {
	const client = getClient();
	if (!client) return {
		cookies: false,
		requestHeaders: false,
		responseHeaders: false
	};
	const { cookies, httpHeaders } = client.getDataCollectionOptions();
	return {
		cookies,
		requestHeaders: httpHeaders.request,
		responseHeaders: httpHeaders.response
	};
}
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/integrations/contextlines.js
var WINDOW$2 = GLOBAL_OBJ;
var DEFAULT_LINES_OF_CONTEXT = 5;
var INTEGRATION_NAME$6 = "ContextLines";
var _contextLinesIntegration = ((options = {}) => {
	return {
		name: INTEGRATION_NAME$6,
		processEvent(event, _hint, client) {
			return addSourceContext(event, options.frameContextLines ?? client?.getDataCollectionOptions().frameContextLines ?? DEFAULT_LINES_OF_CONTEXT);
		}
	};
});
var contextLinesIntegration = defineIntegration(_contextLinesIntegration);
function addSourceContext(event, contextLines) {
	const doc = WINDOW$2.document;
	const htmlFilename = WINDOW$2.location && stripUrlQueryAndFragment(WINDOW$2.location.href);
	if (!doc || !htmlFilename) return event;
	const exceptions = event.exception?.values;
	if (!exceptions?.length) return event;
	const html = doc.documentElement.innerHTML;
	if (!html) return event;
	const htmlLines = [
		"<!DOCTYPE html>",
		"<html>",
		...html.split("\n"),
		"</html>"
	];
	exceptions.forEach((exception) => {
		const stacktrace = exception.stacktrace;
		if (stacktrace?.frames) stacktrace.frames = stacktrace.frames.map((frame) => applySourceContextToFrame(frame, htmlLines, htmlFilename, contextLines));
	});
	return event;
}
function applySourceContextToFrame(frame, htmlLines, htmlFilename, linesOfContext) {
	if (frame.filename !== htmlFilename || !frame.lineno || !htmlLines.length) return frame;
	addContextToFrame(htmlLines, frame, linesOfContext);
	return frame;
}
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/integrations/graphqlClient.js
var INTEGRATION_NAME$5 = "GraphQLClient";
var _graphqlClientIntegration = ((options) => {
	return {
		name: INTEGRATION_NAME$5,
		setup(client) {
			_updateSpanWithGraphQLData(client, options);
			_updateBreadcrumbWithGraphQLData(client, options);
		}
	};
});
function _updateSpanWithGraphQLData(client, options) {
	client.on("beforeOutgoingRequestSpan", (span, hint) => {
		const spanAttributes = spanToJSON(span).attributes;
		if (!(spanAttributes["sentry.op"] === "http.client")) return;
		const httpUrl = spanAttributes[Fg];
		const httpMethod = spanAttributes["http.request.method"] || spanAttributes["http.method"];
		if (!isString(httpUrl) || !isString(httpMethod)) return;
		const { endpoints } = options;
		const isTracedGraphqlEndpoint = stringMatchesSomePattern(httpUrl, endpoints);
		const payload = getRequestPayloadXhrOrFetch(hint);
		if (isTracedGraphqlEndpoint && payload) {
			const graphqlBody = getGraphQLRequestPayload(payload);
			if (graphqlBody) {
				if (!hasSpanStreamingEnabled(client)) span.updateName(`${httpMethod} ${httpUrl} (${_getGraphQLOperation(graphqlBody)})`);
				const { operationName, operationType } = _getGraphQLOperationDetails(graphqlBody);
				span.setAttribute(co, operationName);
				span.setAttribute(uo, operationType);
				if (isStandardRequest(graphqlBody) && client.getDataCollectionOptions().graphQL.document === true) span.setAttribute(po, graphqlBody.query);
				if (isPersistedRequest(graphqlBody)) {
					span.setAttribute("graphql.persisted_query.hash.sha256", graphqlBody.extensions.persistedQuery.sha256Hash);
					span.setAttribute("graphql.persisted_query.version", graphqlBody.extensions.persistedQuery.version);
				}
			}
		}
	});
}
function _updateBreadcrumbWithGraphQLData(client, options) {
	client.on("beforeOutgoingRequestBreadcrumb", (breadcrumb, handlerData) => {
		const { category, type, data } = breadcrumb;
		if (type === "http" && (category === "fetch" || category === "xhr")) {
			const httpUrl = data?.url;
			const { endpoints } = options;
			const isTracedGraphqlEndpoint = stringMatchesSomePattern(httpUrl, endpoints);
			const payload = getRequestPayloadXhrOrFetch(handlerData);
			if (isTracedGraphqlEndpoint && data && payload) {
				const graphqlBody = getGraphQLRequestPayload(payload);
				if (!data.graphql && graphqlBody) {
					data["graphql.operation"] = _getGraphQLOperation(graphqlBody);
					if (isStandardRequest(graphqlBody) && client.getDataCollectionOptions().graphQL.document === true) data[po] = graphqlBody.query;
					if (isPersistedRequest(graphqlBody)) {
						data["graphql.persisted_query.hash.sha256"] = graphqlBody.extensions.persistedQuery.sha256Hash;
						data["graphql.persisted_query.version"] = graphqlBody.extensions.persistedQuery.version;
					}
				}
			}
		}
	});
}
function _getGraphQLOperationDetails(requestBody) {
	if (isPersistedRequest(requestBody)) return {
		operationName: requestBody.operationName,
		operationType: void 0
	};
	if (isStandardRequest(requestBody)) {
		const { query: graphqlQuery, operationName: graphqlOperationName } = requestBody;
		const { operationName = graphqlOperationName, operationType } = parseGraphQLQuery(graphqlQuery);
		return {
			operationName,
			operationType
		};
	}
	return {
		operationName: void 0,
		operationType: void 0
	};
}
function _getGraphQLOperation(requestBody) {
	if (isPersistedRequest(requestBody)) return `persisted ${requestBody.operationName}`;
	if (isStandardRequest(requestBody)) {
		const { operationName, operationType } = _getGraphQLOperationDetails(requestBody);
		return operationName ? `${operationType} ${operationName}` : `${operationType}`;
	}
	return "unknown";
}
function getRequestPayloadXhrOrFetch(hint) {
	const isXhr = "xhr" in hint;
	let body;
	if (isXhr) {
		const sentryXhrData = hint.xhr[SENTRY_XHR_DATA_KEY];
		body = sentryXhrData && getBodyString(sentryXhrData.body)[0];
	} else body = getBodyString(getFetchRequestArgBody(hint.input))[0];
	return body;
}
function parseGraphQLQuery(query) {
	const namedQueryRe = /^(?:\s*)(query|mutation|subscription)(?:\s*)(\w+)(?:\s*)[{(]/;
	const unnamedQueryRe = /^(?:\s*)(query|mutation|subscription)(?:\s*)[{(]/;
	const namedMatch = query.match(namedQueryRe);
	if (namedMatch) return {
		operationType: namedMatch[1],
		operationName: namedMatch[2]
	};
	const unnamedMatch = query.match(unnamedQueryRe);
	if (unnamedMatch) return {
		operationType: unnamedMatch[1],
		operationName: void 0
	};
	return {
		operationType: void 0,
		operationName: void 0
	};
}
function isStandardRequest(payload) {
	return isObjectLike(payload) && typeof payload.query === "string";
}
function isPersistedRequest(payload) {
	return isObjectLike(payload) && typeof payload.operationName === "string" && isObjectLike(payload.extensions) && isObjectLike(payload.extensions.persistedQuery) && typeof payload.extensions.persistedQuery.sha256Hash === "string" && typeof payload.extensions.persistedQuery.version === "number";
}
function getGraphQLRequestPayload(payload) {
	try {
		const requestBody = JSON.parse(payload);
		if (isStandardRequest(requestBody) || isPersistedRequest(requestBody)) return requestBody;
		return;
	} catch {
		return;
	}
}
var graphqlClientIntegration = defineIntegration(_graphqlClientIntegration);
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/integrations/view-hierarchy.js
var viewHierarchyIntegration = defineIntegration((options = {}) => {
	const skipHtmlTags = ["script"];
	function walk(element, windows, depth = 0) {
		if (!element) return;
		const children = "shadowRoot" in element && element.shadowRoot ? element.shadowRoot.children : element.children;
		for (const child of children) {
			if (!(child instanceof HTMLElement)) continue;
			const componentName = getComponentName(child, 1) || void 0;
			const tagName = child.tagName.toLowerCase();
			if (skipHtmlTags.includes(tagName)) continue;
			const result = options.onElement?.({
				element: child,
				componentName,
				tagName,
				depth
			}) || {};
			if (result === "skip") continue;
			if (result === "children") {
				walk(child, windows, depth + 1);
				continue;
			}
			const { x, y, width, height } = child.getBoundingClientRect();
			const window = {
				identifier: child.id || void 0,
				type: componentName || tagName,
				visible: true,
				alpha: 1,
				height,
				width,
				x,
				y,
				...result
			};
			window.children = [];
			walk(child, window.children, depth + 1);
			windows.push(window);
		}
	}
	return {
		name: "ViewHierarchy",
		processEvent: (event, hint) => {
			if (event.type !== void 0 || options.shouldAttach?.(event, hint) === false) return event;
			const root = {
				rendering_system: "DOM",
				positioning: "absolute",
				windows: []
			};
			walk(options.rootElement?.() || WINDOW.document.body, root.windows);
			const attachment = {
				filename: "view-hierarchy.json",
				attachmentType: "event.view_hierarchy",
				contentType: "application/json",
				data: JSON.stringify(root)
			};
			hint.attachments = hint.attachments || [];
			hint.attachments.push(attachment);
			return event;
		}
	};
});
// ../DnD helper/node_modules/@sentry/replay/build/npm/esm/index.js
var db = "sentry.replay_id";
var kb = "sentry.segment.name.source";
var WINDOW$1 = GLOBAL_OBJ;
var REPLAY_SESSION_KEY = "sentryReplaySession";
var REPLAY_EVENT_NAME = "replay_event";
var UNABLE_TO_SEND_REPLAY = "Unable to send Replay";
var SESSION_IDLE_PAUSE_DURATION = 3e5;
var SESSION_IDLE_EXPIRE_DURATION = 9e5;
var DEFAULT_FLUSH_MIN_DELAY = 5e3;
var DEFAULT_FLUSH_MAX_DELAY = 5500;
var BUFFER_CHECKOUT_TIME = 6e4;
var RETRY_BASE_INTERVAL = 5e3;
var RETRY_MAX_COUNT = 3;
var NETWORK_BODY_MAX_SIZE = 15e4;
var CONSOLE_ARG_MAX_SIZE = 5e3;
var SLOW_CLICK_THRESHOLD = 3e3;
var SLOW_CLICK_SCROLL_TIMEOUT = 300;
var REPLAY_MAX_EVENT_BUFFER_SIZE = 2e7;
var MIN_REPLAY_DURATION = 4999;
var MIN_REPLAY_DURATION_LIMIT = 5e4;
var MAX_REPLAY_DURATION = 36e5;
var __defProp$1 = Object.defineProperty;
var __defNormalProp$1 = (obj, key, value) => key in obj ? __defProp$1(obj, key, {
	enumerable: true,
	configurable: true,
	writable: true,
	value
}) : obj[key] = value;
var __publicField$1 = (obj, key, value) => __defNormalProp$1(obj, typeof key !== "symbol" ? key + "" : key, value);
var NodeType$1 = /* @__PURE__ */ ((NodeType2) => {
	NodeType2[NodeType2["Document"] = 0] = "Document";
	NodeType2[NodeType2["DocumentType"] = 1] = "DocumentType";
	NodeType2[NodeType2["Element"] = 2] = "Element";
	NodeType2[NodeType2["Text"] = 3] = "Text";
	NodeType2[NodeType2["CDATA"] = 4] = "CDATA";
	NodeType2[NodeType2["Comment"] = 5] = "Comment";
	return NodeType2;
})(NodeType$1 || {});
function isElement$1(n) {
	return n.nodeType === n.ELEMENT_NODE;
}
function isShadowRoot$1(n) {
	const host = n?.host;
	return Boolean(host?.shadowRoot === n);
}
function isNativeShadowDom(shadowRoot) {
	return Object.prototype.toString.call(shadowRoot) === "[object ShadowRoot]";
}
function fixBrowserCompatibilityIssuesInCSS(cssText) {
	if (cssText.includes(" background-clip: text;") && !cssText.includes(" -webkit-background-clip: text;")) cssText = cssText.replace(/\sbackground-clip:\s*text;/g, " -webkit-background-clip: text; background-clip: text;");
	return cssText;
}
function escapeImportStatement(rule) {
	const { cssText } = rule;
	if (cssText.split("\"").length < 3) return cssText;
	const statement = ["@import", `url(${JSON.stringify(rule.href)})`];
	if (rule.layerName === "") statement.push(`layer`);
	else if (rule.layerName) statement.push(`layer(${rule.layerName})`);
	if (rule.supportsText) statement.push(`supports(${rule.supportsText})`);
	if (rule.media.length) statement.push(rule.media.mediaText);
	return statement.join(" ") + ";";
}
function stringifyStylesheet(s) {
	try {
		const rules = s.rules || s.cssRules;
		return rules ? fixBrowserCompatibilityIssuesInCSS(Array.from(rules, stringifyRule).join("")) : null;
	} catch (error) {
		return null;
	}
}
function fixAllCssProperty(rule) {
	let styles = "";
	for (let i2 = 0; i2 < rule.style.length; i2++) {
		const styleDeclaration = rule.style;
		const attribute = styleDeclaration[i2];
		const isImportant = styleDeclaration.getPropertyPriority(attribute);
		styles += `${attribute}:${styleDeclaration.getPropertyValue(attribute)}${isImportant ? ` !important` : ""};`;
	}
	return `${rule.selectorText} { ${styles} }`;
}
function stringifyRule(rule) {
	let importStringified;
	if (isCSSImportRule(rule)) try {
		importStringified = stringifyStylesheet(rule.styleSheet) || escapeImportStatement(rule);
	} catch (error) {}
	else if (isCSSStyleRule(rule)) {
		let cssText = rule.cssText;
		const needsSafariColonFix = rule.selectorText.includes(":");
		const needsAllFix = typeof rule.style["all"] === "string" && rule.style["all"];
		if (needsAllFix) cssText = fixAllCssProperty(rule);
		if (needsSafariColonFix) cssText = fixSafariColons(cssText);
		if (needsSafariColonFix || needsAllFix) return cssText;
	}
	return importStringified || rule.cssText;
}
function fixSafariColons(cssStringified) {
	return cssStringified.replace(/(\[(?:[\w-]+)[^\\])(:(?:[\w-]+)\])/gm, "$1\\$2");
}
function isCSSImportRule(rule) {
	return "styleSheet" in rule;
}
function isCSSStyleRule(rule) {
	return "selectorText" in rule;
}
var Mirror$1 = class {
	constructor() {
		__publicField$1(this, "idNodeMap", /* @__PURE__ */ new Map());
		__publicField$1(this, "nodeMetaMap", /* @__PURE__ */ new WeakMap());
	}
	getId(n) {
		if (!n) return -1;
		return this.getMeta(n)?.id ?? -1;
	}
	getNode(id) {
		return this.idNodeMap.get(id) || null;
	}
	getIds() {
		return Array.from(this.idNodeMap.keys());
	}
	getMeta(n) {
		return this.nodeMetaMap.get(n) || null;
	}
	removeNodeFromMap(n) {
		const id = this.getId(n);
		this.idNodeMap.delete(id);
		if (n.childNodes) n.childNodes.forEach((childNode) => this.removeNodeFromMap(childNode));
		if (isElement$1(n) && n.shadowRoot) this.removeNodeFromMap(n.shadowRoot);
	}
	has(id) {
		return this.idNodeMap.has(id);
	}
	hasNode(node) {
		return this.nodeMetaMap.has(node);
	}
	add(n, meta) {
		const id = meta.id;
		this.idNodeMap.set(id, n);
		this.nodeMetaMap.set(n, meta);
	}
	replace(id, n) {
		const oldNode = this.getNode(id);
		if (oldNode) {
			const meta = this.nodeMetaMap.get(oldNode);
			if (meta) this.nodeMetaMap.set(n, meta);
		}
		this.idNodeMap.set(id, n);
	}
	reset() {
		this.idNodeMap = /* @__PURE__ */ new Map();
		this.nodeMetaMap = /* @__PURE__ */ new WeakMap();
	}
};
function createMirror$1() {
	return new Mirror$1();
}
function shouldMaskInput({ maskInputOptions, tagName, type }) {
	if (tagName === "OPTION") tagName = "SELECT";
	return Boolean(maskInputOptions[tagName.toLowerCase()] || type && maskInputOptions[type] || type === "password" || tagName === "INPUT" && !type && maskInputOptions["text"]);
}
function maskInputValue({ isMasked, element, value, maskInputFn }) {
	let text = value || "";
	if (!isMasked) return text;
	if (maskInputFn) text = maskInputFn(text, element);
	return "*".repeat(text.length);
}
function toLowerCase(str) {
	return str.toLowerCase();
}
function toUpperCase(str) {
	return str.toUpperCase();
}
var ORIGINAL_ATTRIBUTE_NAME = "__rrweb_original__";
function is2DCanvasBlank(canvas) {
	const ctx = canvas.getContext("2d");
	if (!ctx) return true;
	const chunkSize = 50;
	for (let x = 0; x < canvas.width; x += chunkSize) for (let y = 0; y < canvas.height; y += chunkSize) {
		const getImageData = ctx.getImageData;
		const originalGetImageData = ORIGINAL_ATTRIBUTE_NAME in getImageData ? getImageData[ORIGINAL_ATTRIBUTE_NAME] : getImageData;
		if (new Uint32Array(originalGetImageData.call(ctx, x, y, Math.min(chunkSize, canvas.width - x), Math.min(chunkSize, canvas.height - y)).data.buffer).some((pixel) => pixel !== 0)) return false;
	}
	return true;
}
function getInputType(element) {
	const type = element.type;
	return element.hasAttribute("data-rr-is-password") ? "password" : type ? toLowerCase(type) : null;
}
function getInputValue(el, tagName, type) {
	if (tagName === "INPUT" && (type === "radio" || type === "checkbox")) return el.getAttribute("value") || "";
	return el.value;
}
function extractFileExtension(path, baseURL) {
	let url;
	try {
		url = new URL(path, baseURL ?? window.location.href);
	} catch (err) {
		return null;
	}
	return url.pathname.match(/\.([0-9a-z]+)(?:$)/i)?.[1] ?? null;
}
var cachedImplementations$1 = {};
function getImplementation$1(name) {
	const cached = cachedImplementations$1[name];
	if (cached) return cached;
	const windowImpl = window[name].bind(window);
	let impl = windowImpl;
	const document2 = window.document;
	if (document2 && typeof document2.createElement === "function") try {
		const sandbox = document2.createElement("iframe");
		sandbox.hidden = true;
		document2.head.appendChild(sandbox);
		const contentWindow = sandbox.contentWindow;
		if (contentWindow && contentWindow[name]) {
			const sandboxImpl = contentWindow[name].bind(window);
			impl = (...args) => {
				try {
					return sandboxImpl(...args);
				} catch {
					cachedImplementations$1[name] = windowImpl;
					return windowImpl(...args);
				}
			};
		}
		document2.head.removeChild(sandbox);
	} catch (e) {}
	return cachedImplementations$1[name] = impl;
}
function setTimeout$1$1(...rest) {
	return getImplementation$1("setTimeout")(...rest);
}
function clearTimeout$1(...rest) {
	return getImplementation$1("clearTimeout")(...rest);
}
function getIFrameContentDocument$1(iframe) {
	try {
		return iframe.contentDocument;
	} catch {}
}
function getIFrameContentWindow$1(iframe) {
	try {
		return iframe.contentWindow;
	} catch {}
}
var _id = 1;
var tagNameRegex = /* @__PURE__ */ new RegExp("[^a-z0-9-_:]");
var IGNORED_NODE = -2;
function genId() {
	return _id++;
}
function getValidTagName(element) {
	if (element instanceof HTMLFormElement) return "form";
	const processedTagName = toLowerCase(element.tagName);
	if (tagNameRegex.test(processedTagName)) return "div";
	return processedTagName;
}
function extractOrigin(url) {
	let origin = "";
	if (url.indexOf("//") > -1) origin = url.split("/").slice(0, 3).join("/");
	else origin = url.split("/")[0];
	origin = origin.split("?")[0];
	return origin;
}
var canvasService;
var canvasCtx;
var URL_IN_CSS_REF = /url\((?:(')([^']*)'|(")(.*?)"|([^)]*))\)/gm;
var URL_PROTOCOL_MATCH = /^(?:[a-z+]+:)?\/\//i;
var URL_WWW_MATCH = /^www\..*/i;
var DATA_URI = /^(data:)([^,]*),(.*)/i;
function filterCSSPropertiesFromInlineStyle(cssText, ignoredProperties) {
	if (!cssText || ignoredProperties.size === 0) return cssText;
	try {
		const properties = cssText.split(";");
		const filteredProperties = [];
		for (let property of properties) {
			property = property.trim();
			if (!property) continue;
			const colonIndex = property.indexOf(":");
			if (colonIndex === -1) {
				filteredProperties.push(property);
				continue;
			}
			const propertyName = property.slice(0, colonIndex).trim();
			if (!ignoredProperties.has(propertyName)) filteredProperties.push(property);
		}
		return filteredProperties.join("; ") + (filteredProperties.length > 0 && cssText.endsWith(";") ? ";" : "");
	} catch (error) {
		console.warn("Error filtering CSS properties:", error);
		return cssText;
	}
}
function absoluteToStylesheet(cssText, href) {
	return (cssText || "").replace(URL_IN_CSS_REF, (origin, quote1, path1, quote2, path2, path3) => {
		const filePath = path1 || path2 || path3;
		const maybeQuote = quote1 || quote2 || "";
		if (!filePath) return origin;
		if (URL_PROTOCOL_MATCH.test(filePath) || URL_WWW_MATCH.test(filePath)) return `url(${maybeQuote}${filePath}${maybeQuote})`;
		if (DATA_URI.test(filePath)) return `url(${maybeQuote}${filePath}${maybeQuote})`;
		if (filePath[0] === "/") return `url(${maybeQuote}${extractOrigin(href) + filePath}${maybeQuote})`;
		const stack = href.split("/");
		const parts = filePath.split("/");
		stack.pop();
		for (const part of parts) if (part === ".") continue;
		else if (part === "..") stack.pop();
		else stack.push(part);
		return `url(${maybeQuote}${stack.join("/")}${maybeQuote})`;
	});
}
var SRCSET_NOT_SPACES = /^[^ \t\n\r\u000c]+/;
var SRCSET_COMMAS_OR_SPACES = /^[, \t\n\r\u000c]+/;
function getAbsoluteSrcsetString(doc, attributeValue) {
	if (attributeValue.trim() === "") return attributeValue;
	let pos = 0;
	function collectCharacters(regEx) {
		let chars2;
		const match = regEx.exec(attributeValue.substring(pos));
		if (match) {
			chars2 = match[0];
			pos += chars2.length;
			return chars2;
		}
		return "";
	}
	const output = [];
	while (true) {
		collectCharacters(SRCSET_COMMAS_OR_SPACES);
		if (pos >= attributeValue.length) break;
		let url = collectCharacters(SRCSET_NOT_SPACES);
		if (url.slice(-1) === ",") {
			url = absoluteToDoc(doc, url.substring(0, url.length - 1));
			output.push(url);
		} else {
			let descriptorsStr = "";
			url = absoluteToDoc(doc, url);
			let inParens = false;
			while (true) {
				const c = attributeValue.charAt(pos);
				if (c === "") {
					output.push((url + descriptorsStr).trim());
					break;
				} else if (!inParens) {
					if (c === ",") {
						pos += 1;
						output.push((url + descriptorsStr).trim());
						break;
					} else if (c === "(") inParens = true;
				} else if (c === ")") inParens = false;
				descriptorsStr += c;
				pos += 1;
			}
		}
	}
	return output.join(", ");
}
var cachedDocument = /* @__PURE__ */ new WeakMap();
function absoluteToDoc(doc, attributeValue) {
	if (!attributeValue || attributeValue.trim() === "") return attributeValue;
	return getHref(doc, attributeValue);
}
function isSVGElement(el) {
	return Boolean(el.tagName === "svg" || el.ownerSVGElement);
}
function getHref(doc, customHref) {
	let a = cachedDocument.get(doc);
	if (!a) {
		a = doc.createElement("a");
		cachedDocument.set(doc, a);
	}
	if (!customHref) customHref = "";
	else if (customHref.startsWith("blob:") || customHref.startsWith("data:")) return customHref;
	a.setAttribute("href", customHref);
	return a.href;
}
function transformAttribute(doc, tagName, name, value, element, maskAttributeFn, ignoreCSSAttributes) {
	if (!value) return value;
	if (name === "src" || name === "href" && !(tagName === "use" && value[0] === "#")) return absoluteToDoc(doc, value);
	else if (name === "xlink:href" && value[0] !== "#") return absoluteToDoc(doc, value);
	else if (name === "background" && (tagName === "table" || tagName === "td" || tagName === "th")) return absoluteToDoc(doc, value);
	else if (name === "srcset") return getAbsoluteSrcsetString(doc, value);
	else if (name === "style") {
		let processedStyle = absoluteToStylesheet(value, getHref(doc));
		if (ignoreCSSAttributes && ignoreCSSAttributes.size > 0) processedStyle = filterCSSPropertiesFromInlineStyle(processedStyle, ignoreCSSAttributes);
		return processedStyle;
	} else if (tagName === "object" && name === "data") return absoluteToDoc(doc, value);
	if (typeof maskAttributeFn === "function") return maskAttributeFn(name, value, element);
	return value;
}
function ignoreAttribute(tagName, name, _value) {
	return (tagName === "video" || tagName === "audio") && name === "autoplay";
}
function _isBlockedElement(element, blockClass, blockSelector, unblockSelector) {
	try {
		if (unblockSelector && element.matches(unblockSelector)) return false;
		if (typeof blockClass === "string") {
			if (element.classList.contains(blockClass)) return true;
		} else for (let eIndex = element.classList.length; eIndex--;) {
			const className = element.classList[eIndex];
			if (blockClass.test(className)) return true;
		}
		if (blockSelector) return element.matches(blockSelector);
	} catch (e) {}
	return false;
}
function elementClassMatchesRegex$1(el, regex) {
	for (let eIndex = el.classList.length; eIndex--;) {
		const className = el.classList[eIndex];
		if (regex.test(className)) return true;
	}
	return false;
}
function distanceToMatch$1(node, matchPredicate, limit = Infinity, distance = 0) {
	if (!node) return -1;
	if (isShadowRoot$1(node)) return distanceToMatch$1(node.host, matchPredicate, limit, distance + 1);
	if (node.nodeType !== node.ELEMENT_NODE) return -1;
	if (distance > limit) return -1;
	if (matchPredicate(node)) return distance;
	return distanceToMatch$1(node.parentNode, matchPredicate, limit, distance + 1);
}
function createMatchPredicate$1(className, selector) {
	return (node) => {
		const el = node;
		if (el === null) return false;
		try {
			if (className) {
				if (typeof className === "string") {
					if (el.matches(`.${className}`)) return true;
				} else if (elementClassMatchesRegex$1(el, className)) return true;
			}
			if (selector && el.matches(selector)) return true;
			return false;
		} catch {
			return false;
		}
	};
}
function needMaskingText(node, maskTextClass, maskTextSelector, unmaskTextClass, unmaskTextSelector, maskAllText) {
	try {
		const el = node.nodeType === node.ELEMENT_NODE ? node : node.parentElement;
		if (el === null) return false;
		if (el.tagName === "INPUT") {
			const autocomplete = el.getAttribute("autocomplete");
			if ([
				"current-password",
				"new-password",
				"cc-number",
				"cc-exp",
				"cc-exp-month",
				"cc-exp-year",
				"cc-csc"
			].includes(autocomplete)) return true;
		}
		let maskDistance = -1;
		let unmaskDistance = -1;
		if (maskAllText) {
			unmaskDistance = distanceToMatch$1(el, createMatchPredicate$1(unmaskTextClass, unmaskTextSelector));
			if (unmaskDistance < 0) return true;
			maskDistance = distanceToMatch$1(el, createMatchPredicate$1(maskTextClass, maskTextSelector), unmaskDistance >= 0 ? unmaskDistance : Infinity);
		} else {
			maskDistance = distanceToMatch$1(el, createMatchPredicate$1(maskTextClass, maskTextSelector));
			if (maskDistance < 0) return false;
			unmaskDistance = distanceToMatch$1(el, createMatchPredicate$1(unmaskTextClass, unmaskTextSelector), maskDistance >= 0 ? maskDistance : Infinity);
		}
		return maskDistance >= 0 ? unmaskDistance >= 0 ? maskDistance <= unmaskDistance : true : unmaskDistance >= 0 ? false : !!maskAllText;
	} catch (e) {}
	return !!maskAllText;
}
function onceIframeLoaded(iframeEl, listener, iframeLoadTimeout) {
	const win = getIFrameContentWindow$1(iframeEl);
	if (!win) return;
	let fired = false;
	let readyState;
	try {
		readyState = win.document.readyState;
	} catch (error) {
		return;
	}
	if (readyState !== "complete") {
		const timer = setTimeout$1$1(() => {
			if (!fired) {
				listener();
				fired = true;
			}
		}, iframeLoadTimeout);
		iframeEl.addEventListener("load", () => {
			clearTimeout$1(timer);
			fired = true;
			listener();
		});
		return;
	}
	const blankUrl = "about:blank";
	if (win.location.href !== blankUrl || iframeEl.src === blankUrl || iframeEl.src === "") {
		setTimeout$1$1(listener, 0);
		return iframeEl.addEventListener("load", listener);
	}
	iframeEl.addEventListener("load", listener);
}
function onceStylesheetLoaded(link, listener, styleSheetLoadTimeout) {
	let fired = false;
	let styleSheetLoaded;
	try {
		styleSheetLoaded = link.sheet;
	} catch (error) {
		styleSheetLoaded = null;
	}
	if (styleSheetLoaded) return;
	const timer = setTimeout$1$1(() => {
		if (!fired) {
			listener();
			fired = true;
		}
	}, styleSheetLoadTimeout);
	link.addEventListener("load", () => {
		clearTimeout$1(timer);
		fired = true;
		listener();
	});
}
function serializeNode(n, options) {
	const { doc, mirror, blockClass, blockSelector, unblockSelector, maskAllText, maskAttributeFn, maskTextClass, unmaskTextClass, maskTextSelector, unmaskTextSelector, inlineStylesheet, maskInputOptions = {}, maskTextFn, maskInputFn, dataURLOptions = {}, inlineImages, recordCanvas, keepIframeSrcFn, newlyAddedElement = false, ignoreCSSAttributes } = options;
	const rootId = getRootId(doc, mirror);
	switch (n.nodeType) {
		case n.DOCUMENT_NODE: if (n.compatMode !== "CSS1Compat") return {
			type: NodeType$1.Document,
			childNodes: [],
			compatMode: n.compatMode
		};
		else return {
			type: NodeType$1.Document,
			childNodes: []
		};
		case n.DOCUMENT_TYPE_NODE: return {
			type: NodeType$1.DocumentType,
			name: n.name,
			publicId: n.publicId,
			systemId: n.systemId,
			rootId
		};
		case n.ELEMENT_NODE: return serializeElementNode(n, {
			doc,
			blockClass,
			blockSelector,
			unblockSelector,
			inlineStylesheet,
			maskAttributeFn,
			maskInputOptions,
			maskInputFn,
			dataURLOptions,
			inlineImages,
			recordCanvas,
			keepIframeSrcFn,
			newlyAddedElement,
			rootId,
			maskTextClass,
			unmaskTextClass,
			maskTextSelector,
			unmaskTextSelector,
			ignoreCSSAttributes
		});
		case n.TEXT_NODE: return serializeTextNode(n, {
			doc,
			maskAllText,
			maskTextClass,
			unmaskTextClass,
			maskTextSelector,
			unmaskTextSelector,
			maskTextFn,
			maskInputOptions,
			maskInputFn,
			rootId
		});
		case n.CDATA_SECTION_NODE: return {
			type: NodeType$1.CDATA,
			textContent: "",
			rootId
		};
		case n.COMMENT_NODE: return {
			type: NodeType$1.Comment,
			textContent: n.textContent || "",
			rootId
		};
		default: return false;
	}
}
function getRootId(doc, mirror) {
	if (!mirror.hasNode(doc)) return void 0;
	const docId = mirror.getId(doc);
	return docId === 1 ? void 0 : docId;
}
function serializeTextNode(n, options) {
	const { maskAllText, maskTextClass, unmaskTextClass, maskTextSelector, unmaskTextSelector, maskTextFn, maskInputOptions, maskInputFn, rootId } = options;
	const parentTagName = n.parentNode && n.parentNode.tagName;
	let textContent = n.textContent;
	const isStyle = parentTagName === "STYLE" ? true : void 0;
	const isScript = parentTagName === "SCRIPT" ? true : void 0;
	const isTextarea = parentTagName === "TEXTAREA" ? true : void 0;
	if (isStyle && textContent) {
		try {
			if (n.nextSibling || n.previousSibling) {} else if (n.parentNode.sheet?.cssRules) textContent = stringifyStylesheet(n.parentNode.sheet);
		} catch (err) {
			console.warn(`Cannot get CSS styles from text's parentNode. Error: ${err}`, n);
		}
		textContent = absoluteToStylesheet(textContent, getHref(options.doc));
	}
	if (isScript) textContent = "SCRIPT_PLACEHOLDER";
	const forceMask = needMaskingText(n, maskTextClass, maskTextSelector, unmaskTextClass, unmaskTextSelector, maskAllText);
	if (!isStyle && !isScript && !isTextarea && textContent && forceMask) textContent = maskTextFn ? maskTextFn(textContent, n.parentElement) : textContent.replace(/[\S]/g, "*");
	if (isTextarea && textContent && (maskInputOptions.textarea || forceMask)) textContent = maskInputFn ? maskInputFn(textContent, n.parentNode) : textContent.replace(/[\S]/g, "*");
	if (parentTagName === "OPTION" && textContent) textContent = maskInputValue({
		isMasked: needMaskingText(n, maskTextClass, maskTextSelector, unmaskTextClass, unmaskTextSelector, shouldMaskInput({
			type: null,
			tagName: parentTagName,
			maskInputOptions
		})),
		element: n,
		value: textContent,
		maskInputFn
	});
	return {
		type: NodeType$1.Text,
		textContent: textContent || "",
		isStyle,
		rootId
	};
}
function serializeElementNode(n, options) {
	const { doc, blockClass, blockSelector, unblockSelector, inlineStylesheet, maskInputOptions = {}, maskAttributeFn, maskInputFn, dataURLOptions = {}, inlineImages, recordCanvas, keepIframeSrcFn, newlyAddedElement = false, rootId, maskTextClass, unmaskTextClass, maskTextSelector, unmaskTextSelector, ignoreCSSAttributes } = options;
	const needBlock = _isBlockedElement(n, blockClass, blockSelector, unblockSelector);
	const tagName = getValidTagName(n);
	let attributes2 = {};
	const len = n.attributes.length;
	for (let i2 = 0; i2 < len; i2++) {
		const attr = n.attributes[i2];
		if (attr.name && !ignoreAttribute(tagName, attr.name, attr.value)) attributes2[attr.name] = transformAttribute(doc, tagName, toLowerCase(attr.name), attr.value, n, maskAttributeFn, ignoreCSSAttributes);
	}
	if (tagName === "link" && inlineStylesheet) {
		const stylesheet = Array.from(doc.styleSheets).find((s) => {
			return s.href === n.href;
		});
		let cssText = null;
		if (stylesheet) cssText = stringifyStylesheet(stylesheet);
		if (cssText) {
			attributes2.rel = null;
			attributes2.href = null;
			attributes2.crossorigin = null;
			attributes2._cssText = absoluteToStylesheet(cssText, stylesheet.href);
		}
	}
	if (tagName === "style" && n.sheet && !(n.innerText || n.textContent || "").trim().length) {
		const cssText = stringifyStylesheet(n.sheet);
		if (cssText) attributes2._cssText = absoluteToStylesheet(cssText, getHref(doc));
	}
	if (tagName === "input" || tagName === "textarea" || tagName === "select" || tagName === "option") {
		const el = n;
		const type = getInputType(el);
		const value = getInputValue(el, toUpperCase(tagName), type);
		const checked = el.checked;
		if (type !== "submit" && type !== "button" && value) {
			const forceMask = needMaskingText(el, maskTextClass, maskTextSelector, unmaskTextClass, unmaskTextSelector, shouldMaskInput({
				type,
				tagName: toUpperCase(tagName),
				maskInputOptions
			}));
			attributes2.value = maskInputValue({
				isMasked: forceMask,
				element: el,
				value,
				maskInputFn
			});
		}
		if (checked) attributes2.checked = checked;
	}
	if (tagName === "option") {
		if (n.selected && !maskInputOptions["select"]) attributes2.selected = true;
		else delete attributes2.selected;
	}
	if (tagName === "canvas" && recordCanvas) {
		if (n.__context === "2d") {
			if (!is2DCanvasBlank(n)) attributes2.rr_dataURL = n.toDataURL(dataURLOptions.type, dataURLOptions.quality);
		} else if (!("__context" in n)) {
			const canvasDataURL = n.toDataURL(dataURLOptions.type, dataURLOptions.quality);
			const blankCanvas = doc.createElement("canvas");
			blankCanvas.width = n.width;
			blankCanvas.height = n.height;
			if (canvasDataURL !== blankCanvas.toDataURL(dataURLOptions.type, dataURLOptions.quality)) attributes2.rr_dataURL = canvasDataURL;
		}
	}
	if (tagName === "img" && inlineImages) {
		if (!canvasService) {
			canvasService = doc.createElement("canvas");
			canvasCtx = canvasService.getContext("2d");
		}
		const image = n;
		const imageSrc = image.currentSrc || image.getAttribute("src") || "<unknown-src>";
		const priorCrossOrigin = image.crossOrigin;
		const recordInlineImage = () => {
			image.removeEventListener("load", recordInlineImage);
			try {
				canvasService.width = image.naturalWidth;
				canvasService.height = image.naturalHeight;
				canvasCtx.drawImage(image, 0, 0);
				attributes2.rr_dataURL = canvasService.toDataURL(dataURLOptions.type, dataURLOptions.quality);
			} catch (err) {
				if (image.crossOrigin !== "anonymous") {
					image.crossOrigin = "anonymous";
					if (image.complete && image.naturalWidth !== 0) recordInlineImage();
					else image.addEventListener("load", recordInlineImage);
					return;
				} else console.warn(`Cannot inline img src=${imageSrc}! Error: ${err}`);
			}
			if (image.crossOrigin === "anonymous") priorCrossOrigin ? attributes2.crossOrigin = priorCrossOrigin : image.removeAttribute("crossorigin");
		};
		if (image.complete && image.naturalWidth !== 0) recordInlineImage();
		else image.addEventListener("load", recordInlineImage);
	}
	if (tagName === "audio" || tagName === "video") {
		attributes2.rr_mediaState = n.paused ? "paused" : "played";
		attributes2.rr_mediaCurrentTime = n.currentTime;
	}
	if (!newlyAddedElement) {
		if (n.scrollLeft) attributes2.rr_scrollLeft = n.scrollLeft;
		if (n.scrollTop) attributes2.rr_scrollTop = n.scrollTop;
	}
	if (needBlock) {
		const { width, height } = n.getBoundingClientRect();
		attributes2 = {
			class: attributes2.class,
			rr_width: `${width}px`,
			rr_height: `${height}px`
		};
	}
	if (tagName === "iframe" && !keepIframeSrcFn(attributes2.src)) {
		if (!needBlock && !getIFrameContentDocument$1(n)) attributes2.rr_src = attributes2.src;
		delete attributes2.src;
	}
	let isCustomElement;
	try {
		if (customElements.get(tagName)) isCustomElement = true;
	} catch (e) {}
	return {
		type: NodeType$1.Element,
		tagName,
		attributes: attributes2,
		childNodes: [],
		isSVG: isSVGElement(n) || void 0,
		needBlock,
		rootId,
		isCustom: isCustomElement
	};
}
function lowerIfExists(maybeAttr) {
	if (maybeAttr === void 0 || maybeAttr === null) return "";
	else return maybeAttr.toLowerCase();
}
function slimDOMExcluded(sn, slimDOMOptions) {
	if (slimDOMOptions.comment && sn.type === NodeType$1.Comment) return true;
	else if (sn.type === NodeType$1.Element) {
		if (slimDOMOptions.script && (sn.tagName === "script" || sn.tagName === "link" && (sn.attributes.rel === "preload" || sn.attributes.rel === "modulepreload") || sn.tagName === "link" && sn.attributes.rel === "prefetch" && typeof sn.attributes.href === "string" && extractFileExtension(sn.attributes.href) === "js")) return true;
		else if (slimDOMOptions.headFavicon && (sn.tagName === "link" && sn.attributes.rel === "shortcut icon" || sn.tagName === "meta" && (lowerIfExists(sn.attributes.name).match(/^msapplication-tile(image|color)$/) || lowerIfExists(sn.attributes.name) === "application-name" || lowerIfExists(sn.attributes.rel) === "icon" || lowerIfExists(sn.attributes.rel) === "apple-touch-icon" || lowerIfExists(sn.attributes.rel) === "shortcut icon"))) return true;
		else if (sn.tagName === "meta") {
			if (slimDOMOptions.headMetaDescKeywords && lowerIfExists(sn.attributes.name).match(/^description|keywords$/)) return true;
			else if (slimDOMOptions.headMetaSocial && (lowerIfExists(sn.attributes.property).match(/^(og|twitter|fb):/) || lowerIfExists(sn.attributes.name).match(/^(og|twitter):/) || lowerIfExists(sn.attributes.name) === "pinterest")) return true;
			else if (slimDOMOptions.headMetaRobots && (lowerIfExists(sn.attributes.name) === "robots" || lowerIfExists(sn.attributes.name) === "googlebot" || lowerIfExists(sn.attributes.name) === "bingbot")) return true;
			else if (slimDOMOptions.headMetaHttpEquiv && sn.attributes["http-equiv"] !== void 0) return true;
			else if (slimDOMOptions.headMetaAuthorship && (lowerIfExists(sn.attributes.name) === "author" || lowerIfExists(sn.attributes.name) === "generator" || lowerIfExists(sn.attributes.name) === "framework" || lowerIfExists(sn.attributes.name) === "publisher" || lowerIfExists(sn.attributes.name) === "progid" || lowerIfExists(sn.attributes.property).match(/^article:/) || lowerIfExists(sn.attributes.property).match(/^product:/))) return true;
			else if (slimDOMOptions.headMetaVerification && (lowerIfExists(sn.attributes.name) === "google-site-verification" || lowerIfExists(sn.attributes.name) === "yandex-verification" || lowerIfExists(sn.attributes.name) === "csrf-token" || lowerIfExists(sn.attributes.name) === "p:domain_verify" || lowerIfExists(sn.attributes.name) === "verify-v1" || lowerIfExists(sn.attributes.name) === "verification" || lowerIfExists(sn.attributes.name) === "shopify-checkout-api-token")) return true;
		}
	}
	return false;
}
function serializeNodeWithId(n, options) {
	const { doc, mirror, blockClass, blockSelector, unblockSelector, maskAllText, maskTextClass, unmaskTextClass, maskTextSelector, unmaskTextSelector, skipChild = false, inlineStylesheet = true, maskInputOptions = {}, maskAttributeFn, maskTextFn, maskInputFn, slimDOMOptions, dataURLOptions = {}, inlineImages = false, recordCanvas = false, onSerialize, onIframeLoad, iframeLoadTimeout = 5e3, onBlockedImageLoad, onStylesheetLoad, stylesheetLoadTimeout = 5e3, keepIframeSrcFn = () => false, newlyAddedElement = false, ignoreCSSAttributes } = options;
	let { preserveWhiteSpace = true } = options;
	const _serializedNode = serializeNode(n, {
		doc,
		mirror,
		blockClass,
		blockSelector,
		maskAllText,
		unblockSelector,
		maskTextClass,
		unmaskTextClass,
		maskTextSelector,
		unmaskTextSelector,
		inlineStylesheet,
		maskInputOptions,
		maskAttributeFn,
		maskTextFn,
		maskInputFn,
		dataURLOptions,
		inlineImages,
		recordCanvas,
		keepIframeSrcFn,
		newlyAddedElement,
		ignoreCSSAttributes
	});
	if (!_serializedNode) {
		console.warn(n, "not serialized");
		return null;
	}
	let id;
	if (mirror.hasNode(n)) id = mirror.getId(n);
	else if (slimDOMExcluded(_serializedNode, slimDOMOptions) || !preserveWhiteSpace && _serializedNode.type === NodeType$1.Text && !_serializedNode.isStyle && !_serializedNode.textContent.trim().length) id = IGNORED_NODE;
	else id = genId();
	const serializedNode2 = Object.assign(_serializedNode, { id });
	mirror.add(n, serializedNode2);
	if (id === IGNORED_NODE) return null;
	if (onSerialize) onSerialize(n);
	let recordChild = !skipChild;
	if (serializedNode2.type === NodeType$1.Element) {
		recordChild = recordChild && !serializedNode2.needBlock;
		const shadowRoot = n.shadowRoot;
		if (shadowRoot && isNativeShadowDom(shadowRoot)) serializedNode2.isShadowHost = true;
	}
	if ((serializedNode2.type === NodeType$1.Document || serializedNode2.type === NodeType$1.Element) && recordChild) {
		if (slimDOMOptions.headWhitespace && serializedNode2.type === NodeType$1.Element && serializedNode2.tagName === "head") preserveWhiteSpace = false;
		const bypassOptions = {
			doc,
			mirror,
			blockClass,
			blockSelector,
			maskAllText,
			unblockSelector,
			maskTextClass,
			unmaskTextClass,
			maskTextSelector,
			unmaskTextSelector,
			skipChild,
			inlineStylesheet,
			maskInputOptions,
			maskAttributeFn,
			maskTextFn,
			maskInputFn,
			slimDOMOptions,
			dataURLOptions,
			inlineImages,
			recordCanvas,
			preserveWhiteSpace,
			onSerialize,
			onIframeLoad,
			iframeLoadTimeout,
			onBlockedImageLoad,
			onStylesheetLoad,
			stylesheetLoadTimeout,
			keepIframeSrcFn,
			ignoreCSSAttributes
		};
		const childNodes = n.childNodes ? Array.from(n.childNodes) : [];
		for (const childN of childNodes) {
			const serializedChildNode = serializeNodeWithId(childN, bypassOptions);
			if (serializedChildNode) serializedNode2.childNodes.push(serializedChildNode);
		}
		if (isElement$1(n) && n.shadowRoot) for (const childN of Array.from(n.shadowRoot.childNodes)) {
			const serializedChildNode = serializeNodeWithId(childN, bypassOptions);
			if (serializedChildNode) {
				isNativeShadowDom(n.shadowRoot) && (serializedChildNode.isShadow = true);
				serializedNode2.childNodes.push(serializedChildNode);
			}
		}
	}
	if (n.parentNode && isShadowRoot$1(n.parentNode) && isNativeShadowDom(n.parentNode)) serializedNode2.isShadow = true;
	if (serializedNode2.type === NodeType$1.Element && serializedNode2.tagName === "iframe" && !serializedNode2.needBlock) onceIframeLoaded(n, () => {
		const iframeDoc = getIFrameContentDocument$1(n);
		if (iframeDoc && onIframeLoad) {
			const serializedIframeNode = serializeNodeWithId(iframeDoc, {
				doc: iframeDoc,
				mirror,
				blockClass,
				blockSelector,
				unblockSelector,
				maskAllText,
				maskTextClass,
				unmaskTextClass,
				maskTextSelector,
				unmaskTextSelector,
				skipChild: false,
				inlineStylesheet,
				maskInputOptions,
				maskAttributeFn,
				maskTextFn,
				maskInputFn,
				slimDOMOptions,
				dataURLOptions,
				inlineImages,
				recordCanvas,
				preserveWhiteSpace,
				onSerialize,
				onIframeLoad,
				iframeLoadTimeout,
				onStylesheetLoad,
				stylesheetLoadTimeout,
				keepIframeSrcFn,
				ignoreCSSAttributes
			});
			if (serializedIframeNode) onIframeLoad(n, serializedIframeNode);
		}
	}, iframeLoadTimeout);
	if (serializedNode2.type === NodeType$1.Element && serializedNode2.tagName === "img" && !n.complete && serializedNode2.needBlock) {
		const image = n;
		const updateImageDimensions = () => {
			if (image.isConnected && !image.complete && onBlockedImageLoad) try {
				const rect = image.getBoundingClientRect();
				if (rect.width > 0 && rect.height > 0) onBlockedImageLoad(image, serializedNode2, rect);
			} catch (error) {}
			image.removeEventListener("load", updateImageDimensions);
		};
		if (image.isConnected) image.addEventListener("load", updateImageDimensions);
	}
	if (serializedNode2.type === NodeType$1.Element && serializedNode2.tagName === "link" && typeof serializedNode2.attributes.rel === "string" && (serializedNode2.attributes.rel === "stylesheet" || serializedNode2.attributes.rel === "preload" && typeof serializedNode2.attributes.href === "string" && extractFileExtension(serializedNode2.attributes.href) === "css")) onceStylesheetLoaded(n, () => {
		if (onStylesheetLoad) {
			const serializedLinkNode = serializeNodeWithId(n, {
				doc,
				mirror,
				blockClass,
				blockSelector,
				unblockSelector,
				maskAllText,
				maskTextClass,
				unmaskTextClass,
				maskTextSelector,
				unmaskTextSelector,
				skipChild: false,
				inlineStylesheet,
				maskInputOptions,
				maskAttributeFn,
				maskTextFn,
				maskInputFn,
				slimDOMOptions,
				dataURLOptions,
				inlineImages,
				recordCanvas,
				preserveWhiteSpace,
				onSerialize,
				onIframeLoad,
				iframeLoadTimeout,
				onStylesheetLoad,
				stylesheetLoadTimeout,
				keepIframeSrcFn,
				ignoreCSSAttributes
			});
			if (serializedLinkNode) onStylesheetLoad(n, serializedLinkNode);
		}
	}, stylesheetLoadTimeout);
	if (serializedNode2.type === NodeType$1.Element) delete serializedNode2.needBlock;
	return serializedNode2;
}
function snapshot(n, options) {
	const { mirror = new Mirror$1(), blockClass = "rr-block", blockSelector = null, unblockSelector = null, maskAllText = false, maskTextClass = "rr-mask", unmaskTextClass = null, maskTextSelector = null, unmaskTextSelector = null, inlineStylesheet = true, inlineImages = false, recordCanvas = false, maskAllInputs = false, maskAttributeFn, maskTextFn, maskInputFn, slimDOM = false, dataURLOptions, preserveWhiteSpace, onSerialize, onIframeLoad, iframeLoadTimeout, onBlockedImageLoad, onStylesheetLoad, stylesheetLoadTimeout, keepIframeSrcFn = () => false, ignoreCSSAttributes = /* @__PURE__ */ new Set([]) } = options || {};
	return serializeNodeWithId(n, {
		doc: n,
		mirror,
		blockClass,
		blockSelector,
		unblockSelector,
		maskAllText,
		maskTextClass,
		unmaskTextClass,
		maskTextSelector,
		unmaskTextSelector,
		skipChild: false,
		inlineStylesheet,
		maskInputOptions: maskAllInputs === true ? {
			color: true,
			date: true,
			"datetime-local": true,
			email: true,
			month: true,
			number: true,
			range: true,
			search: true,
			tel: true,
			text: true,
			time: true,
			url: true,
			week: true,
			hidden: true,
			textarea: true,
			select: true
		} : maskAllInputs === false ? {} : maskAllInputs,
		maskAttributeFn,
		maskTextFn,
		maskInputFn,
		slimDOMOptions: slimDOM === true || slimDOM === "all" ? {
			script: true,
			comment: true,
			headFavicon: true,
			headWhitespace: true,
			headMetaDescKeywords: slimDOM === "all",
			headMetaSocial: true,
			headMetaRobots: true,
			headMetaHttpEquiv: true,
			headMetaAuthorship: true,
			headMetaVerification: true
		} : slimDOM === false ? {} : slimDOM,
		dataURLOptions,
		inlineImages,
		recordCanvas,
		preserveWhiteSpace,
		onSerialize,
		onIframeLoad,
		iframeLoadTimeout,
		onBlockedImageLoad,
		onStylesheetLoad,
		stylesheetLoadTimeout,
		keepIframeSrcFn,
		newlyAddedElement: false,
		ignoreCSSAttributes
	});
}
function on(type, fn, target = document) {
	const options = {
		capture: true,
		passive: true
	};
	target.addEventListener(type, fn, options);
	return () => target.removeEventListener(type, fn, options);
}
var DEPARTED_MIRROR_ACCESS_WARNING$1 = "Please stop import mirror directly. Instead of that,\r\nnow you can use replayer.getMirror() to access the mirror instance of a replayer,\r\nor you can use record.mirror to access the mirror instance during recording.";
var _mirror$1 = {
	map: {},
	getId() {
		console.error(DEPARTED_MIRROR_ACCESS_WARNING$1);
		return -1;
	},
	getNode() {
		console.error(DEPARTED_MIRROR_ACCESS_WARNING$1);
		return null;
	},
	removeNodeFromMap() {
		console.error(DEPARTED_MIRROR_ACCESS_WARNING$1);
	},
	has() {
		console.error(DEPARTED_MIRROR_ACCESS_WARNING$1);
		return false;
	},
	reset() {
		console.error(DEPARTED_MIRROR_ACCESS_WARNING$1);
	}
};
if (typeof window !== "undefined" && window.Proxy && window.Reflect) _mirror$1 = new Proxy(_mirror$1, { get(target, prop, receiver) {
	if (prop === "map") console.error(DEPARTED_MIRROR_ACCESS_WARNING$1);
	return Reflect.get(target, prop, receiver);
} });
function throttle$1(func, wait, options = {}) {
	let timeout = null;
	let previous = 0;
	return function(...args) {
		const now = Date.now();
		if (!previous && options.leading === false) previous = now;
		const remaining = wait - (now - previous);
		const context = this;
		if (remaining <= 0 || remaining > wait) {
			if (timeout) {
				clearTimeout$2(timeout);
				timeout = null;
			}
			previous = now;
			func.apply(context, args);
		} else if (!timeout && options.trailing !== false) timeout = setTimeout$2(() => {
			previous = options.leading === false ? 0 : Date.now();
			timeout = null;
			func.apply(context, args);
		}, remaining);
	};
}
function hookSetter$1(target, key, d, isRevoked, win = window) {
	const original = win.Object.getOwnPropertyDescriptor(target, key);
	win.Object.defineProperty(target, key, isRevoked ? d : { set(value) {
		setTimeout$2(() => {
			d.set.call(this, value);
		}, 0);
		if (original && original.set) original.set.call(this, value);
	} });
	return () => hookSetter$1(target, key, original || {}, true);
}
function patch$1(source, name, replacement) {
	try {
		if (!(name in source)) return () => {};
		const original = source[name];
		const wrapped = replacement(original);
		if (typeof wrapped === "function") {
			wrapped.prototype = wrapped.prototype || {};
			Object.defineProperties(wrapped, { __rrweb_original__: {
				enumerable: false,
				value: original
			} });
		}
		source[name] = wrapped;
		return () => {
			source[name] = original;
		};
	} catch {
		return () => {};
	}
}
var nowTimestamp = Date.now;
if (!/* @__PURE__ */ /[1-9][0-9]{12}/.test(Date.now().toString())) nowTimestamp = () => (/* @__PURE__ */ new Date()).getTime();
function getWindowScroll(win) {
	const doc = win.document;
	return {
		left: doc.scrollingElement ? doc.scrollingElement.scrollLeft : win.pageXOffset !== void 0 ? win.pageXOffset : doc?.documentElement.scrollLeft || doc?.body?.parentElement?.scrollLeft || doc?.body?.scrollLeft || 0,
		top: doc.scrollingElement ? doc.scrollingElement.scrollTop : win.pageYOffset !== void 0 ? win.pageYOffset : doc?.documentElement.scrollTop || doc?.body?.parentElement?.scrollTop || doc?.body?.scrollTop || 0
	};
}
function getWindowHeight() {
	return window.innerHeight || document.documentElement && document.documentElement.clientHeight || document.body && document.body.clientHeight;
}
function getWindowWidth() {
	return window.innerWidth || document.documentElement && document.documentElement.clientWidth || document.body && document.body.clientWidth;
}
function closestElementOfNode$1(node) {
	if (!node) return null;
	try {
		return node.nodeType === node.ELEMENT_NODE ? node : node.parentElement;
	} catch (error) {
		return null;
	}
}
function isBlocked$1(node, blockClass, blockSelector, unblockSelector, checkAncestors) {
	if (!node) return false;
	const el = closestElementOfNode$1(node);
	if (!el) return false;
	const blockedPredicate = createMatchPredicate$1(blockClass, blockSelector);
	if (!checkAncestors) {
		const isUnblocked = unblockSelector && el.matches(unblockSelector);
		return blockedPredicate(el) && !isUnblocked;
	}
	const blockDistance = distanceToMatch$1(el, blockedPredicate);
	let unblockDistance = -1;
	if (blockDistance < 0) return false;
	if (unblockSelector) unblockDistance = distanceToMatch$1(el, createMatchPredicate$1(null, unblockSelector));
	if (blockDistance > -1 && unblockDistance < 0) return true;
	return blockDistance < unblockDistance;
}
function isSerialized(n, mirror) {
	return mirror.getId(n) !== -1;
}
function isIgnored(n, mirror) {
	return mirror.getId(n) === IGNORED_NODE;
}
function isAncestorRemoved(target, mirror) {
	if (isShadowRoot$1(target)) return false;
	const id = mirror.getId(target);
	if (!mirror.has(id)) return true;
	if (target.parentNode && target.parentNode.nodeType === target.DOCUMENT_NODE) return false;
	if (!target.parentNode) return true;
	return isAncestorRemoved(target.parentNode, mirror);
}
function legacy_isTouchEvent(event) {
	return Boolean(event.changedTouches);
}
function polyfill(win = window) {
	if ("NodeList" in win && !win.NodeList.prototype.forEach) win.NodeList.prototype.forEach = Array.prototype.forEach;
	if ("DOMTokenList" in win && !win.DOMTokenList.prototype.forEach) win.DOMTokenList.prototype.forEach = Array.prototype.forEach;
	if (!Node.prototype.contains) Node.prototype.contains = (...args) => {
		let node = args[0];
		if (!(0 in args)) throw new TypeError("1 argument is required");
		do
			if (this === node) return true;
		while (node = node && node.parentNode);
		return false;
	};
}
function isSerializedIframe(n, mirror) {
	return Boolean(n.nodeName === "IFRAME" && mirror.getMeta(n));
}
function isSerializedStylesheet(n, mirror) {
	return Boolean(n.nodeName === "LINK" && n.nodeType === n.ELEMENT_NODE && n.getAttribute && n.getAttribute("rel") === "stylesheet" && mirror.getMeta(n));
}
function hasShadowRoot(n) {
	return Boolean(n?.shadowRoot);
}
var StyleSheetMirror = class {
	constructor() {
		this.id = 1;
		this.styleIDMap = /* @__PURE__ */ new WeakMap();
		this.idStyleMap = /* @__PURE__ */ new Map();
	}
	getId(stylesheet) {
		return this.styleIDMap.get(stylesheet) ?? -1;
	}
	has(stylesheet) {
		return this.styleIDMap.has(stylesheet);
	}
	/**
	* @returns If the stylesheet is in the mirror, returns the id of the stylesheet. If not, return the new assigned id.
	*/
	add(stylesheet, id) {
		if (this.has(stylesheet)) return this.getId(stylesheet);
		let newId;
		if (id === void 0) newId = this.id++;
		else newId = id;
		this.styleIDMap.set(stylesheet, newId);
		this.idStyleMap.set(newId, stylesheet);
		return newId;
	}
	getStyle(id) {
		return this.idStyleMap.get(id) || null;
	}
	reset() {
		this.styleIDMap = /* @__PURE__ */ new WeakMap();
		this.idStyleMap = /* @__PURE__ */ new Map();
		this.id = 1;
	}
	generateId() {
		return this.id++;
	}
};
function getShadowHost(n) {
	let shadowHost = null;
	if (n.getRootNode?.()?.nodeType === Node.DOCUMENT_FRAGMENT_NODE && n.getRootNode().host) shadowHost = n.getRootNode().host;
	return shadowHost;
}
function getRootShadowHost(n) {
	let rootShadowHost = n;
	let shadowHost;
	while (shadowHost = getShadowHost(rootShadowHost)) rootShadowHost = shadowHost;
	return rootShadowHost;
}
function shadowHostInDom(n) {
	const doc = n.ownerDocument;
	if (!doc) return false;
	const shadowHost = getRootShadowHost(n);
	return doc.contains(shadowHost);
}
function inDom(n) {
	const doc = n.ownerDocument;
	if (!doc) return false;
	return doc.contains(n) || shadowHostInDom(n);
}
var cachedImplementations$2 = {};
function getImplementation$2(name) {
	const cached = cachedImplementations$2[name];
	if (cached) return cached;
	const windowImpl = window[name].bind(window);
	let impl = windowImpl;
	const document2 = window.document;
	if (document2 && typeof document2.createElement === "function") try {
		const sandbox = document2.createElement("iframe");
		sandbox.hidden = true;
		document2.head.appendChild(sandbox);
		const contentWindow = sandbox.contentWindow;
		if (contentWindow && contentWindow[name]) {
			const sandboxImpl = contentWindow[name].bind(window);
			impl = (...args) => {
				try {
					return sandboxImpl(...args);
				} catch {
					cachedImplementations$2[name] = windowImpl;
					return windowImpl(...args);
				}
			};
		}
		document2.head.removeChild(sandbox);
	} catch (e) {}
	return cachedImplementations$2[name] = impl;
}
function onRequestAnimationFrame$1(...rest) {
	return getImplementation$2("requestAnimationFrame")(...rest);
}
function setTimeout$2(...rest) {
	return getImplementation$2("setTimeout")(...rest);
}
function clearTimeout$2(...rest) {
	return getImplementation$2("clearTimeout")(...rest);
}
var EventType = /* @__PURE__ */ ((EventType2) => {
	EventType2[EventType2["DomContentLoaded"] = 0] = "DomContentLoaded";
	EventType2[EventType2["Load"] = 1] = "Load";
	EventType2[EventType2["FullSnapshot"] = 2] = "FullSnapshot";
	EventType2[EventType2["IncrementalSnapshot"] = 3] = "IncrementalSnapshot";
	EventType2[EventType2["Meta"] = 4] = "Meta";
	EventType2[EventType2["Custom"] = 5] = "Custom";
	EventType2[EventType2["Plugin"] = 6] = "Plugin";
	return EventType2;
})(EventType || {});
var IncrementalSource = /* @__PURE__ */ ((IncrementalSource2) => {
	IncrementalSource2[IncrementalSource2["Mutation"] = 0] = "Mutation";
	IncrementalSource2[IncrementalSource2["MouseMove"] = 1] = "MouseMove";
	IncrementalSource2[IncrementalSource2["MouseInteraction"] = 2] = "MouseInteraction";
	IncrementalSource2[IncrementalSource2["Scroll"] = 3] = "Scroll";
	IncrementalSource2[IncrementalSource2["ViewportResize"] = 4] = "ViewportResize";
	IncrementalSource2[IncrementalSource2["Input"] = 5] = "Input";
	IncrementalSource2[IncrementalSource2["TouchMove"] = 6] = "TouchMove";
	IncrementalSource2[IncrementalSource2["MediaInteraction"] = 7] = "MediaInteraction";
	IncrementalSource2[IncrementalSource2["StyleSheetRule"] = 8] = "StyleSheetRule";
	IncrementalSource2[IncrementalSource2["CanvasMutation"] = 9] = "CanvasMutation";
	IncrementalSource2[IncrementalSource2["Font"] = 10] = "Font";
	IncrementalSource2[IncrementalSource2["Log"] = 11] = "Log";
	IncrementalSource2[IncrementalSource2["Drag"] = 12] = "Drag";
	IncrementalSource2[IncrementalSource2["StyleDeclaration"] = 13] = "StyleDeclaration";
	IncrementalSource2[IncrementalSource2["Selection"] = 14] = "Selection";
	IncrementalSource2[IncrementalSource2["AdoptedStyleSheet"] = 15] = "AdoptedStyleSheet";
	IncrementalSource2[IncrementalSource2["CustomElement"] = 16] = "CustomElement";
	return IncrementalSource2;
})(IncrementalSource || {});
var MouseInteractions = /* @__PURE__ */ ((MouseInteractions2) => {
	MouseInteractions2[MouseInteractions2["MouseUp"] = 0] = "MouseUp";
	MouseInteractions2[MouseInteractions2["MouseDown"] = 1] = "MouseDown";
	MouseInteractions2[MouseInteractions2["Click"] = 2] = "Click";
	MouseInteractions2[MouseInteractions2["ContextMenu"] = 3] = "ContextMenu";
	MouseInteractions2[MouseInteractions2["DblClick"] = 4] = "DblClick";
	MouseInteractions2[MouseInteractions2["Focus"] = 5] = "Focus";
	MouseInteractions2[MouseInteractions2["Blur"] = 6] = "Blur";
	MouseInteractions2[MouseInteractions2["TouchStart"] = 7] = "TouchStart";
	MouseInteractions2[MouseInteractions2["TouchMove_Departed"] = 8] = "TouchMove_Departed";
	MouseInteractions2[MouseInteractions2["TouchEnd"] = 9] = "TouchEnd";
	MouseInteractions2[MouseInteractions2["TouchCancel"] = 10] = "TouchCancel";
	return MouseInteractions2;
})(MouseInteractions || {});
var PointerTypes = /* @__PURE__ */ ((PointerTypes2) => {
	PointerTypes2[PointerTypes2["Mouse"] = 0] = "Mouse";
	PointerTypes2[PointerTypes2["Pen"] = 1] = "Pen";
	PointerTypes2[PointerTypes2["Touch"] = 2] = "Touch";
	return PointerTypes2;
})(PointerTypes || {});
var MediaInteractions = /* @__PURE__ */ ((MediaInteractions2) => {
	MediaInteractions2[MediaInteractions2["Play"] = 0] = "Play";
	MediaInteractions2[MediaInteractions2["Pause"] = 1] = "Pause";
	MediaInteractions2[MediaInteractions2["Seeked"] = 2] = "Seeked";
	MediaInteractions2[MediaInteractions2["VolumeChange"] = 3] = "VolumeChange";
	MediaInteractions2[MediaInteractions2["RateChange"] = 4] = "RateChange";
	return MediaInteractions2;
})(MediaInteractions || {});
var errorHandler$1;
function registerErrorHandler$1(handler) {
	errorHandler$1 = handler;
}
function unregisterErrorHandler() {
	errorHandler$1 = void 0;
}
var callbackWrapper$1 = (cb) => {
	if (!errorHandler$1) return cb;
	const rrwebWrapped = ((...rest) => {
		try {
			return cb(...rest);
		} catch (error) {
			if (errorHandler$1 && errorHandler$1(error) === true) return () => {};
			throw error;
		}
	});
	return rrwebWrapped;
};
var chars$1 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var lookup$1 = typeof Uint8Array === "undefined" ? [] : /* @__PURE__ */ new Uint8Array(256);
for (var i$1 = 0; i$1 < chars$1.length; i$1++) lookup$1[chars$1.charCodeAt(i$1)] = i$1;
var CanvasManagerNoop = class {
	reset() {}
	freeze() {}
	unfreeze() {}
	lock() {}
	unlock() {}
	snapshot() {}
	addWindow() {}
	addShadowRoot() {}
	resetShadowRoots() {}
};
function getIFrameContentDocument(iframe) {
	try {
		return iframe.contentDocument;
	} catch (e2) {}
}
function getIFrameContentWindow(iframe) {
	try {
		return iframe.contentWindow;
	} catch (e2) {}
}
var StyleDeclarationParser = class {
	constructor(doc) {
		this.doc = doc;
		this.unattachedDoc = null;
	}
	parse(styleText) {
		return this.parseWithConstructableStylesheet(styleText) || this.parseWithDetachedElement(styleText);
	}
	parseWithConstructableStylesheet(styleText) {
		if (typeof CSSStyleSheet === "undefined" || typeof CSSStyleSheet.prototype.replaceSync !== "function") return null;
		try {
			const sheet = new CSSStyleSheet();
			sheet.replaceSync(`x { ${styleText} }`);
			const rule = sheet.cssRules[0];
			if (!rule || rule.type !== CSSRule.STYLE_RULE) return null;
			return rule.style;
		} catch {
			return null;
		}
	}
	parseWithDetachedElement(styleText) {
		const old = this.getUnattachedDoc().createElement("span");
		old.setAttribute("style", styleText);
		return old.style;
	}
	getUnattachedDoc() {
		if (!this.unattachedDoc) try {
			this.unattachedDoc = document.implementation.createHTMLDocument();
		} catch {
			this.unattachedDoc = this.doc;
		}
		return this.unattachedDoc;
	}
};
function isNodeInLinkedList(n2) {
	return "__ln" in n2;
}
var DoubleLinkedList = class {
	constructor() {
		this.length = 0;
		this.head = null;
		this.tail = null;
	}
	get(position) {
		if (position >= this.length) throw new Error("Position outside of list range");
		let current = this.head;
		for (let index = 0; index < position; index++) current = current?.next || null;
		return current;
	}
	addNode(n2) {
		const node = {
			value: n2,
			previous: null,
			next: null
		};
		n2.__ln = node;
		if (n2.previousSibling && isNodeInLinkedList(n2.previousSibling)) {
			const current = n2.previousSibling.__ln.next;
			node.next = current;
			node.previous = n2.previousSibling.__ln;
			n2.previousSibling.__ln.next = node;
			if (current) current.previous = node;
		} else if (n2.nextSibling && isNodeInLinkedList(n2.nextSibling) && n2.nextSibling.__ln.previous) {
			const current = n2.nextSibling.__ln.previous;
			node.previous = current;
			node.next = n2.nextSibling.__ln;
			n2.nextSibling.__ln.previous = node;
			if (current) current.next = node;
		} else {
			if (this.head) this.head.previous = node;
			node.next = this.head;
			this.head = node;
		}
		if (node.next === null) this.tail = node;
		this.length++;
	}
	removeNode(n2) {
		const current = n2.__ln;
		if (!this.head) return;
		if (!current.previous) {
			this.head = current.next;
			if (this.head) this.head.previous = null;
			else this.tail = null;
		} else {
			current.previous.next = current.next;
			if (current.next) current.next.previous = current.previous;
			else this.tail = current.previous;
		}
		if (n2.__ln) delete n2.__ln;
		this.length--;
	}
};
var moveKey = (id, parentId) => `${id}@${parentId}`;
var MutationBuffer = class {
	constructor() {
		this.frozen = false;
		this.locked = false;
		this.texts = [];
		this.attributes = [];
		this.attributeMap = /* @__PURE__ */ new WeakMap();
		this.removes = [];
		this.mapRemoves = [];
		this.movedMap = {};
		this.addedSet = /* @__PURE__ */ new Set();
		this.movedSet = /* @__PURE__ */ new Set();
		this.droppedSet = /* @__PURE__ */ new Set();
		this.processMutations = (mutations) => {
			mutations.forEach(this.processMutation);
			this.emit();
		};
		this.emit = () => {
			if (this.frozen || this.locked) return;
			const adds = [];
			const addedIds = /* @__PURE__ */ new Set();
			const addList = new DoubleLinkedList();
			const getNextId = (n2) => {
				let ns = n2;
				let nextId = IGNORED_NODE;
				while (nextId === IGNORED_NODE) {
					ns = ns && ns.nextSibling;
					nextId = ns && this.mirror.getId(ns);
				}
				return nextId;
			};
			const pushAdd = (n2) => {
				if (!n2.parentNode || !inDom(n2)) return;
				const parentId = isShadowRoot$1(n2.parentNode) ? this.mirror.getId(getShadowHost(n2)) : this.mirror.getId(n2.parentNode);
				const nextId = getNextId(n2);
				if (parentId === -1 || nextId === -1) return addList.addNode(n2);
				const sn = serializeNodeWithId(n2, {
					doc: this.doc,
					mirror: this.mirror,
					blockClass: this.blockClass,
					blockSelector: this.blockSelector,
					maskAllText: this.maskAllText,
					unblockSelector: this.unblockSelector,
					maskTextClass: this.maskTextClass,
					unmaskTextClass: this.unmaskTextClass,
					maskTextSelector: this.maskTextSelector,
					unmaskTextSelector: this.unmaskTextSelector,
					skipChild: true,
					newlyAddedElement: true,
					inlineStylesheet: this.inlineStylesheet,
					maskInputOptions: this.maskInputOptions,
					maskAttributeFn: this.maskAttributeFn,
					maskTextFn: this.maskTextFn,
					maskInputFn: this.maskInputFn,
					slimDOMOptions: this.slimDOMOptions,
					dataURLOptions: this.dataURLOptions,
					recordCanvas: this.recordCanvas,
					inlineImages: this.inlineImages,
					onSerialize: (currentN) => {
						if (isSerializedIframe(currentN, this.mirror) && !isBlocked$1(currentN, this.blockClass, this.blockSelector, this.unblockSelector, false)) this.iframeManager.addIframe(currentN);
						if (isSerializedStylesheet(currentN, this.mirror)) this.stylesheetManager.trackLinkElement(currentN);
						if (hasShadowRoot(n2)) this.shadowDomManager.addShadowRoot(n2.shadowRoot, this.doc);
					},
					onIframeLoad: (iframe, childSn) => {
						if (isBlocked$1(iframe, this.blockClass, this.blockSelector, this.unblockSelector, false)) return;
						this.iframeManager.attachIframe(iframe, childSn);
						const contentWindow = getIFrameContentWindow(iframe);
						if (contentWindow) this.canvasManager.addWindow(contentWindow);
						this.shadowDomManager.observeAttachShadow(iframe);
					},
					onStylesheetLoad: (link, childSn) => {
						this.stylesheetManager.attachLinkElement(link, childSn);
					},
					onBlockedImageLoad: (_imageEl, serializedNode, { width, height }) => {
						this.mutationCb({
							adds: [],
							removes: [],
							texts: [],
							attributes: [{
								id: serializedNode.id,
								attributes: { style: {
									width: `${width}px`,
									height: `${height}px`
								} }
							}]
						});
					},
					ignoreCSSAttributes: this.ignoreCSSAttributes
				});
				if (sn) {
					adds.push({
						parentId,
						nextId,
						node: sn
					});
					addedIds.add(sn.id);
				}
			};
			while (this.mapRemoves.length) {
				const removedNode = this.mapRemoves.shift();
				this.mirror.removeNodeFromMap(removedNode);
				this.shadowDomManager.removeShadowRootsFor(removedNode);
			}
			for (const n2 of this.movedSet) {
				if (isParentRemoved(this.removes, n2, this.mirror) && !this.movedSet.has(n2.parentNode)) continue;
				pushAdd(n2);
			}
			for (const n2 of this.addedSet) if (!isAncestorInSet(this.droppedSet, n2) && !isParentRemoved(this.removes, n2, this.mirror)) pushAdd(n2);
			else if (isAncestorInSet(this.movedSet, n2)) pushAdd(n2);
			else this.droppedSet.add(n2);
			let candidate = null;
			while (addList.length) {
				let node = null;
				if (candidate) {
					const parentId = this.mirror.getId(candidate.value.parentNode);
					const nextId = getNextId(candidate.value);
					if (parentId !== -1 && nextId !== -1) node = candidate;
				}
				if (!node) {
					let tailNode = addList.tail;
					while (tailNode) {
						const _node = tailNode;
						tailNode = tailNode.previous;
						if (_node) {
							const parentId = this.mirror.getId(_node.value.parentNode);
							if (getNextId(_node.value) === -1) continue;
							else if (parentId !== -1) {
								node = _node;
								break;
							} else {
								const unhandledNode = _node.value;
								if (unhandledNode.parentNode && unhandledNode.parentNode.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
									const shadowHost = unhandledNode.parentNode.host;
									if (this.mirror.getId(shadowHost) !== -1) {
										node = _node;
										break;
									}
								}
							}
						}
					}
				}
				if (!node) {
					while (addList.head) addList.removeNode(addList.head.value);
					break;
				}
				candidate = node.previous;
				addList.removeNode(node.value);
				pushAdd(node.value);
			}
			const payload = {
				texts: this.texts.map((text) => ({
					id: this.mirror.getId(text.node),
					value: text.value
				})).filter((text) => !addedIds.has(text.id)).filter((text) => this.mirror.has(text.id)),
				attributes: this.attributes.map((attribute) => {
					const { attributes } = attribute;
					if (typeof attributes.style === "string") {
						const diffAsStr = JSON.stringify(attribute.styleDiff);
						const unchangedAsStr = JSON.stringify(attribute._unchangedStyles);
						if (diffAsStr.length < attributes.style.length) {
							if ((diffAsStr + unchangedAsStr).split("var(").length === attributes.style.split("var(").length) attributes.style = attribute.styleDiff;
						}
					}
					return {
						id: this.mirror.getId(attribute.node),
						attributes
					};
				}).filter((attribute) => !addedIds.has(attribute.id)).filter((attribute) => this.mirror.has(attribute.id)),
				removes: this.removes,
				adds
			};
			if (!payload.texts.length && !payload.attributes.length && !payload.removes.length && !payload.adds.length) return;
			this.texts = [];
			this.attributes = [];
			this.attributeMap = /* @__PURE__ */ new WeakMap();
			this.removes = [];
			this.addedSet = /* @__PURE__ */ new Set();
			this.movedSet = /* @__PURE__ */ new Set();
			this.droppedSet = /* @__PURE__ */ new Set();
			this.movedMap = {};
			this.mutationCb(payload);
		};
		this.processMutation = (m) => {
			if (isIgnored(m.target, this.mirror)) return;
			switch (m.type) {
				case "characterData": {
					const value = m.target.textContent;
					if (!isBlocked$1(m.target, this.blockClass, this.blockSelector, this.unblockSelector, false) && value !== m.oldValue) this.texts.push({
						value: needMaskingText(m.target, this.maskTextClass, this.maskTextSelector, this.unmaskTextClass, this.unmaskTextSelector, this.maskAllText) && value ? this.maskTextFn ? this.maskTextFn(value, closestElementOfNode$1(m.target)) : value.replace(/[\S]/g, "*") : value,
						node: m.target
					});
					break;
				}
				case "attributes": {
					const target = m.target;
					let attributeName = m.attributeName;
					let value = m.target.getAttribute(attributeName);
					if (attributeName === "value") {
						const type = getInputType(target);
						const tagName = target.tagName;
						value = getInputValue(target, tagName, type);
						const isInputMasked = shouldMaskInput({
							maskInputOptions: this.maskInputOptions,
							tagName,
							type
						});
						value = maskInputValue({
							isMasked: needMaskingText(m.target, this.maskTextClass, this.maskTextSelector, this.unmaskTextClass, this.unmaskTextSelector, isInputMasked),
							element: target,
							value,
							maskInputFn: this.maskInputFn
						});
					}
					if (isBlocked$1(m.target, this.blockClass, this.blockSelector, this.unblockSelector, false) || value === m.oldValue) return;
					let item = this.attributeMap.get(m.target);
					if (target.tagName === "IFRAME" && attributeName === "src" && !this.keepIframeSrcFn(value)) {
						if (!getIFrameContentDocument(target)) attributeName = "rr_src";
						else return;
					}
					if (!item) {
						item = {
							node: m.target,
							attributes: {},
							styleDiff: {},
							_unchangedStyles: {}
						};
						this.attributes.push(item);
						this.attributeMap.set(m.target, item);
					}
					if (attributeName === "type" && target.tagName === "INPUT" && (m.oldValue || "").toLowerCase() === "password") target.setAttribute("data-rr-is-password", "true");
					if (!ignoreAttribute(target.tagName, attributeName)) {
						item.attributes[attributeName] = transformAttribute(this.doc, toLowerCase(target.tagName), toLowerCase(attributeName), value, target, this.maskAttributeFn);
						if (attributeName === "style") {
							const oldStyle = m.oldValue ? this.styleDeclarationParser.parse(m.oldValue) : null;
							for (const pname of Array.from(target.style)) {
								const newValue = target.style.getPropertyValue(pname);
								const newPriority = target.style.getPropertyPriority(pname);
								if (newValue !== (oldStyle?.getPropertyValue(pname) || "") || newPriority !== (oldStyle?.getPropertyPriority(pname) || "")) {
									if (newPriority === "") item.styleDiff[pname] = newValue;
									else item.styleDiff[pname] = [newValue, newPriority];
								} else item._unchangedStyles[pname] = [newValue, newPriority];
							}
							if (oldStyle) {
								for (const pname of Array.from(oldStyle)) if (target.style.getPropertyValue(pname) === "") item.styleDiff[pname] = false;
							}
						}
					}
					break;
				}
				case "childList":
					if (isBlocked$1(m.target, this.blockClass, this.blockSelector, this.unblockSelector, true)) return;
					m.addedNodes.forEach((n2) => this.genAdds(n2, m.target));
					m.removedNodes.forEach((n2) => {
						const nodeId = this.mirror.getId(n2);
						const parentId = isShadowRoot$1(m.target) ? this.mirror.getId(m.target.host) : this.mirror.getId(m.target);
						if (isBlocked$1(m.target, this.blockClass, this.blockSelector, this.unblockSelector, false) || isIgnored(n2, this.mirror) || !isSerialized(n2, this.mirror)) return;
						if (this.addedSet.has(n2)) {
							deepDelete(this.addedSet, n2);
							this.droppedSet.add(n2);
						} else if (this.addedSet.has(m.target) && nodeId === -1);
						else if (isAncestorRemoved(m.target, this.mirror));
						else if (this.movedSet.has(n2) && this.movedMap[moveKey(nodeId, parentId)]) deepDelete(this.movedSet, n2);
						else this.removes.push({
							parentId,
							id: nodeId,
							isShadow: isShadowRoot$1(m.target) && isNativeShadowDom(m.target) ? true : void 0
						});
						this.mapRemoves.push(n2);
					});
			}
		};
		this.genAdds = (n2, target) => {
			if (this.processedNodeManager.inOtherBuffer(n2, this)) return;
			if (this.addedSet.has(n2) || this.movedSet.has(n2)) return;
			if (this.mirror.hasNode(n2)) {
				if (isIgnored(n2, this.mirror)) return;
				this.movedSet.add(n2);
				let targetId = null;
				if (target && this.mirror.hasNode(target)) targetId = this.mirror.getId(target);
				if (targetId && targetId !== -1) this.movedMap[moveKey(this.mirror.getId(n2), targetId)] = true;
			} else {
				this.addedSet.add(n2);
				this.droppedSet.delete(n2);
			}
			if (!isBlocked$1(n2, this.blockClass, this.blockSelector, this.unblockSelector, false)) {
				if (n2.childNodes) n2.childNodes.forEach((childN) => this.genAdds(childN));
				if (hasShadowRoot(n2)) n2.shadowRoot.childNodes.forEach((childN) => {
					this.processedNodeManager.add(childN, this);
					this.genAdds(childN, n2);
				});
			}
		};
	}
	init(options) {
		[
			"mutationCb",
			"blockClass",
			"blockSelector",
			"unblockSelector",
			"maskAllText",
			"maskTextClass",
			"unmaskTextClass",
			"maskTextSelector",
			"unmaskTextSelector",
			"inlineStylesheet",
			"maskInputOptions",
			"maskAttributeFn",
			"maskTextFn",
			"maskInputFn",
			"keepIframeSrcFn",
			"recordCanvas",
			"inlineImages",
			"slimDOMOptions",
			"dataURLOptions",
			"doc",
			"mirror",
			"iframeManager",
			"stylesheetManager",
			"shadowDomManager",
			"canvasManager",
			"processedNodeManager",
			"ignoreCSSAttributes"
		].forEach((key) => {
			this[key] = options[key];
		});
		this.styleDeclarationParser = new StyleDeclarationParser(this.doc);
	}
	freeze() {
		this.frozen = true;
		this.canvasManager.freeze();
	}
	unfreeze() {
		this.frozen = false;
		this.canvasManager.unfreeze();
		this.emit();
	}
	isFrozen() {
		return this.frozen;
	}
	lock() {
		this.locked = true;
		this.canvasManager.lock();
	}
	unlock() {
		this.locked = false;
		this.canvasManager.unlock();
		this.emit();
	}
	reset() {
		this.shadowDomManager.reset();
		this.canvasManager.reset();
	}
	/**
	* Drops mirror entries for removals this buffer has not emitted yet,
	* without emitting anything. Used when the buffer's root is torn down.
	*/
	release(pending) {
		pending.forEach((m) => {
			if (m.type === "childList") m.removedNodes.forEach((n2) => this.mapRemoves.push(n2));
		});
		while (this.mapRemoves.length) {
			const removedNode = this.mapRemoves.shift();
			if (inDom(removedNode)) continue;
			this.mirror.removeNodeFromMap(removedNode);
			this.shadowDomManager.removeShadowRootsFor(removedNode);
		}
	}
};
function deepDelete(addsSet, n2) {
	addsSet.delete(n2);
	n2.childNodes?.forEach((childN) => deepDelete(addsSet, childN));
}
function isParentRemoved(removes, n2, mirror2) {
	if (removes.length === 0) return false;
	return _isParentRemoved(removes, n2, mirror2);
}
function _isParentRemoved(removes, n2, mirror2) {
	let node = n2.parentNode;
	while (node) {
		const parentId = mirror2.getId(node);
		if (removes.some((r2) => r2.id === parentId)) return true;
		node = node.parentNode;
	}
	return false;
}
function isAncestorInSet(set, n2) {
	if (set.size === 0) return false;
	return _isAncestorInSet(set, n2);
}
function _isAncestorInSet(set, n2) {
	const { parentNode } = n2;
	if (!parentNode) return false;
	if (set.has(parentNode)) return true;
	return _isAncestorInSet(set, parentNode);
}
var mutationBuffers = [];
function forEachMutationBuffer(cb) {
	[...mutationBuffers].forEach(cb);
}
var observerBuffers = /* @__PURE__ */ new WeakMap();
function getEventTarget(event) {
	try {
		if ("composedPath" in event) {
			const path = event.composedPath();
			if (path.length) return path[0];
		} else if ("path" in event && event.path.length) return event.path[0];
	} catch {}
	return event && event.target;
}
function initMutationObserver(options, rootEl) {
	const mutationBuffer = new MutationBuffer();
	mutationBuffers.push(mutationBuffer);
	mutationBuffer.init(options);
	let mutationObserverCtor = window.MutationObserver || window.__rrMutationObserver;
	const angularZoneSymbol = window?.Zone?.__symbol__?.("MutationObserver");
	if (angularZoneSymbol && window[angularZoneSymbol]) mutationObserverCtor = window[angularZoneSymbol];
	const { onMutation, blockClass, blockSelector, unblockSelector } = options;
	const onMutationHelpers = { isBlocked: (node) => isBlocked$1(node, blockClass, blockSelector, unblockSelector, true) };
	const observer = new mutationObserverCtor(callbackWrapper$1((mutations) => {
		let toProcess = mutations;
		if (onMutation) {
			const result = onMutation(mutations, onMutationHelpers);
			if (result === false) return;
			if (Array.isArray(result)) toProcess = result;
		}
		mutationBuffer.processMutations(toProcess);
	}));
	observer.observe(rootEl, {
		attributes: true,
		attributeOldValue: true,
		characterData: true,
		characterDataOldValue: true,
		childList: true,
		subtree: true
	});
	observerBuffers.set(observer, mutationBuffer);
	return observer;
}
function removeMutationBuffer(observer) {
	const pending = observer.takeRecords();
	observer.disconnect();
	const buffer = observerBuffers.get(observer);
	if (buffer) {
		buffer.release(pending);
		const index = mutationBuffers.indexOf(buffer);
		if (index !== -1) mutationBuffers.splice(index, 1);
		observerBuffers.delete(observer);
	}
}
function initMoveObserver({ mousemoveCb, sampling, doc, mirror: mirror2 }) {
	if (sampling.mousemove === false) return () => {};
	const threshold = typeof sampling.mousemove === "number" ? sampling.mousemove : 50;
	const callbackThreshold = typeof sampling.mousemoveCallback === "number" ? sampling.mousemoveCallback : 500;
	let positions = [];
	let timeBaseline;
	const wrappedCb = throttle$1(callbackWrapper$1((source) => {
		const totalOffset = Date.now() - timeBaseline;
		mousemoveCb(positions.map((p) => {
			p.timeOffset -= totalOffset;
			return p;
		}), source);
		positions = [];
		timeBaseline = null;
	}), callbackThreshold);
	const updatePosition = callbackWrapper$1(throttle$1(callbackWrapper$1((evt) => {
		const target = getEventTarget(evt);
		const { clientX, clientY } = legacy_isTouchEvent(evt) ? evt.changedTouches[0] : evt;
		if (!timeBaseline) timeBaseline = nowTimestamp();
		positions.push({
			x: clientX,
			y: clientY,
			id: mirror2.getId(target),
			timeOffset: nowTimestamp() - timeBaseline
		});
		wrappedCb(typeof DragEvent !== "undefined" && evt instanceof DragEvent ? IncrementalSource.Drag : evt instanceof MouseEvent ? IncrementalSource.MouseMove : IncrementalSource.TouchMove);
	}), threshold, { trailing: false }));
	const handlers = [
		on("mousemove", updatePosition, doc),
		on("touchmove", updatePosition, doc),
		on("drag", updatePosition, doc)
	];
	return callbackWrapper$1(() => {
		handlers.forEach((h) => h());
	});
}
function initMouseInteractionObserver({ mouseInteractionCb, doc, mirror: mirror2, blockClass, blockSelector, unblockSelector, sampling }) {
	if (sampling.mouseInteraction === false) return () => {};
	const disableMap = sampling.mouseInteraction === true || sampling.mouseInteraction === void 0 ? {} : sampling.mouseInteraction;
	const handlers = [];
	let currentPointerType = null;
	const getHandler = (eventKey) => {
		return (event) => {
			const target = getEventTarget(event);
			if (isBlocked$1(target, blockClass, blockSelector, unblockSelector, true)) return;
			let pointerType = null;
			let thisEventKey = eventKey;
			if ("pointerType" in event) {
				switch (event.pointerType) {
					case "mouse":
						pointerType = PointerTypes.Mouse;
						break;
					case "touch":
						pointerType = PointerTypes.Touch;
						break;
					case "pen": pointerType = PointerTypes.Pen;
				}
				if (pointerType === PointerTypes.Touch) {
					if (MouseInteractions[eventKey] === MouseInteractions.MouseDown) thisEventKey = "TouchStart";
					else if (MouseInteractions[eventKey] === MouseInteractions.MouseUp) thisEventKey = "TouchEnd";
				} else if (pointerType === PointerTypes.Pen);
			} else if (legacy_isTouchEvent(event)) pointerType = PointerTypes.Touch;
			if (pointerType !== null) {
				currentPointerType = pointerType;
				if (thisEventKey.startsWith("Touch") && pointerType === PointerTypes.Touch || thisEventKey.startsWith("Mouse") && pointerType === PointerTypes.Mouse) pointerType = null;
			} else if (MouseInteractions[eventKey] === MouseInteractions.Click) {
				pointerType = currentPointerType;
				currentPointerType = null;
			}
			const e2 = legacy_isTouchEvent(event) ? event.changedTouches[0] : event;
			if (!e2) return;
			const id = mirror2.getId(target);
			const { clientX, clientY } = e2;
			callbackWrapper$1(mouseInteractionCb)({
				type: MouseInteractions[thisEventKey],
				id,
				x: clientX,
				y: clientY,
				...pointerType !== null && { pointerType }
			});
		};
	};
	Object.keys(MouseInteractions).filter((key) => Number.isNaN(Number(key)) && !key.endsWith("_Departed") && disableMap[key] !== false).forEach((eventKey) => {
		let eventName = toLowerCase(eventKey);
		const handler = getHandler(eventKey);
		if (window.PointerEvent) switch (MouseInteractions[eventKey]) {
			case MouseInteractions.MouseDown:
			case MouseInteractions.MouseUp:
				eventName = eventName.replace("mouse", "pointer");
				break;
			case MouseInteractions.TouchStart:
			case MouseInteractions.TouchEnd: return;
		}
		handlers.push(on(eventName, handler, doc));
	});
	return callbackWrapper$1(() => {
		handlers.forEach((h) => h());
	});
}
function initScrollObserver({ scrollCb, doc, mirror: mirror2, blockClass, blockSelector, unblockSelector, sampling }) {
	return on("scroll", callbackWrapper$1(throttle$1(callbackWrapper$1((evt) => {
		const target = getEventTarget(evt);
		if (!target || isBlocked$1(target, blockClass, blockSelector, unblockSelector, true)) return;
		const id = mirror2.getId(target);
		if (target === doc && doc.defaultView) {
			const scrollLeftTop = getWindowScroll(doc.defaultView);
			scrollCb({
				id,
				x: scrollLeftTop.left,
				y: scrollLeftTop.top
			});
		} else scrollCb({
			id,
			x: target.scrollLeft,
			y: target.scrollTop
		});
	}), sampling.scroll || 100)), doc);
}
function initViewportResizeObserver({ viewportResizeCb }, { win }) {
	let lastH = -1;
	let lastW = -1;
	return on("resize", callbackWrapper$1(throttle$1(callbackWrapper$1(() => {
		const height = getWindowHeight();
		const width = getWindowWidth();
		if (lastH !== height || lastW !== width) {
			viewportResizeCb({
				width: Number(width),
				height: Number(height)
			});
			lastH = height;
			lastW = width;
		}
	}), 200)), win);
}
var INPUT_TAGS = [
	"INPUT",
	"TEXTAREA",
	"SELECT"
];
var lastInputValueMap = /* @__PURE__ */ new WeakMap();
function initInputObserver({ inputCb, doc, mirror: mirror2, blockClass, blockSelector, unblockSelector, ignoreClass, ignoreSelector, maskInputOptions, maskInputFn, sampling, userTriggeredOnInput, maskTextClass, unmaskTextClass, maskTextSelector, unmaskTextSelector }) {
	function eventHandler(event) {
		let target = getEventTarget(event);
		const userTriggered = event.isTrusted;
		const tagName = target && toUpperCase(target.tagName);
		if (tagName === "OPTION") target = target.parentElement;
		if (!target || !tagName || INPUT_TAGS.indexOf(tagName) < 0 || isBlocked$1(target, blockClass, blockSelector, unblockSelector, true)) return;
		const el = target;
		if (el.classList.contains(ignoreClass) || ignoreSelector && el.matches(ignoreSelector)) return;
		const type = getInputType(target);
		let text = getInputValue(el, tagName, type);
		let isChecked = false;
		const isInputMasked = shouldMaskInput({
			maskInputOptions,
			tagName,
			type
		});
		const forceMask = needMaskingText(target, maskTextClass, maskTextSelector, unmaskTextClass, unmaskTextSelector, isInputMasked);
		if (type === "radio" || type === "checkbox") isChecked = target.checked;
		text = maskInputValue({
			isMasked: forceMask,
			element: target,
			value: text,
			maskInputFn
		});
		cbWithDedup(target, userTriggeredOnInput ? {
			text,
			isChecked,
			userTriggered
		} : {
			text,
			isChecked
		});
		const name = target.name;
		if (type === "radio" && name && isChecked) doc.querySelectorAll(`input[type="radio"][name="${name}"]`).forEach((el2) => {
			if (el2 !== target) {
				const text2 = maskInputValue({
					isMasked: forceMask,
					element: el2,
					value: getInputValue(el2, tagName, type),
					maskInputFn
				});
				cbWithDedup(el2, userTriggeredOnInput ? {
					text: text2,
					isChecked: !isChecked,
					userTriggered: false
				} : {
					text: text2,
					isChecked: !isChecked
				});
			}
		});
	}
	function cbWithDedup(target, v2) {
		const lastInputValue = lastInputValueMap.get(target);
		if (!lastInputValue || lastInputValue.text !== v2.text || lastInputValue.isChecked !== v2.isChecked) {
			lastInputValueMap.set(target, v2);
			const id = mirror2.getId(target);
			callbackWrapper$1(inputCb)({
				...v2,
				id
			});
		}
	}
	const handlers = (sampling.input === "last" ? ["change"] : ["input", "change"]).map((eventName) => on(eventName, callbackWrapper$1(eventHandler), doc));
	const currentWindow = doc.defaultView;
	if (!currentWindow) return () => {
		handlers.forEach((h) => h());
	};
	const propertyDescriptor = currentWindow.Object.getOwnPropertyDescriptor(currentWindow.HTMLInputElement.prototype, "value");
	const hookProperties = [
		[currentWindow.HTMLInputElement.prototype, "value"],
		[currentWindow.HTMLInputElement.prototype, "checked"],
		[currentWindow.HTMLSelectElement.prototype, "value"],
		[currentWindow.HTMLTextAreaElement.prototype, "value"],
		[currentWindow.HTMLSelectElement.prototype, "selectedIndex"],
		[currentWindow.HTMLOptionElement.prototype, "selected"]
	];
	if (propertyDescriptor && propertyDescriptor.set) handlers.push(...hookProperties.map((p) => hookSetter$1(p[0], p[1], { set() {
		callbackWrapper$1(eventHandler)({
			target: this,
			isTrusted: false
		});
	} }, false, currentWindow)));
	return callbackWrapper$1(() => {
		handlers.forEach((h) => h());
	});
}
function getNestedCSSRulePositions(rule) {
	const positions = [];
	function recurse(childRule, pos) {
		if (hasNestedCSSRule("CSSGroupingRule") && childRule.parentRule instanceof CSSGroupingRule || hasNestedCSSRule("CSSMediaRule") && childRule.parentRule instanceof CSSMediaRule || hasNestedCSSRule("CSSSupportsRule") && childRule.parentRule instanceof CSSSupportsRule || hasNestedCSSRule("CSSConditionRule") && childRule.parentRule instanceof CSSConditionRule) {
			const index = Array.from(childRule.parentRule.cssRules).indexOf(childRule);
			pos.unshift(index);
		} else if (childRule.parentStyleSheet) {
			const index = Array.from(childRule.parentStyleSheet.cssRules).indexOf(childRule);
			pos.unshift(index);
		}
		return pos;
	}
	return recurse(rule, positions);
}
function getIdAndStyleId(sheet, mirror2, styleMirror) {
	let id, styleId;
	if (!sheet) return {};
	if (sheet.ownerNode) id = mirror2.getId(sheet.ownerNode);
	else styleId = styleMirror.getId(sheet);
	return {
		styleId,
		id
	};
}
function initStyleSheetObserver({ styleSheetRuleCb, mirror: mirror2, stylesheetManager }, { win }) {
	if (!win.CSSStyleSheet || !win.CSSStyleSheet.prototype) return () => {};
	const insertRule = win.CSSStyleSheet.prototype.insertRule;
	win.CSSStyleSheet.prototype.insertRule = new Proxy(insertRule, { apply: callbackWrapper$1((target, thisArg, argumentsList) => {
		const [rule, index] = argumentsList;
		const { id, styleId } = getIdAndStyleId(thisArg, mirror2, stylesheetManager.styleMirror);
		if (id && id !== -1 || styleId && styleId !== -1) styleSheetRuleCb({
			id,
			styleId,
			adds: [{
				rule,
				index
			}]
		});
		return target.apply(thisArg, argumentsList);
	}) });
	const deleteRule = win.CSSStyleSheet.prototype.deleteRule;
	win.CSSStyleSheet.prototype.deleteRule = new Proxy(deleteRule, { apply: callbackWrapper$1((target, thisArg, argumentsList) => {
		const [index] = argumentsList;
		const { id, styleId } = getIdAndStyleId(thisArg, mirror2, stylesheetManager.styleMirror);
		if (id && id !== -1 || styleId && styleId !== -1) styleSheetRuleCb({
			id,
			styleId,
			removes: [{ index }]
		});
		return target.apply(thisArg, argumentsList);
	}) });
	let replace;
	if (win.CSSStyleSheet.prototype.replace) {
		replace = win.CSSStyleSheet.prototype.replace;
		win.CSSStyleSheet.prototype.replace = new Proxy(replace, { apply: callbackWrapper$1((target, thisArg, argumentsList) => {
			const [text] = argumentsList;
			const { id, styleId } = getIdAndStyleId(thisArg, mirror2, stylesheetManager.styleMirror);
			if (id && id !== -1 || styleId && styleId !== -1) styleSheetRuleCb({
				id,
				styleId,
				replace: text
			});
			return target.apply(thisArg, argumentsList);
		}) });
	}
	let replaceSync;
	if (win.CSSStyleSheet.prototype.replaceSync) {
		replaceSync = win.CSSStyleSheet.prototype.replaceSync;
		win.CSSStyleSheet.prototype.replaceSync = new Proxy(replaceSync, { apply: callbackWrapper$1((target, thisArg, argumentsList) => {
			const [text] = argumentsList;
			const { id, styleId } = getIdAndStyleId(thisArg, mirror2, stylesheetManager.styleMirror);
			if (id && id !== -1 || styleId && styleId !== -1) styleSheetRuleCb({
				id,
				styleId,
				replaceSync: text
			});
			return target.apply(thisArg, argumentsList);
		}) });
	}
	const supportedNestedCSSRuleTypes = {};
	if (canMonkeyPatchNestedCSSRule("CSSGroupingRule")) supportedNestedCSSRuleTypes.CSSGroupingRule = win.CSSGroupingRule;
	else {
		if (canMonkeyPatchNestedCSSRule("CSSMediaRule")) supportedNestedCSSRuleTypes.CSSMediaRule = win.CSSMediaRule;
		if (canMonkeyPatchNestedCSSRule("CSSConditionRule")) supportedNestedCSSRuleTypes.CSSConditionRule = win.CSSConditionRule;
		if (canMonkeyPatchNestedCSSRule("CSSSupportsRule")) supportedNestedCSSRuleTypes.CSSSupportsRule = win.CSSSupportsRule;
	}
	const unmodifiedFunctions = {};
	Object.entries(supportedNestedCSSRuleTypes).forEach(([typeKey, type]) => {
		unmodifiedFunctions[typeKey] = {
			insertRule: type.prototype.insertRule,
			deleteRule: type.prototype.deleteRule
		};
		type.prototype.insertRule = new Proxy(unmodifiedFunctions[typeKey].insertRule, { apply: callbackWrapper$1((target, thisArg, argumentsList) => {
			const [rule, index] = argumentsList;
			const { id, styleId } = getIdAndStyleId(thisArg.parentStyleSheet, mirror2, stylesheetManager.styleMirror);
			if (id && id !== -1 || styleId && styleId !== -1) styleSheetRuleCb({
				id,
				styleId,
				adds: [{
					rule,
					index: [...getNestedCSSRulePositions(thisArg), index || 0]
				}]
			});
			return target.apply(thisArg, argumentsList);
		}) });
		type.prototype.deleteRule = new Proxy(unmodifiedFunctions[typeKey].deleteRule, { apply: callbackWrapper$1((target, thisArg, argumentsList) => {
			const [index] = argumentsList;
			const { id, styleId } = getIdAndStyleId(thisArg.parentStyleSheet, mirror2, stylesheetManager.styleMirror);
			if (id && id !== -1 || styleId && styleId !== -1) styleSheetRuleCb({
				id,
				styleId,
				removes: [{ index: [...getNestedCSSRulePositions(thisArg), index] }]
			});
			return target.apply(thisArg, argumentsList);
		}) });
	});
	return callbackWrapper$1(() => {
		win.CSSStyleSheet.prototype.insertRule = insertRule;
		win.CSSStyleSheet.prototype.deleteRule = deleteRule;
		replace && (win.CSSStyleSheet.prototype.replace = replace);
		replaceSync && (win.CSSStyleSheet.prototype.replaceSync = replaceSync);
		Object.entries(supportedNestedCSSRuleTypes).forEach(([typeKey, type]) => {
			type.prototype.insertRule = unmodifiedFunctions[typeKey].insertRule;
			type.prototype.deleteRule = unmodifiedFunctions[typeKey].deleteRule;
		});
	});
}
function initAdoptedStyleSheetObserver({ mirror: mirror2, stylesheetManager }, host) {
	let hostId = null;
	if (host.nodeName === "#document") hostId = mirror2.getId(host);
	else hostId = mirror2.getId(host.host);
	const patchTarget = host.nodeName === "#document" ? host.defaultView?.Document : host.ownerDocument?.defaultView?.ShadowRoot;
	const originalPropertyDescriptor = patchTarget?.prototype ? Object.getOwnPropertyDescriptor(patchTarget?.prototype, "adoptedStyleSheets") : void 0;
	if (hostId === null || hostId === -1 || !patchTarget || !originalPropertyDescriptor) return () => {};
	Object.defineProperty(host, "adoptedStyleSheets", {
		configurable: originalPropertyDescriptor.configurable,
		enumerable: originalPropertyDescriptor.enumerable,
		get() {
			return originalPropertyDescriptor.get?.call(this);
		},
		set(sheets) {
			const result = originalPropertyDescriptor.set?.call(this, sheets);
			if (hostId !== null && hostId !== -1) try {
				stylesheetManager.adoptStyleSheets(sheets, hostId);
			} catch (e2) {}
			return result;
		}
	});
	return callbackWrapper$1(() => {
		Object.defineProperty(host, "adoptedStyleSheets", {
			configurable: originalPropertyDescriptor.configurable,
			enumerable: originalPropertyDescriptor.enumerable,
			get: originalPropertyDescriptor.get,
			set: originalPropertyDescriptor.set
		});
	});
}
function initStyleDeclarationObserver({ styleDeclarationCb, mirror: mirror2, ignoreCSSAttributes, stylesheetManager }, { win }) {
	const setProperty = win.CSSStyleDeclaration.prototype.setProperty;
	win.CSSStyleDeclaration.prototype.setProperty = new Proxy(setProperty, { apply: callbackWrapper$1((target, thisArg, argumentsList) => {
		const [property, value, priority] = argumentsList;
		if (ignoreCSSAttributes.has(property)) return setProperty.apply(thisArg, [
			property,
			value,
			priority
		]);
		const { id, styleId } = getIdAndStyleId(thisArg.parentRule?.parentStyleSheet, mirror2, stylesheetManager.styleMirror);
		if (id && id !== -1 || styleId && styleId !== -1) styleDeclarationCb({
			id,
			styleId,
			set: {
				property,
				value,
				priority
			},
			index: getNestedCSSRulePositions(thisArg.parentRule)
		});
		return target.apply(thisArg, argumentsList);
	}) });
	const removeProperty = win.CSSStyleDeclaration.prototype.removeProperty;
	win.CSSStyleDeclaration.prototype.removeProperty = new Proxy(removeProperty, { apply: callbackWrapper$1((target, thisArg, argumentsList) => {
		const [property] = argumentsList;
		if (ignoreCSSAttributes.has(property)) return removeProperty.apply(thisArg, [property]);
		const { id, styleId } = getIdAndStyleId(thisArg.parentRule?.parentStyleSheet, mirror2, stylesheetManager.styleMirror);
		if (id && id !== -1 || styleId && styleId !== -1) styleDeclarationCb({
			id,
			styleId,
			remove: { property },
			index: getNestedCSSRulePositions(thisArg.parentRule)
		});
		return target.apply(thisArg, argumentsList);
	}) });
	return callbackWrapper$1(() => {
		win.CSSStyleDeclaration.prototype.setProperty = setProperty;
		win.CSSStyleDeclaration.prototype.removeProperty = removeProperty;
	});
}
function initMediaInteractionObserver({ mediaInteractionCb, blockClass, blockSelector, unblockSelector, mirror: mirror2, sampling, doc }) {
	const handler = callbackWrapper$1((type) => throttle$1(callbackWrapper$1((event) => {
		const target = getEventTarget(event);
		if (!target || isBlocked$1(target, blockClass, blockSelector, unblockSelector, true)) return;
		const { currentTime, volume, muted, playbackRate } = target;
		mediaInteractionCb({
			type,
			id: mirror2.getId(target),
			currentTime,
			volume,
			muted,
			playbackRate
		});
	}), sampling.media || 500));
	const handlers = [
		on("play", handler(MediaInteractions.Play), doc),
		on("pause", handler(MediaInteractions.Pause), doc),
		on("seeked", handler(MediaInteractions.Seeked), doc),
		on("volumechange", handler(MediaInteractions.VolumeChange), doc),
		on("ratechange", handler(MediaInteractions.RateChange), doc)
	];
	return callbackWrapper$1(() => {
		handlers.forEach((h) => h());
	});
}
function initFontObserver({ fontCb, doc }) {
	const win = doc.defaultView;
	if (!win) return () => {};
	const handlers = [];
	const fontMap = /* @__PURE__ */ new WeakMap();
	const originalFontFace = win.FontFace;
	win.FontFace = function FontFace2(family, source, descriptors) {
		const fontFace = new originalFontFace(family, source, descriptors);
		fontMap.set(fontFace, {
			family,
			buffer: typeof source !== "string",
			descriptors,
			fontSource: typeof source === "string" ? source : JSON.stringify(Array.from(new Uint8Array(source)))
		});
		return fontFace;
	};
	const restoreHandler = patch$1(doc.fonts, "add", function(original) {
		return function(fontFace) {
			setTimeout$2(callbackWrapper$1(() => {
				const p = fontMap.get(fontFace);
				if (p) {
					fontCb(p);
					fontMap.delete(fontFace);
				}
			}), 0);
			return original.apply(this, [fontFace]);
		};
	});
	handlers.push(() => {
		win.FontFace = originalFontFace;
	});
	handlers.push(restoreHandler);
	return callbackWrapper$1(() => {
		handlers.forEach((h) => h());
	});
}
function initSelectionObserver(param) {
	const { doc, mirror: mirror2, blockClass, blockSelector, unblockSelector, selectionCb } = param;
	let collapsed = true;
	const updateSelection = callbackWrapper$1(() => {
		const selection = doc.getSelection();
		if (!selection || collapsed && selection?.isCollapsed) return;
		collapsed = selection.isCollapsed || false;
		const ranges = [];
		const count = selection.rangeCount || 0;
		for (let i2 = 0; i2 < count; i2++) {
			const { startContainer, startOffset, endContainer, endOffset } = selection.getRangeAt(i2);
			if (isBlocked$1(startContainer, blockClass, blockSelector, unblockSelector, true) || isBlocked$1(endContainer, blockClass, blockSelector, unblockSelector, true)) continue;
			ranges.push({
				start: mirror2.getId(startContainer),
				startOffset,
				end: mirror2.getId(endContainer),
				endOffset
			});
		}
		selectionCb({ ranges });
	});
	updateSelection();
	return on("selectionchange", updateSelection);
}
function initCustomElementObserver({ doc, customElementCb }) {
	const win = doc.defaultView;
	if (!win || !win.customElements) return () => {};
	return patch$1(win.customElements, "define", function(original) {
		return function(name, constructor, options) {
			try {
				customElementCb({ define: { name } });
			} catch (e2) {}
			return original.apply(this, [
				name,
				constructor,
				options
			]);
		};
	});
}
function initObservers(o2, _hooks = {}) {
	const currentWindow = o2.doc.defaultView;
	if (!currentWindow) return () => {};
	let mutationObserver;
	if (o2.recordDOM) mutationObserver = initMutationObserver(o2, o2.doc);
	const mousemoveHandler = initMoveObserver(o2);
	const mouseInteractionHandler = initMouseInteractionObserver(o2);
	const scrollHandler = initScrollObserver(o2);
	const viewportResizeHandler = initViewportResizeObserver(o2, { win: currentWindow });
	const inputHandler = initInputObserver(o2);
	const mediaInteractionHandler = initMediaInteractionObserver(o2);
	let styleSheetObserver = () => {};
	let adoptedStyleSheetObserver = () => {};
	let styleDeclarationObserver = () => {};
	let fontObserver = () => {};
	if (o2.recordDOM) {
		styleSheetObserver = initStyleSheetObserver(o2, { win: currentWindow });
		adoptedStyleSheetObserver = initAdoptedStyleSheetObserver(o2, o2.doc);
		styleDeclarationObserver = initStyleDeclarationObserver(o2, { win: currentWindow });
		if (o2.collectFonts) fontObserver = initFontObserver(o2);
	}
	const selectionObserver = initSelectionObserver(o2);
	const customElementObserver = initCustomElementObserver(o2);
	const pluginHandlers = [];
	for (const plugin of o2.plugins) pluginHandlers.push(plugin.observer(plugin.callback, currentWindow, plugin.options));
	return callbackWrapper$1(() => {
		forEachMutationBuffer((b) => b.reset());
		mutationObserver?.disconnect();
		mousemoveHandler();
		mouseInteractionHandler();
		scrollHandler();
		viewportResizeHandler();
		inputHandler();
		mediaInteractionHandler();
		styleSheetObserver();
		adoptedStyleSheetObserver();
		styleDeclarationObserver();
		fontObserver();
		selectionObserver();
		customElementObserver();
		pluginHandlers.forEach((h) => h());
	});
}
function hasNestedCSSRule(prop) {
	return typeof window[prop] !== "undefined";
}
function canMonkeyPatchNestedCSSRule(prop) {
	return Boolean(typeof window[prop] !== "undefined" && window[prop].prototype && "insertRule" in window[prop].prototype && "deleteRule" in window[prop].prototype);
}
var CrossOriginIframeMirror = class {
	constructor(generateIdFn) {
		this.generateIdFn = generateIdFn;
		this.iframeIdToRemoteIdMap = /* @__PURE__ */ new WeakMap();
		this.iframeRemoteIdToIdMap = /* @__PURE__ */ new WeakMap();
	}
	getId(iframe, remoteId, idToRemoteMap, remoteToIdMap) {
		const idToRemoteIdMap = idToRemoteMap || this.getIdToRemoteIdMap(iframe);
		const remoteIdToIdMap = remoteToIdMap || this.getRemoteIdToIdMap(iframe);
		let id = idToRemoteIdMap.get(remoteId);
		if (!id) {
			id = this.generateIdFn();
			idToRemoteIdMap.set(remoteId, id);
			remoteIdToIdMap.set(id, remoteId);
		}
		return id;
	}
	getIds(iframe, remoteId) {
		const idToRemoteIdMap = this.getIdToRemoteIdMap(iframe);
		const remoteIdToIdMap = this.getRemoteIdToIdMap(iframe);
		return remoteId.map((id) => this.getId(iframe, id, idToRemoteIdMap, remoteIdToIdMap));
	}
	getRemoteId(iframe, id, map) {
		const remoteIdToIdMap = map || this.getRemoteIdToIdMap(iframe);
		if (typeof id !== "number") return id;
		const remoteId = remoteIdToIdMap.get(id);
		if (!remoteId) return -1;
		return remoteId;
	}
	getRemoteIds(iframe, ids) {
		const remoteIdToIdMap = this.getRemoteIdToIdMap(iframe);
		return ids.map((id) => this.getRemoteId(iframe, id, remoteIdToIdMap));
	}
	reset(iframe) {
		if (!iframe) {
			this.iframeIdToRemoteIdMap = /* @__PURE__ */ new WeakMap();
			this.iframeRemoteIdToIdMap = /* @__PURE__ */ new WeakMap();
			return;
		}
		this.iframeIdToRemoteIdMap.delete(iframe);
		this.iframeRemoteIdToIdMap.delete(iframe);
	}
	getIdToRemoteIdMap(iframe) {
		let idToRemoteIdMap = this.iframeIdToRemoteIdMap.get(iframe);
		if (!idToRemoteIdMap) {
			idToRemoteIdMap = /* @__PURE__ */ new Map();
			this.iframeIdToRemoteIdMap.set(iframe, idToRemoteIdMap);
		}
		return idToRemoteIdMap;
	}
	getRemoteIdToIdMap(iframe) {
		let remoteIdToIdMap = this.iframeRemoteIdToIdMap.get(iframe);
		if (!remoteIdToIdMap) {
			remoteIdToIdMap = /* @__PURE__ */ new Map();
			this.iframeRemoteIdToIdMap.set(iframe, remoteIdToIdMap);
		}
		return remoteIdToIdMap;
	}
};
var IframeManagerNoop = class {
	constructor() {
		this.crossOriginIframeMirror = new CrossOriginIframeMirror(genId);
		this.crossOriginIframeRootIdMap = /* @__PURE__ */ new WeakMap();
	}
	addIframe() {}
	addLoadListener() {}
	attachIframe() {}
};
var IframeManager = class {
	constructor(options) {
		this.iframes = /* @__PURE__ */ new WeakMap();
		this.crossOriginIframeMap = /* @__PURE__ */ new WeakMap();
		this.crossOriginIframeMirror = new CrossOriginIframeMirror(genId);
		this.crossOriginIframeRootIdMap = /* @__PURE__ */ new WeakMap();
		this.mutationCb = options.mutationCb;
		this.wrappedEmit = options.wrappedEmit;
		this.stylesheetManager = options.stylesheetManager;
		this.recordCrossOriginIframes = options.recordCrossOriginIframes;
		this.crossOriginIframeStyleMirror = new CrossOriginIframeMirror(this.stylesheetManager.styleMirror.generateId.bind(this.stylesheetManager.styleMirror));
		this.mirror = options.mirror;
		if (this.recordCrossOriginIframes) window.addEventListener("message", this.handleMessage.bind(this));
	}
	addIframe(iframeEl) {
		this.iframes.set(iframeEl, true);
		const contentWindow = getIFrameContentWindow(iframeEl);
		if (contentWindow) this.crossOriginIframeMap.set(contentWindow, iframeEl);
	}
	addLoadListener(cb) {
		this.loadListener = cb;
	}
	attachIframe(iframeEl, childSn) {
		this.mutationCb({
			adds: [{
				parentId: this.mirror.getId(iframeEl),
				nextId: null,
				node: childSn
			}],
			removes: [],
			texts: [],
			attributes: [],
			isAttachIframe: true
		});
		if (this.recordCrossOriginIframes) getIFrameContentWindow(iframeEl)?.addEventListener("message", this.handleMessage.bind(this));
		this.loadListener?.(iframeEl);
		const iframeDoc = getIFrameContentDocument(iframeEl);
		if (iframeDoc && iframeDoc.adoptedStyleSheets && iframeDoc.adoptedStyleSheets.length > 0) this.stylesheetManager.adoptStyleSheets(iframeDoc.adoptedStyleSheets, this.mirror.getId(iframeDoc));
	}
	handleMessage(message) {
		const crossOriginMessageEvent = message;
		if (crossOriginMessageEvent.data.type !== "rrweb" || crossOriginMessageEvent.origin !== crossOriginMessageEvent.data.origin) return;
		if (!message.source) return;
		const iframeEl = this.crossOriginIframeMap.get(message.source);
		if (!iframeEl) return;
		const transformedEvent = this.transformCrossOriginEvent(iframeEl, crossOriginMessageEvent.data.event);
		if (transformedEvent) this.wrappedEmit(transformedEvent, crossOriginMessageEvent.data.isCheckout);
	}
	transformCrossOriginEvent(iframeEl, e2) {
		switch (e2.type) {
			case EventType.FullSnapshot: {
				this.crossOriginIframeMirror.reset(iframeEl);
				this.crossOriginIframeStyleMirror.reset(iframeEl);
				this.replaceIdOnNode(e2.data.node, iframeEl);
				const rootId = e2.data.node.id;
				this.crossOriginIframeRootIdMap.set(iframeEl, rootId);
				this.patchRootIdOnNode(e2.data.node, rootId);
				return {
					timestamp: e2.timestamp,
					type: EventType.IncrementalSnapshot,
					data: {
						source: IncrementalSource.Mutation,
						adds: [{
							parentId: this.mirror.getId(iframeEl),
							nextId: null,
							node: e2.data.node
						}],
						removes: [],
						texts: [],
						attributes: [],
						isAttachIframe: true
					}
				};
			}
			case EventType.Meta:
			case EventType.Load:
			case EventType.DomContentLoaded: return false;
			case EventType.Plugin: return e2;
			case EventType.Custom:
				this.replaceIds(e2.data.payload, iframeEl, [
					"id",
					"parentId",
					"previousId",
					"nextId"
				]);
				return e2;
			case EventType.IncrementalSnapshot: switch (e2.data.source) {
				case IncrementalSource.Mutation:
					e2.data.adds.forEach((n2) => {
						this.replaceIds(n2, iframeEl, [
							"parentId",
							"nextId",
							"previousId"
						]);
						this.replaceIdOnNode(n2.node, iframeEl);
						const rootId = this.crossOriginIframeRootIdMap.get(iframeEl);
						rootId && this.patchRootIdOnNode(n2.node, rootId);
					});
					e2.data.removes.forEach((n2) => {
						this.replaceIds(n2, iframeEl, ["parentId", "id"]);
					});
					e2.data.attributes.forEach((n2) => {
						this.replaceIds(n2, iframeEl, ["id"]);
					});
					e2.data.texts.forEach((n2) => {
						this.replaceIds(n2, iframeEl, ["id"]);
					});
					return e2;
				case IncrementalSource.Drag:
				case IncrementalSource.TouchMove:
				case IncrementalSource.MouseMove:
					e2.data.positions.forEach((p) => {
						this.replaceIds(p, iframeEl, ["id"]);
					});
					return e2;
				case IncrementalSource.ViewportResize: return false;
				case IncrementalSource.MediaInteraction:
				case IncrementalSource.MouseInteraction:
				case IncrementalSource.Scroll:
				case IncrementalSource.CanvasMutation:
				case IncrementalSource.Input:
					this.replaceIds(e2.data, iframeEl, ["id"]);
					return e2;
				case IncrementalSource.StyleSheetRule:
				case IncrementalSource.StyleDeclaration:
					this.replaceIds(e2.data, iframeEl, ["id"]);
					this.replaceStyleIds(e2.data, iframeEl, ["styleId"]);
					return e2;
				case IncrementalSource.Font: return e2;
				case IncrementalSource.Selection:
					e2.data.ranges.forEach((range) => {
						this.replaceIds(range, iframeEl, ["start", "end"]);
					});
					return e2;
				case IncrementalSource.AdoptedStyleSheet:
					this.replaceIds(e2.data, iframeEl, ["id"]);
					this.replaceStyleIds(e2.data, iframeEl, ["styleIds"]);
					e2.data.styles?.forEach((style) => {
						this.replaceStyleIds(style, iframeEl, ["styleId"]);
					});
					return e2;
			}
		}
		return false;
	}
	replace(iframeMirror, obj, iframeEl, keys) {
		for (const key of keys) {
			if (!Array.isArray(obj[key]) && typeof obj[key] !== "number") continue;
			if (Array.isArray(obj[key])) obj[key] = iframeMirror.getIds(iframeEl, obj[key]);
			else obj[key] = iframeMirror.getId(iframeEl, obj[key]);
		}
		return obj;
	}
	replaceIds(obj, iframeEl, keys) {
		return this.replace(this.crossOriginIframeMirror, obj, iframeEl, keys);
	}
	replaceStyleIds(obj, iframeEl, keys) {
		return this.replace(this.crossOriginIframeStyleMirror, obj, iframeEl, keys);
	}
	replaceIdOnNode(node, iframeEl) {
		this.replaceIds(node, iframeEl, ["id", "rootId"]);
		if ("childNodes" in node) node.childNodes.forEach((child) => {
			this.replaceIdOnNode(child, iframeEl);
		});
	}
	patchRootIdOnNode(node, rootId) {
		if (node.type !== NodeType$1.Document && !node.rootId) node.rootId = rootId;
		if ("childNodes" in node) node.childNodes.forEach((child) => {
			this.patchRootIdOnNode(child, rootId);
		});
	}
};
var ShadowDomManagerNoop = class {
	init() {}
	addShadowRoot() {}
	observeAttachShadow() {}
	removeShadowRootsFor() {}
	reset() {}
};
var ShadowDomManager = class {
	constructor(options) {
		this.shadowDoms = /* @__PURE__ */ new WeakSet();
		this.shadowRootTeardowns = /* @__PURE__ */ new Map();
		this.restoreHandlers = [];
		this.mutationCb = options.mutationCb;
		this.scrollCb = options.scrollCb;
		this.bypassOptions = options.bypassOptions;
		this.mirror = options.mirror;
		this.init();
	}
	init() {
		this.reset();
		this.patchAttachShadow(Element, document);
	}
	addShadowRoot(shadowRoot, doc) {
		if (!isNativeShadowDom(shadowRoot)) return;
		if (this.shadowDoms.has(shadowRoot)) return;
		this.shadowDoms.add(shadowRoot);
		const teardowns = [];
		this.shadowRootTeardowns.set(shadowRoot, teardowns);
		this.bypassOptions.canvasManager.addShadowRoot(shadowRoot);
		const observer = initMutationObserver({
			...this.bypassOptions,
			doc,
			mutationCb: this.mutationCb,
			mirror: this.mirror,
			shadowDomManager: this
		}, shadowRoot);
		teardowns.push(() => removeMutationBuffer(observer));
		teardowns.push(initScrollObserver({
			...this.bypassOptions,
			scrollCb: this.scrollCb,
			doc: shadowRoot,
			mirror: this.mirror
		}));
		setTimeout$2(() => {
			if (this.shadowRootTeardowns.get(shadowRoot) !== teardowns) return;
			if (shadowRoot.adoptedStyleSheets && shadowRoot.adoptedStyleSheets.length > 0) this.bypassOptions.stylesheetManager.adoptStyleSheets(shadowRoot.adoptedStyleSheets, this.mirror.getId(shadowRoot.host));
			teardowns.push(initAdoptedStyleSheetObserver({
				mirror: this.mirror,
				stylesheetManager: this.bypassOptions.stylesheetManager
			}, shadowRoot));
		}, 0);
	}
	/** Disconnects one shadow root and forgets it. */
	removeShadowRoot(shadowRoot) {
		const teardowns = this.shadowRootTeardowns.get(shadowRoot);
		if (teardowns) {
			teardowns.forEach((teardown) => {
				try {
					teardown();
				} catch (e2) {}
			});
			this.shadowRootTeardowns.delete(shadowRoot);
		}
		this.shadowDoms.delete(shadowRoot);
	}
	removeShadowRootsFor(node) {
		if (this.shadowRootTeardowns.size === 0) return;
		if (hasShadowRoot(node)) {
			const shadowRoot = node.shadowRoot;
			if (this.shadowDoms.has(shadowRoot) && !inDom(node)) this.removeShadowRoot(shadowRoot);
			this.removeShadowRootsFor(shadowRoot);
		}
		node.childNodes?.forEach((child) => this.removeShadowRootsFor(child));
	}
	/**
	* Monkey patch 'attachShadow' of an IFrameElement to observe newly added shadow doms.
	*/
	observeAttachShadow(iframeElement) {
		const iframeDoc = getIFrameContentDocument(iframeElement);
		const iframeWindow = getIFrameContentWindow(iframeElement);
		if (!iframeDoc || !iframeWindow) return;
		let iframeElementConstructor;
		try {
			iframeElementConstructor = iframeWindow.Element;
		} catch (e2) {
			return;
		}
		if (!iframeElementConstructor) return;
		this.patchAttachShadow(iframeElementConstructor, iframeDoc);
	}
	/**
	* Patch 'attachShadow' to observe newly added shadow doms.
	*/
	patchAttachShadow(element, doc) {
		const manager = this;
		this.restoreHandlers.push(patch$1(element.prototype, "attachShadow", function(original) {
			return function(option) {
				const shadowRoot = original.call(this, option);
				if (this.shadowRoot && inDom(this)) manager.addShadowRoot(this.shadowRoot, doc);
				return shadowRoot;
			};
		}));
	}
	reset() {
		this.restoreHandlers.forEach((handler) => {
			try {
				handler();
			} catch (e2) {}
		});
		this.restoreHandlers = [];
		this.shadowRootTeardowns.forEach((teardowns) => {
			teardowns.forEach((teardown) => {
				try {
					teardown();
				} catch (e2) {}
			});
		});
		this.shadowRootTeardowns = /* @__PURE__ */ new Map();
		this.shadowDoms = /* @__PURE__ */ new WeakSet();
		this.bypassOptions.canvasManager.resetShadowRoots();
	}
};
var StylesheetManager = class {
	constructor(options) {
		this.trackedLinkElements = /* @__PURE__ */ new WeakSet();
		this.styleMirror = new StyleSheetMirror();
		this.mutationCb = options.mutationCb;
		this.adoptedStyleSheetCb = options.adoptedStyleSheetCb;
	}
	attachLinkElement(linkEl, childSn) {
		if ("_cssText" in childSn.attributes) this.mutationCb({
			adds: [],
			removes: [],
			texts: [],
			attributes: [{
				id: childSn.id,
				attributes: childSn.attributes
			}]
		});
		this.trackLinkElement(linkEl);
	}
	trackLinkElement(linkEl) {
		if (this.trackedLinkElements.has(linkEl)) return;
		this.trackedLinkElements.add(linkEl);
		this.trackStylesheetInLinkElement(linkEl);
	}
	adoptStyleSheets(sheets, hostId) {
		if (sheets.length === 0) return;
		const adoptedStyleSheetData = {
			id: hostId,
			styleIds: []
		};
		const styles = [];
		for (const sheet of sheets) {
			let styleId;
			if (!this.styleMirror.has(sheet)) {
				styleId = this.styleMirror.add(sheet);
				styles.push({
					styleId,
					rules: Array.from(sheet.rules || CSSRule, (r2, index) => ({
						rule: stringifyRule(r2),
						index
					}))
				});
			} else styleId = this.styleMirror.getId(sheet);
			adoptedStyleSheetData.styleIds.push(styleId);
		}
		if (styles.length > 0) adoptedStyleSheetData.styles = styles;
		this.adoptedStyleSheetCb(adoptedStyleSheetData);
	}
	reset() {
		this.styleMirror.reset();
		this.trackedLinkElements = /* @__PURE__ */ new WeakSet();
	}
	trackStylesheetInLinkElement(_linkEl) {}
};
var ProcessedNodeManager = class {
	constructor() {
		this.nodeMap = /* @__PURE__ */ new WeakMap();
		this.active = false;
	}
	inOtherBuffer(node, thisBuffer) {
		const buffers = this.nodeMap.get(node);
		return buffers && Array.from(buffers).some((buffer) => buffer !== thisBuffer);
	}
	add(node, buffer) {
		if (!this.active) {
			this.active = true;
			onRequestAnimationFrame$1(() => {
				this.nodeMap = /* @__PURE__ */ new WeakMap();
				this.active = false;
			});
		}
		this.nodeMap.set(node, (this.nodeMap.get(node) || /* @__PURE__ */ new Set()).add(buffer));
	}
	destroy() {}
};
var wrappedEmit;
var _takeFullSnapshot;
try {
	if (Array.from([1], (x) => x * 2)[0] !== 2) {
		const cleanFrame = document.createElement("iframe");
		document.body.appendChild(cleanFrame);
		Array.from = cleanFrame.contentWindow?.Array.from || Array.from;
		document.body.removeChild(cleanFrame);
	}
} catch (err) {
	console.debug("Unable to override Array.from", err);
}
var mirror = createMirror$1();
function record(options = {}) {
	const { emit, checkoutEveryNms, checkoutEveryNth, blockClass = "rr-block", blockSelector = null, unblockSelector = null, ignoreClass = "rr-ignore", ignoreSelector = null, maskAllText = false, maskTextClass = "rr-mask", unmaskTextClass = null, maskTextSelector = null, unmaskTextSelector = null, inlineStylesheet = true, maskAllInputs, maskInputOptions: _maskInputOptions, slimDOMOptions: _slimDOMOptions, maskAttributeFn, maskInputFn, maskTextFn, maxCanvasSize = null, packFn, sampling = {}, dataURLOptions = {}, mousemoveWait, recordDOM = true, recordCanvas = false, recordCrossOriginIframes = false, recordAfter = options.recordAfter === "DOMContentLoaded" ? options.recordAfter : "load", userTriggeredOnInput = false, collectFonts = false, inlineImages = false, plugins, keepIframeSrcFn = () => false, ignoreCSSAttributes = /* @__PURE__ */ new Set([]), errorHandler, onMutation, getCanvasManager } = options;
	registerErrorHandler$1(errorHandler);
	const inEmittingFrame = recordCrossOriginIframes ? window.parent === window : true;
	let passEmitsToParent = false;
	if (!inEmittingFrame) try {
		if (window.parent.document) passEmitsToParent = false;
	} catch (e2) {
		passEmitsToParent = true;
	}
	if (inEmittingFrame && !emit) throw new Error("emit function is required");
	if (!inEmittingFrame && !passEmitsToParent) return () => {};
	if (mousemoveWait !== void 0 && sampling.mousemove === void 0) sampling.mousemove = mousemoveWait;
	mirror.reset();
	const maskInputOptions = maskAllInputs === true ? {
		color: true,
		date: true,
		"datetime-local": true,
		email: true,
		month: true,
		number: true,
		range: true,
		search: true,
		tel: true,
		text: true,
		time: true,
		url: true,
		week: true,
		hidden: true,
		textarea: true,
		select: true,
		radio: true,
		checkbox: true
	} : _maskInputOptions !== void 0 ? _maskInputOptions : {};
	const slimDOMOptions = _slimDOMOptions === true || _slimDOMOptions === "all" ? {
		script: true,
		comment: true,
		headFavicon: true,
		headWhitespace: true,
		headMetaSocial: true,
		headMetaRobots: true,
		headMetaHttpEquiv: true,
		headMetaVerification: true,
		headMetaAuthorship: _slimDOMOptions === "all",
		headMetaDescKeywords: _slimDOMOptions === "all"
	} : _slimDOMOptions ? _slimDOMOptions : {};
	polyfill();
	let lastFullSnapshotTimestamp = 0;
	let incrementalSnapshotCount = 0;
	let failedSnapshotCount = 0;
	const eventProcessor = (e2) => {
		for (const plugin of plugins || []) if (plugin.eventProcessor) e2 = plugin.eventProcessor(e2);
		if (packFn && !passEmitsToParent) e2 = packFn(e2);
		return e2;
	};
	wrappedEmit = (r2, isCheckout) => {
		const e2 = r2;
		e2.timestamp = nowTimestamp();
		if (mutationBuffers[0]?.isFrozen() && e2.type !== EventType.FullSnapshot && !(e2.type === EventType.IncrementalSnapshot && e2.data.source === IncrementalSource.Mutation)) forEachMutationBuffer((buf) => buf.unfreeze());
		if (inEmittingFrame) emit?.(eventProcessor(e2), isCheckout);
		else if (passEmitsToParent) {
			const message = {
				type: "rrweb",
				event: eventProcessor(e2),
				origin: window.location.origin,
				isCheckout
			};
			window.parent.postMessage(message, "*");
		}
		if (e2.type === EventType.FullSnapshot) {
			lastFullSnapshotTimestamp = e2.timestamp;
			incrementalSnapshotCount = 0;
			failedSnapshotCount = 0;
		} else if (e2.type === EventType.IncrementalSnapshot) {
			if (e2.data.source === IncrementalSource.Mutation && e2.data.isAttachIframe) return;
			incrementalSnapshotCount++;
			const exceedCount = checkoutEveryNth && incrementalSnapshotCount >= checkoutEveryNth;
			const exceedTime = checkoutEveryNms && lastFullSnapshotTimestamp && e2.timestamp - lastFullSnapshotTimestamp > checkoutEveryNms;
			if (exceedCount || exceedTime) takeFullSnapshot2(true);
		}
	};
	const wrappedMutationEmit = (m) => {
		wrappedEmit({
			type: EventType.IncrementalSnapshot,
			data: {
				source: IncrementalSource.Mutation,
				...m
			}
		});
	};
	const wrappedScrollEmit = (p) => wrappedEmit({
		type: EventType.IncrementalSnapshot,
		data: {
			source: IncrementalSource.Scroll,
			...p
		}
	});
	const wrappedCanvasMutationEmit = (p) => wrappedEmit({
		type: EventType.IncrementalSnapshot,
		data: {
			source: IncrementalSource.CanvasMutation,
			...p
		}
	});
	const wrappedAdoptedStyleSheetEmit = (a2) => wrappedEmit({
		type: EventType.IncrementalSnapshot,
		data: {
			source: IncrementalSource.AdoptedStyleSheet,
			...a2
		}
	});
	const stylesheetManager = new StylesheetManager({
		mutationCb: wrappedMutationEmit,
		adoptedStyleSheetCb: wrappedAdoptedStyleSheetEmit
	});
	const iframeManager = typeof __RRWEB_EXCLUDE_IFRAME__ === "boolean" && __RRWEB_EXCLUDE_IFRAME__ ? new IframeManagerNoop() : new IframeManager({
		mirror,
		mutationCb: wrappedMutationEmit,
		stylesheetManager,
		recordCrossOriginIframes,
		wrappedEmit
	});
	for (const plugin of plugins || []) if (plugin.getMirror) plugin.getMirror({
		nodeMirror: mirror,
		crossOriginIframeMirror: iframeManager.crossOriginIframeMirror,
		crossOriginIframeStyleMirror: iframeManager.crossOriginIframeStyleMirror
	});
	const processedNodeManager = new ProcessedNodeManager();
	const canvasManager = _getCanvasManager(getCanvasManager, {
		mirror,
		win: window,
		mutationCb: (p) => wrappedEmit({
			type: EventType.IncrementalSnapshot,
			data: {
				source: IncrementalSource.CanvasMutation,
				...p
			}
		}),
		recordCanvas,
		blockClass,
		blockSelector,
		unblockSelector,
		maxCanvasSize,
		sampling: sampling["canvas"],
		dataURLOptions,
		errorHandler
	});
	const shadowDomManager = typeof __RRWEB_EXCLUDE_SHADOW_DOM__ === "boolean" && __RRWEB_EXCLUDE_SHADOW_DOM__ ? new ShadowDomManagerNoop() : new ShadowDomManager({
		mutationCb: wrappedMutationEmit,
		scrollCb: wrappedScrollEmit,
		bypassOptions: {
			onMutation,
			blockClass,
			blockSelector,
			unblockSelector,
			maskAllText,
			maskTextClass,
			unmaskTextClass,
			maskTextSelector,
			unmaskTextSelector,
			inlineStylesheet,
			maskInputOptions,
			dataURLOptions,
			maskAttributeFn,
			maskTextFn,
			maskInputFn,
			recordCanvas,
			inlineImages,
			sampling,
			slimDOMOptions,
			iframeManager,
			stylesheetManager,
			canvasManager,
			keepIframeSrcFn,
			processedNodeManager,
			ignoreCSSAttributes
		},
		mirror
	});
	const takeFullSnapshot2 = (isCheckout = false) => {
		if (!recordDOM) return;
		wrappedEmit({
			type: EventType.Meta,
			data: {
				href: window.location.href,
				width: getWindowWidth(),
				height: getWindowHeight()
			}
		}, isCheckout);
		stylesheetManager.reset();
		shadowDomManager.init();
		forEachMutationBuffer((buf) => buf.lock());
		let snapshotEmitted = false;
		try {
			const node = snapshot(document, {
				mirror,
				blockClass,
				blockSelector,
				unblockSelector,
				maskAllText,
				maskTextClass,
				unmaskTextClass,
				maskTextSelector,
				unmaskTextSelector,
				inlineStylesheet,
				maskAllInputs: maskInputOptions,
				maskAttributeFn,
				maskInputFn,
				maskTextFn,
				slimDOM: slimDOMOptions,
				dataURLOptions,
				recordCanvas,
				inlineImages,
				onSerialize: (n2) => {
					if (isSerializedIframe(n2, mirror)) iframeManager.addIframe(n2);
					if (isSerializedStylesheet(n2, mirror)) stylesheetManager.trackLinkElement(n2);
					if (hasShadowRoot(n2)) shadowDomManager.addShadowRoot(n2.shadowRoot, document);
				},
				onIframeLoad: (iframe, childSn) => {
					iframeManager.attachIframe(iframe, childSn);
					const contentWindow = getIFrameContentWindow(iframe);
					if (contentWindow) canvasManager.addWindow(contentWindow);
					shadowDomManager.observeAttachShadow(iframe);
				},
				onStylesheetLoad: (linkEl, childSn) => {
					stylesheetManager.attachLinkElement(linkEl, childSn);
				},
				onBlockedImageLoad: (_imageEl, serializedNode, { width, height }) => {
					wrappedMutationEmit({
						adds: [],
						removes: [],
						texts: [],
						attributes: [{
							id: serializedNode.id,
							attributes: { style: {
								width: `${width}px`,
								height: `${height}px`
							} }
						}]
					});
				},
				keepIframeSrcFn,
				ignoreCSSAttributes
			});
			if (!node) return console.warn("Failed to snapshot the document");
			wrappedEmit({
				type: EventType.FullSnapshot,
				data: {
					node,
					initialOffset: getWindowScroll(window)
				}
			});
			snapshotEmitted = true;
		} finally {
			if (!snapshotEmitted) {
				failedSnapshotCount++;
				if (checkoutEveryNms) {
					const retryDelay = Math.min(1e3 * 2 ** (failedSnapshotCount - 1), checkoutEveryNms);
					lastFullSnapshotTimestamp = nowTimestamp() - checkoutEveryNms + retryDelay;
				}
				incrementalSnapshotCount = 0;
			}
			forEachMutationBuffer((buf) => buf.unlock());
		}
		if (document.adoptedStyleSheets && document.adoptedStyleSheets.length > 0) stylesheetManager.adoptStyleSheets(document.adoptedStyleSheets, mirror.getId(document));
	};
	_takeFullSnapshot = takeFullSnapshot2;
	try {
		const handlers = [];
		const observe = (doc) => {
			return callbackWrapper$1(initObservers)({
				onMutation,
				mutationCb: wrappedMutationEmit,
				mousemoveCb: (positions, source) => wrappedEmit({
					type: EventType.IncrementalSnapshot,
					data: {
						source,
						positions
					}
				}),
				mouseInteractionCb: (d) => wrappedEmit({
					type: EventType.IncrementalSnapshot,
					data: {
						source: IncrementalSource.MouseInteraction,
						...d
					}
				}),
				scrollCb: wrappedScrollEmit,
				viewportResizeCb: (d) => wrappedEmit({
					type: EventType.IncrementalSnapshot,
					data: {
						source: IncrementalSource.ViewportResize,
						...d
					}
				}),
				inputCb: (v2) => wrappedEmit({
					type: EventType.IncrementalSnapshot,
					data: {
						source: IncrementalSource.Input,
						...v2
					}
				}),
				mediaInteractionCb: (p) => wrappedEmit({
					type: EventType.IncrementalSnapshot,
					data: {
						source: IncrementalSource.MediaInteraction,
						...p
					}
				}),
				styleSheetRuleCb: (r2) => wrappedEmit({
					type: EventType.IncrementalSnapshot,
					data: {
						source: IncrementalSource.StyleSheetRule,
						...r2
					}
				}),
				styleDeclarationCb: (r2) => wrappedEmit({
					type: EventType.IncrementalSnapshot,
					data: {
						source: IncrementalSource.StyleDeclaration,
						...r2
					}
				}),
				canvasMutationCb: wrappedCanvasMutationEmit,
				fontCb: (p) => wrappedEmit({
					type: EventType.IncrementalSnapshot,
					data: {
						source: IncrementalSource.Font,
						...p
					}
				}),
				selectionCb: (p) => {
					wrappedEmit({
						type: EventType.IncrementalSnapshot,
						data: {
							source: IncrementalSource.Selection,
							...p
						}
					});
				},
				customElementCb: (c2) => {
					wrappedEmit({
						type: EventType.IncrementalSnapshot,
						data: {
							source: IncrementalSource.CustomElement,
							...c2
						}
					});
				},
				blockClass,
				ignoreClass,
				ignoreSelector,
				maskAllText,
				maskTextClass,
				unmaskTextClass,
				maskTextSelector,
				unmaskTextSelector,
				maskInputOptions,
				inlineStylesheet,
				sampling,
				recordDOM,
				recordCanvas,
				inlineImages,
				userTriggeredOnInput,
				collectFonts,
				doc,
				maskAttributeFn,
				maskInputFn,
				maskTextFn,
				keepIframeSrcFn,
				blockSelector,
				unblockSelector,
				slimDOMOptions,
				dataURLOptions,
				mirror,
				iframeManager,
				stylesheetManager,
				shadowDomManager,
				processedNodeManager,
				canvasManager,
				ignoreCSSAttributes,
				plugins: plugins?.filter((p) => p.observer)?.map((p) => ({
					observer: p.observer,
					options: p.options,
					callback: (payload) => wrappedEmit({
						type: EventType.Plugin,
						data: {
							plugin: p.name,
							payload
						}
					})
				})) || []
			}, {});
		};
		iframeManager.addLoadListener((iframeEl) => {
			try {
				handlers.push(observe(iframeEl.contentDocument));
			} catch (error) {
				console.warn(error);
			}
		});
		const init = () => {
			takeFullSnapshot2();
			handlers.push(observe(document));
		};
		if (document.readyState === "interactive" || document.readyState === "complete") init();
		else {
			handlers.push(on("DOMContentLoaded", () => {
				wrappedEmit({
					type: EventType.DomContentLoaded,
					data: {}
				});
				if (recordAfter === "DOMContentLoaded") init();
			}));
			handlers.push(on("load", () => {
				wrappedEmit({
					type: EventType.Load,
					data: {}
				});
				if (recordAfter === "load") init();
			}, window));
		}
		return () => {
			handlers.forEach((h) => h());
			processedNodeManager.destroy();
			_takeFullSnapshot = void 0;
			unregisterErrorHandler();
		};
	} catch (error) {
		console.warn(error);
	}
}
function takeFullSnapshot(isCheckout) {
	if (!_takeFullSnapshot) throw new Error("please take full snapshot after start recording");
	_takeFullSnapshot(isCheckout);
}
record.mirror = mirror;
record.takeFullSnapshot = takeFullSnapshot;
function _getCanvasManager(getCanvasManagerFn, options) {
	try {
		return getCanvasManagerFn ? getCanvasManagerFn(options) : new CanvasManagerNoop();
	} catch {
		console.warn("Unable to initialize CanvasManager");
		return new CanvasManagerNoop();
	}
}
var n$1;
(function(t2) {
	t2[t2.NotStarted = 0] = "NotStarted", t2[t2.Running = 1] = "Running", t2[t2.Stopped = 2] = "Stopped";
})(n$1 || (n$1 = {}));
var ReplayEventTypeIncrementalSnapshot = 3;
var ReplayEventTypeCustom = 5;
function timestampToMs(timestamp) {
	return timestamp > 9999999999 ? timestamp : timestamp * 1e3;
}
function timestampToS(timestamp) {
	return timestamp > 9999999999 ? timestamp / 1e3 : timestamp;
}
function addBreadcrumbEvent(replay, breadcrumb) {
	if (breadcrumb.category === "sentry.transaction") return;
	if (["ui.click", "ui.input"].includes(breadcrumb.category)) replay.triggerUserActivity();
	else replay.checkAndHandleExpiredSession();
	replay.addUpdate(() => {
		replay.throttledAddEvent({
			type: EventType.Custom,
			timestamp: (breadcrumb.timestamp || 0) * 1e3,
			data: {
				tag: "breadcrumb",
				payload: normalize(breadcrumb, 10, 1e3)
			}
		});
		return breadcrumb.category === "console";
	});
}
var INTERACTIVE_SELECTOR = "button,a";
function getClosestInteractive(element) {
	return element.closest(INTERACTIVE_SELECTOR) || element;
}
function getClickTargetNode(event) {
	const target = getTargetNode(event);
	if (!target || !(target instanceof Element)) return target;
	return getClosestInteractive(target);
}
function getTargetNode(event) {
	if (isEventWithTarget(event)) return event.target;
	return event;
}
function isEventWithTarget(event) {
	return isObjectLike(event) && "target" in event;
}
var handlers;
function onWindowOpen(cb) {
	if (!handlers) {
		handlers = [];
		monkeyPatchWindowOpen();
	}
	handlers.push(cb);
	return () => {
		const pos = handlers ? handlers.indexOf(cb) : -1;
		if (pos > -1) handlers.splice(pos, 1);
	};
}
function monkeyPatchWindowOpen() {
	fill(WINDOW$1, "open", function(originalWindowOpen) {
		return function(...args) {
			if (handlers) try {
				handlers.forEach((handler) => handler());
			} catch {}
			return originalWindowOpen.apply(WINDOW$1, args);
		};
	});
}
var IncrementalMutationSources = /* @__PURE__ */ new Set([
	IncrementalSource.Mutation,
	IncrementalSource.StyleSheetRule,
	IncrementalSource.StyleDeclaration,
	IncrementalSource.AdoptedStyleSheet,
	IncrementalSource.CanvasMutation,
	IncrementalSource.Selection,
	IncrementalSource.MediaInteraction
]);
function handleClick(clickDetector, clickBreadcrumb, node) {
	clickDetector.handleClick(clickBreadcrumb, node);
}
var ClickDetector = class {
	constructor(replay, slowClickConfig, _addBreadcrumbEvent = addBreadcrumbEvent) {
		this._lastMutation = 0;
		this._lastScroll = 0;
		this._clicks = [];
		this._timeout = slowClickConfig.timeout / 1e3;
		this._threshold = slowClickConfig.threshold / 1e3;
		this._scrollTimeout = slowClickConfig.scrollTimeout / 1e3;
		this._replay = replay;
		this._ignoreSelector = slowClickConfig.ignoreSelector;
		this._addBreadcrumbEvent = _addBreadcrumbEvent;
	}
	/** Register click detection handlers on mutation or scroll. */
	addListeners() {
		const cleanupWindowOpen = onWindowOpen(() => {
			this._lastMutation = nowInSeconds();
		});
		this._teardown = () => {
			cleanupWindowOpen();
			this._clicks = [];
			this._lastMutation = 0;
			this._lastScroll = 0;
		};
	}
	/** Clean up listeners. */
	removeListeners() {
		if (this._teardown) this._teardown();
		if (this._checkClickTimeout) clearTimeout(this._checkClickTimeout);
	}
	/** @inheritDoc */
	handleClick(breadcrumb, node) {
		if (ignoreElement(node, this._ignoreSelector) || !isClickBreadcrumb(breadcrumb)) return;
		const newClick = {
			timestamp: timestampToS(breadcrumb.timestamp),
			clickBreadcrumb: breadcrumb,
			clickCount: 0,
			node
		};
		if (this._clicks.some((click) => click.node === newClick.node && Math.abs(click.timestamp - newClick.timestamp) < 1)) return;
		this._clicks.push(newClick);
		if (this._clicks.length === 1) this._scheduleCheckClicks();
	}
	/** @inheritDoc */
	registerMutation(timestamp = Date.now()) {
		this._lastMutation = timestampToS(timestamp);
	}
	/** @inheritDoc */
	registerScroll(timestamp = Date.now()) {
		this._lastScroll = timestampToS(timestamp);
	}
	/** @inheritDoc */
	registerClick(element) {
		const node = getClosestInteractive(element);
		this._handleMultiClick(node);
	}
	/** Count multiple clicks on elements. */
	_handleMultiClick(node) {
		this._getClicks(node).forEach((click) => {
			click.clickCount++;
		});
	}
	/** Get all pending clicks for a given node. */
	_getClicks(node) {
		return this._clicks.filter((click) => click.node === node);
	}
	/** Check the clicks that happened. */
	_checkClicks() {
		const timedOutClicks = [];
		const now = nowInSeconds();
		this._clicks.forEach((click) => {
			if (click.mutationAfter === void 0 && this._lastMutation) click.mutationAfter = click.timestamp <= this._lastMutation ? this._lastMutation - click.timestamp : void 0;
			if (click.scrollAfter === void 0 && this._lastScroll) click.scrollAfter = click.timestamp <= this._lastScroll ? this._lastScroll - click.timestamp : void 0;
			if (click.timestamp + this._timeout <= now) timedOutClicks.push(click);
		});
		for (const click of timedOutClicks) {
			const pos = this._clicks.indexOf(click);
			if (pos > -1) {
				this._generateBreadcrumbs(click);
				this._clicks.splice(pos, 1);
			}
		}
		if (this._clicks.length) this._scheduleCheckClicks();
	}
	/** Generate matching breadcrumb(s) for the click. */
	_generateBreadcrumbs(click) {
		const replay = this._replay;
		const hadScroll = click.scrollAfter !== void 0 && click.scrollAfter <= this._scrollTimeout;
		const hadMutation = click.mutationAfter !== void 0 && click.mutationAfter <= this._threshold;
		const isSlowClick = !hadScroll && !hadMutation;
		const { clickCount, clickBreadcrumb } = click;
		if (isSlowClick) {
			const timeAfterClickMs = Math.min(click.mutationAfter || this._timeout, this._timeout) * 1e3;
			const endReason = timeAfterClickMs < this._timeout * 1e3 ? "mutation" : "timeout";
			const breadcrumb = {
				type: "default",
				message: clickBreadcrumb.message,
				timestamp: clickBreadcrumb.timestamp,
				category: "ui.slowClickDetected",
				data: {
					...clickBreadcrumb.data,
					url: WINDOW$1.location.href,
					route: replay.getCurrentRoute(),
					timeAfterClickMs,
					endReason,
					clickCount: clickCount || 1
				}
			};
			this._addBreadcrumbEvent(replay, breadcrumb);
			return;
		}
		if (clickCount > 1) {
			const breadcrumb = {
				type: "default",
				message: clickBreadcrumb.message,
				timestamp: clickBreadcrumb.timestamp,
				category: "ui.multiClick",
				data: {
					...clickBreadcrumb.data,
					url: WINDOW$1.location.href,
					route: replay.getCurrentRoute(),
					clickCount,
					metric: true
				}
			};
			this._addBreadcrumbEvent(replay, breadcrumb);
		}
	}
	/** Schedule to check current clicks. */
	_scheduleCheckClicks() {
		if (this._checkClickTimeout) clearTimeout(this._checkClickTimeout);
		this._checkClickTimeout = setTimeout$3(() => this._checkClicks(), 1e3);
	}
};
var SLOW_CLICK_TAGS = [
	"A",
	"BUTTON",
	"INPUT"
];
function ignoreElement(node, ignoreSelector) {
	if (!SLOW_CLICK_TAGS.includes(node.tagName)) return true;
	if (node.tagName === "INPUT" && !["submit", "button"].includes(node.getAttribute("type") || "")) return true;
	if (node.tagName === "A" && (node.hasAttribute("download") || node.hasAttribute("target") && node.getAttribute("target") !== "_self")) return true;
	if (ignoreSelector && node.matches(ignoreSelector)) return true;
	return false;
}
function isClickBreadcrumb(breadcrumb) {
	return !!(breadcrumb.data && typeof breadcrumb.data.nodeId === "number" && breadcrumb.timestamp);
}
function nowInSeconds() {
	return Date.now() / 1e3;
}
function updateClickDetectorForRecordingEvent(clickDetector, event) {
	try {
		if (!isIncrementalEvent(event)) return;
		const { source } = event.data;
		if (IncrementalMutationSources.has(source)) clickDetector.registerMutation(event.timestamp);
		if (source === IncrementalSource.Scroll) clickDetector.registerScroll(event.timestamp);
		if (isIncrementalMouseInteraction(event)) {
			const { type, id } = event.data;
			const node = record.mirror.getNode(id);
			if (node instanceof HTMLElement && type === MouseInteractions.Click) clickDetector.registerClick(node);
		}
	} catch {}
}
function isIncrementalEvent(event) {
	return event.type === ReplayEventTypeIncrementalSnapshot;
}
function isIncrementalMouseInteraction(event) {
	return event.data.source === IncrementalSource.MouseInteraction;
}
function createBreadcrumb(breadcrumb) {
	return {
		timestamp: Date.now() / 1e3,
		type: "default",
		...breadcrumb
	};
}
var NodeType = /* @__PURE__ */ ((NodeType2) => {
	NodeType2[NodeType2["Document"] = 0] = "Document";
	NodeType2[NodeType2["DocumentType"] = 1] = "DocumentType";
	NodeType2[NodeType2["Element"] = 2] = "Element";
	NodeType2[NodeType2["Text"] = 3] = "Text";
	NodeType2[NodeType2["CDATA"] = 4] = "CDATA";
	NodeType2[NodeType2["Comment"] = 5] = "Comment";
	return NodeType2;
})(NodeType || {});
var ATTRIBUTES_TO_RECORD = /* @__PURE__ */ new Set([
	"id",
	"class",
	"aria-label",
	"role",
	"name",
	"alt",
	"title",
	"data-test-id",
	"data-testid",
	"disabled",
	"aria-disabled",
	"data-sentry-component"
]);
var BREADCRUMB_RELEVANT_ATTRIBUTES = /* @__PURE__ */ new Set([...ATTRIBUTES_TO_RECORD, "data-sentry-element"]);
function getAttributesToRecord(attributes) {
	const obj = {};
	for (const key in attributes) if (ATTRIBUTES_TO_RECORD.has(key)) {
		let normalizedKey = key;
		if (key === "data-testid" || key === "data-test-id") normalizedKey = "testId";
		obj[normalizedKey] = attributes[key];
	}
	if (!obj["data-sentry-component"] && attributes["data-sentry-element"]) obj["data-sentry-component"] = attributes["data-sentry-element"];
	return obj;
}
var handleDomListener = (replay) => {
	return (handlerData) => {
		if (!replay.isEnabled()) return;
		const result = handleDom(handlerData, replay.getMaskAttributeFn());
		if (!result) return;
		const isClick = handlerData.name === "click";
		const event = isClick ? handlerData.event : void 0;
		if (isClick && replay.clickDetector && event?.target && !event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey) handleClick(replay.clickDetector, result, getClickTargetNode(handlerData.event));
		addBreadcrumbEvent(replay, result);
	};
};
function getBaseDomBreadcrumb(target, message) {
	const nodeId = record.mirror.getId(target);
	const node = nodeId && record.mirror.getNode(nodeId);
	const meta = node && record.mirror.getMeta(node);
	const element = meta && isElement$2(meta) ? meta : null;
	return {
		message,
		data: element ? {
			nodeId,
			node: {
				id: nodeId,
				tagName: element.tagName,
				textContent: Array.from(element.childNodes).map((node2) => node2.type === NodeType.Text && node2.textContent).filter(Boolean).map((text) => text.trim()).join(""),
				attributes: getAttributesToRecord(element.attributes)
			}
		} : {}
	};
}
function handleDom(handlerData, maskAttributeFn) {
	const { target, message } = getDomTarget(handlerData, maskAttributeFn);
	return createBreadcrumb({
		category: `ui.${handlerData.name}`,
		...getBaseDomBreadcrumb(target, message)
	});
}
function getDomTarget(handlerData, maskAttributeFn) {
	const isClick = handlerData.name === "click";
	let message;
	let target = null;
	try {
		target = isClick ? getClickTargetNode(handlerData.event) : getTargetNode(handlerData.event);
		message = htmlTreeAsString(target, {
			maxStringLength: 200,
			maskAttributeFn
		}) || "<unknown>";
	} catch {
		message = "<unknown>";
	}
	return {
		target,
		message
	};
}
function isElement$2(node) {
	return node.type === NodeType.Element;
}
function handleKeyboardEvent(replay, event) {
	if (!replay.isEnabled()) return;
	replay.updateUserActivity();
	const breadcrumb = getKeyboardBreadcrumb(event, replay.getMaskAttributeFn());
	if (!breadcrumb) return;
	addBreadcrumbEvent(replay, breadcrumb);
}
function getKeyboardBreadcrumb(event, maskAttributeFn) {
	const { metaKey, shiftKey, ctrlKey, altKey, key, target } = event;
	if (!target || isInputElement(target) || !key) return null;
	const hasModifierKey = metaKey || ctrlKey || altKey;
	const isCharacterKey = key.length === 1;
	if (!hasModifierKey && isCharacterKey) return null;
	const message = htmlTreeAsString(target, {
		maxStringLength: 200,
		maskAttributeFn
	}) || "<unknown>";
	return createBreadcrumb({
		category: "ui.keyDown",
		message,
		data: {
			...getBaseDomBreadcrumb(target, message).data,
			metaKey,
			shiftKey,
			ctrlKey,
			altKey,
			key
		}
	});
}
function isInputElement(target) {
	return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}
var ENTRY_TYPES = {
	resource: createResourceEntry,
	paint: createPaintEntry,
	navigation: createNavigationEntry
};
function webVitalHandler(getter, replay) {
	return ({ metric }) => void replay.replayPerformanceEntries.push(getter(metric));
}
function createPerformanceEntries(entries) {
	return entries.map(createPerformanceEntry).filter(Boolean);
}
function createPerformanceEntry(entry) {
	const entryType = ENTRY_TYPES[entry.entryType];
	if (!entryType) return null;
	return entryType(entry);
}
function getAbsoluteTime(time, entryStartTime = time) {
	return performanceTimeToSeconds(time, entryStartTime);
}
function createPaintEntry(entry) {
	const { duration, entryType, name, startTime } = entry;
	const start = getAbsoluteTime(startTime);
	return {
		type: entryType,
		name,
		start,
		end: start + duration,
		data: void 0
	};
}
function createNavigationEntry(entry) {
	const { entryType, name, decodedBodySize, duration, domComplete, encodedBodySize, domContentLoadedEventStart, domContentLoadedEventEnd, domInteractive, loadEventStart, loadEventEnd, redirectCount, startTime, transferSize, type } = entry;
	if (duration === 0) return null;
	return {
		type: `${entryType}.${type}`,
		start: getAbsoluteTime(startTime),
		end: getAbsoluteTime(domComplete, startTime),
		name,
		data: {
			size: transferSize,
			decodedBodySize,
			encodedBodySize,
			duration,
			domInteractive,
			domContentLoadedEventStart,
			domContentLoadedEventEnd,
			loadEventStart,
			loadEventEnd,
			domComplete,
			redirectCount
		}
	};
}
function createResourceEntry(entry) {
	const { entryType, initiatorType, name, responseEnd, startTime, decodedBodySize, encodedBodySize, responseStatus, transferSize } = entry;
	if (["fetch", "xmlhttprequest"].includes(initiatorType)) return null;
	return {
		type: `${entryType}.${initiatorType}`,
		start: getAbsoluteTime(startTime),
		end: getAbsoluteTime(responseEnd, startTime),
		name,
		data: {
			size: transferSize,
			statusCode: responseStatus,
			decodedBodySize,
			encodedBodySize
		}
	};
}
function getLargestContentfulPaint(metric) {
	const lastEntry = metric.entries[metric.entries.length - 1];
	return getWebVital(metric, "largest-contentful-paint", lastEntry?.element ? [lastEntry.element] : void 0);
}
function isLayoutShift(entry) {
	return entry.sources !== void 0;
}
function getCumulativeLayoutShift(metric) {
	const layoutShifts = [];
	const nodes = [];
	for (const entry of metric.entries) if (isLayoutShift(entry)) {
		const nodeIds = [];
		for (const source of entry.sources) if (source.node) {
			nodes.push(source.node);
			const nodeId = record.mirror.getId(source.node);
			if (nodeId) nodeIds.push(nodeId);
		}
		layoutShifts.push({
			value: entry.value,
			nodeIds: nodeIds.length ? nodeIds : void 0
		});
	}
	return getWebVital(metric, "cumulative-layout-shift", nodes, layoutShifts);
}
function getInteractionToNextPaint(metric) {
	const lastEntry = metric.entries[metric.entries.length - 1];
	return getWebVital(metric, "interaction-to-next-paint", lastEntry?.target ? [lastEntry.target] : void 0);
}
function getWebVital(metric, name, nodes, attributions) {
	const value = metric.value;
	const rating = metric.rating;
	const lastEntry = metric.entries[metric.entries.length - 1];
	const end = getAbsoluteTime(lastEntry?.startTime ?? (metric.navigationStartTime ?? 0) + value);
	return {
		type: "web-vital",
		name,
		start: end,
		end,
		data: {
			value,
			size: value,
			rating,
			nodeIds: nodes ? nodes.map((node) => record.mirror.getId(node)) : void 0,
			attributions
		}
	};
}
function setupPerformanceObserver(replay) {
	function addPerformanceEntry(entry) {
		if (!replay.performanceEntries.includes(entry)) replay.performanceEntries.push(entry);
	}
	function onEntries({ entries }) {
		entries.forEach(addPerformanceEntry);
	}
	const clearCallbacks = [];
	[
		"navigation",
		"paint",
		"resource"
	].forEach((type) => {
		clearCallbacks.push(addPerformanceInstrumentationHandler(type, onEntries));
	});
	clearCallbacks.push(addLcpInstrumentationHandler(webVitalHandler(getLargestContentfulPaint, replay)), addClsInstrumentationHandler(webVitalHandler(getCumulativeLayoutShift, replay)), addInpInstrumentationHandler(webVitalHandler(getInteractionToNextPaint, replay)));
	return () => {
		clearCallbacks.forEach((clearCallback) => clearCallback());
	};
}
var DEBUG_BUILD$1 = typeof __SENTRY_DEBUG__ === "undefined" || __SENTRY_DEBUG__;
var t$1 = `var t=Uint8Array,r=Uint16Array,n=Int32Array,e=new t([0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0,0,0,0]),i=new t([0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13,0,0]),s=new t([16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15]),a=function(t,e){for(var i=new r(31),s=0;s<31;++s)i[s]=e+=1<<t[s-1];var a=new n(i[30]);for(s=1;s<30;++s)for(var o=i[s];o<i[s+1];++o)a[o]=o-i[s]<<5|s;return{b:i,r:a}},o=a(e,2),h=o.b,f=o.r;h[28]=258,f[258]=28;for(var l=a(i,0).r,u=new r(32768),c=0;c<32768;++c){var v=(43690&c)>>1|(21845&c)<<1;v=(61680&(v=(52428&v)>>2|(13107&v)<<2))>>4|(3855&v)<<4,u[c]=((65280&v)>>8|(255&v)<<8)>>1}var d=function(t,n,e){for(var i=t.length,s=0,a=new r(n);s<i;++s)t[s]&&++a[t[s]-1];var o,h=new r(n);for(s=1;s<n;++s)h[s]=h[s-1]+a[s-1]<<1;if(e){o=new r(1<<n);var f=15-n;for(s=0;s<i;++s)if(t[s])for(var l=s<<4|t[s],c=n-t[s],v=h[t[s]-1]++<<c,d=v|(1<<c)-1;v<=d;++v)o[u[v]>>f]=l}else for(o=new r(i),s=0;s<i;++s)t[s]&&(o[s]=u[h[t[s]-1]++]>>15-t[s]);return o},p=new t(288);for(c=0;c<144;++c)p[c]=8;for(c=144;c<256;++c)p[c]=9;for(c=256;c<280;++c)p[c]=7;for(c=280;c<288;++c)p[c]=8;var g=new t(32);for(c=0;c<32;++c)g[c]=5;var w=d(p,9,0),y=d(g,5,0),m=function(t){return(t+7)/8|0},b=function(r,n,e){return(null==e||e>r.length)&&(e=r.length),new t(r.subarray(n,e))},M=["unexpected EOF","invalid block type","invalid length/literal","invalid distance","stream finished","no stream handler",,"no callback","invalid UTF-8 data","extra field too long","date not in range 1980-2099","filename too long","stream finishing","invalid zip data"],E=function(t,r,n){var e=new Error(r||M[t]);if(e.code=t,Error.captureStackTrace&&Error.captureStackTrace(e,E),!n)throw e;return e},z=function(t,r,n){n<<=7&r;var e=r/8|0;t[e]|=n,t[e+1]|=n>>8},_=function(t,r,n){n<<=7&r;var e=r/8|0;t[e]|=n,t[e+1]|=n>>8,t[e+2]|=n>>16},x=function(n,e){for(var i=[],s=0;s<n.length;++s)n[s]&&i.push({s:s,f:n[s]});var a=i.length,o=i.slice();if(!a)return{t:F,l:0};if(1==a){var h=new t(i[0].s+1);return h[i[0].s]=1,{t:h,l:1}}i.sort(function(t,r){return t.f-r.f}),i.push({s:-1,f:25001});var f=i[0],l=i[1],u=0,c=1,v=2;for(i[0]={s:-1,f:f.f+l.f,l:f,r:l};c!=a-1;)f=i[i[u].f<i[v].f?u++:v++],l=i[u!=c&&i[u].f<i[v].f?u++:v++],i[c++]={s:-1,f:f.f+l.f,l:f,r:l};var d=o[0].s;for(s=1;s<a;++s)o[s].s>d&&(d=o[s].s);var p=new r(d+1),g=A(i[c-1],p,0);if(g>e){s=0;var w=0,y=g-e,m=1<<y;for(o.sort(function(t,r){return p[r.s]-p[t.s]||t.f-r.f});s<a;++s){var b=o[s].s;if(!(p[b]>e))break;w+=m-(1<<g-p[b]),p[b]=e}for(w>>=y;w>0;){var M=o[s].s;p[M]<e?w-=1<<e-p[M]++-1:++s}for(;s>=0&&w;--s){var E=o[s].s;p[E]==e&&(--p[E],++w)}g=e}return{t:new t(p),l:g}},A=function(t,r,n){return-1==t.s?Math.max(A(t.l,r,n+1),A(t.r,r,n+1)):r[t.s]=n},D=function(t){for(var n=t.length;n&&!t[--n];);for(var e=new r(++n),i=0,s=t[0],a=1,o=function(t){e[i++]=t},h=1;h<=n;++h)if(t[h]==s&&h!=n)++a;else{if(!s&&a>2){for(;a>138;a-=138)o(32754);a>2&&(o(a>10?a-11<<5|28690:a-3<<5|12305),a=0)}else if(a>3){for(o(s),--a;a>6;a-=6)o(8304);a>2&&(o(a-3<<5|8208),a=0)}for(;a--;)o(s);a=1,s=t[h]}return{c:e.subarray(0,i),n:n}},T=function(t,r){for(var n=0,e=0;e<r.length;++e)n+=t[e]*r[e];return n},k=function(t,r,n){var e=n.length,i=m(r+2);t[i]=255&e,t[i+1]=e>>8,t[i+2]=255^t[i],t[i+3]=255^t[i+1];for(var s=0;s<e;++s)t[i+s+4]=n[s];return 8*(i+4+e)},U=function(t,n,a,o,h,f,l,u,c,v,m){z(n,m++,a),++h[256];for(var b=x(h,15),M=b.t,E=b.l,A=x(f,15),U=A.t,C=A.l,F=D(M),I=F.c,S=F.n,L=D(U),O=L.c,j=L.n,q=new r(19),B=0;B<I.length;++B)++q[31&I[B]];for(B=0;B<O.length;++B)++q[31&O[B]];for(var G=x(q,7),H=G.t,J=G.l,K=19;K>4&&!H[s[K-1]];--K);var N,P,Q,R,V=v+5<<3,W=T(h,p)+T(f,g)+l,X=T(h,M)+T(f,U)+l+14+3*K+T(q,H)+2*q[16]+3*q[17]+7*q[18];if(c>=0&&V<=W&&V<=X)return k(n,m,t.subarray(c,c+v));if(z(n,m,1+(X<W)),m+=2,X<W){N=d(M,E,0),P=M,Q=d(U,C,0),R=U;var Y=d(H,J,0);z(n,m,S-257),z(n,m+5,j-1),z(n,m+10,K-4),m+=14;for(B=0;B<K;++B)z(n,m+3*B,H[s[B]]);m+=3*K;for(var Z=[I,O],$=0;$<2;++$){var tt=Z[$];for(B=0;B<tt.length;++B){var rt=31&tt[B];z(n,m,Y[rt]),m+=H[rt],rt>15&&(z(n,m,tt[B]>>5&127),m+=tt[B]>>12)}}}else N=w,P=p,Q=y,R=g;for(B=0;B<u;++B){var nt=o[B];if(nt>255){_(n,m,N[(rt=nt>>18&31)+257]),m+=P[rt+257],rt>7&&(z(n,m,nt>>23&31),m+=e[rt]);var et=31&nt;_(n,m,Q[et]),m+=R[et],et>3&&(_(n,m,nt>>5&8191),m+=i[et])}else _(n,m,N[nt]),m+=P[nt]}return _(n,m,N[256]),m+P[256]},C=new n([65540,131080,131088,131104,262176,1048704,1048832,2114560,2117632]),F=new t(0),I=function(){for(var t=new Int32Array(256),r=0;r<256;++r){for(var n=r,e=9;--e;)n=(1&n&&-306674912)^n>>>1;t[r]=n}return t}(),S=function(){var t=1,r=0;return{p:function(n){for(var e=t,i=r,s=0|n.length,a=0;a!=s;){for(var o=Math.min(a+2655,s);a<o;++a)i+=e+=n[a];e=(65535&e)+15*(e>>16),i=(65535&i)+15*(i>>16)}t=e,r=i},d:function(){return(255&(t%=65521))<<24|(65280&t)<<8|(255&(r%=65521))<<8|r>>8}}},L=function(s,a,o,h,u){if(!u&&(u={l:1},a.dictionary)){var c=a.dictionary.subarray(-32768),v=new t(c.length+s.length);v.set(c),v.set(s,c.length),s=v,u.w=c.length}return function(s,a,o,h,u,c){var v=c.z||s.length,d=new t(h+v+5*(1+Math.ceil(v/7e3))+u),p=d.subarray(h,d.length-u),g=c.l,w=7&(c.r||0);if(a){w&&(p[0]=c.r>>3);for(var y=C[a-1],M=y>>13,E=8191&y,z=(1<<o)-1,_=c.p||new r(32768),x=c.h||new r(z+1),A=Math.ceil(o/3),D=2*A,T=function(t){return(s[t]^s[t+1]<<A^s[t+2]<<D)&z},F=new n(25e3),I=new r(288),S=new r(32),L=0,O=0,j=c.i||0,q=0,B=c.w||0,G=0;j+2<v;++j){var H=T(j),J=32767&j,K=x[H];if(_[J]=K,x[H]=J,B<=j){var N=v-j;if((L>7e3||q>24576)&&(N>423||!g)){w=U(s,p,0,F,I,S,O,q,G,j-G,w),q=L=O=0,G=j;for(var P=0;P<286;++P)I[P]=0;for(P=0;P<30;++P)S[P]=0}var Q=2,R=0,V=E,W=J-K&32767;if(N>2&&H==T(j-W))for(var X=Math.min(M,N)-1,Y=Math.min(32767,j),Z=Math.min(258,N);W<=Y&&--V&&J!=K;){if(s[j+Q]==s[j+Q-W]){for(var $=0;$<Z&&s[j+$]==s[j+$-W];++$);if($>Q){if(Q=$,R=W,$>X)break;var tt=Math.min(W,$-2),rt=0;for(P=0;P<tt;++P){var nt=j-W+P&32767,et=nt-_[nt]&32767;et>rt&&(rt=et,K=nt)}}}W+=(J=K)-(K=_[J])&32767}if(R){F[q++]=268435456|f[Q]<<18|l[R];var it=31&f[Q],st=31&l[R];O+=e[it]+i[st],++I[257+it],++S[st],B=j+Q,++L}else F[q++]=s[j],++I[s[j]]}}for(j=Math.max(j,B);j<v;++j)F[q++]=s[j],++I[s[j]];w=U(s,p,g,F,I,S,O,q,G,j-G,w),g||(c.r=7&w|p[w/8|0]<<3,w-=7,c.h=x,c.p=_,c.i=j,c.w=B)}else{for(j=c.w||0;j<v+g;j+=65535){var at=j+65535;at>=v&&(p[w/8|0]=g,at=v),w=k(p,w+1,s.subarray(j,at))}c.i=v}return b(d,0,h+m(w)+u)}(s,null==a.level?6:a.level,null==a.mem?u.l?Math.ceil(1.5*Math.max(8,Math.min(13,Math.log(s.length)))):20:12+a.mem,o,h,u)},O=function(t,r,n){for(;n;++r)t[r]=n,n>>>=8},j=function(){function r(r,n){if("function"==typeof r&&(n=r,r={}),this.ondata=n,this.o=r||{},this.s={l:0,i:32768,w:32768,z:32768},this.b=new t(98304),this.o.dictionary){var e=this.o.dictionary.subarray(-32768);this.b.set(e,32768-e.length),this.s.i=32768-e.length}}return r.prototype.p=function(t,r){this.ondata(L(t,this.o,0,0,this.s),r)},r.prototype.push=function(r,n){this.ondata||E(5),this.s.l&&E(4);var e=r.length+this.s.z;if(e>this.b.length){if(e>2*this.b.length-32768){var i=new t(-32768&e);i.set(this.b.subarray(0,this.s.z)),this.b=i}var s=this.b.length-this.s.z;this.b.set(r.subarray(0,s),this.s.z),this.s.z=this.b.length,this.p(this.b,!1),this.b.set(this.b.subarray(-32768)),this.b.set(r.subarray(s),32768),this.s.z=r.length-s+32768,this.s.i=32766,this.s.w=32768}else this.b.set(r,this.s.z),this.s.z+=r.length;this.s.l=1&n,(this.s.z>this.s.w+8191||n)&&(this.p(this.b,n||!1),this.s.w=this.s.i,this.s.i-=2),n&&(this.s=this.o={},this.b=F)},r.prototype.flush=function(r){if(this.ondata||E(5),this.s.l&&E(4),this.p(this.b,!1),this.s.w=this.s.i,this.s.i-=2,r){var n=new t(6);n[0]=this.s.r>>3;var e=k(n,this.s.r,F);this.s.r=0,this.ondata(n.subarray(0,e>>3),!1)}},r}();function q(t,r){r||(r={});var n=function(){var t=-1;return{p:function(r){for(var n=t,e=0;e<r.length;++e)n=I[255&n^r[e]]^n>>>8;t=n},d:function(){return~t}}}(),e=t.length;n.p(t);var i,s=L(t,r,10+((i=r).filename?i.filename.length+1:0),8),a=s.length;return function(t,r){var n=r.filename;if(t[0]=31,t[1]=139,t[2]=8,t[8]=r.level<2?4:9==r.level?2:0,t[9]=3,0!=r.mtime&&O(t,4,Math.floor(new Date(r.mtime||Date.now())/1e3)),n){t[3]=8;for(var e=0;e<=n.length;++e)t[e+10]=n.charCodeAt(e)}}(s,r),O(s,a-8,n.d()),O(s,a-4,e),s}var B=function(){function t(t,r){this.c=S(),this.v=1,j.call(this,t,r)}return t.prototype.push=function(t,r){this.c.p(t),j.prototype.push.call(this,t,r)},t.prototype.p=function(t,r){var n=L(t,this.o,this.v&&(this.o.dictionary?6:2),r&&4,this.s);this.v&&(function(t,r){var n=r.level,e=0==n?0:n<6?1:9==n?3:2;if(t[0]=120,t[1]=e<<6|(r.dictionary&&32),t[1]|=31-(t[0]<<8|t[1])%31,r.dictionary){var i=S();i.p(r.dictionary),O(t,2,i.d())}}(n,this.o),this.v=0),r&&O(n,n.length-4,this.c.d()),this.ondata(n,r)},t.prototype.flush=function(t){j.prototype.flush.call(this,t)},t}(),G="undefined"!=typeof TextEncoder&&new TextEncoder,H="undefined"!=typeof TextDecoder&&new TextDecoder;try{H.decode(F,{stream:!0})}catch(t){}var J=function(){function t(t){this.ondata=t}return t.prototype.push=function(t,r){this.ondata||E(5),this.d&&E(4),this.ondata(K(t),this.d=r||!1)},t}();function K(r,n){if(G)return G.encode(r);for(var e=r.length,i=new t(r.length+(r.length>>1)),s=0,a=function(t){i[s++]=t},o=0;o<e;++o){if(s+5>i.length){var h=new t(s+8+(e-o<<1));h.set(i),i=h}var f=r.charCodeAt(o);f<128||n?a(f):f<2048?(a(192|f>>6),a(128|63&f)):f>55295&&f<57344?(a(240|(f=65536+(1047552&f)|1023&r.charCodeAt(++o))>>18),a(128|f>>12&63),a(128|f>>6&63),a(128|63&f)):(a(224|f>>12),a(128|f>>6&63),a(128|63&f))}return b(i,0,s)}const N=new class{constructor(){this._init()}clear(){this._init()}addEvent(t){if(!t)throw new Error("Adding invalid event");const r=this._hasEvents?",":"";this.stream.push(r+t),this._hasEvents=!0}finish(){this.stream.push("]",!0);const t=function(t){let r=0;for(const n of t)r+=n.length;const n=new Uint8Array(r);for(let r=0,e=0,i=t.length;r<i;r++){const i=t[r];n.set(i,e),e+=i.length}return n}(this._deflatedData);return this._init(),t}_init(){this._hasEvents=!1,this._deflatedData=[],this.deflate=new B,this.deflate.ondata=(t,r)=>{this._deflatedData.push(t)},this.stream=new J((t,r)=>{this.deflate.push(t,r)}),this.stream.push("[")}},P={clear:()=>{N.clear()},addEvent:t=>N.addEvent(t),finish:()=>N.finish(),compress:t=>function(t){return q(K(t))}(t)};addEventListener("message",function(t){const r=t.data.method,n=t.data.id,e=t.data.arg;if(r in P&&"function"==typeof P[r])try{const t=P[r](e);postMessage({id:n,method:r,success:!0,response:t})}catch(t){postMessage({id:n,method:r,success:!1,response:t.message}),console.error(t)}}),postMessage({id:void 0,method:"init",success:!0,response:void 0});`;
function e() {
	const e2 = new Blob([t$1], { type: "text/javascript" });
	return URL.createObjectURL(e2);
}
var CONSOLE_LEVELS = [
	"log",
	"warn",
	"error"
];
var PREFIX = "[Replay] ";
function _addBreadcrumb(message, level = "info") {
	addBreadcrumb({
		category: "console",
		data: { logger: "replay" },
		level,
		message: `${PREFIX}${message}`
	}, { level });
}
function makeReplayDebugLogger() {
	let _capture = false;
	let _trace = false;
	const _debug = {
		exception: () => void 0,
		infoTick: () => void 0,
		setConfig: (opts) => {
			_capture = !!opts.captureExceptions;
			_trace = !!opts.traceInternals;
		}
	};
	if (DEBUG_BUILD$1) {
		CONSOLE_LEVELS.forEach((name) => {
			_debug[name] = (...args) => {
				debug$2[name](PREFIX, ...args);
				if (_trace) _addBreadcrumb(args.join(""), severityLevelFromString(name));
			};
		});
		_debug.exception = (error, ...message) => {
			if (message.length && _debug.error) _debug.error(...message);
			debug$2.error(PREFIX, error);
			if (_capture) captureException(error, { mechanism: {
				handled: true,
				type: "auto.function.replay.debug"
			} });
			else if (_trace) _addBreadcrumb(error, "error");
		};
		_debug.infoTick = (...args) => {
			debug$2.log(PREFIX, ...args);
			if (_trace) setTimeout(() => _addBreadcrumb(args[0]), 0);
		};
	} else CONSOLE_LEVELS.forEach((name) => {
		_debug[name] = () => void 0;
	});
	return _debug;
}
var debug = makeReplayDebugLogger();
var EventBufferSizeExceededError = class extends Error {
	constructor() {
		super(`Event buffer exceeded maximum size of ${REPLAY_MAX_EVENT_BUFFER_SIZE}.`);
	}
};
var WorkerDestroyedError = class extends Error {
	constructor() {
		super("Worker destroyed");
	}
};
var EventBufferArray = class {
	constructor() {
		this.events = [];
		this._totalSize = 0;
		this.hasCheckout = false;
		this.waitForCheckout = false;
	}
	/** @inheritdoc */
	get hasEvents() {
		return this.events.length > 0;
	}
	/** @inheritdoc */
	get type() {
		return "sync";
	}
	/** @inheritdoc */
	destroy() {
		this.events = [];
	}
	/** @inheritdoc */
	async addEvent(event) {
		const eventSize = JSON.stringify(event).length;
		this._totalSize += eventSize;
		if (this._totalSize > REPLAY_MAX_EVENT_BUFFER_SIZE) throw new EventBufferSizeExceededError();
		this.events.push(event);
	}
	/** @inheritdoc */
	finish() {
		return new Promise((resolve) => {
			const eventsRet = this.events;
			this.clear();
			resolve(JSON.stringify(eventsRet));
		});
	}
	/** @inheritdoc */
	clear() {
		this.events = [];
		this._totalSize = 0;
		this.hasCheckout = false;
	}
	/** @inheritdoc */
	getEarliestTimestamp() {
		let ts = null;
		for (const { timestamp } of this.events) if (ts === null || timestamp < ts) ts = timestamp;
		return ts === null ? ts : timestampToMs(ts);
	}
};
var WorkerHandler = class {
	constructor(worker) {
		this._onMessage = ({ data }) => {
			const response = data;
			if (typeof response.id !== "number") return;
			const pending = this._pending.get(response.id);
			if (!pending || pending.method !== response.method) return;
			this._pending.delete(response.id);
			if (!response.success) {
				DEBUG_BUILD$1 && debug.error("Error in compression worker: ", response.response);
				pending.reject(/* @__PURE__ */ new Error("Error in compression worker"));
				return;
			}
			pending.resolve(response.response);
		};
		this._worker = worker;
		this._id = 0;
		this._pending = /* @__PURE__ */ new Map();
		this._worker.addEventListener("message", this._onMessage);
	}
	/**
	* Ensure the worker is ready (or not).
	* This will either resolve when the worker is ready, or reject if an error occurred.
	*/
	ensureReady() {
		if (this._ensureReadyPromise) return this._ensureReadyPromise;
		this._ensureReadyPromise = new Promise((resolve, reject) => {
			this._worker.addEventListener("message", ({ data }) => {
				if (data.success) resolve();
				else {
					DEBUG_BUILD$1 && debug.warn("Received worker message with unsuccessful status", data);
					reject(/* @__PURE__ */ new Error("Received worker message with unsuccessful status"));
				}
			}, { once: true });
			this._worker.addEventListener("error", (error) => {
				DEBUG_BUILD$1 && debug.warn("Failed to load Replay compression worker", error);
				reject(/* @__PURE__ */ new Error(`Failed to load Replay compression worker: ${error instanceof ErrorEvent && error.message ? error.message : "Unknown error. This can happen due to CSP policy restrictions, network issues, or the worker script failing to load."}`));
			}, { once: true });
		});
		return this._ensureReadyPromise;
	}
	/**
	* Destroy the worker.
	*/
	destroy() {
		DEBUG_BUILD$1 && debug.log("Destroying compression worker");
		this._worker.removeEventListener("message", this._onMessage);
		this._pending.forEach((pending) => pending.reject(new WorkerDestroyedError()));
		this._pending.clear();
		this._worker.terminate();
	}
	/**
	* Post message to worker and wait for response before resolving promise.
	*/
	postMessage(method, arg) {
		const id = this._getAndIncrementId();
		return new Promise((resolve, reject) => {
			this._pending.set(id, {
				method,
				resolve,
				reject
			});
			try {
				this._worker.postMessage({
					id,
					method,
					arg
				});
			} catch (error) {
				this._pending.delete(id);
				reject(error);
			}
		});
	}
	/** Get the current ID and increment it for the next call. */
	_getAndIncrementId() {
		return this._id++;
	}
};
var EventBufferCompressionWorker = class {
	constructor(worker) {
		this._worker = new WorkerHandler(worker);
		this._earliestTimestamp = null;
		this._totalSize = 0;
		this.hasCheckout = false;
		this.waitForCheckout = false;
	}
	/** @inheritdoc */
	get hasEvents() {
		return !!this._earliestTimestamp;
	}
	/** @inheritdoc */
	get type() {
		return "worker";
	}
	/**
	* Ensure the worker is ready (or not).
	* This will either resolve when the worker is ready, or reject if an error occurred.
	*/
	ensureReady() {
		return this._worker.ensureReady();
	}
	/**
	* Destroy the event buffer.
	*/
	destroy() {
		this._worker.destroy();
	}
	/**
	* Add an event to the event buffer.
	*
	* Returns true if event was successfully received and processed by worker.
	*/
	addEvent(event) {
		const timestamp = timestampToMs(event.timestamp);
		if (!this._earliestTimestamp || timestamp < this._earliestTimestamp) this._earliestTimestamp = timestamp;
		const data = JSON.stringify(event);
		this._totalSize += data.length;
		if (this._totalSize > REPLAY_MAX_EVENT_BUFFER_SIZE) return Promise.reject(new EventBufferSizeExceededError());
		return this._sendEventToWorker(data);
	}
	/**
	* Finish the event buffer and return the compressed data.
	*/
	finish() {
		return this._finishRequest();
	}
	/** @inheritdoc */
	clear() {
		this._earliestTimestamp = null;
		this._totalSize = 0;
		this.hasCheckout = false;
		this._worker.postMessage("clear").then(null, (e) => {
			DEBUG_BUILD$1 && debug.exception(e, "Sending \"clear\" message to worker failed", e);
		});
	}
	/** @inheritdoc */
	getEarliestTimestamp() {
		return this._earliestTimestamp;
	}
	/**
	* Send the event to the worker.
	*/
	_sendEventToWorker(data) {
		return this._worker.postMessage("addEvent", data);
	}
	/**
	* Finish the request and return the compressed data from the worker.
	*/
	async _finishRequest() {
		const response = await this._worker.postMessage("finish");
		this._earliestTimestamp = null;
		this._totalSize = 0;
		return response;
	}
};
var EventBufferProxy = class {
	constructor(worker) {
		this._fallback = new EventBufferArray();
		this._compression = new EventBufferCompressionWorker(worker);
		this._used = this._fallback;
		this._ensureWorkerIsLoadedPromise = this._ensureWorkerIsLoaded();
	}
	/** @inheritdoc */
	get waitForCheckout() {
		return this._used.waitForCheckout;
	}
	/** @inheritdoc */
	get type() {
		return this._used.type;
	}
	/** @inheritDoc */
	get hasEvents() {
		return this._used.hasEvents;
	}
	/** @inheritdoc */
	get hasCheckout() {
		return this._used.hasCheckout;
	}
	/** @inheritdoc */
	set hasCheckout(value) {
		this._used.hasCheckout = value;
	}
	/** @inheritdoc */
	set waitForCheckout(value) {
		this._used.waitForCheckout = value;
	}
	/** @inheritDoc */
	destroy() {
		this._fallback.destroy();
		this._compression.destroy();
	}
	/** @inheritdoc */
	clear() {
		return this._used.clear();
	}
	/** @inheritdoc */
	getEarliestTimestamp() {
		return this._used.getEarliestTimestamp();
	}
	/**
	* Add an event to the event buffer.
	*
	* Returns true if event was successfully added.
	*/
	addEvent(event) {
		return this._used.addEvent(event);
	}
	/** @inheritDoc */
	async finish() {
		await this.ensureWorkerIsLoaded();
		return this._used.finish();
	}
	/** Ensure the worker has loaded. */
	ensureWorkerIsLoaded() {
		return this._ensureWorkerIsLoadedPromise;
	}
	/** Actually check if the worker has been loaded. */
	async _ensureWorkerIsLoaded() {
		try {
			await this._compression.ensureReady();
		} catch (error) {
			DEBUG_BUILD$1 && debug.exception(error, "Failed to load the compression worker, falling back to simple buffer");
			return;
		}
		await this._switchToCompressionWorker();
	}
	/** Switch the used buffer to the compression worker. */
	async _switchToCompressionWorker() {
		const { events, hasCheckout, waitForCheckout } = this._fallback;
		const addEventPromises = [];
		for (const event of events) addEventPromises.push(this._compression.addEvent(event));
		this._compression.hasCheckout = hasCheckout;
		this._compression.waitForCheckout = waitForCheckout;
		this._used = this._compression;
		try {
			await Promise.all(addEventPromises);
			this._fallback.clear();
		} catch (error) {
			if (error instanceof WorkerDestroyedError) return;
			DEBUG_BUILD$1 && debug.exception(error, "Failed to add events when switching buffers.");
		}
	}
};
function createEventBuffer({ useCompression, workerUrl: customWorkerUrl }) {
	if (useCompression && window.Worker) {
		const worker = _loadWorker(customWorkerUrl);
		if (worker) return worker;
	}
	DEBUG_BUILD$1 && debug.log("Using simple buffer");
	return new EventBufferArray();
}
function _loadWorker(customWorkerUrl) {
	try {
		const workerUrl = customWorkerUrl || _getWorkerUrl();
		if (!workerUrl) return;
		DEBUG_BUILD$1 && debug.log(`Using compression worker${customWorkerUrl ? ` from ${customWorkerUrl}` : ""}`);
		return new EventBufferProxy(new Worker(workerUrl));
	} catch (error) {
		DEBUG_BUILD$1 && debug.exception(error, "Failed to create compression worker");
	}
}
function _getWorkerUrl() {
	if (typeof __SENTRY_EXCLUDE_REPLAY_WORKER__ === "undefined" || !__SENTRY_EXCLUDE_REPLAY_WORKER__) return e();
	return "";
}
function hasSessionStorage() {
	try {
		return "sessionStorage" in WINDOW$1 && !!WINDOW$1.sessionStorage;
	} catch {
		return false;
	}
}
function clearSession(replay) {
	deleteSession();
	replay.session = void 0;
}
function deleteSession() {
	if (!hasSessionStorage()) return;
	try {
		WINDOW$1.sessionStorage.removeItem(REPLAY_SESSION_KEY);
	} catch {}
}
function isSampled(sampleRate) {
	if (sampleRate === void 0) return false;
	return Math.random() < sampleRate;
}
function saveSession(session) {
	if (!hasSessionStorage()) return;
	try {
		WINDOW$1.sessionStorage.setItem(REPLAY_SESSION_KEY, JSON.stringify(session));
	} catch {}
}
function makeSession(session) {
	const now = Date.now();
	return {
		id: session.id || uuid4(),
		started: session.started || now,
		lastActivity: session.lastActivity || now,
		segmentId: session.segmentId || 0,
		sampled: session.sampled,
		previousSessionId: session.previousSessionId,
		dirty: session.dirty || false
	};
}
function getSessionSampleType(sessionSampleRate, allowBuffering) {
	return isSampled(sessionSampleRate) ? "session" : allowBuffering ? "buffer" : false;
}
function createSession({ sessionSampleRate, allowBuffering, stickySession = false }, { previousSessionId } = {}) {
	const session = makeSession({
		sampled: getSessionSampleType(sessionSampleRate, allowBuffering),
		previousSessionId
	});
	if (stickySession) saveSession(session);
	return session;
}
function fetchSession() {
	if (!hasSessionStorage()) return null;
	try {
		const sessionStringFromStorage = WINDOW$1.sessionStorage.getItem(REPLAY_SESSION_KEY);
		if (!sessionStringFromStorage) return null;
		const sessionObj = JSON.parse(sessionStringFromStorage);
		DEBUG_BUILD$1 && debug.infoTick("Loading existing session");
		return makeSession(sessionObj);
	} catch {
		return null;
	}
}
function isExpired(initialTime, expiry, targetTime = +/* @__PURE__ */ new Date()) {
	if (initialTime === null || expiry === void 0 || expiry < 0) return true;
	if (expiry === 0) return false;
	return initialTime + expiry <= targetTime;
}
function isSessionExpired(session, { maxReplayDuration, sessionIdleExpire, targetTime = Date.now() }) {
	return isExpired(session.started, maxReplayDuration, targetTime) || isExpired(session.lastActivity, sessionIdleExpire, targetTime);
}
function shouldRefreshSession(session, { sessionIdleExpire, maxReplayDuration }) {
	if (!isSessionExpired(session, {
		sessionIdleExpire,
		maxReplayDuration
	})) return false;
	if (session.sampled === "buffer" && session.segmentId === 0) return false;
	return true;
}
function loadOrCreateSession({ sessionIdleExpire, maxReplayDuration, previousSessionId }, sessionOptions) {
	const existingSession = sessionOptions.stickySession && fetchSession();
	if (!existingSession) {
		DEBUG_BUILD$1 && debug.infoTick("Creating new session");
		return createSession(sessionOptions, { previousSessionId });
	}
	if (!shouldRefreshSession(existingSession, {
		sessionIdleExpire,
		maxReplayDuration
	})) return existingSession;
	DEBUG_BUILD$1 && debug.infoTick("Session in sessionStorage is expired, creating new one...");
	return createSession(sessionOptions, { previousSessionId: existingSession.id });
}
function isCustomEvent(event) {
	return event.type === EventType.Custom;
}
function addEventSync(replay, event, isCheckout) {
	if (!shouldAddEvent(replay, event)) return false;
	_addEvent(replay, event, isCheckout);
	return true;
}
function addEvent(replay, event, isCheckout) {
	if (!shouldAddEvent(replay, event)) return Promise.resolve(null);
	return _addEvent(replay, event, isCheckout);
}
async function _addEvent(replay, event, isCheckout) {
	const { eventBuffer } = replay;
	if (!eventBuffer || eventBuffer.waitForCheckout && !isCheckout) return null;
	const isBufferMode = replay.recordingMode === "buffer";
	try {
		if (isCheckout && isBufferMode) eventBuffer.clear();
		if (isCheckout) {
			eventBuffer.hasCheckout = true;
			eventBuffer.waitForCheckout = false;
		}
		const eventAfterPossibleCallback = maybeApplyCallback(event, replay.getOptions().beforeAddRecordingEvent);
		if (!eventAfterPossibleCallback) return;
		return await eventBuffer.addEvent(eventAfterPossibleCallback);
	} catch (error) {
		if (!replay.isEnabled()) {
			replay.handleException(error);
			return null;
		}
		const isExceeded = error && error instanceof EventBufferSizeExceededError;
		const reason = isExceeded ? "eventBufferOverflow" : "eventBufferError";
		const client = getClient();
		if (client) {
			const dropReason = isExceeded ? "buffer_overflow" : "internal_sdk_error";
			client.recordDroppedEvent(dropReason, "replay");
		}
		if (isExceeded && isBufferMode) {
			eventBuffer.clear();
			eventBuffer.waitForCheckout = true;
			return null;
		}
		replay.handleException(error);
		await replay.stop({ reason });
	}
}
function shouldAddEvent(replay, event) {
	if (!replay.eventBuffer || replay.isPaused() || !replay.isEnabled()) return false;
	const timestampInMs = timestampToMs(event.timestamp);
	if (timestampInMs + replay.timeouts.sessionIdlePause < Date.now()) return false;
	if (timestampInMs > replay.getContext().initialTimestamp + replay.getOptions().maxReplayDuration) {
		DEBUG_BUILD$1 && debug.infoTick(`Skipping event with timestamp ${timestampInMs} because it is after maxReplayDuration`);
		return false;
	}
	return true;
}
function maybeApplyCallback(event, callback) {
	try {
		if (typeof callback === "function" && isCustomEvent(event)) return callback(event);
	} catch (error) {
		DEBUG_BUILD$1 && debug.exception(error, "An error occurred in the `beforeAddRecordingEvent` callback, skipping the event...");
		return null;
	}
	return event;
}
var MAX_CONTEXT_VALUES = 100;
function addSegmentDetailsToContext(replay, traceId, segmentName) {
	const replayContext = replay.getContext();
	if (traceId && replayContext.traceIds.size < MAX_CONTEXT_VALUES) replayContext.traceIds.add(traceId);
	if (segmentName && replayContext.segmentNames.size < MAX_CONTEXT_VALUES) replayContext.segmentNames.add(segmentName);
}
function handleProcessSegmentSpan(replay) {
	return (spanJSON) => {
		if (!replay.isEnabled()) return;
		addSegmentDetailsToContext(replay, spanJSON.trace_id, spanJSON.name || void 0);
	};
}
function isErrorEvent(event) {
	return !event.type;
}
function isTransactionEvent(event) {
	return event.type === "transaction";
}
function isReplayEvent(event) {
	return event.type === "replay_event";
}
function isFeedbackEvent(event) {
	return event.type === "feedback";
}
function handleAfterSendEvent(replay) {
	return (event, sendResponse) => {
		if (!replay.isEnabled() || !isErrorEvent(event) && !isTransactionEvent(event)) return;
		const statusCode = sendResponse.statusCode;
		if (!statusCode || statusCode < 200 || statusCode >= 300) return;
		if (isTransactionEvent(event)) {
			handleTransactionEvent(replay, event);
			return;
		}
		handleErrorEvent(replay, event);
	};
}
function handleTransactionEvent(replay, event) {
	addSegmentDetailsToContext(replay, event.contexts?.trace?.trace_id, event.transaction);
}
function handleErrorEvent(replay, event) {
	const replayContext = replay.getContext();
	if (event.event_id && replayContext.errorIds.size < 100) replayContext.errorIds.add(event.event_id);
	if (replay.recordingMode !== "buffer" || !event.tags?.replayId) return;
	const { beforeErrorSampling } = replay.getOptions();
	if (typeof beforeErrorSampling === "function" && !beforeErrorSampling(event)) return;
	setTimeout$3(async () => {
		try {
			await replay.sendBufferedReplayOrFlush();
		} catch (err) {
			replay.handleException(err);
		}
	});
}
function handleBeforeSendEvent(replay) {
	return (event) => {
		if (!replay.isEnabled() || !isErrorEvent(event)) return;
		handleHydrationError(replay, event);
	};
}
function handleHydrationError(replay, event) {
	const exceptionValue = event.exception?.values?.[0]?.value;
	if (typeof exceptionValue !== "string") return;
	if (exceptionValue.match(/(reactjs\.org\/docs\/error-decoder\.html\?invariant=|react\.dev\/errors\/)(418|419|422|423|425)/) || exceptionValue.match(/(does not match server-rendered HTML|Hydration failed because)/i)) addBreadcrumbEvent(replay, createBreadcrumb({
		category: "replay.hydrate-error",
		data: { url: getLocationHref() }
	}));
}
function handleBreadcrumbs(replay) {
	const client = getClient();
	if (!client) return;
	client.on("beforeAddBreadcrumb", (breadcrumb) => beforeAddBreadcrumb(replay, breadcrumb));
}
function beforeAddBreadcrumb(replay, breadcrumb) {
	if (!replay.isEnabled() || !isBreadcrumbWithCategory(breadcrumb)) return;
	const result = normalizeBreadcrumb(breadcrumb);
	if (result) addBreadcrumbEvent(replay, result);
}
function normalizeBreadcrumb(breadcrumb) {
	if (!isBreadcrumbWithCategory(breadcrumb) || [
		"fetch",
		"xhr",
		"sentry.event",
		"sentry.transaction"
	].includes(breadcrumb.category) || breadcrumb.category.startsWith("ui.")) return null;
	if (breadcrumb.category === "console") return normalizeConsoleBreadcrumb(breadcrumb);
	return createBreadcrumb(breadcrumb);
}
function normalizeConsoleBreadcrumb(breadcrumb) {
	const args = breadcrumb.data?.arguments;
	if (!Array.isArray(args) || args.length === 0) return createBreadcrumb(breadcrumb);
	let isTruncated = false;
	const normalizedArgs = args.map((arg) => {
		if (!arg) return arg;
		if (typeof arg === "string") {
			if (arg.length > CONSOLE_ARG_MAX_SIZE) {
				isTruncated = true;
				return `${arg.slice(0, CONSOLE_ARG_MAX_SIZE)}\u2026`;
			}
			return arg;
		}
		if (typeof arg === "object") try {
			const normalizedArg = normalize(arg, 7);
			if (JSON.stringify(normalizedArg).length > CONSOLE_ARG_MAX_SIZE) {
				isTruncated = true;
				return `${JSON.stringify(normalizedArg, null, 2).slice(0, CONSOLE_ARG_MAX_SIZE)}\u2026`;
			}
			return normalizedArg;
		} catch {}
		return arg;
	});
	return createBreadcrumb({
		...breadcrumb,
		data: {
			...breadcrumb.data,
			arguments: normalizedArgs,
			...isTruncated ? { _meta: { warnings: ["CONSOLE_ARG_TRUNCATED"] } } : {}
		}
	});
}
function isBreadcrumbWithCategory(breadcrumb) {
	return !!breadcrumb.category;
}
function isRrwebError(event, hint) {
	if (event.type || !event.exception?.values?.length) return false;
	if (hint.originalException?.__rrweb__) return true;
	return false;
}
function resetReplayIdOnDynamicSamplingContext() {
	const dsc = getCurrentScope().getPropagationContext().dsc;
	if (dsc) delete dsc.replay_id;
	const activeSpan = getActiveSpan();
	if (activeSpan) {
		const dsc2 = getDynamicSamplingContextFromSpan(activeSpan);
		delete dsc2.replay_id;
	}
}
function setReplayIdOnDynamicSamplingContext(replayId) {
	const dsc = getCurrentScope().getPropagationContext().dsc;
	if (dsc) dsc.replay_id = replayId;
	const activeSpan = getActiveSpan();
	if (activeSpan) {
		const dsc2 = getDynamicSamplingContextFromSpan(activeSpan);
		dsc2.replay_id = replayId;
	}
}
function addFeedbackBreadcrumb(replay, event) {
	replay.triggerUserActivity();
	replay.addUpdate(() => {
		if (!event.timestamp) return true;
		replay.throttledAddEvent({
			type: EventType.Custom,
			timestamp: event.timestamp * 1e3,
			data: {
				tag: "breadcrumb",
				payload: {
					timestamp: event.timestamp,
					type: "default",
					category: "sentry.feedback",
					data: { feedbackId: event.event_id }
				}
			}
		});
		return false;
	});
}
function shouldSampleForBufferEvent(replay, event) {
	if (replay.recordingMode !== "buffer") return false;
	if (event.message === UNABLE_TO_SEND_REPLAY) return false;
	if (!event.exception || event.type) return false;
	if (event.sdkProcessingMetadata?.hasDefaultSyntheticStacktrace) return false;
	return isSampled(replay.getOptions().errorSampleRate);
}
function handleGlobalEventListener(replay) {
	return Object.assign((event, hint) => {
		if (replay.session && shouldRefreshSession(replay.session, {
			maxReplayDuration: replay.getOptions().maxReplayDuration,
			sessionIdleExpire: replay.timeouts.sessionIdleExpire
		})) resetReplayIdOnDynamicSamplingContext();
		if (!replay.isEnabled() || replay.isPaused()) return event;
		if (isReplayEvent(event)) {
			delete event.breadcrumbs;
			return event;
		}
		if (!isErrorEvent(event) && !isTransactionEvent(event) && !isFeedbackEvent(event)) return event;
		if (!replay.checkAndHandleExpiredSession()) {
			resetReplayIdOnDynamicSamplingContext();
			return event;
		}
		if (isFeedbackEvent(event)) {
			const sessionId = replay.getSessionId();
			const feedbackReplayId = event.contexts.feedback.replay_id;
			if (feedbackReplayId && feedbackReplayId !== sessionId) return event;
			replay.flush();
			event.contexts.feedback.replay_id = sessionId;
			addFeedbackBreadcrumb(replay, event);
			return event;
		}
		if (isRrwebError(event, hint) && !replay.getOptions()._experiments.captureExceptions) {
			DEBUG_BUILD$1 && debug.log("Ignoring error from rrweb internals", event);
			return null;
		}
		const isErrorEventSampled = shouldSampleForBufferEvent(replay, event);
		if (isErrorEventSampled || replay.recordingMode === "session") event.tags = {
			...event.tags,
			replayId: replay.getSessionId()
		};
		if (isErrorEventSampled && replay.recordingMode === "buffer" && replay.session?.sampled === "buffer") {
			const session = replay.session;
			session.dirty = true;
			if (replay.getOptions().stickySession) saveSession(session);
		}
		return event;
	}, { id: "Replay" });
}
function createPerformanceSpans(replay, entries) {
	return entries.map(({ type, start, end, name, data }) => {
		const response = replay.throttledAddEvent({
			type: EventType.Custom,
			timestamp: start,
			data: {
				tag: "performanceSpan",
				payload: {
					op: type,
					description: name,
					startTimestamp: start,
					endTimestamp: end,
					data
				}
			}
		});
		return typeof response === "string" ? Promise.resolve(null) : response;
	});
}
function handleHistory(handlerData) {
	const { from, to } = handlerData;
	const now = Date.now() / 1e3;
	return {
		type: "navigation.push",
		start: now,
		end: now,
		name: to,
		data: { previous: from }
	};
}
function handleHistorySpanListener(replay) {
	return (handlerData) => {
		if (!replay.isEnabled()) return;
		const result = handleHistory(handlerData);
		if (result === null) return;
		replay.getContext().urls.push(result.name);
		replay.triggerUserActivity();
		replay.addUpdate(() => {
			createPerformanceSpans(replay, [result]);
			return false;
		});
	};
}
function shouldFilterRequest(replay, url) {
	if (DEBUG_BUILD$1 && replay.getOptions()._experiments.traceInternals) return false;
	return isSentryRequestUrl(url, getClient());
}
function addNetworkBreadcrumb(replay, result) {
	if (!replay.isEnabled()) return;
	if (result === null) return;
	if (shouldFilterRequest(replay, result.name)) return;
	replay.addUpdate(() => {
		createPerformanceSpans(replay, [result]);
		return true;
	});
}
function getBodySize(body) {
	if (!body) return;
	const textEncoder = new TextEncoder();
	try {
		if (typeof body === "string") return textEncoder.encode(body).length;
		if (body instanceof URLSearchParams) return textEncoder.encode(body.toString()).length;
		if (body instanceof FormData) {
			const formDataStr = serializeFormData(body);
			return textEncoder.encode(formDataStr).length;
		}
		if (body instanceof Blob) return body.size;
		if (body instanceof ArrayBuffer) return body.byteLength;
	} catch {}
}
function parseContentLengthHeader(header) {
	if (!header) return;
	const size = parseInt(header, 10);
	return isNaN(size) ? void 0 : size;
}
function mergeWarning(info, warning) {
	if (!info) return {
		headers: {},
		size: void 0,
		_meta: { warnings: [warning] }
	};
	const newMeta = { ...info._meta };
	newMeta.warnings = [...newMeta.warnings || [], warning];
	info._meta = newMeta;
	return info;
}
function makeNetworkReplayBreadcrumb(type, data) {
	if (!data) return null;
	const { startTimestamp, endTimestamp, url, method, statusCode, request, response } = data;
	return {
		type,
		start: startTimestamp / 1e3,
		end: endTimestamp / 1e3,
		name: url,
		data: {
			method,
			statusCode,
			request,
			response
		}
	};
}
function buildSkippedNetworkRequestOrResponse(bodySize) {
	return {
		headers: {},
		size: bodySize,
		_meta: { warnings: ["URL_SKIPPED"] }
	};
}
function buildNetworkRequestOrResponse(headers, bodySize, body) {
	if (!bodySize && Object.keys(headers).length === 0) return;
	if (!bodySize) return { headers };
	if (!body) return {
		headers,
		size: bodySize
	};
	const info = {
		headers,
		size: bodySize
	};
	const { body: normalizedBody, warnings } = normalizeNetworkBody(body);
	info.body = normalizedBody;
	if (warnings?.length) info._meta = { warnings };
	return info;
}
function getAllowedHeaders(headers, allowedHeaders) {
	return Object.entries(headers).reduce((filteredHeaders, [key, value]) => {
		const normalizedKey = key.toLowerCase();
		if (allowedHeaders.includes(normalizedKey) && headers[key]) filteredHeaders[normalizedKey] = value;
		return filteredHeaders;
	}, {});
}
function normalizeNetworkBody(body) {
	if (!body || typeof body !== "string") return { body };
	const exceedsSizeLimit = body.length > NETWORK_BODY_MAX_SIZE;
	const isProbablyJson = _strIsProbablyJson(body);
	if (exceedsSizeLimit) {
		const truncatedBody = body.slice(0, NETWORK_BODY_MAX_SIZE);
		if (isProbablyJson) return {
			body: truncatedBody,
			warnings: ["MAYBE_JSON_TRUNCATED"]
		};
		return {
			body: `${truncatedBody}\u2026`,
			warnings: ["TEXT_TRUNCATED"]
		};
	}
	if (isProbablyJson) try {
		return { body: JSON.parse(body) };
	} catch {}
	return { body };
}
function _strIsProbablyJson(str) {
	const first = str[0];
	const last = str[str.length - 1];
	return first === "[" && last === "]" || first === "{" && last === "}";
}
function urlMatches(url, urls) {
	return stringMatchesSomePattern(getFullUrl(url), urls);
}
function getFullUrl(url, baseURI = WINDOW$1.document.baseURI) {
	if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith(WINDOW$1.location.origin)) return url;
	const fixedUrl = new URL(url, baseURI);
	if (fixedUrl.origin !== new URL(baseURI).origin) return url;
	const fullUrl = fixedUrl.href;
	if (!url.endsWith("/") && fullUrl.endsWith("/")) return fullUrl.slice(0, -1);
	return fullUrl;
}
async function captureFetchBreadcrumbToReplay(breadcrumb, hint, options) {
	try {
		const result = makeNetworkReplayBreadcrumb("resource.fetch", await _prepareFetchData(breadcrumb, hint, options));
		addNetworkBreadcrumb(options.replay, result);
	} catch (error) {
		DEBUG_BUILD$1 && debug.exception(error, "Failed to capture fetch breadcrumb");
	}
}
function enrichFetchBreadcrumb(breadcrumb, hint) {
	const { input, response } = hint;
	const reqSize = getBodySize(input ? getFetchRequestArgBody(input) : void 0);
	const resSize = response ? parseContentLengthHeader(response.headers.get("content-length")) : void 0;
	if (reqSize !== void 0) breadcrumb.data.request_body_size = reqSize;
	if (resSize !== void 0) breadcrumb.data.response_body_size = resSize;
}
async function _prepareFetchData(breadcrumb, hint, options) {
	const now = Date.now();
	const { startTimestamp = now, endTimestamp = now } = hint;
	const { url, method, status_code: statusCode = 0, request_body_size: requestBodySize, response_body_size: responseBodySize } = breadcrumb.data;
	const captureDetails = urlMatches(url, options.networkDetailAllowUrls) && !urlMatches(url, options.networkDetailDenyUrls);
	return {
		startTimestamp,
		endTimestamp,
		url,
		method,
		statusCode,
		request: captureDetails ? _getRequestInfo(options, hint.input, requestBodySize) : buildSkippedNetworkRequestOrResponse(requestBodySize),
		response: await _getResponseInfo(captureDetails, options, hint.response, responseBodySize)
	};
}
function _getRequestInfo({ networkCaptureBodies, networkRequestHeaders }, input, requestBodySize) {
	const headers = input ? getRequestHeaders(input, networkRequestHeaders) : {};
	if (!networkCaptureBodies) return buildNetworkRequestOrResponse(headers, requestBodySize, void 0);
	const [bodyStr, warning] = getBodyString(getFetchRequestArgBody(input), debug);
	const data = buildNetworkRequestOrResponse(headers, requestBodySize, bodyStr);
	if (warning) return mergeWarning(data, warning);
	return data;
}
async function _getResponseInfo(captureDetails, { networkCaptureBodies, networkResponseHeaders }, response, responseBodySize) {
	if (!captureDetails && responseBodySize !== void 0) return buildSkippedNetworkRequestOrResponse(responseBodySize);
	const headers = response ? getAllHeaders(response.headers, networkResponseHeaders) : {};
	if (!response || !networkCaptureBodies && responseBodySize !== void 0) return buildNetworkRequestOrResponse(headers, responseBodySize, void 0);
	const [bodyText, warning] = await _parseFetchResponseBody(response);
	const result = getResponseData(bodyText, {
		networkCaptureBodies,
		responseBodySize,
		captureDetails,
		headers
	});
	if (warning) return mergeWarning(result, warning);
	return result;
}
function getResponseData(bodyText, { networkCaptureBodies, responseBodySize, captureDetails, headers }) {
	try {
		const size = bodyText?.length && responseBodySize === void 0 ? getBodySize(bodyText) : responseBodySize;
		if (!captureDetails) return buildSkippedNetworkRequestOrResponse(size);
		if (networkCaptureBodies) return buildNetworkRequestOrResponse(headers, size, bodyText);
		return buildNetworkRequestOrResponse(headers, size, void 0);
	} catch (error) {
		DEBUG_BUILD$1 && debug.exception(error, "Failed to serialize response body");
		return buildNetworkRequestOrResponse(headers, responseBodySize, void 0);
	}
}
async function _parseFetchResponseBody(response) {
	const res = _tryCloneResponse(response);
	if (!res) return [void 0, "BODY_PARSE_ERROR"];
	try {
		return [await _tryGetResponseText(res)];
	} catch (error) {
		if (error instanceof Error && error.message.indexOf("Timeout") > -1) {
			DEBUG_BUILD$1 && debug.warn("Parsing text body from response timed out");
			return [void 0, "BODY_PARSE_TIMEOUT"];
		}
		DEBUG_BUILD$1 && debug.exception(error, "Failed to get text body from response");
		return [void 0, "BODY_PARSE_ERROR"];
	}
}
function getAllHeaders(headers, allowedHeaders) {
	const allHeaders = {};
	allowedHeaders.forEach((header) => {
		if (headers.get(header)) allHeaders[header] = headers.get(header);
	});
	return allHeaders;
}
function getRequestHeaders(fetchArgs, allowedHeaders) {
	if (fetchArgs.length === 1 && typeof fetchArgs[0] !== "string") return getHeadersFromOptions(fetchArgs[0], allowedHeaders);
	if (fetchArgs.length === 2) return getHeadersFromOptions(fetchArgs[1], allowedHeaders);
	return {};
}
function getHeadersFromOptions(input, allowedHeaders) {
	if (!input) return {};
	const headers = input.headers;
	if (!headers) return {};
	if (headers instanceof Headers) return getAllHeaders(headers, allowedHeaders);
	if (Array.isArray(headers)) return {};
	return getAllowedHeaders(headers, allowedHeaders);
}
function _tryCloneResponse(response) {
	try {
		return response.clone();
	} catch (error) {
		DEBUG_BUILD$1 && debug.exception(error, "Failed to clone response body");
	}
}
function _tryGetResponseText(response) {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout$3(() => reject(/* @__PURE__ */ new Error("Timeout while trying to read response body")), 500);
		_getResponseText(response).then((txt) => resolve(txt), (reason) => reject(reason)).finally(() => clearTimeout(timeout));
	});
}
async function _getResponseText(response) {
	return response.text();
}
async function captureXhrBreadcrumbToReplay(breadcrumb, hint, options) {
	try {
		const result = makeNetworkReplayBreadcrumb("resource.xhr", _prepareXhrData(breadcrumb, hint, options));
		addNetworkBreadcrumb(options.replay, result);
	} catch (error) {
		DEBUG_BUILD$1 && debug.exception(error, "Failed to capture xhr breadcrumb");
	}
}
function enrichXhrBreadcrumb(breadcrumb, hint) {
	const { xhr, input } = hint;
	if (!xhr) return;
	const reqSize = getBodySize(input);
	const resSize = xhr.getResponseHeader("content-length") ? parseContentLengthHeader(xhr.getResponseHeader("content-length")) : _getBodySize(xhr.response, xhr.responseType);
	if (reqSize !== void 0) breadcrumb.data.request_body_size = reqSize;
	if (resSize !== void 0) breadcrumb.data.response_body_size = resSize;
}
function _prepareXhrData(breadcrumb, hint, options) {
	const now = Date.now();
	const { startTimestamp = now, endTimestamp = now, input, xhr } = hint;
	const { url, method, status_code: statusCode = 0, request_body_size: requestBodySize, response_body_size: responseBodySize } = breadcrumb.data;
	if (!url) return null;
	if (!xhr || !urlMatches(url, options.networkDetailAllowUrls) || urlMatches(url, options.networkDetailDenyUrls)) return {
		startTimestamp,
		endTimestamp,
		url,
		method,
		statusCode,
		request: buildSkippedNetworkRequestOrResponse(requestBodySize),
		response: buildSkippedNetworkRequestOrResponse(responseBodySize)
	};
	const xhrInfo = xhr[SENTRY_XHR_DATA_KEY];
	const networkRequestHeaders = xhrInfo ? getAllowedHeaders(xhrInfo.request_headers, options.networkRequestHeaders) : {};
	const networkResponseHeaders = getAllowedHeaders(parseXhrResponseHeaders(xhr), options.networkResponseHeaders);
	const [requestBody, requestWarning] = options.networkCaptureBodies ? getBodyString(input, debug) : [void 0];
	const [responseBody, responseWarning] = options.networkCaptureBodies ? _getXhrResponseBody(xhr) : [void 0];
	const request = buildNetworkRequestOrResponse(networkRequestHeaders, requestBodySize, requestBody);
	const response = buildNetworkRequestOrResponse(networkResponseHeaders, responseBodySize, responseBody);
	return {
		startTimestamp,
		endTimestamp,
		url,
		method,
		statusCode,
		request: requestWarning ? mergeWarning(request, requestWarning) : request,
		response: responseWarning ? mergeWarning(response, responseWarning) : response
	};
}
function _getXhrResponseBody(xhr) {
	const errors = [];
	try {
		return [xhr.responseText];
	} catch (e) {
		errors.push(e);
	}
	try {
		return _parseXhrResponse(xhr.response, xhr.responseType);
	} catch (e) {
		errors.push(e);
	}
	DEBUG_BUILD$1 && debug.warn("Failed to get xhr response body", ...errors);
	return [void 0];
}
function _parseXhrResponse(body, responseType) {
	try {
		if (typeof body === "string") return [body];
		if (body instanceof Document) return [body.body.outerHTML];
		if (responseType === "json" && isObjectLike(body)) return [JSON.stringify(body)];
		if (!body) return [void 0];
	} catch (error) {
		DEBUG_BUILD$1 && debug.exception(error, "Failed to serialize body", body);
		return [void 0, "BODY_PARSE_ERROR"];
	}
	DEBUG_BUILD$1 && debug.log("Skipping network body because of body type", body);
	return [void 0, "UNPARSEABLE_BODY_TYPE"];
}
function _getBodySize(body, responseType) {
	try {
		return getBodySize(responseType === "json" && isObjectLike(body) ? JSON.stringify(body) : body);
	} catch {
		return;
	}
}
function handleNetworkBreadcrumbs(replay) {
	const client = getClient();
	try {
		const { networkDetailAllowUrls, networkDetailDenyUrls, networkCaptureBodies, networkRequestHeaders, networkResponseHeaders } = replay.getOptions();
		const options = {
			replay,
			networkDetailAllowUrls,
			networkDetailDenyUrls,
			networkCaptureBodies,
			networkRequestHeaders,
			networkResponseHeaders
		};
		if (client) client.on("beforeAddBreadcrumb", (breadcrumb, hint) => beforeAddNetworkBreadcrumb(options, breadcrumb, hint));
	} catch {}
}
function beforeAddNetworkBreadcrumb(options, breadcrumb, hint) {
	if (!breadcrumb.data) return;
	try {
		if (_isXhrBreadcrumb(breadcrumb) && _isXhrHint(hint)) {
			enrichXhrBreadcrumb(breadcrumb, hint);
			captureXhrBreadcrumbToReplay(breadcrumb, hint, options);
		}
		if (_isFetchBreadcrumb(breadcrumb) && _isFetchHint(hint)) {
			enrichFetchBreadcrumb(breadcrumb, hint);
			captureFetchBreadcrumbToReplay(breadcrumb, hint, options);
		}
	} catch (e) {
		DEBUG_BUILD$1 && debug.exception(e, "Error when enriching network breadcrumb");
	}
}
function _isXhrBreadcrumb(breadcrumb) {
	return breadcrumb.category === "xhr";
}
function _isFetchBreadcrumb(breadcrumb) {
	return breadcrumb.category === "fetch";
}
function _isXhrHint(hint) {
	return hint?.xhr;
}
function _isFetchHint(hint) {
	return hint?.input !== void 0;
}
function addGlobalListeners(replay) {
	const client = getClient();
	addClickKeypressInstrumentationHandler(handleDomListener(replay));
	addHistoryInstrumentationHandler(handleHistorySpanListener(replay));
	handleBreadcrumbs(replay);
	handleNetworkBreadcrumbs(replay);
	addEventProcessor(handleGlobalEventListener(replay));
	if (client) {
		client.on("beforeSendEvent", handleBeforeSendEvent(replay));
		client.on("afterSendEvent", handleAfterSendEvent(replay));
		client.on("createDsc", (dsc) => {
			const replayId = replay.getSessionId();
			if (replayId && replay.isEnabled() && replay.recordingMode === "session") {
				if (replay.checkAndHandleExpiredSession()) dsc.replay_id = replayId;
			}
		});
		client.on("processSegmentSpan", handleProcessSegmentSpan(replay));
		client.on("spanStart", (span) => {
			replay.lastActiveSpan = span;
		});
		client.on("spanEnd", (span) => {
			replay.lastActiveSpan = span;
		});
		let replayIdOnFeedbackOpen;
		client.on("beforeSendFeedback", async (feedbackEvent, options) => {
			const feedbackContext = feedbackEvent.contexts?.feedback;
			if (!options?.includeReplay || !feedbackContext) return;
			if (feedbackContext.source === "widget" && replayIdOnFeedbackOpen) {
				feedbackContext.replay_id = replayIdOnFeedbackOpen;
				replayIdOnFeedbackOpen = void 0;
				return;
			}
			const replayId = replay.getSessionId();
			if (replay.isEnabled() && replayId) {
				if (feedbackContext.source === "api") await replay.sendBufferedReplayOrFlush();
				feedbackContext.replay_id = replayId;
			}
		});
		client.on("openFeedbackWidget", async () => {
			replayIdOnFeedbackOpen = void 0;
			await replay.sendBufferedReplayOrFlush();
			replayIdOnFeedbackOpen = replay.isEnabled() ? replay.getSessionId() : void 0;
		});
	}
}
async function addMemoryEntry(replay) {
	try {
		return await Promise.all(createPerformanceSpans(replay, [createMemoryEntry(WINDOW$1.performance.memory)]));
	} catch {
		return [];
	}
}
function createMemoryEntry(memoryEntry) {
	const { jsHeapSizeLimit, totalJSHeapSize, usedJSHeapSize } = memoryEntry;
	const time = Date.now() / 1e3;
	return {
		type: "memory",
		name: "memory",
		start: time,
		end: time,
		data: { memory: {
			jsHeapSizeLimit,
			totalJSHeapSize,
			usedJSHeapSize
		} }
	};
}
function debounce(func, wait, options) {
	return debounce$1(func, wait, {
		...options,
		setTimeoutImpl: setTimeout$3
	});
}
var NAVIGATOR = GLOBAL_OBJ.navigator;
function getRecordingSamplingOptions() {
	if (/iPhone|iPad|iPod/i.test(NAVIGATOR?.userAgent ?? "") || /Macintosh/i.test(NAVIGATOR?.userAgent ?? "") && NAVIGATOR?.maxTouchPoints && NAVIGATOR?.maxTouchPoints > 1) return { sampling: { mousemove: false } };
	return {};
}
function getHandleRecordingEmit(replay) {
	let hadFirstEvent = false;
	return (event, _isCheckout) => {
		try {
			if (!replay.checkAndHandleExpiredSession()) {
				DEBUG_BUILD$1 && debug.warn("Received replay event after session expired.");
				return;
			}
			const isCheckout = _isCheckout || !hadFirstEvent;
			hadFirstEvent = true;
			syncMirrorAttributesFromMutationEvent(event);
			if (replay.clickDetector) updateClickDetectorForRecordingEvent(replay.clickDetector, event);
			replay.addUpdate(() => {
				if (replay.recordingMode === "buffer" && isCheckout) replay.setInitialState();
				if (!addEventSync(replay, event, isCheckout)) return true;
				if (!isCheckout) return false;
				const session = replay.session;
				addSettingsEvent(replay, isCheckout);
				if (replay.recordingMode === "buffer" && session && replay.eventBuffer && !session.dirty) {
					const earliestEvent = replay.eventBuffer.getEarliestTimestamp();
					if (earliestEvent) {
						DEBUG_BUILD$1 && debug.log(`Updating session start time to earliest event in buffer to ${new Date(earliestEvent)}`);
						session.started = earliestEvent;
						if (replay.getOptions().stickySession) saveSession(session);
					}
				}
				if (session?.previousSessionId) return true;
				if (replay.recordingMode === "session") replay.flush();
				return true;
			});
		} catch (error) {
			replay.handleException(error);
		}
	};
}
function syncMirrorAttributesFromMutationEvent(event) {
	const data = event.data;
	if (event.type !== EventType.IncrementalSnapshot || !data || typeof data !== "object" || !("source" in data) || data.source !== IncrementalSource.Mutation || !("attributes" in data) || !Array.isArray(data.attributes)) return;
	for (const mutation of data.attributes) {
		const node = record.mirror.getNode(mutation.id);
		const meta = node && record.mirror.getMeta(node);
		if (!node || meta?.type !== NodeType.Element) continue;
		const attributes = { ...meta.attributes };
		let changed = false;
		for (const [attributeName, value] of Object.entries(mutation.attributes)) {
			if (!BREADCRUMB_RELEVANT_ATTRIBUTES.has(attributeName)) continue;
			if (value === null) delete attributes[attributeName];
			else attributes[attributeName] = value;
			changed = true;
		}
		if (changed) record.mirror.add(node, {
			...meta,
			attributes
		});
	}
}
function createOptionsEvent(replay) {
	const options = replay.getOptions();
	return {
		type: EventType.Custom,
		timestamp: Date.now(),
		data: {
			tag: "options",
			payload: {
				shouldRecordCanvas: replay.isRecordingCanvas(),
				sessionSampleRate: options.sessionSampleRate,
				errorSampleRate: options.errorSampleRate,
				useCompressionOption: options.useCompression,
				blockAllMedia: options.blockAllMedia,
				maskAllText: options.maskAllText,
				maskAllInputs: options.maskAllInputs,
				useCompression: replay.eventBuffer ? replay.eventBuffer.type === "worker" : false,
				networkDetailHasUrls: options.networkDetailAllowUrls.length > 0,
				networkCaptureBodies: options.networkCaptureBodies,
				networkRequestHasHeaders: options.networkRequestHeaders.length > 0,
				networkResponseHasHeaders: options.networkResponseHeaders.length > 0
			}
		}
	};
}
function addSettingsEvent(replay, isCheckout) {
	if (!isCheckout || replay.session?.segmentId !== 0) return;
	addEventSync(replay, createOptionsEvent(replay), false);
}
function closestElementOfNode$2(node) {
	if (!node) return null;
	try {
		return node.nodeType === node.ELEMENT_NODE ? node : node.parentElement;
	} catch {
		return null;
	}
}
function createReplayEnvelope(replayEvent, recordingData, dsn, tunnel) {
	return createEnvelope(createEventEnvelopeHeaders(replayEvent, getSdkMetadataForEnvelopeHeader(replayEvent), tunnel, dsn), [[{ type: "replay_event" }, replayEvent], [{
		type: "replay_recording",
		length: typeof recordingData === "string" ? new TextEncoder().encode(recordingData).length : recordingData.length
	}, recordingData]]);
}
function prepareRecordingData({ recordingData, headers }) {
	let payloadWithSequence;
	const replayHeaders = `${JSON.stringify(headers)}
`;
	if (typeof recordingData === "string") payloadWithSequence = `${replayHeaders}${recordingData}`;
	else {
		const sequence = new TextEncoder().encode(replayHeaders);
		payloadWithSequence = new Uint8Array(sequence.length + recordingData.length);
		payloadWithSequence.set(sequence);
		payloadWithSequence.set(recordingData, sequence.length);
	}
	return payloadWithSequence;
}
async function prepareReplayEvent({ client, scope, replayId: event_id, event }) {
	const eventHint = {
		event_id,
		integrations: typeof client["_integrations"] === "object" && client["_integrations"] !== null && !Array.isArray(client["_integrations"]) ? Object.keys(client["_integrations"]) : void 0
	};
	client.emit("preprocessEvent", event, eventHint);
	const preparedEvent = await prepareEvent(client.getOptions(), event, eventHint, scope, client, getIsolationScope());
	if (!preparedEvent) return null;
	client.emit("postprocessEvent", preparedEvent, eventHint);
	preparedEvent.platform = preparedEvent.platform || "javascript";
	const { name, version, settings } = client.getSdkMetadata()?.sdk || {};
	preparedEvent.sdk = {
		...preparedEvent.sdk,
		name: name || "sentry.javascript.unknown",
		version: version || "0.0.0",
		settings
	};
	return preparedEvent;
}
async function sendReplayRequest({ recordingData, replayId, segmentId: segment_id, eventContext, timestamp, session }) {
	const preparedRecordingData = prepareRecordingData({
		recordingData,
		headers: { segment_id }
	});
	const { urls, errorIds, traceIds, segmentNames, initialTimestamp } = eventContext;
	const client = getClient();
	const scope = getCurrentScope();
	const transport = client?.getTransport();
	const dsn = client?.getDsn();
	if (!client || !transport || !dsn || !session.sampled) return Promise.resolve({});
	const replayEvent = await prepareReplayEvent({
		scope,
		client,
		replayId,
		event: {
			type: REPLAY_EVENT_NAME,
			replay_start_timestamp: initialTimestamp / 1e3,
			timestamp: timestamp / 1e3,
			error_ids: errorIds,
			trace_ids: traceIds,
			segment_names: segmentNames,
			urls,
			replay_id: replayId,
			segment_id,
			replay_type: session.sampled
		}
	});
	if (!replayEvent) {
		DEBUG_BUILD$1 && debug.log("An event processor returned `null`, will not send event.");
		return Promise.resolve({});
	}
	delete replayEvent.sdkProcessingMetadata;
	const envelope = createReplayEnvelope(replayEvent, preparedRecordingData, dsn, client.getOptions().tunnel);
	let response;
	try {
		response = await transport.send(envelope);
	} catch (err) {
		const error = /* @__PURE__ */ new Error(UNABLE_TO_SEND_REPLAY);
		try {
			error.cause = err;
		} catch {}
		throw error;
	}
	const rateLimits = updateRateLimits({}, response);
	if (isRateLimited(rateLimits, "replay")) throw new RateLimitError(rateLimits);
	if (typeof response.statusCode === "number" && (response.statusCode < 200 || response.statusCode >= 300)) throw new TransportStatusCodeError(response.statusCode);
	return response;
}
var TransportStatusCodeError = class extends Error {
	constructor(statusCode) {
		super(`Transport returned status code ${statusCode}`);
	}
};
var RateLimitError = class extends Error {
	constructor(rateLimits) {
		super("Rate limit hit");
		this.rateLimits = rateLimits;
	}
};
var ReplayDurationLimitError = class extends Error {
	constructor() {
		super("Session is too long, not sending replay");
	}
};
async function sendReplay(replayData, retryConfig = {
	count: 0,
	interval: RETRY_BASE_INTERVAL
}) {
	const { recordingData, onError } = replayData;
	if (!recordingData.length) return;
	try {
		await sendReplayRequest(replayData);
		return true;
	} catch (err) {
		if (err instanceof TransportStatusCodeError || err instanceof RateLimitError) throw err;
		setContext("Replays", { _retryCount: retryConfig.count });
		if (onError) onError(err);
		if (retryConfig.count >= RETRY_MAX_COUNT) {
			const error = /* @__PURE__ */ new Error(`${UNABLE_TO_SEND_REPLAY} - max retries exceeded`);
			try {
				error.cause = err;
			} catch {}
			throw error;
		}
		retryConfig.interval *= ++retryConfig.count;
		return new Promise((resolve, reject) => {
			setTimeout$3(async () => {
				try {
					await sendReplay(replayData, retryConfig);
					resolve(true);
				} catch (err2) {
					reject(err2);
				}
			}, retryConfig.interval);
		});
	}
}
var THROTTLED = "__THROTTLED";
var SKIPPED = "__SKIPPED";
function throttle(fn, maxCount, durationSeconds) {
	const counter = /* @__PURE__ */ new Map();
	const _cleanup = (now) => {
		const threshold = now - durationSeconds;
		counter.forEach((_value, key) => {
			if (key < threshold) counter.delete(key);
		});
	};
	const _getTotalCount = () => {
		return [...counter.values()].reduce((a, b) => a + b, 0);
	};
	let isThrottled = false;
	return (...rest) => {
		const now = Math.floor(Date.now() / 1e3);
		_cleanup(now);
		if (_getTotalCount() >= maxCount) {
			const wasThrottled = isThrottled;
			isThrottled = true;
			return wasThrottled ? SKIPPED : THROTTLED;
		}
		isThrottled = false;
		const count = counter.get(now) || 0;
		counter.set(now, count + 1);
		return fn(...rest);
	};
}
var ReplayContainer = class {
	constructor({ options, recordingOptions }) {
		this.eventBuffer = null;
		this.performanceEntries = [];
		this.replayPerformanceEntries = [];
		this.recordingMode = "session";
		this.timeouts = {
			sessionIdlePause: SESSION_IDLE_PAUSE_DURATION,
			sessionIdleExpire: SESSION_IDLE_EXPIRE_DURATION
		};
		this._lastActivity = Date.now();
		this._isEnabled = false;
		this._isPaused = false;
		this._requiresManualStart = false;
		this._hasInitializedCoreListeners = false;
		this._context = {
			errorIds: /* @__PURE__ */ new Set(),
			traceIds: /* @__PURE__ */ new Set(),
			segmentNames: /* @__PURE__ */ new Set(),
			urls: [],
			initialTimestamp: Date.now(),
			initialUrl: ""
		};
		this._recordingOptions = recordingOptions;
		this._options = options;
		this._debouncedFlush = debounce(() => this._flush(), this._options.flushMinDelay, { maxWait: this._options.flushMaxDelay });
		this._throttledAddEvent = throttle((event, isCheckout) => addEvent(this, event, isCheckout), 300, 5);
		const { slowClickTimeout, slowClickIgnoreSelectors } = this.getOptions();
		const slowClickConfig = slowClickTimeout ? {
			threshold: Math.min(SLOW_CLICK_THRESHOLD, slowClickTimeout),
			timeout: slowClickTimeout,
			scrollTimeout: SLOW_CLICK_SCROLL_TIMEOUT,
			ignoreSelector: slowClickIgnoreSelectors ? slowClickIgnoreSelectors.join(",") : ""
		} : void 0;
		if (slowClickConfig) this.clickDetector = new ClickDetector(this, slowClickConfig);
		if (DEBUG_BUILD$1) {
			const experiments = options._experiments;
			debug.setConfig({
				captureExceptions: !!experiments.captureExceptions,
				traceInternals: !!experiments.traceInternals
			});
		}
		this._handleVisibilityChange = () => {
			if (WINDOW$1.document.visibilityState === "visible") this._doChangeToForegroundTasks();
			else this._doChangeToBackgroundTasks();
		};
		this._handleWindowBlur = () => {
			const breadcrumb = createBreadcrumb({ category: "ui.blur" });
			this._doChangeToBackgroundTasks(breadcrumb);
		};
		this._handleWindowFocus = () => {
			const breadcrumb = createBreadcrumb({ category: "ui.focus" });
			this._doChangeToForegroundTasks(breadcrumb);
		};
		this._handleKeyboardEvent = (event) => {
			handleKeyboardEvent(this, event);
		};
	}
	/** Get the event context. */
	getContext() {
		return this._context;
	}
	/** If recording is currently enabled. */
	isEnabled() {
		return this._isEnabled;
	}
	/** If recording is currently paused. */
	isPaused() {
		return this._isPaused;
	}
	/**
	* Determine if canvas recording is enabled
	*/
	isRecordingCanvas() {
		return Boolean(this._canvas);
	}
	/** Get the replay integration options. */
	getOptions() {
		return this._options;
	}
	getMaskAttributeFn() {
		return this._recordingOptions.maskAttributeFn;
	}
	/** A wrapper to conditionally capture exceptions. */
	handleException(error) {
		DEBUG_BUILD$1 && debug.exception(error);
		if (this._options.onError) this._options.onError(error);
	}
	/**
	* Initializes the plugin based on sampling configuration. Should not be
	* called outside of constructor.
	*/
	initializeSampling(previousSessionId) {
		const { errorSampleRate, sessionSampleRate } = this._options;
		const requiresManualStart = errorSampleRate <= 0 && sessionSampleRate <= 0;
		this._requiresManualStart = requiresManualStart;
		if (requiresManualStart) return;
		this._initializeSessionForSampling(previousSessionId);
		if (!this.session) {
			DEBUG_BUILD$1 && debug.exception(/* @__PURE__ */ new Error("Unable to initialize and create session"));
			return;
		}
		if (this.session.sampled === false) return;
		this.recordingMode = this.session.sampled === "buffer" && this.session.segmentId === 0 ? "buffer" : "session";
		DEBUG_BUILD$1 && debug.infoTick(`Starting replay in ${this.recordingMode} mode`);
		this._initializeRecording();
	}
	/**
	* Start a replay regardless of sampling rate. Calling this will always
	* create a new session. Will log a message if replay is already in progress.
	*
	* Creates or loads a session, attaches listeners to varying events (DOM,
	* _performanceObserver, Recording, Sentry SDK, etc)
	*/
	start() {
		if (this._isEnabled && this.recordingMode === "session") {
			DEBUG_BUILD$1 && debug.log("Recording is already in progress");
			return;
		}
		if (this._isEnabled && this.recordingMode === "buffer") {
			DEBUG_BUILD$1 && debug.log("Buffering is in progress, call `flush()` to save the replay");
			return;
		}
		DEBUG_BUILD$1 && debug.infoTick("Starting replay in session mode");
		this._updateUserActivity();
		const session = loadOrCreateSession({
			maxReplayDuration: this._options.maxReplayDuration,
			sessionIdleExpire: this.timeouts.sessionIdleExpire
		}, {
			stickySession: this._options.stickySession,
			sessionSampleRate: 1,
			allowBuffering: false
		});
		this.session = session;
		this.recordingMode = "session";
		this._initializeRecording();
	}
	/**
	* Start replay buffering. Buffers until `flush()` is called or, if
	* `replaysOnErrorSampleRate` > 0, an error occurs.
	*/
	startBuffering() {
		if (this._isEnabled) {
			DEBUG_BUILD$1 && debug.log("Buffering is in progress, call `flush()` to save the replay");
			return;
		}
		DEBUG_BUILD$1 && debug.infoTick("Starting replay in buffer mode");
		const session = loadOrCreateSession({
			sessionIdleExpire: this.timeouts.sessionIdleExpire,
			maxReplayDuration: this._options.maxReplayDuration
		}, {
			stickySession: this._options.stickySession,
			sessionSampleRate: 0,
			allowBuffering: true
		});
		this.session = session;
		this.recordingMode = "buffer";
		this._initializeRecording();
	}
	/**
	* Start recording.
	*
	* Note that this will cause a new DOM checkout
	*/
	startRecording() {
		try {
			const canvasOptions = this._canvas;
			this._stopRecording = record({
				...this._recordingOptions,
				...this.recordingMode === "buffer" ? { checkoutEveryNms: BUFFER_CHECKOUT_TIME } : this._options._experiments.continuousCheckout && { checkoutEveryNms: Math.max(36e4, this._options._experiments.continuousCheckout) },
				emit: getHandleRecordingEmit(this),
				...getRecordingSamplingOptions(),
				onMutation: this._onMutationHandler.bind(this),
				...canvasOptions ? {
					recordCanvas: canvasOptions.recordCanvas,
					getCanvasManager: canvasOptions.getCanvasManager,
					sampling: canvasOptions.sampling,
					dataURLOptions: canvasOptions.dataURLOptions
				} : {}
			});
		} catch (err) {
			this.handleException(err);
		}
	}
	/**
	* Stops the recording, if it was running.
	*
	* Returns true if it was previously stopped, or is now stopped,
	* otherwise false.
	*/
	stopRecording() {
		try {
			if (this._stopRecording) {
				this._stopRecording();
				this._stopRecording = void 0;
			}
			return true;
		} catch (err) {
			this.handleException(err);
			return false;
		}
	}
	/**
	* Currently, this needs to be manually called (e.g. for tests). Sentry SDK
	* does not support a teardown
	*/
	async stop({ forceFlush = false, reason } = {}) {
		if (!this._isEnabled) return;
		this._isEnabled = false;
		this.recordingMode = "buffer";
		const stopReason = reason ?? "manual";
		getClient()?.emit("replayEnd", {
			sessionId: this.session?.id,
			reason: stopReason
		});
		try {
			DEBUG_BUILD$1 && debug.log(`Stopping Replay triggered by ${stopReason}`);
			resetReplayIdOnDynamicSamplingContext();
			this._removeListeners();
			this.stopRecording();
			this._debouncedFlush.cancel();
			if (forceFlush) await this._flush({ force: true });
			this.eventBuffer?.destroy();
			this.eventBuffer = null;
			clearSession(this);
		} catch (err) {
			this.handleException(err);
		}
	}
	/**
	* Pause some replay functionality. See comments for `_isPaused`.
	* This differs from stop as this only stops DOM recording, it is
	* not as thorough of a shutdown as `stop()`.
	*/
	pause() {
		if (this._isPaused) return;
		this._isPaused = true;
		this.stopRecording();
		DEBUG_BUILD$1 && debug.log("Pausing replay");
	}
	/**
	* Resumes recording, see notes for `pause().
	*
	* Note that calling `startRecording()` here will cause a
	* new DOM checkout.`
	*/
	resume() {
		if (!this._isPaused || !this._checkSession()) return;
		this._isPaused = false;
		this.startRecording();
		DEBUG_BUILD$1 && debug.log("Resuming replay");
	}
	/**
	* If not in "session" recording mode, flush event buffer which will create a new replay.
	* Unless `continueRecording` is false, the replay will continue to record and
	* behave as a "session"-based replay.
	*
	* Otherwise, queue up a flush.
	*/
	async sendBufferedReplayOrFlush({ continueRecording = true } = {}) {
		if (this.recordingMode === "session") return this.flushImmediate();
		const activityTime = Date.now();
		DEBUG_BUILD$1 && debug.log("Converting buffer to session");
		await this.flushImmediate();
		const hasStoppedRecording = this.stopRecording();
		if (!continueRecording || !hasStoppedRecording) return;
		if (this.recordingMode === "session") return;
		this.recordingMode = "session";
		if (this.session) {
			this.session.dirty = false;
			this._updateUserActivity(activityTime);
			this._updateSessionActivity(activityTime);
			this._maybeSaveSession();
			setReplayIdOnDynamicSamplingContext(this.session.id);
		}
		this.startRecording();
	}
	/**
	* We want to batch uploads of replay events. Save events only if
	* `<flushMinDelay>` milliseconds have elapsed since the last event
	* *OR* if `<flushMaxDelay>` milliseconds have elapsed.
	*
	* Accepts a callback to perform side-effects and returns true to stop batch
	* processing and hand back control to caller.
	*/
	addUpdate(cb) {
		const cbResult = cb();
		if (this.recordingMode === "buffer" || !this._isEnabled) return;
		if (cbResult === true) return;
		this._debouncedFlush();
	}
	/**
	* Updates the user activity timestamp and resumes recording. This should be
	* called in an event handler for a user action that we consider as the user
	* being "active" (e.g. a mouse click).
	*/
	triggerUserActivity() {
		this._updateUserActivity();
		if (!this._stopRecording) {
			if (!this._checkSession()) return;
			this.resume();
			return;
		}
		this.checkAndHandleExpiredSession();
		this._updateSessionActivity();
	}
	/**
	* Updates the user activity timestamp *without* resuming
	* recording. Some user events (e.g. keydown) can be create
	* low-value replays that only contain the keypress as a
	* breadcrumb. Instead this would require other events to
	* create a new replay after a session has expired.
	*/
	updateUserActivity() {
		this._updateUserActivity();
		this._updateSessionActivity();
	}
	/**
	* Only flush if `this.recordingMode === 'session'`
	*/
	conditionalFlush() {
		if (this.recordingMode === "buffer") return Promise.resolve();
		return this.flushImmediate();
	}
	/**
	* Flush using debounce flush
	*/
	flush() {
		return this._debouncedFlush();
	}
	/**
	* Always flush via `_debouncedFlush` so that we do not have flushes triggered
	* from calling both `flush` and `_debouncedFlush`. Otherwise, there could be
	* cases of multiple flushes happening closely together.
	*/
	flushImmediate() {
		this._debouncedFlush();
		return this._debouncedFlush.flush();
	}
	/**
	* Cancels queued up flushes.
	*/
	cancelFlush() {
		this._debouncedFlush.cancel();
	}
	/** Get the current session (=replay) ID
	*
	* @param onlyIfSampled - If true, will only return the session ID if the session is sampled.
	*/
	getSessionId(onlyIfSampled) {
		if (onlyIfSampled && this.session?.sampled === false) return;
		return this.session?.id;
	}
	/**
	* Checks if recording should be stopped due to user inactivity. Otherwise
	* check if session is expired and create a new session if so. Triggers a new
	* full snapshot on new session.
	*
	* Returns true if session is not expired, false otherwise.
	* @hidden
	*/
	checkAndHandleExpiredSession() {
		if (this._lastActivity && isExpired(this._lastActivity, this.timeouts.sessionIdlePause) && this.session?.sampled === "session") {
			this.pause();
			return;
		}
		if (!this._checkSession()) return false;
		return true;
	}
	/**
	* Capture some initial state that can change throughout the lifespan of the
	* replay. This is required because otherwise they would be captured at the
	* first flush.
	*/
	setInitialState() {
		const urlPath = `${WINDOW$1.location.pathname}${WINDOW$1.location.hash}${WINDOW$1.location.search}`;
		const url = `${WINDOW$1.location.origin}${urlPath}`;
		this.performanceEntries = [];
		this.replayPerformanceEntries = [];
		this._clearContext();
		this._context.initialUrl = url;
		this._context.initialTimestamp = Date.now();
		this._context.urls.push(url);
	}
	/**
	* Add a breadcrumb event, that may be throttled.
	* If it was throttled, we add a custom breadcrumb to indicate that.
	*/
	throttledAddEvent(event, isCheckout) {
		const res = this._throttledAddEvent(event, isCheckout);
		if (res === THROTTLED) {
			const breadcrumb = createBreadcrumb({ category: "replay.throttled" });
			this.addUpdate(() => {
				return !addEventSync(this, {
					type: ReplayEventTypeCustom,
					timestamp: breadcrumb.timestamp || 0,
					data: {
						tag: "breadcrumb",
						payload: breadcrumb,
						metric: true
					}
				});
			});
		}
		return res;
	}
	/**
	* This will get the parametrized route name of the current page.
	* This is only available if performance is enabled, and if an instrumented router is used.
	*/
	getCurrentRoute() {
		const lastActiveSpan = this.lastActiveSpan || getActiveSpan();
		const lastRootSpan = lastActiveSpan && getRootSpan(lastActiveSpan);
		if (!lastRootSpan) return;
		const spanJson = spanToJSON(lastRootSpan);
		const source = spanJson.attributes[kb];
		if (!source || !["route", "custom"].includes(source)) return;
		return spanJson.name;
	}
	/**
	* Initialize and start all listeners to varying events (DOM,
	* Performance Observer, Recording, Sentry SDK, etc)
	*/
	_initializeRecording() {
		this.setInitialState();
		this._updateSessionActivity();
		this.eventBuffer = createEventBuffer({
			useCompression: this._options.useCompression,
			workerUrl: this._options.workerUrl
		});
		this._removeListeners();
		this._addListeners();
		this._isEnabled = true;
		this._isPaused = false;
		if (this.session) getClient()?.emit("replayStart", {
			sessionId: this.session.id,
			recordingMode: this.recordingMode
		});
		this.startRecording();
		if (this.recordingMode === "session" && this.session) setReplayIdOnDynamicSamplingContext(this.session.id);
	}
	/**
	* Loads (or refreshes) the current session.
	*/
	_initializeSessionForSampling(previousSessionId) {
		const allowBuffering = this._options.errorSampleRate > 0;
		const session = loadOrCreateSession({
			sessionIdleExpire: this.timeouts.sessionIdleExpire,
			maxReplayDuration: this._options.maxReplayDuration,
			previousSessionId
		}, {
			stickySession: this._options.stickySession,
			sessionSampleRate: this._options.sessionSampleRate,
			allowBuffering
		});
		this.session = session;
	}
	/**
	* Checks and potentially refreshes the current session.
	* Returns false if session is not recorded.
	*/
	_checkSession() {
		if (!this.session) return false;
		const currentSession = this.session;
		if (shouldRefreshSession(currentSession, {
			sessionIdleExpire: this.timeouts.sessionIdleExpire,
			maxReplayDuration: this._options.maxReplayDuration
		})) {
			this._refreshSession(currentSession);
			return false;
		}
		return true;
	}
	/**
	* Refresh a session with a new one.
	* This stops the current session (without forcing a flush, as that would never work since we are expired),
	* and then does a new sampling based on the refreshed session.
	*/
	async _refreshSession(session) {
		if (!this._isEnabled) return;
		await this.stop({ reason: "sessionExpired" });
		this.initializeSampling(session.id);
	}
	/**
	* Adds listeners to record events for the replay
	*/
	_addListeners() {
		try {
			WINDOW$1.document.addEventListener("visibilitychange", this._handleVisibilityChange);
			WINDOW$1.addEventListener("blur", this._handleWindowBlur);
			WINDOW$1.addEventListener("focus", this._handleWindowFocus);
			WINDOW$1.addEventListener("keydown", this._handleKeyboardEvent);
			if (this.clickDetector) this.clickDetector.addListeners();
			if (!this._hasInitializedCoreListeners) {
				addGlobalListeners(this);
				this._hasInitializedCoreListeners = true;
			}
		} catch (err) {
			this.handleException(err);
		}
		this._performanceCleanupCallback = setupPerformanceObserver(this);
	}
	/**
	* Cleans up listeners that were created in `_addListeners`
	*/
	_removeListeners() {
		try {
			WINDOW$1.document.removeEventListener("visibilitychange", this._handleVisibilityChange);
			WINDOW$1.removeEventListener("blur", this._handleWindowBlur);
			WINDOW$1.removeEventListener("focus", this._handleWindowFocus);
			WINDOW$1.removeEventListener("keydown", this._handleKeyboardEvent);
			if (this.clickDetector) this.clickDetector.removeListeners();
			if (this._performanceCleanupCallback) this._performanceCleanupCallback();
		} catch (err) {
			this.handleException(err);
		}
	}
	/**
	* Tasks to run when we consider a page to be hidden (via blurring and/or visibility)
	*/
	_doChangeToBackgroundTasks(breadcrumb) {
		if (!this.session) return;
		if (shouldRefreshSession(this.session, {
			maxReplayDuration: this._options.maxReplayDuration,
			sessionIdleExpire: this.timeouts.sessionIdleExpire
		})) {
			resetReplayIdOnDynamicSamplingContext();
			return;
		}
		if (breadcrumb) this._createCustomBreadcrumb(breadcrumb);
		this.conditionalFlush();
	}
	/**
	* Tasks to run when we consider a page to be visible (via focus and/or visibility)
	*/
	_doChangeToForegroundTasks(breadcrumb) {
		if (!this.session) return;
		if (!this.checkAndHandleExpiredSession()) {
			DEBUG_BUILD$1 && debug.log("Document has become active, but session has expired");
			return;
		}
		if (breadcrumb) this._createCustomBreadcrumb(breadcrumb);
	}
	/**
	* Update user activity (across session lifespans)
	*/
	_updateUserActivity(_lastActivity = Date.now()) {
		this._lastActivity = _lastActivity;
	}
	/**
	* Updates the session's last activity timestamp
	*/
	_updateSessionActivity(_lastActivity = Date.now()) {
		if (this.session) {
			this.session.lastActivity = _lastActivity;
			this._maybeSaveSession();
		}
	}
	/**
	* Helper to create (and buffer) a replay breadcrumb from a core SDK breadcrumb
	*/
	_createCustomBreadcrumb(breadcrumb) {
		this.addUpdate(() => {
			this.throttledAddEvent({
				type: EventType.Custom,
				timestamp: breadcrumb.timestamp || 0,
				data: {
					tag: "breadcrumb",
					payload: breadcrumb
				}
			});
		});
	}
	/**
	* Observed performance events are added to `this.performanceEntries`. These
	* are included in the replay event before it is finished and sent to Sentry.
	*/
	_addPerformanceEntries() {
		let performanceEntries = createPerformanceEntries(this.performanceEntries).concat(this.replayPerformanceEntries);
		this.performanceEntries = [];
		this.replayPerformanceEntries = [];
		if (this._requiresManualStart) {
			const initialTimestampInSeconds = this._context.initialTimestamp / 1e3;
			performanceEntries = performanceEntries.filter((entry) => entry.start >= initialTimestampInSeconds);
		}
		return Promise.all(createPerformanceSpans(this, performanceEntries));
	}
	/**
	* Clear _context
	*/
	_clearContext() {
		this._context.errorIds.clear();
		this._context.traceIds.clear();
		this._context.segmentNames.clear();
		this._context.urls = [];
	}
	/** Update the initial timestamp based on the buffer content. */
	_updateInitialTimestampFromEventBuffer() {
		const { session, eventBuffer } = this;
		if (!session || !eventBuffer || this._requiresManualStart) return;
		if (session.segmentId) return;
		const earliestEvent = eventBuffer.getEarliestTimestamp();
		if (earliestEvent && earliestEvent < this._context.initialTimestamp) this._context.initialTimestamp = earliestEvent;
	}
	/**
	* Return and clear _context
	*/
	_popEventContext() {
		const _context = {
			initialTimestamp: this._context.initialTimestamp,
			initialUrl: this._context.initialUrl,
			errorIds: Array.from(this._context.errorIds),
			traceIds: Array.from(this._context.traceIds),
			segmentNames: Array.from(this._context.segmentNames),
			urls: this._context.urls
		};
		this._clearContext();
		return _context;
	}
	/**
	* Flushes replay event buffer to Sentry.
	*
	* Performance events are only added right before flushing - this is
	* due to the buffered performance observer events.
	*
	* Should never be called directly, only by `flush`
	*/
	async _runFlush() {
		const replayId = this.getSessionId();
		if (!this.session || !this.eventBuffer || !replayId) {
			DEBUG_BUILD$1 && debug.error("No session or eventBuffer found to flush.");
			return;
		}
		await this._addPerformanceEntries();
		if (!this.eventBuffer?.hasEvents) return;
		await addMemoryEntry(this);
		if (!this.eventBuffer) return;
		if (replayId !== this.getSessionId()) return;
		try {
			this._updateInitialTimestampFromEventBuffer();
			const timestamp = Date.now();
			if (timestamp - this._context.initialTimestamp > this._options.maxReplayDuration + 3e4) throw new ReplayDurationLimitError();
			const eventContext = this._popEventContext();
			const segmentId = this.session.segmentId++;
			this._maybeSaveSession();
			await sendReplay({
				replayId,
				recordingData: await this.eventBuffer.finish(),
				segmentId,
				eventContext,
				session: this.session,
				timestamp,
				onError: (err) => this.handleException(err)
			});
		} catch (err) {
			this.handleException(err);
			this.stop({ reason: "sendError" });
			const client = getClient();
			if (client) {
				let dropReason;
				if (err instanceof RateLimitError) dropReason = "ratelimit_backoff";
				else if (err instanceof ReplayDurationLimitError) dropReason = "invalid";
				else dropReason = "send_error";
				client.recordDroppedEvent(dropReason, "replay");
			}
		}
	}
	/**
	* Flush recording data to Sentry. Creates a lock so that only a single flush
	* can be active at a time. Do not call this directly.
	*/
	async _flush({ force = false } = {}) {
		if (!this._isEnabled && !force) return;
		if (!this.checkAndHandleExpiredSession()) {
			DEBUG_BUILD$1 && debug.error("Attempting to finish replay event after session expired.");
			return;
		}
		if (!this.session) return;
		const start = this.session.started;
		const duration = Date.now() - start;
		this._debouncedFlush.cancel();
		const tooShort = duration < this._options.minReplayDuration;
		const tooLong = duration > this._options.maxReplayDuration + 5e3;
		if (tooShort || tooLong) {
			DEBUG_BUILD$1 && debug.log(`Session duration (${Math.floor(duration / 1e3)}s) is too ${tooShort ? "short" : "long"}, not sending replay.`);
			if (tooShort) this._debouncedFlush();
			return;
		}
		const eventBuffer = this.eventBuffer;
		if (eventBuffer && this.session.segmentId === 0 && !eventBuffer.hasCheckout) DEBUG_BUILD$1 && debug.log("Flushing initial segment without checkout.");
		const _flushInProgress = !!this._flushLock;
		if (!this._flushLock) this._flushLock = this._runFlush();
		try {
			await this._flushLock;
		} catch (err) {
			this.handleException(err);
		} finally {
			this._flushLock = void 0;
			if (_flushInProgress) this._debouncedFlush();
		}
	}
	/** Save the session, if it is sticky */
	_maybeSaveSession() {
		if (this.session && this._options.stickySession) saveSession(this.session);
	}
	/** Handler for rrweb.record.onMutation */
	_onMutationHandler(mutations) {
		const { ignoreMutations } = this._options._experiments;
		if (ignoreMutations?.length) {
			if (mutations.some((mutation) => {
				const el = closestElementOfNode$2(mutation.target);
				const selector = ignoreMutations.join(",");
				return el?.matches(selector);
			})) return false;
		}
		const count = mutations.length;
		const mutationLimit = this._options.mutationLimit;
		const mutationBreadcrumbLimit = this._options.mutationBreadcrumbLimit;
		const overMutationLimit = mutationLimit && count > mutationLimit;
		if (count > mutationBreadcrumbLimit || overMutationLimit) {
			const breadcrumb = createBreadcrumb({
				category: "replay.mutations",
				data: {
					count,
					limit: overMutationLimit
				}
			});
			this._createCustomBreadcrumb(breadcrumb);
		}
		if (overMutationLimit) {
			this.stop({
				reason: "mutationLimit",
				forceFlush: this.recordingMode === "session"
			});
			return false;
		}
		return true;
	}
};
function getOption(selectors, defaultSelectors) {
	return [...selectors, ...defaultSelectors].join(",");
}
function getPrivacyOptions({ mask, unmask, block, unblock, ignore }) {
	return {
		maskTextSelector: getOption(mask, [".sentry-mask", "[data-sentry-mask]"]),
		unmaskTextSelector: getOption(unmask, []),
		blockSelector: getOption(block, [
			".sentry-block",
			"[data-sentry-block]",
			...["base", "iframe[srcdoc]:not([src])"]
		]),
		unblockSelector: getOption(unblock, []),
		ignoreSelector: getOption(ignore, [
			".sentry-ignore",
			"[data-sentry-ignore]",
			"input[type=\"file\"]"
		])
	};
}
function maskAttribute({ el, key, maskAttributes, maskAllText, privacyOptions, value }) {
	if (privacyOptions.unmaskTextSelector && el.matches(privacyOptions.unmaskTextSelector)) return value;
	const masksNamedAttribute = maskAttributes.includes(key);
	const masksSubmitButtonValue = maskAllText && key === "value" && el.tagName === "INPUT" && ["submit", "button"].includes(el.getAttribute("type") || "");
	if (masksNamedAttribute || masksSubmitButtonValue) return value.replace(/[\S]/g, "*");
	return value;
}
var MEDIA_SELECTORS = "img,image,svg,video,object,picture,embed,map,audio,link[rel=\"icon\"],link[rel=\"apple-touch-icon\"]";
var DEFAULT_NETWORK_HEADERS = [
	"content-length",
	"content-type",
	"accept"
];
var ORIGINAL_BODY = /* @__PURE__ */ Symbol.for("sentry__originalRequestBody");
var _initialized = false;
var _isRequestInstrumented = false;
function _INTERNAL_instrumentRequestInterface() {
	if (typeof Request === "undefined" || _isRequestInstrumented) return;
	const OriginalRequest = Request;
	try {
		const SentryRequest = function(input, init) {
			const request = new OriginalRequest(input, init);
			if (init?.body != null) request[ORIGINAL_BODY] = init.body;
			return request;
		};
		SentryRequest.prototype = OriginalRequest.prototype;
		GLOBAL_OBJ.Request = SentryRequest;
		_isRequestInstrumented = true;
	} catch {}
}
var replayIntegration = ((options) => {
	return new Replay(options);
});
var Replay = class {
	constructor({ flushMinDelay = DEFAULT_FLUSH_MIN_DELAY, flushMaxDelay = DEFAULT_FLUSH_MAX_DELAY, minReplayDuration = MIN_REPLAY_DURATION, maxReplayDuration = MAX_REPLAY_DURATION, stickySession = true, useCompression = true, workerUrl, _experiments = {}, maskAllText = true, maskAllInputs = true, blockAllMedia = true, mutationBreadcrumbLimit = 750, mutationLimit = 1e4, slowClickTimeout = 7e3, slowClickIgnoreSelectors = [], networkDetailAllowUrls = [], networkDetailDenyUrls = [], networkCaptureBodies = true, networkRequestHeaders = [], networkResponseHeaders = [], mask = [], maskAttributes = [
		"title",
		"placeholder",
		"aria-label"
	], unmask = [], block = [], unblock = [], ignore = [], maskFn, beforeAddRecordingEvent, beforeErrorSampling, onError, attachRawBodyFromRequest = false } = {}) {
		this.name = "Replay";
		const privacyOptions = getPrivacyOptions({
			mask,
			unmask,
			block,
			unblock,
			ignore
		});
		this._recordingOptions = {
			maskAllInputs,
			maskAllText,
			maskInputOptions: { password: true },
			maskTextFn: maskFn,
			maskInputFn: maskFn,
			maskAttributeFn: (key, value, el) => maskAttribute({
				maskAttributes,
				maskAllText,
				privacyOptions,
				key,
				value,
				el
			}),
			...privacyOptions,
			slimDOMOptions: "all",
			inlineStylesheet: true,
			inlineImages: false,
			collectFonts: true,
			errorHandler: (err) => {
				try {
					err.__rrweb__ = true;
				} catch {}
			},
			recordCrossOriginIframes: Boolean(_experiments.recordCrossOriginIframes)
		};
		this._initialOptions = {
			flushMinDelay,
			flushMaxDelay,
			minReplayDuration: Math.min(minReplayDuration, MIN_REPLAY_DURATION_LIMIT),
			maxReplayDuration: Math.min(maxReplayDuration, MAX_REPLAY_DURATION),
			stickySession,
			useCompression,
			workerUrl,
			blockAllMedia,
			maskAllInputs,
			maskAllText,
			mutationBreadcrumbLimit,
			mutationLimit,
			slowClickTimeout,
			slowClickIgnoreSelectors,
			networkDetailAllowUrls,
			networkDetailDenyUrls,
			networkCaptureBodies,
			networkRequestHeaders: _getMergedNetworkHeaders(networkRequestHeaders),
			networkResponseHeaders: _getMergedNetworkHeaders(networkResponseHeaders),
			beforeAddRecordingEvent,
			beforeErrorSampling,
			onError,
			attachRawBodyFromRequest,
			_experiments
		};
		if (this._initialOptions.blockAllMedia) {
			this._recordingOptions.blockSelector = !this._recordingOptions.blockSelector ? MEDIA_SELECTORS : `${this._recordingOptions.blockSelector},${MEDIA_SELECTORS}`;
			this._recordingOptions.ignoreCSSAttributes = /* @__PURE__ */ new Set(["background-image"]);
		}
		if (this._isInitialized && isBrowser()) throw new Error("Multiple Sentry Session Replay instances are not supported");
		this._isInitialized = true;
	}
	/** If replay has already been initialized */
	get _isInitialized() {
		return _initialized;
	}
	/** Update _isInitialized */
	set _isInitialized(value) {
		_initialized = value;
	}
	/**
	* Setup and initialize replay container
	*/
	afterAllSetup(client) {
		if (!isBrowser() || this._replay) return;
		if (this._initialOptions.attachRawBodyFromRequest) _INTERNAL_instrumentRequestInterface();
		this._setup(client);
		this._initialize(client);
	}
	/**
	* Start a replay regardless of sampling rate. Calling this will always
	* create a new session. Will log a message if replay is already in progress.
	*
	* Creates or loads a session, attaches listeners to varying events (DOM,
	* PerformanceObserver, Recording, Sentry SDK, etc)
	*/
	start() {
		if (!this._replay) return;
		this._replay.start();
	}
	/**
	* Start replay buffering. Buffers until `flush()` is called or, if
	* `replaysOnErrorSampleRate` > 0, until an error occurs.
	*/
	startBuffering() {
		if (!this._replay) return;
		this._replay.startBuffering();
	}
	/**
	* Currently, this needs to be manually called (e.g. for tests). Sentry SDK
	* does not support a teardown
	*
	* @param options.flush - Whether to flush the pending replay segment when stopping.
	* When recording in `session` mode, `stop()` flushes the buffered-but-unsent segment by
	* default (`flush: true`), matching the previous behavior. Pass `flush: false` to stop
	* recording without sending that pending segment — useful when a user withdraws consent
	* and no further data should leave the browser.
	*
	* Note: `flush: false` only prevents the *pending* (final) segment from being sent. It does
	* **not** retract segments that were already sent earlier during `session` recording.
	*/
	stop(options) {
		if (!this._replay) return Promise.resolve();
		return this._replay.stop({
			forceFlush: options?.flush ?? this._replay.recordingMode === "session",
			reason: "manual"
		});
	}
	/**
	* If not in "session" recording mode, flush event buffer which will create a new replay.
	* If replay is not enabled, a new session replay is started.
	* Unless `continueRecording` is false, the replay will continue to record and
	* behave as a "session"-based replay.
	*
	* Otherwise, queue up a flush.
	*/
	flush(options) {
		if (!this._replay) return Promise.resolve();
		if (!this._replay.isEnabled()) {
			this._replay.start();
			return Promise.resolve();
		}
		return this._replay.sendBufferedReplayOrFlush(options);
	}
	/**
	* Get the current session ID.
	*
	* @param onlyIfSampled - If true, will only return the session ID if the session is sampled.
	*
	*/
	getReplayId(onlyIfSampled) {
		if (!this._replay?.isEnabled()) return;
		return this._replay.getSessionId(onlyIfSampled);
	}
	/**
	* Get the current recording mode. This can be either `session` or `buffer`.
	*
	* `session`: Recording the whole session, sending it continuously
	* `buffer`: Always keeping the last 60s of recording, requires:
	*   - having replaysOnErrorSampleRate > 0 to capture replay when an error occurs
	*   - or calling `flush()` to send the replay
	*/
	getRecordingMode() {
		if (!this._replay?.isEnabled()) return;
		return this._replay.recordingMode;
	}
	processSpan(span) {
		const replayId = this.getReplayId(true);
		if (replayId) {
			safeSetSpanJSONAttributes(span, { [db]: replayId });
			if (this.getRecordingMode() === "buffer") safeSetSpanJSONAttributes(span, { "sentry._internal.replay_is_buffering": true });
		}
	}
	/**
	* Initializes replay.
	*/
	_initialize(client) {
		if (!this._replay) return;
		this._maybeLoadFromReplayCanvasIntegration(client);
		this._replay.initializeSampling();
	}
	/** Setup the integration. */
	_setup(client) {
		const finalOptions = loadReplayOptionsFromClient(this._initialOptions, client);
		this._replay = new ReplayContainer({
			options: finalOptions,
			recordingOptions: this._recordingOptions
		});
	}
	/** Get canvas options from ReplayCanvas integration, if it is also added. */
	_maybeLoadFromReplayCanvasIntegration(client) {
		try {
			const canvasIntegration = client.getIntegrationByName("ReplayCanvas");
			if (!canvasIntegration) return;
			this._replay["_canvas"] = canvasIntegration.getOptions();
		} catch {}
	}
};
function loadReplayOptionsFromClient(initialOptions, client) {
	const opt = client.getOptions();
	const finalOptions = {
		sessionSampleRate: 0,
		errorSampleRate: 0,
		...initialOptions
	};
	const replaysSessionSampleRate = parseSampleRate(opt.replaysSessionSampleRate);
	const replaysOnErrorSampleRate = parseSampleRate(opt.replaysOnErrorSampleRate);
	if (replaysSessionSampleRate == null && replaysOnErrorSampleRate == null) consoleSandbox(() => {
		console.warn("Replay is disabled because neither `replaysSessionSampleRate` nor `replaysOnErrorSampleRate` are set.");
	});
	if (replaysSessionSampleRate != null) finalOptions.sessionSampleRate = replaysSessionSampleRate;
	if (replaysOnErrorSampleRate != null) finalOptions.errorSampleRate = replaysOnErrorSampleRate;
	return finalOptions;
}
function _getMergedNetworkHeaders(headers) {
	return [...DEFAULT_NETWORK_HEADERS, ...headers.map((header) => header.toLowerCase())];
}
function getReplay() {
	return getClient()?.getIntegrationByName("Replay");
}
// ../DnD helper/node_modules/@sentry/replay-canvas/build/npm/esm/index.js
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, {
	enumerable: true,
	configurable: true,
	writable: true,
	value
}) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
function isElement(n) {
	return n.nodeType === n.ELEMENT_NODE;
}
function isShadowRoot(n) {
	const host = n?.host;
	return Boolean(host?.shadowRoot === n);
}
var Mirror = class {
	constructor() {
		__publicField(this, "idNodeMap", /* @__PURE__ */ new Map());
		__publicField(this, "nodeMetaMap", /* @__PURE__ */ new WeakMap());
	}
	getId(n) {
		if (!n) return -1;
		return this.getMeta(n)?.id ?? -1;
	}
	getNode(id) {
		return this.idNodeMap.get(id) || null;
	}
	getIds() {
		return Array.from(this.idNodeMap.keys());
	}
	getMeta(n) {
		return this.nodeMetaMap.get(n) || null;
	}
	removeNodeFromMap(n) {
		const id = this.getId(n);
		this.idNodeMap.delete(id);
		if (n.childNodes) n.childNodes.forEach((childNode) => this.removeNodeFromMap(childNode));
		if (isElement(n) && n.shadowRoot) this.removeNodeFromMap(n.shadowRoot);
	}
	has(id) {
		return this.idNodeMap.has(id);
	}
	hasNode(node) {
		return this.nodeMetaMap.has(node);
	}
	add(n, meta) {
		const id = meta.id;
		this.idNodeMap.set(id, n);
		this.nodeMetaMap.set(n, meta);
	}
	replace(id, n) {
		const oldNode = this.getNode(id);
		if (oldNode) {
			const meta = this.nodeMetaMap.get(oldNode);
			if (meta) this.nodeMetaMap.set(n, meta);
		}
		this.idNodeMap.set(id, n);
	}
	reset() {
		this.idNodeMap = /* @__PURE__ */ new Map();
		this.nodeMetaMap = /* @__PURE__ */ new WeakMap();
	}
};
function createMirror() {
	return new Mirror();
}
function elementClassMatchesRegex(el, regex) {
	for (let eIndex = el.classList.length; eIndex--;) {
		const className = el.classList[eIndex];
		if (regex.test(className)) return true;
	}
	return false;
}
function distanceToMatch(node, matchPredicate, limit = Infinity, distance = 0) {
	if (!node) return -1;
	if (isShadowRoot(node)) return distanceToMatch(node.host, matchPredicate, limit, distance + 1);
	if (node.nodeType !== node.ELEMENT_NODE) return -1;
	if (distance > limit) return -1;
	if (matchPredicate(node)) return distance;
	return distanceToMatch(node.parentNode, matchPredicate, limit, distance + 1);
}
function createMatchPredicate(className, selector) {
	return (node) => {
		const el = node;
		if (el === null) return false;
		try {
			if (className) {
				if (typeof className === "string") {
					if (el.matches(`.${className}`)) return true;
				} else if (elementClassMatchesRegex(el, className)) return true;
			}
			if (selector && el.matches(selector)) return true;
			return false;
		} catch {
			return false;
		}
	};
}
var DEPARTED_MIRROR_ACCESS_WARNING = "Please stop import mirror directly. Instead of that,\r\nnow you can use replayer.getMirror() to access the mirror instance of a replayer,\r\nor you can use record.mirror to access the mirror instance during recording.";
var _mirror = {
	map: {},
	getId() {
		console.error(DEPARTED_MIRROR_ACCESS_WARNING);
		return -1;
	},
	getNode() {
		console.error(DEPARTED_MIRROR_ACCESS_WARNING);
		return null;
	},
	removeNodeFromMap() {
		console.error(DEPARTED_MIRROR_ACCESS_WARNING);
	},
	has() {
		console.error(DEPARTED_MIRROR_ACCESS_WARNING);
		return false;
	},
	reset() {
		console.error(DEPARTED_MIRROR_ACCESS_WARNING);
	}
};
if (typeof window !== "undefined" && window.Proxy && window.Reflect) _mirror = new Proxy(_mirror, { get(target, prop, receiver) {
	if (prop === "map") console.error(DEPARTED_MIRROR_ACCESS_WARNING);
	return Reflect.get(target, prop, receiver);
} });
function hookSetter(target, key, d, isRevoked, win = window) {
	const original = win.Object.getOwnPropertyDescriptor(target, key);
	win.Object.defineProperty(target, key, isRevoked ? d : { set(value) {
		setTimeout$1(() => {
			d.set.call(this, value);
		}, 0);
		if (original && original.set) original.set.call(this, value);
	} });
	return () => hookSetter(target, key, original || {}, true);
}
function patch(source, name, replacement) {
	try {
		if (!(name in source)) return () => {};
		const original = source[name];
		const wrapped = replacement(original);
		if (typeof wrapped === "function") {
			wrapped.prototype = wrapped.prototype || {};
			Object.defineProperties(wrapped, { __rrweb_original__: {
				enumerable: false,
				value: original
			} });
		}
		source[name] = wrapped;
		return () => {
			source[name] = original;
		};
	} catch {
		return () => {};
	}
}
if (!/* @__PURE__ */ /[1-9][0-9]{12}/.test(Date.now().toString()));
function closestElementOfNode(node) {
	if (!node) return null;
	try {
		return node.nodeType === node.ELEMENT_NODE ? node : node.parentElement;
	} catch (error) {
		return null;
	}
}
function isBlocked(node, blockClass, blockSelector, unblockSelector, checkAncestors) {
	if (!node) return false;
	const el = closestElementOfNode(node);
	if (!el) return false;
	const blockedPredicate = createMatchPredicate(blockClass, blockSelector);
	if (!checkAncestors) {
		const isUnblocked = unblockSelector && el.matches(unblockSelector);
		return blockedPredicate(el) && !isUnblocked;
	}
	const blockDistance = distanceToMatch(el, blockedPredicate);
	let unblockDistance = -1;
	if (blockDistance < 0) return false;
	if (unblockSelector) unblockDistance = distanceToMatch(el, createMatchPredicate(null, unblockSelector));
	if (blockDistance > -1 && unblockDistance < 0) return true;
	return blockDistance < unblockDistance;
}
var cachedImplementations = {};
function getImplementation(name) {
	const cached = cachedImplementations[name];
	if (cached) return cached;
	const windowImpl = window[name].bind(window);
	let impl = windowImpl;
	const document2 = window.document;
	if (document2 && typeof document2.createElement === "function") try {
		const sandbox = document2.createElement("iframe");
		sandbox.hidden = true;
		document2.head.appendChild(sandbox);
		const contentWindow = sandbox.contentWindow;
		if (contentWindow && contentWindow[name]) {
			const sandboxImpl = contentWindow[name].bind(window);
			impl = (...args) => {
				try {
					return sandboxImpl(...args);
				} catch {
					cachedImplementations[name] = windowImpl;
					return windowImpl(...args);
				}
			};
		}
		document2.head.removeChild(sandbox);
	} catch (e) {}
	return cachedImplementations[name] = impl;
}
function onRequestAnimationFrame(...rest) {
	return getImplementation("requestAnimationFrame")(...rest);
}
function setTimeout$1(...rest) {
	return getImplementation("setTimeout")(...rest);
}
var CanvasContext = /* @__PURE__ */ ((CanvasContext2) => {
	CanvasContext2[CanvasContext2["2D"] = 0] = "2D";
	CanvasContext2[CanvasContext2["WebGL"] = 1] = "WebGL";
	CanvasContext2[CanvasContext2["WebGL2"] = 2] = "WebGL2";
	return CanvasContext2;
})(CanvasContext || {});
var errorHandler;
function registerErrorHandler(handler) {
	errorHandler = handler;
}
var callbackWrapper = (cb) => {
	if (!errorHandler) return cb;
	const rrwebWrapped = ((...rest) => {
		try {
			return cb(...rest);
		} catch (error) {
			if (errorHandler && errorHandler(error) === true) return () => {};
			throw error;
		}
	});
	return rrwebWrapped;
};
var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var lookup = typeof Uint8Array === "undefined" ? [] : /* @__PURE__ */ new Uint8Array(256);
for (var i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
var encode = function(arraybuffer) {
	var bytes = new Uint8Array(arraybuffer), i2, len = bytes.length, base64 = "";
	for (i2 = 0; i2 < len; i2 += 3) {
		base64 += chars[bytes[i2] >> 2];
		base64 += chars[(bytes[i2] & 3) << 4 | bytes[i2 + 1] >> 4];
		base64 += chars[(bytes[i2 + 1] & 15) << 2 | bytes[i2 + 2] >> 6];
		base64 += chars[bytes[i2 + 2] & 63];
	}
	if (len % 3 === 2) base64 = base64.substring(0, base64.length - 1) + "=";
	else if (len % 3 === 1) base64 = base64.substring(0, base64.length - 2) + "==";
	return base64;
};
var canvasVarMap = /* @__PURE__ */ new Map();
function variableListFor(ctx, ctor) {
	let contextMap = canvasVarMap.get(ctx);
	if (!contextMap) {
		contextMap = /* @__PURE__ */ new Map();
		canvasVarMap.set(ctx, contextMap);
	}
	if (!contextMap.has(ctor)) contextMap.set(ctor, []);
	return contextMap.get(ctor);
}
var saveWebGLVar = (value, win, ctx) => {
	if (!value || !(isInstanceOfWebGLObject(value, win) || typeof value === "object")) return;
	const name = value.constructor.name;
	const list = variableListFor(ctx, name);
	let index = list.indexOf(value);
	if (index === -1) {
		index = list.length;
		list.push(value);
	}
	return index;
};
function serializeArg(value, win, ctx) {
	if (value instanceof Array) return value.map((arg) => serializeArg(arg, win, ctx));
	else if (value === null) return value;
	else if (value instanceof Float32Array || value instanceof Float64Array || value instanceof Int32Array || value instanceof Uint32Array || value instanceof Uint8Array || value instanceof Uint16Array || value instanceof Int16Array || value instanceof Int8Array || value instanceof Uint8ClampedArray) return {
		rr_type: value.constructor.name,
		args: [Object.values(value)]
	};
	else if (value instanceof ArrayBuffer) return {
		rr_type: value.constructor.name,
		base64: encode(value)
	};
	else if (value instanceof DataView) return {
		rr_type: value.constructor.name,
		args: [
			serializeArg(value.buffer, win, ctx),
			value.byteOffset,
			value.byteLength
		]
	};
	else if (value instanceof HTMLImageElement) {
		const name = value.constructor.name;
		const { src } = value;
		return {
			rr_type: name,
			src
		};
	} else if (value instanceof HTMLCanvasElement) return {
		rr_type: "HTMLImageElement",
		src: value.toDataURL()
	};
	else if (value instanceof ImageData) return {
		rr_type: value.constructor.name,
		args: [
			serializeArg(value.data, win, ctx),
			value.width,
			value.height
		]
	};
	else if (isInstanceOfWebGLObject(value, win) || typeof value === "object") return {
		rr_type: value.constructor.name,
		index: saveWebGLVar(value, win, ctx)
	};
	return value;
}
var serializeArgs = (args, win, ctx) => {
	return args.map((arg) => serializeArg(arg, win, ctx));
};
var isInstanceOfWebGLObject = (value, win) => {
	const supportedWebGLConstructorNames = [
		"WebGLActiveInfo",
		"WebGLBuffer",
		"WebGLFramebuffer",
		"WebGLProgram",
		"WebGLRenderbuffer",
		"WebGLShader",
		"WebGLShaderPrecisionFormat",
		"WebGLTexture",
		"WebGLUniformLocation",
		"WebGLVertexArrayObject",
		"WebGLVertexArrayObjectOES"
	].filter((name) => typeof win[name] === "function");
	return Boolean(supportedWebGLConstructorNames.find((name) => value instanceof win[name]));
};
function initCanvas2DMutationObserver(cb, win, blockClass2, blockSelector, unblockSelector) {
	const handlers = [];
	const props2D = Object.getOwnPropertyNames(win.CanvasRenderingContext2D.prototype);
	for (const prop of props2D) try {
		if (typeof win.CanvasRenderingContext2D.prototype[prop] !== "function") continue;
		const restoreHandler = patch(win.CanvasRenderingContext2D.prototype, prop, function(original) {
			return function(...args) {
				if (!isBlocked(this.canvas, blockClass2, blockSelector, unblockSelector, true)) setTimeout$1(() => {
					const recordArgs = serializeArgs(args, win, this);
					cb(this.canvas, {
						type: CanvasContext["2D"],
						property: prop,
						args: recordArgs
					});
				}, 0);
				return original.apply(this, args);
			};
		});
		handlers.push(restoreHandler);
	} catch {
		const hookHandler = hookSetter(win.CanvasRenderingContext2D.prototype, prop, { set(v) {
			cb(this.canvas, {
				type: CanvasContext["2D"],
				property: prop,
				args: [v],
				setter: true
			});
		} });
		handlers.push(hookHandler);
	}
	return () => {
		handlers.forEach((h) => h());
	};
}
function getNormalizedContextName(contextType) {
	return contextType === "experimental-webgl" ? "webgl" : contextType;
}
function initCanvasContextObserver(win, blockClass, blockSelector, unblockSelector, setPreserveDrawingBufferToTrue) {
	const handlers = [];
	try {
		const restoreHandler = patch(win.HTMLCanvasElement.prototype, "getContext", function(original) {
			return function(contextType, ...args) {
				if (!isBlocked(this, blockClass, blockSelector, unblockSelector, true)) {
					const ctxName = getNormalizedContextName(contextType);
					if (!("__context" in this)) this.__context = ctxName;
					if (setPreserveDrawingBufferToTrue && ["webgl", "webgl2"].includes(ctxName)) {
						if (args[0] && typeof args[0] === "object") {
							const contextAttributes = args[0];
							if (!contextAttributes.preserveDrawingBuffer) contextAttributes.preserveDrawingBuffer = true;
						} else args.splice(0, 1, { preserveDrawingBuffer: true });
					}
				}
				return original.apply(this, [contextType, ...args]);
			};
		});
		handlers.push(restoreHandler);
	} catch {
		console.error("failed to patch HTMLCanvasElement.prototype.getContext");
	}
	return () => {
		handlers.forEach((h) => h());
	};
}
function patchGLPrototype(prototype, type, cb, blockClass2, blockSelector, unblockSelector, _mirror2, win) {
	const handlers = [];
	const props = Object.getOwnPropertyNames(prototype);
	for (const prop of props) {
		if ([
			"isContextLost",
			"canvas",
			"drawingBufferWidth",
			"drawingBufferHeight"
		].includes(prop)) continue;
		try {
			if (typeof prototype[prop] !== "function") continue;
			const restoreHandler = patch(prototype, prop, function(original) {
				return function(...args) {
					const result = original.apply(this, args);
					saveWebGLVar(result, win, this);
					if ("tagName" in this.canvas && !isBlocked(this.canvas, blockClass2, blockSelector, unblockSelector, true)) {
						const recordArgs = serializeArgs(args, win, this);
						const mutation = {
							type,
							property: prop,
							args: recordArgs
						};
						cb(this.canvas, mutation);
					}
					return result;
				};
			});
			handlers.push(restoreHandler);
		} catch {
			const hookHandler = hookSetter(prototype, prop, { set(v) {
				cb(this.canvas, {
					type,
					property: prop,
					args: [v],
					setter: true
				});
			} });
			handlers.push(hookHandler);
		}
	}
	return handlers;
}
function initCanvasWebGLMutationObserver(cb, win, blockClass2, blockSelector, unblockSelector, mirror) {
	const handlers = [];
	handlers.push(...patchGLPrototype(win.WebGLRenderingContext.prototype, CanvasContext.WebGL, cb, blockClass2, blockSelector, unblockSelector, mirror, win));
	if (typeof win.WebGL2RenderingContext !== "undefined") handlers.push(...patchGLPrototype(win.WebGL2RenderingContext.prototype, CanvasContext.WebGL2, cb, blockClass2, blockSelector, unblockSelector, mirror, win));
	return () => {
		handlers.forEach((h) => h());
	};
}
var r = `for(var e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",t="undefined"==typeof Uint8Array?[]:new Uint8Array(256),a=0;a<64;a++)t[e.charCodeAt(a)]=a;var n=function(t){var a,n=new Uint8Array(t),r=n.length,s="";for(a=0;a<r;a+=3)s+=e[n[a]>>2],s+=e[(3&n[a])<<4|n[a+1]>>4],s+=e[(15&n[a+1])<<2|n[a+2]>>6],s+=e[63&n[a+2]];return r%3==2?s=s.substring(0,s.length-1)+"=":r%3==1&&(s=s.substring(0,s.length-2)+"=="),s};const r=new Map,s=new Map;const i=self;i.onmessage=async function(e){if(!("OffscreenCanvas"in globalThis))return i.postMessage({id:e.data.id});{const{id:t,bitmap:a,width:o,height:f,maxCanvasSize:c,dataURLOptions:g}=e.data,u=async function(e,t,a){const r=e+"-"+t;if("OffscreenCanvas"in globalThis){if(s.has(r))return s.get(r);const i=new OffscreenCanvas(e,t);i.getContext("2d");const o=await i.convertToBlob(a),f=await o.arrayBuffer(),c=n(f);return s.set(r,c),c}return""}(o,f,g),[h,d]=function(e,t,a){if(!a)return[e,t];const[n,r]=a;if(e<=n&&t<=r)return[e,t];let s=e,i=t;return s>n&&(i=Math.floor(n*t/e),s=n),i>r&&(s=Math.floor(r*e/t),i=r),[s,i]}(o,f,c),l=new OffscreenCanvas(h,d),w=l.getContext("bitmaprenderer"),p=h===o&&d===f?a:await createImageBitmap(a,{resizeWidth:h,resizeHeight:d,resizeQuality:"low"});w?.transferFromImageBitmap(p),a.close();const y=await l.convertToBlob(g),v=y.type,b=await y.arrayBuffer(),m=n(b);if(p.close(),!r.has(t)&&await u===m)return r.set(t,m),i.postMessage({id:t});if(r.get(t)===m)return i.postMessage({id:t});i.postMessage({id:t,type:v,base64:m,width:o,height:f}),r.set(t,m)}};`;
function t() {
	const t2 = new Blob([r]);
	return URL.createObjectURL(t2);
}
var CanvasManager = class {
	constructor(options) {
		this.pendingCanvasMutations = /* @__PURE__ */ new Map();
		this.rafStamps = {
			latestId: 0,
			invokeId: null
		};
		this.shadowDoms = /* @__PURE__ */ new Set();
		this.windowsSet = /* @__PURE__ */ new WeakSet();
		this.windows = [];
		this.restoreHandlers = [];
		this.frozen = false;
		this.locked = false;
		this.snapshotInProgressMap = /* @__PURE__ */ new Map();
		this.worker = null;
		this.lastSnapshotTime = 0;
		this.processMutation = (target, mutation) => {
			if (this.rafStamps.invokeId && this.rafStamps.latestId !== this.rafStamps.invokeId || !this.rafStamps.invokeId) this.rafStamps.invokeId = this.rafStamps.latestId;
			if (!this.pendingCanvasMutations.has(target)) this.pendingCanvasMutations.set(target, []);
			this.pendingCanvasMutations.get(target).push(mutation);
		};
		const { enableManualSnapshot, sampling = "all", win, recordCanvas, errorHandler: errorHandler2 } = options;
		options.sampling = sampling;
		this.mutationCb = options.mutationCb;
		this.mirror = options.mirror;
		this.options = options;
		if (errorHandler2) registerErrorHandler(errorHandler2);
		if (recordCanvas && typeof sampling === "number" || enableManualSnapshot) this.worker = this.initFPSWorker();
		this.addWindow(win);
		if (enableManualSnapshot) return;
		callbackWrapper(() => {
			if (recordCanvas && sampling === "all") {
				this.startRAFTimestamping();
				this.startPendingCanvasMutationFlusher();
			}
			if (recordCanvas && typeof sampling === "number") this.initCanvasFPSObserver();
		})();
	}
	reset() {
		this.pendingCanvasMutations.clear();
		this.restoreHandlers.forEach((handler) => {
			try {
				handler();
			} catch (e) {}
		});
		this.restoreHandlers = [];
		this.windowsSet = /* @__PURE__ */ new WeakSet();
		this.windows = [];
		this.shadowDoms = /* @__PURE__ */ new Set();
		this.worker?.terminate();
		this.worker = null;
		this.snapshotInProgressMap = /* @__PURE__ */ new Map();
	}
	freeze() {
		this.frozen = true;
	}
	unfreeze() {
		this.frozen = false;
	}
	lock() {
		this.locked = true;
	}
	unlock() {
		this.locked = false;
	}
	addWindow(win) {
		const { sampling = "all", blockClass, blockSelector, unblockSelector, recordCanvas, enableManualSnapshot } = this.options;
		if (this.windowsSet.has(win)) return;
		if (enableManualSnapshot) {
			this.windowsSet.add(win);
			this.windows.push(new WeakRef(win));
			return;
		}
		callbackWrapper(() => {
			if (recordCanvas && sampling === "all") this.initCanvasMutationObserver(win, blockClass, blockSelector, unblockSelector);
			if (recordCanvas && typeof sampling === "number") {
				const canvasContextReset = initCanvasContextObserver(win, blockClass, blockSelector, unblockSelector, true);
				this.restoreHandlers.push(() => {
					canvasContextReset();
				});
			}
		})();
		this.windowsSet.add(win);
		this.windows.push(new WeakRef(win));
	}
	addShadowRoot(shadowRoot) {
		this.shadowDoms.add(new WeakRef(shadowRoot));
	}
	resetShadowRoots() {
		this.shadowDoms = /* @__PURE__ */ new Set();
	}
	snapshot(canvasElement, options) {
		if (options?.skipRequestAnimationFrame) {
			this.takeSnapshot(performance.now(), canvasElement);
			return;
		}
		onRequestAnimationFrame((timestamp) => this.takeSnapshot(timestamp, canvasElement));
	}
	initFPSWorker() {
		const worker = new Worker(t());
		worker.onmessage = (e) => {
			const data = e.data;
			const { id } = data;
			this.snapshotInProgressMap.set(id, false);
			if (!("base64" in data)) return;
			const { base64, type, width, height } = data;
			this.mutationCb({
				id,
				type: CanvasContext["2D"],
				commands: [{
					property: "clearRect",
					args: [
						0,
						0,
						width,
						height
					]
				}, {
					property: "drawImage",
					args: [
						{
							rr_type: "ImageBitmap",
							args: [{
								rr_type: "Blob",
								data: [{
									rr_type: "ArrayBuffer",
									base64
								}],
								type
							}]
						},
						0,
						0,
						width,
						height
					]
				}]
			});
		};
		return worker;
	}
	initCanvasFPSObserver() {
		let rafId;
		if (!this.windows.length && !this.shadowDoms.size) return;
		const rafCallback = (timestamp) => {
			this.takeSnapshot(timestamp);
			rafId = onRequestAnimationFrame(rafCallback);
		};
		rafId = onRequestAnimationFrame(rafCallback);
		this.restoreHandlers.push(() => {
			if (rafId) cancelAnimationFrame(rafId);
		});
	}
	initCanvasMutationObserver(win, blockClass, blockSelector, unblockSelector) {
		const canvasContextReset = initCanvasContextObserver(win, blockClass, blockSelector, unblockSelector, false);
		const canvas2DReset = initCanvas2DMutationObserver(this.processMutation.bind(this), win, blockClass, blockSelector, unblockSelector);
		const canvasWebGL1and2Reset = initCanvasWebGLMutationObserver(this.processMutation.bind(this), win, blockClass, blockSelector, unblockSelector, this.mirror);
		this.restoreHandlers.push(() => {
			canvasContextReset();
			canvas2DReset();
			canvasWebGL1and2Reset();
		});
	}
	/**
	* Returns all `canvas` elements that are not blocked by the given selectors. Searches all windows and shadow roots.
	*/
	getCanvasElements(blockClass, blockSelector, unblockSelector) {
		const matchedCanvas = [];
		const searchCanvas = (root) => {
			root.querySelectorAll("canvas").forEach((canvas) => {
				if (!isBlocked(canvas, blockClass, blockSelector, unblockSelector, true)) matchedCanvas.push(canvas);
			});
		};
		for (const item of this.windows) {
			const window2 = item.deref();
			let _document;
			try {
				_document = window2 && window2.document;
			} catch {}
			if (_document) searchCanvas(_document);
		}
		for (const item of this.shadowDoms) {
			const shadowRoot = item.deref();
			if (shadowRoot) searchCanvas(shadowRoot);
		}
		return matchedCanvas;
	}
	/**
	* Takes a snapshot of the provided canvas element, or will search all windows/shadow roots for canvases. Will self-throttle based on `options.sampling`.
	*
	* @returns `true` if the snapshot was taken, `false` if it was throttled.
	*/
	takeSnapshot(timestamp, canvasElement) {
		const { sampling, blockClass, blockSelector, unblockSelector, dataURLOptions, maxCanvasSize } = this.options;
		const timeBetweenSnapshots = 1e3 / (sampling === "all" ? 2 : sampling || 2);
		if (this.lastSnapshotTime && timestamp - this.lastSnapshotTime < timeBetweenSnapshots) return false;
		this.lastSnapshotTime = timestamp;
		(canvasElement ? [canvasElement] : this.getCanvasElements(blockClass, blockSelector, unblockSelector)).forEach((canvas) => {
			const id = this.mirror.getId(canvas);
			if (!this.mirror.hasNode(canvas) || !canvas.width || !canvas.height || this.snapshotInProgressMap.get(id)) return;
			this.snapshotInProgressMap.set(id, true);
			createImageBitmap(canvas).then((bitmap) => {
				this.worker?.postMessage({
					id,
					bitmap,
					width: canvas.width,
					height: canvas.height,
					dataURLOptions,
					maxCanvasSize
				}, [bitmap]);
			}).catch((error) => {
				callbackWrapper(() => {
					this.snapshotInProgressMap.delete(id);
					throw error;
				})();
			});
		});
		return true;
	}
	startPendingCanvasMutationFlusher() {
		onRequestAnimationFrame(() => this.flushPendingCanvasMutations());
	}
	startRAFTimestamping() {
		const setLatestRAFTimestamp = (timestamp) => {
			this.rafStamps.latestId = timestamp;
			onRequestAnimationFrame(setLatestRAFTimestamp);
		};
		onRequestAnimationFrame(setLatestRAFTimestamp);
	}
	flushPendingCanvasMutations() {
		this.pendingCanvasMutations.forEach((_values, canvas) => {
			const id = this.mirror.getId(canvas);
			this.flushPendingCanvasMutationFor(canvas, id);
		});
		onRequestAnimationFrame(() => this.flushPendingCanvasMutations());
	}
	flushPendingCanvasMutationFor(canvas, id) {
		if (this.frozen || this.locked) return;
		const valuesWithType = this.pendingCanvasMutations.get(canvas);
		if (!valuesWithType || id === -1) return;
		const values = valuesWithType.map((value) => {
			const { type: type2, ...rest } = value;
			return rest;
		});
		const { type } = valuesWithType[0];
		this.mutationCb({
			id,
			type,
			commands: values
		});
		this.pendingCanvasMutations.delete(canvas);
	}
};
try {
	if (Array.from([1], (x) => x * 2)[0] !== 2) {
		const cleanFrame = document.createElement("iframe");
		document.body.appendChild(cleanFrame);
		Array.from = cleanFrame.contentWindow?.Array.from || Array.from;
		document.body.removeChild(cleanFrame);
	}
} catch (err) {
	console.debug("Unable to override Array.from", err);
}
createMirror();
var n;
(function(t2) {
	t2[t2.NotStarted = 0] = "NotStarted", t2[t2.Running = 1] = "Running", t2[t2.Stopped = 2] = "Stopped";
})(n || (n = {}));
var CANVAS_QUALITY = {
	low: {
		sampling: { canvas: 1 },
		dataURLOptions: {
			type: "image/webp",
			quality: .25
		}
	},
	medium: {
		sampling: { canvas: 2 },
		dataURLOptions: {
			type: "image/webp",
			quality: .4
		}
	},
	high: {
		sampling: { canvas: 4 },
		dataURLOptions: {
			type: "image/webp",
			quality: .5
		}
	}
};
var INTEGRATION_NAME$4 = "ReplayCanvas";
var DEFAULT_MAX_CANVAS_SIZE = 1280;
var _replayCanvasIntegration = ((options = {}) => {
	const [maxCanvasWidth, maxCanvasHeight] = options.maxCanvasSize || [];
	const _canvasOptions = {
		quality: options.quality || "medium",
		enableManualSnapshot: options.enableManualSnapshot,
		maxCanvasSize: [maxCanvasWidth ? Math.min(maxCanvasWidth, DEFAULT_MAX_CANVAS_SIZE) : DEFAULT_MAX_CANVAS_SIZE, maxCanvasHeight ? Math.min(maxCanvasHeight, DEFAULT_MAX_CANVAS_SIZE) : DEFAULT_MAX_CANVAS_SIZE]
	};
	let currentCanvasManager;
	let canvasManagerResolve;
	const _canvasManager = new Promise((resolve) => canvasManagerResolve = resolve);
	return {
		name: INTEGRATION_NAME$4,
		getOptions() {
			const { quality, enableManualSnapshot, maxCanvasSize } = _canvasOptions;
			return {
				enableManualSnapshot,
				recordCanvas: true,
				getCanvasManager: (getCanvasManagerOptions) => {
					const manager = new CanvasManager({
						...getCanvasManagerOptions,
						enableManualSnapshot,
						maxCanvasSize,
						errorHandler: (err) => {
							try {
								if (typeof err === "object") err.__rrweb__ = true;
							} catch {}
						}
					});
					currentCanvasManager = manager;
					canvasManagerResolve(manager);
					return manager;
				},
				...CANVAS_QUALITY[quality] || CANVAS_QUALITY.medium
			};
		},
		async snapshot(canvasElement, options2) {
			(currentCanvasManager || await _canvasManager).snapshot(canvasElement, options2);
		}
	};
});
var replayCanvasIntegration = defineIntegration(_replayCanvasIntegration);
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/tracing/utils.js
function baggageHeaderHasSentryValues(baggageHeader) {
	return baggageHeader.split(",").some((value) => value.trim().startsWith("sentry-"));
}
function getFullURL(url) {
	try {
		return new URL(url, WINDOW.location?.href).href;
	} catch {
		return;
	}
}
function isPerformanceResourceTiming(entry) {
	return entry.entryType === "resource" && "initiatorType" in entry && typeof entry.nextHopProtocol === "string" && (entry.initiatorType === "fetch" || entry.initiatorType === "xmlhttprequest");
}
function createHeadersSafely(headers) {
	try {
		return new Headers(headers);
	} catch {
		return;
	}
}
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/tracing/request.js
var defaultRequestInstrumentationOptions = {
	traceFetch: true,
	traceXHR: true,
	enableHTTPTimings: true
};
function instrumentOutgoingRequests(client, _options) {
	const { traceFetch, traceXHR, shouldCreateSpanForRequest, enableHTTPTimings, tracePropagationTargets, onRequestSpanStart, onRequestSpanEnd } = {
		...defaultRequestInstrumentationOptions,
		..._options
	};
	const shouldCreateSpan = typeof shouldCreateSpanForRequest === "function" ? shouldCreateSpanForRequest : (_) => true;
	const shouldAttachHeadersWithTargets = (url) => shouldAttachHeaders(url, tracePropagationTargets);
	const spans = {};
	const propagateTraceparent = client.getOptions().propagateTraceparent;
	if (traceFetch) addFetchInstrumentationHandler((handlerData) => {
		const createdSpan = instrumentFetchRequest(handlerData, shouldCreateSpan, shouldAttachHeadersWithTargets, spans, {
			propagateTraceparent,
			onRequestSpanEnd,
			urlBase: WINDOW.location?.href
		});
		if (createdSpan) {
			const fullUrl = getFullURL(handlerData.fetchData.url);
			const host = fullUrl ? parseUrl(fullUrl).host?.replace(/^.*@/, "") : void 0;
			const sanitizedFullUrl = fullUrl ? stripDataUrlContent(fullUrl) : void 0;
			createdSpan.setAttributes({
				[Fg]: filterCollectedUrl(sanitizedFullUrl),
				[Kb]: host
			});
			if (enableHTTPTimings) addHTTPTimings(createdSpan, client);
			onRequestSpanStart?.(createdSpan, { headers: handlerData.headers });
		}
	});
	if (traceXHR) addXhrInstrumentationHandler((handlerData) => {
		const createdSpan = xhrCallback(handlerData, shouldCreateSpan, shouldAttachHeadersWithTargets, spans, propagateTraceparent, onRequestSpanEnd);
		if (createdSpan) {
			if (enableHTTPTimings) addHTTPTimings(createdSpan, client);
			onRequestSpanStart?.(createdSpan, { headers: createHeadersSafely(handlerData.xhr.__sentry_xhr_v3__?.request_headers) });
		}
	});
}
var HTTP_TIMING_WAIT_MS = 300;
function addHTTPTimings(span, client) {
	const url = spanToJSON(span).attributes[Fg];
	if (!url || typeof url !== "string") return;
	let onEntryFound = () => void setTimeout(unsubscribePerformanceObsever);
	if (hasSpanStreamingEnabled(client)) {
		const originalEnd = span.end.bind(span);
		span.end = (endTimestamp) => {
			const capturedEndTimestamp = endTimestamp ?? timestampInSeconds();
			let isEnded = false;
			const endSpanAndCleanup = () => {
				if (isEnded) return;
				isEnded = true;
				setTimeout(unsubscribePerformanceObsever);
				originalEnd(capturedEndTimestamp);
				clearTimeout(fallbackTimeout);
			};
			onEntryFound = endSpanAndCleanup;
			const fallbackTimeout = setTimeout(endSpanAndCleanup, HTTP_TIMING_WAIT_MS);
		};
	}
	const unsubscribePerformanceObsever = addPerformanceInstrumentationHandler("resource", ({ entries }) => {
		entries.forEach((entry) => {
			if (isPerformanceResourceTiming(entry) && entry.name.endsWith(url)) {
				span.setAttributes(resourceTimingToSpanAttributes(entry));
				onEntryFound();
			}
		});
	});
}
function shouldAttachHeaders(targetUrl, tracePropagationTargets) {
	const href = getLocationHref();
	if (!href) {
		const isRelativeSameOriginRequest = !!targetUrl.match(/^\/(?!\/)/);
		if (!tracePropagationTargets) return isRelativeSameOriginRequest;
		else return matchesTracePropagationTargets(targetUrl, tracePropagationTargets);
	} else {
		let resolvedUrl;
		let currentOrigin;
		try {
			resolvedUrl = new URL(targetUrl, href);
			currentOrigin = new URL(href).origin;
		} catch {
			return false;
		}
		const isSameOriginRequest = resolvedUrl.origin === currentOrigin;
		if (!tracePropagationTargets) return isSameOriginRequest;
		else return matchesTracePropagationTargets(resolvedUrl.toString(), tracePropagationTargets) || isSameOriginRequest && matchesTracePropagationTargets(resolvedUrl.pathname, tracePropagationTargets);
	}
}
function xhrCallback(handlerData, shouldCreateSpan, shouldAttachHeaders2, spans, propagateTraceparent, onRequestSpanEnd) {
	const xhr = handlerData.xhr;
	const sentryXhrData = xhr?.[SENTRY_XHR_DATA_KEY];
	if (!xhr || xhr.__sentry_own_request__ || !sentryXhrData) return;
	const { url, method } = sentryXhrData;
	const shouldCreateSpanResult = hasSpansEnabled() && shouldCreateSpan(url);
	if (handlerData.endTimestamp) {
		const spanId = xhr.__sentry_xhr_span_id__;
		if (!spanId) return;
		const span2 = spans[spanId];
		if (span2) {
			if (shouldCreateSpanResult && sentryXhrData.status_code !== void 0) {
				setHttpStatus(span2, sentryXhrData.status_code);
				span2.end();
				onRequestSpanEnd?.(span2, {
					headers: createHeadersSafely(parseXhrResponseHeaders(xhr)),
					error: handlerData.error
				});
			}
			delete spans[spanId];
		}
		return;
	}
	const fullUrl = getFullURL(url);
	const parsedUrl = fullUrl ? parseUrl(fullUrl) : parseUrl(url);
	const sanitizedFullUrl = fullUrl ? stripDataUrlContent(fullUrl) : void 0;
	const urlForSpanName = stripDataUrlContent(stripUrlQueryAndFragment(url));
	const client = getClient();
	const hasParent = !!getActiveSpan();
	const shouldEmitSpan = hasParent || !!client && hasSpanStreamingEnabled(client);
	const host = parsedUrl?.host?.replace(/^.*@/, "");
	const domain = getUrlDomain(fullUrl || url);
	const streamedName = domain ? `${method} ${domain}` : method;
	const span = shouldCreateSpanResult && shouldEmitSpan ? startInactiveSpan({
		name: !!client && hasSpanStreamingEnabled(client) ? streamedName : `${method} ${urlForSpanName}`,
		attributes: {
			type: "xhr",
			[$o]: method,
			[Fg]: filterCollectedUrl(sanitizedFullUrl),
			[Kb]: host,
			[Kg]: domain,
			[sb]: "auto.http.browser",
			[ab]: CE,
			[ey]: filterCollectedUrlQuery(getUrlQuery(parsedUrl?.search)),
			[Vg]: getUrlFragment(parsedUrl?.hash)
		}
	}) : new SentryNonRecordingSpan();
	const spanForTraceHeaders = spanIsIgnored(span) && hasParent ? void 0 : span;
	if (shouldCreateSpanResult && !shouldEmitSpan) client?.recordDroppedEvent("no_parent_span", "span");
	xhr.__sentry_xhr_span_id__ = span.spanContext().spanId;
	spans[xhr.__sentry_xhr_span_id__] = span;
	if (shouldAttachHeaders2(url)) addTracingHeadersToXhrRequest(xhr, hasSpansEnabled() && shouldEmitSpan ? spanForTraceHeaders : void 0, propagateTraceparent);
	if (client) client.emit("beforeOutgoingRequestSpan", span, handlerData);
	return span;
}
function addTracingHeadersToXhrRequest(xhr, span, propagateTraceparent) {
	const { "sentry-trace": sentryTrace, baggage, traceparent } = getTraceData({
		span,
		propagateTraceparent
	});
	if (sentryTrace) setHeaderOnXhr(xhr, sentryTrace, baggage, traceparent);
}
function setHeaderOnXhr(xhr, sentryTraceHeader, sentryBaggageHeader, traceparentHeader) {
	const originalHeaders = xhr.__sentry_xhr_v3__?.request_headers;
	if (originalHeaders?.["sentry-trace"] || !xhr.setRequestHeader) return;
	try {
		xhr.setRequestHeader("sentry-trace", sentryTraceHeader);
		if (traceparentHeader && !originalHeaders?.["traceparent"]) xhr.setRequestHeader("traceparent", traceparentHeader);
		if (sentryBaggageHeader) {
			const originalBaggageHeader = originalHeaders?.["baggage"];
			if (!originalBaggageHeader || !baggageHeaderHasSentryValues(originalBaggageHeader)) xhr.setRequestHeader("baggage", sentryBaggageHeader);
		}
	} catch {}
}
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/integrations/webVitals.js
var WEB_VITALS_INTEGRATION_NAME = "WebVitals";
var webVitalsIntegration = defineIntegration((options = {}) => {
	const { ignore = [], softNavigations = true, bfcacheNavigations = true } = options;
	const ignored = new Set(ignore);
	return {
		name: WEB_VITALS_INTEGRATION_NAME,
		setup(client) {
			const spanStreamingEnabled = hasSpanStreamingEnabled(client);
			const reportSoftNavs = softNavigations && spanStreamingEnabled && supportsSoftNavigations();
			const reportBfcache = bfcacheNavigations && spanStreamingEnabled;
			const perNavigation = reportSoftNavs || reportBfcache;
			if (reportSoftNavs) {
				enableSoftNavigationReporting();
				startSoftNavigationCorrelation(client);
			}
			if (reportBfcache) enableBfcacheReporting();
			const trackClsOnPageloadSpan = !spanStreamingEnabled && !ignored.has("cls");
			const trackLcpOnPageloadSpan = !spanStreamingEnabled && !ignored.has("lcp");
			const finalizeWebVitals = startTrackingWebVitals({
				trackCls: trackClsOnPageloadSpan,
				trackLcp: trackLcpOnPageloadSpan,
				client
			});
			const pageloadSpans = /* @__PURE__ */ new WeakSet();
			client.on("afterStartPageLoadSpan", (span) => {
				pageloadSpans.add(span);
			});
			client.on("spanEnd", (span) => {
				if (!pageloadSpans.delete(span)) return;
				finalizeWebVitals();
				addWebVitalsToSpan(span, {
					recordClsOnPageloadSpan: trackClsOnPageloadSpan,
					recordLcpOnPageloadSpan: trackLcpOnPageloadSpan,
					spanStreamingEnabled
				});
			});
			if (spanStreamingEnabled) {
				if (!ignored.has("lcp")) trackLcpAsSpan(client, perNavigation);
				if (!ignored.has("cls")) trackClsAsSpan(client, perNavigation);
			}
			if (!ignored.has("inp")) trackInpAsSpan(client, perNavigation);
		},
		afterAllSetup() {
			if (!ignored.has("inp")) registerInpInteractionListener();
		}
	};
});
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/tracing/backgroundtab.js
function registerBackgroundTabDetection() {
	if (WINDOW.document) WINDOW.document.addEventListener("visibilitychange", () => {
		const activeSpan = getActiveSpan();
		if (!activeSpan) return;
		const rootSpan = getRootSpan(activeSpan);
		if (WINDOW.document.hidden && rootSpan) {
			const cancelledStatus = "cancelled";
			const { attributes: { [ab]: op }, status } = spanToJSON(rootSpan);
			if (DEBUG_BUILD$2) debug$2.log(`[Tracing] Transaction: ${cancelledStatus} -> since tab moved to the background, op: ${op}`);
			if (status === "ok") rootSpan.setStatus({
				code: 2,
				message: cancelledStatus
			});
			rootSpan.setAttribute(mm, "document.hidden");
			rootSpan.end();
		}
	});
	else DEBUG_BUILD$2 && debug$2.warn("[Tracing] Could not set up background tab detection due to lack of global document");
}
var PREVIOUS_TRACE_KEY = "sentry_previous_trace";
var PREVIOUS_TRACE_TMP_SPAN_ATTRIBUTE = "sentry.previous_trace";
function linkTraces(client, { linkPreviousTrace, consistentTraceSampling }) {
	const useSessionStorage = linkPreviousTrace === "session-storage";
	let inMemoryPreviousTraceInfo = useSessionStorage ? getPreviousTraceFromSessionStorage() : void 0;
	client.on("spanStart", (span) => {
		if (getRootSpan(span) !== span) return;
		const oldPropagationContext = getCurrentScope().getPropagationContext();
		inMemoryPreviousTraceInfo = addPreviousTraceSpanLink(inMemoryPreviousTraceInfo, span, oldPropagationContext);
		if (useSessionStorage) storePreviousTraceInSessionStorage(inMemoryPreviousTraceInfo);
	});
	let isFirstTraceOnPageload = true;
	if (consistentTraceSampling) client.on("beforeSampling", (mutableSamplingContextData) => {
		if (!inMemoryPreviousTraceInfo) return;
		const scope = getCurrentScope();
		const currentPropagationContext = scope.getPropagationContext();
		if (isFirstTraceOnPageload && currentPropagationContext.parentSpanId) {
			isFirstTraceOnPageload = false;
			return;
		}
		scope.setPropagationContext({
			...currentPropagationContext,
			dsc: {
				...currentPropagationContext.dsc,
				sample_rate: String(inMemoryPreviousTraceInfo.sampleRate),
				sampled: String(spanContextSampled(inMemoryPreviousTraceInfo.spanContext))
			},
			sampleRand: inMemoryPreviousTraceInfo.sampleRand
		});
		mutableSamplingContextData.parentSampled = spanContextSampled(inMemoryPreviousTraceInfo.spanContext);
		mutableSamplingContextData.parentSampleRate = inMemoryPreviousTraceInfo.sampleRate;
		mutableSamplingContextData.spanAttributes = {
			...mutableSamplingContextData.spanAttributes,
			[SEMANTIC_ATTRIBUTE_SENTRY_PREVIOUS_TRACE_SAMPLE_RATE]: inMemoryPreviousTraceInfo.sampleRate
		};
	});
}
function addPreviousTraceSpanLink(previousTraceInfo, span, oldPropagationContext) {
	const spanJson = spanToJSON(span);
	function getSampleRate() {
		try {
			const oldSampleRate = Number(spanJson.attributes["sentry.sample_rate"] ?? oldPropagationContext.dsc?.sample_rate);
			return Number.isNaN(oldSampleRate) ? 0 : oldSampleRate;
		} catch {
			return 0;
		}
	}
	const updatedPreviousTraceInfo = {
		spanContext: span.spanContext(),
		startTimestamp: spanJson.start_timestamp,
		sampleRate: getSampleRate(),
		sampleRand: oldPropagationContext.sampleRand
	};
	if (!previousTraceInfo) return updatedPreviousTraceInfo;
	const previousTraceSpanCtx = previousTraceInfo.spanContext;
	if (previousTraceSpanCtx.traceId === spanJson.trace_id) return previousTraceInfo;
	if (Date.now() / 1e3 - previousTraceInfo.startTimestamp <= 3600) {
		if (DEBUG_BUILD$2) debug$2.log(`Adding previous_trace \`${JSON.stringify(previousTraceSpanCtx)}\` link to span \`${JSON.stringify({
			op: spanJson.attributes[ab],
			...span.spanContext()
		})}\``);
		span.addLink({
			context: previousTraceSpanCtx,
			attributes: { [jm]: "previous_trace" }
		});
		span.setAttribute(PREVIOUS_TRACE_TMP_SPAN_ATTRIBUTE, `${previousTraceSpanCtx.traceId}-${previousTraceSpanCtx.spanId}-${spanContextSampled(previousTraceSpanCtx) ? 1 : 0}`);
	}
	return updatedPreviousTraceInfo;
}
function storePreviousTraceInSessionStorage(previousTraceInfo) {
	try {
		WINDOW.sessionStorage.setItem(PREVIOUS_TRACE_KEY, JSON.stringify(previousTraceInfo));
	} catch (e) {
		DEBUG_BUILD$2 && debug$2.warn("Could not store previous trace in sessionStorage", e);
	}
}
function getPreviousTraceFromSessionStorage() {
	try {
		const previousTraceInfo = WINDOW.sessionStorage?.getItem(PREVIOUS_TRACE_KEY);
		return JSON.parse(previousTraceInfo);
	} catch {
		return;
	}
}
function spanContextSampled(ctx) {
	return ctx.traceFlags === 1;
}
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/tracing/browserTracingIntegration.js
var BROWSER_TRACING_INTEGRATION_ID = "BrowserTracing";
var DEFAULT_BROWSER_TRACING_OPTIONS = {
	...TRACING_DEFAULTS,
	instrumentNavigation: true,
	instrumentBfcacheRestore: true,
	instrumentPageLoad: true,
	markBackgroundSpan: true,
	enableLongTask: true,
	enableLongAnimationFrame: true,
	enableInp: true,
	ignoreResourceSpans: [],
	detectRedirects: true,
	linkPreviousTrace: "in-memory",
	consistentTraceSampling: false,
	enableReportPageLoaded: false,
	...defaultRequestInstrumentationOptions
};
var browserTracingIntegration$1 = ((options = {}) => {
	if ("enableElementTiming" in options) consoleSandbox(() => {
		console.warn("[Sentry] `enableElementTiming` is deprecated and no longer has any effect. Use the standalone `elementTimingIntegration` instead.");
	});
	const optionalWindowDocument = WINDOW.document;
	const { enableInp, enableLongTask, enableLongAnimationFrame, webVitals, beforeStartSpan, idleTimeout, finalTimeout, childSpanTimeout, markBackgroundSpan, traceFetch, traceXHR, shouldCreateSpanForRequest, enableHTTPTimings, ignoreResourceSpans, instrumentPageLoad, instrumentNavigation, instrumentBfcacheRestore, detectRedirects, linkPreviousTrace, consistentTraceSampling, enableReportPageLoaded, onRequestSpanStart, onRequestSpanEnd } = {
		...DEFAULT_BROWSER_TRACING_OPTIONS,
		...options
	};
	const _isBot = isBotUserAgent();
	let lastInteractionTimestamp;
	let _pageloadSpan;
	function _createRouteSpan(client, startSpanOptions, makeActive = true, url) {
		const isPageloadSpan = startSpanOptions.op === "pageload";
		const initialSpanName = startSpanOptions.name;
		const finalStartSpanOptions = beforeStartSpan ? beforeStartSpan(startSpanOptions) : startSpanOptions;
		const urlObject = parseStringToURLObject(url || getLocationHref());
		const attributes = {
			[Hg]: urlObject?.pathname,
			...urlObject && !isURLObjectRelative(urlObject) && { ["url.full"]: filterCollectedUrl(urlObject.href) },
			...finalStartSpanOptions.attributes
		};
		if (initialSpanName !== finalStartSpanOptions.name) attributes[kb$1] = "custom";
		finalStartSpanOptions.attributes = attributes;
		if (!makeActive) {
			const now = dateTimestampInSeconds();
			startInactiveSpan({
				...finalStartSpanOptions,
				startTime: now
			}).end(now);
			return;
		}
		const idleSpan = startIdleSpan(finalStartSpanOptions, {
			idleTimeout,
			finalTimeout,
			childSpanTimeout,
			disableAutoFinish: isPageloadSpan,
			trimIdleSpanEndTimestamp: !enableReportPageLoaded
		});
		if (isPageloadSpan && enableReportPageLoaded) _pageloadSpan = idleSpan;
		setActiveIdleSpan(client, idleSpan);
		function emitFinish() {
			if (optionalWindowDocument && ["interactive", "complete"].includes(optionalWindowDocument.readyState)) {
				client.emit("idleSpanEnableAutoFinish", idleSpan);
				optionalWindowDocument.removeEventListener("readystatechange", emitFinish);
			}
		}
		if (isPageloadSpan && !enableReportPageLoaded && optionalWindowDocument) {
			optionalWindowDocument.addEventListener("readystatechange", emitFinish);
			emitFinish();
		}
	}
	return {
		name: BROWSER_TRACING_INTEGRATION_ID,
		setup(client) {
			if (_isBot) {
				DEBUG_BUILD$2 && debug$2.log("[Tracing] Skipping browserTracingIntegration setup for bot user agent.");
				return;
			}
			registerSpanErrorInstrumentation();
			if (enableLongAnimationFrame && GLOBAL_OBJ.PerformanceObserver && PerformanceObserver.supportedEntryTypes?.includes("long-animation-frame")) startTrackingLongAnimationFrames();
			else if (enableLongTask) startTrackingLongTasks();
			if (detectRedirects && optionalWindowDocument) {
				const interactionHandler = () => {
					lastInteractionTimestamp = timestampInSeconds();
				};
				addEventListener("click", interactionHandler, { capture: true });
				addEventListener("keydown", interactionHandler, {
					capture: true,
					passive: true
				});
			}
			function maybeEndActiveSpan() {
				const activeSpan = getActiveIdleSpan(client);
				if (activeSpan && !spanToJSON(activeSpan).end_timestamp) {
					DEBUG_BUILD$2 && debug$2.log(`[Tracing] Finishing current active span with op: ${spanToJSON(activeSpan).attributes["sentry.op"]}`);
					activeSpan.setAttribute(Gm, "cancelled");
					activeSpan.end();
				}
			}
			client.on("beforeIdleSpanEnd", (span) => {
				if (getActiveIdleSpan(client) !== span) return;
				addPerformanceEntries(span, {
					ignoreResourceSpans,
					spanStreamingEnabled: hasSpanStreamingEnabled(client)
				});
				setActiveIdleSpan(client, void 0);
				const scope = getCurrentScope();
				const oldPropagationContext = scope.getPropagationContext();
				scope.setPropagationContext({
					...oldPropagationContext,
					traceId: span.spanContext().traceId,
					sampled: spanIsSampled(span),
					dsc: getDynamicSamplingContextFromSpan(span)
				});
				if (_pageloadSpan === span) _pageloadSpan = void 0;
			});
			client.on("startNavigationSpan", (startSpanOptions, navigationOptions) => {
				if (getClient() !== client) return;
				if (navigationOptions?.isRedirect) {
					DEBUG_BUILD$2 && debug$2.warn("[Tracing] Detected redirect, navigation span will not be the root span, but a child span.");
					_createRouteSpan(client, {
						op: _$3,
						...startSpanOptions
					}, false, navigationOptions.url);
					return;
				}
				lastInteractionTimestamp = void 0;
				maybeEndActiveSpan();
				const scope = getCurrentScope();
				scope.setPropagationContext({
					traceId: generateTraceId(),
					sampleRand: Math.random(),
					propagationSpanId: hasSpansEnabled() ? void 0 : generateSpanId()
				});
				scope.setSDKProcessingMetadata({ normalizedRequest: void 0 });
				_createRouteSpan(client, {
					op: E$2,
					...startSpanOptions,
					parentSpan: null
				}, true, navigationOptions?.url);
			});
			client.on("startPageLoadSpan", (startSpanOptions, traceOptions = {}) => {
				if (getClient() !== client) return;
				maybeEndActiveSpan();
				const propagationContext = propagationContextFromHeaders(traceOptions.sentryTrace || getMetaContent("sentry-trace") || getServerTiming("sentry-trace"), traceOptions.baggage || getMetaContent("baggage") || getServerTiming("baggage"));
				const scope = getCurrentScope();
				scope.setPropagationContext(propagationContext);
				if (!hasSpansEnabled()) scope.getPropagationContext().propagationSpanId = generateSpanId();
				const requestData = getHttpRequestData(client);
				scope.setSDKProcessingMetadata({ normalizedRequest: {
					...requestData,
					url: filterCollectedUrl(requestData.url, client)
				} });
				_createRouteSpan(client, {
					op: e$3,
					...startSpanOptions
				});
			});
			client.on("endPageloadSpan", () => {
				if (enableReportPageLoaded && _pageloadSpan) {
					_pageloadSpan.setAttribute(Gm, "reportPageLoaded");
					_pageloadSpan.end();
				}
			});
			WINDOW.addEventListener?.("pagehide", () => {
				const activeSpan = getActiveIdleSpan(client);
				if (activeSpan && !spanToJSON(activeSpan).end_timestamp) {
					activeSpan.setAttribute(Gm, "documentHidden");
					activeSpan.end();
				}
				client.flush();
			});
		},
		afterAllSetup(client) {
			if (_isBot) return;
			_INTERNAL_ensureBrowserSpanStreaming(client);
			if (client.addIntegration && !client.getIntegrationByName?.("WebVitals")) {
				const ignore = webVitals?.ignore ?? [];
				client.addIntegration(webVitalsIntegration({
					...webVitals,
					ignore: enableInp || ignore.includes("inp") ? ignore : [...ignore, "inp"]
				}));
			}
			let startingUrl = getLocationHref();
			if (linkPreviousTrace !== "off") linkTraces(client, {
				linkPreviousTrace,
				consistentTraceSampling
			});
			if (WINDOW.location) {
				if (instrumentPageLoad) startBrowserTracingPageLoadSpan(client, {
					name: hasSpanStreamingEnabled(client) ? PAGELOAD_SPAN_NAME_FALLBACK : WINDOW.location.pathname,
					attributes: {
						[kb$1]: "url",
						[sb]: "auto.pageload.browser"
					}
				});
				if (instrumentNavigation) addHistoryInstrumentationHandler(({ to, from }) => {
					if (from === void 0 && startingUrl !== void 0 && startingUrl.indexOf(to) !== -1) {
						startingUrl = void 0;
						return;
					}
					startingUrl = void 0;
					const parsed = parseStringToURLObject(to);
					const activeSpan = getActiveIdleSpan(client);
					const navigationIsRedirect = activeSpan && detectRedirects && isRedirect(activeSpan, lastInteractionTimestamp);
					startBrowserTracingNavigationSpan(client, {
						name: hasSpanStreamingEnabled(client) ? NAVIGATION_SPAN_NAME_FALLBACK : parsed?.pathname || WINDOW.location.pathname,
						attributes: {
							[kb$1]: "url",
							[sb]: "auto.navigation.browser"
						}
					}, {
						url: to,
						isRedirect: navigationIsRedirect
					});
				});
				if (instrumentBfcacheRestore) WINDOW.addEventListener?.("pageshow", (event) => {
					if (!event.persisted) return;
					startingUrl = void 0;
					startBrowserTracingNavigationSpan(client, {
						name: hasSpanStreamingEnabled(client) ? NAVIGATION_SPAN_NAME_FALLBACK : WINDOW.location?.pathname || "/",
						attributes: {
							[kb$1]: "url",
							[sb]: "auto.navigation.browser.bfcache",
							[$t]: "back-forward-cache"
						}
					}, { url: WINDOW.location?.href });
				});
			}
			if (markBackgroundSpan) registerBackgroundTabDetection();
			instrumentOutgoingRequests(client, {
				traceFetch,
				traceXHR,
				tracePropagationTargets: client.getOptions().tracePropagationTargets,
				shouldCreateSpanForRequest,
				enableHTTPTimings,
				onRequestSpanStart,
				onRequestSpanEnd
			});
		}
	};
});
function startBrowserTracingPageLoadSpan(client, spanOptions, traceOptions) {
	const isFallbackSpanName = spanOptions.name === PAGELOAD_SPAN_NAME_FALLBACK;
	getCurrentScope().setTransactionName(isFallbackSpanName ? WINDOW.location?.pathname : spanOptions.name);
	const timeOrigin = browserPerformanceTimeOrigin();
	const pageloadSpanOptions = {
		...spanOptions,
		startTime: spanOptions.startTime ?? (timeOrigin ? timeOrigin / 1e3 : void 0)
	};
	client.emit("startPageLoadSpan", pageloadSpanOptions, traceOptions);
	const pageloadSpan = getActiveIdleSpan(client);
	if (pageloadSpan) client.emit("afterStartPageLoadSpan", pageloadSpan);
	return pageloadSpan;
}
function startBrowserTracingNavigationSpan(client, spanOptions, options) {
	const { url, isRedirect: isRedirect2 } = options || {};
	client.emit("beforeStartNavigationSpan", spanOptions, {
		isRedirect: isRedirect2,
		url
	});
	client.emit("startNavigationSpan", spanOptions, {
		isRedirect: isRedirect2,
		url
	});
	const scope = getCurrentScope();
	const isFallbackSpanName = spanOptions.name === NAVIGATION_SPAN_NAME_FALLBACK;
	scope.setTransactionName(isFallbackSpanName ? url && parseStringToURLObject(url)?.pathname || WINDOW.location?.pathname : spanOptions.name);
	if (url && !isRedirect2) scope.setSDKProcessingMetadata({ normalizedRequest: {
		...getHttpRequestData(client),
		url: filterCollectedUrl(url, client)
	} });
	return getActiveIdleSpan(client);
}
function getMetaContent(metaName) {
	return (WINDOW.document?.querySelector(`meta[name=${metaName}]`))?.getAttribute("content") || void 0;
}
function getServerTiming(name) {
	return ((WINDOW.performance?.getEntriesByType?.("navigation")[0])?.serverTiming?.find((entry2) => entry2.name === name))?.description;
}
var ACTIVE_IDLE_SPAN_PROPERTY = "_sentry_idleSpan";
function getActiveIdleSpan(client) {
	return client[ACTIVE_IDLE_SPAN_PROPERTY];
}
function setActiveIdleSpan(client, span) {
	addNonEnumerableProperty(client, ACTIVE_IDLE_SPAN_PROPERTY, span);
}
var REDIRECT_THRESHOLD = 1.5;
function isRedirect(activeSpan, lastInteractionTimestamp) {
	const spanData = spanToJSON(activeSpan);
	const now = dateTimestampInSeconds();
	if (now - spanData.start_timestamp > REDIRECT_THRESHOLD) return false;
	if (lastInteractionTimestamp && now - lastInteractionTimestamp <= REDIRECT_THRESHOLD) return false;
	return true;
}
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/tracing/reportPageLoaded.js
function reportPageLoaded(client = getClient()) {
	client?.emit("endPageloadSpan");
}
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/tracing/setActiveSpan.js
function setActiveSpanInBrowser(span) {
	const maybePreviousActiveSpan = getActiveSpan();
	if (maybePreviousActiveSpan === span) return;
	const scope = getCurrentScope();
	span.end = new Proxy(span.end, { apply(target, thisArg, args) {
		_setSpanForScope(scope, maybePreviousActiveSpan);
		return Reflect.apply(target, thisArg, args);
	} });
	_setSpanForScope(scope, span);
}
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/integrations/fetchStreamPerformance.js
var responseToStreamSpan = /* @__PURE__ */ new WeakMap();
var responseToFallbackTimeout = /* @__PURE__ */ new WeakMap();
var STREAM_RESOLVE_FALLBACK_MS = 9e4;
var STREAMING_CONTENT_TYPES = [
	"text/event-stream",
	"application/x-ndjson",
	"application/stream+json"
];
var fetchStreamPerformanceIntegration = defineIntegration(() => {
	return {
		name: "FetchStreamPerformance",
		setup(client) {
			addFetchEndInstrumentationHandler((handlerData) => {
				if (handlerData.response) {
					const streamSpan = responseToStreamSpan.get(handlerData.response);
					if (streamSpan && handlerData.endTimestamp) {
						streamSpan.end(handlerData.endTimestamp);
						const fallbackTimeout = responseToFallbackTimeout.get(handlerData.response);
						if (fallbackTimeout) clearTimeout(fallbackTimeout);
					}
				}
			});
			addFetchInstrumentationHandler((handlerData) => {
				if (handlerData.endTimestamp && handlerData.response) {
					const contentType = handlerData.response.headers?.get("content-type") || "";
					if (handlerData.response.headers?.get("content-length") || !STREAMING_CONTENT_TYPES.some((t) => contentType.startsWith(t))) return;
					const url = handlerData.fetchData?.url || "";
					const method = handlerData.fetchData?.method || "GET";
					const parsedUrl = parseStringToURLObject(url);
					const sanitizedUrl = url.startsWith("data:") ? stripDataUrlContent(url) : parsedUrl ? getSanitizedUrlStringFromUrlObject(parsedUrl) : url;
					const domain = getUrlDomain(url, WINDOW.location?.href);
					const streamedName = domain ? `${method} ${domain}` : method;
					const streamSpan = startInactiveSpan({
						name: hasSpanStreamingEnabled(client) ? streamedName : `${method} ${sanitizedUrl}`,
						startTime: handlerData.endTimestamp,
						attributes: {
							[Fg]: filterCollectedUrl(stripDataUrlContent(url)),
							[Kg]: domain,
							[$o]: method,
							type: "fetch",
							[ab]: nE,
							[sb]: "auto.http.browser.stream"
						}
					});
					responseToStreamSpan.set(handlerData.response, streamSpan);
					const fallbackTimeout = setTimeout(() => {
						if (streamSpan.isRecording()) streamSpan.end();
					}, STREAM_RESOLVE_FALLBACK_MS);
					responseToFallbackTimeout.set(handlerData.response, fallbackTimeout);
				}
			});
		}
	};
});
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/integrations/bfcacheMetrics.js
var INTEGRATION_NAME$3 = "BfcacheMetrics";
var bfcacheMetricsIntegration = defineIntegration((options = {}) => {
	const maxReasons = _resolveMaxReasons(options.maxReasons);
	return {
		name: INTEGRATION_NAME$3,
		setupOnce() {
			if (!WINDOW.addEventListener || !WINDOW.performance?.getEntriesByType) {
				DEBUG_BUILD$2 && debug$2.log(`[${INTEGRATION_NAME$3}] Browser APIs unavailable, skipping instrumentation.`);
				return;
			}
			function onPageShow(event) {
				const routeName = _getSegmentName();
				if (event.persisted) {
					_captureBFCacheNavigation("hit", 0, routeName);
					return;
				}
				const navigationEntry = WINDOW.performance.getEntriesByType("navigation")[0];
				if (navigationEntry?.type !== "back_forward") return;
				const reasons = _collectNotRestoredReasons(navigationEntry.notRestoredReasons, maxReasons);
				_captureBFCacheNavigation("miss", reasons.length, routeName);
				if (typeof navigationEntry.duration === "number" && navigationEntry.duration > 0) distribution("browser.bfcache.reload.duration", navigationEntry.duration, {
					unit: "millisecond",
					attributes: _withOriginAttr({ [vb]: routeName })
				});
				reasons.forEach((r) => _captureBFCacheReason(r, routeName));
			}
			WINDOW.addEventListener("pageshow", onPageShow, true);
		}
	};
});
function _captureBFCacheNavigation(outcome, reasonCount, routeName) {
	count("browser.bfcache.navigation", 1, { attributes: _withOriginAttr({
		[Qt]: outcome,
		[Ht]: reasonCount || void 0,
		[vb]: routeName
	}) });
}
function _captureBFCacheReason({ reason, frame }, routeName) {
	count("browser.bfcache.not_restored", 1, { attributes: _withOriginAttr({
		[Jt]: reason,
		[Ft]: frame,
		[vb]: routeName
	}) });
}
function _getSegmentName() {
	return resolveCurrentRoute() || getCurrentScope().getScopeData().transactionName || WINDOW.location?.pathname;
}
function _resolveMaxReasons(maxReasons) {
	if (maxReasons == null) return Infinity;
	if (maxReasons < 1) {
		DEBUG_BUILD$2 && debug$2.warn(`[${INTEGRATION_NAME$3}] \`maxReasons\` must be at least 1, got ${maxReasons}. Using 1 instead.`);
		return 1;
	}
	return maxReasons;
}
function _collectNotRestoredReasons(notRestoredReasons, maxReasons) {
	const reasons = [];
	if (!notRestoredReasons || maxReasons <= 0) return reasons;
	_collectReasonsFromFrame(notRestoredReasons, "top", reasons, maxReasons);
	return reasons;
}
function _collectReasonsFromFrame(frame, frameType, collectedReasons, maxReasons) {
	if (collectedReasons.length >= maxReasons) return;
	frame.reasons?.forEach((reason) => {
		if (collectedReasons.length >= maxReasons) return;
		const reasonValue = typeof reason === "string" ? reason : reason.reason;
		if (!reasonValue) return;
		collectedReasons.push({
			reason: reasonValue,
			frame: frameType
		});
	});
	frame.children?.forEach((child) => {
		_collectReasonsFromFrame(child, "child", collectedReasons, maxReasons);
	});
}
function _withOriginAttr(attributes) {
	attributes[sb] = "auto.browser.bfcache";
	return attributes;
}
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/transports/offline.js
function promisifyRequest(request) {
	return new Promise((resolve, reject) => {
		request.oncomplete = request.onsuccess = () => resolve(request.result);
		request.onabort = request.onerror = () => reject(request.error);
	});
}
function createStore(dbName, storeName) {
	const request = indexedDB.open(dbName);
	request.onupgradeneeded = () => request.result.createObjectStore(storeName);
	const dbp = promisifyRequest(request);
	return (callback) => dbp.then((db) => callback(db.transaction(storeName, "readwrite").objectStore(storeName)));
}
function keys(store) {
	return promisifyRequest(store.getAllKeys());
}
function push(store, value, maxQueueSize) {
	return store((store2) => {
		return keys(store2).then((keys2) => {
			if (keys2.length >= maxQueueSize) return;
			store2.put(value, Math.max(...keys2, 0) + 1);
			return promisifyRequest(store2.transaction);
		});
	});
}
function unshift(store, value, maxQueueSize) {
	return store((store2) => {
		return keys(store2).then((keys2) => {
			if (keys2.length >= maxQueueSize) return;
			store2.put(value, Math.min(...keys2, 0) - 1);
			return promisifyRequest(store2.transaction);
		});
	});
}
function shift(store) {
	return store((store2) => {
		return keys(store2).then((keys2) => {
			const firstKey = keys2[0];
			if (firstKey == null) return;
			return promisifyRequest(store2.get(firstKey)).then((value) => {
				store2.delete(firstKey);
				return promisifyRequest(store2.transaction).then(() => value);
			});
		});
	});
}
function createIndexedDbStore(options) {
	let store;
	function getStore() {
		if (store == void 0) store = createStore(options.dbName || "sentry-offline", options.storeName || "queue");
		return store;
	}
	return {
		push: async (env) => {
			try {
				const serialized = serializeEnvelope(env);
				await push(getStore(), serialized, options.maxQueueSize || 30);
			} catch {}
		},
		unshift: async (env) => {
			try {
				const serialized = serializeEnvelope(env);
				await unshift(getStore(), serialized, options.maxQueueSize || 30);
			} catch {}
		},
		shift: async () => {
			try {
				const deserialized = await shift(getStore());
				if (deserialized) return parseEnvelope(deserialized);
			} catch {}
		}
	};
}
function makeIndexedDbOfflineTransport(createTransport) {
	return (options) => {
		const transport = createTransport({
			...options,
			createStore: createIndexedDbStore
		});
		WINDOW.addEventListener("online", async (_) => {
			await transport.flush();
		});
		return transport;
	};
}
function makeBrowserOfflineTransport(createTransport = makeFetchTransport) {
	return makeIndexedDbOfflineTransport(makeOfflineTransport(createTransport));
}
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/profiling/utils.js
var isMainThread = "window" in GLOBAL_OBJ && GLOBAL_OBJ.window === GLOBAL_OBJ && typeof importScripts === "undefined";
var PROFILER_THREAD_ID_STRING = String(0);
var PROFILER_THREAD_NAME = isMainThread ? "main" : "worker";
function createProfileChunkPayload(jsSelfProfile, client, profilerId) {
	if (jsSelfProfile == null) throw new TypeError(`Cannot construct profiling event envelope without a valid profile. Got ${jsSelfProfile} instead.`);
	const continuousProfile = convertToContinuousProfile(jsSelfProfile);
	const options = client.getOptions();
	const sdk = client.getSdkMetadata?.()?.sdk;
	return {
		chunk_id: uuid4(),
		client_sdk: {
			name: sdk?.name ?? "sentry.javascript.browser",
			version: sdk?.version ?? "0.0.0"
		},
		profiler_id: profilerId || uuid4(),
		platform: "javascript",
		version: "2",
		release: options.release ?? "",
		environment: options.environment ?? "production",
		debug_meta: { images: applyDebugMetadata(jsSelfProfile.resources) },
		profile: continuousProfile
	};
}
function validateProfileChunk(chunk) {
	try {
		if (!chunk || typeof chunk !== "object") return { reason: "chunk is not an object" };
		const isHex32 = (val) => typeof val === "string" && /^[a-f0-9]{32}$/.test(val);
		if (!isHex32(chunk.profiler_id)) return { reason: "missing or invalid profiler_id" };
		if (!isHex32(chunk.chunk_id)) return { reason: "missing or invalid chunk_id" };
		if (!chunk.client_sdk) return { reason: "missing client_sdk metadata" };
		const profile = chunk.profile;
		if (!profile) return { reason: "missing profile data" };
		if (!Array.isArray(profile.frames) || !profile.frames.length) return { reason: "profile has no frames" };
		if (!Array.isArray(profile.stacks) || !profile.stacks.length) return { reason: "profile has no stacks" };
		if (!Array.isArray(profile.samples) || !profile.samples.length) return { reason: "profile has no samples" };
		return { valid: true };
	} catch (e) {
		return { reason: `unknown validation error: ${e}` };
	}
}
function convertToContinuousProfile(input) {
	const frames = [];
	for (let i = 0; i < input.frames.length; i++) {
		const frame = input.frames[i];
		if (!frame) continue;
		frames[i] = {
			function: frame.name,
			abs_path: typeof frame.resourceId === "number" ? input.resources[frame.resourceId] : void 0,
			lineno: frame.line,
			colno: frame.column
		};
	}
	const stacks = [];
	for (let i = 0; i < input.stacks.length; i++) {
		const stackHead = input.stacks[i];
		if (!stackHead) continue;
		const list = [];
		let current = stackHead;
		while (current) {
			list.push(current.frameId);
			current = current.parentId === void 0 ? void 0 : input.stacks[current.parentId];
		}
		stacks[i] = list;
	}
	const emptyStackId = input.stacks.length;
	const samples = [];
	for (let i = 0; i < input.samples.length; i++) {
		const sample = input.samples[i];
		if (!sample) continue;
		const stackId = sample.stackId ?? emptyStackId;
		if (stackId === emptyStackId) stacks[emptyStackId] ?? (stacks[emptyStackId] = []);
		const timestampSeconds = performanceTimeToSeconds(sample.timestamp);
		samples[i] = {
			stack_id: stackId,
			thread_id: PROFILER_THREAD_ID_STRING,
			timestamp: timestampSeconds
		};
	}
	return {
		frames,
		stacks,
		samples,
		thread_metadata: { [PROFILER_THREAD_ID_STRING]: { name: PROFILER_THREAD_NAME } }
	};
}
function applyDebugMetadata(resource_paths) {
	const stackParser = (getClient()?.getOptions())?.stackParser;
	if (!stackParser) return [];
	return getDebugImagesForResources(stackParser, resource_paths);
}
function isValidSampleRate(rate) {
	if (typeof rate !== "number" && typeof rate !== "boolean" || typeof rate === "number" && isNaN(rate)) {
		DEBUG_BUILD$2 && debug$2.warn(`[Profiling] Invalid sample rate. Sample rate must be a boolean or a number between 0 and 1. Got ${JSON.stringify(rate)} of type ${JSON.stringify(typeof rate)}.`);
		return false;
	}
	if (rate === true || rate === false) return true;
	if (rate < 0 || rate > 1) {
		DEBUG_BUILD$2 && debug$2.warn(`[Profiling] Invalid sample rate. Sample rate must be between 0 and 1. Got ${rate}.`);
		return false;
	}
	return true;
}
var PROFILING_CONSTRUCTOR_FAILED = false;
var MAX_PROFILE_DURATION_MS = 3e4;
function isJSProfilerSupported(maybeProfiler) {
	return typeof maybeProfiler === "function";
}
function startJSSelfProfile() {
	const JSProfilerConstructor = WINDOW.Profiler;
	if (!isJSProfilerSupported(JSProfilerConstructor)) {
		if (DEBUG_BUILD$2) debug$2.log("[Profiling] Profiling is not supported by this browser, Profiler interface missing on window object.");
		return;
	}
	const samplingIntervalMS = 10;
	const maxSamples = Math.floor(MAX_PROFILE_DURATION_MS / samplingIntervalMS);
	try {
		return new JSProfilerConstructor({
			sampleInterval: samplingIntervalMS,
			maxBufferSize: maxSamples
		});
	} catch {
		if (DEBUG_BUILD$2) {
			debug$2.log("[Profiling] Failed to initialize the Profiling constructor, this is likely due to a missing 'Document-Policy': 'js-profiling' header.");
			debug$2.log("[Profiling] Disabling profiling for current user session.");
		}
		PROFILING_CONSTRUCTOR_FAILED = true;
	}
}
function shouldProfileSession(options) {
	if (PROFILING_CONSTRUCTOR_FAILED) {
		if (DEBUG_BUILD$2) debug$2.log("[Profiling] Profiling has been disabled for the duration of the current user session as the JS Profiler could not be started.");
		return false;
	}
	if (options.profileLifecycle !== "trace" && options.profileLifecycle !== "manual") {
		DEBUG_BUILD$2 && debug$2.warn("[Profiling] Session not sampled. Invalid `profileLifecycle` option.");
		return false;
	}
	const profileSessionSampleRate = options.profileSessionSampleRate;
	if (!isValidSampleRate(profileSessionSampleRate)) {
		DEBUG_BUILD$2 && debug$2.warn("[Profiling] Discarding profile because of invalid profileSessionSampleRate.");
		return false;
	}
	if (!profileSessionSampleRate) {
		DEBUG_BUILD$2 && debug$2.log("[Profiling] Discarding profile because profileSessionSampleRate is not defined or set to 0");
		return false;
	}
	return Math.random() <= profileSessionSampleRate;
}
function setThreadAttributes(span) {
	span.setAttribute(lg, PROFILER_THREAD_ID_STRING);
	span.setAttribute(pg, PROFILER_THREAD_NAME);
}
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/profiling/UIProfiler.js
var CHUNK_INTERVAL_MS = 6e4;
var MAX_ROOT_SPAN_PROFILE_MS = 3e5;
var UIProfiler = class {
	constructor() {
		this._client = void 0;
		this._profiler = void 0;
		this._chunkTimer = void 0;
		this._profilerId = void 0;
		this._isRunning = false;
		this._sessionSampled = false;
		this._lifecycleMode = void 0;
		this._activeRootSpanIds = /* @__PURE__ */ new Set();
		this._rootSpanTimeouts = /* @__PURE__ */ new Map();
	}
	/**
	* Initialize the profiler with client, session sampling and lifecycle mode.
	*/
	initialize(client) {
		const lifecycleMode = client.getOptions().profileLifecycle;
		const sessionSampled = shouldProfileSession(client.getOptions());
		DEBUG_BUILD$2 && debug$2.log(`[Profiling] Initializing profiler (lifecycle='${lifecycleMode}').`);
		if (!sessionSampled) DEBUG_BUILD$2 && debug$2.log("[Profiling] Session not sampled. Skipping lifecycle profiler initialization.");
		this._profilerId = uuid4();
		this._client = client;
		this._sessionSampled = sessionSampled;
		this._lifecycleMode = lifecycleMode;
		if (lifecycleMode === "trace") this._setupTraceLifecycleListeners(client);
		client.on("spanStart", (span) => {
			if (this._isRunning) setThreadAttributes(span);
		});
	}
	/** Starts UI profiling (only effective in 'manual' mode and when sampled). */
	start() {
		if (this._lifecycleMode === "trace") {
			DEBUG_BUILD$2 && debug$2.warn("[Profiling] `profileLifecycle` is set to \"trace\". Calls to `uiProfiler.start()` are ignored in trace mode.");
			return;
		}
		if (this._isRunning) {
			DEBUG_BUILD$2 && debug$2.warn("[Profiling] Profile session is already running, `uiProfiler.start()` is a no-op.");
			return;
		}
		if (!this._sessionSampled) {
			DEBUG_BUILD$2 && debug$2.warn("[Profiling] Session is not sampled, `uiProfiler.start()` is a no-op.");
			return;
		}
		this._beginProfiling();
	}
	/** Stops UI profiling (only effective in 'manual' mode). */
	stop() {
		if (this._lifecycleMode === "trace") {
			DEBUG_BUILD$2 && debug$2.warn("[Profiling] `profileLifecycle` is set to \"trace\". Calls to `uiProfiler.stop()` are ignored in trace mode.");
			return;
		}
		if (!this._isRunning) {
			DEBUG_BUILD$2 && debug$2.warn("[Profiling] Profiler is not running, `uiProfiler.stop()` is a no-op.");
			return;
		}
		this._endProfiling();
	}
	/** Handle an already-active root span at integration setup time (used only in trace mode). */
	notifyRootSpanActive(rootSpan) {
		if (this._lifecycleMode !== "trace" || !this._sessionSampled || !rootSpan.isRecording()) return;
		const spanId = rootSpan.spanContext().spanId;
		if (!spanId || this._activeRootSpanIds.has(spanId)) return;
		this._registerTraceRootSpan(spanId);
		const rootSpanCount = this._activeRootSpanIds.size;
		if (rootSpanCount === 1) {
			DEBUG_BUILD$2 && debug$2.log("[Profiling] Detected already active root span during setup. Active root spans now:", rootSpanCount);
			this._beginProfiling();
		}
		if (this._isRunning) setThreadAttributes(rootSpan);
	}
	/**
	* Begin profiling if not already running.
	*/
	_beginProfiling() {
		if (this._isRunning) return;
		this._isRunning = true;
		DEBUG_BUILD$2 && debug$2.log("[Profiling] Started profiling with profiler ID:", this._profilerId);
		getGlobalScope().setContext("profile", { profiler_id: this._profilerId });
		this._startProfilerInstance();
		if (!this._profiler) {
			DEBUG_BUILD$2 && debug$2.log("[Profiling] Failed to start JS Profiler; stopping.");
			this._resetProfilerInfo();
			return;
		}
		this._startPeriodicChunking();
	}
	/** End profiling session; final chunk will be collected and sent. */
	_endProfiling() {
		if (!this._isRunning) return;
		this._isRunning = false;
		if (this._chunkTimer) {
			clearTimeout(this._chunkTimer);
			this._chunkTimer = void 0;
		}
		this._clearAllRootSpanTimeouts();
		this._collectCurrentChunk().catch((e) => {
			DEBUG_BUILD$2 && debug$2.error("[Profiling] Failed to collect current profile chunk on `stop()`:", e);
		});
		if (this._lifecycleMode === "manual") getGlobalScope().setContext("profile", {});
	}
	/** Trace-mode: attach spanStart/spanEnd listeners. */
	_setupTraceLifecycleListeners(client) {
		client.on("spanStart", (span) => {
			if (!this._sessionSampled) {
				DEBUG_BUILD$2 && debug$2.log("[Profiling] Span not profiled because of negative sampling decision for user session.");
				return;
			}
			if (span !== getRootSpan(span)) return;
			if (!span.isRecording()) {
				DEBUG_BUILD$2 && debug$2.log("[Profiling] Discarding profile because root span was not sampled.");
				return;
			}
			const spanId = span.spanContext().spanId;
			if (!spanId || this._activeRootSpanIds.has(spanId)) return;
			this._registerTraceRootSpan(spanId);
			const rootSpanCount = this._activeRootSpanIds.size;
			if (rootSpanCount === 1) {
				DEBUG_BUILD$2 && debug$2.log(`[Profiling] Root span ${spanId} started. Profiling active while there are active root spans (count=${rootSpanCount}).`);
				this._beginProfiling();
			}
		});
		client.on("spanEnd", (span) => {
			if (!this._sessionSampled) return;
			const spanId = span.spanContext().spanId;
			if (!spanId || !this._activeRootSpanIds.has(spanId)) return;
			this._activeRootSpanIds.delete(spanId);
			const rootSpanCount = this._activeRootSpanIds.size;
			DEBUG_BUILD$2 && debug$2.log(`[Profiling] Root span with ID ${spanId} ended. Will continue profiling for as long as there are active root spans (currently: ${rootSpanCount}).`);
			if (rootSpanCount === 0) {
				this._collectCurrentChunk().catch((e) => {
					DEBUG_BUILD$2 && debug$2.error("[Profiling] Failed to collect current profile chunk on last `spanEnd`:", e);
				});
				this._endProfiling();
			}
		});
	}
	/**
	* Resets profiling information from scope and resets running state (used on failure)
	*/
	_resetProfilerInfo() {
		this._isRunning = false;
		getGlobalScope().setContext("profile", {});
	}
	/**
	* Clear and reset all per-root-span timeouts.
	*/
	_clearAllRootSpanTimeouts() {
		this._rootSpanTimeouts.forEach((timeout) => clearTimeout(timeout));
		this._rootSpanTimeouts.clear();
	}
	/** Keep track of root spans and schedule safeguard timeout (trace mode). */
	_registerTraceRootSpan(spanId) {
		this._activeRootSpanIds.add(spanId);
		const timeout = setTimeout(() => this._onRootSpanTimeout(spanId), MAX_ROOT_SPAN_PROFILE_MS);
		this._rootSpanTimeouts.set(spanId, timeout);
	}
	/**
	* Start a profiler instance if needed.
	*/
	_startProfilerInstance() {
		if (this._profiler?.stopped === false) return;
		const profiler = startJSSelfProfile();
		if (!profiler) {
			DEBUG_BUILD$2 && debug$2.log("[Profiling] Failed to start JS Profiler.");
			return;
		}
		this._profiler = profiler;
	}
	/**
	* Schedule the next 60s chunk while running.
	* Each tick collects a chunk and restarts the profiler.
	* A chunk should be closed when there are no active root spans anymore OR when the maximum chunk interval is reached.
	*/
	_startPeriodicChunking() {
		if (!this._isRunning) return;
		this._chunkTimer = setTimeout(() => {
			this._collectCurrentChunk().catch((e) => {
				DEBUG_BUILD$2 && debug$2.error("[Profiling] Failed to collect current profile chunk during periodic chunking:", e);
			});
			if (this._isRunning) {
				this._startProfilerInstance();
				if (!this._profiler) {
					this._resetProfilerInfo();
					return;
				}
				this._startPeriodicChunking();
			}
		}, CHUNK_INTERVAL_MS);
	}
	/**
	* Handle timeout for a specific root span ID to avoid indefinitely running profiler if `spanEnd` never fires.
	* If this was the last active root span, collect the current chunk and stop profiling.
	*/
	_onRootSpanTimeout(rootSpanId) {
		if (!this._rootSpanTimeouts.has(rootSpanId)) return;
		this._rootSpanTimeouts.delete(rootSpanId);
		if (!this._activeRootSpanIds.has(rootSpanId)) return;
		DEBUG_BUILD$2 && debug$2.log(`[Profiling] Reached 5-minute timeout for root span ${rootSpanId}. You likely started a manual root span that never called \`.end()\`.`);
		this._activeRootSpanIds.delete(rootSpanId);
		if (this._activeRootSpanIds.size === 0) this._endProfiling();
	}
	/**
	* Stop current profiler instance, convert profile to chunk & send.
	*/
	async _collectCurrentChunk() {
		const prevProfiler = this._profiler;
		this._profiler = void 0;
		if (!prevProfiler) return;
		try {
			const chunk = createProfileChunkPayload(await prevProfiler.stop(), this._client, this._profilerId);
			const validationReturn = validateProfileChunk(chunk);
			if ("reason" in validationReturn) {
				DEBUG_BUILD$2 && debug$2.log("[Profiling] Discarding invalid profile chunk (this is probably a bug in the SDK):", validationReturn.reason);
				return;
			}
			this._sendProfileChunk(chunk);
			DEBUG_BUILD$2 && debug$2.log("[Profiling] Collected browser profile chunk.");
		} catch (e) {
			DEBUG_BUILD$2 && debug$2.log("[Profiling] Error while stopping JS Profiler for chunk:", e);
		}
	}
	/**
	* Send a profile chunk as a standalone envelope.
	*/
	_sendProfileChunk(chunk) {
		const client = this._client;
		const sdkInfo = getSdkMetadataForEnvelopeHeader(client.getSdkMetadata?.());
		const dsn = client.getDsn();
		const tunnel = client.getOptions().tunnel;
		const envelope = createEnvelope({
			event_id: uuid4(),
			sent_at: (/* @__PURE__ */ new Date()).toISOString(),
			...sdkInfo && { sdk: sdkInfo },
			...!!tunnel && dsn && { dsn: dsnToString(dsn) }
		}, [[{
			type: "profile_chunk",
			platform: "javascript"
		}, chunk]]);
		client.sendEnvelope(envelope).then(null, (reason) => {
			DEBUG_BUILD$2 && debug$2.error("Error while sending profile chunk envelope:", reason);
		});
	}
};
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/profiling/integration.js
var INTEGRATION_NAME$2 = "BrowserProfiling";
var _browserProfilingIntegration = (() => {
	return {
		name: INTEGRATION_NAME$2,
		setup(client) {
			const options = client.getOptions();
			const profiler = new UIProfiler();
			if (!options.profileLifecycle) options.profileLifecycle = "manual";
			const activeSpan = getActiveSpan();
			const rootSpan = activeSpan && getRootSpan(activeSpan);
			const lifecycleMode = options.profileLifecycle;
			client.on("startUIProfiler", () => profiler.start());
			client.on("stopUIProfiler", () => profiler.stop());
			if (lifecycleMode === "manual") profiler.initialize(client);
			else if (lifecycleMode === "trace") {
				if (!hasSpansEnabled(options)) {
					DEBUG_BUILD$2 && debug$2.warn("[Profiling] `profileLifecycle` is 'trace' but tracing is disabled. Set a `tracesSampleRate` or `tracesSampler` to enable span tracing.");
					return;
				}
				profiler.initialize(client);
				if (rootSpan) profiler.notifyRootSpanActive(rootSpan);
				WINDOW.setTimeout(() => {
					const laterActiveSpan = getActiveSpan();
					const laterRootSpan = laterActiveSpan && getRootSpan(laterActiveSpan);
					if (laterRootSpan) profiler.notifyRootSpanActive(laterRootSpan);
				}, 0);
			}
		}
	};
});
var browserProfilingIntegration = defineIntegration(_browserProfilingIntegration);
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/integrations/featureFlags/launchdarkly/integration.js
var launchDarklyIntegration = defineIntegration(() => {
	return {
		name: "LaunchDarkly",
		processEvent(event, _hint, _client) {
			return _INTERNAL_copyFlagsFromScopeToEvent(event);
		}
	};
});
function buildLaunchDarklyFlagUsedHandler() {
	return {
		name: "sentry-flag-auditor",
		type: "flag-used",
		synchronous: true,
		/**
		* Handle a flag evaluation by storing its name and value on the current scope.
		*/
		method: (flagKey, flagDetail, _context) => {
			_INTERNAL_insertFlagToScope(flagKey, flagDetail.value);
			_INTERNAL_addFeatureFlagToActiveSpan(flagKey, flagDetail.value);
		}
	};
}
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/integrations/featureFlags/openfeature/integration.js
var openFeatureIntegration = defineIntegration(() => {
	return {
		name: "OpenFeature",
		processEvent(event, _hint, _client) {
			return _INTERNAL_copyFlagsFromScopeToEvent(event);
		}
	};
});
var OpenFeatureIntegrationHook = class {
	/**
	* Successful evaluation result.
	*/
	after(_hookContext, evaluationDetails) {
		_INTERNAL_insertFlagToScope(evaluationDetails.flagKey, evaluationDetails.value);
		_INTERNAL_addFeatureFlagToActiveSpan(evaluationDetails.flagKey, evaluationDetails.value);
	}
	/**
	* On error evaluation result.
	*/
	error(hookContext, _error, _hookHints) {
		_INTERNAL_insertFlagToScope(hookContext.flagKey, hookContext.defaultValue);
		_INTERNAL_addFeatureFlagToActiveSpan(hookContext.flagKey, hookContext.defaultValue);
	}
};
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/integrations/featureFlags/unleash/integration.js
var unleashIntegration = defineIntegration(({ featureFlagClientClass: unleashClientClass }) => {
	return {
		name: "Unleash",
		setupOnce() {
			const unleashClientPrototype = unleashClientClass.prototype;
			fill(unleashClientPrototype, "isEnabled", _wrappedIsEnabled);
		},
		processEvent(event, _hint, _client) {
			return _INTERNAL_copyFlagsFromScopeToEvent(event);
		}
	};
});
function _wrappedIsEnabled(original) {
	return function(...args) {
		const toggleName = args[0];
		const result = original.apply(this, args);
		if (typeof toggleName === "string" && typeof result === "boolean") {
			_INTERNAL_insertFlagToScope(toggleName, result);
			_INTERNAL_addFeatureFlagToActiveSpan(toggleName, result);
		} else if (DEBUG_BUILD$2) debug$2.error(`[Feature Flags] UnleashClient.isEnabled does not match expected signature. arg0: ${toggleName} (${typeof toggleName}), result: ${result} (${typeof result})`);
		return result;
	};
}
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/integrations/featureFlags/growthbook/integration.js
var growthbookIntegration = (({ growthbookClass }) => growthbookIntegration$1({ growthbookClass }));
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/integrations/featureFlags/statsig/integration.js
var statsigIntegration = defineIntegration(({ featureFlagClient: statsigClient }) => {
	return {
		name: "Statsig",
		setup(_client) {
			statsigClient.on("gate_evaluation", (event) => {
				_INTERNAL_insertFlagToScope(event.gate.name, event.gate.value);
				_INTERNAL_addFeatureFlagToActiveSpan(event.gate.name, event.gate.value);
			});
		},
		processEvent(event, _hint, _client) {
			return _INTERNAL_copyFlagsFromScopeToEvent(event);
		}
	};
});
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/diagnose-sdk.js
async function diagnoseSdkConnectivity() {
	const client = getClient();
	if (!client) return "no-client-active";
	if (!client.getDsn()) return "no-dsn-configured";
	const url = client.getOptions().tunnel || "https://o447951.ingest.sentry.io/api/4509632503087104/envelope/?sentry_version=7&sentry_key=c1dfb07d783ad5325c245c1fd3725390&sentry_client=sentry.javascript.browser%2F1.33.7";
	try {
		await suppressTracing(() => fetch(url, {
			body: "{}",
			method: "POST",
			mode: "cors",
			credentials: "omit"
		}));
	} catch {
		return "sentry-unreachable";
	}
}
// ../DnD helper/node_modules/@sentry/browser/build/npm/esm/dev/integrations/webWorker.js
var INTEGRATION_NAME$1 = "WebWorker";
var MAX_FORWARDED_ERRORS = 20;
var webWorkerIntegration = defineIntegration(({ worker }) => ({
	name: INTEGRATION_NAME$1,
	setupOnce: () => {
		(Array.isArray(worker) ? worker : [worker]).forEach((w) => listenForSentryMessages(w));
	},
	addWorker: (worker2) => listenForSentryMessages(worker2)
}));
function listenForSentryMessages(worker) {
	const forwardedErrors = [];
	worker.addEventListener("error", ({ message, filename, lineno, colno }) => {
		const index = forwardedErrors.findIndex((e) => e.message === message && e.url === filename && e.lineno === lineno && e.colno === colno);
		if (index !== -1) {
			forwardedErrors.splice(0, index + 1);
			ignoreNextOnErrorMatching({
				msg: message,
				url: filename,
				line: lineno,
				column: colno
			});
		}
	});
	worker.addEventListener("message", (event) => {
		if (isSentryMessage(event.data)) {
			event.stopImmediatePropagation();
			if (event.data._sentryDebugIds) {
				DEBUG_BUILD$2 && debug$2.log("Sentry debugId web worker message received", event.data);
				WINDOW._sentryDebugIds = {
					...event.data._sentryDebugIds,
					...WINDOW._sentryDebugIds
				};
			}
			if (event.data._sentryModuleMetadata) {
				DEBUG_BUILD$2 && debug$2.log("Sentry module metadata web worker message received", event.data);
				WINDOW._sentryModuleMetadata = {
					...event.data._sentryModuleMetadata,
					...WINDOW._sentryModuleMetadata
				};
			}
			if (event.data._sentryWasmImages) {
				DEBUG_BUILD$2 && debug$2.log("Sentry WASM images web worker message received", event.data);
				const existingImages = WINDOW._sentryWasmImages || [];
				const newImages = event.data._sentryWasmImages.filter((newImg) => isPlainObject(newImg) && typeof newImg.code_file === "string" && !existingImages.some((existing) => existing.code_file === newImg.code_file));
				WINDOW._sentryWasmImages = [...existingImages, ...newImages];
			}
			if (event.data._sentryWorkerError) {
				DEBUG_BUILD$2 && debug$2.log("Sentry worker error message received", event.data._sentryWorkerError);
				const { kind, message, url, lineno, colno } = event.data._sentryWorkerError;
				if (kind === "error") {
					if (forwardedErrors.push({
						message,
						url,
						lineno,
						colno
					}) > MAX_FORWARDED_ERRORS) forwardedErrors.shift();
				}
				handleForwardedWorkerError(event.data._sentryWorkerError);
			}
		}
	});
}
function handleForwardedWorkerError(workerError) {
	const { reason, kind, name, filename, url, lineno, colno, plainError } = workerError;
	const isUnhandledRejection = kind !== "error";
	const error = plainError && isPlainObject(reason) ? errorFromPlain(reason) : reason;
	if (name && isError(error) && error.name !== name) addNonEnumerableProperty(error, "name", name);
	const client = getClient();
	if (!client) return;
	const { stackParser, attachStacktrace } = client.getOptions();
	const event = isUnhandledRejection && isPrimitive(error) ? _eventFromRejectionWithPrimitive(error) : eventFromUnknownInput(stackParser, error, void 0, attachStacktrace, isUnhandledRejection);
	if (!isUnhandledRejection) _enhanceEventWithInitialFrame(event, url || filename, lineno, colno);
	event.level = "error";
	if (filename) event.contexts = {
		...event.contexts,
		worker: { filename }
	};
	captureEvent(event, {
		originalException: error,
		mechanism: {
			handled: false,
			type: isUnhandledRejection ? "auto.browser.web_worker.onunhandledrejection" : "auto.browser.web_worker.onerror"
		}
	});
	DEBUG_BUILD$2 && debug$2.log(`Captured worker ${isUnhandledRejection ? "unhandled rejection" : "error"}`, error);
}
function registerWebWorker({ self }) {
	Error.stackTraceLimit = 50;
	self.postMessage({
		_sentryMessage: true,
		_sentryDebugIds: self._sentryDebugIds ?? void 0,
		_sentryModuleMetadata: self._sentryModuleMetadata ?? void 0
	});
	const forward = (serializedError) => {
		const { reason } = serializedError;
		DEBUG_BUILD$2 && debug$2.log(`[Sentry Worker] Forwarding ${serializedError.kind} to parent`, serializedError);
		postSerializedWorkerError(self, {
			...serializedError,
			filename: self.location?.href,
			name: isError(reason) ? extractType(reason) : void 0
		});
	};
	self.addEventListener("error", (event) => {
		const { error, message, filename, lineno, colno } = event;
		forward({
			kind: "error",
			reason: error ?? message,
			message,
			url: filename,
			lineno,
			colno
		});
	});
	self.addEventListener("unhandledrejection", (event) => {
		forward({
			kind: "unhandledrejection",
			reason: _getUnhandledRejectionError(event)
		});
	});
	DEBUG_BUILD$2 && debug$2.log("[Sentry Worker] Registered worker with error and unhandled rejection handling");
}
function postSerializedWorkerError(self, serializedError) {
	try {
		self.postMessage({
			_sentryMessage: true,
			_sentryWorkerError: serializedError
		});
		return;
	} catch {}
	const { reason } = serializedError;
	const plainError = isError(reason);
	const plainReason = plainError ? {
		message: extractMessage(reason),
		stack: reason.stack
	} : normalize(reason);
	try {
		self.postMessage({
			_sentryMessage: true,
			_sentryWorkerError: {
				...serializedError,
				reason: plainReason,
				plainError
			}
		});
	} catch {}
}
function errorFromPlain(plain) {
	const error = new Error(String(plain.message));
	error.stack = typeof plain.stack === "string" ? plain.stack : void 0;
	return error;
}
function isSentryMessage(eventData) {
	if (!isPlainObject(eventData) || eventData._sentryMessage !== true) return false;
	const hasDebugIds = "_sentryDebugIds" in eventData;
	const hasModuleMetadata = "_sentryModuleMetadata" in eventData;
	const hasWorkerError = "_sentryWorkerError" in eventData;
	const hasWasmImages = "_sentryWasmImages" in eventData;
	if (!hasDebugIds && !hasModuleMetadata && !hasWorkerError && !hasWasmImages) return false;
	if (hasDebugIds && !(isPlainObject(eventData._sentryDebugIds) || eventData._sentryDebugIds === void 0)) return false;
	if (hasModuleMetadata && !(isPlainObject(eventData._sentryModuleMetadata) || eventData._sentryModuleMetadata === void 0)) return false;
	if (hasWorkerError && !isPlainObject(eventData._sentryWorkerError)) return false;
	if (hasWasmImages && (!Array.isArray(eventData._sentryWasmImages) || !eventData._sentryWasmImages.every((img) => isPlainObject(img) && typeof img.code_file === "string"))) return false;
	return true;
}
// ../DnD helper/node_modules/@sentry/vue/build/esm/constants.js
var DEFAULT_HOOKS = ["activate", "mount"];
var DEFAULT_ROOT_SPAN_TIMEOUT = 2e3;
// ../DnD helper/node_modules/@sentry/vue/build/esm/debug-build.js
var DEBUG_BUILD = typeof __SENTRY_DEBUG__ === "undefined" || __SENTRY_DEBUG__;
// ../DnD helper/node_modules/@sentry/vue/build/esm/vendor/components.js
var classifyRE = /(?:^|[-_])(\w)/g;
var classify = (str) => str.replace(classifyRE, (c) => c.toUpperCase()).replace(/[-_]/g, "");
var ROOT_COMPONENT_NAME = "<Root>";
var ANONYMOUS_COMPONENT_NAME = "<Anonymous>";
var repeat = (str, n) => {
	return str.repeat(n);
};
var formatComponentName = (vm, includeFile) => {
	if (!vm) return ANONYMOUS_COMPONENT_NAME;
	if (vm.$root === vm) return ROOT_COMPONENT_NAME;
	if (!vm.$options) return ANONYMOUS_COMPONENT_NAME;
	const options = vm.$options;
	let name = options.name || options._componentTag || options.__name;
	const file = options.__file;
	if (!name && file) {
		const match = file.match(/([^/\\]+)\.vue$/);
		if (match) name = match[1];
	}
	return (name ? `<${classify(name)}>` : ANONYMOUS_COMPONENT_NAME) + (file && includeFile !== false ? ` at ${file}` : "");
};
var generateComponentTrace = (vm) => {
	if (vm && (vm._isVue || vm.__isVue) && vm.$parent) {
		const tree = [];
		let currentRecursiveSequence = 0;
		while (vm) {
			if (tree.length > 0) {
				const last = tree[tree.length - 1];
				if (last.constructor === vm.constructor) {
					currentRecursiveSequence++;
					vm = vm.$parent;
					continue;
				} else if (currentRecursiveSequence > 0) {
					tree[tree.length - 1] = [last, currentRecursiveSequence];
					currentRecursiveSequence = 0;
				}
			}
			tree.push(vm);
			vm = vm.$parent;
		}
		return `

found in

${tree.map((vm2, i) => `${(i === 0 ? "---> " : repeat(" ", 5 + i * 2)) + (Array.isArray(vm2) ? `${formatComponentName(vm2[0])}... (${vm2[1]} recursive calls)` : formatComponentName(vm2))}`).join("\n")}`;
	}
	return `

(found in ${formatComponentName(vm)})`;
};
// ../DnD helper/node_modules/@sentry/vue/build/esm/errorhandler.js
var attachErrorHandler = (app, options) => {
	const { errorHandler: originalErrorHandler } = app.config;
	app.config.errorHandler = (error, vm, lifecycleHook) => {
		const metadata = {
			componentName: formatComponentName(vm, false),
			lifecycleHook,
			trace: vm ? generateComponentTrace(vm) : ""
		};
		if (options?.attachProps !== false && vm) {
			if (vm.$options?.propsData) metadata.propsData = vm.$options.propsData;
			else if (vm.$props) metadata.propsData = vm.$props;
		}
		setTimeout(() => {
			captureException(error, {
				captureContext: { contexts: { vue: metadata } },
				mechanism: {
					handled: !!originalErrorHandler,
					type: "auto.function.vue.error_handler"
				}
			});
		});
		if (typeof originalErrorHandler === "function" && app.config.errorHandler) originalErrorHandler.call(app, error, vm, lifecycleHook);
		else throw error;
	};
};
// ../DnD helper/node_modules/@sentry/vue/build/esm/rootInstrumentation.js
var instrumentedApps = /* @__PURE__ */ new WeakSet();
function createRootViewModel() {
	const vm = { $props: {} };
	vm.$root = vm;
	return vm;
}
function instrumentAppMountWithoutMixin(app, mixins) {
	if (instrumentedApps.has(app)) return;
	const appWithMount = app;
	const originalMount = appWithMount.mount;
	if (typeof originalMount !== "function") return;
	const vm = createRootViewModel();
	instrumentedApps.add(app);
	const mountHooks = mixins;
	appWithMount.mount = function(...args) {
		mountHooks.beforeMount?.call(vm);
		try {
			return originalMount.apply(this, args);
		} finally {
			mountHooks.mounted?.call(vm);
		}
	};
}
// ../DnD helper/node_modules/@sentry/vue/build/esm/routeProvider.js
function createVueRouteProvider(getRouter) {
	return createUrlRouteProvider((url) => {
		const router = getRouter();
		const resolved = router?.resolve?.(getRouterLocation(router, url));
		if (!resolved) return;
		const route = "matched" in resolved ? resolved : resolved.route;
		return route.matched[route.matched.length - 1]?.path;
	});
}
function getRouterFromApp(app) {
	return (Array.isArray(app) ? app[0] : app)?.config?.globalProperties?.$router;
}
function captureRouterFromVue(Vue) {
	let router;
	Vue.mixin({ beforeCreate() {
		router = router || this.$options.router;
	} });
	return () => router;
}
function getRouterLocation(router, { pathname, search, hash }) {
	const base = router.options?.history?.base ?? router.history?.base ?? "";
	const hashPos = base.indexOf("#");
	if (hashPos > -1 || router.mode === "hash") {
		const hashBase = hashPos > -1 ? base.slice(hashPos) : "#";
		const path2 = hash.slice(hash.startsWith(hashBase) ? hashBase.length : 1);
		return path2.startsWith("/") ? path2 : `/${path2}`;
	}
	return `${base && pathname.toLowerCase().startsWith(base.toLowerCase()) ? pathname.slice(base.length) || "/" : pathname}${search}${hash}`;
}
// ../DnD helper/node_modules/@sentry/vue/build/esm/tracing.js
var VUE_OPERATION_TO_SPAN_OP = {
	activate: W$1,
	create: W$1,
	mount: W$1,
	update: v$3,
	unmount: V$1,
	destroy: V$1
};
var VUE_OPERATION_TO_SPAN_NAME_FALLBACK = {
	activate: UI_MOUNT_SPAN_NAME_FALLBACK,
	create: UI_MOUNT_SPAN_NAME_FALLBACK,
	mount: UI_MOUNT_SPAN_NAME_FALLBACK,
	update: UI_UPDATE_SPAN_NAME_FALLBACK,
	unmount: UI_UNMOUNT_SPAN_NAME_FALLBACK,
	destroy: UI_UNMOUNT_SPAN_NAME_FALLBACK
};
var HOOKS = {
	activate: ["activated", "deactivated"],
	create: ["beforeCreate", "created"],
	unmount: ["beforeUnmount", "unmounted"],
	destroy: ["beforeDestroy", "destroyed"],
	mount: ["beforeMount", "mounted"],
	update: ["beforeUpdate", "updated"]
};
function maybeEndRootComponentSpan(vm, timestamp, timeout) {
	const root = vm.$root;
	root.$_sentryRootComponentSpanActivity = timestamp;
	if (!root.$_sentryRootComponentSpanTimer) scheduleRootComponentSpanEnd(root, timestamp, timeout);
}
function scheduleRootComponentSpanEnd(root, activityWhenScheduled, delayMs) {
	root.$_sentryRootComponentSpanTimer = setTimeout(() => {
		root.$_sentryRootComponentSpanTimer = void 0;
		const lastActivity = root.$_sentryRootComponentSpanActivity ?? activityWhenScheduled;
		if (lastActivity > activityWhenScheduled) {
			scheduleRootComponentSpanEnd(root, lastActivity, (lastActivity - activityWhenScheduled) * 1e3);
			return;
		}
		if (root.$_sentryRootComponentSpan) {
			root.$_sentryRootComponentSpan.end(lastActivity);
			root.$_sentryRootComponentSpan = void 0;
		}
	}, delayMs);
}
function findTrackComponent(trackComponents, formattedName) {
	function extractComponentName(name) {
		return name.replace(/^<([^\s]*)>(?: at [^\s]*)?$/, "$1");
	}
	return trackComponents.some((compo) => {
		return extractComponentName(formattedName) === extractComponentName(compo);
	});
}
var createTracingMixins = (options = {}) => {
	const hooks = uniq((options.hooks || []).concat(DEFAULT_HOOKS));
	const mixins = {};
	const rootComponentSpanFinalTimeout = options.timeout || 2e3;
	for (const operation of hooks) {
		const internalHooks = HOOKS[operation];
		if (!internalHooks) {
			DEBUG_BUILD && debug$2.warn(`Unknown hook: ${operation}`);
			continue;
		}
		for (const internalHook of internalHooks) mixins[internalHook] = function() {
			const isRootComponent = this.$root === this;
			const client = getClient();
			const hasSpanStreaming = !!client && hasSpanStreamingEnabled(client);
			const componentName = formatComponentName(this, false);
			const innerName = componentName.match(/^<([^\s]*)>(?: at [^\s]*)?$/)?.[1] ?? componentName;
			const conventionComponentName = innerName === "Anonymous" ? void 0 : innerName;
			if (isRootComponent) {
				const description = "Application Render";
				this.$_sentryRootComponentSpan = this.$_sentryRootComponentSpan || startInactiveSpan({
					name: hasSpanStreaming ? conventionComponentName || "Component render" : description,
					attributes: {
						["sentry.op"]: "ui.render",
						["sentry.origin"]: "auto.ui.vue",
						["ui.component_name"]: conventionComponentName || void 0,
						...hasSpanStreaming && { ["sentry.description"]: description }
					},
					onlyIfParent: true
				});
				maybeEndRootComponentSpan(this, timestampInSeconds(), rootComponentSpanFinalTimeout);
			}
			if (!(isRootComponent || (Array.isArray(options.trackComponents) ? findTrackComponent(options.trackComponents, componentName) : options.trackComponents))) {
				maybeEndRootComponentSpan(this, timestampInSeconds(), rootComponentSpanFinalTimeout);
				return;
			}
			this.$_sentryComponentSpans = this.$_sentryComponentSpans || {};
			const isBeforeHook = internalHook === internalHooks[0];
			const activeSpan = this.$root?.$_sentryRootComponentSpan || getActiveSpan();
			if (isBeforeHook) {
				if (activeSpan) {
					const oldSpan = this.$_sentryComponentSpans[operation];
					if (oldSpan) oldSpan.end();
					const description = `Vue ${componentName}`;
					this.$_sentryComponentSpans[operation] = startInactiveSpan({
						name: hasSpanStreaming ? conventionComponentName || VUE_OPERATION_TO_SPAN_NAME_FALLBACK[operation] : description,
						attributes: {
							[ab]: VUE_OPERATION_TO_SPAN_OP[operation],
							[sb]: "auto.ui.vue",
							[Cg]: conventionComponentName || void 0,
							...hasSpanStreaming && { ["sentry.description"]: description }
						},
						onlyIfParent: true
					});
				}
			} else {
				const span = this.$_sentryComponentSpans[operation];
				if (!span) return;
				span.end();
				maybeEndRootComponentSpan(this, timestampInSeconds(), rootComponentSpanFinalTimeout);
			}
		};
	}
	return mixins;
};
// ../DnD helper/node_modules/@sentry/vue/build/esm/integration.js
var DEFAULT_CONFIG = {
	Vue: GLOBAL_OBJ.Vue,
	attachProps: true,
	attachErrorHandler: true,
	tracingOptions: {
		hooks: DEFAULT_HOOKS,
		timeout: DEFAULT_ROOT_SPAN_TIMEOUT,
		trackComponents: false
	}
};
var INTEGRATION_NAME = "Vue";
var vueIntegration = defineIntegration((integrationOptions = {}) => {
	return {
		name: INTEGRATION_NAME,
		setup(client) {
			const options = {
				...DEFAULT_CONFIG,
				...client.getOptions(),
				...integrationOptions
			};
			if (!options.Vue && !options.app) {
				consoleSandbox(() => {
					console.warn("[@sentry/vue]: Misconfigured SDK. Vue specific errors will not be captured. Update your `Sentry.init` call with an appropriate config option: `app` (Application Instance - Vue 3) or `Vue` (Vue Constructor - Vue 2).");
				});
				return;
			}
			if (!getRouteProvider(client)) {
				const { app, Vue } = options;
				setRouteProvider(createVueRouteProvider(app ? () => getRouterFromApp(app) : captureRouterFromVue(Vue)), client);
			}
			if (options.app) (Array.isArray(options.app) ? options.app : [options.app]).forEach((app) => vueInit(app, options));
			else if (options.Vue) vueInit(options.Vue, options);
		}
	};
});
var vueInit = (app, options) => {
	if (DEBUG_BUILD) {
		if (app._instance?.isMounted === true) consoleSandbox(() => {
			console.warn("[@sentry/vue]: Misconfigured SDK. Vue app is already mounted. Make sure to call `app.mount()` after `Sentry.init()`.");
		});
	}
	if (options.attachErrorHandler) attachErrorHandler(app, options);
	if (hasSpansEnabled(options)) {
		const mixins = createTracingMixins(options.tracingOptions);
		app.mixin(mixins);
		if (!mixinWasApplied(app, mixins)) {
			instrumentAppMountWithoutMixin(app, mixins);
			warnAboutLostComponentTracking(app, options.tracingOptions);
		}
	}
};
function mixinWasApplied(app, mixin) {
	const mixins = app._context?.mixins;
	return !mixins || mixins.includes(mixin);
}
function warnAboutLostComponentTracking(app, tracingOptions) {
	const trackComponents = tracingOptions?.trackComponents;
	if (!(trackComponents === true || Array.isArray(trackComponents) && trackComponents.length > 0)) return;
	const fix = "$nuxt" in app ? "Set `vue: { optionsApi: true }` in your `nuxt.config.ts`." : "Set `__VUE_OPTIONS_API__` to `true` in the `define` config of your bundler.";
	consoleSandbox(() => {
		console.warn(`[@sentry/vue]: The Vue Options API is disabled (\`__VUE_OPTIONS_API__: false\`). Sentry still records the \`Application Render\` and root component mount spans, but component tracking (\`trackComponents\`) needs the Options API. ${fix}`);
	});
}
// ../DnD helper/node_modules/@sentry/vue/build/esm/normalizeStringifyValue.js
function isVueViewModel(wat) {
	return !!(typeof wat === "object" && wat && (wat.__isVue || wat._isVue));
}
function isVNode(wat) {
	return !!(typeof wat === "object" && wat?.__v_isVNode);
}
function normalizeStringifyValue$2(value) {
	if (isVueViewModel(value)) return "[VueViewModel]";
	if (isVNode(value)) return "[VueVNode]";
	return normalizeStringifyValue(value);
}
// ../DnD helper/node_modules/@sentry/vue/build/esm/sdk.js
function init(options = {}) {
	const opts = {
		defaultIntegrations: [...getDefaultIntegrations(options), vueIntegration()],
		...options
	};
	applySdkMetadata(opts, "vue");
	const client = init$1(opts);
	setNormalizeStringifier(normalizeStringifyValue$2);
	return client;
}
// ../DnD helper/node_modules/@sentry/vue/build/esm/router.js
function instrumentVueRouter(router, options, startNavigationSpanFn) {
	let hasHandledFirstPageLoad = false;
	const isLegacyRouter = "mode" in router;
	router.onError((error) => captureException(error, { mechanism: { handled: false } }));
	router.beforeEach((to, _from, ...rest) => {
		const activePageLoadSpan = !hasHandledFirstPageLoad ? getActivePageLoadSpan() : void 0;
		const attributes = {};
		for (const key of Object.keys(to.params)) {
			attributes[`${Jg}.${key}`] = to.params[key];
			attributes[`${sd}.${key}`] = to.params[key];
		}
		for (const key of Object.keys(to.query)) {
			const value = to.query[key];
			if (value) attributes[`query.${key}`] = value;
		}
		let spanName = to.path;
		let transactionSource = "url";
		if (to.name && options.routeLabel !== "path") {
			spanName = to.name.toString();
			transactionSource = "custom";
		} else if (to.matched.length > 0) {
			const lastIndex = to.matched.length - 1;
			spanName = to.matched[lastIndex].path;
			transactionSource = "route";
		}
		if (transactionSource === "route") attributes[ay] = spanName;
		if (to.name) attributes[Kd] = to.name.toString();
		getCurrentScope().setTransactionName(spanName);
		if (options.instrumentPageLoad && activePageLoadSpan) {
			if (spanToJSON(activePageLoadSpan).attributes["sentry.segment.name.source"] !== "custom") {
				const client = getClient();
				const isUnparameterizedStreamedPageload = transactionSource === "url" && !!client && hasSpanStreamingEnabled(client);
				activePageLoadSpan.updateName(isUnparameterizedStreamedPageload ? PAGELOAD_SPAN_NAME_FALLBACK : spanName);
				activePageLoadSpan.setAttribute(kb$1, transactionSource);
			}
			activePageLoadSpan.setAttributes({
				...attributes,
				[sb]: "auto.pageload.vue"
			});
			hasHandledFirstPageLoad = true;
		}
		if (options.instrumentNavigation && !activePageLoadSpan) {
			const client = getClient();
			startNavigationSpanFn({
				name: transactionSource === "url" && !!client && hasSpanStreamingEnabled(client) ? NAVIGATION_SPAN_NAME_FALLBACK : spanName,
				attributes: {
					...attributes,
					[ab]: E$2,
					[sb]: "auto.navigation.vue",
					[kb$1]: transactionSource
				}
			}, getAbsoluteUrl(to.fullPath ?? to.path));
		}
		if (isLegacyRouter) {
			const next = rest[0];
			if (typeof next === "function") next();
		}
	});
}
function getActivePageLoadSpan() {
	const span = getActiveSpan();
	const rootSpan = span && getRootSpan(span);
	if (!rootSpan) return;
	return spanToJSON(rootSpan).attributes["sentry.op"] === "pageload" ? rootSpan : void 0;
}
// ../DnD helper/node_modules/@sentry/vue/build/esm/browserTracingIntegration.js
function browserTracingIntegration(options = {}) {
	if (!options.router) return browserTracingIntegration$1(options);
	const integration = browserTracingIntegration$1({
		...options,
		instrumentNavigation: false
	});
	const { router, instrumentNavigation = true, instrumentPageLoad = true, routeLabel = "name" } = options;
	return {
		...integration,
		afterAllSetup(client) {
			integration.afterAllSetup(client);
			const startNavigationSpan = (options2, destinationUrl) => {
				startBrowserTracingNavigationSpan(client, options2, { url: destinationUrl });
			};
			instrumentVueRouter(router, {
				routeLabel,
				instrumentNavigation,
				instrumentPageLoad
			}, startNavigationSpan);
		}
	};
}
// ../DnD helper/node_modules/@sentry/vue/build/esm/pinia.js
var DEFAULT_PINIA_PLUGIN_OPTIONS = {
	attachPiniaState: true,
	addBreadcrumbs: true,
	actionTransformer: (action) => action,
	stateTransformer: (state) => state
};
var getAllStoreStates = (pinia, stateTransformer) => {
	const states = {};
	try {
		Object.keys(pinia.state.value).forEach((storeId) => {
			states[storeId] = pinia.state.value[storeId];
		});
		return stateTransformer ? stateTransformer(states) : states;
	} catch {
		return states;
	}
};
var createSentryPiniaPlugin = (userOptions) => {
	const options = {
		...DEFAULT_PINIA_PLUGIN_OPTIONS,
		...userOptions
	};
	const plugin = ({ store, pinia }) => {
		options.attachPiniaState !== false && getGlobalScope().addEventProcessor((event, hint) => {
			try {
				const filename = `pinia_state_all_stores_${(/* @__PURE__ */ new Date()).toTimeString().split(" ")[0]}.json`;
				if (!hint.attachments?.some((attachment) => attachment.filename.startsWith("pinia_state_all_stores_"))) hint.attachments = [...hint.attachments || [], {
					filename,
					data: JSON.stringify(getAllStoreStates(pinia, options.stateTransformer))
				}];
			} catch {}
			return event;
		});
		store.$onAction((context) => {
			context.after(() => {
				const transformedActionName = options.actionTransformer(context.name);
				if (typeof transformedActionName !== "undefined" && transformedActionName !== null && options.addBreadcrumbs !== false) addBreadcrumb({
					category: "pinia.action",
					message: `Store: ${store.$id} | Action: ${transformedActionName}`,
					level: "info"
				});
				const allStates = getAllStoreStates(pinia, options.stateTransformer);
				const scope = getCurrentScope();
				const currentState = scope.getScopeData().contexts.state;
				if (typeof allStates !== "undefined" && allStates !== null) {
					const normalizationDepth = (getClient()?.getOptions())?.normalizeDepth || 3;
					const piniaStateContext = {
						type: "pinia",
						value: allStates
					};
					const newState = {
						...currentState || {},
						state: piniaStateContext
					};
					setNormalizationDepthOverrideHint(newState, 3 + normalizationDepth);
					scope.setContext("state", newState);
				} else scope.setContext("state", {
					...currentState || {},
					state: {
						type: "pinia",
						value: "undefined"
					}
				});
			});
		});
	};
	return plugin;
};
export { BrowserClient, MULTIPLEXED_TRANSPORT_EXTRA_KEY, OpenFeatureIntegrationHook, SDK_VERSION, SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE, Scope, WINDOW, createVueRouteProvider as _INTERNAL_createVueRouteProvider, addBreadcrumb, addEventProcessor, addIntegration, attachErrorHandler, bfcacheMetricsIntegration, bindScopeToEmitter, breadcrumbsIntegration, browserApiErrorsIntegration, browserProfilingIntegration, browserSessionIntegration, browserTracingIntegration, buildLaunchDarklyFlagUsedHandler, captureConsoleIntegration, captureEvent, captureException, captureFeedback, captureMessage, captureSession, chromeStackLineParser, close, consoleIntegration, consoleLoggingIntegration, contextLinesIntegration, continueTrace, createCachedRouteProvider, createConsolaReporter, createSentryPiniaPlugin, createTracingMixins, createTransport, createUrlRouteProvider, createUserFeedbackEnvelope, cultureContextIntegration, dedupeIntegration, defaultRequestInstrumentationOptions, defaultStackLineParsers, defaultStackParser, diagnoseSdkConnectivity, elementTimingIntegration, endSession, eventFiltersIntegration, eventFromException, eventFromMessage, exceptionFromError, extraErrorDataIntegration, featureFlagsIntegration, feedbackAsyncIntegration, feedbackSyncIntegration as feedbackIntegration, feedbackSyncIntegration, fetchStreamPerformanceIntegration, flush, forceLoad, functionToStringIntegration, geckoStackLineParser, getAbsoluteUrl, getActiveSpan, getClient, getCurrentScope, getDefaultIntegrations, getFeedback, getGlobalScope, getIsolationScope, getReplay, getRootSpan, getRouteProvider, getSpanDescendants, getSpanStatusFromHttpCode, getTraceData, globalHandlersIntegration, graphqlClientIntegration, growthbookIntegration, httpClientIntegration, httpContextIntegration, init, instrumentOutgoingRequests, instrumentSupabaseClient, interactionsIntegration, isBotUserAgent, isEnabled, isInitialized, lastEventId, launchDarklyIntegration, lazyLoadIntegration, linkedErrorsIntegration, public_api_exports as logger, makeBrowserOfflineTransport, makeFetchTransport, makeMultiplexedTransport, public_api_exports$1 as metrics, moduleMetadataIntegration, normalizeStringifyValue, onLoad, openFeatureIntegration, opera10StackLineParser, opera11StackLineParser, parameterize, registerSpanErrorInstrumentation, registerWebWorker, replayCanvasIntegration, replayIntegration, reportPageLoaded, reportingObserverIntegration, resolveCurrentRoute, resolveRoute, rewriteFramesIntegration, sendFeedback, setActiveSpanInBrowser, setAttribute, setAttributes, setContext, setConversationId, setCurrentClient, setExtra, setExtras, setHttpStatus, setMeasurement, setRouteProvider, setTag, setTags, setUser, showReportDialog, spanStreamingIntegration, spanToBaggageHeader, spanToJSON, spanToStaticSpanJSON, spanToTraceHeader, spotlightBrowserIntegration, startBrowserTracingNavigationSpan, startBrowserTracingPageLoadSpan, startInactiveSpan, startNewTrace, startSession, startSpan, startSpanManual, statsigIntegration, supabaseIntegration, suppressTracing, thirdPartyErrorFilterIntegration, uiProfiler, unleashIntegration, updateSpanName, userTimingIntegration, viewHierarchyIntegration, vueIntegration, webVitalsIntegration, webWorkerIntegration, winjsStackLineParser, withActiveSpan, withIsolationScope, withScope, withStaticSpan, withStreamedSpan, zodErrorsIntegration };
