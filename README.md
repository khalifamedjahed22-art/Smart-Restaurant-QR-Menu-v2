# MySmartMenu V2 — Secure Upgrade

هذه النسخة مبنية على الكود الأصلي المرفوع، مع تحسينات أمنية وأدائية أساسية.

## أهم التغييرات

- حماية لوحة الإدارة بواسطة Firebase Custom Claims بدل فحص بريد المدير في JavaScript.
- عمليات تمديد/تجميد/تاريخ الاشتراك وحذف المطعم أصبحت عبر Cloud Functions.
- حذف المطعم أصبح recursive من الخادم.
- تسجيل Analytics أصبح عبر Cloud Function بدل الكتابة المباشرة من المتصفح.
- فرض تأكيد البريد قبل دخول حساب المطعم.
- تحسين هوية عناصر السلة باستخدام `itemId`.
- إضافة `firebase.json` و`firestore.rules` وبنية `functions/`.
- إبقاء واجهة المشروع الأصلية وميزاته الرئيسية قدر الإمكان.

## نشر المشروع

### 1) Firebase CLI

ثبت Firebase CLI ثم سجل الدخول:

```bash
npm install -g firebase-tools
firebase login
```

من مجلد المشروع:

```bash
firebase use mysmartmenu-80a57
```

### 2) Cloud Functions

ادخل إلى مجلد الدوال:

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

### 3) Firestore Rules

بعد التأكد من الحسابات، انشر القواعد:

```bash
firebase deploy --only firestore:rules
```

### 4) إنشاء حساب المدير

أنشئ مستخدم المدير أولاً من Firebase Authentication باستخدام Email/Password.

ثم نزّل Service Account من:
Firebase Console → Project Settings → Service Accounts → Generate new private key

احفظ الملف خارج GitHub، ثم شغّل:

```bash
node set-admin-claim.mjs serviceAccount.json admin@example.com
```

بعد ذلك سجّل خروج المدير ثم ادخل من جديد حتى يظهر Custom Claim:

```text
admin: true
```

**مهم:** لا ترفع `serviceAccount.json` إلى GitHub أبداً.

## GitHub

ارفع الملفات بهذا الشكل:

```text
/
├── index.html
├── firebase.json
├── firestore.rules
├── set-admin-claim.mjs
└── functions/
    ├── index.js
    └── package.json
```

## ملاحظة مهمة قبل الإنتاج

Firebase Web Config الموجود في `index.html` ليس كلمة مرور بحد ذاته، لكن صلاحيات Firestore هي خط الدفاع الحقيقي.

كذلك Cloudinary Unsigned Upload Preset يجب أن يكون مقيداً بالامتدادات/الحجم والتحويلات المناسبة من لوحة Cloudinary.

ويُنصح بتفعيل Firebase App Check قبل الإطلاق العام، خصوصاً لأن Analytics يستقبل أحداثاً من زوار القائمة.

## الاختبار

بعد النشر اختبر بالترتيب:

1. إنشاء مطعم.
2. تأكيد البريد.
3. تسجيل الدخول.
4. إضافة/تعديل/حذف طبق.
5. تغيير الثيم.
6. فتح رابط القائمة من نافذة خاصة.
7. إضافة طبق للسلة وإرسال الطلب عبر WhatsApp.
8. دخول المدير بعد إعطائه `admin: true`.
9. تمديد الاشتراك وتجميده وحذفه من لوحة الإدارة.

