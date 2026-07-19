let obj = JSON.parse($response.body);
if (obj.data) {
  delete obj.data.play_together_info;
  delete obj.data.play_together_info_v2;
  delete obj.data.activity_banner_info;
  if (Array.isArray(obj.data.function_card)) {
    obj.data.function_card = obj.data.function_card.map(() => null);
  }
  if (obj.data.new_tab_info && Array.isArray(obj.data.new_tab_info.outer_list)) {
    obj.data.new_tab_info.outer_list = obj.data.new_tab_info.outer_list.filter(i => i.biz_id !== 33);
  }
  if (Array.isArray(obj.data.card_list)) {
    obj.data.card_list = obj.data.card_list.filter(i => !["banner_v2", "activity_card_v1"].includes(i.card_type));
  }
  if (obj.data.show_reserve_status !== undefined) obj.data.show_reserve_status = false;
  if (obj.data.reserve_info && obj.data.reserve_info.show_reserve_status !== undefined) {
    obj.data.reserve_info.show_reserve_status = false;
  }
  if (obj.data.shopping_info && obj.data.shopping_info.is_show !== undefined) {
    obj.data.shopping_info.is_show = 0;
  }
}
$done({ body: JSON.stringify(obj) });
