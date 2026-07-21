import React, { useEffect, useState, useCallback } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import {
  MdRestaurant, MdAdd, MdEdit, MdDelete, MdClose,
  MdAccessTime, MdMenuBook,
} from "react-icons/md";
import toast from "react-hot-toast";
import { getApiError } from "../utils/getApiError";
import ErrorRetry from "../components/ErrorRetry";
import Button from "../components/Button";

const MEAL_TYPES = ["breakfast", "lunch", "snacks", "dinner"];
const MEAL_LABELS = { breakfast: "Breakfast", lunch: "Lunch", snacks: "Snacks", dinner: "Dinner" };
const MEAL_ICONS = { breakfast: "🌅", lunch: "☀️", snacks: "🍪", dinner: "🌙" };
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const ITEM_PRESETS = [
  "Idli", "Dosa", "Vada", "Sambar", "Chutney", "Pongal", "Upma", "Puri", "Chapati",
  "Rice", "Dal", "Curry", "Rasam", "Buttermilk", "Pickle", "Papad", "Salad",
  "Biryani", "Noodles", "Fried Rice", "Naan", "Paneer", "Egg Curry", "Chicken Curry",
  "Tea", "Coffee", "Milk", "Juice", "Fruits", "Cake", "Biscuits", "Ice Cream",
];

const MealTimings = () => {
  const { user } = useAuth();
  const isOwner = user?.role === "owner" || user?.role === "manager";

  const [timings, setTimings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [activeDay, setActiveDay] = useState(null);

  const [form, setForm] = useState({
    mealType: "breakfast",
    name: "",
    items: [],

    startTime: "",
    endTime: "",
    dayOfWeek: null,
  });

  const [itemInput, setItemInput] = useState("");

  const fetchTimings = useCallback(async () => {
    setError(null);
    try {
      setLoading(true);
      const base = isOwner ? "/owner/meal-timings" : "/tenant/meal-timings";
      const res = await api.get(base);
      setTimings(Array.isArray(res.data.data) ? res.data.data : []);
    } catch (error) {
      setError(error.response?.data?.message || "Failed to load meal timings");
    } finally {
      setLoading(false);
    }
  }, [isOwner]);

  useEffect(() => { fetchTimings(); }, [fetchTimings, user?.hostelId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Please enter a meal name");
      return;
    }
    try {
      const payload = {
        mealType: form.mealType,
        name: form.name.trim(),
        items: form.items,
        startTime: form.startTime,
        endTime: form.endTime,
        dayOfWeek: form.dayOfWeek,
      };
      if (editing) {
        await api.patch(`/owner/meal-timings/${editing._id}`, payload);
        toast.success("Meal timing updated");
      } else {
        await api.post("/owner/meal-timings", payload);
        toast.success("Meal timing added");
      }
      setShowModal(false);
      setEditing(null);
      resetForm();
      fetchTimings();
    } catch (error) {
      toast.error(getApiError(error));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this meal timing?")) return;
    try {
      await api.delete(`/owner/meal-timings/${id}`);
      toast.success("Meal timing deleted");
      fetchTimings();
    } catch (error) {
      toast.error(getApiError(error));
    }
  };

  const handleEdit = (timing) => {
    setEditing(timing);
    setForm({
      mealType: timing.mealType,
      name: timing.name || "",
      items: timing.items || [],
      startTime: timing.startTime || "",
      endTime: timing.endTime || "",
      dayOfWeek: timing.dayOfWeek ?? null,
    });
    setItemInput("");
    setShowModal(true);
  };

  const resetForm = () => {
    setForm({ mealType: "breakfast", name: "", items: [], startTime: "", endTime: "", dayOfWeek: null });
    setItemInput("");
  };

  const addItem = () => {
    const item = itemInput.trim();
    if (!item) return;
    if (form.items.includes(item)) {
      toast.error("Item already added");
      return;
    }
    setForm({ ...form, items: [...form.items, item] });
    setItemInput("");
  };

  const removeItem = (index) => {
    setForm({ ...form, items: form.items.filter((_, i) => i !== index) });
  };

  const presetsForType = () => {
    const type = form.mealType;
    if (type === "breakfast") return ITEM_PRESETS.slice(0, 10);
    if (type === "lunch" || type === "dinner") return ITEM_PRESETS.slice(10, 25);
    return ITEM_PRESETS.slice(25);
  };

  // Group by day
  const grouped = {};
  timings.forEach((t) => {
    const key = t.dayOfWeek !== null ? DAY_NAMES[t.dayOfWeek] : "Everyday";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(t);
  });

  const dayOrder = ["Everyday", ...DAY_NAMES];
  const sortedDays = Object.keys(grouped).sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));

  if (error && timings.length === 0) return <ErrorRetry message={error} onRetry={fetchTimings} />;

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-5">
        <div>
          <div className="section-ornament-diamond mb-3"><MdRestaurant /> Meal Timings</div>
          <h2 className="section-title">Meal <span className="highlight">Menu</span></h2>
          <p className="section-sub">Manage daily meal schedules and menu items for residents</p>
        </div>
        {isOwner && (
          <Button onClick={() => { setEditing(null); resetForm(); setShowModal(true); }}
            icon={MdAdd}>
            Add Meal
          </Button>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="arch-card p-6 space-y-4">
              <div className="skeleton h-6 w-32" />
              <div className="skeleton h-4 w-48" />
              <div className="skeleton h-3 w-40" />
            </div>
          ))}
        </div>
      ) : timings.length === 0 ? (
        <div className="arch-card p-16 text-center">
          <MdMenuBook className="text-5xl mx-auto mb-3 text-text-tertiary/30" />
          <p className="text-text-secondary/50 font-medium text-sm">No meal timings configured yet</p>
          {isOwner && (
            <button onClick={() => { setEditing(null); resetForm(); setShowModal(true); }}
              className="btn btn-primary btn-sm mt-4 inline-flex items-center gap-1.5">
              <MdAdd size={16} /> Add First Meal
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {sortedDays.map((day) => (
            <section key={day} className="space-y-4">
              <div className="flex items-center gap-4">
                <span className={`px-4 py-1.5 rounded-xl bg-primary text-white text-[9px] font-bold uppercase tracking-wider shadow-sm`}>
                  {day}
                </span>
                <div className="h-px flex-1 bg-border/60" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {MEAL_TYPES.map((type) => {
                  const meal = grouped[day]?.find((t) => t.mealType === type);
                  if (!meal) return null;
                  const timeStr = [meal.startTime, meal.endTime].filter(Boolean).join(" – ");
                  return (
                    <div key={meal._id} className="arch-card p-5 relative group overflow-hidden">
                      {isOwner && (
                        <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handleEdit(meal)}
                            className={`p-1.5 bg-surface text-text-secondary/50 hover:text-primary rounded-lg transition-all`}>
                            <MdEdit size={14} />
                          </button>
                          <button onClick={() => handleDelete(meal._id)}
                            className={`p-1.5 bg-surface text-text-secondary/50 hover:text-red-500 rounded-lg transition-all`}>
                            <MdDelete size={14} />
                          </button>
                        </div>
                      )}
                      <div className="flex items-start gap-3 mb-3">
                        <span className="text-2xl">{MEAL_ICONS[type]}</span>
                        <div>
                          <p className="text-[9px] font-bold text-primary uppercase tracking-wider">{MEAL_LABELS[type]}</p>
                          <h4 className="text-lg font-bold font-display text-text-primary tracking-tight">{meal.name || MEAL_LABELS[type]}</h4>
                        </div>
                      </div>
                      {timeStr && (
                        <div className="flex items-center gap-1.5 text-[10px] text-text-secondary/50 mb-3">
                          <MdAccessTime size={13} />
                          <span className="font-medium">{timeStr}</span>
                        </div>
                      )}
                      {meal.items?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {meal.items.map((item, i) => (
                            <span key={i} className="px-2.5 py-1 rounded-lg bg-background text-text-secondary text-[9px] font-medium border border-border/40">
                              {item}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-card max-w-lg">
            <div className="p-6 border-b border-border/60 flex justify-between items-center">
              <div>
                <h4 className="text-lg font-bold font-display text-text-primary">{editing ? "Edit Meal" : "Add Meal"}</h4>
                <p className="text-[9px] text-text-secondary font-medium uppercase tracking-wider">Meal Schedule Configuration</p>
              </div>
              <button onClick={() => setShowModal(false)}
                className={`w-9 h-9 flex items-center justify-center rounded-xl text-text-secondary/40 hover:text-primary hover:bg-primary-light transition-all`}>
                <MdClose size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Meal Type</label>
                  <select className="field-select" value={form.mealType}
                    onChange={(e) => setForm({ ...form, mealType: e.target.value })}>
                    {MEAL_TYPES.map((t) => <option key={t} value={t}>{MEAL_LABELS[t]}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Day</label>
                  <select className="field-select" value={form.dayOfWeek ?? ""}
                    onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value === "" ? null : Number(e.target.value) })}>
                    <option value="">Every Day</option>
                    {DAY_NAMES.map((name, i) => <option key={i} value={i}>{name}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Meal Name</label>
                <input type="text" className="field" placeholder="e.g. South Indian Breakfast"
                  value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Start Time</label>
                  <input type="time" className="field" value={form.startTime}
                    onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">End Time</label>
                  <input type="time" className="field" value={form.endTime}
                    onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
                </div>
              </div>

              {/* Menu Items */}
              <div className="space-y-2">
                <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">Menu Items</label>
                <div className="flex gap-2">
                  <input type="text" className="field flex-1" placeholder="Add an item..."
                    value={itemInput}
                    onChange={(e) => setItemInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }} />
                  <button type="button" onClick={addItem}
                    className="btn btn-primary btn-sm px-4">Add</button>
                </div>
                {form.items.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {form.items.map((item, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/5 text-text-primary text-xs border border-primary/10">
                        {item}
                        <button type="button" onClick={() => removeItem(i)}
                          className="text-text-secondary/40 hover:text-red-500">
                          <MdClose size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {presetsForType().filter((p) => !form.items.includes(p)).slice(0, 8).map((preset) => (
                    <button key={preset} type="button" onClick={() => {
                      if (!form.items.includes(preset)) {
                        setForm({ ...form, items: [...form.items, preset] });
                      }
                    }}
                      className="px-2 py-0.5 rounded-md bg-background text-[8px] text-text-secondary/60 border border-border/40 hover:border-primary/30 transition-all">
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>

              <Button type="submit" fullWidth size="xl">
                {editing ? "Update Meal" : "Add Meal"}
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MealTimings;
