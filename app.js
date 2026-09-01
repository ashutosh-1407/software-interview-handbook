const chapters = [
  { id: 1, title: "Load Balancer", folder: "1. Load Balancer", type: "empty" },
  { id: 2, title: "Cache", folder: "2. Cache" },
  { id: 3, title: "Database Replication", folder: "3. Database Replication" },
  { id: 4, title: "Database Sharding", folder: "4. Database Sharding" },
  { id: 5, title: "Message Queues", folder: "5. Message Queues" },
  { id: 6, title: "Event Streaming", folder: "6. Event Streaming" },
  { id: 7, title: "Event-Driven Architecture", folder: "7. Event-Driven Architecture" },
  { id: 8, title: "Distributed Locks", folder: "8. Distributed Locks" },
  { id: 9, title: "Leader Election", folder: "9. Leader Election" },
  { id: 10, title: "CAP Theorem", folder: "10. CAP Theorem" },
  { id: 11, title: "Consensus / Raft", folder: "11. Consensus_Raft" },
  { id: 12, title: "Circuit Breaker", folder: "12. Circuit Breaker", type: "empty" },
  { id: 13, title: "Retry and Backoff", folder: "13. Retry and Backoff", type: "empty" },
  { id: 14, title: "Rate Limiter", folder: "14. Rate Limiter", type: "empty" },
  { id: 15, title: "Health Checks", folder: "15. Health Checks", type: "empty" },
  { id: 16, title: "Service Discovery", folder: "16. Service Discovery", type: "empty" },
  { id: 17, title: "Object Storage", folder: "17. Object Storage", type: "empty" },
  { id: 18, title: "Search Engine", folder: "18. Search Engine", type: "empty" },
  { id: 19, title: "Bloom Filter", folder: "19. Bloom Filter", type: "empty" },
  { id: 20, title: "Idempotency", folder: "20. Idempotency", type: "empty" }
];

const $ = (selector) => document.querySelector(selector);
const nav = $("#chapterNav");
const content = $("#content");
const sidebar = $("#sidebar");
const scrim = $("#scrim");
const menuButton = $("#menuButton");
$("#chapterCount").textContent = `${chapters.length} chapters`;
let contentPages = [];
let contentPage = 0;

function routeFor(chapterId, page) {
  return page === "cheat" ? `#/chapter/${chapterId}/cheat-sheet` : `#/chapter/${chapterId}/part/${page}`;
}

function parseRoute() {
  const match = location.hash.match(/^#\/chapter\/(\d+)\/(?:part\/(\d+)|(cheat-sheet))$/);
  if (!match) return { chapterId: 2, page: "1" };
  return { chapterId: Number(match[1]), page: match[3] ? "cheat" : match[2] };
}

function buildNavigation(activeChapter, activePage) {
  nav.innerHTML = chapters.map((chapter) => {
    const open = chapter.id === activeChapter;
    let links = "";
    links = [1, 2, 3, 4].map((part) => {
      const unavailable = chapter.type === "empty";
      return `<a class="${open && activePage === String(part) ? "current" : ""} ${unavailable ? "unavailable" : ""}" href="${routeFor(chapter.id, part)}">Part ${part}${unavailable ? '<span class="empty-tag">empty</span>' : ""}</a>`;
    }).join("") + `<a class="cheat ${open && activePage === "cheat" ? "current" : ""} ${chapter.type === "empty" ? "unavailable" : ""}" href="${routeFor(chapter.id, "cheat")}">⚡ Cheat sheet${chapter.type === "empty" ? '<span class="empty-tag">empty</span>' : ""}</a>`;
    return `<section class="chapter ${open ? "active open" : ""} ${chapter.type === "empty" ? "upcoming" : ""}" data-chapter="${chapter.id}">
      <button class="chapter-toggle" aria-expanded="${open}">
        <span class="chapter-number">${String(chapter.id).padStart(2, "0")}</span>
        <span class="chapter-title">${chapter.title}${chapter.type === "empty" ? '<small class="coming-label">Coming soon</small>' : ""}</span>
        <span class="chapter-chevron">›</span>
      </button>
      <div class="part-list">${links}</div>
    </section>`;
  }).join("");

  nav.querySelectorAll(".chapter-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const chapter = button.closest(".chapter");
      const chapterId = Number(chapter.dataset.chapter);
      const targetChapter = chapters.find((item) => item.id === chapterId);
      if (chapterId !== activeChapter && targetChapter?.type !== "empty") {
        location.hash = routeFor(chapterId, 1);
        closeMenu();
        return;
      }
      chapter.classList.toggle("open");
      button.setAttribute("aria-expanded", chapter.classList.contains("open"));
    });
  });
  nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
}

function showContentPage(pageNumber, shouldScroll = false) {
  contentPage = Math.max(0, Math.min(pageNumber, contentPages.length - 1));
  content.innerHTML = contentPages[contentPage].join("");
  $("#contentPageCount").textContent = `Page ${contentPage + 1} of ${contentPages.length}`;
  $("#contentPrevious").disabled = contentPage === 0;
  $("#contentNext").disabled = contentPage === contentPages.length - 1;
  if (shouldScroll) $(".reading-header").scrollIntoView({ behavior: "smooth", block: "start" });
  updateProgress();
}

function paginateContent() {
  const elements = [...content.children];
  contentPages = [];
  let page = [];
  let characterCount = 0;

  elements.forEach((element) => {
    const size = element.textContent.length;
    const startsSection = element.matches("h1, h2");
    const shouldBreak = page.length && ((startsSection && characterCount >= 2600) || characterCount + size > 5600);
    if (shouldBreak) {
      contentPages.push(page);
      page = [];
      characterCount = 0;
    }
    page.push(element.outerHTML);
    characterCount += size;
  });
  if (page.length) contentPages.push(page);

  const pager = $("#contentPager");
  pager.hidden = contentPages.length <= 1;
  if (contentPages.length > 1) showContentPage(0);
}

$("#contentPrevious").addEventListener("click", () => showContentPage(contentPage - 1, true));
$("#contentNext").addEventListener("click", () => showContentPage(contentPage + 1, true));

function flatPages() {
  return chapters.filter((chapter) => !chapter.type).flatMap((chapter) => [1, 2, 3, 4, "cheat"].map((page) => ({ chapter, page: String(page) })));
}

function updatePageLinks(chapterId, page) {
  const pages = flatPages();
  const index = pages.findIndex((item) => item.chapter.id === chapterId && item.page === String(page));
  const setLink = (element, item) => {
    if (!item) return element.classList.add("disabled");
    element.classList.remove("disabled");
    element.href = routeFor(item.chapter.id, item.page === "cheat" ? "cheat" : item.page);
    element.querySelector("span").textContent = `${item.chapter.title} · ${item.page === "cheat" ? "Cheat sheet" : `Part ${item.page}`}`;
  };
  setLink($("#previousLink"), pages[index - 1]);
  setLink($("#nextLink"), pages[index + 1]);
}

async function renderPage() {
  const { chapterId, page } = parseRoute();
  const chapter = chapters.find((item) => item.id === chapterId) || chapters[1];
  contentPages = [];
  contentPage = 0;
  $("#contentPager").hidden = true;
  buildNavigation(chapter.id, page);

  $("#eyebrow").textContent = `Chapter ${chapter.id} · ${page === "cheat" ? "Quick revision" : `Part ${page}`}`;
  $("#pageTitle").textContent = chapter.title;
  document.title = `${chapter.title} · ${page === "cheat" ? "Cheat Sheet" : `Part ${page}`}`;
  const cheatLink = $("#cheatLink");
  cheatLink.href = routeFor(chapter.id, "cheat");
  cheatLink.hidden = chapter.type === "empty" || page === "cheat";
  if (chapter.type === "empty") {
    content.innerHTML = `<div class="empty-state"><strong>Notes coming soon</strong>This chapter is planned and will be added to the study guide soon.</div>`;
    $("#previousLink").classList.add("disabled");
    $("#nextLink").classList.add("disabled");
    return;
  }

  content.innerHTML = '<div class="loading">Opening your notes…</div>';
  const file = page === "cheat" ? "cheat_sheet.md" : `part${page}.md`;
  const path = encodeURI(`data/${chapter.folder}/${file}`);
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error("Missing note");
    const markdown = await response.text();
    if (!markdown.trim()) {
      content.innerHTML = '<div class="empty-state"><strong>Notes coming soon</strong>This file is currently empty.</div>';
    } else if (window.marked) {
      marked.use({ gfm: true, breaks: false });
      content.innerHTML = marked.parse(markdown);
      paginateContent();
    } else {
      content.innerHTML = '<div class="empty-state"><strong>Reader could not start</strong>Please check your internet connection and reload the page.</div>';
    }
  } catch (error) {
    content.innerHTML = '<div class="empty-state"><strong>Note not found</strong>This chapter part has not been added yet.</div>';
  }
  updatePageLinks(chapter.id, page);
  window.scrollTo({ top: 0, behavior: "instant" });
  updateProgress();
}

function openMenu() {
  sidebar.classList.add("open");
  scrim.hidden = false;
  menuButton.setAttribute("aria-expanded", "true");
}
function closeMenu() {
  sidebar.classList.remove("open");
  scrim.hidden = true;
  menuButton.setAttribute("aria-expanded", "false");
}
menuButton.addEventListener("click", () => sidebar.classList.contains("open") ? closeMenu() : openMenu());
scrim.addEventListener("click", closeMenu);
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeMenu(); });

function updateProgress() {
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  const progress = scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0;
  $("#progressBar").style.width = `${Math.min(100, progress)}%`;
}
window.addEventListener("scroll", updateProgress, { passive: true });

const storedTheme = localStorage.getItem("notes-theme");
if (storedTheme) document.documentElement.dataset.theme = storedTheme;
$("#themeButton").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("notes-theme", next);
});

window.addEventListener("hashchange", renderPage);
if (!location.hash) location.hash = "#/chapter/2/part/1";
else renderPage();
