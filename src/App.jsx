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
  portfolioIcons = {
    bank: "\u{1F3E6}", wallet: "\u{1F45B}", savings: "\u{1F4B0}",
    card: "\u{1F4B3}", investment: "\u{1F4C8}", cash: "\u{1F4B5}", home: "\u{1F3E0}",
  },
  portfolioIcon = (portfolio) => portfolioIcons[portfolio.iconKey] || (portfolio.type === "creditCard" ? portfolioIcons.card : portfolio.name?.toLowerCase().includes("saving") ? portfolioIcons.savings : portfolioIcons.bank),
  mo = () => new Date().toISOString().slice(0, 7),
  planFrequencyLabel = (frequency) => ({ monthly: "Monthly", semiAnnual: "Every 6 months", annual: "Annual" }[frequency || "monthly"]),
  planOccurs = (plan, date = new Date()) => {
    const frequency = plan.frequency || "monthly";
    const anchor = Number(plan.anchorMonth || 1);
    return frequency === "monthly" || (frequency === "annual" ? date.getMonth() + 1 === anchor : (date.getMonth() + 1 - anchor) % 6 === 0);
  },
  planPeriod = (plan, date = new Date()) => (plan.frequency || "monthly") === "annual" ? String(date.getFullYear()) : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
  planCompleted = (plan, date = new Date()) => !planOccurs(plan, date) || plan.last === planPeriod(plan, date) || plan.skipped === planPeriod(plan, date) || (plan.earlyPaid || []).includes(planPeriod(plan, date)),
  nextPlanOccurrence = (plan, from = new Date()) => {
    for (let offset = 1; offset <= 24; offset += 1) {
      const candidate = new Date(from.getFullYear(), from.getMonth() + offset, 1);
      if (planOccurs(plan, candidate)) return candidate;
    }
    return new Date(from.getFullYear(), from.getMonth() + 1, 1);
  },
  planSort = (a, b) => {
    const order = { monthly: 0, semiAnnual: 1, annual: 2 };
    const frequency = (order[a.frequency || "monthly"] ?? 0) - (order[b.frequency || "monthly"] ?? 0);
    return frequency || Number(a.dueDay || 1) - Number(b.dueDay || 1) || a.description.localeCompare(b.description);
  },
  localDateTime = (value) => {
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  },
  seed = {
    selected: "main",
    profile: "",
    readActivityIds: [],
    globalCaps: {},
    capCycleStarts: {},
    loans: [],
    categories: cats,
    portfolios: [
      {
        id: "main",
        name: "My portfolio",
        currency: "SAR",
        opening: 0,
        type: "bank",
        iconKey: "bank",
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
        iconKey: "savings",
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
  readActivityIds: state.readActivityIds || [],
  globalCaps: Object.fromEntries(Object.entries(state.globalCategoryCaps || {}).map(([currency, caps]) => [currency.toLowerCase(), caps])),
  capCycleStarts: Object.fromEntries(Object.entries(state.capCycleStarts || {}).map(([currency, start]) => [currency.toLowerCase(), start])),
  loans: state.loans || [],
  categories: state.categories || cats,
  portfolios: (state.portfolios || []).map((portfolio) => ({
    id: portfolio.id,
    name: portfolio.name,
    currency: String(portfolio.currency || "sar").toUpperCase(),
    opening: portfolio.opening || 0,
    type: portfolio.type || "bank",
    iconKey: portfolio.iconKey,
    creditLimit: portfolio.creditLimit || 0,
    caps: portfolio.categoryCaps || {},
    transactions: portfolio.transactions || [],
  })),
  plans: (state.monthlyPlans || []).map((plan) => ({
    id: plan.id,
    description: plan.description,
    category: plan.category,
    amount: plan.amount,
    savings: Boolean(plan.savingsTransfer),
    destinationId: plan.destinationPortfolioId,
    portfolioId: plan.portfolioId,
    dueDay: plan.dueDay || 1,
    recurring: plan.recurring ?? true,
    frequency: plan.frequency || "monthly",
    anchorMonth: plan.anchorMonth || 1,
    last: plan.lastCreatedMonth || "",
    skipped: plan.lastSkippedMonth || "",
    earlyPaid: plan.paidEarlyPeriods || [],
  })),
});
const toFlutterState = (data, previous) => ({
  ...previous,
  name: data.profile || previous.name || "",
  readActivityIds: data.readActivityIds || [],
  selectedId: data.selected,
  globalCategoryCaps: data.globalCaps || {},
  capCycleStarts: data.capCycleStarts || previous.capCycleStarts || {},
  loans: data.loans || previous.loans || [],
  categories: data.categories,
  portfolios: data.portfolios.map((portfolio) => {
    const existing = (previous.portfolios || []).find((item) => item.id === portfolio.id) || {};
    return { ...existing, id: portfolio.id, name: portfolio.name, opening: portfolio.opening, currency: String(portfolio.currency).toLowerCase(), type: portfolio.type || "bank", iconKey: portfolio.iconKey, creditLimit: portfolio.creditLimit || 0, categoryCaps: portfolio.caps || {}, transactions: portfolio.transactions || [] };
  }),
  monthlyPlans: data.plans.map((plan) => {
    const existing = (previous.monthlyPlans || []).find((item) => item.id === plan.id) || {};
    return { ...existing, id: plan.id, description: plan.description, category: plan.category, amount: plan.amount, savingsTransfer: Boolean(plan.savings), destinationPortfolioId: plan.destinationId || existing.destinationPortfolioId, portfolioId: plan.portfolioId || existing.portfolioId || data.selected, dueDay: plan.dueDay || existing.dueDay || 1, recurring: plan.recurring ?? existing.recurring ?? true, frequency: plan.frequency || existing.frequency || "monthly", anchorMonth: plan.anchorMonth || existing.anchorMonth || 1, lastCreatedMonth: plan.last || null, lastSkippedMonth: plan.skipped || null, paidEarlyPeriods: plan.earlyPaid || existing.paidEarlyPeriods || [] };
  }),
});
const fromSharedRecords = (records) => {
  const active = records.filter((record) => !record.deleted_at);
  const profile = active.find((record) => record.record_type === "profile")?.payload || {};
  const category = active.find((record) => record.record_type === "category")?.payload || {};
  const portfolios = active
    .filter((record) => record.record_type === "portfolio")
    .map((record) => ({ ...record.payload, type: record.payload.type || "bank", iconKey: record.payload.iconKey, creditLimit: record.payload.creditLimit || 0, caps: record.payload.categoryCaps || record.payload.caps || {}, transactions: [] }));
  if (!portfolios.length) return null;
  const globalCaps = Object.fromEntries(Object.entries(profile.globalCategoryCaps || {}).map(([currency, caps]) => [currency.toLowerCase(), structuredClone(caps)]));
  const capCycleStarts = Object.fromEntries(Object.entries(profile.capCycleStarts || {}).map(([currency, start]) => [currency.toLowerCase(), start]));
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
      frequency: plan.frequency || "monthly",
      anchorMonth: plan.anchorMonth || 1,
      last: plan.last || plan.lastCreatedMonth || "",
      skipped: plan.skipped || plan.lastSkippedMonth || "",
      earlyPaid: plan.earlyPaid || plan.paidEarlyPeriods || [],
    };
  });
  const loans = active.filter((record) => record.record_type === "loan").map((record) => record.payload);
  return {
    selected,
    profile: profile.name || "",
    readActivityIds: profile.readActivityIds || [],
    globalCaps,
    capCycleStarts,
    categories: category.categories || cats,
    portfolios,
    plans,
    loans,
  };
};
const toSharedRecords = (userId, data) => [
  { user_id: userId, record_type: "profile", record_id: "settings", payload: { name: data.profile, selectedId: data.selected, globalCategoryCaps: data.globalCaps || {}, capCycleStarts: data.capCycleStarts || {}, capsSharedVersion: 2, readActivityIds: data.readActivityIds || [] } },
  { user_id: userId, record_type: "category", record_id: "all", payload: { categories: data.categories, icons: {} } },
  ...data.portfolios.flatMap((portfolio) => [
    { user_id: userId, record_type: "portfolio", record_id: portfolio.id, payload: { id: portfolio.id, name: portfolio.name, opening: portfolio.opening, currency: String(portfolio.currency).toLowerCase(), type: portfolio.type || "bank", iconKey: portfolio.iconKey, creditLimit: portfolio.creditLimit || 0, categoryCaps: portfolio.caps || {} } },
    ...portfolio.transactions.map((transaction) => ({ user_id: userId, record_type: "transaction", record_id: transaction.id, payload: { ...transaction, portfolioId: portfolio.id }, deleted_at: null })),
  ]),
  ...data.plans.map((plan) => ({ user_id: userId, record_type: "plan", record_id: plan.id, payload: { ...plan, frequency: plan.frequency || "monthly", anchorMonth: plan.anchorMonth || 1, savingsTransfer: Boolean(plan.savings), lastCreatedMonth: plan.last || null, lastSkippedMonth: plan.skipped || null, paidEarlyPeriods: plan.earlyPaid || [] } })),
  ...(data.loans || []).map((loan) => ({ user_id: userId, record_type: "loan", record_id: loan.id, payload: loan })),
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
  const [notificationsOpen, setNotificationsOpen] = useState(false);
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
    capCycleStart = (currency) => new Date(d.capCycleStarts?.[currency.toLowerCase()] || 0),
    inCapCycle = (transaction, currency) => new Date(transaction.createdAt) >= capCycleStart(currency),
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
    availableCredit = (x) => Math.max(0, (Number(x.creditLimit) || 0) + bal(x)),
    setCurrentAmount = (portfolioId, target) => up((next) => {
      const portfolio = next.portfolios.find((item) => item.id === portfolioId);
      const amount = Number(target);
      if (!portfolio || !Number.isFinite(amount) || amount < 0) return;
      const transactionNet = portfolio.transactions.reduce((sum, transaction) => sum + (transaction.inflow ? transaction.amount : -transaction.amount), 0);
      portfolio.opening = portfolio.type === "creditCard"
        ? amount - (Number(portfolio.creditLimit) || 0) - transactionNet
        : amount - transactionNet;
    }),
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
                inCapCycle(t, q.currency),
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
    transferMoney = (e) => {
      e.preventDefault();
      const values = Object.fromEntries(new FormData(e.currentTarget));
      const amount = Number(values.amount);
      const quotedRate = Number(values.transferRate);
      const actualReceived = Number(values.actualReceived);
      const fee = Number(values.transferFee || 0);
      const source = d.portfolios.find((portfolio) => portfolio.id === values.source);
      const destination = d.portfolios.find((portfolio) => portfolio.id === values.destination);
      const crossCurrency = source && destination && source.currency !== destination.currency;
      if (!source || !destination || source.id === destination.id || !Number.isFinite(amount) || amount <= 0 || fee < 0 || (crossCurrency && (!Number.isFinite(quotedRate) || quotedRate <= 0 || !Number.isFinite(actualReceived) || actualReceived <= 0))) {
        alert(crossCurrency ? "Enter the amount sent, quoted rate, and actual amount received." : "Choose two different portfolios and enter a valid amount.");
        return;
      }
      const transferId = `transfer_${id()}`;
      const createdAt = new Date().toISOString();
      const description = values.description.trim() || (destination.type === "creditCard" ? `Payment to ${destination.name}` : `Transfer to ${destination.name}`);
      const expectedReceived = crossCurrency ? amount / quotedRate : null;
      up((next) => {
        const transferData = crossCurrency ? { transferRate: quotedRate, expectedReceived, actualReceived, transferFee: fee || null, destinationPortfolioId: destination.id } : { destinationPortfolioId: destination.id, transferFee: fee || null };
        next.portfolios.find((portfolio) => portfolio.id === source.id).transactions.unshift({ id: id(), description, category: "Personal transfer", amount, inflow: false, createdAt, transferId, ...transferData });
        next.portfolios.find((portfolio) => portfolio.id === destination.id).transactions.unshift({ id: id(), description: values.description.trim() || `Transfer from ${source.name}`, category: "Personal transfer", amount: crossCurrency ? actualReceived : amount, inflow: true, createdAt, transferId, ...transferData });
        if (fee > 0) next.portfolios.find((portfolio) => portfolio.id === source.id).transactions.unshift({ id: id(), description: `Transfer fee to ${destination.name}`, category: "Personal transfer", amount: fee, inflow: false, createdAt });
      });
      if (crossCurrency) setTransferMessage(`Transfer saved. Expected ${destination.currency.toUpperCase()} ${expectedReceived.toFixed(2)}; received ${destination.currency.toUpperCase()} ${actualReceived.toFixed(2)}. Effective rate: ${source.currency.toUpperCase()} ${(amount / actualReceived).toFixed(4)} per ${destination.currency.toUpperCase()}.`);
      setForm(null);
    },
    reportPortfolios = reportScope === "global" ? d.portfolios.filter((portfolio) => portfolio.currency === p.currency) : [p],
    reportOut = reportPortfolios.flatMap((portfolio) => portfolio.transactions).filter((t) => !t.inflow && !t.transferId),
    out = p.transactions.filter((t) => !t.inflow && !t.transferId),
    total = out.reduce((s, t) => s + t.amount, 0),
    catsum = Object.entries(
      reportOut.reduce(
        (a, t) => ((a[t.category] = (a[t.category] || 0) + t.amount), a),
        {},
      ),
    ),
    dashboard = d.portfolios.map((portfolio) => {
      const transactions = portfolio.transactions
        .filter((transaction) => !transaction.transferId && inCapCycle(transaction, portfolio.currency));
      const inflow = transactions.filter((transaction) => transaction.inflow).reduce((sum, transaction) => sum + transaction.amount, 0);
      const outflow = transactions.filter((transaction) => !transaction.inflow).reduce((sum, transaction) => sum + transaction.amount, 0);
      const netWorth = bal(portfolio);
      const caps = d.globalCaps[portfolio.currency.toLowerCase()] || portfolio.caps || {};
      const alerts = Object.entries(caps).map(([category, cap]) => {
        const spent = transactions.filter((transaction) => !transaction.inflow && transaction.category === category).reduce((sum, transaction) => sum + transaction.amount, 0);
        return { category, cap: Number(cap), spent, ratio: Number(cap) ? spent / Number(cap) : 0 };
      }).filter((alert) => alert.ratio >= .9).sort((a, b) => b.ratio - a.ratio);
      return { portfolio, inflow, outflow, netWorth, alerts };
    }),
    activityNotifications = [
      ...d.portfolios.flatMap((portfolio) => portfolio.transactions.map((transaction) => ({
        id: `transaction:${transaction.id}`,
        title: transaction.inflow ? "Inflow added" : "Outflow added",
        message: `${transaction.description} - ${fmt(portfolio, transaction.amount)}`,
        createdAt: transaction.createdAt,
        transaction,
        warning: false,
      }))),
      ...dashboard.flatMap((summary) => summary.alerts.map((alert) => ({
        id: `cap:${summary.portfolio.currency.toLowerCase()}:${summary.portfolio.id}:${alert.category}:${capCycleStart(summary.portfolio.currency).toISOString()}`,
        title: alert.ratio >= 1 ? "Cap exceeded" : "Cap warning",
        message: `${summary.portfolio.name}: ${alert.category} ${(alert.ratio * 100).toFixed(0)}% of ${fmt(summary.portfolio, alert.cap)}`,
        createdAt: new Date().toISOString(),
        warning: true,
      }))),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12),
    unreadNotifications = activityNotifications.filter((notice) => !(d.readActivityIds || []).includes(notice.id)).length,
    calendarStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    calendarDays = new Date(calendarStart.getFullYear(), calendarStart.getMonth() + 1, 0).getDate(),
    calendarCells = Array.from({ length: calendarStart.getDay() + calendarDays }, (_, index) => index < calendarStart.getDay() ? null : index - calendarStart.getDay() + 1);
  const markActivityRead = () => up((next) => {
    next.readActivityIds = [...new Set([...(next.readActivityIds || []), ...activityNotifications.map((notice) => notice.id)])].slice(-200);
  });
  const createPlanTransaction = (plan) => up((next) => {
    const source = next.portfolios.find((portfolio) => portfolio.id === plan.portfolioId) || next.portfolios.find((portfolio) => portfolio.id === next.selected) || next.portfolios[0];
    if (!source) return;
    source.transactions.unshift({ id: id(), description: plan.description, category: plan.category, amount: plan.amount, inflow: false, createdAt: new Date().toISOString(), loanId: plan.loanId });
    const destination = next.portfolios.find((portfolio) => portfolio.id === plan.destinationId);
    if (plan.savings && destination && destination.id !== source.id) destination.transactions.unshift({ id: id(), description: plan.description, category: plan.category, amount: plan.amount, inflow: true, createdAt: new Date().toISOString() });
    next.plans.find((item) => item.id === plan.id).last = planPeriod(plan);
  });
  const skipPlanTransaction = (plan) => {
    if (!confirm(`Skip ${plan.description} for this month? No transaction will be created.`)) return;
    up((next) => { next.plans.find((item) => item.id === plan.id).skipped = planPeriod(plan); });
  };
  const payPlanEarly = (plan) => {
    const period = planPeriod(plan, nextPlanOccurrence(plan));
    if (!confirm(`Mark ${plan.description} as paid for ${period}? No transaction will be created and the plan will not be changed.`)) return;
    up((next) => {
      const item = next.plans.find((candidate) => candidate.id === plan.id);
      if (item) item.earlyPaid = [...new Set([...(item.earlyPaid || []), period])];
    });
  };
  const trendMonths = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(); date.setMonth(date.getMonth() - (5 - index));
    return date.toISOString().slice(0, 7);
  });
  const trendTransactions = d.portfolios.flatMap((portfolio) => portfolio.transactions.map((transaction) => ({ ...transaction, portfolio }))).filter((transaction) => !transaction.transferId && transaction.createdAt.slice(0, 7) === trendMonth);
  const trendInflow = trendTransactions.filter((transaction) => transaction.inflow).reduce((sum, transaction) => sum + transaction.amount, 0);
  const trendOutflow = trendTransactions.filter((transaction) => !transaction.inflow).reduce((sum, transaction) => sum + transaction.amount, 0);
  const trendTotal = trendInflow + trendOutflow || 1;
  const trendCategories = Object.entries(trendTransactions.filter((transaction) => !transaction.inflow).reduce((sum, transaction) => ((sum[transaction.category] = (sum[transaction.category] || 0) + transaction.amount), sum), {})).sort((a, b) => b[1] - a[1]);
  const removeTransaction = (transaction) => {
    if (!confirm("Delete this transaction and reverse its balance effect?")) return;
    const plan = d.plans.find(
      (item) =>
        item.last === planPeriod(item) &&
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
        {["Dashboard", "Projection", "Home", "Report", "Trends", "Bill calendar", "Plans", "Loans", "History", "Settings"].map((x) => (
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
              <option value={x.id}>{portfolioIcon(x)} {x.name}</option>
            ))}
          </select><div className="notification-wrap"><button className="notification-bell" aria-label={unreadNotifications ? `${unreadNotifications} unread notifications` : "Notifications"} title={unreadNotifications ? `${unreadNotifications} unread notifications` : "Notifications"} onClick={() => { const opening = !notificationsOpen; setNotificationsOpen(opening); if (opening) markActivityRead(); }}>{unreadNotifications > 0 && <span>{unreadNotifications > 9 ? "9+" : unreadNotifications}</span>}</button>{notificationsOpen && <section className="notification-panel"><div className="notification-panel-head"><b>Notifications</b><button type="button" onClick={markActivityRead}>Mark all read</button></div>{activityNotifications.length ? activityNotifications.slice(0, 6).map((notice) => <button type="button" className={`notification-item ${notice.warning ? "warning" : ""}`} key={notice.id} onClick={() => { setNotificationsOpen(false); if (notice.transaction) setTab("History"); }}><span>{notice.warning ? "!" : notice.transaction?.inflow ? "+" : "-"}</span><div><b>{notice.title}</b><small>{notice.message}</small></div></button>) : <p className="notification-empty">No recent activity.</p>}</section>}</div></div>
        </header>
        {tab === "Dashboard" && (
          <section className="dashboard">
            <p className="dashboard-intro">This month by portfolio. Each account stays separate.</p>
            {dashboard.map((summary) => {
              const format = (amount) => fmt(summary.portfolio, amount);
              return <article className="dashboard-currency" key={summary.portfolio.id}>
                <div className="dashboard-currency-heading"><div><small>{summary.portfolio.currency.toUpperCase()}</small><h3><i className="portfolio-icon">{portfolioIcon(summary.portfolio)}</i>{summary.portfolio.name.toUpperCase()}</h3></div><span>{summary.portfolio.type === "creditCard" ? "CREDIT CARD" : "BANK / CASH"}</span></div>
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
        {tab === "Projection" && <section className="dashboard"><p className="dashboard-intro">Overall cash left after the current cap-cycle commitments and regular planned expenses. Shared caps are counted once across all portfolios with the same currency.</p>{[...new Set(d.portfolios.filter((portfolio) => portfolio.type !== "creditCard").map((portfolio) => portfolio.currency))].map((currency) => { const pool = d.portfolios.filter((portfolio) => portfolio.type !== "creditCard" && portfolio.currency === currency); const template = pool[0]; const balance = pool.reduce((sum, portfolio) => sum + portfolio.opening + portfolio.transactions.reduce((net, tx) => net + (tx.inflow ? tx.amount : -tx.amount), 0), 0); const spent = d.portfolios.filter((portfolio) => portfolio.currency === currency).flatMap((portfolio) => portfolio.transactions).filter((tx) => !tx.inflow && inCapCycle(tx, currency) && !tx.transferId).reduce((map, tx) => ((map[tx.category] = (map[tx.category] || 0) + tx.amount), map), {}); const caps = d.globalCaps[currency.toLowerCase()] || {}; const pending = d.plans.filter((plan) => !plan.savings && !planCompleted(plan) && planOccurs(plan) && d.portfolios.find((portfolio) => portfolio.id === plan.portfolioId)?.currency === currency).reduce((map, plan) => ((map[plan.category] = (map[plan.category] || 0) + plan.amount), map), {}); const categories = new Set([...Object.keys(caps), ...Object.keys(pending)]); const remaining = [...categories].reduce((sum, category) => { const target = Math.max(Number(caps[category] || 0), Number(pending[category] || 0)); return sum + Math.max(0, target - Number(spent[category] || 0)); }, 0); return <article className="dashboard-card" key={currency}><small>{currency} · CURRENT CAP PROJECTION</small><h3>All cash portfolios</h3><b>{fmt(template, balance - remaining)}</b><p>Current cash {fmt(template, balance)} · Remaining commitments {fmt(template, remaining)}</p></article>; })}</section>}
        {tab === "Home" && (
          <>
            <section className="hero">
              <div>
                <small>{p.type === "creditCard" ? "CREDIT CARD" : "ACTIVE PORTFOLIO"}</small>
                <h2><i className="portfolio-icon">{portfolioIcon(p)}</i>{p.name}</h2>
                {p.type === "creditCard" && <small>{bal(p) > 0 ? "CARD CREDIT" : "OUTSTANDING"}</small>}
                <strong className={p.type === "creditCard" && bal(p) > 0 ? "card-credit" : ""}>{fmt(p, p.type === "creditCard" && bal(p) > 0 ? -bal(p) : p.type === "creditCard" ? outstanding(p) : bal(p))}</strong>
                {p.type === "creditCard" && <small>Credit limit: {fmt(p, Number(p.creditLimit) || 0)}. Available: {fmt(p, availableCredit(p))}</small>}
              </div>
              <div>
                <button onClick={() => setForm("in")}>+ {p.type === "creditCard" ? "Payment" : "Inflow"}</button>
                <button className="red" onClick={() => setForm("out")}>
                  − {p.type === "creditCard" ? "Card charge" : "Outflow"}
                </button>
                <button className="secondary" onClick={() => setForm("transfer")}>Transfer</button>
              </div>
            </section>
            <section className="stats">
              <article>
                INFLOW
                <b>
                  {fmt(
                    p,
                    p.transactions
                      .filter((t) => t.inflow && !t.transferId)
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
                    (t) => t.category === c && inCapCycle(t, p.currency),
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
            <div className="plan-calendar-heading"><div><small>RECURRING BILLS</small><h3>{calendarStart.toLocaleString("en", { month: "long", year: "numeric" })}</h3></div><span>{d.plans.filter((plan) => !planCompleted(plan)).length} pending</span></div>
            <div className="calendar-weekdays">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <small key={day}>{day}</small>)}</div>
            <div className="calendar-grid">{calendarCells.map((day, index) => {
              const plans = day ? d.plans.filter((plan) => Number(plan.dueDay || 1) === day && planOccurs(plan, calendarStart)) : [];
              return <div className={`calendar-day ${day === new Date().getDate() ? "today" : ""}`} key={`${day || "blank"}-${index}`}>{day && <><b>{day}</b>{plans.map((plan) => { const done = planCompleted(plan); return <button className={`calendar-plan ${done ? "done" : ""}`} key={plan.id} title={`${plan.description}: ${done ? plan.skipped === planPeriod(plan) ? "Skipped" : "Created" : "Pending"}`} onClick={() => !done && createPlanTransaction(plan)}>{icon[plan.category] || "*"} {plan.description}</button>; })}</>}</div>;
            })}</div>
            <small className="calendar-help">Select a pending bill to create it now. Due-date reminders are sent on Android for recurring plans.</small>
          </section>
        }
        {tab === "Plans" && <>
          <div className="plans-list">
          {[...d.plans].sort(planSort).map((x) => {
            const skipped = x.skipped === planPeriod(x);
            const completed = planCompleted(x);
            const nextPeriod = planPeriod(x, nextPlanOccurrence(x));
            const nextPeriodPaid = (x.earlyPaid || []).includes(nextPeriod);
            return <article className="plan" key={x.id}>
              <span>{x.savings ? "◈" : icon[x.category] || "✨"}</span>
              <div>
                <b>{x.description}</b>
                <small>
                  {x.savings ? "Savings transfer" : "Regular outflow"} · {planFrequencyLabel(x.frequency)} · due day
                  {x.dueDay || 1}
                </small>
              </div>
              <b>{fmt(p, x.amount)}</b>
              {!completed && <button onClick={() => createPlanTransaction(x)}>
                Create now
              </button>}
              {!completed && <button className="skip-plan" onClick={() => skipPlanTransaction(x)}>Skip this month</button>}
              {completed && <span className="plan-status">{!planOccurs(x) ? "Not due this month" : skipped ? "Skipped this period" : "Created this period"}</span>}
              <button className="skip-plan" disabled={nextPeriodPaid} onClick={() => payPlanEarly(x)}>{nextPeriodPaid ? "Next period paid" : "Pay early"}</button>
            </article>;
          })}</div>
        </>}
        {tab === "Loans" && <section className="plans-list"><div className="recent-heading"><div><small>DEBT TRACKING</small><h3>Loans</h3></div><button onClick={() => { const name = prompt("Loan name"); const principal = Number(prompt("Original loan amount", "0")); const termMonths = Number(prompt("Loan duration in months", "12")); if (name && principal > 0 && termMonths > 0) up((x) => x.loans.push({ id: id(), name, lender: prompt("Lender", "") || "", principal, termMonths, portfolioId: x.selected })); }}>Add loan</button></div>{d.loans.length ? d.loans.map((loan) => { const portfolio = d.portfolios.find((item) => item.id === loan.portfolioId) || p; const paid = d.portfolios.flatMap((item) => item.transactions).filter((tx) => !tx.inflow && tx.loanId === loan.id).reduce((sum, tx) => sum + tx.amount, 0); const remaining = Math.max(0, loan.principal - paid); return <article className="plan" key={loan.id}><span>🏦</span><div><b>{loan.name}</b><small>{loan.lender || "Loan"} · {loan.termMonths} months · Paid {fmt(portfolio, paid)} · Remaining {fmt(portfolio, remaining)}</small></div><b>{fmt(portfolio, remaining)}</b><button className="delete-plan" onClick={() => up((x) => { x.loans = x.loans.filter((item) => item.id !== loan.id); x.plans.forEach((plan) => { if (plan.loanId === loan.id) delete plan.loanId; }); })}>Delete</button></article>; }) : <p>No loans yet. Add one, then link it to a recurring plan in Settings.</p>}</section>}
        {tab === "History" && (
          <>
            <div className="recent-heading"><p className="history-context">Transactions in {historyScope === "global" ? "all portfolios" : p.name}</p><div className="scope-switch"><button className={historyScope === "portfolio" ? "on" : ""} onClick={() => setHistoryScope("portfolio")}>This portfolio</button><button className={historyScope === "global" ? "on" : ""} onClick={() => setHistoryScope("global")}>All portfolios</button></div></div>
            <Rows
              rows={(historyScope === "global" ? d.portfolios.flatMap((portfolio) => portfolio.transactions.map((transaction) => ({ ...transaction, sourcePortfolio: portfolio }))) : p.transactions.map((transaction) => ({ ...transaction, sourcePortfolio: p })))
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))}
              p={p}
              del={removeTransaction}
              edit={(transaction) => transaction.transferRate ? setTransferMessage("Delete and recreate a cross-currency transfer to change its amounts.") : setEditing({ transaction, portfolioId: transaction.sourcePortfolio?.id || p.id })}
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
                  </select><select value={x.iconKey || (x.type === "creditCard" ? "card" : "bank")} aria-label="Portfolio icon" onChange={(e) => up((z) => (z.portfolios.find((q) => q.id === x.id).iconKey = e.target.value))}>{Object.entries(portfolioIcons).map(([key, glyph]) => <option value={key}>{glyph} {key.toUpperCase()}</option>)}</select><select value={x.type || "bank"} onChange={(e) => up((z) => (z.portfolios.find((q) => q.id === x.id).type = e.target.value))}><option value="bank">Bank / cash</option><option value="creditCard">Credit card</option></select>{x.type === "creditCard" && <input type="number" min="0" step=".01" aria-label="Credit limit" value={x.creditLimit || ""} placeholder="Credit limit" onChange={(e) => up((z) => (z.portfolios.find((q) => q.id === x.id).creditLimit = Number(e.target.value) || 0))} />}<button type="button" className="reset-portfolio" onClick={() => resetPortfolio(x)}>Reset data</button><button type="button" className="delete-portfolio" onClick={() => deletePortfolio(x)}>Delete</button></span>
                <button type="button" className="secondary" onClick={() => {
                  const currentAmount = x.type === "creditCard" ? availableCredit(x) : bal(x);
                  const label = x.type === "creditCard" ? "Available credit" : "Current balance";
                  const value = prompt(`${label} for ${x.name} (${x.currency})`, currentAmount.toFixed(2));
                  if (value !== null) setCurrentAmount(x.id, value);
                }}>Set {x.type === "creditCard" ? "available credit" : "current balance"}</button>
              </label>
            ))}
            <button
              onClick={() => {
                let n = prompt("Portfolio name");
                if (n) {
                  const type = confirm("Create this as a credit card? Select Cancel for a bank / cash portfolio.") ? "creditCard" : "bank";
                  const creditLimit = type === "creditCard" ? Number(prompt("Credit limit", "0")) || 0 : 0;
                  if (type === "creditCard" && creditLimit <= 0) return;
                  const iconKey = prompt("Portfolio icon: bank, wallet, savings, card, investment, cash, or home", type === "creditCard" ? "card" : "bank") || (type === "creditCard" ? "card" : "bank");
                  up((x) =>
                    x.portfolios.push({
                      id: id(),
                      name: n,
                      currency: "SAR",
                      opening: 0,
                      type,
                      iconKey: portfolioIcons[iconKey] ? iconKey : "bank",
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
              Recurring plans <span>{plansOpen ? "-" : "+"}</span>
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
                      value={plan.frequency || "monthly"}
                      onChange={(e) => up((x) => (x.plans.find((q) => q.id === plan.id).frequency = e.target.value))}
                    >
                      <option value="monthly">Monthly</option>
                      <option value="semiAnnual">Every 6 months</option>
                      <option value="annual">Annual</option>
                    </select>
                    {(plan.frequency === "semiAnnual" || plan.frequency === "annual") && <select
                      value={plan.anchorMonth || 1}
                      onChange={(e) => up((x) => (x.plans.find((q) => q.id === plan.id).anchorMonth = Number(e.target.value)))}
                    >
                      {Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Date(2026, index, 1).toLocaleString("en", { month: "long" })}</option>)}
                    </select>}
                    {d.loans.length > 0 && <select value={plan.loanId || ""} onChange={(e) => up((x) => { const target = x.plans.find((q) => q.id === plan.id); e.target.value ? target.loanId = e.target.value : delete target.loanId; })}><option value="">No linked loan</option>{d.loans.map((loan) => <option key={loan.id} value={loan.id}>{loan.name}</option>)}</select>}
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
                        dueDay: 1,
                        frequency: "monthly",
                        anchorMonth: 1,
                        last: "",
                      }),
                    )
                  }
                >
                  Add recurring plan
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
              <section className="caps-settings"><div className="cap-mode"><div><b>Cap scope</b><small>{capsShared ? `One cap shared by all ${p.currency} portfolios.` : `A separate cap for ${p.name}.`}</small></div><select value={capsShared ? "shared" : "portfolio"} onChange={(event) => setCapsShared(event.target.value === "shared")}><option value="portfolio">Per portfolio</option><option value="shared">Shared: {p.currency}</option></select></div><div className="cap-mode"><div><b>Current cap cycle</b><small>{d.capCycleStarts?.[p.currency.toLowerCase()] ? `Started ${capCycleStart(p.currency).toLocaleString()}.` : "All recorded expenses are included."} Reset after salary to start a new cycle.</small></div><button type="button" className="remove-cap" onClick={() => { if (confirm(`Reset ${p.currency} cap usage now? Earlier expenses remain in history but stop counting toward the current cap.`)) up((x) => { (x.capCycleStarts ||= {})[p.currency.toLowerCase()] = new Date().toISOString(); }); }}>Reset cap usage</button></div>
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
          <form onSubmit={form === "transfer" ? transferMoney : add}>
            <h2>{form === "transfer" ? "Transfer money" : `Add ${form === "in" ? "inflow" : "outflow"}`}</h2>
            <input name="description" placeholder={form === "transfer" ? "Description (optional)" : "Description"} required={form !== "transfer"} />
            <input
              name="amount"
              type="number"
              step=".01"
              placeholder="Amount"
              required
            />
            {form === "transfer" ? <><select name="source" defaultValue={p.id}>
              {d.portfolios.map((x) => (
                <option value={x.id}>{portfolioIcon(x)} From: {x.name}</option>
              ))}
            </select><select name="destination" defaultValue={d.portfolios.find((x) => x.id !== p.id)?.id}>
              {d.portfolios.filter((x) => x.id !== p.id).map((x) => (
                <option value={x.id}>{portfolioIcon(x)} To: {x.name}</option>
              ))}
            </select><p className="section-hint">For different currencies, enter the quoted rate as source currency per destination currency. The app records the actual amount received and calculates the effective rate.</p><input name="transferRate" type="number" step=".0001" placeholder="Quoted transfer rate (cross-currency only)" /><input name="actualReceived" type="number" step=".01" placeholder="Actual amount received (cross-currency only)" /><input name="transferFee" type="number" min="0" step=".01" placeholder="Transfer fee in source currency (optional)" /></> : <><select name="portfolio" defaultValue={p.id}>
              {d.portfolios.map((x) => (
                <option value={x.id}>{x.name}</option>
              ))}
            </select>
            <select name="category">
              {d.categories.map((x) => (
                <option>{x}</option>
              ))}
            </select>
            <input name="type" value={form} hidden /></>}
            <button>{form === "transfer" ? "Transfer" : "Save transaction"}</button>
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
