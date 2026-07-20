require("dotenv").config();
const path = require("path");
const express = require("express");
const db = require("./db.js");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- helpers ----------

function getTagsForTodoIds(todoIds) {
  if (todoIds.length === 0) return {};
  const placeholders = todoIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT tt.todo_id AS todoId, t.id, t.name, t.color
       FROM todo_tags tt JOIN tags t ON t.id = tt.tag_id
       WHERE tt.todo_id IN (${placeholders})`
    )
    .all(...todoIds);
  const map = {};
  for (const r of rows) {
    if (!map[r.todoId]) map[r.todoId] = [];
    map[r.todoId].push({ id: r.id, name: r.name, color: r.color });
  }
  return map;
}

function getRemindersForTodoIds(todoIds) {
  if (todoIds.length === 0) return {};
  const placeholders = todoIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT id, todo_id AS todoId, remind_at AS remindAt, is_sent AS isSent
       FROM reminders WHERE todo_id IN (${placeholders})
       ORDER BY remind_at ASC`
    )
    .all(...todoIds);
  const map = {};
  for (const r of rows) {
    if (!map[r.todoId]) map[r.todoId] = [];
    map[r.todoId].push({ id: r.id, remindAt: r.remindAt, isSent: !!r.isSent });
  }
  return map;
}

function attachRelations(todos) {
  const ids = todos.map((t) => t.id);
  const tagsById = getTagsForTodoIds(ids);
  const remindersById = getRemindersForTodoIds(ids);
  return todos.map((t) => ({
    ...t,
    isCompleted: !!t.isCompleted,
    tags: tagsById[t.id] || [],
    reminders: remindersById[t.id] || [],
  }));
}

const TAG_PALETTE = ["#FFD6E8", "#D6E7FF", "#D6FFE3", "#FFF2C6", "#E6D9FF", "#D6FFF6", "#FFE2D1"];

// 색 지정 기능 추가 전에 만들어진 태그를 위한 1회성 보정
for (const t of db.prepare("SELECT id FROM tags WHERE color IS NULL").all()) {
  db.prepare("UPDATE tags SET color = ? WHERE id = ?").run(
    TAG_PALETTE[t.id % TAG_PALETTE.length],
    t.id
  );
}

function findOrCreateTag(name) {
  const clean = name.trim();
  if (!clean) return null;
  const existing = db.prepare("SELECT id FROM tags WHERE name = ?").get(clean);
  if (existing) return existing.id;
  const result = db.prepare("INSERT INTO tags (name) VALUES (?)").run(clean);
  const tagId = result.lastInsertRowid;
  const color = TAG_PALETTE[tagId % TAG_PALETTE.length];
  db.prepare("UPDATE tags SET color = ? WHERE id = ?").run(color, tagId);
  return tagId;
}

function setTodoTags(todoId, tagNames) {
  db.prepare("DELETE FROM todo_tags WHERE todo_id = ?").run(todoId);
  const insert = db.prepare(
    "INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?, ?)"
  );
  for (const name of tagNames || []) {
    const tagId = findOrCreateTag(name);
    if (tagId) insert.run(todoId, tagId);
  }
}

// ---------- todos ----------

app.get("/api/todos", (req, res) => {
  const { today, date, tag, q, completed } = req.query;
  const where = [];
  const params = [];

  if (today === "1" || today === "true") {
    where.push("t.due_date = date('now', 'localtime')");
  } else if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    where.push("t.due_date = ?");
    params.push(date);
  }
  if (completed === "0" || completed === "1") {
    where.push("t.is_completed = ?");
    params.push(Number(completed));
  }
  if (q && q.trim()) {
    where.push("(t.title LIKE ? OR t.description LIKE ?)");
    params.push(`%${q.trim()}%`, `%${q.trim()}%`);
  }
  if (tag && tag.trim()) {
    where.push(
      "t.id IN (SELECT tt.todo_id FROM todo_tags tt JOIN tags tg ON tg.id = tt.tag_id WHERE tg.name = ?)"
    );
    params.push(tag.trim());
  }

  const sql = `
    SELECT t.id, t.title, t.description, t.due_date AS dueDate,
           t.is_completed AS isCompleted, t.completed_at AS completedAt,
           t.created_at AS createdAt, t.updated_at AS updatedAt
    FROM todos t
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY (t.due_date IS NULL), t.due_date ASC, t.id DESC
  `;
  const todos = db.prepare(sql).all(...params);
  res.json(attachRelations(todos));
});

app.get("/api/todos/:id", (req, res) => {
  const todo = db
    .prepare(
      `SELECT id, title, description, due_date AS dueDate,
              is_completed AS isCompleted, completed_at AS completedAt,
              created_at AS createdAt, updated_at AS updatedAt
       FROM todos WHERE id = ?`
    )
    .get(req.params.id);
  if (!todo) return res.status(404).json({ error: "할 일을 찾을 수 없습니다." });
  res.json(attachRelations([todo])[0]);
});

app.post("/api/todos", (req, res) => {
  const { title, description, dueDate, tags, reminderAt } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: "title은 필수입니다." });
  }

  const createTodo = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO todos (title, description, due_date)
         VALUES (?, ?, ?)`
      )
      .run(title.trim(), description || null, dueDate || null);
    const todoId = result.lastInsertRowid;

    if (Array.isArray(tags) && tags.length) {
      setTodoTags(todoId, tags);
    }
    if (reminderAt) {
      db.prepare(
        "INSERT INTO reminders (todo_id, remind_at) VALUES (?, ?)"
      ).run(todoId, reminderAt);
    }
    return todoId;
  });

  const todoId = createTodo();
  const todo = db
    .prepare(
      `SELECT id, title, description, due_date AS dueDate,
              is_completed AS isCompleted, completed_at AS completedAt,
              created_at AS createdAt, updated_at AS updatedAt
       FROM todos WHERE id = ?`
    )
    .get(todoId);
  res.status(201).json(attachRelations([todo])[0]);
});

app.patch("/api/todos/:id", (req, res) => {
  const { id } = req.params;
  const existing = db.prepare("SELECT * FROM todos WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "할 일을 찾을 수 없습니다." });

  const { title, description, dueDate, isCompleted, tags } = req.body;
  const fields = [];
  const params = [];

  if (title !== undefined) {
    fields.push("title = ?");
    params.push(title.trim());
  }
  if (description !== undefined) {
    fields.push("description = ?");
    params.push(description);
  }
  if (dueDate !== undefined) {
    fields.push("due_date = ?");
    params.push(dueDate);
  }
  if (isCompleted !== undefined) {
    fields.push("is_completed = ?");
    params.push(isCompleted ? 1 : 0);
    fields.push("completed_at = ?");
    params.push(isCompleted ? new Date().toISOString() : null);
  }
  fields.push("updated_at = CURRENT_TIMESTAMP");

  const update = db.transaction(() => {
    if (fields.length) {
      db.prepare(`UPDATE todos SET ${fields.join(", ")} WHERE id = ?`).run(
        ...params,
        id
      );
    }
    if (Array.isArray(tags)) {
      setTodoTags(id, tags);
    }
  });
  update();

  const todo = db
    .prepare(
      `SELECT id, title, description, due_date AS dueDate,
              is_completed AS isCompleted, completed_at AS completedAt,
              created_at AS createdAt, updated_at AS updatedAt
       FROM todos WHERE id = ?`
    )
    .get(id);
  res.json(attachRelations([todo])[0]);
});

app.delete("/api/todos/:id", (req, res) => {
  const result = db.prepare("DELETE FROM todos WHERE id = ?").run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: "할 일을 찾을 수 없습니다." });
  }
  res.status(204).end();
});

// ---------- tags ----------

app.get("/api/tags", (req, res) => {
  const tags = db.prepare("SELECT id, name, color FROM tags ORDER BY name").all();
  res.json(tags);
});

// ---------- reminders ----------

app.post("/api/todos/:id/reminders", (req, res) => {
  const { remindAt } = req.body;
  if (!remindAt) return res.status(400).json({ error: "remindAt은 필수입니다." });
  const todo = db.prepare("SELECT id FROM todos WHERE id = ?").get(req.params.id);
  if (!todo) return res.status(404).json({ error: "할 일을 찾을 수 없습니다." });

  const result = db
    .prepare("INSERT INTO reminders (todo_id, remind_at) VALUES (?, ?)")
    .run(req.params.id, remindAt);
  res.status(201).json({ id: result.lastInsertRowid, remindAt, isSent: false });
});

app.delete("/api/reminders/:id", (req, res) => {
  const result = db.prepare("DELETE FROM reminders WHERE id = ?").run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: "알림을 찾을 수 없습니다." });
  }
  res.status(204).end();
});

app.get("/api/reminders/due", (req, res) => {
  const due = db
    .prepare(
      `SELECT r.id, r.todo_id AS todoId, r.remind_at AS remindAt, t.title
       FROM reminders r JOIN todos t ON t.id = r.todo_id
       WHERE r.is_sent = 0 AND r.remind_at <= datetime('now', 'localtime')
       ORDER BY r.remind_at ASC`
    )
    .all();

  if (due.length) {
    const ids = due.map((d) => d.id);
    const placeholders = ids.map(() => "?").join(",");
    db.prepare(`UPDATE reminders SET is_sent = 1 WHERE id IN (${placeholders})`).run(
      ...ids
    );
  }

  res.json(due);
});

app.listen(PORT, () => {
  console.log(`Todo 앱이 http://localhost:${PORT} 에서 실행 중입니다.`);
});
