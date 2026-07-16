// tv-force-region.js
// 强制 Apple TV app (uts-api.itunes.apple.com) 使用指定地区的内容目录。
// 已验证：region = hk 会让内容(标题/简介/分类)变成繁体中文。
// tw / sg 是根据 Apple storefront 编号规律推测的，未实测，建议先用 hk。
//
// 用法（在 Surge 模块参数里可直接改，无需碰代码）：
//   region: hk / tw / sg / jp（jp 等于关闭，即还原成日区原样）
// 如果想手动指定，也可以直接传 locale / sf / storeFront 三个参数，
// 传了的话会覆盖 region 预设。

const PRESETS = {
  hk: { locale: "zh-Hant-HK", sf: "143463", storeFront: "143463-45,29" }, // 已验证
  tw: { locale: "zh-Hant-TW", sf: "143470", storeFront: "143470-2,29" }, // 已验证
  jp: { locale: "ja-JP", sf: "143462", storeFront: "143462-9,29" }, // 还原成原始日区，相当于关闭
};

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

const region = (args.region || "hk").toLowerCase();
const preset = PRESETS[region] || PRESETS.hk;

const targetLocale = args.locale || preset.locale;
const targetSf = args.sf || preset.sf;
const targetStoreFront = args.storeFront || preset.storeFront;

let url;
try {
  url = new URL($request.url);
} catch (e) {
  console.log(`[TV Region] URL 解析失败: ${$request.url}`);
  $done({});
}

url.searchParams.set("locale", targetLocale);
url.searchParams.set("sf", targetSf);

const originalHeaders = $request.headers || {};
const originalKeys = Object.keys(originalHeaders);

// 去掉条件缓存头，避免拿到 304 空响应
const skipLower = ["if-none-match", "if-modified-since"];
const newHeaders = {};
for (const k of originalKeys) {
  if (skipLower.includes(k.toLowerCase())) continue;
  newHeaders[k] = originalHeaders[k];
}

const sfKey = originalKeys.find((k) => k.toLowerCase() === "x-apple-store-front") || "X-Apple-Store-Front";
newHeaders[sfKey] = targetStoreFront;

console.log(`[TV Region] region=${region} locale=${targetLocale} sf=${targetSf} | ${url.pathname}`);

$done({ url: url.toString(), headers: newHeaders });
