---
title: Airflow DAG를 Kubernetes에 배포하는 3가지 방법
description: REST API로는 DAG를 올릴 수 없다는 전제부터, Git-sync·PVC 복사·이미지 내장 세 전략의 장단점과 CI/CD 파이프라인 구성을 비교합니다.
pubDate: 2026-09-30
---

Airflow REST API에 DAG 파일을 업로드하는 엔드포인트가 있을 거라 생각하기 쉽지만, 없습니다. Airflow는 파일 시스템의 `.py` 파일을 Scheduler가 주기적으로 파싱해서 등록합니다.

**DAG 등록 = DAG 폴더(`/opt/airflow/dags/`)에 `.py` 파일을 배치하는 것**이 전부입니다. REST API는 파일이 배치되고 Scheduler가 감지한 이후에만 유효합니다. 그래서 CI/CD에서 핵심은 "파일을 어떻게 배치하느냐"를 결정하는 것입니다.

```
Airflow Scheduler
├── DAG 폴더 스캔 (기본 30초 주기)
│   └── /opt/airflow/dags/*.py 파싱
│       ├── 파싱 성공 → Metadata DB에 DAG 등록
│       └── 파싱 실패 → importErrors 테이블에 기록
└── REST API
    └── 이미 등록된 DAG의 상태 변경, 조회, 트리거만 가능
```

## REST API로 할 수 있는 것 (CI/CD 검증용)

| 작업 | 엔드포인트 | CI/CD 활용 |
| --- | --- | --- |
| DAG 목록 조회 | `GET /api/v1/dags` | 배포 후 DAG 인식 확인 |
| DAG pause/unpause | `PATCH /api/v1/dags/{dag_id}` | 신규 DAG 자동 활성화 |
| DAG Run 트리거 | `POST /api/v1/dags/{dag_id}/dagRuns` | Smoke test |
| Import Error 확인 | `GET /api/v1/importErrors` | 파싱 오류 감지 → CI 실패 처리 |

## K8s 환경 3가지 배포 전략

| 전략 | 동작 방식 | 배포 속도 | 추천도 |
| --- | --- | --- | --- |
| Git-sync | Scheduler sidecar가 Git repo를 주기적 pull | 60초 이내 | K8s 권장 |
| PVC + kubectl | CI에서 임시 Pod로 PVC에 파일 복사 | Pod 기동 시간 포함 | 간단 환경 |
| 이미지 내장 | DAG 파일을 Docker 이미지에 COPY | 느림 (이미지 빌드) | 엄격한 버전 고정 시 |

### 방법 1 — Git-sync (K8s 권장)

Helm Chart의 Scheduler Pod에 `git-sync` sidecar 컨테이너가 함께 실행되며 Git repo를 DAGs 볼륨으로 마운트합니다. CI/CD는 Git push 후 검증만 하면 되고, 파일 배치는 Airflow가 알아서 처리합니다.

```
개발자
 └─ git push origin main
     │
     ▼ (git-sync sidecar, 60초마다)
Scheduler Pod
 ├── git pull dags-repo main
 └── /opt/airflow/dags/ 갱신 (shared volume)
     │
     ▼ (Scheduler, 30초마다 DAG 폴더 스캔)
Metadata DB에 DAG 등록 완료
```

Helm `values.yaml` 설정:

```yaml
dags:
  gitSync:
    enabled: true
    repo: https://github.com/your-org/airflow-dags.git
    branch: main
    subPath: dags
    wait: 60
    depth: 1
    sshKeySecret: airflow-ssh-secret
```

CI에서는 DAG 파싱이 실제로 성공하는지만 검증하면 됩니다.

```yaml
# .github/workflows/deploy-dags.yml
name: Deploy DAGs (Git-sync)
on:
  push:
    branches: [main]
    paths: ["dags/**"]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: DAG 파싱 검증
        run: |
          pip install apache-airflow==2.9.3 apache-airflow-providers-cncf-kubernetes
          python -c "
          import glob, importlib.util, sys
          errors = []
          for f in glob.glob('dags/**/*.py', recursive=True):
              spec = importlib.util.spec_from_file_location('dag', f)
              mod = importlib.util.module_from_spec(spec)
              try:
                  spec.loader.exec_module(mod)
              except Exception as e:
                  errors.append(f'{f}: {e}')
          if errors:
              print(chr(10).join(errors)); sys.exit(1)
          print('모든 DAG 파싱 성공')
          "
      # Git-sync 환경: main merge 후 Scheduler sidecar가 60초 내 자동 pull
```

### 방법 2 — PVC + kubectl 복사

이미 운영 중인 Airflow의 PVC에 CI 파이프라인이 직접 파일을 복사하는 방식입니다.

```
GitHub Actions
 └─ kubectl run dag-uploader (busybox + PVC 마운트)
     │
     ▼
     kubectl cp dags/ → Pod의 /dags/ (PVC 마운트 경로)
     │
     ▼ (Scheduler, 30초마다 스캔)
     DAG 등록 완료
```

배포 마지막 단계에서 REST API로 import 오류를 확인합니다.

```bash
sleep 35  # Scheduler 스캔 대기
ERRORS=$(curl -s -u admin:$AIRFLOW_PASS http://airflow.example.com/api/v1/importErrors | jq '.import_errors | length')
[ "$ERRORS" = "0" ] && echo "Import 오류 없음" || (echo "Import 오류 발생"; exit 1)
```

### 방법 3 — Docker 이미지에 DAG 내장

이미지 태그가 그대로 DAG 버전이 됩니다. 다만 DAG 하나를 바꿔도 전체 이미지를 다시 빌드해야 하므로, 빈번하게 DAG를 수정하는 환경에는 비효율적입니다.

```yaml
- name: Helm Rolling 배포
  run: |
    helm upgrade airflow apache-airflow/airflow \
      --namespace airflow --reuse-values \
      --set defaultAirflowRepository=ghcr.io/your-org/airflow \
      --set defaultAirflowTag=${{ steps.tag.outputs.SHA }} \
      --wait --timeout=5m
```

`helm upgrade`는 Scheduler·Worker·Webserver Pod 전체를 롤링 재시작합니다. DAG 하나 수정에도 수 분이 걸립니다.

## 정리

파일 배치가 잦고 K8s 네이티브 환경이라면 Git-sync가 기본 선택지입니다. 이미 운영 중인 클러스터에 급하게 끼워 넣어야 한다면 PVC 복사가 간단하고, 이미지 버전과 DAG 버전을 엄격하게 묶어야 하는 조직이라면 이미지 내장 방식이 맞습니다. 어떤 방법을 쓰든 REST API의 역할은 "배치 이후의 검증"에 한정된다는 점이 핵심입니다.
