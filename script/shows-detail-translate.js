// shows-detail-translate.js
// 处理 /uts/v3/shows/{id} 详情页。
// 请求本身保持真实日区(保证播放数据不受影响)，这里在响应阶段额外发一次
// 目标地区的并行请求，只用它的文本字段(标题/简介/演员/分类等)覆盖显示文案，
// 其它字段(尤其是资源 ID)保留原始日区数据。
//
// 已知限制：详情页顶部的大标题这个 UI 组件不吃这份数据，无法通过这个方式翻译，
// 原因不明(疑似绑定了客户端本地状态)，其余内容(简介/演员/分类/预告片)均可正常翻译。

const raw = typeof $argument === "string" ? $argument : "";
const args = Object.fromEntries(
  raw
    .split("&")
    .filter(Boolean)
    .map((pair) => {
      const [k, v] = pair.split("=");
      return [decodeURIComponent(k || ""), decodeURIComponent((v || "").replace(/^"|"$/g, ""))];
    })
);

const PRESETS = {
  hk: { locale: "zh-Hant-HK", sf: "143463", storeFront: "143463-45,29" },
  tw: { locale: "zh-Hant-TW", sf: "143470", storeFront: "143470-2,29" },
};
const region = (args.region || "hk").toLowerCase();
const preset = PRESETS[region] || PRESETS.hk;

const originalBody = $response.body || "";
if (!originalBody) $done({});

let originalJson;
try {
  originalJson = JSON.parse(originalBody);
} catch (e) {
  $done({});
}

let parallelUrl;
try {
  const u = new URL($request.url);
  u.searchParams.set("locale", preset.locale);
  u.searchParams.set("sf", preset.sf);
  parallelUrl = u.toString();
} catch (e) {
  $done({});
}

const originalHeaders = $request.headers || {};
const parallelHeaders = Object.assign({}, originalHeaders);
const sfKey =
  Object.keys(parallelHeaders).find((k) => k.toLowerCase() === "x-apple-store-front") ||
  "X-Apple-Store-Front";
parallelHeaders[sfKey] = preset.storeFront;

const skipLower = ["if-none-match", "if-modified-since", "host"];
for (const k of Object.keys(parallelHeaders)) {
  if (skipLower.includes(k.toLowerCase())) delete parallelHeaders[k];
}

// 只替换这些纯文本展示字段，其它一律保留原始(可播放)数据
const TRANSLATABLE_KEYS = [
  "title", "synopsis", "shortSynopsis", "name", "tagline",
  "description", "heroDescription", "caption", "showTitle", "movieTitle",
];

function mergeTranslatable(dst, src) {
  if (Array.isArray(dst) && Array.isArray(src)) {
    const len = Math.min(dst.length, src.length);
    for (let i = 0; i < len; i++) mergeTranslatable(dst[i], src[i]);
  } else if (dst && typeof dst === "object" && src && typeof src === "object") {
    for (const key of Object.keys(dst)) {
      if (!(key in src)) continue;
      if (TRANSLATABLE_KEYS.includes(key) && typeof dst[key] === "string" && typeof src[key] === "string") {
        dst[key] = src[key];
      } else if (typeof dst[key] === "object") {
        mergeTranslatable(dst[key], src[key]);
      }
    }
  }
}

$httpClient.get({ url: parallelUrl, headers: parallelHeaders, timeout: 8 }, function (error, response, data) {
  if (error) {
    console.log(`[TV Translate] 并行请求失败: ${error}，保留原始内容`);
    $done({});
    return;
  }
  try {
    const translatedJson = JSON.parse(data);
    mergeTranslatable(originalJson, translatedJson);

    const newBody = JSON.stringify(originalJson);

    // body 已经是解压后的明文，响应头如果还留着 gzip 的 Content-Encoding /
    // 旧的 Content-Length，客户端会按压缩数据去解析，直接失败。
    const respHeaders = Object.assign({}, $response.headers || {});
    for (const k of Object.keys(respHeaders)) {
      if (["content-encoding", "content-length"].includes(k.toLowerCase())) {
        delete respHeaders[k];
      }
    }

    console.log(`[TV Translate] 已合并 ${region} 文案 | ${$request.url}`);
    $done({ body: newBody, headers: respHeaders });
  } catch (e) {
    console.log(`[TV Translate] 解析并行响应失败: ${e}，保留原始内容`);
    $done({});
  }
});
