"use client";

import { useState, useEffect, useMemo } from "react";
import { 
  Users, Plus, Search, DollarSign, Wallet, FileText, 
  Calendar, CheckCircle, Clock, AlertCircle, Edit2, Trash2, 
  Printer, ArrowUpRight, Phone, Briefcase, RefreshCw, X, Share2, Check
} from "lucide-react";
import { formatEGP, formatDate } from "@/lib/format";

interface Employee {
  id: string;
  name: string;
  phone: string | null;
  job_title: string | null;
  basic_salary: number;
  hire_date: string | null;
  is_active: boolean;
  notes: string | null;
  pending_advances_total: number;
  pending_advances_count: number;
}

interface Advance {
  id: string;
  employee_id: string;
  amount: number;
  advance_date: string;
  treasury_id: string | null;
  notes: string | null;
  is_deducted: boolean;
  salary_payment_id: string | null;
  employee?: { id: string; name: string; phone: string | null; job_title: string | null };
  treasury?: { id: string; name: string; type: string } | null;
}

interface SalaryPayment {
  id: string;
  employee_id: string;
  month: number;
  year: number;
  basic_salary: number;
  total_advances: number;
  bonuses: number;
  deductions: number;
  net_paid: number;
  payment_date: string;
  treasury_id: string | null;
  notes: string | null;
  employee?: { id: string; name: string; phone: string | null; job_title: string | null };
  treasury?: { id: string; name: string } | null;
}

interface Treasury {
  id: string;
  name: string;
  type: string;
  current_balance: number;
}

export default function EmployeesPage() {
  const [activeTab, setActiveTab] = useState<"employees" | "advances" | "salaries">("employees");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [salaries, setSalaries] = useState<SalaryPayment[]>([]);
  const [treasuries, setTreasuries] = useState<Treasury[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Modals
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [empForm, setEmpForm] = useState({
    name: "",
    phone: "",
    job_title: "",
    basic_salary: "",
    hire_date: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [advForm, setAdvForm] = useState({
    employee_id: "",
    amount: "",
    advance_date: new Date().toISOString().slice(0, 10),
    treasury_id: "",
    notes: "",
  });

  const [showSalaryModal, setShowSalaryModal] = useState(false);
  const [salForm, setSalForm] = useState({
    employee_id: "",
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    basic_salary: 0,
    pending_advances: 0,
    bonuses: "",
    deductions: "",
    treasury_id: "",
    payment_date: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  // Receipt Modal
  const [receiptData, setReceiptData] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const fetchData = async () => {
    setLoading(true);
    try {
      const [empRes, advRes, salRes, trRes] = await Promise.all([
        fetch("/api/employees"),
        fetch("/api/employees/advances"),
        fetch("/api/employees/salaries"),
        fetch("/api/treasury"),
      ]);

      const [empData, advData, salData, trData] = await Promise.all([
        empRes.json(),
        advRes.json(),
        salRes.json(),
        trRes.json(),
      ]);

      if (empData.ok) setEmployees(empData.data);
      if (advData.ok) setAdvances(advData.data);
      if (salData.ok) setSalaries(salData.data);
      if (trData.ok) setTreasuries(trData.data);
    } catch (err) {
      console.error("Error loading employees data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Stats
  const activeCount = employees.filter((e) => e.is_active).length;
  const totalSalaries = employees.filter((e) => e.is_active).reduce((sum, e) => sum + e.basic_salary, 0);
  const totalPendingAdvances = employees.reduce((sum, e) => sum + e.pending_advances_total, 0);
  const totalPaidThisMonth = salaries
    .filter((s) => s.month === new Date().getMonth() + 1 && s.year === new Date().getFullYear())
    .reduce((sum, s) => sum + s.net_paid, 0);

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    if (!search.trim()) return employees;
    const q = search.toLowerCase().trim();
    return employees.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        (e.phone && e.phone.includes(q)) ||
        (e.job_title && e.job_title.toLowerCase().includes(q))
    );
  }, [employees, search]);

  // Handle Employee Form Submit
  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empForm.name.trim()) return;
    setSubmitting(true);
    setErrorMsg("");

    try {
      const url = editingEmp ? `/api/employees/${editingEmp.id}` : "/api/employees";
      const method = editingEmp ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...empForm,
          basic_salary: Number(empForm.basic_salary) || 0,
        }),
      });

      const data = await res.json();
      if (!data.ok) {
        setErrorMsg(data.error || "فشل حفظ بيانات الموظف");
        return;
      }

      setShowEmpModal(false);
      setEditingEmp(null);
      setEmpForm({
        name: "",
        phone: "",
        job_title: "",
        basic_salary: "",
        hire_date: new Date().toISOString().slice(0, 10),
        notes: "",
      });
      fetchData();
    } catch (err: any) {
      setErrorMsg(err.message || "حدث خطأ غير متوقع");
    } finally {
      setSubmitting(false);
    }
  };

  // Open Edit Employee
  const handleEditEmp = (emp: Employee) => {
    setEditingEmp(emp);
    setEmpForm({
      name: emp.name,
      phone: emp.phone || "",
      job_title: emp.job_title || "",
      basic_salary: String(emp.basic_salary || ""),
      hire_date: emp.hire_date ? emp.hire_date.slice(0, 10) : "",
      notes: emp.notes || "",
    });
    setErrorMsg("");
    setShowEmpModal(true);
  };

  // Quick Advance button on employee card
  const handleQuickAdvance = (emp: Employee) => {
    setAdvForm({
      employee_id: emp.id,
      amount: "",
      advance_date: new Date().toISOString().slice(0, 10),
      treasury_id: treasuries.length > 0 ? treasuries[0].id : "",
      notes: "",
    });
    setErrorMsg("");
    setShowAdvanceModal(true);
  };

  // Save Advance
  const handleSaveAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!advForm.employee_id || !advForm.amount) return;
    setSubmitting(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/employees/advances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(advForm),
      });

      const data = await res.json();
      if (!data.ok) {
        setErrorMsg(data.error || "فشل تسجيل السلفة");
        return;
      }

      setShowAdvanceModal(false);
      fetchData();
    } catch (err: any) {
      setErrorMsg(err.message || "حدث خطأ غير متوقع");
    } finally {
      setSubmitting(false);
    }
  };

  // Quick Salary Payment button on employee card
  const handleQuickSalary = (emp: Employee) => {
    setSalForm({
      employee_id: emp.id,
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
      basic_salary: emp.basic_salary,
      pending_advances: emp.pending_advances_total,
      bonuses: "",
      deductions: "",
      treasury_id: treasuries.length > 0 ? treasuries[0].id : "",
      payment_date: new Date().toISOString().slice(0, 10),
      notes: "",
    });
    setErrorMsg("");
    setShowSalaryModal(true);
  };

  // Update salary modal on employee select
  const handleSalaryEmpChange = (empId: string) => {
    const emp = employees.find((e) => e.id === empId);
    if (emp) {
      setSalForm((prev) => ({
        ...prev,
        employee_id: empId,
        basic_salary: emp.basic_salary,
        pending_advances: emp.pending_advances_total,
      }));
    }
  };

  // Calculate net salary in real-time
  const netSalaryPreview = useMemo(() => {
    const b = Number(salForm.basic_salary) || 0;
    const bon = Number(salForm.bonuses) || 0;
    const adv = Number(salForm.pending_advances) || 0;
    const ded = Number(salForm.deductions) || 0;
    return b + bon - adv - ded;
  }, [salForm]);

  // Save Salary Payment
  const handleSaveSalary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!salForm.employee_id || !salForm.treasury_id) return;
    setSubmitting(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/employees/salaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(salForm),
      });

      const data = await res.json();
      if (!data.ok) {
        setErrorMsg(data.error || "فشل صرف الراتب");
        return;
      }

      setShowSalaryModal(false);
      setReceiptData(data.data);
      fetchData();
    } catch (err: any) {
      setErrorMsg(err.message || "حدث خطأ غير متوقع");
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Advance
  const handleDeleteAdvance = async (id: string) => {
    if (!confirm("هل أنت متأكد من رغبتك في إلغاء هذه السلفة؟ سيتم إرجاع المبلغ للخزينة وإلغاء المصروف.")) return;
    try {
      const res = await fetch(`/api/employees/advances?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.ok) {
        alert(data.error || "فشل حذف السلفة");
        return;
      }
      fetchData();
    } catch (err: any) {
      alert("حدث خطأ أثناء الحذف");
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 flex items-center gap-3">
            <span className="p-2.5 rounded-2xl bg-brand-primary/10 text-brand-primary">👷</span>
            شؤون الموظفين والرواتب والسلف
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            إدارة بيانات العاملين، تسجيل السلف اليومية، وصرف الرواتب الشهرية مع الربط المباشر بالخزينة والمصروفات
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setEditingEmp(null);
              setEmpForm({
                name: "",
                phone: "",
                job_title: "",
                basic_salary: "",
                hire_date: new Date().toISOString().slice(0, 10),
                notes: "",
              });
              setErrorMsg("");
              setShowEmpModal(true);
            }}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-primary text-white font-bold hover:bg-brand-primary-hover shadow-sm shadow-brand-primary/30 transition-all text-sm"
          >
            <Plus className="w-4 h-4" />
            إضافة موظف
          </button>
          <button
            onClick={() => {
              setAdvForm({
                employee_id: employees.length > 0 ? employees[0].id : "",
                amount: "",
                advance_date: new Date().toISOString().slice(0, 10),
                treasury_id: treasuries.length > 0 ? treasuries[0].id : "",
                notes: "",
              });
              setErrorMsg("");
              setShowAdvanceModal(true);
            }}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 text-white font-bold hover:bg-amber-600 shadow-sm shadow-amber-500/30 transition-all text-sm"
          >
            <Wallet className="w-4 h-4" />
            تسجيل سلفة
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">الموظفين النشطين</span>
            <span className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <Users className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-slate-800 mt-2">{activeCount}</div>
          <p className="text-[11px] text-slate-400 mt-0.5">موظف على قوة العمل</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">إجمالي الرواتب الأساسية</span>
            <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <DollarSign className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-slate-800 mt-2">{formatEGP(totalSalaries)}</div>
          <p className="text-[11px] text-slate-400 mt-0.5">شهرياً للموظفين النشطين</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">السلف المعلقة الحالية</span>
            <span className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-amber-600 mt-2">{formatEGP(totalPendingAdvances)}</div>
          <p className="text-[11px] text-slate-400 mt-0.5">تُخصم تلقائياً عند القبض</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">الرواتب المنصرفة هذا الشهر</span>
            <span className="p-2 rounded-xl bg-purple-50 text-purple-600">
              <CheckCircle className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-slate-800 mt-2">{formatEGP(totalPaidThisMonth)}</div>
          <p className="text-[11px] text-slate-400 mt-0.5">شهر {new Date().getMonth() + 1} / {new Date().getFullYear()}</p>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-100 rounded-2xl w-full sm:w-fit overflow-x-auto">
        <button
          onClick={() => setActiveTab("employees")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shrink-0 ${
            activeTab === "employees"
              ? "bg-white text-brand-primary shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Users className="w-4 h-4" />
          دليل الموظفين ({employees.length})
        </button>
        <button
          onClick={() => setActiveTab("advances")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shrink-0 ${
            activeTab === "advances"
              ? "bg-white text-brand-primary shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Wallet className="w-4 h-4" />
          سجل السلف ({advances.length})
        </button>
        <button
          onClick={() => setActiveTab("salaries")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shrink-0 ${
            activeTab === "salaries"
              ? "bg-white text-brand-primary shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <FileText className="w-4 h-4" />
          صرف الرواتب والقبض ({salaries.length})
        </button>
      </div>

      {/* TAB 1: Employees List */}
      {activeTab === "employees" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
            <Search className="w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="البحث باسم الموظف، الوظيفة، أو رقم الهاتف..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent border-none outline-none text-sm font-medium text-slate-800 placeholder-slate-400"
            />
          </div>

          {loading ? (
            <div className="p-12 text-center text-slate-400 font-bold">جاري تحميل بيانات الموظفين...</div>
          ) : filteredEmployees.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-100 text-slate-400">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-bold text-slate-700">لا يوجد موظفين مسجلين حالياً</p>
              <p className="text-xs mt-1">اضغط على زر "إضافة موظف" للبدء</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredEmployees.map((emp) => (
                <div
                  key={emp.id}
                  className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-brand-primary/10 text-brand-primary font-black text-lg flex items-center justify-center">
                          {emp.name.charAt(0)}
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900 text-base">{emp.name}</h3>
                          <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                            <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                            {emp.job_title || "فني لوحات / موظف"}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          emp.is_active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {emp.is_active ? "نشط" : "متوقف"}
                      </span>
                    </div>

                    {emp.phone && (
                      <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-600 bg-slate-50 p-2 rounded-xl">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span dir="ltr">{emp.phone}</span>
                      </div>
                    )}

                    <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[10px]">الراتب الأساسي</span>
                        <span className="font-extrabold text-slate-800 text-sm">{formatEGP(emp.basic_salary)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">سلف معلقة</span>
                        <span
                          className={`font-extrabold text-sm ${
                            emp.pending_advances_total > 0 ? "text-amber-600" : "text-slate-400"
                          }`}
                        >
                          {formatEGP(emp.pending_advances_total)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-slate-100 flex items-center gap-2">
                    <button
                      onClick={() => handleQuickAdvance(emp)}
                      className="flex-1 py-2 px-3 rounded-xl bg-amber-50 text-amber-700 text-xs font-bold hover:bg-amber-100 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Wallet className="w-3.5 h-3.5" />
                      سلفة
                    </button>
                    <button
                      onClick={() => handleQuickSalary(emp)}
                      className="flex-1 py-2 px-3 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <DollarSign className="w-3.5 h-3.5" />
                      قبض راتب
                    </button>
                    <button
                      onClick={() => handleEditEmp(emp)}
                      className="p-2 rounded-xl bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors"
                      title="تعديل"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Advances History */}
      {activeTab === "advances" && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <Wallet className="w-5 h-5 text-amber-500" />
              سجل سلف الموظفين
            </h2>
            <button
              onClick={() => {
                setAdvForm({
                  employee_id: employees.length > 0 ? employees[0].id : "",
                  amount: "",
                  advance_date: new Date().toISOString().slice(0, 10),
                  treasury_id: treasuries.length > 0 ? treasuries[0].id : "",
                  notes: "",
                });
                setErrorMsg("");
                setShowAdvanceModal(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 text-white font-bold text-xs hover:bg-amber-600 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              سلفة جديدة
            </button>
          </div>

          {advances.length === 0 ? (
            <div className="p-12 text-center text-slate-400 font-bold">لا توجد سلف مسجلة حالياً</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                  <tr>
                    <th className="p-3.5">الموظف</th>
                    <th className="p-3.5">المبلغ</th>
                    <th className="p-3.5">التاريخ</th>
                    <th className="p-3.5">الخزينة المنصرف منها</th>
                    <th className="p-3.5">الحالة</th>
                    <th className="p-3.5">ملاحظات</th>
                    <th className="p-3.5 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {advances.map((adv) => (
                    <tr key={adv.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="p-3.5 font-bold text-slate-900">{adv.employee?.name || "—"}</td>
                      <td className="p-3.5 font-black text-amber-600 text-sm">{formatEGP(adv.amount)}</td>
                      <td className="p-3.5">{formatDate(adv.advance_date)}</td>
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                          {adv.treasury?.name || "خزينة نقدية"}
                        </span>
                      </td>
                      <td className="p-3.5">
                        {adv.is_deducted ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold">
                            تم خصمها بالراتب ✓
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[11px] font-bold">
                            معلقة (قيد الخصم)
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-slate-500 max-w-xs truncate">{adv.notes || "—"}</td>
                      <td className="p-3.5 text-center">
                        {!adv.is_deducted && (
                          <button
                            onClick={() => handleDeleteAdvance(adv.id)}
                            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors"
                            title="إلغاء واسترداد السلفة"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Salaries & Payroll History */}
      {activeTab === "salaries" && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-500" />
              سجل رواتب الموظفين والقبض
            </h2>
            <button
              onClick={() => {
                setSalForm({
                  employee_id: employees.length > 0 ? employees[0].id : "",
                  month: new Date().getMonth() + 1,
                  year: new Date().getFullYear(),
                  basic_salary: employees.length > 0 ? employees[0].basic_salary : 0,
                  pending_advances: employees.length > 0 ? employees[0].pending_advances_total : 0,
                  bonuses: "",
                  deductions: "",
                  treasury_id: treasuries.length > 0 ? treasuries[0].id : "",
                  payment_date: new Date().toISOString().slice(0, 10),
                  notes: "",
                });
                setErrorMsg("");
                setShowSalaryModal(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              صرف راتب جديد
            </button>
          </div>

          {salaries.length === 0 ? (
            <div className="p-12 text-center text-slate-400 font-bold">لا توجد عمليات صرف رواتب مسجلة حتى الآن</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                  <tr>
                    <th className="p-3.5">الموظف</th>
                    <th className="p-3.5">عن شهر</th>
                    <th className="p-3.5">الأساسي</th>
                    <th className="p-3.5">السلف المخصومة</th>
                    <th className="p-3.5">المكافآت</th>
                    <th className="p-3.5">الخصومات</th>
                    <th className="p-3.5">الصافي المنصرف</th>
                    <th className="p-3.5">تاريخ الصرف</th>
                    <th className="p-3.5">الخزينة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {salaries.map((sal) => (
                    <tr key={sal.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="p-3.5 font-bold text-slate-900">{sal.employee?.name || "—"}</td>
                      <td className="p-3.5 font-bold text-brand-primary">
                        شهر {sal.month} / {sal.year}
                      </td>
                      <td className="p-3.5">{formatEGP(sal.basic_salary)}</td>
                      <td className="p-3.5 text-amber-600">
                        {sal.total_advances > 0 ? `-${formatEGP(sal.total_advances)}` : "0"}
                      </td>
                      <td className="p-3.5 text-emerald-600">
                        {sal.bonuses > 0 ? `+${formatEGP(sal.bonuses)}` : "0"}
                      </td>
                      <td className="p-3.5 text-rose-600">
                        {sal.deductions > 0 ? `-${formatEGP(sal.deductions)}` : "0"}
                      </td>
                      <td className="p-3.5 font-black text-emerald-600 text-sm">{formatEGP(sal.net_paid)}</td>
                      <td className="p-3.5">{formatDate(sal.payment_date)}</td>
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                          {sal.treasury?.name || "الخزينة"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: Add / Edit Employee */}
      {showEmpModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 animate-fade-in">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="font-black text-lg text-slate-900">
                {editingEmp ? "تعديل بيانات موظف" : "إضافة موظف جديد"}
              </h3>
              <button
                onClick={() => setShowEmpModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-bold">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSaveEmployee} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم الموظف *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: أحمد محمود الغواص"
                  value={empForm.name}
                  onChange={(e) => setEmpForm({ ...empForm, name: e.target.value })}
                  className="w-full h-11 px-3.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-primary outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">المسمى الوظيفي</label>
                  <input
                    type="text"
                    placeholder="مثال: فني لوحات"
                    value={empForm.job_title}
                    onChange={(e) => setEmpForm({ ...empForm, job_title: e.target.value })}
                    className="w-full h-11 px-3.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف</label>
                  <input
                    type="text"
                    placeholder="010xxxxxxxx"
                    value={empForm.phone}
                    onChange={(e) => setEmpForm({ ...empForm, phone: e.target.value })}
                    className="w-full h-11 px-3.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-primary outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الراتب الأساسي</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0"
                    value={empForm.basic_salary}
                    onChange={(e) => setEmpForm({ ...empForm, basic_salary: e.target.value })}
                    className="w-full h-11 px-3.5 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-brand-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ التعيين</label>
                  <input
                    type="date"
                    value={empForm.hire_date}
                    onChange={(e) => setEmpForm({ ...empForm, hire_date: e.target.value })}
                    className="w-full h-11 px-3.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-primary outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات</label>
                <textarea
                  rows={2}
                  placeholder="أي تفاصيل أو ملاحظات إضافية..."
                  value={empForm.notes}
                  onChange={(e) => setEmpForm({ ...empForm, notes: e.target.value })}
                  className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-primary outline-none resize-none"
                />
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 h-11 rounded-xl bg-brand-primary text-white font-bold hover:bg-brand-primary-hover transition-colors disabled:opacity-50"
                >
                  {submitting ? "جاري الحفظ..." : "حفظ الموظف"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowEmpModal(false)}
                  className="px-5 h-11 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Record Advance (تسجيل سلفة) */}
      {showAdvanceModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 animate-fade-in">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="font-black text-lg text-slate-900 flex items-center gap-2">
                <Wallet className="w-5 h-5 text-amber-500" />
                تسجيل سلفة موظف
              </h3>
              <button
                onClick={() => setShowAdvanceModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-bold">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSaveAdvance} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الموظف المستلف *</label>
                <select
                  required
                  value={advForm.employee_id}
                  onChange={(e) => setAdvForm({ ...advForm, employee_id: e.target.value })}
                  className="w-full h-11 px-3 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-brand-primary outline-none"
                >
                  <option value="">اختر الموظف...</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} (الراتب: {formatEGP(emp.basic_salary)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">مبلغ السلفة *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="0"
                    value={advForm.amount}
                    onChange={(e) => setAdvForm({ ...advForm, amount: e.target.value })}
                    className="w-full h-11 px-3.5 border border-slate-200 rounded-xl text-base font-black text-amber-600 focus:ring-2 focus:ring-brand-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ السلفة</label>
                  <input
                    type="date"
                    required
                    value={advForm.advance_date}
                    onChange={(e) => setAdvForm({ ...advForm, advance_date: e.target.value })}
                    className="w-full h-11 px-3.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-primary outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الخزينة المنصرف منها السلفة *</label>
                <select
                  required
                  value={advForm.treasury_id}
                  onChange={(e) => setAdvForm({ ...advForm, treasury_id: e.target.value })}
                  className="w-full h-11 px-3 border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-brand-primary outline-none"
                >
                  <option value="">اختر الخزينة...</option>
                  {treasuries.map((tr) => (
                    <option key={tr.id} value={tr.id}>
                      {tr.name} (الرصيد الحالي: {formatEGP(tr.current_balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">سبب السلفة / ملاحظات</label>
                <input
                  type="text"
                  placeholder="سلفة تحت حساب الراتب..."
                  value={advForm.notes}
                  onChange={(e) => setAdvForm({ ...advForm, notes: e.target.value })}
                  className="w-full h-11 px-3.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-primary outline-none"
                />
              </div>

              <div className="p-3 bg-amber-50 rounded-2xl border border-amber-100/60 text-amber-800 text-xs leading-relaxed">
                💡 <strong>ملاحظة مالية:</strong> سيتم خصم مبلغ السلفة مباشرة من الخزينة المختارة وتسجيل حركة مصروف تلقائياً، وتعلّم السلفة كـ "معلقة" ليتم خصمها تلقائياً عند قبض الراتب.
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 h-11 rounded-xl bg-amber-500 text-white font-bold hover:bg-amber-600 transition-colors disabled:opacity-50"
                >
                  {submitting ? "جاري التسجيل..." : "تسجيل وصرف السلفة"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdvanceModal(false)}
                  className="px-5 h-11 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Pay Salary (صرف الراتب والقبض) */}
      {showSalaryModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-100 animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="font-black text-lg text-slate-900 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-600" />
                صرف الراتب الشهري (القبض)
              </h3>
              <button
                onClick={() => setShowSalaryModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-bold">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSaveSalary} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الموظف *</label>
                <select
                  required
                  value={salForm.employee_id}
                  onChange={(e) => handleSalaryEmpChange(e.target.value)}
                  className="w-full h-11 px-3 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-brand-primary outline-none"
                >
                  <option value="">اختر الموظف...</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} (أساسي: {formatEGP(emp.basic_salary)} | سلف: {formatEGP(emp.pending_advances_total)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">عن شهر *</label>
                  <select
                    value={salForm.month}
                    onChange={(e) => setSalForm({ ...salForm, month: Number(e.target.value) })}
                    className="w-full h-11 px-3 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-brand-primary outline-none"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                      <option key={m} value={m}>
                        شهر {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">السنة *</label>
                  <input
                    type="number"
                    value={salForm.year}
                    onChange={(e) => setSalForm({ ...salForm, year: Number(e.target.value) })}
                    className="w-full h-11 px-3.5 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-brand-primary outline-none"
                  />
                </div>
              </div>

              {/* Salary Breakdown Box */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
                <div className="flex justify-between items-center text-xs font-bold">
                  <span className="text-slate-600">الراتب الأساسي:</span>
                  <span className="text-slate-900 font-extrabold text-sm">{formatEGP(salForm.basic_salary)}</span>
                </div>

                <div className="flex justify-between items-center text-xs font-bold">
                  <span className="text-amber-700">السلف المعلقة (تُخصم تلقائياً):</span>
                  <span className="text-amber-700 font-extrabold text-sm">-{formatEGP(salForm.pending_advances)}</span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                  <div>
                    <label className="block text-[11px] font-bold text-emerald-700 mb-1">مكافآت / إضافي (+)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="0"
                      value={salForm.bonuses}
                      onChange={(e) => setSalForm({ ...salForm, bonuses: e.target.value })}
                      className="w-full h-10 px-3 border border-slate-200 bg-white rounded-xl text-sm font-bold text-emerald-700 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-rose-700 mb-1">خصومات / جزاءات (-)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="0"
                      value={salForm.deductions}
                      onChange={(e) => setSalForm({ ...salForm, deductions: e.target.value })}
                      className="w-full h-10 px-3 border border-slate-200 bg-white rounded-xl text-sm font-bold text-rose-700 outline-none"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                  <span className="font-black text-slate-900 text-sm">صافي المبلغ المستحق للصرف:</span>
                  <span className="font-black text-emerald-600 text-xl">{formatEGP(netSalaryPreview)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الخزينة المنصرف منها *</label>
                  <select
                    required
                    value={salForm.treasury_id}
                    onChange={(e) => setSalForm({ ...salForm, treasury_id: e.target.value })}
                    className="w-full h-11 px-3 border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-brand-primary outline-none"
                  >
                    <option value="">اختر الخزينة...</option>
                    {treasuries.map((tr) => (
                      <option key={tr.id} value={tr.id}>
                        {tr.name} ({formatEGP(tr.current_balance)})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الصرف</label>
                  <input
                    type="date"
                    required
                    value={salForm.payment_date}
                    onChange={(e) => setSalForm({ ...salForm, payment_date: e.target.value })}
                    className="w-full h-11 px-3.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-primary outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات الصرف</label>
                <input
                  type="text"
                  placeholder="ملاحظات اختيارية على الراتب..."
                  value={salForm.notes}
                  onChange={(e) => setSalForm({ ...salForm, notes: e.target.value })}
                  className="w-full h-11 px-3.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-primary outline-none"
                />
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 h-11 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  {submitting ? "جاري الصرف..." : "تأكيد وصرف الراتب"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSalaryModal(false)}
                  className="px-5 h-11 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RECEIPT MODAL */}
      {receiptData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 text-center animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center text-3xl mb-3">
              ✓
            </div>
            <h3 className="font-black text-lg text-slate-900">تم صرف الراتب بنجاح!</h3>
            <p className="text-xs text-slate-500 mt-1">
              تم خصم المبلغ من الخزينة وتسجيل المصروف وتحديث حالة السلف
            </p>

            <div className="my-4 p-4 bg-slate-50 rounded-2xl text-right text-xs space-y-2 font-semibold">
              <div className="flex justify-between">
                <span className="text-slate-500">الموظف:</span>
                <span className="font-bold text-slate-900">{receiptData.employee?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">عن شهر:</span>
                <span className="font-bold text-brand-primary">شهر {receiptData.month} / {receiptData.year}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">الصافي المنصرف:</span>
                <span className="font-black text-emerald-600 text-sm">{formatEGP(receiptData.net_paid)}</span>
              </div>
            </div>

            <button
              onClick={() => setReceiptData(null)}
              className="w-full h-11 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800 transition-colors"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
