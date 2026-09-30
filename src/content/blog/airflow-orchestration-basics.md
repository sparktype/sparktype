---
title: Airflow 오케스트레이션 핵심 개념
description: cron과 다른 점부터 Scheduler·Executor·Worker 구조, DAG·Operator·XCom까지 Airflow의 기본기를 정리합니다.
pubDate: 2026-09-30
---

Airflow는 "언제, 어떤 순서로, 무엇을 실행할지"를 Python 코드로 정의하는 워크플로우 오케스트레이터입니다. YAML이나 GUI가 아니라 코드로 정의하기 때문에 버전 관리, 테스트, 재사용이 가능합니다.

## cron과 다른 점

| | cron + 쉘 스크립트 | Airflow |
| --- | --- | --- |
| 실패 처리 | 그냥 넘어감 | 감지 → 재시도 → 알림 |
| 의존 관계 | 구현 어려움 | Task 의존성 그래프로 명시 |
| 실행 이력 | 없음 | 전체 기록, UI로 확인 |
| 병렬 실행 | 직접 구현 | Executor가 처리 |
| 외부 연결 관리 | 없음 | Connection으로 중앙 관리 |

## 아키텍처

Airflow는 다섯 가지 컴포넌트로 이뤄집니다.

| 컴포넌트 | 역할 |
| --- | --- |
| Scheduler | DAG 파일 주기적 파싱, 실행 시점 결정, Task를 Executor에 제출 |
| Executor | Task를 어디서 어떻게 실행할지 결정 (Local / Celery / Kubernetes) |
| Worker | 실제 Task 코드 실행 |
| Web Server | UI·REST API 제공 |
| Metadata DB | DAG 정의, Task 상태, XCom, Variable, Connection 저장 |
| Triggerer | Deferrable Operator의 비동기 이벤트 대기 전담 (워커 슬롯 절약) |

## DAG — 실행 계획서

DAG(Directed Acyclic Graph)는 방향이 있고 사이클이 없는 Task들의 실행 계획입니다.

```python
from airflow import DAG
from airflow.operators.python import PythonOperator
from datetime import datetime, timedelta

with DAG(
    dag_id="my_pipeline",
    start_date=datetime(2026, 1, 1),
    schedule="0 2 * * *",  # 매일 02:00 실행
    catchup=False,
    max_active_runs=1,
    default_args={
        "owner": "platform-team",
        "retries": 1,
        "retry_delay": timedelta(minutes=5),
    },
) as dag:

    def preprocess():
        print("전처리 완료")

    t1 = PythonOperator(task_id="preprocess", python_callable=preprocess)
```

주의할 점 하나: Scheduler가 DAG 파일을 30초마다 파싱합니다. 파일 최상단(Task 밖)에 DB 쿼리나 API 호출을 넣으면 그게 30초마다 실행됩니다. 모든 로직은 Task 함수 안에 넣어야 합니다.

## Operator와 Task

Operator는 "무엇을 할지" 정의한 클래스이고, Task는 DAG 안에 배치된 Operator 인스턴스입니다.

| Operator | 용도 |
| --- | --- |
| `PythonOperator` | Python 함수 실행 |
| `BashOperator` | 쉘 명령 실행 |
| `EmptyOperator` | 더미 태스크 (시작/끝 마커) |
| `KubernetesPodOperator` | 임의 컨테이너를 K8s Pod로 실행 |

의존성은 `>>` 연산자로 표현합니다.

```python
t1 >> t2 >> t3          # 직렬
t1 >> [t2, t3] >> t4     # 병렬
[t1, t2] >> t3           # 여러 upstream
```

## Executor — 어디서 실행하나

| Executor | 특징 | 적합한 환경 |
| --- | --- | --- |
| SequentialExecutor | 하나씩 순차 실행 | 로컬 개발/테스트 |
| LocalExecutor | 동일 머신 멀티프로세스 | 단일 서버 소규모 |
| CeleryExecutor | Celery Worker 풀 | 중대규모 온프레미스 |
| KubernetesExecutor | Task마다 K8s Pod 생성·삭제 | K8s 네이티브 환경 |

KubernetesExecutor를 쓰면 유휴 워커가 없어 리소스 효율적이지만, Pod 기동 시간이 있어 짧은 Task에는 오버헤드가 있습니다.

## Sensor — 조건 충족까지 대기

Sensor는 외부 조건이 충족될 때까지 대기하는 특수 Operator입니다. 대기 방식은 세 가지입니다.

| Mode | 동작 | 권장 상황 |
| --- | --- | --- |
| `poke` (기본) | 워커 슬롯 점유한 채 sleep | 수 분 이내 짧은 대기 |
| `reschedule` | 체크 후 슬롯 반납 → 재스케줄 | 수 분~수 시간 대기 |
| `deferrable=True` | Triggerer가 비동기로 감시 | 가장 효율적 (Triggerer 필요) |

수십 분 이상 걸리는 작업을 기다려야 한다면 `mode="reschedule"`을 반드시 써야 합니다. 기본 `poke`로 두면 워커 슬롯을 장시간 점유해 다른 Task들이 실행되지 못합니다.

## XCom — Task 간 데이터 전달

XCom(Cross-Communication)은 Task가 다음 Task에 소량의 값을 넘기는 메커니즘입니다. Metadata DB에 저장되므로 소량 데이터에만 적합합니다(기본 48KB 제한).

```python
from airflow.decorators import task

@task
def get_record_count():
    return 12345  # 반환값이 자동으로 XCom에 push됨

@task
def report(count: int):
    print(f"처리 건수: {count}")

report(get_record_count())
```

Airflow는 "코드로 정의한 워크플로우"라는 단순한 철학 위에서, 실패 감지·재시도·의존성 관리·실행 이력이라는 실무적인 기능을 얹은 도구입니다. 구조를 한 번 이해하면 DAG 하나 짜는 데 크게 헤매지 않습니다.
