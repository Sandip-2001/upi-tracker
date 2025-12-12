import React, { useState, useEffect } from "react";
import { Html5Qrcode } from "html5-qrcode";
import "./App.css";

function App() {
  // --- State ---
  const [budget, setBudget] = useState(0);
  const [spent, setSpent] = useState(0);
  const [transactions, setTransactions] = useState([]);

  // Payment Form
  const [payVpa, setPayVpa] = useState("");
  const [payNote, setPayNote] = useState("");
  const [rawQrString, setRawQrString] = useState(""); // Store exact raw scan

  // Split Bill
  const [totalAmount, setTotalAmount] = useState("");
  const [myShare, setMyShare] = useState("");
  const [isSplit, setIsSplit] = useState(false);

  // UI
  const [showModal, setShowModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [pendingShare, setPendingShare] = useState(0);
  const [isSetupDone, setIsSetupDone] = useState(false);
  const [debugLog, setDebugLog] = useState("");

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
    let html5QrCode;
    if (showScanner) {
      html5QrCode = new Html5Qrcode("reader-container");
      const config = { fps: 10, qrbox: { width: 250, height: 250 } };

      html5QrCode
        .start(
          { facingMode: "environment" },
          config,
          (decodedText) => {
            handleScanSuccess(decodedText);
            html5QrCode.stop().then(() => {
              html5QrCode.clear();
              setShowScanner(false);
            });
          },
          () => {}
        )
        .catch((err) => {
          setDebugLog("Cam Error: " + err);
          alert("Camera failed. Ensure you are on HTTPS.");
          setShowScanner(false);
        });
    }
    return () => {
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(() => {});
      }
    };
  }, [showScanner]);

  const handleScanSuccess = (text) => {
    // 1. Check if it's a UPI URL
    if (text.includes("pa=") || text.includes("@")) {
      // 2. Save the RAW string exactly as it is
      setRawQrString(text);
      setDebugLog("Raw: " + text);

      // 3. Extract just the ID for display (visual only)
      try {
        if (text.startsWith("upi://")) {
          const url = new URL(text);
          setPayVpa(url.searchParams.get("pa") || "Merchant");
        } else {
          setPayVpa(text); // Fallback for plain VPA
        }
      } catch (e) {
        setPayVpa("Merchant QR");
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
      alert("Enter valid Amount");
      return;
    }

    // --- THE FIX: SURGICAL APPEND ---
    let finalUrl = "";

    // Format amount to 2 decimal places (Critical for some banks)
    const formattedAmount = amountToPay.toFixed(2);

    if (rawQrString && rawQrString.includes("upi://")) {
      // CASE 1: SCANNED QR
      // We take the original string and append amount to it.
      // We do NOT reconstruct it, preserving the 'sign' and 'mc' order.

      finalUrl = rawQrString;

      // If the QR already has an amount (e.g. dynamic QR), remove it first
      // This regex replaces '&am=...' or '?am=...' with nothing
      finalUrl = finalUrl.replace(/([?&])am=[^&]*(&|$)/, "$1");
      finalUrl = finalUrl.replace(/([?&])cu=[^&]*(&|$)/, "$1"); // Remove currency too

      // Now append our Amount
      // Check if URL has query params already (contains '?')
      const separator = finalUrl.includes("?") ? "&" : "?";

      finalUrl += `${separator}am=${formattedAmount}&cu=INR`;
    } else {
      // CASE 2: MANUAL ENTRY
      if (!payVpa) {
        alert("Enter UPI ID");
        return;
      }
      finalUrl = `upi://pay?pa=${payVpa}&am=${formattedAmount}&cu=INR`;
      if (payNote) finalUrl += `&tn=${encodeURIComponent(payNote)}`;
    }

    setDebugLog("Final Link: " + finalUrl);

    // Open App
    window.location.href = finalUrl;

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
            <div id="reader-container"></div>
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
                📷 Scan
              </button>
            </div>

            <label>Payee UPI ID</label>
            <input
              type="text"
              placeholder="Or enter manually..."
              value={payVpa}
              onChange={(e) => {
                setPayVpa(e.target.value);
                setRawQrString("");
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

            {debugLog && (
              <p
                style={{
                  fontSize: "0.6rem",
                  color: "#555",
                  marginTop: "10px",
                  wordBreak: "break-all",
                  fontFamily: "monospace",
                }}
              >
                {debugLog}
              </p>
            )}
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
                          Full: ₹{t.fullAmount}
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
            New Month
          </button>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Confirm Payment</h3>
            <p>Did it work?</p>
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
