# CWF Foreign Customer English Q&A v1.3
อัปเดต: 2026-06-09

ไฟล์นี้เป็นชุดคำถาม-คำตอบภาษาอังกฤษสำหรับลูกค้าต่างชาติของ Coldwindflow Air Services  
ใช้กับ CWF AI Office / Sales AI / Admin Reply Assistant

## หลักการใช้งาน
- ใช้เป็นร่างคำตอบให้แอดมินตรวจและกดส่งเอง
- โทนเป็นแอดมินผู้หญิง สุภาพ เป็นธรรมชาติ
- ตอบสั้นแบบ LINE/WhatsApp
- ไม่ฟันธงอาการเสีย
- ไม่เดา error code
- คำถามเสี่ยงให้ขึ้น `admin_only` หรือ `technician_only`

## Risk Labels
- `safe_reply`: ใช้ร่างตอบได้เลย
- `needs_admin_check`: ร่างได้ แต่แอดมินควรตรวจ
- `technician_review`: ต้องส่งต่อช่าง/ตรวจเช็ค
- `admin_only`: ไม่ควรให้ AI ตอบเอง
- `technician_only`: ห้ามให้วิธีทำ ให้ส่งต่อช่างเท่านั้น


---

## Greeting / Lead Start

### customer_says_hello  
Risk: `safe_reply`
Customer may ask:
- Hello
- Hi
- Do you speak English?
- Can I ask about aircon cleaning?

Reply draft:
> Hello 😊 Yes, we can help in English. May I know what service you need: aircon cleaning, repair, installation, or inspection?

Thai note: เปิดบทสนทนาสั้น ไม่ยาว

---

## Price / Cleaning

### ask_cleaning_price  
Risk: `safe_reply`
Customer may ask:
- How much is aircon cleaning?
- What is your price?
- Cleaning price please

Reply draft:
> Our wall-type aircon cleaning starts from 550 THB for standard cleaning. The final price depends on the BTU size and cleaning type. May I know how many units you have and the BTU size if you know it?

Thai note: ตอบราคาก่อน แล้วถามจำนวนเครื่อง/BTU

### ask_all_cleaning_prices  
Risk: `safe_reply`
Customer may ask:
- Can you send me all cleaning prices?
- What are the cleaning options?

Reply draft:
> Sureค่ะ. For wall-type aircons up to 12,000 BTU: standard cleaning 550 THB, premium cleaning 790 THB, hang-coil deep cleaning 1,290 THB, and full disassembly cleaning 1,850 THB. For 18,000 BTU and above: standard 690 THB, premium 990 THB, hang-coil 1,550 THB, and full disassembly 2,150 THB.

Thai note: ใส่ค่ะนิดเดียวได้ แต่ภาษาอังกฤษหลัก

---

## Cleaning Type Difference

### standard_vs_premium  
Risk: `safe_reply`
Customer may ask:
- What is the difference between standard and premium cleaning?
- 550 and 790 difference?

Reply draft:
> Standard cleaning is suitable for aircons cleaned regularly every 4–6 months and not very dirty. Premium cleaning is more detailed. It includes deeper cleaning of the indoor coil, outdoor unit, drain tray, blower wheel, and drain pipe. It is better if the aircon has weak airflow, dust buildup, or has not been cleaned for a long time.

Thai note: อธิบายแบบแอดมิน ไม่ยาวเกิน

### premium_vs_hang_coil  
Risk: `safe_reply`
Customer may ask:
- What is hang-coil cleaning?
- What is the difference between premium and hang-coil cleaning?

Reply draft:
> Premium cleaning is detailed, but hang-coil cleaning is deeper. For hang-coil cleaning, the technician removes the electrical panel and rear drain tray so the inner parts can be cleaned more thoroughly. It is recommended for water leaking, bad smell, noise, or when you want a deeper clean.

Thai note: ระวังไม่พูด guaranteed fix

### full_disassembly_cleaning  
Risk: `safe_reply`
Customer may ask:
- What is full disassembly cleaning?
- When do I need full cleaning?

Reply draft:
> Full disassembly cleaning is the deepest cleaning option. The unit is removed and cleaned more thoroughly outside the wall. It is suitable for heavy dirt, mold buildup, or aircons that have not been cleaned for a very long time.

Thai note: 

---

## Symptom / Water Leak

### water_leak_which_cleaning  
Risk: `safe_reply`
Customer may ask:
- My aircon is leaking water. Which cleaning should I choose?
- Water is dripping from my aircon

Reply draft:
> For water leaking, we usually recommend hang-coil deep cleaning because it allows the technician to clean the rear drain tray and drain path more thoroughly. If the blockage is light, premium cleaning may help, but hang-coil is better to reduce the chance of the leak coming back.

Thai note: ปิดไป 1,290 แบบมีเหตุผล

### water_leak_warranty_question  
Risk: `safe_reply`
Customer may ask:
- If it leaks again after cleaning, is it under warranty?
- Do you guarantee water leaking?

Reply draft:
> Our cleaning work has a 30-day service warranty for issues related to the cleaning service. If the same issue happens within the warranty period, please send us a photo or video first, and our team will check whether it is covered under the warranty conditions.

Thai note: ไม่รับประกันเกินจริง

---

## Symptom / Bad Smell

### bad_smell  
Risk: `safe_reply`
Customer may ask:
- My aircon has a bad smell
- Why does my aircon smell moldy?

Reply draft:
> A bad smell is often caused by dust, moisture, mold, or dirt buildup inside the indoor unit or drain tray. For this symptom, we usually recommend premium cleaning or hang-coil cleaning rather than standard cleaning, because it cleans deeper and helps reduce the smell from coming back quickly.

Thai note: 

---

## Symptom / Not Cold

### not_cold_triage  
Risk: `needs_admin_check`
Customer may ask:
- My aircon is not cold
- Only fan comes out
- The air is not cooling

Reply draft:
> It may be caused by dirt buildup, low refrigerant, leakage, outdoor unit problem, sensor, board, or compressor issue. May I ask when it was last cleaned? Also, does the outdoor unit turn on normally? If it was cleaned recently but still not cold, we recommend an inspection service first.

Thai note: AI ร่างได้ แต่แอดมินตรวจ ถ้าเข้าทางซ่อม

### recently_cleaned_not_cold  
Risk: `needs_admin_check`
Customer may ask:
- It was cleaned 2 months ago but still not cold
- I cleaned it recently but it is not cooling

Reply draft:
> If it was cleaned recently and still does not cool, the problem may not be only dirt. It could be related to refrigerant, leakage, the outdoor unit, sensor, board, or compressor. We recommend a diagnostic inspection first so the technician can find the cause before suggesting a repair.

Thai note: แยกซ่อม ไม่ขายล้าง

---

## Symptom / Outdoor Unit

### outdoor_not_working  
Risk: `technician_review`
Customer may ask:
- The outdoor unit is not working
- The outdoor fan is not spinning
- It makes sound but the fan does not spin

Reply draft:
> This sounds more like a repair/diagnostic case than a cleaning case. It may be related to the electrical system, motor, board, or compressor. We recommend a diagnostic inspection by a technician. Please do not open the electrical cover or touch any wiring by yourself.

Thai note: เสี่ยง ต้องช่าง

---

## Symptom / Error Code

### customer_has_error_code  
Risk: `needs_admin_check`
Customer may ask:
- My aircon shows an error code
- It shows E7
- The light is blinking

Reply draft:
> Please send us a photo or short video of the error code or blinking light, together with the aircon brand and model if possible. Error codes can mean different things depending on the brand and model, so we need to check the correct reference first before advising.

Thai note: ห้ามเดาโค้ด

### how_to_check_error_code  
Risk: `safe_reply`
Customer may ask:
- How can I check the error code?
- Can I check the code myself?

Reply draft:
> You can safely take a photo or video of the display or blinking light for 10–20 seconds. You can also send a photo of the remote control and the model sticker on the unit if it is easy and safe to access. Please do not open any electrical cover, touch wiring, or climb to unsafe areas.

Thai note: ไม่บอกวิธีแต่ละยี่ห้อถ้าไม่รู้รุ่น

---

## Inspection / Repair

### inspection_fee  
Risk: `safe_reply`
Customer may ask:
- How much is inspection?
- Do you charge for checking?
- What is the diagnostic fee?

Reply draft:
> The diagnostic inspection fee starts from 700 THB. The technician will check the problem and advise the repair solution. If you proceed with the repair, the inspection fee can be included in the repair cost.

Thai note: 

### why_pay_inspection_if_cleaning_includes_check  
Risk: `safe_reply`
Customer may ask:
- Why do I need to pay inspection if cleaning includes checking?
- Is basic checking included in cleaning?

Reply draft:
> Cleaning includes only a basic visual check, such as general operation, visible dirt, airflow, and basic symptoms. A diagnostic inspection is different. It is for deeper problems such as error codes, refrigerant leakage, electrical parts, sensors, board, or compressor issues.

Thai note: 

### refrigerant_leak  
Risk: `technician_review`
Customer may ask:
- Do I need refrigerant refill?
- Is my aircon leaking gas?
- Can you repair a refrigerant leak?

Reply draft:
> If the aircon has a refrigerant leak, refilling alone may not solve the problem. The technician needs to inspect and find the leak first. The inspection fee starts from 700 THB, and if repair is needed, we will inform you of the price before doing any repair.

Thai note: เสี่ยงซ่อม ต้องช่าง

### repair_price_before_check  
Risk: `needs_admin_check`
Customer may ask:
- How much to repair?
- Can you tell me the repair price now?

Reply draft:
> The repair price depends on the actual cause and parts needed. We can give a rough idea only after checking the symptom, brand, model, and sometimes photos/videos. The technician will confirm the price before doing any repair or replacing any parts.

Thai note: ห้ามฟันราคาอะไหล่

---

## Booking

### available_today  
Risk: `safe_reply`
Customer may ask:
- Are you available today?
- Can you come today?
- Any slot this evening?

Reply draft:
> May I have your location first? The available time depends on the technician’s route and schedule. Once we have the location, we can check the nearest available slot for you.

Thai note: เช็กโลเคชันก่อนรับปาก

### tomorrow_available  
Risk: `safe_reply`
Customer may ask:
- Are you available tomorrow?
- Can I book tomorrow?

Reply draft:
> Yes, we can check tomorrow’s schedule for you. May I have your location, number of units, cleaning type, and preferred time?

Thai note: 

### booking_details_needed  
Risk: `safe_reply`
Customer may ask:
- What information do you need to book?
- How can I book?

Reply draft:
> To book a service, please send your name, phone number, location, building/room/floor if it is a condo, number of units, BTU size if known, service type, and preferred date/time.

Thai note: 

### condo_details  
Risk: `safe_reply`
Customer may ask:
- It is a condo
- What details do you need for condo service?

Reply draft:
> For condo service, please send the condo name, room number, floor, building if any, phone number, and location. If you need the technician to call before arrival, please let us know and we will add it to the job note.

Thai note: 

### call_before_arrival  
Risk: `safe_reply`
Customer may ask:
- Please call before arriving
- Can the technician call me before coming?

Reply draft:
> Yes, sure. We will add a note for the technician to call you before arrival.

Thai note: 

### unknown_btu  
Risk: `safe_reply`
Customer may ask:
- I don’t know the BTU
- How do I know the BTU?
- Can technician check BTU?

Reply draft:
> No problem. If you are not sure about the BTU, you can send us a photo of the aircon sticker or the technician can check it on-site. The final price depends on the actual BTU size.

Thai note: 

---

## Payment

### payment_timing  
Risk: `safe_reply`
Customer may ask:
- When do I pay?
- Do I pay after cleaning?
- Do you need deposit?

Reply draft:
> For most standard cleaning jobs, you can pay after the service is completed. If any deposit is required for a specific job, we will inform you clearly before booking.

Thai note: 

### payment_methods  
Risk: `safe_reply`
Customer may ask:
- Can I pay by bank transfer?
- Do you accept QR payment?
- Can I pay cash?

Reply draft:
> You can pay by bank transfer/QR after the job is completed. If you prefer another payment method, please let us know before the service.

Thai note: ถ้ารองรับ cash ให้แอดมินยืนยันเอง

### receipt_request  
Risk: `safe_reply`
Customer may ask:
- Can I get a receipt?
- Can you issue an invoice?
- I need a receipt for my landlord

Reply draft:
> Yes, we can issue a receipt after payment. Please send the name and details you want on the receipt, and we will prepare it for you.

Thai note: 

---

## Payment / Extra Charges

### extra_charges  
Risk: `safe_reply`
Customer may ask:
- Are there any extra charges?
- Is this final price?
- Will you charge more on-site?

Reply draft:
> The price we quote is the starting price for a standard job. If the unit is very dirty, difficult to access, installed in a high area, hard to remove, or requires special equipment, the technician will inform you of any additional charge before starting. We will not do any extra repair or part replacement without your confirmation.

Thai note: 

### parking_toll_building_fee  
Risk: `safe_reply`
Customer may ask:
- Who pays parking fee?
- Is parking fee included?
- Do I need to pay building access fee?

Reply draft:
> Parking fees, toll fees, or building access fees are paid by the customer based on the actual cost.

Thai note: 

---

## Warranty

### cleaning_warranty  
Risk: `safe_reply`
Customer may ask:
- Do you provide warranty?
- How long is the cleaning warranty?

Reply draft:
> Our cleaning service has a 30-day warranty for issues related to the cleaning service. If there is a problem, please send us a photo or video first so our team can check whether it is covered.

Thai note: 

### warranty_claim  
Risk: `needs_admin_check`
Customer may ask:
- You cleaned it and now it leaks again
- Is this covered by warranty?
- Can you come back for free?

Reply draft:
> Please send us a photo or video of the issue, together with the job number or service date. We will check the details first. If it is related to our previous service and still within the warranty conditions, we will take care of it accordingly.

Thai note: ต้องตรวจเลขงาน

### not_covered_cases  
Risk: `safe_reply`
Customer may ask:
- What is not covered by warranty?
- What voids the warranty?

Reply draft:
> The warranty does not cover damage from power surge, lightning, flood, fire, natural disasters, animals or insects, improper use, lack of maintenance, modification, repair by another technician after our service, or a new issue unrelated to the original service.

Thai note: 

### someone_else_repaired_after_us  
Risk: `admin_only`
Customer may ask:
- Another technician checked it after your service. Is it still under warranty?
- My landlord called another company after your repair

Admin-only note:
> ให้แอดมินตอบเองหรือให้ผู้จัดการตรวจ เพราะมีความเสี่ยงเรื่องข้อพิพาท/ความรับผิดชอบ ควรขอรายละเอียดก่อน: ใครแก้ อะไรถูกถอด/เปลี่ยน มีหลักฐานไหม

Thai note: เสี่ยง dispute

---

## Risky / Admin Only

### legal_dispute_landlord  
Risk: `admin_only`
Customer may ask:
- I have a dispute with my landlord
- I may need your technician as witness
- Can you write a statement for lawsuit?

Admin-only note:
> ไม่ให้ AI ตอบเอง ต้องให้เจ้าของ/แอดมินอาวุโสตอบ เพราะเกี่ยวกับข้อพิพาท/กฎหมาย/พยาน ควรตอบสุภาพและ factual เท่านั้น

Thai note: เสี่ยงกฎหมาย

---

## Risky / Technician Only

### ask_to_force_power_or_bypass  
Risk: `technician_only`
Customer may ask:
- Can I bypass the board?
- Can I connect power directly?
- Which wire should I connect?
- Can I refill gas by myself?

Admin-only note:
> ห้าม AI ตอบวิธีทำ เพราะเป็นงานไฟฟ้า/น้ำยา/ความปลอดภัย ให้ตอบว่าไม่แนะนำให้ทำเองและให้ช่างตรวจเช็ค

Thai note: ห้ามตอบขั้นตอน

---

## Risky / Price Dispute

### customer_says_expensive  
Risk: `needs_admin_check`
Customer may ask:
- Why is it so expensive?
- Another shop is cheaper
- Can you discount?

Reply draft:
> I understandค่ะ. Our price includes proper cleaning steps, experienced technicians, and service warranty under the service conditions. If you send us the symptoms and number of units, I can recommend the most suitable option so you don’t have to pay for a service that is more than necessary.

Thai note: ควรให้แอดมินตรวจถ้าลูกค้าแรง

---

## Follow-up / No Reply

### follow_up_after_quote  
Risk: `safe_reply`
Customer may ask:
- Customer has not replied after quote

Reply draft:
> Helloค่ะ, may I follow up on the aircon service? If you are still interested, I can help check the nearest available schedule for you.

Thai note: ใช้ติดตาม lead

---

## After Service

### thank_you_review  
Risk: `safe_reply`
Customer may ask:
- Thank you
- Service completed
- I transferred already

Reply draft:
> Thank you for using Coldwindflow Air Servicesค่ะ 🙏 If everything is okay and you are satisfied with our service, we would really appreciate a Google review. It helps support our team a lot.

Thai note: 

---

## Missing / Recommended Questions to Collect Next
เพื่อให้ชุดภาษาอังกฤษสมบูรณ์ขึ้น ควรเก็บแชทจริงเพิ่มกลุ่มนี้:
1. ลูกค้าต่างชาติบอกแพง / ขอส่วนลด / เทียบกับร้านอื่น
2. ลูกค้าต่างชาติถามงานซ่อมรั่ว / เติมน้ำยา / refill gas
3. ลูกค้าต่างชาติถาม landlord/tenant dispute
4. ลูกค้าต่างชาติขอ invoice/receipt details แบบบริษัท
5. ลูกค้าต่างชาติแจ้งปัญหาหลังงานจบ
6. ลูกค้าต่างชาติถาม warranty แบบละเอียด
7. ลูกค้าต่างชาติถาม error code พร้อมยี่ห้อ/รุ่น
8. ลูกค้าต่างชาติพูดไม่ชัด ส่งรูปอย่างเดียว
9. ลูกค้าต่างชาติขอให้ช่างพูดอังกฤษได้ไหม
10. ลูกค้าต่างชาติถามเรื่องนิติ/รปภ/ที่จอดรถ/คอนโด access

---

## Prompt for Codex — Add English Q&A to CWF AI Office

Implement this English Q&A knowledge file into CWF AI Office as a read-only reply-draft knowledge source.

Rules:
- Do not auto-send replies.
- Use these answers only to draft copy-ready replies for admin review.
- Customer-facing English replies must be natural, polite, and short.
- If risk is `admin_only` or `technician_only`, do not generate a full answer. Return a warning for admin and a safe handoff template.
- If risk is `technician_review`, draft a reply that routes to diagnostic inspection or technician review.
- Do not guess repair causes or error-code meanings not found in the verified KB.
- Keep admin persona female in Thai context, but English replies should sound natural and professional.
- Do not expose private customer data.
