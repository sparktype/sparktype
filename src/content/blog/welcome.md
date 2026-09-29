---
title: 블로그를 열며
description: Sparktype 블로그의 첫 글입니다.
pubDate: 2026-09-30
heroImage: ../../assets/blog-placeholder-1.jpg
---

이 사이트는 [Astro](https://astro.build/)로 만든 정적 블로그입니다. `main`에 푸시하면 GitHub Actions가 빌드하고 GitHub Pages에 배포합니다.

## 글 추가하기

`src/content/blog/`에 `.md` 또는 `.mdx` 파일을 만듭니다. 파일 이름이 주소가 됩니다. 이 파일의 경로는 `blog/welcome`이고, 배포되면 `https://sparktype.github.io/sparktype/blog/welcome/`입니다.

```md
---
title: 제목
description: 한 줄 소개
pubDate: 2026-09-30
---

본문
```

`heroImage`는 선택입니다. `src/assets/`의 이미지를 상대 경로로 가리키면 됩니다.
