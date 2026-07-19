import React, { useEffect, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import {
  MdAdd, MdDelete, MdEdit, MdClose, MdSearch,
  MdAttachMoney, MdTrendingDown, MdReceipt,
  MdCalendarToday, MdCategory
} from "react-icons/md";
import toast from "react-hot-toast";
import { getApiError } from "../utils/getApiError";
import ErrorRetry from "../components/ErrorRetry";
import { useDebounce } from "../hooks/useDebounce";


const CATEGORIES = [
  { id: "electricity", label: "Electricity", color: "bg-primary-light text-primary" },
  { id: "water", label: "Water", color: "bg-primary-light text-primary" },
  { id: "maintenance", label: "Maintenance", color: "bg-white/5 text-text-secondary" },
  { id: "cleaning", label: "Cleaning", color: "bg-green-500/10 text-[#2E7D32]" },
  { id: "food", label: "Food", color: "bg-primary-light text-primary" },
  { id: "salary", label: "Salary", color: "bg-primary-light text-primary" },
  { id: "repairs", label: "Repairs", color: "bg-primary-light text-primary" },
  { id: "internet", label: "Internet", color: "bg-primary-light text-primary" },
  { id: "security", label: "Security", color: "bg-primary-light text-primary/80" },
  { id: "supplies", label: "Supplies", color: "bg-primary-light text-primary/80" },
  { id: "furniture", label: "Furniture", color: "bg-white/5 text-text-secondary" },
  { id: "other", label: "Other", color: "bg-white/5 text-text-secondary" },
];

const CATEGORY_ICONS = {
  electricity: "⚡", water: "💧", maintenance: "🔧", cleaning: "🧹",
  food: "🍽️", salary: "💰", repairs: "🛠️", internet: "📡",
  security: "🛡️", supplies: "📦", furniture: "🪑", other: "📋",
};

const PAYMENT_METHODS = ["cash", "upi", "bank_transfer", "card", "other"];

const Expenses = () => {
  const { user } = useAuth();

  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const debouncedSearch = useDebounce(search, 300);

  const [form, setForm] = useState({
    category: "electricity",
    amount: "",
    description: "",
    date: new Date().toISOString().split('T')[0],
    paymentMethod: "cash",
    vendor: "",
  });

  const fetchData = async () => {
    setError(null);
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (categoryFilter) params.set("category", categoryFilter);
      if (search.trim()) params.set("search", search.trim());
      const q = params.toString() ? `?${params}` : "";
      const [expRes, sumRes] = await Promise.all([
        api.get(`/owner/expenses${q}`),
        api.get("/owner/expenses/summary"),
      ]);
      setExpenses(Array.isArray(expRes.data.data) ? expRes.data.data : []);
      setSummary(sumRes.data.data || null);
    } catch (error) {
      setError(error.response?.data?.message || "Failed to load expenses");
      toast.error(getApiError(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [categoryFilter, debouncedSearch, user?.hostelId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) {
      return toast.error("Please enter a valid amount");
    }
    try {
      const payload = {
        category: form.category,
        amount: Number(form.amount),
        description: form.description.trim(),
        date: form.date,
        paymentMethod: form.paymentMethod,
        vendor: form.vendor.trim(),
      };
      if (editing) {
        await api.patch(`/owner/expenses/${editing._id}`, payload);
        toast.success("Expense updated");
      } else {
        await api.post("/owner/expenses", payload);
        toast.success("Expense added");
      }
      setShowModal(false);
      setEditing(null);
      setForm({ category: "electricity", amount: "", description: "", date: new Date().toISOString().split('T')[0], paymentMethod: "cash", vendor: "" });
      fetchData();
    } catch (error) {
      toast.error(getApiError(error));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this expense?")) return;
    try {
      await api.delete(`/owner/expenses/${id}`);
      toast.success("Expense deleted");
      fetchData();
    } catch (error) {
      toast.error(getApiError(error));
    }
  };

  const handleEdit = (expense) => {
    setEditing(expense);
    setForm({
      category: expense.category,
      amount: String(expense.amount),
      description: expense.description || "",
      date: new Date(expense.date).toISOString().split('T')[0],
      paymentMethod: expense.paymentMethod || "cash",
      vendor: expense.vendor || "",
    });
    setShowModal(true);
  };

  if (error && expenses.length === 0) return <ErrorRetry message={error} onRetry={fetchData} />;
  if (loading && expenses.length === 0) return (
    <div className="space-y-5" role="status" aria-label="Loading expenses">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="card card-md space-y-4">
            <div className={`skeleton h-10 w-10 rounded-2xl`} />
            <div className="skeleton h-3 w-24" />
            <div className="skeleton h-7 w-20" />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-8 pb-16">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-5 animate-slide-up-big">
        <div>
          <div className="section-ornament-diamond mb-3"><MdTrendingDown size={12} /> Expenses</div>
          <h2 className="section-title">Expense <span className="highlight">Tracker</span></h2>
          <p className="section-sub">Track and manage all hostel operational expenses</p>
        </div>
        <button onClick={() => { setEditing(null); setForm({ category: "electricity", amount: "", description: "", date: new Date().toISOString().split('T')[0], paymentMethod: "cash", vendor: "" }); setShowModal(true); }}
          className="btn-primary flex items-center gap-2 text-sm">
          <MdAdd size={18} /> Add Expense
        </button>
      </header>

      {/* Summary Cards */}
      {summary && (
        <div className="stagger-container grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="arch-card p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-[16px] bg-red-500/10 text-[#C62828] flex items-center justify-center"><MdTrendingDown size={22} /></div>
            <div>
              <p className="text-[8px] font-bold text-text-secondary uppercase tracking-[0.15em]">Total Expenses</p>
              <p className="text-xl font-black text-text-primary">₹{summary.totalExpenses?.toLocaleString()}</p>
            </div>
          </div>
          <div className="arch-card p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-[16px] bg-primary-light text-primary flex items-center justify-center"><MdCalendarToday size={22} /></div>
            <div>
              <p className="text-[8px] font-bold text-text-secondary uppercase tracking-[0.15em]">This Month</p>
              <p className="text-xl font-black text-text-primary">₹{summary.thisMonthTotal?.toLocaleString()}</p>
            </div>
          </div>
          <div className="arch-card p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-[16px] bg-green-500/10 text-[#2E7D32] flex items-center justify-center"><MdReceipt size={22} /></div>
            <div>
              <p className="text-[8px] font-bold text-text-secondary uppercase tracking-[0.15em]">Total Entries</p>
              <p className="text-xl font-black text-text-primary">{summary.count}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <MdSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary/40 text-lg" />
          <input type="text" placeholder="Search expenses..." className="field pl-11"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="field-select px-5" value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </div>

      {/* Expense List */}
      <div className="arch-card overflow-hidden">
        {expenses.length === 0 ? (
          <div className="py-20 text-center">
            <MdAttachMoney className="text-5xl mx-auto mb-3 text-text-tertiary" />
            <p className="text-text-secondary/50 font-medium text-sm">No expenses recorded yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {expenses.map((e, i) => (
              <div key={e._id} className="stagger-enter p-5 hover:bg-surface transition-all flex items-center gap-5"
                style={{ animationDelay: `${Math.min(i * 0.04, 0.3)}s` }}>
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-lg ${CATEGORIES.find(c => c.id === e.category)?.color || 'bg-white/5 text-text-secondary/60'}`}>
                  {CATEGORY_ICONS[e.category] || "📋"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-text-primary text-sm capitalize">{e.category}</p>
                  <p className="text-[10px] text-text-secondary/60 line-clamp-1">{e.description || e.vendor ? `${e.description}${e.vendor ? ` — ${e.vendor}` : ''}` : "No details"}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-black text-text-primary text-base">₹{e.amount?.toLocaleString()}</p>
                  <p className="text-[9px] text-text-secondary font-medium capitalize">{new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => handleEdit(e)} aria-label={`Edit ${e.description || "expense"}`} className={`p-2 text-text-secondary/40 hover:text-primary hover:bg-primary/5 rounded-xl transition-all`}>
                    <MdEdit size={16} />
                  </button>
                  <button onClick={() => handleDelete(e._id)} aria-label={`Delete ${e.description || "expense"}`} className={`p-2 text-text-secondary/40 hover:text-accent hover:bg-accent-soft rounded-xl transition-all`}>
                    <MdDelete size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-card max-w-md">
            <div className="p-6 border-b border-border/60 flex justify-between items-center">
              <div>
                <h4 className="text-lg font-bold font-display text-text-primary">{editing ? "Edit Expense" : "Add Expense"}</h4>
                <p className="text-[9px] text-text-secondary font-medium uppercase tracking-wider">Record a hostel expense</p>
              </div>
              <button onClick={() => setShowModal(false)} aria-label="Close expense form" className={`w-9 h-9 flex items-center justify-center rounded-xl text-text-secondary/40 hover:text-accent hover:bg-accent-soft transition-all`}>
                <MdClose size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Category</label>
                <select className="field-select" value={form.category} onChange={(e) => setForm({...form, category: e.target.value})}>
                  {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Amount (₹)</label>
                  <input required type="number" min="1" step="0.01" className="field" placeholder="500"
                    value={form.amount} onChange={(e) => setForm({...form, amount: e.target.value})} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Payment Method</label>
                  <select className="field-select" value={form.paymentMethod} onChange={(e) => setForm({...form, paymentMethod: e.target.value})}>
                    {PAYMENT_METHODS.map(m => <option key={m} value={m} className="capitalize">{m.replace("_", " ")}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Date</label>
                <input type="date" className="field" value={form.date}
                  onChange={(e) => setForm({...form, date: e.target.value})} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Description</label>
                <input type="text" className="field" placeholder="What was this expense for?"
                  value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Vendor (optional)</label>
                <input type="text" className="field" placeholder="Who was paid?"
                  value={form.vendor} onChange={(e) => setForm({...form, vendor: e.target.value})} />
              </div>
              <button type="submit" className="btn-primary w-full py-4">
                {editing ? "Update Expense" : "Add Expense"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Expenses;
