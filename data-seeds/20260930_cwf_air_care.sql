-- Issue #382: COLDWINDFLOW AIR CARE manual-payment prepaid campaign.
-- Customer reserves first; Admin verifies LINE/manual payment before entitlement activation.
-- PREMIUM mixed BTU uses each size's own advertised tier, summed across groups.

WITH desired(bundle_key,item_name,short_description,long_description,highlights,conditions,pricing_strategy,selection_mode) AS (
 VALUES
 ('coldwindflow-air-care-standard','COLDWINDFLOW AIR CARE — STANDARD',
  'โครงการช่วยค่าล้างแอร์ หลังฝนหนัก–น้ำท่วม โดย COLDWINDFLOW AIR SERVICES',
  'เปิดซื้อสิทธิ์ 30 กันยายน – 6 ตุลาคม 2569 • จ่ายวันนี้ ล็อกราคาพิเศษ เลือกวันล้างภายหลังตามคิวว่าง',
  '["STANDARD ≤12,000 BTU • 1 เครื่อง 499.-","2 เครื่อง 899.-","3 เครื่อง 1,299.-","4 เครื่อง 1,699.-","≥18,000 BTU เพิ่ม 100 บาท/เครื่อง","สิทธิ์ใช้ได้ 60 วันนับจากวันที่ซื้อ","รับประกันงานล้าง 60 วัน"]'::jsonb,
  'สำหรับแอร์ติดผนัง • ≤12,000 BTU ใช้ราคาฐาน • ≥18,000 BTU เพิ่ม 100 บาทต่อเครื่อง • สิทธิ์ ACTIVE หลังแอดมินยืนยันการชำระ',
  'total_quantity_tier_plus_unit_modifiers','multi_variant'),
 ('coldwindflow-air-care-premium','COLDWINDFLOW AIR CARE — PREMIUM',
  'โครงการช่วยค่าล้างแอร์ หลังฝนหนัก–น้ำท่วม โดย COLDWINDFLOW AIR SERVICES',
  'เปิดซื้อสิทธิ์ 30 กันยายน – 6 ตุลาคม 2569 • จ่ายวันนี้ ล็อกราคาพิเศษ เลือกวันล้างภายหลังตามคิวว่าง',
  '["PREMIUM ≤12,000 BTU • 1 เครื่อง 699.-","2 เครื่อง 1,399.-","3 เครื่อง 1,899.-","4 เครื่อง 2,489.-","PREMIUM ≥18,000 BTU • 1 เครื่อง 899.-","2 เครื่อง 1,799.-","3 เครื่อง 2,599.-","4 เครื่อง 3,399.-","สิทธิ์ใช้ได้ 60 วันนับจากวันที่ซื้อ","รับประกันงานล้าง 60 วัน"]'::jsonb,
  'สำหรับแอร์ติดผนัง • PREMIUM แต่ละกลุ่ม BTU ใช้ตารางราคาของกลุ่มนั้น แล้วรวมยอด • สิทธิ์ ACTIVE หลังแอดมินยืนยันการชำระ',
  'per_variant_tier','exclusive_level')
)
INSERT INTO public.catalog_items
(item_name,item_category,base_price,unit_label,job_category,ac_type,is_active,is_customer_visible,
 short_description,long_description,highlights,service_conditions,booking_mode,is_featured,is_autoplay_enabled,
 service_bundle_key,service_package_sell_start_at,service_package_sell_end_at,service_package_redeem_until,
 promotion_badge_text,promotion_theme_preset,promotion_effect_preset,show_sale_countdown,promotion_supporting_text,
 booking_flow_policy,service_package_minimum_total_quantity,service_package_pricing_strategy,
 service_package_selection_mode,service_package_maximum_total_quantity,service_package_payment_mode,
 service_package_warranty_days)
SELECT d.item_name,'service',0,'package','ล้าง','ผนัง',TRUE,TRUE,d.short_description,d.long_description,d.highlights,d.conditions,
 'contact_admin',TRUE,TRUE,d.bundle_key,
 '2026-09-29T00:00:00+07:00'::timestamptz,'2026-10-06T23:59:59.999+07:00'::timestamptz,
 '2026-12-05T23:59:59.999+07:00'::timestamptz,
 'COLDWINDFLOW AIR CARE','limited_time','soft_glow',TRUE,
 'จ่ายวันนี้ → ล็อกราคาพิเศษ → เลือกวันล้างภายหลัง',
 'scheduled_only',NULL,d.pricing_strategy,d.selection_mode,NULL,'prepaid_full',60
FROM desired d
WHERE NOT EXISTS (SELECT 1 FROM public.catalog_items c WHERE c.service_bundle_key=d.bundle_key);

WITH desired(bundle_key,package_key,display_name,description,wash_variant,btu_min,btu_max,duration_min,sort_order,level_key,level_label,modifier) AS (
 VALUES
 ('coldwindflow-air-care-standard','coldwindflow-air-care-standard-small','STANDARD • ≤12,000 BTU','ราคาฐาน STANDARD','ล้างธรรมดา',NULL::integer,12000::integer,60,0,'standard','STANDARD',0.00::numeric),
 ('coldwindflow-air-care-standard','coldwindflow-air-care-standard-large','STANDARD • ≥18,000 BTU','STANDARD +100 บาท/เครื่อง','ล้างธรรมดา',18000::integer,NULL::integer,60,1,'standard','STANDARD',100.00::numeric),
 ('coldwindflow-air-care-premium','coldwindflow-air-care-premium-small','PREMIUM • ≤12,000 BTU','ตารางราคา PREMIUM ≤12,000 BTU','ล้างพรีเมียม',NULL::integer,12000::integer,80,0,'premium','PREMIUM',0.00::numeric),
 ('coldwindflow-air-care-premium','coldwindflow-air-care-premium-large','PREMIUM • ≥18,000 BTU','ตารางราคา PREMIUM ≥18,000 BTU','ล้างพรีเมียม',18000::integer,NULL::integer,80,1,'premium','PREMIUM',0.00::numeric)
)
INSERT INTO public.service_packages
(package_key,display_name,description,service_key,service_name,job_type,ac_type,wash_variant,btu_min,btu_max,
 service_unit_duration_minutes,is_active,is_customer_visible,catalog_item_id,sort_order,service_level_key,
 service_level_label,unit_price_modifier)
SELECT d.package_key,d.display_name,d.description,d.bundle_key,d.display_name,'ล้าง','ผนัง',d.wash_variant,
 d.btu_min,d.btu_max,d.duration_min,TRUE,TRUE,c.item_id,d.sort_order,d.level_key,d.level_label,d.modifier
FROM desired d JOIN public.catalog_items c ON c.service_bundle_key=d.bundle_key
WHERE NOT EXISTS (SELECT 1 FROM public.service_packages p WHERE p.package_key=d.package_key);

WITH desired(package_key,tier_key,label,qty,price,sort_order) AS (
 VALUES
 ('coldwindflow-air-care-standard-small','q1','1 เครื่อง',1,499.00::numeric,0),
 ('coldwindflow-air-care-standard-small','q2','2 เครื่อง',2,899.00::numeric,1),
 ('coldwindflow-air-care-standard-small','q3','3 เครื่อง',3,1299.00::numeric,2),
 ('coldwindflow-air-care-standard-small','q4','4 เครื่อง',4,1699.00::numeric,3),
 ('coldwindflow-air-care-standard-large','q1','1 เครื่อง',1,499.00::numeric,0),
 ('coldwindflow-air-care-standard-large','q2','2 เครื่อง',2,899.00::numeric,1),
 ('coldwindflow-air-care-standard-large','q3','3 เครื่อง',3,1299.00::numeric,2),
 ('coldwindflow-air-care-standard-large','q4','4 เครื่อง',4,1699.00::numeric,3),
 ('coldwindflow-air-care-premium-small','q1','1 เครื่อง',1,699.00::numeric,0),
 ('coldwindflow-air-care-premium-small','q2','2 เครื่อง',2,1399.00::numeric,1),
 ('coldwindflow-air-care-premium-small','q3','3 เครื่อง',3,1899.00::numeric,2),
 ('coldwindflow-air-care-premium-small','q4','4 เครื่อง',4,2489.00::numeric,3),
 ('coldwindflow-air-care-premium-large','q1','1 เครื่อง',1,899.00::numeric,0),
 ('coldwindflow-air-care-premium-large','q2','2 เครื่อง',2,1799.00::numeric,1),
 ('coldwindflow-air-care-premium-large','q3','3 เครื่อง',3,2599.00::numeric,2),
 ('coldwindflow-air-care-premium-large','q4','4 เครื่อง',4,3399.00::numeric,3)
)
INSERT INTO public.service_package_tiers
(service_package_id,tier_key,display_name,service_quantity,fixed_total_price,sort_order,is_active)
SELECT p.service_package_id,d.tier_key,d.label,d.qty,d.price,d.sort_order,TRUE
FROM desired d JOIN public.service_packages p ON p.package_key=d.package_key
ON CONFLICT (service_package_id,tier_key) DO UPDATE
SET display_name=EXCLUDED.display_name,
    service_quantity=EXCLUDED.service_quantity,
    fixed_total_price=EXCLUDED.fixed_total_price,
    sort_order=EXCLUDED.sort_order,
    is_active=EXCLUDED.is_active,
    updated_at=NOW();


-- Convergent release correction. Production can contain pre-existing rows from
-- the original manual campaign setup, so every quote-authoritative field must
-- be reconciled instead of relying on INSERT ... WHERE NOT EXISTS.
WITH desired(bundle_key,item_name,short_description,long_description,highlights,conditions,pricing_strategy,selection_mode) AS (
 VALUES
 ('coldwindflow-air-care-standard','COLDWINDFLOW AIR CARE — STANDARD',
  'โครงการช่วยค่าล้างแอร์ หลังฝนหนัก–น้ำท่วม โดย COLDWINDFLOW AIR SERVICES',
  'เปิดซื้อสิทธิ์ 30 กันยายน – 6 ตุลาคม 2569 • จ่ายวันนี้ ล็อกราคาพิเศษ เลือกวันล้างภายหลังตามคิวว่าง',
  '["STANDARD ≤12,000 BTU • 1 เครื่อง 499.-","2 เครื่อง 899.-","3 เครื่อง 1,299.-","4 เครื่อง 1,699.-","≥18,000 BTU เพิ่ม 100 บาท/เครื่อง","สิทธิ์ใช้ได้ 60 วันนับจากวันที่ซื้อ","รับประกันงานล้าง 60 วัน"]'::jsonb,
  'สำหรับแอร์ติดผนัง • ≤12,000 BTU ใช้ราคาฐาน • ≥18,000 BTU เพิ่ม 100 บาทต่อเครื่อง • สิทธิ์ ACTIVE หลังแอดมินยืนยันการชำระ',
  'total_quantity_tier_plus_unit_modifiers','multi_variant'),
 ('coldwindflow-air-care-premium','COLDWINDFLOW AIR CARE — PREMIUM',
  'โครงการช่วยค่าล้างแอร์ หลังฝนหนัก–น้ำท่วม โดย COLDWINDFLOW AIR SERVICES',
  'เปิดซื้อสิทธิ์ 30 กันยายน – 6 ตุลาคม 2569 • จ่ายวันนี้ ล็อกราคาพิเศษ เลือกวันล้างภายหลังตามคิวว่าง',
  '["PREMIUM ≤12,000 BTU • 1 เครื่อง 699.-","2 เครื่อง 1,399.-","3 เครื่อง 1,899.-","4 เครื่อง 2,489.-","PREMIUM ≥18,000 BTU • 1 เครื่อง 899.-","2 เครื่อง 1,799.-","3 เครื่อง 2,599.-","4 เครื่อง 3,399.-","สิทธิ์ใช้ได้ 60 วันนับจากวันที่ซื้อ","รับประกันงานล้าง 60 วัน"]'::jsonb,
  'สำหรับแอร์ติดผนัง • PREMIUM แต่ละกลุ่ม BTU ใช้ตารางราคาของกลุ่มนั้น แล้วรวมยอด • สิทธิ์ ACTIVE หลังแอดมินยืนยันการชำระ',
  'per_variant_tier','exclusive_level')
)
UPDATE public.catalog_items c
   SET item_name=d.item_name,
       item_category='service',
       base_price=0,
       unit_label='package',
       job_category='ล้าง',
       ac_type='ผนัง',
       short_description=d.short_description,
       long_description=d.long_description,
       highlights=d.highlights,
       service_conditions=d.conditions,
       booking_mode='contact_admin',
       is_featured=TRUE,
       is_autoplay_enabled=TRUE,
       service_package_sell_start_at='2026-09-29T00:00:00+07:00'::timestamptz,
       service_package_sell_end_at='2026-10-06T23:59:59.999+07:00'::timestamptz,
       service_package_redeem_until='2026-12-05T23:59:59.999+07:00'::timestamptz,
       promotion_badge_text='COLDWINDFLOW AIR CARE',
       promotion_theme_preset='limited_time',
       promotion_effect_preset='soft_glow',
       show_sale_countdown=TRUE,
       promotion_supporting_text='จ่ายวันนี้ → ล็อกราคาพิเศษ → เลือกวันล้างภายหลัง',
       booking_flow_policy='scheduled_only',
       service_package_minimum_total_quantity=NULL,
       service_package_pricing_strategy=d.pricing_strategy,
       service_package_selection_mode=d.selection_mode,
       service_package_maximum_total_quantity=NULL,
       service_package_payment_mode='prepaid_full',
       service_package_warranty_days=60,
       is_active=TRUE,
       is_customer_visible=TRUE
  FROM desired d
 WHERE c.service_bundle_key=d.bundle_key;

WITH desired(bundle_key,package_key,display_name,description,wash_variant,btu_min,btu_max,duration_min,sort_order,level_key,level_label,modifier) AS (
 VALUES
 ('coldwindflow-air-care-standard','coldwindflow-air-care-standard-small','STANDARD • ≤12,000 BTU','ราคาฐาน STANDARD','ล้างธรรมดา',NULL::integer,12000::integer,60,0,'standard','STANDARD',0.00::numeric),
 ('coldwindflow-air-care-standard','coldwindflow-air-care-standard-large','STANDARD • ≥18,000 BTU','STANDARD +100 บาท/เครื่อง','ล้างธรรมดา',18000::integer,NULL::integer,60,1,'standard','STANDARD',100.00::numeric),
 ('coldwindflow-air-care-premium','coldwindflow-air-care-premium-small','PREMIUM • ≤12,000 BTU','ตารางราคา PREMIUM ≤12,000 BTU','ล้างพรีเมียม',NULL::integer,12000::integer,80,0,'premium','PREMIUM',0.00::numeric),
 ('coldwindflow-air-care-premium','coldwindflow-air-care-premium-large','PREMIUM • ≥18,000 BTU','ตารางราคา PREMIUM ≥18,000 BTU','ล้างพรีเมียม',18000::integer,NULL::integer,80,1,'premium','PREMIUM',0.00::numeric)
)
UPDATE public.service_packages p
   SET display_name=d.display_name,
       description=d.description,
       service_key=d.bundle_key,
       service_name=d.display_name,
       job_type='ล้าง',
       ac_type='ผนัง',
       wash_variant=d.wash_variant,
       btu_min=d.btu_min,
       btu_max=d.btu_max,
       service_unit_duration_minutes=d.duration_min,
       is_active=TRUE,
       is_customer_visible=TRUE,
       catalog_item_id=c.item_id,
       sort_order=d.sort_order,
       service_level_key=d.level_key,
       service_level_label=d.level_label,
       unit_price_modifier=d.modifier,
       updated_at=NOW()
  FROM desired d
  JOIN public.catalog_items c ON c.service_bundle_key=d.bundle_key
 WHERE p.package_key=d.package_key;
