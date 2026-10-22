// 1. 스크롤하면 .reveal 요소가 나타나게
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("show");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.15 }
);
document.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));

// 2. 숫자 카운트업
const countObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    const el = entry.target;
    const to = Number(el.dataset.to);
    const start = performance.now();
    const duration = 1500;

    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      el.textContent = Math.floor(to * progress).toLocaleString();
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    countObserver.unobserve(el);
  });
});
document.querySelectorAll(".count").forEach((el) => countObserver.observe(el));

// 3. 탭 쇼케이스
const styles = [
  { title: "댄디컷", desc: "앞머리를 자연스럽게 내려 부드럽고 깔끔한 인상으로.", time: "3분", level: "쉬움", pair: "커트 + 다운펌" },
  { title: "투블럭", desc: "옆과 뒤는 짧게, 윗머리는 길게. 가장 무난한 남자 머리.", time: "5분", level: "쉬움", pair: "커트" },
  { title: "리프컷", desc: "앞머리를 나뭇잎처럼 갈라 이마를 살짝 드러내는 스타일.", time: "7분", level: "보통", pair: "아이롱펌" },
  { title: "크롭컷", desc: "짧고 각진 앞머리에 페이드로 떨어지는 옆라인.", time: "2분", level: "쉬움", pair: "커트" },
  { title: "포마드", desc: "옆은 바짝, 윗머리는 넘겨 클래식한 바버 스타일.", time: "5분", level: "보통", pair: "커트 + 다운펌" },
];

const panel = document.querySelector(".panel");
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const i = Number(tab.dataset.tab);
    const b = styles[i];

    document.querySelector(".tab.active").classList.remove("active");
    tab.classList.add("active");

    document.getElementById("tab-num").textContent = String(i + 1).padStart(2, "0");
    document.getElementById("tab-title").textContent = b.title;
    document.getElementById("tab-desc").textContent = b.desc;
    document.getElementById("tab-time").textContent = b.time;
    document.getElementById("tab-level").textContent = b.level;
    document.getElementById("tab-pair").textContent = b.pair;

    // 애니메이션 다시 실행
    panel.classList.remove("fade");
    void panel.offsetWidth;
    panel.classList.add("fade");
  });
});

// 4. 후기 카드를 복제해 끊김 없이 흐르게
const track = document.querySelector(".marquee-track");
track.innerHTML += track.innerHTML;

// 5. 모바일 메뉴 열고 닫기
const nav = document.querySelector(".nav");
document.querySelector(".menu-toggle").addEventListener("click", () => nav.classList.toggle("open"));
nav.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => nav.classList.remove("open")));

// 6. 첫 방문 쿠폰 팝업
const coupon = document.getElementById("coupon");
const codeEl = document.getElementById("coupon-code");
const copyBtn = document.getElementById("coupon-copy");

function getCouponCode() {
  // 한 번 받은 코드는 브라우저에 저장해 다시 열어도 같은 코드가 보이게
  let code = localStorage.getItem("n5d-coupon");
  if (!code) {
    code = "N5D-" + Math.random().toString(36).slice(2, 6).toUpperCase();
    localStorage.setItem("n5d-coupon", code);
  }
  return code;
}

document.getElementById("coupon-btn").addEventListener("click", () => {
  const code = getCouponCode();
  codeEl.textContent = code;
  document.getElementById("coupon-order").href = "order.html?coupon=" + code;
  copyBtn.textContent = "복사";
  coupon.showModal();
});

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(codeEl.textContent);
    copyBtn.textContent = "복사됨 ✓";
  } catch {
    copyBtn.textContent = "직접 적어주세요";
  }
});

coupon.querySelector(".coupon-close").addEventListener("click", () => coupon.close());

// 팝업 바깥(어두운 영역)을 누르면 닫기
coupon.addEventListener("click", (e) => {
  if (e.target === coupon) coupon.close();
});
