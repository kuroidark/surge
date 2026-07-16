// movie-detail-translate.js
// 处理 /uts/v3/movies/{id}。跟 shows-detail-translate 同样的思路：
// 请求本身保持真实日区(保证播放数据不受影响)，只在响应阶段用并行请求的
// 文本字段覆盖显示文案。
//
// 如果 data.playables 是个用资源 ID 当 key 的字典（跟 shows 一样的坑），
// 用已经翻译好的 data.content 直接回填，不依赖 key 匹配。
//
// 已知限制：详情页顶部的大标题这个 UI 组件不吃这份数据，其余内容(简介/演员/
// 分类/预告片)均可正常翻译，播放不受影响。

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
    console.log(`[TV MovieTranslate] 并行请求失败: ${error}，保留原始内容`);
    $done({});
    return;
  }
  try {
    const translatedJson = JSON.parse(data);
    mergeTranslatable(originalJson, translatedJson);

    const topData = originalJson.data || originalJson;
    if (topData.playables && typeof topData.playables === "object" && !Array.isArray(topData.playables) && topData.content) {
      for (const key of Object.keys(topData.playables)) {
        const entry = topData.playables[key];
        if (!entry) continue;
        if (typeof entry.title === "string" && typeof topData.content.title === "string") {
          entry.title = topData.content.title;
        }
        if (entry.canonicalMetadata && typeof topData.content.title === "string") {
          if (typeof entry.canonicalMetadata.showTitle === "string") entry.canonicalMetadata.showTitle = topData.content.title;
          if (typeof entry.canonicalMetadata.movieTitle === "string") entry.canonicalMetadata.movieTitle = topData.content.title;
          if (typeof entry.canonicalMetadata.title === "string") entry.canonicalMetadata.title = topData.content.title;
        }
      }
    }

    const newBody = JSON.stringify(originalJson);
    const respHeaders = Object.assign({}, $response.headers || {});
    for (const k of Object.keys(respHeaders)) {
      if (["content-encoding", "content-length"].includes(k.toLowerCase())) {
        delete respHeaders[k];
      }
    }

    console.log(`[TV MovieTranslate] 已合并 ${region} 文案 | ${$request.url}`);
    $done({ body: newBody, headers: respHeaders });
  } catch (e) {
    console.log(`[TV MovieTranslate] 解析并行响应失败: ${e}，保留原始内容`);
    $done({});
  }
});
