import React, { useState, useEffect, useRef } from "react";
import { Html5QrcodeScanner } from "html5-qrcode"; // NEW LIBRARY
import "./App.css";

function App() {
  // --- State ---
  const [budget, setBudget] = useState(0);
  const [spent, setSpent] = useState(0);
  const [transactions, setTransactions] = useState([]);

  // Payment Form State
  const [payVpa, setPayVpa] = useState("");
  const [payNote, setPayNote] = useState("");

  // Split Bill State
  const [totalAmount, setTotalAmount] = useState("");
  const [myShare, setMyShare] = useState("");
  const [isSplit, setIsSplit] = useState(false);

  // UI State
  const [showModal, setShowModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [pendingShare, setPendingShare] = useState(0);
  const [isSetupDone, setIsSetupDone] = useState(false);

  // --- Auto-Load Data ---
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

  // --- Auto-Save Data ---
  useEffect(() => {
    if (isSetupDone) {
      const data = { budget, spent, transactions };
      localStorage.setItem("upi_tracker_data", JSON.stringify(data));
    }
  }, [budget, spent, transactions, isSetupDone]);

  // --- QR Scanner Logic (Fixed for Android) ---
  useEffect(() => {
    let scanner = null;

    if (showScanner) {
      // Small delay to ensure the div exists
      setTimeout(() => {
        scanner = new Html5QrcodeScanner(
          "reader",
          { fps: 10, qrbox: 250 },
          /* verbose= */ false
        );

        scanner.render(
          (decodedText) => {
            handleScanSuccess(decodedText);
            scanner.clear();
            setShowScanner(false);
          },
          (errorMessage) => {
            // ignore scan errors, they happen while searching
          }
        );
      }, 100);
    }

    return () => {
      if (scanner) {
        scanner
          .clear()
          .catch((error) => console.error("Failed to clear scanner", error));
      }
    };
  }, [showScanner]);

  const handleScanSuccess = (text) => {
    if (text) {
      // Logic to extract UPI ID
      if (text.startsWith("upi://")) {
        try {
          const params = new URLSearchParams(text.split("?")[1]);
          const pa = params.get("pa"); // Payee Address

          if (pa) {
            setPayVpa(pa);
            // Optional: Auto-fill note if 'pn' (name) exists in QR, but don't send it in payment
            const pn = params.get("pn");
            if (pn && !payNote) setPayNote(pn);
          }
        } catch (err) {
          console.error("QR Parse Error", err);
        }
      } else if (text.includes("@")) {
        setPayVpa(text); // Fallback for plain text VPAs
      } else {
        alert("Invalid UPI QR Code");
      }
    }
  };

  // --- Handlers ---
  const handleSetup = () => {
    if (budget > 0) setIsSetupDone(true);
  };

  const toggleSplit = () => {
    setIsSplit(!isSplit);
    if (isSplit) setMyShare("");
  };

  const initiatePayment = () => {
    const amountToPay = parseFloat(totalAmount);
    const amountToDeduct =
      isSplit && myShare ? parseFloat(myShare) : amountToPay;

    if (!amountToPay || amountToPay <= 0 || !payVpa) {
      alert("Please enter a valid Amount and UPI ID");
      return;
    }

    // --- FIX 1: SIMPLIFIED UPI LINK ---
    // Removed 'pn' (Payee Name) to fix "Limit Exceeded" error
    const upiLink = `upi://pay?pa=${payVpa}&am=${amountToPay}&cu=INR`;

    // Open App
    window.location.href = upiLink;

    setPendingTotal(amountToPay);
    setPendingShare(amountToDeduct);
    setTimeout(() => setShowModal(true), 1000);
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
        note: payNote,
        isSplit: pendingTotal !== pendingShare,
      };
      setSpent(newSpent);
      setTransactions([newTransaction, ...transactions]);

      setTotalAmount("");
      setMyShare("");
      setPayNote("");
      setPayVpa("");
      setIsSplit(false);
    }
  };

  const startNewMonth = () => {
    if (window.confirm("Start a New Month? This resets history.")) {
      setSpent(0);
      setTransactions([]);
    }
  };

  // --- Render ---
  const budgetLeft = budget - spent;
  const progressPercent = Math.min((spent / budget) * 100, 100);
  const progressColor = progressPercent >= 100 ? "#ff4d4d" : "#4CAF50";

  return (
    <div className="app-container">
      {/* SCANNER OVERLAY */}
      {showScanner && (
        <div className="scanner-overlay">
          <div className="scanner-box">
            <h3>Scan UPI QR</h3>
            {/* THIS DIV IS REQUIRED FOR THE NEW LIBRARY */}
            <div id="reader" width="100%"></div>

            <button
              className="btn-danger"
              onClick={() => setShowScanner(false)}
              style={{ marginTop: "20px" }}
            >
              Close Camera
            </button>
          </div>
        </div>
      )}

      {!isSetupDone && (
        <div className="card setup-card">
          <h2>Welcome</h2>
          <p>Set your monthly budget limit</p>
          <input
            type="number"
            placeholder="5000"
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

          <div className="card payment-form">
            <h3>Make a Payment</h3>

            <label>Payee UPI ID</label>
            <div style={{ display: "flex", gap: "10px", marginBottom: "15px" }}>
              <input
                type="text"
                placeholder="merchant@upi"
                value={payVpa}
                onChange={(e) => setPayVpa(e.target.value)}
                style={{ marginBottom: 0 }}
              />
              <button
                onClick={() => setShowScanner(true)}
                style={{
                  width: "60px",
                  padding: "0",
                  height: "44px",
                  background: "#333",
                  fontSize: "1.2rem",
                }}
              >
                📷
              </button>
            </div>

            <label>Total Amount (₹)</label>
            <input
              type="number"
              placeholder="0"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
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
              placeholder="Note..."
              value={payNote}
              onChange={(e) => setPayNote(e.target.value)}
            />

            <button className="btn-primary" onClick={initiatePayment}>
              PAY NOW
            </button>
          </div>

          <div className="history-section">
            <h4>Recent Transactions</h4>
            {transactions.length === 0 ? (
              <p className="label">No transactions yet.</p>
            ) : (
              <ul>
                {transactions.slice(0, 5).map((t) => (
                  <li key={t.id} className="history-item">
                    <div>
                      <span>{t.note || "Payment"}</span>
                      {t.isSplit && (
                        <span
                          style={{
                            fontSize: "0.7rem",
                            display: "block",
                            color: "#888",
                          }}
                        >
                          Total Bill: ₹{t.fullAmount}
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

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Confirm Payment</h3>
            <p>Did you complete the payment?</p>
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
                Yes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
