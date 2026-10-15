# NODNABA

NODNABA 공식 웹사이트 — *네 개의 선, 미완의 별. 사선의 미완성.*

모바일 우선으로 만든 몽환적이고 초현실적인 디지털 공간입니다. React와 Vite로 만들었고, GitHub Pages로 배포합니다.

## 실행

```bash
npm install
npm run dev      # 개발 서버 (http://localhost:5173)
npm run build    # dist/ 에 정적 빌드
npm run preview  # 빌드 결과 미리보기
```

## GitHub Pages 배포 (무료)

1. 이 저장소의 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 설정합니다.
2. `main` 브랜치에 push하면 `.github/workflows/deploy.yml`이 빌드하고 배포합니다.
   Actions 탭에서 **Run workflow**로 직접 실행할 수도 있습니다.
3. 배포 주소: `https://wizz-338.github.io/Nodnaba/`

`vite.config.js`의 `base: './'` 설정 덕분에 저장소 이름이 바뀌어도 경로가 깨지지 않습니다.

## 구조

| 파일 | 역할 |
| --- | --- |
| `src/components/Logo.jsx` | NODNABA 로고(미완의 별)를 그린 SVG path. 사이트 전체에서 재사용합니다. |
| `src/components/VoidCanvas.jsx`, `src/shaders.js` | WebGL 배경: 도메인 워핑 성운과 휘어지는 체커보드 회랑. 스크롤 속도와 터치에 반응합니다. |
| `src/motion.js` | 스크롤, 포인터, 글리치 상태를 한 곳에서 관리하고 CSS 변수(`--vel`, `--hero`, `--scroll-n`)로 내보냅니다. |
| `src/components/*` | 섹션: Boot, Header/Menu, Hero, Manifesto, Fragments, Dive, Signal, Footer |
| `src/styles.css` | 전체 스타일. 색상 토큰은 맨 위 `:root`에 있습니다. |

## 다음 단계

- `Footer.jsx`의 SNS 링크를 실제 주소로 바꾸기 (지금은 자리표시자)
- `Signal.jsx`의 이메일 폼을 실제 서비스(Formspree, Mailchimp 등)에 연결하기. 지금은 화면에만 반응합니다.
- Fragments 카드에 실제 작업물이나 이미지 넣기
