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
  ].join("|"),
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
  globalCaps: state.globalCategoryCaps || {},
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
    last: plan.lastCreatedMonth || "",
    skipped: plan.lastSkippedMonth || "",
  })),
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
  const globalCaps = structuredClone(profile.globalCategoryCaps || {});
  if (profile.capsSharedVersion !== 1) {
    portfolios.forEach((portfolio) => {
      const shared = globalCaps[portfolio.currency] ||= {};
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
    plans,
  };
};
const toSharedRecords = (userId, data) => [
  { user_id: userId, record_type: "profile", record_id: "settings", payload: { name: data.profile, selectedId: data.selected, globalCategoryCaps: data.globalCaps || {}, capsSharedVersion: 1 } },
  { user_id: userId, record_type: "category", record_id: "all", payload: { categories: data.categories, icons: {} } },
  ...data.portfolios.flatMap((portfolio) => [
    { user_id: userId, record_type: "portfolio", record_id: portfolio.id, payload: { id: portfolio.id, name: portfolio.name, opening: portfolio.opening, currency: String(portfolio.currency).toLowerCase(), type: portfolio.type || "bank", creditLimit: portfolio.creditLimit || 0, categoryCaps: portfolio.caps || {} } },
    ...portfolio.transactions.map((transaction) => ({ user_id: userId, record_type: "transaction", record_id: transaction.id, payload: { ...transaction, portfolioId: portfolio.id }, deleted_at: null })),
  ]),
  ...data.plans.map((plan) => ({ user_id: userId, record_type: "plan", record_id: plan.id, payload: { ...plan, savingsTransfer: Boolean(plan.savings), lastCreatedMonth: plan.last || null, lastSkippedMonth: plan.skipped || null } })),
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
  const [reportScope, setReportScope] = useState("portfolio");
  const [editing, setEditing] = useState(null);
  const [capsOpen, setCapsOpen] = useState(false);
  const [capsShared, setCapsShared] = useState(false);
  const [newCap, setNewCap] = useState(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [authMessage, setAuthMessage] = useState("");
  const [syncError, setSyncError] = useState("");
  const [apiMessage, setApiMessage] = useState("");
  const mobileStateRef = useRef(null);
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
    if (sharedData) setD(sharedData);
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
        if (!error) localStorage.removeItem("expensia-web");
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
        sharedCap = d.globalCaps[q.currency]?.[v.category],
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
    );
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
        {["Home", "Report", "Plans", "History", "Settings"].map((x) => (
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
              del={removeTransaction}
              edit={(transaction) => setEditing({ transaction, portfolioId: transaction.sourcePortfolio?.id || p.id })}
            />
          </>
        )}
        {tab === "Report" && (
          <>
            <div className="recent-heading"><p>Category outflow in {reportScope === "global" ? `all ${p.currency} portfolios` : p.name}</p><div className="scope-switch"><button className={reportScope === "portfolio" ? "on" : ""} onClick={() => setReportScope("portfolio")}>This portfolio</button><button className={reportScope === "global" ? "on" : ""} onClick={() => setReportScope("global")}>All {p.currency}</button></div></div>
            {catsum.map(([c, n]) => {
              let cap = reportScope === "global" ? d.globalCaps[p.currency]?.[c] : p.caps[c],
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
        {tab === "Plans" &&
          d.plans.map((x) => {
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
              {!completed && <button
                onClick={() =>
                  up((z) => {
                    const source = z.portfolios.find(
                      (q) => q.id === x.portfolioId,
                    ) || z.portfolios.find((q) => q.id === z.selected) || z.portfolios[0];
                    if (!source) return;
                    source.transactions.unshift({
                      id: id(),
                      description: x.description,
                      category: x.category,
                      amount: x.amount,
                      inflow: false,
                      createdAt: new Date().toISOString(),
                    });
                    const destination = z.portfolios.find(
                      (q) => q.id === x.destinationId,
                    );
                    if (x.savings && destination && destination.id !== source.id)
                      destination.transactions.unshift({
                          id: id(),
                          description: x.description,
                          category: x.category,
                          amount: x.amount,
                          inflow: true,
                          createdAt: new Date().toISOString(),
                        });
                    const plan = z.plans.find((q) => q.id === x.id);
                    plan.portfolioId = source.id;
                    plan.last = mo();
                  })
                }
              >
                Create now
              </button>}
              {!completed && <button className="skip-plan" onClick={() => {
                if (!confirm(`Skip ${x.description} for this month? No transaction will be created.`)) return;
                up((z) => { z.plans.find((q) => q.id === x.id).skipped = mo(); });
              }}>Skip this month</button>}
              {completed && <span className="plan-status">{skipped ? "Skipped this month" : "Created this month"}</span>}
            </article>;
          })}
        {tab === "History" && (
          <>
            <p className="history-context">Transactions in {p.name}</p>
            <Rows
              rows={[...p.transactions]
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))}
              p={p}
              del={removeTransaction}
              edit={(transaction) => setEditing({ transaction, portfolioId: p.id })}
            />
          </>
        )}{" "}
        {tab === "Settings" && (
          <section className="settings">
            <h3>Cloud sync</h3>
            {!cloudEnabled ? (
              <p>Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to a `.env` file, then restart the app.</p>
            ) : <><p>Connected as {user.email}. Your data is syncing securely across browsers.</p>{syncError && <p className="sync-error">Cloud sync failed: {syncError}</p>}<button type="button" onClick={copyApiToken}>Copy API access token</button>{apiMessage && <p className="api-message">{apiMessage}</p>}<button onClick={() => supabase.auth.signOut()}>Sign out</button></>}
            <h3>Portfolios</h3>
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
            </button>
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
              {d.categories.filter((c) => capsShared ? d.globalCaps[p.currency]?.[c] : p.caps[c]).map((c) => (
                <div className="cap-editor" key={c}>
                  <span className={`cap-scope ${capsShared ? "shared" : ""}`}>{capsShared ? `Shared ${p.currency}` : "Per portfolio"}</span>
                  {icon[c] || "•"} {c}
                  <input
                    type="number"
                    min="0"
                    step=".01"
                    placeholder="No cap"
                    value={(capsShared ? d.globalCaps[p.currency]?.[c] : p.caps[c]) || ""}
                    onChange={(e) =>
                      up((x) => {
                        let v = capsShared ? (x.globalCaps[p.currency] ||= {}) : x.portfolios.find((q) => q.id === x.selected).caps;
                        e.target.value ? (v[c] = +e.target.value) : delete v[c];
                      })
                    }
                  />
                  <button
                    type="button"
                    className="remove-cap"
                    disabled={!(capsShared ? d.globalCaps[p.currency]?.[c] : p.caps[c])}
                    onClick={() =>
                      up((x) => {
                        if (capsShared) delete x.globalCaps[p.currency]?.[c];
                        else delete x.portfolios.find((q) => q.id === x.selected).caps[c];
                      })
                    }
                  >
                    Remove cap
                  </button>
                </div>
              ))}
              {newCap ? <div className="cap-editor cap-new"><select value={newCap.category} onChange={(event) => setNewCap({ ...newCap, category: event.target.value })}>{d.categories.map((category) => <option key={category}>{category}</option>)}</select><input type="number" min="0.01" step=".01" placeholder="Monthly cap" value={newCap.amount} onChange={(event) => setNewCap({ ...newCap, amount: event.target.value })} /><button type="button" onClick={() => { const amount = Number(newCap.amount); if (!amount) return; up((x) => { const caps = capsShared ? (x.globalCaps[p.currency] ||= {}) : x.portfolios.find((q) => q.id === x.selected).caps; caps[newCap.category] = amount; }); setNewCap(null); }}>Add cap</button><button type="button" className="remove-cap" onClick={() => setNewCap(null)}>Cancel</button></div> : <button type="button" className="add-cap" onClick={() => setNewCap({ category: d.categories[0], amount: "" })}>+ Add cap</button>}
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
        <article>
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
          <button type="button" onClick={() => edit(t)}>Edit</button>
          <button onClick={() => del(t)}>×</button>
        </article>
      ))}
    </div>
  );
}
export default App;
