export const siteConfig = {
  /** Wordmark shown in the header and footer. Monograph uses text, never a logo image. */
  name: "Sparktype",
  tagline: "데이터 플랫폼과 에이전트 도구를 만드는 기록",
  title: "Sparktype - 개발 기록 블로그",
  description: "데이터 엔지니어링, 인프라, 개발 도구에 대한 기술 노트를 모아 두는 블로그입니다.",
  siteUrl: "https://sparktype.dev",
  authorName: "박상선",
  email: "hello@sparktype.dev",
  language: "ko",
  dateLocale: "ko-KR",
  locale: "ko_KR",
  socialImage: "/og-image.png",
  /** Shown in the home sidebar "About" card. */
  about: "데이터 플랫폼과 에이전트 도구를 만들며 겪은 문제와 해법을 정리해 둡니다.",
  /**
   * Both forms below ship enabled with an empty `action`, which makes them fully
   * interactive demos that submit nowhere: a small script confirms the submit
   * and clears the fields. Paste your provider's endpoint into `action` to send
   * real submissions, or set `enabled: false` to disable the controls outright.
   */
  newsletter: {
    enabled: true,
    action: "",
    method: "post",
    emailFieldName: "email",
    title: "새 글을 이메일로 받기",
    description: "새 글이 올라올 때만 메일이 갑니다. 스팸 없음, 언제든 해지 가능.",
  },
  contact: {
    enabled: true,
    action: "",
    method: "post",
    responseTime: "영업일 기준 이틀 내에 답장을 드립니다.",
  },
  socials: [
    { label: "GitHub", href: "https://github.com/sparktype" },
    { label: "RSS", href: "/rss.xml" },
  ],
};

/** Header navigation. Add or remove entries freely; the header renders them in order. */
export const navigation = [
  { label: "아카이브", href: "/posts/" },
  { label: "카테고리", href: "/categories/" },
  { label: "소개", href: "/about/" },
];

/** Secondary navigation rendered in the footer. */
export const footerNavigation = [
  { label: "문의", href: "/contact/" },
  { label: "개인정보", href: "/privacy/" },
  { label: "RSS", href: "/rss.xml" },
];
