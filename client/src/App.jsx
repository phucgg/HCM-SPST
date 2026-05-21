import React, { useCallback, useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import "./App.css";

const STORAGE_KEYS = {
  displayName: "hcm_display_name",
  sessionId: "hcm_session_id",
  startedAtMs: "hcm_started_at_ms",
  currentIndex: "hcm_current_index",
  answers: "hcm_answers",
  results: "hcm_answer_results",
  feedbacks: "hcm_answer_feedbacks"
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
  const [stations, setStations] = useState([]);
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

  const [answerFeedbacks, setAnswerFeedbacks] = useState(() => {
    return readJson(STORAGE_KEYS.feedbacks, {});
  });

  const [submitResult, setSubmitResult] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [startError, setStartError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStation, setSelectedStation] = useState(null);
  const [stationNotice, setStationNotice] = useState("");
  const [lastStationId, setLastStationId] = useState("");

  const hasStarted = Boolean(sessionId && displayName && startedAtMs);
  const currentQuestion = questions[currentIndex];

  function clearProgressOnly() {
    localStorage.removeItem(STORAGE_KEYS.sessionId);
    localStorage.removeItem(STORAGE_KEYS.startedAtMs);
    localStorage.removeItem(STORAGE_KEYS.currentIndex);
    localStorage.removeItem(STORAGE_KEYS.answers);
    localStorage.removeItem(STORAGE_KEYS.results);
    localStorage.removeItem(STORAGE_KEYS.feedbacks);
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
        setStations(configData.stations || []);
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
            setStations(sessionData.stations || configData.stations || []);
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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.feedbacks, JSON.stringify(answerFeedbacks));
  }, [answerFeedbacks]);

  useEffect(() => {
    if (questions.length && currentIndex > questions.length - 1) {
      setCurrentIndex(0);
    }
  }, [questions.length, currentIndex]);

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

  const activeStation = useMemo(() => {
    if (!currentQuestion) return null;
    return stations.find((station) => station.id === currentQuestion.stationId);
  }, [currentQuestion, stations]);

  useEffect(() => {
    if (!hasStarted || !activeStation) return;

    if (!lastStationId) {
      setLastStationId(activeStation.id);
      setStationNotice(`Bạn đang bước vào Trạm ${activeStation.order}: ${activeStation.shortTitle}`);
      return;
    }

    if (lastStationId !== activeStation.id) {
      setLastStationId(activeStation.id);
      setStationNotice(`Chuyển trạm thành công: Trạm ${activeStation.order} - ${activeStation.shortTitle}`);
    }
  }, [activeStation, hasStarted, lastStationId]);

  useEffect(() => {
    if (!stationNotice) return;

    const timer = setTimeout(() => {
      setStationNotice("");
    }, 2600);

    return () => clearTimeout(timer);
  }, [stationNotice]);

  const stationProgress = useMemo(() => {
    return stations.map((station) => {
      const stationQuestions = questions.filter(
        (question) => question.stationId === station.id
      );

      const answered = stationQuestions.filter((question) => {
        return Object.prototype.hasOwnProperty.call(answers, question.id);
      }).length;

      const correct = stationQuestions.filter((question) => {
        return answerResults[question.id] === true;
      }).length;

      return {
        ...station,
        total: stationQuestions.length,
        answered,
        correct,
        completed: stationQuestions.length > 0 && answered === stationQuestions.length
      };
    });
  }, [stations, questions, answers, answerResults]);

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
      body: JSON.stringify({ displayName: name })
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
    localStorage.setItem(STORAGE_KEYS.feedbacks, "{}");

    setDisplayName(data.displayName);
    setSessionId(data.sessionId);
    setStartedAtMs(Number(data.startedAtMs));
    setTimeLimitSeconds(data.timeLimitSeconds || 600);
    setStations(data.stations || stations);
    setQuestions(data.questions || []);
    setCurrentIndex(0);
    setAnswers({});
    setAnswerResults({});
    setAnswerFeedbacks({});
    setSubmitResult(null);
    setLastStationId("");
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

    setAnswerFeedbacks((prev) => ({
      ...prev,
      [questionId]: data.feedback || ""
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
        body: JSON.stringify({ sessionId })
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
    setAnswerFeedbacks({});
    setSubmitResult(null);
    setIsSubmitting(false);
    setQuestions([]);
    setLastStationId("");
  }

  function renderMissionMap() {
    return (
      <section className="mission-map">
        {stationProgress.map((station) => {
          const isActive = activeStation?.id === station.id;
          const isPerfect =
            submitResult?.stationResults?.find((item) => item.stationId === station.id)
              ?.completed || false;

          return (
            <button
              type="button"
              key={station.id}
              onClick={() => setSelectedStation(station)}
              className={[
                "station-card",
                isActive ? "active" : "",
                station.completed ? "completed" : "",
                isPerfect ? "perfect" : ""
              ].join(" ")}
            >
              <div className="station-number">Trạm {station.order}</div>
              <h3>{station.shortTitle}</h3>
              <p>{station.mission}</p>

              <div className="station-mini-progress">
                <span>
                  {station.total > 0 ? `${station.answered}/${station.total} câu` : "Nhấn để đọc"}
                </span>
                <span>{station.completed ? "Hoàn thành" : "Mở nội dung"}</span>
              </div>
            </button>
          );
        })}
      </section>
    );
  }

  function renderStationModal() {
    if (!selectedStation) return null;

    return (
      <div className="modal-backdrop" onClick={() => setSelectedStation(null)}>
        <section className="station-modal" onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            className="modal-close"
            onClick={() => setSelectedStation(null)}
          >
            ×
          </button>

          <div className="panel-label">Trạm {selectedStation.order}</div>
          <h2>{selectedStation.title}</h2>
          <p className="modal-mission">{selectedStation.mission}</p>

          <h3>{selectedStation.readingTitle}</h3>

          <div className="reading-list">
            {selectedStation.readingPoints?.map((point, index) => (
              <article className="reading-item" key={index}>
                <span>{index + 1}</span>
                <p>{point}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    );
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

  function renderStartPanel() {
    return (
      <section className="start-card">
        <div className="panel-label">Bắt đầu hành trình</div>
        <h2>Nhập tên để vào 4 trạm</h2>

        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Nhập tên của bạn..."
          maxLength={30}
        />

        {startError && <p className="error-text">{startError}</p>}

        <button onClick={startQuiz}>Bắt đầu</button>

        <p className="privacy-note">
          Có thể bấm từng trạm phía trên để đọc nội dung trước khi làm bài.
        </p>
      </section>
    );
  }

  function renderQuizPanel() {
    if (submitResult) {
      return (
        <section className="quiz-card">
          <div className="result-box">
            <div className="panel-label">Báo cáo hoàn thành</div>
            <h2>Đã nộp bài</h2>

            <p className="score">
              {submitResult.score}/{submitResult.total} câu đúng
            </p>

            <p>
              Thời gian làm bài:{" "}
              <strong>{formatDuration(submitResult.durationSeconds)}</strong>
            </p>

            <div className="station-result-list">
              {submitResult.stationResults?.map((station) => (
                <div className="station-result" key={station.stationId}>
                  <div>
                    <strong>
                      Trạm {station.order}: {station.shortTitle}
                    </strong>
                    <span>
                      {station.score}/{station.total} câu đúng
                    </span>
                  </div>

                  <em>
                    {station.completed
                      ? station.badge
                      : "Nên đọc lại nội dung trạm này"}
                  </em>
                </div>
              ))}
            </div>

            <button onClick={resetQuiz}>Làm lại bài mới</button>
          </div>
        </section>
      );
    }

    if (!currentQuestion) {
      return (
        <section className="quiz-card">
          <p>Không tải được câu hỏi. Hãy bấm làm lại hoặc reload trang.</p>
        </section>
      );
    }

    const hasResult = Object.prototype.hasOwnProperty.call(
      answerResults,
      currentQuestion.id
    );

    return (
      <section className="quiz-card">
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
                questions.length ? (answeredCount / questions.length) * 100 : 0
              }%`
            }}
          />
        </div>

        <div className="station-focus">
          <span>Trạm {activeStation?.order}</span>
          <h2>{activeStation?.title}</h2>
          <p>{activeStation?.summary}</p>
          <button type="button" onClick={() => setSelectedStation(activeStation)}>
            Đọc nội dung trạm này
          </button>
        </div>

        <div className="question-meta">
          <span>
            Câu {currentIndex + 1}/{questions.length}
          </span>
          <strong>{currentQuestion.stationShortTitle}</strong>
        </div>

        <h2 className="question-text">{currentQuestion.question}</h2>

        <div className="options">
          {currentQuestion.options.map((option, optionIndex) => {
            const selected = answers[currentQuestion.id] === optionIndex;

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
          <div className="feedback correct">
            <strong>Đúng.</strong>
            <p>{answerFeedbacks[currentQuestion.id]}</p>
          </div>
        )}

        {answerResults[currentQuestion.id] === false && (
          <div className="feedback wrong">
            <strong>Chưa chính xác.</strong>
            <p>{answerFeedbacks[currentQuestion.id]}</p>
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
      </section>
    );
  }

  if (isLoading) {
    return (
      <main className="page">
        <section className="hero">
          <p className="eyebrow">HCM Mission</p>
          <h1>4 trạm vận dụng tư tưởng Hồ Chí Minh</h1>
          <p>Đang tải dữ liệu...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      {stationNotice && <div className="station-toast">{stationNotice}</div>}

      <section className="hero">
        <div className="hero-content">
          <p className="eyebrow">HCM Mission</p>
          <h1>4 trạm vận dụng tư tưởng Hồ Chí Minh</h1>
          <p>
            Hành trình tương tác về độc lập dân tộc gắn liền với chủ nghĩa xã hội
            trong sự nghiệp cách mạng Việt Nam giai đoạn hiện nay.
          </p>
        </div>

        <div className="hero-chip">
          <span>10 phút</span>
          <span>Realtime</span>
          <span>4 trạm</span>
          <span>Click trạm để học</span>
        </div>
      </section>

      {renderMissionMap()}

      <section className="layout">
        {!hasStarted && !submitResult ? renderStartPanel() : renderQuizPanel()}
        {renderLeaderboard()}
      </section>

      {renderStationModal()}
    </main>
  );
}