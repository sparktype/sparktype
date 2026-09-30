---
title: OpenTelemetry Collector, HTTP와 gRPC 엔드포인트 중 뭘 써야 할까
description: OTLP/HTTP와 OTLP/gRPC의 포트·인코딩·성능 차이를 비교하고, 상황별로 어떤 프로토콜을 선택해야 하는지 정리합니다.
pubDate: 2026-09-30
---

OTel SDK는 텔레메트리 데이터를 OTLP(OpenTelemetry Protocol)로 Collector에 전송하며, 두 가지 전송 방식을 지원합니다.

| | OTLP/HTTP | OTLP/gRPC |
| --- | --- | --- |
| 기본 포트 | 4318 | 4317 |
| 인코딩 | Protobuf 또는 JSON | Protobuf 전용 |
| 엔드포인트 형태 | `POST /v1/traces` 등 | `TraceService/Export` 등 RPC |

## Collector 설정 비교

```yaml
# OTLP/HTTP receiver
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318
        # JSON도 수신 가능, TLS·cors 설정 가능
```

```yaml
# OTLP/gRPC receiver
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
        keepalive:
          server_parameters:
            time: 30s
            timeout: 5s
```

SDK 쪽 환경변수 설정:

```bash
# HTTP
export OTEL_EXPORTER_OTLP_ENDPOINT=http://collector:4318
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf  # 또는 http/json

# gRPC
export OTEL_EXPORTER_OTLP_ENDPOINT=http://collector:4317
export OTEL_EXPORTER_OTLP_PROTOCOL=grpc
```

## 상세 비교

| 항목 | OTLP/HTTP | OTLP/gRPC |
| --- | --- | --- |
| HTTP 버전 | HTTP/1.1(대부분) / HTTP/2 가능 | HTTP/2 필수 |
| 연결 방식 | 요청마다 연결(또는 Keep-Alive) | 지속 연결 + 멀티플렉싱 |
| 방화벽 통과 | 쉬움 (표준 HTTP) | 주의 (일부 프록시 미지원) |
| 디버깅 | 쉬움 (curl, Wireshark) | 어려움 (바이너리) |
| 브라우저 SDK | 지원 | 미지원 |
| 스트리밍 | 없음 (단건 export) | 양방향 스트리밍 가능 |

성능 차이는 초당 수천 건 이상의 span·metric을 export하는 고트래픽 환경에서 두드러집니다. 일반적인 서비스라면 두 방식 모두 충분히 빠릅니다.

## gRPC가 유리한 이유 (고트래픽 내부 환경)

1. **지속 연결** — 한 번 맺은 HTTP/2 연결을 계속 재사용합니다. 수천 건의 export가 발생해도 TCP·TLS 핸드셰이크 비용이 없습니다.
2. **멀티플렉싱** — 하나의 연결에서 traces·metrics·logs 스트림을 동시에 처리합니다.
3. **헤더 압축(HPACK)** — 반복 헤더를 색인으로 압축해, 소규모 페이로드가 많을수록 효과적입니다.

## HTTP가 더 적합한 경우

| 상황 | 이유 |
| --- | --- |
| 브라우저 SDK (RUM) | gRPC는 브라우저에서 동작하지 않음 |
| 방화벽·L7 프록시 경유 | 일부 프록시가 HTTP/2 gRPC 트레일러를 차단 |
| 서버리스 (Lambda, Cloud Run) | 지속 연결을 유지할 수 없어 gRPC 이점이 사라짐 |
| 디버깅·개발 환경 | JSON 인코딩으로 Wireshark·curl 분석 가능 |
| Managed SaaS 백엔드 | 일부 APM SaaS가 HTTP만 지원 |

## 실전 구성 권장

두 프로토콜을 동시에 수신하는 혼합 구성이 실무에서 흔합니다.

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317  # 내부 서버 SDK
      http:
        endpoint: 0.0.0.0:4318  # 브라우저 SDK, 서버리스

exporters:
  otlp:
    endpoint: backend:4317      # 백엔드로는 gRPC 사용
    compression: gzip

service:
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [otlp]
```

Collector에서 백엔드(Jaeger, Tempo 등)로 나가는 구간은 거의 항상 gRPC를 권장합니다. SDK에서 Collector로 들어오는 구간은 환경에 따라 선택하되, 내부 서버 서비스라면 gRPC가 유리합니다.
