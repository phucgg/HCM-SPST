import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import './style.css';

const API = import.meta.env.PROD ? '' : 'http://localhost:3000';
const socket = io(API, { transports: ['websocket'] });

function msToSec(ms) {
  return (ms / 1000).toFixed(1) + 's';
}

function App() {
  const [nickname, setNickname] = useState('');
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [leaderboard, setLeaderboard] = useState([]);
  const [result, setResult] = useState(null);
  const [startedAt] = useState(Date.now());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/questions`).then(r => r.json()).then(data => setQuestions(data.questions));
    fetch(`${API}/api/leaderboard`).then(r => r.json()).then(data => setLeaderboard(data.leaderboard));
    socket.on('leaderboard:update', setLeaderboard);
    return () => socket.off('leaderboard:update', setLeaderboard);
  }, []);

  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);

  function choose(questionId, selectedIndex) {
    if (result) return;
    setAnswers(prev => ({ ...prev, [questionId]: selectedIndex }));
  }

  async function submit() {
    if (nickname.trim().length < 2) return alert('Nhập tên hiển thị ít nhất 2 ký tự.');
    if (answeredCount < questions.length) return alert('Bạn cần trả lời hết câu hỏi.');
    setLoading(true);
    const payload = {
      nickname: nickname.trim(),
      startedAt,
      answers: questions.map(q => ({ questionId: q.id, selectedIndex: answers[q.id] }))
    };
    const res = await fetch(`${API}/api/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) return alert(data.error || 'Có lỗi xảy ra.');
    setResult(data);
    setLeaderboard(data.leaderboard);
  }

  return (
    <main>
      <section className="hero">
        <div>
          <p className="eyebrow">HCM Quiz</p>
          <h1>Tư tưởng Hồ Chí Minh về độc lập dân tộc gắn liền với chủ nghĩa xã hội</h1>
          <p className="sub">Nội dung câu hỏi được seed theo tài liệu giáo trình bạn gửi, tập trung vào phần vận dụng hiện nay.</p>
        </div>
      </section>

      <section className="layout">
        <div className="quizCard">
          <div className="topbar">
            <input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="Tên hiển thị trên bảng xếp hạng" maxLength="24" />
            <span>{answeredCount}/{questions.length} câu</span>
          </div>

          {questions.map((q, idx) => (
            <article className="question" key={q.id}>
              <div className="qHead">
                <span>Câu {idx + 1}</span>
                <b>{q.topic}</b>
              </div>
              <h2>{q.question}</h2>
              <div className="options">
                {q.options.map((opt, optionIndex) => {
                  const picked = answers[q.id] === optionIndex;
                  const after = result?.detail?.find(d => d.questionId === q.id);
                  const correct = after?.correctIndex === optionIndex;
                  const wrongPick = after && picked && !correct;
                  return (
                    <button
                      key={opt}
                      onClick={() => choose(q.id, optionIndex)}
                      className={`${picked ? 'picked' : ''} ${correct ? 'correct' : ''} ${wrongPick ? 'wrong' : ''}`}
                    >
                      {String.fromCharCode(65 + optionIndex)}. {opt}
                    </button>
                  );
                })}
              </div>
              {result && <p className="explain">{result.detail.find(d => d.questionId === q.id)?.explain}</p>}
            </article>
          ))}

          {!result ? (
            <button className="submit" onClick={submit} disabled={loading}>{loading ? 'Đang chấm...' : 'Nộp bài và cập nhật bảng xếp hạng'}</button>
          ) : (
            <div className="scoreBox">Bạn đạt <b>{result.score}/{result.total}</b> điểm · Thời gian {msToSec(result.durationMs)}</div>
          )}
        </div>

        <aside className="board">
          <h2>Bảng xếp hạng</h2>
          <p className="privacy">Không dùng analytics, không cookie, app không lưu IP/User-Agent. DB chỉ lưu tên hiển thị, điểm, thời gian và thời điểm nộp.</p>
          <ol>
            {leaderboard.map((row, i) => (
              <li key={`${row.nickname}-${row.createdAt}-${i}`}>
                <span className="rank">#{i + 1}</span>
                <span className="name">{row.nickname}</span>
                <span className="score">{row.score}/{row.total}</span>
                <span className="time">{msToSec(row.durationMs)}</span>
              </li>
            ))}
          </ol>
        </aside>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
