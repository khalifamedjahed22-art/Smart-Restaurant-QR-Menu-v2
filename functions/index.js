/**
 * MySmartMenu — Cloud Functions
 * يحتوي على الدالتين اللتين يستدعيهما index.html:
 *   - trackAnalytics : تسجيل المشاهدات والطلبات لكل مطعم (بدون تسجيل دخول للزبون)
 *   - adminAction     : عمليات لوحة الإدارة (تمديد / تجميد / تاريخ مخصص / حذف)
 *
 * المنطقة: europe-west1 (يجب أن تطابق ما هو محدد في index.html => CONFIG.functions.region)
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

setGlobalOptions({ region: "europe-west1", maxInstances: 10 });

// بريد/بريدَي المدير — يُستخدم كخيار احتياطي إضافة لـ custom claim "admin"
const ADMIN_EMAILS = new Set([
  "khalifamedjahed22@gmail.com",
]);

// ==================== أدوات مساعدة ====================

function isAdminAuth(auth) {
  if (!auth) return false;
  const claimAdmin = auth.token && auth.token.admin === true;
  const email = String((auth.token && auth.token.email) || "").toLowerCase();
  return claimAdmin || ADMIN_EMAILS.has(email);
}

function requireAdmin(auth) {
  if (!isAdminAuth(auth)) {
    throw new HttpsError(
      "permission-denied",
      "هذه العملية متاحة فقط لحساب المدير."
    );
  }
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function todayDateKey() {
  // مفتاح اليوم بتوقيت الخادم (UTC). يُستخدم كمعرف مستند daily analytics.
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function analyticsItemKey(name) {
  return (
    String(name || "item")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06ff]+/gi, "_")
      .slice(0, 80) || "item"
  );
}

const RESTAURANT_ID_RE = /^[a-z0-9_]{1,60}$/;

// ==================== trackAnalytics ====================
// يُستدعى من واجهة الزبون (بدون تسجيل دخول) ومن لوحة صاحب المطعم.
// لا يتطلب مصادقة، لكنه يتحقق من صحة المدخلات ومن وجود المطعم فعلياً.

exports.trackAnalytics = onCall(async (request) => {
  const data = request.data || {};
  const restId = String(data.restId || "").trim().toLowerCase();
  const field = data.field;

  if (!restId || !RESTAURANT_ID_RE.test(restId)) {
    throw new HttpsError("invalid-argument", "معرف المطعم غير صالح.");
  }
  if (field !== "views" && field !== "orders") {
    throw new HttpsError("invalid-argument", "نوع الإحصائية غير صالح.");
  }

  const restRef = db.collection("restaurants").doc(restId);
  const restSnap = await restRef.get();
  if (!restSnap.exists) {
    throw new HttpsError("not-found", "المطعم غير موجود.");
  }

  const amount = clampInt(data.amount, 1, 20, 1);
  const dateKey = todayDateKey();
  const analyticsRef = restRef.collection("analytics").doc(dateKey);

  const updatePayload = {
    [field]: admin.firestore.FieldValue.increment(amount),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (field === "orders" && Array.isArray(data.items)) {
    for (const rawItem of data.items.slice(0, 50)) {
      const name = String((rawItem && rawItem.name) || "طبق").slice(0, 120);
      const qty = clampInt(rawItem && rawItem.quantity, 1, 20, 1);
      const key = analyticsItemKey(rawItem && (rawItem.itemId || name));

      updatePayload[`itemCounts.${key}`] = admin.firestore.FieldValue.increment(qty);
      updatePayload[`itemLabels.${key}`] = name;
    }
  }

  await analyticsRef.set(updatePayload, { merge: true });

  return { success: true, dateKey };
});

// ==================== adminAction ====================
// يتطلب مصادقة + صلاحية مدير (custom claim admin==true أو بريد مطابق).

exports.adminAction = onCall(async (request) => {
  requireAdmin(request.auth);

  const data = request.data || {};
  const action = data.action;
  const restId = String(data.restId || "").trim().toLowerCase();

  if (!restId) {
    throw new HttpsError("invalid-argument", "معرف المطعم مطلوب.");
  }

  const restRef = db.collection("restaurants").doc(restId);
  const restSnap = await restRef.get();
  if (!restSnap.exists) {
    throw new HttpsError("not-found", "المطعم غير موجود.");
  }
  const restData = restSnap.data() || {};

  switch (action) {
    case "extendSubscription": {
      const days = clampInt(data.days, 1, 3650, 30);
      const currentEnd = restData.subscription && restData.subscription.endDate
        ? new Date(restData.subscription.endDate)
        : null;
      const now = new Date();
      const base = currentEnd && currentEnd.getTime() > now.getTime() ? currentEnd : now;
      const newEnd = new Date(base.getTime());
      newEnd.setDate(newEnd.getDate() + days);

      await restRef.set(
        {
          subscription: {
            ...restData.subscription,
            endDate: newEnd.toISOString(),
            status: "active",
            frozen: false,
          },
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      return { success: true, newEndDate: newEnd.toISOString() };
    }

    case "setExpiry": {
      const dateStr = String(data.date || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        throw new HttpsError("invalid-argument", "صيغة التاريخ غير صحيحة (YYYY-MM-DD).");
      }
      const newEnd = new Date(dateStr + "T23:59:59");
      if (Number.isNaN(newEnd.getTime())) {
        throw new HttpsError("invalid-argument", "تاريخ غير صالح.");
      }

      await restRef.set(
        {
          subscription: {
            ...restData.subscription,
            endDate: newEnd.toISOString(),
          },
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      return { success: true, newEndDate: newEnd.toISOString() };
    }

    case "toggleFreeze": {
      const frozen = Boolean(data.frozen);
      await restRef.set(
        {
          subscription: {
            ...restData.subscription,
            frozen,
          },
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      return { success: true, frozen };
    }

    case "deleteRestaurant": {
      await db.recursiveDelete(restRef);

      const ownerUid = restData.ownerUid || restData.uid;
      if (ownerUid) {
        try {
          await admin.auth().deleteUser(ownerUid);
        } catch (err) {
          console.warn("تعذر حذف حساب Auth المرتبط بالمطعم:", err.message);
        }
      }

      return { success: true };
    }

    default:
      throw new HttpsError("invalid-argument", "إجراء إداري غير معروف: " + action);
  }
});
