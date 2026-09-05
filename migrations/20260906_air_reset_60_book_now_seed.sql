-- Issue #329: AIR RESET 60 immediate book-now configuration.
-- Data-only, idempotent seed using the generic promotion engine.
-- Customer and Admin both book through the existing Store service-package flow.

-- STANDARD parent.
INSERT INTO public.catalog_items
  (item_name, item_category, base_price, unit_label, job_category, ac_type,
   is_active, is_customer_visible, short_description, long_description, highlights,
   service_conditions, booking_mode, is_featured, is_autoplay_enabled,
   service_bundle_key, service_package_sell_start_at, service_package_sell_end_at,
   service_package_redeem_until, promotion_badge_text, promotion_theme_preset,
   promotion_effect_preset, show_sale_countdown, promotion_supporting_text,
   booking_flow_policy, service_package_minimum_total_quantity,
   service_package_pricing_strategy, service_package_selection_mode,
   service_package_maximum_total_quantity, service_package_payment_mode,
   service_package_warranty_days)
SELECT
  'CWF AIR RESET 60 — STANDARD', 'service', 0, 'package', 'ล้าง', 'ผนัง',
  TRUE, TRUE,
  'ล้างแอร์ผนัง STANDARD ราคาโปร 1–4 เครื่อง เลือก BTU ผสมกันได้',
  'CWF AIR RESET 60 STANDARD • จองสิทธิ์ราคาโปรแล้วเลือกวันเข้าบริการตามคิวว่าง • รับประกันงานล้าง 60 วันตามเงื่อนไขบริษัท',
  '["1 เครื่อง 550.-","2 เครื่อง 959.-","3 เครื่อง 1,399.-","4 เครื่อง 1,799.-","18,000 BTU ขึ้นไป +100.-/เครื่อง"]'::jsonb,
  'สำหรับแอร์ติดผนัง • ไม่เกิน 12,000 BTU ใช้ราคาฐาน • 18,000 BTU ขึ้นไปเพิ่ม 100 บาทต่อเครื่อง • ใช้สิทธิ์บริการได้ถึง 31 ม.ค. 2027',
  'contact_admin', TRUE, TRUE,
  'air-reset-60-standard',
  '2026-09-05T00:00:00+07:00'::timestamptz,
  '2026-09-12T23:59:59.999+07:00'::timestamptz,
  '2027-01-31T23:59:59.999+07:00'::timestamptz,
  'AIR RESET 60', 'limited_time', 'soft_glow', TRUE,
  'ยิ่งหลายเครื่อง ยิ่งคุ้ม • รับประกันงานล้าง 60 วัน',
  'scheduled_only', NULL,
  'total_quantity_tier_plus_unit_modifiers', 'multi_variant', 4, 'book_now', 60
WHERE NOT EXISTS (
  SELECT 1 FROM public.catalog_items WHERE service_bundle_key='air-reset-60-standard'
);

UPDATE public.catalog_items
SET item_name='CWF AIR RESET 60 — STANDARD',
    item_category='service',
    base_price=0,
    unit_label='package',
    job_category='ล้าง',
    ac_type='ผนัง',
    is_active=TRUE,
    is_customer_visible=TRUE,
    short_description='ล้างแอร์ผนัง STANDARD ราคาโปร 1–4 เครื่อง เลือก BTU ผสมกันได้',
    long_description='CWF AIR RESET 60 STANDARD • จองสิทธิ์ราคาโปรแล้วเลือกวันเข้าบริการตามคิวว่าง • รับประกันงานล้าง 60 วันตามเงื่อนไขบริษัท',
    highlights='["1 เครื่อง 550.-","2 เครื่อง 959.-","3 เครื่อง 1,399.-","4 เครื่อง 1,799.-","18,000 BTU ขึ้นไป +100.-/เครื่อง"]'::jsonb,
    service_conditions='สำหรับแอร์ติดผนัง • ไม่เกิน 12,000 BTU ใช้ราคาฐาน • 18,000 BTU ขึ้นไปเพิ่ม 100 บาทต่อเครื่อง • ใช้สิทธิ์บริการได้ถึง 31 ม.ค. 2027',
    booking_mode='contact_admin',
    is_featured=TRUE,
    is_autoplay_enabled=TRUE,
    service_package_sell_start_at='2026-09-05T00:00:00+07:00'::timestamptz,
    service_package_sell_end_at='2026-09-12T23:59:59.999+07:00'::timestamptz,
    service_package_redeem_until='2027-01-31T23:59:59.999+07:00'::timestamptz,
    promotion_badge_text='AIR RESET 60',
    promotion_theme_preset='limited_time',
    promotion_effect_preset='soft_glow',
    show_sale_countdown=TRUE,
    promotion_supporting_text='ยิ่งหลายเครื่อง ยิ่งคุ้ม • รับประกันงานล้าง 60 วัน',
    booking_flow_policy='scheduled_only',
    service_package_minimum_total_quantity=NULL,
    service_package_pricing_strategy='total_quantity_tier_plus_unit_modifiers',
    service_package_selection_mode='multi_variant',
    service_package_maximum_total_quantity=4,
    service_package_payment_mode='book_now',
    service_package_warranty_days=60
WHERE service_bundle_key='air-reset-60-standard';

-- PREMIUM parent.
INSERT INTO public.catalog_items
  (item_name, item_category, base_price, unit_label, job_category, ac_type,
   is_active, is_customer_visible, short_description, long_description, highlights,
   service_conditions, booking_mode, is_featured, is_autoplay_enabled,
   service_bundle_key, service_package_sell_start_at, service_package_sell_end_at,
   service_package_redeem_until, promotion_badge_text, promotion_theme_preset,
   promotion_effect_preset, show_sale_countdown, promotion_supporting_text,
   booking_flow_policy, service_package_minimum_total_quantity,
   service_package_pricing_strategy, service_package_selection_mode,
   service_package_maximum_total_quantity, service_package_payment_mode,
   service_package_warranty_days)
SELECT
  'CWF AIR RESET 60 — PREMIUM', 'service', 0, 'package', 'ล้าง', 'ผนัง',
  TRUE, TRUE,
  'ล้างแอร์ผนัง PREMIUM ราคาโปร 1–4 เครื่อง เลือก BTU ผสมกันได้',
  'CWF AIR RESET 60 PREMIUM • จองสิทธิ์ราคาโปรแล้วเลือกวันเข้าบริการตามคิวว่าง • รับประกันงานล้าง 60 วันตามเงื่อนไขบริษัท',
  '["1 เครื่อง 790.-","2 เครื่อง 1,490.-","3 เครื่อง 2,090.-","4 เครื่อง 2,690.-","18,000 BTU ขึ้นไป +200.-/เครื่อง"]'::jsonb,
  'สำหรับแอร์ติดผนัง • ไม่เกิน 12,000 BTU ใช้ราคาฐาน • 18,000 BTU ขึ้นไปเพิ่ม 200 บาทต่อเครื่อง • ใช้สิทธิ์บริการได้ถึง 31 ม.ค. 2027',
  'contact_admin', TRUE, TRUE,
  'air-reset-60-premium',
  '2026-09-05T00:00:00+07:00'::timestamptz,
  '2026-09-12T23:59:59.999+07:00'::timestamptz,
  '2027-01-31T23:59:59.999+07:00'::timestamptz,
  'AIR RESET 60', 'premium', 'shimmer_border', TRUE,
  'PREMIUM CARE • รับประกันงานล้าง 60 วัน',
  'scheduled_only', NULL,
  'total_quantity_tier_plus_unit_modifiers', 'multi_variant', 4, 'book_now', 60
WHERE NOT EXISTS (
  SELECT 1 FROM public.catalog_items WHERE service_bundle_key='air-reset-60-premium'
);

UPDATE public.catalog_items
SET item_name='CWF AIR RESET 60 — PREMIUM',
    item_category='service',
    base_price=0,
    unit_label='package',
    job_category='ล้าง',
    ac_type='ผนัง',
    is_active=TRUE,
    is_customer_visible=TRUE,
    short_description='ล้างแอร์ผนัง PREMIUM ราคาโปร 1–4 เครื่อง เลือก BTU ผสมกันได้',
    long_description='CWF AIR RESET 60 PREMIUM • จองสิทธิ์ราคาโปรแล้วเลือกวันเข้าบริการตามคิวว่าง • รับประกันงานล้าง 60 วันตามเงื่อนไขบริษัท',
    highlights='["1 เครื่อง 790.-","2 เครื่อง 1,490.-","3 เครื่อง 2,090.-","4 เครื่อง 2,690.-","18,000 BTU ขึ้นไป +200.-/เครื่อง"]'::jsonb,
    service_conditions='สำหรับแอร์ติดผนัง • ไม่เกิน 12,000 BTU ใช้ราคาฐาน • 18,000 BTU ขึ้นไปเพิ่ม 200 บาทต่อเครื่อง • ใช้สิทธิ์บริการได้ถึง 31 ม.ค. 2027',
    booking_mode='contact_admin',
    is_featured=TRUE,
    is_autoplay_enabled=TRUE,
    service_package_sell_start_at='2026-09-05T00:00:00+07:00'::timestamptz,
    service_package_sell_end_at='2026-09-12T23:59:59.999+07:00'::timestamptz,
    service_package_redeem_until='2027-01-31T23:59:59.999+07:00'::timestamptz,
    promotion_badge_text='AIR RESET 60',
    promotion_theme_preset='premium',
    promotion_effect_preset='shimmer_border',
    show_sale_countdown=TRUE,
    promotion_supporting_text='PREMIUM CARE • รับประกันงานล้าง 60 วัน',
    booking_flow_policy='scheduled_only',
    service_package_minimum_total_quantity=NULL,
    service_package_pricing_strategy='total_quantity_tier_plus_unit_modifiers',
    service_package_selection_mode='multi_variant',
    service_package_maximum_total_quantity=4,
    service_package_payment_mode='book_now',
    service_package_warranty_days=60
WHERE service_bundle_key='air-reset-60-premium';

-- Reusable helper values are expressed as normal rows; no AIR RESET logic exists in application code.
INSERT INTO public.service_packages
  (package_key, display_name, description, service_key, service_name, job_type, ac_type,
   wash_variant, btu_min, btu_max, service_unit_duration_minutes, sell_start_at, sell_end_at,
   redeem_until, is_active, is_customer_visible, catalog_item_id, sort_order,
   service_level_key, service_level_label, unit_price_modifier)
SELECT
  v.package_key, v.display_name, v.description, v.service_key, v.service_name, 'wash', 'wall',
  v.wash_variant, v.btu_min, v.btu_max, 45, NULL, NULL, NULL, TRUE, TRUE, c.item_id, v.sort_order,
  v.service_level_key, v.service_level_label, v.unit_price_modifier
FROM (
  VALUES
    ('air-reset-60-standard-small','STANDARD • ≤12,000 BTU','ราคาฐาน STANDARD','air-reset-60-standard','AIR RESET 60 STANDARD','normal',NULL::integer,12000::integer,0,'standard','STANDARD',0.00::numeric),
    ('air-reset-60-standard-large','STANDARD • ≥18,000 BTU','STANDARD +100 บาท/เครื่อง','air-reset-60-standard','AIR RESET 60 STANDARD','normal',18000::integer,NULL::integer,1,'standard','STANDARD',100.00::numeric),
    ('air-reset-60-premium-small','PREMIUM • ≤12,000 BTU','ราคาฐาน PREMIUM','air-reset-60-premium','AIR RESET 60 PREMIUM','premium',NULL::integer,12000::integer,0,'premium','PREMIUM',0.00::numeric),
    ('air-reset-60-premium-large','PREMIUM • ≥18,000 BTU','PREMIUM +200 บาท/เครื่อง','air-reset-60-premium','AIR RESET 60 PREMIUM','premium',18000::integer,NULL::integer,1,'premium','PREMIUM',200.00::numeric)
) AS v(package_key,display_name,description,service_key,service_name,wash_variant,btu_min,btu_max,sort_order,service_level_key,service_level_label,unit_price_modifier)
JOIN public.catalog_items c
  ON c.service_bundle_key = CASE WHEN v.service_level_key='standard' THEN 'air-reset-60-standard' ELSE 'air-reset-60-premium' END
WHERE NOT EXISTS (
  SELECT 1 FROM public.service_packages p WHERE p.package_key=v.package_key
);

UPDATE public.service_packages p
SET display_name=v.display_name,
    description=v.description,
    service_key=v.service_key,
    service_name=v.service_name,
    job_type='wash',
    ac_type='wall',
    wash_variant=v.wash_variant,
    btu_min=v.btu_min,
    btu_max=v.btu_max,
    service_unit_duration_minutes=45,
    sell_start_at=NULL,
    sell_end_at=NULL,
    redeem_until=NULL,
    is_active=TRUE,
    is_customer_visible=TRUE,
    catalog_item_id=c.item_id,
    sort_order=v.sort_order,
    service_level_key=v.service_level_key,
    service_level_label=v.service_level_label,
    unit_price_modifier=v.unit_price_modifier,
    updated_at=NOW()
FROM (
  VALUES
    ('air-reset-60-standard-small','STANDARD • ≤12,000 BTU','ราคาฐาน STANDARD','air-reset-60-standard','AIR RESET 60 STANDARD','normal',NULL::integer,12000::integer,0,'standard','STANDARD',0.00::numeric),
    ('air-reset-60-standard-large','STANDARD • ≥18,000 BTU','STANDARD +100 บาท/เครื่อง','air-reset-60-standard','AIR RESET 60 STANDARD','normal',18000::integer,NULL::integer,1,'standard','STANDARD',100.00::numeric),
    ('air-reset-60-premium-small','PREMIUM • ≤12,000 BTU','ราคาฐาน PREMIUM','air-reset-60-premium','AIR RESET 60 PREMIUM','premium',NULL::integer,12000::integer,0,'premium','PREMIUM',0.00::numeric),
    ('air-reset-60-premium-large','PREMIUM • ≥18,000 BTU','PREMIUM +200 บาท/เครื่อง','air-reset-60-premium','AIR RESET 60 PREMIUM','premium',18000::integer,NULL::integer,1,'premium','PREMIUM',200.00::numeric)
) AS v(package_key,display_name,description,service_key,service_name,wash_variant,btu_min,btu_max,sort_order,service_level_key,service_level_label,unit_price_modifier)
JOIN public.catalog_items c
  ON c.service_bundle_key = CASE WHEN v.service_level_key='standard' THEN 'air-reset-60-standard' ELSE 'air-reset-60-premium' END
WHERE p.package_key=v.package_key;

-- Exact total-quantity tiers. Both BTU variants in one service level intentionally
-- carry the same base tier; the generic pricing strategy then adds the per-unit modifier.
INSERT INTO public.service_package_tiers
  (service_package_id, tier_key, display_name, service_quantity, fixed_total_price, sort_order, is_active)
SELECT p.service_package_id, v.tier_key, v.display_name, v.qty, v.price, v.sort_order, TRUE
FROM public.service_packages p
JOIN (
  VALUES
    ('air-reset-60-standard-small','q1','1 เครื่อง',1,550.00::numeric,0),
    ('air-reset-60-standard-small','q2','2 เครื่อง',2,959.00::numeric,1),
    ('air-reset-60-standard-small','q3','3 เครื่อง',3,1399.00::numeric,2),
    ('air-reset-60-standard-small','q4','4 เครื่อง',4,1799.00::numeric,3),
    ('air-reset-60-standard-large','q1','1 เครื่อง',1,550.00::numeric,0),
    ('air-reset-60-standard-large','q2','2 เครื่อง',2,959.00::numeric,1),
    ('air-reset-60-standard-large','q3','3 เครื่อง',3,1399.00::numeric,2),
    ('air-reset-60-standard-large','q4','4 เครื่อง',4,1799.00::numeric,3),
    ('air-reset-60-premium-small','q1','1 เครื่อง',1,790.00::numeric,0),
    ('air-reset-60-premium-small','q2','2 เครื่อง',2,1490.00::numeric,1),
    ('air-reset-60-premium-small','q3','3 เครื่อง',3,2090.00::numeric,2),
    ('air-reset-60-premium-small','q4','4 เครื่อง',4,2690.00::numeric,3),
    ('air-reset-60-premium-large','q1','1 เครื่อง',1,790.00::numeric,0),
    ('air-reset-60-premium-large','q2','2 เครื่อง',2,1490.00::numeric,1),
    ('air-reset-60-premium-large','q3','3 เครื่อง',3,2090.00::numeric,2),
    ('air-reset-60-premium-large','q4','4 เครื่อง',4,2690.00::numeric,3)
) AS v(package_key,tier_key,display_name,qty,price,sort_order)
  ON v.package_key=p.package_key
ON CONFLICT (service_package_id, tier_key)
DO UPDATE SET
  display_name=EXCLUDED.display_name,
  service_quantity=EXCLUDED.service_quantity,
  fixed_total_price=EXCLUDED.fixed_total_price,
  sort_order=EXCLUDED.sort_order,
  is_active=TRUE,
  updated_at=NOW();
