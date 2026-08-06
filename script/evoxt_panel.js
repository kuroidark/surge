/*
 * Evoxt 流量信息面板 - Surge Panel Script (模块化，无内置密钥)
 *
 * 本脚本本身不含任何密钥，所有敏感信息通过 Surge 模块的 #!arguments
 * 由用户在启用模块时填入，脚本运行时通过 $argument 读取。
 * 支持任意数量服务器（同一账号下），SERVICEIDS 用逗号分隔。
 *
 */

function parseArgument(raw) {
  const args = {};
  if (!raw) return args;
  raw.split("&").forEach(function (pair) {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const key = decodeURIComponent(pair.slice(0, idx));
    const value = decodeURIComponent(pair.slice(idx + 1).replace(/\+/g, " "));
    args[key] = value;
  });
  return args;
}

// 手写 base64 编码，不依赖环境是否提供 btoa
function base64Encode(input) {
  const keyStr =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  let output = "";
  let i = 0;

  while (i < input.length) {
    const chr1 = input.charCodeAt(i++);
    const chr2 = input.charCodeAt(i++);
    const chr3 = input.charCodeAt(i++);

    const enc1 = chr1 >> 2;
    let enc2 = ((chr1 & 3) << 4) | (isNaN(chr2) ? 0 : chr2 >> 4);
    let enc3 = isNaN(chr2) ? 64 : ((chr2 & 15) << 2) | (isNaN(chr3) ? 0 : chr3 >> 6);
    let enc4 = isNaN(chr3) ? 64 : chr3 & 63;

    output +=
      keyStr.charAt(enc1) +
      keyStr.charAt(enc2) +
      keyStr.charAt(enc3) +
      keyStr.charAt(enc4);
  }

  return output;
}

function daysInMonth(year, month /* 0-indexed */) {
  return new Date(year, month + 1, 0).getDate();
}

function makeDate(year, month, day) {
  const dim = daysInMonth(year, month);
  return new Date(year, month, Math.min(day, dim));
}

function nextResetDate(regdate) {
  const parts = regdate.split("-").map(Number);
  const regDay = parts[2];
  const now = new Date();

  let year = now.getFullYear();
  let month = now.getMonth();
  let candidate = makeDate(year, month, regDay);

  if (candidate <= now) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
    candidate = makeDate(year, month, regDay);
  }

  const y = candidate.getFullYear();
  const m = String(candidate.getMonth() + 1).padStart(2, "0");
  const d = String(candidate.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

function fail(msg) {
  $done({
    title: "Evoxt 流量",
    content: msg,
    icon: "xmark.circle.fill",
    "icon-color": "#FF3B30"
  });
}

// ==== 从模块参数读取配置 ====
const rawArgument = typeof $argument !== "undefined" ? $argument : "";
const args = parseArgument(rawArgument);

const USERNAME = args.username || "";
const PUBKEY = args.pubkey || "";
const PRIKEY = args.prikey || "";
const POLICY = args.policy || "";

// SERVICEIDS: 用竖线 | 分隔的多个 Service ID，例如 "880424|880501|880777"
// 注意：不能用逗号分隔——逗号是 Surge 模块 [Script] 行本身的字段分隔符，
// 一旦替换进 argument= 的值里会打乱整行解析，导致 $argument 读取失败。
const SERVICE_IDS = (args.serviceids || "")
  .split("|")
  .map(function (s) { return s.trim(); })
  .filter(function (s) { return s.length > 0; });

const MAX_ATTEMPTS = 2;

if (!USERNAME || !PUBKEY || !PRIKEY || SERVICE_IDS.length === 0) {
  fail("模块参数未填写完整，请在模块设置里填写 USERNAME / PUBKEY / PRIKEY / SERVICEIDS");
} else {
  const authToken = base64Encode(PUBKEY + ":" + PRIKEY);

  function buildOptions(serviceId) {
    const url =
      "https://api.evoxt.com/listserver?username=" +
      encodeURIComponent(USERNAME) +
      "&serviceid=" +
      encodeURIComponent(serviceId);

    const opts = {
      url: url,
      headers: { Authorization: "Basic " + authToken },
      timeout: 20
    };
    if (POLICY && POLICY.toUpperCase() !== "AUTO") {
      opts.policy = POLICY;
    }
    return opts;
  }

  // 查询单台服务器，内置重试；结果通过 callback(result) 返回，永远不抛错
  function fetchServer(serviceId, callback) {
    const opts = buildOptions(serviceId);

    function attempt(n) {
      $httpClient.get(opts, function (error, response, data) {
        if (error) {
          if (n < MAX_ATTEMPTS) {
            attempt(n + 1);
            return;
          }
          callback({ ok: false, message: serviceId + " 请求失败: " + error });
          return;
        }

        let json;
        try {
          json = JSON.parse(data);
        } catch (e) {
          callback({ ok: false, message: serviceId + " 响应解析失败" });
          return;
        }

        if (json.error) {
          callback({ ok: false, message: serviceId + " 接口错误: " + json.error });
          return;
        }

        callback({ ok: true, data: json });
      });
    }

    attempt(1);
  }

  function formatServer(json) {
    const total = parseFloat(json.bandwidth);
    const used = parseFloat(json.used_bandwidth);
    const percent = total > 0 ? (used / total) * 100 : 0;
    const resetDateStr = nextResetDate(json.regdate);

    const label = json.hostname || json.label || json.id;

    const text =
      "【" + label + "】\n" +
      "已用 " + used + " / " + total + " GB (" + percent.toFixed(1) + "%)\n" +
      "下次重置: " + resetDateStr + "\n" +
      "到期/续费日: " + json.nextduedate + " (" + json.billingcycle + ")\n" +
      "状态: " + json.status;

    return { text: text, percent: percent };
  }

  // 依次串行查询 SERVICE_IDS 里的每一台，全部完成后调用 onDone(results)
  function fetchAll(serviceIds, index, results, onDone) {
    if (index >= serviceIds.length) {
      onDone(results);
      return;
    }
    fetchServer(serviceIds[index], function (result) {
      results.push(result);
      fetchAll(serviceIds, index + 1, results, onDone);
    });
  }

  function finalize(results) {
    const blocks = [];
    let maxPercent = 0;
    let hasOk = false;

    results.forEach(function (r) {
      if (r.ok) {
        hasOk = true;
        const f = formatServer(r.data);
        blocks.push(f.text);
        if (f.percent > maxPercent) maxPercent = f.percent;
      } else {
        blocks.push("⚠️ " + r.message);
      }
    });

    if (!hasOk) {
      fail(blocks.join("\n"));
      return;
    }

    let icon = "chart.bar.fill";
    let color = "#34C759";
    if (maxPercent >= 90) {
      icon = "exclamationmark.triangle.fill";
      color = "#FF3B30";
    } else if (maxPercent >= 70) {
      color = "#FF9500";
    }

    $done({
      title: "Evoxt 流量",
      content: blocks.join("\n\n"),
      icon: icon,
      "icon-color": color
    });
  }

  fetchAll(SERVICE_IDS, 0, [], finalize);
}
