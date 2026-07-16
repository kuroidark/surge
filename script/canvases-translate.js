// canvases-translate.js
// 处理 /uts/v3/canvases/... 和 /uts/v3/shelves/...（首页、频道页、继续观看等）。
// 请求本身保持真实日区(保证卡片里嵌的可播放资源引用不受影响，"继续观看"这类
// 直接点卡片播放的场景不会失败)，只在响应阶段用并行请求的文本字段覆盖显示文案。
//
// 注意：首页内容是算法个性化推荐的，两个地区拿到的卡片顺序/数量不一定完全对应，
// 按结构位置合并文本字段时可能出现个别标题对应错位，但不影响实际播放（IDs 始终
// 来自真实日区响应，未被修改）。

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

$httpClient.get({ url: parallelUrl, headers: parallelHeaders, timeout: 10 }, function (error, response, data) {
  if (error) {
    console.log(`[TV CanvasTranslate] 并行请求失败: ${error}，保留原始内容`);
    $done({});
    return;
  }
  try {
    const translatedJson = JSON.parse(data);
    mergeTranslatable(originalJson, translatedJson);

    const newBody = JSON.stringify(originalJson);
    const respHeaders = Object.assign({}, $response.headers || {});
    for (const k of Object.keys(respHeaders)) {
      if (["content-encoding", "content-length"].includes(k.toLowerCase())) {
        delete respHeaders[k];
      }
    }

    console.log(`[TV CanvasTranslate] 已合并 ${region} 文案 | ${$request.url}`);
    $done({ body: newBody, headers: respHeaders });
  } catch (e) {
    console.log(`[TV CanvasTranslate] 解析并行响应失败: ${e}，保留原始内容`);
    $done({});
  }
});
