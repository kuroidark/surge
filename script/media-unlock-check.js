/**
 * media-unlock-check.js
 * Surge 面板脚本 - 流媒体 & AI 服务解锁检测
 *
 * 用法: 作为 [Script] 的 script-path 引用,配合 [Panel] 展示结果。
 * 需要托管在可通过 HTTPS 访问的地址(自建服务器 / GitHub raw / Gist 均可),
 * 或在 Surge for Mac 上直接用本地绝对路径。
 *
 * 注意: Surge 脚本的网络请求走 $httpClient(回调风格),没有 $task.fetch。
 * 本文件用 Promise 包了一层方便用 async/await 写。
 *
 * 各服务的检测端点/关键字会随时间变化(反爬、页面改版等),
 * 建议先跑一次看输出是否符合预期,再按需微调正则或端点。
 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const TIMEOUT = 8; // $httpClient 的 timeout 单位是秒

// ---------- $httpClient 的 Promise 封装 ----------

function httpGet(options) {
  const opts = typeof options === "string" ? { url: options } : options;
  opts.headers = Object.assign({ "User-Agent": UA }, opts.headers || {});
  if (opts.timeout === undefined) opts.timeout = TIMEOUT;
  return new Promise((resolve, reject) => {
    $httpClient.get(opts, (error, response, data) => {
      if (error) return reject(error);
      resolve({ status: response.status, headers: response.headers || {}, body: data || "" });
    });
  });
}

function httpHead(options) {
  const opts = typeof options === "string" ? { url: options } : options;
  opts.headers = Object.assign({ "User-Agent": UA }, opts.headers || {});
  if (opts.timeout === undefined) opts.timeout = TIMEOUT;
  return new Promise((resolve, reject) => {
    $httpClient.head(opts, (error, response, data) => {
      if (error) return reject(error);
      resolve({ status: response.status, headers: response.headers || {}, body: data || "" });
    });
  });
}

// ---------- 各服务检测 ----------

async function checkNetflix() {
  try {
    // 70143836: 非自制剧(版权受限内容),80018499: Netflix 自制剧
    const [licensed, original] = await Promise.all([
      httpGet("https://www.netflix.com/title/70143836"),
      httpGet("https://www.netflix.com/title/80018499"),
    ]);
    const ok = (r) => [200, 301, 302].includes(r.status);
    if (ok(licensed)) return { name: "Netflix", status: "✅ 完整解锁" };
    if (ok(original)) return { name: "Netflix", status: "🟡 仅解锁自制剧" };
    return { name: "Netflix", status: "❌ 未解锁" };
  } catch (e) {
    return { name: "Netflix", status: `❌ 请求异常 (${e})` };
  }
}

async function checkChatGPT() {
  try {
    const res = await httpGet("https://api.openai.com/compliance/cookie_requirements");
    if (res.status === 200) return { name: "ChatGPT", status: "✅ 可用" };
    if (res.status === 403) return { name: "ChatGPT", status: "❌ 地区受限" };
    return { name: "ChatGPT", status: `❓ 未知 (${res.status})` };
  } catch (e) {
    return { name: "ChatGPT", status: `❌ 请求异常 (${e})` };
  }
}

async function checkClaude() {
  try {
    const res = await httpGet("https://claude.ai/");
    if (res.status === 403 || /not available in your country|unsupported_country/i.test(res.body)) {
      return { name: "Claude", status: "❌ 地区受限" };
    }
    if (res.status === 200) return { name: "Claude", status: "✅ 可用" };
    return { name: "Claude", status: `❓ 未知 (${res.status})` };
  } catch (e) {
    return { name: "Claude", status: `❌ 请求异常 (${e})` };
  }
}

async function checkGemini() {
  try {
    const res = await httpGet("https://gemini.google.com/app");
    if (/not available in your country|isn't available/i.test(res.body)) {
      return { name: "Gemini", status: "❌ 地区受限" };
    }
    if (res.status === 200) return { name: "Gemini", status: "✅ 可用" };
    return { name: "Gemini", status: `❓ 未知 (${res.status})` };
  } catch (e) {
    return { name: "Gemini", status: `❌ 请求异常 (${e})` };
  }
}

async function checkDisneyPlus() {
  try {
    const res = await httpGet("https://www.disneyplus.com/");
    if (res.status === 403 || /not available in your region/i.test(res.body)) {
      return { name: "Disney+", status: "❌ 未解锁" };
    }
    const m = res.body.match(/"region"\s*:\s*"([A-Z]{2})"/);
    return { name: "Disney+", status: m ? `✅ 解锁 (${m[1]})` : "✅ 解锁" };
  } catch (e) {
    return { name: "Disney+", status: `❌ 请求异常 (${e})` };
  }
}

async function checkYouTubePremium() {
  try {
    const res = await httpGet("https://www.youtube.com/premium");
    if (/Premium is not available in your country/i.test(res.body)) {
      return { name: "YouTube Premium", status: "❌ 未解锁" };
    }
    return { name: "YouTube Premium", status: "✅ 解锁" };
  } catch (e) {
    return { name: "YouTube Premium", status: `❌ 请求异常 (${e})` };
  }
}

async function checkSpotify() {
  try {
    // 关闭 auto-redirect 才能拿到 302 的 Location 头
    const res = await httpHead({ url: "https://spotify.com/", "auto-redirect": false });
    const loc = res.headers["Location"] || res.headers["location"] || "";
    const m = loc.match(/spotify\.com\/([a-z]{2})\//i);
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      return { name: "Spotify", status: m ? `✅ 解锁 (${m[1].toUpperCase()})` : "✅ 解锁" };
    }
    return { name: "Spotify", status: `❓ 未知 (${res.status})` };
  } catch (e) {
    return { name: "Spotify", status: `❌ 请求异常 (${e})` };
  }
}

async function checkTikTok() {
  try {
    const res = await httpGet({ url: "https://www.tiktok.com/", headers: { "Accept-Language": "en-US" } });
    if (res.status === 200) return { name: "TikTok", status: "✅ 可访问" };
    return { name: "TikTok", status: `❓ 未知 (${res.status})` };
  } catch (e) {
    return { name: "TikTok", status: `❌ 请求异常 (${e})` };
  }
}

// ---------- 主流程 ----------

(async () => {
  const checks = [
    checkChatGPT(),
    checkClaude(),
    checkGemini(),
    checkNetflix(),
    checkDisneyPlus(),
    checkYouTubePremium(),
    checkSpotify(),
    checkTikTok(),
  ];

  const results = await Promise.allSettled(checks);

  const lines = results.map((r) =>
    r.status === "fulfilled" ? `${r.value.name}: ${r.value.status}` : `某项检测异常: ${r.reason}`
  );

  $done({
    title: "流媒体 & AI 解锁检测",
    content: lines.join("\n"),
    icon: "checkmark.seal",
    "icon-color": "#4CAF50",
  });
})();
