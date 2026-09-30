---
title: "zsh 시작 속도 튜닝: Turbo 모드부터 atuin까지"
description: PATH 중복 제거, Zinit lazy loading, gitstatus 노이즈 해결까지 zsh 설정을 최적화하는 구체적인 방법을 정리합니다.
pubDate: 2026-09-30
---

zsh 시작 속도는 플러그인 개수보다 "언제 로드하느냐"에 더 크게 좌우됩니다. Zinit 같은 플러그인 매니저의 Turbo 모드, lazy loading, 캐싱 전략을 정리합니다.

## 잘 되어 있으면 확인할 것들

| 항목 | 설명 |
| --- | --- |
| PATH 관리 | `typeset -U path` 배열로 중복 자동 제거, 우선순위 명시적 정렬 |
| Turbo 모드 | 비핵심 플러그인 전부 `wait'0'` / `wait'1'`로 지연 로드 |
| Lazy loading | pyenv·sdkman 같은 런타임 매니저를 first-use 함수 래퍼로 초기화 |
| 히스토리 설정 | `HISTSIZE` 크게, 타임스탬프·중복 제거·터미널 간 공유 |
| zcompdump 캐싱 | 24h 만료 조건으로 매번 `compinit` 재실행 방지 |

## 흔한 개선 포인트

### 1. gitstatus 초기화 오류 노이즈

**현상**: `zsh -i -c exit` 같은 비대화형 서브쉘에서 powerlevel10k의 gitstatus가 `monitor` 옵션 없이 실행되면 `ERROR: gitstatus failed to initialize`가 stderr에 출력됩니다. 실제 터미널 세션에서는 문제없지만, 다른 프로그램이 스크립트로 `zsh -i`를 호출할 때 노이즈가 생깁니다.

**해결**: `.zshrc` 최상단(p10k instant prompt 블록 위)에 추가합니다.

```bash
# 비대화형 서브쉘에서는 p10k 로드 자체를 건너뜀
[[ $- != *i* ]] && return
```

### 2. 플러그인 변수에 불필요한 export

```bash
# 현재 (불필요한 export)
export ZSH_AUTOSUGGEST_BUFFER_MAX_SIZE=20
export ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE="fg=#6c7a89,underline"

# 수정 후 (zsh 플러그인 내부 변수는 export 불필요)
ZSH_AUTOSUGGEST_BUFFER_MAX_SIZE=20
ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE="fg=#6c7a89,underline"
```

이 변수들은 zsh 내부 플러그인만 읽으므로 서브프로세스로 내보낼 필요가 없습니다. 불필요한 환경 오염을 줄이는 소소한 개선입니다.

### 3. zoxide 초기화 방식

```bash
# 의도가 불명확한 트릭
zinit ice wait'0' lucid atload 'eval "$(zoxide init zsh)"'
zinit light zdharma-continuum/null

# 더 명시적인 방식
zinit ice wait'0' lucid id-as'zoxide' nocompile nocd atload 'eval "$(zoxide init zsh)"'
zinit light zdharma-continuum/null

# 또는 zoxide는 평가 비용이 낮으니 zinit 밖에서 동기 로드해도 무방
eval "$(zoxide init zsh)"
```

## 추천 도구

### atuin — 히스토리 검색

SQLite 기반으로 머신 간 동기화, 컨텍스트(디렉토리·종료코드·실행시간) 저장, 풍부한 통계, 빠른 퍼지 검색을 제공합니다. mcfly를 대체하거나 병행 운용할 수 있습니다.

```bash
brew install atuin
eval "$(atuin init zsh)"
atuin import auto
```

### delta — git diff 시각화

`git diff` / `git log -p` / `git show`를 구문 강조 + 줄 번호 + side-by-side 보기로 바꿔줍니다.

```bash
brew install git-delta
```

```gitconfig
[core]
    pager = delta
[interactive]
    diffFilter = delta --color-only
[delta]
    navigate = true
    side-by-side = true
    line-numbers = true
    syntax-theme = Dracula
```

### 소소한 setopt 추가

```bash
setopt PUSHD_IGNORE_DUPS         # pushd 스택 중복 제거
setopt HIST_EXPIRE_DUPS_FIRST    # 히스토리 가득 찰 때 오래된 중복부터 삭제
setopt NO_HUP                    # 쉘 종료 시 백그라운드 잡 SIGHUP 안 보냄

bindkey '^ ' autosuggest-accept  # Ctrl+Space: autosuggestion 수락
```

## 런타임 관리 통합 (mise)

pyenv, gobrew, sdkman, volta처럼 언어별 버전 관리자를 각각 운용하고 있다면, `mise` 하나로 Python·Go·Java·Node·Ruby를 모두 관리할 수 있습니다. lazy loading이 내장되어 있고 `.tool-versions` 파일로 프로젝트별 버전을 고정할 수도 있습니다. 다만 마이그레이션 비용이 있는 큰 변경이라 지금 잘 돌고 있다면 급하게 바꿀 필요는 없습니다.

## 체크리스트

- [ ] fzf, eza, bat, fd, rg 같은 핵심 CLI 도구가 갖춰져 있는가
- [ ] 플러그인이 Turbo 모드(`wait`)로 지연 로드되는가
- [ ] `compinit`이 매번 재실행되지 않고 캐싱되는가
- [ ] 비대화형 서브쉘에서 불필요한 초기화 오류가 나지 않는가

교과서적으로 최적화된 zsh 설정이라도, 비대화형 서브쉘 처리나 export 습관 같은 디테일에서 개선 여지가 남아 있는 경우가 많습니다.
