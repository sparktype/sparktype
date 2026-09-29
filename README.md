# Sparktype

Astro 정적 블로그입니다. `main`에 푸시하면 GitHub Actions가 GitHub Pages로 배포합니다.

로컬 주소는 [http://localhost:4321/](http://localhost:4321/)이고, 배포 주소는 [https://sparktype.dev/](https://sparktype.dev/)입니다.

## 명령

| 명령 | 하는 일 |
| --- | --- |
| `bun install` | 의존성 설치 |
| `bun run dev` | 개발 서버 |
| `bun run build` | `dist/`에 정적 사이트 빌드 |
| `bun run preview` | 빌드 결과 미리보기 |

글은 `src/content/blog/`에 `.md` 또는 `.mdx`로 추가합니다.

## 배포

1. 이 폴더를 GitHub 저장소의 `main` 브랜치로 푸시합니다. 커스텀 도메인은 `public/CNAME`의 `sparktype.dev`입니다.
2. 저장소 Settings → Pages → Source를 **GitHub Actions**로 선택합니다.
3. 이후 `main` 푸시마다 `.github/workflows/deploy.yml`이 빌드하고 배포합니다. Actions 탭에서 수동 실행도 됩니다.

`github.com/sparktype/sparktype`은 GitHub 프로필 README 저장소입니다. 이 블로그를 그 저장소에 푸시하면 프로필 README가 이 프로젝트의 README로 바뀝니다.
