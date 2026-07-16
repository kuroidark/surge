// body-logger.js
// 把响应正文（Surge 已自动解 gzip 为文本）打印到脚本日志，
// 顺便用正则抓一下 title / synopsis / name 这几个常见字段方便直接看语言。

const body = $response.body || "";

console.log(`[TV Body] URL: ${$request.url}`);
console.log(`[TV Body] 正文长度: ${body.length}`);

if (body.length === 0) {
  console.log(`[TV Body] 正文为空（可能又是 304，或者这个接口本来就没有 body）`);
  $done({});
}

// 打印开头一段，直接看结构和语言
console.log(`[TV Body] 前 600 字符: ${body.slice(0, 600)}`);

// 尝试抓取常见的文本字段
const fields = ["title", "synopsis", "name", "shortSynopsis"];
for (const field of fields) {
  const re = new RegExp(`"${field}"\\s*:\\s*"([^"]{1,80})"`, "g");
  const matches = [];
  let m;
  while ((m = re.exec(body)) !== null && matches.length < 5) {
    matches.push(m[1]);
  }
  if (matches.length) {
    console.log(`[TV Body] ${field} 示例: ${JSON.stringify(matches)}`);
  }
}

$done({});
