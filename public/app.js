const state = {
  selectedDate: null,
  tag: "",
  completed: "",
  q: "",
};

const firedTodoIds = new Set();

const listEl = document.getElementById("todo-list");
const emptyStateEl = document.getElementById("empty-state");
const tagSelectEl = document.getElementById("filter-tag");
const dayStripEl = document.getElementById("day-strip");
const todayLabelEl = document.getElementById("today-label");
const summaryEl = document.getElementById("remaining-summary");
const modalBackdrop = document.getElementById("modal-backdrop");
const addForm = document.getElementById("add-form");

function pad(n) {
  return String(n).padStart(2, "0");
}

function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayStr() {
  return toDateStr(new Date());
}

function dueClass(todo) {
  if (!todo.dueDate || todo.isCompleted) return "";
  if (todo.dueDate < todayStr()) return "is-overdue";
  if (todo.dueDate === todayStr()) return "is-due-soon";
  return "";
}

function formatDueDate(dueDate) {
  const [, m, d] = dueDate.split("-");
  return `${Number(m)}.${Number(d)}`;
}

function formatReminder(remindAt) {
  return remindAt.slice(0, 16).replace("T", " ");
}

async function api(path, options) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `요청 실패 (${res.status})`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ---------- header + day strip ----------

function renderHeader() {
  const now = new Date();
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  todayLabelEl.textContent = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 (${weekdays[now.getDay()]})`;
}

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function renderDayStrip() {
  const labels = ["월", "화", "수", "목", "금", "토", "일"];
  const monday = getMonday(new Date());
  dayStripEl.innerHTML = "";

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = toDateStr(d);
    const isToday = dateStr === todayStr();

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "day-pill";
    if (isToday) btn.classList.add("is-today");
    if (dateStr === state.selectedDate) btn.classList.add("is-selected");
    btn.dataset.date = dateStr;
    btn.setAttribute("aria-label", `${d.getMonth() + 1}월 ${d.getDate()}일 (${labels[i]})${isToday ? ", 오늘" : ""}`);
    btn.setAttribute("aria-pressed", String(dateStr === state.selectedDate));
    btn.innerHTML = `
      <span class="day-pill-label">${labels[i]}</span>
      <span class="day-pill-num">${d.getDate()}</span>
      ${isToday ? '<span class="day-pill-dot"></span>' : ""}
    `;
    dayStripEl.appendChild(btn);
  }
}

dayStripEl.addEventListener("click", (e) => {
  const pill = e.target.closest(".day-pill");
  if (!pill) return;
  const clicked = pill.dataset.date;
  state.selectedDate = state.selectedDate === clicked ? null : clicked;
  renderDayStrip();
  loadTodos();
});

// ---------- data loading ----------

async function loadTags() {
  const tags = await api("/api/tags");
  const current = tagSelectEl.value;
  tagSelectEl.innerHTML = '<option value="">태그 전체</option>';
  for (const tag of tags) {
    const opt = document.createElement("option");
    opt.value = tag.name;
    opt.textContent = tag.name;
    tagSelectEl.appendChild(opt);
  }
  tagSelectEl.value = current;
}

function buildQuery() {
  const params = new URLSearchParams();
  if (state.selectedDate) params.set("date", state.selectedDate);
  if (state.tag) params.set("tag", state.tag);
  if (state.completed !== "") params.set("completed", state.completed);
  if (state.q) params.set("q", state.q);
  return params.toString();
}

async function loadTodos() {
  const query = buildQuery();
  const todos = await api(`/api/todos${query ? "?" + query : ""}`);
  renderTodos(todos);
}

function updateSummary(todos) {
  if (todos.length === 0) {
    summaryEl.textContent = "여유로운 하루예요 ☁️";
    return;
  }
  const remaining = todos.filter((t) => !t.isCompleted).length;
  summaryEl.textContent =
    remaining === 0 ? "할 일을 모두 끝냈어요! 🎉" : `할 일이 ${remaining}개 남았어요 🌱`;
}

// ---------- rendering ----------

function renderTodos(todos) {
  listEl.innerHTML = "";
  emptyStateEl.hidden = todos.length > 0;
  updateSummary(todos);

  const hero = todos.find((t) => !t.isCompleted);

  for (const todo of todos) {
    const li = document.createElement("li");
    const classes = ["todo-item"];
    if (todo.isCompleted) {
      classes.push("is-completed");
    } else if (hero && todo.id === hero.id) {
      classes.push("is-hero");
    } else {
      const dc = dueClass(todo);
      if (dc) classes.push(dc);
    }
    if (firedTodoIds.has(todo.id)) classes.push("just-reminded");
    li.className = classes.join(" ");
    li.dataset.id = todo.id;

    const dotLabel = document.createElement("label");
    dotLabel.className = "timeline-dot";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = todo.isCompleted;
    checkbox.className = "toggle-complete";
    checkbox.setAttribute("aria-label", `${todo.title} 완료 표시`);
    dotLabel.appendChild(checkbox);

    const card = document.createElement("div");
    card.className = "todo-card";

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "delete-btn";
    deleteBtn.setAttribute("aria-label", "삭제");
    deleteBtn.textContent = "🗑";
    card.appendChild(deleteBtn);

    const titleRow = document.createElement("div");
    titleRow.className = "todo-title-row";
    const titleEl = document.createElement("span");
    titleEl.className = "todo-title";
    titleEl.textContent = todo.title;
    titleRow.appendChild(titleEl);
    if (todo.dueDate) {
      const badge = document.createElement("span");
      badge.className = "due-badge";
      badge.textContent = formatDueDate(todo.dueDate);
      titleRow.appendChild(badge);
    }
    card.appendChild(titleRow);

    if (todo.description) {
      const desc = document.createElement("p");
      desc.className = "todo-description";
      desc.textContent = todo.description;
      card.appendChild(desc);
    }

    if (todo.tags.length) {
      const tagRow = document.createElement("div");
      tagRow.className = "tag-row";
      for (const tag of todo.tags) {
        const pill = document.createElement("span");
        pill.className = "tag-pill";
        pill.textContent = tag.name;
        if (tag.color) pill.style.background = tag.color;
        tagRow.appendChild(pill);
      }
      card.appendChild(tagRow);
    }

    if (todo.reminders.length) {
      const remRow = document.createElement("div");
      remRow.className = "reminder-row";
      for (const rem of todo.reminders) {
        const chip = document.createElement("span");
        chip.className = `reminder-chip ${rem.isSent ? "is-sent" : ""}`.trim();
        chip.innerHTML = `${rem.isSent ? "✓" : "🔔"} ${formatReminder(rem.remindAt)}`;
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.textContent = "×";
        removeBtn.className = "remove-reminder";
        removeBtn.dataset.reminderId = rem.id;
        chip.appendChild(removeBtn);
        remRow.appendChild(chip);
      }
      card.appendChild(remRow);
    }

    li.append(dotLabel, card);
    listEl.appendChild(li);
  }
}

// ---------- list interactions ----------

listEl.addEventListener("change", async (e) => {
  if (!e.target.classList.contains("toggle-complete")) return;
  const li = e.target.closest(".todo-item");
  const id = li.dataset.id;
  await api(`/api/todos/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ isCompleted: e.target.checked }),
  });
  loadTodos();
});

listEl.addEventListener("click", async (e) => {
  if (e.target.classList.contains("delete-btn")) {
    const li = e.target.closest(".todo-item");
    await api(`/api/todos/${li.dataset.id}`, { method: "DELETE" });
    loadTodos();
    return;
  }
  if (e.target.classList.contains("remove-reminder")) {
    await api(`/api/reminders/${e.target.dataset.reminderId}`, { method: "DELETE" });
    loadTodos();
  }
});

// ---------- add-todo modal ----------

function openModal() {
  modalBackdrop.hidden = false;
  document.getElementById("title").focus();
}

function closeModal() {
  modalBackdrop.hidden = true;
  addForm.reset();
}

document.getElementById("fab-add").addEventListener("click", openModal);
document.getElementById("cancel-add").addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modalBackdrop.hidden) closeModal();
});

addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("title").value.trim();
  if (!title) return;

  const dueDate = document.getElementById("due-date").value || null;
  const description = document.getElementById("description").value.trim() || null;
  const tagsInput = document.getElementById("tags").value;
  const tags = tagsInput
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const reminderRaw = document.getElementById("reminder-at").value;
  const reminderAt = reminderRaw ? reminderRaw.replace("T", " ") + ":00" : null;

  await api("/api/todos", {
    method: "POST",
    body: JSON.stringify({ title, description, dueDate, tags, reminderAt }),
  });

  closeModal();
  await loadTags();
  await loadTodos();
});

// ---------- filters ----------

document.getElementById("filter-tag").addEventListener("change", (e) => {
  state.tag = e.target.value;
  loadTodos();
});

document.getElementById("filter-completed").addEventListener("change", (e) => {
  state.completed = e.target.value;
  loadTodos();
});

let searchDebounce;
document.getElementById("filter-search").addEventListener("input", (e) => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    state.q = e.target.value.trim();
    loadTodos();
  }, 300);
});

// ---------- reminder notifications ----------

function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

async function checkDueReminders() {
  let due;
  try {
    due = await api("/api/reminders/due");
  } catch {
    return;
  }
  if (!due.length) return;

  for (const item of due) {
    firedTodoIds.add(item.todoId);
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(`⏰ ${item.title}`, {
        body: `알림 시각: ${formatReminder(item.remindAt)}`,
      });
    }
  }
  loadTodos();
}

const REMINDER_POLL_MS = 30000;

(async function init() {
  renderHeader();
  renderDayStrip();
  requestNotificationPermission();
  await loadTags();
  await loadTodos();
  setTimeout(checkDueReminders, 3000);
  setInterval(checkDueReminders, REMINDER_POLL_MS);
})();
