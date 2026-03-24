const STORAGE_KEYS = {
  appState: "avocaturaTrainerState"
};

const TEST_SIZE = 400;
const PASSING_SCORE = 350;

function cloneQuestionBank() {
  return JSON.parse(JSON.stringify(QUESTION_BANK));
}

function hasScorableAnswer(question) {
  return ["A", "B", "C"].includes(question.correct_option_source);
}

function shuffleArray(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }
  return copy;
}

function createQuizSession(questions, options = {}) {
  const mode = options.mode || "full";
  const requestedQuestionIds = Array.isArray(options.questionIds) ? options.questionIds : null;
  const scorableIds = questions.filter(hasScorableAnswer).map((question) => question.question_id);
  const sessionQuestionIds = requestedQuestionIds && requestedQuestionIds.length
    ? requestedQuestionIds.filter((questionId) => scorableIds.includes(questionId))
    : shuffleArray(scorableIds).slice(0, Math.min(TEST_SIZE, scorableIds.length));
  const passingScore = mode === "retry"
    ? sessionQuestionIds.length
    : Math.min(PASSING_SCORE, sessionQuestionIds.length);

  return {
    currentIndex: 0,
    questionIds: sessionQuestionIds,
    answers: {},
    completed: false,
    score: 0,
    wrongQuestionIds: [],
    sessionStartedAt: new Date().toISOString(),
    sessionFinishedAt: null,
    passingScore,
    testSize: sessionQuestionIds.length,
    mode
  };
}

function buildDefaultState() {
  const questions = cloneQuestionBank();
  return {
    questions,
    quiz: createQuizSession(questions)
  };
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEYS.appState, JSON.stringify(state));
}

function mergeWithDefaults(savedState) {
  const defaultState = buildDefaultState();
  const savedQuestions = Array.isArray(savedState.questions) ? savedState.questions : [];
  const validQuestionIds = new Set(defaultState.questions.map((question) => question.question_id));

  defaultState.questions = defaultState.questions.map((question) => {
    const savedQuestion = savedQuestions.find((item) => item.question_id === question.question_id);
    return savedQuestion ? { ...question, ...savedQuestion } : question;
  });

  defaultState.quiz = {
    ...defaultState.quiz,
    ...(savedState.quiz || {})
  };

  defaultState.quiz.answers = Object.fromEntries(
    Object.entries(defaultState.quiz.answers || {}).filter(([questionId]) => validQuestionIds.has(questionId))
  );
  defaultState.quiz.wrongQuestionIds = (defaultState.quiz.wrongQuestionIds || []).filter((questionId) => validQuestionIds.has(questionId));
  defaultState.quiz.questionIds = (defaultState.quiz.questionIds || []).filter((questionId) => validQuestionIds.has(questionId));

  if (!defaultState.quiz.questionIds.length) {
    defaultState.quiz = createQuizSession(defaultState.questions);
  } else {
    defaultState.quiz.currentIndex = Math.min(
      defaultState.quiz.currentIndex || 0,
      Math.max(0, defaultState.quiz.questionIds.length - 1)
    );
    defaultState.quiz.score = Object.values(defaultState.quiz.answers).filter((answer) => answer.isCorrect === true).length;
    defaultState.quiz.testSize = defaultState.quiz.questionIds.length;
    defaultState.quiz.mode = defaultState.quiz.mode || "full";
    defaultState.quiz.passingScore = defaultState.quiz.mode === "retry"
      ? defaultState.quiz.questionIds.length
      : Math.min(PASSING_SCORE, defaultState.quiz.questionIds.length);
  }

  return defaultState;
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEYS.appState);
  if (!raw) {
    const initialState = buildDefaultState();
    saveState(initialState);
    return initialState;
  }

  try {
    const parsed = JSON.parse(raw);
    return mergeWithDefaults(parsed);
  } catch (error) {
    const fallbackState = buildDefaultState();
    saveState(fallbackState);
    return fallbackState;
  }
}

function resetQuizSession(state) {
  state.quiz = createQuizSession(state.questions);
  saveState(state);
}

function resetRetrySession(state) {
  const retryQuestionIds = [...state.quiz.wrongQuestionIds];
  state.quiz = retryQuestionIds.length
    ? createQuizSession(state.questions, { mode: "retry", questionIds: retryQuestionIds })
    : createQuizSession(state.questions);
  saveState(state);
}

function calculateMastery(question) {
  const totalAttempts = question.times_correct + question.times_wrong;
  if (totalAttempts === 0) {
    return 0;
  }
  return Math.round((question.times_correct / totalAttempts) * 100);
}

function getReviewQuestions(questions) {
  return questions.filter((question) => {
    const isLowConfidence = String(question.confidence_level).toLowerCase() === "low";
    return question.marked_for_review || isLowConfidence || question.times_wrong > question.times_correct;
  });
}

function getWeakSubjects(questions) {
  const grouped = questions.reduce((accumulator, question) => {
    if (!accumulator[question.subject]) {
      accumulator[question.subject] = { subject: question.subject, attempts: 0, correct: 0 };
    }
    const attempts = question.times_correct + question.times_wrong;
    accumulator[question.subject].attempts += attempts;
    accumulator[question.subject].correct += question.times_correct;
    return accumulator;
  }, {});

  return Object.values(grouped)
    .map((entry) => {
      const accuracy = entry.attempts === 0 ? 0 : Math.round((entry.correct / entry.attempts) * 100);
      return { ...entry, accuracy };
    })
    .sort((left, right) => left.accuracy - right.accuracy);
}

function formatDateTime(isoValue) {
  if (!isoValue) {
    return "Niciodata";
  }
  return new Date(isoValue).toLocaleString("ro-RO");
}

function createListItemHTML({ title, subtitle, details, footer }) {
  return `
    <article class="list-item">
      <h3>${title}</h3>
      <p class="meta-text">${subtitle}</p>
      <p>${details}</p>
      ${footer ? `<p class="meta-text">${footer}</p>` : ""}
    </article>
  `;
}

function buildSubjectLine(question) {
  return [question.subject, question.subtopic].filter(Boolean).join(" / ");
}

function getCurrentSessionQuestions(state) {
  const questionsById = new Map(state.questions.map((question) => [question.question_id, question]));
  return state.quiz.questionIds.map((questionId) => questionsById.get(questionId)).filter(Boolean);
}

function goToNextQuestion(state) {
  const isLastQuestion = state.quiz.currentIndex >= state.quiz.questionIds.length - 1;

  if (isLastQuestion) {
    state.quiz.completed = true;
    state.quiz.sessionFinishedAt = new Date().toISOString();
  } else {
    state.quiz.currentIndex += 1;
  }

  saveState(state);

  if (isLastQuestion) {
    window.location.href = "results.html";
  } else {
    renderQuiz(state);
  }
}

function getOptionText(question, optionKey) {
  if (optionKey === "A") {
    return question.option_a;
  }
  if (optionKey === "B") {
    return question.option_b;
  }
  if (optionKey === "C") {
    return question.option_c;
  }
  return "";
}

function renderDashboard(state) {
  const questions = state.questions;
  const totalSeen = questions.reduce((sum, question) => sum + question.times_seen, 0);
  const totalCorrect = questions.reduce((sum, question) => sum + question.times_correct, 0);
  const totalWrong = questions.reduce((sum, question) => sum + question.times_wrong, 0);
  const totalAttempts = totalCorrect + totalWrong;
  const accuracy = totalAttempts === 0 ? 0 : Math.round((totalCorrect / totalAttempts) * 100);
  const progress = Math.round((questions.filter((question) => question.times_seen > 0).length / questions.length) * 100);
  const reviewQuestions = getReviewQuestions(questions);
  const weakSubjects = getWeakSubjects(questions);

  document.getElementById("seen-count").textContent = totalSeen;
  document.getElementById("correct-count").textContent = totalCorrect;
  document.getElementById("accuracy-count").textContent = `${accuracy}%`;
  document.getElementById("progress-badge").textContent = `${progress}%`;
  document.getElementById("marked-count").textContent = questions.filter((question) => question.marked_for_review).length;
  document.getElementById("low-confidence-count").textContent = questions.filter((question) => question.confidence_level === "low").length;
  document.getElementById("wrong-session-count").textContent = state.quiz.wrongQuestionIds.length;

  const weakSubjectsContainer = document.getElementById("weak-subjects");
  if (!weakSubjects.length) {
    weakSubjectsContainer.innerHTML = createListItemHTML({
      title: "Nicio materie identificata",
      subtitle: "Date insuficiente",
      details: "Pe masura ce raspunzi, aici vor aparea materiile cu precizie mai scazuta."
    });
    return;
  }

  weakSubjectsContainer.innerHTML = weakSubjects
    .map((entry) =>
      createListItemHTML({
        title: entry.subject,
        subtitle: `Acuratete: ${entry.accuracy}%`,
        details: entry.attempts === 0
          ? "Inca nu exista raspunsuri pentru aceasta materie."
          : `Raspunsuri corecte: ${entry.correct} din ${entry.attempts}.`,
        footer: reviewQuestions.some((question) => question.subject === entry.subject)
          ? "Exista intrebari recomandate pentru review."
          : "Nu exista alerte majore de review."
      })
    )
    .join("");
}

function renderQuiz(state) {
  const sessionQuestions = getCurrentSessionQuestions(state);
  const totalQuestions = sessionQuestions.length;
  const currentIndex = Math.min(state.quiz.currentIndex, Math.max(0, totalQuestions - 1));
  const question = sessionQuestions[currentIndex];
  const quizProgress = document.getElementById("quiz-progress");
  const noteField = document.getElementById("question-note");
  const feedbackPanel = document.getElementById("feedback-panel");

  if (!question) {
    window.location.href = "results.html";
    return;
  }

  document.getElementById("question-subject").textContent = question.subject;
  document.getElementById("question-source").textContent = `Q${question.source_question_number} - ${question.source_document}`;
  document.getElementById("question-text").textContent = question.question_text;
  document.getElementById("question-details").textContent = [question.subtopic, question.source_section].filter(Boolean).join(" - ");
  document.getElementById("option-a").textContent = question.option_a;
  document.getElementById("option-b").textContent = question.option_b;
  document.getElementById("option-c").textContent = question.option_c;
  quizProgress.textContent = `${currentIndex + 1} / ${totalQuestions}`;
  noteField.value = question.notes || "";
  feedbackPanel.className = "feedback-panel hidden";
  feedbackPanel.innerHTML = "";

  const savedAnswer = state.quiz.answers[question.question_id];
  document.querySelectorAll('input[name="answer"]').forEach((input) => {
    input.checked = savedAnswer?.selectedOption === input.value;
  });

  document.getElementById("submit-answer").disabled = false;
  document.getElementById("submit-answer").onclick = () => handleAnswerSubmission(state, question);
  document.getElementById("mark-review").onclick = () => toggleReviewFlag(state, question.question_id);
  document.getElementById("save-note").onclick = () => saveQuestionNote(state, question.question_id, noteField.value);
}

function handleAnswerSubmission(state, question) {
  const selectedInput = document.querySelector('input[name="answer"]:checked');
  const feedbackPanel = document.getElementById("feedback-panel");

  if (!selectedInput) {
    feedbackPanel.className = "feedback-panel wrong";
    feedbackPanel.innerHTML = "<strong>Selecteaza un raspuns.</strong><p>Alege una dintre variantele A, B sau C pentru a continua.</p>";
    return;
  }

  const selectedOption = selectedInput.value;
  const isScorable = hasScorableAnswer(question);
  const isCorrect = isScorable ? selectedOption === question.correct_option_source : null;
  const alreadyAnswered = Boolean(state.quiz.answers[question.question_id]);
  const questionRef = state.questions.find((item) => item.question_id === question.question_id);
  const submitButton = document.getElementById("submit-answer");

  state.quiz.answers[question.question_id] = {
    selectedOption,
    isScorable,
    isCorrect,
    answeredAt: new Date().toISOString()
  };

  if (!alreadyAnswered) {
    questionRef.times_seen += 1;
    questionRef.last_seen_at = new Date().toISOString();

    if (!isScorable) {
      questionRef.marked_for_review = true;
    } else if (isCorrect) {
      questionRef.times_correct += 1;
    } else {
      questionRef.times_wrong += 1;
      questionRef.marked_for_review = true;
      if (!state.quiz.wrongQuestionIds.includes(question.question_id)) {
        state.quiz.wrongQuestionIds.push(question.question_id);
      }
    }
  }

  questionRef.mastery_score = calculateMastery(questionRef);
  state.quiz.score = Object.values(state.quiz.answers).filter((answer) => answer.isCorrect === true).length;
  saveState(state);

  if (!isScorable) {
    feedbackPanel.className = "feedback-panel";
    feedbackPanel.innerHTML = `
      <strong>Raspuns salvat, dar intrebarea nu poate fi punctata automat.</strong>
      <p>${question.explanation}</p>
      <p><strong>Sursa:</strong> ${question.legal_basis}</p>
    `;
    window.setTimeout(() => goToNextQuestion(state), 900);
  } else {
    feedbackPanel.className = `feedback-panel ${isCorrect ? "correct" : "wrong"}`;
    if (isCorrect) {
      feedbackPanel.innerHTML = `
        <strong>Raspuns corect.</strong>
        <p>${question.explanation}</p>
        <p><strong>Sursa:</strong> ${question.legal_basis}</p>
      `;
      window.setTimeout(() => goToNextQuestion(state), 900);
    } else {
      submitButton.disabled = true;
      feedbackPanel.innerHTML = `
        <strong>Raspuns gresit.</strong>
        <p><strong>Raspunsul corect este ${question.correct_option_source}.</strong> ${getOptionText(question, question.correct_option_source)}</p>
        <p>${question.explanation}</p>
        <p><strong>Sursa:</strong> ${question.legal_basis}</p>
        <button id="confirm-next" class="action-button primary feedback-action" type="button">Am inteles, continua</button>
      `;
      document.getElementById("confirm-next").onclick = () => goToNextQuestion(state);
    }
  }
}

function toggleReviewFlag(state, questionId) {
  const question = state.questions.find((item) => item.question_id === questionId);
  if (!question) {
    return;
  }

  question.marked_for_review = !question.marked_for_review;
  saveState(state);

  const feedbackPanel = document.getElementById("feedback-panel");
  feedbackPanel.className = "feedback-panel";
  feedbackPanel.innerHTML = `
    <strong>${question.marked_for_review ? "Intrebarea a fost marcata pentru review." : "Marcarea pentru review a fost eliminata."}</strong>
    <p>Poti reveni la ea din pagina de review.</p>
  `;
}

function saveQuestionNote(state, questionId, noteValue) {
  const question = state.questions.find((item) => item.question_id === questionId);
  if (!question) {
    return;
  }

  question.notes = noteValue.trim();
  saveState(state);

  const feedbackPanel = document.getElementById("feedback-panel");
  feedbackPanel.className = "feedback-panel";
  feedbackPanel.innerHTML = "<strong>Nota a fost salvata.</strong><p>Observatiile tale raman stocate local in browser.</p>";
}

function renderReview(state) {
  const reviewQuestions = getReviewQuestions(state.questions);
  const reviewList = document.getElementById("review-list");
  document.getElementById("review-count").textContent = reviewQuestions.length;

  if (!reviewQuestions.length) {
    reviewList.innerHTML = createListItemHTML({
      title: "Nicio intrebare prioritara",
      subtitle: "Totul arata bine",
      details: "In acest moment nu exista intrebari marcate pentru review sau cu nivel low confidence."
    });
    return;
  }

  reviewList.innerHTML = reviewQuestions
    .map((question) =>
      createListItemHTML({
        title: `Q${question.source_question_number} - ${question.question_text}`,
        subtitle: buildSubjectLine(question),
        details: `${hasScorableAnswer(question) ? `Confidence: ${question.confidence_level}.` : "Fara raspuns extras in PDF."} Mastery: ${question.mastery_score}%. Nota: ${question.notes || "fara nota"}.`,
        footer: `Vazuta: ${question.times_seen} - Corecte: ${question.times_correct} - Gresite: ${question.times_wrong} - Ultima vedere: ${formatDateTime(question.last_seen_at)}`
      })
    )
    .join("");
}

function renderResults(state) {
  const total = state.quiz.questionIds.length;
  const correct = state.quiz.score;
  const wrongQuestions = state.questions.filter((question) => state.quiz.wrongQuestionIds.includes(question.question_id));
  const wrong = wrongQuestions.length;
  const accuracy = total === 0 ? 0 : Math.round((correct / total) * 100);
  const passed = correct >= state.quiz.passingScore;
  const nextActionLink = document.getElementById("results-next-action");
  const isRetrySession = state.quiz.mode === "retry";

  document.getElementById("results-score").textContent = `${correct} / ${total}`;
  document.getElementById("results-correct").textContent = correct;
  document.getElementById("results-wrong").textContent = wrong;
  document.getElementById("results-accuracy").textContent = `${accuracy}%`;

  if (nextActionLink) {
    if (wrongQuestions.length) {
      nextActionLink.href = "quiz.html?retry=1";
      nextActionLink.textContent = "Reia intrebarile gresite";
    } else {
      nextActionLink.href = "quiz.html?reset=1";
      nextActionLink.textContent = isRetrySession ? "Porneste un test nou" : "Reia quiz";
    }
  }

  const wrongQuestionsContainer = document.getElementById("wrong-questions");
  if (!wrongQuestions.length) {
    wrongQuestionsContainer.innerHTML = createListItemHTML({
      title: passed ? "Test promovat" : "Nicio intrebare gresita",
      subtitle: isRetrySession ? "Runda de corectie finalizata" : `Prag promovare: ${state.quiz.passingScore} din ${total}`,
      details: passed
        ? (isRetrySession ? "Ai corectat toate intrebarile gresite din runda precedenta." : "Ai atins pragul de promovare pentru aceasta sesiune.")
        : "Nu au fost inregistrate raspunsuri gresite in sesiunea curenta."
    });
    return;
  }

  wrongQuestionsContainer.innerHTML = [
    createListItemHTML({
      title: passed ? "Test promovat" : "Test nepromovat",
      subtitle: isRetrySession ? "Urmeaza o noua runda doar cu intrebarile gresite" : `Prag promovare: ${state.quiz.passingScore} din ${total}`,
      details: passed
        ? (isRetrySession ? "Ai promovat sesiunea curenta, dar mai exista intrebari gresite de reluat." : "Ai atins minimum 350 de raspunsuri corecte din 400.")
        : (isRetrySession
          ? "Apasa pe butonul de sus pentru a relua doar intrebarile gresite din aceasta runda."
          : `Mai ai nevoie de ${Math.max(0, state.quiz.passingScore - correct)} raspunsuri corecte pentru pragul de promovare.`),
      footer: `Precizie sesiune: ${accuracy}%`
    }),
    ...wrongQuestions.map((question) => {
      const answer = state.quiz.answers[question.question_id];
      return createListItemHTML({
        title: `Q${question.source_question_number} - ${question.question_text}`,
        subtitle: buildSubjectLine(question),
        details: `Ai ales ${answer?.selectedOption || "-"}, raspunsul corect este ${question.correct_option_source}. ${question.explanation}`,
        footer: `Sursa: ${question.legal_basis}`
      });
    })
  ].join("");
}

function init() {
  const state = loadState();
  const currentPage = document.body.dataset.page;
  const params = new URLSearchParams(window.location.search);

  if (currentPage === "quiz" && params.get("reset") === "1") {
    resetQuizSession(state);
  }

  if (currentPage === "quiz" && params.get("retry") === "1") {
    resetRetrySession(state);
  }

  if (currentPage === "dashboard") {
    renderDashboard(state);
  }

  if (currentPage === "quiz") {
    renderQuiz(state);
  }

  if (currentPage === "review") {
    renderReview(state);
  }

  if (currentPage === "results") {
    renderResults(state);
  }
}

document.addEventListener("DOMContentLoaded", init);
