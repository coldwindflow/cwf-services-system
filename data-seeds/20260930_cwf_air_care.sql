-- Issue #382: CWF AIR CARE manual-payment prepaid campaign.
-- Data seed only. Customer reserves first; Admin verifies payment before entitlement activation.

INSERT INTO public.catalog_items
  (item_name,item_category,base_price,unit_label,job_category,ac_type,is_active,is_customer_visible,
   short_description,long_description,highlights,service_conditions,booking_mode,is_featured,is_autoplay_enabled,
   service_bundle_key,service_package_sell_start_at,service_package_sell_end_at,service_package_redeem_until,
   promotion_badge_text,promotion_theme_preset,promotion_effect_preset,show_sale_countdown,promotion_supporting_text,
   booking_flow_policy,service_package_minimum_total_quantity,service_package_pricing_strategy,
   service_package_selection_mode,service_package_maximum_total_quantity,service_package_payment_mode,
   service_package_warranty_days)
SELECT
  'CWF AIR CARE — ช่วยค่าล้างแอร์ หลังฝนหนัก–น้ำท่วม','service',0,'package','ล้าง','ผนัง',TRUE,TRUE,
  'เปิดสิทธิ์ราคาพิเศษ 7 วัน • 30 กันยายน – 6 ตุลาคม 2569',
  'ยังไม่พร้อมล้างตอนนี้ไม่เป็นไร • จองสิทธิ์ ชำระผ่านแอดมินทาง LINE และเลือกวันเข้าบริการภายหลังตามคิวว่าง',
  '["1 เครื่อง 499.-","2 เครื่อง 899.-","3 เครื่อง 1,299.-","4 เครื่อง 1,699.-","18,000 BTU ขึ้นไป +100.-/เครื่อง","สิทธิ์ใช้ได้ 60 วันนับจากวันที่ซื้อ","รับประกันงานล้าง 60 วัน"]'::jsonb,
  'สำหรับแอร์ติดผนัง • ไม่เกิน 12,000 BTU ใช้ราคาฐาน • 18,000 BTU ขึ้นไปเพิ่ม 100 บาทต่อเครื่อง • สิทธิ์ ACTIVE หลังแอดมินยืนยันการชำระ',
  'contact_admin',TRUE,TRUE,'cwf-air-care',
  '2026-09-30T00:00:00+07:00'::timestamptz,'2026-10-06T23:59:59.999+07:00'::timestamptz,
  '2026-12-05T23:59:59.999+07:00'::timestamptz,
  'CWF AIR CARE','limited_time','soft_glow',TRUE,'จ่ายวันนี้ → ล็อกราคาพิเศษ → เลือกวันล้างภายหลัง',
  'scheduled_only',1,'total_quantity_tier_plus_unit_modifiers','multi_variant',4,'prepaid_full',60
WHERE NOT EXISTS (SELECT 1 FROM public.catalog_items WHERE service_bundle_key='cwf-air-care');

WITH c AS (SELECT item_id FROM public.catalog_items WHERE service_bundle_key='cwf-air-care' LIMIT 1),
d(package_key,display_name,description,btu_min,btu_max,sort_order,modifier) AS (
 VALUES
 ('cwf-air-care-small','AIR CARE • ≤12,000 BTU','ราคาฐาน CWF AIR CARE',NULL::integer,12000::integer,0,0.00::numeric),
 ('cwf-air-care-large','AIR CARE • ≥18,000 BTU','เพิ่ม 100 บาท/เครื่อง',18000::integer,NULL::integer,1,100.00::numeric)
)
INSERT INTO public.service_packages
(package_key,display_name,description,service_key,service_name,job_type,ac_type,wash_variant,btu_min,btu_max,
 service_unit_duration_minutes,is_active,is_customer_visible,catalog_item_id,sort_order,service_level_key,
 service_level_label,unit_price_modifier)
SELECT d.package_key,d.display_name,d.description,'cwf-air-care','CWF AIR CARE','ล้าง','ผนัง','ล้างธรรมดา',
 d.btu_min,d.btu_max,60,TRUE,TRUE,c.item_id,d.sort_order,'standard','STANDARD',d.modifier
FROM d CROSS JOIN c
WHERE NOT EXISTS (SELECT 1 FROM public.service_packages p WHERE p.package_key=d.package_key);

WITH d(package_key,tier_key,label,qty,price,sort_order) AS (
 VALUES
 ('cwf-air-care-small','q1','1 เครื่อง',1,499.00::numeric,0),
 ('cwf-air-care-small','q2','2 เครื่อง',2,899.00::numeric,1),
 ('cwf-air-care-small','q3','3 เครื่อง',3,1299.00::numeric,2),
 ('cwf-air-care-small','q4','4 เครื่อง',4,1699.00::numeric,3),
 ('cwf-air-care-large','q1','1 เครื่อง',1,499.00::numeric,0),
 ('cwf-air-care-large','q2','2 เครื่อง',2,899.00::numeric,1),
 ('cwf-air-care-large','q3','3 เครื่อง',3,1299.00::numeric,2),
 ('cwf-air-care-large','q4','4 เครื่อง',4,1699.00::numeric,3)
)
INSERT INTO public.service_package_tiers
(service_package_id,tier_key,display_name,service_quantity,fixed_total_price,sort_order,is_active)
SELECT p.service_package_id,d.tier_key,d.label,d.qty,d.price,d.sort_order,TRUE
FROM d JOIN public.service_packages p ON p.package_key=d.package_key
ON CONFLICT (service_package_id,tier_key) DO NOTHING;
