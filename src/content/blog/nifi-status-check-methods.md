---
title: Apache NiFi 상태를 점검하는 6가지 방법
description: Web UI부터 REST API, Toolkit CLI, Prometheus 연동, Kubernetes, Python 스크립트까지 상황별로 맞는 점검 방법을 정리합니다.
pubDate: 2026-09-30
---

NiFi 인스턴스에 접속해 흐름 상태·에러·큐 현황을 파악하는 방법을 계층별로 정리했습니다.

## 1. Web UI — 가장 빠른 시각적 확인

```
http://<nifi-host>:8080/nifi
https://<nifi-host>:8443/nifi   # TLS 활성화 시
```

| 확인 항목 | UI 위치 |
| --- | --- |
| 전체 데이터 흐름 | Canvas 화면 — 파란 선: 정상, 빨간 불릿: 에러 |
| 큐 누적 | 커넥션 위 숫자 (FlowFile 수/사이즈) |
| 클러스터 노드 상태 | 상단 메뉴 ▸ Cluster |
| 프로세서 통계 | 프로세서 우클릭 ▸ View status history |
| 시스템 진단 | 햄버거 메뉴 ▸ Summary ▸ System Diagnostics |

## 2. REST API — 자동화·스크립트에 적합

NiFi 1.x 기준, 주요 엔드포인트는 `/nifi-api/flow/...`와 `/nifi-api/processors/...`입니다.

```bash
# 클러스터 전체 상태
curl -s http://<host>:8080/nifi-api/flow/cluster/summary | jq .

# 실행 중인 프로세서 목록
curl -s 'http://<host>:8080/nifi-api/flow/process-groups/root/processors?includeDescendantGroups=true' \
  | jq '.processors[] | {id:.id, name:.component.name, state:.component.state}'

# 큐에 쌓인 FlowFile 확인
curl -s http://<host>:8080/nifi-api/flow/process-groups/root/status \
  | jq '.processGroupStatus.aggregateSnapshot | {queued:.queued, queuedCount:.flowFilesQueued}'

# 불릿(에러) 목록
curl -s http://<host>:8080/nifi-api/flow/process-groups/root/status \
  | jq '.. | .bulletins? | select(. != null and length > 0) | .[]'
```

TLS가 걸려 있다면(1.14+) 토큰을 먼저 발급받습니다.

```bash
TOKEN=$(curl -s -X POST 'https://<host>:8443/nifi-api/access/token' \
  -d 'username=admin&password=yourpass' -H 'Content-Type: application/x-www-form-urlencoded')
curl -s -H "Authorization: Bearer $TOKEN" https://<host>:8443/nifi-api/flow/cluster/summary | jq .
```

`jq '.processGroupStatus.aggregateSnapshot'`로 집계 스냅샷만 뽑으면 응답 크기가 크게 줄어듭니다.

## 3. NiFi Toolkit CLI

NiFi 서버와 버전이 일치해야 합니다. 배포 자동화·마이그레이션에 유용합니다.

```bash
wget https://downloads.apache.org/nifi/<version>/nifi-toolkit-<version>-bin.tar.gz
tar xzf nifi-toolkit-*.tar.gz && cd nifi-toolkit-*/
bin/cli.sh

# CLI 내 주요 명령
nifi list-pg-processors --baseUrl http://<host>:8080
nifi pg-status --pgId root --baseUrl http://<host>:8080
nifi list-param-contexts --baseUrl http://<host>:8080
```

## 4. Prometheus + Grafana 모니터링 (NiFi 1.14+)

`/nifi-api/flow/metrics/prometheus` 엔드포인트가 Prometheus exposition 형식을 직접 노출합니다.

```yaml
scrape_configs:
  - job_name: 'nifi'
    static_configs:
      - targets: ['<nifi-host>:8080']
    metrics_path: '/nifi-api/flow/metrics/prometheus'
```

| 메트릭 | 의미 |
| --- | --- |
| `nifi_amount_flowfiles_queued` | 큐 누적 FlowFile 수 |
| `nifi_bytes_read` / `written` | 초당 읽기/쓰기 바이트 |
| `nifi_active_thread_count` | 현재 실행 중인 스레드 수 |
| `nifi_bulletin_count` | 에러·경고 불릿 누적 수 |

## 5. Kubernetes 환경

```bash
kubectl get pods -n <namespace> -l app=nifi
kubectl logs -n <namespace> <nifi-pod> --tail=200
kubectl exec -n <namespace> <nifi-pod> -- tail -f /opt/nifi/nifi-current/logs/nifi-app.log
kubectl port-forward -n <namespace> svc/nifi 8080:8080 &
```

## 6. Python 스크립트로 상태 수집

CI나 슬랙 알림 등 자동화에 붙이기 좋은 패턴입니다.

```python
import requests

BASE = "http://<host>:8080/nifi-api"

def get_cluster_summary():
    r = requests.get(f"{BASE}/flow/cluster/summary")
    return r.json()["clusterSummary"]

def get_bulleted_processors(pg_id="root"):
    r = requests.get(f"{BASE}/flow/process-groups/{pg_id}/status")
    snap = r.json()["processGroupStatus"]["aggregateSnapshot"]
    return {
        "queued": snap.get("queued"),
        "active": snap.get("activeThreadCount"),
        "bytes_in": snap.get("bytesRead"),
        "bullets": snap.get("bulletinCount"),
    }
```

## 방법 비교

| 방법 | 난이도 | 적합한 상황 |
| --- | --- | --- |
| Web UI | ⭐ | 즉각적인 시각 확인, 에러 위치 파악 |
| REST API (curl) | ⭐⭐ | 스크립트 점검, CI 헬스체크 |
| NiFi Toolkit CLI | ⭐⭐ | 배포 자동화, 다중 환경 관리 |
| Prometheus+Grafana | ⭐⭐⭐ | 장기 트렌드, 알림 설정 |
| K8s kubectl | ⭐⭐ | K8s 위에서 운영 중일 때 |
| Python 스크립트 | ⭐⭐⭐ | Slack 알림, 자동 리포트 |

기업 사내망처럼 SSL 인터셉트 프록시가 걸려 있는 환경이라면, Python `requests`로 NiFi REST API를 호출할 때 인증서 검증 오류가 날 수 있습니다. `verify=False`(테스트 환경 한정) 또는 사내 CA 번들을 지정해서 우회해야 합니다.
