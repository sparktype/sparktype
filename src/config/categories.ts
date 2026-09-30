/**
 * The site's categories. Every post belongs to exactly one of these, so keep the
 * list short — six is the practical ceiling before the sidebar stops reading as
 * a menu. Rename or replace entries here, then update the `category` value in
 * each post's frontmatter to match; the build fails on any mismatch.
 *
 * Order matters: it is the order used on the categories index and in the home
 * sidebar.
 */
export const categories = ["데이터 엔지니어링", "네트워크·프로토콜", "인프라", "개발 도구"] as const;

export type Category = (typeof categories)[number];

/** Unicode-aware slug: keeps Hangul (and other letters/numbers), drops punctuation. */
export const categorySlug = (category: string) =>
  category
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");

/** One line per category, shown on its archive page and in listings. */
export const categoryDescriptions: Record<Category, string> = {
  "데이터 엔지니어링": "Airflow, NiFi, IoT 파이프라인, 그래프 데이터 모델링까지 데이터를 흐르게 하는 시스템 이야기.",
  "네트워크·프로토콜": "HTTP·gRPC·TLS·OTLP — 서비스 간 통신 프로토콜을 선택하고 이해하는 데 필요한 것들.",
  "인프라": "MinIO 인증과 타임아웃, ClickHouse 클러스터 설계 등 인프라를 안정적으로 굴리는 방법.",
  "개발 도구": "zsh, Obsidian, CLI 에이전트 HUD처럼 매일 쓰는 도구를 다듬는 이야기.",
};
