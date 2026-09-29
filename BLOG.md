# 블로그

Astro 정적 블로그다. `main`에 푸시하면 GitHub Actions가 GitHub Pages로 배포한다.

로컬 주소는 [http://localhost:4321/](http://localhost:4321/)이고, 배포 주소는 [https://sparktype.dev/](https://sparktype.dev/)다.

## 명령

| 명령 | 하는 일 |
| --- | --- |
| `bun install` | 의존성 설치 |
| `bun run dev` | 개발 서버 |
| `bun run build` | `dist/`에 정적 사이트 빌드 |
| `bun run preview` | 빌드 결과 미리보기 |

글은 `src/content/blog/`에 `.md` 또는 `.mdx`로 추가한다.

## 배포

1. `main`에 푸시한다. 커스텀 도메인은 `public/CNAME`의 `sparktype.dev`다.
2. 저장소 Settings → Pages → Source는 **GitHub Actions**다.
3. 이후 `main` 푸시마다 `.github/workflows/deploy.yml`이 빌드하고 배포한다.

루트 `README.md`는 GitHub 프로필에 표시된다.
