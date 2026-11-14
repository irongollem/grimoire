import { gn as watch, nt as defineComponent } from "./vue.runtime.esm-bundler-Bwv4pGxO.js";
import { x as useRoute } from "./vue-router-CqBDesTw.js";
// ../DnD helper/node_modules/@vercel/speed-insights/dist/vue/index.mjs
var initQueue = () => {
	if (window.si) return;
	window.si = function a(...params) {
		window.siq = window.siq || [];
		window.siq.push(params);
	};
};
var name = "@vercel/speed-insights";
var version = "2.1.0";
function isBrowser() {
	return typeof window !== "undefined";
}
function detectEnvironment() {
	try {
		return "development";
	} catch {}
	return "production";
}
function isDevelopment() {
	return detectEnvironment() === "development";
}
function computeRoute(pathname, pathParams) {
	if (!pathname || !pathParams) return pathname;
	let result = pathname;
	try {
		const entries = Object.entries(pathParams);
		for (const [key, value] of entries) if (!Array.isArray(value)) {
			const matcher = turnValueToRegExp(value);
			if (matcher.test(result)) result = result.replace(matcher, `/[${key}]`);
		}
		for (const [key, value] of entries) if (Array.isArray(value)) {
			const matcher = turnValueToRegExp(value.join("/"));
			if (matcher.test(result)) result = result.replace(matcher, `/[...${key}]`);
		}
		return result;
	} catch {
		return pathname;
	}
}
function turnValueToRegExp(value) {
	return new RegExp(`/${escapeRegExp(value)}(?=[/?#]|$)`);
}
function escapeRegExp(string) {
	return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function getScriptSrc(props) {
	if (props.scriptSrc) return makeAbsolute(props.scriptSrc);
	if (isDevelopment()) return "https://va.vercel-scripts.com/v1/speed-insights/script.debug.js";
	if (props.dsn) return "https://va.vercel-scripts.com/v1/speed-insights/script.js";
	if (props.basePath) return makeAbsolute(`${props.basePath}/speed-insights/script.js`);
	return "/_vercel/speed-insights/script.js";
}
function loadProps(explicitProps, confString) {
	var _a;
	let props = explicitProps;
	if (confString) try {
		props = {
			...(_a = JSON.parse(confString)) == null ? void 0 : _a.speedInsights,
			...explicitProps
		};
	} catch {}
	const dataset = {
		sdkn: name + (props.framework ? `/${props.framework}` : ""),
		sdkv: version
	};
	if (props.sampleRate) dataset.sampleRate = props.sampleRate.toString();
	if (props.route) dataset.route = props.route;
	if (typeof props.softNavs === "boolean") dataset.softNavs = String(props.softNavs);
	if (isDevelopment() && props.debug === false) dataset.debug = "false";
	if (props.dsn) dataset.dsn = props.dsn;
	if (props.endpoint) dataset.endpoint = makeAbsolute(props.endpoint);
	else if (props.basePath) dataset.endpoint = makeAbsolute(`${props.basePath}/speed-insights/vitals`);
	return {
		src: getScriptSrc(props),
		beforeSend: props.beforeSend,
		dataset
	};
}
function makeAbsolute(url) {
	return url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/") ? url : `/${url}`;
}
function injectSpeedInsights(props = {}, confString) {
	var _a;
	if (!isBrowser() || props.route === null) return null;
	initQueue();
	const { beforeSend, src, dataset } = loadProps(props, confString);
	if (document.head.querySelector(`script[src*="${src}"]`)) return null;
	if (beforeSend) (_a = window.si) == null || _a.call(window, "beforeSend", beforeSend);
	const script = document.createElement("script");
	script.src = src;
	script.defer = true;
	for (const [key, value] of Object.entries(dataset)) script.dataset[key] = value;
	script.onerror = () => {
		console.log(`[Vercel Speed Insights] Failed to load script from ${src}. Please check if any content blockers are enabled and try again.`);
	};
	document.head.appendChild(script);
	return { setRoute: (route) => {
		script.dataset.route = route ?? void 0;
	} };
}
function getBasePath() {
	try {
		return import.meta.env.VITE_VERCEL_OBSERVABILITY_BASEPATH;
	} catch {}
}
function getConfigString() {
	try {
		return import.meta.env.VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG;
	} catch {}
}
function createComponent(framework = "vue") {
	return defineComponent({
		props: [
			"dsn",
			"sampleRate",
			"softNavs",
			"beforeSend",
			"debug",
			"scriptSrc",
			"endpoint"
		],
		setup(props) {
			const route = useRoute();
			const configure = injectSpeedInsights({
				...Object.fromEntries(Object.entries(props).filter(([_, v]) => v !== void 0)),
				framework,
				basePath: getBasePath()
			}, getConfigString());
			if (route && configure) {
				const changeRoute = () => {
					configure.setRoute(computeRoute(route.path, route.params));
				};
				changeRoute();
				watch(route, changeRoute);
			}
		},
		render() {
			return null;
		}
	});
}
var SpeedInsights = createComponent();
export { SpeedInsights };
