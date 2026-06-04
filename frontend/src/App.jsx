import { useEffect, useState } from "react";
import axios from "axios";
import {
  Upload,
  Send,
  FileText,
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  Bot,
  Database,
  User,
  LayoutDashboard,
  RefreshCw,
  XCircle,
  Trash2,
  LogOut,
  Lock,
  UserPlus,
} from "lucide-react";
import "./App.css";

const API_BASE_URL = "http://127.0.0.1:8000";

function App() {
  const savedUser = localStorage.getItem("groundedai_user");

  const [isLoggedIn, setIsLoggedIn] = useState(Boolean(savedUser));
  const [currentUser, setCurrentUser] = useState(
    savedUser ? JSON.parse(savedUser) : null
  );

  const [authMode, setAuthMode] = useState("login");

  const [loginForm, setLoginForm] = useState({
    email: "",
    password: "",
  });

  const [registerForm, setRegisterForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [authError, setAuthError] = useState("");
  const [authSuccess, setAuthSuccess] = useState("");

  const [activePage, setActivePage] = useState("chat");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [documents, setDocuments] = useState([]);
  const [question, setQuestion] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  const [stats, setStats] = useState({
    total_questions: 0,
    grounded_answers: 0,
    not_found_answers: 0,
    verifier_failed: 0,
    confidence_breakdown: {
      high: 0,
      medium: 0,
      low: 0,
    },
    hallucination_risk: "Low",
  });

  const isAdmin = currentUser?.role === "admin";

  const handleRegister = async (e) => {
    e.preventDefault();
    setAuthError("");
    setAuthSuccess("");

    try {
      await axios.post(`${API_BASE_URL}/register`, registerForm);

      setAuthSuccess("Account created successfully. Please login now.");
      setAuthMode("login");

      setLoginForm({
        email: registerForm.email,
        password: "",
      });

      setRegisterForm({
        name: "",
        email: "",
        password: "",
      });
    } catch (error) {
      setAuthError(error.response?.data?.detail || "Registration failed.");
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError("");
    setAuthSuccess("");

    try {
      const response = await axios.post(`${API_BASE_URL}/login`, loginForm);

      localStorage.setItem(
        "groundedai_user",
        JSON.stringify(response.data.user)
      );

      setCurrentUser(response.data.user);
      setIsLoggedIn(true);
      setActivePage("chat");

      fetchStatsAndLogs();
      fetchDocuments();
    } catch (error) {
      setAuthError(error.response?.data?.detail || "Login failed.");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("groundedai_user");
    setIsLoggedIn(false);
    setCurrentUser(null);
    setLoginForm({
      email: "",
      password: "",
    });
    setActivePage("chat");
  };

  const fetchDocuments = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/documents`);
      setDocuments(response.data.documents || []);
    } catch (error) {
      console.error("Document fetch error:", error);
    }
  };

  const fetchStatsAndLogs = async () => {
    try {
      setDashboardLoading(true);

      const statsResponse = await axios.get(`${API_BASE_URL}/stats`);
      const logsResponse = await axios.get(`${API_BASE_URL}/logs`);

      setStats(statsResponse.data);
      setLogs(logsResponse.data.logs || []);
    } catch (error) {
      console.error("Dashboard fetch error:", error);
    } finally {
      setDashboardLoading(false);
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchStatsAndLogs();
      fetchDocuments();
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (isLoggedIn && !isAdmin && activePage !== "chat") {
      setActivePage("chat");
    }
  }, [isLoggedIn, isAdmin, activePage]);

  const handleFileUpload = async () => {
    if (!isAdmin) {
      setUploadStatus("Only admin users can upload documents.");
      return;
    }

    if (!selectedFile) {
      setUploadStatus("Please select a file first.");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      setUploadStatus("Uploading and indexing document...");

      const response = await axios.post(`${API_BASE_URL}/upload`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      setUploadStatus(
        `Uploaded successfully. Chunks added: ${response.data.result.chunks_added}`
      );

      setSelectedFile(null);
      fetchDocuments();
    } catch (error) {
      console.error(error);
      setUploadStatus(
        error.response?.data?.detail || "Upload failed. Please try again."
      );
    }
  };

  const deleteDocument = async (fileName) => {
    if (!isAdmin) {
      alert("Only admin users can delete documents.");
      return;
    }

    try {
      await axios.delete(`${API_BASE_URL}/documents/${fileName}`);
      await fetchDocuments();
    } catch (error) {
      console.error("Delete document error:", error);
      alert(error.response?.data?.detail || "Could not delete document.");
    }
  };

  const handleAskQuestion = async () => {
    if (!question.trim()) return;

    const userQuestion = question;
    setQuestion("");
    setLoading(true);

    const newEntry = {
      question: userQuestion,
      answer: "Thinking...",
      confidence: "",
      sources: [],
      status: "Loading",
      verification: "",
      log_id: null,
    };

    setChatHistory((prev) => [newEntry, ...prev]);

    try {
      const response = await axios.post(`${API_BASE_URL}/ask`, {
        question: userQuestion,
      });

      const result = response.data;

      setChatHistory((prev) => {
        const updated = [...prev];
        updated[0] = {
          question: userQuestion,
          answer: result.answer,
          confidence: result.confidence,
          sources: result.sources || [],
          status: result.status,
          verification: result.verification,
          log_id: result.log_id,
        };
        return updated;
      });

      fetchStatsAndLogs();
    } catch (error) {
      console.error(error);

      setChatHistory((prev) => {
        const updated = [...prev];
        updated[0] = {
          question: userQuestion,
          answer: "Something went wrong while contacting the backend.",
          confidence: "Low",
          sources: [],
          status: "Error",
          verification: "NOT_SUPPORTED",
          log_id: null,
        };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  };

  const clearLogs = async () => {
    if (!isAdmin) return;

    try {
      await axios.delete(`${API_BASE_URL}/logs`);
      await fetchStatsAndLogs();
    } catch (error) {
      console.error("Clear logs error:", error);
    }
  };

  const formatFileSize = (size) => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusBadge = (status) => {
    if (status === "Grounded") {
      return (
        <span className="badge badge-green">
          <CheckCircle size={14} /> Grounded
        </span>
      );
    }

    if (status === "Verifier Failed") {
      return (
        <span className="badge badge-red">
          <AlertTriangle size={14} /> Verifier Failed
        </span>
      );
    }

    if (status === "Not Found") {
      return (
        <span className="badge badge-yellow">
          <AlertTriangle size={14} /> Not Found
        </span>
      );
    }

    if (status === "Error") {
      return (
        <span className="badge badge-red">
          <XCircle size={14} /> Error
        </span>
      );
    }

    return <span className="badge badge-gray">{status}</span>;
  };

  const getConfidenceBadge = (confidence) => {
    if (!confidence) return null;

    if (confidence === "High") {
      return <span className="confidence high">High Confidence</span>;
    }

    if (confidence === "Medium") {
      return <span className="confidence medium">Medium Confidence</span>;
    }

    return <span className="confidence low">Low Confidence</span>;
  };

  const getRiskClass = (risk) => {
    if (risk === "High") return "risk-high";
    if (risk === "Medium") return "risk-medium";
    return "risk-low";
  };

  if (!isLoggedIn) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-logo">
            <Bot size={38} />
          </div>

          <h1>GroundedAI</h1>
          <p className="login-subtitle">
            Secure Company Knowledge Base Assistant
          </p>

          <div className="auth-tabs">
            <button
              className={authMode === "login" ? "auth-tab active" : "auth-tab"}
              onClick={() => {
                setAuthMode("login");
                setAuthError("");
                setAuthSuccess("");
              }}
            >
              Login
            </button>

            <button
              className={
                authMode === "register" ? "auth-tab active" : "auth-tab"
              }
              onClick={() => {
                setAuthMode("register");
                setAuthError("");
                setAuthSuccess("");
              }}
            >
              Register
            </button>
          </div>

          {authMode === "login" && (
            <form onSubmit={handleLogin}>
              <label>Email</label>
              <input
                type="email"
                placeholder="Enter your email"
                value={loginForm.email}
                onChange={(e) =>
                  setLoginForm((prev) => ({
                    ...prev,
                    email: e.target.value,
                  }))
                }
                required
              />

              <label>Password</label>
              <input
                type="password"
                placeholder="Enter your password"
                value={loginForm.password}
                onChange={(e) =>
                  setLoginForm((prev) => ({
                    ...prev,
                    password: e.target.value,
                  }))
                }
                required
              />

              {authError && <p className="login-error">{authError}</p>}
              {authSuccess && <p className="login-success">{authSuccess}</p>}

              <button className="login-btn" type="submit">
                <Lock size={18} />
                Login
              </button>
            </form>
          )}

          {authMode === "register" && (
            <form onSubmit={handleRegister}>
              <label>Name</label>
              <input
                type="text"
                placeholder="Enter your name"
                value={registerForm.name}
                onChange={(e) =>
                  setRegisterForm((prev) => ({
                    ...prev,
                    name: e.target.value,
                  }))
                }
                required
              />

              <label>Email</label>
              <input
                type="email"
                placeholder="Enter your email"
                value={registerForm.email}
                onChange={(e) =>
                  setRegisterForm((prev) => ({
                    ...prev,
                    email: e.target.value,
                  }))
                }
                required
              />

              <label>Password</label>
              <input
                type="password"
                placeholder="Minimum 6 characters"
                value={registerForm.password}
                onChange={(e) =>
                  setRegisterForm((prev) => ({
                    ...prev,
                    password: e.target.value,
                  }))
                }
                required
              />

              {authError && <p className="login-error">{authError}</p>}
              {authSuccess && <p className="login-success">{authSuccess}</p>}

              <button className="login-btn" type="submit">
                <UserPlus size={18} />
                Register
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <Bot size={28} />
          </div>
          <div>
            <h1>GroundedAI</h1>
            <p>Company Knowledge Assistant</p>
          </div>
        </div>

        <nav>
          <button
            className={activePage === "chat" ? "nav-btn active" : "nav-btn"}
            onClick={() => setActivePage("chat")}
          >
            <Bot size={18} />
            Chat Assistant
          </button>

          {isAdmin && (
            <button
              className={activePage === "upload" ? "nav-btn active" : "nav-btn"}
              onClick={() => {
                setActivePage("upload");
                fetchDocuments();
              }}
            >
              <Upload size={18} />
              Upload Documents
            </button>
          )}

          {isAdmin && (
            <button
              className={
                activePage === "dashboard" ? "nav-btn active" : "nav-btn"
              }
              onClick={() => {
                setActivePage("dashboard");
                fetchStatsAndLogs();
              }}
            >
              <LayoutDashboard size={18} />
              Dashboard
            </button>
          )}
        </nav>

        <div className="sidebar-footer">
          <ShieldCheck size={18} />
          <span>RAG + Hallucination Control</span>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h2>
              {activePage === "chat" && "Ask Company Knowledge"}
              {activePage === "upload" && "Upload Company Documents"}
              {activePage === "dashboard" && "Admin Dashboard"}
            </h2>
            <p>
              Answers are generated using uploaded documents with source-based
              verification.
            </p>
          </div>

          <div className="topbar-actions">
            <div className="user-chip">
              <User size={16} />
              {currentUser?.name || "User"} · {currentUser?.role}
            </div>

            <button className="logout-btn" onClick={handleLogout}>
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </header>

        {activePage === "chat" && (
          <section className="page">
            <div className="chat-layout">
              <div className="chat-main">
                <div className="question-box">
                  <textarea
                    placeholder="Ask a question from uploaded company documents..."
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleAskQuestion();
                      }
                    }}
                  />

                  <button
                    className="primary-btn"
                    onClick={handleAskQuestion}
                    disabled={loading}
                  >
                    <Send size={18} />
                    {loading ? "Asking..." : "Ask"}
                  </button>
                </div>

                <div className="example-questions">
                  <button
                    onClick={() =>
                      setQuestion("What are the office timings for interns?")
                    }
                  >
                    Office timings?
                  </button>
                  <button
                    onClick={() =>
                      setQuestion("What should interns do for technical issues?")
                    }
                  >
                    Technical issue process?
                  </button>
                  <button
                    onClick={() =>
                      setQuestion("What is the CEO's favourite food?")
                    }
                  >
                    Hallucination test
                  </button>
                </div>

                <div className="chat-history">
                  {chatHistory.length === 0 ? (
                    <div className="empty-state">
                      <Bot size={44} />
                      <h3>No questions in this session</h3>
                      <p>
                        Ask a question. The answer will include confidence,
                        verification, sources, and will also be saved in SQLite.
                      </p>
                    </div>
                  ) : (
                    chatHistory.map((chat, index) => (
                      <div className="answer-card" key={index}>
                        <div className="question-line">
                          <strong>Q:</strong> {chat.question}
                        </div>

                        <div className="answer-line">
                          <strong>A:</strong>
                          <p>{chat.answer}</p>
                        </div>

                        <div className="answer-meta">
                          {getStatusBadge(chat.status)}
                          {getConfidenceBadge(chat.confidence)}

                          {chat.verification && (
                            <span className="verification">
                              Verification: {chat.verification}
                            </span>
                          )}

                          {chat.log_id && (
                            <span className="verification">
                              Log ID: {chat.log_id}
                            </span>
                          )}
                        </div>

                        {chat.sources && chat.sources.length > 0 && (
                          <div className="sources">
                            <h4>Sources Used</h4>

                            {chat.sources.map((source, sourceIndex) => (
                              <div className="source-card" key={sourceIndex}>
                                <FileText size={16} />
                                <div>
                                  <strong>{source.file_name}</strong>
                                  <p>
                                    Chunk {source.chunk_index} | Distance:{" "}
                                    {Number(source.distance).toFixed(3)}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="info-panel">
                <div className="panel-card">
                  <ShieldCheck size={28} />
                  <h3>Hallucination Guard</h3>
                  <p>
                    Answers are verified against retrieved document context. If
                    unsupported, the system refuses the answer.
                  </p>
                </div>

                <div className="panel-card">
                  <Database size={28} />
                  <h3>SQLite Logging</h3>
                  <p>
                    Every question, answer, confidence score, source, and
                    verification result is saved in the backend database.
                  </p>
                </div>

                {!isAdmin && (
                  <div className="panel-card">
                    <User size={28} />
                    <h3>Employee Access</h3>
                    <p>
                      You can ask questions from the company knowledge base.
                      Upload and dashboard access is restricted to admins.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {isAdmin && activePage === "upload" && (
          <section className="page">
            <div className="upload-layout">
              <div className="upload-card">
                <div className="upload-icon">
                  <Upload size={40} />
                </div>

                <h3>Upload Knowledge Documents</h3>
                <p>
                  Upload PDF, DOCX, or TXT files. The backend will extract text,
                  chunk it, create embeddings, and store it in ChromaDB.
                </p>

                <input
                  type="file"
                  accept=".pdf,.docx,.txt"
                  onChange={(e) => setSelectedFile(e.target.files[0])}
                />

                {selectedFile && (
                  <div className="selected-file">
                    <FileText size={18} />
                    {selectedFile.name}
                  </div>
                )}

                <button
                  className="primary-btn upload-btn"
                  onClick={handleFileUpload}
                >
                  <Upload size={18} />
                  Upload and Index
                </button>

                {uploadStatus && <p className="upload-status">{uploadStatus}</p>}
              </div>

              <div className="documents-card">
                <div className="documents-header">
                  <h3>Uploaded Documents</h3>
                  <button className="secondary-btn" onClick={fetchDocuments}>
                    <RefreshCw size={16} />
                    Refresh
                  </button>
                </div>

                {documents.length === 0 ? (
                  <p className="muted">No documents uploaded yet.</p>
                ) : (
                  <div className="documents-list">
                    {documents.map((doc) => (
                      <div className="document-row" key={doc.file_name}>
                        <div className="document-info">
                          <FileText size={18} />
                          <div>
                            <strong>{doc.file_name}</strong>
                            <p>
                              {doc.file_type} · {formatFileSize(doc.file_size)}
                            </p>
                          </div>
                        </div>

                        <button
                          className="icon-danger-btn"
                          onClick={() => deleteDocument(doc.file_name)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <p className="document-note">
                  Note: Deleting removes the file from local uploads. To fully
                  remove old vector embeddings, rebuild ChromaDB.
                </p>
              </div>
            </div>
          </section>
        )}

        {isAdmin && activePage === "dashboard" && (
          <section className="page">
            <div className="dashboard-actions">
              <button className="secondary-btn" onClick={fetchStatsAndLogs}>
                <RefreshCw size={16} />
                {dashboardLoading ? "Refreshing..." : "Refresh"}
              </button>

              <button className="danger-btn" onClick={clearLogs}>
                <XCircle size={16} />
                Clear Logs
              </button>
            </div>

            <div className="stats-grid">
              <div className="stat-card">
                <Bot size={28} />
                <p>Total Questions</p>
                <h3>{stats.total_questions}</h3>
              </div>

              <div className="stat-card">
                <CheckCircle size={28} />
                <p>Grounded Answers</p>
                <h3>{stats.grounded_answers}</h3>
              </div>

              <div className="stat-card">
                <AlertTriangle size={28} />
                <p>Not Found</p>
                <h3>{stats.not_found_answers}</h3>
              </div>

              <div className="stat-card">
                <XCircle size={28} />
                <p>Verifier Failed</p>
                <h3>{stats.verifier_failed}</h3>
              </div>
            </div>

            <div className="dashboard-row">
              <div className="dashboard-note">
                <h3>Confidence Breakdown</h3>
                <p>High: {stats.confidence_breakdown?.high || 0}</p>
                <p>Medium: {stats.confidence_breakdown?.medium || 0}</p>
                <p>Low: {stats.confidence_breakdown?.low || 0}</p>
              </div>

              <div className="dashboard-note">
                <h3>Hallucination Risk</h3>
                <div
                  className={`risk-pill ${getRiskClass(
                    stats.hallucination_risk
                  )}`}
                >
                  {stats.hallucination_risk}
                </div>
                <p>
                  Risk is calculated from verifier-failed answers compared to
                  total questions.
                </p>
              </div>
            </div>

            <div className="logs-section">
              <h3>Recent Query Logs</h3>

              {logs.length === 0 ? (
                <p className="muted">No logs found yet.</p>
              ) : (
                <div className="logs-list">
                  {logs.map((log) => (
                    <div className="log-card" key={log.id}>
                      <div className="log-header">
                        <strong>#{log.id}</strong>
                        {getStatusBadge(log.status)}
                        {getConfidenceBadge(log.confidence)}
                      </div>

                      <p className="log-question">
                        <strong>Q:</strong> {log.question}
                      </p>

                      <p className="log-answer">
                        <strong>A:</strong> {log.answer}
                      </p>

                      <p className="log-time">
                        {log.created_at
                          ? new Date(log.created_at).toLocaleString()
                          : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;