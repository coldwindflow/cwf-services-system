-- Issue #329: AIR RESET 60 book-now data seed.
-- Deliberately kept outside migrations/: deployctl's expand lane is schema-only.
-- Insert-only and safe to re-run; existing promotion rows are never overwritten.

WITH desired(
  bundle_key, item_name, short_description, long_description, highlights,
  service_conditions, badge, theme, effect, supporting_text
) AS (
  VALUES
    (
      'air-reset-60-standard',
      'CWF AIR RESET 60 — STANDARD',
      'ล้างแอร์ผนัง STANDARD ราคาโปร 1–4 เครื่อง เลือก BTU ผสมกันได้',
      'CWF AIR RESET 60 STANDARD • จองโปรและเลือกวันเข้าบริการตามคิวว่าง • รับประกันงานล้าง 60 วันตามเงื่อนไขบริษัท',
      '["1 เครื่อง 550.-","2 เครื่อง 959.-","3 เครื่อง 1,399.-","4 เครื่อง 1,799.-","18,000 BTU ขึ้นไป +100.-/เครื่อง"]'::jsonb,
      'สำหรับแอร์ติดผนัง • ไม่เกิน 12,000 BTU ใช้ราคาฐาน • 18,000 BTU ขึ้นไปเพิ่ม 100 บาทต่อเครื่อง • ใช้บริการได้ถึง 31 ม.ค. 2027',
      'AIR RESET 60', 'limited_time', 'soft_glow',
      'ยิ่งหลายเครื่อง ยิ่งคุ้ม • รับประกันงานล้าง 60 วัน'
    ),
    (
      'air-reset-60-premium',
      'CWF AIR RESET 60 — PREMIUM',
      'ล้างแอร์ผนัง PREMIUM ราคาโปร 1–4 เครื่อง เลือก BTU ผสมกันได้',
      'CWF AIR RESET 60 PREMIUM • จองโปรและเลือกวันเข้าบริการตามคิวว่าง • รับประกันงานล้าง 60 วันตามเงื่อนไขบริษัท',
      '["1 เครื่อง 790.-","2 เครื่อง 1,490.-","3 เครื่อง 2,090.-","4 เครื่อง 2,690.-","18,000 BTU ขึ้นไป +200.-/เครื่อง"]'::jsonb,
      'สำหรับแอร์ติดผนัง • ไม่เกิน 12,000 BTU ใช้ราคาฐาน • 18,000 BTU ขึ้นไปเพิ่ม 200 บาทต่อเครื่อง • ใช้บริการได้ถึง 31 ม.ค. 2027',
      'AIR RESET 60', 'premium', 'shimmer_border',
      'PREMIUM CARE • รับประกันงานล้าง 60 วัน'
    )
)
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
  d.item_name, 'service', 0, 'package', 'ล้าง', 'ผนัง',
  TRUE, TRUE, d.short_description, d.long_description, d.highlights,
  d.service_conditions, 'contact_admin', TRUE, TRUE,
  d.bundle_key,
  '2026-09-05T00:00:00+07:00'::timestamptz,
  '2026-09-12T23:59:59.999+07:00'::timestamptz,
  '2027-01-31T23:59:59.999+07:00'::timestamptz,
  d.badge, d.theme, d.effect, TRUE, d.supporting_text,
  'scheduled_only', NULL,
  'total_quantity_tier_plus_unit_modifiers', 'multi_variant',
  4, 'book_now', 60
FROM desired d
WHERE NOT EXISTS (
  SELECT 1 FROM public.catalog_items c WHERE c.service_bundle_key=d.bundle_key
);

WITH desired(
  bundle_key, package_key, display_name, description, service_key, service_name,
  wash_variant, btu_min, btu_max, duration_min, sort_order,
  service_level_key, service_level_label, unit_price_modifier
) AS (
  VALUES
    ('air-reset-60-standard','air-reset-60-standard-small','STANDARD • ≤12,000 BTU','ราคาฐาน STANDARD','air-reset-60-standard','AIR RESET 60 STANDARD','ล้างธรรมดา',NULL::integer,12000::integer,60,0,'standard','STANDARD',0.00::numeric),
    ('air-reset-60-standard','air-reset-60-standard-large','STANDARD • ≥18,000 BTU','STANDARD +100 บาท/เครื่อง','air-reset-60-standard','AIR RESET 60 STANDARD','ล้างธรรมดา',18000::integer,NULL::integer,60,1,'standard','STANDARD',100.00::numeric),
    ('air-reset-60-premium','air-reset-60-premium-small','PREMIUM • ≤12,000 BTU','ราคาฐาน PREMIUM','air-reset-60-premium','AIR RESET 60 PREMIUM','ล้างพรีเมียม',NULL::integer,12000::integer,80,0,'premium','PREMIUM',0.00::numeric),
    ('air-reset-60-premium','air-reset-60-premium-large','PREMIUM • ≥18,000 BTU','PREMIUM +200 บาท/เครื่อง','air-reset-60-premium','AIR RESET 60 PREMIUM','ล้างพรีเมียม',18000::integer,NULL::integer,80,1,'premium','PREMIUM',200.00::numeric)
)
INSERT INTO public.service_packages
  (package_key, display_name, description, service_key, service_name, job_type, ac_type,
   wash_variant, btu_min, btu_max, service_unit_duration_minutes, sell_start_at, sell_end_at,
   redeem_until, is_active, is_customer_visible, catalog_item_id, sort_order,
   service_level_key, service_level_label, unit_price_modifier)
SELECT
  d.package_key, d.display_name, d.description, d.service_key, d.service_name,
  'ล้าง', 'ผนัง', d.wash_variant, d.btu_min, d.btu_max, d.duration_min,
  NULL, NULL, NULL, TRUE, TRUE, c.item_id, d.sort_order,
  d.service_level_key, d.service_level_label, d.unit_price_modifier
FROM desired d
JOIN public.catalog_items c ON c.service_bundle_key=d.bundle_key
WHERE NOT EXISTS (
  SELECT 1 FROM public.service_packages p WHERE p.package_key=d.package_key
);

WITH desired(package_key,tier_key,display_name,qty,price,sort_order) AS (
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
)
INSERT INTO public.service_package_tiers
  (service_package_id, tier_key, display_name, service_quantity, fixed_total_price, sort_order, is_active)
SELECT p.service_package_id, d.tier_key, d.display_name, d.qty, d.price, d.sort_order, TRUE
FROM desired d
JOIN public.service_packages p ON p.package_key=d.package_key
ON CONFLICT (service_package_id, tier_key) DO NOTHING;
