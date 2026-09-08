# ============================================================
# 🗑️ Reset Database Script — PowerShell
# تنفيذ reset-data.sql على الـ Droplet
# ============================================================

param(
    [string]$BackupDir = "$env:USERPROFILE\Desktop\elnazlawy-backups",
    [string]$ProjectRoot = "D:\OPEN APPS\DigitalOcian Projects\elnazlawy-system"
)

# ===== معلومات الاتصال =====
$SSH_HOST = "64.226.118.40"
$SSH_USER = "root"
$DB_USER = "elnazlawy"
$DB_NAME = "elnazlawy_db"
$CONTAINER_NAME = "mazaya-postgres"

# ===== المسارات =====
$SQL_FILE = "$ProjectRoot\prisma\reset-data.sql"
$TIMESTAMP = Get-Date -Format "yyyyMMdd_HHmmss"

# ===== الألوان =====
$OK = "Green"
$WARN = "Yellow"
$ERROR = "Red"
$INFO = "Cyan"

# ========================================================
# دالة مساعدة للطباعة
# ========================================================
function Log-Info($msg) { Write-Host "ℹ️  $msg" -ForegroundColor $INFO }
function Log-OK($msg) { Write-Host "✓ $msg" -ForegroundColor $OK }
function Log-Warn($msg) { Write-Host "⚠️  $msg" -ForegroundColor $WARN }
function Log-Error($msg) { Write-Host "✗ $msg" -ForegroundColor $ERROR }

# ========================================================
# 1️⃣ التحقق من المتطلبات
# ========================================================
Log-Info "التحقق من المتطلبات..."

# تحقق من وجود SSH
try {
    $sshVersion = ssh -V 2>&1 | Out-String
    Log-OK "OpenSSH مثبت: $sshVersion"
} catch {
    Log-Error "OpenSSH غير مثبت. استخدم: Settings → Apps → Optional features → OpenSSH Client"
    exit 1
}

# تحقق من وجود reset-data.sql
if (-not (Test-Path $SQL_FILE)) {
    Log-Error "ملف reset-data.sql غير موجود في: $SQL_FILE"
    exit 1
}
Log-OK "ملف reset-data.sql موجود"

# ========================================================
# 2️⃣ إنشاء مجلد النسخ الاحتياطية
# ========================================================
Log-Info "إنشاء مجلد النسخ الاحتياطية..."
if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}
Log-OK "مجلد النسخ الاحتياطية: $BackupDir"

# ========================================================
# 3️⃣ عمل نسخة احتياطية
# ========================================================
Log-Warn "جاري عمل نسخة احتياطية من قاعدة البيانات..."

$BACKUP_FILE = "$BackupDir\elnazlawy_backup_$TIMESTAMP.dump"

# أمر عمل النسخة الاحتياطية على السيرفر
$backupCmd = "docker exec $CONTAINER_NAME pg_dump -U $DB_USER -d $DB_NAME -F c -f /tmp/backup_$TIMESTAMP.dump"

ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 "$SSH_USER@$SSH_HOST" $backupCmd | Out-Null

if ($LASTEXITCODE -eq 0) {
    # تحميل النسخة الاحتياطية
    Write-Host "   جاري تحميل النسخة الاحتياطية..." -ForegroundColor Gray
    
    & scp -o StrictHostKeyChecking=no `
        "$SSH_USER@$SSH_HOST`:/tmp/backup_$TIMESTAMP.dump" `
        "$BACKUP_FILE" 2>&1 | Out-Null
    
    if (Test-Path $BACKUP_FILE) {
        $BackupSize = (Get-Item $BACKUP_FILE).Length / 1MB
        Log-OK "نسخة احتياطية: $BACKUP_FILE"
        Log-OK "الحجم: $([Math]::Round($BackupSize, 2)) MB"
    } else {
        Log-Error "فشل في تحميل النسخة الاحتياطية"
        exit 1
    }
} else {
    Log-Error "فشل في عمل نسخة احتياطية على السيرفر"
    exit 1
}

# ========================================================
# 4️⃣ رفع ملف reset-data.sql
# ========================================================
Log-Warn "رفع ملف reset-data.sql للـ droplet..."

& scp -o StrictHostKeyChecking=no `
    "$SQL_FILE" `
    "$SSH_USER@$SSH_HOST`:/tmp/reset-data.sql" 2>&1 | Out-Null

if ($LASTEXITCODE -eq 0) {
    Log-OK "تم رفع الملف بنجاح"
} else {
    Log-Error "فشل في رفع الملف"
    exit 1
}

# ========================================================
# 5️⃣ تحذير نهائي وتأكيد
# ========================================================
Write-Host ""
Write-Host "════════════════════════════════════════════════" -ForegroundColor $ERROR
Write-Host "⚠️  تحذير حرج - هذا الأمر سيمسح كل البيانات!" -ForegroundColor $ERROR
Write-Host "════════════════════════════════════════════════" -ForegroundColor $ERROR
Write-Host ""
Write-Host "سيتم مسح:" -ForegroundColor $ERROR
Write-Host "  • جميع الفواتير (مبيعات + مشتريات)" -ForegroundColor $ERROR
Write-Host "  • جميع العملاء والموردين" -ForegroundColor $ERROR
Write-Host "  • جميع المدفوعات والمصروفات" -ForegroundColor $ERROR
Write-Host "  • جميع بيانات المخزون" -ForegroundColor $ERROR
Write-Host ""
Write-Host "سيبقى:" -ForegroundColor $OK
Write-Host "  ✓ المستخدمين" -ForegroundColor $OK
Write-Host "  ✓ خزنة رئيسية واحدة" -ForegroundColor $OK
Write-Host "  ✓ مخزن افتراضي" -ForegroundColor $OK
Write-Host ""
Write-Host "النسخة الاحتياطية محفوظة في:" -ForegroundColor $WARN
Write-Host "  $BACKUP_FILE" -ForegroundColor $WARN
Write-Host ""
Write-Host "════════════════════════════════════════════════" -ForegroundColor $ERROR

# تأكيد أول
Write-Host ""
$Confirm1 = Read-Host "هل أنت متأكد 100%؟ اكتب 'YES' للمتابعة"
if ($Confirm1 -ne "YES") {
    Log-OK "تم إلغاء العملية"
    exit 0
}

# تأكيد ثاني
Write-Host ""
Write-Host "⚠️  هذا لا يمكن التراجع عنه!" -ForegroundColor $ERROR
$Confirm2 = Read-Host "اكتب 'RESET_NOW' لتأكيد نهائي"
if ($Confirm2 -ne "RESET_NOW") {
    Log-OK "تم إلغاء العملية"
    exit 0
}

# ========================================================
# 6️⃣ تنفيذ reset-data.sql
# ========================================================
Write-Host ""
Log-Warn "🔄 جاري تنفيذ المسح على قاعدة البيانات..."

$resetCmd = "docker exec $CONTAINER_NAME psql -U $DB_USER -d $DB_NAME < /tmp/reset-data.sql"

$resetOutput = ssh -o StrictHostKeyChecking=no "$SSH_USER@$SSH_HOST" $resetCmd 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Log-OK "تم تنفيذ reset-data.sql بنجاح!"
    Write-Host "   الطابع الزمني: $TIMESTAMP" -ForegroundColor $INFO
} else {
    Write-Host ""
    Log-Error "فشل تنفيذ السكريبت"
    Write-Host "الخطأ:" -ForegroundColor $ERROR
    Write-Host $resetOutput -ForegroundColor $ERROR
    exit 1
}

# ========================================================
# 7️⃣ التحقق من النتائج
# ========================================================
Write-Host ""
Log-Info "التحقق من نتائج المسح..."

$verifyCmd = @"
docker exec $CONTAINER_NAME psql -U $DB_USER -d $DB_NAME -t -c "
SELECT 
  'Users' as t, COUNT(*)::text FROM elnesr.users
UNION ALL SELECT 'Customers', COUNT(*)::text FROM elnesr.customers
UNION ALL SELECT 'Suppliers', COUNT(*)::text FROM elnesr.suppliers
UNION ALL SELECT 'Products', COUNT(*)::text FROM elnesr.products
UNION ALL SELECT 'Sales Invoices', COUNT(*)::text FROM elnesr.sales_invoices
UNION ALL SELECT 'Purchase Invoices', COUNT(*)::text FROM elnesr.purchase_invoices
UNION ALL SELECT 'Expenses', COUNT(*)::text FROM elnazlawy.expenses
UNION ALL SELECT 'Treasuries', COUNT(*)::text FROM elnazlawy.treasuries
UNION ALL SELECT 'Stores', COUNT(*)::text FROM elnesr.stores
ORDER BY 1;
"@

Write-Host ""
ssh -o StrictHostKeyChecking=no "$SSH_USER@$SSH_HOST" $verifyCmd 2>&1 | ForEach-Object {
    Write-Host "   $_" -ForegroundColor $INFO
}

# ========================================================
# ✅ النتيجة النهائية
# ========================================================
Write-Host ""
Write-Host "════════════════════════════════════════════════" -ForegroundColor $OK
Write-Host "✓ اكتمل المسح بنجاح!" -ForegroundColor $OK
Write-Host "════════════════════════════════════════════════" -ForegroundColor $OK
Write-Host ""
Log-OK "قاعدة البيانات تم تنظيفها"
Log-OK "النسخة الاحتياطية: $BACKUP_FILE"
Log-OK "البيانات الجديدة جاهزة للاستخدام"
Write-Host ""
