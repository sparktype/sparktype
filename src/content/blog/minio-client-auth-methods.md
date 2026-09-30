---
title: MinIO Client 인증 방식 5가지 완전 가이드
description: 정적 자격증명부터 LDAP·OIDC 기반 STS 임시 토큰까지, mc가 지원하는 인증 방식과 용도별 선택 기준을 정리합니다.
pubDate: 2026-09-30
---

MinIO Client(`mc`)는 다섯 가지 인증 방식을 지원합니다. 정적 자격증명부터 LDAP·OIDC 기반 STS 임시 토큰까지, 용도에 맞는 방식을 선택해야 합니다.

| 방식 | 대상 | 토큰 수명 | 자동 갱신 | 추천 용도 |
| --- | --- | --- | --- | --- |
| Static | IAM 사용자 | 영구 | X | 개발·로컬 테스트 |
| SvcAcct (서비스 계정) | IAM 사용자 하위 | 설정 만료일까지 | X | 앱·CI/CD 장기 자격증명 |
| STS AssumeRole | IAM 역할 | 15분~7일 | SDK 자동 갱신 | 최소 권한 역할 위임 |
| LDAP AssumeRoleWithLDAPIdentity | LDAP/AD 계정 | 최대 7일 | SDK 자동 갱신 | 사내 디렉터리 연동 |
| OIDC AssumeRoleWithWebIdentity | JWT 소지자 | JWT 유효기간 | SDK 자동 갱신 | Keycloak·Okta·GCP·AWS 연동 |

## 1. 정적 자격증명 (Static)

가장 단순한 방식입니다. Access Key와 Secret Key를 `mc alias set`으로 등록합니다.

```bash
mc alias set myminio https://minio.example.com \
  AKIAIOSFODNN7EXAMPLE \
  wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

mc alias ls myminio
```

세션 토큰(임시 자격증명)도 같은 명령으로 등록할 수 있습니다.

```bash
mc alias set myminio https://minio.example.com \
  ASIA_TEMP_ACCESS_KEY \
  TEMP_SECRET_KEY \
  --session-token "FQoGZXIvYXdzEJr..."
```

## 2. 서비스 계정 (SvcAcct)

IAM 사용자 하위에 발급하는 장기 자격증명입니다. 인라인 정책으로 권한을 더 좁힐 수 있습니다.

```bash
# 생성 (alice 사용자 하위에 서비스 계정 생성)
mc admin user svcacct add myminio alice

# 만료일 설정
mc admin user svcacct add myminio alice \
  --expiry "2026-12-31T23:59:59Z"

# 인라인 정책 (이 서비스 계정만 적용)
mc admin user svcacct add myminio alice \
  --policy /tmp/readonly-policy.json
```

서비스 계정은 부모 사용자 권한의 부분 집합만 허용할 수 있습니다. 부모보다 넓은 권한은 부여할 수 없습니다.

## 3. STS AssumeRole

IAM 역할을 맡아 임시 자격증명을 발급받는 방식입니다.

```
mc/앱 → STS Action=AssumeRole → MinIO STS → 임시 Access/Secret/SessionToken
```

```bash
curl -s "https://minio.example.com?Action=AssumeRole&Version=2011-06-15&\
DurationSeconds=3600&RoleArn=arn:aws:iam::123456789:role/myrole&\
RoleSessionName=mysession" \
  -u "alice:alice123"

# 응답에서 임시 키 추출 후 alias 등록
mc alias set temp-alias https://minio.example.com \
  "<AccessKeyId>" "<SecretAccessKey>" \
  --session-token "<SessionToken>"
```

## 4. LDAP 인증

사내 Active Directory / LDAP 계정으로 STS 임시 토큰을 발급받습니다.

```
LDAP 계정/비밀번호 → MinIO STS → LDAP 서버 인증 → 임시 자격증명
```

```bash
curl -s -X POST "https://minio.example.com" \
  --data-urlencode "Action=AssumeRoleWithLDAPIdentity" \
  --data-urlencode "LDAPUsername=john.doe" \
  --data-urlencode "LDAPPassword=secret" \
  --data-urlencode "Version=2011-06-15" \
  --data-urlencode "DurationSeconds=7200"
```

## 5. OIDC / Web Identity

Keycloak·Okta·GCP Workload Identity 등 외부 IdP에서 발급한 JWT로 STS 토큰을 교환합니다.

```
IdP (Keycloak 등) → JWT access_token → MinIO STS AssumeRoleWithWebIdentity → 임시 자격증명
```

```bash
# 1. IdP에서 JWT 토큰 획득
JWT_TOKEN=$(curl -s -X POST "https://keycloak.example.com/realms/myrealm/protocol/openid-connect/token" \
  --data "client_id=minio-client" \
  --data "client_secret=SECRET" \
  --data "grant_type=client_credentials" \
  | jq -r .access_token)

# 2. MinIO STS에 WebIdentity 토큰 전달
curl -s -X POST "https://minio.example.com" \
  --data-urlencode "Action=AssumeRoleWithWebIdentity" \
  --data-urlencode "WebIdentityToken=$JWT_TOKEN" \
  --data-urlencode "Version=2011-06-15" \
  --data-urlencode "DurationSeconds=3600"
```

서버 관리자는 IdP를 사전에 등록해둡니다.

```bash
mc idp openid add myminio keycloak \
  config_url="https://keycloak.example.com/realms/myrealm/.well-known/openid-configuration" \
  client_id="minio-client" \
  client_secret="my-client-secret" \
  scopes="openid,profile,email" \
  redirect_uri="https://minio-console.example.com/oauth_callback" \
  role_policy="readwrite"
```

## Python SDK — 자격증명 자동 갱신

`minio` Python SDK는 자격증명 만료 시 자동 갱신을 지원합니다. `AssumeRoleWithWebIdentity`, `AssumeRoleWithLDAPIdentity` 같은 provider 클래스를 클라이언트에 주입하면, SDK가 만료 시점을 감지해 알아서 재발급을 요청합니다.

## 선택 기준

- 로컬 개발·테스트만 한다면 Static으로 충분합니다.
- 앱이나 CI/CD처럼 장기간 실행되는 프로세스라면 SvcAcct로 권한을 좁혀서 발급하는 게 안전합니다.
- 최소 권한 원칙을 지켜야 하는 배치·잡이라면 STS AssumeRole이 적합합니다.
- 이미 LDAP/AD나 OIDC IdP를 운영 중이라면, 별도 자격증명 발급 없이 기존 계정 체계에 얹을 수 있는 LDAP/OIDC 방식이 관리 부담을 줄여줍니다.
