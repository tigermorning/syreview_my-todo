const state = {
  selectedDate: null,
  tag: "",
  completed: "",
  q: "",
  allTags: [], // flat list for tag selector
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
const editModalBackdrop = document.getElementById("edit-modal-backdrop");
const editForm = document.getElementById("edit-form");
const categoryModalBackdrop = document.getElementById("category-modal-backdrop");

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
  const tags = await api("/api/tags/flat");
  state.allTags = tags;
  // Update filter dropdown
  const current = tagSelectEl.value;
  tagSelectEl.innerHTML = '<option value="">태그 전체</option>';
  for (const tag of tags) {
    const opt = document.createElement("option");
    opt.value = tag.name;
    const prefix = tag.parent_id ? "  └ " : "";
    opt.textContent = prefix + tag.name;
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

// ---------- tag selector (category) ----------

function renderTagSelector(container, selectedTagIds = []) {
  container.innerHTML = "";
  const roots = state.allTags.filter((t) => !t.parent_id);
  const children = state.allTags.filter((t) => t.parent_id);

  for (const tag of roots) {
    const tagChildren = children.filter((c) => c.parent_id === tag.id);

    const item = document.createElement("div");
    item.className = "tag-selector-item";
    if (selectedTagIds.includes(tag.id)) item.classList.add("selected");
    item.dataset.tagId = tag.id;
    item.innerHTML = `<span class="tag-check">✓</span>${tag.name}`;
    if (tag.color) item.style.background = tag.color;

    item.addEventListener("click", () => {
      item.classList.toggle("selected");
    });
    container.appendChild(item);

    if (tagChildren.length > 0) {
      const childRow = document.createElement("div");
      childRow.className = "tag-selector-children";
      for (const child of tagChildren) {
        const cEl = document.createElement("div");
        cEl.className = "tag-selector-child";
        if (selectedTagIds.includes(child.id)) cEl.classList.add("selected");
        cEl.dataset.tagId = child.id;
        cEl.textContent = child.name;
        if (child.color) cEl.style.background = child.color;
        cEl.addEventListener("click", () => {
          cEl.classList.toggle("selected");
        });
        childRow.appendChild(cEl);
      }
      container.appendChild(childRow);
    }
  }
}

function getSelectedTagNames(container) {
  const names = [];
  for (const el of container.querySelectorAll(".tag-selector-item.selected, .tag-selector-child.selected")) {
    const tagId = Number(el.dataset.tagId);
    const tag = state.allTags.find((t) => t.id === tagId);
    if (tag) names.push(tag.name);
  }
  return names;
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

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "edit-btn";
    editBtn.setAttribute("aria-label", "수정");
    editBtn.textContent = "✏️";
    card.appendChild(editBtn);

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
    return;
  }
  if (e.target.classList.contains("edit-btn")) {
    const li = e.target.closest(".todo-item");
    const id = li.dataset.id;
    const todo = await api(`/api/todos/${id}`);
    openEditModal(todo);
  }
});

// ---------- add-todo modal ----------

function openModal() {
  modalBackdrop.hidden = false;
  renderTagSelector(document.getElementById("tag-selector"));
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

addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("title").value.trim();
  if (!title) return;

  const dueDate = document.getElementById("due-date").value || null;
  const description = document.getElementById("description").value.trim() || null;
  const tags = getSelectedTagNames(document.getElementById("tag-selector"));
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

// ---------- edit-todo modal ----------

function openEditModal(todo) {
  document.getElementById("edit-id").value = todo.id;
  document.getElementById("edit-title").value = todo.title;
  document.getElementById("edit-description").value = todo.description || "";

  if (todo.dueDate) {
    document.getElementById("edit-due-date").value = todo.dueDate;
  } else {
    document.getElementById("edit-due-date").value = "";
  }

  // Extract time from reminders or leave blank
  document.getElementById("edit-due-time").value = "";

  // Render tag selector with current tags selected
  const tagIds = todo.tags.map((t) => t.id);
  renderTagSelector(document.getElementById("edit-tag-selector"), tagIds);

  editModalBackdrop.hidden = false;
  document.getElementById("edit-title").focus();
}

function closeEditModal() {
  editModalBackdrop.hidden = true;
  editForm.reset();
}

document.getElementById("cancel-edit").addEventListener("click", closeEditModal);
editModalBackdrop.addEventListener("click", (e) => {
  if (e.target === editModalBackdrop) closeEditModal();
});

editForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("edit-id").value;
  const title = document.getElementById("edit-title").value.trim();
  if (!title) return;

  let dueDate = document.getElementById("edit-due-date").value || null;
  const dueTime = document.getElementById("edit-due-time").value || null;

  // Combine date and time if both are provided
  if (dueDate && dueTime) {
    dueDate = dueDate + " " + dueTime + ":00";
  }

  const description = document.getElementById("edit-description").value.trim() || null;
  const tags = getSelectedTagNames(document.getElementById("edit-tag-selector"));

  await api(`/api/todos/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ title, description, dueDate, tags }),
  });

  closeEditModal();
  await loadTodos();
});

// ---------- category management modal ----------

function openCategoryModal() {
  categoryModalBackdrop.hidden = false;
  renderCategoryList();
}

function closeCategoryModal() {
  categoryModalBackdrop.hidden = true;
}

document.getElementById("close-category-modal").addEventListener("click", closeCategoryModal);
categoryModalBackdrop.addEventListener("click", (e) => {
  if (e.target === categoryModalBackdrop) closeCategoryModal();
});

async function renderCategoryList() {
  const categories = await api("/api/tags");
  const listEl = document.getElementById("category-list");
  listEl.innerHTML = "";

  for (const cat of categories) {
    const group = document.createElement("div");
    group.className = "category-group";

    const header = document.createElement("div");
    header.className = "category-header";

    const nameSpan = document.createElement("span");
    nameSpan.className = "category-name";
    nameSpan.textContent = cat.name;
    if (cat.color) nameSpan.style.color = cat.color;
    header.appendChild(nameSpan);

    const actions = document.createElement("div");
    actions.className = "category-actions";

    const renameBtn = document.createElement("button");
    renameBtn.textContent = "이름변경";
    renameBtn.addEventListener("click", async () => {
      const newName = prompt("새 이름을 입력하세요", cat.name);
      if (newName && newName.trim()) {
        await api(`/api/tags/${cat.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: newName.trim() }),
        });
        renderCategoryList();
        await loadTags();
      }
    });
    actions.appendChild(renameBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-cat-btn";
    deleteBtn.textContent = "삭제";
    deleteBtn.addEventListener("click", async () => {
      if (confirm(`"${cat.name}" 카테고리를 삭제하시겠습니까? 하위 카테고리도 함께 삭제됩니다.`)) {
        await api(`/api/tags/${cat.id}`, { method: "DELETE" });
        renderCategoryList();
        await loadTags();
      }
    });
    actions.appendChild(deleteBtn);

    header.appendChild(actions);
    group.appendChild(header);

    // Subcategories
    if (cat.children && cat.children.length > 0) {
      const subList = document.createElement("div");
      subList.className = "subcategory-list";
      for (const sub of cat.children) {
        const chip = document.createElement("span");
        chip.className = "subcategory-chip";
        chip.textContent = sub.name;
        const removeBtn = document.createElement("button");
        removeBtn.textContent = "×";
        removeBtn.addEventListener("click", async () => {
          if (confirm(`"${sub.name}" 하위 카테고리를 삭제하시겠습니까?`)) {
            await api(`/api/tags/${sub.id}`, { method: "DELETE" });
            renderCategoryList();
            await loadTags();
          }
        });
        chip.appendChild(removeBtn);
        subList.appendChild(chip);
      }
      group.appendChild(subList);
    }

    // Add subcategory button
    const addSubBtn = document.createElement("button");
    addSubBtn.className = "add-subcategory-btn";
    addSubBtn.textContent = "+ 하위 카테고리 추가";
    addSubBtn.addEventListener("click", async () => {
      const subName = prompt("하위 카테고리 이름을 입력하세요");
      if (subName && subName.trim()) {
        await api("/api/tags", {
          method: "POST",
          body: JSON.stringify({ name: subName.trim(), parentId: cat.id }),
        });
        renderCategoryList();
        await loadTags();
      }
    });
    group.appendChild(addSubBtn);

    listEl.appendChild(group);
  }
}

// Add new top-level category
document.getElementById("add-category-btn").addEventListener("click", async () => {
  const input = document.getElementById("new-category-name");
  const name = input.value.trim();
  if (!name) return;

  try {
    await api("/api/tags", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    input.value = "";
    renderCategoryList();
    await loadTags();
  } catch (e) {
    alert(e.message);
  }
});

document.getElementById("new-category-name").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById("add-category-btn").click();
  }
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

  // Add category management button to filter row
  const filterRow = document.querySelector(".filter-row");
  const catBtn = document.createElement("button");
  catBtn.type = "button";
  catBtn.className = "btn-ghost";
  catBtn.textContent = "🏷️ 카테고리 관리";
  catBtn.style.padding = "8px 14px";
  catBtn.style.fontSize = "13px";
  catBtn.style.borderRadius = "20px";
  catBtn.style.whiteSpace = "nowrap";
  catBtn.addEventListener("click", openCategoryModal);
  filterRow.appendChild(catBtn);
})();
