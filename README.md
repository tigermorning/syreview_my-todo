# 내 Todo

로컬 컴퓨터에서 실행되는 개인 Todo 앱. 데이터는 프로젝트 루트의 `todo.db`(SQLite) 파일에 저장됩니다.

## 실행 방법

```
npm install
npm start
```

이후 브라우저에서 `http://localhost:3000` 접속 (포트는 `.env`의 `PORT`로 변경 가능).

## 기능

- 할 일 추가 / 목록 보기 / 완료 표시 / 삭제
- 마감일 표시, 카테고리(태그), 오늘 할 일만 보기, 검색
- 마감일 알림 설정 — 브라우저 데스크톱 알림 + 목록 강조 (권한 거부 시에도 목록 강조는 동작)

## 구조

- `server.js` — Express 앱 + API 라우트
- `db.js` / `db/schema.sql` — SQLite 연결 및 스키마
- `public/` — 프론트엔드 (바닐라 HTML/CSS/JS)
- `DB_SCHEMA.md` — DB 설계 문서
