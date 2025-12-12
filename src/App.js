import React, { useState, useEffect } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import "./App.css";

function App() {
  // --- State ---
  const [budget, setBudget] = useState(0);
  const [spent, setSpent] = useState(0);
  const [transactions, setTransactions] = useState([]);

  // Payment Form State
  const [payVpa, setPayVpa] = useState("");
  const [payNote, setPayNote] = useState("");
  const [rawQrString, setRawQrString] = useState(""); // NEW: Stores the full original QR data

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

  // --- QR Scanner ---
  useEffect(() => {
    let scanner = null;
    if (showScanner) {
      // Delay to let DOM render the #reader div
      setTimeout(() => {
        scanner = new Html5QrcodeScanner(
          "reader",
          { fps: 10, qrbox: 250 },
          false
        );

        scanner.render(
          (decodedText) => {
            handleScanSuccess(decodedText);
            scanner.clear();
            setShowScanner(false);
          },
          (err) => {
            /* ignore errors */
          }
        );
      }, 100);
    }
    return () => {
      if (scanner) scanner.clear().catch(console.error);
    };
  }, [showScanner]);

  const handleScanSuccess = (text) => {
    if (text) {
      console.log("Scanned:", text);

      // 1. Is it a UPI link?
      if (text.startsWith("upi://")) {
        // SAVE THE FULL RAW STRING. This contains all the hidden merchant codes.
        setRawQrString(text);

        // Extract just the VPA for display purposes
        try {
          const params = new URLSearchParams(text.split("?")[1]);
          const pa = params.get("pa");
          if (pa) setPayVpa(pa);

          const pn = params.get("pn");
          if (pn) setPayNote(pn); // Show the shop name
        } catch (e) {
          setPayVpa("Scanned Merchant");
        }
      }
      // 2. Or just a plain VPA? (Manual or weird QR)
      else if (text.includes("@")) {
        setPayVpa(text);
        setRawQrString(""); // Clear raw string since it's just an ID
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

    if (!amountToPay || amountToPay <= 0) {
      alert("Please enter a valid Amount");
      return;
    }

    let upiLink = "";

    // STRATEGY:
    // If we have a raw scanned string, use IT (preserves merchant codes).
    // If not, build a fresh one (for manual entry).

    if (rawQrString && rawQrString.includes(payVpa)) {
      // 1. Use the original scanned string
      // Just append the amount to it.
      if (rawQrString.includes("&am=")) {
        // If amount was already in QR, replace it (rare, but possible)
        upiLink = rawQrString.replace(/&am=[^&]*/, `&am=${amountToPay}`);
      } else {
        // Otherwise, simply append it
        upiLink = `${rawQrString}&am=${amountToPay}`;
      }
    } else {
      // 2. Manual Entry Fallback
      if (!payVpa) {
        alert("Enter UPI ID");
        return;
      }
      upiLink = `upi://pay?pa=${payVpa}&am=${amountToPay}&cu=INR`;
      if (payNote) upiLink += `&tn=${encodeURIComponent(payNote)}`;
    }

    // Open App
    window.location.href = upiLink;

    setPendingTotal(amountToPay);
    setPendingShare(amountToDeduct);
    setTimeout(() => setShowModal(true), 1500);
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
        note: payNote || "Payment",
        isSplit: pendingTotal !== pendingShare,
      };
      setSpent(newSpent);
      setTransactions([newTransaction, ...transactions]);

      // Reset
      setTotalAmount("");
      setMyShare("");
      setPayNote("");
      setPayVpa("");
      setRawQrString("");
      setIsSplit(false);
    }
  };

  const startNewMonth = () => {
    if (window.confirm("Start New Month?")) {
      setSpent(0);
      setTransactions([]);
    }
  };

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
            {/* The ID 'reader' is used by the library */}
            <div id="reader"></div>
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
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3>Make a Payment</h3>
              {/* Scan Button */}
              <button
                onClick={() => setShowScanner(true)}
                style={{
                  width: "auto",
                  padding: "8px 15px",
                  background: "#333",
                  fontSize: "0.9rem",
                  marginBottom: "10px",
                }}
              >
                📷 Scan QR
              </button>
            </div>

            <label>Payee UPI ID</label>
            <input
              type="text"
              placeholder="Or enter manually..."
              value={payVpa}
              onChange={(e) => {
                setPayVpa(e.target.value);
                setRawQrString(""); // Clear raw string if user edits manually
              }}
            />

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
              <p className="label">No transactions.</p>
            ) : (
              <ul>
                {transactions.slice(0, 5).map((t) => (
                  <li key={t.id} className="history-item">
                    <div>
                      <span>{t.note}</span>
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

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Confirm Payment</h3>
            <p>Did the payment complete?</p>
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
