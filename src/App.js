import React, { useState, useEffect, useRef } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import "./App.css";

function App() {
  // --- State ---
  const [budget, setBudget] = useState(0);
  const [spent, setSpent] = useState(0);
  const [transactions, setTransactions] = useState([]);

  // Payment Form
  const [payVpa, setPayVpa] = useState("");
  const [payNote, setPayNote] = useState("");
  const [scannedParams, setScannedParams] = useState(null); // Store all QR data object

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
  const [debugLog, setDebugLog] = useState(""); // Debug info

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

  // --- ROBUST QR SCANNER LOGIC ---
  useEffect(() => {
    let html5QrCode;

    if (showScanner) {
      // 1. Initialize the library
      html5QrCode = new Html5Qrcode("reader-container");

      const config = { fps: 10, qrbox: { width: 250, height: 250 } };

      // 2. Start Camera (Back Camera Preference)
      html5QrCode
        .start(
          { facingMode: "environment" },
          config,
          (decodedText) => {
            // SUCCESS CALLBACK
            handleScanSuccess(decodedText);

            // Stop camera immediately after scan
            html5QrCode
              .stop()
              .then(() => {
                html5QrCode.clear();
                setShowScanner(false);
              })
              .catch((err) => console.error("Stop failed", err));
          },
          (errorMessage) => {
            // Ignore parse errors, they happen every frame
          }
        )
        .catch((err) => {
          setDebugLog("Camera Error: " + err);
          alert("Camera failed to start. Check permissions.");
          setShowScanner(false);
        });
    }

    // Cleanup when closing component
    return () => {
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch((e) => console.error(e));
      }
    };
  }, [showScanner]);

  const handleScanSuccess = (text) => {
    setDebugLog("Scanned: " + text); // Show user what was scanned

    if (text.startsWith("upi://")) {
      try {
        // 1. Parse the URL
        const urlObj = new URL(text);
        const params = new URLSearchParams(urlObj.search);

        // 2. Extract needed fields
        const pa = params.get("pa");
        const pn = params.get("pn");

        if (pa) {
          setPayVpa(pa);
          if (pn) setPayNote(pn);

          // 3. Store ALL params to preserve merchant codes (mc, tr, etc.)
          const paramsObj = {};
          for (const [key, value] of params.entries()) {
            paramsObj[key] = value;
          }
          setScannedParams(paramsObj);
        }
      } catch (e) {
        setDebugLog("Parse Error: " + e.message);
      }
    } else if (text.includes("@")) {
      setPayVpa(text);
      setScannedParams(null); // Not a merchant QR, just an ID
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

    // --- RECONSTRUCT VALID UPI URL ---
    let finalUrl = "";

    if (scannedParams && scannedParams.pa === payVpa) {
      // CASE 1: MERCHANT QR (Use original params + inject amount)
      const newParams = new URLSearchParams();

      // Add back all original merchant codes (mc, tr, mode, etc.)
      Object.keys(scannedParams).forEach((key) => {
        // Skip 'am' (amount) and 'pn' (name) if we want to override them
        if (key !== "am") {
          newParams.append(key, scannedParams[key]);
        }
      });

      // Add our Amount & Currency
      newParams.append("am", amountToPay);
      newParams.append("cu", "INR");

      finalUrl = `upi://pay?${newParams.toString()}`;
    } else {
      // CASE 2: MANUAL ENTRY (Simple Link)
      if (!payVpa) {
        alert("Enter UPI ID");
        return;
      }
      finalUrl = `upi://pay?pa=${payVpa}&am=${amountToPay}&cu=INR`;
      if (payNote) finalUrl += `&tn=${encodeURIComponent(payNote)}`;
    }

    setDebugLog("Launching: " + finalUrl); // Debug

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
      setScannedParams(null);
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

            {/* CONTAINER FOR CAMERA - FIXED ID */}
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
                setScannedParams(null); // Clear cached merchant params if user edits ID
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

            {/* DEBUG LOG - VISIBLE TO USER FOR TROUBLESHOOTING */}
            {debugLog && (
              <p
                style={{
                  fontSize: "0.7rem",
                  color: "#666",
                  marginTop: "10px",
                  wordBreak: "break-all",
                }}
              >
                Debug: {debugLog}
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
