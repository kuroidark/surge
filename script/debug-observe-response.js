// debug-observe-response.js
// 纯观察。记录状态码；如果不是 200，把完整错误正文打出来（错误响应通常很小）；
// 如果是 200，只打印路径和正文长度，避免日志被大响应刷屏。

const status = $response.status || ($response.statusCode) || "?";
let path = "";
let sfParam = "";
let localeParam = "";
try {
  const u = new URL($request.url);
  path = u.pathname;
  sfParam = u.searchParams.get("sf");
  localeParam = u.searchParams.get("locale");
} catch (e) {
  path = $request.url;
}

const body = $response.body || "";

if (String(status) !== "200") {
  console.log(`[TV Debug RESP] !!! 非200状态: ${status} | ${path} | sf=${sfParam} locale=${localeParam}`);
  console.log(`[TV Debug RESP] 错误正文: ${body.slice(0, 1000)}`);
} else {
  console.log(`[TV Debug RESP] 200 OK | ${path} | sf=${sfParam} locale=${localeParam} | 正文长度: ${body.length}`);
}

$done({});
