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
  seed = {
    selected: "main",
    profile: "",
    categories: cats,
    portfolios: [
      {
        id: "main",
        name: "My portfolio",
        currency: "SAR",
        opening: 0,
        caps: {},
        transactions: [],
      },
      {
        id: "save",
        name: "Savings / Reserves",
        currency: "SAR",
        opening: 0,
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
  categories: state.categories || cats,
  portfolios: (state.portfolios || []).map((portfolio) => ({
    id: portfolio.id,
    name: portfolio.name,
    currency: String(portfolio.currency || "sar").toUpperCase(),
    opening: portfolio.opening || 0,
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
    last: plan.lastCreatedMonth || "",
  })),
});
const toFlutterState = (data, previous) => ({
  ...previous,
  name: data.profile || previous.name || "",
  selectedId: data.selected,
  categories: data.categories,
  portfolios: data.portfolios.map((portfolio) => {
    const existing = (previous.portfolios || []).find((item) => item.id === portfolio.id) || {};
    return { ...existing, id: portfolio.id, name: portfolio.name, opening: portfolio.opening, currency: String(portfolio.currency).toLowerCase(), categoryCaps: portfolio.caps || {}, transactions: portfolio.transactions || [] };
  }),
  monthlyPlans: data.plans.map((plan) => {
    const existing = (previous.monthlyPlans || []).find((item) => item.id === plan.id) || {};
    return { ...existing, id: plan.id, description: plan.description, category: plan.category, amount: plan.amount, savingsTransfer: Boolean(plan.savings), destinationPortfolioId: plan.destinationId || existing.destinationPortfolioId, portfolioId: existing.portfolioId || data.selected, dueDay: existing.dueDay || 1, recurring: existing.recurring ?? true, lastCreatedMonth: plan.last || null };
  }),
});
const toSharedRecords = (userId, data) => [
  { user_id: userId, record_type: "profile", record_id: "settings", payload: { name: data.profile, selectedId: data.selected } },
  { user_id: userId, record_type: "category", record_id: "all", payload: { categories: data.categories, icons: {} } },
  ...data.portfolios.flatMap((portfolio) => [
    { user_id: userId, record_type: "portfolio", record_id: portfolio.id, payload: { id: portfolio.id, name: portfolio.name, opening: portfolio.opening, currency: String(portfolio.currency).toLowerCase(), categoryCaps: portfolio.caps || {} } },
    ...portfolio.transactions.map((transaction) => ({ user_id: userId, record_type: "transaction", record_id: transaction.id, payload: { ...transaction, portfolioId: portfolio.id }, deleted_at: null })),
  ]),
  ...data.plans.map((plan) => ({ user_id: userId, record_type: "plan", record_id: plan.id, payload: { ...plan, savingsTransfer: Boolean(plan.savings), lastCreatedMonth: plan.last || null } })),
];
const syncSharedRecords = async (userId, data) => {
  const records = toSharedRecords(userId, data);
  const activeTransactionIds = new Set(records.filter((record) => record.record_type === "transaction").map((record) => record.record_id));
  const { data: storedTransactions, error: readError } = await supabase.from("finance_records").select("record_id").eq("user_id", userId).eq("record_type", "transaction");
  if (readError) return { error: readError };
  const removed = (storedTransactions || []).filter((record) => !activeTransactionIds.has(record.record_id));
  const results = await Promise.all([
    supabase.from("finance_records").upsert(records),
    ...removed.map((record) => supabase.from("finance_records").update({ deleted_at: new Date().toISOString() }).eq("user_id", userId).eq("record_type", "transaction").eq("record_id", record.record_id)),
  ]);
  return results.find((result) => result.error) || { error: null };
};
function App() {
  const [d, setD] = useState(readData),
    [tab, setTab] = useState("Home"),
    [form, setForm] = useState(null);
  const [capsOpen, setCapsOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [authMessage, setAuthMessage] = useState("");
  const [syncError, setSyncError] = useState("");
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
    const [{ data: mobile, error: mobileError }, { data: saved, error: savedError }] = await Promise.all([
      supabase.from("flutter_app_state").select("data, updated_at").eq("user_id", user.id).maybeSingle(),
      supabase.from("app_state").select("data, updated_at").eq("user_id", user.id).maybeSingle(),
    ]);
    const error = mobileError || savedError;
    if (error) {
      setSyncError(error.message);
      setCloudReady(true);
      return;
    }
    if (mobile?.data?.portfolios) mobileStateRef.current = mobile.data;
    if (saved?.data?.portfolios && (!mobile?.data?.portfolios || saved.updated_at > mobile.updated_at)) setD(saved.data);
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
    add = (e) => {
      e.preventDefault();
      let v = Object.fromEntries(new FormData(e.target)),
        q = d.portfolios.find((x) => x.id === v.portfolio),
        spent =
          q.transactions
            .filter(
              (t) =>
                !t.inflow &&
                t.category === v.category &&
                t.createdAt.slice(0, 7) === mo(),
            )
            .reduce((s, t) => s + t.amount, 0) + +v.amount;
      if (
        q.caps[v.category] &&
        spent >= q.caps[v.category] * 0.9 &&
        !confirm(
          `Cap warning: ${((spent / q.caps[v.category]) * 100).toFixed(1)}% used. Save?`,
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
    out = p.transactions.filter((t) => !t.inflow),
    total = out.reduce((s, t) => s + t.amount, 0),
    catsum = Object.entries(
      out.reduce(
        (a, t) => ((a[t.category] = (a[t.category] || 0) + t.amount), a),
        {},
      ),
    );
  const removeTransaction = (transaction) => {
    if (!confirm("Delete this transaction and reverse its balance effect?")) return;
    up((next) => {
      const plan = next.plans.find(
        (item) =>
          item.last === mo() &&
          item.description === transaction.description &&
          item.amount === transaction.amount,
      );
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
      if (plan) plan.last = "";
    });
  };
  const resetPortfolio = (portfolio) => {
    if (!confirm(`Reset ${portfolio.name}? This permanently clears its transactions and restores its opening balance. Category caps and portfolio settings will stay.`)) return;
    up((next) => {
      next.portfolios.find((item) => item.id === portfolio.id).transactions = [];
      next.plans = next.plans.map((plan) => (plan.portfolioId || "main") === portfolio.id ? { ...plan, last: "" } : plan);
    });
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
                <small>ACTIVE PORTFOLIO</small>
                <h2>{p.name}</h2>
                <strong>{fmt(p, bal(p))}</strong>
              </div>
              <div>
                <button onClick={() => setForm("in")}>+ Inflow</button>
                <button className="red" onClick={() => setForm("out")}>
                  − Outflow
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
            <h3>Recent transactions</h3>
            <Rows
              rows={p.transactions.slice(0, 8)}
              p={p}
              del={removeTransaction}
            />
          </>
        )}
        {tab === "Report" && (
          <>
            <p>Category outflow in {p.name}</p>
            {catsum.map(([c, n]) => {
              let cap = p.caps[c],
                used = out
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
          d.plans.map((x) => (
            <article className="plan">
              <span>{x.savings ? "◈" : icon[x.category] || "✨"}</span>
              <div>
                <b>{x.description}</b>
                <small>
                  {x.savings ? "Savings transfer" : "Regular outflow"} · due day
                  1
                </small>
              </div>
              <b>{fmt(p, x.amount)}</b>
              <button
                disabled={x.last === mo()}
                onClick={() =>
                  up((z) => {
                    let a = z.portfolios.find(
                      (q) => q.id === (x.portfolioId || "main"),
                    );
                    a.transactions.unshift({
                      id: id(),
                      description: x.description,
                      category: x.category,
                      amount: x.amount,
                      inflow: false,
                      createdAt: new Date().toISOString(),
                    });
                    if (x.savings)
                      z.portfolios
                        .find((q) => q.id === (x.destinationId || "save"))
                        .transactions.unshift({
                          id: id(),
                          description: x.description,
                          category: x.category,
                          amount: x.amount,
                          inflow: true,
                          createdAt: new Date().toISOString(),
                        });
                    z.plans.find((q) => q.id === x.id).last = mo();
                  })
                }
              >
                {x.last === mo() ? "Created" : "Create now"}
              </button>
            </article>
          ))}
        {tab === "History" && (
          <Rows
            rows={d.portfolios
              .flatMap((x) =>
                x.transactions.map((t) => ({ ...t, port: x.name })),
              )
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))}
            p={p}
            del={removeTransaction}
          />
        )}{" "}
        {tab === "Settings" && (
          <section className="settings">
            <h3>Cloud sync</h3>
            {!cloudEnabled ? (
              <p>Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to a `.env` file, then restart the app.</p>
            ) : <><p>Connected as {user.email}. Your data is syncing securely across browsers.</p>{syncError && <p className="sync-error">Cloud sync failed: {syncError}</p>}<button onClick={() => supabase.auth.signOut()}>Sign out</button></>}
            <h3>Portfolios</h3>
            {d.portfolios.map((x) => (
              <label key={x.id}>
                {x.name}
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
                  </select><button type="button" className="reset-portfolio" onClick={() => resetPortfolio(x)}>Reset data</button></span>
              </label>
            ))}
            <button
              onClick={() => {
                let n = prompt("Portfolio name");
                if (n)
                  up((x) =>
                    x.portfolios.push({
                      id: id(),
                      name: n,
                      currency: "SAR",
                      opening: 0,
                      caps: {},
                      transactions: [],
                    }),
                  );
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
                      onClick={() =>
                        up(
                          (x) =>
                            (x.plans = x.plans.filter((q) => q.id !== plan.id)),
                        )
                      }
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
              d.categories.map((c) => (
                <label key={c}>
                  {icon[c] || "•"} {c}
                  <input
                    type="number"
                    placeholder="No cap"
                    value={p.caps[c] || ""}
                    onChange={(e) =>
                      up((x) => {
                        let v = x.portfolios.find(
                          (q) => q.id === x.selected,
                        ).caps;
                        e.target.value ? (v[c] = +e.target.value) : delete v[c];
                      })
                    }
                  />
                </label>
              ))}
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
    </div>
  );
}
function Rows({ rows, p, del }) {
  return (
    <div className="rows">
      {rows.map((t) => (
        <article>
          <span>{icon[t.category] || "✨"}</span>
          <div>
            <b>{t.description}</b>
            <small>
              {t.port || t.category} · {t.category} ·{" "}
              {new Date(t.createdAt).toLocaleString("en-GB")}
            </small>
          </div>
          <strong className={t.inflow ? "green" : "redtext"}>
            {t.inflow ? "+" : "−"}
            {fmt(p, t.amount)}
          </strong>
          <button onClick={() => del(t)}>×</button>
        </article>
      ))}
    </div>
  );
}
export default App;
