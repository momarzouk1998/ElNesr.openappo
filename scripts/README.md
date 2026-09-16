# 🔧 Scripts Directory — أدوات إدارة النظام

## 📁 الملفات الموجودة

### `reset-database.ps1` ⭐
**السكريبت الرئيسي لمسح قاعدة البيانات**

```powershell
.\reset-database.ps1
```

**الميزات:**
- ✅ نسخة احتياطية تلقائية
- ✅ تأكيدات أمان متعددة
- ✅ تحقق من النتائج تلقائياً
- ✅ لا يحتاج معاملات إضافية

---

### `test-ssh-connection.ps1`
**اختبار الاتصال بالـ Droplet**

```powershell
.\test-ssh-connection.ps1
```

**يفحص:**
- SSH connectivity
- Docker container
- Database connection
- Row counts

---

## 🚀 طريقة التشغيل السريعة

### 1. فتح PowerShell (Admin)
```powershell
Win + X → Windows PowerShell (Admin)
```

### 2. الانتقال للمشروع
```powershell
cd "D:\OPEN APPS\DigitalOcian Projects\ElNesr"
```

### 3. السماح بتنفيذ السكريبتات
```powershell
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
```

### 4. تشغيل السكريبت
```powershell
# اختبار الاتصال أولاً
.\scripts\test-ssh-connection.ps1

# ثم تنفيذ المسح
.\scripts\reset-database.ps1
```

---

## 📊 معلومات الاتصال

```
SSH Host:     64.226.118.40
SSH User:     root
Database:     elnesr_db
Container:    mazaya-postgres
```

---

## 💾 موقع النسخ الاحتياطية

```
C:\Users\[YOUR_USERNAME]\Desktop\elnesr-backups\
```

**الاسم تلقائياً:**
```
elnesr_backup_YYYYMMDD_HHMMSS.dump
```

---

## ⚠️ قبل التشغيل

✅ **يجب أن يكون لديك:**
- [ ] OpenSSH client مثبت
- [ ] اتصال إنترنت
- [ ] صلاحية SSH للسيرفر
- [ ] PowerShell 5.0+

**تحقق من OpenSSH:**
```powershell
ssh -V
```

---

## 📋 ما سيُمسح

- ❌ جميع الفواتير
- ❌ جميع العملاء والموردين
- ❌ جميع المدفوعات والمصروفات
- ❌ جميع بيانات المخزون

**سيبقى:**
- ✅ المستخدمين (6)
- ✅ خزنة رئيسية واحدة
- ✅ مخزن افتراضي

---

## 🆘 استكشاف الأخطاء

### ssh: command not found
```powershell
# الحل: ثبّت OpenSSH من Settings
Settings → Apps → Optional features → Add OpenSSH Client
```

### permission denied
```powershell
# تحقق من المفتاح
ls $env:USERPROFILE\.ssh\id_ed25519
```

### docker exec: command not found
```powershell
# تأكد من أن السيرفر يعمل
ssh root@64.226.118.40 "docker ps"
```

---

## 📞 الملفات المرتبطة

- `MD/POWERSHELL_QUICK_START.md` — شروحات سريعة
- `MD/RESET_DATABASE_POWERSHELL.md` — توثيق شامل
- `prisma/reset-data.sql` — السكريبت SQL
- `MD/DATABASE_QUICK_ACCESS.md` — معلومات الاتصال

---

*آخر تحديث: 18 يوليو 2026*
