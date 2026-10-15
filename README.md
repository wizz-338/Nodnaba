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
3. 배포 주소: `https://wizz-338.github.io/Nodnaba/` (방명록: `…/Nodnaba/#/visitor`)

`vite.config.js`의 `base: './'` 설정 덕분에 저장소 이름이 바뀌어도 경로가 깨지지 않습니다.

## 구조

| 파일 | 역할 |
| --- | --- |
| `src/components/Logo.jsx` | NODNABA 로고(미완의 별)를 그린 SVG path. 사이트 전체에서 재사용합니다. |
| `src/components/VoidCanvas.jsx`, `src/shaders.js` | WebGL 배경: 도메인 워핑 성운과 휘어지는 체커보드 회랑. 스크롤 속도와 터치에 반응합니다. |
| `src/motion.js` | 스크롤, 포인터, 글리치 상태를 한 곳에서 관리하고 CSS 변수(`--vel`, `--hero`, `--scroll-n`)로 내보냅니다. |
| `src/components/Manga.jsx`, `GlitchImage.jsx` | 캐릭터 일러스트를 만화 컷처럼 배치. 사선 컷, 스크린톤, 집중선, 글리치 찢김 효과. 이미지는 `src/assets/`에 있습니다. |
| `src/components/*` | 그 밖의 섹션: Boot, Header/Menu, Hero, Vision, Footer, PageTransition |
| `src/route.js` | `#/`(MAIN) ↔ `#/visitor`(VISITOR) 해시 라우팅 |
| `src/visitor/*` | VISITOR 방명록 페이지: 픽셀 캐릭터(`PixelRunner.jsx`), 방명록(`Guestbook.jsx`), API(`guestbookApi.js`) |
| `supabase/guestbook.sql` | 방명록 DB 구조와 보안 규칙. Supabase SQL Editor에서 한 번 실행합니다. |
| `src/styles.css` | 전체 스타일. 색상 토큰은 맨 위 `:root`에 있습니다. |

## 링크

- X: https://x.com/readevism (`src/components/Footer.jsx`의 `X_URL`)

## 방명록(Supabase) 설정

VISITOR 페이지의 방명록은 Supabase 무료 플랜에 저장됩니다. 아래 설정을 마치기 전까지 방명록 화면에는 "서버가 아직 연결되지 않았어요"라고 표시됩니다.

### 1. 프로젝트 만들기
1. https://supabase.com 에 가입하고 **New project**를 누릅니다(Free 플랜).
2. 이름은 자유롭게 정하고, Region은 **Northeast Asia (Seoul)**을 고르세요. DB 비밀번호는 따로 보관합니다.

### 2. 테이블과 보안 규칙 만들기
1. 왼쪽 메뉴 **SQL Editor → New query**를 엽니다.
2. 이 저장소의 `supabase/guestbook.sql` 내용을 전부 붙여 넣고 **Run**을 누릅니다. 여러 번 실행해도 안전합니다.

### 3. 사이트에 연결하기
1. Supabase **Project Settings → API**(또는 **Data API / API Keys**)에서 다음 두 값을 확인합니다.
   - Project URL (`https://xxxx.supabase.co`)
   - **anon** 키 또는 **publishable** 키
2. GitHub 저장소 **Settings → Secrets and variables → Actions → Variables** 탭 → **New repository variable**로 두 개를 추가합니다.
   - `SUPABASE_URL` = Project URL
   - `SUPABASE_ANON_KEY` = anon(publishable) 키
3. **Actions** 탭에서 *Deploy to GitHub Pages*를 **Run workflow**로 다시 실행합니다.

> ⚠️ **service_role / secret 키는 절대 넣지 마세요.** anon 키는 브라우저에 공개되도록 만들어진 키이고, 실제 보호는 SQL의 행 수준 보안(RLS)이 담당합니다.

### 4. 관리자 계정 만들기 (글 삭제용)
1. **Authentication → Users → Add user → Create new user**에서 이메일과 비밀번호로 계정을 만듭니다(Auto Confirm 체크).
2. 만든 사용자의 **UID**를 복사한 뒤 SQL Editor에서 실행합니다.
   ```sql
   insert into public.guestbook_admins (user_id) values ('여기에-UID');
   ```
3. **Authentication → Sign In / Providers**에서 **Allow new users to sign up**을 꺼 주세요. 다른 사람이 계정을 만들 수 없게 합니다. 켜져 있어도 관리자 목록에 없는 계정은 삭제할 수 없습니다.
4. `https://wizz-338.github.io/Nodnaba/#/visitor/admin` 에서 로그인하면 각 글에 **삭제** 버튼이 나타납니다. Supabase **Table Editor → guestbook**에서 직접 지워도 됩니다.

### 보안·도배 방지 규칙 (`supabase/guestbook.sql`)
- 방문자는 글을 **읽기**와 `post_guestbook()`을 통한 **쓰기**만 할 수 있습니다. 수정은 누구도 할 수 없고, 삭제는 관리자만 할 수 있습니다.
- 닉네임은 1~20자, 메시지는 1~200자입니다. 제어 문자를 제거하고, 3줄 이상 빈 줄은 줄입니다.
- 링크(URL·도메인)와 같은 글자를 15번 이상 반복한 글은 거부합니다.
- 같은 IP에서는 30초에 1번, 1시간에 5번까지만 쓸 수 있습니다. 하루 안에 같은 내용은 다시 올릴 수 없고, 사이트 전체로는 1분에 20개까지만 받습니다.
- IP는 해시로만 저장하며, 해시도 API로는 읽을 수 없습니다.
- 브라우저에서는 숨은 함정 입력칸(봇 차단), 너무 빠른 제출 차단, 30초 쿨다운을 한 번 더 적용합니다.

### 문제 해결: 방명록이 안 읽히거나 안 써질 때
1. 개발용 진단 페이지 `https://wizz-338.github.io/Nodnaba/#/visitor/check` 를 엽니다. 방명록과 분리된 별도 화면이고, 사이트 메뉴에는 연결되어 있지 않습니다. 방문자에게 공유하는 주소는 항상 `#/visitor`입니다. **SYSTEM CHECK** 창이 설정과 실제 요청 결과를 보여 주며, 이 검사는 데이터를 쓰거나 지우지 않습니다.
   - **API 키 종류**: `publishable` 또는 `anon`이어야 합니다. secret / service_role 키가 들어 있으면 보안을 위해 연결이 차단됩니다.
   - **키의 프로젝트**: 키가 SUPABASE_URL과 같은 프로젝트의 것인지 확인합니다(legacy anon 키만 표시).
   - **목록 읽기 / 글쓰기 함수**: 실제 HTTP 상태 코드와 오류 코드가 표시됩니다.
2. 방명록 화면의 오류 메시지 아래에도 `HTTP 401 · PGRST301 · …` 같은 실제 오류가 작게 표시됩니다.

| 표시되는 오류 | 원인 | 해결 |
| --- | --- | --- |
| `HTTP 401` · `Invalid API key` / `PGRST301` | 키가 틀렸거나 다른 프로젝트의 키 | Supabase **Project Settings → API Keys**에서 publishable(또는 legacy anon) 키를 다시 복사해 `SUPABASE_ANON_KEY`에 넣고 재배포 |
| `HTTP 401` · secret key 관련 메시지 | 비밀 키를 넣음 | publishable/anon 키로 바꾸고, 노출된 secret 키는 **재발급(roll)** |
| `HTTP 404` · `PGRST205` / `PGRST202` | 테이블 또는 함수가 없음 | SQL Editor에서 `supabase/guestbook.sql`을 다시 실행. 같은 프로젝트(URL의 ref)에서 실행했는지 확인 |
| `HTTP 406` / `PGRST106`, 또는 모든 요청이 404 | Data API가 꺼져 있거나 `public` 스키마가 노출되지 않음 | **Project Settings → Data API**에서 Data API를 켜고 Exposed schemas에 `public` 포함 |
| `HTTP 401/403` · `42501 permission denied` | 권한(GRANT) 누락 | `supabase/guestbook.sql` 다시 실행 |
| `NETWORK` | 주소에 닿지 못함 | `SUPABASE_URL` 오타, 또는 프로젝트가 일시 정지됨(대시보드에서 Restore) |

GitHub Variables를 고친 뒤에는 **Actions → Deploy to GitHub Pages → Run workflow**로 다시 배포해야 반영됩니다.

### 로컬 개발
`.env.example`을 `.env.local`로 복사한 뒤 값을 채우고 `npm run dev`를 실행합니다.

### 참고
Supabase 무료 프로젝트는 **7일 동안 요청이 없으면 일시 정지**됩니다. 정지되면 대시보드에서 Restore를 누르면 데이터는 그대로 돌아옵니다.

## 크레딧
- 픽셀 폰트: [Galmuri](https://github.com/quiple/galmuri) (SIL OFL 1.1, `src/visitor/fonts/OFL-Galmuri.md`)
