/*
 * Evoxt 流量信息面板 - Surge Panel Script (模块化，无内置密钥)
 *
 * 本脚本本身不含任何密钥，所有敏感信息通过 Surge 模块的 #!arguments
 * 由用户在启用模块时填入，脚本运行时通过 $argument 读取。
 *
 * 可安全托管在公开仓库。
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
const SERVICE_ID = args.serviceid || "";
const POLICY = args.policy || ""; // 走哪个代理策略/策略组发起请求，留空则走当前规则匹配结果

const MAX_ATTEMPTS = 2; // 请求失败/超时时的最大尝试次数（含首次）

if (!USERNAME || !PUBKEY || !PRIKEY || !SERVICE_ID) {
  fail("模块参数未填写完整，请在模块设置里填写 USERNAME / PUBKEY / PRIKEY / SERVICEID");
} else {
  const authToken = base64Encode(PUBKEY + ":" + PRIKEY);
  const url =
    "https://api.evoxt.com/listserver?username=" +
    encodeURIComponent(USERNAME) +
    "&serviceid=" +
    encodeURIComponent(SERVICE_ID);

  const requestOptions = {
    url: url,
    headers: { Authorization: "Basic " + authToken },
    timeout: 20 // 单次请求超时（秒），默认只有 5 秒，多跳代理下容易不够
  };

  if (POLICY && POLICY.toUpperCase() !== "AUTO") {
    requestOptions.policy = POLICY;
  }

  function handleResponse(error, response, data, attempt) {
    if (error) {
      if (attempt < MAX_ATTEMPTS) {
        // 超时/失败自动重试一次，缓解多跳代理偶发延迟问题
        $httpClient.get(requestOptions, function (err2, res2, data2) {
          handleResponse(err2, res2, data2, attempt + 1);
        });
        return;
      }
      fail("请求失败（已重试 " + (attempt - 1) + " 次）: " + error);
      return;
    }

    let json;
    try {
      json = JSON.parse(data);
    } catch (e) {
      fail("响应解析失败");
      return;
    }

    if (json.error) {
      fail("接口错误: " + json.error);
      return;
    }

    const total = parseFloat(json.bandwidth);
    const used = parseFloat(json.used_bandwidth);
    const percent = total > 0 ? (used / total) * 100 : 0;
    const resetDateStr = nextResetDate(json.regdate);

    let icon = "chart.bar.fill";
    let color = "#34C759"; // 绿色
    if (percent >= 90) {
      icon = "exclamationmark.triangle.fill";
      color = "#FF3B30"; // 红色
    } else if (percent >= 70) {
      color = "#FF9500"; // 橙色
    }

    const content =
      "已用 " + used + " / " + total + " GB (" + percent.toFixed(1) + "%)\n" +
      "下次重置: " + resetDateStr + "\n" +
      "到期/续费日: " + json.nextduedate + " (" + json.billingcycle + ")\n" +
      "状态: " + json.status;

    $done({
      title: "Evoxt 流量",
      content: content,
      icon: icon,
      "icon-color": color
    });
  }

  $httpClient.get(requestOptions, function (error, response, data) {
    handleResponse(error, response, data, 1);
  });
}
