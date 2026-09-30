---
name: blog-post
description: sparktype.dev(Astro 블로그)에 글을 추가·수정할 때 쓴다. "블로그에 저장", "블로그 글 작성", "포스트 추가", 영상·문서 요약을 블로그에 올리는 요청에 사용한다.
---

# 블로그 글 작업

Astro 정적 블로그다. `main`에 푸시하면 GitHub Actions가 https://sparktype.dev/ 로 배포한다. 상세는 `BLOG.md`.

## 절차

1. **카테고리 확인.** `src/config/categories.ts`의 `categories` 중 하나여야 한다(현재 데이터 엔지니어링, 네트워크·프로토콜, 인프라, 개발 도구). 안 맞으면 새로 만들지 말고 사용자에게 묻는다.
2. **파일 생성.** `src/content/posts/<영문-kebab-slug>/index.md`. 스키마는 `src/content.config.ts`가 정본이다.
3. **frontmatter.**
   ```yaml
   ---
   title: "..."
   excerpt: "한두 문장 요약"
   category: "개발 도구"
   date: YYYY-MM-DD   # 오늘 날짜
   author:
     name: "박상선"
     role: "Cloud Native DevOps Engineer"
   featured: false
   draft: false
   ---
   ```
   커버 이미지는 선택이다. 쓰면 같은 폴더의 `cover.jpg`를 `cover.src`로 가리키고 `cover.alt`를 넣는다.
4. **본문.** 한국어 `~습니다` 체. 문장을 콜론(:)으로 끝내지 않는다. 본문 첫 단락은 글의 배경(출처 링크 포함)을 한두 문장으로 밝힌다. `##` 단위로 나누고 비교는 표를 쓴다. 기존 글(`cli-agent-hud-tools-comparison` 등)의 톤을 따른다.
5. **검증.** `bun run build`가 통과해야 한다. 카테고리 불일치나 스키마 오류는 여기서 실패한다.
6. **커밋.** 글 하나당 커밋 하나, 한국어 semantic 메시지(예: `docs(blog): ○○ 글을 추가한다`). 이 저장소의 `dist/`, `.astro/`는 무시 대상이다.
7. **푸시는 확인 후.** 푸시가 곧 배포다. 사용자가 푸시하라고 하기 전에는 커밋까지만 한다.

## 영상 요약 글일 때

YouTube 페이지는 WebFetch로 본문이 안 온다. 자막을 받는다.

```bash
uvx --from youtube-transcript-api python -c "
from youtube_transcript_api import YouTubeTranscriptApi as Y
print(' '.join(s.text for s in Y().fetch('<VIDEO_ID>', languages=['en','ko'])))"
```

제목·채널은 `https://www.youtube.com/oembed?url=<URL>&format=json`에서 얻는다. 글머리에 원본 링크와 채널명을 반드시 밝힌다.
