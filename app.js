const chapters = [
  { id: 1, title: "Load Balancer", folder: "1. Load Balancer" },
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
  { id: 20, title: "Idempotency", folder: "20. Idempotency", type: "empty" },
  { id: 21, title: "SOLID Principles", folder: "21. SOLID Principles", track: "SOLID Principles", type: "partial", plannedParts: 5, availableParts: [1] },
  { id: 22, title: "Creational Patterns", folder: "22. Creational Patterns", track: "Design Patterns", type: "empty" },
  { id: 23, title: "Structural Patterns", folder: "23. Structural Patterns", track: "Design Patterns", type: "empty" },
  { id: 24, title: "Behavioral Patterns", folder: "24. Behavioral Patterns", track: "Design Patterns", type: "empty" }
];

const tracks = [
  { slug: "system-design", title: "System Design", description: "Scalability, distributed systems, reliability, messaging, and data architecture." },
  { slug: "solid-principles", title: "SOLID Principles", description: "Five principles for maintainable, extensible object-oriented software." },
  { slug: "design-patterns", title: "Design Patterns", description: "Creational, structural, and behavioral approaches to recurring design problems." }
];

const $ = (selector) => document.querySelector(selector);
const nav = $("#chapterNav");
const content = $("#content");
const sidebar = $("#sidebar");
const scrim = $("#scrim");
const menuButton = $("#menuButton");
const sidebarCollapse = $("#sidebarCollapse");
$("#chapterCount").textContent = `${chapters.length} topics`;
let contentPages = [];
let contentPage = 0;
let availabilityReady = false;

function setDesktopSidebar(collapsed) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  sidebarCollapse.setAttribute("aria-expanded", String(!collapsed));
  sidebarCollapse.setAttribute("aria-label", collapsed ? "Show chapter sidebar" : "Hide chapter sidebar");
  localStorage.setItem("notes-sidebar-collapsed", String(collapsed));
}

setDesktopSidebar(localStorage.getItem("notes-sidebar-collapsed") === "true");
sidebarCollapse.addEventListener("click", () => setDesktopSidebar(!document.body.classList.contains("sidebar-collapsed")));

async function fileExists(path) {
  try {
    const response = await fetch(encodeURI(path), { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}

async function detectChapterFiles() {
  await Promise.all(chapters.map(async (chapter) => {
    if (chapter.type === "empty") {
      chapter.parts = Array.from({ length: chapter.plannedParts || 4 }, (_, index) => index + 1);
      chapter.hasCheat = false;
      return;
    }
    if (chapter.type === "partial") {
      chapter.parts = chapter.availableParts || [];
      const planned = Array.from({ length: chapter.plannedParts || 4 }, (_, index) => index + 1);
      chapter.upcomingParts = planned.filter((part) => !chapter.parts.includes(part));
      chapter.hasCheat = false;
      return;
    }
    const partNumbers = Array.from({ length: 12 }, (_, index) => index + 1);
    const checks = await Promise.all(partNumbers.map((part) => fileExists(`data/${chapter.folder}/part${part}.md`)));
    chapter.parts = partNumbers.filter((_, index) => checks[index]);
    chapter.hasCheat = await fileExists(`data/${chapter.folder}/cheat_sheet.md`);
  }));
}

function routeFor(chapterId, page) {
  return page === "cheat" ? `#/chapter/${chapterId}/cheat-sheet` : `#/chapter/${chapterId}/part/${page}`;
}

function trackForChapter(chapter) {
  const title = chapter.track || "System Design";
  return tracks.find((track) => track.title === title) || tracks[0];
}

function getSavedProgress() {
  try {
    return JSON.parse(localStorage.getItem("system-design-progress"));
  } catch {
    return null;
  }
}

function saveProgress(chapterId, page) {
  localStorage.setItem("system-design-progress", JSON.stringify({ chapterId, page: String(page) }));
  const chapter = chapters.find((item) => item.id === chapterId);
  if (chapter) {
    const key = `track-progress-${trackForChapter(chapter).slug}`;
    const route = routeFor(chapterId, page);
    sessionStorage.setItem(key, route);
    localStorage.setItem(key, route);
  }
}

function parseRoute() {
  if (!location.hash || location.hash === "#/") return { home: true };
  const trackMatch = location.hash.match(/^#\/track\/(system-design|solid-principles|design-patterns)$/);
  if (trackMatch) return { track: trackMatch[1] };
  const match = location.hash.match(/^#\/chapter\/(\d+)\/(?:part\/(\d+)|(cheat-sheet))$/);
  if (!match) return { home: true };
  return { chapterId: Number(match[1]), page: match[3] ? "cheat" : match[2] };
}

function buildTrackNavigation(activeTrack = "") {
  $("#trackNav").innerHTML = tracks.map((track) =>
    `<a class="${track.slug === activeTrack ? "current" : ""}" href="#/track/${track.slug}">${track.title}</a>`
  ).join("");
}

function buildNavigation(activeChapter, activePage, trackSlug = "system-design") {
  const track = tracks.find((item) => item.slug === trackSlug) || tracks[0];
  const trackChapters = chapters.filter((chapter) => trackForChapter(chapter).slug === track.slug);
  buildTrackNavigation(track.slug);
  $("#chapterCount").textContent = `${trackChapters.length} topics`;
  nav.innerHTML = trackChapters.map((chapter) => {
    const open = chapter.id === activeChapter;
    const parts = [...(chapter.parts || []), ...(chapter.upcomingParts || [])].sort((a, b) => a - b);
    let links = parts.map((part) => {
      const unavailable = chapter.type === "empty" || chapter.upcomingParts?.includes(part);
      return `<a class="${open && activePage === String(part) ? "current" : ""} ${unavailable ? "unavailable" : ""}" href="${routeFor(chapter.id, part)}">Part ${part}${unavailable ? '<span class="empty-tag">empty</span>' : ""}</a>`;
    }).join("");
    if (chapter.hasCheat || chapter.type === "empty") {
      links += `<a class="cheat ${open && activePage === "cheat" ? "current" : ""} ${chapter.type === "empty" ? "unavailable" : ""}" href="${routeFor(chapter.id, "cheat")}">⚡ Cheat sheet${chapter.type === "empty" ? '<span class="empty-tag">empty</span>' : ""}</a>`;
    }
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

function renderHome() {
  const ready = chapters.filter((chapter) => chapter.type !== "empty").length;
  const trackCards = tracks.map((track) => {
    const savedRoute = localStorage.getItem(`track-progress-${track.slug}`);
    const savedMatch = savedRoute?.match(/^#\/chapter\/(\d+)\/(?:part\/(\d+)|(cheat-sheet))$/);
    const savedChapter = savedMatch && chapters.find((chapter) => chapter.id === Number(savedMatch[1]));
    const validProgress = savedChapter && trackForChapter(savedChapter).slug === track.slug;
    const pageLabel = savedMatch?.[3] ? "Cheat sheet" : `Part ${savedMatch?.[2] || 1}`;
    return `<a class="home-track-card" href="${validProgress ? savedRoute : `#/track/${track.slug}`}">
      <strong>${track.title}</strong>
      <span>${track.description}</span>
      <small>${validProgress ? `Continue: ${savedChapter.title} · ${pageLabel}` : `Start ${track.title}`} →</small>
    </a>`;
  }).join("");
  buildTrackNavigation("");
  nav.innerHTML = "";
  $("#chapterCount").textContent = `${chapters.length} topics`;
  $("#eyebrow").textContent = "Your software interview study guide";
  $("#pageTitle").textContent = "Software Interview Handbook";
  $("#cheatLink").hidden = true;
  $("#progressTrack").hidden = true;
  $("#contentPager").hidden = true;
  $("#previousLink").classList.add("disabled");
  $("#nextLink").classList.add("disabled");
  content.classList.add("home-content");
  content.innerHTML = `<div class="home-intro">
    <p>Practical, structured notes for mastering system design, SOLID principles, and design patterns before an interview.</p>
    <div class="home-track-grid">
      ${trackCards}
    </div>
    <div class="home-stats" aria-label="Study guide summary">
      <div class="home-stat"><strong>3</strong><span>Study tracks</span></div>
      <div class="home-stat"><strong>${ready}</strong><span>Ready to read</span></div>
      <div class="home-stat"><strong>${chapters.length - ready}</strong><span>Coming soon</span></div>
    </div>
    <section class="home-guide">
      <h2>A simple way to study</h2>
      <ol>
        <li>Read each chapter one focused part at a time.</li>
        <li>Use the cheat sheet to reinforce the important decisions and trade-offs.</li>
        <li>Return to the cheat sheets for a quick review before an interview.</li>
      </ol>
    </section>
  </div>`;
  document.title = "Software Interview Handbook";
  window.scrollTo({ top: 0, behavior: "instant" });
}

function renderTrack(trackSlug) {
  const track = tracks.find((item) => item.slug === trackSlug) || tracks[0];
  const trackChapters = chapters.filter((chapter) => trackForChapter(chapter).slug === track.slug);
  const progressKey = `track-progress-${track.slug}`;
  const savedRoute = sessionStorage.getItem(progressKey) || localStorage.getItem(progressKey);
  const savedMatch = savedRoute?.match(/^#\/chapter\/(\d+)\/(?:part\/\d+|cheat-sheet)$/);
  const savedChapter = savedMatch && chapters.find((chapter) => chapter.id === Number(savedMatch[1]));
  const validSavedRoute = savedChapter && trackForChapter(savedChapter).slug === track.slug;
  const firstChapter = trackChapters[0];
  location.hash = validSavedRoute ? savedRoute : routeFor(firstChapter.id, firstChapter.parts?.[0] || 1);
}

function flatPages() {
  return chapters.filter((chapter) => chapter.type !== "empty").flatMap((chapter) => {
    const pages = (chapter.parts || []).map(String);
    if (chapter.hasCheat) pages.push("cheat");
    return pages.map((page) => ({ chapter, page }));
  });
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
  const route = parseRoute();
  if (route.home) {
    renderHome();
    return;
  }
  if (route.track) {
    renderTrack(route.track);
    return;
  }
  const { chapterId, page } = route;
  const chapter = chapters.find((item) => item.id === chapterId) || chapters[1];
  contentPages = [];
  contentPage = 0;
  $("#contentPager").hidden = true;
  $("#progressTrack").hidden = false;
  content.classList.remove("home-content");
  buildNavigation(chapter.id, page, trackForChapter(chapter).slug);

  $("#eyebrow").textContent = `Chapter ${chapter.id} · ${page === "cheat" ? "Quick revision" : `Part ${page}`}`;
  $("#pageTitle").textContent = chapter.title;
  document.title = `${chapter.title} · ${page === "cheat" ? "Cheat Sheet" : `Part ${page}`}`;
  const cheatLink = $("#cheatLink");
  cheatLink.href = routeFor(chapter.id, "cheat");
  cheatLink.hidden = chapter.type === "empty" || !chapter.hasCheat || page === "cheat";
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
      saveProgress(chapter.id, page);
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

window.addEventListener("hashchange", () => {
  if (availabilityReady) renderPage();
});

detectChapterFiles().then(() => {
  availabilityReady = true;
  renderPage();
});
