import React, { useCallback, useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import "./App.css";

const STORAGE_KEYS = {
  displayName: "hcm_display_name",
  sessionId: "hcm_session_id",
  startedAtMs: "hcm_started_at_ms",
  currentIndex: "hcm_current_index",
  answers: "hcm_answers",
  results: "hcm_answer_results"
};

function readJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function formatDuration(seconds) {
  const value = Number(seconds);

  if (!Number.isFinite(value)) return "0s";

  const m = Math.floor(value / 60);
  const s = value % 60;

  if (m <= 0) return `${s}s`;

  return `${m}m ${s}s`;
}

function formatCountdown(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  const m = Math.floor(value / 60);
  const s = value % 60;

  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function App() {
  const [questions, setQuestions] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);

  const [displayName, setDisplayName] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.displayName) || "";
  });

  const [sessionId, setSessionId] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.sessionId) || "";
  });

  const [startedAtMs, setStartedAtMs] = useState(() => {
    return Number(localStorage.getItem(STORAGE_KEYS.startedAtMs)) || 0;
  });

  const [timeLimitSeconds, setTimeLimitSeconds] = useState(600);
  const [nowMs, setNowMs] = useState(Date.now());

  const [currentIndex, setCurrentIndex] = useState(() => {
    return Number(localStorage.getItem(STORAGE_KEYS.currentIndex)) || 0;
  });

  const [answers, setAnswers] = useState(() => {
    return readJson(STORAGE_KEYS.answers, {});
  });

  const [answerResults, setAnswerResults] = useState(() => {
    return readJson(STORAGE_KEYS.results, {});
  });

  const [submitResult, setSubmitResult] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [startError, setStartError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const hasStarted = Boolean(sessionId && displayName && startedAtMs);

  function clearProgressOnly() {
    localStorage.removeItem(STORAGE_KEYS.sessionId);
    localStorage.removeItem(STORAGE_KEYS.startedAtMs);
    localStorage.removeItem(STORAGE_KEYS.currentIndex);
    localStorage.removeItem(STORAGE_KEYS.answers);
    localStorage.removeItem(STORAGE_KEYS.results);
  }

  useEffect(() => {
    async function loadInitialData() {
      try {
        const [configRes, leaderboardRes] = await Promise.all([
          fetch("/api/config"),
          fetch("/api/leaderboard")
        ]);

        const configData = await configRes.json();
        const leaderboardData = await leaderboardRes.json();

        setTimeLimitSeconds(configData.timeLimitSeconds || 600);
        setLeaderboard(leaderboardData);

        const savedSessionId = localStorage.getItem(STORAGE_KEYS.sessionId);

        if (savedSessionId) {
          const sessionRes = await fetch(`/api/session/${savedSessionId}`);

          if (sessionRes.ok) {
            const sessionData = await sessionRes.json();

            if (sessionData.submitted) {
              clearProgressOnly();
              setSessionId("");
              setStartedAtMs(0);
              setQuestions([]);
              return;
            }

            setDisplayName(sessionData.displayName);
            setSessionId(sessionData.sessionId);
            setStartedAtMs(Number(sessionData.startedAtMs));
            setTimeLimitSeconds(sessionData.timeLimitSeconds || 600);
            setQuestions(sessionData.questions || []);
            setAnswers(sessionData.answers || {});
            setAnswerResults(sessionData.results || {});
          } else {
            clearProgressOnly();
            setSessionId("");
            setStartedAtMs(0);
            setQuestions([]);
          }
        }
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    }

    loadInitialData();
  }, []);

  useEffect(() => {
    const socket = io();

    socket.on("leaderboard:update", (data) => {
      setLeaderboard(data);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.currentIndex, String(currentIndex));
  }, [currentIndex]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.answers, JSON.stringify(answers));
  }, [answers]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.results, JSON.stringify(answerResults));
  }, [answerResults]);

  const elapsedSeconds = useMemo(() => {
    if (!startedAtMs) return 0;

    const elapsed = Math.floor((nowMs - Number(startedAtMs)) / 1000);

    if (!Number.isFinite(elapsed)) return 0;

    return Math.max(0, elapsed);
  }, [nowMs, startedAtMs]);

  const remainingSeconds = useMemo(() => {
    return Math.max(0, timeLimitSeconds - elapsedSeconds);
  }, [timeLimitSeconds, elapsedSeconds]);

  const answeredCount = useMemo(() => {
    return Object.keys(answers).length;
  }, [answers]);

  const currentQuestion = questions[currentIndex];

  async function startQuiz() {
    const name = displayName.trim();

    if (!name) {
      setStartError("Bạn cần nhập tên trước khi bắt đầu.");
      return;
    }

    setStartError("");

    const res = await fetch("/api/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        displayName: name
      })
    });

    const data = await res.json();

    if (!res.ok) {
      setStartError(data.message || "Không thể bắt đầu bài làm.");
      return;
    }

    localStorage.setItem(STORAGE_KEYS.displayName, data.displayName);
    localStorage.setItem(STORAGE_KEYS.sessionId, data.sessionId);
    localStorage.setItem(STORAGE_KEYS.startedAtMs, String(data.startedAtMs));
    localStorage.setItem(STORAGE_KEYS.currentIndex, "0");
    localStorage.setItem(STORAGE_KEYS.answers, "{}");
    localStorage.setItem(STORAGE_KEYS.results, "{}");

    setDisplayName(data.displayName);
    setSessionId(data.sessionId);
    setStartedAtMs(Number(data.startedAtMs));
    setTimeLimitSeconds(data.timeLimitSeconds || 600);
    setQuestions(data.questions || []);
    setCurrentIndex(0);
    setAnswers({});
    setAnswerResults({});
    setSubmitResult(null);
  }

  async function chooseAnswer(optionIndex) {
    if (!currentQuestion) return;

    const questionId = currentQuestion.id;

    if (Object.prototype.hasOwnProperty.call(answerResults, questionId)) {
      return;
    }

    const res = await fetch("/api/check-answer", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        sessionId,
        questionId,
        selectedIndex: optionIndex
      })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.message || "Không thể kiểm tra đáp án.");
      return;
    }

    setAnswers((prev) => ({
      ...prev,
      [questionId]: data.selectedIndex
    }));

    setAnswerResults((prev) => ({
      ...prev,
      [questionId]: data.isCorrect
    }));
  }

  function goNext() {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  }

  function goPrevious() {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  }

  const submitQuiz = useCallback(
    async (autoSubmit = false) => {
      if (!sessionId || isSubmitting || submitResult) return;

      if (!autoSubmit && answeredCount < questions.length) {
        const ok = window.confirm(
          "Bạn vẫn còn câu chưa trả lời. Bạn có chắc muốn nộp bài không?"
        );

        if (!ok) return;
      }

      setIsSubmitting(true);

      const res = await fetch("/api/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sessionId
        })
      });

      const data = await res.json();

      setIsSubmitting(false);

      if (!res.ok) {
        alert(data.message || "Không thể nộp bài.");
        return;
      }

      setSubmitResult(data);
      setLeaderboard(data.leaderboard || []);

      clearProgressOnly();
      setSessionId("");
      setStartedAtMs(0);
    },
    [sessionId, isSubmitting, submitResult, answeredCount, questions.length]
  );

  useEffect(() => {
    if (!hasStarted || submitResult || isSubmitting) return;
    if (!questions.length) return;

    if (remainingSeconds <= 0) {
      submitQuiz(true);
    }
  }, [
    hasStarted,
    submitResult,
    isSubmitting,
    questions.length,
    remainingSeconds,
    submitQuiz
  ]);

  function resetQuiz() {
    clearProgressOnly();

    setSessionId("");
    setStartedAtMs(0);
    setCurrentIndex(0);
    setAnswers({});
    setAnswerResults({});
    setSubmitResult(null);
    setIsSubmitting(false);
    setQuestions([]);
  }

  function renderLeaderboard() {
    return (
      <aside className="leaderboard-card">
        <h2>Bảng xếp hạng</h2>

        <p className="privacy-note">
          Xếp hạng theo số câu đúng. Nếu bằng điểm thì ai làm nhanh hơn đứng trên.
        </p>

        <div className="leaderboard-list">
          {leaderboard.length === 0 && (
            <p className="muted">Chưa có ai nộp bài.</p>
          )}

          {leaderboard.map((item, index) => (
            <div
              className="leaderboard-item"
              key={`${item.displayName}-${item.createdAt}-${index}`}
            >
              <span>#{index + 1}</span>

              <strong>{item.displayName}</strong>

              <span>
                {item.score}/{item.total}
              </span>

              <span>{formatDuration(item.durationSeconds)}</span>
            </div>
          ))}
        </div>
      </aside>
    );
  }

  if (isLoading) {
    return (
      <main className="page">
        <section className="hero">
          <p className="eyebrow">HCM Quiz</p>
          <h1>
            Tư tưởng Hồ Chí Minh về độc lập dân tộc gắn liền với chủ nghĩa xã hội
          </h1>
        </section>

        <section className="layout">
          <section className="start-card">
            <h2>Đang tải...</h2>
          </section>

          {renderLeaderboard()}
        </section>
      </main>
    );
  }

  if (!hasStarted && !submitResult) {
    return (
      <main className="page">
        <section className="hero">
          <p className="eyebrow">HCM Quiz</p>
          <h1>
            Tư tưởng Hồ Chí Minh về độc lập dân tộc gắn liền với chủ nghĩa xã hội
          </h1>
        </section>

        <section className="layout">
          <section className="start-card">
            <h2>Bắt đầu làm bài</h2>

            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Nhập tên của bạn..."
              maxLength={30}
            />

            {startError && <p className="error-text">{startError}</p>}

            <button onClick={startQuiz}>Bắt đầu</button>
          </section>

          {renderLeaderboard()}
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">HCM Quiz</p>
        <h1>
          Tư tưởng Hồ Chí Minh về độc lập dân tộc gắn liền với chủ nghĩa xã hội
        </h1>
      </section>

      <section className="layout">
        <section className="quiz-card">
          {submitResult ? (
            <div className="result-box">
              <h2>Đã nộp bài</h2>

              <p className="score">
                {submitResult.score}/{submitResult.total} câu đúng
              </p>

              <p>
                Thời gian làm bài:{" "}
                <strong>{formatDuration(submitResult.durationSeconds)}</strong>
              </p>

              <button onClick={resetQuiz}>Làm lại bài mới</button>
            </div>
          ) : currentQuestion ? (
            <>
              <div className="top-row">
                <div>
                  <strong>{displayName}</strong>
                  <span className="muted">
                    {" "}
                    · {answeredCount}/{questions.length} câu
                  </span>
                </div>

                <div className={remainingSeconds <= 60 ? "timer danger" : "timer"}>
                  {formatCountdown(remainingSeconds)}
                </div>
              </div>

              <div className="progress">
                <div
                  className="progress-bar"
                  style={{
                    width: `${
                      questions.length
                        ? (answeredCount / questions.length) * 100
                        : 0
                    }%`
                  }}
                />
              </div>

              <div className="question-meta">
                <span>Câu {currentIndex + 1}</span>
                <strong>{currentQuestion.topic}</strong>
              </div>

              <h2 className="question-text">{currentQuestion.question}</h2>

              <div className="options">
                {currentQuestion.options.map((option, optionIndex) => {
                  const selected = answers[currentQuestion.id] === optionIndex;

                  const hasResult = Object.prototype.hasOwnProperty.call(
                    answerResults,
                    currentQuestion.id
                  );

                  return (
                    <button
                      key={optionIndex}
                      onClick={() => chooseAnswer(optionIndex)}
                      disabled={hasResult}
                      className={selected ? "option selected" : "option"}
                    >
                      {String.fromCharCode(65 + optionIndex)}. {option}
                    </button>
                  );
                })}
              </div>

              {answerResults[currentQuestion.id] === true && (
                <div className="feedback correct">Đúng</div>
              )}

              {answerResults[currentQuestion.id] === false && (
                <div className="feedback wrong">
                  Sai. Hệ thống không hiển thị đáp án đúng.
                </div>
              )}

              <div className="nav-buttons">
                <button onClick={goPrevious} disabled={currentIndex === 0}>
                  Previous
                </button>

                <button
                  onClick={goNext}
                  disabled={currentIndex === questions.length - 1}
                >
                  Next
                </button>
              </div>

              <button
                className="submit-button"
                onClick={() => submitQuiz(false)}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Đang nộp..." : "Nộp bài"}
              </button>
            </>
          ) : (
            <p>Không tải được câu hỏi. Hãy bấm làm lại hoặc reload trang.</p>
          )}
        </section>

        {renderLeaderboard()}
      </section>
    </main>
  );
}