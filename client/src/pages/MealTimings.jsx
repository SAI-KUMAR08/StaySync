import { useEffect, useState, useCallback } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import {
  MdRestaurant,
  MdAdd,
  MdEdit,
  MdDelete,
  MdClose,
  MdAccessTime,
  MdMenuBook,
} from "react-icons/md";
import toast from "react-hot-toast";
import { getApiError } from "../utils/getApiError";
import ErrorRetry from "../components/ErrorRetry";
import Button from "../components/Button";

const MEAL_TYPES = ["breakfast", "lunch", "snacks", "dinner"];
const MEAL_LABELS = { breakfast: "Breakfast", lunch: "Lunch", snacks: "Snacks", dinner: "Dinner" };
const MEAL_ICONS = { breakfast: "🌅", lunch: "☀️", snacks: "🍪", dinner: "🌙" };

const ITEM_PRESETS = [
  "Idli",
  "Dosa",
  "Vada",
  "Sambar",
  "Chutney",
  "Pongal",
  "Upma",
  "Puri",
  "Chapati",
  "Rice",
  "Dal",
  "Curry",
  "Rasam",
  "Buttermilk",
  "Pickle",
  "Papad",
  "Salad",
  "Biryani",
  "Noodles",
  "Fried Rice",
  "Naan",
  "Paneer",
  "Egg Curry",
  "Chicken Curry",
  "Tea",
  "Coffee",
  "Milk",
  "Juice",
  "Fruits",
  "Cake",
  "Biscuits",
  "Ice Cream",
];

const MealTimings = () => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const isOwner = user?.role === "owner";

  const [timings, setTimings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showScheduling, setShowScheduling] = useState(false);
  const [editing, setEditing] = useState(null);

  const [form, setForm] = useState({
    mealType: "breakfast",
    items: [],
    dayOfWeek: null,
  });

  function timeStr(hour, min, ampm) {
    if (!hour) return "";
    return `${hour.padStart(2, "0")}:${(min || "00").padStart(2, "0")} ${ampm || "AM"}`;
  }
  function parseTime(str) {
    if (!str) return { hour: "", min: "00", ampm: "AM" };
    const parts = str.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!parts) return { hour: "", min: "00", ampm: "AM" };
    return { hour: parts[1], min: parts[2], ampm: parts[3].toUpperCase() };
  }
  const [schedForm, setSchedForm] = useState({
    breakfast: { startTime: "", endTime: "" },
    lunch: { startTime: "", endTime: "" },
    snacks: { startTime: "", endTime: "" },
    dinner: { startTime: "", endTime: "" },
  });

  const [itemInput, setItemInput] = useState("");

  const fetchTimings = useCallback(async () => {
    setError(null);
    try {
      setLoading(true);
      const base = isOwner ? "/owner/meal-timings" : "/tenant/meal-timings";
      const res = await api.get(base);
      const data = Array.isArray(res.data.data) ? res.data.data : [];
      setTimings(data);
      // Pre-fill scheduling form from existing data
      const sched = {
        breakfast: { startTime: "", endTime: "" },
        lunch: { startTime: "", endTime: "" },
        snacks: { startTime: "", endTime: "" },
        dinner: { startTime: "", endTime: "" },
      };
      data.forEach((t) => {
        if (t.dayOfWeek === null && t.startTime) {
          sched[t.mealType] = { startTime: t.startTime || "", endTime: t.endTime || "" };
        }
      });
      setSchedForm(sched);
    } catch (error) {
      setError(error.response?.data?.message || "Failed to load meal timings");
    } finally {
      setLoading(false);
    }
  }, [isOwner]);

  useEffect(() => {
    fetchTimings();
  }, [fetchTimings, user?.hostelId]);

  // Real-time: menu/timing changes made by the owner (or in another tab) show up
  // immediately for both the owner and tenant views.
  useEffect(() => {
    if (!socket) return;
    const refresh = () => fetchTimings();
    socket.on("meal_timing_updated", refresh);
    return () => {
      socket.off("meal_timing_updated", refresh);
    };
  }, [socket, fetchTimings]);

  // Fallback live updates when the socket is unavailable (Vercel serverless drops
  // socket events): refetch whenever the tab regains focus.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchTimings();
    };
    window.addEventListener("focus", fetchTimings);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", fetchTimings);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchTimings]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        mealType: form.mealType,
        items: form.items,
        dayOfWeek: form.dayOfWeek ?? null,
      };
      if (editing) {
        await api.patch(`/owner/meal-timings/${editing._id}`, payload);
        toast.success("Meal updated");
      } else {
        await api.post("/owner/meal-timings", payload);
        toast.success("Meal added");
      }
      setShowModal(false);
      setEditing(null);
      resetForm();
      fetchTimings();
    } catch (error) {
      toast.error(getApiError(error));
    }
  };

  const handleSaveTimings = async () => {
    try {
      const promises = MEAL_TYPES.map((type) => {
        const existing = timings.find((t) => t.mealType === type && t.dayOfWeek === null);
        const t = schedForm[type];
        if (!existing && !t.startTime && !t.endTime) return null;
        const payload = {
          startTime: t.startTime,
          endTime: t.endTime,
          mealType: type,
          items: existing?.items || [],
          dayOfWeek: null,
        };
        if (existing) {
          return api.patch(`/owner/meal-timings/${existing._id}`, payload);
        }
        return api.post("/owner/meal-timings", payload);
      }).filter(Boolean);
      if (promises.length > 0) await Promise.all(promises);
      toast.success("Timings saved");
      setShowScheduling(false);
      fetchTimings();
    } catch (error) {
      toast.error(getApiError(error));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this meal?")) return;
    try {
      await api.delete(`/owner/meal-timings/${id}`);
      toast.success("Meal deleted");
      fetchTimings();
    } catch (error) {
      toast.error(getApiError(error));
    }
  };

  const handleEdit = (timing) => {
    setEditing(timing);
    setForm({
      mealType: timing.mealType,
      items: timing.items || [],
      dayOfWeek: timing.dayOfWeek ?? null,
    });
    setItemInput("");
    setShowModal(true);
  };

  const resetForm = () => {
    setForm({ mealType: "breakfast", items: [], dayOfWeek: null });
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
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const grouped = {};
  timings.forEach((t) => {
    const key = t.dayOfWeek !== null ? DAY_NAMES[t.dayOfWeek] : "Everyday";
    if (!grouped[key]) grouped[key] = {};
    if (!grouped[key][t.mealType]) grouped[key][t.mealType] = t;
  });
  const dayOrder = ["Everyday", ...DAY_NAMES];
  const sortedDays = Object.keys(grouped).sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
  const sortedTypes = ["breakfast", "lunch", "snacks", "dinner"];

  // Today's menu (tenant): EveryDay entries, overridden by today-specific ones.
  const todayIdx = new Date().getDay();
  const todayKey = DAY_NAMES[todayIdx];
  const todaysMenu = {};
  timings
    .filter((t) => t.dayOfWeek === null)
    .forEach((t) => {
      if (!todaysMenu[t.mealType]) todaysMenu[t.mealType] = t;
    });
  timings
    .filter((t) => t.dayOfWeek === todayIdx)
    .forEach((t) => {
      todaysMenu[t.mealType] = t;
    });
  const hasTodaysMenu = Object.keys(todaysMenu).length > 0;

  if (error && timings.length === 0) return <ErrorRetry message={error} onRetry={fetchTimings} />;

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-5">
        <div>
          <div className="section-ornament-diamond mb-3">
            <MdRestaurant /> Meal Timings
          </div>
          <h2 className="section-title">
            Meal <span className="highlight">Menu</span>
          </h2>
          <p className="section-sub">Manage daily meal schedules and menu items for tenants</p>
        </div>
        {isOwner && (
          <div className="flex gap-2">
            <Button
              onClick={() => {
                setEditing(null);
                resetForm();
                setShowModal(true);
              }}
              icon={MdAdd}
            >
              Add Meal
            </Button>
            <Button onClick={() => setShowScheduling(true)} variant="secondary" icon={MdAccessTime}>
              Set Timings
            </Button>
          </div>
        )}
      </div>

      {/* Today's menu — tenant-facing, merges Every Day + today's schedule */}
      {!isOwner && hasTodaysMenu && !loading && (
        <section className="arch-card p-6 border-l-[3px] border-l-primary">
          <div className="flex items-center gap-3 mb-4">
            <span className="px-3 py-1 rounded-lg bg-primary text-white text-[9px] font-bold uppercase tracking-wider">
              Today
            </span>
            <div>
              <h3 className="text-sm font-bold font-display text-text-primary">
                {todayKey}'s Menu
              </h3>
              <p className="text-[9px] text-text-tertiary font-medium uppercase tracking-wider">
                Updated by your hostel
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {sortedTypes.map((type) => {
              const meal = todaysMenu[type];
              if (!meal) return null;
              const timeStr = [meal.startTime, meal.endTime].filter(Boolean).join(" – ");
              return (
                <div key={type} className="rounded-xl bg-surface border border-border/40 p-3.5">
                  <p className="text-[9px] font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                    <span>{MEAL_ICONS[type]}</span> {MEAL_LABELS[type]}
                  </p>
                  {timeStr && (
                    <p className="flex items-center gap-1 text-[9px] text-text-secondary/60 mt-0.5">
                      <MdAccessTime size={11} /> {timeStr}
                    </p>
                  )}
                  {meal.items?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {meal.items.map((item) => (
                        <span
                          key={item}
                          className="px-2 py-0.5 rounded-md bg-background text-text-secondary text-[8px] font-medium border border-border/40"
                        >
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
      )}

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
          <p className="text-text-secondary/50 font-medium text-sm">
            No meal timings configured yet
          </p>
          {isOwner && (
            <button
              onClick={() => {
                setEditing(null);
                resetForm();
                setShowModal(true);
              }}
              className="btn btn-primary btn-sm mt-4 inline-flex items-center gap-1.5"
            >
              <MdAdd size={16} /> Add First Meal
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {sortedDays.map((day) => (
            <section key={day} className="space-y-4">
              <div className="flex items-center gap-4">
                <span className="px-4 py-1.5 rounded-xl bg-primary text-white text-[9px] font-bold uppercase tracking-wider shadow-sm">
                  {day}
                </span>
                {day === todayKey && (
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[8px] font-bold uppercase tracking-wider">
                    Today
                  </span>
                )}
                <div className="h-px flex-1 bg-border/60" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sortedTypes.map((type) => {
                  const meal = grouped[day]?.[type];
                  if (!meal) return null;
                  const timeStr = [meal.startTime, meal.endTime].filter(Boolean).join(" – ");
                  return (
                    <div key={meal._id} className="arch-card p-5 relative group overflow-hidden">
                      {isOwner && (
                        <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleEdit(meal)}
                            className="p-1.5 bg-surface text-text-secondary/50 hover:text-primary rounded-lg transition-all"
                          >
                            <MdEdit size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(meal._id)}
                            className="p-1.5 bg-surface text-text-secondary/50 hover:text-red-500 rounded-lg transition-all"
                          >
                            <MdDelete size={14} />
                          </button>
                        </div>
                      )}
                      <div className="flex items-start gap-3 mb-3">
                        <span className="text-2xl">{MEAL_ICONS[type]}</span>
                        <div>
                          <p className="text-[9px] font-bold text-primary uppercase tracking-wider">
                            {MEAL_LABELS[type]}
                          </p>
                          {timeStr && (
                            <div className="flex items-center gap-1.5 text-[10px] text-text-secondary/50 mt-1">
                              <MdAccessTime size={13} />
                              <span className="font-medium">{timeStr}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      {meal.items?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {meal.items.map((item) => (
                            <span
                              key={item}
                              className="px-2.5 py-1 rounded-lg bg-background text-text-secondary text-[9px] font-medium border border-border/40"
                            >
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

      {/* Add Meal Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-card max-w-lg">
            <div className="p-6 border-b border-border/60 flex justify-between items-center">
              <div>
                <h4 className="text-lg font-bold font-display text-text-primary">
                  {editing ? "Edit Meal" : "Add Meal"}
                </h4>
                <p className="text-[9px] text-text-secondary font-medium uppercase tracking-wider">
                  Menu Items
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="w-9 h-9 flex items-center justify-center rounded-xl text-text-secondary/40 hover:text-primary hover:bg-primary-light transition-all"
              >
                <MdClose size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">
                    Meal Type
                  </label>
                  <select
                    className="field-select"
                    value={form.mealType}
                    onChange={(e) => setForm({ ...form, mealType: e.target.value })}
                  >
                    {MEAL_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {MEAL_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">
                    Day
                  </label>
                  <select
                    className="field-select"
                    value={form.dayOfWeek ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        dayOfWeek: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  >
                    <option value="">Every Day</option>
                    {DAY_NAMES.map((name, i) => (
                      <option key={name} value={i}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Menu Items */}
              <div className="space-y-2">
                <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">
                  Menu Items
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="field flex-1"
                    placeholder="Add an item..."
                    value={itemInput}
                    onChange={(e) => setItemInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addItem();
                      }
                    }}
                  />
                  <button type="button" onClick={addItem} className="btn btn-primary btn-sm px-4">
                    Add
                  </button>
                </div>
                {form.items.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {form.items.map((item, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/5 text-text-primary text-xs border border-primary/10"
                      >
                        {item}
                        <button
                          type="button"
                          onClick={() => removeItem(i)}
                          className="text-text-secondary/40 hover:text-red-500"
                        >
                          <MdClose size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {presetsForType()
                    .filter((p) => !form.items.includes(p))
                    .slice(0, 8)
                    .map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          if (!form.items.includes(preset)) {
                            setForm({ ...form, items: [...form.items, preset] });
                          }
                        }}
                        className="px-2 py-0.5 rounded-md bg-background text-[8px] text-text-secondary/60 border border-border/40 hover:border-primary/30 transition-all"
                      >
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

      {/* Set Timings Modal */}
      {showScheduling && (
        <div className="modal-overlay">
          <div className="modal-card max-w-md">
            <div className="p-6 border-b border-border/60 flex justify-between items-center">
              <div>
                <h4 className="text-lg font-bold font-display text-text-primary">
                  Set Meal Timings
                </h4>
                <p className="text-[9px] text-text-secondary font-medium uppercase tracking-wider">
                  Same schedule for all days
                </p>
              </div>
              <button
                onClick={() => setShowScheduling(false)}
                className="w-9 h-9 flex items-center justify-center rounded-xl text-text-secondary/40 hover:text-primary hover:bg-primary-light transition-all"
              >
                <MdClose size={20} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              {MEAL_TYPES.map((type) => {
                const st = parseTime(schedForm[type].startTime);
                const et = parseTime(schedForm[type].endTime);
                return (
                  <div key={type} className="space-y-2">
                    <label className="text-[9px] font-bold font-sans text-text-secondary uppercase tracking-wider ml-1">
                      {MEAL_ICONS[type]} {MEAL_LABELS[type]}
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[8px] text-text-secondary/40 font-medium mb-1">Start</p>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength="2"
                            placeholder="HH"
                            className="field w-12 text-center"
                            value={st.hour}
                            onChange={(e) =>
                              setSchedForm({
                                ...schedForm,
                                [type]: {
                                  ...schedForm[type],
                                  startTime: timeStr(e.target.value, st.min, st.ampm),
                                },
                              })
                            }
                          />
                          <span className="text-text-secondary/30 self-center">:</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength="2"
                            placeholder="MM"
                            className="field w-12 text-center"
                            value={st.min}
                            onChange={(e) =>
                              setSchedForm({
                                ...schedForm,
                                [type]: {
                                  ...schedForm[type],
                                  startTime: timeStr(st.hour, e.target.value, st.ampm),
                                },
                              })
                            }
                          />
                          <select
                            className="field-select w-16 text-xs"
                            value={st.ampm}
                            onChange={(e) =>
                              setSchedForm({
                                ...schedForm,
                                [type]: {
                                  ...schedForm[type],
                                  startTime: timeStr(st.hour, st.min, e.target.value),
                                },
                              })
                            }
                          >
                            <option value="AM">AM</option>
                            <option value="PM">PM</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <p className="text-[8px] text-text-secondary/40 font-medium mb-1">End</p>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength="2"
                            placeholder="HH"
                            className="field w-12 text-center"
                            value={et.hour}
                            onChange={(e) =>
                              setSchedForm({
                                ...schedForm,
                                [type]: {
                                  ...schedForm[type],
                                  endTime: timeStr(e.target.value, et.min, et.ampm),
                                },
                              })
                            }
                          />
                          <span className="text-text-secondary/30 self-center">:</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength="2"
                            placeholder="MM"
                            className="field w-12 text-center"
                            value={et.min}
                            onChange={(e) =>
                              setSchedForm({
                                ...schedForm,
                                [type]: {
                                  ...schedForm[type],
                                  endTime: timeStr(et.hour, e.target.value, et.ampm),
                                },
                              })
                            }
                          />
                          <select
                            className="field-select w-16 text-xs"
                            value={et.ampm}
                            onChange={(e) =>
                              setSchedForm({
                                ...schedForm,
                                [type]: {
                                  ...schedForm[type],
                                  endTime: timeStr(et.hour, et.min, e.target.value),
                                },
                              })
                            }
                          >
                            <option value="AM">AM</option>
                            <option value="PM">PM</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowScheduling(false)} className="btn btn-outline flex-1">
                  Cancel
                </button>
                <button onClick={handleSaveTimings} className="btn btn-primary flex-1">
                  Save Timings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MealTimings;
