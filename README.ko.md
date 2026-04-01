![CI](https://github.com/KIM3310/gemini-pilot/actions/workflows/ci.yml/badge.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)

[English](README.md) | [한국어](README.ko.md)

# Gemini Pilot

[Gemini CLI](https://github.com/google-gemini/gemini-cli)를 위한 멀티 에이전트 오케스트레이션 하네스 -- 프롬프트, 워크플로우, 팀 협업 관리.

## 주요 기능

- **15개 전문 에이전트** -- 아키텍트, 실행자, 디버거, 리뷰어, 테스트 엔지니어 등 각 역할에 맞는 전용 프롬프트 제공.
- **10개 내장 워크플로우** -- autopilot, deep-plan, sprint, investigate, tdd, review-cycle, refactor, deploy-prep, interview, team-sync.
- **팀 협업 관리** -- 단계별 파이프라인(Plan, Execute, Verify, Fix)과 품질 게이트, 상태 공유.
- **세션 관리** -- 승인 모드 설정(full / auto / yolo), 컨텍스트 주입, 사용량 지표.
- **훅 시스템** -- 이벤트 기반 훅으로 하네스 동작 확장.
- **MCP 서버** -- Model Context Protocol 통합으로 도구 기반 워크플로우 지원.
- **상태 영속화** -- `.gemini-pilot/` 디렉토리에 JSON 기반 상태, 메모리, 노트패드 저장.

## 설치

### macOS
1. 이 저장소를 다운로드하거나 클론합니다
2. `Install-Mac.command`를 더블클릭합니다
3. 완료! 터미널을 열고 `gp --help`를 입력하세요

### Windows
1. 이 저장소를 다운로드하거나 클론합니다
2. `Install-Windows.bat`를 더블클릭합니다
3. 완료! CMD를 열고 `gp --help`를 입력하세요

### Linux
```bash
git clone https://github.com/KIM3310/gemini-pilot.git
cd gemini-pilot
chmod +x Install-Linux.sh && ./Install-Linux.sh
```

### npm (대안)
```bash
npm install -g gemini-pilot
```

### 요구 사항

- Node.js >= 20.0.0 (설치 프로그램이 없으면 자동으로 설치합니다)

## 빠른 시작

```bash
# CLI로 실행
gp

# 또는 전체 명령어 사용
gemini-pilot
```

## 프로젝트 구조

```
gemini-pilot/
  AGENTS.md          # 마스터 오케스트레이션 계약서
  prompts/           # 15개 에이전트 역할 프롬프트 (마크다운)
  workflows/         # 10개 워크플로우 정의 (프론트매터 포함 마크다운)
  src/
    agents/          # 에이전트 레지스트리
    cli/             # CLI 진입점
    config/          # 설정 로더 및 스키마
    harness/         # 세션 하네스
    hooks/           # 이벤트 훅 매니저
    mcp/             # MCP 서버 통합
    prompts/         # 프롬프트 파일 로더
    state/           # 상태 매니저 및 스키마
    team/            # 팀 코디네이터
    utils/           # 로거, 마크다운 파서, 파일시스템 헬퍼
    workflows/       # 워크플로우 엔진 및 레지스트리
  __tests__/         # 테스트 스위트 (94개 테스트)
```

## 에이전트

| 에이전트 | 역할 |
|---|---|
| architect | 시스템 설계 및 아키텍처 결정 |
| planner | 작업 분해 및 계획 수립 |
| executor | 코드 구현 |
| debugger | 버그 조사 및 진단 |
| reviewer | 코드 품질 리뷰 |
| test-engineer | 테스트 작성 및 커버리지 관리 |
| refactorer | 코드 구조 개선 |
| optimizer | 성능 분석 및 최적화 |
| security-auditor | 보안 평가 |
| analyst | 데이터 및 요구사항 분석 |
| designer | UI/UX 설계 가이드 |
| documenter | 문서 작성 |
| scientist | 연구 및 실험 |
| critic | 건설적 코드 비평 |
| mentor | 지식 전달 및 가이드 |

## 워크플로우

| 워크플로우 | 트리거 | 설명 |
|---|---|---|
| autopilot | 명확하게 정의된 자동화 가능 작업 | 아이디어에서 검증된 코드까지 |
| deep-plan | 다중 컴포넌트 전략 계획 | 심층 전략 분석 |
| sprint | 집중적이고 시간 제한된 목표 | 스프린트 실행 |
| investigate | 알 수 없는 근본 원인 | 체계적 증거 수집 |
| tdd | 정확성이 중요한 기능 | 테스트 주도 개발 |
| review-cycle | 병합 전 품질 검사 | 철저한 코드 리뷰 |
| refactor | 구조적 개선 | 안전한 리팩토링 |
| deploy-prep | 릴리스 준비 | 배포 체크리스트 |
| interview | 모호한 요구사항 | 구조화된 명확화 |
| team-sync | 병렬 작업 스트림 | 멀티 에이전트 협업 |

## 개발

```bash
# 의존성 설치
npm install

# 테스트 실행
npm test

# 감시 모드
npm run test:watch

# 타입 검사
npm run lint

# 빌드
npm run build
```

## 라이선스

[MIT](LICENSE) -- Copyright (c) 2025 Doeon Kim
