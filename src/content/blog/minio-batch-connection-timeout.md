---
title: 대용량 배치에서 MinIO Connection Timeout이 나는 이유
description: 서버 deadline, 클라이언트 SDK 타임아웃, TCP keepalive 부재라는 세 가지 원인을 진단하고 설정으로 해결하는 방법을 정리합니다.
pubDate: 2026-09-30
---

배치에서 대량 데이터를 읽을 때 타임아웃이 발생하는 원인은 크게 세 곳입니다 — ① 서버 측 deadline 설정, ② 클라이언트 SDK 타임아웃, ③ TCP 레벨 keepalive·버퍼 부재. 셋 중 하나라도 짧으면 긴 전송 중간에 연결이 끊깁니다.

## 원인 맵

| 구분 | 원인 | 기본값 | 증상 |
| --- | --- | --- | --- |
| 서버 | `MINIO_API_REQUESTS_DEADLINE` 초과 | 10s | 서버가 응답 중 TCP FIN 전송 |
| 서버 | `MINIO_API_REQUESTS_MAX` 초과 → 큐 대기 중 timeout | 0 (무제한) | 429 또는 연결 지연 |
| 클라이언트 | SDK read timeout (boto3 기본 60s) | 60s | 대용량 객체 전송 중 `ReadTimeoutError` |
| 클라이언트 | 커넥션 풀 고갈 | 10 connections | 병렬 배치에서 `ConnectTimeoutError` |
| 네트워크 | TCP keepalive 미설정 → 중간 장비가 유휴 연결을 끊음 | OS 기본 7200s | 수 분 이상 전송 중 연결 유실 |
| 네트워크 | 소켓 수신 버퍼 부족 | 87KB(기본) | 대용량 전송 속도 급감 후 timeout |
| 네트워크 | K8s ingress / LB idle timeout | 60s(예: AWS ALB) | 정확히 1분 간격으로 연결 끊김 |

## 1. MinIO 서버 설정

```bash
# 동시 요청 수 제한 (기본값: 0 = 무제한)
MINIO_API_REQUESTS_MAX=10000

# 요청 마감 시간 (기본값: 10s — 대용량 배치엔 너무 짧음)
MINIO_API_REQUESTS_DEADLINE=600s

# 멀티파트 업로드 클린업 주기
MINIO_API_STALE_UPLOADS_EXPIRY=720h
MINIO_API_STALE_UPLOADS_CLEANUP_INTERVAL=12h
```

또는 런타임에 바로 적용할 수 있습니다.

```bash
mc admin config set myminio api requests_deadline=600s
mc admin config set myminio api requests_max=10000
mc admin service restart myminio
```

`requests_deadline`은 요청 응답 완료까지의 총 시간입니다. 10GB 파일을 100Mbps 망에서 읽으면 최소 800초가 걸리는데, 기본값 10초로는 절대 완료되지 않습니다.

## 2. 클라이언트 SDK 설정

### Python `minio` (urllib3 기반)

```python
import urllib3
from minio import Minio

http_client = urllib3.PoolManager(
    timeout=urllib3.Timeout(
        connect=10,   # 연결 수립 제한
        read=600,     # 읽기 제한 — 대용량 배치는 넉넉하게
    ),
    maxconnections=32,
    retries=urllib3.Retry(
        total=5,
        backoff_factor=1,
        status_forcelist=[500, 502, 503, 504],
    ),
)

client = Minio(
    "minio.example.com:9000",
    access_key="...",
    secret_key="...",
    secure=True,
    http_client=http_client,
)
```

### Python `boto3` (AWS SDK 호환)

```python
import boto3
from botocore.config import Config

config = Config(
    connect_timeout=10,
    read_timeout=600,
    retries={"max_attempts": 5, "mode": "adaptive"},
    max_pool_connections=50,
    tcp_keepalive=True,  # 핵심
)

s3 = boto3.client(
    "s3",
    endpoint_url="http://minio.example.com:9000",
    config=config,
)
```

## 3. 배치 처리 패턴

### 청크 스트리밍 + 제한적 병렬화

```python
def read_large_object(client, bucket, key, chunk_size=32 * 1024 * 1024):
    """32MB 청크 단위 스트리밍 — 단일 TCP 연결 유지 시간 단축"""
    response = client.get_object(Bucket=bucket, Key=key)
    stream = response["Body"]
    while True:
        chunk = stream.read(chunk_size)
        if not chunk:
            break
        yield chunk

from concurrent.futures import ThreadPoolExecutor, as_completed

def batch_read(client, bucket, keys, max_workers=8):
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(read_large_object, client, bucket, k): k for k in keys}
        for f in as_completed(futures):
            key = futures[f]
            try:
                for chunk in f.result():
                    process(chunk)
            except Exception as e:
                print(f"[WARN] {key} 실패: {e}")
```

### Presigned URL 패턴 — 장시간 배치에 추천

```python
from datetime import timedelta

url = client.presigned_get_object(
    "my-bucket",
    "large-file.parquet",
    expires=timedelta(hours=2),  # 배치 작업 예상 시간보다 넉넉히
)

import requests
with requests.get(url, stream=True, timeout=(10, 600)) as resp:
    for chunk in resp.iter_content(chunk_size=32 * 1024 * 1024):
        process(chunk)
```

Presigned URL을 쓰면 MinIO SDK 클라이언트의 타임아웃 설정을 우회할 수 있습니다. 직접 HTTP 스트리밍으로 처리하기 때문에 더 세밀한 타임아웃 제어가 가능합니다.

## 4. 네트워크·OS 레벨

```bash
# /etc/sysctl.conf 또는 sysctl -w 로 즉시 적용
net.ipv4.tcp_keepalive_time = 60      # 유휴 후 keepalive 시작까지 (기본 7200)
net.ipv4.tcp_keepalive_intvl = 10     # probe 간격 (기본 75)
net.ipv4.tcp_keepalive_probes = 6     # 실패 허용 횟수 (기본 9)
net.core.rmem_max = 134217728         # 소켓 수신 버퍼 최대 128MB
net.core.wmem_max = 134217728         # 소켓 송신 버퍼 최대 128MB
```

K8s에 올라간 MinIO라면 Probe 설정도 함께 봐야 합니다. 기본 `failureThreshold`(3)는 배치 처리 중 재시작을 유발할 수 있습니다.

```yaml
livenessProbe:
  httpGet:
    path: /minio/health/live
    port: 9000
  initialDelaySeconds: 120
  periodSeconds: 20
  timeoutSeconds: 10
  failureThreshold: 6  # 기본값(3)은 배치 처리 중 재시작 유발 가능
```

## 진단 체크리스트

| 체크 항목 | 명령 | 정상 기준 |
| --- | --- | --- |
| 서버 deadline 확인 | `mc admin config get myminio api` | `requests_deadline=600s` 이상 |
| 전송 속도 측정 | `mc cp --md5 s3/bucket/large-file /dev/null` | deadline 내 완료 여부 |

타임아웃은 대부분 "서버·클라이언트·네트워크 중 어느 계층의 시간 제한이 가장 짧은가"의 문제입니다. 세 계층을 모두 배치 규모에 맞게 늘려야 근본적으로 해결됩니다.
