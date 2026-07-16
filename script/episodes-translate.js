// episodes-translate.js
// 处理 /uts/v3/shows/{id}/episodes。跟 shows-detail-translate 同样的思路：
// 请求本身保持真实日区(保证播放数据不受影响)，只在响应阶段用并行请求的
// 文本字段覆盖显示文案。
//
// data.playables 是个用资源 ID 当 key 的字典，日区/港区的 ID 字符串本身不同，
// 按 key 对位合并会直接失效，所以这里额外按顺序把已经翻译好的 data.episodes[]
// 结果"倒灌"进 playables 字典对应位置。
//
// 已知限制：详情页顶部的大标题/新集数说明这个 UI 组件不吃这份数据，
// 分集列表本身(标题+简介)可以正常翻译。

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
    console.log(`[TV EpTranslate] 并行请求失败: ${error}，保留原始内容`);
    $done({});
    return;
  }
  try {
    const translatedJson = JSON.parse(data);
    mergeTranslatable(originalJson, translatedJson);

    // 按顺序把翻译好的 episodes[] 回填进 playables 字典（key 是资源 ID，两地不同，不能按 key 合并）
    const topData = originalJson.data || originalJson;
    if (topData.playables && typeof topData.playables === "object" && Array.isArray(topData.episodes)) {
      const playableKeys = Object.keys(topData.playables);
      const episodes = topData.episodes;
      const n = Math.min(playableKeys.length, episodes.length);
      for (let i = 0; i < n; i++) {
        const entry = topData.playables[playableKeys[i]];
        const ep = episodes[i];
        if (!entry || !ep) continue;
        if (typeof entry.title === "string" && typeof ep.title === "string") entry.title = ep.title;
        if (entry.canonicalMetadata) {
          if (typeof entry.canonicalMetadata.episodeTitle === "string" && typeof ep.title === "string") {
            entry.canonicalMetadata.episodeTitle = ep.title;
          }
          if (typeof entry.canonicalMetadata.showTitle === "string" && typeof ep.showTitle === "string") {
            entry.canonicalMetadata.showTitle = ep.showTitle;
          }
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

    console.log(`[TV EpTranslate] 已合并 ${region} 文案 | ${$request.url}`);
    $done({ body: newBody, headers: respHeaders });
  } catch (e) {
    console.log(`[TV EpTranslate] 解析并行响应失败: ${e}，保留原始内容`);
    $done({});
  }
});
