# Todo 앱 구현 계획

## Context

PRD와 이전 대화에서 합의한 SQLite DB 구조([DB_SCHEMA.md](../../../../OneDrive/바탕 화면/Aiffel/260720_my-todo/DB_SCHEMA.md))를 바탕으로, 로컬 컴퓨터에서 실행되고 브라우저에서 `localhost`로 접속하는 Todo 앱을 처음부터 구현합니다. 무료 도구만 사용하고, 비밀값/DB 파일은 git에 커밋되지 않도록 `.gitignore`로 관리합니다.

**확정된 스택**: Node.js + Express + better-sqlite3(백엔드) + 바닐라 HTML/CSS/JS(프론트엔드, 빌드 도구 없음).
**확정된 알림 방식**: 브라우저 Notification API로 데스크톱 알림을 띄우고, 동시에 목록에서 임박/지난 항목을 색으로 강조. 알림 권한을 거부해도 목록 강조는 항상 동작.

## 최종 디렉터리 구조

```
260720_my-todo/
├── server.js            # Express 앱 + 전체 API 라우트
├── db.js                 # better-sqlite3 연결, 시작 시 schema.sql 실행
├── db/
│   └── schema.sql         # 합의한 DDL (todos, tags, todo_tags, reminders + 인덱스)
│                           # todo.db는 여기 아니라 프로젝트 루트에 런타임 생성 (.gitignore 대상)
├── public/
│   ├── index.html         # 할 일 추가 폼 + 필터바(오늘만/태그/검색) + 목록
│   ├── style.css
│   └── app.js             # fetch로 API 호출, 렌더링, Notification 폴링
├── .env                   # PORT=3000
├── .env.example           # 커밋용 샘플 (실제 값 없음)
├── .gitignore             # node_modules, .env, todo.db
├── package.json
└── DB_SCHEMA.md           # (기존 파일, 유지)
```

## 단계별 실행 계획

### 1단계 — 프로젝트 스캐폴딩
- `npm init`으로 `package.json` 생성, 의존성 설치: `express`, `better-sqlite3`, `dotenv`
- `.env` (`PORT=3000`), `.env.example`, `.gitignore` (`node_modules/`, `.env`, `todo.db`) 작성
- 빈 `public/` 폴더와 `db/` 폴더 생성

**확인할 것**: `package.json`에 세 의존성이 들어있는지, `npm install`이 에러 없이 끝나는지, `.gitignore`에 `.env`와 `todo.db`가 포함됐는지 눈으로 확인.

### 2단계 — DB 계층
- `db/schema.sql`에 이전에 합의한 DDL(테이블 4개 + 인덱스 3개) 그대로 기록
- `db.js`: better-sqlite3로 프로젝트 루트의 `todo.db` 파일을 열고(없으면 자동 생성), 시작 시 `schema.sql`을 실행(모든 테이블에 `IF NOT EXISTS` 사용해 재실행해도 안전하게)하고 `PRAGMA foreign_keys = ON` 설정 후 db 인스턴스를 export

**확인할 것**: `node -e "require('./db.js')"` 실행 후 프로젝트 루트에 `todo.db` 파일이 새로 생기는지, 같은 명령을 두 번 실행해도 에러 없이 통과하는지(스키마 재실행 안전성) 확인.

### 3단계 — 백엔드 API (server.js)
Express로 아래 엔드포인트 구현, 정적 파일은 `public/`을 서빙:
- `GET /api/todos` — 쿼리 파라미터로 `today=1`(오늘 마감), `tag=이름`, `q=검색어`, `completed=0|1` 조합 필터링 + 태그 목록 join
- `POST /api/todos` — title(필수), description, due_date, tag 이름 배열(없으면 자동 생성 후 연결), reminder 시각(옵션, 있으면 reminders에 insert)
- `PATCH /api/todos/:id` — 완료 토글 포함 부분 수정
- `DELETE /api/todos/:id` — ON DELETE CASCADE로 todo_tags/reminders 자동 정리
- `GET /api/tags` — 태그 전체 목록
- `GET /api/reminders/due` — 프론트엔드가 주기적으로 폴링, `remind_at <= now AND is_sent = 0`인 항목 반환 후 `is_sent = 1`로 마킹

**확인할 것**: 서버 실행(`node server.js`) 후 PowerShell에서 `Invoke-RestMethod http://localhost:3000/api/todos` 등으로 각 엔드포인트를 직접 호출해 CRUD가 실제로 DB에 반영되는지 확인 (todo.db를 DB Browser for SQLite 같은 무료 툴로 열어봐도 됨).

### 4단계 — 프론트엔드 UI
- `index.html`: 상단 추가 폼(제목/설명/마감일/태그 입력/알림 시각), 필터바(오늘만 체크박스, 태그 드롭다운, 검색창), 할 일 목록 영역
- `style.css`: 깔끔한 리스트 스타일, 완료 항목 취소선, 마감일 임박(당일)·지남(overdue) 항목 색상 강조
- `app.js`: 초기 로드 시 목록 fetch·렌더, 폼 제출/체크박스/삭제 버튼에 이벤트 연결, 필터바 변경 시 쿼리 파라미터로 재조회

**확인할 것**: 브라우저에서 `http://localhost:3000` 접속 후 실제로 할 일 추가 → 목록에 표시 → 완료 체크 → 삭제까지 손으로 눌러보며 확인. 태그로 필터링, "오늘만 보기" 토글, 검색창 입력이 목록을 실제로 바꾸는지 확인.

### 5단계 — 브라우저 알림
- `app.js`에서 페이지 로드 시 `Notification.requestPermission()` 요청
- `setInterval`(예: 30초)로 `/api/reminders/due` 폴링 → 응답이 있으면 권한이 허용된 경우 `new Notification(...)`, 항상 목록에서 해당 할 일에 강조 클래스 부여

**확인할 것**: 알림 시각을 1분 뒤로 설정한 할 일을 만들고 기다려서 데스크톱 알림이 뜨는지 확인. 브라우저 알림 권한을 거부한 상태에서도 목록 강조(색상 변화)는 여전히 되는지 확인.

### 6단계 — 마무리 점검
- `README.md`에 실행 방법 3줄 요약(`npm install` → `.env` 확인 → `npm start` → `localhost:3000` 접속)
- `.gitignore`가 실제로 `todo.db`, `.env`, `node_modules/`를 제외하는지 최종 확인

**확인할 것**: 앱을 껐다 켠 뒤에도(`node server.js` 재시작) 이전에 넣은 할 일이 `todo.db`에 남아있는지 확인 — 로컬 영속 저장 요구사항 검증. `git status`(또는 파일 탐색기)로 `.env`·`todo.db`가 추적되지 않는지 확인.

## 참고
- 인증/로그인은 이번 범위에 없음(PRD상 필요 시 별도로 검증된 라이브러리 사용 예정).
- 검색은 `LIKE` 기반 단순 검색으로 시작(추후 FTS5로 확장 가능, DB_SCHEMA.md에 이미 메모됨).