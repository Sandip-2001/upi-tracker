import React, { useState, useEffect } from "react";
import "./App.css";

function App() {
  // --- State ---
  const [budget, setBudget] = useState(0);
  const [spent, setSpent] = useState(0);
  const [transactions, setTransactions] = useState([]);

  // Payment Form (Simplified)
  const [payNote, setPayNote] = useState("");

  // Split Bill State
  const [totalAmount, setTotalAmount] = useState("");
  const [myShare, setMyShare] = useState("");
  const [isSplit, setIsSplit] = useState(false);

  // UI State
  const [showModal, setShowModal] = useState(false);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [pendingShare, setPendingShare] = useState(0);
  const [isSetupDone, setIsSetupDone] = useState(false);

  // --- Auto-Load ---
  useEffect(() => {
    const savedData = localStorage.getItem("upi_tracker_data");
    if (savedData) {
      const parsed = JSON.parse(savedData);
      setBudget(parsed.budget || 0);
      setSpent(parsed.spent || 0);
      setTransactions(parsed.transactions || []);
      if (parsed.budget > 0) setIsSetupDone(true);
    }
  }, []);

  // --- Auto-Save ---
  useEffect(() => {
    if (isSetupDone) {
      const data = { budget, spent, transactions };
      localStorage.setItem("upi_tracker_data", JSON.stringify(data));
    }
  }, [budget, spent, transactions, isSetupDone]);

  // --- Handlers ---
  const handleSetup = () => {
    if (budget > 0) setIsSetupDone(true);
  };

  const toggleSplit = () => {
    setIsSplit(!isSplit);
    if (isSplit) setMyShare("");
  };

  const handleStartPayment = () => {
    const amountToPay = parseFloat(totalAmount);
    // If split is ON, deduct myShare. If OFF, deduct totalAmount.
    const amountToDeduct =
      isSplit && myShare ? parseFloat(myShare) : amountToPay;

    if (!amountToPay || amountToPay <= 0) {
      alert("Please enter a valid Amount");
      return;
    }

    // 1. Store the amounts temporarily
    setPendingTotal(amountToPay);
    setPendingShare(amountToDeduct);

    // 2. Try to open the UPI App Chooser
    // We use a generic 'upi://pay' link. On many phones, this opens the app list.
    // Even if it fails to open an app, we still show the modal.
    window.location.href = "upi://pay";

    // 3. Show Confirmation Modal immediately
    setShowModal(true);
  };

  const confirmTransaction = (confirmed) => {
    setShowModal(false);
    if (confirmed) {
      const newSpent = spent + pendingShare;
      const newTransaction = {
        id: Date.now(),
        date: new Date().toLocaleDateString(),
        fullAmount: pendingTotal,
        myShare: pendingShare,
        note: payNote || "Expense",
        isSplit: pendingTotal !== pendingShare,
      };
      setSpent(newSpent);
      setTransactions([newTransaction, ...transactions]);

      // Reset Form
      setTotalAmount("");
      setMyShare("");
      setPayNote("");
      setIsSplit(false);
    }
  };

  const startNewMonth = () => {
    if (
      window.confirm("Start New Month? This resets your spending history to 0.")
    ) {
      setSpent(0);
      setTransactions([]);
    }
  };

  const budgetLeft = budget - spent;
  const progressPercent = Math.min((spent / budget) * 100, 100);
  const progressColor = progressPercent >= 100 ? "#ff4d4d" : "#4CAF50";

  return (
    <div className="app-container">
      {!isSetupDone && (
        <div className="card setup-card">
          <h2>Welcome</h2>
          <input
            type="number"
            placeholder="Set Budget (e.g. 5000)"
            value={budget}
            onChange={(e) => setBudget(parseFloat(e.target.value))}
          />
          <button className="btn-primary" onClick={handleSetup}>
            Start Tracking
          </button>
        </div>
      )}

      {isSetupDone && (
        <div className="dashboard">
          {/* BUDGET CARD */}
          <div className="card">
            <p className="label">Total Spent (My Share)</p>
            <div className="big-number">₹{spent}</div>
            <p className="label">
              Budget Left: <span style={{ color: "#fff" }}>₹{budgetLeft}</span>
            </p>
            <div className="progress-bg">
              <div
                className="progress-fill"
                style={{
                  width: `${progressPercent}%`,
                  backgroundColor: progressColor,
                }}
              ></div>
            </div>
          </div>

          {/* PAYMENT CARD */}
          <div className="card payment-form">
            <h3>Add Expense</h3>

            <label>Total Amount (₹)</label>
            <input
              type="number"
              placeholder="0"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              style={{
                fontSize: "1.5rem",
                fontWeight: "bold",
                color: "#4CAF50",
              }}
            />

            <div className="split-toggle">
              <input
                type="checkbox"
                id="splitCheck"
                checked={isSplit}
                onChange={toggleSplit}
              />
              <label
                htmlFor="splitCheck"
                style={{ display: "inline", marginLeft: "10px", color: "#fff" }}
              >
                Split Bill?
              </label>
            </div>

            {isSplit && (
              <div className="fade-in">
                <label style={{ color: "#4CAF50", marginTop: "10px" }}>
                  My Share Only (₹)
                </label>
                <input
                  type="number"
                  placeholder="My cost"
                  value={myShare}
                  onChange={(e) => setMyShare(e.target.value)}
                  style={{ borderColor: "#4CAF50" }}
                />
              </div>
            )}

            <label style={{ marginTop: "10px" }}>Note</label>
            <input
              type="text"
              placeholder="Food, Travel..."
              value={payNote}
              onChange={(e) => setPayNote(e.target.value)}
            />

            <button className="btn-primary" onClick={handleStartPayment}>
              OPEN APP & TRACK
            </button>
            <p
              style={{
                fontSize: "0.7rem",
                color: "#666",
                marginTop: "5px",
                textAlign: "center",
              }}
            >
              Clicking this will launch your UPI app. Pay there, then confirm
              here.
            </p>
          </div>

          {/* HISTORY CARD */}
          <div className="history-section">
            <h4>Recent Transactions</h4>
            {transactions.length === 0 ? (
              <p className="label">No transactions.</p>
            ) : (
              <ul>
                {transactions.slice(0, 5).map((t) => (
                  <li key={t.id} className="history-item">
                    <div>
                      <span style={{ fontWeight: "bold" }}>{t.note}</span>
                      {t.isSplit && (
                        <span
                          style={{
                            fontSize: "0.7rem",
                            display: "block",
                            color: "#888",
                          }}
                        >
                          Full Bill: ₹{t.fullAmount}
                        </span>
                      )}
                    </div>
                    <span className="history-amount">-₹{t.myShare}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button className="btn-reset" onClick={startNewMonth}>
            Start New Month
          </button>
        </div>
      )}

      {/* CONFIRMATION MODAL */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Confirm Payment</h3>
            <p>
              Did you complete the payment of <strong>₹{pendingTotal}</strong>{" "}
              in your UPI app?
            </p>
            {pendingTotal !== pendingShare && (
              <p style={{ fontSize: "0.8rem", color: "#aaa" }}>
                (Only <strong>₹{pendingShare}</strong> will be deducted from
                your budget)
              </p>
            )}
            <div className="btn-group">
              <button
                className="btn-danger"
                onClick={() => confirmTransaction(false)}
              >
                No
              </button>
              <button
                className="btn-success"
                onClick={() => confirmTransaction(true)}
              >
                Yes, Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
