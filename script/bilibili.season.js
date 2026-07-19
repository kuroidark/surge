let obj = JSON.parse($response.body);
if (obj.data) delete obj.data.payment;
$done({ body: JSON.stringify(obj) });
