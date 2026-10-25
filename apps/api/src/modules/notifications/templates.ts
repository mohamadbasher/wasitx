import type { NotificationType } from "@wasitx/shared";

type L = "ar" | "he" | "en";
type Params = Record<string, string | number>;
const fill = (s: string, p: Params) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(p[k] ?? ""));
const loc = (l: string): L => (l === "he" || l === "en" ? l : "ar");

const EMAILS: Record<string, Record<L, { subject: string; text: string }>> = {
  verifyEmail: {
    ar: { subject: "{brand} — تأكيد بريدك الإلكتروني", text: "مرحبًا،\n\nلتأكيد بريدك الإلكتروني افتح الرابط التالي (صالح لمدة 24 ساعة):\n{link}\n\nإذا لم تقم بإنشاء حساب، تجاهل هذه الرسالة." },
    he: { subject: "{brand} — אימות כתובת האימייל", text: "שלום,\n\nלאימות כתובת האימייל שלך פתח/י את הקישור (בתוקף ל-24 שעות):\n{link}\n\nאם לא נרשמת, אפשר להתעלם מההודעה." },
    en: { subject: "{brand} — confirm your email", text: "Hello,\n\nConfirm your email address by opening this link (valid for 24 hours):\n{link}\n\nIf you didn't create an account, ignore this message." },
  },
  resetPassword: {
    ar: { subject: "{brand} — إعادة تعيين كلمة المرور", text: "طلبت إعادة تعيين كلمة المرور. افتح الرابط التالي (صالح لمدة ساعة):\n{link}\n\nإذا لم تطلب ذلك، لا تفعل شيئًا وتأكد من أمان حسابك." },
    he: { subject: "{brand} — איפוס סיסמה", text: "התקבלה בקשה לאיפוס הסיסמה. פתח/י את הקישור (בתוקף לשעה):\n{link}\n\nאם לא ביקשת, אין צורך לעשות דבר." },
    en: { subject: "{brand} — reset your password", text: "We received a request to reset your password. Open this link (valid for 1 hour):\n{link}\n\nIf you didn't request it, you can ignore this email." },
  },
  phoneOtp: {
    ar: { subject: "", text: "رمز التحقق الخاص بك في {brand}: {code}. لا تشاركه مع أي أحد." },
    he: { subject: "", text: "קוד האימות שלך ב-{brand}: {code}. אין למסור אותו לאף אחד." },
    en: { subject: "", text: "Your {brand} verification code: {code}. Never share it with anyone." },
  },
};

export function renderEmail(key: keyof typeof EMAILS | string, locale: string, params: Params): { subject: string; text: string } {
  const t = EMAILS[key]?.[loc(locale)];
  if (!t) throw new Error(`Unknown template ${key}`);
  return { subject: fill(t.subject, params), text: fill(t.text, params) };
}

const N: Record<NotificationType, Record<L, [string, string]>> = {
  KYC_APPROVED: {
    ar: ["تم توثيق حسابك", "تهانينا! يمكنك الآن نشر العروض والتداول."],
    he: ["החשבון שלך אומת", "מזל טוב! אפשר כעת לפרסם הצעות ולסחור."],
    en: ["Your account is verified", "Congratulations! You can now publish offers and trade."],
  },
  KYC_REJECTED: {
    ar: ["تعذّر توثيق حسابك", "لم نتمكن من إتمام التحقق من الهوية. تواصل مع الدعم لمزيد من التفاصيل."],
    he: ["לא ניתן היה לאמת את החשבון", "לא הצלחנו להשלים את אימות הזהות. לפרטים פנה/י לתמיכה."],
    en: ["Verification unsuccessful", "We couldn't complete identity verification. Contact support for details."],
  },
  KYC_RESUBMISSION: {
    ar: ["مطلوب إعادة إرسال الوثائق", "يرجى إعادة إرسال وثائق الهوية بجودة أوضح."],
    he: ["נדרשת הגשה חוזרת", "נא להגיש שוב את מסמכי הזהות באיכות ברורה יותר."],
    en: ["Please resubmit documents", "Please resubmit your identity documents with better quality."],
  },
  TRADE_STARTED: {
    ar: ["صفقة جديدة {reference}", "تم قبول عرضك: {amount} USDT مقابل ₪{fiat}."],
    he: ["עסקה חדשה {reference}", "ההצעה שלך התקבלה: {amount} USDT תמורת ₪{fiat}."],
    en: ["New trade {reference}", "Your offer was accepted: {amount} USDT for ₪{fiat}."],
  },
  TRADE_ESCROW_LOCKED: {
    ar: ["الضمان مقفل — {reference}", "تم حجز {amount} USDT في الضمان. على المشتري تحويل ₪{fiat} الآن."],
    he: ["הנאמנות ננעלה — {reference}", "{amount} USDT ננעלו בנאמנות. על הקונה להעביר עכשיו ₪{fiat}."],
    en: ["Escrow locked — {reference}", "{amount} USDT is held in escrow. The buyer should now transfer ₪{fiat}."],
  },
  TRADE_MARKED_PAID: {
    ar: ["المشتري أبلغ عن الدفع — {reference}", "تحقق من وصول ₪{fiat} إلى حسابك البنكي قبل التأكيد. لا تعتمد على صورة الإيصال."],
    he: ["הקונה דיווח על תשלום — {reference}", "בדוק/י שהתקבלו ₪{fiat} בחשבון הבנק לפני האישור. אין להסתמך על צילום מסך."],
    en: ["Buyer marked as paid — {reference}", "Check that ₪{fiat} actually arrived in your bank account before confirming. Never rely on a screenshot."],
  },
  TRADE_PAYMENT_DEADLINE: {
    ar: ["تبقّى {minutes} دقائق للدفع", "الصفقة {reference}: حوّل ₪{fiat} وأبلغ عن الدفع قبل انتهاء المهلة."],
    he: ["נותרו {minutes} דקות לתשלום", "עסקה {reference}: העבר/י ₪{fiat} ודווח/י על התשלום לפני תום הזמן."],
    en: ["{minutes} minutes left to pay", "Trade {reference}: transfer ₪{fiat} and mark it paid before the window closes."],
  },
  TRADE_RECEIPT_CONFIRMED: {
    ar: ["البائع أكد الاستلام — {reference}", "جارٍ تحرير {amount} USDT إلى حسابك."],
    he: ["המוכר אישר קבלה — {reference}", "{amount} USDT בדרך לחשבונך."],
    en: ["Seller confirmed receipt — {reference}", "{amount} USDT is being released to you."],
  },
  TRADE_COMPLETED: {
    ar: ["اكتملت الصفقة {reference}", "تمت الصفقة بنجاح. يمكنك تقييم الطرف الآخر."],
    he: ["העסקה {reference} הושלמה", "העסקה הושלמה בהצלחה. אפשר לדרג את הצד השני."],
    en: ["Trade {reference} completed", "The trade completed successfully. You can now rate your counterparty."],
  },
  TRADE_CANCELLED: {
    ar: ["أُلغيت الصفقة {reference}", "تم إلغاء الصفقة وإرجاع المبلغ المحجوز."],
    he: ["העסקה {reference} בוטלה", "העסקה בוטלה והסכום שהוחזק שוחרר."],
    en: ["Trade {reference} cancelled", "The trade was cancelled and any held amount was returned."],
  },
  TRADE_EXPIRED: {
    ar: ["انتهت مهلة الصفقة {reference}", "لم يتم الإبلاغ عن الدفع في الوقت المحدد."],
    he: ["פג תוקף העסקה {reference}", "לא דווח על תשלום בזמן."],
    en: ["Trade {reference} expired", "Payment wasn't marked within the time limit."],
  },
  TRADE_DISPUTED: {
    ar: ["فُتح نزاع — {reference}", "فريق النزاعات سيراجع الصفقة. أرسل أي إثباتات من صفحة النزاع."],
    he: ["נפתחה מחלוקת — {reference}", "צוות המחלוקות יבדוק את העסקה. אפשר להעלות ראיות בעמוד המחלוקת."],
    en: ["Dispute opened — {reference}", "Our disputes team will review the trade. Add evidence from the dispute page."],
  },
  TRADE_FROZEN: {
    ar: ["الصفقة {reference} مجمّدة مؤقتًا", "الصفقة قيد المراجعة من فريق الامتثال. لا حاجة لأي إجراء الآن."],
    he: ["העסקה {reference} הוקפאה זמנית", "העסקה נבדקת על ידי צוות הציות. אין צורך בפעולה כרגע."],
    en: ["Trade {reference} temporarily frozen", "The trade is under compliance review. No action is needed right now."],
  },
  DISPUTE_UPDATE: {
    ar: ["تحديث على النزاع", "هناك رسالة جديدة أو طلب معلومات في نزاع الصفقة {reference}."],
    he: ["עדכון במחלוקת", "יש הודעה חדשה או בקשת מידע במחלוקת על עסקה {reference}."],
    en: ["Dispute update", "There's a new message or information request on the dispute for trade {reference}."],
  },
  DISPUTE_RESOLVED: {
    ar: ["تم حل النزاع", "صدر قرار في نزاع الصفقة {reference}."],
    he: ["המחלוקת הוכרעה", "התקבלה החלטה במחלוקת על עסקה {reference}."],
    en: ["Dispute resolved", "A decision was made on the dispute for trade {reference}."],
  },
  NEW_MESSAGE: {
    ar: ["رسالة جديدة", "رسالة جديدة في الصفقة {reference}."],
    he: ["הודעה חדשה", "הודעה חדשה בעסקה {reference}."],
    en: ["New message", "New message in trade {reference}."],
  },
  SUPPORT_REPLY: {
    ar: ["رد من الدعم", "رد فريق الدعم على طلبك: {subject}"],
    he: ["תשובה מהתמיכה", "צוות התמיכה השיב לפנייה: {subject}"],
    en: ["Support replied", "Support replied to your ticket: {subject}"],
  },
  SECURITY_NEW_LOGIN: {
    ar: ["تسجيل دخول من جهاز جديد", "تم تسجيل الدخول من {device}. إذا لم تكن أنت، غيّر كلمة المرور فورًا."],
    he: ["התחברות ממכשיר חדש", "זוהתה התחברות מ-{device}. אם זה לא את/ה, החליפו סיסמה מיד."],
    en: ["New device sign-in", "A sign-in from {device} was detected. If this wasn't you, change your password now."],
  },
  SECURITY_PASSWORD_CHANGED: {
    ar: ["تم تغيير كلمة المرور", "تم تغيير كلمة مرور حسابك. إذا لم تكن أنت، تواصل مع الدعم فورًا."],
    he: ["הסיסמה שונתה", "סיסמת החשבון שונתה. אם זה לא את/ה, פנו לתמיכה מיד."],
    en: ["Password changed", "Your password was changed. If this wasn't you, contact support immediately."],
  },
  SECURITY_MFA_CHANGED: {
    ar: ["تغيير في التحقق الثنائي", "تم تحديث إعدادات التحقق الثنائي ({state})."],
    he: ["שינוי באימות דו-שלבי", "הגדרות האימות הדו-שלבי עודכנו ({state})."],
    en: ["Two-factor settings changed", "Your two-factor authentication was updated ({state})."],
  },
  SECURITY_SESSION_REVOKED: {
    ar: ["تم إنهاء جلساتك", "رصدنا استخدامًا مشبوهًا لجلسة دخول وأنهينا الجلسات احتياطيًا. سجّل الدخول مجددًا."],
    he: ["החיבורים שלך נותקו", "זוהה שימוש חשוד בחיבור ונותקו החיבורים לביטחון. יש להתחבר מחדש."],
    en: ["Your sessions were signed out", "We detected suspicious session use and signed you out as a precaution. Please sign in again."],
  },
  WITHDRAWAL_UPDATE: {
    ar: ["تحديث على السحب", "حالة طلب السحب: {status}."],
    he: ["עדכון משיכה", "סטטוס בקשת המשיכה: {status}."],
    en: ["Withdrawal update", "Your withdrawal status: {status}."],
  },
  ANNOUNCEMENT: {
    ar: ["{title}", "{body}"],
    he: ["{title}", "{body}"],
    en: ["{title}", "{body}"],
  },
};

export function renderNotification(type: NotificationType, locale: string, params: Params): { title: string; body: string } {
  const [title, body] = N[type][loc(locale)];
  return { title: fill(title, params), body: fill(body, params) };
}

/** Types important enough to also go by SMS (if the user has a verified phone and SMS enabled). */
export const SMS_WORTHY: ReadonlySet<NotificationType> = new Set([
  "TRADE_MARKED_PAID",
  "TRADE_DISPUTED",
  "SECURITY_NEW_LOGIN",
  "SECURITY_PASSWORD_CHANGED",
  "SECURITY_SESSION_REVOKED",
]);

/** Security notifications are always emailed regardless of preference. */
export const ALWAYS_EMAIL: ReadonlySet<NotificationType> = new Set([
  "SECURITY_NEW_LOGIN",
  "SECURITY_PASSWORD_CHANGED",
  "SECURITY_MFA_CHANGED",
  "SECURITY_SESSION_REVOKED",
]);
