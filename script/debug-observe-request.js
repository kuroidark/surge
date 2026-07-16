// debug-observe-request.js
// 纯观察，不修改任何内容。记录每个 uts-api 请求的路径、
// 以及当前请求头里 sf / X-Apple-Store-Front 的实际值（不管是哪个模块改的）。

let url;
try {
  url = new URL($request.url);
} catch (e) {
  $done({});
}

const headers = $request.headers || {};
const sfHeaderKey = Object.keys(headers).find((k) => k.toLowerCase() === "x-apple-store-front");
const sfHeaderVal = sfHeaderKey ? headers[sfHeaderKey] : "(未找到)";
const sfParam = url.searchParams.get("sf");
const localeParam = url.searchParams.get("locale");

console.log(`[TV Debug REQ] ${url.pathname} | sf=${sfParam} locale=${localeParam} storeFrontHeader=${sfHeaderVal}`);

$done({}); // 不做任何修改，原样放行
