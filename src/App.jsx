import { useEffect, useRef, useState } from "react";
import "./index.css";
import { cloudEnabled, supabase } from "./supabase";
const K = "expensia-web-session",
  cats = [
    "Grocery",
    "Bills",
    "Shopping",
    "Online shopping",
    "Salary",
    "Investment",
    "Pets",
    "Restaurant",
    "Telecommunication",
    "Car care",
    "Toys and gifts",
    "Electronics",
    "Personal transfer",
    "Utilities",
    "Other",
    "Rent & Housing",
    "Education",
    "Dependents",
    "Loans & Debt",
    "Household Help",
  ],
  icon = {
    Grocery: "🛒",
    Bills: "🧾",
    Shopping: "🛍️",
    Salary: "💼",
    Pets: "🐾",
    Restaurant: "🍽️",
    Utilities: "💡",
    "Rent & Housing": "🏠",
    Education: "🎓",
    Dependents: "👨‍👩‍👧",
    "Loans & Debt": "🏦",
    "Car care": "🚗",
  };
const id = () => crypto.randomUUID(),
  mo = () => new Date().toISOString().slice(0, 7),
  localDateTime = (value) => {
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  },
  planKey = (plan) => [
    plan.description.trim().toLowerCase(),
    plan.category,
    Number(plan.amount).toFixed(2),
    plan.portfolioId || "default",
    plan.dueDay || 1,
    Boolean(plan.savings),
    plan.destinationId || "",
  ].join("|"),
  dedupePlans = (plans) => {
    const seen = new Set();
    return plans.filter((plan) => {
      const key = planKey(plan);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  },
  seed = {
    selected: "main",
    profile: "",
    globalCaps: {},
    categories: cats,
    portfolios: [
      {
        id: "main",
        name: "My portfolio",
        currency: "SAR",
        opening: 0,
        type: "bank",
        creditLimit: 0,
        caps: {},
        transactions: [],
      },
      {
        id: "save",
        name: "Savings / Reserves",
        currency: "SAR",
        opening: 0,
        type: "bank",
        creditLimit: 0,
        caps: {},
        transactions: [],
      },
    ],
    plans: [
      ["Rent reserve", "Rent & Housing", 5833, 1],
      ["School fees reserve", "Education", 2250, 1],
      ["Dependent fees reserve", "Dependents", 1250, 1],
      ["Existing loan installment", "Loans & Debt", 5431],
      ["Company loan installment", "Loans & Debt", 3750],
      ["Housemaid", "Household Help", 1000],
      ["Groceries & food", "Grocery", 3000],
      ["Utilities & telecom", "Utilities", 1500],
      ["Two cars", "Car care", 1800],
      ["Family personal expenses", "Personal transfer", 1000],
      ["Restaurants & entertainment", "Restaurant", 500],
    ].map((x, i) => ({
      id: id(),
      description: x[0],
      category: x[1],
      amount: x[2],
      savings: !!x[3],
      last: "",
    })),
  };
const fmt = (p, n) =>
  new Intl.NumberFormat("en", {
    style: "currency",
    currency: p.currency,
  }).format(n);
const readData = () => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(K) || "null");
    return saved?.portfolios ? saved : seed;
  } catch {
    return seed;
  }
};
const fromFlutterState = (state) => ({
  selected: state.selectedId || "default",
  profile: state.name || "",
  globalCaps: Object.fromEntries(Object.entries(state.globalCategoryCaps || {}).map(([currency, caps]) => [currency.toLowerCase(), caps])),
  categories: state.categories || cats,
  portfolios: (state.portfolios || []).map((portfolio) => ({
    id: portfolio.id,
    name: portfolio.name,
    currency: String(portfolio.currency || "sar").toUpperCase(),
    opening: portfolio.opening || 0,
    type: portfolio.type || "bank",
    creditLimit: portfolio.creditLimit || 0,
    caps: portfolio.categoryCaps || {},
    transactions: portfolio.transactions || [],
  })),
  plans: dedupePlans((state.monthlyPlans || []).map((plan) => ({
    id: plan.id,
    description: plan.description,
    category: plan.category,
    amount: plan.amount,
    savings: Boolean(plan.savingsTransfer),
    destinationId: plan.destinationPortfolioId,
    portfolioId: plan.portfolioId,
    dueDay: plan.dueDay || 1,
    recurring: plan.recurring ?? true,
    last: plan.lastCreatedMonth || "",
    skipped: plan.lastSkippedMonth || "",
  }))),
});
const toFlutterState = (data, previous) => ({
  ...previous,
  name: data.profile || previous.name || "",
  selectedId: data.selected,
  globalCategoryCaps: data.globalCaps || {},
  categories: data.categories,
  portfolios: data.portfolios.map((portfolio) => {
    const existing = (previous.portfolios || []).find((item) => item.id === portfolio.id) || {};
    return { ...existing, id: portfolio.id, name: portfolio.name, opening: portfolio.opening, currency: String(portfolio.currency).toLowerCase(), type: portfolio.type || "bank", creditLimit: portfolio.creditLimit || 0, categoryCaps: portfolio.caps || {}, transactions: portfolio.transactions || [] };
  }),
  monthlyPlans: data.plans.map((plan) => {
    const existing = (previous.monthlyPlans || []).find((item) => item.id === plan.id) || {};
    return { ...existing, id: plan.id, description: plan.description, category: plan.category, amount: plan.amount, savingsTransfer: Boolean(plan.savings), destinationPortfolioId: plan.destinationId || existing.destinationPortfolioId, portfolioId: plan.portfolioId || existing.portfolioId || data.selected, dueDay: plan.dueDay || existing.dueDay || 1, recurring: plan.recurring ?? existing.recurring ?? true, lastCreatedMonth: plan.last || null, lastSkippedMonth: plan.skipped || null };
  }),
});
const fromSharedRecords = (records) => {
  const active = records.filter((record) => !record.deleted_at);
  const profile = active.find((record) => record.record_type === "profile")?.payload || {};
  const category = active.find((record) => record.record_type === "category")?.payload || {};
  const portfolios = active
    .filter((record) => record.record_type === "portfolio")
    .map((record) => ({ ...record.payload, type: record.payload.type || "bank", creditLimit: record.payload.creditLimit || 0, caps: record.payload.categoryCaps || record.payload.caps || {}, transactions: [] }));
  if (!portfolios.length) return null;
  const globalCaps = Object.fromEntries(Object.entries(profile.globalCategoryCaps || {}).map(([currency, caps]) => [currency.toLowerCase(), structuredClone(caps)]));
  if (profile.capsSharedVersion !== 2) {
    portfolios.forEach((portfolio) => {
      const shared = globalCaps[portfolio.currency.toLowerCase()] ||= {};
      Object.entries(portfolio.caps || {}).forEach(([category, amount]) => {
        shared[category] = Math.max(shared[category] || 0, Number(amount));
      });
      portfolio.caps = {};
    });
  }
  const byId = new Map(portfolios.map((portfolio) => [portfolio.id, portfolio]));
  const selected = byId.has(profile.selectedId)
    ? profile.selectedId
    : portfolios[0].id;
  active.filter((record) => record.record_type === "transaction").forEach((record) => {
    const transaction = record.payload;
    const portfolio = byId.get(transaction.portfolioId);
    if (portfolio) portfolio.transactions.push(transaction);
  });
  const plans = active.filter((record) => record.record_type === "plan").map((record) => {
    const plan = record.payload;
    return {
      id: plan.id,
      description: plan.description,
      category: plan.category,
      amount: plan.amount,
      savings: Boolean(plan.savings ?? plan.savingsTransfer),
      destinationId: byId.has(plan.destinationId || plan.destinationPortfolioId)
        ? plan.destinationId || plan.destinationPortfolioId
        : undefined,
      portfolioId: byId.has(plan.portfolioId) ? plan.portfolioId : selected,
      dueDay: plan.dueDay || 1,
      recurring: plan.recurring ?? true,
      last: plan.last || plan.lastCreatedMonth || "",
      skipped: plan.skipped || plan.lastSkippedMonth || "",
    };
  });
  return {
    selected,
    profile: profile.name || "",
    globalCaps,
    categories: category.categories || cats,
    portfolios,
    plans: dedupePlans(plans),
  };
};
const toSharedRecords = (userId, data) => [
  { user_id: userId, record_type: "profile", record_id: "settings", payload: { name: data.profile, selectedId: data.selected, globalCategoryCaps: data.globalCaps || {}, capsSharedVersion: 2 } },
  { user_id: userId, record_type: "category", record_id: "all", payload: { categories: data.categories, icons: {} } },
  ...data.portfolios.flatMap((portfolio) => [
    { user_id: userId, record_type: "portfolio", record_id: portfolio.id, payload: { id: portfolio.id, name: portfolio.name, opening: portfolio.opening, currency: String(portfolio.currency).toLowerCase(), type: portfolio.type || "bank", creditLimit: portfolio.creditLimit || 0, categoryCaps: portfolio.caps || {} } },
    ...portfolio.transactions.map((transaction) => ({ user_id: userId, record_type: "transaction", record_id: transaction.id, payload: { ...transaction, portfolioId: portfolio.id }, deleted_at: null })),
  ]),
  ...dedupePlans(data.plans).map((plan) => ({ user_id: userId, record_type: "plan", record_id: plan.id, payload: { ...plan, savingsTransfer: Boolean(plan.savings), lastCreatedMonth: plan.last || null, lastSkippedMonth: plan.skipped || null } })),
];
const syncSharedRecords = async (userId, data) => {
  const records = toSharedRecords(userId, data);
  const { error } = await supabase.from("finance_records").upsert(records);
  return { error };
};
function App() {
  const [d, setD] = useState(readData),
    [tab, setTab] = useState("Home"),
    [form, setForm] = useState(null);
  const [recentScope, setRecentScope] = useState("portfolio");
  const [historyScope, setHistoryScope] = useState("portfolio");
  const [reportScope, setReportScope] = useState("global");
  const [trendMonth, setTrendMonth] = useState(mo());
  const [editing, setEditing] = useState(null);
  const [capsOpen, setCapsOpen] = useState(false);
  const [capsShared, setCapsShared] = useState(false);
  const [newCap, setNewCap] = useState(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  const [portfoliosOpen, setPortfoliosOpen] = useState(true);
  const [backupsOpen, setBackupsOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [authMessage, setAuthMessage] = useState("");
  const [syncError, setSyncError] = useState("");
  const [apiMessage, setApiMessage] = useState("");
  const [transferMessage, setTransferMessage] = useState("");
  const mobileStateRef = useRef(null);
  const csvInputRef = useRef(null);
  const [cloudReady, setCloudReady] = useState(!cloudEnabled);
  useEffect(() => {
    if (!cloudEnabled) return;
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
    return () => listener.subscription.unsubscribe();
  }, []);
  const refreshCloud = async () => {
    if (!user) return;
    setCloudReady(false);
    setSyncError("");
    const [{ data: mobile, error: mobileError }, { data: saved, error: savedError }, { data: records, error: recordsError }] = await Promise.all([
      supabase.from("flutter_app_state").select("data, updated_at").eq("user_id", user.id).maybeSingle(),
      supabase.from("app_state").select("data, updated_at").eq("user_id", user.id).maybeSingle(),
      supabase.from("finance_records").select("record_type, record_id, payload, deleted_at").eq("user_id", user.id),
    ]);
    const error = mobileError || savedError || recordsError;
    if (error) {
      setSyncError(error.message);
      setCloudReady(true);
      return;
    }
    const sharedData = fromSharedRecords(records || []);
    if (mobile?.data?.portfolios) mobileStateRef.current = mobile.data;
    if (sharedData) {
      const mobileData = mobile?.data?.portfolios ? fromFlutterState(mobile.data) : null;
      if (!Object.keys(sharedData.globalCaps || {}).length && Object.keys(mobileData?.globalCaps || {}).length) {
        sharedData.globalCaps = mobileData.globalCaps;
      }
      setD(sharedData);
    }
    else if (saved?.data?.portfolios && (!mobile?.data?.portfolios || saved.updated_at > mobile.updated_at)) setD(saved.data);
    else if (mobile?.data?.portfolios) setD(fromFlutterState(mobile.data));
    setCloudReady(true);
  };
  useEffect(() => {
    if (!user) return;
    refreshCloud();
  }, [user]);
  useEffect(() => {
    sessionStorage.setItem(K, JSON.stringify(d));
    if (user && cloudReady) {
      const writes = [supabase.from("app_state").upsert({ user_id: user.id, data: d, updated_at: new Date().toISOString() })];
      if (mobileStateRef.current) {
        const mobileData = toFlutterState(d, mobileStateRef.current);
        mobileStateRef.current = mobileData;
        writes.push(supabase.from("flutter_app_state").upsert({ user_id: user.id, data: mobileData, updated_at: new Date().toISOString() }));
      }
      writes.push(syncSharedRecords(user.id, d));
      Promise.all(writes).then((results) => {
        const error = results.find((result) => result.error)?.error?.message || "";
        setSyncError(error);
        if (!error) {
          localStorage.removeItem("expensia-web");
          const lastBackup = Number(localStorage.getItem("expensia-last-backup") || 0);
          if (Date.now() - lastBackup >= 7 * 24 * 60 * 60 * 1000) {
            supabase.from("finance_backups").insert({ user_id: user.id, label: `Automatic backup ${new Date().toISOString()}`, finance_records: toSharedRecords(user.id, d), web_state: d, flutter_state: mobileStateRef.current }).then(({ error: backupError }) => {
              if (!backupError) localStorage.setItem("expensia-last-backup", String(Date.now()));
            });
          }
        }
      });
    }
  }, [d, user, cloudReady]);
  const copyApiToken = async () => {
    const { data, error } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (error || !token) {
      setApiMessage("Sign in again to create a new API access token.");
      return;
    }
    try {
      await navigator.clipboard.writeText(token);
      setApiMessage("Access token copied. It expires automatically, so do not store it in source code.");
    } catch (_) {
      setApiMessage("Clipboard access was blocked. Allow clipboard permission and try again.");
    }
  };
  const exportCsv = () => {
    const rows = [["portfolio", "description", "category", "amount", "type", "date"]];
    d.portfolios.forEach((portfolio) => portfolio.transactions.forEach((transaction) => rows.push([portfolio.name, transaction.description, transaction.category, transaction.amount, transaction.inflow ? "inflow" : "outflow", transaction.createdAt])));
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `my-expensia-${mo()}-transactions.csv`; link.click(); URL.revokeObjectURL(url);
    setTransferMessage("Transactions exported as an Excel-compatible CSV file.");
  };
  const importCsv = (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result).trim().split(/\r?\n/).map((line) => line.match(/(?:^|,)(?:"([^"]*(?:""[^"]*)*)"|([^",]*))/g)?.map((cell) => cell.replace(/^,?"?/, "").replace(/"?$/, "").replaceAll('""', '"')) || []);
      const headers = lines.shift()?.map((header) => header.trim().toLowerCase()) || [];
      const required = ["portfolio", "description", "category", "amount", "type", "date"];
      if (!required.every((header) => headers.includes(header))) { setTransferMessage("Import needs: portfolio, description, category, amount, type, date."); return; }
      let added = 0, skipped = 0;
      up((next) => lines.forEach((line) => {
        const row = Object.fromEntries(headers.map((header, index) => [header, line[index]?.trim()]));
        const portfolio = next.portfolios.find((item) => item.name.toLowerCase() === row.portfolio?.toLowerCase()) || next.portfolios.find((item) => item.id === row.portfolio) || next.portfolios.find((item) => item.id === next.selected);
        const amount = Number(row.amount); const date = new Date(row.date); const inflow = row.type?.toLowerCase() === "inflow";
        if (!portfolio || !row.description || !row.category || !Number.isFinite(amount) || amount <= 0 || Number.isNaN(date.getTime()) || !["inflow", "outflow"].includes(row.type?.toLowerCase())) { skipped++; return; }
        const exists = portfolio.transactions.some((transaction) => transaction.description === row.description && transaction.amount === amount && transaction.inflow === inflow && transaction.createdAt === date.toISOString());
        if (exists) { skipped++; return; }
        if (!next.categories.includes(row.category)) next.categories.push(row.category);
        portfolio.transactions.unshift({ id: id(), description: row.description, category: row.category, amount, inflow, createdAt: date.toISOString() }); added++;
      }));
      setTransferMessage(`Imported ${added} transaction${added === 1 ? "" : "s"}${skipped ? `; skipped ${skipped} invalid or duplicate row${skipped === 1 ? "" : "s"}` : ""}.`);
    };
    reader.readAsText(file); event.target.value = "";
  };
  const createBackup = () => supabase.from("finance_backups").insert({ user_id: user.id, label: `Manual web backup ${new Date().toISOString()}`, finance_records: toSharedRecords(user.id, d), web_state: d, flutter_state: mobileStateRef.current }).then(({ error }) => setTransferMessage(error ? `Backup failed: ${error.message}` : "Cloud backup created successfully."));
  const signIn = async (event, create = false) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget), email = values.get("email"), password = values.get("password");
    if (create && password.length < 12) return setAuthMessage("Use at least 12 characters for a new password.");
    const response = create
      ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
      : await supabase.auth.signInWithPassword({ email, password });
    setAuthMessage(response.error ? response.error.message : create ? "Account created. Confirm your email once, then sign in." : "Signed in. Syncing your data...");
  };
  const p = d.portfolios.find((x) => x.id === d.selected),
    up = (f) =>
      setD((x) => {
        const next = structuredClone(x);
        f(next);
        return next;
      }),
    bal = (x) =>
      x.opening +
      x.transactions.reduce((s, t) => s + (t.inflow ? t.amount : -t.amount), 0),
    outstanding = (x) => Math.max(0, -bal(x)),
    availableCredit = (x) => Math.max(0, (Number(x.creditLimit) || 0) - outstanding(x)),
    add = (e) => {
      e.preventDefault();
      let v = Object.fromEntries(new FormData(e.target)),
        q = d.portfolios.find((x) => x.id === v.portfolio),
        sharedCap = d.globalCaps[q.currency.toLowerCase()]?.[v.category],
        spent =
          (sharedCap ? d.portfolios.filter((portfolio) => portfolio.currency === q.currency).flatMap((portfolio) => portfolio.transactions) : q.transactions)
            .filter(
              (t) =>
                !t.inflow &&
                t.category === v.category &&
                t.createdAt.slice(0, 7) === mo(),
            )
            .reduce((s, t) => s + t.amount, 0) + +v.amount;
      if (
        (sharedCap || q.caps[v.category]) &&
        spent >= (sharedCap || q.caps[v.category]) * 0.9 &&
        !confirm(
          `Cap warning: ${((spent / (sharedCap || q.caps[v.category])) * 100).toFixed(1)}% used. Save?`,
        )
      )
        return;
      up((x) =>
        x.portfolios
          .find((z) => z.id === v.portfolio)
          .transactions.unshift({
            id: id(),
            description: v.description,
            category: v.category,
            amount: +v.amount,
            inflow: v.type === "in",
            createdAt: new Date().toISOString(),
          }),
      );
      setForm(null);
    },
    reportPortfolios = reportScope === "global" ? d.portfolios.filter((portfolio) => portfolio.currency === p.currency) : [p],
    reportOut = reportPortfolios.flatMap((portfolio) => portfolio.transactions).filter((t) => !t.inflow),
    out = p.transactions.filter((t) => !t.inflow),
    total = out.reduce((s, t) => s + t.amount, 0),
    catsum = Object.entries(
      reportOut.reduce(
        (a, t) => ((a[t.category] = (a[t.category] || 0) + t.amount), a),
        {},
      ),
    ),
    dashboardCurrencies = [...new Set(d.portfolios.map((portfolio) => portfolio.currency))],
    dashboard = dashboardCurrencies.map((currency) => {
      const portfolios = d.portfolios.filter((portfolio) => portfolio.currency === currency);
      const transactions = portfolios.flatMap((portfolio) => portfolio.transactions)
        .filter((transaction) => transaction.createdAt.slice(0, 7) === mo());
      const inflow = transactions.filter((transaction) => transaction.inflow).reduce((sum, transaction) => sum + transaction.amount, 0);
      const outflow = transactions.filter((transaction) => !transaction.inflow).reduce((sum, transaction) => sum + transaction.amount, 0);
      const netWorth = portfolios.reduce((sum, portfolio) => sum + bal(portfolio), 0);
      const caps = d.globalCaps[currency.toLowerCase()] || {};
      const alerts = Object.entries(caps).map(([category, cap]) => {
        const spent = transactions.filter((transaction) => !transaction.inflow && transaction.category === category).reduce((sum, transaction) => sum + transaction.amount, 0);
        return { category, cap: Number(cap), spent, ratio: Number(cap) ? spent / Number(cap) : 0 };
      }).filter((alert) => alert.ratio >= .9).sort((a, b) => b.ratio - a.ratio);
      return { currency, portfolios, inflow, outflow, netWorth, alerts };
    }),
    calendarStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    calendarDays = new Date(calendarStart.getFullYear(), calendarStart.getMonth() + 1, 0).getDate(),
    calendarCells = Array.from({ length: calendarStart.getDay() + calendarDays }, (_, index) => index < calendarStart.getDay() ? null : index - calendarStart.getDay() + 1);
  const createPlanTransaction = (plan) => up((next) => {
    const source = next.portfolios.find((portfolio) => portfolio.id === plan.portfolioId) || next.portfolios.find((portfolio) => portfolio.id === next.selected) || next.portfolios[0];
    if (!source) return;
    source.transactions.unshift({ id: id(), description: plan.description, category: plan.category, amount: plan.amount, inflow: false, createdAt: new Date().toISOString() });
    const destination = next.portfolios.find((portfolio) => portfolio.id === plan.destinationId);
    if (plan.savings && destination && destination.id !== source.id) destination.transactions.unshift({ id: id(), description: plan.description, category: plan.category, amount: plan.amount, inflow: true, createdAt: new Date().toISOString() });
    next.plans.find((item) => item.id === plan.id).last = mo();
  });
  const skipPlanTransaction = (plan) => {
    if (!confirm(`Skip ${plan.description} for this month? No transaction will be created.`)) return;
    up((next) => { next.plans.find((item) => item.id === plan.id).skipped = mo(); });
  };
  const trendMonths = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(); date.setMonth(date.getMonth() - (5 - index));
    return date.toISOString().slice(0, 7);
  });
  const trendTransactions = d.portfolios.flatMap((portfolio) => portfolio.transactions.map((transaction) => ({ ...transaction, portfolio }))).filter((transaction) => transaction.createdAt.slice(0, 7) === trendMonth);
  const trendInflow = trendTransactions.filter((transaction) => transaction.inflow).reduce((sum, transaction) => sum + transaction.amount, 0);
  const trendOutflow = trendTransactions.filter((transaction) => !transaction.inflow).reduce((sum, transaction) => sum + transaction.amount, 0);
  const trendTotal = trendInflow + trendOutflow || 1;
  const trendCategories = Object.entries(trendTransactions.filter((transaction) => !transaction.inflow).reduce((sum, transaction) => ((sum[transaction.category] = (sum[transaction.category] || 0) + transaction.amount), sum), {})).sort((a, b) => b[1] - a[1]);
  const removeTransaction = (transaction) => {
    if (!confirm("Delete this transaction and reverse its balance effect?")) return;
    const plan = d.plans.find(
      (item) =>
        item.last === mo() &&
        item.description === transaction.description &&
        item.amount === transaction.amount,
    );
    const removedIds = d.portfolios.flatMap((portfolio) =>
      portfolio.transactions
        .filter((item) =>
          item.id === transaction.id ||
          (plan?.savings &&
            item.description === plan.description &&
            item.amount === plan.amount &&
            item.createdAt.slice(0, 7) === mo()),
        )
        .map((item) => item.id),
    );
    up((next) => {
      next.portfolios.forEach((portfolio) => {
        portfolio.transactions = portfolio.transactions.filter((item) => {
          if (item.id === transaction.id) return false;
          return !(
            plan?.savings &&
            item.description === plan.description &&
            item.amount === plan.amount &&
            item.createdAt.slice(0, 7) === mo()
          );
        });
      });
      if (plan) next.plans.find((item) => item.id === plan.id).last = "";
    });
    if (user && removedIds.length) {
      supabase.from("finance_records")
        .update({ deleted_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("record_type", "transaction")
        .in("record_id", removedIds)
        .then(({ error }) => error && setSyncError(error.message));
    }
  };
  const saveTransactionEdit = (event) => {
    event.preventDefault();
    if (!editing) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const amount = Number(values.amount);
    if (!values.description.trim() || !Number.isFinite(amount) || amount <= 0) return;
    up((next) => {
      let original;
      next.portfolios.forEach((portfolio) => {
        const index = portfolio.transactions.findIndex(
          (transaction) => transaction.id === editing.transaction.id,
        );
        if (index >= 0) original = portfolio.transactions.splice(index, 1)[0];
      });
      const destination = next.portfolios.find(
        (portfolio) => portfolio.id === values.portfolio,
      );
      if (!original || !destination) return;
      destination.transactions.unshift({
        ...original,
        description: values.description.trim(),
        category: values.category,
        amount,
        inflow: values.type === "in",
        createdAt: new Date(values.createdAt).toISOString(),
      });
    });
    setEditing(null);
  };
  const resetPortfolio = (portfolio) => {
    if (!confirm(`Reset ${portfolio.name}? This permanently clears its transactions and resets its amount to zero. Category caps and portfolio settings will stay.`)) return;
    up((next) => {
      const target = next.portfolios.find((item) => item.id === portfolio.id);
      target.transactions = [];
      target.opening = 0;
      next.plans = next.plans.map((plan) => (plan.portfolioId || "main") === portfolio.id ? { ...plan, last: "", skipped: "" } : plan);
    });
  };
  const archivePlans = (planIds) => {
    if (!user || !planIds.length) return;
    supabase.from("finance_records")
      .update({ deleted_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("record_type", "plan")
      .in("record_id", planIds)
      .then(({ error }) => error && setSyncError(error.message));
  };
  const deleteMonthlyPlan = (plan) => {
    if (!confirm(`Delete monthly plan \"${plan.description}\"?`)) return;
    up((next) => {
      next.plans = next.plans.filter((item) => item.id !== plan.id);
    });
    archivePlans([plan.id]);
  };
  const removeDuplicatePlans = () => {
    const seen = new Set();
    const duplicates = d.plans.filter((plan) => {
      const key = planKey(plan);
      if (seen.has(key)) return true;
      seen.add(key);
      return false;
    });
    if (!duplicates.length) return;
    if (!confirm(`Remove ${duplicates.length} duplicate monthly plan${duplicates.length === 1 ? "" : "s"}?`)) return;
    const duplicateIds = new Set(duplicates.map((plan) => plan.id));
    up((next) => {
      next.plans = next.plans.filter((plan) => !duplicateIds.has(plan.id));
    });
    archivePlans([...duplicateIds]);
  };
  const deletePortfolio = (portfolio) => {
    const replacement = d.portfolios.find((item) =>
      item.id !== portfolio.id && item.name === "My portfolio SNB",
    ) || d.portfolios.find((item) => item.id !== portfolio.id);
    if (!replacement) {
      alert("Create another portfolio before deleting this one.");
      return;
    }
    if (!confirm(`Delete ${portfolio.name} and all of its transactions? ${replacement.name} will become the active portfolio.`)) return;
    const transactionIds = portfolio.transactions.map((transaction) => transaction.id);
    const planIds = d.plans
      .filter((plan) => plan.portfolioId === portfolio.id || plan.destinationId === portfolio.id)
      .map((plan) => plan.id);
    up((next) => {
      next.portfolios = next.portfolios.filter((item) => item.id !== portfolio.id);
      next.plans = next.plans.filter((plan) =>
        plan.portfolioId !== portfolio.id && plan.destinationId !== portfolio.id,
      );
      next.selected = replacement.id;
    });
    if (user) {
      const archive = (recordType, recordIds) => recordIds.length
        ? supabase.from("finance_records")
          .update({ deleted_at: new Date().toISOString() })
          .eq("user_id", user.id)
          .eq("record_type", recordType)
          .in("record_id", recordIds)
        : Promise.resolve({ error: null });
      Promise.all([
        archive("portfolio", [portfolio.id]),
        archive("transaction", transactionIds),
        archive("plan", planIds),
      ]).then((results) => {
        const error = results.find((result) => result.error)?.error;
        if (error) setSyncError(error.message);
      });
    }
  };
  if (!cloudEnabled) return <main className="auth-gate"><section><b>MY EXPENSIA</b><h1>Cloud setup required</h1><p>This protected app needs its Supabase configuration before it can open.</p></section></main>;
  if (!user) return <main className="auth-gate"><section><b>MY EXPENSIA</b><h1>Sign in to your finance data</h1><p>Your portfolios and transactions are private to your account.</p><form className="auth-form" onSubmit={signIn}><input name="email" type="email" autoComplete="email" placeholder="Email address" required /><input name="password" type="password" autoComplete="current-password" placeholder="Password" minLength="6" required /><button>Sign in</button><button type="button" className="secondary" onClick={(event) => signIn({ preventDefault: () => {}, currentTarget: event.currentTarget.form }, true)}>Create account</button>{authMessage && <small>{authMessage}</small>}</form></section></main>;
  return (
    <div className="app">
      <aside>
        <h1>
          MY <i>EXPENSIA</i>
        </h1>
        {["Dashboard", "Home", "Report", "Trends", "Bill calendar", "Plans", "History", "Settings"].map((x) => (
          <button className={tab === x ? "on" : ""} onClick={() => setTab(x)}>
            {x}
          </button>
        ))}
        <small>Local-first personal finance</small>
      </aside>
      <main
        onClickCapture={(event) => {
          if (event.target.closest?.(".cloud-status")) {
            event.preventDefault();
            event.stopPropagation();
            refreshCloud();
          }
        }}
      >
        <header>
          <div>
            <b>PERSONAL FINANCE</b>
            <h2>{tab}</h2>
          </div>
          <div className="header-actions"><button className="cloud-status" title={`Cloud account: ${user.email}`} onClick={() => setTab("Settings")}>☁</button><select
            value={p.id}
            onChange={(e) => up((x) => (x.selected = e.target.value))}
          >
            {d.portfolios.map((x) => (
              <option value={x.id}>{x.name}</option>
            ))}
          </select></div>
        </header>
        {tab === "Dashboard" && (
          <section className="dashboard">
            <p className="dashboard-intro">This month across all portfolios. Values stay separated by currency.</p>
            {dashboard.map((summary) => {
              const format = (amount) => new Intl.NumberFormat("en", { style: "currency", currency: summary.currency }).format(amount);
              return <article className="dashboard-currency" key={summary.currency}>
                <div className="dashboard-currency-heading"><div><small>{summary.currency}</small><h3>{summary.currency} overview</h3></div><span>{summary.portfolios.length} portfolios</span></div>
                <div className="dashboard-metrics">
                  <div><small>MONTHLY INFLOW</small><b className="green">{format(summary.inflow)}</b></div>
                  <div><small>MONTHLY OUTFLOW</small><b className="redtext">{format(summary.outflow)}</b></div>
                  <div><small>NET CASHFLOW</small><b className={summary.inflow - summary.outflow >= 0 ? "green" : "redtext"}>{format(summary.inflow - summary.outflow)}</b></div>
                  <div><small>NET WORTH</small><b>{format(summary.netWorth)}</b></div>
                </div>
                <div className="budget-alerts"><h4>Budget alerts</h4>{summary.alerts.length ? summary.alerts.map((alert) => <div className="budget-alert" key={alert.category}><span>{icon[alert.category] || "*"} {alert.category}</span><b>{(alert.ratio * 100).toFixed(0)}% used</b><small>{format(alert.spent)} of {format(alert.cap)} monthly cap</small></div>) : <p>No category is at 90% of its monthly cap.</p>}</div>
              </article>;
            })}
          </section>
        )}
        {tab === "Home" && (
          <>
            <section className="hero">
              <div>
                <small>{p.type === "creditCard" ? "CREDIT CARD" : "ACTIVE PORTFOLIO"}</small>
                <h2>{p.name}</h2>
                <strong>{fmt(p, p.type === "creditCard" ? outstanding(p) : bal(p))}</strong>
                {p.type === "creditCard" && <small>Outstanding of {fmt(p, Number(p.creditLimit) || 0)} limit. Available: {fmt(p, availableCredit(p))}</small>}
              </div>
              <div>
                <button onClick={() => setForm("in")}>+ {p.type === "creditCard" ? "Payment" : "Inflow"}</button>
                <button className="red" onClick={() => setForm("out")}>
                  − {p.type === "creditCard" ? "Card charge" : "Outflow"}
                </button>
              </div>
            </section>
            <section className="stats">
              <article>
                INFLOW
                <b>
                  {fmt(
                    p,
                    p.transactions
                      .filter((t) => t.inflow)
                      .reduce((s, t) => s + t.amount, 0),
                  )}
                </b>
              </article>
              <article>
                OUTFLOW<b className="redtext">{fmt(p, total)}</b>
              </article>
              <article onClick={() => setTab("Report")}>
                SPENDING PULSE
                <b>{total ? "View report →" : "No spending yet"}</b>
              </article>
            </section>
            <div className="recent-heading"><h3>Recent transactions</h3><div className="scope-switch"><button className={recentScope === "portfolio" ? "on" : ""} onClick={() => setRecentScope("portfolio")}>This portfolio</button><button className={recentScope === "global" ? "on" : ""} onClick={() => setRecentScope("global")}>All portfolios</button></div></div>
            <Rows
              rows={(recentScope === "global" ? d.portfolios.flatMap((portfolio) => portfolio.transactions.map((transaction) => ({ ...transaction, sourcePortfolio: portfolio }))) : p.transactions.map((transaction) => ({ ...transaction, sourcePortfolio: p })))
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .slice(0, 8)}
              p={p}
            />
          </>
        )}
        {tab === "Report" && (
          <>
            <div className="recent-heading"><p>Category outflow in {reportScope === "global" ? "all portfolios" : p.name}</p><div className="scope-switch"><button className={reportScope === "portfolio" ? "on" : ""} onClick={() => setReportScope("portfolio")}>This portfolio</button><button className={reportScope === "global" ? "on" : ""} onClick={() => setReportScope("global")}>All portfolios</button></div></div>
            {catsum.map(([c, n]) => {
              let cap = reportScope === "global" ? d.globalCaps[p.currency.toLowerCase()]?.[c] : p.caps[c],
                used = reportOut
                  .filter(
                    (t) => t.category === c && t.createdAt.slice(0, 7) === mo(),
                  )
                  .reduce((s, t) => s + t.amount, 0),
                r = cap ? used / cap : n / total;
              return (
                <article className="cap">
                  <span>
                    {icon[c] || "✨"} {c}
                  </span>
                  <b>{fmt(p, n)}</b>
                  <div>
                    <i
                      className={r >= 0.9 ? "over" : ""}
                      style={{ width: `${Math.min(r, 1) * 100}%` }}
                    />
                  </div>
                  <small>
                    {cap
                      ? `${fmt(p, used)} / ${fmt(p, cap)} · ${(r * 100).toFixed(1)}%`
                      : `${(r * 100).toFixed(1)}% of outflow`}
                  </small>
                </article>
              );
            })}
          </>
        )}
        {tab === "Trends" && <section className="trends"><div className="recent-heading"><div><small>ANALYTICS</small><h3>Spending trends</h3></div><select value={trendMonth} onChange={(event) => setTrendMonth(event.target.value)}>{trendMonths.map((month) => <option key={month}>{month}</option>)}</select></div><div className="trend-top"><article className="trend-donut-card"><h4>Inflow vs outflow</h4><div className="trend-donut" style={{ background: `conic-gradient(#62c9ba 0 ${(trendInflow / trendTotal) * 100}%, #ffd06b ${(trendInflow / trendTotal) * 100}% 100%)` }}><span><b>{trendOutflow ? `${(trendOutflow / trendTotal * 100).toFixed(0)}%` : "0%"}</b><small>outflow</small></span></div><div className="trend-legend"><span><i className="legend-in" />Inflow</span><span><i className="legend-out" />Outflow</span></div></article><article className="trend-bar-card"><h4>Monthly cashflow</h4><div className="trend-chart">{trendMonths.map((month) => { const transactions = d.portfolios.flatMap((portfolio) => portfolio.transactions).filter((transaction) => transaction.createdAt.slice(0, 7) === month); const inflow = transactions.filter((transaction) => transaction.inflow).reduce((sum, transaction) => sum + transaction.amount, 0); const outflow = transactions.filter((transaction) => !transaction.inflow).reduce((sum, transaction) => sum + transaction.amount, 0); const max = Math.max(...trendMonths.map((key) => d.portfolios.flatMap((portfolio) => portfolio.transactions).filter((transaction) => transaction.createdAt.slice(0, 7) === key).reduce((sum, transaction) => sum + transaction.amount, 0)), 1); return <div className="trend-month" key={month}><div><i className="trend-in" style={{ height: `${inflow / max * 100}%` }} /><i className="trend-out" style={{ height: `${outflow / max * 100}%` }} /></div><small>{month.slice(5)}</small></div>; })}</div></article></div><div className="trend-kpis"><article><small>MONTHLY INFLOW</small><b className="green">{trendInflow.toFixed(2)}</b></article><article><small>MONTHLY OUTFLOW</small><b className="redtext">{trendOutflow.toFixed(2)}</b></article><article><small>NET CASHFLOW</small><b className={trendInflow >= trendOutflow ? "green" : "redtext"}>{(trendInflow - trendOutflow).toFixed(2)}</b></article></div><h3>Category outflow for {trendMonth}</h3>{trendCategories.length ? trendCategories.map(([category, amount]) => <article className="cap" key={category}><span>{icon[category] || "*"} {category}</span><b>{amount.toFixed(2)}</b><small>{trendTransactions.filter((transaction) => !transaction.inflow && transaction.category === category).map((transaction) => transaction.portfolio.currency).filter((value, index, list) => list.indexOf(value) === index).join(", ")}</small></article>) : <p>No outflows recorded for this month.</p>}</section>}
        {tab === "Bill calendar" &&
          <section className="plan-calendar">
            <div className="plan-calendar-heading"><div><small>RECURRING BILLS</small><h3>{calendarStart.toLocaleString("en", { month: "long", year: "numeric" })}</h3></div><span>{d.plans.filter((plan) => plan.last !== mo() && plan.skipped !== mo()).length} pending</span></div>
            <div className="calendar-weekdays">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <small key={day}>{day}</small>)}</div>
            <div className="calendar-grid">{calendarCells.map((day, index) => {
              const plans = day ? d.plans.filter((plan) => Number(plan.dueDay || 1) === day) : [];
              return <div className={`calendar-day ${day === new Date().getDate() ? "today" : ""}`} key={`${day || "blank"}-${index}`}>{day && <><b>{day}</b>{plans.map((plan) => { const done = plan.last === mo() || plan.skipped === mo(); return <button className={`calendar-plan ${done ? "done" : ""}`} key={plan.id} title={`${plan.description}: ${done ? plan.skipped === mo() ? "Skipped" : "Created" : "Pending"}`} onClick={() => !done && createPlanTransaction(plan)}>{icon[plan.category] || "*"} {plan.description}</button>; })}</>}</div>;
            })}</div>
            <small className="calendar-help">Select a pending bill to create it now. Due-date reminders are sent on Android for recurring plans.</small>
          </section>
        }
        {tab === "Plans" && <>
          <div className="plans-list">
          {d.plans.map((x) => {
            const skipped = x.skipped === mo();
            const completed = x.last === mo() || skipped;
            return <article className="plan" key={x.id}>
              <span>{x.savings ? "◈" : icon[x.category] || "✨"}</span>
              <div>
                <b>{x.description}</b>
                <small>
                  {x.savings ? "Savings transfer" : "Regular outflow"} · due day
                  {x.dueDay || 1}
                </small>
              </div>
              <b>{fmt(p, x.amount)}</b>
              {!completed && <button onClick={() => createPlanTransaction(x)}>
                Create now
              </button>}
              {!completed && <button className="skip-plan" onClick={() => skipPlanTransaction(x)}>Skip this month</button>}
              {completed && <span className="plan-status">{skipped ? "Skipped this month" : "Created this month"}</span>}
            </article>;
          })}</div>
        </>}
        {tab === "History" && (
          <>
            <div className="recent-heading"><p className="history-context">Transactions in {historyScope === "global" ? "all portfolios" : p.name}</p><div className="scope-switch"><button className={historyScope === "portfolio" ? "on" : ""} onClick={() => setHistoryScope("portfolio")}>This portfolio</button><button className={historyScope === "global" ? "on" : ""} onClick={() => setHistoryScope("global")}>All portfolios</button></div></div>
            <Rows
              rows={(historyScope === "global" ? d.portfolios.flatMap((portfolio) => portfolio.transactions.map((transaction) => ({ ...transaction, sourcePortfolio: portfolio }))) : p.transactions.map((transaction) => ({ ...transaction, sourcePortfolio: p })))
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))}
              p={p}
              del={removeTransaction}
              edit={(transaction) => setEditing({ transaction, portfolioId: transaction.sourcePortfolio?.id || p.id })}
            />
          </>
        )}{" "}
        {tab === "Settings" && (
          <section className="settings">
            <h3>Cloud sync</h3>
            {!cloudEnabled ? (
              <p>Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to a `.env` file, then restart the app.</p>
            ) : <><p>Connected as {user.email}. Your data is syncing securely across browsers.</p>{syncError && <p className="sync-error">Cloud sync failed: {syncError}</p>}<button type="button" onClick={copyApiToken}>Copy API access token</button>{apiMessage && <p className="api-message">{apiMessage}</p>}<button onClick={() => supabase.auth.signOut()}>Sign out</button></>}
            <button className="caps-toggle" onClick={() => setPortfoliosOpen(!portfoliosOpen)}>Portfolios ({d.portfolios.length}) <span>{portfoliosOpen ? "-" : "+"}</span></button>
            {portfoliosOpen && <><p className="section-hint">Manage bank accounts, savings portfolios, and credit cards.</p>
            {d.portfolios.map((x) => (
              <label key={x.id}>
                <input className="portfolio-name" value={x.name} aria-label="Portfolio name" onChange={(e) => up((z) => (z.portfolios.find((q) => q.id === x.id).name = e.target.value))} />
                <span className="portfolio-controls"><select
                    value={x.currency}
                    onChange={(e) =>
                      up(
                        (z) =>
                          (z.portfolios.find((q) => q.id === x.id).currency =
                            e.target.value),
                      )
                    }
                  >
                    <option>SAR</option>
                    <option>USD</option>
                    <option>JOD</option>
                  </select><select value={x.type || "bank"} onChange={(e) => up((z) => (z.portfolios.find((q) => q.id === x.id).type = e.target.value))}><option value="bank">Bank / cash</option><option value="creditCard">Credit card</option></select>{x.type === "creditCard" && <input type="number" min="0" step=".01" aria-label="Credit limit" value={x.creditLimit || ""} placeholder="Credit limit" onChange={(e) => up((z) => (z.portfolios.find((q) => q.id === x.id).creditLimit = Number(e.target.value) || 0))} />}<button type="button" className="reset-portfolio" onClick={() => resetPortfolio(x)}>Reset data</button><button type="button" className="delete-portfolio" onClick={() => deletePortfolio(x)}>Delete</button></span>
              </label>
            ))}
            <button
              onClick={() => {
                let n = prompt("Portfolio name");
                if (n) {
                  const type = confirm("Create this as a credit card? Select Cancel for a bank / cash portfolio.") ? "creditCard" : "bank";
                  const creditLimit = type === "creditCard" ? Number(prompt("Credit limit", "0")) || 0 : 0;
                  if (type === "creditCard" && creditLimit <= 0) return;
                  up((x) =>
                    x.portfolios.push({
                      id: id(),
                      name: n,
                      currency: "SAR",
                      opening: 0,
                      type,
                      creditLimit,
                      caps: {},
                      transactions: [],
                    }),
                  );
                }
              }}
            >
              Add portfolio
            </button></>}
            <button
              className="caps-toggle"
              onClick={() => setPlansOpen(!plansOpen)}
            >
              Monthly plans <span>{plansOpen ? "-" : "+"}</span>
            </button>
            {plansOpen && (
              <div className="plans-settings">
                <button className="remove-duplicates" onClick={removeDuplicatePlans}>
                  Remove duplicate plans
                </button>
                {d.plans.map((plan) => (
                  <div className="plan-editor" key={plan.id}>
                    <input
                      value={plan.description}
                      onChange={(e) =>
                        up(
                          (x) =>
                            (x.plans.find((q) => q.id === plan.id).description =
                              e.target.value),
                        )
                      }
                    />
                    <select
                      value={plan.category}
                      onChange={(e) =>
                        up(
                          (x) =>
                            (x.plans.find((q) => q.id === plan.id).category =
                              e.target.value),
                        )
                      }
                    >
                      {d.categories.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={plan.amount}
                      onChange={(e) =>
                        up(
                          (x) =>
                            (x.plans.find((q) => q.id === plan.id).amount =
                              +e.target.value),
                        )
                      }
                    />
                    <select
                      value={plan.portfolioId || "main"}
                      onChange={(e) =>
                        up(
                          (x) =>
                            (x.plans.find((q) => q.id === plan.id).portfolioId =
                              e.target.value),
                        )
                      }
                    >
                      {d.portfolios.map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.name}
                        </option>
                      ))}
                    </select>
                    <label className="saving-toggle">
                      Savings{" "}
                      <input
                        type="checkbox"
                        checked={plan.savings}
                        onChange={(e) =>
                          up(
                            (x) =>
                              (x.plans.find((q) => q.id === plan.id).savings =
                                e.target.checked),
                          )
                        }
                      />
                    </label>
                    <button
                      className="delete-plan"
                      onClick={() => deleteMonthlyPlan(plan)}
                    >
                      Delete
                    </button>
                  </div>
                ))}
                <button
                  onClick={() =>
                    up((x) =>
                      x.plans.push({
                        id: id(),
                        description: "New monthly plan",
                        category: x.categories[0],
                        amount: 0,
                        savings: false,
                        portfolioId: x.selected,
                        last: "",
                      }),
                    )
                  }
                >
                  Add monthly plan
                </button>
              </div>
            )}
            <button
              className="caps-toggle"
              onClick={() => setCapsOpen(!capsOpen)}
            >
              Monthly category caps <span>{capsOpen ? "-" : "+"}</span>
            </button>
            {capsOpen &&
              <section className="caps-settings"><div className="cap-mode"><div><b>Cap scope</b><small>{capsShared ? `One cap shared by all ${p.currency} portfolios.` : `A separate cap for ${p.name}.`}</small></div><select value={capsShared ? "shared" : "portfolio"} onChange={(event) => setCapsShared(event.target.value === "shared")}><option value="portfolio">Per portfolio</option><option value="shared">Shared: {p.currency}</option></select></div>
              {d.categories.filter((c) => capsShared ? d.globalCaps[p.currency.toLowerCase()]?.[c] : p.caps[c]).map((c) => (
                <div className="cap-editor" key={c}>
                  <span className={`cap-scope ${capsShared ? "shared" : ""}`}>{capsShared ? `Shared ${p.currency}` : "Per portfolio"}</span>
                  {icon[c] || "•"} {c}
                  <input
                    type="number"
                    min="0"
                    step=".01"
                    placeholder="No cap"
                    value={(capsShared ? d.globalCaps[p.currency.toLowerCase()]?.[c] : p.caps[c]) || ""}
                    onChange={(e) =>
                      up((x) => {
                        let v = capsShared ? (x.globalCaps[p.currency.toLowerCase()] ||= {}) : x.portfolios.find((q) => q.id === x.selected).caps;
                        e.target.value ? (v[c] = +e.target.value) : delete v[c];
                      })
                    }
                  />
                  <button
                    type="button"
                    className="remove-cap"
                    disabled={!(capsShared ? d.globalCaps[p.currency.toLowerCase()]?.[c] : p.caps[c])}
                    onClick={() =>
                      up((x) => {
                        if (capsShared) delete x.globalCaps[p.currency.toLowerCase()]?.[c];
                        else delete x.portfolios.find((q) => q.id === x.selected).caps[c];
                      })
                    }
                  >
                    Remove cap
                  </button>
                </div>
              ))}
              {newCap ? <div className="cap-editor cap-new"><select value={newCap.category} onChange={(event) => setNewCap({ ...newCap, category: event.target.value })}>{d.categories.map((category) => <option key={category}>{category}</option>)}</select><input type="number" min="0.01" step=".01" placeholder="Monthly cap" value={newCap.amount} onChange={(event) => setNewCap({ ...newCap, amount: event.target.value })} /><button type="button" onClick={() => { const amount = Number(newCap.amount); if (!amount) return; up((x) => { const caps = capsShared ? (x.globalCaps[p.currency.toLowerCase()] ||= {}) : x.portfolios.find((q) => q.id === x.selected).caps; caps[newCap.category] = amount; }); setNewCap(null); }}>Add cap</button><button type="button" className="remove-cap" onClick={() => setNewCap(null)}>Cancel</button></div> : <button type="button" className="add-cap" onClick={() => setNewCap({ category: d.categories[0], amount: "" })}>+ Add cap</button>}
              </section>}
            <button
              className="caps-toggle"
              onClick={() => setCategoriesOpen(!categoriesOpen)}
            >
              Categories <span>{categoriesOpen ? "-" : "+"}</span>
            </button>
            {categoriesOpen && (
              <div className="categories-settings">
                <div className="category-list">
                  {d.categories.map((c) => (
                    <span key={c}>
                      {icon[c] || "•"} {c}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => {
                    let c = prompt("Category name");
                    if (c && !d.categories.includes(c)) {
                      up((x) => x.categories.push(c));
                    }
                  }}
                >
                  Add category
                </button>
              </div>
            )}
            <button className="caps-toggle" onClick={() => setBackupsOpen(!backupsOpen)}>Import, export, and backups <span>{backupsOpen ? "-" : "+"}</span></button>
            {backupsOpen && <div className="backup-tools"><p className="section-hint">Exported CSV files open in Excel. Imports validate rows and skip exact duplicates. Cloud backups are also created automatically each week while you use the app.</p><div className="data-tools"><button type="button" onClick={exportCsv}>Export transactions CSV</button><button type="button" className="secondary" onClick={() => csvInputRef.current?.click()}>Import transactions CSV</button><button type="button" className="secondary" onClick={createBackup}>Create cloud backup</button><input ref={csvInputRef} type="file" accept=".csv,text/csv" hidden onChange={importCsv} /></div>{transferMessage && <p className="api-message">{transferMessage}</p>}</div>}
          </section>
        )}
      </main>
      {form && (
        <div className="modal">
          <form onSubmit={add}>
            <h2>Add {form === "in" ? "inflow" : "outflow"}</h2>
            <input name="description" placeholder="Description" required />
            <input
              name="amount"
              type="number"
              step=".01"
              placeholder="Amount"
              required
            />
            <select name="portfolio" defaultValue={p.id}>
              {d.portfolios.map((x) => (
                <option value={x.id}>{x.name}</option>
              ))}
            </select>
            <select name="category">
              {d.categories.map((x) => (
                <option>{x}</option>
              ))}
            </select>
            <input name="type" value={form} hidden />
            <button>Save transaction</button>
            <button type="button" onClick={() => setForm(null)}>
              Cancel
            </button>
          </form>
        </div>
      )}
      {editing && (
        <div className="modal">
          <form onSubmit={saveTransactionEdit}>
            <h2>Edit transaction</h2>
            <input name="description" defaultValue={editing.transaction.description} placeholder="Description" required />
            <input name="amount" type="number" step=".01" min="0.01" defaultValue={editing.transaction.amount} required />
            <input name="createdAt" type="datetime-local" defaultValue={localDateTime(editing.transaction.createdAt)} required />
            <select name="portfolio" defaultValue={editing.portfolioId}>
              {d.portfolios.map((portfolio) => <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>)}
            </select>
            <select name="category" defaultValue={editing.transaction.category}>
              {d.categories.map((category) => <option key={category}>{category}</option>)}
            </select>
            <select name="type" defaultValue={editing.transaction.inflow ? "in" : "out"}>
              <option value="in">Inflow</option>
              <option value="out">Outflow</option>
            </select>
            <button>Save changes</button>
            <button type="button" onClick={() => setEditing(null)}>Cancel</button>
          </form>
        </div>
      )}
    </div>
  );
}
function Rows({ rows, p, del, edit }) {
  return (
    <div className="rows">
      {rows.map((t) => (
        <article className={!edit && !del ? "read-only" : ""}>
          <span>{icon[t.category] || "✨"}</span>
          <div>
            <b>{t.description}</b>
            {t.sourcePortfolio && <small className="source-portfolio">{t.sourcePortfolio.name}</small>}
            <small>
              {t.port || t.category} · {t.category} ·{" "}
              {new Date(t.createdAt).toLocaleString("en-GB")}
            </small>
          </div>
          <strong className={t.inflow ? "green" : "redtext"}>
            {t.inflow ? "+" : "−"}
            {fmt(t.sourcePortfolio || p, t.amount)}
          </strong>
          {edit && <button className="edit-transaction" type="button" aria-label={`Edit ${t.description}`} title="Edit transaction" onClick={() => edit(t)}>✎</button>}
          <button onClick={() => del(t)}>×</button>
        </article>
      ))}
    </div>
  );
}
export default App;
