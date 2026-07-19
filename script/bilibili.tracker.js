let obj = JSON.parse($response.body);
if (obj.data && Array.isArray(obj.data)) {
  obj.data.forEach(arr => {
    if (Array.isArray(arr)) {
      for (let i = 0; i < arr.length; i++) arr[i] = "stun.chat.bilibili.com:3478";
    }
  });
}
$done({ body: JSON.stringify(obj) });
