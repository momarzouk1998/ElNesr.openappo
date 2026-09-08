# ============================================================
# 🔌 Test SSH Connection — PowerShell
# اختبار الاتصال بالـ Droplet
# ============================================================

$SSH_HOST = "64.226.118.40"
$SSH_USER = "root"

Write-Host "🔍 اختبار الاتصال بالـ Droplet..." -ForegroundColor Cyan
Write-Host ""

# 1. اختبار SSH
Write-Host "1️⃣  اختبار SSH..." -ForegroundColor Yellow
try {
    $result = ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no "$SSH_USER@$SSH_HOST" "echo OK" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✓ SSH متصل بنجاح" -ForegroundColor Green
    } else {
        Write-Host "   ✗ فشل الاتصال: $result" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "   ✗ خطأ: $_" -ForegroundColor Red
    exit 1
}

# 2. معلومات السيرفر
Write-Host ""
Write-Host "2️⃣  معلومات السيرفر..." -ForegroundColor Yellow
ssh -o StrictHostKeyChecking=no "$SSH_USER@$SSH_HOST" "uname -a" | ForEach-Object { Write-Host "   $_" }

# 3. التحقق من Docker
Write-Host ""
Write-Host "3️⃣  التحقق من Docker..." -ForegroundColor Yellow
$dockerStatus = ssh -o StrictHostKeyChecking=no "$SSH_USER@$SSH_HOST" "docker ps --filter 'name=mazaya-postgres' --format '{{.Names}}'" 2>&1
if ($dockerStatus -match "mazaya-postgres") {
    Write-Host "   ✓ Container PostgreSQL موجود" -ForegroundColor Green
} else {
    Write-Host "   ✗ Container PostgreSQL غير موجود" -ForegroundColor Red
    exit 1
}

# 4. اختبار قاعدة البيانات
Write-Host ""
Write-Host "4️⃣  اختبار قاعدة البيانات..." -ForegroundColor Yellow
$dbTest = ssh -o StrictHostKeyChecking=no "$SSH_USER@$SSH_HOST" `
    "docker exec mazaya-postgres psql -U elnazlawy -d elnazlawy_db -c 'SELECT NOW();'" 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✓ قاعدة البيانات متصلة" -ForegroundColor Green
    Write-Host "   الوقت على السيرفر: $($dbTest | Select-Object -Last 1)" -ForegroundColor Gray
} else {
    Write-Host "   ✗ فشل الاتصال بقاعدة البيانات" -ForegroundColor Red
    exit 1
}

# 5. عد الصفوف
Write-Host ""
Write-Host "5️⃣  إحصائيات قاعدة البيانات الحالية..." -ForegroundColor Yellow
ssh -o StrictHostKeyChecking=no "$SSH_USER@$SSH_HOST" `
    "docker exec mazaya-postgres psql -U elnazlawy -d elnazlawy_db -c 'SELECT COUNT(*) FROM elnesr.customers;'" 2>&1 | `
    ForEach-Object { Write-Host "   العملاء: $_" }

Write-Host ""
Write-Host "✅ جميع الاختبارات نجحت!" -ForegroundColor Green
Write-Host ""
